import { useMemo, useState } from "react";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { StatsGhost, TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type RangeKey = "month" | "30d" | "7d" | "all";

function dashboardRange(key: RangeKey): { from?: string; to?: string; label: string } {
  const now = new Date();
  if (key === "all") return { label: "All time" };
  if (key === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: from.toISOString(), to: to.toISOString(), label: "This month" };
  }
  const days = key === "7d" ? 7 : 30;
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const to = new Date(now);
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: key === "7d" ? "Last 7 days" : "Last 30 days",
  };
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

const CHART_COLOURS = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-5)"];

function Overview() {
  const tenant = useTenant();
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const today = isoDate(new Date());

  const range = useMemo(() => dashboardRange(rangeKey), [rangeKey]);
  const dashboard = useDashboard({ from: range.from, to: range.to });
  const todays = useBookings({ ...todayRange(), enabled: true });
  const scheduled = (todays.data?.bookings ?? [])
    .filter((b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business")
    .sort((a, b) => a.start.localeCompare(b.start));

  const attendanceChart = dashboard.data
    ? [
        { name: "Attended", value: dashboard.data.attendance.attended },
        { name: "No-show", value: dashboard.data.attendance.noShow },
        { name: "Cancelled", value: dashboard.data.attendance.cancelled },
      ].filter((d) => d.value > 0)
    : [];

  const moneyChart = dashboard.data
    ? [
        { name: "Net revenue", value: dashboard.data.revenue.netMinor },
        { name: "Booking value", value: dashboard.data.bookings.valueMinor },
        { name: "Package sales", value: dashboard.data.packages.salesMinor },
      ]
    : [];

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Metrics for {range.label}
            {tenant.currentLocationId !== "all" ? " · filtered by location" : ""}. Omit a range for
            all-time totals.
          </p>
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dashboard.isLoading ? (
          <StatsGhost />
        ) : dashboard.isError ? (
          isPlanGated(dashboard.error) ? (
            <EmptyState
              icon={<Lock className="size-5" />}
              title="Upgrade your plan for reports"
              description="Revenue, attendance and occupancy reporting isn't included on your current plan."
              action={
                <Button variant="outline" asChild>
                  <Link to="/billing">View plans</Link>
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
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={`Revenue · ${range.label}`}
                value={formatMoney(dashboard.data.revenue.netMinor, dashboard.data.basis.currency)}
                hint={`Gross ${formatMoney(dashboard.data.revenue.grossMinor, dashboard.data.basis.currency)} · refunded ${formatMoney(dashboard.data.revenue.refundedMinor, dashboard.data.basis.currency)}`}
                icon={<BadgePoundSterling className="size-4.5" />}
              />
              <StatCard
                label="Bookings"
                value={String(dashboard.data.bookings.count)}
                hint={`Value ${formatMoney(dashboard.data.bookings.valueMinor, dashboard.data.basis.currency)}`}
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
                hint={`${dashboard.data.occupancy.seats} of ${dashboard.data.occupancy.capacity} seats`}
                icon={<Users className="size-4.5" />}
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Money breakdown"
                description="Dashboard has no time-series — folded totals for the selected range."
              >
                {moneyChart.every((d) => d.value === 0) ? (
                  <EmptyState
                    title="No money activity yet"
                    description="Revenue and package sales will appear once bookings are paid."
                  />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moneyChart}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) =>
                            formatMoney(Number(v), dashboard.data!.basis.currency)
                          }
                          width={72}
                        />
                        <Tooltip
                          formatter={(v: number) => formatMoney(v, dashboard.data!.basis.currency)}
                        />
                        <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Metric label="Credits issued" value={String(dashboard.data.credits.issued)} />
                  <Metric
                    label="Credits redeemed"
                    value={String(dashboard.data.credits.redeemed)}
                  />
                  <Metric
                    label="Credits outstanding"
                    value={String(dashboard.data.credits.outstanding)}
                  />
                  <Metric label="Credits expired" value={String(dashboard.data.credits.expired)} />
                </dl>
              </SectionCard>

              <SectionCard title="Attendance mix" description="Attended vs no-show vs cancelled.">
                {attendanceChart.length === 0 ? (
                  <EmptyState
                    title="No attendance data"
                    description="Mark attendance on bookings to populate this chart."
                  />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={attendanceChart}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {attendanceChart.map((_, i) => (
                            <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Basis: {dashboard.data.basis.dateBasis.replace("_", " ")} ·{" "}
                  {dashboard.data.basis.timezone}
                </p>
              </SectionCard>
            </div>
          </>
        ) : null}
      </Can>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
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
            <TableGhost rows={5} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
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
