/**
 * The booking fields these helpers read. Structural (not the `Booking` schema type)
 * because the portal API sends the customer a slimmer booking than staff get:
 * `lineItems`, `allDay` and the snapshot's cancellation policy may be absent.
 */
export type ClientChangeableBooking = {
  status: string;
  allDay?: boolean | null;
  start: string;
  serviceSnapshot?: { cancellationPolicy?: { windowHours?: number | null } | null } | null;
  lineItems?: readonly { serviceId: string }[] | null;
};

const MOVEABLE = new Set(["held", "awaiting_payment", "confirmed"]);

/** The same statuses the portal reschedule API will accept. */
export function canClientMoveBooking(booking: ClientChangeableBooking, now = Date.now()): boolean {
  if (!MOVEABLE.has(booking.status)) return false;
  if (booking.allDay === true) return false;
  return Date.parse(booking.start) > now;
}

/** Cancel is allowed on the same live future bookings, including all-day jobs. */
export function canClientCancelBooking(
  booking: ClientChangeableBooking,
  now = Date.now(),
): boolean {
  if (!MOVEABLE.has(booking.status)) return false;
  return Date.parse(booking.start) > now;
}

/** Hours of notice the studio asks for; 0 when the payload carries no policy. */
export function clientCancelWindowHours(booking: ClientChangeableBooking): number {
  const hours = booking.serviceSnapshot?.cancellationPolicy?.windowHours;
  return typeof hours === "number" && Number.isFinite(hours) ? hours : 0;
}

/** Instant after which a customer cancel is late (credit stays spent). */
export function clientCancelDeadlineIso(booking: ClientChangeableBooking): string {
  const hours = clientCancelWindowHours(booking);
  return new Date(Date.parse(booking.start) - hours * 60 * 60 * 1000).toISOString();
}

export function isWithinClientCancelWindow(
  booking: ClientChangeableBooking,
  now = Date.now(),
): boolean {
  return now < Date.parse(clientCancelDeadlineIso(booking));
}

/** Extra services on the job; public availability must size the new slot for all of them. */
export function bookingAdditionalServiceIds(booking: ClientChangeableBooking): string[] {
  return (booking.lineItems ?? []).slice(1).map((line) => line.serviceId);
}

/** Calendar day `YYYY-MM-DD` plus whole days, staying on the calendar (not the device clock). */
export function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + days));
  return next.toISOString().slice(0, 10);
}
