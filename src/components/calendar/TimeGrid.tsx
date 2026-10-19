import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Landmark } from "lucide-react";

import { Marquee } from "@/components/Marquee";
import type { Booking, CalendarBlock, Staff } from "@/lib/api/types";
import {
  fitHourHeight,
  firstName,
  layoutOverlaps,
  visibleHourRange,
  type HourRange,
} from "@/lib/calendar-layout";
import { formatInTz, isAllDayEvent, isoDate, isoDateInTz } from "@/lib/format";
import type { PaymentColours } from "@/lib/payment-colours";
import { segmentOn } from "@/lib/working-days";
import { cn } from "@/lib/utils";

import {
  blockPayment,
  coversDay,
  DuePill,
  eventTintStyle,
  firstDayOf,
  HOLIDAY_CHIP,
  isCancelled,
  isMultiDay,
  lastDayOf,
  LiftTag,
  minutesOf,
  placeItems,
  type HolidayItem,
  type LaneEntry,
  type Spanning,
} from "./shared";

export type GridVariant = "desktop" | "phoneDay" | "phoneWeek";

/** Which optional lines a week block carries (spec §4.7). Day shows everything. */
export type BlockFields = { client: boolean; trainer: boolean };

type Entry = LaneEntry<Booking, CalendarBlock>;

type TimedItem = {
  id: string;
  entry: { kind: "booking"; item: Booking } | { kind: "event"; item: CalendarBlock };
  startsToday: boolean;
  endsToday: boolean;
  /** Minutes since midnight; `null` when the item runs in from / out to another day. */
  topMin: number | null;
  bottomMin: number | null;
};

const VARIANT = {
  desktop: { timeCol: 56, hour: null, minMinutes: 30, headerPad: "py-2" },
  phoneDay: { timeCol: 44, hour: 56, minMinutes: 30, headerPad: "" },
  phoneWeek: { timeCol: 34, hour: 60, minMinutes: 54, headerPad: "py-1.5" },
} as const;

const pad2 = (n: number) => `${n}`.padStart(2, "0");

