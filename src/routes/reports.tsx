import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-store";
import { revenueSeries } from "@/lib/demo-data";
import { gbp, pct } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — RECAVO" },
      {
        name: "description",
        content:
          "Revenue, utilisation, attendance and retention analytics across services, trainers and locations.",
      },
      { property: "og:title", content: "RECAVO Reports" },
      { property: "og:description", content: "Understand what's driving revenue across your studios." },
    ],
  }),
  component: ReportsPage,
});

const CHART_COLOURS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const utilisation = [
  { day: "Mon", booked: 82, capacity: 100 },
  { day: "Tue", booked: 74, capacity: 100 },
  { day: "Wed", booked: 91, capacity: 100 },
  { day: "Thu", booked: 68, capacity: 100 },
  { day: "Fri", booked: 79, capacity: 100 },
  { day: "Sat", booked: 54, capacity: 100 },
  { day: "Sun", booked: 21, capacity: 100 },
];

const retention = [
  { month: "Feb", returning: 71 },
  { month: "Mar", returning: 74 },
  { month: "Apr", returning: 76 },
  { month: "May", returning: 73 },
  { month: "Jun", returning: 79 },
  { month: "Jul", returning: 82 },
];

function ReportsPage() {
  const demo = useDemo();

  const byService = demo.services.map((s, i) => ({
    name: s.name,
    value: demo.bookings.filter((b) => b.serviceId === s.id).length || i + 1,
  }));

  const byStaff = demo.staff.map((s) => ({ name: s.name.split(" ")[0], revenue: s.revenue }));

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        description="How the business is performing this month."
        actions={
          <Button variant="outline" onClick={() => toast.success("Report exported as PDF")}>
            <ArrowDownToLine className="size-4" /> Export report
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue this month" value={gbp(8420)} change={7.1} />
        <StatCard label="Sessions delivered" value="186" change={8.1} />
        <StatCard label="Attendance rate" value={pct(93.4)} change={1.6} />
        <StatCard label="Average session value" value={gbp(45.3, { decimals: true })} change={-1.2} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="Revenue and bookings" description="Six-month trend" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `£${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="bookings" name="Bookings" stroke="var(--color-chart-4)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Bookings by service">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byService} dataKey="value" nameKey="name" innerRadius={54} outerRadius={90} paddingAngle={3}>
                  {byService.map((_, i) => (
                    <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="Capacity utilisation" description="Booked vs available slots per weekday" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilisation} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(v: number) => `${v}%`}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="booked" name="Utilisation" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Client retention" description="Returning clients each month">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retention} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} domain={[60, 90]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(v: number) => `${v}%`}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="returning" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Revenue by trainer">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStaff} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `£${v / 1000}k`} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip
                  formatter={(v: number) => gbp(v)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" fill="var(--color-chart-1)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Location performance" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Location", "Bookings", "Revenue", "Share"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {demo.locations.map((l) => {
                const total = demo.locations.reduce((s, x) => s + x.revenue, 0);
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3 tabular-nums">{l.monthlyBookings}</td>
                    <td className="px-4 py-3 tabular-nums">{gbp(l.revenue)}</td>
                    <td className="px-4 py-3 tabular-nums">{pct((l.revenue / total) * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </AppShell>
  );
}
