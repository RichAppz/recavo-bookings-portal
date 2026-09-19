import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarPlus,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Landmark,
  MoreHorizontal,
  Palette,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { CalendarColoursDialog, PublicHolidaysSelect } from "@/components/CalendarColoursSetting";
import { AddToCalendarChooser } from "@/components/AddToCalendarChooser";
import { BookingPanel } from "@/components/BookingPanel";
import {
  defaultEventColour,
  eventColourFor,
  publicHolidayRegionFrom,
} from "@/lib/calendar-settings";
import { summariseBookings } from "@/lib/calendar-stats";
import { usePublicHolidays, type PublicHoliday } from "@/lib/public-holidays";
import { useSoleStaff } from "@/lib/sole";
import { EventModal } from "@/components/EventModal";
import { Marquee } from "@/components/Marquee";
import { ServiceFilterMenuItems } from "@/components/ServiceFilterSelect";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
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
  useCustomersById,
  useLinkedRecordDefinition,
  useLinkedRecordsById,
  useServices,
  useStaffList,
  useWaitlistSummary,
} from "@/lib/api/hooks";
import {
  addDays,
  formatInTz,
  formatMoney,
  isAllDayEvent,
  isoDate,
  startOfWeek,
  ukDateLong,
} from "@/lib/format";
import { contiguousRuns, occupiedDaysOf, segmentOn } from "@/lib/working-days";
import {
  customerDisplayName,
  type Booking,
  type CalendarBlock,
  type LinkedRecord,
} from "@/lib/api/types";
import {
  bookingSettlement,
  paymentLabel,
  paymentTone,
  type PaymentTone,
} from "@/lib/booking-payment";
import {
  paymentBarStyle,
  paymentColoursFrom,
  paymentDotStyle,
  type PaymentColours,
} from "@/lib/payment-colours";
import { PERMISSIONS } from "@/lib/permissions";
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

const START_HOUR = 6;
const END_HOUR = 21;
const HOUR_HEIGHT = 60;

/**
 * A booking bar is one solid block of payment status — the thing staff most
 * need to read off the calendar without opening the job: green when nothing is
 * owed (paid, free, credit, cancelled), amber deposit or part paid, red nothing
 * received. Service identity is left to the text.
 */
// "Nothing to collect" (free, credit, cancelled) shares the settled green: to
// the person reading the calendar both mean "no money to chase", and teal next
// to green was too close to tell apart. Businesses can swap any of the three
// colours in Settings → Configuration; `paymentBarStyle` applies the override.
const PAYMENT_LEGEND: { tone: PaymentTone; label: string }[] = [
  { tone: "paid", label: "Paid / nothing to collect" },
  { tone: "partial", label: "Deposit / part paid" },
  { tone: "unpaid", label: "Unpaid" },
];

/**
 * The client needs running somewhere once the car is in. A glyph rather than a word:
 * chips are narrow and the panel spells out where to.
 */
