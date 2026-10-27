import type {
  WaitlistEntry,
  WaitlistHistoryItem,
  WaitlistPreferences,
  WaitlistSlotEvent,
  WaitlistStatus,
  WaitlistTab,
} from "@/lib/api/types";

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  waiting: "Waiting",
  booked: "Booked",
  cancelled: "Removed",
  expired: "Expired",
};

export const WAITLIST_TABS: { value: WaitlistTab; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "booked", label: "Booked in" },
  { value: "removed", label: "Removed" },
];

/** ISO weekday numbers as the API stores them (1 = Monday … 7 = Sunday). */
export const WEEKDAYS: { value: number; short: string; two: string; long: string }[] = [
  { value: 1, short: "Mon", two: "Mo", long: "Mondays" },
  { value: 2, short: "Tue", two: "Tu", long: "Tuesdays" },
  { value: 3, short: "Wed", two: "We", long: "Wednesdays" },
  { value: 4, short: "Thu", two: "Th", long: "Thursdays" },
  { value: 5, short: "Fri", two: "Fr", long: "Fridays" },
  { value: 6, short: "Sat", two: "Sa", long: "Saturdays" },
  { value: 7, short: "Sun", two: "Su", long: "Sundays" },
];

export const TIME_OF_DAY_LABELS: Record<WaitlistPreferences["timeOfDay"], string> = {
  any: "Any time",
  morning: "Mornings",
  afternoon: "Afternoons",
  evening: "Evenings",
};

export const TIME_OF_DAY_OPTIONS = (["any", "morning", "afternoon", "evening"] as const).map(
  (value) => ({ value, label: TIME_OF_DAY_LABELS[value] }),
);

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function fmt(isoDate: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(utcDate(isoDate));
}

/** "25 Oct". */
export function shortDate(isoDate: string): string {
  return fmt(isoDate, { day: "numeric", month: "short" });
}

/** "Sat 25 Oct". */
export function dayDate(isoDate: string): string {
  return `${fmt(isoDate, { weekday: "short" })} ${shortDate(isoDate)}`;
}

/** "Saturday 25 October", for screen readers. */
export function longDayDate(isoDate: string): string {
  return fmt(isoDate, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The preferred window: "3 to 11 Oct", "21 Oct to 1 Nov", "From 24 Oct", "By 31 Oct",
 * "Whenever". Never an en dash.
 */
export function windowPhrase(p: Pick<WaitlistPreferences, "from" | "to">): string {
  if (p.from && p.to) {
    if (p.from === p.to) return shortDate(p.from);
    const sameMonth = p.from.slice(0, 7) === p.to.slice(0, 7);
    const start = sameMonth ? fmt(p.from, { day: "numeric" }) : shortDate(p.from);
    return `${start} to ${shortDate(p.to)}`;
  }
  if (p.from) return `From ${shortDate(p.from)}`;
  if (p.to) return `By ${shortDate(p.to)}`;
  return "Whenever";
}

/** "From 24 Oct" reads as "24 Oct onwards" on the client's account card. */
export function clientWindowPhrase(p: Pick<WaitlistPreferences, "from" | "to">): string {
  if (p.from && !p.to) return `${shortDate(p.from)} onwards`;
  if (!p.from && !p.to) return "As soon as possible";
  return windowPhrase(p);
}

function chosenDays(p: Pick<WaitlistPreferences, "days">) {
  if (!p.days || p.days.length === 0 || p.days.length >= 7) return null;
  return WEEKDAYS.filter((d) => p.days!.includes(d.value));
}

/** Day chips: ["Sat", "Sun"], or ["Any day"]. */
export function dayChips(p: Pick<WaitlistPreferences, "days">): string[] {
  const days = chosenDays(p);
  return days ? days.map((d) => d.short) : ["Any day"];
}

/** "Mornings only" / "Any time". */
export function timeOfDayPhrase(p: Pick<WaitlistPreferences, "timeOfDay">): string {
  return p.timeOfDay === "any" ? "Any time" : `${TIME_OF_DAY_LABELS[p.timeOfDay]} only`;
}

/**
 * The whole preference in one line: "21 Oct to 1 Nov · Sat, Sun · mornings".
 * "Whenever" when nothing was stated.
 */
export function describePreferences(p: WaitlistPreferences): string {
  const parts: string[] = [];
  if (p.from || p.to) parts.push(windowPhrase(p));
  const days = chosenDays(p);
  if (days) parts.push(days.map((d) => d.short).join(", "));
  if (p.timeOfDay !== "any") parts.push(TIME_OF_DAY_LABELS[p.timeOfDay].toLowerCase());
  return parts.length > 0 ? parts.join(" · ") : "Whenever";
}

/** As `describePreferences`, but the window reads "25 Oct onwards" for the client. */
export function describeForClient(p: WaitlistPreferences): string {
  const parts = [clientWindowPhrase(p)];
  const days = chosenDays(p);
  if (days) parts.push(days.map((d) => d.short).join(", "));
  if (p.timeOfDay !== "any") parts.push(TIME_OF_DAY_LABELS[p.timeOfDay].toLowerCase());
  return parts.join(" · ");
}

/** For screen readers: "21 October to 1 November, Saturdays and Sundays, mornings". */
export function spokenPreferences(p: WaitlistPreferences): string {
  const parts: string[] = [];
  const long = (d: string) => fmt(d, { day: "numeric", month: "long" });
  if (p.from && p.to)
    parts.push(p.from === p.to ? long(p.from) : `${long(p.from)} to ${long(p.to)}`);
  else if (p.from) parts.push(`from ${long(p.from)}`);
  else if (p.to) parts.push(`by ${long(p.to)}`);
  else parts.push("whenever");
  const days = chosenDays(p);
  if (days) {
    const names = days.map((d) => d.long);
    parts.push(
      names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0],
    );
  }
  if (p.timeOfDay !== "any") parts.push(TIME_OF_DAY_LABELS[p.timeOfDay].toLowerCase());
  return parts.join(", ");
}

/** True once the last day they could do has gone. */
export function windowPassed(p: Pick<WaitlistPreferences, "to">, todayIso: string): boolean {
  return Boolean(p.to && p.to < todayIso);
}

export function customerName(entry: Pick<WaitlistEntry, "customer">): string {
  const c = entry.customer;
  if (!c) return "Client";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client";
}

/** A stored "+447700900123" as people write it, "07700 900123"; other numbers as stored. */
export function displayPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const m = /^\+44(\d{4})(\d{6})$/.exec(phone.replace(/\s/g, ""));
  return m ? `0${m[1]} ${m[2]}` : phone;
}

