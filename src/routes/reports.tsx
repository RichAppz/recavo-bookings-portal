import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, Download, Loader2 } from "lucide-react";
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
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { downloadExportFile, useDashboard, useRequestExport } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import type { ExportRequest } from "@/lib/api/types";
import { formatMoney, pct } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — RECAVO" },
      {
        name: "description",
        content: "Revenue, attendance and occupancy analytics for a selected date range.",
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

function defaultFrom() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoRange(fromDate: string, toDate: string) {
  return {
    from: new Date(`${fromDate}T00:00:00`).toISOString(),
    to: new Date(`${toDate}T23:59:59`).toISOString(),
  };
}

function previousRange(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59`);
  const ms = to.getTime() - from.getTime() + 1;
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - ms + 1);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

function pctChange(current: number, previous: number) {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function planGateMessage(error: unknown) {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "FEATURE_NOT_AVAILABLE") {
    return "Advanced reports aren't included on your current plan. Upgrade to unlock full analytics.";
  }
  if (error.code === "BILLING_ACCESS_REQUIRED") {
    return "Your subscription needs attention before reports can be loaded. Visit Platform billing to resolve access.";
  }
  return null;
}

function ReportsPage() {
  const tenant = useTenant();
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [locationId, setLocationId] = useState<string>("all");
  const [exports, setExports] = useState<Array<{ export: ExportRequest; downloadUrl?: string }>>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const range = useMemo(() => toIsoRange(fromDate, toDate), [fromDate, toDate]);
  const prevRange = useMemo(() => previousRange(fromDate, toDate), [fromDate, toDate]);

  const dashboard = useDashboard({
    from: range.from,
    to: range.to,
    locationId: locationId === "all" ? null : locationId,
  });
  const previous = useDashboard({
    from: prevRange.from,
    to: prevRange.to,
    locationId: locationId === "all" ? null : locationId,
  });
  const requestExport = useRequestExport();

  const planGate = dashboard.isError ? planGateMessage(dashboard.error) : null;

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
          name: "Selected range",
          booked: dashboard.data.occupancy.seats,
          capacity: dashboard.data.occupancy.capacity,
        },
      ]
    : [];

  const handleExport = async (type: "bookings" | "customers") => {
    try {
      const result = await requestExport.mutateAsync({ type });
      setExports((prev) => [{ export: result.export, downloadUrl: result.downloadUrl }, ...prev]);
      toast.success("Export queued", {
        description: "Download will be available once processing finishes.",
      });
    } catch (err) {
      const gate = planGateMessage(err);
      if (gate) toast.error("Export unavailable", { description: gate });
    }
  };

  const handleDownload = async (exp: ExportRequest, downloadUrl?: string) => {
    if (!tenant.businessId) return;
    setDownloadingId(exp.id);
    try {
      await downloadExportFile({
        businessId: tenant.businessId,
        exportId: exp.id,
        token: exp.downloadToken,
        downloadUrl,
        filename: `${exp.type}-${exp.id.slice(0, 8)}.csv`,
      });
      toast.success("Export downloaded");
    } catch {
      toast.error("Export not ready yet — try again in a moment");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Performance for your selected date range, compared with the previous period."
        actions={
          <Can permission={PERMISSIONS.REPORT_EXPORT}>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={requestExport.isPending}
                onClick={() => void handleExport("bookings")}
              >
                <ArrowDownToLine className="size-4" /> Export bookings
              </Button>
              <Button
                variant="outline"
                disabled={requestExport.isPending}
                onClick={() => void handleExport("customers")}
              >
                <ArrowDownToLine className="size-4" /> Export customers
              </Button>
            </div>
          </Can>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-2">
          <Label>Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {tenant.locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Can
        permission={PERMISSIONS.REPORT_READ}
        fallback={
          <EmptyState
            title="Reports are restricted"
            description="Ask a business owner or administrator to grant you report access."
          />
        }
      >
        {planGate ? (
          <EmptyState
            title="Reports unavailable"
            description={planGate}
            action={
              tenant.can(PERMISSIONS.PLATFORM_BILLING_ADMIN) ? (
                <Button asChild>
                  <a href="/platform">Go to Platform billing</a>
                </Button>
              ) : undefined
            }
          />
        ) : dashboard.isLoading ? (
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
                label="Revenue"
                value={formatMoney(dashboard.data.revenue.netMinor, dashboard.data.basis.currency)}
                change={
                  previous.data
                    ? pctChange(dashboard.data.revenue.netMinor, previous.data.revenue.netMinor)
                    : undefined
                }
              />
              <StatCard
                label="Bookings"
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
                description="Net, refunded and disputed for the selected range"
              >
                {revenueBreakdown.length === 0 ? (
                  <EmptyState title="No revenue in this range" />
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

              <SectionCard title="Attendance" description="Attended, no-show and cancelled sessions">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceBreakdown} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        vertical={false}
                      />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
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
              <SectionCard title="Occupancy" description="Seats booked vs capacity">
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
                        width={110}
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

              <SectionCard title="Packages and credits" description="Prepaid activity in range">
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
                    <dd className="mt-1 text-lg font-semibold">{dashboard.data.credits.redeemed}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Credits expired</dt>
                    <dd className="mt-1 text-lg font-semibold">{dashboard.data.credits.expired}</dd>
                  </div>
                </dl>
              </SectionCard>
            </div>

            <Can permission={PERMISSIONS.REPORT_EXPORT}>
              {exports.length > 0 ? (
                <SectionCard title="Recent exports" bodyClassName="p-0">
                  <ul className="divide-y">
                    {exports.map(({ export: exp, downloadUrl }) => (
                      <li
                        key={exp.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                      >
                        <span>
                          <span className="font-medium capitalize">{exp.type}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {exp.rowCount} rows · queued
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingId === exp.id}
                          onClick={() => void handleDownload(exp, downloadUrl)}
                        >
                          {downloadingId === exp.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}{" "}
                          Download
                        </Button>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
            </Can>
          </>
        )}
      </Can>
    </>
  );
}
