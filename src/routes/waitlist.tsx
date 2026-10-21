import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Hourglass, Phone, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog } from "@/components/AddWaitlistDialog";
import { BookingPanel } from "@/components/BookingPanel";
import { TonePill } from "@/components/client-profile/parts";
import { TableGhost } from "@/components/ghost";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleLookup } from "@/components/vehicles/use-vehicles-data";
import { WaitlistMenu } from "@/components/waitlist/actions";
import {
  AMBER_TEXT,
  FitsPicker,
  FitsPill,
  MINT_TEXT,
  PreferenceChips,
  SlotFreedBanner,
  SlotFreedCard,
  StatTile,
  WaitlistAvatar,
} from "@/components/waitlist/parts";
import { WaitlistEntryPanel } from "@/components/waitlist/WaitlistEntryPanel";
import { WaitlistPageSetting } from "@/components/waitlist/WaitlistPageSetting";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import {
  useDismissWaitlistSlotEvent,
  useLinkedRecordDefinition,
  useLocationsList,
  useServices,
  useWaitlistFigures,
  useWaitlistPage,
  useWaitlistSlotEvents,
} from "@/lib/api/hooks";
import type {
  WaitlistEntry,
  WaitlistFreeTime,
  WaitlistSlotEvent,
  WaitlistTab,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { formatMoney, isoDateInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  WAITLIST_TABS,
  TIME_OF_DAY_LABELS,
  customerName,
  dayChips,
  dayDate,
  displayPhone,
  fitsLabel,
  longDayDate,
  parseFits,
  parseWaitlistSearch,
  shortDate,
  slotFits,
  sourceLine,
  spokenPreferences,
  suggestedBookingDate,
  waitingSince,
  windowPassed,
  windowPhrase,
  type WaitlistSearch,
} from "@/lib/waitlist";

export const Route = createFileRoute("/waitlist")({
  validateSearch: (raw: Record<string, unknown>): WaitlistSearch => parseWaitlistSearch(raw),
  head: () => ({
    meta: [
      { title: "Waitlist — RECAVO" },
      {
        name: "description",
        content:
          "Clients waiting for a slot: who wants what, roughly when, and who could take a freed time.",
      },
      { property: "og:title", content: "RECAVO Waitlist" },
      {
        property: "og:description",
        content: "Never lose an enquiry because the diary was full.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <WaitlistPage />
      </AppShell>
    </RequireAuth>
  ),
});

const COLUMNS = "grid-cols-[1.15fr_1.25fr_1.3fr_128px_96px]";

type BookTarget = { entry: WaitlistEntry; time?: WaitlistFreeTime };

function WaitlistPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const myUserId = useAuth().user?.id;
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const todayIso = isoDateInTz(new Date().toISOString(), timezone);
  const canAct = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const bookingNoun = tenant.terminology.booking.toLowerCase();
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();

  const tab: WaitlistTab = search.tab ?? "waiting";
  const page = search.page ?? 1;
  const topBarLocation =
    tenant.currentLocationId && tenant.currentLocationId !== "all"
      ? tenant.currentLocationId
      : undefined;
  const locationId = search.location ?? topBarLocation;
  const fits = parseFits(search.fits);
  const narrowing = tab === "waiting" && Boolean(fits || search.slot || search.week);

  const [qInput, setQInput] = useState(search.q ?? "");
  const q = useDebouncedValue(qInput.trim(), 300);
  useEffect(() => {
    if ((search.q ?? "") === q) return;
    void navigate({
      search: (prev) => ({ ...prev, q: q || undefined, page: undefined }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setSearch = (patch: Partial<WaitlistSearch>) =>
    void navigate({
      search: (prev) => {
        const next: WaitlistSearch = { ...prev, ...patch };
        if (!("page" in patch)) delete next.page;
        if (next.tab === "waiting") delete next.tab;
        for (const k of Object.keys(next) as (keyof WaitlistSearch)[]) {
          if (next[k] === undefined) delete next[k];
        }
        return next;
      },
      replace: true,
    });

  const services = useServices();
  const locations = useLocationsList();
  const definition = useLinkedRecordDefinition();
  const hasRecords = Boolean(definition.data?.definition);
  const vehicles = useVehicleLookup({ enabled: hasRecords });
  const list = useWaitlistPage({
    tab,
    page,
    q: search.q,
    serviceId: search.service,
    locationId,
    fits: search.slot ? undefined : search.fits,
    slot: search.slot,
    fitWeek: search.week,
    from: search.from,
    to: search.to,
  });
  const figures = useWaitlistFigures({ locationId });
  const slotEvents = useWaitlistSlotEvents({ locationId });
  const dismiss = useDismissWaitlistSlotEvent();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntry | null>(null);
  const [booking, setBooking] = useState<BookTarget | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const entries = list.data?.entries ?? [];
  const counts = list.data?.counts;
  const total = list.data?.total ?? 0;
  const pageSize = list.data?.pageSize ?? 25;
  const serviceList = (services.data ?? []).filter((s) => s.active);
  const locationList = locations.data ?? [];
  const events = slotEvents.data ?? [];
  const anyFilter = Boolean(
    search.q ||
    search.service ||
    search.location ||
    fits ||
    search.slot ||
    search.week ||
    search.from ||
    search.to,
  );
  const loading = tenant.isLoading || list.isLoading;
  const nothingEver =
    !loading &&
    !list.isError &&
    !anyFilter &&
    counts !== undefined &&
    counts.waiting + counts.booked + counts.removed === 0;

  const vehicleOf = (e: WaitlistEntry) =>
    e.linkedRecordId ? vehicles.get(e.linkedRecordId) : undefined;
  const openEntry = (id: string | undefined) => setSearch({ entry: id, page: search.page });
  const entryInList = entries.find((e) => e.id === search.entry) ?? null;

  const showSlot = (e: WaitlistSlotEvent) =>
    setSearch({
      tab: undefined,
      slot: e.id,
      fits: slotFits(e),
      week: undefined,
      from: undefined,
      to: undefined,
    });
  const clearNarrowing = () =>
    setSearch({
      fits: undefined,
      slot: undefined,
      week: undefined,
      from: undefined,
      to: undefined,
    });
  const clearFilters = () => {
    setQInput("");
    setSearch({
      q: undefined,
      service: undefined,
      location: undefined,
      fits: undefined,
      slot: undefined,
      week: undefined,
      from: undefined,
      to: undefined,
    });
  };

  const money = (minor: number, currency: string | null) => {
    try {
      return formatMoney(minor, currency || tenant.business?.currency || "GBP");
    } catch {
      return "–";
    }
  };

  const dayIn = (iso: string) => isoDateInTz(iso, timezone);

  /* ---------------- Pieces ---------------- */

  const ariaFor = (e: WaitlistEntry) => {
    const v = vehicleOf(e);
    return [
      customerName(e),
      e.priority === "high" ? "high priority" : null,
      [e.service?.name, e.variant?.name].filter(Boolean).join(", "),
      v?.plate ?? e.linkedRecord?.label ?? null,
      e.staff ? `with ${e.staff.displayName}` : null,
      spokenPreferences(e.preferences),
      windowPassed(e.preferences, todayIso) ? "window passed" : null,
      tab === "waiting" ? waitingSince(e.createdAt).toLowerCase() : null,
      tab === "booked" && e.booking ? `booked for ${longDayDate(dayIn(e.booking.start))}` : null,
      tab === "removed" ? (e.status === "expired" ? "expired" : "removed") : null,
      narrowing && fits ? `fits ${longDayDate(fits.date)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const wantsLine = (e: WaitlistEntry) => {
    const v = vehicleOf(e);
    if (hasRecords) {
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {v?.plate ? <NumberPlate registration={v.plate} size="small" /> : null}
          <span className="truncate">
            {v?.title ?? e.linkedRecord?.label ?? "Any"}
            {e.staff ? ` · with ${e.staff.displayName}` : ""}
          </span>
        </span>
      );
    }
    return (
      <span className="truncate text-[12.5px] text-muted-foreground">
        {e.staff ? e.staff.displayName : "Anyone"}
        {e.location && locationList.length > 1 ? ` · ${e.location.name}` : ""}
      </span>
    );
  };

  const windowLine = (e: WaitlistEntry, size = "text-[13.5px]") => {
    const passed = windowPassed(e.preferences, todayIso);
    return (
      <span className={cn("font-bold", size, passed && AMBER_TEXT)}>
        {windowPhrase(e.preferences)}
        {passed ? " · passed" : ""}
      </span>
    );
  };

  const bookButton = (e: WaitlistEntry, className?: string) =>
    canAct && e.status === "waiting" ? (
      <Button
        size="sm"
        className={className}
        onClick={(ev) => {
          ev.stopPropagation();
          setBooking({ entry: e });
        }}
        aria-label={`Book ${customerName(e)}`}
      >
        Book
      </Button>
    ) : null;

  const menu = (e: WaitlistEntry, triggerClassName?: string) => (
    <WaitlistMenu
      entry={e}
      canAct={canAct}
      onEdit={setEditing}
      onOpenBooking={setOpenBookingId}
      triggerClassName={triggerClassName}
    />
  );

  const statusPill = (e: WaitlistEntry) =>
    e.status === "expired" ? (
      <TonePill tone="grey">Expired</TonePill>
    ) : e.status === "cancelled" ? (
      <TonePill tone="grey">Removed</TonePill>
    ) : null;

  const tabs = (
    <div
      role="tablist"
      aria-label="Which entries"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
    >
      {WAITLIST_TABS.map((t) => {
        const active = t.value === tab;
        const n = counts?.[t.value];
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${t.label}${n === undefined ? "" : `, ${n}`}`}
            onClick={() => setSearch({ tab: t.value })}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="text-xs font-bold tabular-nums opacity-70" aria-hidden>
              {n ?? ""}
            </span>
          </button>
        );
      })}
    </div>
  );

  const searchBox = (className?: string) => (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Search clients</span>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        placeholder="Search clients"
        className="h-[34px] pl-9"
      />
    </label>
  );

  const serviceFilter =
    serviceList.length > 1 ? (
      <FilterMenu
        label={serviceList.find((s) => s.id === search.service)?.name ?? "All services"}
        value={search.service ?? ""}
        options={[
          { value: "", label: "All services" },
          ...serviceList.map((s) => ({ value: s.id, label: s.name })),
        ]}
        onChange={(v) => setSearch({ service: v || undefined })}
        active={Boolean(search.service)}
      />
    ) : null;

  const locationFilter =
    locationList.length > 1 ? (
      <FilterMenu
        label={locationList.find((l) => l.id === locationId)?.name ?? "All locations"}
        value={locationId ?? ""}
        options={[
          { value: "", label: "All locations" },
          ...locationList.map((l) => ({ value: l.id, label: l.name })),
        ]}
        onChange={(v) => setSearch({ location: v || undefined })}
        active={Boolean(search.location)}
      />
    ) : null;

  const narrowChip = search.week ? (
    <RemovableChip label="Fit this week" onClear={clearNarrowing} />
  ) : search.from || search.to ? (
    <RemovableChip
      label={windowPhrase({ from: search.from ?? null, to: search.to ?? null })}
      onClear={clearNarrowing}
    />
  ) : null;

  const fitsControl =
    tab === "waiting" && !search.week ? (
      <FitsPicker
        value={search.fits}
        defaultDate={todayIso}
        onChange={(v) => setSearch({ fits: v, slot: undefined, from: undefined, to: undefined })}
      />
    ) : null;

  const filtersRow = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {tabs}
      <div className="flex flex-wrap items-center gap-2">
        {searchBox("w-[220px]")}
        {serviceFilter}
        {locationFilter}
        {narrowChip}
        {fitsControl}
      </div>
    </div>
  );

  const figureTiles = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.isLoading ? (
        Array.from({ length: canMoney ? 4 : 3 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[14px]" />
        ))
      ) : (
        <>
          <StatTile
            label="Waiting"
            value={String(figures.data?.waiting ?? "–")}
            sub={`${figures.data?.highPriority ?? 0} high priority`}
            onClick={() => setSearch({ tab: undefined })}
          />
          <StatTile
            label="Fit this week"
            value={figures.data?.fitThisWeek == null ? "–" : String(figures.data.fitThisWeek)}
            sub="Have a free day that suits"
            onClick={() =>
              setSearch({
                tab: undefined,
                week: true,
                fits: undefined,
                slot: undefined,
                from: undefined,
                to: undefined,
              })
            }
          />
          <StatTile
            label="Booked in"
            value={String(figures.data?.bookedIn90 ?? "–")}
            sub="Last 90 days"
            onClick={() => setSearch({ tab: "booked" })}
          />
          {canMoney && figures.data?.broughtInMinor != null ? (
            <StatTile
              label="Brought in"
              value={money(figures.data.broughtInMinor, figures.data.currency)}
              sub="From the waitlist, last 90 days"
              valueClass={MINT_TEXT}
              onClick={() => setSearch({ tab: "booked" })}
            />
          ) : null}
        </>
      )}
    </div>
  );

  const banner =
    events.length > 0 ? (
      phone ? (
        <SlotFreedCard
          event={events[0]!}
          onShow={() => showSlot(events[0]!)}
          onDismiss={() => dismiss.mutate(events[0]!.id)}
        />
      ) : (
        <SlotFreedBanner
          events={events}
          onShow={showSlot}
          onDismiss={(e) => dismiss.mutate(e.id)}
        />
      )
    ) : null;

  /* ---------------- List ---------------- */

  let body: ReactNode;
  if (loading) {
    body = <TableGhost rows={5} />;
  } else if (list.isError) {
    body = (
      <div className="p-6">
        <EmptyState
          title="Couldn't load the waitlist"
          description={
            list.error instanceof ApiError
              ? list.error.detail || list.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => list.refetch()}>Try again</Button>}
        />
      </div>
    );
  } else if (entries.length === 0) {
    body =
      narrowing && fits ? (
        <EmptyInCard
          title={`Nobody waiting fits ${fitsLabel(fits)}.`}
          action={
            <Button variant="outline" onClick={clearNarrowing}>
              Show everyone waiting
            </Button>
          }
        />
      ) : anyFilter ? (
        <EmptyInCard
          title="Nothing matches"
          description="Try another day or clear the filters."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyInCard
          title={tab === "booked" ? "Nobody booked in from the waitlist yet" : "Nothing removed"}
        />
      );
  } else if (phone) {
    body = (
      <ul className="grid gap-2.5 p-2.5">
        {entries.map((e) => (
          <li key={e.id}>
            <div
              className={cn(
                "surface-card grid gap-2 rounded-[14px] px-4 py-3 transition-colors duration-700",
                tab === "removed" && "opacity-70",
                highlight === e.id && "bg-primary-soft",
              )}
            >
              <button
                type="button"
                className="grid cursor-pointer gap-1 text-left"
                onClick={() => openEntry(e.id)}
                aria-label={ariaFor(e)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-bold">{customerName(e)}</span>
                  {e.priority === "high" ? <TonePill tone="amber">High priority</TonePill> : null}
                  {statusPill(e)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  {vehicleOf(e)?.plate ? (
                    <NumberPlate registration={vehicleOf(e)!.plate!} size="small" />
                  ) : null}
                  <span className="truncate font-semibold">
                    {e.service?.name ?? serviceNoun}
                    {e.staff ? ` · with ${e.staff.displayName}` : ""}
                  </span>
                </span>
                <span className="truncate text-[12.5px] text-muted-foreground">
                  {windowLine(e, "text-[12.5px]")}
                  {" · "}
                  {dayChips(e.preferences).join(", ")}
                  {" · "}
                  {TIME_OF_DAY_LABELS[e.preferences.timeOfDay].toLowerCase()}
                </span>
                {tab === "booked" && e.booking ? (
                  <span className={cn("text-[12.5px] font-semibold", MINT_TEXT)}>
                    For {dayDate(dayIn(e.booking.start))}
                  </span>
                ) : null}
              </button>
              {tab === "waiting" ? (
                <div className="flex items-center gap-2">
                  {narrowing && fits ? <FitsPill value={fits} /> : null}
                  <span className="flex-1" />
                  {e.customer?.phone ? (
                    <Button
                      asChild
                      variant="outline"
                      size="icon"
                      className="relative size-9 rounded-full after:absolute after:-inset-1"
                    >
                      <a href={`tel:${e.customer.phone}`} aria-label={`Call ${customerName(e)}`}>
                        <Phone className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  {bookButton(e, "relative h-9 px-4 after:absolute after:-inset-1")}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <div role="table" aria-label="Waitlist" className="min-w-[820px] text-sm">
          <div
            role="row"
            className={cn(
              "grid h-10 items-center gap-3 bg-secondary/50 px-4 text-xs font-bold text-muted-foreground",
              COLUMNS,
            )}
          >
            <span role="columnheader">Client</span>
            <span role="columnheader">Wants</span>
            <span role="columnheader">When</span>
            <span role="columnheader">
              {tab === "booked" ? "Booked" : tab === "removed" ? "Added" : "Waiting"}
            </span>
            <span role="columnheader" className="sr-only">
              Actions
            </span>
          </div>
          {entries.map((e) => (
            <div
              key={e.id}
              role="row"
              tabIndex={0}
              aria-label={ariaFor(e)}
              onClick={() => openEntry(e.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && ev.target === ev.currentTarget) openEntry(e.id);
              }}
              className={cn(
                "grid min-h-[66px] cursor-pointer items-center gap-3 border-t px-4 py-2.5 transition-colors duration-700 hover:bg-secondary/40",
                COLUMNS,
                tab === "removed" && "opacity-70",
                narrowing && "shadow-[inset_3px_0_0_0_var(--color-ring)]",
                highlight === e.id && "bg-primary-soft",
              )}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <WaitlistAvatar entry={e} />
                <span className="grid min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="max-w-full truncate text-[14.5px] font-bold">
                      {customerName(e)}
                    </span>
                    {e.priority === "high" && tab === "waiting" ? (
                      <TonePill tone="amber">High priority</TonePill>
                    ) : null}
                    {statusPill(e)}
                  </span>
                  <span className="truncate text-[12.5px] text-muted-foreground">
                    {displayPhone(e.customer?.phone) ?? e.customer?.email ?? ""}
                  </span>
                </span>
              </span>
              <span role="cell" className="grid min-w-0 gap-0.5">
                <span className="truncate text-sm font-bold">
                  {e.service?.name ?? serviceNoun}
                  {e.variant ? ` · ${e.variant.name}` : ""}
                </span>
                {wantsLine(e)}
              </span>
              <span role="cell" className="grid min-w-0 justify-items-start gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  {windowLine(e)}
                  {narrowing && fits ? <FitsPill value={fits} /> : null}
                </span>
                <PreferenceChips entry={e} />
              </span>
              <span role="cell" className="grid min-w-0">
                {tab === "booked" ? (
                  e.bookingId ? (
                    <button
                      type="button"
                      className="grid cursor-pointer text-left"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setOpenBookingId(e.bookingId!);
                      }}
                    >
                      <span className="text-[13.5px] font-semibold hover:underline">
                        Booked {shortDate(dayIn(e.updatedAt))}
                      </span>
                      {e.booking ? (
                        <span className={cn("text-xs font-semibold", MINT_TEXT)}>
                          For {dayDate(dayIn(e.booking.start))}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <span className="text-[13.5px] font-semibold">
                      Booked {shortDate(dayIn(e.updatedAt))}
                    </span>
                  )
                ) : (
                  <>
                    <span className="text-[13.5px] font-semibold">
                      {tab === "removed"
                        ? shortDate(dayIn(e.createdAt))
                        : waitingSince(e.createdAt)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {sourceLine(e, myUserId)}
                    </span>
                  </>
                )}
              </span>
              <span role="cell" className="flex items-center justify-end gap-1">
                {bookButton(e)}
                {menu(e)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const fitsFooter =
    narrowing && fits && counts && entries.length > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-[13px] text-muted-foreground">
        <span>
          {total} of {counts.waiting} fit {fitsLabel(fits)} · high priority first
        </span>
        <Button variant="ghost" size="sm" onClick={clearNarrowing}>
          Show everyone waiting
        </Button>
      </div>
    ) : null;

  const pager =
    total > pageSize ? (
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
        <span>
          {(page - 1) * pageSize + 1} to {Math.min(total, page * pageSize)} of {total}
        </span>
        <span className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setSearch({ page: page - 1 > 1 ? page - 1 : undefined })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={() => setSearch({ page: page + 1 })}
          >
            Next
          </Button>
        </span>
      </div>
    ) : null;

  const listCard = (
    <div className={cn("overflow-hidden rounded-2xl", phone ? "bg-secondary/30" : "surface-card")}>
      {body}
      {fitsFooter}
      {pager}
    </div>
  );

  const emptyCard = (
    <div className="grid justify-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center">
      <span className="flex size-[52px] items-center justify-center rounded-2xl bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]">
        <Hourglass className="size-6" />
      </span>
      <h2 className="text-lg font-extrabold">Nobody&rsquo;s waiting</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        When the diary&rsquo;s full, add the client here instead of turning them away. Clients can
        also join from your booking page. When a cancellation frees time, we&rsquo;ll show you who
        could take it.
      </p>
      {canAct ? (
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add to waitlist
        </Button>
      ) : null}
      <WaitlistPageSetting variant="inline" className="mt-2 w-full max-w-md" />
    </div>
  );

  const subtitle = phone
    ? `${figures.data?.waiting ?? counts?.waiting ?? 0} waiting${
        figures.data?.fitThisWeek != null ? ` · ${figures.data.fitThisWeek} fit this week` : ""
      }`
    : `Clients who wanted a ${bookingNoun} but couldn't get a slot. When a cancellation frees time, book them in from here.`;

  const headerActions = phone ? (
    <span className="flex items-center gap-2">
      {nothingEver ? null : (
        <Button
          size="icon"
          variant="outline"
          className="size-[42px] rounded-full"
          onClick={() => setFiltersOpen(true)}
          aria-label="Search and filters"
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      )}
      {canAct ? (
        <Button
          size="icon"
          className="size-[42px] rounded-full bg-ring text-[#10172a] hover:bg-ring/90"
          onClick={() => setAdding(true)}
          aria-label="Add to waitlist"
        >
          <Plus className="size-5" />
        </Button>
      ) : null}
    </span>
  ) : canAct ? (
    <Button onClick={() => setAdding(true)}>
      <Plus className="size-4" /> Add to waitlist
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title="Waitlist" description={subtitle} actions={headerActions} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {banner}
        {nothingEver ? (
          emptyCard
        ) : phone ? (
          <>
            {tabs}
            {narrowChip || fits ? (
              <div className="flex flex-wrap gap-2">
                {narrowChip}
                {fits ? (
                  <RemovableChip label={`Fits ${fitsLabel(fits)}`} onClear={clearNarrowing} mint />
                ) : null}
              </div>
            ) : null}
            {listCard}
          </>
        ) : (
          <>
            {figureTiles}
            {filtersRow}
            {listCard}
          </>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-3xl p-0">
          <SheetHeader className="px-5 pt-6 pb-3 text-left">
            <SheetTitle className="text-xl font-extrabold">Search and filters</SheetTitle>
            <SheetDescription className="sr-only">Narrow the waitlist</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-5 pb-6">
            {searchBox("w-full")}
            <div className="flex flex-wrap gap-2">
              {serviceFilter}
              {locationFilter}
              {fitsControl}
            </div>
            <Button className="h-12" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <WaitlistEntryPanel
        entryId={search.entry ?? null}
        initial={entryInList}
        todayIso={todayIso}
        vehicleOf={vehicleOf}
        canAct={canAct}
        onClose={() => openEntry(undefined)}
        onEdit={(e) => setEditing(e)}
        onBook={(entry, time) => {
          openEntry(undefined);
          setBooking({ entry, time });
        }}
        onOpenBooking={(id) => setOpenBookingId(id)}
      />

      <AddWaitlistDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={(e) => setHighlight(e.id)}
        onOpenExisting={(e) => openEntry(e.id)}
      />
      <AddWaitlistDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        entry={editing}
      />

      <AddBookingModal
        key={booking ? `${booking.entry.id}:${booking.time?.start ?? ""}` : "none"}
        open={booking !== null}
        onOpenChange={(open) => {
          if (!open) setBooking(null);
        }}
        defaultCustomerId={booking?.entry.customerId}
        defaultServiceId={booking?.entry.serviceId}
        defaultLinkedRecordId={booking?.entry.linkedRecordId ?? undefined}
        defaultStaffId={booking?.time?.staff?.id ?? booking?.entry.staffId ?? undefined}
        defaultDate={
          booking
            ? booking.time
              ? isoDateInTz(booking.time.start, booking.time.timezone)
              : suggestedBookingDate(booking.entry.preferences, todayIso)
            : undefined
        }
        defaultStart={booking?.time?.start}
        waitlistEntryId={booking?.entry.id}
      />

      <BookingPanel bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
    </>
  );
}

function EmptyInCard({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
      <p className="text-[15px] font-bold">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function RemovableChip({
  label,
  onClear,
  mint = false,
}: {
  label: string;
  onClear: () => void;
  mint?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[34px] items-center gap-1 rounded-full pr-1 pl-3 text-[13px] font-bold",
        mint
          ? "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.14)] dark:text-[#9fe3bf]"
          : "bg-secondary text-foreground",
      )}
    >
      {label}
      <button
        type="button"
        className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={`Clear ${label}`}
        onClick={onClear}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
  active,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  active: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-[34px] gap-1.5 font-semibold", active && "border-foreground/40")}
        >
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value || "all"} value={o.value}>
              <span className="truncate">{o.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
