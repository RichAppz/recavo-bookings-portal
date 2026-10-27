// Relative so the node test runner (no path aliases) can load it too.
import { formatMoney } from "./format.ts";

/**
 * Rules for the Payments page: the shapes the activity API returns, periods in the
 * business's time zone, filters, the five figures, status and method words, the CSV
 * export, and Stripe's requirement keys and dispute reasons in plain English.
 */

export type PaymentMethod = "card_online" | "card_manual" | "cash" | "bank_transfer" | "other";

export type PaymentStatus =
  | "requires_action"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded"
  | "disputed";

export type ActivityParty = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type ActivityBooking = {
  id: string;
  reference: string;
  serviceName: string;
  start: string;
  timezone: string;
  status: string;
};

export type ActivityRefund = {
  id: string;
  amountMinor: number;
  at: string;
  method: PaymentMethod;
  reasonCode: string | null;
  note: string | null;
  by: { id: string; name: string | null } | null;
  state: "pending" | "succeeded" | "failed";
};

export type PaymentDisputeInfo = {
  id: string;
  reason: string | null;
  amountMinor: number | null;
  feeMinor: number | null;
  dueBy: string | null;
  status: string | null;
  openedAt: string | null;
  closedAt?: string | null;
  evidenceSentAt?: string | null;
  acceptedAt?: string | null;
};

export type ActivityRow = {
  /** The payment id for card payments, the settlement id for recorded ones. */
  id: string;
  source: "card" | "manual";
  paymentId: string | null;
  method: PaymentMethod;
  amountMinor: number;
  refundedMinor: number;
  feeMinor: number | null;
  /** Absent from older API builds. */
  card?: { brand: string | null; last4: string | null } | null;
  failureReason?: string | null;
  dispute?: PaymentDisputeInfo | null;
  currency: string;
  status: PaymentStatus;
  at: string;
  customer: ActivityParty | null;
  booking: ActivityBooking | null;
  package: { id: string; name: string } | null;
  recordedBy: { id: string; name: string | null } | null;
  note: string | null;
  receiptNumber: string | null;
  receiptUrl: string | null;
  refunds: ActivityRefund[];
};

export type ActivityResult = {
  rows: ActivityRow[];
  refundsInPeriod: { count: number; totalMinor: number };
};

export type OwedRow = {
  bookingId: string;
  reference: string;
  start: string;
  end: string;
  timezone: string;
  serviceName: string;
  status: string;
  done: boolean;
  customer: ActivityParty | null;
  paymentMethod: string;
  priceMinor: number;
  paidMinor: number;
  depositMinor: number | null;
  outstandingMinor: number;
  currency: string;
  daysOutstanding: number;
};

// --- Words ---------------------------------------------------------------------------

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "card_online",
  "card_manual",
  "cash",
  "bank_transfer",
  "other",
];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  card_online: "Card online",
  card_manual: "Card machine",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "succeeded",
  "requires_action",
  "processing",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
  "disputed",
];

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  succeeded: "Paid",
  requires_action: "Waiting for client",
  processing: "Processing",
  failed: "Failed",
  cancelled: "Cancelled",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  disputed: "Disputed",
};

export type StatusTone = "green" | "blue" | "red" | "grey";

export const STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  succeeded: "green",
  requires_action: "blue",
  processing: "blue",
  failed: "red",
  cancelled: "grey",
  partially_refunded: "grey",
  refunded: "grey",
  disputed: "red",
};

/** Refund reasons as chips. Codes are what the API (and Stripe) take. */
export const REFUND_REASONS = [
  { code: "requested_by_customer", label: "Client asked" },
  { code: "duplicate", label: "Charged twice" },
  { code: "service_not_provided", label: "Job not done" },
  { code: "other", label: "Other" },
] as const;

const REFUND_REASON_WORDS: Record<string, string> = {
  requested_by_customer: "Requested by client",
  duplicate: "Charged twice",
  service_not_provided: "Job not done",
  fraudulent: "Fraudulent",
  other: "Other",
};

export function refundReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUND_REASON_WORDS[code] ?? code.replace(/_/g, " ");
}

const DISPUTE_REASONS: Record<string, string> = {
  product_not_received: "Product not received",
  fraudulent: "They don't recognise the payment",
  duplicate: "Charged twice",
  subscription_canceled: "Not happy with the service",
  product_unacceptable: "Not happy with the service",
  credit_not_processed: "Expected a refund",
};

