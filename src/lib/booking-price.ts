/**
 * How a booking's price breaks down for display — pure, so the booking panel,
 * the edit form and any receipt-style view all agree with each other and with
 * the API's invoice lines.
 *
 * The API keeps every service line at its catalogue price and puts a staff price
 * on `priceMinor`; the gap is `adjustmentMinor` (negative = discount). Bookings
 * priced before that existed folded the gap into the primary line instead, so they
 * show no discount row and still read "Adjusted from £x" via the snapshot price.
 */

import { parseMoneyToMinor } from "./format.ts";

type PriceLine = {
  serviceId: string;
  position: number;
  name: string;
  variantName: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
};

export type PriceBreakdownInput = {
  priceMinor: number;
  currency: string;
  /** Older API builds omit this; it is then derived from the lines. */
  adjustmentMinor?: number;
  lineItems?: readonly PriceLine[] | null;
  serviceSnapshot: {
    serviceId: string;
    name: string;
    variantName: string | null;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
  };
};

export type PriceBreakdown = {
  /** Service lines in position order, each at the price it was booked at. */
  lines: PriceLine[];
  /** Catalogue total the job was priced from (what "Adjusted from £x" quotes). */
  listPriceMinor: number;
  /** `priceMinor − Σ lines`: negative = discount row, positive = surcharge row, 0 = none. */
  adjustmentMinor: number;
  totalMinor: number;
  /**
   * The discount was folded into the primary line by an older API (its price differs
   * from the snapshot's). Shown as-is: lines as booked, no discount row.
   */
  legacyFolded: boolean;
  /** Whether there is anything beyond a single line to itemise. */
  hasBreakdown: boolean;
};

export function bookingPriceBreakdown(booking: PriceBreakdownInput): PriceBreakdown {
  const lines: PriceLine[] =
    booking.lineItems && booking.lineItems.length > 0
      ? [...booking.lineItems].sort((a, b) => a.position - b.position)
      : [
          {
            serviceId: booking.serviceSnapshot.serviceId,
            position: 0,
            name: booking.serviceSnapshot.name,
            variantName: booking.serviceSnapshot.variantName,
            durationMinutes: booking.serviceSnapshot.durationMinutes,
            priceMinor: booking.serviceSnapshot.priceMinor,
            currency: booking.serviceSnapshot.currency,
          },
        ];
  const linesMinor = lines.reduce((sum, li) => sum + li.priceMinor, 0);
  const adjustmentMinor = booking.adjustmentMinor ?? booking.priceMinor - linesMinor;
  // The primary's catalogue price lives on the snapshot; additional services never
  // carried an override, so this is the list total under both the old and new model.
  const listPriceMinor =
    booking.serviceSnapshot.priceMinor + lines.slice(1).reduce((sum, li) => sum + li.priceMinor, 0);
  const legacyFolded =
    adjustmentMinor === 0 && (lines[0]?.priceMinor ?? 0) !== booking.serviceSnapshot.priceMinor;
  return {
    lines,
    listPriceMinor,
    adjustmentMinor,
    totalMinor: booking.priceMinor,
    legacyFolded,
    hasBreakdown: lines.length > 1 || adjustmentMinor !== 0,
  };
}

/** Row label for a non-zero adjustment: what staff took off, or added on. */
export function adjustmentLabel(adjustmentMinor: number): string {
  return adjustmentMinor < 0 ? "Discount" : "Surcharge";
}

/**
 * "−£145.00" / "+£50.00": the signed amount for the adjustment row. Uses a true minus
 * sign so it reads as a subtraction, not a hyphenated label.
 */
export function formatAdjustment(
  adjustmentMinor: number,
  formatAmount: (minor: number) => string,
): string {
  const sign = adjustmentMinor < 0 ? "−" : "+";
  return `${sign}${formatAmount(Math.abs(adjustmentMinor))}`;
}

/**
 * What a price staff typed on a service row of the Add booking form is worth:
 * `undefined` = untouched (the list price applies), `null` = typed but not an amount,
 * else the amount in minor units. Negative prices are not amounts.
 */
export function linePriceMinor(input: string | undefined): number | null | undefined {
  if (input === undefined) return undefined;
  try {
    const minor = parseMoneyToMinor(input);
    return minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}
