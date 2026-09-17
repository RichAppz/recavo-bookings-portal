import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Hourglass, Plus } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog } from "@/components/AddWaitlistDialog";
import { WaitlistActions } from "@/components/WaitlistActions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
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
import { useLocationsList, useServices, useWaitlist } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import type { WaitlistEntry, WaitlistStatus } from "@/lib/api/types";
import { isoDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  WAITLIST_STATUS_LABELS,
  customerName,
  describePreferences,
  suggestedBookingDate,
  waitingSince,
} from "@/lib/waitlist";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `?date=YYYY-MM-DD` (from the "slot opened" nudge) or `?from=&to=` (from the calendar
 * pill) narrow the list to entries whose preferred window covers those days.
 */
const searchSchema = z.object({
  date: z.string().regex(ISO_DATE).optional(),
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
});

export const Route = createFileRoute("/waitlist")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Waitlist — RECAVO" },
      {
        name: "description",
        content:
          "Clients waiting for a slot — who wants what, roughly when, and one tap to book them in.",
      },
      { property: "og:title", content: "RECAVO Waitlist" },
      {
        property: "og:description",
        content: "Never lose an enquiry because the diary was full.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <WaitlistPage />
      </AppShell>
    </RequireAuth>
  ),
});

type View = "waiting" | "booked" | "closed" | "all";

const VIEW_STATUSES: Record<View, WaitlistStatus[] | undefined> = {
  waiting: ["waiting"],
  booked: ["booked"],
  closed: ["cancelled", "expired"],
  all: ["waiting", "booked", "cancelled", "expired"],
};

const STATUS_TONE: Record<WaitlistStatus, string> = {
  waiting: "bg-primary-soft text-primary",
  booked: "bg-success/15 text-success",
  cancelled: "bg-secondary text-secondary-foreground",
  expired: "bg-secondary text-secondary-foreground",
};

