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

/** `YYYY-MM` of a calendar day. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** `YYYY-MM` plus whole months. */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return next.toISOString().slice(0, 7);
}

/**
 * The cells of a Monday-first month grid: `null` for the blanks before the 1st,
 * then every day of the month as `YYYY-MM-DD`. Always a whole number of weeks.
 */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * "Leeds LS6" from "12 Mill Street, Leeds LS6 2AB": the town and the outward
 * half of a UK postcode, for the landing chip. Falls back to the last part of
 * the address when there is no postcode to anchor on.
 */
export function shortPlace(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  const postcode = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?$/i.exec(last);
  if (!postcode) return last;
  const outward = postcode[1]!.toUpperCase();
  const town = last.slice(0, postcode.index).trim() || parts[parts.length - 2] || "";
  return [town, outward].filter(Boolean).join(" ");
}
