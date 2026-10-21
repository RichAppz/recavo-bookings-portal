import { formatMoney } from "./format.ts";

/**
 * Consumables (automotive): the materials a job uses up. Pure helpers shared by the
 * catalogue page, the service form and the booking panel. Costs here are the
 * business's own records; nothing feeds a price a client sees.
 */

/** The one sentence every consumables surface uses to explain the costs. */
export const RECORDS_LINE = "For your records only. Never charged or shown to clients.";

/** The shape both service defaults and booking usage lines share. */
export type UsageLineLike = {
  name: string;
  unit: string;
  quantity: number;
  unitCostMinor?: number | null;
};

/* ---------------- Units ---------------- */

/** The units offered as chips; anything else is the business's own word. Mirrors the API. */
export const UNIT_CODES = ["bottle", "ml", "litre", "pad", "towel", "pack", "each"] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

const UNIT_ALIASES: Readonly<Record<string, UnitCode>> = {
  bottle: "bottle",
  bottles: "bottle",
  ml: "ml",
  mls: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  litre: "litre",
  litres: "litre",
  liter: "litre",
  liters: "litre",
  ltr: "litre",
  l: "litre",
  pad: "pad",
  pads: "pad",
  towel: "towel",
  towels: "towel",
  pack: "pack",
  packs: "pack",
  each: "each",
  ea: "each",
};

