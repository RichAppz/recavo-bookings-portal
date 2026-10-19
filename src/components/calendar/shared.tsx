import type { CSSProperties, ReactNode } from "react";
import { CarFront } from "lucide-react";

import type { Booking, LinkedRecord } from "@/lib/api/types";
import { bookingSettlement, paymentLabel, paymentTone } from "@/lib/booking-payment";
import { formatMoney } from "@/lib/format";
import { duePillStyle, paymentTintStyle, type PaymentColours } from "@/lib/payment-colours";
import type { PublicHoliday } from "@/lib/public-holidays";
import { contiguousRuns, occupiedDaysOf } from "@/lib/working-days";
import { cn } from "@/lib/utils";

export type CalendarView = "day" | "week" | "month" | "list";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month", "list"];

/**
 * Anything drawn on the grid. Bookings carry the API's `segments` / `occupiedDays`
 * (a multi-day job on its working days only); events and older bookings have just
 * start → end and are read as one continuous span.
 */
export type Spanning = {
  start: string;
  end: string;
  segments?: { start: string; end: string }[] | undefined;
  occupiedDays?: string[] | undefined;
};

/** A bank holiday shaped like anything else on the grid: it holds one local day. */
export type HolidayItem = PublicHoliday & {
  id: string;
  start: string;
  end: string;
  occupiedDays: string[];
};

export const isCancelled = (b: Booking) =>
  b.status === "cancelled_by_customer" ||
  b.status === "cancelled_by_business" ||
  b.status === "late_cancelled";

/** Minutes since local midnight of `iso` in `tz`. */
export function minutesOf(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * Which calendar days an item is drawn on. A multi-day job (a three-day ceramic
 * coating) shows on the working days the API laid it over — Thu, Fri, Mon — and
 * not on the weekend it skips; events and older bookings cover every day from
 * start to end. An end exactly on midnight belongs to the previous day.
 */
export const daysOf = (b: Spanning, tz: string) => occupiedDaysOf(b, tz);
export const coversDay = (b: Spanning, iso: string, tz: string) => daysOf(b, tz).includes(iso);
export const firstDayOf = (b: Spanning, tz: string) => daysOf(b, tz)[0]!;
export const lastDayOf = (b: Spanning, tz: string) => {
  const days = daysOf(b, tz);
  return days[days.length - 1]!;
};
export const isMultiDay = (b: Spanning, tz: string) => daysOf(b, tz).length > 1;

/** Tone, tint classes/inline colour and a spoken label for one booking. */
export function blockPayment(b: Booking, colours: PaymentColours) {
  const settlement = bookingSettlement(b);
  const tone = paymentTone(settlement, b.status);
  return {
    tone,
    settlement,
    ...paymentTintStyle(tone, colours),
    label: paymentLabel(settlement, b.currency, formatMoney),
    /** "£18 due" — what the due pill says, or null when nothing is owed. */
    due:
      tone === "unpaid" || tone === "partial"
        ? `${formatMoney(settlement.dueNowMinor || settlement.outstandingMinor, b.currency, { compact: true })} due`
        : null,
  };
}

/**
 * Spec §1.2 due pill: solid status swatch behind white text, fully rounded. Status
 * is never colour alone, so the pill is what makes an unpaid block readable to
 * anyone who cannot tell the tints apart.
 */
export function DuePill({
  booking,
  colours,
  className,
}: {
  booking: Booking;
  colours: PaymentColours;
  className?: string;
}) {
  const payment = blockPayment(booking, colours);
  if (!payment.due) return null;
  const pill = duePillStyle(payment.tone, colours);
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] leading-none font-extrabold whitespace-nowrap tabular-nums",
        pill.className,
        className,
      )}
      style={pill.style}
    >
      {payment.due}
    </span>
  );
}

/**
 * The client needs running somewhere once the car is in. A glyph rather than a word:
 * chips are narrow and the panel spells out where to.
 */
export function LiftTag() {
  return (
    <CarFront
      role="img"
      aria-label="Lift needed"
      className="size-3 shrink-0 text-current"
      strokeWidth={2.5}
    />
  );
}

/**
 * What identifies the linked record at a glance. The vehicle template's
 * `registration` field is the thing a detailer recognises a job by, so it wins;
 * other record types (pets, …) fall back to the record's own label.
 */
export function recordTag(record: LinkedRecord | undefined): string | null {
  if (!record) return null;
  const reg = record.values?.registration;
  if (typeof reg === "string" && reg.trim()) return reg.trim().toUpperCase();
  return record.displayLabel || null;
}

/**
 * Event blocks are a soft tint of the event's own colour with a faint 135° hatch
 * (spec §1.2) so they read as "not a job" next to booking blocks even for someone
 * who picks a similar hue. No left stripe: the tint is the only colour.
 */
export function eventTintStyle(colour: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklab, ${colour} 16%, var(--card))`,
    color: `color-mix(in oklab, ${colour} 60%, var(--foreground))`,
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${colour}12 6px 8px)`,
  };
}

/**
 * A bank holiday is a note about the day, not something on the diary: a quiet
 * dashed outline in the muted text colour, never a tint that competes with jobs.
 */
export const HOLIDAY_CHIP =
  "pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden rounded border border-dashed border-muted-foreground/50 bg-background/60 px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground";

export type LaneEntry<B, E> =
  | { kind: "booking"; item: B }
  | { kind: "event"; item: E }
  | { kind: "holiday"; item: HolidayItem };

export type LanePlaced<Entry> = {
  entry: Entry;
  /** First and last column (0–6) the item occupies within this row. */
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Lay one row's bookings and events into lanes. Longer spans go first and each
 * item takes the topmost lane that's free across every column it covers, so a
 * two-day job is one uninterrupted bar and the day items pack in around it. A job
 * that skips days (Thu–Fri, then Mon) becomes one bar per run of days it holds,
 * each carrying a "continues" cue towards the rest of the job — the same cue a bar
 * shows when the job carries on past the edge of the row.
 */
export function placeItems<Entry extends { kind: string; item: Spanning }>(
  isos: string[],
  entries: Entry[],
  tz: string,
): LanePlaced<Entry>[] {
  const spans = entries.flatMap((entry) => {
    const cols = isos
      .map((iso, i) => (coversDay(entry.item, iso, tz) ? i : -1))
      .filter((i) => i >= 0);
    if (cols.length === 0) return [];
    const first = firstDayOf(entry.item, tz);
    const last = lastDayOf(entry.item, tz);
    return contiguousRuns(cols).map((run) => ({
      entry,
      startCol: run.startCol,
      endCol: run.endCol,
      continuesBefore: first < isos[run.startCol]!,
      continuesAfter: last > isos[run.endCol]!,
    }));
  });
  // A holiday is about the day itself, so it sits above whatever is booked on it.
  const rank = (e: Entry) => (e.kind === "holiday" ? 0 : 1);
  spans.sort(
    (a, b) =>
      a.startCol - b.startCol ||
      rank(a.entry) - rank(b.entry) ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.entry.item.start.localeCompare(b.entry.item.start),
  );
  // laneFree[lane] = first column still free in that lane.
  const laneFree: number[] = [];
  return spans.map((span) => {
    let lane = laneFree.findIndex((free) => free <= span.startCol);
    if (lane === -1) lane = laneFree.length;
    laneFree[lane] = span.endCol + 1;
    return { ...span, lane };
  });
}

/** Spec §1.2 swatch: 10px, 3px radius. */
export function Swatch({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", className)} style={style} />
  );
}

/** One labelled entry in a legend row. */
export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}
