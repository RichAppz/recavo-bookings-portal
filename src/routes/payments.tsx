import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ExternalLink, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import { flattenPages } from "@/lib/api";
import {
  useConnectAccount,
  useConnectOnboard,
  useConnectSync,
  useCreateRefund,
  useCustomers,
  usePaymentReceipt,
  usePaymentsInfinite,
} from "@/lib/api/hooks";
import { customerDisplayName, type Payment } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { formatInTz, formatMoney, parseMoneyToMinor } from "@/lib/format";
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
  "succeeded",
  "processing",
  "requires_action",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
  "cancelled",
] as const;

/** Half-open UTC window for a `<input type="date">` pair: [from 00:00, to+1day 00:00). */
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

function PaymentsPage() {
  const tenant = useTenant();
  const [state, setState] = useState<string>("all");
  const [customerId, setCustomerId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const range = toDateTimeRange(from, to);
  const payments = usePaymentsInfinite({
    state: state === "all" ? undefined : state,
    customerId: customerId === "all" ? undefined : customerId,
    from: range.from,
    to: range.to,
  });
  const customers = useCustomers();
  const connect = useConnectAccount();
  const connectOnboard = useConnectOnboard();
  const connectSync = useConnectSync();

  const currency = tenant.business?.currency ?? "GBP";
  const list = useMemo(() => flattenPages(payments.data, "payments"), [payments.data]);

  const totals = useMemo(() => {
    const succeeded = list.filter(
      (p) => p.state === "succeeded" || p.state === "partially_refunded",
    );
    const gross = succeeded.reduce((s, p) => s + p.amountMinor, 0);
    const refunded = list.reduce((s, p) => s + p.amountRefundedMinor, 0);
    return { gross, refunded, count: list.length };
  }, [list]);

  const nameFor = (customerId: string | null) => {
    if (!customerId) return "—";
    const c = customers.data?.items.find((x) => x.id === customerId);
    return c ? customerDisplayName(c) : "Client";
  };

  const selectedPayment = list.find((p) => p.id === selectedPaymentId) ?? null;

  return (
    <>
      <PageHeader title="Payments" description="Charges taken across bookings and package sales." />

      <Can
        permission={PERMISSIONS.PAYMENT_READ}
        fallback={
          <EmptyState
            title="Payments are restricted"
            description="Ask a business owner or administrator to grant you payment access."
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Gross (shown)" value={formatMoney(totals.gross, currency)} />
          <StatCard label="Refunded (shown)" value={formatMoney(totals.refunded, currency)} />
          <StatCard label="Transactions (shown)" value={String(totals.count)} />
        </div>

        <SectionCard
          title="Payout account"
          description="Where your takings are sent"
          action={
            <Can permission={PERMISSIONS.CONNECT_MANAGE}>
              <div className="flex gap-2">
                {connect.data ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={connectSync.isPending}
                    onClick={async () => {
                      await connectSync.mutateAsync();
                      toast.success("Payout account resynced");
                    }}
                  >
                    <RefreshCw className={connectSync.isPending ? "size-4 animate-spin" : "size-4"} />
                    Resync
                  </Button>
                ) : null}
                {connect.data?.onboardingState !== "complete" ? (
                  <Button
                    size="sm"
                    disabled={connectOnboard.isPending}
                    onClick={async () => {
                      const result = await connectOnboard.mutateAsync();
                      if (result.onboardingUrl) {
                        window.location.href = result.onboardingUrl;
                      }
                    }}
                  >
                    <ExternalLink className="size-4" />
                    {connect.data ? "Finish onboarding" : "Connect payouts"}
                  </Button>
                ) : null}
              </div>
            </Can>
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[150px]"
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[150px]"
                aria-label="To date"
              />
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="w-44">
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
            <>
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
                      <tr
                        key={p.id}
                        className="cursor-pointer hover:bg-secondary/50"
                        onClick={() => setSelectedPaymentId(p.id)}
                      >
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
                              onClick={(e) => e.stopPropagation()}
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
              {payments.hasNextPage ? (
                <div className="flex justify-center border-t p-4">
                  <Button
                    variant="outline"
                    disabled={payments.isFetchingNextPage}
                    onClick={() => payments.fetchNextPage()}
                  >
                    {payments.isFetchingNextPage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </SectionCard>
      </Can>

      <PaymentDetailSheet
        payment={selectedPayment}
        clientName={selectedPayment ? nameFor(selectedPayment.customerId) : ""}
        onClose={() => setSelectedPaymentId(null)}
      />
    </>
  );
}

function PaymentDetailSheet({
  payment,
  clientName,
  onClose,
}: {
  payment: Payment | null;
  clientName: string;
  onClose: () => void;
}) {
  const [refunding, setRefunding] = useState(false);
  const receipt = usePaymentReceipt(payment?.id);

  return (
    <Sheet open={Boolean(payment)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {payment ? (
          <>
            <SheetHeader>
              <SheetTitle>Payment detail</SheetTitle>
              <SheetDescription>
                {formatInTz(payment.createdAt, "Europe/London", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{clientName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(payment.amountMinor, payment.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Refunded</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(payment.amountRefundedMinor, payment.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={payment.state} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider ref</span>
                <span className="font-mono text-xs">
                  {payment.providerPaymentId ?? payment.id}
                </span>
              </div>

              <div className="rounded-xl border p-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ReceiptText className="size-3.5" /> Receipt
                </p>
                {receipt.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading receipt…</p>
                ) : receipt.isError || !receipt.data ? (
                  <p className="text-xs text-muted-foreground">Receipt unavailable.</p>
                ) : (
                  <div className="space-y-1 text-xs">
                    <p>{receipt.data.legalName ?? "—"}</p>
                    {receipt.data.vatRegistered && receipt.data.vatNumber ? (
                      <p className="text-muted-foreground">VAT {receipt.data.vatNumber}</p>
                    ) : (
                      <p className="text-muted-foreground">Not VAT registered</p>
                    )}
                    {receipt.data.receiptNumber ? (
                      <p className="text-muted-foreground">
                        Receipt #{receipt.data.receiptNumber}
                      </p>
                    ) : null}
                    {receipt.data.receiptUrl ? (
                      <a
                        href={receipt.data.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-primary hover:underline"
                      >
                        Open receipt PDF
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <SheetFooter className="mt-6">
              <Can permission={PERMISSIONS.PAYMENT_REFUND}>
                {payment.state === "succeeded" || payment.state === "partially_refunded" ? (
                  <Button variant="outline" className="w-full" onClick={() => setRefunding(true)}>
                    Issue refund
                  </Button>
                ) : null}
              </Can>
            </SheetFooter>

            <RefundDialog payment={payment} open={refunding} onClose={() => setRefunding(false)} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const REFUND_REASONS = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "booking_cancelled", label: "Booking cancelled" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
] as const;

function RefundDialog({
  payment,
  open,
  onClose,
}: {
  payment: Payment;
  open: boolean;
  onClose: () => void;
}) {
  const remainingMinor = payment.amountMinor - payment.amountRefundedMinor;
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState(String(remainingMinor / 100));
  const [reasonCode, setReasonCode] = useState<string>("requested_by_customer");
  const createRefund = useCreateRefund();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setFull(true);
          setAmount(String(remainingMinor / 100));
          setReasonCode("requested_by_customer");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>
            Refunds go back to the original payment method. Up to{" "}
            {formatMoney(remainingMinor, payment.currency)} remaining to refund.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={full}
                onChange={() => {
                  setFull(true);
                  setAmount(String(remainingMinor / 100));
                }}
              />
              Full refund
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!full} onChange={() => setFull(false)} />
              Partial refund
            </label>
          </div>
          {!full ? (
            <div className="grid gap-2">
              <Label htmlFor="refund-amount">Amount ({payment.currency})</Label>
              <Input
                id="refund-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
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
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createRefund.isPending}
            onClick={async () => {
              let amountMinor: number | undefined;
              if (!full) {
                try {
                  amountMinor = parseMoneyToMinor(amount);
                } catch {
                  toast.error("Enter a valid refund amount");
                  return;
                }
                if (amountMinor <= 0 || amountMinor > remainingMinor) {
                  toast.error(
                    `Amount must be between £0.01 and ${formatMoney(remainingMinor, payment.currency)}`,
                  );
                  return;
                }
              }
              try {
                await createRefund.mutateAsync({
                  paymentId: payment.id,
                  reasonCode,
                  ...(amountMinor !== undefined ? { amountMinor } : {}),
                });
                toast.success(full ? "Full refund issued" : "Partial refund issued");
                onClose();
              } catch {
                // Errors surfaced via hook's onError toast.
              }
            }}
          >
            {createRefund.isPending ? "Refunding…" : "Confirm refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
