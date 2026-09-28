import { useMemo, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgePoundSterling,
  CalendarPlus,
  CalendarX,
  CarFront,
  Clock,
  Eye,
  Hourglass,
  Lock,
  MessageSquarePlus,
  Package,
  Sparkles,
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
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { ChartTooltip } from "@/components/ChartTooltip";
import { AddBookingModal } from "@/components/AddBookingModal";
import { AddWaitlistDialog, type WaitlistDialogDefaults } from "@/components/AddWaitlistDialog";
import { EventModal } from "@/components/EventModal";
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
import { TakingsBreakdown } from "@/components/TakingsBreakdown";
import { PageGhost, StatsGhost, TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
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
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { saasPurchasesAllowedInApp } from "@/lib/native";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useBookings,
  useBusinessOnboarding,
  useCalendarBlocks,
  useCustomer,
  useDashboard,
  useLocationsList,
  useStaffList,
  useWaitlistSummary,
} from "@/lib/api/hooks";
import { useUpsellOffersSummary } from "@/lib/api/upsells";
import type { Booking, CalendarBlock } from "@/lib/api/types";
import { ApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney, isAllDayEvent, isoDate, pct, ukDate } from "@/lib/format";
import { currentMonthRange, lastDaysRange } from "@/lib/report-range";
import { localDay, segmentOn } from "@/lib/working-days";
import { isSessionEntry } from "@/lib/session-landing";
import { useSoleLocation, useSoleStaff, useSoloPlan } from "@/lib/sole";
import { OVERVIEW_CARDS, useHiddenOverviewCards, type OverviewCardKey } from "@/lib/overview-cards";

/** "Job" → "jobs", "Session" → "sessions"; `count` picks singular/plural. */
function nounFor(noun: string, count: number): string {
  const lower = noun.trim().toLowerCase() || "booking";
  if (count === 1) return lower;
  return lower.endsWith("s") ? lower : `${lower}s`;
}

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
        <Home />
      </AppShell>
    </RequireAuth>
  ),
});

type RangeKey = "month" | "30d" | "7d" | "all";

