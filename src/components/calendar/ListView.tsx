import type { ReactNode } from "react";
import { Landmark } from "lucide-react";

import type { Booking, CalendarBlock, Staff } from "@/lib/api/types";
import { dayCountLabel, listDayHeading } from "@/lib/calendar-layout";
import { formatInTz, isAllDayEvent, isoDate } from "@/lib/format";
import { paymentDotStyle, type PaymentColours } from "@/lib/payment-colours";
import { cn } from "@/lib/utils";

import {
  blockPayment,
  coversDay,
  DuePill,
  firstDayOf,
  isCancelled,
  LiftTag,
  type HolidayItem,
} from "./shared";

/**
 * Spec §4.5 / §2.7: the range as a list grouped by day. Rows carry time, service
 * over client, a due pill when money is owed and a thin status bar on the right.
 * Days with nothing on are skipped.
 */
export function ListView({
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
  clientFor,
  tagFor,
  categoryFor,
  bookingNoun,
  loading,
  emptyTitle,
  emptyActions,
  onOpenBooking,
  onOpenEvent,
  onNext,
}: {
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
  clientFor: (b: Booking) => string | null;
  tagFor: (b: Booking) => string | null;
  categoryFor: (b: Booking) => string | null;
  bookingNoun: string;
  loading: boolean;
  /** `null` for a period already in the past: no prompt card, just a quiet note. */
  emptyTitle: string | null;
  emptyActions?: ReactNode;
  onOpenBooking: (id: string) => void;
  onOpenEvent: (block: CalendarBlock) => void;
  onNext: () => void;
}) {
  const today = new Date();
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const staffName = (id: string | null | undefined) =>
    id ? staff.find((s) => s.id === id)?.displayName : undefined;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[760px] space-y-2" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    );
  }

  const groups = days
    .map((day) => {
      const iso = isoDate(day);
      // A multi-day job is listed once, on the day it starts.
      const dayBookings = bookings
        .filter((b) => firstDayOf(b, timezone) === iso)
        .sort((a, b) => a.start.localeCompare(b.start));
      const dayEvents = events
        .filter((e) => coversDay(e, iso, timezone))
        .sort((a, b) => a.start.localeCompare(b.start));
      const holiday = holidays.find((h) => h.date === iso);
      return { day, iso, dayBookings, dayEvents, holiday };
    })
    .filter((g) => g.dayBookings.length > 0 || g.dayEvents.length > 0 || g.holiday);

  if (groups.length === 0) {
    if (emptyTitle === null) {
      return (
        <p className="mx-auto w-full max-w-[760px] px-1 py-6 text-center text-sm font-semibold text-muted-foreground">
          No {bookingNoun}s
        </p>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
        <p className="text-[15px] font-bold">{emptyTitle}</p>
        {emptyActions ? (
          <div className="flex flex-wrap justify-center gap-2">{emptyActions}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      {groups.map(({ day, iso, dayBookings, dayEvents, holiday }) => {
        const sessions = dayBookings.filter((b) => !isCancelled(b)).length;
        return (
          <section key={iso} aria-label={day.toLocaleDateString("en-GB", { dateStyle: "full" })}>
            <header className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 className={cn("text-sm font-extrabold", iso === todayIso && "text-primary")}>
                {listDayHeading(day, today)}
              </h3>
              <p className="text-xs font-semibold text-muted-foreground">
                {dayCountLabel(sessions, dayEvents.length, bookingNoun)}
              </p>
            </header>
            <ul className="space-y-2">
              {holiday ? (
                <li className="flex items-center gap-2 rounded-2xl border border-dashed px-3.5 py-2 text-xs text-muted-foreground">
                  <Landmark className="size-3.5 shrink-0" aria-hidden />
                  Bank holiday · {holiday.title}
                </li>
              ) : null}
              {[
                ...dayEvents.map((item) => ({ kind: "event" as const, item, start: item.start })),
                ...dayBookings.map((item) => ({
                  kind: "booking" as const,
                  item,
                  start: item.start,
                })),
              ]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((row) => {
                  if (row.kind === "event") {
                    const ev = row.item;
                    const allDay = isAllDayEvent(ev.start, ev.end, timezone);
                    const colour = eventColour(ev.colour);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => onOpenEvent(ev)}
                          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/40"
                          aria-label={`Event: ${ev.title}, ${allDay ? "all day" : `${timeLabel(ev.start)} to ${timeLabel(ev.end)}`}`}
                        >
                          <span className="w-12 shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                            {allDay ? "All day" : timeLabel(ev.start)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-bold">{ev.title}</span>
                            <span className="block truncate text-[13px] text-muted-foreground">
                              Event
                              {!soleStaff && staffName(ev.staffId)
                                ? ` · ${staffName(ev.staffId)}`
                                : ""}
                            </span>
                          </span>
                          <span
                            aria-hidden
                            className="h-8 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: colour }}
                          />
                        </button>
                      </li>
                    );
                  }
                  const b = row.item;
                  const cancelled = isCancelled(b);
                  const payment = blockPayment(b, paymentColours);
                  const bar = paymentDotStyle(payment.tone, paymentColours);
                  const client = clientFor(b);
                  const tag = tagFor(b);
                  const category = categoryFor(b);
                  const trainer = staffName(b.staffId);
                  const group = b.attendees.length > 1;
                  const detail = group
                    ? [trainer, `${b.seatCount} of ${b.attendees.length} places`]
                        .filter(Boolean)
                        .join(" · ")
                    : [tag, client, soleStaff ? null : trainer].filter(Boolean).join(" · ");
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => onOpenBooking(b.id)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/40",
                          cancelled && "opacity-60",
                        )}
                        aria-label={`${b.serviceSnapshot.name}${client ? `, ${client}` : ""}, ${
                          b.allDay ? "all day" : `${timeLabel(b.start)} to ${timeLabel(b.end)}`
                        }, ${payment.label}${cancelled ? ", cancelled" : ""}`}
                      >
                        <span className="w-12 shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                          {b.allDay ? "All day" : timeLabel(b.start)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "flex items-center gap-1.5 truncate text-[15px] font-bold",
                              cancelled && "line-through",
                            )}
                          >
                            {b.clientLift ? <LiftTag /> : null}
                            <span className="truncate">
                              {b.serviceSnapshot.name}
                              {category ? (
                                <span className="font-normal text-muted-foreground">
                                  {" "}
                                  · {category}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {detail || payment.label}
                          </span>
                        </span>
                        {!cancelled ? <DuePill booking={b} colours={paymentColours} /> : null}
                        <span
                          aria-hidden
                          className={cn("h-8 w-1 shrink-0 rounded-full", bar.className)}
                          style={bar.style}
                        />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={onNext}
          className="cursor-pointer rounded-[10px] border bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary/60"
        >
          Show next week
        </button>
      </div>
    </div>
  );
}