export function firstName(entry: Pick<WaitlistEntry, "customer">): string {
  return entry.customer?.firstName?.trim() || "them";
}

/** "Waiting 3 days" / "Added today" / "Waiting 2 weeks". */
export function waitingSince(createdAt: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "Added today";
  if (days === 1) return "Waiting 1 day";
  if (days < 7) return `Waiting ${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "Waiting 1 week" : `Waiting ${weeks} weeks`;
}

/** "Added by you", "Added by Rich", "Booking page". */
export function sourceLine(
  entry: Pick<WaitlistEntry, "source" | "createdBy" | "createdByUserId">,
  myUserId: string | undefined,
): string {
  if (entry.source === "public") return "Booking page";
  const id = entry.createdBy?.id ?? entry.createdByUserId;
  if (id && myUserId && id === myUserId) return "Added by you";
  const name = entry.createdBy?.name?.split(" ")[0];
  return name ? `Added by ${name}` : "Added by staff";
}

/**
 * The panel header line under the name: "Waiting 3 days · added by Rich on 18 Oct" or
 * "Waiting 3 days · joined from your booking page".
 */
export function headerLine(
  entry: Pick<WaitlistEntry, "source" | "createdBy" | "createdByUserId" | "createdAt">,
  myUserId: string | undefined,
  now = new Date(),
): string {
  const since = waitingSince(entry.createdAt, now);
  if (entry.source === "public") return `${since} · joined from your booking page`;
  const id = entry.createdBy?.id ?? entry.createdByUserId;
  const who =
    id && myUserId && id === myUserId ? "you" : (entry.createdBy?.name?.split(" ")[0] ?? "staff");
  return `${since} · added by ${who} on ${shortDate(entry.createdAt.slice(0, 10))}`;
}

const EDIT_FIELD_LABELS: Record<string, string> = {
  variant: "option",
  linkedRecord: "vehicle",
  location: "location",
  staff: "staff member",
  window: "dates",
  days: "days",
  timeOfDay: "time of day",
  priority: "priority",
  notes: "notes",
};

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** One history line, e.g. "Added by Rich", "Changed dates and days", "Booked in". */
export function historyText(
  item: Pick<WaitlistHistoryItem, "kind" | "actor" | "changes">,
  options: { recordLabel?: string; myUserId?: string } = {},
): string {
  const who =
    item.actor && options.myUserId && item.actor.id === options.myUserId
      ? "you"
      : (item.actor?.name?.split(" ")[0] ?? null);
  const by = who ? ` by ${who}` : "";
  switch (item.kind) {
    case "added":
      return `Added${by}`;
    case "joined":
      return "Joined from your booking page";
    case "edited": {
      const labels = item.changes.map((c) =>
        c === "linkedRecord" && options.recordLabel
          ? options.recordLabel.toLowerCase()
          : (EDIT_FIELD_LABELS[c] ?? c),
      );
      return labels.length > 0 ? `Changed ${joinWords(labels)}${by}` : `Edited${by}`;
    }
    case "notified": {
      const how = item.changes.includes("sms")
        ? "text"
        : item.changes.includes("email")
          ? "email"
          : "message";
      return `Sent them a confirmation ${how}`;
    }
    case "booked":
      return `Booked in${by}`;
    case "removed":
      return `Removed from the waitlist${by}`;
    case "left":
      return "Left from their account";
    case "reopened":
      return `Put back on the waitlist${by}`;
    default:
      return "Updated";
  }
}

/**
 * The day to open the booking form on for an entry: the start of their window when it
 * is still ahead, otherwise today. Both as `YYYY-MM-DD`.
 */
export function suggestedBookingDate(p: WaitlistPreferences, todayIso: string): string {
  if (p.from && p.from > todayIso) return p.from;
  return todayIso;
}

/* ---------------- Fits a day ---------------- */

export type FitsValue = { date: string; time: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `2026-10-25` or `2026-10-25T09:00`; null for anything else. */
export function parseFits(raw: string | null | undefined): FitsValue | null {
  if (!raw) return null;
  const [date, time, ...rest] = raw.split("T");
  if (rest.length > 0 || !date || !ISO_DATE.test(date)) return null;
  if (Number.isNaN(utcDate(date).getTime())) return null;
  if (time === undefined) return { date, time: null };
  return HH_MM.test(time) ? { date, time } : null;
}

export function formatFitsParam(v: FitsValue): string {
  return v.time ? `${v.date}T${v.time}` : v.date;
}

/** "Sat 25 Oct" or "Sat 25 Oct, 09:00". */
export function fitsLabel(v: FitsValue): string {
  return v.time ? `${dayDate(v.date)}, ${v.time}` : dayDate(v.date);
}

/* ---------------- URL ---------------- */

export type WaitlistSearch = {
  tab?: WaitlistTab;
  q?: string;
  service?: string;
  location?: string;
  fits?: string;
  slot?: string;
  /** Only who the Fit this week figure counted. */
  week?: boolean;
  entry?: string;
  page?: number;
  /** Old window filter, kept only when it can't become a single Fits day. */
  from?: string;
  to?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Reads the page's search params, mapping old links: `?date=` and `?from=X&to=X` become
 * Fits on that day; any other `from`/`to` stays as the old window filter.
 */
export function parseWaitlistSearch(search: Record<string, unknown>): WaitlistSearch {
  const out: WaitlistSearch = {};
  const tab = str(search.tab);
  if (tab === "waiting" || tab === "booked" || tab === "removed") out.tab = tab;
  for (const key of ["q", "service", "location", "slot", "entry"] as const) {
    const v = str(search[key]);
    if (v) out[key] = v;
  }
  if (search.week === true || search.week === "1" || search.week === 1) out.week = true;
  const page = Number(search.page);
  if (Number.isInteger(page) && page > 1) out.page = page;

  const fits = parseFits(str(search.fits));
  const date = str(search.date);
  const from = str(search.from);
  const to = str(search.to);
  if (fits) out.fits = formatFitsParam(fits);
  else if (date && ISO_DATE.test(date)) out.fits = date;
  else if (from && to && from === to && ISO_DATE.test(from)) out.fits = from;
  else {
    if (from && ISO_DATE.test(from)) out.from = from;
    if (to && ISO_DATE.test(to)) out.to = to;
  }
  return out;
}

/** Today plus `days`, as `YYYY-MM-DD` (calendar arithmetic on a local date string). */
export function addDaysIso(isoDate: string, days: number): string {
  const d = utcDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---------------- Slot freed ---------------- */

export function slotLocal(e: Pick<WaitlistSlotEvent, "start" | "timezone" | "allDay">) {
  const start = new Date(e.start);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: e.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: e.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  return { date, time: e.allDay ? null : time };
}

/** The Fits value that matches a freed slot: its day and (unless all day) its time. */
export function slotFits(e: WaitlistSlotEvent): string {
  const l = slotLocal(e);
  return l.time ? `${l.date}T${l.time}` : l.date;
}

export function slotWhen(e: WaitlistSlotEvent): string {
  const l = slotLocal(e);
  return l.time ? `${dayDate(l.date)} at ${l.time}` : dayDate(l.date);
}

function people(n: number) {
  return n === 1 ? "1 person waiting could" : `${n} people waiting could`;
}

/**
 * "A Full valet on Sat 25 Oct at 09:00 was cancelled. 3 people waiting could take it."
 * Several: "3 slots freed this week. 5 people waiting could take one."
 */
export function slotFreedCopy(events: WaitlistSlotEvent[]): { lead: string; rest: string } {
  if (events.length === 1) {
    const e = events[0]!;
    const what = e.serviceName ? `A ${e.serviceName}` : "A booking";
    return {
      lead: `${what} on ${slotWhen(e)} was cancelled.`,
      rest: `${people(e.fitCount)} take it.`,
    };
  }
  const total = events.reduce((n, e) => n + e.fitCount, 0);
  return {
    lead: `${events.length} slots freed this week.`,
    rest: `${people(total)} take one.`,
  };
}
