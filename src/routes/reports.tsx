import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Can } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useDashboard, useRequestExport } from "@/lib/api/hooks";
import { formatMoney, pct } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — RECAVO" },
      {
        name: "description",
        content:
          "Revenue, attendance and occupancy analytics for the current month, compared with last month.",
      },
      { property: "og:title", content: "RECAVO Reports" },
      {
        property: "og:description",
        content: "Understand what's driving revenue across your studios.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ReportsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const CHART_COLOURS = ["var(--color-chart-1)", "var(--color-chart-3)", "var(--color-chart-5)"];

function monthRange(offset = 0) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function pctChange(current: number, previous: number) {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ReportsPage() {
  const thisMonth = useMemo(() => monthRange(0), []);
  const lastMonth = useMemo(() => monthRange(-1), []);
  const dashboard = useDashboard(thisMonth);
  const previous = useDashboard(lastMonth);
  const requestExport = useRequestExport();

  const revenueBreakdown = dashboard.data
    ? [
        { name: "Net", value: dashboard.data.revenue.netMinor },
        { name: "Refunded", value: dashboard.data.revenue.refundedMinor },
        { name: "Disputed", value: dashboard.data.revenue.disputedMinor },
      ].filter((d) => d.value > 0)
    : [];

  const attendanceBreakdown = dashboard.data
    ? [
        { name: "Attended", value: dashboard.data.attendance.attended },
        { name: "No-show", value: dashboard.data.attendance.noShow },
        { name: "Cancelled", value: dashboard.data.attendance.cancelled },
      ]
    : [];

  const occupancy = dashboard.data
    ? [
        {
          name: "This month",
          booked: dashboard.data.occupancy.seats,
          capacity: dashboard.data.occupancy.capacity,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Reports"
        description="How the business performed this month, compared with last month."
        actions={
          <Button
            variant="outline"
            disabled={requestExport.isPending}
            onClick={async () => {
              try {
                await requestExport.mutateAsync({
                  type: "dashboard",
                  from: thisMonth.from,
                  to: thisMonth.to,
                });
                toast.success("Export requested", {
                  description: "You'll be able to download it once processing finishes.",
                });
              } catch {
                /* toasted by hook */
              }
            }}
          >
            <ArrowDownToLine className="size-4" /> Export report
          </Button>
        }
      />

      <Can
        permission={PERMISSIONS.REPORT_READ}
        fallback={
          <EmptyState
            title="Reports are restricted"
            description="Ask a business owner or administrator to grant you report access."
          />
        }
      >
        {dashboard.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="surface-card h-[124px] animate-pulse" />
            ))}
          </div>
        ) : dashboard.isError || !dashboard.data ? (
          <EmptyState title="Couldn't load reports" description="Please try again shortly." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Revenue this month"
                value={formatMoney(dashboard.data.revenue.netMinor, dashboard.data.basis.currency)}
                change={
                  previous.data
                    ? pctChange(dashboard.data.revenue.netMinor, previous.data.revenue.netMinor)
                    : undefined
                }
              />
              <StatCard
                label="Bookings this month"
                value={String(dashboard.data.bookings.count)}
                change={
                  previous.data
                    ? pctChange(dashboard.data.bookings.count, previous.data.bookings.count)
                    : undefined
                }
              />
              <StatCard
                label="Attendance rate"
                value={pct(
                  dashboard.data.attendance.attended + dashboard.data.attendance.noShow > 0
                    ? (dashboard.data.attendance.attended /
                        (dashboard.data.attendance.attended + dashboard.data.attendance.noShow)) *
                        100
                    : 0,
                )}
              />
              <StatCard label="Occupancy rate" value={pct(dashboard.data.occupancy.rate * 100)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard
                title="Revenue breakdown"
                description="Net, refunded and disputed for the current month"
              >
                {revenueBreakdown.length === 0 ? (
                  <EmptyState title="No revenue yet this month" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={54}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {revenueBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => formatMoney(v, dashboard.data!.basis.currency)}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid var(--color-border)",
                            background: "var(--color-card)",
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Attendance"
                description="Attended, no-show and cancelled sessions"
              >
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceBreakdown} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        vertical={false}
                      />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-card)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {attendanceBreakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard
                title="Occupancy"
                description="Seats booked vs capacity across all locations"
              >
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={occupancy} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        horizontal={false}
                      />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={90}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-card)",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="capacity"
                        name="Capacity"
                        fill="var(--color-secondary)"
                        radius={[0, 8, 8, 0]}
                      />
                      <Bar
                        dataKey="booked"
                        name="Booked"
                        fill="var(--color-primary)"
                        radius={[0, 8, 8, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Packages and credits" description="Prepaid activity this month">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Package sales</dt>
                    <dd className="mt-1 text-lg font-semibold">
                      {formatMoney(
                        dashboard.data.packages.salesMinor,
                        dashboard.data.basis.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Credits issued</dt>
                    <dd className="mt-1 text-lg font-semibold">{dashboard.data.credits.issued}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Credits redeemed</dt>
                    <dd className="mt-1 text-lg font-semibold">
                      {dashboard.data.credits.redeemed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Credits expired</dt>
                    <dd className="mt-1 text-lg font-semibold">{dashboard.data.credits.expired}</dd>
                  </div>
                </dl>
              </SectionCard>
            </div>

            <p className="text-xs text-muted-foreground">
              Breakdowns by service, trainer and location, plus scheduled exports, are coming in a
              future update.
            </p>
          </>
        )}
      </Can>
    </>
  );
}
