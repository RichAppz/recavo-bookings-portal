import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Landmark } from "lucide-react";

import { Marquee } from "@/components/Marquee";
import type { Booking, CalendarBlock } from "@/lib/api/types";
import { firstName } from "@/lib/calendar-layout";
import { formatInTz, isAllDayEvent, isoDate } from "@/lib/format";
import type { PaymentColours } from "@/lib/payment-colours";
import { cn } from "@/lib/utils";

import {
  blockPayment,
  coversDay,
  eventTintStyle,
  firstDayOf,
  HOLIDAY_CHIP,
  isCancelled,
  isMultiDay,
  LiftTag,
  minutesOf,
  type HolidayItem,
  type Spanning,
} from "./shared";

/**
 * What the second line of a month chip says, left to right. The business picks
 * which of these to show; the order is fixed so chips stay scannable. The first
 * line is the start time ("All day", or ↳ when the job carries on from an earlier
 * day) unless `showTime` is off, when the chip is that one detail line. `time` is
 * kept in the list so older saved preferences still parse; the time itself is a
 * separate switch.
 */
export const MONTH_BAR_FIELDS = [
  "time",
  "client",
  "record",
  "category",
  "service",
  "lift",
] as const;
export type MonthBarField = (typeof MONTH_BAR_FIELDS)[number];

type Chip =
  | { kind: "holiday"; key: string; item: HolidayItem; order: number }
  | { kind: "event"; key: string; item: CalendarBlock; continues: boolean; order: number }
  | { kind: "booking"; key: string; item: Booking; continues: boolean; order: number };

