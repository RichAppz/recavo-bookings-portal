import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown, Landmark } from "lucide-react";

import { Marquee } from "@/components/Marquee";
import type { Booking, CalendarBlock } from "@/lib/api/types";
import {
  assignLanes,
  firstName,
  laneDepthByColumn,
  monthChipLineCount,
  weekSpans,
  type WeekSpan,
} from "@/lib/calendar-layout";
import { formatInTz, isAllDayEvent, isoDate } from "@/lib/format";
import type { PaymentColours } from "@/lib/payment-colours";
import { cn } from "@/lib/utils";

import {
  blockPayment,
  daysOf,
  eventTintStyle,
  HOLIDAY_CHIP,
  isCancelled,
  LiftTag,
  minutesOf,
  type HolidayItem,
  type Spanning,
} from "./shared";

/**
 * What a month chip says under its time, a line each in this order (category and
 * service share one, "Ceramic · 5 year coating"). The business picks which to show;
 * the order is fixed so chips stay scannable. The first line is the start time (or
 * "All day") unless `showTime` is off. `time` is kept in the list so older saved preferences still
 * parse; the time itself is a separate switch.
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

/** Gap between stacked bars, and between the last bar and the cell's own chips (px). */
const LANE_GAP = 2;

type Chip =
  | { kind: "holiday"; key: string; item: HolidayItem; order: number }
  | { kind: "event"; key: string; item: CalendarBlock; order: number }
  | { kind: "booking"; key: string; item: Booking; order: number };

type Entry = { kind: "event"; item: CalendarBlock } | { kind: "booking"; item: Booking };

/** One week-row piece of a multi-day item, with the lane it stacks in. */
type Bar = Entry & WeekSpan & { lane: number };

