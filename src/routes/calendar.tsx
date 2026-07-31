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
import { useDemo } from "@/lib/demo-store";
import type { Booking } from "@/lib/demo-data";
import {
  addDays,
  demoToday,
  isoDate,
  startOfWeek,
  timeToMinutes,
  ukDateLong,
} from "@/lib/format";
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
      { property: "og:description", content: "Weekly scheduling for trainers, locations and group sessions." },
    ],
  }),
  component: CalendarPage,
});

const START_HOUR = 6;
const END_HOUR = 21;
const HOUR_HEIGHT = 60;

function CalendarPage() {
  const demo = useDemo();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(() => demoToday());
  const [staffFilter, setStaffFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week")
      return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return Array.from({ length: 35 }, (_, i) => addDays(startOfWeek(first), i));
  }, [view, anchor]);

  const filtered = demo.bookings.filter(
    (b) =>
      (staffFilter === "all" || b.staffId === staffFilter) &&
      (locationFilter === "all" || b.locationId === locationFilter) &&
      (serviceFilter === "all" || b.serviceId === serviceFilter) &&
      (demo.currentLocation === "all" || b.locationId === demo.currentLocation),
  );

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayIso = isoDate(demoToday());

  const shift = (dir: number) =>
    setAnchor((a) => addDays(a, view === "day" ? dir : view === "week" ? dir * 7 : dir * 28));

  const range =
    view === "month"
      ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : view === "day"
        ? ukDateLong(isoDate(anchor))
        : `${ukDateLong(isoDate(days[0]))} – ${ukDateLong(isoDate(days[6]))}`;

  return (
    <AppShell>
      <PageHeader
        title="Calendar"
        description="Drag sessions to reschedule, click any booking for the full detail panel."
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
          <Button variant="ghost" onClick={() => setAnchor(demoToday())}>Today</Button>
        </div>
        <p className="text-sm font-semibold">{range}</p>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="w-full sm:ml-auto sm:w-auto">
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Trainer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              {demo.staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full sm:w-[190px]"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {demo.locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-full sm:w-[190px]"><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {demo.services.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === "month" ? (
        <div className="surface-card overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 border-b bg-secondary/50 text-xs font-medium text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-3 py-2">{d}</div>
            ))}
          </div>
          <div className="grid min-w-[640px] grid-cols-7">
            {days.map((day) => {
              const iso = isoDate(day);
              const dayBookings = filtered.filter((b) => b.date === iso);
              return (
                <div
                  key={iso}
                  className={cn(
                    "min-h-28 border-r border-b p-2 last:border-r-0",
                    day.getMonth() !== anchor.getMonth() && "bg-secondary/30 text-muted-foreground",
                  )}
                >
                  <p className={cn("text-xs font-semibold", iso === todayIso && "text-primary")}>
                    {day.getDate()}
                  </p>
                  <div className="mt-1 space-y-1">
                    {dayBookings.slice(0, 3).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className="block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium"
                        style={{
                          backgroundColor: "color-mix(in oklab, " + demo.serviceById(b.serviceId).colour + " 16%, transparent)",
                          color: demo.serviceById(b.serviceId).colour,
                        }}
                      >
                        {b.time} {demo.serviceById(b.serviceId).name}
                      </button>
                    ))}
                    {dayBookings.length > 3 ? (
                      <p className="text-[11px] text-muted-foreground">+{dayBookings.length - 3} more</p>
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
                const dayBookings = filtered.filter((b) => b.date === iso);
                const blocks = demo.blockedTimes.filter(
                  (b) => b.date === iso && (staffFilter === "all" || b.staffId === staffFilter),
                );
                return (
                  <div key={iso} className="relative flex-1 border-l">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div key={i} className="border-b" style={{ height: HOUR_HEIGHT }} />
                    ))}

                    {iso === todayIso && nowMinutes > START_HOUR * 60 && nowMinutes < END_HOUR * 60 ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                        style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
                      >
                        <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-destructive" />
                      </div>
                    ) : null}

                    {blocks.map((b) => (
                      <div
                        key={b.id}
                        className="absolute inset-x-1 z-10 rounded-lg border border-dashed bg-secondary/80 px-2 py-1 text-[11px] text-muted-foreground"
                        style={{
                          top: ((timeToMinutes(b.time) - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                          height: (b.duration / 60) * HOUR_HEIGHT - 4,
                        }}
                      >
                        {b.reason}
                      </div>
                    ))}

                    {dayBookings.map((b) => {
                      const svc = demo.serviceById(b.serviceId);
                      const cancelled = b.status === "cancelled" || b.status === "late_cancellation";
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelected(b)}
                          className={cn(
                            "absolute inset-x-1 z-10 cursor-grab overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left transition-shadow hover:shadow-float active:cursor-grabbing",
                            cancelled && "opacity-45 line-through",
                          )}
                          style={{
                            top: ((timeToMinutes(b.time) - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                            height: (svc.duration / 60) * HOUR_HEIGHT - 4,
                            borderLeftColor: svc.colour,
                            backgroundColor: `color-mix(in oklab, ${svc.colour} 12%, var(--color-card))`,
                          }}
                        >
                          <p className="truncate text-[11px] font-semibold">{b.time} {svc.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {b.capacity > 2
                              ? `${b.booked}/${b.capacity} booked`
                              : b.clientIds.map((id) => demo.clientById(id)?.name).join(", ")}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {demo.staffById(b.staffId).name}
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
        {demo.services.map((s) => (
          <span key={s.id} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.colour }} />
            {s.name}
          </span>
        ))}
      </div>

      <AddBookingModal open={addOpen} onOpenChange={setAddOpen} />
      <BookingPanel booking={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}
