import { useMemo, type CSSProperties } from "react";
import { Landmark } from "lucide-react";

import { Marquee } from "@/components/Marquee";
import type { Booking, CalendarBlock } from "@/lib/api/types";
import { formatInTz, isAllDayEvent, isoDate } from "@/lib/format";
import type { PaymentColours } from "@/lib/payment-colours";
import { cn } from "@/lib/utils";

import {
  blockPayment,
  coversDay,
  eventTintStyle,
  HOLIDAY_CHIP,
  isCancelled,
  isMultiDay,
  LiftTag,
  placeItems,
  type HolidayItem,
  type LaneEntry,
  type Spanning,
} from "./shared";

/**
 * What a month bar says, left to right. The business picks which of these to show;
 * the order is fixed so bars stay scannable. `time` is the start time, or "All day";
 * `category` is the service's category ("Cleaning · Full valet"), so two services
 * with the same name in different groups do not read as the same job.
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

/** Height of one bar row in the month grid, px (matches the chip's text + padding). */
const LANE_HEIGHT = 20;

type Entry = LaneEntry<Booking, CalendarBlock>;

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
  // A phone cell is taller (spec §4.3: 128px) so it holds a lane more.
  const lanes = phone ? 4 : 3;
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)),
    [days],
  );
  const isAllDay = (ev: CalendarBlock) => isAllDayEvent(ev.start, ev.end, timezone);
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const endLabel = (b: Spanning) =>
    formatInTz(b.end, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" });

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

      {/* One row per week. Items are laid out per row so a job that runs over
          several days is a single bar across them, not a chip in each cell that
          reads as separate jobs. */}
      {weeks.map((week, weekIdx) => {
        const weekIsos = week.map(isoDate);
        const placed = placeItems<Entry>(
          weekIsos,
          [
            ...holidays.map((item) => ({ kind: "holiday" as const, item })),
            ...bookings.map((item) => ({ kind: "booking" as const, item })),
            ...events.map((item) => ({ kind: "event" as const, item })),
          ],
          timezone,
        );
        const hiddenOn = (iso: string) =>
          placed.filter((p) => p.lane >= lanes && coversDay(p.entry.item, iso, timezone)).length;
        const countOn = (iso: string) =>
          placed.filter((p) => p.entry.kind !== "holiday" && coversDay(p.entry.item, iso, timezone))
            .length;
        return (
          <div key={weekIsos[0]} className="relative grid grid-cols-7">
            {week.map((day) => {
              const iso = isoDate(day);
              const outside = day.getMonth() !== anchor.getMonth();
              const hidden = hiddenOn(iso);
              const today = iso === todayIso;
              const count = countOn(iso);
              return (
                <div
                  key={iso}
                  className={cn(
                    // The card draws its own edge, so the grid drops the borders
                    // that would otherwise double up along the right and bottom.
                    "group relative border-r border-b p-1 [&:nth-child(7n)]:border-r-0 sm:p-1.5",
                    phone ? "min-h-[128px]" : "min-h-[96px] sm:min-h-[116px]",
                    weekIdx === weeks.length - 1 && "border-b-0",
                    outside && "bg-muted/30",
                    today && "bg-cal-today",
                  )}
                >
                  {/* Sits behind the bars so the whole empty box is the hit area
                      for adding to this day (double tap opens the day), while a
                      bar still opens its own booking. Nesting the two as real
                      buttons would be invalid markup. */}
                  <button
                    type="button"
                    onClick={() => onTapDay(day)}
                    className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/50"
                    aria-label={`${day.toLocaleDateString("en-GB", { dateStyle: "full" })}, ${count} ${count === 1 ? "item" : "items"}. Tap to add, double tap to open the day.`}
                  />

                  {/* The date itself is the one-tap way into the day, for anyone
                      who doesn't know about the double tap (and for keyboards). */}
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className={cn(
                      "relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-xs font-bold tabular-nums hover:ring-2 hover:ring-primary/40",
                      phone && "mx-auto flex",
                      outside ? "text-muted-foreground/60" : "text-foreground",
                      today && "bg-primary text-primary-foreground",
                    )}
                    aria-label={`Open ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
                  >
                    {day.getDate()}
                  </button>

                  {loading && !outside ? (
                    <div aria-hidden className="relative mt-1 space-y-0.5">
                      {Array.from({ length: (day.getDate() % 3) + 1 }, (_, i) => (
                        <div key={i} className="h-[18px] animate-pulse rounded bg-secondary" />
                      ))}
                    </div>
                  ) : null}

                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="absolute bottom-0.5 left-1 cursor-pointer px-1 text-left text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline sm:bottom-1 sm:left-1.5"
                    >
                      +{hidden} more
                    </button>
                  ) : null}
                </div>
              );
            })}

            {/* The bars: same seven columns as the cells beneath, so a span of
                n columns lines up exactly with the days it covers. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 gap-y-0.5 sm:top-8"
              style={{ gridAutoRows: `${LANE_HEIGHT}px` }}
            >
              {placed
                .filter((p) => p.lane < lanes)
                .map((p) => {
                  const { entry, startCol, endCol, lane, continuesBefore, continuesAfter } = p;
                  const style: CSSProperties = {
                    gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                    gridRow: lane + 1,
                  };
                  // A bar that carries on past the row edge runs right to it, unrounded,
                  // so it visibly continues into the next (or previous) week.
                  const edges = cn(
                    continuesBefore ? "ml-0 rounded-l-none" : "ml-0.5 sm:ml-1.5",
                    continuesAfter ? "mr-0 rounded-r-none" : "mr-0.5 sm:mr-1.5",
                  );
                  if (entry.kind === "holiday") {
                    const h = entry.item;
                    return (
                      <div
                        key={h.id}
                        role="note"
                        aria-label={`Bank holiday: ${h.title}`}
                        title={h.notes ? `${h.title} — ${h.notes}` : h.title}
                        style={style}
                        className={cn(HOLIDAY_CHIP, "mx-0.5 sm:mx-1.5")}
                      >
                        <Landmark className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{h.title}</span>
                      </div>
                    );
                  }
                  if (entry.kind === "event") {
                    const ev = entry.item;
                    const allDay = isAllDay(ev);
                    return (
                      <button
                        key={`${ev.id}-${startCol}`}
                        type="button"
                        onClick={() => onOpenEvent(ev)}
                        style={{ ...style, ...eventTintStyle(eventColour(ev.colour)) }}
                        aria-label={`${allDay ? "All day: " : `${timeLabel(ev.start)}, `}${ev.title}${
                          isMultiDay(ev, timezone) ? `, until ${endLabel(ev)}` : ""
                        }`}
                        className={cn(
                          "pointer-events-auto flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight sm:px-1.5",
                          edges,
                        )}
                      >
                        <Marquee animate={sliding}>
                          {continuesBefore ? (
                            <span className="opacity-75" aria-label="Continues from earlier">
                              ↳
                            </span>
                          ) : allDay ? null : (
                            <span className="font-extrabold tabular-nums">
                              {timeLabel(ev.start)}
                            </span>
                          )}
                          <span className="font-semibold">{ev.title}</span>
                        </Marquee>
                        {continuesAfter ? <span className="ml-auto opacity-75">→</span> : null}
                      </button>
                    );
                  }
                  const b = entry.item;
                  const cancelled = isCancelled(b);
                  const payment = blockPayment(b, paymentColours);
                  const tag = tagFor(b);
                  const client = clientFor(b);
                  const multi = isMultiDay(b, timezone);
                  const showTime = monthBar.has("time");
                  const showClient = monthBar.has("client") && client;
                  const showTag = monthBar.has("record") && tag;
                  const category = categoryFor(b);
                  const showCategory = monthBar.has("category") && category;
                  const showLift = monthBar.has("lift") && Boolean(b.clientLift);
                  // "Category only" on a service that has none would leave the
                  // bar blank, so the name steps in for that service.
                  const showService =
                    monthBar.has("service") ||
                    (!showCategory && !showTime && !showClient && !showTag);
                  return (
                    <button
                      key={`${b.id}-${startCol}`}
                      type="button"
                      onClick={() => onOpenBooking(b.id)}
                      title={payment.label}
                      aria-label={`${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${client ? `${client}, ` : ""}${serviceLabel(
                        b,
                      )}${multi ? `, until ${endLabel(b)}` : ""} — ${payment.label}${cancelled ? ", cancelled" : ""}`}
                      style={{ ...style, ...payment.style }}
                      className={cn(
                        "pointer-events-auto flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight sm:px-1.5",
                        payment.className,
                        edges,
                        cancelled && "opacity-50",
                      )}
                    >
                      {showLift ? <LiftTag /> : null}
                      {/* The label slides if it is wider than the bar, so a one-day
                          cell still shows everything that was switched on. */}
                      <Marquee animate={sliding}>
                        {continuesBefore ? (
                          <span className="opacity-75" aria-label="Continues from earlier">
                            ↳
                          </span>
                        ) : showTime ? (
                          b.allDay ? (
                            <span className="font-extrabold">All day</span>
                          ) : (
                            <span className="font-extrabold tabular-nums">
                              {timeLabel(b.start)}
                            </span>
                          )
                        ) : null}
                        {showClient ? (
                          <span className={cn("font-semibold", cancelled && "line-through")}>
                            {client}
                          </span>
                        ) : null}
                        {showTag ? <span className="font-semibold">{tag}</span> : null}
                        {showCategory ? (
                          <span className="opacity-75">
                            {showService ? `${category} ·` : category}
                          </span>
                        ) : null}
                        {showService ? (
                          <span className={cn(cancelled && "line-through")}>
                            {b.serviceSnapshot.name}
                          </span>
                        ) : null}
                      </Marquee>
                      {continuesAfter ? <span className="ml-auto opacity-75">→</span> : null}
                    </button>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
