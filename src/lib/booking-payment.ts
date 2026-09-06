import type { Booking, Payment } from "@/lib/api/types";

const SETTLED = new Set(["succeeded", "partially_refunded", "refunded"]);

const CLOSED = new Set([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
]);

/**
 * `requireOnlinePayment` is not on the committed OpenAPI snapshot yet, so the
 * generated `BusinessConfiguration` type omits it. Read through this shape
 * until the schema is refreshed as its own change.
 */
export type BookingRulesConfig = {
  cancellationWindowHours?: number;
  defaultHoldMinutes?: number;
  requireOnlinePayment?: boolean;
};

export function isOnlinePaymentRequired(
  config: { booking?: BookingRulesConfig } | null | undefined,
): boolean {
  return Boolean(config?.booking?.requireOnlinePayment);
}

export function isSettledPaymentState(state: string | undefined): boolean {
  return Boolean(state && SETTLED.has(state));
}

export type SettlementState = "free" | "credit" | "unpaid" | "deposit_paid" | "part_paid" | "paid";

export type BookingSettlement = {
  state: SettlementState;
  priceMinor: number;
  paidMinor: number;
  depositMinor: number | null;
  outstandingMinor: number;
  /** What checkout collects right now: the deposit remainder while securing, else the balance. */
  dueNowMinor: number;
};

/**
 * Settlement view of a booking, derived the way the deposits guide (RECA-523)
 * prescribes: outstanding = price − paid; a deposit only counts while it is
 * strictly between 0 and the price; credit bookings never carry money.
 */
export function bookingSettlement(
  booking: Pick<Booking, "priceMinor" | "status"> & {
    paymentMethod?: string;
    depositMinor?: number | null;
    paidMinor?: number;
  },
): BookingSettlement {
  const priceMinor = booking.priceMinor;
  const paidMinor = booking.paidMinor ?? 0;
  const deposit =
    booking.depositMinor != null && booking.depositMinor > 0 && booking.depositMinor < priceMinor
      ? booking.depositMinor
      : null;
  const outstandingMinor = Math.max(0, priceMinor - paidMinor);
  const securing = booking.status === "held" || booking.status === "awaiting_payment";
  const dueNowMinor =
    securing && deposit != null ? Math.max(0, deposit - paidMinor) : outstandingMinor;

  let state: SettlementState;
  if (booking.paymentMethod === "credit") state = "credit";
  else if (priceMinor <= 0) state = "free";
  else if (paidMinor >= priceMinor) state = "paid";
  else if (paidMinor === 0) state = "unpaid";
  else if (deposit != null && paidMinor >= deposit) state = "deposit_paid";
  else state = "part_paid";

  return { state, priceMinor, paidMinor, depositMinor: deposit, outstandingMinor, dueNowMinor };
}

/**
 * The deposit a booking of these services would carry, per the API's rule: the
 * services' deposits summed, and only meaningful strictly between 0 and the total.
 */
export function configuredDepositMinor(
  services: readonly { depositMinor?: number | null }[],
  totalMinor: number,
): number | null {
  const sum = services.reduce((acc, s) => acc + (s.depositMinor ?? 0), 0);
  return sum > 0 && sum < totalMinor ? sum : null;
}

/**
 * Staff "take payment separately" confirms the slot first (`paymentMethod: none`).
 * The client should still see that money is due until a payment settles.
 */
export function bookingNeedsPayment(
  booking: Pick<Booking, "id" | "priceMinor" | "status"> & {
    paymentMethod?: string;
    paidMinor?: number;
  },
  payments: readonly Payment[],
): boolean {
  if (booking.paymentMethod === "credit") return false;
  if (booking.priceMinor <= 0) return false;
  if (CLOSED.has(booking.status)) return false;
  // Money recorded by any channel (deposit, cash, bank transfer) counts too.
  if ((booking.paidMinor ?? 0) >= booking.priceMinor) return false;
  return !payments.some((p) => p.bookingId === booking.id && SETTLED.has(p.state));
}
