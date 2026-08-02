import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PageHeader, PersonAvatar, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useCustomersInfinite } from "@/lib/api/hooks";
import { customerDisplayName } from "@/lib/api/types";
import { ukDate } from "@/lib/format";

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
      {
        property: "og:description",
        content: "Every client, credit balance and booking history in one place.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ClientsPage />
      </AppShell>
    </RequireAuth>
  ),
});

function ClientsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [quick, setQuick] = useState<QuickAction>(null);

  const customers = useCustomersInfinite({
    search: query.trim() || undefined,
    status: status !== "all" ? status : undefined,
  });
  const rows = customers.items;
  const activeCount = useMemo(() => rows.filter((c) => c.status === "active").length, [rows]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone booking with your business."
        actions={
          <Button onClick={() => setQuick("client")}>
            <UserPlus className="size-4" /> Add client
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Clients loaded" value={String(rows.length)} />
        <StatCard label="Active (loaded)" value={String(activeCount)} />
        <StatCard
          label="Archived or anonymised"
          value={String(rows.length - activeCount)}
        />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search clients by name, email or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="anonymised">Anonymised</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {customers.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading clients…</p>
        ) : customers.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load clients" description="Please try again shortly." />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No clients found"
              description="Try a different search, or add your first client."
              action={<Button onClick={() => setQuick("client")}>Add client</Button>}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    {["Client", "Contact", "Tags", "Client since", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-secondary/50">
                      <td className="px-4 py-3">
                        <Link
                          to="/clients/$clientId"
                          params={{ clientId: c.id }}
                          className="flex items-center gap-3 font-medium"
                        >
                          <PersonAvatar name={customerDisplayName(c)} />
                          {customerDisplayName(c)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs">{c.emailDisplay ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.phoneDisplay ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.tags.length > 0 ? c.tags.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ukDate(c.createdAt.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {customers.hasNextPage ? (
              <div className="border-t p-4">
                <Button
                  variant="outline"
                  disabled={customers.isFetchingNextPage}
                  onClick={() => void customers.fetchNextPage()}
                >
                  {customers.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </>
  );
}
