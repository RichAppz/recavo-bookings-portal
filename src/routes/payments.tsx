import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, CreditCard, Search } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemo } from "@/lib/demo-store";
import { revenueSeries } from "@/lib/demo-data";
import { gbp, ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments — RECAVO" },
      {
        name: "description",
        content:
          "Card payments, package sales, refunds, processing fees and payouts for your booking business.",
      },
      { property: "og:title", content: "RECAVO Payments" },
      { property: "og:description", content: "Revenue, refunds and payouts with full transaction history." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const demo = useDemo();
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const rows = demo.payments.filter((p) => {
    const client = demo.clientById(p.clientId)?.name ?? "";
    const matches = `${client} ${p.ref} ${p.description}`.toLowerCase().includes(query.toLowerCase().trim());
    return matches && (status === "all" || p.status === status);
  });

  const gross = demo.payments.filter((p) => p.status !== "failed").reduce((s, p) => s + p.amount, 0);
  const fees = demo.payments.filter((p) => p.status !== "failed").reduce((s, p) => s + p.fee, 0);
  const refunded = demo.payments.reduce((s, p) => s + (p.refunded ?? 0), 0);
  const refundTarget = demo.payments.find((p) => p.id === refundId);

  return (
    <AppShell>
      <PageHeader
        title="Payments"
        description="Card takings, refunds and payouts, powered by Stripe."
        actions={
          <Button variant="outline" onClick={() => toast.success("CSV export ready to download")}>
            <ArrowDownToLine className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross volume" value={gbp(gross)} change={9.7} icon={<CreditCard className="size-4" />} />
        <StatCard label="Processing fees" value={gbp(fees, { decimals: true })} hint="1.5% + 20p" />
        <StatCard label="Refunded" value={gbp(refunded)} change={-2.1} />
        <StatCard label="Next payout" value={gbp(1284)} hint="arrives Friday" />
      </div>

      <SectionCard title="Revenue trend" description="Gross card volume over the last six months">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueSeries} margin={{ left: -18, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="payGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `£${v / 1000}k`} />
              <Tooltip
                formatter={(v: number) => gbp(v)}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-card)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fill="url(#payGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Transactions" bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search client, reference or description"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="partially_refunded">Partially refunded</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Reference", "Client", "Description", "Type", "Method", "Amount", "Fee", "Net", "Date", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-mono text-xs">{p.ref}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{demo.clientById(p.clientId)?.name}</td>
                  <td className="px-4 py-3">{p.description}</td>
                  <td className="px-4 py-3">{p.type}</td>
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3 tabular-nums">{gbp(p.amount, { decimals: true })}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{gbp(p.fee, { decimals: true })}</td>
                  <td className="px-4 py-3 tabular-nums">{gbp(p.amount - p.fee - (p.refunded ?? 0), { decimals: true })}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ukDate(p.date)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "paid" || p.status === "partially_refunded" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRefundId(p.id);
                          setRefundAmount(String(p.amount - (p.refunded ?? 0)));
                        }}
                      >
                        Refund
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={refundId !== null} onOpenChange={(o) => !o && setRefundId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue refund</DialogTitle>
            <DialogDescription>
              {refundTarget
                ? `Refunding ${demo.clientById(refundTarget.clientId)?.name} for ${refundTarget.description}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="refund-amt">Amount (£)</label>
            <Input id="refund-amt" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Refunds settle back to the client's card within 5–10 working days. Stripe fees are not returned.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundId(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (refundId) demo.refundPayment(refundId, Number(refundAmount) || undefined);
                setRefundId(null);
              }}
            >
              Refund {gbp(Number(refundAmount) || 0, { decimals: true })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
