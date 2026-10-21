import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, GripVertical, MapPin, Navigation, Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { CardsGhost } from "@/components/ghost";
import { HoursEditorDrawer } from "@/components/locations/HoursEditorDrawer";
import {
  ArchiveLocationDialog,
  DeleteLocationDialog,
  PlanLimitDialog,
} from "@/components/locations/LocationDialogs";
import { LocationFormDrawer } from "@/components/locations/LocationFormDrawer";
import { LocationPanel, teamAt, WeekHours } from "@/components/locations/LocationPanel";
import {
  HiddenPill,
  PinTile,
  TeamAvatars,
  TodayPill,
  TypeChip,
} from "@/components/locations/parts";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useLocationActivity,
  useLocationsList,
  usePlans,
  useReorderLocations,
  useResources,
  useServices,
  useStaffList,
  useSubscription,
  useUpdateLocation,
} from "@/lib/api/hooks";
import type { LocationActivity } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import type { Location } from "@/lib/api/types";
import type { OpeningHour, PlanSeat } from "@/lib/locations";
import {
  directionsUrl,
  kindOf,
  KIND_LABEL,
  planLine,
  planSeat,
  plural,
  resourceWords,
  sortLocations,
  timezoneLabel,
  todayState,
  weekBounds,
  whereText,
} from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  location: z.string().min(1).optional(),
  tab: z.enum(["active", "archived"]).optional(),
});

export const Route = createFileRoute("/locations")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Locations — RECAVO" },
      { name: "description", content: "Where you work and when you're open." },
      { property: "og:title", content: "RECAVO Locations" },
      { property: "og:description", content: "Where you work and when you're open." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <LocationsPage />
      </AppShell>
    </RequireAuth>
  ),
});

function archivedLabel(iso: string | null | undefined): string {
  if (!iso) return "Archived";
  return `Archived ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso))}`;
}

