/**
 * Pure helpers for the client profile (design spec 20 Oct 2026): which tab a URL
 * lands on (old `?tab=` values included), the summary strip figures, booking
 * filters, status and payment wording, the combined money list, the credit ledger
 * wording and the message timeline. No React, no API.
 */
import type {
  Booking,
  BookingSettlementLine,
  ConversationMessage,
  CreditLedgerEntry,
  Customer,
  EntitlementView,
  Notification,
  Payment,
} from "./api/types.ts";
import { customerLifetimeSpendMinor, isSettledPaymentState } from "./booking-payment.ts";
import { isoDateInTz } from "./format.ts";

const DAY_MS = 86_400_000;

/* ---------------- Tabs ---------------- */

export type ProfileTab =
  "overview" | "bookings" | "money" | "messages" | "linked" | "notes" | "details";

export const PROFILE_TAB_ORDER: readonly ProfileTab[] = [
  "overview",
  "bookings",
  "money",
  "messages",
  "linked",
  "notes",
  "details",
];

export type DetailsSection = "privacy" | "tags" | "portal";

/** Old 14-tab names, so links and bookmarks from before the redesign still land. */
const LEGACY_TABS: Record<string, { tab: ProfileTab; section?: DetailsSection }> = {
  profile: { tab: "details" },
  upcoming: { tab: "overview" },
  packages: { tab: "money" },
  payments: { tab: "money" },
  invoices: { tab: "money" },
  files: { tab: "notes" },
  consents: { tab: "details", section: "privacy" },
  tags: { tab: "details", section: "tags" },
  portal: { tab: "details", section: "portal" },
  privacy: { tab: "details", section: "privacy" },
  notifications: { tab: "messages" },
};

export type TabAvailability = {
  /** Staff can see money (Money tab, Spent, Owes). */
  money: boolean;
  /** The business keeps linked records ({Records} tab). */
  linked: boolean;
  /** Anonymised clients get a read-only Bookings (and Money) view only. */
  anonymised: boolean;
};

export function availableTabs(a: TabAvailability): ProfileTab[] {
  if (a.anonymised) return a.money ? ["bookings", "money"] : ["bookings"];
  return PROFILE_TAB_ORDER.filter(
    (t) => (t !== "money" || a.money) && (t !== "linked" || a.linked),
  );
}

/** The tab (and Details section) a `?tab=` value opens, falling back to the first tab. */
export function resolveProfileTab(
  raw: string | undefined,
  a: TabAvailability,
): { tab: ProfileTab; section?: DetailsSection } {
  const tabs = availableTabs(a);
  const fallback = { tab: tabs[0] ?? "overview" };
  if (!raw) return fallback;
  const [name, hash] = raw.split("#");
  const legacy = LEGACY_TABS[name ?? ""];
  const target: { tab: ProfileTab; section?: DetailsSection } = legacy
    ? { ...legacy }
    : { tab: name as ProfileTab };
  if (!legacy && (hash === "privacy" || hash === "tags" || hash === "portal")) {
    target.section = hash;
  }
  return tabs.includes(target.tab) ? target : fallback;
}

/* ---------------- Bookings ---------------- */

type B = Pick<
  Booking,
  | "id"
  | "start"
  | "status"
  | "attendanceStatus"
  | "paymentMethod"
  | "priceMinor"
  | "paidMinor"
  | "leadCustomerId"
>;

const LIVE = new Set<Booking["status"]>(["held", "awaiting_payment", "confirmed"]);
const CANCELLED = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
]);
/** Never charged for, so nothing can be owed on them. */
const NOT_OWING = new Set<Booking["status"]>([
  "draft",
  "held",
  "expired",
  "cancelled_by_customer",
  "cancelled_by_business",
]);

export const isCancelledBooking = (b: Pick<Booking, "status">) => CANCELLED.has(b.status);
export const isNoShowBooking = (b: Pick<Booking, "status" | "attendanceStatus">) =>
  b.status === "no_show" || b.attendanceStatus === "no_show";
