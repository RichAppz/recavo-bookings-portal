/**
 * Pure helpers for the Clients list and the Add client drawer (design spec 20 Oct
 * 2026): per-client stats derived from bookings and payments, the tabs and their
 * counts, the one pill a row may carry, search, sorting, relative dates, avatar
 * tints, the duplicate check and the reminder-channel hint. No React, no API.
 */
import type { Booking, Customer, Payment } from "./api/types.ts";
import { customerLifetimeSpendMinor } from "./booking-payment.ts";
import { isoDateInTz } from "./format.ts";

export type ClientsView = "all" | "new" | "lapsed" | "package" | "archived";
export const CLIENTS_VIEWS: readonly ClientsView[] = [
  "all",
  "new",
  "lapsed",
  "package",
  "archived",
];
export const CLIENTS_VIEW_LABELS: Record<ClientsView, string> = {
  all: "All",
  new: "New this month",
  lapsed: "Not seen in 60 days",
  package: "With a package",
  archived: "Archived",
};

export type ClientsSort = "last-visit" | "next-booking" | "name" | "spent" | "newest" | "sessions";
export const CLIENTS_SORTS: readonly ClientsSort[] = [
  "last-visit",
  "next-booking",
  "name",
  "spent",
  "newest",
  "sessions",
];
export const CLIENTS_SORT_LABELS: Record<ClientsSort, string> = {
  "last-visit": "Last visit",
  "next-booking": "Next booking",
  name: "Name A to Z",
  spent: "Most spent",
  newest: "Newest",
  sessions: "Most sessions",
};
export type SortDir = "asc" | "desc";
export const DEFAULT_SORT_DIR: Record<ClientsSort, SortDir> = {
  "last-visit": "desc",
  "next-booking": "asc",
  name: "asc",
  spent: "desc",
  newest: "desc",
  sessions: "desc",
};

/** "Not seen in" window. A fixed default until the spec's open decision is settled. */
export const LAPSED_DAYS = 60;
/** A client counts as "New" for this long after being added, while they have no visits. */
export const NEW_CLIENT_DAYS = 30;

const DAY_MS = 86_400_000;

type StatsBooking = Pick<
  Booking,
  | "id"
  | "leadCustomerId"
  | "attendees"
  | "start"
  | "allDay"
  | "status"
  | "attendanceStatus"
  | "paymentMethod"
  | "priceMinor"
  | "paidMinor"
  | "serviceSnapshot"
>;
type StatsPayment = Pick<
  Payment,
  "customerId" | "bookingId" | "amountMinor" | "amountRefundedMinor" | "state"
>;

export type ClientVisit = { at: string; allDay: boolean; service: string };

export type ClientStats = {
  lastVisit: ClientVisit | null;
  nextBooking: ClientVisit | null;
  /** Sessions the client actually attended. */
  sessions: number;
  /** Money received, net of refunds. */
  spentMinor: number;
  /** Unpaid balance on jobs that have already happened. */
  owedMinor: number;
};

export const EMPTY_STATS: ClientStats = {
  lastVisit: null,
  nextBooking: null,
  sessions: 0,
  spentMinor: 0,
  owedMinor: 0,
};

const LIVE = new Set<Booking["status"]>(["held", "awaiting_payment", "confirmed"]);
/** Never charged for, so nothing can be owed on them. */
const NOT_OWING = new Set<Booking["status"]>([
  "draft",
  "held",
  "expired",
  "cancelled_by_customer",
  "cancelled_by_business",
]);

const attendedBooking = (b: StatsBooking) =>
  b.status === "completed" || b.attendanceStatus === "attended";

/** Everyone on a booking with a client record: the lead plus named attendees. */
function customerIdsOn(b: StatsBooking): string[] {
  const ids = new Set<string>();
  if (b.leadCustomerId) ids.add(b.leadCustomerId);
  for (const a of b.attendees ?? []) if (a.customerId) ids.add(a.customerId);
  return [...ids];
}

/**
 * Last visit, next booking, attended sessions, spend and balance owed for every
 * client that appears in `bookings` or `payments`. Money follows the lead client
 * (who pays); visits and sessions count for every named attendee.
 */
