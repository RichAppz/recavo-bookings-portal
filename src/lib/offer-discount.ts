import type { PackageLinkDiscount } from "@/lib/api/types";
import { formatMoney } from "./format.ts";

/**
 * Display-side mirror of the API's offer-link discount maths. The API applies the
 * discount to every price it quotes or charges with the link's code (slot prices,
 * the hold, package checkout); this only exists so the page can show "£50 → £40"
 * on a session card before a slot has been quoted, and must round the same way:
 * percentages half-up to the minor unit, fixed amounts capped at the list price.
 */
export function discountMinorOff(
  discount: PackageLinkDiscount | null | undefined,
  listMinor: number,
): number {
  if (!discount || listMinor <= 0) return 0;
  if (discount.kind === "percent") {
    return Math.min(listMinor, Math.round((listMinor * discount.percent) / 100));
  }
  return Math.min(listMinor, discount.amountMinor);
}

export function discountedMinor(
  discount: PackageLinkDiscount | null | undefined,
  listMinor: number,
): number {
  return listMinor - discountMinorOff(discount, listMinor);
}

/** "20% off" or "£5 off" — the badge on an offer and the summary on the links list. */
export function describeDiscount(
  discount: PackageLinkDiscount | null | undefined,
  currency: string,
): string | null {
  if (!discount) return null;
  if (discount.kind === "percent") return `${discount.percent}% off`;
  const whole = discount.amountMinor % 100 === 0;
  return `${formatMoney(discount.amountMinor, currency, { compact: whole })} off`;
}

/**
 * Turns what the business typed into the discount the API accepts, or null for "no
 * discount". A non-number or a value outside the API's bounds is `undefined` so the
 * form can refuse to submit rather than send something the API will reject.
 */
export function parseDiscountInput(
  mode: "none" | "percent" | "amount",
  raw: string,
): PackageLinkDiscount | null | undefined {
  if (mode === "none") return null;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (mode === "percent") {
    const percent = Number(trimmed);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) return undefined;
    return { kind: "percent", percent };
  }
  // Major units as typed ("5" or "5.50"); the API wants whole minor units.
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const amountMinor = Math.round(amount * 100);
  if (amountMinor < 1 || Math.abs(amount * 100 - amountMinor) > 1e-6) return undefined;
  return { kind: "amount", amountMinor };
}
