import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  Check,
  Download,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SavedCopyNotice } from "@/components/SavedCopyNotice";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { UpsellRequestsCard } from "@/components/UpsellRequestsCard";
import { StatusPill } from "@/components/BookingStatusPill";
import { useUpsellOffers } from "@/lib/api/upsells";
import { EmptyState, PageHeader, PersonAvatar } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { matchesServiceFilter } from "@/lib/service-categories";
import { useTenant } from "@/lib/tenant/tenant-context";
import { ServiceFilterSelect } from "@/components/ServiceFilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useIsPhone } from "@/hooks/use-media-query";
import {
  useBookings,
  useCustomersById,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { customerDisplayName, type Booking } from "@/lib/api/types";
import {
  amountNote,
  BOOKINGS_TABS,
  bookingsCsv,
  dayGroupHeading,
  defaultSortDir,
  groupByDay,
  inTab,
  isCancelledBooking,
  matchesQuery,
  needsAction,
  presetRange,
  RANGE_PRESETS,
  rangeLabel,
  sortBookings,
  statusPill,
  type BookingsTab,
  type RangePreset,
  type SortKey,
} from "@/lib/bookings-list";
import { shortDuration } from "@/lib/calendar-layout";
import { bookingUrlFor } from "@/lib/hosts";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import {
  formatAllDaySpan,
  formatInTz,
  formatMoney,
  isoDate,
  isoDateInTz,
  spansDays,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/** `?booking=<id>` opens that booking's drawer — the staff add-on request email links here. */
const searchSchema = z.object({
  booking: z.string().min(1).optional(),
  /** Opens filtered to one person, e.g. from Team's "I'll sort them first". */
  staff: z.string().min(1).optional(),
});

export const Route = createFileRoute("/bookings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Bookings — RECAVO" },
      {
        name: "description",
        content:
          "Search, filter and manage every booking: confirmed, awaiting payment, completed, cancelled, no-show and refunded.",
      },
      { property: "og:title", content: "RECAVO Bookings" },
      {
        property: "og:description",
        content: "Manage every session booking in one filterable table.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <BookingsPage />
      </AppShell>
    </RequireAuth>
  ),
});

/** Spec §5.1 recommends 25 a page (open decision resolved in favour of paging). */
const PAGE_SIZE = 25;

const TAB_LABELS: Record<BookingsTab, string> = {
  upcoming: "Upcoming",
  needs_action: "Needs action",
  past: "Past",
  all: "All",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "confirmed", label: "Confirmed" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "completed", label: "Completed" },
  { value: "cancelled_by_customer", label: "Cancelled by client" },
  { value: "cancelled_by_business", label: "Cancelled by business" },
  { value: "late_cancelled", label: "Late cancellation" },
  { value: "no_show", label: "No-show" },
];

/** Only pills that call for a look get shown on phone cards (spec §5.3). */
const ATTENTION_LABELS = new Set([
  "Held",
  "Unpaid",
  "Not marked done",
  "Cancelled",
  "No-show",
  "Expired",
  "Draft",
]);

