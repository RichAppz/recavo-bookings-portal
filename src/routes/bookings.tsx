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
import { useDemo } from "@/lib/demo-store";
import type { Booking } from "@/lib/demo-data";
import { gbp, ukDate } from "@/lib/format";

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
      { property: "og:description", content: "Manage every session booking in one filterable table." },
    ],
  }),
  component: BookingsPage,
});

const PAGE_SIZE = 8;

function BookingsPage() {
  const demo = useDemo();
  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    return demo.bookings
      .filter((b) => {
        const client = demo.clientById(b.clientIds[0])?.name.toLowerCase() ?? "";
        const q = query.toLowerCase().trim();
        return (
          (!q || client.includes(q) || b.ref.toLowerCase().includes(q)) &&
          (staffFilter === "all" || b.staffId === staffFilter) &&
          (locationFilter === "all" || b.locationId === locationFilter) &&
          (serviceFilter === "all" || b.serviceId === serviceFilter) &&
          (statusFilter === "all" || b.status === statusFilter) &&
          (paymentFilter === "all" || b.paymentStatus === paymentFilter)
        );
      })
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [demo, query, staffFilter, locationFilter, serviceFilter, statusFilter, paymentFilter]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <AppShell>
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
            placeholder="Search by client name or booking reference"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger><SelectValue placeholder="Trainer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              {demo.staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {demo.locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {demo.services.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any payment status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any booking status</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="awaiting_payment">Awaiting payment</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="late_cancellation">Late cancellation</SelectItem>
              <SelectItem value="no_show">No-show</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {pageRows.length === 0 ? (
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
                    setLocationFilter("all");
                    setServiceFilter("all");
                    setStatusFilter("all");
                    setPaymentFilter("all");
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
                  {["Reference", "Date and time", "Client", "Service", "Trainer", "Location", "Payment", "Status", ""].map(
                    (h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((b) => {
                  const client = demo.clientById(b.clientIds[0]);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelected(b)}
                      className="cursor-pointer transition-colors hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{b.ref}</td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {ukDate(b.date)} · {b.time}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <PersonAvatar name={client?.name ?? ""} src={client?.avatar} size={28} />
                          {b.capacity > 2 ? `${b.booked} attendees` : client?.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{demo.serviceById(b.serviceId).name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{demo.staffById(b.staffId).name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{demo.locationById(b.locationId).name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          {gbp(b.amount)} <StatusBadge status={b.paymentStatus} />
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm">View</Button>
                      </td>
                    </tr>
                  );
                })}
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
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {pages}</span>
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
      <BookingPanel booking={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}
