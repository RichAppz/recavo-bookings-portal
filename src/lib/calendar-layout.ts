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

/**
 * Spec §3.2 phone value line: "£54 today · 3 sessions". Once the person has paged
 * away from today the period says where they are ("tomorrow", "next week", "on
 * Tue 3 Nov", "in November") instead of claiming it is still today.
 */
export function valueLine(
  view: "day" | "week" | "month" | "list",
  sessions: number,
  noun: string,
  period?: string,
): string {
  const word = period ?? (view === "day" ? "today" : view === "month" ? "this month" : "this week");
  return `${word} · ${sessions} ${sessions === 1 ? noun : `${noun}s`}`;
}

const dayNumber = (d: Date) =>
  Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** The period word for `valueLine`, relative to `today`. `first`/`last` bound the visible days. */
export function periodWord(
  view: "day" | "week" | "month" | "list",
  anchor: Date,
  first: Date,
  last: Date,
  today: Date,
): string {
  const shortDate = (d: Date) =>
    `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  if (view === "day") {
    const diff = dayNumber(anchor) - dayNumber(today);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff === -1) return "yesterday";
    return `on ${shortDate(anchor)}`;
  }
  if (view === "month") {
    const same =
      anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth();
    if (same) return "this month";
    return anchor.getFullYear() === today.getFullYear()
      ? `in ${LONG_MONTHS[anchor.getMonth()]}`
      : `in ${LONG_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  const t = dayNumber(today);
  const from = dayNumber(first);
  const to = dayNumber(last);
  if (t >= from && t <= to) return "this week";
  if (from - t > 0 && from - t <= 7) return "next week";
  if (t - to > 0 && t - to <= 7) return "last week";
  return `w/c ${shortDate(first)}`;
}

/**
 * True when every day of the visible period is before `today`. The "nothing
 * booked" prompt (add a session, share the booking page) is only useful for
 * periods you can still fill, so it is hidden for past ones.
 */
export function periodInPast(
  view: "day" | "week" | "month" | "list",
  anchor: Date,
  last: Date,
  today: Date,
): boolean {
  if (view === "day") return dayNumber(anchor) < dayNumber(today);
  if (view === "month") {
    return (
      anchor.getFullYear() < today.getFullYear() ||
      (anchor.getFullYear() === today.getFullYear() && anchor.getMonth() < today.getMonth())
    );
  }
  return dayNumber(last) < dayNumber(today);
}

const addLocalDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const mondayOf = (date: Date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * The days a view draws around its anchor: the one day (from local midnight, since
 * the anchor carries a time of day), the Monday-first week, or six Monday-first
 * weeks from the Monday on or before the 1st for Month. List shows a week.
 */
export function periodDays(view: "day" | "week" | "month" | "list", anchor: Date): Date[] {
  if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    return [start];
  }
  if (view === "month") {
    const first = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => addLocalDays(first, i));
  }
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addLocalDays(monday, i));
}

/**
 * The anchor one page on (`dir` 1) or back (−1) in the view's own unit: a day, a
 * week, or a month (landing on the 1st so a 31st never skips a short month).
 */
export function shiftAnchor(
  view: "day" | "week" | "month" | "list",
  anchor: Date,
  dir: number,
): Date {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addLocalDays(anchor, view === "day" ? dir : dir * 7);
}

/**
 * One piece of a multi-day item as drawn in a month grid: the columns it covers
 * within one week row, and whether each end is a real start/end of the job (drawn
 * rounded) or a cut where it carries on into the neighbouring row (drawn square).
 */
export type WeekSpan = {
  /** Row index into the grid (0-based, rows of `cols` days). */
  week: number;
  /** First and last column (0-based) covered within that row. */
  startCol: number;
  endCol: number;
  /** False when the day before `startCol` is also occupied, i.e. the bar is cut at the row edge. */
  roundStart: boolean;
  /** False when the day after `endCol` is also occupied. */
  roundEnd: boolean;
};

const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Split the days an item occupies into the bars a month grid draws for it: one per
 * run of consecutive days within a week row. A job that spans the weekend boundary
 * becomes a bar on each row, square where they meet; a job that *skips* days (Thu,
 * Fri, then Mon) becomes separate rounded bars, since each really does start and
 * end there. Days outside `gridDays` are ignored but still decide the rounding, so
 * a job that began before the visible month arrives already cut.
 */
export function weekSpans(
  occupiedDays: readonly string[],
  gridDays: readonly string[],
  cols = 7,
): WeekSpan[] {
  const index = new Map(gridDays.map((iso, i) => [iso, i] as const));
  const occupied = new Set(occupiedDays);
  const sorted = [...occupied].sort();
  const spans: (WeekSpan & { lastIso: string })[] = [];
  for (const iso of sorted) {
    const i = index.get(iso);
    if (i === undefined) continue;
    const week = Math.floor(i / cols);
    const col = i % cols;
    const current = spans[spans.length - 1];
    if (current && current.week === week && current.endCol === col - 1) {
      current.endCol = col;
      current.lastIso = iso;
    } else {
      spans.push({
        week,
        startCol: col,
        endCol: col,
        roundStart: !occupied.has(shiftIso(iso, -1)),
        roundEnd: true,
        lastIso: iso,
      });
    }
  }
  return spans.map(({ lastIso, ...span }) => ({
    ...span,
    roundEnd: !occupied.has(shiftIso(lastIso, 1)),
  }));
}

/**
 * Stack one row's bars so none overlap: bars are taken left to right (longer first
 * when they start together, then in the order given) and each drops into the
 * topmost lane that is free across every column it covers. Returns the bars with
 * their lane; `laneCount` says how tall the row's bar area needs to be.
 */
export function assignLanes<T extends { startCol: number; endCol: number }>(
  spans: readonly T[],
): { placed: (T & { lane: number })[]; laneCount: number } {
  const order = spans
    .map((span, i) => ({ span, i }))
    .sort(
      (a, b) =>
        a.span.startCol - b.span.startCol ||
        b.span.endCol - b.span.startCol - (a.span.endCol - a.span.startCol) ||
        a.i - b.i,
    );
  // laneFree[lane] = first column still free in that lane.
  const laneFree: number[] = [];
  const placed = order.map(({ span }) => {
    let lane = laneFree.findIndex((free) => free <= span.startCol);
    if (lane === -1) lane = laneFree.length;
    laneFree[lane] = span.endCol + 1;
    return { ...span, lane };
  });
  return { placed, laneCount: laneFree.length };
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
