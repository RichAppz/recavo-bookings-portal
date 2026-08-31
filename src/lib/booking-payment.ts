import type { Booking, Payment } from "@/lib/api/types";

const SETTLED = new Set(["succeeded", "partially_refunded", "refunded"]);

const CLOSED = new Set([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
]);

/**
 * Staff "take payment separately" confirms the slot first (`paymentMethod: none`).
 * The client should still see that money is due until a payment settles.
 */
export function bookingNeedsPayment(
  booking: Pick<Booking, "id" | "priceMinor" | "status"> & { paymentMethod?: string },
  payments: readonly Payment[],
): boolean {
  if (booking.paymentMethod === "credit") return false;
  if (booking.priceMinor <= 0) return false;
  if (CLOSED.has(booking.status)) return false;
  return !payments.some((p) => p.bookingId === booking.id && SETTLED.has(p.state));
}
