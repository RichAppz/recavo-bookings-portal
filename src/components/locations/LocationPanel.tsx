import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronRight,
  MoreHorizontal,
  Navigation,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ClosuresSection } from "@/components/locations/ClosuresSection";
import {
  HiddenPill,
  PinTile,
  SectionHeading,
  TodayPill,
  TypeChip,
} from "@/components/locations/parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import {
  bookingsQueryOptions,
  useBusinessId,
  useCreateResource,
  useCustomersById,
  useUpdateResource,
} from "@/lib/api/hooks";
import type { LocationActivity } from "@/lib/api/hooks";
import type { CatalogueService, Location, Resource, Staff } from "@/lib/api/types";
import { customerDisplayName } from "@/lib/api/types";
import type { LocationClosure } from "@/lib/closures";
import { todayWithClosures } from "@/lib/closures";
import {
  DAY_LONG,
  directionsUrl,
  kindOf,
  plural,
  rangesOn,
  rangesText,
  resourceWords,
  timezoneLabel,
  wallClock,
  whereText,
} from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const UPCOMING_STATUSES = new Set(["held", "awaiting_payment", "confirmed"]);

/** Who works here: staff tied to this location, and those who work anywhere. */
export function teamAt(staff: Staff[], locationId: string) {
  const live = staff.filter((s) => s.status !== "suspended");
  return {
    here: live.filter((s) => s.locationIds.includes(locationId)),
    anywhere: live.filter((s) => s.locationIds.length === 0),
  };
}

export function servicesAt(services: CatalogueService[], locationId: string) {
  const live = services.filter((s) => !s.archivedAt);
  return {
    here: live.filter((s) => s.locationIds.length === 0 || s.locationIds.includes(locationId)),
    total: live.length,
  };
}

/**
 * One location: today, this week, the calendar link, hours, team, services,
 * resources, upcoming bookings and how to find it. Right drawer on desktop, full
 * screen on phone. `?location=<id>` keeps it open.
 */