/** "Bottles" is `bottle`; anything that isn't clearly a listed unit is kept as typed. */
export function normaliseUnit(value: string): string {
  const trimmed = value.trim();
  return UNIT_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function unitCode(unit: string): UnitCode | null {
  return (UNIT_CODES as readonly string[]).includes(unit) ? (unit as UnitCode) : null;
}

const INVARIANT_UNITS: ReadonlySet<string> = new Set([
  "ml",
  "each",
  "cl",
  "kg",
  "g",
  "l",
  "oz",
  "lb",
]);

/**
 * "1 bottle", "2 bottles", "0.5 litre": plural above one, the same rule the API's
 * history lines use. ml, each, short abbreviations and words ending in s never change.
 */
export function unitFor(unit: string, quantity: number): string {
  if (quantity <= 1) return unit;
  const lower = unit.toLowerCase();
  if (INVARIANT_UNITS.has(lower) || lower.endsWith("s") || unit.length <= 2) return unit;
  return `${unit}s`;
}

/** "2 pads", "250 ml", "1 bottle". */
export function quantityLabel(quantity: number, unit: string): string {
  return `${formatQuantity(quantity)} ${unitFor(unit, quantity)}`;
}

/* ---------------- Quantities ---------------- */

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

/** Steppers move by 0.5 for ml and litre and anything already fractional, else by 1. */
export function quantityStep(unit: string, quantity: number): number {
  const code = unitCode(unit);
  if (code === "ml" || code === "litre") return 0.5;
  return Number.isInteger(quantity) ? 1 : 0.5;
}

/**
 * The stepper's next value, or null when − would take it to zero or below (the
 * caller removes the line). The step never leaves a quantity below its own step.
 */
export function stepQuantity(quantity: number, unit: string, direction: 1 | -1): number | null {
  const step = quantityStep(unit, quantity);
  const next = Math.round((quantity + direction * step) * 1000) / 1000;
  return next > 0 ? next : null;
}

/* ---------------- Labels ---------------- */

/** "1 bottle Ceramic coat", "2 pads Foam pad": quantity, unit, name. */
export function usageLabel(line: Pick<UsageLineLike, "name" | "unit" | "quantity">): string {
  return `${quantityLabel(line.quantity, line.unit)} ${line.name}`.trim();
}

/** "1 bottle Ceramic coat, 2 pads Foam pad": a compact read-only summary. */
export function summariseUsage(
  lines: readonly Pick<UsageLineLike, "name" | "unit" | "quantity">[],
): string {
  return lines.map(usageLabel).join(", ");
}

/** "1 bottle Ceramic coat, 2 pads Foam pad and 2 more": the first two, then a count. */
export function shortUsageSummary(
  lines: readonly Pick<UsageLineLike, "name" | "unit" | "quantity">[],
  show = 2,
): string {
  const head = lines.slice(0, show).map(usageLabel);
  const rest = lines.length - head.length;
  if (rest <= 0) return joinAnd(head);
  return `${head.join(", ")} and ${rest} more`;
}

/** "Ceramic coating, Coating top-up" and "and 4 more" under; or "Not on any service". */
export function defaultOnLabel(serviceNames: readonly string[]): {
  head: string;
  more: string | null;
} {
  if (serviceNames.length === 0) return { head: "Not on any service", more: null };
  const head = serviceNames.slice(0, 2).join(", ");
  const rest = serviceNames.length - 2;
  return { head, more: rest > 0 ? `and ${rest} more` : null };
}

function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * A unit cost, which can be a fraction of a penny: "£12.50", "0.8p", "£0.0125". Whole
 * minor amounts read as normal money.
 */
export function formatUnitCost(unitCostMinor: number, currency = "GBP"): string {
  const minor = roundUnitCost(unitCostMinor);
  if (Number.isInteger(minor)) return formatMoney(minor, currency);
  if (currency === "GBP" && minor < 100) {
    return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 }).format(minor)}p`;
  }
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(minor / 100);
  } catch {
    return formatMoney(Math.round(minor), currency);
  }
}

/** "£12.50 per bottle", "£12.00 each", "0.8p per ml", or "No cost". */
export function unitCostLabel(
  unitCostMinor: number | null | undefined,
  unit: string,
  currency = "GBP",
): string {
  if (unitCostMinor == null) return "No cost";
  const money = formatUnitCost(unitCostMinor, currency);
  return unitCode(unit) === "each" ? `${money} each` : `${money} per ${unit}`;
}

/** Unit costs are kept to four decimals of a minor unit, like the API. */
export function roundUnitCost(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const MILLILITRES: Readonly<Record<string, number>> = { ml: 1, litre: 1000 };

/** The units a purchase can be sized in: ml and litre convert, anything else is itself. */
export function packUnitsFor(unit: string): string[] {
  const code = unitCode(unit);
  return code === "ml" || code === "litre" ? ["ml", "litre"] : unit ? [unit] : [];
}

/** "5 litres for £40" counted in ml is 0.8 (pence per ml); null when it can't be worked out. */
export function unitCostFromPack(
  pack: { size: number; unit: string; costMinor: number },
  unit: string,
): number | null {
  if (!(pack.size > 0)) return null;
  const per =
    pack.unit === unit
      ? 1
      : MILLILITRES[pack.unit] !== undefined && MILLILITRES[unit] !== undefined
        ? MILLILITRES[pack.unit]! / MILLILITRES[unit]!
        : null;
  if (per === null) return null;
  return roundUnitCost(pack.costMinor / (pack.size * per));
}

/** The cost field's label follows the unit: "Cost per bottle", "Cost each". */
export function costFieldLabel(unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed) return "Cost per unit";
  return unitCode(trimmed) === "each" ? "Cost each" : `Cost per ${trimmed}`;
}

/** "1 item has no cost" / "3 items have no cost"; null when every line is costed. */
export function uncostedLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 item has no cost" : `${count} items have no cost`;
}

/** The symbol shown inside a money field: "£", "€", "$". */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * A typed cost: blank is "no cost" (null), "12.50" is 1250, anything else (negative,
 * three decimals, letters) is "invalid". `decimals: 6` takes a cost per ml like
 * "0.008" (0.8p).
 */
export function parseCost(
  input: string,
  { decimals = 2 }: { decimals?: 2 | 6 } = {},
): number | null | "invalid" {
  const trimmed = input
    .trim()
    .replace(/^[£$€]/, "")
    .replace(",", ".");
  if (!trimmed) return null;
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) return "invalid";
  const [whole, frac = ""] = trimmed.split(".");
  if (decimals === 2) return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return roundUnitCost(Number(whole) * 100 + Number(frac.padEnd(6, "0")) / 10_000);
}

/** The minor amount back into the field's text: 1250 → "12.50", 0.8 → "0.008". */
export function costInput(minor: number | null | undefined): string {
  if (minor == null) return "";
  const rounded = roundUnitCost(minor);
  if (Number.isInteger(rounded)) return (rounded / 100).toFixed(2);
  return String(Number((rounded / 100).toFixed(6)));
}

/* ---------------- Costs ---------------- */

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

/** Lines that carry no cost, for "1 item has no cost". */
export function countUncosted(lines: readonly Pick<UsageLineLike, "unitCostMinor">[]): number {
  return lines.filter((l) => l.unitCostMinor == null).length;
}

/** "18% of the £320 price": materials as a whole-number share of the price; null when it can't be said. */
export function shareOfPrice(
  materialsMinor: number,
  priceMinor: number | null | undefined,
): number | null {
  if (!priceMinor || priceMinor <= 0) return null;
  return Math.round((materialsMinor / priceMinor) * 100);
}

/** "Down £2.10 on last month" / "Up …" / "Same as last month"; null with nothing to compare. */
export function averageChangeLabel(
  currentMinor: number | null,
  previousMinor: number | null,
  previousName: string,
  currency: string,
): string | null {
  if (currentMinor == null || previousMinor == null) return null;
  const diff = currentMinor - previousMinor;
  if (diff === 0) return `Same as ${previousName}`;
  return `${diff < 0 ? "Down" : "Up"} ${formatMoney(Math.abs(diff), currency)} on ${previousName}`;
}

/* ---------------- Periods, tabs and sorting (page URL state) ---------------- */

export const USAGE_PERIODS = ["this_month", "last_month", "last_3_months", "this_year"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export const PERIOD_LABELS: Readonly<Record<UsagePeriod, string>> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
};

/** What the tiles compare against: "last month", "the 3 months before", "last year". */
export const PREVIOUS_PERIOD_NAME: Readonly<Record<UsagePeriod, string>> = {
  this_month: "last month",
  last_month: "the month before",
  last_3_months: "the 3 months before",
  this_year: "last year",
};

export const CONSUMABLE_SORTS = ["most_used", "name", "cost", "recent"] as const;
export type ConsumableSort = (typeof CONSUMABLE_SORTS)[number];

export const SORT_LABELS: Readonly<Record<ConsumableSort, string>> = {
  most_used: "Most used",
  name: "Name A to Z",
  cost: "Cost high to low",
  recent: "Recently added",
};

export type ConsumablesTab = "active" | "archived";

export type ConsumablesSearch = {
  tab?: ConsumablesTab;
  q?: string;
  sort?: ConsumableSort;
  period?: UsagePeriod;
  item?: string;
};

/** Keep only values the page understands; defaults are dropped so the URL stays short. */
export function parseConsumablesSearch(raw: Record<string, unknown>): ConsumablesSearch {
  const out: ConsumablesSearch = {};
  if (raw.tab === "archived") out.tab = "archived";
  if (typeof raw.q === "string" && raw.q.trim()) out.q = raw.q;
  if (
    typeof raw.sort === "string" &&
    raw.sort !== "most_used" &&
    (CONSUMABLE_SORTS as readonly string[]).includes(raw.sort)
  ) {
    out.sort = raw.sort as ConsumableSort;
  }
  if (
    typeof raw.period === "string" &&
    raw.period !== "this_month" &&
    (USAGE_PERIODS as readonly string[]).includes(raw.period)
  ) {
    out.period = raw.period as UsagePeriod;
  }
  if (typeof raw.item === "string" && raw.item) out.item = raw.item;
  return out;
}

type SortableConsumable = {
  name: string;
  unit: string;
  sku: string | null;
  unitCostMinor: number | null;
  createdAt: string;
  usage?: { quantity: number; jobs: number } | undefined;
};

/** Name, SKU or unit contains the search, ignoring case. */
export function matchesConsumableSearch(c: SortableConsumable, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [c.name, c.sku ?? "", c.unit].some((v) => v.toLowerCase().includes(needle));
}

/**
 * Most used ranks by jobs in the period, then quantity (units differ between items),
 * then name; unused items sink. Cost puts uncosted items last.
 */
export function sortConsumables<T extends SortableConsumable>(
  rows: readonly T[],
  sort: ConsumableSort,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  const copy = [...rows];
  switch (sort) {
    case "name":
      return copy.sort(byName);
    case "cost":
      return copy.sort((a, b) => (b.unitCostMinor ?? -1) - (a.unitCostMinor ?? -1) || byName(a, b));
    case "recent":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
    case "most_used":
      return copy.sort(
        (a, b) =>
          (b.usage?.jobs ?? 0) - (a.usage?.jobs ?? 0) ||
          (b.usage?.quantity ?? 0) - (a.usage?.quantity ?? 0) ||
          byName(a, b),
      );
  }
}

/** Quick-start chips on the empty catalogue: a name and unit, cost left blank. */
export const QUICK_START: readonly { name: string; unit: UnitCode }[] = [
  { name: "Ceramic coating", unit: "bottle" },
  { name: "Polishing pad", unit: "pad" },
  { name: "Snow foam", unit: "litre" },
  { name: "Microfibre towel", unit: "towel" },
];

/* ---------------- Editing a list ---------------- */

/**
 * One line while editing: the quantity stays a string so "0." and "1," survive
 * typing; `parseQuantity` turns it into a number on save.
 */
export type UsageRow = {
  consumableId: string;
  quantity: string;
  note?: string | null;
  source?: "default" | "added";
  useCurrentCost?: boolean;
};

export function rowsFromLines(
  lines: readonly {
    consumableId: string;
    quantity: number;
    note?: string | null;
    source?: "default" | "added";
  }[],
): UsageRow[] {
  return lines.map((l) => ({
    consumableId: l.consumableId,
    quantity: String(l.quantity),
    note: l.note ?? null,
    ...(l.source ? { source: l.source } : {}),
  }));
}

type UsageItem = {
  consumableId: string;
  quantity: number;
  note?: string | null;
  source?: "default" | "added";
  useCurrentCost?: boolean;
};

/**
 * Rows → the PUT body, or the index of the first row that isn't ready (no
 * consumable picked, or a quantity that isn't a positive number). Blank rows,
 * with nothing picked and nothing typed, are dropped rather than refused.
 */
export function rowsToItems(
  rows: readonly UsageRow[],
): { ok: true; items: UsageItem[] } | { ok: false; index: number } {
  const items: UsageItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.consumableId && !row.quantity.trim()) continue;
    const quantity = parseQuantity(row.quantity);
    if (!row.consumableId || quantity === null) return { ok: false, index: i };
    const note = row.note?.trim();
    items.push({
      consumableId: row.consumableId,
      quantity,
      ...(note ? { note } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.useCurrentCost ? { useCurrentCost: true } : {}),
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

/** Merge a service's usual materials into the rows being edited (the "Add" on the prompt). */
export function addDefaultsToRows(
  rows: readonly UsageRow[],
  defaults: readonly { consumableId: string; quantity: number }[],
): UsageRow[] {
  const next = rows.map((r) => ({ ...r }));
  for (const d of defaults) {
    const existing = next.find((r) => r.consumableId === d.consumableId);
    if (existing) {
      const current = parseQuantity(existing.quantity) ?? 0;
      existing.quantity = String(Math.round((current + d.quantity) * 1000) / 1000);
    } else {
      next.push({ consumableId: d.consumableId, quantity: String(d.quantity), source: "default" });
    }
  }
  return next;
}
