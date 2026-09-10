import { parseMoneyToMinor } from "./format.ts";

/** "10% off" or "£10 off" as staff type it; `value` is the raw input text. */
export type Discount = { mode: "percent" | "amount"; value: string };

/**
 * Money taken off a list price, in minor units, or null when the input doesn't
 * make a usable discount (blank, not a number, negative, over 100%, or more than
 * the price itself). Percentages round to the nearest penny.
 */
export function discountOffMinor(listMinor: number, discount: Discount): number | null {
  const raw = discount.value.trim();
  if (!raw) return null;
  if (discount.mode === "percent") {
    const pct = Number(raw.replace(/%/g, ""));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
    return Math.round((listMinor * pct) / 100);
  }
  try {
    const minor = parseMoneyToMinor(raw);
    if (minor <= 0 || minor > listMinor) return null;
    return minor;
  } catch {
    return null;
  }
}

/** Short label for the applied discount, e.g. "10% off" or "£10.00 off". */
export function discountLabel(discount: Discount, formatAmount: (minor: number) => string): string {
  if (discount.mode === "percent") return `${discount.value.trim().replace(/%/g, "")}% off`;
  try {
    return `${formatAmount(parseMoneyToMinor(discount.value))} off`;
  } catch {
    return "Discount";
  }
}
