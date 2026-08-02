import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { EmptyState, PageHeader, PersonAvatar, StatusBadge } from "@/components/ui-bits";
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
import {
  useBookings,
  useCustomer,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { customerDisplayName, type Booking } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";

export const Route = createFileRoute("/bookings")({
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

const PAGE_SIZE = 10;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function BookingsPage() {
  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(isoDate(addDays(new Date(), -14)));
  const [toDate, setToDate] = useState(isoDate(addDays(new Date(), 30)));
  const [page, setPage] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const staff = useStaffList();
  const services = useServices();
  const locations = useLocationsList();

  const bookings = useBookings({
    from: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
    to: new Date(`${toDate}T00:00:00.000Z`).toISOString(),
    staffId: staffFilter !== "all" ? staffFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (bookings.data?.bookings ?? [])
      .filter(
        (b) =>
          (serviceFilter === "all" || b.serviceSnapshot.serviceId === serviceFilter) &&
          (!q || b.reference.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [bookings.data, serviceFilter, query]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Bookings"
        description={`${rows.length} bookings match your filters`}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <CalendarPlus className="size-4" /> Create booking
          </Button>
        }
      />

      <div className="surface-card space-y-3 p-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by booking reference"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Trainer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {(services.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any booking status</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="awaiting_payment">Awaiting payment</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled_by_customer">Cancelled by client</SelectItem>
              <SelectItem value="cancelled_by_business">Cancelled by business</SelectItem>
              <SelectItem value="late_cancelled">Late cancellation</SelectItem>
              <SelectItem value="no_show">No-show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {bookings.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading bookings…</p>
        ) : bookings.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load bookings"
              description="Try adjusting the date range and search again."
            />
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No bookings found"
              description="Try widening the date range or clearing a filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStaffFilter("all");
                    setServiceFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Reference",
                    "Date and time",
                    "Client",
                    "Service",
                    "Trainer",
                    "Location",
                    "Amount",
                    "Status",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    trainerName={staff.data?.find((s) => s.id === b.staffId)?.displayName ?? "—"}
                    locationName={locations.data?.find((l) => l.id === b.locationId)?.name ?? "—"}
                    onSelect={() => setSelectedBookingId(b.id)}
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
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <AddBookingModal open={addOpen} onOpenChange={setAddOpen} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}

function BookingRow({
  booking,
  trainerName,
  locationName,
  onSelect,
}: {
  booking: Booking;
  trainerName: string;
  locationName: string;
  onSelect: () => void;
}) {
  const customer = useCustomer(booking.leadCustomerId);
  const timezone = booking.timezone || "Europe/London";

  return (
    <tr onClick={onSelect} className="cursor-pointer transition-colors hover:bg-secondary/50">
      <td className="px-4 py-3 font-medium whitespace-nowrap">{booking.reference}</td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
        {formatInTz(booking.start, timezone, { dateStyle: "medium", timeStyle: "short" })}
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <PersonAvatar name={customer.data ? customerDisplayName(customer.data) : "?"} size={28} />
          {booking.attendees.length > 1
            ? `${booking.seatCount} attendees`
            : customer.data
              ? customerDisplayName(customer.data)
              : "…"}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">{booking.serviceSnapshot.name}</td>
      <td className="px-4 py-3 whitespace-nowrap">{trainerName}</td>
      <td className="px-4 py-3 whitespace-nowrap">{locationName}</td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
        {formatMoney(booking.priceMinor, booking.currency)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={booking.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm">
          View
        </Button>
      </td>
    </tr>
  );
}
