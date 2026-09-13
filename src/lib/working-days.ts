/**
 * Working-day arithmetic for jobs that take a day or more, mirroring the API's
 * `availability/domain/working-days.ts` so the Add booking preview matches what the
 * server will save. The rule:
 *
 * - Under a day: the job runs from its start for that long, untouched.
 * - A day or more: each whole day takes one *working* day — the start day (always)
 *   and then the next days the schedule works, skipping days with no hours. Leftover
 *   hours run on one more working day from its opening time. A timed job holds each
 *   day from its start (or opening) to closing; an all-day job holds whole days.
 * - No schedule at all (no working rules, no opening hours): one continuous span.
 *
 * Saved bookings carry the authoritative `segments` / `occupiedDays` from the API;
 * the helpers at the bottom read those (falling back to start → end for bookings made
 * before segments existed) so the calendar never recomputes them.
 */

const DAY_MINUTES = 24 * 60;
const MAX_SKIP_DAYS = 400;

export interface Segment {
  start: string;
  end: string;
}

export interface DayHours {
  open: number;
  close: number;
}

export interface WorkingSchedule {
  hoursOn(isoDate: string): DayHours | null;
}

export interface WorkingLayout {
  start: string;
  end: string;
  segments: Segment[];
  occupiedDays: string[];
}

type Rule = { dayOfWeek: number; startMinute: number; endMinute: number; locationId: string | null };
type Opening = { dayOfWeek: number; openMinute: number; closeMinute: number };
type Off = { start: string; end: string };

/** Staff rules for the location, narrowed to its opening hours; null = nothing to skip. */
export function scheduleFor(
  staff: { workingRules: Rule[]; timeOff?: Off[] } | null | undefined,
  location: { id: string; openingHours: Opening[] } | null | undefined,
  timeZone: string,
): WorkingSchedule | null {
  const rules = (staff?.workingRules ?? []).filter(
    (r) => !r.locationId || !location || r.locationId === location.id,
  );
  const opening = location?.openingHours ?? [];
  if (rules.length === 0 && opening.length === 0) return null;
  const timeOff = staff?.timeOff ?? [];
  return {
    hoursOn(isoDate) {
      const weekday = isoWeekday(isoDate);
      const dayOpening = opening.filter((h) => h.dayOfWeek === weekday);
      let windows: { start: number; end: number }[];
      if (rules.length > 0) {
        const dayRules = rules.filter((r) => r.dayOfWeek === weekday);
        windows = dayRules.flatMap((r) => {
          if (opening.length === 0) return [{ start: r.startMinute, end: r.endMinute }];
          return dayOpening
            .map((o) => ({
              start: Math.max(r.startMinute, o.openMinute),
              end: Math.min(r.endMinute, o.closeMinute),
            }))
            .filter((w) => w.end > w.start);
        });
      } else {
        windows = dayOpening.map((o) => ({ start: o.openMinute, end: o.closeMinute }));
      }
      if (windows.length === 0) return null;
      const open = Math.min(...windows.map((w) => w.start));
      const close = Math.max(...windows.map((w) => w.end));
      const openMs = wallToUtc(isoDate, open, timeZone).getTime();
      const closeMs = wallToUtc(isoDate, close, timeZone).getTime();
      const off = timeOff.some(
        (p) => new Date(p.start).getTime() <= openMs && new Date(p.end).getTime() >= closeMs,
      );
      return off ? null : { open, close };
    },
  };
}

