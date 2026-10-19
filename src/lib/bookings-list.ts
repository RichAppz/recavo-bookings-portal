/**
 * Pure helpers for the Bookings list (design spec 19 Oct 2026 §5): tabs, the
 * "needs action" rule, date-range presets, day grouping, the status pill and the
 * CSV export. No React, no API — so every rule here has a unit test.
 */
import type { Booking } from "./api/types.ts";
import { bookingSettlement } from "./booking-payment.ts";

export type BookingsTab = "upcoming" | "needs_action" | "past" | "all";
export const BOOKINGS_TABS: readonly BookingsTab[] = ["upcoming", "needs_action", "past", "all"];

export type RangePreset = "this_week" | "next_7" | "this_month" | "last_30" | "default" | "custom";

export const RANGE_PRESETS: readonly { value: RangePreset; label: string }[] = [
  { value: "default", label: "Two weeks back to a month ahead" },
  { value: "this_week", label: "This week" },
  { value: "next_7", label: "Next 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "custom", label: "Custom dates" },
];

const CANCELLED = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
]);
const HELD = new Set<Booking["status"]>(["held", "awaiting_payment"]);

export const isCancelledBooking = (b: Pick<Booking, "status">) => CANCELLED.has(b.status);

const pad = (n: number) => `${n}`.padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/** Inclusive local-date range for a preset. `custom` keeps whatever is already set. */
export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  today: Date,
): { from: string; to: string } {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case "this_week": {
      const monday = shiftDays(day, -((day.getDay() + 6) % 7));
      return { from: iso(monday), to: iso(shiftDays(monday, 6)) };
    }
    case "next_7":
      return { from: iso(day), to: iso(shiftDays(day, 6)) };
    case "this_month":
      return {
        from: iso(new Date(day.getFullYear(), day.getMonth(), 1)),
        to: iso(new Date(day.getFullYear(), day.getMonth() + 1, 0)),
      };
    case "last_30":
      return { from: iso(shiftDays(day, -29)), to: iso(day) };
    case "default":
      return { from: iso(shiftDays(day, -14)), to: iso(shiftDays(day, 30)) };
  }
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

/** "5 Oct to 18 Nov", or "28 Dec 2026 to 4 Jan 2027" when the years differ. */
export function rangeLabel(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00`);
  const z = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(z.getTime())) return "Pick dates";
  const part = (d: Date, year: boolean) =>
    `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;
  const years = a.getFullYear() !== z.getFullYear();
  if (from === to) return part(a, years);
  return `${part(a, years)} to ${part(z, years)}`;
}

const SEVEN_DAYS = 7 * 86_400_000;

/**
 * Spec §5.1: held (awaiting payment); unpaid or part paid with the session within
 * 7 days; or a past session nobody has marked attended or not. Cancelled, expired
 * and draft bookings never need action — nothing is going to happen to them.
 */
export function needsAction(b: Booking, now: Date): boolean {
  if (CANCELLED.has(b.status) || b.status === "expired" || b.status === "draft") return false;
  if (HELD.has(b.status)) return true;
  const start = new Date(b.start).getTime();
  const end = new Date(b.end).getTime();
  const settlement = bookingSettlement(b);
  const moneyDue =
    settlement.state === "unpaid" ||
    settlement.state === "part_paid" ||
    settlement.state === "deposit_paid";
  if (moneyDue && start >= now.getTime() && start - now.getTime() <= SEVEN_DAYS) return true;
  if (end < now.getTime() && b.attendanceStatus === "unknown" && b.status !== "no_show") {
    return true;
  }
  return false;
}

export function inTab(b: Booking, tab: BookingsTab, now: Date): boolean {
  switch (tab) {
    case "all":
      return true;
    case "needs_action":
      return needsAction(b, now);
    case "upcoming":
      return new Date(b.end).getTime() >= now.getTime();
    case "past":
      return new Date(b.end).getTime() < now.getTime();
  }
}

export type SortKey = "time" | "client" | "amount";

/** Upcoming reads soonest first; Past and All read newest first (spec §5.1). */
export function defaultSortDir(tab: BookingsTab): "asc" | "desc" {
  return tab === "upcoming" || tab === "needs_action" ? "asc" : "desc";
}

export function sortBookings(
  rows: readonly Booking[],
  key: SortKey,
  dir: "asc" | "desc",
  clientName: (b: Booking) => string,
): Booking[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "time") cmp = a.start.localeCompare(b.start);
    else if (key === "amount") cmp = a.priceMinor - b.priceMinor;
    else cmp = clientName(a).localeCompare(clientName(b), "en-GB", { sensitivity: "base" });
    return (cmp || a.start.localeCompare(b.start)) * sign;
  });
}