export function TimeGrid({
  variant,
  days,
  timezone,
  todayIso,
  bookings,
  events,
  holidays,
  staff,
  soleStaff,
  paymentColours,
  eventColour,
  opening,
  fields,
  clientFor,
  tagFor,
  categoryFor,
  serviceLabel,
  sliding,
  loading,
  bottomReserve = 72,
  emptyTitle,
  emptyActions,
  onOpenBooking,
  onOpenEvent,
  onEmptySlot,
  onOpenDay,
}: {
  variant: GridVariant;
  days: Date[];
  timezone: string;
  todayIso: string;
  bookings: readonly Booking[];
  events: readonly CalendarBlock[];
  holidays: readonly HolidayItem[];
  staff: readonly Staff[];
  soleStaff: boolean;
  paymentColours: PaymentColours;
  eventColour: (colour: string) => string;
  opening: { openMinute: number; closeMinute: number } | null;
  fields: BlockFields;
  clientFor: (b: Booking) => string | null;
  tagFor: (b: Booking) => string | null;
  categoryFor: (b: Booking) => string | null;
  serviceLabel: (b: Booking) => string;
  sliding: boolean;
  loading: boolean;
  /** Pixels kept free under the card (legend row + panel padding). */
  bottomReserve?: number;
  emptyTitle: string;
  emptyActions?: ReactNode;
  onOpenBooking: (id: string) => void;
  onOpenEvent: (block: CalendarBlock) => void;
  onEmptySlot: (iso: string, time: string) => void;
  onOpenDay: (day: Date) => void;
}) {
  const v = VARIANT[variant];
  const isoDays = useMemo(() => days.map(isoDate), [days]);
  const staffName = (id: string | null | undefined) =>
    id ? staff.find((s) => s.id === id)?.displayName : undefined;
  const isAllDay = (ev: CalendarBlock) => isAllDayEvent(ev.start, ev.end, timezone);
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const endLabel = (b: Spanning) =>
    formatInTz(b.end, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" });

  /**
   * Clip an item to one day. A multi-day job draws the segment it holds on this day
   * (Friday 08:00–17:00 of a Thu–Mon job); the part of an item that began yesterday
   * or runs on tomorrow is left open so the column fills to the visible edge.
   */
  const clip = (b: Spanning, iso: string) => {
    const startsToday = firstDayOf(b, timezone) === iso;
    const endsToday = lastDayOf(b, timezone) === iso;
    const segment = segmentOn(b, iso, timezone) ?? { start: b.start, end: b.end };
    const segStartsToday = isoDateInTz(segment.start, timezone) === iso;
    const segEndsToday =
      isoDateInTz(new Date(new Date(segment.end).getTime() - 60_000).toISOString(), timezone) ===
      iso;
    return {
      startsToday,
      endsToday,
      topMin: segStartsToday ? minutesOf(segment.start, timezone) : null,
      bottomMin: segEndsToday ? minutesOf(segment.end, timezone) || 24 * 60 : null,
    };
  };

  const timedByDay = useMemo(() => {
    const map = new Map<string, TimedItem[]>();
    for (const iso of isoDays) {
      const items: TimedItem[] = [];
      for (const b of bookings) {
        if (b.allDay || !coversDay(b, iso, timezone)) continue;
        items.push({ id: b.id, entry: { kind: "booking", item: b }, ...clip(b, iso) });
      }
      for (const ev of events) {
        if (isAllDay(ev) || !coversDay(ev, iso, timezone)) continue;
        items.push({ id: ev.id, entry: { kind: "event", item: ev }, ...clip(ev, iso) });
      }
      map.set(iso, items);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isoDays, bookings, events, timezone]);

  // Spec §2.4: opening hours or the first session, to closing or the last session end.
  const range: HourRange = useMemo(() => {
    const spans: { startMin: number; endMin: number }[] = [];
    for (const items of timedByDay.values()) {
      for (const it of items) {
        spans.push({
          startMin: it.topMin ?? it.bottomMin ?? 0,
          endMin: it.bottomMin ?? it.topMin ?? 0,
        });
      }
    }
    const fallback = variant === "phoneWeek" ? { startHour: 7, endHour: 22 } : undefined;
    return visibleHourRange(
      spans.filter((s) => s.endMin > 0),
      opening,
      fallback,
    );
  }, [timedByDay, opening, variant]);
  const rangeStartMin = range.startHour * 60;
  const rangeEndMin = range.endHour * 60;
  const hours = range.endHour - range.startHour;

  const allDayPlaced = useMemo(
    () =>
      placeItems<Entry>(
        isoDays,
        [
          ...holidays.map((item) => ({ kind: "holiday" as const, item })),
          ...bookings.filter((b) => b.allDay).map((item) => ({ kind: "booking" as const, item })),
          ...events.filter(isAllDay).map((item) => ({ kind: "event" as const, item })),
        ],
        timezone,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isoDays, holidays, bookings, events, timezone],
  );
  const allDayLanes = allDayPlaced.reduce((max, p) => Math.max(max, p.lane + 1), 0);
  const holidayOn = (iso: string) => holidays.find((h) => h.date === iso);

  // ----- Sizing: the card fills the panel; hours fit inside it (min 40px) -----
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const allDayRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  const inner = variant !== "phoneDay";

  useLayoutEffect(() => {
    if (!inner) return;
    const measure = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setCardHeight(Math.max(420, Math.floor(window.innerHeight - top - bottomReserve)));
      setChromeHeight(
        (headerRef.current?.offsetHeight ?? 0) + (allDayRef.current?.offsetHeight ?? 0),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [inner, bottomReserve, allDayLanes, days.length]);

  const hourHeight =
    v.hour ?? (cardHeight ? fitHourHeight(range, cardHeight - chromeHeight - 1, 40) : 48);
  const bodyHeight = hours * hourHeight;

  // ----- Now line: today only, ticking once a minute -----
  const [nowMin, setNowMin] = useState(() => minutesOf(new Date().toISOString(), timezone));
  useEffect(() => {
    const tick = () => setNowMin(minutesOf(new Date().toISOString(), timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  const todayInView = isoDays.includes(todayIso);

  // ----- Initial position: an hour before now (today), else the first session -----
  const positioned = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !inner || loading) return;
    const key = `${variant}:${isoDays.join(",")}`;
    if (positioned.current === key) return;
    positioned.current = key;
    let targetMin = rangeStartMin;
    if (todayInView) targetMin = Math.max(rangeStartMin, nowMin - 60);
    else {
      const first = Math.min(
        ...[...timedByDay.values()].flatMap((items) => items.map((i) => i.topMin ?? Infinity)),
      );
      if (Number.isFinite(first)) targetMin = Math.max(rangeStartMin, first - 30);
    }
    el.scrollTop = ((targetMin - rangeStartMin) / 60) * hourHeight;
    if (variant === "phoneWeek") {
      const left = todayInView ? isoDays.indexOf(todayIso) * 74 : 0;
      // A swipe that turned the page is usually still flinging the scroller (on the
      // compositor, so nothing on the main thread cancels it) when the new week
      // renders. Hold the position for a moment, letting go as soon as a new finger
      // lands so a deliberate pan is never fought.
      el.scrollLeft = left;
      let pinned = true;
      const release = () => {
        pinned = false;
      };
      const onScroll = () => {
        if (pinned && el.scrollLeft !== left) el.scrollLeft = left;
      };
      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("touchstart", release, { passive: true });
      const settle = window.setTimeout(release, 1000);
      return () => {
        release();
        el.removeEventListener("scroll", onScroll);
        el.removeEventListener("touchstart", release);
        window.clearTimeout(settle);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner, loading, variant, isoDays, hourHeight]);

  const timeAtOffset = (offsetY: number) => {
    const minutes = rangeStartMin + Math.floor((offsetY / hourHeight) * 4) * 15;
    const clamped = Math.min(Math.max(minutes, rangeStartMin), rangeEndMin - 15);
    return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
  };

  const empty = !loading && bookings.length === 0 && events.length === 0;

  const gridColumns =
    variant === "phoneWeek"
      ? `${v.timeCol}px repeat(${days.length}, 74px)`
      : `${v.timeCol}px repeat(${days.length}, minmax(0, 1fr))`;

  const topOf = (min: number) => ((min - rangeStartMin) / 60) * hourHeight;

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "relative",
        inner && "no-scrollbar overflow-auto",
        variant === "desktop" && "overscroll-contain",
      )}
      style={inner && cardHeight ? { height: cardHeight } : undefined}
    >
      <div className="grid" style={{ gridTemplateColumns: gridColumns }}>
        {/* Day header (not on the phone Day view: the week strip above does that job). */}
        {variant !== "phoneDay" ? (
          <div className="contents">
            {/* The corner cell is the one measured for the header's height: a
                `display: contents` wrapper has no box of its own. */}
            <div
              ref={headerRef}
              className="sticky top-0 left-0 z-40 border-b bg-card"
              style={{ gridColumn: 1, gridRow: 1 }}
            />
            {days.map((day, i) => {
              const iso = isoDays[i]!;
              const today = iso === todayIso;
              const holiday = holidayOn(iso);
              const weekday = day.toLocaleDateString("en-GB", { weekday: "short" });
              const Tag = days.length > 1 ? "button" : "div";
              return (
                <div
                  key={iso}
                  style={{ gridColumn: i + 2, gridRow: 1 }}
                  className={cn(
                    "sticky top-0 z-30 border-b border-l bg-card text-center",
                    today && "bg-cal-today",
                    v.headerPad,
                  )}
                >
                  <Tag
                    {...(days.length > 1
                      ? {
                          type: "button" as const,
                          onClick: () => onOpenDay(day),
                          "aria-label": `Open ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`,
                        }
                      : {})}
                    className={cn(
                      "flex w-full flex-col items-center gap-0.5",
                      days.length > 1 && "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "font-bold text-muted-foreground uppercase",
                        variant === "phoneWeek" ? "text-[10.5px]" : "text-[11px] tracking-[0.06em]",
                      )}
                    >
                      {variant === "phoneWeek" ? weekday.charAt(0) : weekday}
                    </span>
                    <span
                      className={cn(
                        "flex items-center justify-center rounded-full font-extrabold tabular-nums",
                        variant === "phoneWeek" ? "size-6 text-[13px]" : "size-[30px] text-base",
                        today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </Tag>
                  {holiday ? (
                    <span
                      title={holiday.title}
                      className="mx-auto mt-0.5 block w-fit max-w-full truncate rounded-full bg-secondary px-1.5 text-[10px] leading-4 font-semibold text-muted-foreground"
                    >
                      {variant === "phoneWeek" ? "Hol." : "Bank holiday"}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* All-day jobs (RECA-532), all-day events and bank holidays get a lane above
            the hours rather than a 00:00–00:00 block: they hold the day, not a time on it. */}
        {allDayPlaced.length > 0 ? (
          <div className="contents">
            <div
              className="sticky left-0 z-20 border-b bg-card pt-1.5 pr-2 text-right text-[11px] text-muted-foreground"
              style={{ gridColumn: 1, gridRow: 2 }}
            >
              {variant === "phoneWeek" ? "All" : "All day"}
            </div>
            <div
              ref={allDayRef}
              className="relative border-b bg-secondary/20"
              style={{ gridColumn: `2 / span ${days.length}`, gridRow: 2 }}
            >
              <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
                {isoDays.map((iso) => (
                  <div key={iso} className="flex-1 border-l" />
                ))}
              </div>
              <div
                className="relative grid gap-y-0.5 py-1"
                style={{
                  gridTemplateColumns: `repeat(${isoDays.length}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${Math.max(1, allDayLanes)}, auto)`,
                }}
              >
                {allDayPlaced.map((p) => {
                  const { startCol, endCol, lane, continuesBefore, continuesAfter } = p;
                  const place: CSSProperties = {
                    gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                    gridRow: lane + 1,
                  };
                  if (p.entry.kind === "holiday") {
                    const h = p.entry.item;
                    return (
                      <div
                        key={h.id}
                        role="note"
                        aria-label={`Bank holiday: ${h.title}`}
                        title={h.notes ? `${h.title} — ${h.notes}` : h.title}
                        style={place}
                        className={cn(HOLIDAY_CHIP, "mx-1")}
                      >
                        <Landmark className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{h.title}</span>
                      </div>
                    );
                  }
                  if (p.entry.kind === "event") {
                    const ev = p.entry.item;
                    const owner = staffName(ev.staffId);
                    return (
                      <button
                        key={`${ev.id}-${startCol}`}
                        type="button"
                        onClick={() => onOpenEvent(ev)}
                        title={owner ? `Event · ${owner}` : "Event"}
                        aria-label={`All day: ${ev.title}${
                          isMultiDay(ev, timezone) ? `, until ${endLabel(ev)}` : ""
                        }`}
                        style={{ ...eventTintStyle(eventColour(ev.colour)), ...place }}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight",
                          continuesBefore ? "ml-0 rounded-l-none" : "ml-1",
                          continuesAfter ? "mr-0 rounded-r-none" : "mr-1",
                        )}
                      >
                        {continuesBefore ? (
                          <span className="opacity-75" aria-label="Continues">
                            ↳
                          </span>
                        ) : null}
                        <Marquee animate={sliding}>
                          <span className="font-semibold">{ev.title}</span>
                          {days.length === 1 && owner && !soleStaff ? (
                            <span className="opacity-75">· {owner}</span>
                          ) : null}
                        </Marquee>
                        {continuesAfter ? <span className="ml-auto opacity-75">→</span> : null}
                      </button>
                    );
                  }
                  const b = p.entry.item;
                  const cancelled = isCancelled(b);
                  const payment = blockPayment(b, paymentColours);
                  const tag = tagFor(b);
                  const owner = staffName(b.staffId);
                  const category = categoryFor(b);
                  return (
                    <button
                      key={`${b.id}-${startCol}`}
                      type="button"
                      onClick={() => onOpenBooking(b.id)}
                      title={`${payment.label}${owner ? ` · ${owner}` : ""}`}
                      aria-label={`All day: ${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${serviceLabel(b)}${
                        isMultiDay(b, timezone) ? `, until ${endLabel(b)}` : ""
                      } — ${payment.label}`}
                      style={{ ...place, ...payment.style }}
                      className={cn(
                        "flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight",
                        payment.className,
                        continuesBefore ? "ml-0 rounded-l-none" : "ml-1",
                        continuesAfter ? "mr-0 rounded-r-none" : "mr-1",
                        cancelled && "opacity-50",
                      )}
                    >
                      {b.clientLift ? <LiftTag /> : null}
                      {continuesBefore ? (
                        <span className="opacity-75" aria-label="Continues">
                          ↳
                        </span>
                      ) : null}
                      <Marquee animate={sliding}>
                        {tag ? <span className="font-bold">{tag}</span> : null}
                        <span className={cn("font-semibold", cancelled && "line-through")}>
                          {b.serviceSnapshot.name}
                        </span>
                        {category ? <span className="opacity-75">· {category}</span> : null}
                        {days.length === 1 && owner && !soleStaff ? (
                          <span className="opacity-75">· {owner}</span>
                        ) : null}
                      </Marquee>
                      {payment.due && !cancelled ? (
                        <DuePill
                          booking={b}
                          colours={paymentColours}
                          className="ml-auto h-4 px-1.5 text-[10px]"
                        />
                      ) : null}
                      {continuesAfter ? <span className="opacity-75">→</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Hour labels: pinned on the left, centred on their line. */}
        <div
          className="sticky left-0 z-20 bg-card"
          style={{ gridColumn: 1, gridRow: 3, height: bodyHeight }}
        >
          <div className="relative h-full">
            {Array.from({ length: hours }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "absolute right-0 block font-semibold text-muted-foreground tabular-nums",
                  variant === "phoneWeek" ? "pr-1.5 text-[10px]" : "pr-2 text-[11px]",
                  variant === "phoneDay" && "text-xs",
                  i === 0 ? "top-[3px]" : "-translate-y-1/2",
                )}
                style={i === 0 ? undefined : { top: i * hourHeight }}
              >
                {variant === "phoneWeek"
                  ? pad2(range.startHour + i)
                  : `${pad2(range.startHour + i)}:00`}
              </span>
            ))}
          </div>
        </div>

        {days.map((day, dayIdx) => {
          const iso = isoDays[dayIdx]!;
          const today = iso === todayIso;
          const items = timedByDay.get(iso) ?? [];
          const clipped = items.map((it) => {
            const top = Math.max(rangeStartMin, it.topMin ?? rangeStartMin);
            const rawBottom = Math.min(rangeEndMin, it.bottomMin ?? rangeEndMin);
            const heightMin = Math.max(rawBottom - top, v.minMinutes);
            return {
              ...it,
              startMin: top,
              endMin: Math.min(rangeEndMin, top + heightMin),
              heightMin,
            };
          });
          const { placed, overflow } = layoutOverlaps(clipped, 3);
          const box = (
            startMin: number,
            heightMin: number,
            col: number,
            cols: number,
          ): CSSProperties => {
            const inset = variant === "phoneWeek" ? 2 : variant === "phoneDay" ? 0 : 4;
            const gap = cols > 1 ? 2 : 0;
            const edges = inset * 2 + gap * (cols - 1);
            return {
              top: topOf(startMin),
              height: Math.max(
                12,
                (heightMin / 60) * hourHeight - (variant === "phoneWeek" ? 2 : 4),
              ),
              left:
                variant === "phoneDay" && cols === 1
                  ? 6
                  : `calc(${inset}px + ${col} * ((100% - ${edges}px) / ${cols} + ${gap}px))`,
              width:
                variant === "phoneDay" && cols === 1
                  ? "calc(100% - 6px)"
                  : `calc((100% - ${edges}px) / ${cols})`,
            };
          };
          return (
            <div
              key={iso}
              style={{ gridColumn: dayIdx + 2, gridRow: 3, height: bodyHeight }}
              className={cn("relative border-l", today && "bg-cal-today")}
            >
              {Array.from({ length: hours }, (_, i) => (
                <div
                  key={i}
                  aria-hidden
                  className="absolute inset-x-0 border-t"
                  style={{ top: i * hourHeight }}
                />
              ))}
              {/* Empty space in a column asks "booking or event?" for the time clicked;
                  blocks sit above it. */}
              <button
                type="button"
                onClick={(e) => onEmptySlot(iso, timeAtOffset(e.nativeEvent.offsetY))}
                className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/40"
                aria-label={`Add to ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
              />

              {loading
                ? [0, 1, 2].map((n) => {
                    // Deterministic "random" slots so ghosts don't jump between renders.
                    const slot = (dayIdx * 7 + n * 5) % Math.max(1, hours - 1);
                    return (
                      <div
                        key={n}
                        aria-hidden
                        className="absolute inset-x-1 animate-pulse rounded-lg bg-secondary"
                        style={{
                          top: slot * hourHeight + 2,
                          height: hourHeight * (n === 1 ? 1.5 : 1) - 4,
                        }}
                      />
                    );
                  })
                : null}

              {today && nowMin > rangeStartMin && nowMin < rangeEndMin ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-cal-unpaid"
                  style={{ top: topOf(nowMin) }}
                >
                  <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-cal-unpaid" />
                </div>
              ) : null}

              {placed.map(({ item, col, cols }) => {
                const style = box(item.startMin, item.heightMin, col, cols);
                const px = (item.heightMin / 60) * hourHeight;
                if (item.entry.kind === "event") {
                  const ev = item.entry.item;
                  const owner = staffName(ev.staffId);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onOpenEvent(ev)}
                      aria-label={`Event: ${ev.title}, ${timeLabel(ev.start)} to ${timeLabel(ev.end)}${owner ? `, ${owner}` : ""}`}
                      className={cn(
                        "absolute z-10 flex cursor-pointer flex-col items-stretch justify-start overflow-hidden text-left transition-shadow hover:z-20 hover:shadow-[0_1px_3px_rgba(0,0,0,0.14)]",
                        variant === "phoneWeek"
                          ? "rounded-[5px] py-1 pr-1 pl-1.5"
                          : variant === "phoneDay"
                            ? "rounded-xl px-3 py-2"
                            : px < 28
                              ? "rounded-lg px-2 py-px"
                              : "rounded-lg px-2 py-[5px]",
                      )}
                      style={{ ...style, ...eventTintStyle(eventColour(ev.colour)) }}
                    >
                      {variant === "phoneWeek" ? (
                        <>
                          <p className="truncate text-[10px] font-extrabold tabular-nums">
                            {item.startsToday ? timeLabel(ev.start) : "↳"}
                          </p>
                          <p className="truncate text-[10.5px] font-bold">{ev.title}</p>
                          <p className="truncate text-[10px] font-semibold opacity-85">Event</p>
                        </>
                      ) : variant === "phoneDay" ? (
                        <>
                          <p className="truncate text-[14.5px] font-bold">{ev.title}</p>
                          <p className="truncate text-[13px] opacity-85">
                            {timeLabel(ev.start)} to {timeLabel(ev.end)} · {owner ?? "Event"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-[11.5px] font-bold">
                            {item.startsToday ? timeLabel(ev.start) : "↳"} {ev.title}
                          </p>
                          {px >= 36 ? (
                            <p className="truncate text-[11.5px] opacity-85">{owner ?? "Event"}</p>
                          ) : null}
                          {isMultiDay(ev, timezone) && px >= 52 ? (
                            <p className="truncate text-[11px] opacity-85">Until {endLabel(ev)}</p>
                          ) : null}
                        </>
                      )}
                    </button>
                  );
                }
                const b = item.entry.item;
                const cancelled = isCancelled(b);
                const payment = blockPayment(b, paymentColours);
                const tag = tagFor(b);
                const trainer = staffName(b.staffId);
                const client = clientFor(b);
                const category = categoryFor(b);
                const group = b.attendees.length > 1;
                const occupancy = group ? `${b.seatCount} of ${b.attendees.length} ` : null;
                const showClient = days.length === 1 || fields.client;
                const showTrainer = (days.length === 1 || fields.trainer) && !soleStaff;
                const secondLine = group
                  ? [trainer, `${b.seatCount} of ${b.attendees.length}`].filter(Boolean).join(" · ")
                  : [tag, showClient ? client : null, showTrainer ? trainer : null]
                      .filter(Boolean)
                      .join(" · ");
                const spoken = `${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${serviceLabel(b)}${
                  client ? `, ${client}` : ""
                }, ${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} ${timeLabel(b.start)} to ${timeLabel(b.end)}${
                  occupancy ? `, ${occupancy}taken` : ""
                }, ${payment.label}${cancelled ? ", cancelled" : ""}`;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenBooking(b.id)}
                    title={payment.label}
                    aria-label={spoken}
                    className={cn(
                      "absolute z-10 flex cursor-pointer flex-col items-stretch justify-start overflow-hidden text-left transition-shadow hover:z-20 hover:shadow-[0_1px_3px_rgba(0,0,0,0.14)]",
                      variant === "phoneWeek"
                        ? "rounded-[5px] py-1 pr-1 pl-1.5"
                        : variant === "phoneDay"
                          ? "rounded-xl px-3 py-2"
                          : px < 28
                            ? "rounded-lg px-2 py-px"
                            : "rounded-lg px-2 py-[5px]",
                      payment.className,
                      cancelled && "opacity-50",
                    )}
                    style={{ ...style, ...payment.style }}
                  >
                    {variant === "phoneWeek" ? (
                      <>
                        <p className="flex items-center gap-1 truncate text-[10px] font-extrabold tabular-nums">
                          {b.clientLift ? <LiftTag /> : null}
                          {item.startsToday ? (
                            timeLabel(b.start)
                          ) : (
                            <span aria-label="Continues from earlier">↳</span>
                          )}
                        </p>
                        <p
                          className={cn(
                            "truncate text-[10.5px] font-bold",
                            cancelled && "line-through",
                          )}
                        >
                          {tag ? `${tag} ` : ""}
                          {b.serviceSnapshot.name}
                        </p>
                        {fields.client || fields.trainer ? (
                          <p className="truncate text-[10px] font-semibold opacity-85">
                            {group
                              ? `${b.seatCount} of ${b.attendees.length}`
                              : [
                                  fields.client ? firstName(client) : null,
                                  fields.trainer && !soleStaff ? firstName(trainer) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </p>
                        ) : null}
                        {payment.due && !cancelled && px >= 72 ? (
                          <DuePill
                            booking={b}
                            colours={paymentColours}
                            className="mt-1 h-4 w-fit px-1.5 text-[9.5px]"
                          />
                        ) : null}
                      </>
                    ) : variant === "phoneDay" ? (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "flex min-w-0 items-center gap-1.5 truncate text-[14.5px] font-bold",
                              cancelled && "line-through",
                            )}
                          >
                            {b.clientLift ? <LiftTag /> : null}
                            <span className="truncate">
                              {tag ? `${tag} · ` : ""}
                              {b.serviceSnapshot.name}
                              {category ? (
                                <span className="font-normal opacity-75"> · {category}</span>
                              ) : null}
                            </span>
                          </p>
                          {!cancelled ? <DuePill booking={b} colours={paymentColours} /> : null}
                        </div>
                        <p className="truncate text-[13px] opacity-85">
                          {item.startsToday ? timeLabel(b.start) : "↳"} to{" "}
                          {item.endsToday ? timeLabel(b.end) : endLabel(b)}
                          {secondLine ? ` · ${secondLine}` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={cn(
                            "flex items-center gap-1.5 truncate text-[11.5px] font-bold",
                            cancelled && "line-through",
                          )}
                        >
                          {b.clientLift ? <LiftTag /> : null}
                          <span className="truncate">
                            {item.startsToday ? (
                              <span className="tabular-nums">{timeLabel(b.start)}</span>
                            ) : (
                              <span aria-label="Continues from earlier">↳</span>
                            )}{" "}
                            {b.serviceSnapshot.name}
                            {category ? (
                              <span className="font-normal opacity-75"> · {category}</span>
                            ) : null}
                          </span>
                        </p>
                        {px >= 36 && secondLine ? (
                          <p className="truncate text-[11.5px] opacity-85">{secondLine}</p>
                        ) : null}
                        {isMultiDay(b, timezone) && px >= 52 ? (
                          <p className="truncate text-[11px] opacity-85">
                            {item.endsToday ? `Ready ${endLabel(b)}` : `Until ${endLabel(b)}`}
                          </p>
                        ) : null}
                        {payment.due && !cancelled && px >= 60 ? (
                          <DuePill booking={b} colours={paymentColours} className="mt-1 w-fit" />
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}

              {/* More than three abreast: the last column is a "+N" that opens the day. */}
              {overflow.map((o) => (
                <button
                  key={`more-${o.startMin}-${o.col}`}
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className="absolute z-10 flex cursor-pointer items-start justify-center overflow-hidden rounded-lg border border-dashed bg-card px-1 py-1 text-[11.5px] font-bold text-muted-foreground hover:text-foreground"
                  style={box(o.startMin, o.endMin - o.startMin, o.col, o.cols)}
                  aria-label={`${o.count} more at this time. Open the day to see them.`}
                >
                  +{o.count}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center pt-[18%]">
          <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <p className="text-[15px] font-bold">{emptyTitle}</p>
            {emptyActions ? (
              <div className="flex flex-wrap justify-center gap-2">{emptyActions}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
