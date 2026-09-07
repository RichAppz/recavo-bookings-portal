import { useMemo, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddToCalendarChooser } from "@/components/AddToCalendarChooser";
import { BookingPanel } from "@/components/BookingPanel";
import { DEFAULT_EVENT_COLOUR, EventModal } from "@/components/EventModal";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useBookings,
  useCalendarBlocks,
  useLinkedRecordsById,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { addDays, formatInTz, formatMoney, isoDate, startOfWeek, ukDateLong } from "@/lib/format";
import type { Booking, CalendarBlock, LinkedRecord } from "@/lib/api/types";
import {
  bookingSettlement,
  paymentLabel,
  paymentTone,
  type PaymentTone,
} from "@/lib/booking-payment";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — RECAVO scheduling" },
      {
        name: "description",
        content:
          "Day, week and month scheduling with trainer, location and service filters, group occupancy and blocked time.",
      },
      { property: "og:title", content: "RECAVO Calendar" },
      {
        property: "og:description",
        content: "Weekly scheduling for trainers, locations and group sessions.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <CalendarPage />
      </AppShell>
    </RequireAuth>
  ),
});

const START_HOUR = 6;
const END_HOUR = 21;
const HOUR_HEIGHT = 60;

/**
 * Payment status is the one thing staff most need to read off the calendar
 * without opening a booking, so it owns the chip colour: green when nothing is
 * owed (paid, free, credit, cancelled), amber deposit or part paid, red
 * nothing received.
 */
// "Nothing to collect" (free, credit, cancelled) shares the settled green: to
// the person reading the calendar both mean "no money to chase", and teal next
// to green was too close to tell apart.
const PAYMENT_CHIP: Record<PaymentTone, string> = {
  paid: "border-success bg-success-soft",
  partial: "border-warning bg-warning-soft",
  unpaid: "border-destructive bg-destructive-soft",
  none: "border-success bg-success-soft",
};

const PAYMENT_LEGEND: { tone: PaymentTone; label: string }[] = [
  { tone: "paid", label: "Paid / nothing to collect" },
  { tone: "partial", label: "Deposit / part paid" },
  { tone: "unpaid", label: "Unpaid" },
];

const PAYMENT_DOT: Record<PaymentTone, string> = {
  paid: "bg-success",
  partial: "bg-warning",
  unpaid: "bg-destructive",
  none: "bg-success",
};

const SERVICE_FALLBACK_COLOUR = "var(--color-chart-1)";

/** The service's colour swatch, shared by the chips and the legend. */
function ServiceDot({ colour, className }: { colour: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: colour }}
    />
  );
}

/**
 * What identifies the linked record at a glance. The vehicle template's
 * `registration` field is the thing a detailer recognises a job by, so it wins;
 * other record types (pets, …) fall back to the record's own label.
 */
function recordTag(record: LinkedRecord | undefined): string | null {
  if (!record) return null;
  const reg = record.values?.registration;
  if (typeof reg === "string" && reg.trim()) return reg.trim().toUpperCase();
  return record.displayLabel || null;
}

const isCancelled = (b: Booking) =>
  b.status === "cancelled_by_customer" ||
  b.status === "cancelled_by_business" ||
  b.status === "late_cancelled";

/** Tone, classes and a spoken label for one booking's chip. */
function chipPayment(b: Booking) {
  const settlement = bookingSettlement(b);
  const tone = paymentTone(settlement, b.status);
  return {
    tone,
    className: PAYMENT_CHIP[tone],
    label: paymentLabel(settlement, b.currency, formatMoney),
  };
}

/** Anything with a `[start, end)` window that can be laid onto the grid. */
type Spanning = { start: string; end: string };

/**
 * Event chips are painted in the event's own colour, tinted and hatched so they read
 * as "not a job" next to booking chips even for someone who picks a similar hue.
 */
