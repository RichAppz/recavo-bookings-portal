/**
 * Pure rules for the Overview (dashboard home) redesign, spec 19 Oct 2026: the
 * greeting, the Up next countdown, the one pill per Today row, the now line, the
 * Needs your attention list, the period windows and their comparisons, trend
 * buckets, the Money in / Attendance splits and the per-person page settings.
 * No React, no API, so every rule has a unit test.
 */
import type { Booking, Dashboard } from "./api/types.ts";
import { bookingSettlement } from "./booking-payment.ts";
import { unmarkedPast } from "./bookings-list.ts";
import { takingsSummary } from "./takings.ts";
import { reportRange, type IsoRange } from "./report-range.ts";
import { addDaysIso, localDay } from "./working-days.ts";

/* ---------------- Greeting ---------------- */

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening (spec §2.1). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Hour of the day (0–23) at `now` in `timeZone`. */
export function hourIn(timeZone: string, now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone })
    .formatToParts(now)
    .find((p) => p.type === "hour")?.value;
  return Number(h ?? 0) % 24;
}

/** "Rich" from "Rich Mucha"; null when there is no usable name. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/** "Job" → "jobs", "Session" → "sessions"; `count` picks singular/plural. */
export function nounFor(noun: string, count: number): string {
  const lower = noun.trim().toLowerCase() || "booking";
  if (count === 1) return lower;
  return lower.endsWith("s") ? lower : `${lower}s`;
}

/* ---------------- Up next ---------------- */

const hhmm = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));

/**
 * The Up next label, in sentence case (the card shows it in small caps):
 * "In 5 min", "In 1 hr 20 min", "On now · ends 12:00", "Tomorrow 08:00", "Wed 08:00".
 */
