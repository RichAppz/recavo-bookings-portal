import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, GripVertical, ListFilter, Plus, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { TableGhost } from "@/components/ghost";
import { addLabel, AddPersonDrawer } from "@/components/team/AddPersonDrawer";
import { BookablePill, StatusDot, TeamAvatar } from "@/components/team/parts";
import { PersonPanel } from "@/components/team/PersonPanel";
import { SoloAvailability } from "@/components/team/SoloAvailability";
import { panelActionsFor, TeamDialogsHost, useTeamDialogs } from "@/components/team/TeamDialogs";
import { copyInviteLink } from "@/components/team/AddPersonDrawer";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import {
  useBusinessId,
  useLocationsList,
  usePlans,
  useServices,
  useSubscription,
} from "@/lib/api/hooks";
import { ApiError, describeApiError } from "@/lib/api/errors";
import type { Location } from "@/lib/api/types";
import type { TeamInvitation, TeamPerson, TeamSignIn } from "@/lib/api/team";
import {
  fetchInvitationLink,
  useAdoptSignIn,
  useBookability,
  useCancelInvitation,
  useLinkSignIn,
  useReorderTeam,
  useResendInvitation,
  useRestorePerson,
  useTeam,
} from "@/lib/api/team";
import type { PlanSeat } from "@/lib/locations";
import { planSeat, plural } from "@/lib/locations";
import { PERMISSIONS, roleLabel, SYSTEM_ROLES } from "@/lib/permissions";
import { useSoloPlan } from "@/lib/sole";
import {
  bookableStatus,
  filterPeople,
  firstName,
  hoursText,
  isArchivedPerson,
  NO_SIGN_IN,
  nextFreeText,
  ROLE_ORDER,
  shortDate,
  signInLine,
} from "@/lib/team";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["active", "archived"]).optional(),
  q: z.string().optional(),
  location: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  person: z.string().min(1).optional(),
});

type TeamSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/team")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Team — RECAVO" },
      {
        name: "description",
        content: "Who works here, when clients can book them, and who can sign in.",
      },
      { property: "og:title", content: "RECAVO Team" },
      {
        property: "og:description",
        content: "Who works here, when clients can book them, and who can sign in.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <TeamPage />
      </AppShell>
    </RequireAuth>
  ),
});

const COLUMNS = "sm:grid-cols-[1.4fr_1.2fr_1.1fr_1fr_100px_20px]";
const ARCHIVED_COLUMNS = "sm:grid-cols-[1.4fr_1.2fr_1.1fr_1fr_100px_104px]";