export const isAttendedBooking = (b: Pick<Booking, "status" | "attendanceStatus">) =>
  b.status === "completed" || b.attendanceStatus === "attended";
export const isUpcomingBooking = (b: Pick<Booking, "start" | "status">, nowMs: number) =>
  LIVE.has(b.status) && Date.parse(b.start) >= nowMs;

export type BookingFilter = "upcoming" | "past" | "cancelled" | "no_show" | "all";
export const BOOKING_FILTERS: readonly BookingFilter[] = [
  "upcoming",
  "past",
  "cancelled",
  "no_show",
  "all",
];
export const BOOKING_FILTER_LABELS: Record<BookingFilter, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
  no_show: "No-shows",
  all: "All",
};
export const BOOKING_FILTER_EMPTY: Record<BookingFilter, string> = {
  upcoming: "Nothing booked",
  past: "No past bookings yet",
  cancelled: "No cancellations",
  no_show: "No no-shows",
  all: "No bookings yet",
};

/** Past = it happened (or should have): not cancelled, not still to come, not abandoned. */
export function matchesBookingFilter(
  b: Pick<Booking, "start" | "status" | "attendanceStatus">,
  filter: BookingFilter,
  nowMs: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "upcoming":
      return isUpcomingBooking(b, nowMs);
    case "cancelled":
      return isCancelledBooking(b);
    case "no_show":
      return isNoShowBooking(b);
    case "past":
      return (
        !isCancelledBooking(b) &&
        b.status !== "expired" &&
        b.status !== "draft" &&
        Date.parse(b.start) < nowMs
      );
  }
}

export function bookingFilterCounts(
  bookings: readonly Pick<Booking, "start" | "status" | "attendanceStatus">[],
  nowMs: number,
): Record<BookingFilter, number> {
  const counts: Record<BookingFilter, number> = {
    upcoming: 0,
    past: 0,
    cancelled: 0,
    no_show: 0,
    all: 0,
  };
  for (const b of bookings) {
    for (const f of BOOKING_FILTERS) if (matchesBookingFilter(b, f, nowMs)) counts[f] += 1;
  }
  return counts;
}

export const defaultBookingFilter = (counts: Record<BookingFilter, number>): BookingFilter =>
  counts.upcoming > 0 ? "upcoming" : "past";

/** Upcoming soonest first; everything else newest first. */
export function sortBookingsFor<T extends Pick<Booking, "start">>(
  bookings: readonly T[],
  filter: BookingFilter,
): T[] {
  const sign = filter === "upcoming" ? 1 : -1;
  return [...bookings].sort((a, b) => sign * a.start.localeCompare(b.start));
}

export type Tone = "green" | "blue" | "amber" | "red" | "grey";

export function bookingStatusView(
  b: Pick<Booking, "start" | "status" | "attendanceStatus">,
  nowMs: number,
): { label: string; tone: Tone; faded?: boolean } {
  if (b.status === "late_cancelled") return { label: "Late cancelled", tone: "amber" };
  if (isCancelledBooking(b)) return { label: "Cancelled", tone: "grey", faded: true };
  if (isNoShowBooking(b)) return { label: "No-show", tone: "amber" };
  if (isAttendedBooking(b)) return { label: "Attended", tone: "green" };
  if (b.status === "expired") return { label: "Expired", tone: "grey", faded: true };
  if (b.status === "draft") return { label: "Draft", tone: "grey" };
  if (b.status === "held" || b.status === "awaiting_payment") {
    return { label: "Held", tone: "amber" };
  }
  if (Date.parse(b.start) >= nowMs) return { label: "Upcoming", tone: "grey" };
  return { label: "Not marked", tone: "grey" };
}

const SETTLEMENT_METHOD_LABELS: Record<BookingSettlementLine["method"], string> = {
  card_online: "card",
  card_manual: "card machine",
  cash: "cash",
  bank_transfer: "bank transfer",
  other: "other",
};