export function clientStatsById(
  bookings: readonly StatsBooking[],
  payments: readonly StatsPayment[],
  now: Date,
): Map<string, ClientStats> {
  const nowMs = now.getTime();
  const out = new Map<string, ClientStats>();
  const leadBookings = new Map<string, StatsBooking[]>();
  const statsFor = (id: string) => {
    let s = out.get(id);
    if (!s) {
      s = { ...EMPTY_STATS };
      out.set(id, s);
    }
    return s;
  };

  for (const b of bookings) {
    const startMs = Date.parse(b.start);
    const visit: ClientVisit = { at: b.start, allDay: b.allDay, service: b.serviceSnapshot.name };
    for (const id of customerIdsOn(b)) {
      const s = statsFor(id);
      if (startMs <= nowMs && attendedBooking(b)) {
        s.sessions += 1;
        if (!s.lastVisit || startMs > Date.parse(s.lastVisit.at)) s.lastVisit = visit;
      }
      if (startMs >= nowMs && LIVE.has(b.status)) {
        if (!s.nextBooking || startMs < Date.parse(s.nextBooking.at)) s.nextBooking = visit;
      }
    }
    if (b.leadCustomerId) {
      const list = leadBookings.get(b.leadCustomerId) ?? [];
      list.push(b);
      leadBookings.set(b.leadCustomerId, list);
      if (
        startMs < nowMs &&
        !NOT_OWING.has(b.status) &&
        b.paymentMethod !== "credit" &&
        b.priceMinor > 0
      ) {
        const due = b.priceMinor - (b.paidMinor ?? 0);
        if (due > 0) statsFor(b.leadCustomerId).owedMinor += due;
      }
    }
  }

  const paymentsByCustomer = new Map<string, StatsPayment[]>();
  for (const p of payments) {
    if (!p.customerId) continue;
    const list = paymentsByCustomer.get(p.customerId) ?? [];
    list.push(p);
    paymentsByCustomer.set(p.customerId, list);
  }
  const spenders = new Set([...leadBookings.keys(), ...paymentsByCustomer.keys()]);
  for (const id of spenders) {
    statsFor(id).spentMinor = customerLifetimeSpendMinor(
      leadBookings.get(id) ?? [],
      paymentsByCustomer.get(id) ?? [],
    );
  }
  return out;
}