export function LocationPanel({
  open,
  location,
  outsideScope,
  activity,
  staff,
  services,
  resources,
  closures,
  canEdit,
  onClose,
  onEdit,
  onEditHours,
  onArchive,
  onRestore,
  onDelete,
  onViewCalendar,
  onAllBookings,
}: {
  open: boolean;
  location: Location | null;
  /** The link points at a location this member can't see. */
  outsideScope: boolean;
  activity: LocationActivity | undefined;
  staff: Staff[];
  services: CatalogueService[];
  resources: Resource[];
  closures: readonly LocationClosure[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: (l: Location) => void;
  onEditHours: (l: Location) => void;
  onArchive: (l: Location) => void;
  onRestore: (l: Location) => void;
  onDelete: (l: Location) => void;
  onViewCalendar: (l: Location) => void;
  onAllBookings: (l: Location) => void;
}) {
  const phone = useIsPhone();
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-0 h-full" : "sm:max-w-[480px]",
        )}
      >
        {location ? (
          <PanelBody
            key={location.id}
            location={location}
            activity={activity}
            staff={staff}
            services={services}
            resources={resources}
            closures={closures}
            canEdit={canEdit}
            onEdit={onEdit}
            onEditHours={onEditHours}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
            onViewCalendar={onViewCalendar}
            onAllBookings={onAllBookings}
          />
        ) : outsideScope ? (
          <SheetHeader className="px-6 pt-6 pb-4 text-left">
            <SheetTitle>Location</SheetTitle>
            <SheetDescription>This location isn't one of yours.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 text-left">
              <SheetTitle>
                <Skeleton className="h-6 w-40" />
              </SheetTitle>
              <SheetDescription className="sr-only">Loading the location</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-6">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  location: l,
  activity,
  staff,
  services,
  resources,
  closures,
  canEdit,
  onEdit,
  onEditHours,
  onArchive,
  onRestore,
  onDelete,
  onViewCalendar,
  onAllBookings,
}: {
  location: Location;
  activity: LocationActivity | undefined;
  staff: Staff[];
  services: CatalogueService[];
  resources: Resource[];
  closures: readonly LocationClosure[];
  canEdit: boolean;
  onEdit: (l: Location) => void;
  onEditHours: (l: Location) => void;
  onArchive: (l: Location) => void;
  onRestore: (l: Location) => void;
  onDelete: (l: Location) => void;
  onViewCalendar: (l: Location) => void;
  onAllBookings: (l: Location) => void;
}) {
  const tenant = useTenant();
  const kind = kindOf(l);
  const today = todayWithClosures(l, closures);
  const noun = tenant.terminology.booking.toLowerCase();
  const team = teamAt(staff, l.id);
  const offered = servicesAt(services, l.id);
  const everBooked = activity?.everBooked ?? false;

  return (
    <>
      <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
        <div className="flex items-center gap-3 pr-8">
          <PinTile kind={kind} />
          <div className="grid min-w-0 gap-0.5">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
              <span className="truncate">{l.name}</span>
            </SheetTitle>
            <SheetDescription className="text-[13px]">{whereText(l)}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <TypeChip kind={kind} />
          {l.active ? <TodayPill state={today} /> : null}
          {!l.publicVisible ? <HiddenPill /> : null}
        </div>
      </SheetHeader>

      <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
        <section aria-label="Facts" className="grid grid-cols-3 gap-2">
          <Fact label="Today" value={l.active ? today.pill : "Archived"} />
          <Fact
            label="This week"
            value={activity ? plural(activity.weekBookings, noun) : `0 ${noun}s`}
          />
          <Fact
            label="Team"
            value={plural(team.here.length + team.anywhere.length, "staff", "staff")}
          />
        </section>

        {l.active ? (
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => onViewCalendar(l)}
          >
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden /> View this location's calendar
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : null}

        <section className="grid gap-2">
          <SectionHeading
            action={
              canEdit ? (
                <Button variant="ghost" size="sm" onClick={() => onEditHours(l)}>
                  Edit
                </Button>
              ) : null
            }
          >
            Opening hours
          </SectionHeading>
          <WeekHours location={l} />
          <p className="text-xs text-muted-foreground">
            {timezoneLabel(l.timezone)} ({l.timezone})
          </p>
        </section>

        {l.active ? <ClosuresSection location={l} closures={closures} canEdit={canEdit} /> : null}

        {kind === "premises" && l.address ? (
          <section className="grid gap-2 rounded-xl bg-secondary/60 px-3.5 py-3 text-sm">
            <p>
              <span className="font-bold">Parking and how to find you: </span>
              <span className="text-muted-foreground">{l.parkingNote || "Nothing added yet."}</span>
            </p>
            <a
              href={directionsUrl(l.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
            >
              <Navigation className="size-3.5" aria-hidden /> Directions
            </a>
          </section>
        ) : null}

        <section className="grid gap-2">
          <SectionHeading
            action={
              <Link
                to="/staff"
                className="inline-flex items-center text-[13px] font-semibold text-primary hover:underline"
              >
                Manage <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            Team here
          </SectionHeading>
          {team.here.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {team.here.map((s) => (
                <span
                  key={s.id}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold"
                >
                  {s.displayName}
                </span>
              ))}
            </div>
          ) : null}
          {team.anywhere.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Also here: {plural(team.anywhere.length, "person", "people")} who{" "}
              {team.anywhere.length === 1 ? "works" : "work"} anywhere (
              {team.anywhere.map((s) => s.displayName).join(", ")})
            </p>
          ) : null}
          {team.here.length + team.anywhere.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody works here yet.</p>
          ) : null}
        </section>

        <section className="grid gap-2">
          <SectionHeading
            action={
              <Link
                to="/services"
                className="inline-flex items-center text-[13px] font-semibold text-primary hover:underline"
              >
                Edit in {tenant.terminology.service}s{" "}
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            {tenant.terminology.service}s offered here
          </SectionHeading>
          <p className="text-sm text-muted-foreground">
            {offered.here.length === 0
              ? `No ${tenant.terminology.service.toLowerCase()}s yet.`
              : `${offered.here
                  .slice(0, 4)
                  .map((s) => s.name)
                  .join(
                    ", ",
                  )}${offered.here.length > 4 ? ", …" : ""} · ${offered.here.length} of ${plural(offered.total, tenant.terminology.service.toLowerCase())}`}
          </p>
        </section>

        <ResourcesSection location={l} resources={resources} canEdit={canEdit} />

        {l.active ? <Upcoming location={l} onAll={() => onAllBookings(l)} /> : null}
      </div>

      {canEdit ? (
        <footer className="flex items-center gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!everBooked ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 shrink-0"
                  aria-label={`More actions for ${l.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => onDelete(l)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {l.active ? (
            <Button variant="ghost" className="h-10" onClick={() => onArchive(l)}>
              <Archive className="size-4" /> Archive
            </Button>
          ) : (
            <Button variant="ghost" className="h-10" onClick={() => onRestore(l)}>
              <ArchiveRestore className="size-4" /> Restore
            </Button>
          )}
          <Button className="ml-auto h-10 flex-1 sm:flex-none" onClick={() => onEdit(l)}>
            Edit location
          </Button>
        </footer>
      ) : null}
    </>
  );
}

/** A row per day: today in bold, closed days muted. */
export function WeekHours({ location }: { location: Location }) {
  const { weekday } = wallClock(new Date(), location.timezone);
  if (location.openingHours.length === 0) {
    return (
      <p className="rounded-xl bg-secondary/60 px-3.5 py-3 text-sm text-muted-foreground">
        Open when the team works. Clients can book whenever someone on the team is working here.
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border text-sm">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const text = rangesText(rangesOn(location.openingHours, d));
        const isToday = d === weekday;
        return (
          <li
            key={d}
            className={cn(
              "flex items-center justify-between gap-3 px-3.5 py-2",
              !text && "text-muted-foreground",
            )}
          >
            <span className={cn(isToday && "font-extrabold")}>
              {DAY_LONG[d]}
              {isToday ? " · today" : ""}
            </span>
            <span className={cn("tabular-nums", isToday && "font-extrabold")}>
              {text || "Closed"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResourcesSection({
  location,
  resources,
  canEdit,
}: {
  location: Location;
  resources: Resource[];
  canEdit: boolean;
}) {
  const tenant = useTenant();
  const words = resourceWords(tenant.business?.industryTemplateKey);
  const create = useCreateResource();
  const update = useUpdateResource();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const here = resources.filter((r) => r.locationId === location.id && r.active);
  if (here.length === 0 && !canEdit) return null;

  const add = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      type: words.one === "bay" ? "bay" : "room",
      locationId: location.id,
    });
    toast.success(`${name.trim()} added`);
    setName("");
    setAdding(false);
  };

  return (
    <section className="grid gap-2">
      <SectionHeading
        action={
          canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-3.5" /> Add
            </Button>
          ) : null
        }
      >
        {words.many}
      </SectionHeading>
      {here.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {here.map((r) =>
            canEdit ? (
              <DropdownMenu key={r.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-2.5 text-xs font-semibold hover:bg-secondary/80"
                    aria-label={`${r.name} options`}
                  >
                    {r.name}
                    <MoreHorizontal aria-hidden className="size-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setRenaming({ id: r.id, name: r.name })}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void update
                        .mutateAsync({ resourceId: r.id, active: false })
                        .then(() => toast.success(`${r.name} archived`))
                        .catch(() => undefined)
                    }
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span
                key={r.id}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold"
              >
                {r.name}
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = renaming.name.trim();
            if (!next) return;
            void update
              .mutateAsync({ resourceId: renaming.id, name: next })
              .then(() => {
                toast.success("Changes saved");
                setRenaming(null);
              })
              .catch(() => undefined);
          }}
        >
          <Input
            autoFocus
            aria-label={`New ${words.one} name`}
            value={renaming.name}
            maxLength={60}
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
          />
          <Button type="submit" disabled={!renaming.name.trim() || update.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {adding ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            autoFocus
            aria-label={`${words.one} name`}
            placeholder={words.one === "bay" ? "Bay 1" : "Room 1"}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Add
          </Button>
        </form>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Only one {tenant.terminology.booking.toLowerCase()} can use a {words.one} at a time. Set
        which {tenant.terminology.service.replace(/\s+type$/i, "").toLowerCase()}s need one in{" "}
        <Link to="/services" className="font-semibold text-primary hover:underline">
          Services
        </Link>
        .
      </p>
    </section>
  );
}

function Upcoming({ location, onAll }: { location: Location; onAll: () => void }) {
  const businessId = useBusinessId();
  const range = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 365 * 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const query = useQuery({
    ...bookingsQueryOptions(businessId, location.id, { ...range, limit: 12 }),
    enabled: Boolean(businessId),
  });
  const next = (query.data?.bookings ?? [])
    .filter((b) => UPCOMING_STATUSES.has(b.status) && new Date(b.start) >= new Date(range.from))
    .slice(0, 3);
  const customers = useCustomersById(next.map((b) => b.leadCustomerId));
  const tenant = useTenant();
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: location.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(iso))
      .replace(",", "");

  return (
    <section className="grid gap-2">
      <SectionHeading
        action={
          <button
            type="button"
            onClick={onAll}
            className="inline-flex cursor-pointer items-center text-[13px] font-semibold text-primary hover:underline"
          >
            All <ChevronRight className="size-3.5" aria-hidden />
          </button>
        }
      >
        Upcoming
      </SectionHeading>
      {query.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : next.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing booked yet. New {tenant.terminology.booking.toLowerCase()}s show here.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {next.map((b) => {
            const c = customers.get(b.leadCustomerId);
            return (
              <li key={b.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="w-[120px] shrink-0 text-[13px] font-bold whitespace-nowrap">
                  {when(b.start)}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-semibold">
                    {c ? customerDisplayName(c) : "Client"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {b.serviceSnapshot.name}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-secondary/60 px-3 py-2.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="line-clamp-2 break-words text-[15px] font-extrabold leading-tight">
        {value}
      </span>
    </div>
  );
}
