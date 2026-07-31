import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
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
import {
  AlertTriangle,
  BadgePoundSterling,
  CalendarPlus,
  CalendarX,
  CreditCard,
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
import { PageHeader, PersonAvatar, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDemo } from "@/lib/demo-store";
import { revenueSeries } from "@/lib/demo-data";
import type { Booking } from "@/lib/demo-data";
import { demoToday, endTime, gbp, isoDate, parseIso, relativeDay, ukDate } from "@/lib/format";

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
        content: "Live business overview for RECAVO: today's sessions, revenue, attendance and tasks needing attention.",
      },
    ],
  }),
  component: Overview,
});

const chartColours = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Overview() {
  const demo = useDemo();
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const today = isoDate(demoToday());

  const todays = demo.bookings
    .filter((b) => b.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const scheduled = todays.filter((b) => b.status !== "cancelled");
  const attendees = scheduled.reduce((n, b) => n + b.booked, 0);
  const groupSpaces = scheduled
    .filter((b) => b.capacity > 2)
    .reduce((n, b) => n + (b.capacity - b.booked), 0);
  const cancellations = todays.filter((b) => b.status === "cancelled").length;

  const byService = demo.services.map((s) => ({
    name: s.name.replace(" Personal Training", "").replace(" Training Session", ""),
    value: demo.bookings.filter((b) => b.serviceId === s.id).length,
  }));

  const groupSessions = demo.bookings
    .filter((b) => b.capacity > 2 && parseIso(b.date) >= demoToday())
    .slice(0, 4);

  const expiring = demo.clientPackages
    .filter((p) => p.status === "active" && parseIso(p.expires) <= parseIso(today) && false)
    .concat(
      demo.clientPackages.filter(
        (p) =>
          p.status === "active" &&
          (parseIso(p.expires).getTime() - demoToday().getTime()) / 86_400_000 <= 7,
      ),
    );

  return (
    <AppShell>
      <PageHeader
        title="Good morning, Alex"
        description={`${scheduled.length} sessions across two locations today · ${relativeDay(today)}, ${ukDate(today)}`}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue this month" value={gbp(8420)} change={7.2} hint="vs £7,860" icon={<BadgePoundSterling className="size-4.5" />} />
        <StatCard label="Bookings this month" value="186" change={8.1} hint="vs 172" icon={<CalendarPlus className="size-4.5" />} />
        <StatCard label="Active clients" value="74" change={4.2} hint="vs 71" icon={<Users className="size-4.5" />} />
        <StatCard label="Attendance rate" value="92%" change={-1.4} hint="vs 93.4%" icon={<TrendingUp className="size-4.5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Today"
          description={`${scheduled.length} scheduled sessions · ${attendees} attendees · ${groupSpaces} group spaces remaining · ${cancellations} cancellation`}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/calendar">Open calendar</Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y">
            {todays.map((b) => {
              const svc = demo.serviceById(b.serviceId);
              const staff = demo.staffById(b.staffId);
              const loc = demo.locationById(b.locationId);
              const names = b.clientIds.map((id) => demo.clientById(id)?.name).filter(Boolean);
              return (
                <li key={b.id}>
                  <button
                    onClick={() => setSelected(b)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-secondary/60"
                  >
                    <div className="w-14 shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{b.time}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {endTime(b.time, svc.duration)}
                      </p>
                    </div>
                    <span
                      className="h-10 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: svc.colour }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {svc.name}
                        {b.capacity > 2 ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {b.booked} of {b.capacity} booked
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.capacity > 2 ? `${b.booked} attendees` : names.join(" and ")} · {staff.name} · {loc.name}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      <StatusBadge status={b.paymentStatus} />
                      <StatusBadge status={b.attendance} />
                    </div>
                    <PersonAvatar name={staff.name} src={staff.avatar} size={32} />
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Tasks requiring attention">
            <ul className="space-y-3">
              {[
                { icon: Package, text: "3 packages expire within seven days", to: "/packages" as const, tone: "warning" },
                { icon: CreditCard, text: "1 failed Stripe payment", to: "/payments" as const, tone: "destructive" },
                { icon: MessageSquarePlus, text: "2 unread client messages", to: "/messages" as const, tone: "info" },
                { icon: AlertTriangle, text: "1 trainer has not completed availability setup", to: "/staff" as const, tone: "warning" },
              ].map((t) => (
                <li key={t.text}>
                  <Link
                    to={t.to}
                    className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-secondary"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        t.tone === "destructive"
                          ? "bg-destructive-soft text-destructive"
                          : t.tone === "info"
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
              <Button variant="outline" className="justify-start" onClick={() => setBookingOpen(true)}>
                <CalendarPlus className="size-4" /> Add booking
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("client")}>
                <UserPlus className="size-4" /> Add client
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("group")}>
                <UsersRound className="size-4" /> Group session
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("block")}>
                <CalendarX className="size-4" /> Block time
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("package")}>
                <Package className="size-4" /> Sell package
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setQuick("message")}>
                <MessageSquarePlus className="size-4" /> Send message
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Revenue" description="Last six months">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis tickFormatter={(v) => `£${v / 1000}k`} tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  formatter={(v: number) => [gbp(v), "Revenue"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Bookings by service">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byService} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3}>
                  {byService.map((_, i) => (
                    <Cell key={i} fill={chartColours[i % chartColours.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5">
            {byService.map((s, i) => (
              <li key={s.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: chartColours[i % 5] }} />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="font-medium tabular-nums">{s.value}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Group session occupancy">
          <ul className="space-y-4">
            {groupSessions.map((b) => {
              const svc = demo.serviceById(b.serviceId);
              return (
                <li key={b.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{svc.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {b.booked}/{b.capacity}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {relativeDay(b.date)} {b.time} · {demo.staffById(b.staffId).name}
                  </p>
                  <Progress value={(b.booked / b.capacity) * 100} className="h-2" />
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Packages nearing expiry" bodyClassName="p-0">
          <ul className="divide-y">
            {expiring.slice(0, 5).map((p) => {
              const client = demo.clientById(p.clientId);
              const def = demo.packageById(p.packageId);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <PersonAvatar name={client?.name ?? ""} src={client?.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{client?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{def?.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{p.remaining} left</p>
                    <p className="text-xs text-warning-foreground">Expires {ukDate(p.expires)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Recent payments" bodyClassName="p-0" action={
          <Button variant="ghost" size="sm" asChild><Link to="/payments">View all</Link></Button>
        }>
          <ul className="divide-y">
            {demo.payments.slice(0, 5).map((p) => {
              const client = demo.clientById(p.clientId);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <PersonAvatar name={client?.name ?? ""} src={client?.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{client?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{gbp(p.amount, { decimals: true })}</p>
                    <StatusBadge status={p.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Recent bookings" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Reference</th>
                <th className="px-5 py-2.5 text-left font-medium">Client</th>
                <th className="px-5 py-2.5 text-left font-medium">Service</th>
                <th className="px-5 py-2.5 text-left font-medium">Date</th>
                <th className="px-5 py-2.5 text-left font-medium">Payment</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...demo.bookings].reverse().slice(0, 6).map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="cursor-pointer transition-colors hover:bg-secondary/50"
                >
                  <td className="px-5 py-3 font-medium">{b.ref}</td>
                  <td className="px-5 py-3">{demo.clientById(b.clientIds[0])?.name}</td>
                  <td className="px-5 py-3">{demo.serviceById(b.serviceId).name}</td>
                  <td className="px-5 py-3 tabular-nums">{ukDate(b.date)} {b.time}</td>
                  <td className="px-5 py-3"><StatusBadge status={b.paymentStatus} /></td>
                  <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <AddBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
      <BookingPanel booking={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}
