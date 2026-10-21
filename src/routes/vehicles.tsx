import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, ChevronDown, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AppShell } from "@/components/AppShell";
import { AVATAR_TINTS, TonePill } from "@/components/client-profile/parts";
import { TableGhost } from "@/components/ghost";
import {
  DeleteLinkedRecordDialog,
  OwnershipHistoryDialog,
  TransferLinkedRecordDialog,
} from "@/components/LinkedRecordDialogs";
import { LinkedRecordPhotosDialog } from "@/components/LinkedRecordPhotos";
import { LoadMoreSentinel } from "@/components/LoadMoreSentinel";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DuplicatesDialog } from "@/components/vehicles/DuplicatesDialog";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehiclesData, type VehicleRow } from "@/components/vehicles/use-vehicles-data";
import { VehicleFormDrawer, type VehicleFormMode } from "@/components/vehicles/VehicleFormDrawer";
import { VehiclePanel } from "@/components/vehicles/VehiclePanel";
import { useIsPhone } from "@/hooks/use-media-query";
import { queryKeys } from "@/lib/api";
import { usePatchLinkedRecord } from "@/lib/api/hooks";
import type { LinkedRecord } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import type { Tone } from "@/lib/client-profile";
import { avatarTintIndex } from "@/lib/clients-list";
import { formatInTz, initials, timeInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  duplicateGroups,
  fuelField,
  inVehiclesView,
  isArchivedVehicle,
  isStale,
  lastJobLabel,
  makeOf,
  makesOnFile,
  matchesVehicleSearch,
  registrationField,
  registrationOf,
  sortVehicles,
  vehiclePill,
  vehiclePillLabel,
  vehicleRowLabel,
  VEHICLES_SORT_LABELS,
  VEHICLES_SORTS,
  VEHICLES_VIEW_LABELS,
  VEHICLES_VIEWS,
  vehiclesSummary,
  vehiclesViewCounts,
  vehicleSubline,
  vehicleTitle,
  type VehiclePillKind,
  type VehiclesSort,
  type VehiclesView,
} from "@/lib/vehicles";

const searchSchema = z.object({
  view: z.enum(["all", "due", "stale", "archived"]).optional().catch(undefined),
  sort: z
    .enum(["last-job", "next-booking", "reg", "owner", "jobs", "newest"])
    .optional()
    .catch(undefined),
  /** Comma-separated makes, lowercased. */
  make: z.string().optional().catch(undefined),
  fuel: z.string().optional().catch(undefined),
  /** The vehicle panel's record id. */
  vehicle: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/vehicles")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Vehicles — RECAVO" },
      {
        name: "description",
        content: "Every vehicle on record across your clients, searchable in one place.",
      },
      { property: "og:title", content: "RECAVO Vehicles" },
      {
        property: "og:description",
        content: "Business-wide vehicle records with owners, transfers and history.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <VehiclesPage />
      </AppShell>
    </RequireAuth>
  ),
});

const PAGE_SIZE = 25;

const PILL_TONE: Record<VehiclePillKind, Tone> = {
  archived: "grey",
  owners: "amber",
  due: "amber",
  new: "green",
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** A string list kept in localStorage per business (duplicate dismissals). */
function useStoredKeys(key: string | null) {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      setKeys(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setKeys([]);
    }
  }, [key]);
  const save = (next: string[]) => {
    setKeys(next);
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the dismissal just won't stick.
    }
  };
  return [keys, save] as const;
}

function VehiclesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/vehicles" });
  const phone = useIsPhone();
  const tenant = useTenant();
  const timeZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const term = tenant.terminology.linkedRecord || "Vehicle";
  const lower = term.toLowerCase();
  const plural = lower.endsWith("s") ? term : `${term}s`;
  const pluralLower = plural.toLowerCase();
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);
  const canBook = tenant.can(PERMISSIONS.BOOKING_CREATE);

  const view: VehiclesView = search.view ?? "all";
  const sort: VehiclesSort = search.sort ?? "last-job";
  const makes = useMemo(
    () => (search.make ? search.make.split(",").filter(Boolean) : []),
    [search.make],
  );
  const fuelFilter = search.fuel ?? null;
  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const openVehicle = (id: string | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, vehicle: id }) });

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const [page, setPage] = useState(0);
  const [phoneCount, setPhoneCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setPage(0);
    setPhoneCount(PAGE_SIZE);
  }, [view, sort, search.make, search.fuel, debounced]);

  const data = useVehiclesData();
  const { fields, rows, records } = data;
  const regField = registrationField(fields);
  const fuel = fuelField(fields);
  const patch = usePatchLinkedRecord(undefined);
  const qc = useQueryClient();

  const [form, setForm] = useState<VehicleFormMode | null>(null);
  const [bookFor, setBookFor] = useState<LinkedRecord | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<LinkedRecord | null>(null);
  const [photosFor, setPhotosFor] = useState<LinkedRecord | null>(null);
  const [deletingFor, setDeletingFor] = useState<LinkedRecord | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const businessId = tenant.businessId;
  const [notSame, setNotSame] = useStoredKeys(
    businessId ? `recavo.vehicles.notSame.${businessId}` : null,
  );
  const [bannerHidden, setBannerHidden] = useStoredKeys(
    businessId ? `recavo.vehicles.bannerHidden.${businessId}` : null,
  );

  const now = useMemo(
    () => new Date(),
    // Re-read the clock whenever the rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const counts = useMemo(() => vehiclesViewCounts(rows, now, timeZone), [rows, now, timeZone]);
  const groups = useMemo(
    () => duplicateGroups(rows, fields).filter((g) => !notSame.includes(g.key)),
    [rows, fields, notSame],
  );
  const showBanner = !data.loadingMore && groups.some((g) => !bannerHidden.includes(g.key));
  const dupOwners = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groups) for (const r of g.rows) map.set(r.record.id, g.owners);
    return map;
  }, [groups]);

  const makeOptions = useMemo(() => makesOnFile(records.map((r) => r.record)), [records]);
  const fuelOptions = fuel?.constraints?.options ?? [];

  const searching = debounced.length > 0;
  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      // Searching the All tab reaches archived records too, so nothing is unfindable.
      const inTab = view === "all" && searching ? true : inVehiclesView(view, r, now, timeZone);
      if (!inTab) return false;
      if (makes.length > 0 && !makes.includes(makeOf(r.record.values) ?? "")) return false;
      if (fuel && fuelFilter && (r.record.values ?? {})[fuel.fieldKey] !== fuelFilter) return false;
      if (searching && !matchesVehicleSearch(r, debounced, fields)) return false;
      return true;
    });
    return sortVehicles(list, sort, fields);
  }, [rows, view, searching, now, timeZone, makes, fuel, fuelFilter, debounced, fields, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = phone
    ? filtered.slice(0, phoneCount)
    : filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const transferring = transferringId
    ? (records.find((r) => r.record.id === transferringId) ?? null)
    : null;
  const panelRecord = search.vehicle
    ? (records.find((r) => r.record.id === search.vehicle)?.record ?? null)
    : null;

  const setArchived = async (r: LinkedRecord, archived: boolean) => {
    await patch.mutateAsync({
      recordId: r.id,
      version: r.version,
      body: { status: archived ? "archived" : "active" },
    });
    void qc.invalidateQueries({
      queryKey: queryKeys.customerLinkedRecords(tenant.businessId, r.customerId),
    });
    toast.success(archived ? `${term} archived` : `${term} restored`);
  };

  const bookingDate = (iso: string) =>
    formatInTz(iso, timeZone, { weekday: "short", day: "numeric", month: "short" }).replace(
      ",",
      "",
    );
  const pillOf = (r: VehicleRow) =>
    vehiclePill({ ...r, duplicateOwners: dupOwners.get(r.record.id) ?? 1 }, now);
  const pillText = (r: VehicleRow, kind: VehiclePillKind) =>
    vehiclePillLabel(kind, {
      due: r.due,
      duplicateOwners: dupOwners.get(r.record.id) ?? 1,
      timeZone,
    });

  const rowMenu = (r: VehicleRow) => {
    const rec = r.record;
    const archived = isArchivedVehicle(rec);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${rec.displayLabel}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        {/* Menu clicks bubble through React's tree; keep them from opening the panel. */}
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canBook && !archived ? (
            <DropdownMenuItem onSelect={() => setBookFor(rec)}>New booking</DropdownMenuItem>
          ) : null}
          {r.owner ? (
            <DropdownMenuItem asChild>
              <Link to="/clients/$clientId" params={{ clientId: r.owner.id }}>
                View client
              </Link>
            </DropdownMenuItem>
          ) : null}
          {canEdit ? (
            <>
              <DropdownMenuItem onSelect={() => setForm({ kind: "edit", record: rec })}>
                Edit
              </DropdownMenuItem>
              {!archived ? (
                <DropdownMenuItem onSelect={() => setTransferringId(rec.id)}>
                  Transfer to another client
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => setPhotosFor(rec)}>Photos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHistoryFor(rec)}>Ownership history</DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={patch.isPending}
                onSelect={() => void setArchived(rec, !archived)}
              >
                {archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              {!archived ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeletingFor(rec)}
                >
                  Delete
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const tabs = (
    <div
      role="tablist"
      aria-label={`Which ${pluralLower}`}
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
    >
      {VEHICLES_VIEWS.map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${VEHICLES_VIEW_LABELS[v]}, ${counts[v]}`}
            onClick={() => setSearch({ view: v === "all" ? undefined : v })}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {VEHICLES_VIEW_LABELS[v]}
            <span className="text-xs font-bold tabular-nums opacity-70" aria-hidden>
              {data.isLoading ? "" : counts[v]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-10 bg-secondary/60 pl-9"
        placeholder={
          regField
            ? phone
              ? "Registration, make or owner"
              : "Search by registration, make, model or owner"
            : `Search ${pluralLower} or owners`
        }
        value={query}
        aria-label={`Search ${pluralLower}`}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  const makeFilter =
    makeOptions.length > 0 ? (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-10 gap-1.5 font-semibold", makes.length > 0 && "border-foreground/40")}
          >
            {makes.length > 0 ? `Make · ${makes.length}` : "Make"}
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-2">
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {makeOptions.map((m) => {
              const key = m.toLowerCase();
              const on = makes.includes(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => {
                      const next = on ? makes.filter((x) => x !== key) : [...makes, key];
                      setSearch({ make: next.length > 0 ? next.join(",") : undefined });
                    }}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="truncate">{m}</span>
                    {on ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {makes.length > 0 ? (
            <button
              type="button"
              onClick={() => setSearch({ make: undefined })}
              className="mt-1 w-full cursor-pointer rounded-lg border-t px-2.5 pt-2 pb-1 text-left text-sm font-semibold text-primary"
            >
              Clear makes
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    ) : null;

  const fuelSelect =
    fuel && fuelOptions.length > 0 ? (
      <Select
        value={fuelFilter ?? "any"}
        onValueChange={(v) => setSearch({ fuel: v === "any" ? undefined : v })}
      >
        <SelectTrigger className="h-10 w-auto min-w-[120px] font-semibold" aria-label="Fuel">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any fuel</SelectItem>
          {fuelOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const sortSelect = (
    <Select value={sort} onValueChange={(v) => setSearch({ sort: v as VehiclesSort })}>
      <SelectTrigger
        className="h-10 w-auto min-w-[150px] font-semibold"
        aria-label={`Sort ${pluralLower}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VEHICLES_SORTS.filter((s) => s !== "reg" || regField).map((s) => (
          <SelectItem key={s} value={s}>
            {VEHICLES_SORT_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const plateOrLabel = (r: VehicleRow) => {
    const reg = registrationOf(r.record.values, fields);
    return reg ? <NumberPlate registration={reg} size="row" className="shrink-0" /> : null;
  };

  let body: ReactNode;
  if (data.isLoading) {
    body = <TableGhost rows={8} />;
  } else if (data.isError) {
    body = (
      <div className="p-6">
        <EmptyState
          title={`Couldn't load your ${pluralLower}.`}
          action={
            <Button variant="outline" onClick={data.refetch}>
              Try again
            </Button>
          }
        />
      </div>
    );
  } else if (!data.definition.data?.definition) {
    body = (
      <div className="p-6">
        <EmptyState
          title={`No ${lower} schema yet`}
          description="Turn on records in Settings to start keeping them."
        />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="p-6">
        <EmptyState
          title={`No ${pluralLower} yet`}
          description={`Add a ${lower}, or they'll be added as you take bookings.`}
          action={
            canEdit ? (
              <Button onClick={() => setForm({ kind: "add" })}>
                <Plus className="size-4" /> Add {lower}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="p-6">
        {searching ? (
          <EmptyState
            title={`No ${pluralLower} match "${debounced}"`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`No ${pluralLower} in ${VEHICLES_VIEW_LABELS[view]}`}
            action={
              <Button
                variant="outline"
                onClick={() => setSearch({ view: undefined, make: undefined, fuel: undefined })}
              >
                Show all
              </Button>
            }
          />
        )}
      </div>
    );
  } else if (phone) {
    body = (
      <>
        <ul className="divide-y">
          {pageRows.map((r) => {
            const pill = pillOf(r);
            const line = [r.ownerName || "Unknown client", lastJobLabel(r.stats, now, timeZone)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={r.record.id}>
                <button
                  type="button"
                  onClick={() => openVehicle(r.record.id)}
                  className={cn(
                    "flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-3.5 py-[11px] text-left",
                    isArchivedVehicle(r.record) && "opacity-55",
                  )}
                >
                  {plateOrLabel(r)}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold">
                        {vehicleTitle(r.record, fields)}
                      </span>
                      {pill ? (
                        <TonePill tone={PILL_TONE[pill]}>{pillText(r, pill)}</TonePill>
                      ) : null}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {data.statsLoading ? r.ownerName : line}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <LoadMoreSentinel
          hasNextPage={phoneCount < filtered.length}
          isFetchingNextPage={false}
          onLoadMore={() => setPhoneCount((n) => n + PAGE_SIZE)}
        />
      </>
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup>
            <col />
            <col style={{ width: "24%" }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead className="h-10 bg-secondary/50 text-muted-foreground">
            <tr>
              {[term, "Owner", "Last job", "Next booking"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-bold whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-right text-xs font-bold">
                Jobs
              </th>
              <th scope="col" className="px-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const rec = r.record;
              const archived = isArchivedVehicle(rec);
              const pill = pillOf(r);
              const title = vehicleTitle(rec, fields);
              const sub = vehicleSubline(rec.values, fields);
              const last = r.stats.lastJob;
              const next = r.stats.nextBooking;
              const stale = !archived && isStale(r.stats, now, timeZone);
              const label = vehicleRowLabel({
                registration: registrationOf(rec.values, fields),
                title,
                year: null,
                ownerName: r.ownerName || null,
                pill: pill ? pillText(r, pill) : null,
                next: next ? bookingDate(next.at) : null,
              });
              return (
                <tr
                  key={rec.id}
                  tabIndex={0}
                  aria-label={label}
                  onClick={() => openVehicle(rec.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openVehicle(rec.id);
                    }
                  }}
                  className={cn(
                    "h-[62px] cursor-pointer border-t transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none",
                    archived && "opacity-55",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-3">
                      {plateOrLabel(r)}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[14.5px] font-bold">{title}</span>
                          {pill ? (
                            <TonePill tone={PILL_TONE[pill]}>{pillText(r, pill)}</TonePill>
                          ) : null}
                        </span>
                        {sub ? (
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            {sub}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.owner ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-extrabold",
                            AVATAR_TINTS[avatarTintIndex(r.owner.id)],
                          )}
                        >
                          {initials(r.ownerName) || "?"}
                        </span>
                        <Link
                          to="/clients/$clientId"
                          params={{ clientId: r.owner.id }}
                          tabIndex={-1}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-sm font-semibold hover:underline"
                        >
                          {r.ownerName}
                        </Link>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unknown client</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {data.statsLoading ? (
                      <span className="text-muted-foreground">…</span>
                    ) : (
                      <>
                        <span className="block text-[13.5px]">
                          {lastJobLabel(r.stats, now, timeZone)}
                        </span>
                        {last ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {last.service}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {archived ? (
                      <span className="text-[13.5px] text-muted-foreground">—</span>
                    ) : data.statsLoading ? (
                      <span className="text-muted-foreground">…</span>
                    ) : next ? (
                      <>
                        <span className="block text-[13.5px]">{bookingDate(next.at)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {next.allDay ? "All day" : timeInTz(next.at, timeZone)} · {next.service}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block text-[13.5px] text-muted-foreground">
                          Nothing booked
                        </span>
                        {stale ? (
                          <span className="block truncate text-xs text-cal-deposit-fg">
                            Not seen in 6 months
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13.5px] tabular-nums">
                    {data.statsLoading ? "…" : r.stats.jobs}
                  </td>
                  <td className="px-2 py-2.5 text-right">{rowMenu(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const summary = data.isLoading
    ? undefined
    : vehiclesSummary(
        rows.map((r) => ({ ...r, ownerId: r.owner?.id ?? null })),
        now,
        timeZone,
        { singular: term, plural },
      );
  const hasSchema = Boolean(data.definition.data?.definition);

  return (
    <>
      <PageHeader
        title={plural}
        description={summary}
        actions={
          hasSchema && canEdit ? (
            phone ? (
              <Button
                size="icon"
                className="size-[42px] bg-ring text-[#10172a] hover:bg-ring/90"
                onClick={() => setForm({ kind: "add" })}
                aria-label={`Add ${lower}`}
              >
                <Plus className="size-5" />
              </Button>
            ) : (
              <Button onClick={() => setForm({ kind: "add" })}>
                <Plus className="size-4" /> Add {lower}
              </Button>
            )
          ) : null
        }
      />

      {phone ? (
        <>
          {searchBox}
          {tabs}
        </>
      ) : (
        <>
          {tabs}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[260px] flex-1">{searchBox}</div>
            {makeFilter}
            {fuelSelect}
            {sortSelect}
          </div>
        </>
      )}

      {showBanner ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-foreground"
        >
          <p className="min-w-0 flex-1">
            <span className="font-bold">
              {groups.length === 1
                ? "1 registration is on more than one record."
                : `${groups.length} registrations are on more than one record.`}
            </span>{" "}
            Usually a {lower} changed hands, or it was added twice.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-background"
              onClick={() => setReviewOpen(true)}
            >
              Review
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBannerHidden(groups.map((g) => g.key))}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {data.statsIncomplete ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Your history is too long to read in full here, so some jobs and dates may be missing.
        </p>
      ) : null}

      <div className="surface-card overflow-hidden rounded-2xl">
        {body}

        {!phone && filtered.length > 0 && !data.isLoading ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1} to {Math.min(filtered.length, (page + 1) * PAGE_SIZE)}{" "}
              of {filtered.length}
              {data.loadingMore ? " · loading more…" : null}
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

      <VehiclePanel
        recordId={search.vehicle ?? null}
        initial={panelRecord}
        existing={records}
        onClose={() => openVehicle(undefined)}
      />

      {form ? (
        <VehicleFormDrawer
          open
          onOpenChange={(o) => {
            if (!o) setForm(null);
          }}
          mode={form}
          existing={records}
          onSaved={(record, { book, created }) => {
            if (book) setBookFor(record);
            else if (created) openVehicle(record.id);
          }}
        />
      ) : null}

      <DuplicatesDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        groups={groups}
        fields={fields}
        onNotSame={(key) => setNotSame([...notSame, key])}
        onOpenVehicle={(id) => {
          setReviewOpen(false);
          openVehicle(id);
        }}
      />

      {bookFor ? (
        <AddBookingModal
          key={bookFor.id}
          open
          onOpenChange={(o) => {
            if (!o) setBookFor(null);
          }}
          defaultCustomerId={bookFor.customerId}
          defaultLinkedRecordId={bookFor.id}
        />
      ) : null}

      <TransferLinkedRecordDialog
        record={transferring?.record ?? null}
        sourceCustomerId={transferring?.record.customerId ?? ""}
        term={term}
        onOpenChange={(o) => {
          if (!o) setTransferringId(null);
        }}
      />
      <OwnershipHistoryDialog
        record={historyFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setHistoryFor(null);
        }}
      />
      <DeleteLinkedRecordDialog
        record={deletingFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setDeletingFor(null);
        }}
      />
      <LinkedRecordPhotosDialog
        record={photosFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setPhotosFor(null);
        }}
      />
    </>
  );
}
