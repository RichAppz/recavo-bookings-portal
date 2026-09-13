import type { BookingConflict } from "./api/errors.ts";
import { formatDurationLong, formatInTz, intervalsOverlap } from "./format.ts";

/**
 * Drop-in bookings: a short job squeezed in beside an all-day one (staff only).
 *
 * A one-person detailer books most work as all-day jobs, which hold the whole day.
 * When a customer phones for an hour's work on a held day, staff can book it as a
 * "drop-in": the API then ignores clashes with all-day jobs (timed jobs and events
 * still block) and the calendar shows both on the same day. The mirror applies too:
 * an all-day job dropped onto a day that already has timed work goes through only
 * when staff confirm the two can share the day. The public booking page never sees
 * any of this — held days stay unavailable to customers.
 *
 * These helpers are pure so the staff forms, the reschedule dialog and the 409
 * handler agree on what a hold looks like and how it is described.
 */

/** The minimum a diary entry needs for the checks below (a `Booking` satisfies it). */
export interface DiaryBooking {
  id: string;
  start: string;
  end: string;
  allDay?: boolean;
  staffId: string;
  status: string;
  serviceSnapshot: { name: string };
  attendees?: readonly { name: string; isLead?: boolean }[];
  leadCustomerId?: string;
}

/** Statuses that still hold the diary — the same set the API's allocations honour. */
const LIVE_STATUSES = new Set(["held", "awaiting_payment", "confirmed"]);

export function holdsDiary(booking: Pick<DiaryBooking, "status">): boolean {
  return LIVE_STATUSES.has(booking.status);
}

/**
 * Live all-day jobs for `staffId` (or anyone, when null) that cover any part of
 * `[startIso, endIso)`. These are what a drop-in may sit beside.
 */
export function allDayHolds<T extends DiaryBooking>(
  bookings: readonly T[],
  window: { start: string; end: string },
  staffId: string | null,
): T[] {
  return bookings.filter(
    (b) =>
      b.allDay === true &&
      holdsDiary(b) &&
      (staffId === null || b.staffId === staffId) &&
      intervalsOverlap(b.start, b.end, window.start, window.end),
  );
}

/**
 * Live timed jobs for `staffId` (or anyone) inside `[startIso, endIso)` — what an
 * all-day job would have to share the day with.
 */
export function timedJobsWithin<T extends DiaryBooking>(
  bookings: readonly T[],
  window: { start: string; end: string },
  staffId: string | null,
): T[] {
  return bookings.filter(
    (b) =>
      b.allDay !== true &&
      holdsDiary(b) &&
      (staffId === null || b.staffId === staffId) &&
      intervalsOverlap(b.start, b.end, window.start, window.end),
  );
}

/** The lead attendee's name as recorded on the booking, if any. */
export function leadName(booking: Pick<DiaryBooking, "attendees">): string | null {
  const lead = booking.attendees?.find((a) => a.isLead) ?? booking.attendees?.[0];
  return lead?.name?.trim() || null;
}

/** "5 year coating · Lee Gamble" — how a hold is named in the empty-slots note. */
export function describeHold(
  booking: Pick<DiaryBooking, "serviceSnapshot" | "attendees">,
  customerName?: string | null,
): string {
  const who = customerName?.trim() || leadName(booking);
  return who ? `${booking.serviceSnapshot.name} · ${who}` : booking.serviceSnapshot.name;
}

/** "Held all day by 5 year coating · Lee Gamble" (or "… and 1 more" when several). */
export function heldAllDayNote(descriptions: readonly string[]): string {
  const [first, ...rest] = descriptions;
  if (!first) return "Held all day";
  return rest.length === 0
    ? `Held all day by ${first}`
    : `Held all day by ${first} and ${rest.length} more`;
}

/**
 * "Monday already has a 1-hour job at 10:00" — the mirror warning when an all-day
 * job is placed on a day with timed work. Several jobs read as "… 2 timed jobs …".
 */
export function timedClashNote(
  jobs: readonly Pick<DiaryBooking, "start" | "end">[],
  timeZone: string,
): string | null {
  const [first] = jobs;
  if (!first) return null;
  const weekday = formatInTz(first.start, timeZone, { weekday: "long" });
  if (jobs.length === 1) {
    const minutes = Math.round(
      (new Date(first.end).getTime() - new Date(first.start).getTime()) / 60_000,
    );
    const at = formatInTz(first.start, timeZone, { hour: "2-digit", minute: "2-digit" });
    return `${weekday} already has a ${formatDurationLabel(minutes)} job at ${at}`;
  }
  const at = formatInTz(first.start, timeZone, { hour: "2-digit", minute: "2-digit" });
  return `${weekday} already has ${jobs.length} timed jobs, the first at ${at}`;
}

/** "1-hour" / "90-minute" / "2-day" — the adjective form for the clash sentence. */
export function formatDurationLabel(minutes: number): string {
  if (minutes > 0 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days}-day`;
  }
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}-hour`;
  }
  return `${formatDurationLong(minutes).replace(/\s+/g, "-")}`;
}

/** One line per clash for the "book anyway?" confirmation after a 409. */
export function describeConflict(conflict: BookingConflict, timeZone: string): string {
  const what = conflict.serviceName ?? (conflict.kind === "block" ? "Event" : "Booking");
  const who = conflict.customerName ? ` · ${conflict.customerName}` : "";
  if (conflict.allDay) {
    return `${what}${who} · all day`;
  }
  const start = formatInTz(conflict.start, timeZone, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = formatInTz(conflict.end, timeZone, { hour: "2-digit", minute: "2-digit" });
  return `${what}${who} · ${start}–${end}`;
}

/**
 * Title + explanation for the "book anyway?" confirmation, by which way round the
 * clash is: a timed job landing on all-day holds (it becomes a drop-in) or an
 * all-day job landing on timed work (staff confirm they can share the day).
 */
export function overrideCopy(newBookingAllDay: boolean): { title: string; body: string } {
  return newBookingAllDay
    ? {
        title: "Book the whole day anyway?",
        body: "There is already timed work on this day. Booking anyway keeps both — the all-day job and the timed jobs will sit side by side on the calendar.",
      }
    : {
        title: "Squeeze in as a drop-in?",
        body: "The day is held by an all-day job. Booking as a drop-in keeps both — the short job shows under the all-day bar on the calendar.",
      };
}
