import type { Location, Staff } from "@/lib/api/types";
import { DAY_LONG, hm, rangesOn } from "./locations.ts";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLES,
  normalizeRoleKey,
  type PermissionKey,
  type SystemRoleKey,
} from "./permissions.ts";
import { addDaysIso, localDay, wallToUtc } from "./working-days.ts";

/** Why clients can or cannot book a person online; the first reason that applies wins. */
export type BookableState =
  | "archived"
  | "inactive"
  | "not_bookable"
  | "no_hours"
  | "no_services"
  | "hours_outside_opening"
  | "hidden"
  | "bookable";

export type StatusTone = "green" | "amber" | "grey";
export type StatusFix = "hours" | "services" | "show" | "restore" | "activate" | null;

export type BookableStatus = {
  tone: StatusTone;
  pill: string;
  /** The reason under the pill, or "Next free …" when bookable. */
  line: string;
  fix: StatusFix;
  fixLabel: string | null;
  /** The status box sentence on the person panel ("He has no working hours set."). */
  reason: string;
};

export type WorkingRule = Staff["workingRules"][number];

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const SHORT_DATE = (timeZone?: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  });

/** "1 Nov". */
export function shortDate(iso: string | Date, timeZone?: string): string {
  return SHORT_DATE(timeZone).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "Next free Thu 08:00", "Next free today 14:30", or "Fully booked for 2 weeks". */
export function nextFreeText(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "Fully booked for 2 weeks";
  const zone = timeZone || "Europe/London";
  const day = localDay(iso, zone);
  const today = localDay(now.toISOString(), zone);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  if (day === today) return `Next free today ${time}`;
  if (day === addDaysIso(today, 1)) return `Next free tomorrow ${time}`;
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short" }).format(
    new Date(iso),
  );
  return `Next free ${weekday} ${time}`;
}

/** The pill, the line under it and the one fix, for each bookable state (team spec §1). */
export function bookableStatus(
  state: BookableState,
  name: string,
  nextFree: string | null = null,
): BookableStatus {
  const first = firstName(name);
  switch (state) {
    case "archived":
      return {
        tone: "grey",
        pill: "Archived",
        line: "Removed from the team",
        fix: "restore",
        fixLabel: "Bring back",
        reason: `${first} was removed from the team.`,
      };
    case "inactive":
      return {
        tone: "amber",
        pill: "Not bookable",
        line: "Not switched on yet",
        fix: "activate",
        fixLabel: "Switch on",
        reason: `${first}'s diary hasn't been switched on yet.`,
      };
    case "not_bookable":
      return {
        tone: "grey",
        pill: "Not bookable",
        line: "Doesn't take bookings",
        fix: null,
        fixLabel: null,
        reason: `${first} doesn't take bookings.`,
      };
    case "no_hours":
      return {
        tone: "amber",
        pill: "Not bookable",
        line: "No working hours",
        fix: "hours",
        fixLabel: "Set hours",
        reason: `${first} has no working hours set.`,
      };
    case "no_services":
      return {
        tone: "amber",
        pill: "Not bookable",
        line: "Doesn't do any services",
        fix: "services",
        fixLabel: "Choose services",
        reason: `${first} isn't set to do any services.`,
      };
    case "hours_outside_opening":
      return {
        tone: "amber",
        pill: "Not bookable",
        line: "Hours are outside opening times",
        fix: "hours",
        fixLabel: "Fix hours",
        reason: `${first}'s hours fall outside every location's opening hours.`,
      };
    case "hidden":
      return {
        tone: "grey",
        pill: "Hidden from booking page",
        line: `Staff can still book ${first}`,
        fix: "show",
        fixLabel: "Show on booking page",
        reason: `Clients can't choose ${first} on the booking page.`,
      };
    case "bookable":
      return {
        tone: "green",
        pill: "Bookable online",
        line: nextFree ?? "Clients can book online",
        fix: null,
        fixLabel: null,
        reason: "",
      };
  }
}

/* ---------------- Roles ---------------- */

/** The roles a person can be given, least access first (team spec §5). */
export const ROLE_ORDER = [
  SYSTEM_ROLES.RESTRICTED_STAFF,
  SYSTEM_ROLES.STAFF,
  SYSTEM_ROLES.RECEPTION,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.FINANCE,
  SYSTEM_ROLES.ADMINISTRATOR,
] as const;