export function MonthGrid({
  days,
  anchor,
  timezone,
  todayIso,
  bookings,
  events,
  holidays,
  paymentColours,
  eventColour,
  monthBar,
  showTime,
  clientFor,
  tagFor,
  categoryFor,
  serviceLabel,
  sliding,
  phone,
  loading,
  onOpenBooking,
  onOpenEvent,
  onTapDay,
  onOpenDay,
}: {
  /** Six Monday-first weeks (42 days). */
  days: Date[];
  anchor: Date;
  timezone: string;
  todayIso: string;
  bookings: readonly Booking[];
  events: readonly CalendarBlock[];
  holidays: readonly HolidayItem[];
  paymentColours: PaymentColours;
  eventColour: (colour: string) => string;
  monthBar: ReadonlySet<MonthBarField>;
  /** Time on its own line above the details; off makes every chip a single line. */
  showTime: boolean;
  clientFor: (b: Booking) => string | null;
  tagFor: (b: Booking) => string | null;
  categoryFor: (b: Booking) => string | null;
  serviceLabel: (b: Booking) => string;
  sliding: boolean;
  phone: boolean;
  loading: boolean;
  onOpenBooking: (id: string) => void;
  onOpenEvent: (block: CalendarBlock) => void;
  /** Tap on the empty part of a cell (the page decides: add, or open on a double tap). */
  onTapDay: (day: Date) => void;
  onOpenDay: (day: Date) => void;
}) {
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)),
    [days],
  );
  const isAllDay = (ev: CalendarBlock) => isAllDayEvent(ev.start, ev.end, timezone);
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const endLabel = (b: Spanning) =>
    formatInTz(b.end, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" });

  /** Everything on one day, bank holiday first, then all-day and carried-over jobs, then by time. */
  const chipsFor = (iso: string): Chip[] => {
    const out: Chip[] = [];
    for (const h of holidays) {
      if (h.date === iso) out.push({ kind: "holiday", key: h.id, item: h, order: -2 });
    }
    for (const b of bookings) {
      if (!coversDay(b, iso, timezone)) continue;
      const continues = firstDayOf(b, timezone) !== iso;
      out.push({
        kind: "booking",
        key: b.id,
        item: b,
        continues,
        order: continues || b.allDay ? -1 : minutesOf(b.start, timezone),
      });
    }
    for (const ev of events) {
      if (!coversDay(ev, iso, timezone)) continue;
      const continues = firstDayOf(ev, timezone) !== iso;
      out.push({
        kind: "event",
        key: ev.id,
        item: ev,
        continues,
        order: continues || isAllDay(ev) ? -1 : minutesOf(ev.start, timezone),
      });
    }
    return out.sort((a, b) => a.order - b.order);
  };

  const lineText = phone ? "text-[12px] leading-[15px]" : "text-[11px] leading-[14px]";

  const renderChip = (chip: Chip) => {
    if (chip.kind === "holiday") {
      const h = chip.item;
      return (
        <div
          key={chip.key}
          role="note"
          aria-label={`Bank holiday: ${h.title}`}
          title={h.notes ? `${h.title} — ${h.notes}` : h.title}
          className={cn(HOLIDAY_CHIP, "w-full")}
        >
          <Landmark className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{h.title}</span>
        </div>
      );
    }
    if (chip.kind === "event") {
      const ev = chip.item;
      const allDay = isAllDay(ev);
      const multi = isMultiDay(ev, timezone);
      return (
        <button
          key={chip.key}
          type="button"
          onClick={() => onOpenEvent(ev)}
          style={eventTintStyle(eventColour(ev.colour))}
          aria-label={`${allDay ? "All day: " : `${timeLabel(ev.start)}, `}${ev.title}${
            multi ? `, until ${endLabel(ev)}` : ""
          }`}
          className={cn(
            "flex w-full cursor-pointer flex-col items-stretch rounded-md px-1.5 py-1 text-left",
            lineText,
          )}
        >
          {showTime ? (
            <span className="flex items-center gap-1 truncate font-extrabold tabular-nums">
              {chip.continues ? (
                <span aria-label="Continues from earlier">↳</span>
              ) : allDay ? (
                "All day"
              ) : (
                timeLabel(ev.start)
              )}
              {multi && !chip.continues ? <span className="ml-auto opacity-75">→</span> : null}
            </span>
          ) : null}
          <Marquee animate={sliding} className="w-full flex-none font-semibold">
            {!showTime && chip.continues ? (
              <span aria-label="Continues from earlier" className="font-extrabold">
                ↳
              </span>
            ) : null}
            <span>{ev.title}</span>
            {!showTime && multi && !chip.continues ? <span className="opacity-75">→</span> : null}
          </Marquee>
        </button>
      );
    }
    const b = chip.item;
    const cancelled = isCancelled(b);
    const payment = blockPayment(b, paymentColours);
    const tag = tagFor(b);
    const client = clientFor(b);
    const multi = isMultiDay(b, timezone);
    const showClient = monthBar.has("client") && client;
    const showTag = monthBar.has("record") && tag;
    const category = categoryFor(b);
    const showCategory = monthBar.has("category") && category;
    const showLift = monthBar.has("lift") && Boolean(b.clientLift);
    // "Category only" on a service that has none would leave the line blank, so
    // the name steps in for that service.
    const showService = monthBar.has("service") || (!showCategory && !showClient && !showTag);
    return (
      <button
        key={chip.key}
        type="button"
        onClick={() => onOpenBooking(b.id)}
        title={payment.label}
        aria-label={`${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${client ? `${client}, ` : ""}${serviceLabel(
          b,
        )}${multi ? `, until ${endLabel(b)}` : ""} — ${payment.label}${cancelled ? ", cancelled" : ""}`}
        style={payment.style}
        className={cn(
          "flex w-full cursor-pointer flex-col items-stretch rounded-md px-1.5 py-1 text-left",
          lineText,
          payment.className,
          cancelled && "opacity-50",
        )}
      >
        {showTime ? (
          <span className="flex items-center gap-1 truncate font-extrabold tabular-nums">
            {showLift ? <LiftTag /> : null}
            {chip.continues ? (
              <span aria-label="Continues from earlier">↳</span>
            ) : b.allDay ? (
              "All day"
            ) : (
              timeLabel(b.start)
            )}
            {multi && !chip.continues ? <span className="ml-auto opacity-75">→</span> : null}
          </span>
        ) : null}
        {/* The label slides if it is wider than the chip, so a narrow cell still
            shows everything that was switched on. With the time line off, the lift
            marker and the continuation cues move onto this one line. */}
        <Marquee animate={sliding} className="w-full flex-none">
          {!showTime && showLift ? <LiftTag /> : null}
          {!showTime && chip.continues ? (
            <span aria-label="Continues from earlier" className="font-extrabold">
              ↳
            </span>
          ) : null}
          {showClient ? (
            <span className={cn("font-semibold", cancelled && "line-through")}>
              {phone ? firstName(client) : client}
            </span>
          ) : null}
          {showTag ? <span className="font-semibold">{tag}</span> : null}
          {showCategory ? (
            <span className="opacity-75">{showService ? `${category} ·` : category}</span>
          ) : null}
          {showService ? (
            <span className={cn("font-semibold", cancelled && "line-through")}>
              {b.serviceSnapshot.name}
            </span>
          ) : null}
          {!showTime && multi && !chip.continues ? <span className="opacity-75">→</span> : null}
        </Marquee>
      </button>
    );
  };

  return (
    <div className="surface-card overflow-hidden rounded-2xl sm:rounded-[18px]">
      {/* Weekday header: pinned while the month scrolls (spec §4.3). */}
      <div className="sticky top-0 z-20 grid grid-cols-7 border-b bg-card text-center text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase sm:text-[11px]">
        {days.slice(0, 7).map((day) => (
          <div key={day.toISOString()} className="py-2">
            {phone
              ? day.toLocaleDateString("en-GB", { weekday: "narrow" })
              : day.toLocaleDateString("en-GB", { weekday: "short" })}
          </div>
        ))}
      </div>

      {weeks.map((week, weekIdx) => (
        <div key={isoDate(week[0]!)} className="grid grid-cols-7">
          {week.map((day) => {
            const iso = isoDate(day);
            const chips = loading ? [] : chipsFor(iso);
            return (
              <DayCell
                key={iso}
                day={day}
                outside={day.getMonth() !== anchor.getMonth()}
                today={iso === todayIso}
                lastRow={weekIdx === weeks.length - 1}
                phone={phone}
                loading={loading}
                count={chips.filter((c) => c.kind !== "holiday").length}
                onTapDay={onTapDay}
                onOpenDay={onOpenDay}
              >
                {chips.map(renderChip)}
              </DayCell>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * One day: the date on top and a list of chips beneath that scrolls inside the
 * cell when there are more than fit (spec §4.3). While more is hidden below, the
 * list fades out at the bottom and a chevron beside the date nudges it on; the
 * whole thing can also be scrolled directly.
 */
function DayCell({
  day,
  outside,
  today,
  lastRow,
  phone,
  loading,
  count,
  onTapDay,
  onOpenDay,
  children,
}: {
  day: Date;
  outside: boolean;
  today: boolean;
  lastRow: boolean;
  phone: boolean;
  loading: boolean;
  count: number;
  onTapDay: (day: Date) => void;
  onOpenDay: (day: Date) => void;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [children]);

  const nudge = () => {
    const el = listRef.current;
    if (!el) return;
    // One chip and its gap at a time, so each tap reveals the next item.
    const step = (el.firstElementChild?.getBoundingClientRect().height ?? 36) + 2;
    el.scrollBy({ top: step, behavior: "smooth" });
  };

  return (
    <div
      className={cn(
        // The card draws its own edge, so the grid drops the borders that would
        // otherwise double up along the right and bottom.
        "group relative flex flex-col border-r border-b p-1 [&:nth-child(7n)]:border-r-0 sm:p-1.5",
        phone ? "h-[128px]" : "h-[112px] sm:h-[128px]",
        lastRow && "border-b-0",
        outside && "bg-muted/30",
        today && "bg-cal-today",
      )}
    >
      {/* Sits behind the chips so the empty box is the hit area for adding to this
          day (double tap opens the day), while a chip still opens its own booking.
          Nesting the two as real buttons would be invalid markup. */}
      <button
        type="button"
        onClick={() => onTapDay(day)}
        className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/50"
        aria-label={`${day.toLocaleDateString("en-GB", { dateStyle: "full" })}, ${count} ${count === 1 ? "item" : "items"}. Tap to add, double tap to open the day.`}
      />

      {/* The date row: the date itself is the one-tap way into the day, for anyone
          who doesn't know about the double tap (and for keyboards), and while more
          chips are hidden below, the arrow that scrolls them on sits beside it
          (owner request) rather than over the last chip. A phone cell is ~50px, so
          the pair is centred together; on desktop the arrow takes the right end. */}
      <div
        className={cn(
          "relative flex h-6 shrink-0 items-center",
          phone ? "justify-center gap-1" : "justify-between",
        )}
      >
        <button
          type="button"
          onClick={() => onOpenDay(day)}
          className={cn(
            "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold tabular-nums hover:ring-2 hover:ring-primary/40",
            outside ? "text-muted-foreground/60" : "text-foreground",
            today && "bg-primary text-primary-foreground",
          )}
          aria-label={`Open ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
        >
          {day.getDate()}
        </button>
        {more ? (
          <button
            type="button"
            onClick={nudge}
            aria-label={`Show more on ${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`}
            className={cn(
              "flex shrink-0 cursor-pointer items-center justify-center rounded-full border bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.14)]",
              phone ? "size-5" : "size-6",
            )}
          >
            <ChevronDown className={phone ? "size-3.5" : "size-4"} aria-hidden />
          </button>
        ) : null}
      </div>

      {loading && !outside ? (
        <div aria-hidden className="relative mt-1 space-y-0.5">
          {Array.from({ length: (day.getDate() % 3) + 1 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-secondary" />
          ))}
        </div>
      ) : null}

      <div
        ref={listRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) onTapDay(day);
        }}
        className="no-scrollbar relative mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
        style={
          more
            ? { maskImage: "linear-gradient(to bottom, #000 calc(100% - 26px), transparent)" }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