/** "card" / "cash" when every payment on the booking went one way; null when mixed or unknown. */
export function settlementMethod(
  lines: readonly BookingSettlementLine[] | undefined,
): string | null {
  const methods = new Set((lines ?? []).filter((l) => l.kind === "payment").map((l) => l.method));
  if (methods.size !== 1) return null;
  return SETTLEMENT_METHOD_LABELS[[...methods][0]!];
}

function refundedInFull(lines: readonly BookingSettlementLine[] | undefined): boolean {
  let paid = 0;
  let refunded = 0;
  for (const l of lines ?? []) {
    if (l.kind === "payment") paid += l.amountMinor;
    else if (l.kind === "refund") refunded += l.amountMinor;
  }
  return paid > 0 && refunded >= paid;
}

/** The Paid column: "Paid · card", "Credit used", "£15 of £45", "£45 due", "Refunded"… */
export function bookingPaidView(
  b: B,
  settlements: readonly BookingSettlementLine[] | undefined,
  nowMs: number,
  money: (minor: number) => string,
): { label: string; tone: Tone } {
  if (b.paymentMethod === "credit") {
    if (b.status === "cancelled_by_customer" || b.status === "cancelled_by_business") {
      return { label: "Credit returned", tone: "grey" };
    }
    if (b.status === "late_cancelled" || isNoShowBooking(b)) {
      return { label: "Credit kept", tone: "blue" };
    }
    return { label: "Credit used", tone: "blue" };
  }
  if (refundedInFull(settlements)) return { label: "Refunded", tone: "grey" };
  const paid = b.paidMinor ?? 0;
  if (b.priceMinor <= 0) return { label: "No charge", tone: "grey" };
  if (paid >= b.priceMinor) {
    const method =
      settlementMethod(settlements) ??
      (b.paymentMethod === "bank_transfer" ? "bank transfer" : null);
    return { label: method ? `Paid · ${method}` : "Paid", tone: "green" };
  }
  if (NOT_OWING.has(b.status) && paid === 0) return { label: "Nothing due", tone: "grey" };
  if (paid > 0) return { label: `${money(paid)} of ${money(b.priceMinor)}`, tone: "amber" };
  const past = Date.parse(b.start) < nowMs;
  return { label: `${money(b.priceMinor)} due`, tone: past ? "red" : "amber" };
}

/** The one pill on a "Coming up" row. */
export function comingUpPill(
  b: B,
  money: (minor: number) => string,
): { label: string; tone: Tone } | null {
  if (b.paymentMethod === "credit") return { label: "Credit", tone: "blue" };
  if (b.status === "held" || b.status === "awaiting_payment")
    return { label: "Held", tone: "amber" };
  if (b.priceMinor <= 0) return null;
  const paid = b.paidMinor ?? 0;
  if (paid >= b.priceMinor) return { label: "Paid", tone: "green" };
  if (paid > 0) return { label: `${money(b.priceMinor - paid)} due`, tone: "amber" };
  return { label: "Unpaid", tone: "red" };
}

export function owedOn(b: B, nowMs: number): number {
  if (Date.parse(b.start) >= nowMs) return 0;
  if (NOT_OWING.has(b.status) || b.paymentMethod === "credit" || b.priceMinor <= 0) return 0;
  return Math.max(0, b.priceMinor - (b.paidMinor ?? 0));
}

/* ---------------- Summary strip ---------------- */

export type ProfileSummary = {
  attended: number;
  noShows: number;
  cancelled: number;
  next: string | null;
  spentMinor: number;
  refundedMinor: number;
  owedMinor: number;
  /** Bookings with money owed, oldest first. */
  owedBookingIds: string[];
  oldestOwedAt: string | null;
};