/** Buckets are calendar periods in the business's zone, matching the Reports page. */
function dashboardRange(
  key: RangeKey,
  timeZone: string,
): { from?: string; to?: string; label: string } {
  if (key === "all") return { label: "All time" };
  if (key === "month") {
    return { ...currentMonthRange(timeZone), label: "This month" };
  }
  const days = key === "7d" ? 7 : 30;
  return {
    ...lastDaysRange(days, timeZone),
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

/**
 * Once setup is done the working view is the calendar, so that is where the app
 * opens. While the checklist is still in progress the Overview (which hosts it)
 * stays the landing page.
 */
function Home() {
  // Captured on first render, before the shell marks the session as landed.
  const [entry] = useState(isSessionEntry);
  const onboarding = useBusinessOnboarding();

  if (entry) {
    if (onboarding.isLoading) return <PageGhost />;
    const status = onboarding.data?.status;
    if (status === "complete" || status === "dismissed") {
      return <Navigate to="/calendar" replace />;
    }
  }
  return <Overview />;
}

function Overview() {
  const tenant = useTenant();
  const businessTimezone = tenant.business?.defaultTimezone ?? "Europe/London";
  // The page speaks the trade's language: a detailer completes jobs and fills a
  // diary; a trainer has attendance and seats in a session.
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const bookingNoun = tenant.terminology.booking;
  const Bookings = `${bookingNoun.trim() || "Booking"}s`;
  const cards = useHiddenOverviewCards(tenant.businessId);
  const cardLabels: Record<OverviewCardKey, string> = {
    stats: "Key numbers",
    money: "Money breakdown",
    attendance: isCarDetailing ? "Job outcomes" : "Attendance mix",
    tasks: "Tasks requiring attention",
    quick: "Quick actions",
  };
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [waitlistDefaults, setWaitlistDefaults] = useState<WaitlistDialogDefaults | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarBlock | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const today = isoDate(new Date());

  const range = useMemo(
    () => dashboardRange(rangeKey, businessTimezone),
    [rangeKey, businessTimezone],
  );
  const dashboard = useDashboard({ from: range.from, to: range.to });
  const waitlistSummary = useWaitlistSummary({ enabled: tenant.can(PERMISSIONS.BOOKING_READ_ALL) });
  const waiting = waitlistSummary.data?.waiting ?? 0;
  const upsellSummary = useUpsellOffersSummary({
    enabled: tenant.can(PERMISSIONS.BOOKING_READ_ALL),
  });
  const addOnRequests = upsellSummary.data?.requested ?? 0;
  // On Solo the Staff menu item is hidden; this task is the owner's way to their hours.
  const soloPlan = useSoloPlan();
  const todays = useBookings({ ...todayRange(), enabled: true });
  const scheduled = (todays.data?.bookings ?? [])
    .filter((b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business")
    // A multi-day job that skips today (the weekend between Fri and Mon) isn't today's work.
    .filter((b) => {
      const zone = b.timezone || businessTimezone;
      return segmentOn(b, localDay(new Date().toISOString(), zone), zone) !== null;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  // Staff events (dentist, school run) share the diary, so they belong in "Today" too.
  const todaysEvents = useCalendarBlocks({ ...todayRange() });
  const events = todaysEvents.data ?? [];
  const todayItems = [
    ...scheduled.map((item) => ({ kind: "booking" as const, item })),
    ...events.map((item) => ({ kind: "event" as const, item })),
  ].sort((a, b) => a.item.start.localeCompare(b.item.start));

  const attendanceChart = dashboard.data
    ? [
        {
          name: isCarDetailing ? "Completed" : "Attended",
          value: dashboard.data.attendance.attended,
        },
        { name: "No-show", value: dashboard.data.attendance.noShow },
        { name: "Cancelled", value: dashboard.data.attendance.cancelled },
      ].filter((d) => d.value > 0)
    : [];

  const moneyChart = dashboard.data
    ? [
        { name: "Net revenue", value: dashboard.data.revenue.netMinor },
        { name: `${bookingNoun} value`, value: dashboard.data.bookings.valueMinor },
        { name: "Package sales", value: dashboard.data.packages.salesMinor },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={`Good morning${tenant.business ? `, ${tenant.business.tradingName}` : ""}`}
        description={`${scheduled.length} ${nounFor(bookingNoun, scheduled.length)} today · ${ukDate(today)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/reports">View reports</Link>
            </Button>
            <Button onClick={() => setBookingOpen(true)}>
              <CalendarPlus className="size-4" /> Add {nounFor(bookingNoun, 1)}
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
            {range.label}
            {tenant.currentLocationId !== "all" ? " · this location only" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Choose which cards to show"
                  title="Choose which cards to show"
                  className="relative"
                >
                  <Eye className="size-4" />
                  {cards.hiddenCount > 0 ? (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {cards.hiddenCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Show on this page</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {OVERVIEW_CARDS.map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={!cards.isHidden(key)}
                    onCheckedChange={(checked) => cards.setCardHidden(key, !checked)}
                  >
                    {cardLabels[key]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Hidden cards stay hidden on this device. Today is always shown.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {dashboard.isLoading ? (
          <StatsGhost />
        ) : dashboard.isError ? (
          isPlanGated(dashboard.error) ? (
            <EmptyState
              icon={<Lock className="size-5" />}
              title={
                saasPurchasesAllowedInApp()
                  ? "Upgrade your plan for reports"
                  : "Reports aren't on your plan"
              }
              description="Revenue, attendance and occupancy reporting isn't included on your current plan."
              action={
                // Pointer to plans only where they can be bought (saasPurchasesAllowedInApp).
                saasPurchasesAllowedInApp() ? (
                  <Button variant="outline" asChild>
                    <Link to="/settings" search={{ tab: "billing" }}>
                      View plans
                    </Link>
                  </Button>
                ) : undefined
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
            {cards.isHidden("stats") ? null : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <StatCard
                  label={`Revenue · ${range.label}`}
                  value={formatMoney(
                    dashboard.data.revenue.netMinor,
                    dashboard.data.basis.currency,
                  )}
                  hint={`Gross ${formatMoney(dashboard.data.revenue.grossMinor, dashboard.data.basis.currency)} · refunded ${formatMoney(dashboard.data.revenue.refundedMinor, dashboard.data.basis.currency)}`}
                  icon={<BadgePoundSterling className="size-4.5" />}
                />
                <StatCard
                  label={Bookings}
                  value={String(dashboard.data.bookings.count)}
                  hint={`Worth ${formatMoney(dashboard.data.bookings.valueMinor, dashboard.data.basis.currency)}`}
                  icon={
                    isCarDetailing ? (
                      <CarFront className="size-4.5" />
                    ) : (
                      <CalendarPlus className="size-4.5" />
                    )
                  }
                />
                <StatCard
                  label={isCarDetailing ? "Completed" : "Attendance"}
                  value={String(dashboard.data.attendance.attended)}
                  hint={`${dashboard.data.attendance.noShow} no-shows · ${dashboard.data.attendance.cancelled} cancelled`}
                  icon={<TrendingUp className="size-4.5" />}
                />
                <StatCard
                  label={isCarDetailing ? "Diary filled" : "Occupancy rate"}
                  value={pct(dashboard.data.occupancy.rate * 100)}
                  hint={
                    isCarDetailing
                      ? `${dashboard.data.occupancy.seats} of ${dashboard.data.occupancy.capacity} slots booked`
                      : `${dashboard.data.occupancy.seats} of ${dashboard.data.occupancy.capacity} seats`
                  }
                  icon={<Users className="size-4.5" />}
                />
              </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {cards.isHidden("money") ? null : (
                <SectionCard
                  title="Money breakdown"
                  description={`Where the money came from · ${range.label.toLowerCase()}.`}
                  onHide={() => cards.hide("money")}
                >
                  {/* The card's promise, finally kept: card, cash and bank transfer (RECA-542). */}
                  {dashboard.data.revenue.grossMinor > 0 ? (
                    <div className="mb-5">
                      <TakingsBreakdown
                        revenue={dashboard.data.revenue}
                        currency={dashboard.data.basis.currency}
                      />
                    </div>
                  ) : null}
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
                          <ChartTooltip
                            formatValue={(v) => formatMoney(v, dashboard.data!.basis.currency)}
                          />
                          <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <p className="mt-4 text-xs font-medium text-muted-foreground">Package credits</p>
                  <dl className="mt-1 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Metric label="Sold" value={String(dashboard.data.credits.issued)} />
                    <Metric label="Used" value={String(dashboard.data.credits.redeemed)} />
                    <Metric
                      label="Still to use"
                      value={String(dashboard.data.credits.outstanding)}
                    />
                    <Metric label="Expired" value={String(dashboard.data.credits.expired)} />
                  </dl>
                </SectionCard>
              )}

              {cards.isHidden("attendance") ? null : (
                <SectionCard
                  title={cardLabels.attendance}
                  description={
                    isCarDetailing
                      ? "Completed vs no-show vs cancelled."
                      : "Attended vs no-show vs cancelled."
                  }
                  onHide={() => cards.hide("attendance")}
                >
                  {attendanceChart.length === 0 ? (
                    <EmptyState
                      title={isCarDetailing ? "No finished jobs yet" : "No attendance data"}
                      description={
                        isCarDetailing
                          ? "Mark jobs done or no-show and they'll show up here."
                          : `Mark attendance on ${nounFor(bookingNoun, 2)} to populate this chart.`
                      }
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
                          <ChartTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Counted by {dashboard.data.basis.dateBasis.replace("_", " ")} ·{" "}
                    {dashboard.data.basis.timezone}
                  </p>
                </SectionCard>
              )}
            </div>
          </>
        ) : null}
      </Can>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Today"
          description={
            events.length > 0
              ? `${scheduled.length} ${nounFor(bookingNoun, scheduled.length)} booked · ${events.length} ${events.length === 1 ? "event" : "events"}`
              : `${scheduled.length} ${nounFor(bookingNoun, scheduled.length)} booked`
          }
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
            <p className="p-5 text-sm text-destructive">
              Couldn't load today's {nounFor(bookingNoun, 2)}.
            </p>
          ) : todayItems.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={isCarDetailing ? "Nothing booked in today" : "Nothing scheduled today"}
                description={`Add a ${nounFor(bookingNoun, 1)} or an event to fill the diary.`}
              />
            </div>
          ) : (
            <ul className="divide-y">
              {todayItems.map((entry) =>
                entry.kind === "event" ? (
                  <TodayEventRow
                    key={entry.item.id}
                    block={entry.item}
                    onClick={() => {
                      setEditingEvent(entry.item);
                      setEventOpen(true);
                    }}
                  />
                ) : (
                  <TodayRow
                    key={entry.item.id}
                    booking={entry.item}
                    onClick={() => setSelectedBookingId(entry.item.id)}
                  />
                ),
              )}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-6">
          {cards.isHidden("tasks") ? null : (
            <SectionCard title="Tasks requiring attention" onHide={() => cards.hide("tasks")}>
              <ul className="space-y-3">
                {[
                  // Real, live: clients who asked for an add-on from their offer email.
                  ...(addOnRequests > 0
                    ? [
                        {
                          icon: Sparkles,
                          text: `${addOnRequests} add-on ${addOnRequests === 1 ? "request" : "requests"} to action`,
                          to: "/bookings" as const,
                          tone: "info",
                        },
                      ]
                    : []),
                  // Real, live: people waiting for a slot. Only listed when there are some.
                  ...(waiting > 0
                    ? [
                        {
                          icon: Hourglass,
                          text: `${waiting} ${waiting === 1 ? "client" : "clients"} waiting for a slot`,
                          to: "/waitlist" as const,
                          tone: "info",
                        },
                      ]
                    : []),
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
                    text: soloPlan
                      ? "Confirm your availability is up to date"
                      : "Confirm staff availability is up to date",
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
          )}

          {cards.isHidden("quick") ? null : (
            <SectionCard title="Quick actions" onHide={() => cards.hide("quick")}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setBookingOpen(true)}
                >
                  <CalendarPlus className="size-4" /> Add {nounFor(bookingNoun, 1)}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setWaitlistDefaults({})}
                >
                  <Hourglass className="size-4" /> Add to waitlist
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setQuick("client")}
                >
                  <UserPlus className="size-4" /> Add client
                </Button>
                {isCarDetailing ? null : (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => setQuick("group")}
                  >
                    <UsersRound className="size-4" /> Group session
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setEditingEvent(null);
                    setEventOpen(true);
                  }}
                >
                  <Clock className="size-4" /> Add event
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setQuick("block")}
                >
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
          )}
        </div>
      </div>

      <AddBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        onNoAvailability={(picked) => {
          setBookingOpen(false);
          setWaitlistDefaults({ ...picked, from: picked.date });
        }}
      />
      <AddWaitlistDialog
        open={waitlistDefaults !== null}
        onOpenChange={(open) => {
          if (!open) setWaitlistDefaults(null);
        }}
        defaults={waitlistDefaults ?? undefined}
      />
      <EventModal
        open={eventOpen}
        onOpenChange={(o) => {
          setEventOpen(o);
          if (!o) setEditingEvent(null);
        }}
        block={editingEvent}
      />
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

/** A staff event on today's list: its own colour, no client or status, click to edit. */
function TodayEventRow({ block, onClick }: { block: CalendarBlock; onClick: () => void }) {
  const tenant = useTenant();
  const staff = useStaffList();
  const soleStaff = useSoleStaff();
  const owner = staff.data?.find((s) => s.id === block.staffId);
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";

  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="w-16 shrink-0">
          {isAllDayEvent(block.start, block.end, timezone) ? (
            <p className="text-sm font-semibold">All day</p>
          ) : (
            <>
              <p className="text-sm font-semibold tabular-nums">
                {formatInTz(block.start, timezone, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatInTz(block.end, timezone, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </>
          )}
        </div>
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: block.colour }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{block.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            Event{soleStaff ? "" : ` · ${owner?.displayName ?? "—"}`}
            {block.notes ? ` · ${block.notes}` : ""}
          </p>
        </div>
        <PersonAvatar name={owner?.displayName ?? "?"} size={32} />
      </button>
    </li>
  );
}

function TodayRow({ booking, onClick }: { booking: Booking; onClick: () => void }) {
  const staff = useStaffList();
  const locations = useLocationsList();
  const customer = useCustomer(booking.leadCustomerId);
  const trainer = staff.data?.find((s) => s.id === booking.staffId);
  const location = locations.data?.find((l) => l.id === booking.locationId);
  // Who and where go without saying in a one-person, one-place business.
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const where = [
    soleStaff ? null : (trainer?.displayName ?? "—"),
    soleLocation ? null : (location?.name ?? "—"),
  ].filter(Boolean);
  const timezone = booking.timezone || "Europe/London";
  // Today's share of the job: a 3-day coating shows its Friday hours on Friday, not
  // Thursday's start and Monday's finish.
  const today =
    segmentOn(booking, localDay(new Date().toISOString(), timezone), timezone) ?? booking;

  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="w-16 shrink-0">
          {booking.allDay ? (
            <p className="text-sm font-semibold">All day</p>
          ) : (
            <>
              <p className="text-sm font-semibold tabular-nums">
                {formatInTz(today.start, timezone, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatInTz(today.end, timezone, { hour: "2-digit", minute: "2-digit" })}
              </p>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <span className="truncate">{booking.serviceSnapshot.name}</span>
            {booking.attendees.length > 1 ? (
              <span className="text-xs font-normal text-muted-foreground">
                {booking.seatCount} of {booking.attendees.length} booked
              </span>
            ) : null}
            {/* The client needs running somewhere once the car is in. */}
            {booking.clientLift ? (
              <span
                title={
                  booking.clientLift.destination
                    ? `Drop client at ${booking.clientLift.destination}`
                    : "Lift needed"
                }
                className="inline-flex shrink-0"
              >
                <CarFront role="img" aria-label="Lift needed" className="size-3.5 text-primary" />
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.data ? customerDisplayName(customer.data) : "…"}
            {where.length > 0 ? ` · ${where.join(" · ")}` : ""}
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