function TeamPage() {
  const tenant = useTenant();
  const navigate = useNavigate({ from: "/team" });
  const search = Route.useSearch();
  const solo = useSoloPlan();
  const me = useAuth().user;
  const team = useTeam();
  const servicesQuery = useServices();
  const locationsQuery = useLocationsList();
  const subscription = useSubscription();
  const plans = usePlans();
  const reorder = useReorderTeam();
  const restorePerson = useRestorePerson();
  const dialogs = useTeamDialogs();

  const canManage = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const canInvite = tenant.can(PERMISSIONS.TEAM_INVITE);
  const canManagePermissions = tenant.can(PERMISSIONS.TEAM_MANAGE_PERMISSIONS);
  const canAdd = canManage || canInvite;
  const staffWord = tenant.terminology.staff;

  const people = useMemo(() => team.data?.people ?? [], [team.data]);
  const services = servicesQuery.data ?? [];
  const locations = useMemo(
    () => (locationsQuery.data ?? []).filter((l) => l.active),
    [locationsQuery.data],
  );
  const active = people.filter((p) => !isArchivedPerson(p));
  const archived = people.filter(isArchivedPerson);

  const seat: PlanSeat = useMemo(() => {
    const used = team.data?.seats.used ?? active.length;
    const base = planSeat(subscription.data?.plan, plans.data ?? [], used, "staff.active");
    const allowed = team.data ? team.data.seats.allowed : base.allowed;
    return { ...base, used, allowed, atLimit: allowed !== null && used >= allowed };
  }, [team.data, subscription.data, plans.data, active.length]);

  const [addOpen, setAddOpen] = useState(false);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setSearch = (next: Partial<TeamSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const openPerson = (id: string) => setSearch({ person: id });

  const tab = search.tab === "archived" && archived.length > 0 ? "archived" : "active";
  const q = search.q ?? "";
  const filters = { tab, q, location: search.location ?? null, role: search.role ?? null } as const;
  const filtered = filterPeople(people, filters);
  const filtering = Boolean(q.trim() || search.location || search.role);
  const shown =
    dragOrder && tab === "active"
      ? dragOrder.map((id) => filtered.find((p) => p.staff.id === id)!).filter(Boolean)
      : filtered;

  const panelPerson = search.person
    ? (people.find((p) => p.staff.id === search.person) ?? null)
    : null;
  const outsideScope = Boolean(search.person) && team.isSuccess && panelPerson === null;
  const suggestedFor = (staffId: string) =>
    team.data?.suggestedLinks.find((l) => l.staffId === staffId)?.membershipId ?? null;

  const restore = async (p: TeamPerson) => {
    const first = firstName(p.staff.displayName);
    if (seat.atLimit) {
      setAddOpen(true);
      return;
    }
    try {
      await restorePerson.mutateAsync(p.staff.id);
      toast.success(`${first} is back on the team`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_LIMIT_EXCEEDED") setAddOpen(true);
      else toast.error(describeApiError(err, `Couldn't bring ${first} back.`));
    }
  };

  const actions = panelActionsFor(dialogs, {
    onClose: () => setSearch({ person: undefined }),
    onRestore: (p) => void restore(p),
  });

  const dialogsHost = (
    <TeamDialogsHost
      dialogs={dialogs}
      people={people}
      services={services}
      locations={locations}
      onRemoved={() => setSearch({ person: undefined })}
    />
  );

  const panel = (
    <PersonPanel
      open={Boolean(search.person)}
      person={panelPerson}
      outsideScope={outsideScope}
      services={services}
      locations={locations}
      unlinkedSignIns={team.data?.unlinkedSignIns ?? []}
      suggestedMembershipId={panelPerson ? suggestedFor(panelPerson.staff.id) : null}
      canManage={canManage}
      canInvite={canInvite}
      canManagePermissions={canManagePermissions}
      isMe={Boolean(me && panelPerson?.signIn?.userId === me.id)}
      actions={actions}
    />
  );

  if (solo) {
    return (
      <>
        <SoloAvailability
          team={team.data}
          loading={team.isLoading}
          error={team.error}
          onRetry={() => void team.refetch()}
          services={services}
          locations={locations}
          seat={seat}
          canManage={canManage}
          dialogs={dialogs}
        />
        {dialogsHost}
      </>
    );
  }

  const seatLine =
    seat.allowed === null
      ? null
      : `${seat.used} of ${seat.allowed} seats${seat.atLimit ? "" : ` on ${seat.planName}`}`;

  const header = (
    <>
      <PageHeader
        title="Team"
        description="Who works here, when clients can book them, and who can sign in."
        actions={
          <div className="flex items-center gap-3">
            {seatLine ? (
              <span
                className={cn(
                  "text-[13px] max-sm:hidden",
                  seat.atLimit
                    ? "font-semibold text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                )}
              >
                {seatLine}
              </span>
            ) : null}
            {canManage && active.length > 0 ? (
              <Button
                variant="outline"
                className="max-sm:hidden"
                onClick={() => dialogs.open({ away: { person: null } })}
              >
                Add time away
              </Button>
            ) : null}
            {canAdd ? (
              <Button
                onClick={() => setAddOpen(true)}
                aria-label={addLabel(staffWord)}
                className="max-sm:size-11 max-sm:rounded-full max-sm:p-0"
              >
                <Plus className="size-4" />{" "}
                <span className="max-sm:hidden">{addLabel(staffWord)}</span>
              </Button>
            ) : null}
          </div>
        }
      />
      {team.data ? (
        <p className="-mt-2 text-[13px] text-muted-foreground sm:hidden">
          {plural(active.length, "person", "people")}
          {seatLine ? ` · ${seatLine}` : ""}
        </p>
      ) : null}
    </>
  );

  let body: React.ReactNode;
  if (team.isLoading) {
    body = <TableGhost rows={5} />;
  } else if (team.isError || !team.data) {
    body = (
      <div role="alert" className="grid justify-items-start gap-2 rounded-2xl border p-5">
        <p className="font-extrabold">Couldn't load your team</p>
        <p className="text-sm text-muted-foreground">
          {team.error instanceof ApiError
            ? team.error.detail || team.error.title
            : "Check your connection."}
        </p>
        <Button variant="outline" onClick={() => void team.refetch()}>
          <RotateCw className="size-4" /> Try again
        </Button>
      </div>
    );
  } else {
    const data = team.data;
    const draggable = canManage && tab === "active" && !filtering && active.length > 1;
    const onlyOwner = active.length === 1 && active[0]!.isOwner && archived.length === 0;
    const roleOptions = [SYSTEM_ROLES.BUSINESS_OWNER, ...[...ROLE_ORDER].reverse(), NO_SIGN_IN];
    const filterControls = (
      <>
        {locations.length > 1 ? (
          <Select
            value={search.location ?? "all"}
            onValueChange={(v) => setSearch({ location: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label="Location">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={search.role ?? "any"}
          onValueChange={(v) => setSearch({ role: v === "any" ? undefined : v })}
        >
          <SelectTrigger className="h-9 w-full sm:w-[160px]" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any role</SelectItem>
            {roleOptions.map((r) => (
              <SelectItem key={r} value={r}>
                {r === NO_SIGN_IN ? "No sign-in" : roleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    );

    body = (
      <>
        {data.servicesCount === 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-amber-500/12 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            Add your services so clients have something to book.
            <Link to="/services" className="font-semibold underline-offset-2 hover:underline">
              Go to Services ›
            </Link>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Team" className="flex gap-2">
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
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-[220px] sm:flex-none">
              <span className="sr-only">Search by name or email</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setSearch({ q: e.target.value || undefined })}
                placeholder="Search by name or email"
                className="h-9 pl-8 max-sm:h-11"
              />
            </label>
            <div className="hidden items-center gap-2 sm:flex">{filterControls}</div>
            <Button
              variant="outline"
              size="icon"
              className={cn("size-11 sm:hidden", filtering && "border-primary text-primary")}
              aria-label="Filters"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <ListFilter className="size-4" />
            </Button>
          </div>
          {filtersOpen ? <div className="grid w-full gap-2 sm:hidden">{filterControls}</div> : null}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card" role="tabpanel">
          <div
            className={cn(
              "hidden gap-4 border-b px-5 py-2.5 text-xs font-semibold text-muted-foreground sm:grid",
              tab === "archived" ? ARCHIVED_COLUMNS : COLUMNS,
            )}
          >
            <span>Person</span>
            <span>Clients can book</span>
            <span>Signs in</span>
            <span>Works at</span>
            <span>{tab === "archived" ? "Removed" : "This week"}</span>
            <span />
          </div>
          {shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {filtering ? "Nobody matches those filters." : "Nobody here yet."}
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((p) => (
                <PersonRow
                  key={p.staff.id}
                  person={p}
                  locations={locations}
                  canManage={canManage}
                  draggable={draggable}
                  dragging={dragId === p.staff.id}
                  onDragStart={() => {
                    setDragId(p.staff.id);
                    setDragOrder(filtered.map((x) => x.staff.id));
                  }}
                  onDragEnter={() => {
                    if (!dragId || dragId === p.staff.id) return;
                    setDragOrder((order) => {
                      const base = order ?? filtered.map((x) => x.staff.id);
                      const without = base.filter((id) => id !== dragId);
                      const at = without.indexOf(p.staff.id);
                      const from = base.indexOf(dragId);
                      const to = base.indexOf(p.staff.id);
                      without.splice(from < to ? at + 1 : at, 0, dragId);
                      return without;
                    });
                  }}
                  onDragEnd={() => {
                    const next = dragOrder;
                    setDragId(null);
                    setDragOrder(null);
                    if (next && next.join() !== filtered.map((x) => x.staff.id).join()) {
                      reorder.mutate(next, {
                        onError: (err) =>
                          toast.error(describeApiError(err, "Couldn't save the order.")),
                      });
                    }
                  }}
                  onOpen={() => openPerson(p.staff.id)}
                  onFix={(fix) => {
                    if (fix === "hours") dialogs.open({ hours: { staff: p.staff } });
                    else if (fix === "services") dialogs.open({ services: p.staff });
                    else openPerson(p.staff.id);
                  }}
                  onRestore={() => void restore(p)}
                />
              ))}
            </ul>
          )}
        </div>

        {tab === "active" && onlyOwner && canManage ? (
          <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center">
            <p className="text-lg font-extrabold">Add the people clients book</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Or give someone a sign-in to help with bookings.
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> {addLabel(staffWord)}
            </Button>
          </div>
        ) : null}

        {tab === "active" ? (
          <p className="text-[13px] text-muted-foreground">
            A seat is anyone active on the team. People who only sign in, like reception, use a seat
            too. Archived people don't.
          </p>
        ) : null}

        {tab === "active" &&
        (data.unlinkedSignIns.length > 0 || data.invitations.length > 0) &&
        (canInvite || canManagePermissions) ? (
          <Loose
            signIns={data.unlinkedSignIns}
            invitations={data.invitations}
            people={people}
            suggested={data.suggestedLinks}
            canManagePermissions={canManagePermissions}
            canInvite={canInvite}
            onOpenPerson={openPerson}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid gap-4">{body}</div>
      {panel}

      <AddPersonDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        seat={seat}
        locations={locations}
        usedColours={people.map((p) => p.staff.calendarColour)}
        onAdded={(staff, _invite, bookable) => {
          if (bookable) dialogs.open({ hours: { staff, suggest: true } });
          else setSearch({ person: staff.id, tab: undefined });
        }}
        onOpenPerson={(id) => {
          setAddOpen(false);
          openPerson(id);
        }}
        onSeePlans={() => void navigate({ to: "/billing" })}
        onViewTeam={() => setSearch({ tab: undefined, person: undefined })}
      />

      {dialogsHost}
    </>
  );
}

function worksAtText(p: TeamPerson, locations: Location[]): string {
  if (p.staff.locationIds.length === 0) return "All locations";
  const names = locations.filter((l) => p.staff.locationIds.includes(l.id)).map((l) => l.name);
  return names.join(", ") || "No active locations";
}

function PersonRow({
  person: p,
  locations,
  canManage,
  draggable,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onOpen,
  onFix,
  onRestore,
}: {
  person: TeamPerson;
  locations: Location[];
  canManage: boolean;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onFix: (fix: "hours" | "services" | "show" | "activate") => void;
  onRestore: () => void;
}) {
  const tenant = useTenant();
  const s = p.staff;
  const archived = isArchivedPerson(p);
  const noun = tenant.terminology.booking.toLowerCase();
  const bookability = useBookability(s.id, p.bookable === "bookable");
  const nextFree = bookability.data
    ? nextFreeText(bookability.data.nextFreeAt, bookability.data.timezone)
    : null;
  const status = bookableStatus(p.bookable, s.displayName, nextFree);
  const sign = signInLine(p.signIn, p.invitation, s.bookable !== false);
  const subtitle = p.isOwner ? `Owner${s.title ? ` · ${s.title}` : ""}` : (s.title ?? "");
  const roleText = sign.roleKey ? roleLabel(sign.roleKey) : "No sign-in";
  const works = worksAtText(p, locations);
  const showFix =
    canManage && !archived && status.fix && status.fix !== "restore" && status.fixLabel;
  const thisWeek = hoursText(p.week.minutes);
  const phoneLine =
    status.tone === "green" || p.bookable === "hidden"
      ? [s.title, p.week.minutes > 0 ? thisWeek : null].filter(Boolean).join(" · ")
      : archived
        ? `Removed ${s.archivedAt ? shortDate(s.archivedAt) : ""}`
        : status.line;

  const label = [
    s.displayName,
    subtitle || null,
    archived ? "archived" : status.pill.toLowerCase(),
    archived ? null : status.line.toLowerCase(),
    sign.roleKey ? `${roleText.toLowerCase()} role` : "no sign-in",
    sign.line ? sign.line.toLowerCase() : null,
    locations.length > 1 ? `works at ${works}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      onDragEnter={draggable ? onDragEnter : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      className={cn(
        "group relative transition-colors hover:bg-secondary/40",
        archived && "opacity-70",
        dragging && "bg-primary/5 opacity-60",
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
          className="absolute top-1/2 left-0.5 z-20 hidden -translate-y-1/2 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block"
        >
          <GripVertical className="size-4" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      />

      {/* Phone */}
      <div className="pointer-events-none relative flex min-h-16 items-center gap-3 px-4 py-3 sm:hidden">
        <TeamAvatar
          name={s.displayName}
          photoUrl={s.photoUrl}
          colour={s.calendarColour}
          size={38}
        />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[15px] font-bold">{s.displayName}</span>
          <span className="truncate text-[13px] text-muted-foreground">{phoneLine || " "}</span>
        </span>
        {archived ? null : <StatusDot tone={status.tone} />}
        {archived && canManage ? (
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto relative z-10 min-h-11"
            onClick={onRestore}
          >
            Bring back
          </Button>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>

      {/* Desktop */}
      <div
        className={cn(
          "pointer-events-none relative hidden min-h-16 items-center gap-4 px-5 py-3 sm:grid",
          archived ? ARCHIVED_COLUMNS : COLUMNS,
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <TeamAvatar
            name={s.displayName}
            photoUrl={s.photoUrl}
            colour={s.calendarColour}
            size={38}
          />
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-[14.5px] font-bold">{s.displayName}</span>
            <span className="truncate text-[13px] text-muted-foreground">{subtitle || " "}</span>
          </span>
        </span>

        <span className="grid min-w-0 justify-items-start gap-1">
          {archived ? (
            <BookablePill tone="grey">Archived</BookablePill>
          ) : (
            <>
              <BookablePill tone={status.tone}>{status.pill}</BookablePill>
              <span className="truncate text-xs text-muted-foreground">
                {status.tone === "green" && bookability.isLoading
                  ? "Finding next free time…"
                  : status.line}
                {showFix ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="pointer-events-auto relative z-10 cursor-pointer font-semibold text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFix(status.fix as "hours" | "services" | "show" | "activate");
                      }}
                    >
                      {status.fixLabel}
                    </button>
                  </>
                ) : null}
              </span>
            </>
          )}
        </span>

        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-[13.5px] font-bold">{roleText}</span>
          {sign.line ? (
            <span
              className={cn(
                "truncate text-xs",
                sign.tone === "amber"
                  ? "text-amber-700 dark:text-amber-300"
                  : sign.tone === "red"
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {sign.line}
            </span>
          ) : null}
        </span>

        <span className="truncate text-[13px] text-muted-foreground" title={works}>
          {works}
        </span>

        <span className="grid gap-0.5">
          {archived ? (
            <span className="text-[13px] text-muted-foreground">
              Removed {s.archivedAt ? shortDate(s.archivedAt) : ""}
            </span>
          ) : (
            <>
              <span className="text-[13.5px] font-bold tabular-nums">{thisWeek}</span>
              <span className="text-xs text-muted-foreground">{plural(p.week.bookings, noun)}</span>
            </>
          )}
        </span>

        <span className="flex justify-end">
          {archived ? (
            canManage ? (
              <Button
                variant="outline"
                size="sm"
                className="pointer-events-auto relative z-10"
                onClick={onRestore}
              >
                Bring back
              </Button>
            ) : null
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          )}
        </span>
      </div>
    </li>
  );
}

/** Sign-ins and invites that aren't attached to anyone on the team yet. */
function Loose({
  signIns,
  invitations,
  people,
  suggested,
  canManagePermissions,
  canInvite,
  onOpenPerson,
}: {
  signIns: TeamSignIn[];
  invitations: TeamInvitation[];
  people: TeamPerson[];
  suggested: { membershipId: string; staffId: string }[];
  canManagePermissions: boolean;
  canInvite: boolean;
  onOpenPerson: (id: string) => void;
}) {
  const businessId = useBusinessId();
  const adopt = useAdoptSignIn();
  const link = useLinkSignIn();
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();

  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-extrabold">Sign-ins not linked to anyone</h2>
      <p className="text-[13px] text-muted-foreground">
        These people can sign in but aren't on the team list yet. Link them to someone, or add them
        as a new person.
      </p>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {signIns.map((m) => {
          const match = suggested.find((s) => s.membershipId === m.membershipId);
          const matchPerson = match ? people.find((p) => p.staff.id === match.staffId) : null;
          const name = m.name || m.email || "Someone";
          return (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-bold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {roleLabel(m.roleKeys[0] ?? "staff")}
                  {m.email && m.email !== name ? ` · ${m.email}` : ""}
                  {m.status === "suspended" ? " · Sign-in removed" : ""}
                </span>
              </span>
              {canManagePermissions ? (
                <span className="flex flex-wrap gap-2">
                  {matchPerson ? (
                    <Button
                      size="sm"
                      disabled={link.isPending}
                      onClick={() =>
                        link.mutate(
                          { staffId: matchPerson.staff.id, membershipId: m.membershipId },
                          {
                            onSuccess: () => {
                              toast.success(`Linked to ${matchPerson.staff.displayName}`);
                              onOpenPerson(matchPerson.staff.id);
                            },
                            onError: (err) =>
                              toast.error(describeApiError(err, "Couldn't link them.")),
                          },
                        )
                      }
                    >
                      Link to {firstName(matchPerson.staff.displayName)}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={adopt.isPending}
                    onClick={() =>
                      adopt.mutate(m.membershipId, {
                        onSuccess: (staff) => {
                          toast.success(`${firstName(staff.displayName)} added to the team`);
                          onOpenPerson(staff.id);
                        },
                        onError: (err) => toast.error(describeApiError(err, "Couldn't add them.")),
                      })
                    }
                  >
                    Add as new person
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
        {invitations.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-bold">{inv.email}</span>
              <span
                className={cn(
                  "truncate text-xs",
                  inv.state === "expired"
                    ? "text-destructive"
                    : "text-amber-700 dark:text-amber-300",
                )}
              >
                {roleLabel(inv.roleKeys[0] ?? "staff")} ·{" "}
                {inv.state === "expired"
                  ? `Invite expired ${shortDate(inv.expiresAt)}`
                  : `Invite sent · expires ${shortDate(inv.expiresAt)}`}
              </span>
            </span>
            {canInvite ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    Invite
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      resend.mutate(inv.id, {
                        onSuccess: (r) =>
                          toast.success(
                            r.emailed ? "Invite sent again" : "New link ready. Copy it to share.",
                            {
                              action: { label: "Copy link", onClick: () => void copyInviteLink(r) },
                            },
                          ),
                        onError: (err) => toast.error(describeApiError(err, "Couldn't resend.")),
                      })
                    }
                  >
                    Resend invite
                  </DropdownMenuItem>
                  {inv.state === "pending" && inv.linkCopyable !== false ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void fetchInvitationLink(businessId, inv.id)
                          .then(copyInviteLink)
                          .catch((err) =>
                            toast.error(describeApiError(err, "Couldn't get the link.")),
                          )
                      }
                    >
                      Copy link
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() =>
                      cancel.mutate(inv.id, {
                        onSuccess: () => toast.success("Invite cancelled"),
                        onError: (err) => toast.error(describeApiError(err, "Couldn't cancel.")),
                      })
                    }
                  >
                    Cancel invite
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