export function countdownLabel(
  next: { start: string; end: string; allDay?: boolean },
  now: Date,
  timeZone: string,
): string {
  const start = new Date(next.start).getTime();
  const end = new Date(next.end).getTime();
  const t = now.getTime();
  if (start <= t && t < end) {
    return next.allDay ? "On now · all day" : `On now · ends ${hhmm(next.end, timeZone)}`;
  }
  const today = localDay(now.toISOString(), timeZone);
  const day = localDay(next.start, timeZone);
  if (day === today && !next.allDay) {
    const mins = Math.max(1, Math.ceil((start - t) / 60_000));
    if (mins < 60) return `In ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `In ${h} hr` : `In ${h} hr ${m} min`;
  }
  const when = next.allDay ? "· all day" : hhmm(next.start, timeZone);
  if (day === today) return `Today ${when}`;
  if (day === addDaysIso(today, 1)) return `Tomorrow ${when}`;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(
    new Date(next.start),
  );
  return `${weekday} ${when}`;
}

const CLOSED = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
  "draft",
]);

export const isLiveBooking = (b: Pick<Booking, "status">) => !CLOSED.has(b.status);

/**
 * The session the Up next card is about: one in progress, else the first one still
 * to start. Cancelled, no-show and already-marked sessions are skipped.
 */
export function pickUpNext<
  T extends Pick<Booking, "start" | "end" | "status" | "attendanceStatus">,
>(bookings: readonly T[], now: Date): T | null {
  const t = now.getTime();
  const live = bookings
    .filter(
      (b) =>
        isLiveBooking(b) &&
        b.status !== "no_show" &&
        b.attendanceStatus === "unknown" &&
        new Date(b.end).getTime() > t,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  return live.find((b) => new Date(b.start).getTime() <= t) ?? live[0] ?? null;
}

/* ---------------- Money due ---------------- */

/** Money is owed and somebody should collect it (held / awaiting payment count too). */
export function moneyDue(b: Booking): boolean {
  if (!isLiveBooking(b)) return false;
  if (b.status === "held" || b.status === "awaiting_payment") return true;
  const s = bookingSettlement(b);
  return s.state === "unpaid" || s.state === "part_paid" || s.state === "deposit_paid";
}

/** "Paid", "£25 due", "Deposit paid" — the payment words on the Up next line. */
export function paymentPhrase(b: Booking, money: (minor: number) => string): string | null {
  const s = bookingSettlement(b);
  switch (s.state) {
    case "paid":
      return "Paid";
    case "deposit_paid":
      return "Deposit paid";
    case "unpaid":
    case "part_paid":
      return `${money(s.outstandingMinor)} due`;
    case "credit":
      return "Package credit";
    default:
      return null;
  }
}

const SEVEN_DAYS = 7 * 86_400_000;

/**
 * Payments to collect (spec §2.5): money due on a session in the next 7 days, or on
 * one that has already happened. Oldest first, so the overdue ones lead.
 */
export function paymentsToCollect(bookings: readonly Booking[], now: Date): Booking[] {
  const t = now.getTime();
  return bookings
    .filter((b) => moneyDue(b) && new Date(b.start).getTime() - t <= SEVEN_DAYS)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Finished sessions nobody has marked attended or no-show, oldest first. */
export function attendanceToMark(bookings: readonly Booking[], now: Date): Booking[] {
  return bookings
    .filter((b) => unmarkedPast(b, now))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** "today", "tomorrow", "Thu" (this week), else "12 Oct". */
export function shortDayLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return "today";
  if (isoDate === addDaysIso(todayIso, 1)) return "tomorrow";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  if (isoDate > todayIso && isoDate <= addDaysIso(todayIso, 6)) {
    return date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  }
  return `${d} ${SHORT_MONTHS[m! - 1]}`;
}

/* ---------------- Today ---------------- */

export type TodayPillKey =
  "mark_attendance" | "unpaid" | "no_show" | "attended" | "upcoming" | "cancelled";

/**
 * One pill per Today row. Priority when several apply (spec §1.2):
 * Mark attendance › Unpaid › No-show › Attended › Upcoming. "Mark attendance" is the
 * same state the Bookings list calls "Not marked done" (`unmarkedPast`).
 */
export function todayPill(b: Booking, now: Date): TodayPillKey {
  if (!isLiveBooking(b) && b.status !== "expired" && b.status !== "draft") return "cancelled";
  if (unmarkedPast(b, now)) return "mark_attendance";
  if (moneyDue(b)) return "unpaid";
  if (b.status === "no_show" || b.attendanceStatus === "no_show") return "no_show";
  if (b.attendanceStatus === "attended" || b.status === "completed") return "attended";
  return "upcoming";
}

export function todayPillLabel(key: TodayPillKey, opts: { detailer: boolean }): string {
  switch (key) {
    case "mark_attendance":
      return opts.detailer ? "Mark done" : "Mark attendance";
    case "unpaid":
      return "Unpaid";
    case "no_show":
      return "No-show";
    case "attended":
      return "Attended";
    case "upcoming":
      return "Upcoming";
    case "cancelled":
      return "Cancelled";
  }
}

/** Where the now line goes: after the last row that has started (0 = above the first). */
export function nowLineIndex(starts: readonly string[], now: Date): number {
  const t = now.getTime();
  let index = 0;
  starts.forEach((s, i) => {
    if (new Date(s).getTime() <= t) index = i + 1;
  });
  return index;
}

/**
 * The phone's short Today list (spec §3.5): the last finished row, then the next
 * three that haven't finished. A row still running (an all-day job) counts as one
 * of the three even when it started before the last finished one. Returns indexes
 * into the full list, in order.
 */
export function phoneTodayWindow(
  rows: readonly { start: string; end: string }[],
  now: Date,
  ahead = 3,
): number[] {
  const t = now.getTime();
  const finished = (i: number) => new Date(rows[i]!.end).getTime() <= t;
  let lastDone = -1;
  rows.forEach((_, i) => {
    if (finished(i)) lastDone = i;
  });
  const open = rows
    .map((_, i) => i)
    .filter((i) => !finished(i))
    .slice(0, ahead);
  return [...(lastDone >= 0 ? [lastDone] : []), ...open].sort((a, b) => a - b);
}

/* ---------------- Needs your attention ---------------- */

export type AttentionKind =
  "payments" | "attendance" | "package_requests" | "add_ons" | "waitlist" | "sms_low" | "setup";

export type AttentionTone = "red" | "amber" | "blue" | "mint" | "grey";

export type AttentionItem = {
  kind: AttentionKind;
  count: number;
  title: string;
  detail: string;
  tone: AttentionTone;
};

export type AttentionInput = {
  detailer: boolean;
  /** "Session" / "Job" — the business's own word. */
  bookingNoun: string;
  payments?: { count: number; who: string[]; totalLabel: string | null };
  attendance?: { count: number; single: string | null };
  packageRequests?: { count: number; who: string[] };
  addOns?: { count: number };
  /** `couldTakeFreed`: how many waiting could take a freed slot, while a banner is up. */
  waitlist?: { count: number; couldTakeFreed?: number };
  sms?: { balance: number; low: boolean };
  setup?: { left: number; next: string | null };
};

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Live, counted items in urgency order; nothing with a zero count is listed. */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const { payments, attendance, packageRequests, addOns, waitlist, sms, setup } = input;
  if (payments && payments.count > 0) {
    out.push({
      kind: "payments",
      count: payments.count,
      title: `${payments.count} ${plural(payments.count, "payment")} to collect`,
      detail: [...payments.who.slice(0, 2), payments.totalLabel].filter(Boolean).join(" · "),
      tone: "red",
    });
  }
  if (attendance && attendance.count > 0) {
    out.push({
      kind: "attendance",
      count: attendance.count,
      title: input.detailer
        ? `Mark ${plural(attendance.count, "job", "jobs")} done`
        : "Mark attendance",
      detail:
        attendance.count === 1 && attendance.single
          ? attendance.single
          : `${attendance.count} ${nounFor(input.bookingNoun, attendance.count)}`,
      tone: "amber",
    });
  }
  if (packageRequests && packageRequests.count > 0) {
    out.push({
      kind: "package_requests",
      count: packageRequests.count,
      title: `${packageRequests.count} package ${plural(packageRequests.count, "request")}`,
      detail: packageRequests.who.slice(0, 2).join(" · ") || "Waiting for you to confirm",
      tone: "amber",
    });
  }
  if (addOns && addOns.count > 0) {
    out.push({
      kind: "add_ons",
      count: addOns.count,
      title: `${addOns.count} add-on ${plural(addOns.count, "request")}`,
      detail: "Clients asked for an add-on from their offer email",
      tone: "blue",
    });
  }
  if (waitlist && (waitlist.couldTakeFreed ?? 0) > 0) {
    const n = waitlist.couldTakeFreed!;
    out.push({
      kind: "waitlist",
      count: n,
      title: `${n} waiting could take a freed slot`,
      detail: "A cancellation freed time",
      tone: "mint",
    });
  } else if (waitlist && waitlist.count > 0) {
    out.push({
      kind: "waitlist",
      count: waitlist.count,
      title: `${waitlist.count} ${plural(waitlist.count, "client")} on the waitlist`,
      detail: "Waiting for a slot",
      tone: "blue",
    });
  }
  if (sms && sms.low) {
    out.push({
      kind: "sms_low",
      count: 1,
      title:
        sms.balance <= 0 ? "No texts left" : `${sms.balance} ${plural(sms.balance, "text")} left`,
      detail: "Buy more so reminders keep going",
      tone: "amber",
    });
  }
  if (setup && setup.left > 0) {
    out.push({
      kind: "setup",
      count: setup.left,
      title: `Finish setting up · ${setup.left} left`,
      detail: setup.next ?? "A few steps to go",
      tone: "grey",
    });
  }
  return out;
}

/** The phone strip's one-line summary: "2 payments · attendance · 1 package". */
export function attentionSummary(items: readonly AttentionItem[]): string {
  return items
    .map((i) => {
      switch (i.kind) {
        case "payments":
          return `${i.count} ${plural(i.count, "payment")}`;
        case "attendance":
          return "attendance";
        case "package_requests":
          return `${i.count} ${plural(i.count, "package")}`;
        case "add_ons":
          return `${i.count} ${plural(i.count, "add-on")}`;
        case "waitlist":
          return `${i.count} waiting`;
        case "sms_low":
          return "texts";
        case "setup":
          return "set-up";
      }
    })
    .join(" · ");
}

/** Total for the amber count pill: each item counts as its own number of things to do. */
export function attentionTotal(items: readonly AttentionItem[]): number {
  return items.reduce((sum, i) => sum + i.count, 0);
}

/* ---------------- Periods ---------------- */

export type Period = "week" | "month" | "year" | "7d" | "30d" | "all";
export const PERIODS: readonly Period[] = ["week", "month", "year", "7d", "30d", "all"];
/** The segmented control; the rest sit in its "More" menu. */
export const MAIN_PERIODS: readonly Period[] = ["week", "month", "year"];

export const PERIOD_LABELS: Record<Period, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

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

export type PeriodWindow = {
  period: Period;
  /** Inclusive local dates of the period so far; absent for all time. */
  fromDate?: string;
  toDate: string;
  /** Last day of the calendar period (the month's 31st), for listing its sessions. */
  endDate?: string;
  /** API window `[from, to)` for the period so far; null for all time. */
  range: IsoRange | null;
  /** The same days of the previous period; null when there is nothing to compare. */
  previous: IsoRange | null;
  /** "How October is going". */
  title: string;
  /** Phone heading: "This month". */
  heading: string;
  /** "vs Sept" on a tile. */
  compareShort: string | null;
  /** "on September" for screen readers. */
  compareLong: string | null;
  /** "this month" inside sentences ("No payments yet this month"). */
  inPhrase: string;
};

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Monday of the week containing `isoDate`. */
export function weekStart(isoDate: string): string {
  const [y, m, d] = parts(isoDate);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysIso(isoDate, -((dow + 6) % 7));
}

/**
 * Calendar period to date in the business's zone, and the same days of the one
 * before (spec §2.7: Month = 1 Oct to today vs 1 to 19 Sept).
 */
export function periodWindow(period: Period, timeZone: string, now: Date): PeriodWindow {
  const today = localDay(now.toISOString(), timeZone);
  const [y, m, d] = parts(today);
  const win = (fromDate: string, prevFrom: string | null, prevTo: string | null) => ({
    fromDate,
    toDate: today,
    range: reportRange(fromDate, today, timeZone),
    previous: prevFrom && prevTo ? reportRange(prevFrom, prevTo, timeZone) : null,
  });
  switch (period) {
    case "month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const prevDay = Math.min(d, daysInMonth(py, pm));
      return {
        period,
        ...win(isoOf(y, m, 1), isoOf(py, pm, 1), isoOf(py, pm, prevDay)),
        endDate: isoOf(y, m, daysInMonth(y, m)),
        title: `How ${LONG_MONTHS[m - 1]} is going`,
        heading: "This month",
        compareShort: `vs ${SHORT_MONTHS[pm - 1]}`,
        compareLong: `on ${LONG_MONTHS[pm - 1]}`,
        inPhrase: "this month",
      };
    }
    case "week": {
      const monday = weekStart(today);
      return {
        period,
        ...win(monday, addDaysIso(monday, -7), addDaysIso(today, -7)),
        endDate: addDaysIso(monday, 6),
        title: "How this week is going",
        heading: "This week",
        compareShort: "vs last week",
        compareLong: "on last week",
        inPhrase: "this week",
      };
    }
    case "year": {
      const prevDay = Math.min(d, daysInMonth(y - 1, m));
      return {
        period,
        ...win(isoOf(y, 1, 1), isoOf(y - 1, 1, 1), isoOf(y - 1, m, prevDay)),
        endDate: isoOf(y, 12, 31),
        title: `How ${y} is going`,
        heading: "This year",
        compareShort: `vs ${y - 1}`,
        compareLong: `on ${y - 1}`,
        inPhrase: "this year",
      };
    }
    case "7d":
    case "30d": {
      const days = period === "7d" ? 7 : 30;
      const from = addDaysIso(today, -(days - 1));
      return {
        period,
        ...win(from, addDaysIso(from, -days), addDaysIso(from, -1)),
        endDate: today,
        title: `How the last ${days} days went`,
        heading: `Last ${days} days`,
        compareShort: `vs previous ${days} days`,
        compareLong: `on the previous ${days} days`,
        inPhrase: `in the last ${days} days`,
      };
    }
    case "all":
      return {
        period,
        toDate: today,
        range: null,
        previous: null,
        title: "How it's gone so far",
        heading: "All time",
        compareShort: null,
        compareLong: null,
        inPhrase: "yet",
      };
  }
}

/**
 * Twelve trend buckets ending today (spec §2.7): a day each for a week, 2–3 days each
 * across the last 30 for a month, a calendar month each for a year (and all time).
 */
export function trendBuckets(
  period: Period,
  timeZone: string,
  now: Date,
): { fromDate: string; toDate: string }[] {
  const today = localDay(now.toISOString(), timeZone);
  if (period === "week" || period === "7d") {
    return Array.from({ length: 12 }, (_, i) => {
      const day = addDaysIso(today, i - 11);
      return { fromDate: day, toDate: day };
    });
  }
  if (period === "month" || period === "30d") {
    const first = addDaysIso(today, -29);
    return Array.from({ length: 12 }, (_, i) => ({
      fromDate: addDaysIso(first, Math.floor((i * 30) / 12)),
      toDate: addDaysIso(first, Math.floor(((i + 1) * 30) / 12) - 1),
    }));
  }
  const [y, m] = parts(today);
  return Array.from({ length: 12 }, (_, i) => {
    const offset = i - 11;
    const total = y * 12 + (m - 1) + offset;
    const by = Math.floor(total / 12);
    const bm = (total % 12) + 1;
    return {
      fromDate: isoOf(by, bm, 1),
      toDate: offset === 0 ? today : isoOf(by, bm, daysInMonth(by, bm)),
    };
  });
}

/* ---------------- Deltas ---------------- */

export type Delta = { tone: "up" | "down" | "flat"; label: string; srLabel: string };

/**
 * Relative change against the previous period. Hidden (null) when there was nothing
 * to compare with; under 1% either way reads "No change".
 */
export function percentDelta(current: number, previous: number, compareLong: string): Delta | null {
  if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(current)) return null;
  const change = ((current - previous) / previous) * 100;
  return deltaFrom(change, "%", "percent", compareLong);
}

/** Change in percentage points between two rates (0–1); null when either is unknown. */
export function pointsDelta(
  current: number | null,
  previous: number | null,
  compareLong: string,
): Delta | null {
  if (current === null || previous === null) return null;
  return deltaFrom((current - previous) * 100, " pts", "percentage points", compareLong);
}

function deltaFrom(change: number, unit: string, spoken: string, compareLong: string): Delta {
  if (Math.abs(change) < 1) {
    return { tone: "flat", label: "No change", srLabel: `No change ${compareLong}` };
  }
  const n = Math.round(Math.abs(change));
  return change > 0
    ? { tone: "up", label: `↑ ${n}${unit}`, srLabel: `Up ${n} ${spoken} ${compareLong}` }
    : { tone: "down", label: `↓ ${n}${unit}`, srLabel: `Down ${n} ${spoken} ${compareLong}` };
}

/** True once the previous period had anything in it; a brand-new business shows no pills. */
export function hasHistory(previous: Pick<Dashboard, "bookings" | "revenue"> | undefined): boolean {
  if (!previous) return false;
  return previous.bookings.count > 0 || previous.revenue.grossMinor > 0;
}

/* ---------------- Headline figures ---------------- */

/** Attended ÷ sessions with an outcome (attended + no-show); null before any are marked. */
export function attendedRate(
  a: Pick<Dashboard["attendance"], "attended" | "noShow">,
): number | null {
  const ended = a.attended + a.noShow;
  return ended > 0 ? a.attended / ended : null;
}

export function placesRate(o: Pick<Dashboard["occupancy"], "seats" | "capacity">): number | null {
  return o.capacity > 0 ? o.seats / o.capacity : null;
}

/** "92%" — whole percent, for tiles. */
export function percentLabel(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/* ---------------- Splits ---------------- */

export type SplitColour = "mint" | "blue" | "amber" | "purple" | "grey";

export type MoneyRow = {
  method: string;
  label: string;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  count: number;
  share: number;
  colour: SplitColour;
};

const METHOD_COLOURS: Record<string, SplitColour> = {
  card: "mint",
  card_manual: "mint",
  card_online: "mint",
  cash: "blue",
  bank_transfer: "amber",
};

/** Money in rows (spec §2.8): card, cash and bank transfer first; £0 methods left off. */
export function moneySplit(revenue: Dashboard["revenue"]): MoneyRow[] {
  const rows = takingsSummary(revenue).filter((r) => r.grossMinor > 0);
  let spare = 0;
  return rows.map((r) => ({
    ...r,
    label: r.method === "card_manual" || r.method === "card_online" ? "Card" : r.label,
    colour: METHOD_COLOURS[r.method] ?? (spare++ === 0 ? "purple" : "grey"),
  }));
}

export type AttendanceKey = "attended" | "to_come" | "no_show" | "cancelled";
export type AttendanceRow = { key: AttendanceKey; count: number; share: number };

/**
 * Attendance rows (spec §2.9). "Still to come" is what was booked in the period with
 * no outcome yet, so it also holds finished sessions nobody has marked.
 */
export function attendanceSplit(input: {
  booked: number;
  attended: number;
  noShow: number;
  cancelled: number;
}): { total: number; rows: AttendanceRow[] } {
  const toCome = Math.max(0, input.booked - input.attended - input.noShow - input.cancelled);
  const counts: [AttendanceKey, number][] = [
    ["attended", input.attended],
    ["to_come", toCome],
    ["no_show", input.noShow],
    ["cancelled", input.cancelled],
  ];
  const total = counts.reduce((s, [, n]) => s + n, 0);
  return {
    total,
    rows: counts
      .filter(([, n]) => n > 0)
      .map(([key, count]) => ({ key, count, share: total > 0 ? count / total : 0 })),
  };
}

/** "Tuesday": the weekday with the most sessions; null with none. Ties go to the earlier day. */
export function busiestWeekday(localDates: readonly string[]): string | null {
  if (localDates.length === 0) return null;
  const counts = new Array<number>(7).fill(0);
  for (const iso of localDates) {
    const [y, m, d] = parts(iso);
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    counts[dow] = (counts[dow] ?? 0) + 1;
  }
  const best = counts.indexOf(Math.max(...counts));
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][best]!;
}

/* ---------------- Settings saved per person ---------------- */

export type OverviewCard =
  "up_next" | "today" | "attention" | "quick" | "headline" | "money" | "attendance";

export const OVERVIEW_CARDS: readonly OverviewCard[] = [
  "up_next",
  "today",
  "attention",
  "quick",
  "headline",
  "money",
  "attendance",
];

/** Phone order (spec §3): Up next, attention strip, Today, numbers, Money, Attendance, actions. */
export const PHONE_CARD_ORDER: readonly OverviewCard[] = [
  "up_next",
  "attention",
  "today",
  "headline",
  "money",
  "attendance",
  "quick",
];

export const LEFT_COLUMN: readonly OverviewCard[] = ["up_next", "today"];
export const RIGHT_COLUMN: readonly OverviewCard[] = ["attention", "quick"];
export const PERFORMANCE_CARDS: readonly OverviewCard[] = ["headline", "money", "attendance"];

export type QuickActionKey =
  | "add_booking"
  | "group"
  | "add_event"
  | "add_client"
  | "add_waitlist"
  | "sell_package"
  | "send_message"
  | "block_time"
  | "copy_link";

export const QUICK_ACTIONS: readonly QuickActionKey[] = [
  "add_booking",
  "group",
  "add_event",
  "add_client",
  "add_waitlist",
  "sell_package",
  "send_message",
  "block_time",
  "copy_link",
];

export type OverviewPrefs = {
  period: Period;
  hideAmounts: boolean;
  order: OverviewCard[];
  hidden: OverviewCard[];
  quickOrder: QuickActionKey[];
  quickHidden: QuickActionKey[];
  /** The person has reordered the cards, so the phone follows their order too. */
  reordered: boolean;
};

export const DEFAULT_PREFS: OverviewPrefs = {
  period: "month",
  hideAmounts: false,
  order: [...OVERVIEW_CARDS],
  hidden: [],
  quickOrder: [...QUICK_ACTIONS],
  quickHidden: [],
  reordered: false,
};

function keysFrom<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    if (allowed.includes(v as T) && !out.includes(v as T)) out.push(v as T);
  }
  return out;
}

/** A complete order: what was saved, then anything new appended in its default place. */
function fullOrder<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const saved = keysFrom(value, allowed);
  return [...saved, ...allowed.filter((k) => !saved.includes(k))];
}

/** Reads a stored settings document; anything unknown or malformed falls back to defaults. */
export function parseOverviewPrefs(value: unknown): OverviewPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFS };
  const v = value as Record<string, unknown>;
  return {
    period: PERIODS.includes(v.period as Period) ? (v.period as Period) : DEFAULT_PREFS.period,
    hideAmounts: v.hideAmounts === true,
    order: fullOrder(v.order, OVERVIEW_CARDS),
    hidden: keysFrom(v.hidden, OVERVIEW_CARDS),
    quickOrder: fullOrder(v.quickOrder, QUICK_ACTIONS),
    quickHidden: keysFrom(v.quickHidden, QUICK_ACTIONS),
    reordered: v.reordered === true,
  };
}

/** The old eye menu's hidden cards (kept per business on the device) in the new names. */
export function legacyHiddenCards(value: unknown): OverviewCard[] {
  const map: Record<string, OverviewCard> = {
    stats: "headline",
    money: "money",
    attendance: "attendance",
    tasks: "attention",
    quick: "quick",
  };
  if (!Array.isArray(value)) return [];
  return keysFrom(
    value.map((k) => (typeof k === "string" ? map[k] : undefined)),
    OVERVIEW_CARDS,
  );
}

/** Moves `item` one place up or down; unchanged at either end or when absent. */
export function moveItem<T>(list: readonly T[], item: T, dir: "up" | "down"): T[] {
  const i = list.indexOf(item);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Moves `item` to where `target` is (drag and drop). */
export function moveTo<T>(list: readonly T[], item: T, target: T): T[] {
  const from = list.indexOf(item);
  const to = list.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...list];
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** The cards of one group (a column, or the performance section) in the person's order. */
export function groupOrder(
  order: readonly OverviewCard[],
  group: readonly OverviewCard[],
): OverviewCard[] {
  return order.filter((c) => group.includes(c));
}

/** Phone order: the spec's until the person reorders, then theirs. */
export function phoneOrder(prefs: Pick<OverviewPrefs, "order" | "reordered">): OverviewCard[] {
  return prefs.reordered ? [...prefs.order] : [...PHONE_CARD_ORDER];
}

/** Settings live per device, per business and per person (the API document is allow-listed). */
export function prefsStorageKey(businessId: string, userId: string): string {
  return `recavo.overview.prefs.${businessId}.${userId}`;
}

/** "£•••" in place of an amount while amounts are hidden. */
export function maskedMoney(formattedZero: string): string {
  const symbol = formattedZero.replace(/[\d.,\s\u00a0]/g, "");
  return `${symbol || "£"}•••`;
}