export const ROLE_LINE: Record<string, string> = {
  [SYSTEM_ROLES.BUSINESS_OWNER]: "Everything, including the plan",
  [SYSTEM_ROLES.RESTRICTED_STAFF]: "Their own jobs only",
  [SYSTEM_ROLES.STAFF]: "Their own jobs and the client list",
  [SYSTEM_ROLES.RECEPTION]: "All jobs and clients, sees payments",
  [SYSTEM_ROLES.MANAGER]: "Jobs, clients, invoices and reports",
  [SYSTEM_ROLES.FINANCE]: "Payments, refunds, invoices and the plan",
  [SYSTEM_ROLES.ADMINISTRATOR]: "Everything except owner-only actions",
};

export const COMPARE_AREAS = [
  "Calendar",
  "Clients",
  "Payments",
  "Invoices",
  "Reports",
  "Team",
  "Settings",
  "Plan",
] as const;
export type CompareArea = (typeof COMPARE_AREAS)[number];
export type CompareCell = "Own" | "All" | "View" | "·";

/** What a role can do in each area, read from the same permission bundles the app enforces. */
export function roleAccess(role: SystemRoleKey): Record<CompareArea, CompareCell> {
  const has = new Set<PermissionKey>(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
  const P = PERMISSIONS;
  const pick = (all: PermissionKey | null, view: PermissionKey | null, own?: PermissionKey) =>
    all && has.has(all)
      ? "All"
      : view && has.has(view)
        ? "View"
        : own && has.has(own)
          ? "Own"
          : "·";
  return {
    Calendar: pick(P.BOOKING_READ_ALL, null, P.BOOKING_READ_OWN),
    Clients: pick(P.CUSTOMER_UPDATE, P.CUSTOMER_READ),
    Payments: pick(P.PAYMENT_REFUND, P.PAYMENT_READ),
    Invoices: pick(P.INVOICE_MANAGE, P.INVOICE_READ),
    Reports: pick(P.REPORT_EXPORT, P.REPORT_READ),
    Team: pick(P.TEAM_MANAGE_PERMISSIONS, P.TEAM_INVITE),
    Settings: pick(P.BUSINESS_UPDATE, P.BUSINESS_READ),
    Plan: pick(P.BILLING_MANAGE, null),
  };
}

export function primaryRole(roleKeys: readonly string[]): string {
  const keys = roleKeys.map(normalizeRoleKey);
  if (keys.includes(SYSTEM_ROLES.BUSINESS_OWNER)) return SYSTEM_ROLES.BUSINESS_OWNER;
  return keys[0] ?? SYSTEM_ROLES.STAFF;
}

/** Where a role sits in ROLE_ORDER (owner above everything); for "downgrading yourself". */
export function roleRank(role: string): number {
  if (normalizeRoleKey(role) === SYSTEM_ROLES.BUSINESS_OWNER) return ROLE_ORDER.length;
  return ROLE_ORDER.indexOf(normalizeRoleKey(role) as (typeof ROLE_ORDER)[number]);
}

/* ---------------- Sign-in line ---------------- */

export type SignInView = {
  status: "invited" | "active" | "suspended";
  roleKeys: readonly string[];
  lastLoginAt: string | null;
  updatedAt?: string;
  email: string | null;
};

export type InvitationView = {
  state: "pending" | "expired";
  expiresAt: string;
  sentAt: string | null;
  createdAt: string;
  roleKeys: readonly string[];
  email: string;
};

export type SignInState = "signed_in" | "invited" | "expired" | "removed" | "none";
export type SignInLine = {
  state: SignInState;
  roleKey: string | null;
  line: string;
  tone: "muted" | "amber" | "red";
};

function relativeDay(iso: string, now: Date): string {
  const day = localDay(iso, "Europe/London");
  const today = localDay(now.toISOString(), "Europe/London");
  if (day === today) return "today";
  if (day === addDaysIso(today, -1)) return "yesterday";
  return `on ${shortDate(iso)}`;
}

/** "Signed in today", "Invite sent · expires 1 Nov", "Invite expired 20 Oct" or "Diary only". */
export function signInLine(
  signIn: SignInView | null,
  invitation: InvitationView | null,
  bookable: boolean,
  now: Date = new Date(),
): SignInLine {
  if (signIn && signIn.status === "active") {
    return {
      state: "signed_in",
      roleKey: primaryRole(signIn.roleKeys),
      line: signIn.lastLoginAt
        ? `Signed in ${relativeDay(signIn.lastLoginAt, now)}`
        : "Hasn't signed in yet",
      tone: "muted",
    };
  }
  if (invitation) {
    return invitation.state === "expired"
      ? {
          state: "expired",
          roleKey: primaryRole(invitation.roleKeys),
          line: `Invite expired ${shortDate(invitation.expiresAt)}`,
          tone: "red",
        }
      : {
          state: "invited",
          roleKey: primaryRole(invitation.roleKeys),
          line: `Invite sent · expires ${shortDate(invitation.expiresAt)}`,
          tone: "amber",
        };
  }
  if (signIn && signIn.status === "suspended") {
    return {
      state: "removed",
      roleKey: primaryRole(signIn.roleKeys),
      line: signIn.updatedAt ? `Sign-in removed ${shortDate(signIn.updatedAt)}` : "Sign-in removed",
      tone: "muted",
    };
  }
  if (signIn) {
    return {
      state: "invited",
      roleKey: primaryRole(signIn.roleKeys),
      line: "Invite not accepted yet",
      tone: "amber",
    };
  }
  return { state: "none", roleKey: null, line: bookable ? "Diary only" : "", tone: "muted" };
}

/* ---------------- Colours ---------------- */

/** Twelve presets; a new person gets the first one nobody is using yet. */
export const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
  "#4f46e5",
  "#059669",
  "#7c3aed",
  "#64748b",
] as const;