function BookingsPage() {
  const search = Route.useSearch();
  const phone = useIsPhone();
  const tenant = useTenant();
  const [tab, setTab] = useState<BookingsTab>("upcoming");
  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState(search.staff ?? "all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [preset, setPreset] = useState<RangePreset>("default");
  const [range, setRange] = useState(() => presetRange("default", new Date()));
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "time",
    dir: "asc",
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(search.booking ?? null);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    if (search.booking) setSelectedBookingId(search.booking);
  }, [search.booking]);

  const staff = useStaffList();
  // Pending add-on requests, so rows can carry a marker and the card above can list them.
  const upsellRequests = useUpsellOffers(["requested"]);
  const requestedBookingIds = useMemo(
    () => new Set((upsellRequests.data ?? []).map((o) => o.bookingId)),
    [upsellRequests.data],
  );
  // One staff member / one location: nothing to filter by and nothing to show.
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const services = useServices();
  const locations = useLocationsList();
  // Vertical-aware noun: "Trainer" for PT, "Staff member" for automotive.
  const staffNoun = tenant.terminology.staff || "Staff member";
  const bookingNoun = (tenant.terminology.booking || "Booking").toLowerCase();
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const todayIso = isoDate(new Date());

  const bookings = useBookings({
    from: new Date(`${range.from}T00:00:00.000Z`).toISOString(),
    // `to` is inclusive in the picker, so the query runs to the start of the next day.
    to: new Date(new Date(`${range.to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 200,
  });
  const fetched = useMemo(() => bookings.data?.bookings ?? [], [bookings.data]);

  // Names for every row in range: the client column, the search box and sorting
  // by client all need them.
  const customers = useCustomersById(fetched.map((b) => b.leadCustomerId));
  const clientOf = (b: Booking) => {
    const c = b.leadCustomerId ? customers.get(b.leadCustomerId) : undefined;
    return c
      ? { name: customerDisplayName(c), email: c.emailDisplay, phone: c.phoneDisplay }
      : undefined;
  };
  const clientName = (b: Booking) =>
    b.attendees.length > 1 ? `${b.seatCount} attendees` : (clientOf(b)?.name ?? "");

  const serviceById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s])),
    [services.data],
  );
  const now = new Date();
  const base = useMemo(
    () =>
      fetched.filter(
        (b) =>
          matchesServiceFilter(serviceFilter, serviceById.get(b.serviceSnapshot.serviceId)) &&
          // Picking a cancelled status in the dropdown is asking to see them.
          (showCancelled || statusFilter !== "all" || !isCancelledBooking(b)),
      ),
    [fetched, serviceFilter, serviceById, showCancelled, statusFilter],
  );
  const needsActionCount = base.filter((b) => needsAction(b, now)).length;
  const rows = useMemo(() => {
    const matched = base.filter((b) => inTab(b, tab, now) && matchesQuery(b, query, clientOf(b)));
    return sortBookings(matched, sort.key, sort.dir, clientName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, tab, query, sort, customers]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const groups = groupByDay(pageRows, (b) => isoDateInTz(b.start, timezone));
  const currency = tenant.business?.currency ?? fetched[0]?.currency ?? "GBP";

  const changeTab = (next: BookingsTab) => {
    setTab(next);
    setPage(0);
    setSort({ key: "time", dir: defaultSortDir(next) });
  };
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "time" ? defaultSortDir(tab) : "asc" },
    );
  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p, new Date()));
    setPage(0);
  };

  const filtersActive =
    query !== "" ||
    staffFilter !== "all" ||
    serviceFilter !== "all" ||
    statusFilter !== "all" ||
    showCancelled ||
    preset !== "default";
  const clearFilters = () => {
    setQuery("");
    setStaffFilter("all");
    setServiceFilter("all");
    setStatusFilter("all");
    setShowCancelled(false);
    applyPreset("default");
  };

  const trainerName = (b: Booking) =>
    staff.data?.find((s) => s.id === b.staffId)?.displayName ?? "—";
  const locationName = (b: Booking) =>
    locations.data?.find((l) => l.id === b.locationId)?.name ?? "—";
  const timeOf = (iso: string) => formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });

  const exportCsv = () => {
    const csv = bookingsCsv(rows, {
      client: clientName,
      trainer: trainerName,
      location: locationName,
      date: (iso) => formatInTz(iso, timezone, { dateStyle: "short" }),
      time: timeOf,
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyBookingLink = async () => {
    const slug = tenant.business?.slug;
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(bookingUrlFor(slug));
      toast.success("Booking page link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const tabs = (
    <div
      role="tablist"
      aria-label="Which bookings"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
    >
      {BOOKINGS_TABS.map((t) => {
        const active = t === tab;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => changeTab(t)}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
            {t === "needs_action" && needsActionCount > 0 ? (
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold tabular-nums",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-cal-deposit text-white",
                )}
              >
                {needsActionCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const rangePicker = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 justify-start gap-2 font-semibold",
            preset !== "default" && "border-foreground/40",
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          {rangeLabel(range.from, range.to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <ul className="space-y-0.5">
          {RANGE_PRESETS.map((p) => (
            <li key={p.value}>
              <button
                type="button"
                onClick={() => applyPreset(p.value)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary",
                  preset === p.value && "font-bold",
                )}
              >
                {p.label}
                {preset === p.value ? <Check className="size-4 text-primary" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
        {preset === "custom" ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
            <label className="text-xs text-muted-foreground">
              From
              <Input
                type="date"
                className="mt-1"
                value={range.from}
                onChange={(e) => {
                  if (e.target.value) setRange((r) => ({ ...r, from: e.target.value }));
                  setPage(0);
                }}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              To
              <Input
                type="date"
                className="mt-1"
                value={range.to}
                onChange={(e) => {
                  if (e.target.value) setRange((r) => ({ ...r, to: e.target.value }));
                  setPage(0);
                }}
              />
            </label>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );

  const filterControls = (
    <>
      {rangePicker}
      {soleStaff ? null : (
        <Select
          value={staffFilter}
          onValueChange={(v) => {
            setStaffFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger
            className={cn(
              "h-10 w-auto min-w-[150px]",
              staffFilter !== "all" && "border-foreground/40 font-semibold",
            )}
          >
            <SelectValue placeholder={staffNoun} />
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
      )}
      <ServiceFilterSelect
        services={services.data ?? []}
        value={serviceFilter}
        onValueChange={(v) => {
          setServiceFilter(v);
          setPage(0);
        }}
        className={cn(
          "h-10 w-auto min-w-[150px]",
          serviceFilter !== "all" && "border-foreground/40 font-semibold",
        )}
      />
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(0);
        }}
      >
        <SelectTrigger
          className={cn(
            "h-10 w-auto min-w-[140px]",
            statusFilter !== "all" && "border-foreground/40 font-semibold",
          )}
        >
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex h-10 items-center gap-2 px-1">
        <Switch
          id="show-cancelled"
          checked={showCancelled}
          onCheckedChange={(v) => {
            setShowCancelled(v);
            setPage(0);
          }}
        />
        <Label htmlFor="show-cancelled" className="text-sm font-normal text-muted-foreground">
          Cancelled
        </Label>
      </div>
      {filtersActive ? (
        <button
          type="button"
          onClick={clearFilters}
          className="h-10 cursor-pointer px-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          Clear
        </button>
      ) : null}
    </>
  );

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-10 bg-secondary/60 pl-9"
        placeholder="Search client, service or reference"
        value={query}
        aria-label="Search bookings"
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
    </div>
  );

  const sortIcon = (key: SortKey) =>
    sort.key === key ? (
      sort.dir === "asc" ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : (
        <ArrowDown className="size-3" aria-hidden />
      )
    ) : null;
  const sortLabel = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  const groupTotal = (list: Booking[]) =>
    list.filter((b) => !isCancelledBooking(b)).reduce((sum, b) => sum + b.priceMinor, 0);

  let body: ReactNode;
  if (bookings.isLoading) {
    body = <TableGhost rows={6} />;
  } else if (bookings.isError) {
    body = (
      <div className="p-6">
        <EmptyState
          title="Couldn't load bookings"
          description="Try adjusting the date range and search again."
          action={
            <Button variant="outline" onClick={() => void bookings.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="p-6">
        {fetched.length === 0 && !filtersActive && tab === "upcoming" ? (
          <EmptyState
            title={`No ${bookingNoun}s yet`}
            description="Share your booking page to get your first one."
            action={
              tenant.business?.slug ? (
                <Button variant="outline" onClick={copyBookingLink}>
                  Copy booking link
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            title={`No ${bookingNoun}s match these filters`}
            description={
              tab === "needs_action"
                ? "Nothing here needs you right now."
                : "Try widening the date range or clearing a filter."
            }
            action={
              filtersActive ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    );
  } else if (phone) {
    body = (
      <div className="space-y-4 p-3">
        {groups.map((g) => (
          <section key={g.day} aria-label={dayGroupHeading(g.day, todayIso)}>
            <header className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-sm font-extrabold">{dayGroupHeading(g.day, todayIso)}</h3>
              <p className="text-xs font-semibold text-muted-foreground">
                {g.rows.length} {g.rows.length === 1 ? bookingNoun : `${bookingNoun}s`}
              </p>
            </header>
            <ul className="space-y-2">
              {g.rows.map((b) => {
                const pill = statusPill(b);
                const note = amountNote(b, (m, c) => formatMoney(m, c, { compact: true }), timeOf);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBookingId(b.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-left",
                        pill.label === "Held" && "bg-cal-held",
                      )}
                    >
                      <span className="w-[46px] shrink-0 text-sm font-bold text-muted-foreground tabular-nums">
                        {b.allDay ? "All day" : timeOf(b.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[15px] font-bold">
                          <span className="truncate">{clientName(b) || "…"}</span>
                          {requestedBookingIds.has(b.id) ? (
                            <Sparkles
                              className="size-3.5 shrink-0 text-primary"
                              aria-label="Add-on requested"
                            />
                          ) : null}
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {b.serviceSnapshot.name} ·{" "}
                          {b.priceMinor === 0 ? "Free" : formatMoney(b.priceMinor, b.currency)}
                          {note ? (
                            <span className="font-semibold text-cal-deposit-fg"> · {note}</span>
                          ) : null}
                        </span>
                      </span>
                      {ATTENTION_LABELS.has(pill.label) ? <StatusPill booking={b} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  } else {
    const showTrainer = !soleStaff;
    const showLocation = !soleLocation;
    const colSpan = 4 + (showTrainer ? 1 : 0) + (showLocation ? 1 : 0);
    const head = (key: SortKey | null, label: string, className?: string) =>
      key ? (
        <th
          scope="col"
          aria-sort={sortLabel(key)}
          className={cn("px-4 py-2.5 text-left text-xs font-bold whitespace-nowrap", className)}
        >
          <button
            type="button"
            onClick={() => toggleSort(key)}
            className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
          >
            {label}
            {sortIcon(key)}
          </button>
        </th>
      ) : (
        <th
          scope="col"
          className={cn("px-4 py-2.5 text-left text-xs font-bold whitespace-nowrap", className)}
        >
          {label}
        </th>
      );
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <colgroup>
            <col style={{ width: 106 }} />
            <col />
            <col />
            {showTrainer ? <col /> : null}
            {showLocation ? <col /> : null}
            <col style={{ width: 116 }} />
            <col style={{ width: 126 }} />
          </colgroup>
          <thead className="h-10 bg-secondary/50 text-muted-foreground">
            <tr>
              {head("time", "Time")}
              {head("client", "Client")}
              {head(null, tenant.terminology.service || "Service")}
              {showTrainer ? head(null, staffNoun) : null}
              {showLocation ? head(null, "Location") : null}
              {head("amount", "Amount", "text-right [&>button]:flex-row-reverse")}
              {head(null, "Status")}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.day}
                heading={dayGroupHeading(g.day, todayIso)}
                summary={`${g.rows.length} ${g.rows.length === 1 ? bookingNoun : `${bookingNoun}s`} · ${formatMoney(groupTotal(g.rows), currency, { compact: true })}`}
                colSpan={colSpan}
              >
                {g.rows.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    timezone={timezone}
                    client={clientOf(b)}
                    clientLabel={clientName(b)}
                    trainerName={showTrainer ? trainerName(b) : null}
                    locationName={showLocation ? locationName(b) : null}
                    onSelect={() => setSelectedBookingId(b.id)}
                    addOnRequested={requestedBookingIds.has(b.id)}
                  />
                ))}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description={
          bookings.isLoading
            ? undefined
            : `${rows.length} ${rows.length === 1 ? bookingNoun : `${bookingNoun}s`} · ${rangeLabel(range.from, range.to)}`
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              <Download className="size-4" /> Export
            </Button>
            <Button
              className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm"
              onClick={() => setAddOpen(true)}
            >
              <CalendarPlus className="size-4" /> New {bookingNoun}
            </Button>
          </div>
        }
      />

      <UpsellRequestsCard onOpenBooking={setSelectedBookingId} />

      {phone ? (
        <>
          <div className="flex gap-2">
            {searchBox}
            <Button
              variant="outline"
              className={cn(
                "h-10 shrink-0 gap-1.5",
                filtersActive && "border-foreground/40 font-semibold",
              )}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="size-4" /> Filter
            </Button>
          </div>
          {tabs}
          {filtersOpen ? (
            <div className="surface-card flex flex-wrap items-center gap-2 p-3">
              {filterControls}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {tabs}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[260px] flex-1">{searchBox}</div>
            {filterControls}
          </div>
        </>
      )}

      {bookings.data?.nextCursor ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          This range has more {bookingNoun}s than we can show at once. Narrow the dates to see them
          all.
        </p>
      ) : null}

      <SavedCopyNotice updatedAt={bookings.dataUpdatedAt} what="This list" />

      <div className="surface-card overflow-hidden">
        {body}

        {rows.length > 0 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1} to {Math.min(rows.length, (page + 1) * PAGE_SIZE)} of{" "}
              {rows.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {page + 1} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AddBookingModal open={addOpen} onOpenChange={setAddOpen} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}

function GroupRows({
  heading,
  summary,
  colSpan,
  children,
}: {
  heading: string;
  summary: string;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="border-t bg-secondary/30">
        <th
          scope="rowgroup"
          colSpan={colSpan}
          className="px-4 py-2 text-left text-[13px] font-extrabold"
        >
          <span className="flex items-baseline justify-between gap-3">
            {heading}
            <span className="text-xs font-medium text-muted-foreground">{summary}</span>
          </span>
        </th>
      </tr>
      {children}
    </>
  );
}

function BookingRow({
  booking,
  timezone,
  client,
  clientLabel,
  trainerName,
  locationName,
  onSelect,
  addOnRequested,
}: {
  booking: Booking;
  timezone: string;
  client: { name: string; email: string | null; phone: string | null } | undefined;
  clientLabel: string;
  /** Null hides the column (a one-person / one-place business). */
  trainerName: string | null;
  locationName: string | null;
  onSelect: () => void;
  /** The client asked for an add-on from their offer email and staff haven't acted yet. */
  addOnRequested?: boolean;
}) {
  const pill = statusPill(booking);
  const timeOf = (iso: string) => formatInTz(iso, timezone, { hour: "2-digit", minute: "2-digit" });
  const minutes = (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60_000;
  const note = amountNote(booking, (m, c) => formatMoney(m, c, { compact: true }), timeOf);
  const multiDay = !booking.allDay && spansDays(booking.start, booking.end, timezone);

  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      aria-label={`${booking.serviceSnapshot.name}${client ? `, ${client.name}` : ""}, ${timeOf(booking.start)}, ${pill.label}. Open`}
      className={cn(
        "h-[58px] cursor-pointer border-t transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none",
        pill.label === "Held" && "bg-cal-held",
      )}
    >
      <td className="px-4 py-2.5 align-top whitespace-nowrap">
        {booking.allDay ? (
          <>
            <span className="block text-sm font-bold">All day</span>
            <span className="block text-xs text-muted-foreground">
              {formatAllDaySpan(booking.start, booking.end, timezone)}
            </span>
          </>
        ) : (
          <>
            <span className="block text-sm font-bold tabular-nums">{timeOf(booking.start)}</span>
            <span className="block text-xs text-muted-foreground">
              {multiDay
                ? `until ${formatInTz(booking.end, timezone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : shortDuration(minutes)}
            </span>
          </>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={client?.name ?? "?"} size={30} className="shrink-0" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <span className="truncate">{clientLabel || "…"}</span>
              {addOnRequested ? (
                <span
                  title="Add-on requested"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  <Sparkles className="size-3" />
                  Add-on
                </span>
              ) : null}
            </span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {booking.reference}
            </span>
          </span>
        </span>
      </td>
      <td className="px-4 py-2.5 align-top text-sm">{booking.serviceSnapshot.name}</td>
      {trainerName === null ? null : (
        <td className="px-4 py-2.5 align-top text-sm text-muted-foreground">{trainerName}</td>
      )}
      {locationName === null ? null : (
        <td className="px-4 py-2.5 align-top text-sm text-muted-foreground">{locationName}</td>
      )}
      <td className="px-4 py-2.5 text-right align-top whitespace-nowrap tabular-nums">
        <span className="block text-sm font-semibold">
          {booking.priceMinor === 0 ? "Free" : formatMoney(booking.priceMinor, booking.currency)}
        </span>
        {note ? (
          <span className="block text-xs font-semibold text-cal-deposit-fg">{note}</span>
        ) : null}
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="flex flex-col items-start gap-0.5 whitespace-nowrap">
          <StatusPill booking={booking} />
          {(booking.status === "awaiting_payment" || booking.status === "held") &&
          booking.paymentMethod === "bank_transfer" ? (
            // Pay-by-bank rows never auto-expire; the hint tells staff which of the
            // held rows are theirs to chase and mark received (RECA-522).
            <span className="text-xs text-muted-foreground">Bank transfer</span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}
