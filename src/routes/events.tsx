import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EventModal } from "@/components/EventModal";
import { EmptyState, PageHeader, PersonAvatar } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useCalendarBlocks, useLocationsList, useStaffList } from "@/lib/api/hooks";
import type { CalendarBlock } from "@/lib/api/types";
import { formatInTz, isoDate, spansDays } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events — RECAVO" },
      {
        name: "description",
        content:
          "Staff events on the diary — dentist, school run, training — that keep bookings off that time.",
      },
      { property: "og:title", content: "RECAVO Events" },
      {
        property: "og:description",
        content: "See and manage every staff event in one filterable list.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <EventsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const PAGE_SIZE = 10;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Staff events ("calendar blocks", RECA-531) as a list, the way Bookings is for
 * bookings. The calendar shows them in place; this is where you find one by name
 * or see everything a staff member has coming up.
 */
function EventsPage() {
  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  // Events are mostly forward-looking (the school run next week), so the window
  // leans ahead rather than behind.
  const [fromDate, setFromDate] = useState(isoDate(addDays(new Date(), -7)));
  const [toDate, setToDate] = useState(isoDate(addDays(new Date(), 60)));
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarBlock | null>(null);

  const tenant = useTenant();
  const staff = useStaffList();
  const locations = useLocationsList();
  const staffNoun = tenant.terminology.staff || "Staff member";
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";

  const blocks = useCalendarBlocks({
    from: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
    // The range is half-open, so step past the chosen end day to include all of it.
    to: addDays(new Date(`${toDate}T00:00:00.000Z`), 1).toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
  });

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (blocks.data ?? [])
      .filter(
        (b) =>
          b.status === "active" &&
          (!q || b.title.toLowerCase().includes(q) || (b.notes ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [blocks.data, query]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Events"
        description={`${rows.length} ${rows.length === 1 ? "event" : "events"} match your filters`}
        actions={
          <Button onClick={openNew}>
            <Clock className="size-4" /> Add event
          </Button>
        }
      />

      <div className="surface-card space-y-3 p-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by title or notes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(0);
            }}
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(0);
            }}
          />
          <Select
            value={staffFilter}
            onValueChange={(v) => {
              setStaffFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
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
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {blocks.isLoading ? (
          <TableGhost />
        ) : blocks.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load events"
              description="Try adjusting the date range and search again."
            />
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Clock className="size-5" />}
              title="No events found"
              description="Events are personal time on a staff diary — a dentist appointment, the school run — that bookings can't land on."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setStaffFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button onClick={openNew}>
                    <Clock className="size-4" /> Add event
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {["Event", "Date and time", staffNoun, "Location", "Notes"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((b) => (
                  <EventRow
                    key={b.id}
                    block={b}
                    timezone={timezone}
                    staffName={staff.data?.find((s) => s.id === b.staffId)?.displayName ?? "—"}
                    locationName={
                      b.locationId
                        ? (locations.data?.find((l) => l.id === b.locationId)?.name ?? "—")
                        : "All locations"
                    }
                    onSelect={() => {
                      setEditing(b);
                      setModalOpen(true);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min(rows.length, (page + 1) * PAGE_SIZE)} of {rows.length}
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
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <EventModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setEditing(null);
        }}
        block={editing}
      />
    </>
  );
}

function EventRow({
  block,
  timezone,
  staffName,
  locationName,
  onSelect,
}: {
  block: CalendarBlock;
  timezone: string;
  staffName: string;
  locationName: string;
  onSelect: () => void;
}) {
  const start = formatInTz(block.start, timezone, { dateStyle: "medium", timeStyle: "short" });
  const end = spansDays(block.start, block.end, timezone)
    ? formatInTz(block.end, timezone, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : formatInTz(block.end, timezone, { timeStyle: "short" });

  return (
    <tr className="cursor-pointer transition-colors hover:bg-secondary/40" onClick={onSelect}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: block.colour }}
          />
          <span className="font-medium">{block.title}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
        {start} – {end}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <PersonAvatar name={staffName} size={24} />
          <span className="whitespace-nowrap">{staffName}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{locationName}</td>
      <td className="max-w-[28ch] truncate px-4 py-3 text-muted-foreground">{block.notes ?? ""}</td>
    </tr>
  );
}
