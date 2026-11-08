import type { Booking, CatalogueService, ServiceFollowUp } from "@/lib/api/types";
import { addCalendarMonths, followUpIntervalLabel, isOpenFollowUp } from "./follow-ups.ts";

/**
 * Reminders (service follow-ups) are switched on for automotive businesses only for
 * now: a detailer's coating top-up or maintenance wash is the case they were built
 * for. Other verticals keep any follow-ups already scheduled; the console just stops
 * offering the feature.
 */
export function remindersAvailable(industryTemplateKey: string | null | undefined): boolean {
  return industryTemplateKey === "car_detailing";
}

const DAY_MS = 86_400_000;

/* ---------------- Tabs ---------------- */

export type ReminderTab = "due" | "booked" | "snoozed" | "dismissed";

export const REMINDER_TABS: readonly { key: ReminderTab; label: string }[] = [
  { key: "due", label: "Due" },
  { key: "booked", label: "Booked again" },
  { key: "snoozed", label: "Snoozed" },
  { key: "dismissed", label: "Dismissed" },
];

export function isSnoozed(
  f: Pick<ServiceFollowUp, "status" | "snoozedUntil">,
  now: Date = new Date(),
): boolean {
  return (
    isOpenFollowUp(f) &&
    f.snoozedUntil !== null &&
    new Date(f.snoozedUntil).getTime() > now.getTime()
  );
}

/** Which tab a follow-up is listed under; null for cancelled ones (the job fell through). */
export function reminderTab(
  f: Pick<ServiceFollowUp, "status" | "snoozedUntil">,
  now: Date = new Date(),
): ReminderTab | null {
  if (f.status === "completed") return "booked";
  if (f.status === "dismissed") return "dismissed";
  if (f.status === "cancelled") return null;
  return isSnoozed(f, now) ? "snoozed" : "due";
}

/** "rule:<id>" for one repeat reminder, "one-off" for the hand-set ones, "" for all. */
export type ReminderRuleFilter = string;

export function matchesRuleFilter(
  f: Pick<ServiceFollowUp, "ruleId" | "source">,
  filter: ReminderRuleFilter,
): boolean {
  if (!filter) return true;
  if (filter === "one-off") return f.source === "manual";
  return f.ruleId === filter;
}

/** Due tab: overdue first, then soonest. Others: most recently changed first. */
export function sortForTab<T extends Pick<ServiceFollowUp, "dueAt" | "updatedAt">>(
  items: readonly T[],
  tab: ReminderTab,
): T[] {
  const out = items.slice();
  if (tab === "due" || tab === "snoozed") {
    out.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  } else {
    out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return out;
}

/* ---------------- Due pill ---------------- */

export type DueTone = "overdue" | "soon" | "later";

/** Whole calendar days from `now` to `at` in the business's zone (negative = past). */
export function daysUntil(at: string | Date, timezone: string, now: Date = new Date()): number {
  const target = new Date(at);
  if (Number.isNaN(target.getTime()) || Number.isNaN(now.getTime())) return Number.NaN;
  const day = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return Date.parse(`${parts}T00:00:00Z`);
  };
  try {
    return Math.round((day(target) - day(now)) / DAY_MS);
  } catch {
    // A time zone the runtime doesn't recognise must not take the page down.
    return Number.NaN;
  }
}

/** "5 days overdue" (amber) · "Today" / "Tomorrow" / "In 14 days" (blue) · "In 3 months" (grey). */
export function duePill(
  dueAt: string,
  timezone: string,
  now: Date = new Date(),
): { label: string; tone: DueTone } {
  const days = daysUntil(dueAt, timezone, now);
  if (!Number.isFinite(days)) return { label: "Date unknown", tone: "later" };
  if (days < 0) {
    const n = -days;
    return { label: `${n} ${n === 1 ? "day" : "days"} overdue`, tone: "overdue" };
  }
  if (days === 0) return { label: "Today", tone: "soon" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days <= 30) return { label: `In ${days} days`, tone: "soon" };
  const months = Math.max(1, Math.round(days / 30.44));
  if (months < 12)
    return { label: `In ${months} ${months === 1 ? "month" : "months"}`, tone: "later" };
  const years = Math.round(months / 12);
  return { label: `In ${years} ${years === 1 ? "year" : "years"}`, tone: "later" };
}