function LocationsPage() {
  const tenant = useTenant();
  const navigate = useNavigate({ from: "/locations" });
  const search = Route.useSearch();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const industry = tenant.business?.industryTemplateKey;
  const noun = tenant.terminology.booking.toLowerCase();

  const list = useLocationsList();
  const week = useMemo(() => weekBounds(), []);
  const activityQuery = useLocationActivity(week);
  const staffQuery = useStaffList();
  const servicesQuery = useServices();
  const resourcesQuery = useResources();
  const subscription = useSubscription();
  const plans = usePlans();
  const updateLocation = useUpdateLocation();
  const reorder = useReorderLocations();

  const all = useMemo(() => sortLocations(list.data ?? []), [list.data]);
  const active = all.filter((l) => l.active);
  const archived = all.filter((l) => !l.active);
  const activityById = useMemo(
    () => new Map((activityQuery.data ?? []).map((a) => [a.locationId, a])),
    [activityQuery.data],
  );
  const staff = staffQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];
  const seat = planSeat(subscription.data?.plan, plans.data ?? [], active.length);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [hoursFor, setHoursFor] = useState<Location | null>(null);
  const [archiving, setArchiving] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const tab = search.tab === "archived" && archived.length > 0 ? "archived" : "active";
  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const panelLocation = search.location
    ? (all.find((l) => l.id === search.location) ?? null)
    : null;
  const outsideScope = Boolean(search.location) && list.isSuccess && panelLocation === null;

  const openAdd = () => {
    if (seat.atLimit) {
      setLimitOpen(true);
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (l: Location) => {
    setEditing(l);
    setFormOpen(true);
  };
  const viewCalendar = (l: Location) => {
    tenant.setCurrentLocationId(l.id);
    void navigate({ to: "/calendar" });
  };
  const viewBookings = (l: Location) => {
    tenant.setCurrentLocationId(l.id);
    void navigate({ to: "/bookings", search: {} });
  };
  const restore = async (l: Location) => {
    if (seat.atLimit) {
      setLimitOpen(true);
      return;
    }
    try {
      await updateLocation.mutateAsync({
        locationId: l.id,
        version: l.version,
        body: { active: true },
      });
      toast.success(`${l.name} restored`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_LIMIT_EXCEEDED") setLimitOpen(true);
      else toast.error(err instanceof ApiError ? err.detail || err.title : "Couldn't restore.");
    }
  };
  const saveHours = async (l: Location, hours: OpeningHour[]) => {
    try {
      await updateLocation.mutateAsync({
        locationId: l.id,
        version: l.version,
        body: { openingHours: hours },
      });
      toast.success("Opening hours saved");
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        throw new Error("Someone else just saved this location. Close and try again.");
      }
      throw new Error(
        err instanceof ApiError ? err.detail || err.title : "Couldn't save the hours.",
      );
    }
  };

  const ordered = dragOrder
    ? dragOrder.map((id) => active.find((l) => l.id === id)!).filter(Boolean)
    : active;
  const shown = tab === "archived" ? archived : ordered;
  const single = active.length === 1 && archived.length === 0;

  const header = (
    <PageHeader
      title={single ? "Your location" : "Locations"}
      description="Where you work and when you're open."
      actions={
        single || all.length === 0 ? null : (
          <div className="flex items-center gap-3">
            {seat.allowed !== null ? (
              <span
                className={cn(
                  "text-[13px] max-sm:hidden",
                  seat.atLimit
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                )}
              >
                {planLine(seat)}
              </span>
            ) : null}
            {canEdit ? (
              <Button onClick={openAdd} aria-label="Add location">
                <Plus className="size-4" /> <span className="max-sm:hidden">Add location</span>
              </Button>
            ) : null}
          </div>
        )
      }
    />
  );

  let body: React.ReactNode;
  if (list.isLoading) {
    body = <CardsGhost count={2} className="h-[88px]" />;
  } else if (list.isError) {
    body = (
      <div role="alert" className="grid justify-items-start gap-2 rounded-2xl border p-5">
        <p className="font-extrabold">Couldn't load your locations</p>
        <p className="text-sm text-muted-foreground">
          {list.error instanceof ApiError
            ? list.error.detail || list.error.title
            : "Check your connection."}
        </p>
        <Button variant="outline" onClick={() => void list.refetch()}>
          <RotateCw className="size-4" /> Try again
        </Button>
      </div>
    );
  } else if (all.length === 0) {
    body = (
      <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
        <PinTile kind="premises" />
        <p className="text-lg font-extrabold">Add where you work</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Clients need a location to book online.{" "}
          {industry === "car_detailing"
            ? "Add your unit, or the area you cover."
            : industry === "personal_training"
              ? "Add your studio, gym, or the area you cover."
              : "Add your unit, studio or the area you cover."}
        </p>
        {canEdit ? (
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add location
          </Button>
        ) : null}
      </div>
    );
  } else if (single) {
    body = (
      <OneLocation
        location={active[0]!}
        activity={activityById.get(active[0]!.id)}
        seat={seat}
        canEdit={canEdit}
        resourcesCount={resources.filter((r) => r.locationId === active[0]!.id && r.active).length}
        resourceNames={resources
          .filter((r) => r.locationId === active[0]!.id && r.active)
          .map((r) => r.name)}
        onOpen={() => setSearch({ location: active[0]!.id })}
        onEdit={openEdit}
        onEditHours={setHoursFor}
        onAdd={openAdd}
        onSeePlans={() => void navigate({ to: "/billing" })}
        onToggleOnline={async (l, on) => {
          if (on && kindOf(l) === "premises" && !l.address) {
            toast.message("Add an address so clients know where to go.");
            openEdit(l);
            return;
          }
          try {
            await updateLocation.mutateAsync({
              locationId: l.id,
              version: l.version,
              body: { publicVisible: on },
            });
            toast.success(on ? "Clients can book here online" : "Staff bookings only");
          } catch (err) {
            toast.error(err instanceof ApiError ? err.detail || err.title : "Couldn't save.");
          }
        }}
      />
    );
  } else {
    body = (
      <>
        <div role="tablist" aria-label="Locations" className="flex gap-2">
          {(
            [
              ["active", `Active ${active.length}`],
              ...(archived.length > 0
                ? [["archived", `Archived ${archived.length}`] as const]
                : []),
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setSearch({ tab: value === "active" ? undefined : value })}
              className={cn(
                "inline-flex h-[34px] cursor-pointer items-center rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors max-sm:h-11",
                tab === value
                  ? "bg-primary font-extrabold text-primary-foreground"
                  : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="grid gap-2.5" role="tabpanel">
          {shown.map((l) => (
            <LocationCard
              key={l.id}
              location={l}
              activity={activityById.get(l.id)}
              teamNames={(() => {
                const t = teamAt(staff, l.id);
                return [...t.here, ...t.anywhere].map((s) => s.displayName);
              })()}
              noun={noun}
              draggable={canEdit && tab === "active" && active.length > 1}
              dragging={dragId === l.id}
              onDragStart={() => {
                setDragId(l.id);
                setDragOrder(active.map((x) => x.id));
              }}
              onDragEnter={() => {
                if (!dragId || dragId === l.id) return;
                setDragOrder((order) => {
                  const base = order ?? active.map((x) => x.id);
                  const without = base.filter((id) => id !== dragId);
                  const at = without.indexOf(l.id);
                  const from = base.indexOf(dragId);
                  const to = base.indexOf(l.id);
                  without.splice(from < to ? at + 1 : at, 0, dragId);
                  return without;
                });
              }}
              onDragEnd={() => {
                const next = dragOrder;
                setDragId(null);
                setDragOrder(null);
                if (next && next.join() !== active.map((x) => x.id).join()) reorder.mutate(next);
              }}
              onOpen={() => setSearch({ location: l.id })}
              onRestore={canEdit ? () => void restore(l) : undefined}
            />
          ))}
        </ul>
        {tab === "active" ? (
          <p className="text-[13px] text-muted-foreground">
            <strong className="text-foreground">On the booking page</strong> means clients can pick
            it when booking online. Staff can still book anywhere that's open.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4">{body}</div>

      <LocationPanel
        open={Boolean(search.location)}
        location={panelLocation}
        outsideScope={outsideScope}
        activity={panelLocation ? activityById.get(panelLocation.id) : undefined}
        staff={staff}
        services={services}
        resources={resources}
        canEdit={canEdit}
        onClose={() => setSearch({ location: undefined })}
        onEdit={openEdit}
        onEditHours={setHoursFor}
        onArchive={setArchiving}
        onRestore={(l) => void restore(l)}
        onDelete={setDeleting}
        onViewCalendar={viewCalendar}
        onAllBookings={viewBookings}
      />

      <LocationFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        location={editing}
        everBooked={editing ? (activityById.get(editing.id)?.everBooked ?? false) : false}
        planNote={
          !editing && seat.allowed !== null
            ? `This will be location ${active.length + 1} of ${seat.allowed} on your ${seat.planName} plan.`
            : null
        }
        onSaved={(l, created) => {
          if (created) setSearch({ location: l.id, tab: undefined });
        }}
        onPlanLimit={() => setLimitOpen(true)}
      />

      {hoursFor ? (
        <HoursEditorDrawer
          open
          onOpenChange={(o) => (o ? undefined : setHoursFor(null))}
          locationName={hoursFor.name}
          zoneLabel={timezoneLabel(hoursFor.timezone)}
          hours={hoursFor.openingHours}
          onSave={(hours) => saveHours(hoursFor, hours)}
        />
      ) : null}

      {archiving ? (
        <ArchiveLocationDialog
          location={archiving}
          activity={activityById.get(archiving.id)}
          locations={all}
          staff={staff}
          services={services}
          onOpenChange={(o) => (o ? undefined : setArchiving(null))}
          onArchived={() => setSearch({ location: undefined })}
          onSortFirst={viewBookings}
        />
      ) : null}

      <DeleteLocationDialog
        location={deleting}
        onOpenChange={(o) => (o ? undefined : setDeleting(null))}
        onDeleted={() => setSearch({ location: undefined })}
      />

      <PlanLimitDialog
        open={limitOpen}
        onOpenChange={setLimitOpen}
        seat={seat}
        onArchiveOne={() => setSearch({ tab: undefined, location: undefined })}
        onSeePlans={() => void navigate({ to: "/billing" })}
      />
    </>
  );
}

function LocationCard({
  location: l,
  activity,
  teamNames,
  noun,
  draggable,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onOpen,
  onRestore,
}: {
  location: Location;
  activity: LocationActivity | undefined;
  teamNames: string[];
  noun: string;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onRestore?: () => void;
}) {
  const kind = kindOf(l);
  const today = todayState(l);
  const weekCount = activity?.weekBookings ?? 0;
  const where = whereText(l);
  const label = [
    l.name,
    KIND_LABEL[kind].toLowerCase(),
    where,
    l.active ? `${today.pill.toLowerCase()}, ${today.line}` : archivedLabel(l.archivedAt),
    `${plural(weekCount, noun)} this week`,
    plural(teamNames.length, "staff", "staff"),
  ].join(", ");

  return (
    <li
      onDragEnter={draggable ? onDragEnter : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      className={cn(
        "group relative rounded-2xl border bg-card transition-shadow",
        !l.active && "opacity-70",
        dragging && "opacity-50 ring-2 ring-primary",
      )}
    >
      {draggable ? (
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-hidden
          className="absolute top-1/2 -left-1 hidden -translate-y-1/2 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block"
        >
          <GripVertical className="size-4" />
        </span>
      ) : null}
      <div className="flex items-center gap-4 px-[18px] py-4 max-sm:flex-wrap max-sm:gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={label}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left"
        >
          <PinTile kind={kind} />
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[17px] font-extrabold">{l.name}</span>
              <TypeChip kind={kind} />
              {!l.publicVisible ? <HiddenPill /> : null}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">{where}</span>
            <span className="flex flex-wrap items-center gap-2 sm:hidden">
              {l.active ? <TodayPill state={today} /> : null}
              <span className="text-xs text-muted-foreground">
                {plural(weekCount, noun)} this week
              </span>
            </span>
          </span>
          <span className="hidden w-[170px] shrink-0 gap-1 sm:grid">
            {l.active ? (
              <>
                <TodayPill state={today} />
                <span className="truncate text-xs text-muted-foreground">{today.line}</span>
              </>
            ) : (
              <span className="text-[13px] text-muted-foreground">
                {archivedLabel(l.archivedAt)}
              </span>
            )}
          </span>
          <span className="hidden w-[120px] shrink-0 gap-0.5 sm:grid">
            <span className="text-[17px] font-extrabold tabular-nums">{weekCount}</span>
            <span className="text-xs text-muted-foreground">{noun}s this week</span>
          </span>
          <span className="hidden w-[130px] shrink-0 items-center gap-2 md:flex">
            <TeamAvatars names={teamNames} />
            <span className="text-xs text-muted-foreground">
              {plural(teamNames.length, "staff", "staff")}
            </span>
          </span>
          {l.active || !onRestore ? (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
        </button>
        {!l.active && onRestore ? (
          <Button variant="outline" size="sm" onClick={onRestore}>
            Restore
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function OneLocation({
  location: l,
  activity,
  seat,
  canEdit,
  resourceNames,
  onOpen,
  onEdit,
  onEditHours,
  onAdd,
  onSeePlans,
  onToggleOnline,
}: {
  location: Location;
  activity: LocationActivity | undefined;
  seat: PlanSeat;
  canEdit: boolean;
  resourcesCount: number;
  resourceNames: string[];
  onOpen: () => void;
  onEdit: (l: Location) => void;
  onEditHours: (l: Location) => void;
  onAdd: () => void;
  onSeePlans: () => void;
  onToggleOnline: (l: Location, on: boolean) => Promise<void>;
}) {
  const tenant = useTenant();
  const kind = kindOf(l);
  const today = todayState(l);
  const words = resourceWords(tenant.business?.industryTemplateKey);
  const noun = tenant.terminology.booking.toLowerCase();
  const nextPlan = seat.next;
  const planText =
    seat.allowed === null
      ? null
      : `Your ${seat.planName} plan includes ${plural(seat.allowed, "location")}.${
          nextPlan ? ` ${nextPlan.name} includes ${nextPlan.limits["locations.active"]}.` : ""
        }`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-4">
        <section className="grid gap-4 rounded-[18px] border bg-card p-5">
          <div className="flex items-start gap-4">
            <PinTile kind={kind} size={56} />
            <div className="grid min-w-0 flex-1 gap-1">
              <h2 className="truncate text-[22px] font-extrabold">{l.name}</h2>
              <p className="text-sm text-muted-foreground">{whereText(l)}</p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <TypeChip kind={kind} />
                <TodayPill state={today} />
                <span className="text-xs text-muted-foreground">
                  {plural(activity?.weekBookings ?? 0, noun)} this week
                </span>
              </div>
            </div>
            {canEdit ? (
              <Button variant="outline" onClick={() => onEdit(l)}>
                Edit
              </Button>
            ) : null}
          </div>
          {kind === "premises" ? (
            <div className="grid gap-2 rounded-xl bg-secondary/60 px-3.5 py-3 text-sm">
              <p>
                <span className="font-bold">Parking and how to find you: </span>
                <span className="text-muted-foreground">
                  {l.parkingNote ||
                    (canEdit ? "Add a note so clients find you first time." : "No notes.")}
                </span>
              </p>
              {l.address ? (
                <a
                  href={directionsUrl(l.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                >
                  <Navigation className="size-3.5" aria-hidden /> Directions
                  <ChevronRight className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="grid gap-0.5">
              <span id="one-online" className="text-sm font-semibold">
                Clients can book here online
              </span>
              <span className="text-xs text-muted-foreground">
                {l.publicVisible
                  ? "Your booking page offers times at this location."
                  : "Off keeps it for staff bookings only."}
              </span>
            </div>
            <Switch
              aria-labelledby="one-online"
              checked={l.publicVisible}
              disabled={!canEdit}
              onCheckedChange={(on) => void onToggleOnline(l, on)}
            />
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex cursor-pointer items-center justify-self-start text-[13px] font-semibold text-primary hover:underline"
          >
            Team, {tenant.terminology.service.toLowerCase()}s and upcoming {noun}s
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="grid content-start gap-3 rounded-[18px] border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">Opening hours</h3>
              {canEdit ? (
                <Button variant="ghost" size="sm" onClick={() => onEditHours(l)}>
                  Edit
                </Button>
              ) : null}
            </div>
            <WeekHours location={l} />
          </section>
          <section className="grid content-start gap-3 rounded-[18px] border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">{words.many}</h3>
              {canEdit ? (
                <Button variant="ghost" size="sm" onClick={onOpen}>
                  <Plus className="size-3.5" /> Add
                </Button>
              ) : null}
            </div>
            {resourceNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {resourceNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold"
                  >
                    {n}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None yet.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Only one {noun} can use a {words.one} at a time.
            </p>
          </section>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <section className="grid gap-1 rounded-[18px] border bg-card p-5">
          <h3 className="text-[15px] font-extrabold">Time zone</h3>
          <p className="text-sm">{timezoneLabel(l.timezone)}</p>
          <p className="text-xs text-muted-foreground">{l.timezone}</p>
        </section>
        <section className="grid gap-2 rounded-[18px] border border-dashed p-5">
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            Work from more than one place?
          </h3>
          <p className="text-sm text-muted-foreground">
            Add another location to give it its own address, hours and team. Clients pick where to
            book.
          </p>
          {planText ? <p className="text-xs text-muted-foreground">{planText}</p> : null}
          {canEdit ? (
            seat.atLimit ? (
              nextPlan ? (
                <Button variant="outline" className="justify-self-start" onClick={onSeePlans}>
                  See plans
                </Button>
              ) : null
            ) : (
              <Button variant="outline" className="justify-self-start" onClick={onAdd}>
                <Plus className="size-4" /> Add location
              </Button>
            )
          ) : null}
        </section>
      </aside>
    </div>
  );
}
