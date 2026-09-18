import type { BookingConflict } from "./api/errors.ts";
import { formatDurationLong, formatInTz, intervalsOverlap } from "./format.ts";

/**
 * Drop-in bookings: a short job squeezed in beside an all-day one (staff only).
 *
 * A one-person detailer books most work as all-day jobs, which hold the whole day.
 * When a customer phones for an hour's work on a held day, staff can book it as a
 * "drop-in": the API then ignores clashes with all-day jobs (timed jobs and events
 * still block) and the calendar shows both on the same day. The mirror applies too:
 * an all-day job dropped onto a day that already has timed work, or an event that
 * takes part of the day (a dentist appointment), goes through only when staff confirm
 * the two can share the day; an event covering the whole day (a holiday) still blocks.
 * The public booking page never sees any of this — held days stay unavailable to
 * customers.
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

/**
 * The lead attendee's name as recorded on the booking, if any. Staff-made bookings
 * carry the placeholder "Lead" when no name was given — that is not a name.
 */
export function leadName(booking: Pick<DiaryBooking, "attendees">): string | null {
  const lead = booking.attendees?.find((a) => a.isLead) ?? booking.attendees?.[0];
  const name = lead?.name?.trim();
  return name && name !== "Lead" ? name : null;
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
 * Something timed on the day an all-day job would take: a booking, or a calendar
 * event (a dentist appointment) that takes part of the day.
 */
export interface TimedEntry {
  start: string;
  end: string;
  /** Default "job". */
  kind?: "job" | "event";
  /** The event's title, when it has one. */
  title?: string | null;
}

/** Live calendar blocks for `staffId` (or anyone) inside `[start, end)`, as timed entries. */
export function eventsWithin<
  T extends { start: string; end: string; staffId: string; status: string; title: string },
>(blocks: readonly T[], window: { start: string; end: string }, staffId: string | null): T[] {
  return blocks.filter(
    (b) =>
      b.status === "active" &&
      (staffId === null || b.staffId === staffId) &&
      intervalsOverlap(b.start, b.end, window.start, window.end),
  );
}

/**
 * "Monday already has a 1-hour job at 10:00" — the mirror warning when an all-day
 * job is placed on a day with timed work. An event reads "… an event at 10:15
 * (Dentist)"; several entries read as "… 2 timed jobs and an event, the first at …".
 */
export function timedClashNote(entries: readonly TimedEntry[], timeZone: string): string | null {
  const [first] = entries;
  if (!first) return null;
  const weekday = formatInTz(first.start, timeZone, { weekday: "long" });
  const at = formatInTz(first.start, timeZone, { hour: "2-digit", minute: "2-digit" });
  if (entries.length === 1) {
    if (first.kind === "event") {
      const title = first.title?.trim();
      return `${weekday} already has an event at ${at}${title ? ` (${title})` : ""}`;
    }
    const minutes = Math.round(
      (new Date(first.end).getTime() - new Date(first.start).getTime()) / 60_000,
    );
    return `${weekday} already has a ${formatDurationLabel(minutes)} job at ${at}`;
  }
  const jobs = entries.filter((e) => e.kind !== "event").length;
  const events = entries.length - jobs;
  const parts = [
    jobs === 1 ? "a timed job" : jobs > 1 ? `${jobs} timed jobs` : null,
    events === 1 ? "an event" : events > 1 ? `${events} events` : null,
  ].filter((p) => p !== null);
  return `${weekday} already has ${parts.join(" and ")}, the first at ${at}`;
}

/**
 * "Overlaps Mini valet · Pat · Tue 10:00–11:00" — a hand-set time landing on timed
 * work (or an event) the same person already has. Nothing to override: it has to
 * move. Several read as "Overlaps Mini valet · Pat · Tue 10:00–11:00 and 1 more".
 */
export function timedOverlapNote(
  entries: readonly (TimedEntry & Partial<Pick<DiaryBooking, "serviceSnapshot" | "attendees">>)[],
  timeZone: string,
): string | null {
  const [first, ...rest] = entries;
  if (!first) return null;
  const what =
    first.kind === "event"
      ? first.title?.trim() || "an event"
      : first.serviceSnapshot
        ? describeHold({ serviceSnapshot: first.serviceSnapshot, attendees: first.attendees })
        : "another booking";
  const start = formatInTz(first.start, timeZone, { hour: "2-digit", minute: "2-digit" });
  const end = formatInTz(first.end, timeZone, { hour: "2-digit", minute: "2-digit" });
  const more = rest.length > 0 ? ` and ${rest.length} more` : "";
  return `Overlaps ${what} · ${start}–${end}${more}`;
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
        body: "There is already timed work or an event on this day. Booking anyway keeps both — the all-day job and what is already there will sit side by side on the calendar.",
      }
    : {
        title: "Squeeze in as a drop-in?",
        body: "The day is held by an all-day job. Booking as a drop-in keeps both — the short job shows under the all-day bar on the calendar.",
      };
}

/**
 * The toast for a clash staff cannot override: timed work on timed work, or a block
 * (an event, a holiday) in the way. Names what is there when the 409 said, and only
 * points at another person when there is one — a solo operator has no one else.
 *
 * `kind` tells the caller which case it was: "all-day-job" (an all-day job wanted a
 * day another all-day job holds — the caller may offer to book at a set time
 * instead), "blocked" (a block the new booking cannot share) or "timed".
 */
export function hardClashCopy(input: {
  conflicts: readonly BookingConflict[];
  /** The staff member the booking is for, when known. */
  who: string | null;
  newBookingAllDay: boolean;
  timeZone: string;
  /** "another detailer" — offered only when there is someone else to pick. */
  alternative: string | null;
}): { kind: "all-day-job" | "blocked" | "timed"; title: string; description: string } {
  const { conflicts, who, newBookingAllDay, timeZone, alternative } = input;
  const named = conflicts.map((c) => describeConflict(c, timeZone)).join("; ");
  const allBlocks = conflicts.length > 0 && conflicts.every((c) => c.kind === "block");
  const orElse = alternative ? `, or ${alternative}` : "";
  if (newBookingAllDay) {
    if (allBlocks) {
      return {
        kind: "blocked",
        title: who ? `${who} is unavailable then` : "That day is blocked out",
        description: `${named}. Pick a different day${orElse}.`,
      };
    }
    return {
      kind: "all-day-job",
      title: who ? `${who} already has an all-day job then` : "That day already has an all-day job",
      description: named
        ? `${named}. Book this one at a set time alongside it instead?`
        : "Book this one at a set time alongside it instead?",
    };
  }
  return {
    kind: allBlocks ? "blocked" : "timed",
    title: "That time is already taken",
    description: named
      ? `${who ? `${who} already has ` : "There is already "}${named}. Pick a different time${orElse}.`
      : `Pick a different time${orElse}.`,
  };
}
