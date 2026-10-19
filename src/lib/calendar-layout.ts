/**
 * Pure layout maths for the calendar (design spec 19 Oct 2026). Nothing here
 * touches the DOM or the API so it can be unit-tested and shared by the desktop
 * grid, the phone views and the list.
 */

export type HourRange = { startHour: number; endHour: number };

export const DEFAULT_HOUR_RANGE: HourRange = { startHour: 7, endHour: 21 };

/** Minutes since local midnight for a `[start, end)` item already clipped to one day. */
export type MinuteSpan = { startMin: number; endMin: number };

/**
 * Spec §2.4: from the earlier of opening time or the first session, to the later of
 * closing time or the last session end, rounded out to whole hours. With no opening
 * hours and nothing booked it falls back to 07:00–21:00.
 */
export function visibleHourRange(
  items: readonly MinuteSpan[],
  opening: { openMinute: number; closeMinute: number } | null | undefined,
  fallback: HourRange = DEFAULT_HOUR_RANGE,
): HourRange {
  let startMin = opening ? opening.openMinute : fallback.startHour * 60;
  let endMin = opening ? opening.closeMinute : fallback.endHour * 60;
  for (const it of items) {
    if (it.startMin < startMin) startMin = it.startMin;
    if (it.endMin > endMin) endMin = it.endMin;
  }
  const startHour = Math.max(0, Math.floor(startMin / 60));
  const endHour = Math.min(24, Math.ceil(endMin / 60));
  if (endHour - startHour < 1) return fallback;
  return { startHour, endHour };
}

/** Hour height that fits `range` into `availablePx`, never below `minPx` (spec: 40). */
export function fitHourHeight(range: HourRange, availablePx: number, minPx = 40): number {
  const hours = Math.max(1, range.endHour - range.startHour);
  if (!Number.isFinite(availablePx) || availablePx <= 0) return minPx;
  return Math.max(minPx, Math.floor(availablePx / hours));
}

export type Placed<T> = { item: T; col: number; cols: number };
export type Overflow = {
  startMin: number;
  endMin: number;
  count: number;
  col: number;
  cols: number;
};

/**
 * Spec §2.5: items that overlap in a column share its width equally. Items are
 * clustered by transitive overlap; inside a cluster each takes the first free
 * column. A cluster wider than `maxCols` shows the first `maxCols − 1` columns and
 * one "+N" block in the last column covering the hidden items' span.
 */
export function layoutOverlaps<T extends MinuteSpan & { id: string }>(
  items: readonly T[],
  maxCols = 3,
): { placed: Placed<T>[]; overflow: Overflow[] } {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const placed: Placed<T>[] = [];
  const overflow: Overflow[] = [];
  let cluster: { item: T; col: number }[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];

  const flush = () => {
    if (cluster.length === 0) return;
    const cols = colEnds.length;
    if (cols <= maxCols) {
      for (const c of cluster) placed.push({ item: c.item, col: c.col, cols });
    } else {
      const shownCols = maxCols - 1;
      const hidden = cluster.filter((c) => c.col >= shownCols);
      for (const c of cluster) {
        if (c.col < shownCols) placed.push({ item: c.item, col: c.col, cols: maxCols });
      }
      overflow.push({
        startMin: Math.min(...hidden.map((c) => c.item.startMin)),
        endMin: Math.max(...hidden.map((c) => c.item.endMin)),
        count: hidden.length,
        col: shownCols,
        cols: maxCols,
      });
    }
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(item.endMin);
    } else {
      colEnds[col] = item.endMin;
    }
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return { placed, overflow };
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Spec §2.3 range title. Week: "19 to 25 October"; across months "28 Sept to 4 Oct";
 * across years "29 Dec 2026 to 4 Jan 2027". Month: "October 2026". Day: "Monday 19 October".
 */
export function rangeTitle(
  view: "day" | "week" | "month" | "list",
  first: Date,
  last: Date,
): string {
  if (view === "month") return `${LONG_MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  if (view === "day") {
    const weekday = first.toLocaleDateString("en-GB", { weekday: "long" });
    return `${weekday} ${first.getDate()} ${LONG_MONTHS[first.getMonth()]}`;
  }
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} ${first.getFullYear()} to ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} to ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]}`;
  }
  return `${first.getDate()} to ${last.getDate()} ${LONG_MONTHS[first.getMonth()]}`;
}

/** "9 sessions · £486 expected" (spec §2.3). `money` formats minor units compactly. */
export function rangeSummary(
  sessions: number,
  expectedMinor: number,
  noun: string,
  money: (minor: number) => string,
): string {
  const label = `${sessions} ${sessions === 1 ? noun : `${noun}s`}`;
  return `${label} · ${money(expectedMinor)} expected`;
}

/** Spec §3.2 phone value line: "£54 today · 3 sessions". */
export function valueLine(
  view: "day" | "week" | "month" | "list",
  sessions: number,
  noun: string,
): string {
  const period = view === "day" ? "today" : view === "month" ? "this month" : "this week";
  return `${period} · ${sessions} ${sessions === 1 ? noun : `${noun}s`}`;
}

/** First word of a name, for the dense phone chips. */
export function firstName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "1 hr", "1 hr 30 min", "30 min" (spec §5.1 duration under the time). */
export function shortDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** The list view's day heading: "Today, Mon 19" / "Tomorrow, Tue 20" / "Wed 21". */
export function listDayHeading(day: Date, today: Date): string {
  const label = `${day.toLocaleDateString("en-GB", { weekday: "short" })} ${day.getDate()}`;
  const diff = Math.round(
    (new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000,
  );
  if (diff === 0) return `Today, ${label}`;
  if (diff === 1) return `Tomorrow, ${label}`;
  if (diff === -1) return `Yesterday, ${label}`;
  return label;
}

/** "3 sessions", "1 session, 1 event" (spec §4.5). */
export function dayCountLabel(sessions: number, events: number, noun: string): string {
  const parts: string[] = [];
  if (sessions > 0 || events === 0) {
    parts.push(`${sessions} ${sessions === 1 ? noun : `${noun}s`}`);
  }
  if (events > 0) parts.push(`${events} ${events === 1 ? "event" : "events"}`);
  return parts.join(", ");
}
