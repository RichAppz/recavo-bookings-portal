import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgePoundSterling,
  CalendarPlus,
  CalendarX,
  Lock,
  MessageSquarePlus,
  Package,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { BookingPanel } from "@/components/BookingPanel";
import {
  EmptyState,
  PageHeader,
  PersonAvatar,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useBookings,
  useCustomer,
  useDashboard,
  useLocationsList,
  useStaffList,
} from "@/lib/api/hooks";
import type { Booking } from "@/lib/api/types";
import { ApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate, pct, ukDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — RECAVO" },
      {
        name: "description",
        content:
          "Live business overview for RECAVO: today's sessions, revenue, attendance and tasks needing attention.",
      },
      { property: "og:title", content: "Overview — RECAVO" },
      {
        property: "og:description",
        content:
          "Live business overview for RECAVO: today's sessions, revenue, attendance and tasks needing attention.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <Overview />
      </AppShell>
    </RequireAuth>
  ),
});

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Dashboard requires REPORT_READ *and* plan feature `reports.basic` (RECA-157). */
function isPlanGated(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 402 || (error.status === 403 && error.code === "FEATURE_NOT_AVAILABLE"))
  );
}

function Overview() {
  const tenant = useTenant();
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const today = isoDate(new Date());

  const dashboard = useDashboard(monthRange());
  const todays = useBookings({ ...todayRange(), enabled: true });
  const scheduled = (todays.data?.bookings ?? [])
    .filter((b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business")
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <PageHeader
        title={`Good morning${tenant.business ? `, ${tenant.business.tradingName}` : ""}`}
        description={`${scheduled.length} sessions today · ${ukDate(today)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/reports">View reports</Link>
            </Button>
            <Button onClick={() => setBookingOpen(true)}>
              <CalendarPlus className="size-4" /> Add booking
            </Button>
          </>
        }
      />

      <Can
        permission={PERMISSIONS.REPORT_READ}
        fallback={
          <EmptyState
            title="Reports are restricted"
            description="Ask a business owner or administrator to grant you report access to see revenue and attendance."
          />
        }
      >
        {dashboard.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="surface-card h-[124px] animate-pulse" />
            ))}
          </div>
        ) : dashboard.isError ? (
          isPlanGated(dashboard.error) ? (
            <EmptyState
              icon={<Lock className="size-5" />}
              title="Upgrade your plan for reports"
              description="Revenue, attendance and occupancy reporting isn't included on your current plan."
              action={
                <Button variant="outline" asChild>
                  <Link to="/platform">View plans</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Couldn't load dashboard"
              description={
                dashboard.error instanceof ApiError
                  ? dashboard.error.detail || dashboard.error.title
                  : "Please try again shortly."
              }
              action={<Button onClick={() => dashboard.refetch()}>Try again</Button>}
            />
          )
        ) : dashboard.data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue this month"
              value={formatMoney(dashboard.data.revenue.netMinor, dashboard.data.basis.currency)}
              icon={<BadgePoundSterling className="size-4.5" />}
            />
            <StatCard
              label="Bookings this month"
              value={String(dashboard.data.bookings.count)}
              icon={<CalendarPlus className="size-4.5" />}
            />
            <StatCard
              label="Attendance"
              value={String(dashboard.data.attendance.attended)}
              hint={`${dashboard.data.attendance.noShow} no-shows · ${dashboard.data.attendance.cancelled} cancelled`}
              icon={<TrendingUp className="size-4.5" />}
            />
            <StatCard
              label="Occupancy rate"
              value={pct(dashboard.data.occupancy.rate * 100)}
              icon={<Users className="size-4.5" />}
            />
          </div>
        ) : null}
      </Can>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Today"
          description={`${scheduled.length} scheduled sessions`}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/calendar">Open calendar</Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          {todays.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading today's schedule…</p>
          ) : todays.isError ? (
            <p className="p-5 text-sm text-destructive">Couldn't load today's bookings.</p>
          ) : scheduled.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nothing scheduled today"
                description="Add a booking to fill the diary."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {scheduled.map((b) => (
                <TodayRow key={b.id} booking={b} onClick={() => setSelectedBookingId(b.id)} />
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Tasks requiring attention">
            <ul className="space-y-3">
              {[
                {
                  icon: Package,
                  text: "Review packages nearing expiry",
                  to: "/packages" as const,
                  tone: "warning",
                },
                {
                  icon: MessageSquarePlus,
                  text: "Check unread client messages",
                  to: "/messages" as const,
                  tone: "info",
                },
                {
                  icon: AlertTriangle,
                  text: "Confirm staff availability is up to date",
                  to: "/staff" as const,
                  tone: "warning",
                },
              ].map((t) => (
                <li key={t.text}>
                  <Link
                    to={t.to}
                    className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-secondary"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        t.tone === "info"
                          ? "bg-info-soft text-info"
                          : "bg-warning-soft text-warning-foreground"
                      }`}
                    >
                      <t.icon className="size-4" />
                    </span>
                    <span className="min-w-0 text-sm font-medium">{t.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Quick actions">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setBookingOpen(true)}
              >
                <CalendarPlus className="size-4" /> Add booking
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setQuick("client")}
              >
                <UserPlus className="size-4" /> Add client
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("group")}>
                <UsersRound className="size-4" /> Group session
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("block")}>
                <CalendarX className="size-4" /> Block time
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setQuick("package")}
              >
                <Package className="size-4" /> Sell package
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setQuick("message")}
              >
                <MessageSquarePlus className="size-4" /> Send message
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <AddBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <BookingPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
    </>
  );
}

function TodayRow({ booking, onClick }: { booking: Booking; onClick: () => void }) {
  const staff = useStaffList();
  const locations = useLocationsList();
  const customer = useCustomer(booking.leadCustomerId);
  const trainer = staff.data?.find((s) => s.id === booking.staffId);
  const location = locations.data?.find((l) => l.id === booking.locationId);
  const timezone = booking.timezone || "Europe/London";

  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="w-16 shrink-0">
          <p className="text-sm font-semibold tabular-nums">
            {formatInTz(booking.start, timezone, { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatInTz(booking.end, timezone, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {booking.serviceSnapshot.name}
            {booking.attendees.length > 1 ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {booking.seatCount} of {booking.attendees.length} booked
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.data ? customerDisplayName(customer.data) : "…"} ·{" "}
            {trainer?.displayName ?? "—"} · {location?.name ?? "—"}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <StatusBadge status={booking.status} />
          <StatusBadge status={booking.attendanceStatus} />
        </div>
        <PersonAvatar name={trainer?.displayName ?? "?"} size={32} />
      </button>
    </li>
  );
}