/** Money follows the lead client, who pays; sessions count wherever the client attended. */
export function profileSummary<T extends B>(
  clientId: string,
  bookings: readonly T[],
  payments: readonly Pick<Payment, "bookingId" | "amountMinor" | "amountRefundedMinor" | "state">[],
  nowMs: number,
): ProfileSummary & { nextBooking: T | null } {
  let attended = 0;
  let noShows = 0;
  let cancelled = 0;
  let nextBooking: T | null = null;
  const owed: { id: string; at: string; due: number }[] = [];
  for (const b of bookings) {
    const startMs = Date.parse(b.start);
    if (isCancelledBooking(b)) cancelled += 1;
    else if (isNoShowBooking(b)) noShows += 1;
    else if (isAttendedBooking(b) && startMs <= nowMs) attended += 1;
    if (isUpcomingBooking(b, nowMs) && (!nextBooking || b.start < nextBooking.start)) {
      nextBooking = b;
    }
    if (!b.leadCustomerId || b.leadCustomerId === clientId) {
      const due = owedOn(b, nowMs);
      if (due > 0) owed.push({ id: b.id, at: b.start, due });
    }
  }
  owed.sort((a, b) => a.at.localeCompare(b.at));
  const settled = payments.filter((p) => isSettledPaymentState(p.state));
  return {
    attended,
    noShows,
    cancelled,
    next: nextBooking?.start ?? null,
    nextBooking,
    spentMinor: customerLifetimeSpendMinor(bookings, payments),
    refundedMinor: settled.reduce((sum, p) => sum + p.amountRefundedMinor, 0),
    owedMinor: owed.reduce((sum, o) => sum + o.due, 0),
    owedBookingIds: owed.map((o) => o.id),
    oldestOwedAt: owed[0]?.at ?? null,
  };
}

/** "attended · 1 no-show · 2 cancelled"; the extras only when there are any. */
export function sessionsSubline(s: Pick<ProfileSummary, "noShows" | "cancelled">): string {
  const parts = ["attended"];
  if (s.noShows > 0) parts.push(`${s.noShows} no-show${s.noShows === 1 ? "" : "s"}`);
  if (s.cancelled > 0) parts.push(`${s.cancelled} cancelled`);
  return parts.join(" · ");
}

export const entitlementIsExpired = (
  e: Pick<EntitlementView["entitlement"], "expiresAt" | "status">,
  nowMs: number,
) => e.status === "expired" || Date.parse(e.expiresAt) <= nowMs;

export type CreditsSummary = {
  left: number;
  issued: number;
  /** Packages still in date. */
  activePackages: number;
  soonestExpiry: string | null;
  /** The soonest in-date package with credits left runs out within 30 days. */
  expiringSoon: boolean;
};

export function creditsSummary(
  views: readonly Pick<EntitlementView, "entitlement" | "balance">[],
  nowMs: number,
): CreditsSummary {
  const active = views.filter((v) => !entitlementIsExpired(v.entitlement, nowMs));
  const withCredits = active.filter((v) => v.balance.available > 0);
  const soonest =
    [...withCredits].sort((a, b) =>
      a.entitlement.expiresAt.localeCompare(b.entitlement.expiresAt),
    )[0]?.entitlement.expiresAt ?? null;
  return {
    left: withCredits.reduce((sum, v) => sum + v.balance.available, 0),
    issued: active.reduce((sum, v) => sum + v.entitlement.unitsIssued, 0),
    activePackages: active.length,
    soonestExpiry: soonest,
    expiringSoon: soonest !== null && Date.parse(soonest) - nowMs <= 30 * DAY_MS,
  };
}

export const expiresWithin30Days = (iso: string, nowMs: number) =>
  Date.parse(iso) > nowMs && Date.parse(iso) - nowMs <= 30 * DAY_MS;

/* ---------------- Header ---------------- */

export type ProfilePillKind = "anonymised" | "archived" | "owes" | "package" | "new";
export const PROFILE_PILL_LABELS: Record<ProfilePillKind, string> = {
  anonymised: "Anonymised",
  archived: "Archived",
  owes: "Owes",
  package: "Package",
  new: "New",
};
export const PROFILE_PILL_TONES: Record<ProfilePillKind, Tone> = {
  anonymised: "red",
  archived: "grey",
  owes: "red",
  package: "blue",
  new: "green",
};