export function nextColour(used: readonly (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  return PALETTE.find((c) => !taken.has(c)) ?? PALETTE[taken.size % PALETTE.length]!;
}

/* ---------------- Hours ---------------- */

export function weeklyMinutes(rules: readonly Pick<WorkingRule, "startMinute" | "endMinute">[]) {
  return rules.reduce((sum, r) => sum + Math.max(0, r.endMinute - r.startMinute), 0);
}

/** "38 hrs", "7.5 hrs", "1 hr" or "No hours". */
export function hoursText(minutes: number): string {
  if (minutes <= 0) return "No hours";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
}

/** "{N} hours a week" for the editor footer. */
export function hoursAWeek(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? "hour" : "hours"} a week`;
}

/** "1 hour", "30 min", "1 hour 15 min". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m > 0 ? `${m} min` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 min";
}

/** "08:00 to 17:00, 18:00 to 20:00" for one day, or "" when off. */
export function dayRulesText(rules: readonly WorkingRule[], day: number): string {
  return rules
    .filter((r) => r.dayOfWeek === day)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((r) => `${hm(r.startMinute)} to ${hm(r.endMinute)}`)
    .join(", ");
}

export function sortRules<T extends Pick<WorkingRule, "dayOfWeek" | "startMinute">>(rules: T[]) {
  return [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
}

/** Monday to Friday, 9 to 5, at any location. */
export function presetWeekdays(): WorkingRule[] {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    locationId: null,
  }));
}

/** The location's own opening hours, tied to it when there's more than one location. */
export function presetSameAs(
  location: Pick<Location, "id" | "openingHours">,
  tieToLocation: boolean,
): WorkingRule[] {
  return sortRules(
    location.openingHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      startMinute: h.openMinute,
      endMinute: h.closeMinute,
      locationId: tieToLocation ? location.id : null,
    })),
  );
}

/** Monday's slots copied onto every other day that's switched on. */
export function copyMondayToAll(rules: readonly WorkingRule[], onDays: readonly number[]) {
  const monday = rules.filter((r) => r.dayOfWeek === 1);
  const targets = new Set(onDays.filter((d) => d !== 1));
  const kept = rules.filter((r) => !targets.has(r.dayOfWeek));
  const copies = [...targets].flatMap((dayOfWeek) => monday.map((r) => ({ ...r, dayOfWeek })));
  return sortRules([...kept, ...copies]);
}

/** "Finish time must be after start time." / "These times overlap." / null. */
export function slotsError(
  slots: readonly Pick<WorkingRule, "startMinute" | "endMinute">[],
): string | null {
  if (slots.some((s) => s.endMinute <= s.startMinute))
    return "Finish time must be after start time.";
  const sorted = [...slots].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.startMinute < sorted[i - 1]!.endMinute) return "These times overlap.";
  }
  return null;
}

type OpenRange = { openMinute: number; closeMinute: number };

function minutesOutside(start: number, end: number, open: readonly OpenRange[]): number {
  let covered = 0;
  for (const r of open) {
    const from = Math.max(start, r.openMinute);
    const to = Math.min(end, r.closeMinute);
    if (to > from) covered += to - from;
  }
  return Math.max(0, end - start - covered);
}

/**
 * The amber line under a slot that falls outside its location's opening hours:
 * "Studio opens 08:00, 1 hour won't be bookable". Locations without hours are open
 * whenever the team works, so they never warn. A slot at "any location" warns only
 * when it's outside every location the person works at.
 */
export function slotWarning(
  slot: WorkingRule,
  locations: readonly Pick<Location, "id" | "name" | "openingHours">[],
): string | null {
  const places = slot.locationId
    ? locations.filter((l) => l.id === slot.locationId)
    : [...locations];
  if (places.length === 0 || slot.endMinute <= slot.startMinute) return null;
  let best: { location: (typeof places)[number]; outside: number } | null = null;
  for (const location of places) {
    if (location.openingHours.length === 0) return null;
    const open = rangesOn(location.openingHours, slot.dayOfWeek);
    const outside = minutesOutside(slot.startMinute, slot.endMinute, open);
    if (outside === 0) return null;
    if (!best || outside < best.outside) best = { location, outside };
  }
  if (!best) return null;
  const open = rangesOn(best.location.openingHours, slot.dayOfWeek);
  const lost = `${durationText(best.outside)} won't be bookable`;
  if (open.length === 0) {
    return `${best.location.name} is closed on ${DAY_LONG[slot.dayOfWeek]}s, ${lost}`;
  }
  const first = open[0]!;
  const last = open[open.length - 1]!;
  if (slot.startMinute < first.openMinute) {
    return `${best.location.name} opens ${hm(first.openMinute)}, ${lost}`;
  }
  if (slot.endMinute > last.closeMinute) {
    return `${best.location.name} closes ${hm(last.closeMinute)}, ${lost}`;
  }
  return `${best.location.name} is closed for part of this time, ${lost}`;
}

