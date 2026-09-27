import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { addDays } from "date-fns";
import { Banknote, CalendarDays, Car, ChevronRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PersonAvatar } from "@/components/ui-bits";
import {
  useBookings,
  useCustomers,
  useCustomersBookings,
  useLinkedRecordsInfinite,
  usePackages,
} from "@/lib/api/hooks";
import { customerDisplayName, type Booking, type LinkedRecordWithOwner } from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/** A destination the current user can see in the sidebar. */
export type SearchablePage = {
  to: string;
  label: string;
  icon: typeof Search;
};

const MAX_PER_GROUP = 5;
/** Bookings are matched client-side, so keep the window to what people actually look for. */
const BOOKINGS_LOOKBACK_DAYS = 30;
const BOOKINGS_LOOKAHEAD_DAYS = 60;
/** When the query finds clients, their jobs (any date) are pulled in too — for this many clients. */
const CLIENT_JOBS_FOR = 3;

/** Trigger + palette. Opens on click or ⌘K / Ctrl+K anywhere in the console. */
export function GlobalSearch({ pages }: { pages: SearchablePage[] }) {
  const [open, setOpen] = useState(false);
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 max-w-sm flex-1 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent/40 md:flex"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="size-5" />
      </Button>
      {open ? <SearchPalette pages={pages} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Mounted only while open so every search starts empty and no queries run in
 * the background. Clients and records search server-side; packages and bookings
 * are small enough to match locally against what the pages already load.
 */
function SearchPalette({ pages, onClose }: { pages: SearchablePage[]; onClose: () => void }) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const query = useDebounced(raw.trim(), 180);
  const q = query.toLowerCase();
  const active = q.length > 1;

  const canClients = tenant.can(PERMISSIONS.CUSTOMER_READ);
  const canAllBookings = tenant.can(PERMISSIONS.BOOKING_READ_ALL);
  const canBookings = canAllBookings || tenant.can(PERMISSIONS.BOOKING_READ_OWN);
  const canPackages =
    tenant.can(PERMISSIONS.PACKAGE_MANAGE) || tenant.can(PERMISSIONS.BUSINESS_READ);
  const hasRecords = pages.some((p) => p.to === "/vehicles");

  const customers = useCustomers({ search: query, enabled: active && canClients });
  const records = useLinkedRecordsInfinite({
    search: query,
    status: "active",
    enabled: active && canClients && hasRecords,
  });
  const packages = usePackages();
  const window = useMemo(() => {
    const now = new Date();
    return {
      from: addDays(now, -BOOKINGS_LOOKBACK_DAYS).toISOString(),
      to: addDays(now, BOOKINGS_LOOKAHEAD_DAYS).toISOString(),
    };
  }, []);
  const bookings = useBookings({ ...window, limit: 200, enabled: active && canBookings });

  const tz = tenant.business?.defaultTimezone ?? "Europe/London";
  const recordTerm = tenant.terminology.linkedRecord || "Record";
  const recordsHeading = recordTerm.toLowerCase().endsWith("s") ? recordTerm : `${recordTerm}s`;
  const clientsHeading = pages.find((p) => p.to === "/clients")?.label ?? "Clients";
  const bookingsHeading = pages.find((p) => p.to === "/bookings")?.label ?? "Bookings";

  const pageHits = useMemo(
    () => (q ? pages.filter((p) => p.label.toLowerCase().includes(q)) : pages).slice(0, 6),
    [pages, q],
  );
  const clientHits = active ? (customers.data?.items ?? []).slice(0, MAX_PER_GROUP) : [];
  // A matched client's jobs belong in the results even when they fall outside the
  // date window or the booking was made under a different attendee name.
  const clientJobs = useCustomersBookings(
    clientHits.slice(0, CLIENT_JOBS_FOR).map((c) => c.id),
    active && canAllBookings,
  );
  const recordHits = active ? records.items.slice(0, MAX_PER_GROUP) : [];
  const packageHits = useMemo(() => {
    if (!active || !canPackages) return [];
    return (packages.data ?? [])
      .filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
      )
      .slice(0, MAX_PER_GROUP);
  }, [active, canPackages, packages.data, q]);
  const bookingHits = useMemo(() => {
    if (!active) return [];
    const byId = new Map<string, Booking>();
    for (const b of clientJobs.bookings) byId.set(b.id, b);
    for (const b of bookings.data?.bookings ?? []) if (bookingMatches(b, q)) byId.set(b.id, b);
    const nowIso = new Date().toISOString();
    return [...byId.values()]
      .sort((a, b) => compareForSearch(a, b, nowIso))
      .slice(0, MAX_PER_GROUP);
  }, [active, bookings.data, clientJobs.bookings, q]);

  const searching =
    active &&
    (customers.isFetching ||
      records.isFetching ||
      bookings.isFetching ||
      clientJobs.isFetching ||
      packages.isFetching);
  const nothing =
    active &&
    !searching &&
    pageHits.length +
      clientHits.length +
      recordHits.length +
      packageHits.length +
      bookingHits.length ===
      0;

  const go = (
    to: string,
    opts?: { params?: Record<string, string>; search?: Record<string, string> },
  ) => {
    onClose();
    void navigate({
      to,
      ...(opts?.params ? { params: opts.params } : {}),
      ...(opts?.search ? { search: opts.search } : {}),
    } as never);
  };

  return (
    <CommandDialog open onOpenChange={(v) => (v ? undefined : onClose())} shouldFilter={false}>
      <CommandInput
        value={raw}
        onValueChange={setRaw}
        placeholder={`Search ${clientsHeading.toLowerCase()}, ${bookingsHeading.toLowerCase()}, packages and pages…`}
      />
      <CommandList className="max-h-[60vh]">
        {nothing ? <CommandEmpty>No matches for “{query}”.</CommandEmpty> : null}
        {searching && !nothing ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
        ) : null}

        {pageHits.length > 0 ? (
          <CommandGroup heading="Pages">
            {pageHits.map((p) => (
              <CommandItem key={p.to} value={`page:${p.to}`} onSelect={() => go(p.to)}>
                <p.icon className="text-muted-foreground" />
                <span className="flex-1">{p.label}</span>
                <ChevronRight className="text-muted-foreground/60" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {clientHits.length > 0 ? (
          <CommandGroup heading={clientsHeading}>
            {clientHits.map((c) => (
              <CommandItem
                key={c.id}
                value={`client:${c.id}`}
                onSelect={() => go("/clients/$clientId", { params: { clientId: c.id } })}
              >
                <PersonAvatar name={customerDisplayName(c)} size={24} />
                <span className="flex-1 truncate">{customerDisplayName(c)}</span>
                {c.emailDisplay || c.phoneDisplay ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {c.emailDisplay || c.phoneDisplay}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {bookingHits.length > 0 ? (
          <CommandGroup heading={bookingsHeading}>
            {bookingHits.map((b) => (
              <CommandItem
                key={b.id}
                value={`booking:${b.id}`}
                onSelect={() => go("/bookings", { search: { booking: b.id } })}
              >
                <CalendarDays className="text-muted-foreground" />
                <span className="flex-1 truncate">
                  {b.serviceSnapshot.name}
                  {leadName(b) ? ` · ${leadName(b)}` : ""}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {b.reference} · {formatInTz(b.start, b.timezone || tz, { dateStyle: "medium" })}
                  {statusNote(b) ? ` · ${statusNote(b)}` : ""}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {recordHits.length > 0 ? (
          <CommandGroup heading={recordsHeading}>
            {recordHits.map((r) => (
              <CommandItem
                key={r.record.id}
                value={`record:${r.record.id}`}
                onSelect={() =>
                  r.owner
                    ? go("/clients/$clientId", {
                        params: { clientId: r.owner.id },
                        search: { tab: "linked", record: r.record.id },
                      })
                    : go("/vehicles")
                }
              >
                <Car className="text-muted-foreground" />
                <span className="flex-1 truncate">{recordLabel(r)}</span>
                {r.owner ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {[r.owner.firstName, r.owner.lastName ?? ""].join(" ").trim()}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {packageHits.length > 0 ? (
          <CommandGroup heading="Packages">
            {packageHits.map((p) => (
              <CommandItem key={p.id} value={`package:${p.id}`} onSelect={() => go("/packages")}>
                <Banknote className="text-muted-foreground" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMoney(p.priceMinor, p.currency)}
                  {p.active ? "" : " · inactive"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!active && pageHits.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-5" />
            Type at least two characters to search.
          </p>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

function leadName(b: Booking): string {
  return b.attendees?.find((a) => a.isLead)?.name ?? b.attendees?.[0]?.name ?? "";
}

function bookingMatches(b: Booking, q: string): boolean {
  if (b.reference.toLowerCase().includes(q)) return true;
  if (b.serviceSnapshot.name.toLowerCase().includes(q)) return true;
  return (b.attendees ?? []).some((a) => a.name.toLowerCase().includes(q));
}

const DEAD_STATUSES = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
]);

/** What someone searching a name wants first: their next job, then recent ones, then anything cancelled. */
function compareForSearch(a: Booking, b: Booking, nowIso: string): number {
  const rank = (x: Booking) => (DEAD_STATUSES.has(x.status) ? 2 : x.start >= nowIso ? 0 : 1);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  // Upcoming: soonest first. Past / cancelled: most recent first.
  return ra === 0 ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start);
}

function statusNote(b: Booking): string {
  switch (b.status) {
    case "cancelled_by_customer":
    case "cancelled_by_business":
    case "late_cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "no_show":
      return "no-show";
    case "awaiting_payment":
      return "awaiting payment";
    case "held":
    case "draft":
      return "not confirmed";
    default:
      return "";
  }
}

/** Display label, else the first few scalar values (reg · make · model). */
function recordLabel(r: LinkedRecordWithOwner): string {
  if (r.record.displayLabel) return r.record.displayLabel;
  return Object.values((r.record.values ?? {}) as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .slice(0, 3)
    .map(String)
    .join(" · ");
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
