/**
 * How a booking's price breaks down for display — pure, so the booking panel,
 * the edit form and any receipt-style view all agree with each other and with
 * the API's invoice lines.
 *
 * Each service line carries what it is charged at (`priceMinor`) and what it was
 * booked from (`listPriceMinor`): staff pricing a service differently is a cheaper or
 * dearer service, shown as its price with the list struck through — not a discount.
 * The booking's `adjustmentMinor` (its price minus the sum of the lines) is the
 * whole-job adjustment: a discount, or a staff total for the job.
 */

import { parseMoneyToMinor } from "./format.ts";

type PriceLine = {
  serviceId: string;
  position: number;
  name: string;
  variantName: string | null;
  durationMinutes: number;
  priceMinor: number;
  /** Older API builds omit this; the line is then taken to be at list. */
  listPriceMinor?: number;
  currency: string;
};

export type PriceBreakdownLine = PriceLine & { listPriceMinor: number };

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
  /** Service lines in position order, each at the price it was booked at, with its list. */
  lines: PriceBreakdownLine[];
  /** Catalogue total the job was priced from (what "Adjusted from £x" quotes). */
  listPriceMinor: number;
  /** `priceMinor − Σ lines`: negative = discount row, positive = adjustment row, 0 = none. */
  adjustmentMinor: number;
  totalMinor: number;
  /** Some line is charged at other than its list price. */
  hasRepricedLine: boolean;
  /** Whether there is anything beyond a single line at list to itemise. */
  hasBreakdown: boolean;
};

export function bookingPriceBreakdown(booking: PriceBreakdownInput): PriceBreakdown {
  const lines: PriceBreakdownLine[] =
    booking.lineItems && booking.lineItems.length > 0
      ? [...booking.lineItems]
          .sort((a, b) => a.position - b.position)
          .map((li, idx) => ({
            ...li,
            // The primary's catalogue price also lives on the snapshot, which covers
            // bookings from an API that did not yet record a list per line.
            listPriceMinor:
              li.listPriceMinor ?? (idx === 0 ? booking.serviceSnapshot.priceMinor : li.priceMinor),
          }))
      : [
          {
            serviceId: booking.serviceSnapshot.serviceId,
            position: 0,
            name: booking.serviceSnapshot.name,
            variantName: booking.serviceSnapshot.variantName,
            durationMinutes: booking.serviceSnapshot.durationMinutes,
            priceMinor: booking.serviceSnapshot.priceMinor,
            listPriceMinor: booking.serviceSnapshot.priceMinor,
            currency: booking.serviceSnapshot.currency,
          },
        ];
  const linesMinor = lines.reduce((sum, li) => sum + li.priceMinor, 0);
  const adjustmentMinor = booking.adjustmentMinor ?? booking.priceMinor - linesMinor;
  const listPriceMinor = lines.reduce((sum, li) => sum + li.listPriceMinor, 0);
  const hasRepricedLine = lines.some((li) => li.priceMinor !== li.listPriceMinor);
  return {
    lines,
    listPriceMinor,
    adjustmentMinor,
    totalMinor: booking.priceMinor,
    hasRepricedLine,
    hasBreakdown: lines.length > 1 || adjustmentMinor !== 0 || hasRepricedLine,
  };
}

/**
 * Row label for a non-zero whole-job adjustment: what staff took off the job, or added
 * to it. Matches the line the API prints on the invoice.
 */
export function adjustmentLabel(adjustmentMinor: number): string {
  return adjustmentMinor < 0 ? "Discount" : "Price adjustment";
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