/** One pill, in priority order. An ordinary active client gets none. */
export function profilePill(
  c: Pick<Customer, "status" | "createdAt">,
  facts: { owedMinor: number; creditsLeft: number; sessions: number },
  nowMs: number,
): ProfilePillKind | null {
  if (c.status === "anonymised") return "anonymised";
  if (c.status === "archived") return "archived";
  if (facts.owedMinor > 0) return "owes";
  if (facts.creditsLeft > 0) return "package";
  if (facts.sessions === 0 && nowMs - Date.parse(c.createdAt) < 30 * DAY_MS) return "new";
  return null;
}

/** Contact details some roles get back masked ("j***@…"); shown as returned, never re-saved. */
export const isMaskedContact = (value: string | null | undefined) => Boolean(value?.includes("*"));

/** Splits a stored "+447700900123" into a known dialling code and the rest, as typed. */
export function splitE164(
  stored: string | null | undefined,
  codes: readonly string[],
  fallbackCode: string,
): { code: string; national: string } {
  const raw = (stored ?? "").replace(/[\s()-]/g, "");
  if (!raw.startsWith("+")) return { code: fallbackCode, national: stored ?? "" };
  const code = [...codes].sort((a, b) => b.length - a.length).find((c) => raw.startsWith(`+${c}`));
  if (!code) return { code: fallbackCode, national: stored ?? "" };
  const rest = raw.slice(code.length + 1);
  return { code, national: code === "44" || code === "353" ? `0${rest}` : rest };
}

/* ---------------- Dates ---------------- */

/** "18 Sept 2026". */
export const longDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));

/** "Thu 22 Oct". */
export const weekdayDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));

/** "12 Oct". */
export const shortDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );

/** "Sept 2026". */
export const monthYear = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone }).format(
    new Date(iso),
  );

/** "Today", "Yesterday", else "Mon 19 Oct" (with the year once it isn't this year). */
export function dayLabel(iso: string, now: Date, timeZone: string): string {
  const day = isoDateInTz(iso, timeZone);
  const today = isoDateInTz(now.toISOString(), timeZone);
  const yesterday = isoDateInTz(new Date(now.getTime() - DAY_MS).toISOString(), timeZone);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const label = weekdayDate(iso, timeZone);
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
}

/** Groups (already sorted) items by calendar month, in order of first appearance. */
export function groupByMonth<T>(
  items: readonly T[],
  isoOf: (item: T) => string,
  timeZone: string,
): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const iso = isoOf(item);
    const key = isoDateInTz(iso, timeZone).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
          timeZone,
        }).format(new Date(iso)),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/* ---------------- Money ---------------- */

export type MoneyRow = {
  id: string;
  at: string;
  bookingId: string | null;
  packageId: string | null;
  forLabel: string;
  method: string;
  /** Signed minor units; null for credit rows. */
  amountMinor: number | null;
  credits: number | null;
  currency: string;
  status: { label: string; tone: Tone };
  receiptUrl: string | null;
  providerRef: string | null;
};

const PAYMENT_STATE_VIEW: Record<Payment["state"], { label: string; tone: Tone }> = {
  succeeded: { label: "Paid", tone: "green" },
  partially_refunded: { label: "Part refunded", tone: "amber" },
  refunded: { label: "Refunded", tone: "grey" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "grey" },
  requires_action: { label: "Pending", tone: "amber" },
  processing: { label: "Pending", tone: "amber" },
  disputed: { label: "Disputed", tone: "red" },
};

