import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  MoreHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SavedCopyNotice } from "@/components/SavedCopyNotice";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { AddToCalendarChooser } from "@/components/AddToCalendarChooser";
import { BookingPanel } from "@/components/BookingPanel";
import { PendingPackageRequestsBanner } from "@/components/PendingPackageRequestsBanner";
import { ListView } from "@/components/calendar/ListView";
import { MonthGrid, MONTH_BAR_FIELDS, type MonthBarField } from "@/components/calendar/MonthGrid";
import { MonthPicker } from "@/components/calendar/MonthPicker";
import { SegmentedControl } from "@/components/calendar/SegmentedControl";
import { TimeGrid, type BlockFields } from "@/components/calendar/TimeGrid";
import { WeekStrip } from "@/components/calendar/WeekStrip";
import {
  CALENDAR_VIEWS,
  isCancelled,
  LegendItem,
  recordTag,
  Swatch,
  type CalendarView,
  type HolidayItem,
} from "@/components/calendar/shared";
import {
  defaultEventColour,
  eventColourFor,
  publicHolidayRegionFrom,
} from "@/lib/calendar-settings";
import {
  periodInPast,
  periodWord,
  rangeSummary,
  rangeTitle,
  valueLine,
} from "@/lib/calendar-layout";
import { summariseBookings } from "@/lib/calendar-stats";
import { usePublicHolidays } from "@/lib/public-holidays";
import { useSoleStaff } from "@/lib/sole";
import { useIsPhone } from "@/hooks/use-media-query";
import { useSwipe } from "@/hooks/use-swipe";
import { EventModal } from "@/components/EventModal";
import { ServiceFilterMenuItems } from "@/components/ServiceFilterSelect";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useCustomersById,
  useLinkedRecordDefinition,
  useLinkedRecordsById,
  useLocationsList,
  useServices,
  useStaffList,
  useWaitlistSummary,
} from "@/lib/api/hooks";
import { addDays, formatMoney, isoDate, isoDateInTz, startOfWeek } from "@/lib/format";
import { bookingUrlFor } from "@/lib/hosts";
import { customerDisplayName, type Booking, type CalendarBlock } from "@/lib/api/types";
import { paymentColoursFrom, paymentDotStyle, type PaymentColours } from "@/lib/payment-colours";
import type { PaymentTone } from "@/lib/booking-payment";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import {
  matchesServiceFilter,
  normaliseCategory,
  serviceFilterExists,
} from "@/lib/service-categories";
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

/**
 * Blocks are a soft tint of payment status — the thing staff most need to read
 * off the calendar without opening the job: green when nothing is owed (paid, free,
 * credit), amber deposit or part paid, red nothing received. "Nothing to collect"
 * shares the settled green: to the person reading the calendar both mean "no money
 * to chase". Businesses can swap any of the three colours in Settings → Calendar.
 */
const PAYMENT_LEGEND: { tone: PaymentTone; label: string }[] = [
  { tone: "paid", label: "Paid" },
  { tone: "partial", label: "Deposit paid" },
  { tone: "unpaid", label: "Unpaid" },
];

/** Two taps on a month cell closer than this open the day rather than adding to it. */
const DOUBLE_TAP_MS = 280;

/**
 * The default month-bar fields only apply until the menu is first customised: a
 * stored choice is kept as-is, so someone who deliberately trimmed their bars is not
 * surprised by a new field appearing in them.
 */
const DEFAULT_MONTH_BAR_FIELDS = "time,record,category,service";
// A detailer plans their day around who needs running home, so the lift marker is on
// from the start for them; other trades never book one and get no extra clutter.
const DEFAULT_MONTH_BAR_FIELDS_AUTOMOTIVE = `${DEFAULT_MONTH_BAR_FIELDS},lift`;

function parseMonthBarFields(raw: string): Set<MonthBarField> {
  const set = new Set<MonthBarField>();
  for (const part of raw.split(",")) {
    if ((MONTH_BAR_FIELDS as readonly string[]).includes(part)) set.add(part as MonthBarField);
  }
  return set;
}

