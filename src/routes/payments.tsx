import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useConnectAccount, useCustomers, usePayments } from "@/lib/api/hooks";
import { customerDisplayName } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { formatInTz, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments — RECAVO" },
      {
        name: "description",
        content: "Payment history, refunds and payout connectivity for your business.",
      },
      { property: "og:title", content: "RECAVO Payments" },
      {
        property: "og:description",
        content: "Track every charge, refund and payout in one place.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PaymentsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const STATES = [
  "all",
  "succeeded",
  "processing",
  "requires_action",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
  "cancelled",
] as const;

function PaymentsPage() {
  const tenant = useTenant();
  const [state, setState] = useState<string>("all");
  const payments = usePayments(state === "all" ? {} : { state });
  const customers = useCustomers();
  const connect = useConnectAccount();

  const currency = tenant.business?.currency ?? "GBP";
  const paymentsData = payments.data?.payments;
  const list = paymentsData ?? [];

  const totals = useMemo(() => {
    const rows = paymentsData ?? [];
    const succeeded = rows.filter(
      (p) => p.state === "succeeded" || p.state === "partially_refunded",
    );
    const gross = succeeded.reduce((s, p) => s + p.amountMinor, 0);
    const refunded = rows.reduce((s, p) => s + p.amountRefundedMinor, 0);
    return { gross, refunded, count: rows.length };
  }, [paymentsData]);

  const nameFor = (customerId: string | null) => {
    if (!customerId) return "—";
    const c = customers.data?.items.find((x) => x.id === customerId);
    return c ? customerDisplayName(c) : "Client";
  };

  return (
    <>
      <PageHeader title="Payments" description="Charges taken across bookings and package sales." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Gross (shown)" value={formatMoney(totals.gross, currency)} />
        <StatCard label="Refunded (shown)" value={formatMoney(totals.refunded, currency)} />
        <StatCard label="Transactions (shown)" value={String(totals.count)} />
      </div>

      <SectionCard
        title="Payout account"
        description="Where your takings are sent"
        action={
          connect.data?.onboardingState === "complete" ? (
            <StatusBadge status="active" />
          ) : (
            <Button size="sm" variant="outline">
              <ExternalLink className="size-4" /> Finish onboarding
            </Button>
          )
        }
      >
        {connect.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking payout account…</p>
        ) : connect.isError || !connect.data ? (
          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="No payout account connected"
            description="Connect a payment provider to start taking card payments."
          />
        ) : (
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              <span className="text-muted-foreground">Provider: </span>
              {connect.data.provider}
            </span>
            <span>
              <span className="text-muted-foreground">Charges: </span>
              {connect.data.chargesEnabled ? "Enabled" : "Disabled"}
            </span>
            <span>
              <span className="text-muted-foreground">Payouts: </span>
              {connect.data.payoutsEnabled ? "Enabled" : "Disabled"}
            </span>
            {connect.data.requirementsDue.length > 0 ? (
              <span className="text-amber-600">
                {connect.data.requirementsDue.length} outstanding requirement(s)
              </span>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Transactions"
        bodyClassName="p-0"
        action={
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {payments.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading payments…</p>
        ) : payments.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load payments" description="Please try again shortly." />
          </div>
        ) : list.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No payments yet"
              description="Payments will appear here once clients start paying online."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {["Date", "Client", "Amount", "Refunded", "Status", "Receipt"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatInTz(p.createdAt, "Europe/London", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">{nameFor(p.customerId)}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {formatMoney(p.amountMinor, p.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {p.amountRefundedMinor > 0
                        ? formatMoney(p.amountRefundedMinor, p.currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.state} />
                    </td>
                    <td className="px-4 py-3">
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