export function disputeReasonLabel(reason: string | null | undefined): string {
  return (reason && DISPUTE_REASONS[reason]) || "General";
}

export function disputeIsOpen(row: Pick<ActivityRow, "status" | "dispute">): boolean {
  const d = row.dispute;
  if (row.status !== "disputed") return false;
  if (!d) return true;
  return !d.closedAt && d.status !== "won" && d.status !== "lost";
}

/** Stripe's `currently_due` keys in plain English, de-duplicated, unknowns counted. */
export function requirementLabels(keys: readonly string[]): string[] {
  const labels: string[] = [];
  let other = 0;
  const add = (label: string) => {
    if (!labels.includes(label)) labels.push(label);
  };
  for (const key of keys) {
    if (key.startsWith("individual.verification.") || key.includes(".verification.document")) {
      add("A photo of your ID");
    } else if (key.startsWith("individual.dob")) add("Your date of birth");
    else if (key.startsWith("individual.address")) add("Your home address");
    else if (key === "external_account" || key.startsWith("external_account.")) {
      add("Your bank account");
    } else if (key === "business_profile.url" || key === "business_profile.mcc") {
      add("What your business does");
    } else if (key.startsWith("tos_acceptance")) add("Accept Stripe's terms");
    else other += 1;
  }
  if (other > 0) labels.push(other === 1 ? "1 other detail" : `${other} other details`);
  return labels;
}

// --- Dates in the business's time zone ------------------------------------------------

function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - (at.getTime() - at.getMilliseconds());
}

/** Midnight at the start of the given calendar day in `timeZone`. */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month, day);
  let at = guess - tzOffsetMs(new Date(guess), timeZone);
  at = guess - tzOffsetMs(new Date(at), timeZone);
  return new Date(at);
}

/** The calendar day `at` falls on in `timeZone`; month is 0-11 and weekday 0 is Monday. */
export function zonedDay(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    weekday: Math.max(0, weekdays.indexOf(get("weekday"))),
  };
}

export const PERIODS = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "custom",
] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "this_month";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
  custom: "Custom",
};

function parseDay(value: string | undefined): { y: number; m: number; d: number } | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/**
 * Half-open `[from, to)` for a period in the business's time zone. Custom takes
 * inclusive `YYYY-MM-DD` days; a missing or back-to-front pair falls back to this month.
 */
export function periodRange(
  period: Period,
  now: Date,
  timeZone: string,
  custom: { from?: string; to?: string } = {},
): { from: Date; to: Date } {
  const today = zonedDay(now, timeZone);
  const day = (y: number, m: number, d: number) => zonedMidnight(y, m, d, timeZone);
  const tomorrow = day(today.year, today.month, today.day + 1);
  switch (period) {
    case "today":
      return { from: day(today.year, today.month, today.day), to: tomorrow };
    case "this_week":
      return { from: day(today.year, today.month, today.day - today.weekday), to: tomorrow };
    case "last_month":
      return {
        from: day(today.year, today.month - 1, 1),
        to: day(today.year, today.month, 1),
      };
    case "last_3_months":
      return { from: day(today.year, today.month - 2, 1), to: tomorrow };
    case "this_year":
      return { from: day(today.year, 0, 1), to: tomorrow };
    case "custom": {
      const a = parseDay(custom.from);
      const b = parseDay(custom.to) ?? a;
      if (a && b) {
        const from = day(a.y, a.m, a.d);
        const to = day(b.y, b.m, b.d + 1);
        if (to > from) return { from, to };
      }
      return periodRange("this_month", now, timeZone);
    }
    case "this_month":
    default:
      return { from: day(today.year, today.month, 1), to: tomorrow };
  }
}

function sameDay(a: ReturnType<typeof zonedDay>, b: ReturnType<typeof zonedDay>): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** "Today", "Yesterday" or "Mon 20 Oct", in the business's time zone. */
export function dayLabel(iso: string, timeZone: string, now: Date): string {
  const at = zonedDay(new Date(iso), timeZone);
  const today = zonedDay(now, timeZone);
  if (sameDay(at, today)) return "Today";
  const startOfToday = zonedMidnight(today.year, today.month, today.day, timeZone);
  if (sameDay(at, zonedDay(new Date(startOfToday.getTime() - 1), timeZone))) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(at.year !== today.year ? { year: "numeric" } : {}),
  })
    .format(new Date(iso))
    .replace(",", "");
}

export function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "21 Oct" (with the year when it isn't this year). */
export function shortDate(iso: string, timeZone: string, now: Date = new Date()): string {
  const sameYear = zonedDay(new Date(iso), timeZone).year === zonedDay(now, timeZone).year;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(iso));
}

