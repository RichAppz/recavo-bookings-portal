import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AddClientDialog } from "@/components/AddClientDialog";
import { AddBookingModal } from "@/components/AddBookingModal";
import { CustomerAvatar } from "@/components/CustomerAvatar";
import { AVATAR_TINTS } from "@/components/client-profile/parts";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { LoadMoreSentinel } from "@/components/LoadMoreSentinel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useIsPhone } from "@/hooks/use-media-query";
import {
  useClientStatsBookings,
  useClientStatsPayments,
  useCustomers,
  useCustomersCredits,
  useCustomerTagsCatalogue,
  useLinkedRecordDefinition,
  useLinkedRecordsInfinite,
  usePackages,
  useUpdateCustomerStatus,
} from "@/lib/api/hooks";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import {
  avatarTintIndex,
  CLIENT_PILL_LABELS,
  clientPill,
  clientStatsById,
  clientSubline,
  CLIENTS_SORT_LABELS,
  CLIENTS_SORTS,
  CLIENTS_VIEW_LABELS,
  CLIENTS_VIEWS,
  clientsSummary,
  DEFAULT_SORT_DIR,
  EMPTY_STATS,
  inView,
  isArchivedClient,
  isLapsed,
  LAPSED_DAYS,
  matchesClientSearch,
  relativeVisitLabel,
  sortClients,
  viewCounts,
  type ClientPillKind,
  type ClientsSort,
  type ClientsView,
  type ClientStats,
  type SortDir,
} from "@/lib/clients-list";
import { formatInTz, formatMoney, initials, timeInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { spendableUnits } from "@/lib/portal-credits";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  view: z.enum(["all", "new", "lapsed", "package", "archived"]).optional().catch(undefined),
  sort: z
    .enum(["last-visit", "next-booking", "name", "spent", "newest", "sessions"])
    .optional()
    .catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  /** Comma-separated tag ids. */
  tags: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/clients/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Clients — RECAVO" },
      {
        name: "description",
        content:
          "Client records with credits, lifetime spend, attendance and upcoming bookings for RECAVO.",
      },
      { property: "og:title", content: "RECAVO Clients" },
      {
        property: "og:description",
        content: "Every client, credit balance and booking history in one place.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ClientsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const PAGE_SIZE = 25;
/** Credits are served per client; past this many we only look up the rows on screen. */
const CREDIT_LOOKUP_ALL_LIMIT = 300;

const PILL_STYLES: Record<ClientPillKind, string> = {
  owes: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
  package: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  new: "bg-[#e3f5ec] text-[#1f6b41] dark:bg-[rgba(110,231,176,0.14)] dark:text-[#9fe3bf]",
  archived: "bg-secondary text-secondary-foreground",
  anonymised: "bg-secondary text-secondary-foreground",
};

type Row = {
  customer: Customer;
  stats: ClientStats;
  credits: number;
  pill: ClientPillKind | null;
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function ClientsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clients/" });
  const phone = useIsPhone();
  const tenant = useTenant();
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const currency = tenant.business?.currency ?? "GBP";
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);
  const canBook = tenant.can(PERMISSIONS.BOOKING_CREATE);

  const view: ClientsView = search.view ?? "all";
  const sort: ClientsSort = search.sort ?? "last-visit";
  const dir: SortDir = search.dir ?? DEFAULT_SORT_DIR[sort];
  const tagIds = useMemo(
    () => (search.tags ? search.tags.split(",").filter(Boolean) : []),
    [search.tags],
  );
  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const [page, setPage] = useState(0);
  const [phoneCount, setPhoneCount] = useState(PAGE_SIZE);
  const [addOpen, setAddOpen] = useState(false);
  const [bookFor, setBookFor] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  useEffect(() => {
    setPage(0);
    setPhoneCount(PAGE_SIZE);
  }, [view, sort, dir, search.tags, debounced]);

  const customers = useCustomers();
  const statsBookings = useClientStatsBookings();
  const statsPayments = useClientStatsPayments(canMoney);
  const packages = usePackages();
  const tagCatalogue = useCustomerTagsCatalogue({ status: "active" });
  const tagged = useCustomers({ tagIds: tagIds.join(","), enabled: tagIds.length > 0 });
  const serverSearch = useCustomers({ search: debounced, enabled: debounced.length >= 2 });
  const recordDefinition = useLinkedRecordDefinition();
  const recordSearch = useLinkedRecordsInfinite({
    search: debounced,
    enabled: debounced.length >= 2 && Boolean(recordDefinition.data),
  });
  const updateStatus = useUpdateCustomerStatus();

  const all = useMemo(() => customers.data?.items ?? [], [customers.data]);
  const now = useMemo(
    () => new Date(),
    // Re-read the clock whenever the history refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statsBookings.dataUpdatedAt, statsPayments.dataUpdatedAt],
  );
  const statsById = useMemo(
    () => clientStatsById(statsBookings.data?.bookings ?? [], statsPayments.data ?? [], now),
    [statsBookings.data, statsPayments.data, now],
  );
  const statsLoading = statsBookings.isLoading || (canMoney && statsPayments.isLoading);

  const sellsPackages = (packages.data?.length ?? 0) > 0;
  const activeIds = useMemo(() => all.filter((c) => c.status === "active").map((c) => c.id), [all]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const creditIds = activeIds.length <= CREDIT_LOOKUP_ALL_LIMIT ? activeIds : visibleIds;
  const creditViews = useCustomersCredits(creditIds, sellsPackages);
  const creditsOf = useCallback(
    (id: string) =>
      (creditViews.get(id) ?? []).reduce((sum, v) => sum + spendableUnits(v, now.getTime()), 0),
    [creditViews, now],
  );

  const rows: Row[] = useMemo(
    () =>
      all.map((customer) => {
        const stats = statsById.get(customer.id) ?? EMPTY_STATS;
        const credits = creditsOf(customer.id);
        return { customer, stats, credits, pill: clientPill({ customer, stats, credits }, now) };
      }),
    [all, statsById, creditsOf, now],
  );
  const counts = useMemo(() => viewCounts(rows, now, timezone), [rows, now, timezone]);

  const searching = debounced.length > 0;
  const matchIds = useMemo(() => {
    const ids = new Set<string>();
    if (debounced.length >= 2) {
      for (const c of serverSearch.data?.items ?? []) ids.add(c.id);
      for (const r of recordSearch.items) if (r.owner) ids.add(r.owner.id);
    }
    return ids;
  }, [debounced, serverSearch.data, recordSearch.items]);
  const taggedIds = useMemo(
    () => new Set((tagged.data?.items ?? []).map((c) => c.id)),
    [tagged.data],
  );

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      // Searching the All tab reaches archived clients too, so nobody is unfindable.
      const inTab = view === "all" && searching ? true : inView(view, r, now, timezone);
      if (!inTab) return false;
      if (tagIds.length > 0 && !taggedIds.has(r.customer.id)) return false;
      if (
        searching &&
        !matchesClientSearch(r.customer, debounced) &&
        !matchIds.has(r.customer.id)
      ) {
        return false;
      }
      return true;
    });
    return sortClients(list, sort, dir);
  }, [rows, view, searching, now, timezone, tagIds, taggedIds, debounced, matchIds, sort, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = phone
    ? filtered.slice(0, phoneCount)
    : filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageKey = pageRows.map((r) => r.customer.id).join(",");
  useEffect(() => {
    setVisibleIds(pageKey ? pageKey.split(",") : []);
  }, [pageKey]);

  const toggleSort = (key: ClientsSort) =>
    setSearch(
      key === sort
        ? { sort: key, dir: dir === "asc" ? "desc" : "asc" }
        : { sort: key, dir: undefined },
    );

  const money = (minor: number) => formatMoney(minor, currency, { compact: true });
  const shortDate = (iso: string) => formatInTz(iso, timezone, { day: "numeric", month: "short" });
  const bookingDate = (iso: string) =>
    formatInTz(iso, timezone, { weekday: "short", day: "numeric", month: "short" }).replace(
      ",",
      "",
    );

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error(`Couldn't copy the ${what.toLowerCase()}`);
    }
  };
  const setStatus = async (c: Customer, status: "active" | "archived") => {
    try {
      await updateStatus.mutateAsync({ customerId: c.id, version: c.version, status });
      toast.success(
        `${customerDisplayName(c)} ${status === "archived" ? "archived" : "is active again"}`,
      );
    } catch {
      // useUpdateCustomerStatus has already toasted why.
    }
  };
  const openProfile = (id: string) =>
    void navigate({ to: "/clients/$clientId", params: { clientId: id } });

  const rowMenu = (c: Customer) => {
    const archived = c.status === "archived";
    const anonymised = c.status === "anonymised";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${customerDisplayName(c)}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canBook && c.status === "active" ? (
            <DropdownMenuItem onSelect={() => setBookFor(c.id)}>New booking</DropdownMenuItem>
          ) : null}
          {!anonymised ? (
            <DropdownMenuItem
              onSelect={() =>
                void navigate({
                  to: "/clients/$clientId",
                  params: { clientId: c.id },
                  search: { tab: "messages" },
                })
              }
            >
              Send message
            </DropdownMenuItem>
          ) : null}
          {c.emailDisplay ? (
            <DropdownMenuItem onSelect={() => void copy(c.emailDisplay!, "Email")}>
              Copy email
            </DropdownMenuItem>
          ) : null}
          {c.phoneDisplay ? (
            <DropdownMenuItem onSelect={() => void copy(c.phoneDisplay!, "Phone number")}>
              Copy phone
            </DropdownMenuItem>
          ) : null}
          {canEdit && !anonymised ? (
            <>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem onSelect={() => void setStatus(c, "active")}>
                  Unarchive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setArchiveTarget(c)}>Archive</DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const tabs = (
    <div
      role="tablist"
      aria-label="Which clients"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
    >
      {CLIENTS_VIEWS.map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${CLIENTS_VIEW_LABELS[v]}, ${counts[v]}`}
            onClick={() => setSearch({ view: v === "all" ? undefined : v })}
            className={cn(
              "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "bg-primary font-extrabold text-primary-foreground"
                : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
            )}
          >
            {CLIENTS_VIEW_LABELS[v]}
            <span className="text-xs font-bold tabular-nums opacity-70" aria-hidden>
              {customers.isLoading ? "" : counts[v]}
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
        placeholder={phone ? "Search clients" : "Search by name, email, phone or vehicle"}
        value={query}
        aria-label="Search clients"
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  const tagOptions = tagCatalogue.data ?? [];
  const tagsFilter =
    tagOptions.length > 0 ? (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-10 gap-1.5 font-semibold",
              tagIds.length > 0 && "border-foreground/40",
            )}
          >
            {tagIds.length > 0 ? `Tags · ${tagIds.length}` : "Tags"}
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {tagOptions.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => {
                      const next = on ? tagIds.filter((id) => id !== t.id) : [...tagIds, t.id];
                      setSearch({ tags: next.length > 0 ? next.join(",") : undefined });
                    }}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="truncate">{t.name}</span>
                    {on ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {tagIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setSearch({ tags: undefined })}
              className="mt-1 w-full cursor-pointer rounded-lg border-t px-2.5 pt-2 pb-1 text-left text-sm font-semibold text-primary"
            >
              Clear tags
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    ) : null;

  const sortSelect = (
    <Select
      value={sort}
      onValueChange={(v) => setSearch({ sort: v as ClientsSort, dir: undefined })}
    >
      <SelectTrigger className="h-10 w-auto min-w-[150px] font-semibold" aria-label="Sort clients">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CLIENTS_SORTS.map((s) => (
          <SelectItem key={s} value={s}>
            {CLIENTS_SORT_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  let body: ReactNode;
  if (customers.isLoading) {
    body = <TableGhost rows={8} />;
  } else if (customers.isError) {
    body = (
      <div className="p-6">
        <EmptyState
          title="Couldn't load your clients."
          action={
            <Button variant="outline" onClick={() => void customers.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  } else if (all.length === 0) {
    body = (
      <div className="p-6">
        <EmptyState
          title="No clients yet"
          description="Add your first client, import a list, or share your booking page and they'll appear here as they book."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="size-4" /> Add client
              </Button>
              <Button variant="outline" asChild>
                <Link to="/clients/import">
                  <Upload className="size-4" /> Import
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="p-6">
        {searching ? (
          <EmptyState
            title={`No clients match "${debounced}"`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`No clients in ${CLIENTS_VIEW_LABELS[view]}`}
            action={
              <Button
                variant="outline"
                onClick={() => setSearch({ view: undefined, tags: undefined })}
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
            const c = r.customer;
            const next = r.stats.nextBooking;
            const line = next
              ? `Next: ${bookingDate(next.at)}, ${next.allDay ? "all day" : timeInTz(next.at, timezone)}`
              : r.stats.lastVisit
                ? `Last visit ${relativeVisitLabel(r.stats.lastVisit.at, now, timezone).toLowerCase()}`
                : "No visits yet";
            return (
              <li key={c.id}>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className={cn(
                    "flex min-h-[60px] items-center gap-3 px-3.5 py-[11px]",
                    isArchivedClient(c) && "opacity-55",
                  )}
                >
                  <ClientAvatar customer={c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold">
                        {customerDisplayName(c)}
                      </span>
                      {r.pill ? <Pill kind={r.pill} /> : null}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {statsLoading ? "…" : line}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
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
    const sortIcon = (key: ClientsSort) =>
      sort === key ? (
        dir === "asc" ? (
          <ArrowUp className="size-3" aria-hidden />
        ) : (
          <ArrowDown className="size-3" aria-hidden />
        )
      ) : null;
    const head = (key: ClientsSort | null, label: string, className?: string) => (
      <th
        scope="col"
        aria-sort={key && sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}
        className={cn("px-4 py-2.5 text-left text-xs font-bold whitespace-nowrap", className)}
      >
        {key ? (
          <button
            type="button"
            onClick={() => toggleSort(key)}
            className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
          >
            {label}
            {sortIcon(key)}
          </button>
        ) : (
          label
        )}
      </th>
    );
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 84 }} />
            {canMoney ? <col style={{ width: 96 }} /> : null}
            <col style={{ width: 48 }} />
          </colgroup>
          <thead className="h-10 bg-secondary/50 text-muted-foreground">
            <tr>
              {head(null, "Client")}
              {head(null, "Contact")}
              {head("last-visit", "Last visit")}
              {head("next-booking", "Next booking")}
              {head("sessions", "Sessions", "text-right [&>button]:flex-row-reverse")}
              {canMoney ? head("spent", "Spent", "text-right [&>button]:flex-row-reverse") : null}
              <th scope="col" className="px-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const c = r.customer;
              const name = customerDisplayName(c);
              const archived = isArchivedClient(c);
              const lapsed = isLapsed(r.stats, now, timezone);
              const last = r.stats.lastVisit;
              const next = r.stats.nextBooking;
              const lastLabel = last ? relativeVisitLabel(last.at, now, timezone) : "Never";
              const nextLabel = next
                ? `${bookingDate(next.at)} ${next.allDay ? "all day" : timeInTz(next.at, timezone)}`
                : "nothing booked";
              const label = [
                name,
                r.pill ? CLIENT_PILL_LABELS[r.pill].toLowerCase() : null,
                `last visit ${lastLabel.toLowerCase()}`,
                archived ? null : `next booking ${nextLabel}`,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <tr
                  key={c.id}
                  tabIndex={0}
                  aria-label={label}
                  onClick={() => openProfile(c.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProfile(c.id);
                    }
                  }}
                  className={cn(
                    "h-[62px] cursor-pointer border-t transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none",
                    archived && "opacity-55",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <ClientAvatar customer={c} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: c.id }}
                            tabIndex={-1}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-[14.5px] font-bold"
                          >
                            {name}
                          </Link>
                          {r.pill ? <Pill kind={r.pill} /> : null}
                        </span>
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {clientSubline(r, r.pill, {
                            money: canMoney ? money : null,
                            date: shortDate,
                          })}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.emailDisplay ? (
                      <span className="block truncate text-[13px]">{c.emailDisplay}</span>
                    ) : (
                      <span className="block text-[13px] text-muted-foreground italic">
                        No email
                      </span>
                    )}
                    {c.phoneDisplay ? (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {c.phoneDisplay}
                      </span>
                    ) : (
                      <span className="block text-[13px] text-cal-deposit-fg">
                        No mobile · texts off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {statsLoading ? (
                      <StatPlaceholder />
                    ) : (
                      <>
                        <span className="block text-[13.5px]">{lastLabel}</span>
                        {lapsed && !archived ? (
                          <span className="block truncate text-xs text-cal-deposit-fg">
                            Not back in {LAPSED_DAYS} days
                          </span>
                        ) : last ? (
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
                    ) : statsLoading ? (
                      <StatPlaceholder />
                    ) : next ? (
                      <>
                        <span className="block text-[13.5px]">{bookingDate(next.at)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {next.allDay ? "All day" : timeInTz(next.at, timezone)} · {next.service}
                        </span>
                      </>
                    ) : (
                      <span className="text-[13.5px] text-muted-foreground">Nothing booked</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13.5px] tabular-nums">
                    {statsLoading ? "…" : r.stats.sessions}
                  </td>
                  {canMoney ? (
                    <td className="px-4 py-2.5 text-right text-[13.5px] font-bold tabular-nums">
                      {statsLoading ? "…" : money(r.stats.spentMinor)}
                    </td>
                  ) : null}
                  <td className="px-2 py-2.5 text-right">{rowMenu(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const summary = customers.isLoading
    ? undefined
    : statsLoading
      ? clientsSummary({ ...counts, lapsed: 0 })
      : clientsSummary(counts, { lapsed: !phone });

  return (
    <>
      <PageHeader
        title="Clients"
        description={summary}
        actions={
          phone ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className="size-[42px]"
                asChild
                aria-label="Import clients"
              >
                <Link to="/clients/import">
                  <Upload className="size-4" />
                </Link>
              </Button>
              <Button
                size="icon"
                className="size-[42px] bg-ring text-[#10172a] hover:bg-ring/90"
                onClick={() => setAddOpen(true)}
                aria-label="Add client"
              >
                <Plus className="size-5" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link to="/clients/import">
                  <Upload className="size-4" /> Import
                </Link>
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add client
              </Button>
            </>
          )
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
            {tagsFilter}
            {sortSelect}
          </div>
        </>
      )}

      {statsBookings.isError ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Couldn't load booking history, so last visits, next bookings and sessions may be missing.
        </p>
      ) : statsBookings.data && !statsBookings.data.complete ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          Your booking history is too long to read in full here, so some older visits may be
          missing.
        </p>
      ) : null}

      <div className="surface-card overflow-hidden rounded-2xl">
        {body}

        {!phone && filtered.length > 0 && !customers.isLoading ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1} to {Math.min(filtered.length, (page + 1) * PAGE_SIZE)}{" "}
              of {filtered.length}
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

      <AddClientDialog open={addOpen} onClose={() => setAddOpen(false)} openProfileOnCreate />
      <AddBookingModal
        open={bookFor !== null}
        onOpenChange={(o) => {
          if (!o) setBookFor(null);
        }}
        defaultCustomerId={bookFor ?? undefined}
      />
      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {archiveTarget ? customerDisplayName(archiveTarget) : "this client"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll move to the Archived tab and drop out of your client list. Their history is
              kept, and you can unarchive them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveTarget) void setStatus(archiveTarget, "archived");
                setArchiveTarget(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ClientAvatar({ customer }: { customer: Customer }) {
  if (customer.avatarFileId) return <CustomerAvatar customer={customer} size={34} />;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[34px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold",
        AVATAR_TINTS[avatarTintIndex(customer.id)],
      )}
    >
      {initials(customerDisplayName(customer)) || "?"}
    </span>
  );
}

function Pill({ kind }: { kind: ClientPillKind }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        PILL_STYLES[kind],
      )}
    >
      {CLIENT_PILL_LABELS[kind]}
    </span>
  );
}

function StatPlaceholder() {
  return <span className="block h-3.5 w-16 animate-pulse rounded bg-secondary" aria-hidden />;
}
