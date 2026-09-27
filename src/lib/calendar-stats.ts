import type { Booking } from "./api/types.ts";
import { bookingSettlement } from "./booking-payment.ts";

const CLOSED = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
  "draft",
]);

/** "14.5 h", "45 min", "3 h". */
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export type CalendarStatsSummary = {
  active: number;
  cancelled: number;
  bookedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  timedMinutes: number;
  allDay: number;
  clients: number;
};

/** Pure rollup of a set of bookings; exported so it can be unit-tested. */
export function summariseBookings(bookings: readonly Booking[]): CalendarStatsSummary {
  const out: CalendarStatsSummary = {
    active: 0,
    cancelled: 0,
    bookedMinor: 0,
    collectedMinor: 0,
    outstandingMinor: 0,
    timedMinutes: 0,
    allDay: 0,
    clients: 0,
  };
  const clients = new Set<string>();
  for (const b of bookings) {
    if (CLOSED.has(b.status)) {
      if (b.status !== "draft") out.cancelled += 1;
      // Money paid on a cancelled job is still money in the till.
      out.collectedMinor += b.paidMinor ?? 0;
      continue;
    }
    out.active += 1;
    const s = bookingSettlement(b);
    out.bookedMinor += s.priceMinor;
    out.collectedMinor += s.paidMinor;
    out.outstandingMinor += s.outstandingMinor;
    if (b.allDay) out.allDay += 1;
    else {
      const mins = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000;
      if (Number.isFinite(mins) && mins > 0) out.timedMinutes += mins;
    }
    if (b.leadCustomerId) clients.add(b.leadCustomerId);
  }
  out.clients = clients.size;
  return out;
}