/* ---------------- Team list ---------------- */

export type TeamTab = "active" | "archived";
export const NO_SIGN_IN = "none";

export type ListFilters = {
  tab: TeamTab;
  q: string;
  location: string | null;
  role: string | null;
};

export type ListPerson = {
  staff: Pick<Staff, "id" | "displayName" | "title" | "status" | "locationIds" | "displayOrder">;
  signIn: { email: string | null; roleKeys: readonly string[]; status: string } | null;
  invitation: { email: string; roleKeys: readonly string[] } | null;
};

export function isArchivedPerson(p: { staff: Pick<Staff, "status"> }): boolean {
  return p.staff.status === "suspended";
}

/** The role a person is filtered under: their sign-in, a waiting invite, or "No sign-in". */
export function filterRole(p: ListPerson): string {
  if (p.signIn && p.signIn.status !== "suspended") return primaryRole(p.signIn.roleKeys);
  if (p.invitation) return primaryRole(p.invitation.roleKeys);
  return NO_SIGN_IN;
}

/** Tab, search ("name or email"), location and role, then display order and name. */
export function filterPeople<T extends ListPerson>(people: readonly T[], f: ListFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return people
    .filter((p) => (f.tab === "archived" ? isArchivedPerson(p) : !isArchivedPerson(p)))
    .filter((p) => {
      if (!q) return true;
      const hay = [p.staff.displayName, p.staff.title, p.signIn?.email, p.invitation?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .filter(
      (p) =>
        !f.location || p.staff.locationIds.length === 0 || p.staff.locationIds.includes(f.location),
    )
    .filter((p) => !f.role || filterRole(p) === f.role)
    .sort(
      (a, b) =>
        (a.staff.displayOrder ?? 0) - (b.staff.displayOrder ?? 0) ||
        a.staff.displayName.localeCompare(b.staff.displayName),
    );
}

/** Staff who can be picked for a booking: active and not set to "doesn't take bookings". */
export function takesBookings(s: Pick<Staff, "status"> & { bookable?: boolean }): boolean {
  return s.status === "active" && s.bookable !== false;
}

/* ---------------- Time away ---------------- */

export type TimeAwayKind = "holiday" | "block" | "training";
export type FeedKind = TimeAwayKind | "event" | "closure";

export const KIND_LABEL: Record<FeedKind, string> = {
  holiday: "Holiday",
  block: "Blocked time",
  training: "Training",
  event: "Event",
  closure: "Closure",
};

export const KIND_CHIP: Record<FeedKind, string> = {
  holiday: "Holiday",
  block: "Block",
  training: "Training",
  event: "Event",
  closure: "Closure",
};

/** "Add holiday", "Block time", "Add training". */
export function timeAwaySubmitLabel(kind: TimeAwayKind): string {
  return kind === "holiday" ? "Add holiday" : kind === "block" ? "Block time" : "Add training";
}

/** "3 to 7 Nov", "3 Nov", "30 Oct to 2 Nov". */
export function dateRangeText(startsOn: string, endsOn: string): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  if (startsOn === endsOn) return fmt(startsOn, { day: "numeric", month: "short" });
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  return sameMonth
    ? `${fmt(startsOn, { day: "numeric" })} to ${fmt(endsOn, { day: "numeric", month: "short" })}`
    : `${fmt(startsOn, { day: "numeric", month: "short" })} to ${fmt(endsOn, { day: "numeric", month: "short" })}`;
}

/** "Holiday added for Hannah, 3 to 7 Nov". */
export function timeAwayAddedText(
  kind: TimeAwayKind,
  name: string,
  startsOn: string,
  endsOn: string,
): string {
  const what = kind === "block" ? "Time blocked" : `${KIND_LABEL[kind]} added`;
  return `${what} for ${firstName(name)}, ${dateRangeText(startsOn, endsOn)}`;
}

/** When a feed item happens: "Mon 3 Nov to Fri 7 Nov", "Tue 4 Nov 09:00 to 12:00". */
export function feedWhen(
  item: { start: string; end: string; allDay: boolean },
  timeZone: string,
): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    })
      .format(new Date(iso))
      .replace(",", "");
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  if (item.allDay) {
    // All-day spans end at the next midnight; show the last day they cover.
    const last = new Date(new Date(item.end).getTime() - 60_000).toISOString();
    const a = day(item.start);
    const b = day(last);
    return a === b ? a : `${a} to ${b}`;
  }
  const a = day(item.start);
  const b = day(item.end);
  return a === b
    ? `${a} ${time(item.start)} to ${time(item.end)}`
    : `${a} ${time(item.start)} to ${b} ${time(item.end)}`;
}