const ROW_METHOD_LABELS: Record<BookingSettlementLine["method"], string> = {
  card_online: "Card",
  card_manual: "Card machine",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

type MoneyBooking = B & Pick<Booking, "serviceSnapshot" | "lineItems" | "currency" | "seatCount">;

export const bookingTitle = (b: Pick<Booking, "serviceSnapshot" | "lineItems">) =>
  (b.lineItems?.length ?? 0) > 1
    ? b.lineItems.map((li) => li.name).join(" + ")
    : b.serviceSnapshot.name;

/**
 * Every movement of money for the client, newest first: what the settlement ledger
 * recorded against each booking (card, card machine, cash, bank transfer, refunds),
 * card payments that never settled, package purchases, and package credits used.
 */
export function moneyRows(input: {
  bookings: readonly MoneyBooking[];
  settlementsByBooking: ReadonlyMap<string, readonly BookingSettlementLine[] | undefined>;
  payments: readonly Payment[];
  packageName: (packageId: string | null) => string;
  bookingLabel: (b: MoneyBooking) => string;
  nowMs: number;
}): MoneyRow[] {
  const rows: MoneyRow[] = [];
  const paymentsById = new Map(input.payments.map((p) => [p.id, p]));
  const bookingsById = new Map(input.bookings.map((b) => [b.id, b]));

  for (const b of input.bookings) {
    const forLabel = input.bookingLabel(b);
    if (b.paymentMethod === "credit") {
      const spent =
        isAttendedBooking(b) ||
        b.status === "late_cancelled" ||
        isNoShowBooking(b) ||
        (b.status === "confirmed" && Date.parse(b.start) < input.nowMs);
      if (spent) {
        rows.push({
          id: `credit-${b.id}`,
          at: b.start,
          bookingId: b.id,
          packageId: null,
          forLabel,
          method: "Package credit",
          amountMinor: null,
          credits: Math.max(1, b.seatCount ?? 1),
          currency: b.currency,
          status: { label: "Used", tone: "blue" },
          receiptUrl: null,
          providerRef: null,
        });
      }
      continue;
    }
    const lines = input.settlementsByBooking.get(b.id);
    if (lines && lines.length > 0) {
      for (const l of lines) {
        const payment = l.paymentId ? paymentsById.get(l.paymentId) : undefined;
        const refund = l.kind === "refund" || l.kind === "dispute";
        let status: { label: string; tone: Tone };
        if (l.kind === "refund") status = { label: "Refunded", tone: "grey" };
        else if (l.kind === "dispute") status = { label: "Disputed", tone: "red" };
        else if (l.kind === "dispute_reversal") status = { label: "Dispute won", tone: "green" };
        else
          status = payment ? PAYMENT_STATE_VIEW[payment.state] : { label: "Paid", tone: "green" };
        rows.push({
          id: `settlement-${l.id}`,
          at: l.occurredAt,
          bookingId: b.id,
          packageId: null,
          forLabel,
          method: ROW_METHOD_LABELS[l.method],
          amountMinor: refund ? -l.amountMinor : l.amountMinor,
          credits: null,
          currency: l.currency,
          status,
          receiptUrl: l.kind === "payment" ? (payment?.receiptUrl ?? null) : null,
          providerRef: payment?.providerPaymentId ?? null,
        });
      }
    } else if ((b.paidMinor ?? 0) > 0) {
      rows.push({
        id: `paid-${b.id}`,
        at: b.start,
        bookingId: b.id,
        packageId: null,
        forLabel,
        method: b.paymentMethod === "bank_transfer" ? "Bank transfer" : "Recorded on booking",
        amountMinor: b.paidMinor ?? 0,
        credits: null,
        currency: b.currency,
        status: { label: "Paid", tone: "green" },
        receiptUrl: null,
        providerRef: null,
      });
    }
  }

  for (const p of input.payments) {
    const settledOnBooking =
      p.bookingId != null && bookingsById.has(p.bookingId) && isSettledPaymentState(p.state);
    if (settledOnBooking) continue;
    const booking = p.bookingId ? bookingsById.get(p.bookingId) : undefined;
    rows.push({
      id: `payment-${p.id}`,
      at: p.createdAt,
      bookingId: p.bookingId,
      packageId: p.packageId,
      forLabel: booking
        ? input.bookingLabel(booking)
        : p.packageId || p.packagePurchaseId
          ? input.packageName(p.packageId)
          : "Payment",
      method: "Card",
      amountMinor: p.amountMinor,
      credits: null,
      currency: p.currency,
      status: PAYMENT_STATE_VIEW[p.state],
      receiptUrl: p.receiptUrl,
      providerRef: p.providerPaymentId,
    });
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------------- Credits ledger ---------------- */

export type AdjustReason = "goodwill" | "correction" | "transferred" | "other";
export const ADJUST_REASON_LABELS: Record<AdjustReason, string> = {
  goodwill: "Goodwill",
  correction: "Correction",
  transferred: "Transferred",
  other: "Other",
};

export const adjustReasonCode = (direction: "add" | "remove", reason: AdjustReason) =>
  `manual_${direction}_${reason}`;

const LEDGER_LABELS: Record<CreditLedgerEntry["type"], string> = {
  issued: "Issued",
  reserved: "Reserved",
  reservation_released: "Released",
  consumed: "Used",
  returned: "Returned",
  adjusted_positive: "Added",
  adjusted_negative: "Removed",
  expired: "Expired",
  transferred: "Transferred",
};

const NEGATIVE = new Set<CreditLedgerEntry["type"]>([
  "reserved",
  "consumed",
  "adjusted_negative",
  "expired",
  "transferred",
]);

/** "Used", "Added · Goodwill", "Kept after no-show", with the signed units. */
export function ledgerEntryView(e: Pick<CreditLedgerEntry, "type" | "units" | "reasonCode">): {
  label: string;
  signed: number;
} {
  const signed = NEGATIVE.has(e.type) ? -Math.abs(e.units) : Math.abs(e.units);
  let label = LEDGER_LABELS[e.type] ?? e.type.replace(/_/g, " ");
  const reason = /^manual_(?:add|remove)_(\w+)$/.exec(e.reasonCode ?? "")?.[1] as
    AdjustReason | undefined;
  if (reason && ADJUST_REASON_LABELS[reason]) label = `${label} · ${ADJUST_REASON_LABELS[reason]}`;
  if (/no.?show/i.test(e.reasonCode ?? "") && e.units === 0) label = "Kept after no-show";
  return { label, signed };
}

export const signedUnits = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/* ---------------- Message timeline ---------------- */

export type TimelineItem =
  | { kind: "message"; at: string; message: ConversationMessage }
  | { kind: "system"; at: string; notification: Notification };

export function buildTimeline(
  messages: readonly ConversationMessage[],
  notifications: readonly Notification[],
): TimelineItem[] {
  return [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, message: m })),
    ...notifications.map((n) => ({ kind: "system" as const, at: n.createdAt, notification: n })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

const CHANNEL_WORDS: Record<Notification["channel"], string> = {
  sms: "text",
  email: "email",
  in_app: "in the app",
};

const FALLBACK_REASONS: Record<NonNullable<Notification["fallbackReason"]>, string> = {
  no_phone: "no mobile number",
  opted_out: "they opted out of texts",
  no_credits: "no credits",
  not_entitled: "texts aren't on your plan",
  sms_unavailable: "texts unavailable",
};

const humanise = (key: string) => {
  const words = key.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "Booking reminder · sent by text · opened", or the text-failed fallback line. */
export function notificationText(
  n: Pick<
    Notification,
    "subject" | "templateKey" | "channel" | "requestedChannel" | "fallbackReason" | "readAt"
  >,
): string {
  const what = n.subject?.trim() || humanise(n.templateKey);
  const opened = n.readAt ? " · opened" : "";
  if (n.requestedChannel === "sms" && n.channel !== "sms" && n.fallbackReason) {
    return `${what} · text failed: ${FALLBACK_REASONS[n.fallbackReason]}, sent by ${CHANNEL_WORDS[n.channel]} instead${opened}`;
  }
  return `${what} · sent by ${CHANNEL_WORDS[n.channel]}${opened}`;
}

export const unreadFromClient = (messages: readonly ConversationMessage[]) =>
  messages.filter((m) => m.senderType === "customer" && !m.readByStaffAt).length;