function WaitlistPage() {
  const tenant = useTenant();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canBook = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const recordNoun = tenant.terminology.linkedRecord.toLowerCase();
  const bookingNoun = tenant.terminology.booking.toLowerCase();

  const [view, setView] = useState<View>("waiting");
  const [serviceId, setServiceId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const from = search.date ?? search.from;
  const to = search.date ?? search.to;

  const services = useServices();
  const locations = useLocationsList();
  const entries = useWaitlist({
    status: VIEW_STATUSES[view],
    serviceId: serviceId === "all" ? undefined : serviceId,
    locationId: locationId === "all" ? undefined : locationId,
    from,
    to,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WaitlistEntry | null>(null);
  const [booking, setBooking] = useState<WaitlistEntry | null>(null);

  // High priority first within what the API sends (it orders by preferred start).
  const rows = useMemo(() => {
    const items = [...entries.items];
    if (view !== "waiting") return items;
    return items.sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high"));
  }, [entries.items, view]);

  const serviceList = services.data ?? [];
  const locationList = locations.data ?? [];
  const setDates = (next: { from?: string; to?: string }) =>
    void navigate({
      search: {
        ...(next.from ? { from: next.from } : {}),
        ...(next.to ? { to: next.to } : {}),
      },
      replace: true,
    });

  return (
    <>
      <PageHeader
        title="Waitlist"
        description={`Clients who wanted a ${bookingNoun} but couldn't get a slot. You're nudged when a cancellation frees matching time — book them in from here.`}
        actions={
          canBook ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add to waitlist
            </Button>
          ) : undefined
        }
      />

      <div className="surface-card overflow-hidden **:min-w-0">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_1fr]">
          <Select value={view} onValueChange={(v) => setView(v as View)}>
            <SelectTrigger className="w-full lg:w-44" aria-label="Show">
              <SelectValue placeholder="Show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="booked">Booked in</SelectItem>
              <SelectItem value="closed">Removed</SelectItem>
              <SelectItem value="all">Everything</SelectItem>
            </SelectContent>
          </Select>
          {serviceList.length > 1 ? (
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="w-full lg:w-52" aria-label="Service">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {serviceList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {locationList.length > 1 ? (
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-full lg:w-48" aria-label="Location">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locationList.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="flex items-center gap-2 lg:justify-end">
            <Input
              type="date"
              aria-label="Window from"
              className="w-full lg:w-40"
              value={from ?? ""}
              onChange={(e) => setDates({ from: e.target.value || undefined, to })}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="Window to"
              className="w-full lg:w-40"
              value={to ?? ""}
              min={from}
              onChange={(e) => setDates({ from, to: e.target.value || undefined })}
            />
            {from || to ? (
              <Button variant="ghost" size="sm" onClick={() => setDates({})}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {entries.isLoading || tenant.isLoading ? (
          <TableGhost rows={4} />
        ) : entries.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load the waitlist"
              description={
                entries.error instanceof ApiError
                  ? entries.error.detail || entries.error.title
                  : "Please try again shortly."
              }
              action={<Button onClick={() => entries.refetch()}>Try again</Button>}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Hourglass className="size-6" />}
              title={view === "waiting" && !from && !to ? "Nobody's waiting" : "Nothing here"}
              description={
                view === "waiting" && !from && !to
                  ? `When the diary's full, add the client here instead of turning them away — or they can join themselves from your booking page. You'll be nudged when a slot frees.`
                  : "Nothing matches these filters."
              }
              action={
                canBook && view === "waiting" && !from && !to ? (
                  <Button onClick={() => setAdding(true)}>
                    <Plus className="size-4" />
                    Add to waitlist
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="divide-y">
            <ul className="divide-y">
              {rows.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: e.customerId }}
                        className="font-medium hover:underline"
                      >
                        {customerName(e)}
                      </Link>
                      {e.linkedRecord ? (
                        <span
                          className="text-sm text-muted-foreground"
                          title={tenant.terminology.linkedRecord}
                        >
                          · {e.linkedRecord.label}
                        </span>
                      ) : null}
                      {e.priority === "high" ? (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                          High priority
                        </span>
                      ) : null}
                      {view !== "waiting" ? (
                        <StatusBadge status={e.status} className={cn(STATUS_TONE[e.status])} />
                      ) : null}
                    </div>
                    <p className="text-sm">
                      {e.service?.name ?? "Service"}
                      {e.variant ? (
                        <span className="text-muted-foreground"> · {e.variant.name}</span>
                      ) : null}
                      {e.location ? (
                        <span className="text-muted-foreground"> · {e.location.name}</span>
                      ) : null}
                      {e.staff ? (
                        <span className="text-muted-foreground"> · with {e.staff.displayName}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-foreground/80">
                        {describePreferences(e.preferences)}
                      </span>
                      {" · "}
                      {waitingSince(e.createdAt)}
                      {e.source === "public" ? " · joined from your booking page" : ""}
                      {e.status === "booked" && e.booking
                        ? ` · booked as ${e.booking.reference}`
                        : ""}
                    </p>
                    {e.notes ? (
                      <p className="text-xs text-muted-foreground italic">“{e.notes}”</p>
                    ) : null}
                    <p className="sr-only">
                      {WAITLIST_STATUS_LABELS[e.status]}
                      {e.linkedRecord ? ` for ${recordNoun} ${e.linkedRecord.label}` : ""}
                    </p>
                  </div>
                  {canBook ? (
                    <div className="shrink-0 self-end sm:self-start">
                      <WaitlistActions entry={e} onBook={setBooking} onEdit={setEditing} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {entries.hasNextPage ? (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => entries.fetchNextPage()}
                  disabled={entries.isFetchingNextPage}
                >
                  {entries.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AddWaitlistDialog open={adding} onOpenChange={setAdding} />
      <AddWaitlistDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        entry={editing}
      />

      {/* "Book": client, service, vehicle, place, person and the day they wanted are filled in. */}
      <AddBookingModal
        key={booking?.id ?? "none"}
        open={booking !== null}
        onOpenChange={(open) => {
          if (!open) setBooking(null);
        }}
        defaultCustomerId={booking?.customerId}
        defaultServiceId={booking?.serviceId}
        defaultLinkedRecordId={booking?.linkedRecordId ?? undefined}
        defaultStaffId={booking?.staffId ?? undefined}
        defaultDate={
          booking ? suggestedBookingDate(booking.preferences, isoDate(new Date())) : undefined
        }
        waitlistEntryId={booking?.id}
      />
    </>
  );
}
