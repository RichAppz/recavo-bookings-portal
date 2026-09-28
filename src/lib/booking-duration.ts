// Relative so the node test runner (no path aliases) can load it too.
import { formatDurationLong } from "./format.ts";

const DAY_MINUTES = 1440;

type DurationSource = {
  start: string;
  end: string;
  allDay?: boolean;
  /** Per-working-day intervals from the API; a job that skips a weekend has several. */
  segments?: ReadonlyArray<{ start: string; end: string }> | null;
  serviceSnapshot: { durationMinutes: number };
  lineItems?: ReadonlyArray<{ position?: number; durationMinutes: number }> | null;
};

const minutesBetween = (start: string, end: string) =>
  Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));

/**
 * The diary a booking occupies, in minutes. A job laid over working days holds one
 * segment per day it works, so its window is the sum of those — a three-day all-day
 * job over Thu, Fri, Mon is three days, not the five from start to end.
 */
export function bookingWindowMinutes(
  booking: Pick<DurationSource, "start" | "end" | "segments">,
): number {
  const segments = booking.segments ?? [];
  if (segments.length > 1) {
    return segments.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  }
  return minutesBetween(booking.start, booking.end);
}

/**
 * How long the work itself takes, as opposed to how much diary it blocks.
 *
 * For an all-day job the API writes the whole-day window onto start/end *and* onto the
 * primary line item (RECA-532), so a 2-hour ceramic coating booked "All day" comes back
 * as 1440 minutes — which read as "1 day" everywhere, as if the service had been changed.
 * The catalogue length survives in `serviceSnapshot.durationMinutes`, and additional
 * services are never overridden, so the job is the snapshot plus the rest. For a timed
 * booking the line items *are* the job, including any length staff set by hand — and
 * unlike start → end they don't count a weekend the job skips.
 */
export function bookingJobMinutes(booking: DurationSource): number {
  if (!booking.allDay) {
    const items = booking.lineItems ?? [];
    return items.length > 0
      ? items.reduce((sum, item) => sum + item.durationMinutes, 0)
      : bookingWindowMinutes(booking);
  }
  const additional = (booking.lineItems ?? [])
    .slice(1)
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  return booking.serviceSnapshot.durationMinutes + additional;
}

/** The service's own length for one line of an all-day job (the primary is overridden). */
export function lineItemJobMinutes(
  booking: Pick<DurationSource, "allDay" | "serviceSnapshot">,
  item: { position: number; durationMinutes: number },
): number {
  return booking.allDay && item.position === 0
    ? booking.serviceSnapshot.durationMinutes
    : item.durationMinutes;
}

/** Whole days an all-day window covers, never less than one. */
export function allDayBlockDays(blockMinutes: number): number {
  return Math.max(1, Math.round(blockMinutes / DAY_MINUTES));
}

/**
 * "All day · 2 hrs", "All day, 2 days · 2 hrs": the diary block first, then the
 * service's own length, so an all-day booking never reads as a one-day service.
 */
export function formatAllDayDuration(jobMinutes: number, blockMinutes: number): string {
  const days = allDayBlockDays(blockMinutes);
  const block = days === 1 ? "All day" : `All day, ${days} days`;
  return `${block} · ${formatDurationLong(jobMinutes)}`;
}

/**
 * The sentence under an all-day booking's duration: what the day block means
 * against the service's real length.
 */
export function describeAllDayBlock(jobMinutes: number, blockMinutes: number): string {
  const days = allDayBlockDays(blockMinutes);
  const block = days === 1 ? "the whole day" : `${days} whole days`;
  return `Blocks ${block}; the service itself takes ${formatDurationLong(jobMinutes)}.`;
}

/** A day's worth of diary, in minutes; an all-day booking blocks whole days of these. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * Does a booking's window still hold its services after a change?
 *
 * A custom window — all-day, or a length set by hand — survives a service change: the
 * API keeps the days as they are and fits the *main* service into whatever is left once
 * the others have taken their time. So the moment the other services fill the window on
 * their own there is nothing left for the main one, and the amend is refused with
 * `end TOO_SHORT` ("the window is shorter than the additional services on the job")
 * rather than the booking quietly growing. This mirrors `applyLineItemOverrides` in the
 * API, and exists so the form can say so while the job can still be given another day.
 *
 * `daysNeeded` is enough whole days for the *whole* job, and always at least one more
 * than it has now, so acting on it always changes something.
 */
export function windowFit(input: {
  /** Minutes the booking currently occupies: whole days for all-day, else its length. */
  windowMinutes: number;
  /** Every picked service's duration summed. */
  totalMinutes: number;
  /** The same, excluding the main service — the part that must fit. */
  additionalMinutes: number;
  /** Whole days the booking blocks now; 0 when it is not an all-day job. */
  windowDays: number;
}): { fits: boolean; daysNeeded: number } {
  const fits = input.additionalMinutes <= input.windowMinutes;
  const daysNeeded = Math.max(
    input.windowDays + 1,
    Math.ceil(input.totalMinutes / MINUTES_PER_DAY),
  );
  return { fits, daysNeeded };
}
