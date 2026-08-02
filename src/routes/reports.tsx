import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, Download, Loader2, Lock } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ApiError } from "@/lib/api";
import { downloadExportFile, useDashboard, useRequestExport } from "@/lib/api/hooks";
import type { ExportRequest } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate, pct } from "@/lib/format";
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

function monthBounds(offset = 0) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

/** Half-open UTC window for an `<input type="date">` pair: [from 00:00, to+1day 00:00). */
function toDateTimeRange(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = new Date(`${from}T00:00:00.000Z`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    out.to = end.toISOString();
  }
  return out;
}

/** Equal-length window immediately preceding `[from, to)`, for the comparison stat cards. */
function previousRange(from?: string, to?: string): { from?: string; to?: string } {
  if (!from || !to) return {};
  const durationMs = new Date(to).getTime() - new Date(from).getTime();
  const prevTo = new Date(from);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

function pctChange(current: number, previous: number) {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ReportsPage() {
  const tenant = useTenant();
  const defaultRange = useMemo(() => monthBounds(0), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  const range = toDateTimeRange(from, to);
  const previous = previousRange(range.from, range.to);

  const dashboard = useDashboard(range);
  const previousDashboard = useDashboard(previous);

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

  const currentLocationName =
    tenant.currentLocationId === "all"
      ? "all locations"
      : (tenant.locations.find((l) => l.id === tenant.currentLocationId)?.name ?? "this location");

  return (
    <>
      <PageHeader
        title="Reports"
        description={`How ${tenant.business?.tradingName ?? "the business"} performed, filtered to ${currentLocationName}.`}
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
        <SectionCard
          title="Filters"
          description="Date range and location apply to every chart on this page"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="rep-from">From</Label>
              <Input
                id="rep-from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rep-to">To</Label>
              <Input
                id="rep-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Select value={tenant.currentLocationId} onValueChange={tenant.setCurrentLocationId}>
                <SelectTrigger className="w-[210px]">
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
            <Button
              variant="ghost"
              onClick={() => {
                const bounds = monthBounds(0);
                setFrom(bounds.from);
                setTo(bounds.to);
              }}
            >
              Reset to this month
            </Button>
          </div>
        </SectionCard>

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
                label="Revenue"
                value={formatMoney(dashboard.data.revenue.netMinor, dashboard.data.basis.currency)}
                change={
                  previousDashboard.data
                    ? pctChange(
                        dashboard.data.revenue.netMinor,
                        previousDashboard.data.revenue.netMinor,
                      )
                    : undefined
                }
                hint="vs. previous equal period"
              />
              <StatCard
                label="Bookings"
                value={String(dashboard.data.bookings.count)}
                change={
                  previousDashboard.data
                    ? pctChange(dashboard.data.bookings.count, previousDashboard.data.bookings.count)
                    : undefined
                }
                hint="vs. previous equal period"
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

              <SectionCard title="Packages and credits" description="Prepaid activity in this range">
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
          </>
        )}

        <Can
          permission={PERMISSIONS.REPORT_EXPORT}
          fallback={
            <SectionCard title="Data exports">
              <p className="text-sm text-muted-foreground">
                Ask a business owner or administrator to grant you export access.
              </p>
            </SectionCard>
          }
        >
          <ExportCard />
        </Can>
      </Can>
    </>
  );
}

const EXPORT_TYPES = [
  { value: "customers", label: "Clients" },
  { value: "bookings", label: "Bookings" },
] as const;

function ExportCard() {
  const requestExport = useRequestExport();
  const [type, setType] = useState<(typeof EXPORT_TYPES)[number]["value"]>("customers");
  const [result, setResult] = useState<{ export: ExportRequest; downloadUrl: string } | null>(null);
  const [gate, setGate] = useState<"billing" | "feature" | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleRequest = async () => {
    setGate(null);
    try {
      const data = await requestExport.mutateAsync({ type });
      setResult(data);
      toast.success("Export ready", {
        description: `${data.export.rowCount} row(s) — expires ${new Date(data.export.expiresAt).toLocaleString("en-GB")}.`,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isBillingRequired) setGate("billing");
        else if (err.isFeatureNotAvailable) setGate("feature");
      }
      // Other failures are already toasted by the mutation's onError.
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadExportFile(result.downloadUrl, `${result.export.type}-export.csv`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.detail || err.title : "Couldn't download the export.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SectionCard
      title="Data exports"
      description="Generate a CSV of clients or bookings for the whole business (not filtered by date range)"
    >
      {gate ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <div>
            <p className="font-medium text-warning-foreground">
              {gate === "billing" ? "Billing access required" : "Not available on your plan"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {gate === "billing"
                ? "Your subscription's current billing state is blocking exports. Resolve billing to continue."
                : "Data exports aren't included in your current plan. Upgrade to unlock CSV exports."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label>Export type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={requestExport.isPending} onClick={handleRequest}>
          {requestExport.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowDownToLine className="size-4" />
          )}
          Request export
        </Button>
      </div>

      {result ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
          <div>
            <p className="font-medium">
              {EXPORT_TYPES.find((t) => t.value === result.export.type)?.label ?? result.export.type}{" "}
              export — {result.export.rowCount} row(s)
            </p>
            <p className="text-xs text-muted-foreground">
              Expires {formatInTz(result.export.expiresAt, "Europe/London")}
            </p>
          </div>
          <Button variant="outline" disabled={downloading} onClick={handleDownload}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download CSV
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}