/** The pieces every chip or bar shares: the words, the colours and what it does. */
type Body = {
  ariaLabel: string;
  title?: string;
  style: CSSProperties | undefined;
  className: string | false | undefined;
  onClick: () => void;
  children: ReactNode;
};

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
  /** Time on its own line above the details, which take a line each. */
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

  /**
   * Each item with the days it shows on. Anything over more than one day is drawn
   * as a bar across those days (owner request: one job, one shape — not a chip in
   * every cell with arrows between them); a one-day item is a chip in its cell.
   */
  const placed = useMemo(() => {
    const gridIsos = days.map(isoDate);
    const single: (Entry & { day: string })[] = [];
    const spanning: (Entry & { days: string[] })[] = [];
    const countByDay = new Map<string, number>();
    const add = (entry: Entry) => {
      const itemDays = daysOf(entry.item, timezone);
      for (const d of itemDays) countByDay.set(d, (countByDay.get(d) ?? 0) + 1);
      if (itemDays.length > 1) spanning.push({ ...entry, days: itemDays });
      else if (itemDays[0]) single.push({ ...entry, day: itemDays[0] });
    };
    if (!loading) {
      for (const item of bookings) add({ kind: "booking", item });
      for (const item of events) add({ kind: "event", item });
    }
    spanning.sort((a, b) => a.item.start.localeCompare(b.item.start));
    const rows: (Entry & WeekSpan)[][] = Array.from({ length: 6 }, () => []);
    for (const { days: itemDays, ...entry } of spanning) {
      for (const span of weekSpans(itemDays, gridIsos)) {
        rows[span.week]?.push({ ...entry, ...span });
      }
    }
    const barsByWeek: Bar[][] = [];
    const laneCounts: number[] = [];
    for (const row of rows) {
      const result = assignLanes(row);
      barsByWeek.push(result.placed);
      laneCounts.push(result.laneCount);
    }
    return { single, barsByWeek, laneCounts, countByDay };
  }, [bookings, events, days, timezone, loading]);

  /** Everything in one cell: bank holiday first, then all-day, then by time. */
  const chipsFor = (iso: string): Chip[] => {
    const out: Chip[] = [];
    for (const h of holidays) {
      if (h.date === iso) out.push({ kind: "holiday", key: h.id, item: h, order: -2 });
    }
    for (const s of placed.single) {
      if (s.day !== iso) continue;
      if (s.kind === "booking") {
        const b = s.item;
        out.push({
          kind: "booking",
          key: b.id,
          item: b,
          order: b.allDay ? -1 : minutesOf(b.start, timezone),
        });
      } else {
        const ev = s.item;
        out.push({
          kind: "event",
          key: ev.id,
          item: ev,
          order: isAllDay(ev) ? -1 : minutesOf(ev.start, timezone),
        });
      }
    }
    return out.sort((a, b) => a.order - b.order);
  };

  const lineText = phone ? "text-[12px] leading-[15px]" : "text-[11px] leading-[14px]";
  // Chips and bars are the same height so the lanes above a cell line up with
  // the chips below: padding plus one or two text lines.
  const lineHeight = phone ? 15 : 14;
  const barHeight = 8 + lineHeight * monthChipLineCount(monthBar, showTime);
  const itemBase = "flex min-w-0 cursor-pointer flex-col items-stretch px-1.5 py-1 text-left";

  const eventBody = (ev: CalendarBlock, multi: boolean): Body => {
    const allDay = isAllDay(ev);
    return {
      ariaLabel: `${allDay ? "All day: " : `${timeLabel(ev.start)}, `}${ev.title}${
        multi ? `, until ${endLabel(ev)}` : ""
      }`,
      style: eventTintStyle(eventColour(ev.colour)),
      className: undefined,
      onClick: () => onOpenEvent(ev),
      children: (
        <>
          {showTime ? (
            <span className="flex items-center gap-1 truncate font-extrabold tabular-nums">
              {allDay ? "All day" : timeLabel(ev.start)}
            </span>
          ) : null}
          <Marquee animate={sliding} className="w-full flex-none font-semibold">
            <span>{ev.title}</span>
          </Marquee>
        </>
      ),
    };
  };

  const bookingBody = (b: Booking, multi: boolean): Body => {
    const cancelled = isCancelled(b);
    const payment = blockPayment(b, paymentColours);
    const tag = tagFor(b);
    const client = clientFor(b);
    const showClient = monthBar.has("client") && client;
    const showTag = monthBar.has("record") && tag;
    const category = categoryFor(b);
    const showCategory = monthBar.has("category") && category;
    const showLift = monthBar.has("lift") && Boolean(b.clientLift);
    // "Category only" on a service that has none would leave the line blank, so
    // the name steps in for that service.
    const showService = monthBar.has("service") || (!showCategory && !showClient && !showTag);
    return {
      ariaLabel: `${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${client ? `${client}, ` : ""}${serviceLabel(
        b,
      )}${multi ? `, until ${endLabel(b)}` : ""} — ${payment.label}${cancelled ? ", cancelled" : ""}`,
      title: payment.label,
      style: payment.style,
      className: cn(payment.className, cancelled && "opacity-50"),
      onClick: () => onOpenBooking(b.id),
      children: (
        <>
          {showTime ? (
            <span className="flex items-center gap-1 truncate font-extrabold tabular-nums">
              {showLift ? <LiftTag /> : null}
              {b.allDay ? "All day" : timeLabel(b.start)}
            </span>
          ) : null}
          {/* One line per detail switched on; each slides if it is wider than the
              chip. With the time line off, the lift marker leads the first line. */}
          {[
            showClient ? (
              <span key="client" className={cn("font-semibold", cancelled && "line-through")}>
                {phone ? firstName(client) : client}
              </span>
            ) : null,
            showTag ? (
              <span key="tag" className="font-semibold">
                {tag}
              </span>
            ) : null,
            showCategory || showService ? (
              <Fragment key="service">
                {showCategory ? (
                  <span className="opacity-75">{showService ? `${category} ·` : category}</span>
                ) : null}
                {showService ? (
                  <span className={cn("font-semibold", cancelled && "line-through")}>
                    {b.serviceSnapshot.name}
                  </span>
                ) : null}
              </Fragment>
            ) : null,
          ]
            .filter(Boolean)
            .map((line, i) => (
              <Marquee key={i} animate={sliding} className="w-full flex-none">
                {i === 0 && !showTime && showLift ? <LiftTag /> : null}
                {line}
              </Marquee>
            ))}
        </>
      ),
    };
  };

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
    const body =
      chip.kind === "event" ? eventBody(chip.item, false) : bookingBody(chip.item, false);
    return (
      <button
        key={chip.key}
        type="button"
        onClick={body.onClick}
        title={body.title}
        aria-label={body.ariaLabel}
        style={body.style}
        className={cn(itemBase, "w-full shrink-0 rounded-md", lineText, body.className)}
      >
        {body.children}
      </button>
    );
  };

  /**
   * One piece of a multi-day item: a bar across the columns it covers in this
   * week, inset from the cell edges like a chip where the job really starts or
   * ends, and run square to the row edge where it carries on into the week before
   * or after, so the eye reads it as one shape continuing.
   */
  const renderBar = (bar: Bar) => {
    const body = bar.kind === "event" ? eventBody(bar.item, true) : bookingBody(bar.item, true);
    return (
      <button
        key={`${bar.item.id}-${bar.startCol}`}
        type="button"
        data-span={bar.endCol - bar.startCol + 1}
        onClick={body.onClick}
        title={body.title}
        aria-label={body.ariaLabel}
        style={{
          ...body.style,
          gridColumn: `${bar.startCol + 1} / span ${bar.endCol - bar.startCol + 1}`,
          gridRow: bar.lane + 1,
        }}
        className={cn(
          itemBase,
          "pointer-events-auto",
          lineText,
          bar.roundStart ? "ml-1 rounded-l-md sm:ml-1.5" : "ml-0",
          bar.roundEnd ? "mr-1 rounded-r-md sm:mr-1.5" : "mr-0",
          body.className,
        )}
      >
        {body.children}
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

      {weeks.map((week, weekIdx) => {
        const bars = placed.barsByWeek[weekIdx] ?? [];
        const laneCount = placed.laneCounts[weekIdx] ?? 0;
        // Each cell starts its own chips beneath the bars over that day only, so a
        // day no bar crosses keeps them right under the date. The row grows for
        // the deepest of those.
        const depths = laneDepthByColumn(bars);
        const laneBlockFor = (col: number) => (depths[col] ?? 0) * (barHeight + LANE_GAP);
        const rowLaneBlock = Math.max(0, ...depths) * (barHeight + LANE_GAP);
        return (
          <div
            key={isoDate(week[0]!)}
            className="relative grid grid-cols-7"
            style={
              {
                "--lane-block": `${rowLaneBlock}px`,
                // Keeps a cell tall enough for its date, the bars and at least one
                // chip when a week stacks several bars; otherwise the fixed height.
                "--cell-reserve": `${barHeight + 50}px`,
              } as CSSProperties
            }
          >
            {week.map((day, col) => {
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
                  laneBlock={laneBlockFor(col)}
                  count={placed.countByDay.get(iso) ?? 0}
                  onTapDay={onTapDay}
                  onOpenDay={onOpenDay}
                >
                  {chips.map(renderChip)}
                </DayCell>
              );
            })}

            {/* The bars: the same seven columns as the cells beneath, so a span of n
                columns lines up exactly with the days it covers. Sits just under
                the date row (cell padding + the 24px row + its gap). */}
            {bars.length > 0 ? (
              <div
                data-lanes={laneCount}
                className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 sm:top-[34px]"
                style={{ gridAutoRows: `${barHeight}px`, rowGap: LANE_GAP }}
              >
                {bars.map(renderBar)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One day: the date on top and a list of chips beneath that scrolls inside the
 * cell when there are more than fit (spec §4.3). While more is hidden below, the
 * list fades out at the bottom and a chevron beside the date nudges it on; the
 * whole thing can also be scrolled directly. When bars run across this day,
 * `laneBlock` is the room they take between the date and the list.
 */
function DayCell({
  day,
  outside,
  today,
  lastRow,
  phone,
  loading,
  laneBlock,
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
  laneBlock: number;
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
  }, [children, laneBlock]);

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
        "min-h-[calc(var(--lane-block)_+_var(--cell-reserve))]",
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

      {/* Room for the bars over this day, which the row draws across its cells;
          the list's own top margin supplies the gap after the last bar. */}
      {laneBlock > 0 ? (
        <div aria-hidden className="mt-1 shrink-0" style={{ height: laneBlock - 4 }} />
      ) : null}

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
