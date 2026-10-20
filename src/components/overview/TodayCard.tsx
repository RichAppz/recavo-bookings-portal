import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CarFront, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusinessId, useCustomer, useLocationsList, useStaffList } from "@/lib/api/hooks";
import { toastApiError } from "@/lib/api";
import { customerDisplayName, type Booking, type CalendarBlock } from "@/lib/api/types";
import { formatInTz, initials, isAllDayEvent } from "@/lib/format";
import { toastQueued, useOutbox } from "@/lib/offline/outbox";
import {
  nounFor,
  nowLineIndex,
  phoneTodayWindow,
  todayPill,
  todayPillLabel,
  type TodayPillKey,
} from "@/lib/overview";
import { PERMISSIONS } from "@/lib/permissions";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { localDay, segmentOn } from "@/lib/working-days";
import { CardError, CardTitle, OvCard, RowsGhost, TRACK, pillClass, useMoney } from "./shared";

const DESKTOP_MAX = 10;

type Entry =
  | { kind: "booking"; item: Booking; start: string; end: string }
  | { kind: "event"; item: CalendarBlock; start: string; end: string };

const hm = (iso: string, zone: string) =>
  formatInTz(iso, zone, { hour: "2-digit", minute: "2-digit" });

export function TodayCard({
  bookings,
  events,
  loading,
  error,
  onRetry,
  now,
  timeZone,
  variant,
  onOpenBooking,
  onOpenEvent,
  onAdd,
}: {
  bookings: Booking[];
  events: CalendarBlock[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  now: Date;
  timeZone: string;
  variant: "desktop" | "phone";
  onOpenBooking: (id: string) => void;
  onOpenEvent: (block: CalendarBlock) => void;
  onAdd: () => void;
}) {
  const tenant = useTenant();
  const money = useMoney();
  const noun = tenant.terminology.booking;
  const [showAll, setShowAll] = useState(false);
  const today = localDay(now.toISOString(), timeZone);

  const entries: Entry[] = [
    ...bookings.map((b) => {
      // Today's share of a multi-day job: its Friday hours on Friday.
      const seg = segmentOn(b, today, b.timezone || timeZone) ?? b;
      return { kind: "booking" as const, item: b, start: seg.start, end: seg.end };
    }),
    ...events.map((e) => ({ kind: "event" as const, item: e, start: e.start, end: e.end })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const t = now.getTime();
  const done = bookings.filter((b) => new Date(b.end).getTime() <= t).length;
  const toGo = bookings.length - done;
  const expected = bookings.reduce((sum, b) => sum + b.priceMinor, 0);
  const summary = [
    `${done} done`,
    `${toGo} to go`,
    money.allowed && expected > 0 ? `${money.format(expected)} expected` : null,
    events.length > 0 ? `${events.length} ${events.length === 1 ? "event" : "events"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let from = 0;
  let to = entries.length;
  if (variant === "phone") {
    ({ from, to } = phoneTodayWindow(entries, now));
  } else if (!showAll) {
    to = Math.min(entries.length, DESKTOP_MAX);
  }
  const shown = entries.slice(from, to);
  const nowAt = nowLineIndex(
    shown.map((e) => e.start),
    now,
  );
  const hidden = entries.length - shown.length;

  const header =
    variant === "phone" ? (
      <div className="flex items-center justify-between px-1 pb-2">
        <CardTitle id="today-title">Today</CardTitle>
        <Link
          to="/calendar"
          className="flex min-h-11 items-center text-sm font-bold text-muted-foreground"
        >
          Calendar <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    ) : (
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-3">
        <div className="min-w-0">
          <CardTitle id="today-title">Today</CardTitle>
          {!loading && !error ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{summary}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
          <Link to="/calendar">Open calendar</Link>
        </Button>
      </div>
    );

  const body = loading ? (
    <RowsGhost rows={variant === "phone" ? 3 : 5} />
  ) : error ? (
    <CardError onRetry={onRetry} />
  ) : entries.length === 0 ? (
    <div className="flex flex-col items-start gap-3 border-t border-border px-[18px] py-6">
      <p className="text-sm text-muted-foreground">No {nounFor(noun, 2)} today</p>
      <Button size="sm" onClick={onAdd}>
        Add {nounFor(noun, 1)}
      </Button>
    </div>
  ) : (
    <>
      <ul aria-labelledby="today-title">
        {shown.map((entry, i) => (
          <TodayEntry
            key={entry.item.id}
            entry={entry}
            before={i === nowAt && nowAt > 0 ? hm(now.toISOString(), timeZone) : null}
            now={now}
            timeZone={timeZone}
            variant={variant}
            onOpenBooking={onOpenBooking}
            onOpenEvent={onOpenEvent}
          />
        ))}
        {nowAt === shown.length && nowAt > 0 && nowAt < entries.length - from ? (
          <NowLine label={hm(now.toISOString(), timeZone)} />
        ) : null}
      </ul>
      {hidden > 0 ? (
        variant === "phone" ? (
          <Link
            to="/calendar"
            className="flex min-h-11 items-center justify-center border-t border-border text-sm font-bold"
          >
            Show all {entries.length}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex h-11 w-full cursor-pointer items-center justify-center border-t border-border text-sm font-bold hover:bg-secondary/60"
          >
            Show all {entries.length}
          </button>
        )
      ) : null}
    </>
  );

  if (variant === "phone") {
    return (
      <section aria-labelledby="today-title" className="min-w-0">
        {header}
        {variant === "phone" && !loading && !error && entries.length > 0 ? (
          <p className="-mt-1 px-1 pb-2 text-[12.5px] text-muted-foreground">{summary}</p>
        ) : null}
        <OvCard className="overflow-hidden [&>ul>li:first-child]:border-t-0">{body}</OvCard>
      </section>
    );
  }
  return (
    <OvCard label="Today" className="overflow-hidden">
      {header}
      {body}
    </OvCard>
  );
}

function NowLine({ label }: { label: string }) {
  return (
    <li aria-hidden className="flex h-[22px] items-center gap-2 px-[18px]">
      <span className="text-[11px] font-extrabold text-[#e5484d] tabular-nums">{label}</span>
      <span className="h-0.5 flex-1 rounded-full bg-[#e5484d]" />
    </li>
  );
}

function TodayEntry({
  entry,
  before,
  ...rest
}: {
  entry: Entry;
  before: string | null;
  now: Date;
  timeZone: string;
  variant: "desktop" | "phone";
  onOpenBooking: (id: string) => void;
  onOpenEvent: (block: CalendarBlock) => void;
}) {
  return (
    <>
      {before ? <NowLine label={before} /> : null}
      {entry.kind === "event" ? (
        <EventRow
          block={entry.item}
          timeZone={rest.timeZone}
          past={new Date(entry.end).getTime() <= rest.now.getTime()}
          variant={rest.variant}
          onClick={() => rest.onOpenEvent(entry.item)}
        />
      ) : (
        <BookingRow
          booking={entry.item}
          start={entry.start}
          end={entry.end}
          now={rest.now}
          variant={rest.variant}
          onClick={() => rest.onOpenBooking(entry.item.id)}
        />
      )}
    </>
  );
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      title={name ?? undefined}
      aria-hidden
      className={cn(
        "hidden size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-extrabold text-muted-foreground md:flex",
        TRACK,
      )}
    >
      {name ? initials(name) : "?"}
    </span>
  );
}

function TimeColumn({
  start,
  end,
  allDay,
  zone,
  variant,
}: {
  start: string;
  end: string;
  allDay: boolean;
  zone: string;
  variant: "desktop" | "phone";
}) {
  return (
    <div className={cn("shrink-0", variant === "phone" ? "w-11" : "w-[54px]")}>
      {allDay ? (
        <p className="text-sm font-bold">All day</p>
      ) : (
        <>
          <p className="text-sm font-bold tabular-nums">{hm(start, zone)}</p>
          {variant === "desktop" ? (
            <p className="text-xs text-muted-foreground tabular-nums">{hm(end, zone)}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

const ROW =
  "flex w-full items-center gap-3 border-t border-border px-[18px] py-[11px] text-left transition-colors hover:bg-secondary/60";

function BookingRow({
  booking,
  start,
  end,
  now,
  variant,
  onClick,
}: {
  booking: Booking;
  start: string;
  end: string;
  now: Date;
  variant: "desktop" | "phone";
  onClick: () => void;
}) {
  const tenant = useTenant();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customer = useCustomer(booking.leadCustomerId);
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const detailer = tenant.business?.industryTemplateKey === "car_detailing";
  const zone = booking.timezone || "Europe/London";
  const trainer = staff.data?.find((s) => s.id === booking.staffId);
  const location = locations.data?.find((l) => l.id === booking.locationId);
  const pill = todayPill(booking, now);
  const pillText = todayPillLabel(pill, { detailer });
  const past = new Date(end).getTime() <= now.getTime();
  const group = booking.serviceSnapshot.bookingMode === "group";
  const capacity = booking.serviceSnapshot.capacityMax;
  const clientName = customer.data ? customerDisplayName(customer.data) : "…";
  const others = Math.max(0, booking.attendees.length - 1);
  const who = group && others > 0 ? `${clientName} + ${others}` : clientName;
  const line = [
    who,
    soleStaff ? null : (trainer?.displayName ?? null),
    soleLocation ? null : (location?.name ?? null),
  ].filter(Boolean);
  const canMark = tenant.can(PERMISSIONS.BOOKING_MARK_ATTENDANCE);
  const label = [
    booking.allDay ? "All day" : `${hm(start, zone)} to ${hm(end, zone)}`,
    booking.serviceSnapshot.name,
    trainer && !soleStaff ? `${clientName} with ${trainer.displayName}` : clientName,
    pillText.toLowerCase(),
  ].join(", ");

  return (
    <li className={cn("flex items-center", past && pill !== "mark_attendance" && "opacity-60")}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(ROW, "min-w-0 flex-1 pr-2")}
      >
        <TimeColumn start={start} end={end} allDay={booking.allDay} zone={zone} variant={variant} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14.5px] font-bold">{booking.serviceSnapshot.name}</span>
            {group && variant === "desktop" ? (
              <span className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">
                {booking.seatCount >= capacity
                  ? `Full · ${booking.seatCount} of ${capacity}`
                  : `${booking.seatCount} of ${capacity}`}
              </span>
            ) : null}
            {booking.clientLift ? (
              <span
                title={
                  booking.clientLift.destination
                    ? `Drop client at ${booking.clientLift.destination}`
                    : "Lift needed"
                }
                className="inline-flex shrink-0"
              >
                <CarFront role="img" aria-label="Lift needed" className="size-3.5 text-primary" />
              </span>
            ) : null}
          </p>
          <p className="truncate text-[12.5px] text-muted-foreground md:text-[13px]">
            {variant === "phone" ? who : line.join(" · ")}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-3 border-t border-border py-[11px] pr-[18px] self-stretch">
        {pill === "mark_attendance" && canMark ? (
          <MarkAttendance
            booking={booking}
            label={pillText}
            detailer={detailer}
            clientName={clientName}
          />
        ) : (
          <span className={pillClass(pill)}>{pillText}</span>
        )}
        <Avatar name={trainer?.displayName ?? null} />
      </div>
    </li>
  );
}

function MarkAttendance({
  booking,
  label,
  detailer,
  clientName,
}: {
  booking: Booking;
  label: string;
  detailer: boolean;
  clientName: string;
}) {
  const businessId = useBusinessId();
  const outbox = useOutbox();
  const [busy, setBusy] = useState(false);
  const mark = async (attended: boolean) => {
    setBusy(true);
    try {
      const outcome = await outbox({
        label: attended
          ? detailer
            ? `Marked ${clientName}'s job done`
            : `Marked ${clientName} attended`
          : `Marked ${clientName} as a no-show`,
        path: `/api/v1/businesses/${businessId}/bookings/${booking.id}/attendance`,
        body: { attended },
        ifMatch: booking.version,
        invalidate: [
          ["biz", businessId, "bookings"],
          ["biz", businessId, "reports", "dashboard"],
        ],
        booking: {
          businessId,
          bookingId: booking.id,
          patch: attended
            ? { attendanceStatus: "attended", status: "completed" }
            : { attendanceStatus: "no_show", status: "no_show" },
        },
      });
      const done = attended
        ? detailer
          ? "Job marked done"
          : "Marked attended"
        : "No-show recorded";
      if (outcome.queued) toastQueued(done);
      else toast.success(done);
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(pillClass("mark_attendance" satisfies TodayPillKey), "cursor-pointer")}
        >
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void mark(true)}>
          {detailer ? "Completed" : "Attended"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void mark(false)}>No-show</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventRow({
  block,
  timeZone,
  past,
  variant,
  onClick,
}: {
  block: CalendarBlock;
  timeZone: string;
  past: boolean;
  variant: "desktop" | "phone";
  onClick: () => void;
}) {
  const staff = useStaffList();
  const soleStaff = useSoleStaff();
  const owner = staff.data?.find((s) => s.id === block.staffId);
  const allDay = isAllDayEvent(block.start, block.end, timeZone);
  return (
    <li className={cn(past && "opacity-60")}>
      <button type="button" onClick={onClick} className={ROW}>
        <TimeColumn
          start={block.start}
          end={block.end}
          allDay={allDay}
          zone={timeZone}
          variant={variant}
        />
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: block.colour }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold">{block.title}</p>
          <p className="truncate text-[12.5px] text-muted-foreground md:text-[13px]">
            Event{soleStaff ? "" : ` · ${owner?.displayName ?? "—"}`}
            {block.notes ? ` · ${block.notes}` : ""}
          </p>
        </div>
        <span className={pillClass("upcoming")}>Event</span>
        <Avatar name={owner?.displayName ?? null} />
      </button>
    </li>
  );
}
