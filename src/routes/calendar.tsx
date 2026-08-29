import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
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
import { useBookings, useServices, useStaffList } from "@/lib/api/hooks";
import { addDays, formatInTz, isoDate, startOfWeek, ukDateLong } from "@/lib/format";
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

  const filtered = (bookings.data?.bookings ?? []).filter(
    (b) => serviceFilter === "all" || b.serviceSnapshot.serviceId === serviceFilter,
  );

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

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Click any booking for the full detail panel. Use the top bar to filter by location."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <CalendarPlus className="size-4" /> Add booking
          </Button>
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
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Trainer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                .filter((b) => isoDateInTz(b.start, timezone) === iso)
                .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <div
                  key={iso}
                  className={cn(
                    // The card draws its own edge, so the grid drops the borders
                    // that would otherwise double up along the right and bottom.
                    "relative min-h-[116px] border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-child(n+36)]:border-b-0",
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

                  <div className="relative mt-1 flex flex-col gap-0.5">
                    {dayBookings.slice(0, 3).map((b) => {
                      const cancelled =
                        b.status === "cancelled_by_customer" ||
                        b.status === "cancelled_by_business" ||
                        b.status === "late_cancelled";
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBookingId(b.id)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-1.5 truncate rounded border-l-[3px] border-primary bg-primary-soft px-1.5 py-0.5 text-left text-[11px] leading-tight",
                            cancelled && "opacity-45 line-through",
                          )}
                        >
                          <span className="font-semibold tabular-nums">
                            {formatInTz(b.start, timezone, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="truncate">{b.serviceSnapshot.name}</span>
                        </button>
                      );
                    })}
                    {dayBookings.length > 3 ? (
                      <button
                        type="button"
                        onClick={() => openDay(day)}
                        className="cursor-pointer px-1 text-left text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        +{dayBookings.length - 3} more
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
                const dayBookings = filtered.filter((b) => isoDateInTz(b.start, timezone) === iso);
                return (
                  <div key={iso} className="relative flex-1 border-l">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div key={i} className="border-b" style={{ height: HOUR_HEIGHT }} />
                    ))}

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

                    {dayBookings.map((b) => {
                      const cancelled =
                        b.status === "cancelled_by_customer" ||
                        b.status === "cancelled_by_business" ||
                        b.status === "late_cancelled";
                      const startMin = minutesOf(b.start, timezone);
                      const trainer = staff.data?.find((s) => s.id === b.staffId);
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBookingId(b.id)}
                          className={cn(
                            "absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded-lg border-l-[3px] border-primary bg-primary-soft px-2 py-1 text-left",
                            cancelled && "opacity-45 line-through",
                          )}
                          style={{
                            top: ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                            height: (b.serviceSnapshot.durationMinutes / 60) * HOUR_HEIGHT - 4,
                          }}
                        >
                          <p className="truncate text-[11px] font-semibold">
                            {formatInTz(b.start, timezone, { hour: "2-digit", minute: "2-digit" })}{" "}
                            {b.serviceSnapshot.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {b.attendees.length > 1
                              ? `${b.seatCount}/${b.attendees.length} booked`
                              : trainer?.displayName}
                          </p>
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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(services.data ?? []).map((s) => (
          <span key={s.id} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: s.colour ?? "var(--color-chart-1)" }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <AddBookingModal open={addOpen} onOpenChange={setAddOpen} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}
