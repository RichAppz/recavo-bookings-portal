import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { PageHeader, PersonAvatar, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/lib/demo-store";
import { demoToday, gbp, parseIso, relativeDay, ukDate } from "@/lib/format";

export const Route = createFileRoute("/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — RECAVO" },
      {
        name: "description",
        content:
          "Client records with credits, lifetime spend, attendance and upcoming bookings for RECAVO.",
      },
      { property: "og:title", content: "RECAVO Clients" },
      { property: "og:description", content: "Every client, credit balance and booking history in one place." },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const demo = useDemo();
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickAction>(null);

  const rows = demo.clients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const expiringSoon = demo.clientPackages.filter(
    (p) =>
      p.status === "active" &&
      (parseIso(p.expires).getTime() - demoToday().getTime()) / 86_400_000 <= 7,
  ).length;

  return (
    <AppShell>
      <PageHeader
        title="Clients"
        description="Everyone training with RECAVO."
        actions={
          <Button onClick={() => setQuick("client")}>
            <UserPlus className="size-4" /> Add client
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total clients" value={String(demo.clients.length)} change={6.4} />
        <StatCard
          label="Active clients"
          value={String(demo.clients.filter((c) => c.status === "active").length)}
          change={4.2}
        />
        <StatCard label="New this month" value="9" change={12.5} />
        <StatCard label="Expiring packages" value={String(expiringSoon)} hint="within 7 days" />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b p-4">
          <div className="relative max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search clients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Client", "Contact", "Last session", "Next booking", "Credits", "Lifetime spend", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => {
                const theirs = demo.bookings.filter((b) => b.clientIds.includes(c.id));
                const past = theirs.filter((b) => parseIso(b.date) < demoToday()).slice(-1)[0];
                const next = theirs
                  .filter((b) => parseIso(b.date) >= demoToday() && b.status === "confirmed")
                  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
                return (
                  <tr key={c.id} className="transition-colors hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.id }}
                        className="flex items-center gap-3 font-medium"
                      >
                        <PersonAvatar name={c.name} src={c.avatar} />
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs">{c.email}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{past ? ukDate(past.date) : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {next ? `${relativeDay(next.date)} ${next.time}` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{demo.creditsFor(c.id)}</td>
                    <td className="px-4 py-3 tabular-nums">{gbp(c.lifetimeSpend)}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </AppShell>
  );
}