/** Lays `minutes` of job from `startIso` over working days (see the module rule). */
export function layoutWorkingDuration(
  startIso: string,
  minutes: number,
  schedule: WorkingSchedule | null,
  timeZone: string,
  options: { allDay: boolean },
): WorkingLayout {
  const start = new Date(startIso);
  if (!schedule || minutes < DAY_MINUTES) {
    const end = new Date(start.getTime() + minutes * 60_000).toISOString();
    return continuous(start.toISOString(), end, timeZone);
  }
  const wholeDays = Math.floor(minutes / DAY_MINUTES);
  const remainder = minutes % DAY_MINUTES;
  const startDay = localDay(startIso, timeZone);
  const days = [startDay];
  let needed = wholeDays - 1 + (remainder > 0 ? 1 : 0);
  let cursor = startDay;
  while (needed > 0) {
    cursor = nextWorkingDay(cursor, schedule);
    days.push(cursor);
    needed -= 1;
  }
  const segments = days.map((day, index) => {
    const isFirst = index === 0;
    const isLast = index === days.length - 1;
    if (options.allDay) {
      return {
        start: wallToUtc(day, 0, timeZone).toISOString(),
        end: wallToUtc(addDaysIso(day, 1), 0, timeZone).toISOString(),
      };
    }
    const hours = schedule.hoursOn(day);
    const segStart = isFirst ? start : wallToUtc(day, hours?.open ?? 0, timeZone);
    let segEnd: Date;
    if (isLast && remainder > 0) {
      segEnd = wallToUtc(day, (hours?.open ?? 0) + remainder, timeZone);
    } else {
      segEnd = hours
        ? wallToUtc(day, hours.close, timeZone)
        : wallToUtc(addDaysIso(day, 1), 0, timeZone);
    }
    if (segEnd.getTime() <= segStart.getTime()) segEnd = wallToUtc(addDaysIso(day, 1), 0, timeZone);
    return { start: segStart.toISOString(), end: segEnd.toISOString() };
  });
  return {
    start: start.toISOString(),
    end: segments[segments.length - 1]!.end,
    segments,
    occupiedDays: days,
  };
}

/**
 * The working days inside a hand-set window (Add booking → custom start/end): the
 * first and last day always count, the days between only when worked.
 */