// --- Rows -------------------------------------------------------------------------------

export function clientName(row: { customer: ActivityParty | null }): string {
  return row.customer?.name?.trim() || "No client";
}

/** "Ceramic coating · Tue 21 Oct" or "Package: 5 mini valets". */
export function whatFor(row: ActivityRow, timeZone: string, now: Date): string | null {
  if (row.booking) {
    const tz = row.booking.timezone || timeZone;
    return `${row.booking.serviceName} · ${dayLabel(row.booking.start, tz, now)}`;
  }
  if (row.package) return `Package: ${row.package.name}`;
  return null;
}

export function latestRefund(row: ActivityRow): ActivityRefund | null {
  const done = row.refunds.filter((r) => r.state !== "failed");
  return done.length > 0 ? done.reduce((a, b) => (a.at > b.at ? a : b)) : null;
}

/** The small line under a status pill. */
export function statusLine(row: ActivityRow, timeZone: string, now: Date): string | null {
  switch (row.status) {
    case "succeeded":
      if (row.source === "manual") {
        if (row.method === "bank_transfer") return "Marked received";
        return row.recordedBy?.name ? `Recorded by ${row.recordedBy.name}` : null;
      }
      return null;
    case "requires_action":
      return "Card check not finished";
    case "failed":
      return row.failureReason?.trim() || null;
    case "partially_refunded": {
      const last = latestRefund(row);
      return last ? `Refunded ${shortDate(last.at, timeZone, now)}` : null;
    }
    case "refunded":
      return refundReasonLabel(latestRefund(row)?.reasonCode);
    case "disputed": {
      const d = row.dispute;
      if (d?.status === "lost") return "Dispute lost";
      return d?.dueBy ? `Respond by ${shortDate(d.dueBy, timeZone, now)}` : null;
    }
    default:
      return null;
  }
}

export function refundableMinor(row: ActivityRow): number {
  if (row.status !== "succeeded" && row.status !== "partially_refunded") return 0;
  return Math.max(0, row.amountMinor - row.refundedMinor);
}

export function rowAriaLabel(row: ActivityRow, timeZone: string, now: Date): string {
  const parts = [clientName(row)];
  if (row.booking) {
    parts.push(row.booking.serviceName.toLowerCase());
    parts.push(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: row.booking.timezone || timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
      })
        .format(new Date(row.booking.start))
        .replace(",", ""),
    );
  } else if (row.package) parts.push(`package ${row.package.name}`);
  parts.push(METHOD_LABELS[row.method].toLowerCase());
  parts.push(formatMoney(row.amountMinor, row.currency, { compact: true }));
  parts.push(STATUS_LABELS[row.status].toLowerCase());
  parts.push(`${dayLabel(row.at, timeZone, now).toLowerCase()} ${timeLabel(row.at, timeZone)}`);
  return parts.join(", ");
}

// --- Filters, tabs, figures ------------------------------------------------------------

export const PAYMENT_TABS = ["all", "owed", "refunds"] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];

export type PaymentFilters = {
  q?: string;
  methods?: readonly PaymentMethod[];
  statuses?: readonly PaymentStatus[];
  clientId?: string;
};

export function hasRowFilters(f: PaymentFilters): boolean {
  return Boolean(f.q?.trim() || f.methods?.length || f.statuses?.length || f.clientId);
}