/* ---------------- Stats ---------------- */

export type ReminderStats = {
  overdue: number;
  due30: number;
  dueThisWeek: number;
  cameBack: number;
  /** Net value of the bookings that closed them; null when the bookings aren't loaded. */
  broughtInMinor: number | null;
  currency: string | null;
};

const CAME_BACK_WINDOW_DAYS = 90;
const LIVE_BOOKING = new Set<string>(["held", "awaiting_payment", "confirmed", "completed"]);

/** Whether this booked-again follow-up closed inside the last 90 days. */
function cameBackRecently(f: Pick<ServiceFollowUp, "status" | "updatedAt">, now: Date): boolean {
  return (
    f.status === "completed" &&
    now.getTime() - new Date(f.updatedAt).getTime() <= CAME_BACK_WINDOW_DAYS * DAY_MS
  );
}

export function reminderStats(
  items: readonly ServiceFollowUp[],
  bookingsById: ReadonlyMap<string, Pick<Booking, "priceMinor" | "currency" | "status">> | null,
  now: Date = new Date(),
): ReminderStats {
  let overdue = 0;
  let due30 = 0;
  let dueThisWeek = 0;
  let cameBack = 0;
  let broughtIn = 0;
  let currency: string | null = null;
  const seenBookings = new Set<string>();
  for (const f of items) {
    if (reminderTab(f, now) === "due") {
      const ms = new Date(f.dueAt).getTime() - now.getTime();
      if (ms < 0) overdue += 1;
      else if (ms <= 30 * DAY_MS) {
        due30 += 1;
        if (ms <= 7 * DAY_MS) dueThisWeek += 1;
      }
    }
    if (cameBackRecently(f, now)) {
      cameBack += 1;
      const id = f.supersededByBookingId;
      const b = id && bookingsById ? bookingsById.get(id) : undefined;
      if (id && b && LIVE_BOOKING.has(b.status) && !seenBookings.has(id)) {
        seenBookings.add(id);
        broughtIn += b.priceMinor ?? 0;
        currency ??= b.currency ?? null;
      }
    }
  }
  return {
    overdue,
    due30,
    dueThisWeek,
    cameBack,
    broughtInMinor: bookingsById ? broughtIn : null,
    currency,
  };
}

/** "8 due · 6 came back" for one repeat reminder. */
export function ruleResults(
  items: readonly ServiceFollowUp[],
  ruleId: string,
  now: Date = new Date(),
): { due: number; cameBack: number } {
  let due = 0;
  let cameBack = 0;
  for (const f of items) {
    if (f.ruleId !== ruleId) continue;
    if (isOpenFollowUp(f)) due += 1;
    if (cameBackRecently(f, now)) cameBack += 1;
  }
  return { due, cameBack };
}

/* ---------------- Timing ---------------- */

export const INTERVAL_PICKS: readonly { months: number; label: string }[] = [
  { months: 1, label: "1 month" },
  { months: 2, label: "2 months" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
];

export const LEAD_PICKS: readonly { days: number; label: string }[] = [
  { days: 0, label: "On the day" },
  { days: 3, label: "3 days before" },
  { days: 7, label: "7 days before" },
  { days: 14, label: "14 days before" },
  { days: 30, label: "30 days before" },
];

export const DEFAULT_INTERVAL_MONTHS = 2;
export const DEFAULT_LEAD_DAYS = 14;
/** The API stores months (1–120); the drawer offers up to 5 years. */
export const MAX_INTERVAL_MONTHS = 60;
export const MAX_NAME_LENGTH = 40;

/** A notice period must be shorter than the gap it sits in (a month is at least 28 days). */
export function leadFits(leadDays: number, intervalMonths: number): boolean {
  return leadDays < intervalMonths * 28;
}

/** "Other": a number of months or years, as typed. Null when it isn't a usable period. */
export function customIntervalMonths(value: string, unit: "months" | "years"): number | null {
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 1) return null;
  const months = unit === "years" ? n * 12 : n;
  return months >= 1 && months <= MAX_INTERVAL_MONTHS ? months : null;
}

