/**
 * Takings by how the money arrived (RECA-542).
 *
 * The dashboard's revenue used to count card payments taken through Stripe and nothing else,
 * so a business working mostly in cash saw a figure near zero. It now folds every settlement,
 * and reports the split alongside the total. This turns that split into something renderable.
 */
import type { Dashboard } from "./api/types.ts";

type Revenue = Dashboard["revenue"];
type MethodTotal = NonNullable<Revenue["byMethod"]>[number];

/**
 * Wording aimed at the person who took the money, not at the payment model: they think
 * "card machine", not "card_manual".
 */
const METHOD_LABELS: Record<string, string> = {
  card_online: "Card (online)",
  card_manual: "Card machine",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export type TakingsRow = {
  readonly method: string;
  readonly label: string;
  readonly grossMinor: number;
  readonly refundedMinor: number;
  readonly netMinor: number;
  readonly count: number;
  /** Share of gross takings, 0–1. Zero when nothing was taken at all. */
  readonly share: number;
};

/**
 * One row per method that saw money, in the order the API returns — fixed rather than sorted
 * by value, so a chart's colours and a legend's order stay put as the date range changes.
 *
 * `byMethod` is optional because an older API build does not send it; an empty list then
 * reads as "no breakdown available" rather than "nothing was taken", which is why the caller
 * checks `grossMinor` too.
 */
export function takingsRows(revenue: Revenue): TakingsRow[] {
  const byMethod = revenue.byMethod ?? [];
  const total = byMethod.reduce((sum, m) => sum + m.grossMinor, 0);
  return byMethod.map((m: MethodTotal) => ({
    method: m.method,
    label: METHOD_LABELS[m.method] ?? m.method,
    grossMinor: m.grossMinor,
    refundedMinor: m.refundedMinor,
    netMinor: m.netMinor,
    count: m.count,
    share: total > 0 ? m.grossMinor / total : 0,
  }));
}

/**
 * Card, cash and bank transfer as three lines, merging the two card methods. This is the
 * shape the original ask named, and the one most owners think in; the unmerged rows stay
 * available for anyone reconciling a payout, where "went through Stripe" is the distinction
 * that matters.
 */
export function takingsSummary(revenue: Revenue): TakingsRow[] {
  const rows = takingsRows(revenue);
  const card = rows.filter((r) => r.method === "card_online" || r.method === "card_manual");
  if (card.length < 2) return rows;
  const merged: TakingsRow = {
    method: "card",
    label: "Card",
    grossMinor: card.reduce((sum, r) => sum + r.grossMinor, 0),
    refundedMinor: card.reduce((sum, r) => sum + r.refundedMinor, 0),
    netMinor: card.reduce((sum, r) => sum + r.netMinor, 0),
    count: card.reduce((sum, r) => sum + r.count, 0),
    share: card.reduce((sum, r) => sum + r.share, 0),
  };
  return [merged, ...rows.filter((r) => r.method !== "card_online" && r.method !== "card_manual")];
}

/**
 * True when the API sent a breakdown at all. Distinguishes "took nothing" from "this API
 * build predates the breakdown", which want different empty states.
 */
export function hasTakingsBreakdown(revenue: Revenue): boolean {
  return Array.isArray(revenue.byMethod);
}