/** Free-text match on reference, service, and the client's name, email or phone. */
export function matchesQuery(
  b: Booking,
  q: string,
  client: { name?: string | null; email?: string | null; phone?: string | null } | undefined,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  const hay = [b.reference, b.serviceSnapshot.name, client?.name, client?.email]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());
  if (hay.some((s) => s.includes(needle))) return true;
  if (digits.length >= 3 && client?.phone) {
    // "07700 900123" should find "+44 7700 900123": compare digits, and let a
    // leading national 0 stand in for the country code.
    const phone = client.phone.replace(/\D/g, "");
    return phone.includes(digits) || (digits.startsWith("0") && phone.includes(digits.slice(1)));
  }
  return false;
}

/** Rows bucketed by the local day they start on, in the order given. */
export function groupByDay<T>(
  rows: readonly T[],
  dayOf: (row: T) => string,
): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = dayOf(row);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else out.push({ day, rows: [row] });
  }
  return out;
}

/** "Today, Mon 19 Oct" / "Tomorrow, Tue 20 Oct" / "Mon 19 Oct" / "Mon 19 Oct 2025". */
export function dayGroupHeading(day: string, todayIso: string): string {
  const d = new Date(`${day}T00:00:00`);
  const t = new Date(`${todayIso}T00:00:00`);
  const label = `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}${
    d.getFullYear() !== t.getFullYear() ? ` ${d.getFullYear()}` : ""
  }`;
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return `Today, ${label}`;
  if (diff === 1) return `Tomorrow, ${label}`;
  if (diff === -1) return `Yesterday, ${label}`;
  return label;
}

export type PillTone = "green" | "amber" | "red" | "grey";

/**
 * Spec §5.1 status pill: Confirmed, Held, Unpaid, Cancelled, No-show, Attended.
 * `detail` keeps the more specific wording ("Cancelled by client") for a tooltip,
 * so nothing the old badge said is lost.
 */
export function statusPill(b: Booking): {
  label: string;
  tone: PillTone;
  detail?: string;
  tick?: boolean;
} {
  if (b.attendanceStatus === "attended") return { label: "Attended", tone: "green", tick: true };
  if (b.status === "no_show" || b.attendanceStatus === "no_show") {
    return { label: "No-show", tone: "grey" };
  }
  switch (b.status) {
    case "cancelled_by_customer":
      return { label: "Cancelled", tone: "grey", detail: "Cancelled by client" };
    case "cancelled_by_business":
      return { label: "Cancelled", tone: "grey", detail: "Cancelled by business" };
    case "late_cancelled":
      return { label: "Cancelled", tone: "grey", detail: "Late cancellation" };
    case "expired":
      return { label: "Expired", tone: "grey", detail: "The hold ran out before payment" };
    case "draft":
      return { label: "Draft", tone: "grey" };
    case "held":
    case "awaiting_payment":
      return {
        label: "Held",
        tone: "amber",
        detail: b.paymentMethod === "bank_transfer" ? "Awaiting bank transfer" : "Awaiting payment",
      };
    case "completed":
      return { label: "Completed", tone: "green" };
    case "confirmed": {
      const s = bookingSettlement(b);
      if (s.state === "unpaid") return { label: "Unpaid", tone: "red" };
      return { label: "Confirmed", tone: "green" };
    }
  }
}

/** The amber line under the amount: what is owed, or how long the hold lasts. */
export function amountNote(
  b: Booking,
  money: (minor: number, currency: string) => string,
  time: (iso: string) => string,
): string | null {
  if (CANCELLED.has(b.status) || b.status === "expired") return null;
  if (HELD.has(b.status) && b.holdExpiresAt && b.paymentMethod !== "bank_transfer") {
    return `Held until ${time(b.holdExpiresAt)}`;
  }
  const s = bookingSettlement(b);
  if (s.state === "unpaid" || s.state === "part_paid" || s.state === "deposit_paid") {
    return `${money(s.outstandingMinor, b.currency)} due`;
  }
  return null;
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The current filter as a spreadsheet (spec §5.1 Export). Money in major units. */
export function bookingsCsv(
  rows: readonly Booking[],
  lookups: {
    client: (b: Booking) => string;
    trainer: (b: Booking) => string;
    location: (b: Booking) => string;
    date: (iso: string) => string;
    time: (iso: string) => string;
  },
): string {
  const header = [
    "Reference",
    "Date",
    "Start",
    "End",
    "Service",
    "Client",
    "Trainer",
    "Location",
    "Price",
    "Paid",
    "Currency",
    "Status",
    "Attendance",
  ];
  const lines = rows.map((b) =>
    [
      b.reference,
      lookups.date(b.start),
      b.allDay ? "All day" : lookups.time(b.start),
      b.allDay ? "" : lookups.time(b.end),
      b.serviceSnapshot.name,
      lookups.client(b),
      lookups.trainer(b),
      lookups.location(b),
      (b.priceMinor / 100).toFixed(2),
      ((b.paidMinor ?? 0) / 100).toFixed(2),
      b.currency,
      b.status,
      b.attendanceStatus,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