/** "every 2 months · 14 days before" for a rule row. */
export function ruleTimingLine(rule: { intervalMonths: number; leadDays: number }): string {
  const lead = rule.leadDays === 0 ? "on the day" : `${rule.leadDays} days before`;
  return `${followUpIntervalLabel(rule.intervalMonths)} · ${lead}`;
}

/** The three dates in "How it works": done, reminded, due again. */
export function timeline(
  doneAt: Date,
  intervalMonths: number,
  leadDays: number,
): { done: Date; remind: Date; due: Date } {
  const due = addCalendarMonths(doneAt, intervalMonths);
  return { done: doneAt, remind: new Date(due.getTime() - leadDays * DAY_MS), due };
}

/* ---------------- Past clients ---------------- */

/** Mirrors the API's FOLLOW_UP_STALE_AFTER_DAYS: older renewals are never chased. */
const STALE_AFTER_DAYS = 180;

function bookingServiceIds(b: Pick<Booking, "lineItems">): string[] {
  return [...new Set((b.lineItems ?? []).map((li) => li.serviceId).filter(Boolean))];
}

/**
 * How many clients a new repeat reminder on this service picks up from history. The
 * API schedules one from every finished job whose renewal is not more than 180 days
 * gone, and a later job for the same thing supersedes the earlier one — so this
 * counts each client (and vehicle) once, by their latest job.
 */
export function pastClientsFor(
  bookings: readonly Pick<
    Booking,
    "leadCustomerId" | "lineItems" | "status" | "end" | "linkedRecordId"
  >[],
  serviceId: string,
  intervalMonths: number,
  now: Date = new Date(),
): number {
  const latest = new Map<string, number>();
  for (const b of bookings) {
    if (b.status !== "completed" && b.status !== "confirmed") continue;
    const end = new Date(b.end).getTime();
    if (!(end < now.getTime())) continue;
    if (!bookingServiceIds(b).includes(serviceId)) continue;
    const key = `${b.leadCustomerId}:${b.linkedRecordId ?? ""}`;
    if ((latest.get(key) ?? 0) < end) latest.set(key, end);
  }
  let n = 0;
  for (const end of latest.values()) {
    const due = addCalendarMonths(new Date(end), intervalMonths).getTime();
    if (due + STALE_AFTER_DAYS * DAY_MS > now.getTime()) n += 1;
  }
  return n;
}

/* ---------------- Copy ---------------- */

/** "Last in 21 Apr", with the year when it isn't this year. */
export function lastInLabel(at: string, timezone: string, now: Date = new Date()): string {
  const formatted = formatReminderWhen(at, timezone, { day: "numeric", month: "short" });
  if (formatted === "—") return "Last in —";
  const d = new Date(at);
  let sameYear = true;
  try {
    sameYear =
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric" }).format(d) ===
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric" }).format(now);
  } catch {
    sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  }
  if (sameYear) return `Last in ${formatted}`;
  const withYear = formatReminderWhen(at, timezone, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return withYear === "—" ? "Last in —" : `Last in ${withYear}`;
}

/**
 * A calendar date on the Reminders page. A missing instant, or a time zone the
 * runtime rejects, is an em dash — one bad row must not crash the whole page.
 */
export function formatReminderWhen(
  iso: string | null | undefined,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timezone }).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat("en-GB", opts).format(d);
    } catch {
      return "—";
    }
  }
}

/** What the client reads, for the "What clients get" card. */
export function reminderMessagePreview(input: {
  firstName: string;
  name: string;
  plate: string | null;
  due: string;
}): { before: string; name: string; after: string } {
  return {
    before: `Hi ${input.firstName}, your `,
    name: input.name,
    after: `${input.plate ? ` for ${input.plate}` : ""} is due on ${input.due}. Book a time that suits you: {booking link}`,
  };
}

/** The service a repeat reminder is set on, by rule id. */
export function serviceForRule(
  services: readonly Pick<CatalogueService, "id" | "followUps">[],
  ruleId: string,
): string | null {
  for (const s of services) {
    if (!Array.isArray(s.followUps)) continue;
    if (s.followUps.some((r) => r.id === ruleId)) return s.id;
  }
  return null;
}
