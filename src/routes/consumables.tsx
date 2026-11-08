import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BookingPanel } from "@/components/BookingPanel";
import { TonePill } from "@/components/client-profile/parts";
import {
  ConsumableFormDrawer,
  type ConsumablePrefill,
} from "@/components/consumables/ConsumableFormDrawer";
import { ConsumablePanel } from "@/components/consumables/ConsumablePanel";
import { ItemTile } from "@/components/consumables/parts";
import { MINT_TEXT, StatTile } from "@/components/waitlist/parts";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsPhone } from "@/hooks/use-media-query";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useConsumableFigures,
  useConsumablesForPeriod,
  useDeleteConsumable,
  useServices,
  useUpdateConsumable,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import type { Consumable } from "@/lib/api/types";
import {
  CONSUMABLE_SORTS,
  PERIOD_LABELS,
  PREVIOUS_PERIOD_NAME,
  QUICK_START,
  RECORDS_LINE,
  SORT_LABELS,
  USAGE_PERIODS,
  averageChangeLabel,
  defaultOnLabel,
  matchesConsumableSearch,
  parseConsumablesSearch,
  quantityLabel,
  sortConsumables,
  unitCostLabel,
  type ConsumableSort,
  type ConsumablesSearch,
  type UsagePeriod,
} from "@/lib/consumables";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/consumables")({
  // Every key is set, even to undefined: the root route keeps the raw query, and a key
  // left out here would let a hand-typed ?period=bogus through to the API.
  validateSearch: (raw: Record<string, unknown>): ConsumablesSearch => ({
    tab: undefined,
    q: undefined,
    sort: undefined,
    period: undefined,
    item: undefined,
    ...parseConsumablesSearch(raw),
  }),
  head: () => ({
    meta: [
      { title: "Consumables — RECAVO" },
      {
        name: "description",
        content:
          "Track the materials each job uses, such as coatings, pads and chemicals, for your own records.",
      },
      { property: "og:title", content: "RECAVO Consumables" },
      {
        property: "og:description",
        content: "Materials per service and per job, for your records only.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ConsumablesPage />
      </AppShell>
    </RequireAuth>
  ),
});

const COLUMNS = "grid-cols-[1.5fr_150px_1.4fr_150px_30px]";

/** "this month" / "last 3 months": the period inside a sentence. */
function periodPhrase(period: UsagePeriod): string {
  return PERIOD_LABELS[period].toLowerCase();
}

function ConsumablesPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const currency = tenant.business?.currency || "GBP";

  const tab = search.tab ?? "active";
  const sort: ConsumableSort = search.sort ?? "most_used";
  const period: UsagePeriod = search.period ?? "this_month";

  const [qInput, setQInput] = useState(search.q ?? "");
  const q = useDebouncedValue(qInput.trim(), 200);
  useEffect(() => {
    if ((search.q ?? "") === q) return;
    void navigate({ search: (prev) => ({ ...prev, q: q || undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setSearch = (patch: Partial<ConsumablesSearch>) =>
    void navigate({
      search: (prev) => parseConsumablesSearch({ ...prev, ...patch }),
      replace: true,
    });

  const list = useConsumablesForPeriod(period, { enabled: isCarDetailing });
  const figures = useConsumableFigures(period, { enabled: isCarDetailing });
  const services = useServices();
  const updateConsumable = useUpdateConsumable();
  const deleteConsumable = useDeleteConsumable();

  const [adding, setAdding] = useState<ConsumablePrefill | null | false>(false);
  const [editing, setEditing] = useState<Consumable | null>(null);
  const [confirming, setConfirming] = useState<Consumable | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const activeCount = all.filter((c) => c.status === "active").length;
  const archivedCount = all.length - activeCount;
  const rows = useMemo(
    () =>
      sortConsumables(
        all
          .filter((c) => c.status === tab)
          .filter((c) => matchesConsumableSearch(c, search.q ?? "")),
        sort,
      ),
    [all, tab, search.q, sort],
  );
  const serviceName = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s.name])),
    [services.data],
  );
  const namesFor = (c: Consumable) =>
    c.serviceIds.map((id) => serviceName.get(id)).filter(Boolean) as string[];
  const opened = search.item ? (all.find((c) => c.id === search.item) ?? null) : null;

  const money = (minor: number) => {
    try {
      return formatMoney(minor, currency);
    } catch {
      return "–";
    }
  };

  /* ---------------- Actions ---------------- */

  const setStatus = async (c: Consumable, status: "active" | "archived", undo = true) => {
    try {
      const saved = await updateConsumable.mutateAsync({
        consumableId: c.id,
        version: c.version,
        body: { status },
      });
      if (status === "archived") {
        toast.success(`${c.name} archived`, {
          action: undo
            ? {
                label: "Undo",
                onClick: () => void setStatus(saved, "active", false),
              }
            : undefined,
        });
      } else {
        toast.success(`${c.name} restored`);
      }
    } catch (err) {
      toastApiError(err);
    }
  };

  const remove = async (c: Consumable) => {
    try {
      const result = await deleteConsumable.mutateAsync(c.id);
      toast.success(result.deleted ? `${c.name} deleted` : `${c.name} archived`);
      setConfirming(null);
      if (search.item === c.id && result.deleted) setSearch({ item: undefined });
    } catch {
      // Toasted by the hook.
    }
  };

  const referenced = (c: Consumable) => c.serviceIds.length > 0 || c.jobCount > 0;

  /* ---------------- Pieces ---------------- */

  const menu = (c: Consumable) =>
    canEdit ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-[30px]"
            aria-label={`Actions for ${c.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setEditing(c)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          {c.status === "active" ? (
            <DropdownMenuItem onSelect={() => void setStatus(c, "archived")}>
              <Archive className="size-4" /> Archive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void setStatus(c, "active")}>
              <ArchiveRestore className="size-4" /> Restore
            </DropdownMenuItem>
          )}
          {c.status === "active" || !referenced(c) ? (
            <DropdownMenuItem
              onSelect={() => setConfirming(c)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const usedCell = (c: Consumable) =>
    c.usage && c.usage.quantity > 0 ? (
      <>
        <span className="text-sm font-bold">{quantityLabel(c.usage.quantity, c.unit)}</span>
        {canMoney && c.usage.spendMinor != null ? (
          <span className="text-xs text-muted-foreground">{money(c.usage.spendMinor)}</span>
        ) : null}
      </>
    ) : (
      <span className="text-sm text-muted-foreground">Not used</span>
    );

  const tabs = (
    <div role="tablist" aria-label="Which consumables" className="flex gap-2">
      {(
        [
          { value: "active", label: "Active", n: activeCount },
          { value: "archived", label: "Archived", n: archivedCount },
        ] as const
      ).map((t) => {
        const on = t.value === tab;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${t.label}, ${t.n}`}
            onClick={() => setSearch({ tab: t.value === "active" ? undefined : t.value })}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors max-sm:h-11",
              on
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="text-xs font-bold tabular-nums opacity-70" aria-hidden>
              {list.isSuccess ? t.n : ""}
            </span>
          </button>
        );
      })}
    </div>
  );

  const searchBox = (className?: string) => (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Search by name or SKU</span>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        placeholder="Search by name or SKU"
        className="h-[34px] pl-9 max-sm:h-11"
      />
    </label>
  );

  const sortMenu = (
    <FilterMenu
      label={`Sort: ${SORT_LABELS[sort]}`}
      heading="Sort"
      value={sort}
      options={CONSUMABLE_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
      onChange={(v) => setSearch({ sort: v as ConsumableSort })}
    />
  );
  const periodMenu = (
    <FilterMenu
      label={PERIOD_LABELS[period]}
      heading="Period"
      value={period}
      options={USAGE_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
      onChange={(v) => setSearch({ period: v as UsagePeriod })}
    />
  );

  const f = figures.data;
  const showTiles = !phone && (figures.isLoading || Boolean(f?.hasAnyUsage));
  const moneyTiles = Boolean(f?.moneyVisible && canMoney);
  const figureTiles = showTiles ? (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.isLoading || !f ? (
        Array.from({ length: canMoney ? 4 : 1 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[14px]" />
        ))
      ) : (
        <>
          {moneyTiles ? (
            <StatTile
              label={`Materials ${periodPhrase(period)}`}
              value={f.materialsMinor != null ? money(f.materialsMinor) : "–"}
              sub={`Across ${f.jobs} ${f.jobs === 1 ? "job" : "jobs"}`}
            />
          ) : null}
          {moneyTiles ? (
            <StatTile
              label="Average per job"
              value={f.averageMinor != null ? money(f.averageMinor) : "–"}
              sub={
                averageChangeLabel(
                  f.averageMinor,
                  f.previousAverageMinor,
                  PREVIOUS_PERIOD_NAME[period],
                  currency,
                ) ?? `Nothing to compare with ${PREVIOUS_PERIOD_NAME[period]}`
              }
            />
          ) : null}
          <StatTile
            label="Most used"
            value={f.mostUsed?.name ?? "–"}
            valueClass="truncate text-xl"
            sub={
              f.mostUsed
                ? `${quantityLabel(f.mostUsed.quantity, f.mostUsed.unit)} ${periodPhrase(period)}`
                : `Nothing used ${periodPhrase(period)}`
            }
          />
          {moneyTiles ? (
            <StatTile
              label="Costliest service"
              value={f.costliestService?.name ?? "–"}
              valueClass={cn("truncate text-xl", f.costliestService && MINT_TEXT)}
              sub={
                f.costliestService
                  ? `About ${money(f.costliestService.averageMinor)} a job`
                  : "No costed jobs yet"
              }
            />
          ) : null}
        </>
      )}
    </div>
  ) : null;

  /* ---------------- List ---------------- */

  const loading = tenant.isLoading || list.isLoading;
  const emptyCatalogue = !loading && !list.isError && all.length === 0;

  let body: ReactNode;
  if (loading) {
    body = <TableGhost rows={5} />;
  } else if (list.isError) {
    body = (
      <div className="p-6">
        <EmptyState
          title="Couldn't load consumables"
          description={
            list.error instanceof ApiError
              ? list.error.detail || list.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => list.refetch()}>Try again</Button>}
        />
      </div>
    );
  } else if (rows.length === 0) {
    body = search.q ? (
      <EmptyInCard
        title={`Nothing matches \u201c${search.q}\u201d`}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setQInput("");
              setSearch({ q: undefined });
            }}
          >
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyInCard title={tab === "archived" ? "Nothing archived." : "Nothing active."} />
    );
  } else if (phone) {
    body = (
      <ul className="grid gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSearch({ item: c.id })}
              className={cn(
                "surface-card flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3 text-left transition-colors duration-700",
                c.status === "archived" && "opacity-70",
                highlight === c.id && "bg-primary-soft",
              )}
            >
              <ItemTile />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold">{c.name}</span>
                  {c.status === "archived" ? <TonePill tone="grey">Archived</TonePill> : null}
                </span>
                <span className="truncate text-[12.5px] text-muted-foreground">
                  {unitCostLabel(c.unitCostMinor, c.unit, c.currency)}
                  {c.usage && c.usage.quantity > 0
                    ? ` · ${quantityLabel(c.usage.quantity, c.unit)} ${periodPhrase(period)}`
                    : ""}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <div role="table" aria-label="Consumables" className="min-w-[760px] text-sm">
          <div
            role="row"
            className={cn(
              "grid h-10 items-center gap-3 bg-secondary/50 px-4 text-xs font-bold text-muted-foreground",
              COLUMNS,
            )}
          >
            <span role="columnheader">Item</span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">Default on</span>
            <span role="columnheader">Used {periodPhrase(period)}</span>
            <span role="columnheader" className="sr-only">
              Actions
            </span>
          </div>
          {rows.map((c) => {
            const on = defaultOnLabel(namesFor(c));
            return (
              <div
                key={c.id}
                role="row"
                tabIndex={0}
                aria-label={c.name}
                onClick={() => setSearch({ item: c.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) setSearch({ item: c.id });
                }}
                className={cn(
                  "grid min-h-[60px] cursor-pointer items-center gap-3 border-t px-4 py-2.5 transition-colors duration-700 hover:bg-secondary/40",
                  COLUMNS,
                  c.status === "archived" && "opacity-70",
                  highlight === c.id && "bg-primary-soft",
                )}
              >
                <span role="cell" className="flex min-w-0 items-center gap-2.5">
                  <ItemTile />
                  <span className="grid min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14.5px] font-bold">{c.name}</span>
                      {c.status === "archived" ? <TonePill tone="grey">Archived</TonePill> : null}
                    </span>
                    <span className="truncate text-[12.5px] text-muted-foreground">
                      {c.sku ? `SKU ${c.sku}` : "No SKU"}
                    </span>
                  </span>
                </span>
                <span
                  role="cell"
                  className={cn(
                    "truncate",
                    c.unitCostMinor != null ? "font-bold" : "text-muted-foreground",
                  )}
                >
                  {unitCostLabel(c.unitCostMinor, c.unit, c.currency)}
                </span>
                <span role="cell" className="grid min-w-0">
                  <span
                    className={cn("truncate", c.serviceIds.length === 0 && "text-muted-foreground")}
                  >
                    {on.head}
                  </span>
                  {on.more ? (
                    <span className="text-xs text-muted-foreground">{on.more}</span>
                  ) : null}
                </span>
                <span role="cell" className="grid min-w-0">
                  {usedCell(c)}
                </span>
                <span role="cell" className="flex justify-end">
                  {menu(c)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Phone rows are cards themselves, so they sit straight on the page.
  const phoneRows = phone && !loading && !list.isError && rows.length > 0;
  const listCard = (
    <div
      className={cn(
        "overflow-hidden rounded-2xl",
        !phone ? "surface-card" : !phoneRows && "bg-secondary/30",
      )}
    >
      {body}
      {!phone && !loading && !list.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-[13px] text-muted-foreground">
          <span>
            {activeCount} active · {archivedCount} archived
          </span>
          <span>Costs are what you pay. Never charged or shown to clients.</span>
        </div>
      ) : null}
    </div>
  );

  const emptyCard = (
    <div className="grid justify-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center">
      <span className="flex size-[52px] items-center justify-center rounded-2xl bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.16)] dark:text-[#9fe3bf]">
        <Package className="size-6" />
      </span>
      <h2 className="text-lg font-extrabold">No consumables yet</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Add the coatings, pads and chemicals you buy. Then set what each service uses, and every job
        will start with that list.
      </p>
      {canEdit ? (
        <>
          <Button onClick={() => setAdding(null)}>
            <Plus className="size-4" /> Add your first consumable
          </Button>
          <div className="grid gap-2">
            <p className="text-xs font-bold text-muted-foreground">Quick start</p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_START.map((qs) => (
                <button
                  key={qs.name}
                  type="button"
                  onClick={() => setAdding({ name: qs.name, unit: qs.unit })}
                  className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors hover:bg-secondary max-sm:h-11"
                >
                  <Plus className="size-3.5" aria-hidden /> {qs.name}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">{RECORDS_LINE}</p>
    </div>
  );

  if (!tenant.isLoading && !isCarDetailing) {
    return (
      <>
        <PageHeader title="Consumables" />
        <EmptyState
          icon={<Package className="size-6" />}
          title="Consumables are for car detailing businesses"
          description="They track the materials a detailing job uses up. This business isn't set up as car detailing."
        />
      </>
    );
  }

  const phoneSubtitle =
    f?.hasAnyUsage && moneyTiles && f.materialsMinor != null
      ? `${money(f.materialsMinor)} ${periodPhrase(period)}${
          f.averageMinor != null ? ` · ${money(f.averageMinor)} a job` : ""
        }`
      : f?.hasAnyUsage
        ? `${f.jobs} ${f.jobs === 1 ? "job" : "jobs"} ${periodPhrase(period)}`
        : RECORDS_LINE;

  const headerActions = phone ? (
    <span className="flex items-center gap-2">
      {emptyCatalogue ? null : (
        <Button
          size="icon"
          variant="outline"
          className="size-[42px] rounded-full"
          onClick={() => setFiltersOpen(true)}
          aria-label="Sort and period"
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      )}
      {canEdit ? (
        <Button
          size="icon"
          className="size-[42px] rounded-full bg-ring text-[#10172a] hover:bg-ring/90"
          onClick={() => setAdding(null)}
          aria-label="Add consumable"
        >
          <Plus className="size-5" />
        </Button>
      ) : null}
    </span>
  ) : canEdit ? (
    <Button onClick={() => setAdding(null)}>
      <Plus className="size-4" /> Add consumable
    </Button>
  ) : undefined;

  const confirmingRefs = confirming ? referenced(confirming) : false;

  return (
    <>
      <PageHeader
        title="Consumables"
        description={
          phone
            ? phoneSubtitle
            : "The materials your jobs use up. For your records only. Never charged or shown to clients."
        }
        actions={headerActions}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {emptyCatalogue ? (
          emptyCard
        ) : phone ? (
          <>
            {searchBox("w-full")}
            {tabs}
            {listCard}
          </>
        ) : (
          <>
            {figureTiles}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {tabs}
              <div className="flex flex-wrap items-center gap-2">
                {searchBox("w-[260px]")}
                {sortMenu}
                {periodMenu}
              </div>
            </div>
            {listCard}
          </>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-3xl p-0">
          <SheetHeader className="px-4 sm:px-5 pt-6 pb-3 text-left">
            <SheetTitle className="text-xl font-extrabold">Sort and period</SheetTitle>
            <SheetDescription className="sr-only">
              Order the list and pick a period
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4 sm:px-5 pb-6">
            <div className="flex flex-wrap gap-2">
              {sortMenu}
              {periodMenu}
            </div>
            <Button className="h-12" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConsumablePanel
        open={Boolean(search.item)}
        consumable={opened}
        initialPeriod={period}
        canEdit={canEdit}
        canMoney={canMoney}
        onClose={() => setSearch({ item: undefined })}
        onEdit={(c) => setEditing(c)}
        onArchive={(c) => void setStatus(c, "archived")}
        onRestore={(c) => void setStatus(c, "active")}
        onDelete={(c) => setConfirming(c)}
        onOpenBooking={(id) => setOpenBookingId(id)}
      />

      <ConsumableFormDrawer
        open={adding !== false}
        consumable={null}
        prefill={adding || null}
        onOpenChange={(open) => {
          if (!open) setAdding(false);
        }}
        onSaved={(saved) => {
          setHighlight(saved.id);
          setSearch({ tab: undefined, q: undefined, item: saved.id });
          setQInput("");
        }}
      />
      <ConsumableFormDrawer
        open={editing !== null}
        consumable={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmingRefs
                ? `Archive ${confirming?.name} instead?`
                : `Delete ${confirming?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && confirmingRefs
                ? `It can't be deleted because it's on ${referencesPhrase(confirming)}. Archiving takes it out of your lists but keeps those records as they are. You can restore it any time.`
                : "It isn't on any service or job, so it'll be removed for good."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmingRefs ? undefined : "bg-destructive text-white hover:bg-destructive/90"
              }
              disabled={deleteConsumable.isPending || updateConsumable.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirming) return;
                if (confirmingRefs) {
                  const c = confirming;
                  setConfirming(null);
                  void setStatus(c, "archived");
                } else {
                  void remove(confirming);
                }
              }}
            >
              {confirmingRefs ? "Archive" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingPanel bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
    </>
  );
}

/** "3 services and 12 jobs", "1 service", "4 jobs". The count includes booked jobs still to come. */
function referencesPhrase(c: Consumable): string {
  const parts: string[] = [];
  const s = c.serviceIds.length;
  if (s > 0) parts.push(`${s} ${s === 1 ? "service" : "services"}`);
  if (c.jobCount > 0) parts.push(`${c.jobCount} ${c.jobCount === 1 ? "job" : "jobs"}`);
  return parts.join(" and ");
}

function EmptyInCard({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
      <p className="text-[15px] font-bold">{title}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function FilterMenu({
  label,
  heading,
  value,
  options,
  onChange,
}: {
  label: string;
  heading: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-[34px] gap-1.5 font-semibold max-sm:h-11">
          <span className="max-w-48 truncate">{label}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-72">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