export function matchesFilters(row: ActivityRow, f: PaymentFilters): boolean {
  if (f.clientId && row.customer?.id !== f.clientId) return false;
  if (f.methods?.length && !f.methods.includes(row.method)) return false;
  if (f.statuses?.length && !f.statuses.includes(row.status)) return false;
  const q = f.q?.trim().toLowerCase();
  if (q) {
    const hay = [row.customer?.name, row.customer?.email, row.receiptNumber, row.booking?.reference]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Owed rows only follow the client and search filters (they have no method or status). */
export function owedMatches(row: OwedRow, f: PaymentFilters): boolean {
  if (f.clientId && row.customer?.id !== f.clientId) return false;
  const q = f.q?.trim().toLowerCase();
  if (q) {
    const hay = [row.customer?.name, row.customer?.email, row.reference]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function isRefundOrDispute(row: ActivityRow): boolean {
  return (
    row.refundedMinor > 0 ||
    row.status === "refunded" ||
    row.status === "partially_refunded" ||
    row.status === "disputed" ||
    Boolean(row.dispute)
  );
}

const TAKEN: readonly PaymentStatus[] = ["succeeded", "partially_refunded", "refunded"];

export type PaymentFigures = {
  takenMinor: number;
  takenCount: number;
  refundedMinor: number;
  refundCount: number;
  feesMinor: number;
  /** No card payments in the period at all. */
  noCardPayments: boolean;
  /** Some card payments in the period have no fee from Stripe yet. */
  feesIncomplete: boolean;
  netMinor: number;
  owedMinor: number;
  owedCount: number;
};

/**
 * The five tiles. `rows` and `owed` are already filtered (everything except tab and
 * paging). Refunds count by refund date: unfiltered, that is the API's own total for the
 * period (including refunds of older payments); filtered, the matching rows' refunds
 * that fall in the period.
 */
export function paymentFigures(input: {
  rows: readonly ActivityRow[];
  owed: readonly OwedRow[];
  range: { from: Date; to: Date };
  refundsInPeriod?: { count: number; totalMinor: number } | null;
  filtered: boolean;
}): PaymentFigures {
  const taken = input.rows.filter((r) => TAKEN.includes(r.status));
  const takenMinor = taken.reduce((s, r) => s + r.amountMinor, 0);
  let refundedMinor = 0;
  let refundCount = 0;
  if (!input.filtered && input.refundsInPeriod) {
    refundedMinor = input.refundsInPeriod.totalMinor;
    refundCount = input.refundsInPeriod.count;
  } else {
    for (const row of input.rows) {
      for (const r of row.refunds) {
        const at = new Date(r.at);
        if (r.state === "failed" || at < input.range.from || at >= input.range.to) continue;
        refundedMinor += r.amountMinor;
        refundCount += 1;
      }
    }
  }
  const cards = taken.filter((r) => r.method === "card_online");
  const feesMinor = cards.reduce((s, r) => s + (r.feeMinor ?? 0), 0);
  return {
    takenMinor,
    takenCount: taken.length,
    refundedMinor,
    refundCount,
    feesMinor,
    noCardPayments: cards.length === 0,
    feesIncomplete: cards.some((r) => r.feeMinor == null),
    netMinor: takenMinor - refundedMinor - feesMinor,
    owedMinor: input.owed.reduce((s, r) => s + r.outstandingMinor, 0),
    owedCount: input.owed.length,
  };
}

export const PAGE_SIZE = 25;

export function pageOf<T>(
  items: readonly T[],
  page: number,
): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, pages };
}

// --- Owed -------------------------------------------------------------------------------

/** The method Mark paid starts on, as the record-payment endpoint names it. */
export function expectedMethod(row: OwedRow): "bank_transfer" | "cash" | "card" | "other" {
  return row.paymentMethod === "bank_transfer" ? "bank_transfer" : "cash";
}

export function expectingLabel(row: OwedRow): string {
  return row.paymentMethod === "bank_transfer" ? "Bank transfer" : "Pay on the day";
}

/** The line under "Expecting": reference and age for transfers, deposit, or not recorded. */
export function expectingLine(row: OwedRow, currency: string): string {
  if (row.paymentMethod === "bank_transfer") {
    const days = row.daysOutstanding === 1 ? "1 day" : `${row.daysOutstanding} days`;
    return `Ref ${row.reference} · ${days}`;
  }
  if (row.paidMinor > 0) {
    const paid = formatMoney(row.paidMinor, currency, { compact: true });
    return `${row.depositMinor ? "Deposit" : "Part"} ${paid} paid`;
  }
  return row.done ? "Not recorded" : "Due before";
}

// --- Export -----------------------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const decimal = (minor: number | null) => (minor == null ? "" : (minor / 100).toFixed(2));

export function paymentsCsv(rows: readonly ActivityRow[], timeZone: string, now: Date): string {
  const header = [
    "Date",
    "Client",
    "What for",
    "Method",
    "Amount",
    "Refunded",
    "Fee",
    "Net",
    "Status",
    "Receipt number",
  ];
  const lines = rows.map((r) => {
    const date = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(r.at))
      .replace(",", "");
    const net = r.amountMinor - r.refundedMinor - (r.feeMinor ?? 0);
    return [
      date,
      clientName(r),
      whatFor(r, timeZone, now) ?? "",
      METHOD_LABELS[r.method],
      decimal(r.amountMinor),
      decimal(r.refundedMinor),
      decimal(r.feeMinor),
      decimal(net),
      STATUS_LABELS[r.status],
      r.receiptNumber ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
