import { formatMoney } from "./format.ts";

/**
 * Consumables (automotive): the materials a job uses up. Pure helpers shared by the
 * catalogue page, the service form and the booking panel. Costs here are the
 * business's own records — nothing feeds a price a client sees.
 */

/** The shape both service defaults and booking usage lines share. */
export type UsageLineLike = {
  name: string;
  unit: string;
  quantity: number;
  unitCostMinor?: number | null;
};

/** Up to three decimals, no trailing zeros: 1, 0.5, 250, 2.125. */
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return "0";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 }).format(quantity);
}

/**
 * Parse what staff typed into a quantity field. Accepts "1", "0.5", "1,5" and
 * strips units they may have typed ("2 pads"); null when it isn't a positive number
 * or carries more than three decimals (the API refuses those).
 */
export function parseQuantity(input: string): number | null {
  // Keep the sign so "-1" is refused rather than read as 1.
  const cleaned = input
    .trim()
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (Math.round(value * 1000) !== value * 1000) return null;
  return value;
}

/** "1 bottle Ceramic coat", "2 pads Foam pad" — quantity, unit, name. */
export function usageLabel(line: Pick<UsageLineLike, "name" | "unit" | "quantity">): string {
  return `${formatQuantity(line.quantity)} ${line.unit} ${line.name}`.trim();
}

/** "1 bottle ceramic, 2 pads" — a compact read-only summary for the booking form. */
export function summariseUsage(
  lines: readonly Pick<UsageLineLike, "name" | "unit" | "quantity">[],
): string {
  return lines.map(usageLabel).join(", ");
}

/**
 * Sum of quantity × unit cost across the lines that carry a cost; null when none
 * do. Mirrors the API's `estimatedCostMinor` so an unsaved edit can show the
 * figure before the round-trip.
 */
export function estimateMaterialsCost(lines: readonly UsageLineLike[]): number | null {
  let total = 0;
  let costed = 0;
  for (const line of lines) {
    if (line.unitCostMinor == null) continue;
    costed += 1;
    total += Math.round(line.quantity * line.unitCostMinor);
  }
  return costed === 0 ? null : total;
}

/** "£12.50 per bottle" or "No cost recorded". */
export function unitCostLabel(
  unitCostMinor: number | null | undefined,
  unit: string,
  currency = "GBP",
): string {
  if (unitCostMinor == null) return "No cost recorded";
  return `${formatMoney(unitCostMinor, currency)} per ${unit}`;
}

/**
 * One line while editing: the quantity stays a string so "0." and "1," survive
 * typing; `parseQuantity` turns it into a number on save.
 */
export type UsageRow = {
  consumableId: string;
  quantity: string;
  note?: string | null;
};

export function rowsFromLines(
  lines: readonly { consumableId: string; quantity: number; note?: string | null }[],
): UsageRow[] {
  return lines.map((l) => ({
    consumableId: l.consumableId,
    quantity: String(l.quantity),
    note: l.note ?? null,
  }));
}

/**
 * Rows → the PUT body, or the index of the first row that isn't ready (no
 * consumable picked, or a quantity that isn't a positive number). Blank rows —
 * nothing picked and nothing typed — are dropped rather than refused.
 */
export function rowsToItems(
  rows: readonly UsageRow[],
):
  | { ok: true; items: { consumableId: string; quantity: number; note?: string | null }[] }
  | { ok: false; index: number } {
  const items: { consumableId: string; quantity: number; note?: string | null }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.consumableId && !row.quantity.trim()) continue;
    const quantity = parseQuantity(row.quantity);
    if (!row.consumableId || quantity === null) return { ok: false, index: i };
    items.push({
      consumableId: row.consumableId,
      quantity,
      ...(row.note ? { note: row.note } : {}),
    });
  }
  return { ok: true, items };
}

/** Add usage lines from several services into one list, merging duplicate consumables. */
export function mergeUsage<T extends { consumableId: string; quantity: number }>(
  groups: readonly (readonly T[])[],
): T[] {
  const byId = new Map<string, T>();
  for (const group of groups) {
    for (const line of group) {
      const existing = byId.get(line.consumableId);
      if (existing) {
        byId.set(line.consumableId, {
          ...existing,
          quantity: Math.round((existing.quantity + line.quantity) * 1000) / 1000,
        });
      } else {
        byId.set(line.consumableId, line);
      }
    }
  }
  return [...byId.values()];
}