export function layoutExplicitWindow(
  startIso: string,
  endIso: string,
  schedule: WorkingSchedule | null,
  timeZone: string,
  options: { allDay: boolean },
): WorkingLayout {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const startDay = localDay(startIso, timeZone);
  const lastDay = localDay(new Date(endMs - 60_000).toISOString(), timeZone);
  if (!schedule || endMs - startMs < DAY_MINUTES * 60_000 || startDay === lastDay) {
    return continuous(startIso, endIso, timeZone);
  }
  const days = [startDay];
  let cursor = addDaysIso(startDay, 1);
  while (cursor < lastDay) {
    if (schedule.hoursOn(cursor)) days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  days.push(lastDay);
  if (options.allDay) {
    const segments = days.map((day) => ({
      start: wallToUtc(day, 0, timeZone).toISOString(),
      end: wallToUtc(addDaysIso(day, 1), 0, timeZone).toISOString(),
    }));
    return { start: startIso, end: segments[segments.length - 1]!.end, segments, occupiedDays: days };
  }
  const segments: Segment[] = [];
  for (const [index, day] of days.entries()) {
    const isFirst = index === 0;
    const isLast = index === days.length - 1;
    const hours = schedule.hoursOn(day);
    const segStart = isFirst ? new Date(startMs) : wallToUtc(day, hours?.open ?? 0, timeZone);
    if (isLast) {
      // Ending at or before opening time does not occupy that day.
      if (endMs <= segStart.getTime()) break;
      segments.push({ start: segStart.toISOString(), end: endIso });
      continue;
    }
    let segEnd = hours
      ? wallToUtc(day, hours.close, timeZone)
      : wallToUtc(addDaysIso(day, 1), 0, timeZone);
    if (segEnd.getTime() <= segStart.getTime()) segEnd = wallToUtc(addDaysIso(day, 1), 0, timeZone);
    segments.push({ start: segStart.toISOString(), end: segEnd.toISOString() });
  }
  return {
    start: startIso,
    end: segments[segments.length - 1]!.end,
    segments,
    occupiedDays: days.slice(0, segments.length),
  };
}

// ---- Reading saved bookings ------------------------------------------------------

type Spanning = {
  start: string;
  end: string;
  segments?: Segment[] | undefined;
  occupiedDays?: string[] | undefined;
};

/** The intervals a saved item holds; one `start → end` span when it has no segments. */
export function segmentsOf(item: Spanning): Segment[] {
  return item.segments && item.segments.length > 0
    ? item.segments
    : [{ start: item.start, end: item.end }];
}

/** Local days a saved item shows on, in order; derived from start → end when absent. */
export function occupiedDaysOf(item: Spanning, timeZone: string): string[] {
  if (item.occupiedDays && item.occupiedDays.length > 0) return item.occupiedDays;
  return daysCovered(segmentsOf(item), timeZone);
}

/** The segment of a saved item that falls on a local day, if any. */
export function segmentOn(item: Spanning, isoDate: string, timeZone: string): Segment | null {
  for (const segment of segmentsOf(item)) {
    const first = localDay(segment.start, timeZone);
    const last = localDay(new Date(new Date(segment.end).getTime() - 60_000).toISOString(), timeZone);
    if (first <= isoDate && isoDate <= last) return segment;
  }
  return null;
}

/** True when the item is drawn on more than one day. */
export function isMultiDay(item: Spanning, timeZone: string): boolean {
  return occupiedDaysOf(item, timeZone).length > 1;
}

/**
 * Groups sorted column indexes into contiguous runs, so a job that skips the weekend
 * becomes one bar Thu–Fri and another on Mon rather than a single bar across.
 */
export function contiguousRuns(cols: number[]): { startCol: number; endCol: number }[] {
  const runs: { startCol: number; endCol: number }[] = [];
  for (const col of cols) {
    const last = runs[runs.length - 1];
    if (last && col === last.endCol + 1) last.endCol = col;
    else runs.push({ startCol: col, endCol: col });
  }
  return runs;
}

/**
 * "Thu 24 – Mon 28 Sept · 3 working days" for a job over several days; null for a
 * one-day job so callers fall back to the ordinary duration.
 */
export function formatWorkingSpan(item: Spanning, timeZone: string): string | null {
  const days = occupiedDaysOf(item, timeZone);
  if (days.length < 2) return null;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const fmt = (isoDate: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(
      wallToUtc(isoDate, 12 * 60, timeZone),
    );
  const left = fmt(first, {
    weekday: "short",
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  });
  const right = fmt(last, { weekday: "short", day: "numeric", month: "short" });
  return `${left} – ${right} · ${days.length} working days`;
}

// ---- Zone arithmetic (no library: Intl only) ---------------------------------------

function continuous(startIso: string, endIso: string, timeZone: string): WorkingLayout {
  const segment = { start: startIso, end: endIso };
  return { start: startIso, end: endIso, segments: [segment], occupiedDays: daysCovered([segment], timeZone) };
}

function daysCovered(segments: Segment[], timeZone: string): string[] {
  const days: string[] = [];
  for (const segment of segments) {
    let cursor = localDay(segment.start, timeZone);
    const last = localDay(new Date(new Date(segment.end).getTime() - 60_000).toISOString(), timeZone);
    while (cursor <= last) {
      if (days[days.length - 1] !== cursor) days.push(cursor);
      cursor = addDaysIso(cursor, 1);
    }
  }
  return days;
}

function nextWorkingDay(fromDay: string, schedule: WorkingSchedule): string {
  let cursor = fromDay;
  for (let i = 0; i < MAX_SKIP_DAYS; i += 1) {
    cursor = addDaysIso(cursor, 1);
    if (schedule.hoursOn(cursor)) return cursor;
  }
  return addDaysIso(fromDay, 1);
}

/** `YYYY-MM-DD` of an instant in a zone. */
export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** Calendar-day arithmetic on `YYYY-MM-DD`, zone-free. */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD`. */
function isoWeekday(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Local wall-clock `minute` on `isoDate` in `timeZone` → UTC instant (minutes ≥ 1440 roll over). */
export function wallToUtc(isoDate: string, minute: number, timeZone: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, 0) + minute * 60_000;
  const offset = tzOffsetMinutes(guess, timeZone);
  let utc = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(utc, timeZone);
  if (offset2 !== offset) utc = guess - offset2 * 60_000;
  return new Date(utc);
}