/** Whole calendar days from `iso` to `now`, both read in the business's timezone. */
export function daysAgo(iso: string, now: Date, timeZone: string): number {
  const a = Date.parse(`${isoDateInTz(iso, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${isoDateInTz(now.toISOString(), timeZone)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "2 months ago", "1 year ago". */
export function relativeVisitLabel(iso: string, now: Date, timeZone: string): string {
  const days = Math.max(0, daysAgo(iso, now, timeZone));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${plural(Math.floor(days / 7), "week")} ago`;
  if (days < 365) return `${plural(Math.floor(days / 30), "month")} ago`;
  return `${plural(Math.floor(days / 365), "year")} ago`;
}

export const isArchivedClient = (c: Pick<Customer, "status">) => c.status !== "active";

/** Last attended visit 60+ days ago and nothing booked. Never-seen clients aren't lapsed. */
export function isLapsed(stats: ClientStats, now: Date, timeZone: string): boolean {
  if (!stats.lastVisit || stats.nextBooking) return false;
  return daysAgo(stats.lastVisit.at, now, timeZone) >= LAPSED_DAYS;
}

/** Added since the 1st of this month (business timezone). */
export function isNewThisMonth(c: Pick<Customer, "createdAt">, now: Date, timeZone: string) {
  const monthStart = `${isoDateInTz(now.toISOString(), timeZone).slice(0, 7)}-01`;
  return isoDateInTz(c.createdAt, timeZone) >= monthStart;
}

export type ClientRowFacts = {
  customer: Pick<Customer, "status" | "createdAt">;
  stats: ClientStats;
  /** Spendable package credits, or 0 when unknown. */
  credits: number;
};

export function inView(view: ClientsView, row: ClientRowFacts, now: Date, timeZone: string) {
  const archived = isArchivedClient(row.customer);
  switch (view) {
    case "all":
      return !archived;
    case "archived":
      return archived;
    case "new":
      return !archived && isNewThisMonth(row.customer, now, timeZone);
    case "lapsed":
      return !archived && isLapsed(row.stats, now, timeZone);
    case "package":
      return !archived && row.credits > 0;
  }
}

export function viewCounts(
  rows: readonly ClientRowFacts[],
  now: Date,
  timeZone: string,
): Record<ClientsView, number> {
  const counts: Record<ClientsView, number> = {
    all: 0,
    new: 0,
    lapsed: 0,
    package: 0,
    archived: 0,
  };
  for (const row of rows) {
    for (const v of CLIENTS_VIEWS) if (inView(v, row, now, timeZone)) counts[v] += 1;
  }
  return counts;
}

/** "12 clients · 3 new this month · 2 haven't been back in 60 days" (zero parts after the first dropped). */
export function clientsSummary(
  counts: Pick<Record<ClientsView, number>, "all" | "new" | "lapsed">,
  opts: { lapsed?: boolean } = {},
): string {
  const parts = [plural(counts.all, "client")];
  if (counts.new > 0) parts.push(`${counts.new} new this month`);
  if (opts.lapsed !== false && counts.lapsed > 0) {
    parts.push(
      `${counts.lapsed} ${counts.lapsed === 1 ? "hasn't" : "haven't"} been back in ${LAPSED_DAYS} days`,
    );
  }
  return parts.join(" · ");
}

export type ClientPillKind = "owes" | "package" | "new" | "archived" | "anonymised";
export const CLIENT_PILL_LABELS: Record<ClientPillKind, string> = {
  owes: "Owes",
  package: "Package",
  new: "New",
  archived: "Archived",
  anonymised: "Anonymised",
};

/** The one pill a row may carry, in priority order: Owes, Package, New, Archived. */
export function clientPill(
  row: ClientRowFacts & { customer: Pick<Customer, "status" | "createdAt"> },
  now: Date,
): ClientPillKind | null {
  if (row.stats.owedMinor > 0) return "owes";
  if (row.credits > 0) return "package";
  const ageDays = (now.getTime() - Date.parse(row.customer.createdAt)) / DAY_MS;
  if (row.customer.status === "active" && row.stats.sessions === 0 && ageDays < NEW_CLIENT_DAYS) {
    return "new";
  }
  if (row.customer.status === "archived") return "archived";
  if (row.customer.status === "anonymised") return "anonymised";
  return null;
}

export const sessionsLabel = (n: number) => (n === 0 ? "No sessions yet" : plural(n, "session"));
export const creditsLeftLabel = (n: number) => `${plural(n, "credit")} left`;

/**
 * The line under a client's name: their "known as", else what the pill means
 * ("£45 due", "2 credits left", "Added 5 Oct"), else the session count. The owed
 * amount is left out for staff who can't see money (`money` null).
 */
export function clientSubline(
  row: ClientRowFacts & { customer: Pick<Customer, "status" | "createdAt" | "nickname"> },
  pill: ClientPillKind | null,
  fmt: { money: ((minor: number) => string) | null; date: (iso: string) => string },
): string {
  if (row.customer.nickname?.trim()) return `Known as ${row.customer.nickname.trim()}`;
  if (pill === "owes" && fmt.money) return `${fmt.money(row.stats.owedMinor)} due`;
  if (pill === "package") return creditsLeftLabel(row.credits);
  if (pill === "new") return `Added ${fmt.date(row.customer.createdAt)}`;
  return sessionsLabel(row.stats.sessions);
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Case-insensitive match on names, known as, email and phone (digits compared on their own). */
export function matchesClientSearch(
  c: Pick<
    Customer,
    | "firstName"
    | "lastName"
    | "nickname"
    | "emailDisplay"
    | "emailNormalised"
    | "phoneDisplay"
    | "phoneNormalised"
  >,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [
    c.firstName,
    c.lastName,
    `${c.firstName} ${c.lastName ?? ""}`,
    c.nickname,
    c.emailDisplay,
    c.emailNormalised,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (text.includes(q)) return true;
  const qDigits = digits(q);
  if (qDigits.length < 3 || qDigits.length !== q.replace(/[\s()+-]/g, "").length) return false;
  const phones = [digits(c.phoneDisplay), digits(c.phoneNormalised)];
  // A national "07700…" should find a stored "+447700…" and vice versa.
  const national = qDigits.startsWith("0") ? qDigits.slice(1) : qDigits;
  return phones.some((p) => p.includes(qDigits) || (national.length >= 3 && p.includes(national)));
}

export type SortableClient = {
  customer: Pick<Customer, "firstName" | "lastName" | "createdAt">;
  stats: ClientStats;
};

/** Rows missing the sorted value (never visited, nothing booked) always go last. */
export function sortClients<T extends SortableClient>(
  rows: readonly T[],
  key: ClientsSort,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const name = (r: T) => `${r.customer.firstName} ${r.customer.lastName ?? ""}`.trim();
  const value = (r: T): number | string | null => {
    switch (key) {
      case "last-visit":
        return r.stats.lastVisit ? Date.parse(r.stats.lastVisit.at) : null;
      case "next-booking":
        return r.stats.nextBooking ? Date.parse(r.stats.nextBooking.at) : null;
      case "name":
        return name(r).toLowerCase();
      case "spent":
        return r.stats.spentMinor;
      case "newest":
        return Date.parse(r.customer.createdAt);
      case "sessions":
        return r.stats.sessions;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) {
      if (va === vb) return name(a).localeCompare(name(b));
      return va === null ? 1 : -1;
    }
    const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp !== 0 ? cmp * sign : name(a).localeCompare(name(b));
  });
}

/** One of six avatar tints, fixed per client so a face keeps its colour across visits. */
export function avatarTintIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 6;
}

export type DuplicateReason = "email" | "mobile" | "name";
export type DuplicateMatch<C> = { customer: C; reason: DuplicateReason };

/**
 * An existing client the new one may be: same email, then same mobile, then same
 * first and last name. Anonymised records are ignored; they can't be reused.
 */
export function findDuplicateClient<
  C extends Pick<
    Customer,
    | "status"
    | "firstName"
    | "lastName"
    | "emailNormalised"
    | "emailDisplay"
    | "phoneNormalised"
    | "phoneDisplay"
  >,
>(
  customers: readonly C[],
  draft: { email: string; phoneE164: string | null; firstName: string; lastName: string },
): DuplicateMatch<C> | null {
  const pool = customers.filter((c) => c.status !== "anonymised");
  const email = draft.email.trim().toLowerCase();
  if (email) {
    const hit = pool.find(
      (c) => (c.emailNormalised ?? c.emailDisplay ?? "").trim().toLowerCase() === email,
    );
    if (hit) return { customer: hit, reason: "email" };
  }
  const phone = digits(draft.phoneE164);
  if (phone.length >= 8) {
    const hit = pool.find(
      (c) => digits(c.phoneNormalised) === phone || digits(c.phoneDisplay) === phone,
    );
    if (hit) return { customer: hit, reason: "mobile" };
  }
  const first = draft.firstName.trim().toLowerCase();
  const last = draft.lastName.trim().toLowerCase();
  if (first && last) {
    const hit = pool.find(
      (c) =>
        c.firstName.trim().toLowerCase() === first &&
        (c.lastName ?? "").trim().toLowerCase() === last,
    );
    if (hit) return { customer: hit, reason: "name" };
  }
  return null;
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  email: "Same email",
  mobile: "Same mobile",
  name: "Same name",
};

export type ReminderChannel = "sms" | "email" | "phone" | "none";

/** Text when a text would actually go out and there's a number to send it to; otherwise email. */
export function defaultReminderChannel(canText: boolean, hasMobile: boolean): ReminderChannel {
  return canText && hasMobile ? "sms" : "email";
}

/** The one hint line under the channel buttons, and whether it's a warning. */
export function reminderChannelHint(
  channel: ReminderChannel,
  sms: { canText: boolean; unlimited: boolean; balance: number | null },
  hasMobile: boolean,
): { text: string; warn: boolean } {
  switch (channel) {
    case "sms":
      if (!hasMobile) {
        return {
          text: "Add a mobile number for texts. Until then reminders go by email.",
          warn: true,
        };
      }
      if (!sms.canText) {
        return {
          text: "You're out of text credits, so reminders will go by email until you top up.",
          warn: true,
        };
      }
      if (sms.unlimited)
        return { text: "Reminders go by text. Texts are included in your plan.", warn: false };
      return {
        text:
          sms.balance === null
            ? "Reminders go by text. When your text credits run out, reminders go by email instead."
            : `Reminders go by text. You have ${sms.balance} text credits; when they run out, reminders go by email instead.`,
        warn: false,
      };
    case "email":
      return { text: "Reminders go by email.", warn: false };
    case "phone":
      return { text: "Reminders go by email; you'll call them for anything else.", warn: false };
    case "none":
      return {
        text: "No reminders are sent. Booking confirmations still go by email if they have one.",
        warn: false,
      };
  }
}

/** Dialling code to default the mobile field to, from the business's timezone. */
export function defaultDiallingCode(timeZone: string | null | undefined): string {
  switch (timeZone) {
    case "Europe/Dublin":
      return "353";
    default:
      return "44";
  }
}
