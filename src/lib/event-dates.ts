import { parseIso } from "./format.ts";
import { addDaysIso, localDay, wallToUtc } from "./working-days.ts";

/**
 * The dates and times the event form holds. `startDate`/`endDate` are local
 * `YYYY-MM-DD`; `endDate` is the *last* day the event covers (inclusive), which is
 * how the range picker reads — "Mon 21 – Fri 25" means Friday is still a holiday.
 * `from`/`to` are `HH:MM` and only matter for a timed single-day event.
 */
export type EventDates = {
  startDate: string;
  endDate: string;
  allDay: boolean;
  from: string;
  to: string;
};

/**
 * The API refuses an end more than 31 × 24 hours after the start
 * (`MAX_BLOCK_DURATION_DAYS`), so a whole month of days is the most a range can hold.
 */
export const MAX_EVENT_DAYS = 31;
const MAX_EVENT_MS = MAX_EVENT_DAYS * 24 * 60 * 60 * 1000;

const pad = (n: number) => `${n}`.padStart(2, "0");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Number of calendar days the range covers, inclusive of both ends (1 = one day). */
export function eventSpanDays(startDate: string, endDate: string): number {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return 0;
  const a = parseIso(startDate);
  const b = parseIso(endDate);
  // Round: a DST change makes one day 23 or 25 hours long.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** A range across more than one day is always a whole-days event. */
export function isMultiDay(startDate: string, endDate: string): boolean {
  return eventSpanDays(startDate, endDate) > 1;
}

/**
 * Turn the form's dates into the `[start, end)` instants the API stores, in the
 * *business's* timezone — not the browser's. An owner editing their London diary
 * from a phone set to Spanish time still means London midnight; using the device
 * zone here is what put a "23:00 Sunday" start on a Monday holiday.
 *
 * All-day events are saved as midnight on the first day to midnight on the day
 * *after* the last day — the shape `isAllDayEvent` and the calendar's all-day lane
 * already recognise — so a Mon–Fri holiday is one bar across the week. Timed events
 * are one day only; any range longer than a day is treated as all-day.
 */
export function eventInterval(
  dates: EventDates,
  timeZone: string,
): { start: string; end: string } | null {
  const { startDate, endDate, from, to } = dates;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return null;
  const days = eventSpanDays(startDate, endDate);
  if (days < 1 || days > MAX_EVENT_DAYS) return null;

  if (dates.allDay || days > 1) {
    const start = wallToUtc(startDate, 0, timeZone);
    const end = wallToUtc(addDaysIso(endDate, 1), 0, timeZone);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    // 31 days that straddle the autumn clock change are an hour over the limit.
    if (end.getTime() - start.getTime() > MAX_EVENT_MS) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (!TIME_RE.test(from) || !TIME_RE.test(to)) return null;
  const start = wallToUtc(startDate, minutesOf(from), timeZone);
  const end = wallToUtc(startDate, minutesOf(to), timeZone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** `HH:MM` wall-clock time of an instant in a zone. */
function wallTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Read a saved event back into the form, in the business's timezone.
 * Midnight-to-midnight (one day or several) is all-day, and its last day is the
 * day before the exclusive end. Anything else is a timed event on its start date.
 */
export function eventDatesFromInterval(
  startIso: string,
  endIso: string,
  timeZone: string,
): EventDates {
  const startDate = localDay(startIso, timeZone);
  const startTime = wallTime(startIso, timeZone);
  const endTime = wallTime(endIso, timeZone);
  const midnightToMidnight =
    startTime === "00:00" &&
    endTime === "00:00" &&
    new Date(endIso).getTime() > new Date(startIso).getTime();
  if (midnightToMidnight) {
    const endDate = addDaysIso(localDay(endIso, timeZone), -1);
    return { startDate, endDate, allDay: true, from: "00:00", to: "23:59" };
  }
  // A timed event that ran past midnight ends "today" as far as the form is
  // concerned; the times are kept so nothing is lost on a no-op save.
  return { startDate, endDate: startDate, allDay: false, from: startTime, to: endTime };
}

/**
 * Put the second tap of a range picker together with the first: the same day is a
 * one-day event, an earlier day swaps the two so the range still reads forwards.
 */
export function rangeFromTaps(
  first: string,
  second: string,
): { startDate: string; endDate: string } {
  return first <= second
    ? { startDate: first, endDate: second }
    : { startDate: second, endDate: first };
}

/**
 * "Mon 21 Sept" for one day, "Mon 21 – Fri 25 Sept" within a month, and
 * "Mon 28 Sept – Fri 2 Oct" over a boundary — the same shape `formatAllDaySpan`
 * gives a booking. The year is added only when the range is not in the current
 * one, so the trigger stays short on a phone.
 */
export function formatEventDateRange(
  startDate: string,
  endDate: string,
  today: Date = new Date(),
): string {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return "";
  const a = parseIso(startDate);
  const b = parseIso(endDate);
  // en-GB puts a comma after the weekday once a year is present; strip it for one style.
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", opts).replace(",", "");
  const year = a.getFullYear() !== today.getFullYear() || b.getFullYear() !== today.getFullYear();
  const yearOpt: Intl.DateTimeFormatOptions = year ? { year: "numeric" } : {};
  if (startDate === endDate) {
    return fmt(a, { weekday: "short", day: "numeric", month: "short", ...yearOpt });
  }
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const left = sameMonth
    ? fmt(a, { weekday: "short", day: "numeric" })
    : fmt(a, { weekday: "short", day: "numeric", month: "short" });
  return `${left} – ${fmt(b, { weekday: "short", day: "numeric", month: "short", ...yearOpt })}`;
}