function LiftTag() {
  return (
    <CarFront
      role="img"
      aria-label="Lift needed"
      className="size-3 shrink-0 text-current"
      strokeWidth={2.5}
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

/** Tone, classes/inline colour and a spoken label for one booking's chip. */
function chipPayment(b: Booking, colours: PaymentColours) {
  const settlement = bookingSettlement(b);
  const tone = paymentTone(settlement, b.status);
  return {
    tone,
    ...paymentBarStyle(tone, colours),
    label: paymentLabel(settlement, b.currency, formatMoney),
  };
}

/** Anything with a `[start, end)` window that can be laid onto the grid. */
/**
 * Anything drawn on the grid. Bookings carry the API's `segments` / `occupiedDays`
 * (a multi-day job on its working days only); events and older bookings have just
 * start → end and are read as one continuous span.
 */
type Spanning = {
  start: string;
  end: string;
  segments?: { start: string; end: string }[] | undefined;
  occupiedDays?: string[] | undefined;
};

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

/**
 * A bank holiday is a note about the day, not something on the diary: a quiet
 * dashed outline in the muted text colour, never a tint that competes with jobs.
 */
const HOLIDAY_CHIP =
  "pointer-events-none flex min-w-0 items-center gap-1 overflow-hidden rounded border border-dashed border-muted-foreground/50 bg-background/60 px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground";

/** Snap a click's Y offset on a day column to the nearest quarter hour, as HH:MM. */
function timeAtOffset(offsetY: number): string {
  const minutes = START_HOUR * 60 + Math.floor((offsetY / HOUR_HEIGHT) * 4) * 15;
  const clamped = Math.min(Math.max(minutes, START_HOUR * 60), END_HOUR * 60 - 15);
  return `${`${Math.floor(clamped / 60)}`.padStart(2, "0")}:${`${clamped % 60}`.padStart(2, "0")}`;
}

/** Two taps on a month cell closer than this open the day rather than adding to it. */
const DOUBLE_TAP_MS = 280;
/** Bars shown per day in the month grid before it collapses to "+N more". */
const MONTH_LANES = 3;
/**
 * What a month bar says, left to right. The business picks which of these to show;
 * the order is fixed so bars stay scannable. `time` is the start time, or "All day";
 * `category` is the service's category ("Cleaning · Full valet"), so two services
 * with the same name in different groups do not read as the same job.
 *
 * The default only applies until the menu is first customised: a stored choice
 * is kept as-is, so someone who deliberately trimmed their bars is not surprised
 * by a new field appearing in them.
 */
const MONTH_BAR_FIELDS = ["time", "client", "record", "category", "service", "lift"] as const;
type MonthBarField = (typeof MONTH_BAR_FIELDS)[number];
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

/** Height of one bar row in the month grid, px (matches the chip's text + padding). */
const MONTH_LANE_HEIGHT = 20;

/** Six Monday-first weeks from the Monday on or before the 1st. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function CalendarPage() {
  const tenant = useTenant();
  const paymentColours = useMemo(
    () => paymentColoursFrom(tenant.configuration),
    [tenant.configuration],
  );
  // View and filters come back the way they were last left, per business.
  const prefKey = (name: string) => `recavo.calendar.${name}.${tenant.businessId ?? "none"}`;
  const [view, setView] = useStoredState<"day" | "week" | "month">(prefKey("view"), "week", [
    "day",
    "week",
    "month",
  ]);
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useStoredState<string>(prefKey("staff"), "all");
  // The "click any job…" hint is for first visits; once dismissed it stays gone
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
  // "Add to waitlist instead" from the booking form when the day has no availability.
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const [coloursOpen, setColoursOpen] = useState(false);
  const waitlistSummary = useWaitlistSummary();
  const waiting = waitlistSummary.data?.waiting ?? 0;
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
  const soleStaff = useSoleStaff();
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

  const serviceById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s])),
    [services.data],
  );
  // Cancelled jobs stay in the Bookings list for the record but are left off
  // the calendar: the slot is free again and staff plan around what's live.
  const filtered = (bookings.data?.bookings ?? []).filter(
    (b) =>
      !isCancelled(b) &&
      matchesServiceFilter(serviceFilter, serviceById.get(b.serviceSnapshot.serviceId)),
  );

  // One batched lookup for every vehicle (or other linked record) in view, so
  // chips can show the registration without opening the booking.
  const linkedRecords = useLinkedRecordsById(filtered.map((b) => b.linkedRecordId));
  const tagFor = (b: Booking) =>
    b.linkedRecordId ? recordTag(linkedRecords.get(b.linkedRecordId)) : null;
  // Client names only when the month bars are set to show them: it is one lookup
  // per customer, so not worth paying for otherwise.
  const wantsClient = view === "month" && monthBar.has("client");
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
  // Seven columns need room to be legible, so the week grid scrolls sideways on
  // phones; a single day fits the screen and shouldn't.
  const gridMinWidth = view === "week" ? "min-w-[720px]" : "";
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayIso = isoDate(new Date());

  const shift = (dir: number) =>
    setAnchor((a) =>
      view === "month"
        ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
        : addDays(a, view === "day" ? dir : dir * 7),
    );

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
   * Which calendar days an item is drawn on. A multi-day job (a three-day ceramic
   * coating) shows on the working days the API laid it over — Thu, Fri, Mon — and
   * not on the weekend it skips; events and older bookings cover every day from
   * start to end. An end exactly on midnight belongs to the previous day.
   */
  const daysOf = (b: Spanning) => occupiedDaysOf(b, timezone);
  const coversDay = (b: Spanning, iso: string) => daysOf(b).includes(iso);
  const firstDay = (b: Spanning) => daysOf(b)[0]!;
  const lastDay = (b: Spanning) => {
    const days = daysOf(b);
    return days[days.length - 1]!;
  };
  const isMultiDay = (b: Spanning) => daysOf(b).length > 1;
  const endLabel = (b: Spanning) =>
    formatInTz(b.end, timezone, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const timeLabel = (iso: string) =>
    formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  // An all-day event holds the day, not a time on it: no "00:00" prefix, and in
  // week/day view it sits in the all-day row rather than as a block at midnight.
  const isAllDay = (ev: CalendarBlock) => isAllDayEvent(ev.start, ev.end, timezone);

  /**
   * Clip an item to today's column. A multi-day job draws the segment it holds on
   * this day (Friday 08:00–17:00 of a Thu–Mon job); an item with no segment on the
   * day — one that began yesterday and runs on — fills the column top to bottom.
   * `startsToday` / `endsToday` say whether this is the job's first / last day, which
   * drives the "↳" and "Until …" cues.
   */
  const columnBox = (b: Spanning, iso: string) => {
    const startsToday = firstDay(b) === iso;
    const endsToday = lastDay(b) === iso;
    const segment = segmentOn(b, iso, timezone) ?? { start: b.start, end: b.end };
    const segStartsToday = isoDateInTz(segment.start, timezone) === iso;
    const segEndsToday =
      isoDateInTz(new Date(new Date(segment.end).getTime() - 60_000).toISOString(), timezone) ===
      iso;
    const topMin = segStartsToday ? minutesOf(segment.start, timezone) : START_HOUR * 60;
    const bottomMin = segEndsToday
      ? Math.min(minutesOf(segment.end, timezone) || END_HOUR * 60, END_HOUR * 60)
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

  // Totals cover the dates actually in view. The month grid pads out to six
  // weeks, so a job on the 31st of last month is drawn but not counted; a job is
  // counted on the day it starts so nothing is double-counted across a boundary.
  const statsBookings = useMemo(() => {
    const first = isoDate(
      view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : days[0],
    );
    const last = isoDate(
      view === "month"
        ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
        : days[days.length - 1],
    );
    return filtered.filter((b) => {
      const day = isoDateInTz(b.start, timezone);
      return first <= day && day <= last;
    });
  }, [filtered, view, anchor, days, timezone]);
  const bookedMinor = useMemo(() => summariseBookings(statsBookings).bookedMinor, [statsBookings]);
  const currency = tenant.business?.currency ?? statsBookings[0]?.currency ?? "GBP";

  /** A bank holiday shaped like anything else on the grid: it holds one local day. */
  type HolidayItem = PublicHoliday & {
    id: string;
    start: string;
    end: string;
    occupiedDays: string[];
  };
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

  type MonthEntry =
    | { kind: "booking"; item: Booking }
    | { kind: "event"; item: CalendarBlock }
    | { kind: "holiday"; item: HolidayItem };
  type PlacedItem = {
    entry: MonthEntry;
    /** First and last column (0–6) the item occupies within this week. */
    startCol: number;
    endCol: number;
    lane: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
  };
  const weeks = useMemo(
    () =>
      view === "month" ? Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)) : [],
    [view, days],
  );
  /**
   * Lay one week's bookings and events into lanes. Longer spans go first and each
   * item takes the topmost lane that's free across every column it covers, so a
   * two-day job is one uninterrupted bar and the day items pack in around it. A job
   * that skips days (Thu–Fri, then Mon) becomes one bar per run of days it holds,
   * each carrying a "continues" cue towards the rest of the job — the same cue a bar
   * shows when the job carries on past the edge of the week.
   */
  const placeItems = (isos: string[], entries: MonthEntry[]): PlacedItem[] => {
    const spans = entries.flatMap((entry) => {
      const cols = isos
        .map((iso, i) => (coversDay(entry.item, iso) ? i : -1))
        .filter((i) => i >= 0);
      if (cols.length === 0) return [];
      const first = firstDay(entry.item);
      const last = lastDay(entry.item);
      return contiguousRuns(cols).map((run) => ({
        entry,
        startCol: run.startCol,
        endCol: run.endCol,
        continuesBefore: first < isos[run.startCol]!,
        continuesAfter: last > isos[run.endCol]!,
      }));
    });
    // A holiday is about the day itself, so it sits above whatever is booked on it.
    const rank = (e: MonthEntry) => (e.kind === "holiday" ? 0 : 1);
    spans.sort(
      (a, b) =>
        a.startCol - b.startCol ||
        rank(a.entry) - rank(b.entry) ||
        b.endCol - b.startCol - (a.endCol - a.startCol) ||
        a.entry.item.start.localeCompare(b.entry.item.start),
    );
    // laneFree[lane] = first column still free in that lane.
    const laneFree: number[] = [];
    return spans.map((span) => {
      let lane = laneFree.findIndex((free) => free <= span.startCol);
      if (lane === -1) lane = laneFree.length;
      laneFree[lane] = span.endCol + 1;
      return { ...span, lane };
    });
  };
  const placeMonthItems = (weekIsos: string[]) =>
    placeItems(weekIsos, [
      ...holidayItems.map((item) => ({ kind: "holiday" as const, item })),
      ...filtered.map((item) => ({ kind: "booking" as const, item })),
      ...events.map((item) => ({ kind: "event" as const, item })),
    ]);
  // Week/day view: the all-day row lays multi-day jobs as one bar across the
  // columns they cover, the same way the month grid does.
  const allDayIsos = view === "month" ? [] : days.map(isoDate);
  const allDayPlaced =
    view === "month"
      ? []
      : placeItems(allDayIsos, [
          ...holidayItems.map((item) => ({ kind: "holiday" as const, item })),
          ...filtered.filter((b) => b.allDay).map((item) => ({ kind: "booking" as const, item })),
          ...events.filter(isAllDay).map((item) => ({ kind: "event" as const, item })),
        ]);
  const allDayLanes = allDayPlaced.reduce((max, p) => Math.max(max, p.lane + 1), 0);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={
          introHidden === "yes"
            ? undefined
            : `Click any ${bookingLabel.toLowerCase()} or event to open it; click an empty slot to add one. Use the top bar to filter by location.`
        }
        onDismissDescription={() => setIntroHidden("yes")}
        actions={
          // Sized down on a phone so both fit beside the title on one row.
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
              onClick={() => openAddEvent(view === "day" ? isoDate(anchor) : undefined)}
            >
              <Clock className="size-4" /> Add event
            </Button>
            <Button
              className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
              onClick={() => openAdd(view === "day" ? isoDate(anchor) : undefined)}
            >
              <CalendarPlus className="size-4" /> Add {bookingLabel.toLowerCase()}
            </Button>
          </div>
        }
      />

      <div className="surface-card flex flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" className="px-3" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
        </div>
        {/* Today has 12px of internal padding, so the visual gap Today → label is
            gap-3 + px-3 = 24px; match it label → total with gap-6. On a phone the
            label takes what is left of the nav row and the total waits for `sm`,
            so the toolbar is two rows, not three. */}
        <p className="flex min-w-0 flex-1 items-baseline gap-6 text-sm font-semibold sm:flex-none">
          <span className="truncate">{range}</span>
          {!bookings.isLoading && bookedMinor > 0 ? (
            <span
              className="hidden font-medium text-muted-foreground tabular-nums sm:inline"
              aria-label={`${formatMoney(bookedMinor, currency)} booked in this range`}
            >
              {formatMoney(bookedMinor, currency)}
            </span>
          ) : null}
        </p>
        {/* A one-person business has nothing to filter by; the control is noise.
            On a phone it takes a row of its own below the tabs; on wider screens
            it sits between the range label and the tabs. */}
        {soleStaff ? null : (
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="order-last w-full sm:order-none sm:ml-auto sm:w-[160px]">
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
        )}
        {/* Tabs on the left, the ⋯ options menu on the right of the same row, so the
            toolbar is two rows on a phone instead of four. The service filter and
            the month-bar text choices both live behind the ⋯. */}
        <div
          className={cn(
            "flex w-full items-center justify-between gap-2 sm:w-auto",
            soleStaff && "sm:ml-auto",
          )}
        >
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Who's waiting for a slot in the range on screen; the list opens filtered
              to it so a gap in the diary can be filled from here. */}
          {waitlistSummary.isSuccess ? (
            <Link
              to="/waitlist"
              search={{ from: isoDate(rangeStart), to: isoDate(addDays(rangeEnd, -1)) }}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors hover:bg-secondary",
                waiting > 0 ? "text-foreground" : "text-muted-foreground",
              )}
              aria-label={`Waitlist: ${waiting} waiting`}
            >
              <Hourglass className="size-3.5" />
              <span className="hidden sm:inline">Waitlist</span>
              {waiting > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                  {waiting}
                </span>
              ) : null}
            </Link>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative shrink-0"
                aria-label={
                  serviceFiltered ? "Calendar options (service filter on)" : "Calendar options"
                }
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
              {view === "month" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Show on month bars</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={monthBar.has("time")}
                    onCheckedChange={() => toggleMonthBar("time")}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Time / All day
                  </DropdownMenuCheckboxItem>
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
            </DropdownMenuContent>
          </DropdownMenu>
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

          {/* One row per week. Items are laid out per row so a job that runs over
              several days is a single bar across them, not a chip in each cell that
              reads as separate jobs. */}
          {weeks.map((week, weekIdx) => {
            const weekIsos = week.map(isoDate);
            const placed = placeMonthItems(weekIsos);
            const hiddenOn = (iso: string) =>
              placed.filter((p) => p.lane >= MONTH_LANES && coversDay(p.entry.item, iso)).length;
            return (
              <div key={weekIsos[0]} className="relative grid grid-cols-7">
                {week.map((day) => {
                  const iso = isoDate(day);
                  const outside = day.getMonth() !== anchor.getMonth();
                  const hidden = hiddenOn(iso);
                  return (
                    <div
                      key={iso}
                      className={cn(
                        // The card draws its own edge, so the grid drops the borders
                        // that would otherwise double up along the right and bottom.
                        "group relative min-h-[96px] border-r border-b p-1 [&:nth-child(7n)]:border-r-0 sm:min-h-[116px] sm:p-1.5",
                        weekIdx === weeks.length - 1 && "border-b-0",
                        outside && "bg-muted/30",
                      )}
                    >
                      {/* Sits behind the bars so the whole empty box is the hit area
                          for adding to this day (double tap opens the day), while a
                          bar still opens its own booking. Nesting the two as real
                          buttons would be invalid markup. */}
                      <button
                        type="button"
                        onClick={() => tapDay(day)}
                        className="absolute inset-0 cursor-pointer transition-colors hover:bg-secondary/50"
                        aria-label={`Add to ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}. Double tap to open the day.`}
                      />

                      {/* The date itself is the one-tap way into the day, for anyone
                          who doesn't know about the double tap (and for keyboards). */}
                      <button
                        type="button"
                        onClick={() => openDay(day)}
                        className={cn(
                          "relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-xs tabular-nums hover:ring-2 hover:ring-primary/40",
                          outside ? "text-muted-foreground/60" : "text-foreground",
                          iso === todayIso && "bg-primary font-semibold text-primary-foreground",
                        )}
                        aria-label={`Open ${day.toLocaleDateString("en-GB", { dateStyle: "full" })}`}
                      >
                        {day.getDate()}
                      </button>

                      {hidden > 0 ? (
                        <button
                          type="button"
                          onClick={() => openDay(day)}
                          className="absolute bottom-0.5 left-1 cursor-pointer px-1 text-left text-[11px] text-muted-foreground hover:text-foreground hover:underline sm:bottom-1 sm:left-1.5"
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
                  style={{ gridAutoRows: `${MONTH_LANE_HEIGHT}px` }}
                >
                  {placed
                    .filter((p) => p.lane < MONTH_LANES)
                    .map((p) => {
                      const { entry, startCol, endCol, lane, continuesBefore, continuesAfter } = p;
                      const style: CSSProperties = {
                        gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                        gridRow: lane + 1,
                      };
                      // A bar that carries on past the row edge runs right to it, unrounded,
                      // so it visibly continues into the next (or previous) week.
                      const edges = cn(
                        continuesBefore ? "ml-0 rounded-l-none border-l-0" : "ml-0.5 sm:ml-1.5",
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
                            onClick={() => openEvent(ev)}
                            style={{ ...style, ...eventChipStyle(eventColour(ev.colour)) }}
                            aria-label={`${allDay ? "All day: " : `${timeLabel(ev.start)}, `}${ev.title}${
                              isMultiDay(ev) ? `, until ${endLabel(ev)}` : ""
                            }`}
                            className={cn(
                              "pointer-events-auto flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight sm:px-1.5",
                              edges,
                            )}
                          >
                            <Marquee animate={sliding}>
                              {continuesBefore ? (
                                <span
                                  className="text-muted-foreground"
                                  aria-label="Continues from earlier"
                                >
                                  ↳
                                </span>
                              ) : allDay ? null : (
                                <span className="font-semibold tabular-nums">
                                  {timeLabel(ev.start)}
                                </span>
                              )}
                              <span>{ev.title}</span>
                            </Marquee>
                            {continuesAfter ? (
                              <span className="ml-auto text-muted-foreground">→</span>
                            ) : null}
                          </button>
                        );
                      }
                      const b = entry.item;
                      const cancelled = isCancelled(b);
                      const payment = chipPayment(b, paymentColours);
                      const tag = tagFor(b);
                      const client = clientFor(b);
                      const multi = isMultiDay(b);
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
                          onClick={() => setSelectedBookingId(b.id)}
                          title={payment.label}
                          aria-label={`${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${client ? `${client}, ` : ""}${serviceLabel(
                            b,
                          )}${multi ? `, until ${endLabel(b)}` : ""} — ${payment.label}`}
                          style={{ ...style, ...payment.style }}
                          className={cn(
                            "pointer-events-auto flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight sm:px-1.5",
                            payment.className,
                            edges,
                            cancelled && "opacity-45 line-through",
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
                                <span className="font-semibold">All day</span>
                              ) : (
                                <span className="font-semibold tabular-nums">
                                  {timeLabel(b.start)}
                                </span>
                              )
                            ) : null}
                            {showClient ? <span className="font-semibold">{client}</span> : null}
                            {showTag ? <span className="font-semibold">{tag}</span> : null}
                            {showCategory ? (
                              <span className="opacity-75">
                                {showService ? `${category} ·` : category}
                              </span>
                            ) : null}
                            {showService ? <span>{b.serviceSnapshot.name}</span> : null}
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
      ) : (
        <div className="surface-card overflow-x-auto">
          {/* One scroll container for header + grid so the day headings stay
              aligned with their columns and move with them on narrow screens. */}
          <div className={cn("flex border-b bg-secondary/50", gridMinWidth)}>
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

          <div>
            {/* All-day jobs (RECA-532) and all-day events get a lane above the hours
                rather than a 00:00–00:00 block: they hold the whole day, not a time on it. */}
            {allDayPlaced.length > 0 ? (
              <div className={cn("flex border-b bg-secondary/20", gridMinWidth)}>
                <div className="w-16 shrink-0 pt-1.5 pr-2 text-right text-[11px] text-muted-foreground">
                  All day
                </div>
                <div className="relative min-h-9 flex-1">
                  {/* Column rules sit behind the bars so a two-day job reads as one
                      bar crossing the line, as it does in the month grid. */}
                  <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
                    {allDayIsos.map((iso) => (
                      <div key={iso} className="flex-1 border-l" />
                    ))}
                  </div>
                  <div
                    className="relative grid gap-y-0.5 py-1"
                    style={{
                      gridTemplateColumns: `repeat(${allDayIsos.length}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${Math.max(1, allDayLanes)}, auto)`,
                    }}
                  >
                    {allDayPlaced.map((p) => {
                      const { startCol, endCol, lane, continuesBefore, continuesAfter } = p;
                      if (p.entry.kind === "holiday") {
                        const h = p.entry.item;
                        return (
                          <div
                            key={h.id}
                            role="note"
                            aria-label={`Bank holiday: ${h.title}`}
                            title={h.notes ? `${h.title} — ${h.notes}` : h.title}
                            style={{
                              gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                              gridRow: lane + 1,
                            }}
                            className={cn(HOLIDAY_CHIP, "mx-1")}
                          >
                            <Landmark className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{h.title}</span>
                          </div>
                        );
                      }
                      if (p.entry.kind === "event") {
                        const ev = p.entry.item;
                        const owner = staff.data?.find((s) => s.id === ev.staffId);
                        return (
                          <button
                            key={`${ev.id}-${startCol}`}
                            type="button"
                            onClick={() => openEvent(ev)}
                            title={owner ? `Event · ${owner.displayName}` : "Event"}
                            aria-label={`All day: ${ev.title}${
                              isMultiDay(ev) ? `, until ${endLabel(ev)}` : ""
                            }`}
                            style={{
                              ...eventChipStyle(eventColour(ev.colour)),
                              gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                              gridRow: lane + 1,
                            }}
                            className={cn(
                              "flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight",
                              continuesBefore ? "ml-0 rounded-l-none border-l-0" : "ml-1",
                              continuesAfter ? "mr-0 rounded-r-none" : "mr-1",
                            )}
                          >
                            {continuesBefore ? (
                              <span className="text-muted-foreground" aria-label="Continues">
                                ↳
                              </span>
                            ) : null}
                            <span className="truncate font-semibold">{ev.title}</span>
                            {view === "day" && owner && !soleStaff ? (
                              <span className="truncate text-muted-foreground">
                                · {owner.displayName}
                              </span>
                            ) : null}
                            {continuesAfter ? (
                              <span className="ml-auto text-muted-foreground">→</span>
                            ) : null}
                          </button>
                        );
                      }
                      const b = p.entry.item;
                      const cancelled = isCancelled(b);
                      const payment = chipPayment(b, paymentColours);
                      const tag = tagFor(b);
                      const owner = staff.data?.find((s) => s.id === b.staffId);
                      const category = categoryFor(b);
                      return (
                        <button
                          key={`${b.id}-${startCol}`}
                          type="button"
                          onClick={() => setSelectedBookingId(b.id)}
                          title={`${payment.label}${owner ? ` · ${owner.displayName}` : ""}`}
                          aria-label={`All day: ${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${serviceLabel(b)}${
                            isMultiDay(b) ? `, until ${endLabel(b)}` : ""
                          } — ${payment.label}`}
                          style={{
                            gridColumn: `${startCol + 1} / span ${endCol - startCol + 1}`,
                            gridRow: lane + 1,
                            ...payment.style,
                          }}
                          className={cn(
                            "flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight",
                            payment.className,
                            continuesBefore ? "ml-0 rounded-l-none" : "ml-1",
                            continuesAfter ? "mr-0 rounded-r-none" : "mr-1",
                            cancelled && "opacity-45 line-through",
                          )}
                        >
                          {b.clientLift ? <LiftTag /> : null}
                          {continuesBefore ? (
                            <span className="opacity-75" aria-label="Continues">
                              ↳
                            </span>
                          ) : null}
                          {tag ? <span className="shrink-0 font-semibold">{tag}</span> : null}
                          <span className="truncate">{b.serviceSnapshot.name}</span>
                          {/* Category trails the name here (not leads, as in month bars):
                              a week column is narrow and the name must survive truncation. */}
                          {category ? (
                            <span className="truncate opacity-75">· {category}</span>
                          ) : null}
                          {view === "day" && owner && !soleStaff ? (
                            <span className="truncate opacity-75">· {owner.displayName}</span>
                          ) : null}
                          {continuesAfter ? <span className="ml-auto opacity-75">→</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            <div className={cn("relative flex", gridMinWidth)}>
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
                const dayBookings = filtered.filter((b) => !b.allDay && coversDay(b, iso));
                const dayEvents = events.filter((e) => !isAllDay(e) && coversDay(e, iso));
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
                          style={{
                            ...eventChipStyle(eventColour(ev.colour)),
                            top: box.top,
                            height: box.height,
                          }}
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
                      const payment = chipPayment(b, paymentColours);
                      const tag = tagFor(b);
                      const { startsToday, endsToday, heightMin, top, height } = columnBox(b, iso);
                      const trainer = staff.data?.find((s) => s.id === b.staffId);
                      const category = categoryFor(b);
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBookingId(b.id)}
                          title={payment.label}
                          aria-label={`${b.clientLift ? "Lift needed, " : ""}${tag ? `${tag}, ` : ""}${serviceLabel(b)} — ${payment.label}`}
                          className={cn(
                            // flex-col so the text sits at the top of a tall block; a
                            // button centres its content vertically by default.
                            "absolute inset-x-1 z-10 flex cursor-pointer flex-col items-stretch justify-start overflow-hidden rounded-lg px-2 py-1 text-left",
                            payment.className,
                            cancelled && "opacity-45 line-through",
                          )}
                          style={{ top, height, ...payment.style }}
                        >
                          <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold">
                            {b.clientLift ? <LiftTag /> : null}
                            <span className="truncate">
                              {startsToday ? timeLabel(b.start) : "↳"} {b.serviceSnapshot.name}
                              {category ? (
                                <span className="font-normal opacity-75"> · {category}</span>
                              ) : null}
                            </span>
                          </p>
                          {tag ? (
                            <p className="truncate text-[11px] font-semibold tracking-wide">
                              {tag}
                            </p>
                          ) : null}
                          <p className="truncate text-[11px] opacity-75">
                            {b.attendees.length > 1
                              ? `${b.seatCount}/${b.attendees.length} booked`
                              : trainer?.displayName}
                          </p>
                          {isMultiDay(b) ? (
                            <p className="truncate text-[11px] opacity-75">
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

      {/* Legend on the left; the calendar's own settings (holidays, colours, label
          motion) on the right, where they are found without opening Settings. */}
      <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-medium">Payment:</span>
          {PAYMENT_LEGEND.map(({ tone, label }) => {
            const dot = paymentDotStyle(tone, paymentColours);
            return (
              <span key={tone} className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", dot.className)} style={dot.style} />
                {label}
              </span>
            );
          })}
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: legendEventColour }} />
            Event (own colour, hatched)
          </span>
          {holidayRegion ? (
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm border border-dashed border-muted-foreground/60" />
              Bank holiday
              {publicHolidays.isError ? (
                <span className="text-warning-foreground">(couldn't load from gov.uk)</span>
              ) : null}
            </span>
          ) : null}
          {tenant.can(PERMISSIONS.BUSINESS_UPDATE) ? (
            <button
              type="button"
              onClick={() => setColoursOpen(true)}
              className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <Palette className="size-3" aria-hidden />
              Change colours
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:justify-end">
          {tenant.can(PERMISSIONS.BUSINESS_UPDATE) || holidayRegion ? (
            <span className="flex items-center gap-2">
              <Landmark className="size-3" aria-hidden />
              <PublicHolidaysSelect size="sm" />
            </span>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={sliding}
              onCheckedChange={(on) => setMarquee(on ? "on" : "off")}
              aria-label="Scroll long labels"
              className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
            />
            Scroll long labels
          </label>
        </div>
      </div>

      <CalendarColoursDialog open={coloursOpen} onOpenChange={setColoursOpen} />

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
