import { createFileRoute } from "@tanstack/react-router";
import { Building2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { platformBusinesses } from "@/lib/demo-data";
import { gbp } from "@/lib/format";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform overview — RECAVO" },
      {
        name: "description",
        content: "Multi-tenant view of every business on RECAVO: plans, staff, bookings and payment status.",
      },
      { property: "og:title", content: "RECAVO Platform" },
      { property: "og:description", content: "How every business on the platform is performing." },
    ],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const totalBookings = platformBusinesses.reduce((s, b) => s + b.bookings, 0);

  return (
    <AppShell>
      <PageHeader title="Platform overview" description="Every business running on RECAVO." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Businesses" value={String(platformBusinesses.length)} icon={<Building2 className="size-4" />} change={12.5} />
        <StatCard label="Staff accounts" value={String(platformBusinesses.reduce((s, b) => s + b.staff, 0))} icon={<Users className="size-4" />} />
        <StatCard label="Bookings this month" value={String(totalBookings)} change={14.2} />
        <StatCard label="Platform MRR" value={gbp(2470)} change={9.8} />
      </div>

      <SectionCard title="Businesses" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Business", "Industry", "Plan", "Staff", "Locations", "Bookings", "Subscription", "Payments"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {platformBusinesses.map((b) => (
                <tr key={b.name} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">{b.industry}</td>
                  <td className="px-4 py-3">{b.plan}</td>
                  <td className="px-4 py-3 tabular-nums">{b.staff}</td>
                  <td className="px-4 py-3 tabular-nums">{b.locations}</td>
                  <td className="px-4 py-3 tabular-nums">{b.bookings}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.subscription} /></td>
                  <td className="px-4 py-3"><StatusBadge status={b.payments} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