export type Shade = { startMin: number; endMin: number; label: string };

function minutesInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Where each period of time away falls on each day in view, for the hatched calendar bands. */
export function timeAwayShades(
  periods: readonly { start: string; end: string; label: string }[],
  days: readonly string[],
  calendarZone: string,
): Map<string, Shade[]> {
  const out = new Map<string, Shade[]>();
  for (const p of periods) {
    const start = new Date(p.start);
    const end = new Date(p.end);
    for (const day of days) {
      const dayStart = wallToUtc(day, 0, calendarZone);
      const dayEnd = wallToUtc(addDaysIso(day, 1), 0, calendarZone);
      if (end <= dayStart || start >= dayEnd) continue;
      const startMin = start <= dayStart ? 0 : minutesInZone(start, calendarZone);
      const endMin = end >= dayEnd ? 24 * 60 : minutesInZone(end, calendarZone);
      if (endMin <= startMin) continue;
      const list = out.get(day) ?? [];
      list.push({ startMin, endMin, label: p.label });
      out.set(day, list);
    }
  }
  return out;
}

/** Two shade maps as one, day by day. */
export function mergeShades(
  a: Map<string, Shade[]> | undefined,
  b: Map<string, Shade[]> | undefined,
): Map<string, Shade[]> | undefined {
  if (!a) return b;
  if (!b) return a;
  const out = new Map(a);
  for (const [day, list] of b) out.set(day, [...(out.get(day) ?? []), ...list]);
  return out;
}

/** The time-off label on the calendar: "Holiday · Hannah". */
export function timeAwayLabel(
  period: { kind?: string | null; reason?: string | null },
  name: string | null,
): string {
  const kind = (period.kind ?? "block") as TimeAwayKind;
  const head = KIND_LABEL[kind] ?? "Time away";
  return name ? `${head} · ${firstName(name)}` : head;
}
