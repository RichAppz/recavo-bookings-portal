import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ExternalLink, Receipt, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useConnectAccount,
  useCreateRefund,
  useCustomers,
  usePaymentReceipt,
  usePaymentsList,
  useStartConnectOnboarding,
  useSyncConnectAccount,
} from "@/lib/api/hooks";
import type { Payment } from "@/lib/api/types";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";
import { toast } from "sonner";

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
  "requires_action",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
  "disputed",
] as const;

const REFUND_REASONS = [
  { code: "requested_by_customer", label: "Requested by customer" },
  { code: "duplicate", label: "Duplicate charge" },
  { code: "service_not_provided", label: "Service not provided" },
  { code: "other", label: "Other" },
];

function PaymentsPage() {
  const tenant = useTenant();
  const [state, setState] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState<string>("all");
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);

  const payments = usePaymentsList({
    ...(state !== "all" ? { state } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    ...(customerId !== "all" ? { customerId } : {}),
  });
  const customers = useCustomers();
  const connect = useConnectAccount();
  const startOnboarding = useStartConnectOnboarding();
  const syncConnect = useSyncConnectAccount();

  const currency = tenant.business?.currency ?? "GBP";
  const list = payments.payments;

  const totals = useMemo(() => {
    const succeeded = list.filter(
      (p) => p.state === "succeeded" || p.state === "partially_refunded",
    );
    const gross = succeeded.reduce((s, p) => s + p.amountMinor, 0);
    const refunded = list.reduce((s, p) => s + p.amountRefundedMinor, 0);
    return { gross, refunded, count: list.length };
  }, [list]);

  const nameFor = (id: string | null) => {
    if (!id) return "—";
    const c = customers.data?.items.find((x) => x.id === id);
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

      <Can permission={PERMISSIONS.CONNECT_MANAGE}>
        <SectionCard
          title="Payout account"
          description="Where your takings are sent"
          action={
            connect.data?.onboardingState === "complete" ? (
              <StatusBadge status="active" />
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={startOnboarding.isPending}
                onClick={async () => {
                  const result = await startOnboarding.mutateAsync();
                  if (result.onboardingUrl) window.location.assign(result.onboardingUrl);
                  else toast.success("Onboarding started");
                }}
              >
                <ExternalLink className="size-4" /> Finish onboarding
              </Button>
            )
          }
        >
          {connect.isLoading ? (
            <TableGhost rows={3} />
          ) : connect.isError || !connect.data ? (
            <EmptyState
              icon={<CreditCard className="size-6" />}
              title="No payout account connected"
              description="Connect a payment provider to start taking card payments."
              action={
                <Button
                  disabled={startOnboarding.isPending}
                  onClick={async () => {
                    const result = await startOnboarding.mutateAsync();
                    if (result.onboardingUrl) window.location.assign(result.onboardingUrl);
                  }}
                >
                  Connect account
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
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
              {connect.data.requirementsDue.length > 0 ? (
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {connect.data.requirementsDue.map((req) => (
                    <li key={req}>{req.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={syncConnect.isPending}
                onClick={async () => {
                  await syncConnect.mutateAsync();
                  toast.success("Account synced");
                }}
              >
                <RotateCcw className="size-4" /> Sync account
              </Button>
            </div>
          )}
        </SectionCard>
      </Can>

      <SectionCard
        title="Transactions"
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36"
            />
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(customers.data?.items ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {customerDisplayName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>
        }
      >
        {payments.isLoading ? (
          <TableGhost />
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    {["Date", "Client", "Amount", "Refunded", "Status", "Actions"].map((h) => (
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
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReceiptPaymentId(p.id)}
                          >
                            <Receipt className="size-3.5" /> Receipt
                          </Button>
                          <Can permission={PERMISSIONS.PAYMENT_REFUND}>
                            {(p.state === "succeeded" || p.state === "partially_refunded") &&
                            p.amountMinor > p.amountRefundedMinor ? (
                              <Button variant="ghost" size="sm" onClick={() => setRefundPayment(p)}>
                                Refund
                              </Button>
                            ) : null}
                          </Can>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments.hasNextPage ? (
              <div className="border-t p-4">
                <Button
                  variant="outline"
                  disabled={payments.isFetchingNextPage}
                  onClick={() => void payments.fetchNextPage()}
                >
                  {payments.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <RefundDialog payment={refundPayment} onClose={() => setRefundPayment(null)} />
      <ReceiptDialog paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />
    </>
  );
}

function RefundDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const createRefund = useCreateRefund();
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState(REFUND_REASONS[0].code);

  const maxRefundable = payment ? payment.amountMinor - payment.amountRefundedMinor : 0;

  return (
    <Dialog open={Boolean(payment)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>
            {payment
              ? `Refund up to ${formatMoney(maxRefundable, payment.currency)} for this payment.`
              : null}
          </DialogDescription>
        </DialogHeader>
        {payment ? (
          <div className="grid gap-4">
            <div className="flex gap-2">
              <Button
                variant={mode === "full" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("full")}
              >
                Full refund
              </Button>
              <Button
                variant={mode === "partial" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("partial")}
              >
                Partial refund
              </Button>
            </div>
            {mode === "partial" ? (
              <div className="grid gap-2">
                <Label htmlFor="refund-amount">Amount ({payment.currency})</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={(maxRefundable / 100).toFixed(2)}
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFUND_REASONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createRefund.isPending || !payment}
            onClick={async () => {
              if (!payment) return;
              const amountMinor = mode === "full" ? undefined : Math.round(Number(amount) * 100);
              if (
                mode === "partial" &&
                (!amountMinor || amountMinor <= 0 || amountMinor > maxRefundable)
              ) {
                return toast.error("Enter a valid partial amount");
              }
              await createRefund.mutateAsync({
                paymentId: payment.id,
                reasonCode,
                ...(amountMinor !== undefined ? { amountMinor } : {}),
              });
              toast.success("Refund submitted");
              onClose();
            }}
          >
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const receipt = usePaymentReceipt(paymentId ?? undefined);

  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
        </DialogHeader>
        {receipt.isLoading ? (
          <TableGhost rows={4} />
        ) : receipt.isError || !receipt.data ? (
          <EmptyState title="Couldn't load receipt" />
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(receipt.data.amountMinor, receipt.data.currency)}
              </dd>
            </div>
            {receipt.data.receiptNumber ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Receipt no.</dt>
                <dd>{receipt.data.receiptNumber}</dd>
              </div>
            ) : null}
            {receipt.data.legalName ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Seller</dt>
                <dd>{receipt.data.legalName}</dd>
              </div>
            ) : null}
            {receipt.data.vatNumber ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">VAT</dt>
                <dd>{receipt.data.vatNumber}</dd>
              </div>
            ) : null}
            {receipt.data.receiptUrl ? (
              <Button asChild variant="outline" className="w-full">
                <a href={receipt.data.receiptUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Open receipt
                </a>
              </Button>
            ) : null}
          </dl>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
