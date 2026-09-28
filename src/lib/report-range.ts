/**
 * Turning the two date pickers on the Reports page into the window the API is asked for
 * (RECA-542).
 *
 * This used to be `new Date(...).toISOString().slice(0, 10)`, which is a day out whenever the
 * business's local date differs from the UTC date. For a UK business in British Summer Time
 * the "this month" default opened on the 31st of the previous month, so every figure on the
 * page quietly included a day that was not in the month — and the picker showed it.
 *
 * Two rules here:
 *
 *  - A calendar day is a day in the *business's* timezone. September for a London business is
 *    September in London wherever the owner happens to be sitting, and it matches how the
 *    exports stamp their rows.
 *  - The window handed to the API is half-open `[from, to)`, like every other interval in the
 *    system. The old end bound was `23:59:59`, which dropped anything in the last second of
 *    the final day.
 */
import { addDaysIso, localDay, wallToUtc } from "./working-days.ts";

export interface IsoRange {
  readonly from: string;
  readonly to: string;
}

/** `YYYY-MM-DD` for today in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDay(now.toISOString(), timeZone);
}

/** `YYYY-MM-DD` for the first of the current month in `timeZone`. */
export function monthStartIn(timeZone: string, now: Date = new Date()): string {
  return `${todayIn(timeZone, now).slice(0, 7)}-01`;
}

/**
 * The whole of the current calendar month in `timeZone`, including the days still to come —
 * a "this month" card counts bookings that have not happened yet.
 */
export function currentMonthRange(timeZone: string, now: Date = new Date()): IsoRange {
  const start = monthStartIn(timeZone, now);
  const [year, month] = start.split("-").map(Number);
  const nextStart = `${month === 12 ? (year ?? 0) + 1 : year}-${String(
    month === 12 ? 1 : (month ?? 1) + 1,
  ).padStart(2, "0")}-01`;
  return reportRange(start, addDaysIso(nextStart, -1), timeZone);
}

/** The last `days` calendar days in `timeZone`, ending with today. */
export function lastDaysRange(days: number, timeZone: string, now: Date = new Date()): IsoRange {
  const today = todayIn(timeZone, now);
  return reportRange(addDaysIso(today, -(days - 1)), today, timeZone);
}

/** Days in the inclusive calendar range, at least one. */
export function rangeDays(fromDate: string, toDate: string): number {
  const days = Math.round((utcMidnight(toDate) - utcMidnight(fromDate)) / 86_400_000) + 1;
  return Math.max(days, 1);
}

/**
 * The UTC instants covering the inclusive calendar days `fromDate…toDate` in `timeZone`,
 * as a half-open `[from, to)`.
 */
export function reportRange(fromDate: string, toDate: string, timeZone: string): IsoRange {
  return {
    from: wallToUtc(fromDate, 0, timeZone).toISOString(),
    // Midnight opening the day after the last one, so the final day is whole.
    to: wallToUtc(addDaysIso(toDate, 1), 0, timeZone).toISOString(),
  };
}

/**
 * The equally long period ending the day before `fromDate`, for the "vs previous" figures.
 * Counted in calendar days rather than milliseconds: a fixed millisecond offset slides by an
 * hour across a DST boundary, which is how a comparison period ends up an hour short.
 */
export function previousReportRange(fromDate: string, toDate: string, timeZone: string): IsoRange {
  const previousTo = addDaysIso(fromDate, -1);
  const previousFrom = addDaysIso(previousTo, -(rangeDays(fromDate, toDate) - 1));
  return reportRange(previousFrom, previousTo, timeZone);
}

function utcMidnight(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