function eventChipStyle(colour: string): CSSProperties {
  return {
    borderLeftColor: colour,
    backgroundColor: `${colour}1F`,
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${colour}14 6px 8px)`,
  };
}

/** Snap a click's Y offset on a day column to the nearest quarter hour, as HH:MM. */
function timeAtOffset(offsetY: number): string {
  const minutes = START_HOUR * 60 + Math.floor((offsetY / HOUR_HEIGHT) * 4) * 15;
  const clamped = Math.min(Math.max(minutes, START_HOUR * 60), END_HOUR * 60 - 15);
  return `${`${Math.floor(clamped / 60)}`.padStart(2, "0")}:${`${clamped % 60}`.padStart(2, "0")}`;
}

/** Six Monday-first weeks from the Monday on or before the 1st. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function CalendarPage() {
  const tenant = useTenant();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>(undefined);
  const [addTime, setAddTime] = useState<string | undefined>(undefined);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarBlock | null>(null);
  /** Open Add booking on a given day (defaults to the day in view, or today). */
  const openAdd = (iso?: string) => {
    setAddDate(iso);
    setAddOpen(true);
  };
  const openAddEvent = (iso?: string, time?: string) => {
    setAddDate(iso);
    setAddTime(time);
    setEditingEvent(null);
    setEventOpen(true);
  };
  /** An empty slot could be either a booking or an event, so ask first (RECA-531). */
  const openChooser = (iso?: string, time?: string) => {
    setAddDate(iso);
    setAddTime(time);
    setChooserOpen(true);
  };
  const openEvent = (block: CalendarBlock) => {
    setEditingEvent(block);
    setEventOpen(true);
  };

  const services = useServices();
  const staff = useStaffList();

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "month") return monthGrid(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  }, [view, anchor]);

  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const bookings = useBookings({
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
    // A six-week grid clears the server's default page of 50 on any busy month,
    // and a calendar that quietly omits sessions is worse than no calendar.
    limit: 200,
  });

  // Events sit beside bookings on the same grid; the server guarantees they never overlap.
  const blocks = useCalendarBlocks({
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
  });
  const events = blocks.data ?? [];

  const filtered = (bookings.data?.bookings ?? []).filter(
    (b) => serviceFilter === "all" || b.serviceSnapshot.serviceId === serviceFilter,
  );

  // One batched lookup for every vehicle (or other linked record) in view, so
  // chips can show the registration without opening the booking.
  const linkedRecords = useLinkedRecordsById(filtered.map((b) => b.linkedRecordId));
  const tagFor = (b: Booking) =>
    b.linkedRecordId ? recordTag(linkedRecords.get(b.linkedRecordId)) : null;

  // Service identity rides along as a dot inside each chip; the chip's
  // border/background belong to payment status. A service with no colour set
  // still gets a dot so the row of chips reads consistently.
  const serviceColour = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services.data ?? []) map.set(s.id, s.colour ?? SERVICE_FALLBACK_COLOUR);
    return (b: Booking) => map.get(b.serviceSnapshot.serviceId) ?? SERVICE_FALLBACK_COLOUR;
  }, [services.data]);

  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayIso = isoDate(new Date());

  const shift = (dir: number) =>
    setAnchor((a) =>
      view === "month"
        ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
        : addDays(a, view === "day" ? dir : dir * 7),
    );

  /** Clicking a day in the month grid opens that day, the way a diary works. */
  const openDay = (day: Date) => {
    setAnchor(day);
    setView("day");
  };

  const range =
    view === "month"
      ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : view === "day"
        ? ukDateLong(isoDate(anchor))
        : `${ukDateLong(isoDate(days[0]))} – ${ukDateLong(isoDate(days[6]))}`;

  const minutesOf = (iso: string, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  };

  const isoDateInTz = (iso: string, tz: string) => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  };

  /**
   * Which calendar days a booking touches. Multi-day jobs (a two-day ceramic
   * coating) show on every day they cover, not just the drop-off day. An end
   * exactly on midnight belongs to the previous day, hence the minute shaved off.
   */
  const coversDay = (b: Spanning, iso: string) => {
    const first = isoDateInTz(b.start, timezone);
    const lastInstant = new Date(new Date(b.end).getTime() - 60_000).toISOString();
    const last = isoDateInTz(lastInstant, timezone);
    return first <= iso && iso <= last;
  };
  const startsOn = (b: Spanning, iso: string) => isoDateInTz(b.start, timezone) === iso;
  const endsOn = (b: Spanning, iso: string) => {
    const lastInstant = new Date(new Date(b.end).getTime() - 60_000).toISOString();
    return isoDateInTz(lastInstant, timezone) === iso;
  };
  const isMultiDay = (b: Spanning) => !endsOn(b, isoDateInTz(b.start, timezone));
  const endLabel = (b: Spanning) =>
    formatInTz(b.end, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });

  /**
   * Clip an item to today's column: one that began yesterday runs from the top of the
   * grid, one that ends tomorrow runs off the bottom.
   */
  const columnBox = (b: Spanning, iso: string) => {
    const startsToday = startsOn(b, iso);
    const endsToday = endsOn(b, iso);
    const topMin = startsToday ? minutesOf(b.start, timezone) : START_HOUR * 60;
    const bottomMin = endsToday
      ? Math.min(minutesOf(b.end, timezone) || END_HOUR * 60, END_HOUR * 60)
      : END_HOUR * 60;
    const heightMin = Math.max(bottomMin - topMin, 30);
    return {
      startsToday,
      endsToday,
      heightMin,
      top: ((topMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
      height: (heightMin / 60) * HOUR_HEIGHT - 4,
    };
  };
  const bookingLabel = tenant.terminology.booking || "Booking";

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Click any ${bookingLabel.toLowerCase()} or event to open it; click an empty slot to add one. Use the top bar to filter by location.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => openAddEvent(view === "day" ? isoDate(anchor) : undefined)}
            >
              <Clock className="size-4" /> Add event
            </Button>
            <Button onClick={() => openAdd(view === "day" ? isoDate(anchor) : undefined)}>
              <CalendarPlus className="size-4" /> Add {bookingLabel.toLowerCase()}
            </Button>
          </div>
        }
      />

      <div className="surface-card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
        </div>
        <p className="text-sm font-semibold">{range}</p>
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as typeof view)}
          className="w-full sm:ml-auto sm:w-auto"
        >
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {/* A one-person business has nothing to filter by; the control is noise. */}
          {(staff.data?.length ?? 0) > 1 ? (
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={tenant.terminology.staff || "Staff member"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All {(tenant.terminology.staff || "Staff member").toLowerCase()}s
                </SelectItem>
                {(staff.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-full sm:w-[190px]">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {(services.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {bookings.data?.nextCursor ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          This range has more bookings than we can show at once. Narrow it with the filters, or
          switch to week or day view, to see them all.
        </p>
      ) : null}

      {blocks.isError ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Couldn't load events for this range; bookings are still shown.
        </p>
      ) : null}

      {bookings.isError ? (
        <div className="surface-card p-6 text-sm text-destructive">
          Couldn't load bookings for this range.
        </div>
      ) : bookings.isLoading ? (
        <div className="surface-card min-h-[480px] animate-pulse" />
      ) : view === "month" ? (
        <div className="surface-card overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-secondary/50 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {days.slice(0, 7).map((day) => (
              <div key={day.toISOString()} className="py-2">
                {day.toLocaleDateString("en-GB", { weekday: "short" })}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const iso = isoDate(day);
              const outside = day.getMonth() !== anchor.getMonth();
              const dayBookings = filtered
                .filter((b) => coversDay(b, iso))
                .sort((a, b) => a.start.localeCompare(b.start));
              const dayEvents = events
                .filter((e) => coversDay(e, iso))
                .sort((a, b) => a.start.localeCompare(b.start));
              const dayItems: (
                { kind: "booking"; item: Booking } | { kind: "event"; item: CalendarBlock }
              )[] = [
                ...dayBookings.map((item) => ({ kind: "booking" as const, item })),
                ...dayEvents.map((item) => ({ kind: "event" as const, item })),
              ].sort((a, b) => a.item.start.localeCompare(b.item.start));
              return (
                <div
                  key={iso}
                  className={cn(
                    // The card draws its own edge, so the grid drops the borders
                    // that would otherwise double up along the right and bottom.
                    "group relative min-h-[116px] border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-child(n+36)]:border-b-0",
                    outside && "bg-muted/30",
                  )}
                >
                  {/* Sits behind the chips so empty space opens the day, while a
                      chip still opens its own booking. Nesting the two as real
                      buttons would be invalid markup. */}
                  <button
                    type="button"
                    onClick={() => openDay(day)}
                    className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/50"
                    aria-label={`Open ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
                  />

                  <span
                    className={cn(
                      "pointer-events-none relative inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      outside ? "text-muted-foreground/60" : "text-foreground",
                      iso === todayIso && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {/* Quick add for this day; shows on hover (always on touch, which has no hover). */}
                  <button
                    type="button"
                    onClick={() => openChooser(iso)}
                    className="absolute top-1.5 right-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    aria-label={`Add to ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
                  >
                    <Plus className="size-3.5" />
                  </button>

                  <div className="relative mt-1 flex flex-col gap-0.5">
                    {dayItems.slice(0, 3).map((entry) => {
                      if (entry.kind === "event") {
                        const ev = entry.item;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => openEvent(ev)}
                            style={eventChipStyle(ev.colour)}
                            className="flex w-full cursor-pointer items-center gap-1.5 truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight"
                          >
                            {startsOn(ev, iso) ? (
                              <span className="font-semibold tabular-nums">
                                {timeLabel(ev.start)}
                              </span>
                            ) : (
                              <span
                                className="text-muted-foreground"
                                aria-label="Continues from earlier"
                              >
                                ↳
                              </span>
                            )}
                            <span className="truncate">{ev.title}</span>
                            {isMultiDay(ev) && !endsOn(ev, iso) ? (
                              <span className="ml-auto text-muted-foreground">→</span>
                            ) : null}
                          </button>
                        );
                      }
                      const b = entry.item;
                      const cancelled = isCancelled(b);
                      const payment = chipPayment(b);
                      const tag = tagFor(b);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBookingId(b.id)}
                          title={payment.label}
                          aria-label={`${tag ? `${tag}, ` : ""}${b.serviceSnapshot.name} — ${payment.label}`}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-1.5 truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight",
                            payment.className,
                            cancelled && "opacity-45 line-through",
                          )}
                        >
                          <ServiceDot colour={serviceColour(b)} />
                          {startsOn(b, iso) ? (
                            <span className="font-semibold tabular-nums">
                              {formatInTz(b.start, timezone, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span
                              className="text-muted-foreground"
                              aria-label="Continues from earlier"
                            >
                              ↳
                            </span>
                          )}
                          {tag ? <span className="shrink-0 font-semibold">{tag}</span> : null}
                          <span className="truncate">{b.serviceSnapshot.name}</span>
                          {isMultiDay(b) && !endsOn(b, iso) ? (
                            <span className="ml-auto text-muted-foreground">→</span>
                          ) : null}
                        </button>
                      );
                    })}
                    {dayItems.length > 3 ? (
                      <button
                        type="button"
                        onClick={() => openDay(day)}
                        className="cursor-pointer px-1 text-left text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        +{dayItems.length - 3} more
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <div className="flex border-b bg-secondary/50">
            <div className="w-16 shrink-0" />
            {days.map((day) => {
              const iso = isoDate(day);
              return (
                <div key={iso} className="flex-1 border-l px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">
                    {day.toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <p className={cn("text-sm font-semibold", iso === todayIso && "text-primary")}>
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <div className="relative flex min-w-[720px]">
              <div className="w-16 shrink-0">
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    className="border-b pr-2 text-right text-[11px] text-muted-foreground"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    {`${START_HOUR + i}`.padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {days.map((day) => {
                const iso = isoDate(day);
                const dayBookings = filtered.filter((b) => coversDay(b, iso));
                const dayEvents = events.filter((e) => coversDay(e, iso));
                return (
                  <div key={iso} className="relative flex-1 border-l">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div key={i} className="border-b" style={{ height: HOUR_HEIGHT }} />
                    ))}
                    {/* Empty space in a column asks "booking or event?" for the hour
                        clicked; chips sit above it. */}
                    <button
                      type="button"
                      onClick={(e) => openChooser(iso, timeAtOffset(e.nativeEvent.offsetY))}
                      className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/40"
                      aria-label={`Add to ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
                    />

                    {iso === todayIso &&
                    nowMinutes > START_HOUR * 60 &&
                    nowMinutes < END_HOUR * 60 ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                        style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
                      >
                        <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-destructive" />
                      </div>
                    ) : null}

                    {dayEvents.map((ev) => {
                      const box = columnBox(ev, iso);
                      const owner = staff.data?.find((s) => s.id === ev.staffId);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => openEvent(ev)}
                          className="absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left"
                          style={{ ...eventChipStyle(ev.colour), top: box.top, height: box.height }}
                        >
                          <p className="truncate text-[11px] font-semibold">
                            {box.startsToday ? timeLabel(ev.start) : "↳"} {ev.title}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {owner?.displayName ?? "Event"}
                          </p>
                          {isMultiDay(ev) ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              Until {endLabel(ev)}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}

                    {dayBookings.map((b) => {
                      const cancelled = isCancelled(b);
                      const payment = chipPayment(b);
                      const tag = tagFor(b);
                      const { startsToday, endsToday, heightMin, top, height } = columnBox(b, iso);
                      const trainer = staff.data?.find((s) => s.id === b.staffId);
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBookingId(b.id)}
                          title={payment.label}
                          aria-label={`${tag ? `${tag}, ` : ""}${b.serviceSnapshot.name} — ${payment.label}`}
                          className={cn(
                            // flex-col so the text sits at the top of a tall block; a
                            // button centres its content vertically by default.
                            "absolute inset-x-1 z-10 flex cursor-pointer flex-col items-stretch justify-start overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left",
                            payment.className,
                            cancelled && "opacity-45 line-through",
                          )}
                          style={{ top, height }}
                        >
                          <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold">
                            <ServiceDot colour={serviceColour(b)} />
                            <span className="truncate">
                              {startsToday ? timeLabel(b.start) : "↳"} {b.serviceSnapshot.name}
                            </span>
                          </p>
                          {tag ? (
                            <p className="truncate text-[11px] font-semibold tracking-wide">
                              {tag}
                            </p>
                          ) : null}
                          <p className="truncate text-[11px] text-muted-foreground">
                            {b.attendees.length > 1
                              ? `${b.seatCount}/${b.attendees.length} booked`
                              : trainer?.displayName}
                          </p>
                          {isMultiDay(b) ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {endsToday ? `Ready ${endLabel(b)}` : `Until ${endLabel(b)}`}
                            </p>
                          ) : null}
                          {/* Money still owed is worth a line of its own when the
                              block is tall enough to hold one (≥ 1h). Settled and
                              no-charge bookings say it with colour alone. */}
                          {!cancelled &&
                          (payment.tone === "unpaid" || payment.tone === "partial") &&
                          heightMin >= 60 ? (
                            <p className="truncate text-[11px] font-medium">{payment.label}</p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium">Payment (chip colour):</span>
          {PAYMENT_LEGEND.map(({ tone, label }) => (
            <span key={tone} className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", PAYMENT_DOT[tone])} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: DEFAULT_EVENT_COLOUR }}
            />
            Event (own colour, hatched)
          </span>
        </div>
        {(services.data ?? []).length > 0 ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-medium">Service (dot):</span>
            {(services.data ?? []).map((s) => (
              <span key={s.id} className="flex items-center gap-2">
                <ServiceDot colour={s.colour ?? SERVICE_FALLBACK_COLOUR} className="size-2.5" />
                {s.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <AddToCalendarChooser
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        date={addDate}
        time={addTime}
        onBooking={() => {
          setChooserOpen(false);
          openAdd(addDate);
        }}
        onEvent={() => {
          setChooserOpen(false);
          openAddEvent(addDate, addTime);
        }}
      />
      <AddBookingModal
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultDate={addDate}
        defaultStaffId={staffFilter !== "all" ? staffFilter : undefined}
      />
      <EventModal
        open={eventOpen}
        onOpenChange={(o) => {
          setEventOpen(o);
          if (!o) setEditingEvent(null);
        }}
        block={editingEvent}
        defaultDate={addDate}
        defaultTime={addTime}
        defaultStaffId={staffFilter !== "all" ? staffFilter : undefined}
      />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}