/** Six Monday-first weeks from the Monday on or before the 1st. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
];

function CalendarPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const paymentColours = useMemo<PaymentColours>(
    () => paymentColoursFrom(tenant.configuration),
    [tenant.configuration],
  );
  // View and filters come back the way they were last left, per business.
  const prefKey = (name: string) => `recavo.calendar.${name}.${tenant.businessId ?? "none"}`;
  const [view, setView] = useStoredState<CalendarView>(prefKey("view"), "week", CALENDAR_VIEWS);
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useStoredState<string>(prefKey("staff"), "all");
  // The "tap any session…" hint is for first visits; once dismissed it stays gone
  // on this device.
  const [introHidden, setIntroHidden] = useStoredState<"yes" | "no">(
    "recavo.calendar.intro.hidden",
    "no",
    ["yes", "no"],
  );
  const [serviceFilter, setServiceFilter] = useStoredState<string>(prefKey("service"), "all");
  const serviceFiltered = serviceFilter !== "all";
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const [monthBarRaw, setMonthBarRaw] = useStoredState<string>(
    prefKey("monthBar"),
    isCarDetailing ? DEFAULT_MONTH_BAR_FIELDS_AUTOMOTIVE : DEFAULT_MONTH_BAR_FIELDS,
  );
  const monthBar = useMemo(() => parseMonthBarFields(monthBarRaw), [monthBarRaw]);
  // Long bar labels slide so nothing is lost on a narrow cell; some people would
  // rather they sat still. Per device, like the other view preferences.
  const [marquee, setMarquee] = useStoredState<"on" | "off">(prefKey("marquee"), "on", [
    "on",
    "off",
  ]);
  const sliding = marquee === "on";
  // Cancelled jobs stay in the Bookings list for the record but are left off the
  // calendar unless asked for: the slot is free again and staff plan around what's live.
  const [showCancelled, setShowCancelled] = useStoredState<"yes" | "no">(
    prefKey("cancelled"),
    "no",
    ["yes", "no"],
  );
  // Which optional line the week blocks carry (spec §4.7). Day always shows both.
  const [blockFieldsRaw, setBlockFieldsRaw] = useStoredState<string>(
    prefKey("blockFields"),
    "client",
  );
  const blockFields: BlockFields = useMemo(
    () => ({
      client: blockFieldsRaw.split(",").includes("client"),
      trainer: blockFieldsRaw.split(",").includes("trainer"),
    }),
    [blockFieldsRaw],
  );
  const toggleBlockField = (field: keyof BlockFields) => {
    const next = { ...blockFields, [field]: !blockFields[field] };
    setBlockFieldsRaw((["client", "trainer"] as const).filter((f) => next[f]).join(","));
  };
  // Events: hand-picked colours are kept, the stock slate follows the business default.
  const eventColour = (colour: string) => eventColourFor(colour, tenant.configuration);
  const legendEventColour = defaultEventColour(tenant.configuration);
  const holidayRegion = publicHolidayRegionFrom(tenant.configuration);
  const publicHolidays = usePublicHolidays(holidayRegion);
  const toggleMonthBar = (field: MonthBarField) => {
    const next = new Set(monthBar);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    // Never let the bar go blank; the service name is the floor.
    if (next.size === 0) next.add("service");
    setMonthBarRaw(MONTH_BAR_FIELDS.filter((f) => next.has(f)).join(","));
  };
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>(undefined);
  // Started by tapping a day on the grid, so staff have already seen what's on it.
  const [addFromDay, setAddFromDay] = useState(false);
  // "Add to waitlist instead" from the booking form when the day has no availability.
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const waitlistSummary = useWaitlistSummary();
  const waiting = waitlistSummary.data?.waiting ?? 0;
  const [addTime, setAddTime] = useState<string | undefined>(undefined);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarBlock | null>(null);
  /** Open Add booking on a given day (defaults to the day in view, or today). */
  const openAdd = (iso?: string, fromDay = false) => {
    setAddDate(iso);
    setAddFromDay(fromDay);
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
  const soleStaff = useSoleStaff();
  const locations = useLocationsList();
  // A remembered filter can point at something since deleted; fall back to "all".
  useEffect(() => {
    if (services.data && !serviceFilterExists(serviceFilter, services.data)) {
      setServiceFilter("all");
    }
  }, [services.data, serviceFilter, setServiceFilter]);
  useEffect(() => {
    if (staff.data && staffFilter !== "all" && !staff.data.some((s) => s.id === staffFilter)) {
      setStaffFilter("all");
    }
  }, [staff.data, staffFilter, setStaffFilter]);

  const days = useMemo(() => {
    if (view === "day") {
      // `anchor` carries a time of day ("Today" sets it to `new Date()`), so the
      // day range must start at local midnight or earlier bookings fall outside it.
      const start = new Date(anchor);
      start.setHours(0, 0, 0, 0);
      return [start];
    }
    if (view === "month") return monthGrid(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  }, [view, anchor]);

  const rangeStart = days[0]!;
  const rangeEnd = addDays(days[days.length - 1]!, 1);

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
  const events = useMemo(() => blocks.data ?? [], [blocks.data]);

  const serviceById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s])),
    [services.data],
  );
  const filtered = useMemo(
    () =>
      (bookings.data?.bookings ?? []).filter(
        (b) =>
          (showCancelled === "yes" || !isCancelled(b)) &&
          matchesServiceFilter(serviceFilter, serviceById.get(b.serviceSnapshot.serviceId)),
      ),
    [bookings.data, showCancelled, serviceFilter, serviceById],
  );

  // One batched lookup for every vehicle (or other linked record) in view, so
  // chips can show the registration without opening the booking.
  const linkedRecords = useLinkedRecordsById(filtered.map((b) => b.linkedRecordId));
  const tagFor = (b: Booking) =>
    b.linkedRecordId ? recordTag(linkedRecords.get(b.linkedRecordId)) : null;
  // Client names sit on week, day and list rows; on the month grid only when the
  // bars are set to show them (it is one lookup per customer).
  const wantsClient = view !== "month" || monthBar.has("client");
  const customers = useCustomersById(
    wantsClient ? filtered.map((b) => b.leadCustomerId) : [],
    wantsClient,
  );
  const clientFor = (b: Booking) => {
    const c = b.leadCustomerId ? customers.get(b.leadCustomerId) : undefined;
    return c ? customerDisplayName(c) : null;
  };
  // "Registration" for a vehicle schema; otherwise whatever the record is called.
  const recordDefinition = useLinkedRecordDefinition();
  const recordFieldLabel = recordDefinition.data?.definition
    ? recordDefinition.data.definition.key === "vehicle"
      ? "Registration"
      : recordDefinition.data.definition.singularLabel
    : null;

  // The category comes from the live catalogue, not the snapshot: it is a grouping
  // label the business tidies over time, so the calendar should follow the tidy-up.
  const categoryFor = (b: Booking) =>
    normaliseCategory(serviceById.get(b.serviceSnapshot.serviceId)?.category);
  /** "Cleaning · Full valet" — or just the name when the service has no category. */
  const serviceLabel = (b: Booking) => {
    const category = categoryFor(b);
    return category ? `${category} · ${b.serviceSnapshot.name}` : b.serviceSnapshot.name;
  };

  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const todayIso = isoDate(new Date());

  // Opening hours bound the visible hour range (spec §2.4): the location in the top
  // bar, or every location when "all" is chosen, over the weekdays on screen.
  const opening = useMemo(() => {
    const list = (locations.data ?? []).filter(
      (l) => l.active && (tenant.currentLocationId === "all" || l.id === tenant.currentLocationId),
    );
    const weekdays = new Set(days.map((d) => d.getDay()));
    let open = Infinity;
    let close = -Infinity;
    for (const l of list) {
      for (const h of l.openingHours) {
        if (!weekdays.has(h.dayOfWeek)) continue;
        open = Math.min(open, h.openMinute);
        close = Math.max(close, h.closeMinute);
      }
    }
    return Number.isFinite(open) && Number.isFinite(close) && close > open
      ? { openMinute: open, closeMinute: close }
      : null;
  }, [locations.data, tenant.currentLocationId, days]);

  const shift = (dir: number) =>
    setAnchor((a) =>
      view === "month"
        ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
        : addDays(a, view === "day" ? dir : dir * 7),
    );
  const periodNoun = view === "month" ? "month" : view === "day" ? "day" : "week";

  const openDay = (day: Date) => {
    setAnchor(day);
    setView("day");
  };
  /**
   * Month cells: the whole box is the hit area. One tap starts a booking on that
   * day; a second tap within the window opens the day instead. Done by hand rather
   * than `dblclick` because mobile browsers are unreliable about firing it, and the
   * first tap has to wait anyway so a double doesn't also start a booking.
   */
  const pendingTap = useRef<{ iso: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => clearTimeout(pendingTap.current?.timer), []);
  const tapDay = (day: Date) => {
    const iso = isoDate(day);
    const pending = pendingTap.current;
    if (pending) {
      clearTimeout(pending.timer);
      pendingTap.current = null;
      if (pending.iso === iso) {
        openDay(day);
        return;
      }
    }
    pendingTap.current = {
      iso,
      timer: setTimeout(() => {
        pendingTap.current = null;
        openChooser(iso);
      }, DOUBLE_TAP_MS),
    };
  };

  const bookingLabel = tenant.terminology.booking || "Booking";
  const bookingNoun = bookingLabel.toLowerCase();

  // Totals cover the dates actually in view. The month grid pads out to six
  // weeks, so a job on the 31st of last month is drawn but not counted; a job is
  // counted on the day it starts so nothing is double-counted across a boundary.
  const statsBookings = useMemo(() => {
    const first = isoDate(
      view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : days[0]!,
    );
    const last = isoDate(
      view === "month"
        ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
        : days[days.length - 1]!,
    );
    return filtered.filter((b) => {
      const day = isoDateInTz(b.start, timezone);
      return first <= day && day <= last;
    });
  }, [filtered, view, anchor, days, timezone]);
  const stats = useMemo(() => summariseBookings(statsBookings), [statsBookings]);
  const currency = tenant.business?.currency ?? statsBookings[0]?.currency ?? "GBP";
  const money = (minor: number) => formatMoney(minor, currency, { compact: true });

  const holidayItems = useMemo<HolidayItem[]>(() => {
    const from = isoDate(rangeStart);
    const to = isoDate(rangeEnd);
    return publicHolidays.holidays
      .filter((h) => from <= h.date && h.date < to)
      .map((h) => ({
        ...h,
        id: `holiday-${h.date}`,
        start: `${h.date}T00:00:00.000Z`,
        end: `${h.date}T23:59:00.000Z`,
        occupiedDays: [h.date],
      }));
  }, [publicHolidays.holidays, rangeStart, rangeEnd]);

  // Days with anything on them, for the dots on the phone week strip. Day view
  // only loads one day, so the strip borrows a week-wide query of its own.
  const stripMonday = startOfWeek(anchor);
  const stripBookings = useBookings({
    from: stripMonday.toISOString(),
    to: addDays(stripMonday, 7).toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
    limit: 200,
    enabled: phone && view === "day",
  });
  const busyDays = useMemo(() => {
    const set = new Set<string>();
    const source =
      view === "day"
        ? (stripBookings.data?.bookings ?? []).filter((b) => !isCancelled(b))
        : filtered;
    for (const b of source) set.add(isoDateInTz(b.start, timezone));
    for (const e of events) set.add(isoDateInTz(e.start, timezone));
    return set;
  }, [view, stripBookings.data, filtered, events, timezone]);

  // The month grid pads out to six weeks, so its title comes from the anchor, not
  // the first cell (which is usually in the month before).
  const title =
    view === "month"
      ? rangeTitle("month", anchor, anchor)
      : rangeTitle(view, days[0]!, days[days.length - 1]!);
  const shortTitle =
    view === "month"
      ? title
      : view === "day"
        ? anchor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
        : title;
  const loaded = !bookings.isLoading && !bookings.isError;
  const summary = loaded ? rangeSummary(stats.active, stats.bookedMinor, bookingNoun, money) : null;

  const shareBookingPage = async () => {
    const slug = tenant.business?.slug;
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(bookingUrlFor(slug));
      toast.success("Booking page link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  // A past period cannot be filled any more, so the "nothing booked" prompt
  // (add / share) would only be noise there: the grid or list shows nothing.
  const periodPast = periodInPast(view, anchor, days[days.length - 1]!, new Date());
  const emptyTitle = periodPast
    ? null
    : `Nothing booked ${view === "day" ? "today" : view === "month" ? "this month" : "this week"}`;
  const emptyActions = (
    <>
      <Button size="sm" onClick={() => openAdd(view === "day" ? isoDate(anchor) : undefined)}>
        Add {bookingNoun}
      </Button>
      {tenant.business?.slug ? (
        <Button size="sm" variant="outline" onClick={shareBookingPage}>
          Share booking page
        </Button>
      ) : null}
    </>
  );

  const staffNoun = tenant.terminology.staff || "Trainer";
  const staffFilterLabel =
    staffFilter === "all"
      ? `All ${staffNoun.toLowerCase()}s`
      : (staff.data?.find((s) => s.id === staffFilter)?.displayName ?? staffNoun);

  // A sideways swipe on any view turns the page (day, week or month). On the phone
  // Week grid, which pans through its seven columns, it only fires at either end.
  const swipe = useSwipe((dir) => shift(dir));

  const waitlistButton = (
    <Button
      asChild
      variant="outline"
      size="icon"
      className={cn("relative shrink-0", phone ? "size-10 rounded-xl" : "size-[38px]")}
    >
      <Link
        to="/waitlist"
        search={{ from: isoDate(rangeStart), to: isoDate(addDays(rangeEnd, -1)) }}
        aria-label={waiting > 0 ? `Waitlist, ${waiting} waiting` : "Waitlist"}
      >
        <Hourglass className="size-4" />
        {waiting > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cal-deposit px-1 text-[10.5px] font-extrabold text-white ring-2 ring-card tabular-nums">
            {waiting}
          </span>
        ) : null}
      </Link>
    </Button>
  );

  const optionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative shrink-0", phone ? "size-10 rounded-xl" : "size-[38px]")}
          aria-label={serviceFiltered ? "Calendar options (service filter on)" : "Calendar options"}
        >
          <MoreHorizontal className="size-4" />
          {/* A dot on the button when a service filter is applied, so it is
              obvious the calendar is showing a subset even with the menu shut. */}
          {serviceFiltered ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2.5 rounded-full bg-primary ring-2 ring-card"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Show {(tenant.terminology.service || "service").toLowerCase()}s</span>
          {serviceFiltered ? (
            <span className="text-xs font-normal text-primary">Filtered</span>
          ) : null}
        </DropdownMenuLabel>
        <ServiceFilterMenuItems
          services={services.data ?? []}
          value={serviceFilter}
          onValueChange={setServiceFilter}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Show on week blocks</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={blockFields.client}
          onCheckedChange={() => toggleBlockField("client")}
          onSelect={(e) => e.preventDefault()}
        >
          Client name
        </DropdownMenuCheckboxItem>
        {soleStaff ? null : (
          <DropdownMenuCheckboxItem
            checked={blockFields.trainer}
            onCheckedChange={() => toggleBlockField("trainer")}
            onSelect={(e) => e.preventDefault()}
          >
            {staffNoun}
          </DropdownMenuCheckboxItem>
        )}
        {view === "month" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Under the time on month chips</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={monthBar.has("client")}
              onCheckedChange={() => toggleMonthBar("client")}
              onSelect={(e) => e.preventDefault()}
            >
              Client name
            </DropdownMenuCheckboxItem>
            {recordFieldLabel ? (
              <DropdownMenuCheckboxItem
                checked={monthBar.has("record")}
                onCheckedChange={() => toggleMonthBar("record")}
                onSelect={(e) => e.preventDefault()}
              >
                {recordFieldLabel}
              </DropdownMenuCheckboxItem>
            ) : null}
            <DropdownMenuCheckboxItem
              checked={monthBar.has("category")}
              onCheckedChange={() => toggleMonthBar("category")}
              onSelect={(e) => e.preventDefault()}
            >
              Category
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={monthBar.has("service")}
              onCheckedChange={() => toggleMonthBar("service")}
              onSelect={(e) => e.preventDefault()}
            >
              {tenant.terminology.service || "Service"}
            </DropdownMenuCheckboxItem>
            {isCarDetailing ? (
              <DropdownMenuCheckboxItem
                checked={monthBar.has("lift")}
                onCheckedChange={() => toggleMonthBar("lift")}
                onSelect={(e) => e.preventDefault()}
              >
                Lift needed
              </DropdownMenuCheckboxItem>
            ) : null}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showCancelled === "yes"}
          onCheckedChange={(on) => setShowCancelled(on ? "yes" : "no")}
          onSelect={(e) => e.preventDefault()}
        >
          Show cancelled
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sliding}
          onCheckedChange={(on) => setMarquee(on ? "on" : "off")}
          onSelect={(e) => e.preventDefault()}
        >
          Scroll long labels
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings/$page" params={{ page: "calendar" }}>
            Colours and bank holidays
            <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const staffSelect = soleStaff ? null : (
    <Select value={staffFilter} onValueChange={setStaffFilter}>
      <SelectTrigger
        className={cn("shrink-0", phone ? "h-10 w-auto gap-2 rounded-xl" : "h-[38px] w-[170px]")}
        aria-label={`Filter by ${staffNoun.toLowerCase()}`}
      >
        {phone ? (
          <>
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-secondary text-[9px] font-bold"
            >
              {staffFilter === "all"
                ? "All"
                : staffFilterLabel
                    .split(/\s+/)
                    .map((p) => p.charAt(0))
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
            </span>
            <span className="text-sm font-semibold">{staffNoun}s</span>
          </>
        ) : (
          <SelectValue placeholder={staffNoun} />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {staffNoun.toLowerCase()}s</SelectItem>
        {(staff.data ?? []).map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const introTip =
    introHidden === "yes" ? null : (
      <div className="flex items-start justify-between gap-3 rounded-xl bg-secondary/70 px-3.5 py-2.5 text-sm">
        <p className="text-muted-foreground">
          Tap a {bookingNoun} to open it, or an empty slot to add one.
          {phone ? "" : " Use the top bar to filter by location."}
        </p>
        <button
          type="button"
          onClick={() => setIntroHidden("yes")}
          className="-m-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Dismiss tip"
        >
          <X className="size-4" />
        </button>
      </div>
    );

  const gridProps = {
    timezone,
    todayIso,
    bookings: filtered,
    events,
    holidays: holidayItems,
    staff: staff.data ?? [],
    soleStaff: Boolean(soleStaff),
    paymentColours,
    eventColour,
    clientFor,
    tagFor,
    categoryFor,
    serviceLabel,
    sliding,
    loading: bookings.isLoading,
    onOpenBooking: (id: string) => setSelectedBookingId(id),
    onOpenEvent: openEvent,
  };

  const grid =
    view === "month" ? (
      <div {...swipe}>
        <MonthGrid
          {...gridProps}
          days={days}
          anchor={anchor}
          monthBar={monthBar}
          phone={phone}
          onTapDay={tapDay}
          onOpenDay={openDay}
        />
      </div>
    ) : view === "list" ? (
      <div {...swipe}>
        <ListView
          {...gridProps}
          days={days}
          bookingNoun={bookingNoun}
          emptyTitle={emptyTitle}
          emptyActions={emptyActions}
          onNext={() => shift(1)}
        />
      </div>
    ) : phone && view === "day" ? (
      <div {...swipe}>
        <TimeGrid
          {...gridProps}
          variant="phoneDay"
          days={days}
          opening={opening}
          fields={blockFields}
          emptyTitle={emptyTitle}
          emptyActions={emptyActions}
          onEmptySlot={openChooser}
          onOpenDay={openDay}
        />
      </div>
    ) : (
      <div
        {...swipe}
        className={cn("surface-card overflow-hidden", phone ? "rounded-2xl" : "rounded-[18px]")}
      >
        <TimeGrid
          {...gridProps}
          variant={phone ? "phoneWeek" : "desktop"}
          days={days}
          opening={opening}
          fields={blockFields}
          bottomReserve={phone ? 64 : 76}
          emptyTitle={emptyTitle}
          emptyActions={emptyActions}
          onEmptySlot={openChooser}
          onOpenDay={openDay}
        />
      </div>
    );

  const legend =
    view === "list" ? null : (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground",
          phone ? "justify-center px-2 text-[11.5px]" : "justify-between",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {PAYMENT_LEGEND.map(({ tone, label }) => {
            const dot = paymentDotStyle(tone, paymentColours);
            return (
              <LegendItem
                key={tone}
                swatch={<Swatch className={dot.className} style={dot.style} />}
              >
                {label}
              </LegendItem>
            );
          })}
          <LegendItem swatch={<Swatch style={{ backgroundColor: legendEventColour }} />}>
            Event
          </LegendItem>
          {holidayRegion ? (
            <LegendItem
              swatch={<Swatch className="border border-dashed border-muted-foreground/60" />}
            >
              Bank holiday
              {publicHolidays.isError ? (
                <span className="text-warning-foreground"> (couldn't load from gov.uk)</span>
              ) : null}
            </LegendItem>
          ) : null}
        </div>
        {phone ? null : (
          <Link
            to="/settings/$page"
            params={{ page: "calendar" }}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Colours and bank holidays
          </Link>
        )}
      </div>
    );

  return (
    <>
      {phone ? (
        <>
          {/* Spec §3.2: the month is the title on a phone; value line under it. */}
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <MonthPicker anchor={anchor} onPick={setAnchor} />
              <p className="mt-0.5 text-[13.5px]">
                {loaded ? (
                  <>
                    <span className="font-extrabold">{money(stats.bookedMinor)}</span>{" "}
                    <span className="text-muted-foreground">
                      {valueLine(
                        view,
                        stats.active,
                        bookingNoun,
                        periodWord(view, anchor, days[0]!, days[days.length - 1]!, new Date()),
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{shortTitle}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {waitlistSummary.isSuccess ? waitlistButton : null}
              {optionsMenu}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={view}
              onValueChange={setView}
              options={VIEW_OPTIONS}
              label="Calendar view"
              fill
              className="h-10 min-w-0 flex-1"
            />
            {staffSelect}
          </div>
          <PendingPackageRequestsBanner variant="strip" />
          {introTip}
          {view === "day" || view === "list" ? (
            <WeekStrip
              selected={view === "day" ? anchor : days[0]!}
              todayIso={todayIso}
              busyDays={busyDays}
              onSelect={(day) => {
                setAnchor(day);
                if (view === "list") setView("day");
              }}
              onShiftWeek={(dir) => setAnchor((a) => addDays(a, dir * 7))}
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-xl"
                  onClick={() => shift(-1)}
                  aria-label={`Previous ${periodNoun}`}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-xl"
                  onClick={() => shift(1)}
                  aria-label={`Next ${periodNoun}`}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <p className="min-w-0 flex-1 truncate text-center text-sm font-bold">{title}</p>
              <Button
                variant="ghost"
                className="h-9 rounded-xl px-3"
                onClick={() => setAnchor(new Date())}
              >
                Today
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <PageHeader
            title="Calendar"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => openAddEvent(view === "day" ? isoDate(anchor) : undefined)}
                >
                  <Clock className="size-4" /> Add event
                </Button>
                <Button onClick={() => openAdd(view === "day" ? isoDate(anchor) : undefined)}>
                  <CalendarPlus className="size-4" /> Add {bookingNoun}
                </Button>
              </div>
            }
          />

          <PendingPackageRequestsBanner variant="strip" />
          {introTip}

          {/* Spec §2.3 toolbar: nav, title and summary on the left; filters, the
              view switcher and options on the right. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-[38px]"
                  onClick={() => shift(-1)}
                  aria-label={`Previous ${periodNoun}`}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-[38px]"
                  onClick={() => shift(1)}
                  aria-label={`Next ${periodNoun}`}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <Button variant="outline" className="h-[38px]" onClick={() => setAnchor(new Date())}>
                Today
              </Button>
            </div>
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-[17px] font-extrabold">{title}</span>
              {summary ? (
                <span
                  className="text-[13px] text-muted-foreground"
                  aria-label={`${summary.replace(" expected", " expected in this range")}`}
                >
                  · {summary}
                </span>
              ) : null}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              {staffSelect}
              {waitlistSummary.isSuccess ? waitlistButton : null}
              <SegmentedControl
                value={view}
                onValueChange={setView}
                options={VIEW_OPTIONS}
                label="Calendar view"
              />
              {optionsMenu}
            </div>
          </div>
        </>
      )}

      {bookings.data?.nextCursor ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          This range has more {bookingNoun}s than we can show at once. Narrow it with the filters,
          or switch to week or day view, to see them all.
        </p>
      ) : null}

      {blocks.isError ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Couldn't load events for this range; {bookingNoun}s are still shown.
        </p>
      ) : null}

      <SavedCopyNotice updatedAt={bookings.dataUpdatedAt} what="The calendar" />

      {bookings.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="text-destructive">Couldn't load your calendar.</span>
          <Button size="sm" variant="outline" onClick={() => void bookings.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        grid
      )}

      {legend}

      <AddToCalendarChooser
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        date={addDate}
        time={addTime}
        onBooking={() => {
          setChooserOpen(false);
          openAdd(addDate, true);
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
        assumeDropIn={addFromDay}
        onNoAvailability={(picked) => {
          setAddOpen(false);
          setWaitlistDefaults({ ...picked, from: picked.date });
        }}
      />
      <AddWaitlistDialog
        open={waitlistDefaults !== null}
        onOpenChange={(open) => {
          if (!open) setWaitlistDefaults(null);
        }}
        defaults={waitlistDefaults ?? undefined}
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
