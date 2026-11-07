import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toastApiError } from "@/lib/api";
import { useBookingInvoices } from "@/lib/api/invoices";
import {
  useBookingSettlements,
  useCustomer,
  useCustomerBookings,
  useMoveRecordedPayment,
  type BookingSettlementEntry,
  type SettlementMethod,
} from "@/lib/api/hooks";
import { customerDisplayName, type Booking, type Customer } from "@/lib/api/types";
import { canTakeMovedPayment } from "@/lib/booking-payment";
import { formatInTz, formatMoney } from "@/lib/format";

const METHOD_LABELS: Record<SettlementMethod, string> = {
  card_online: "Card",
  card_manual: "Card (taken elsewhere)",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

function serviceName(b: Booking): string {
  return (b.lineItems?.length ?? 0) > 1
    ? b.lineItems.map((li) => li.name).join(" + ")
    : b.serviceSnapshot.name;
}

/**
 * Cash, bank transfer and card machine payments recorded against this booking, each with a
 * way to move it if it was put on the wrong one. Card payments taken online are listed by
 * the Payments tab already and stay with the booking they were charged for.
 */
export function RecordedPayments({ booking, timezone }: { booking: Booking; timezone: string }) {
  const settlements = useBookingSettlements(booking.id);
  const [moving, setMoving] = useState<BookingSettlementEntry | null>(null);
  const recorded = (settlements.data ?? []).filter(
    (s) => s.kind === "payment" && s.method !== "card_online",
  );
  if (recorded.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Recorded payments
      </p>
      <ul className="divide-y rounded-xl border">
        {recorded.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {formatMoney(s.amountMinor, s.currency)}{" "}
                <span className="font-normal text-muted-foreground">
                  · {METHOD_LABELS[s.method]}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatInTz(s.occurredAt, timezone, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setMoving(s)}>
              <ArrowRightLeft className="size-4" />
              Move
            </Button>
          </li>
        ))}
      </ul>
      <MoveRecordedPaymentDialog
        payment={moving}
        from={booking}
        timezone={timezone}
        onOpenChange={(open) => {
          if (!open) setMoving(null);
        }}
      />
    </div>
  );
}

function MoveRecordedPaymentDialog({
  payment,
  from,
  timezone,
  onOpenChange,
}: {
  payment: BookingSettlementEntry | null;
  from: Booking;
  timezone: string;
  onOpenChange: (open: boolean) => void;
}) {
  const open = payment !== null;
  const leadCustomer = useCustomer(from.leadCustomerId);
  const [client, setClient] = useState<Customer | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const move = useMoveRecordedPayment();
  const fromInvoices = useBookingInvoices(open ? from.id : undefined);
  // The API refuses while one of these says the money arrived here; say so before they pick.
  const blockingInvoice =
    (fromInvoices.data ?? []).find((i) => i.status === "issued" || i.status === "paid") ?? null;

  const paymentId = payment?.id;
  useEffect(() => {
    if (open) {
      setClient(null);
      setTargetId("");
    }
  }, [open, paymentId]);

  const chosenClient = client ?? leadCustomer.data ?? null;
  const clientBookings = useCustomerBookings(open ? chosenClient?.id : undefined);
  const { eligible, ineligibleCount } = useMemo(() => {
    const others = (clientBookings.data ?? []).filter((b) => b.id !== from.id);
    const ok = payment ? others.filter((b) => canTakeMovedPayment(b, from.id, payment)) : [];
    // Nearest in time to the booking it was put on first: the usual slip is the job next to it.
    const anchor = new Date(from.start).getTime();
    ok.sort(
      (a, b) =>
        Math.abs(new Date(a.start).getTime() - anchor) -
        Math.abs(new Date(b.start).getTime() - anchor),
    );
    return { eligible: ok, ineligibleCount: others.length - ok.length };
  }, [clientBookings.data, from, payment]);

  const submit = async () => {
    if (!payment || !targetId) return;
    const target = eligible.find((b) => b.id === targetId);
    try {
      await move.mutateAsync({
        settlementId: payment.id,
        fromBookingId: from.id,
        toBookingId: targetId,
      });
      toast.success(`Moved ${formatMoney(payment.amountMinor, payment.currency)}`, {
        description: target
          ? `It's now on ${target.reference ?? "the booking"} for ${serviceName(target)}.`
          : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      toastApiError(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move this payment</DialogTitle>
          <DialogDescription>
            {payment
              ? `Recorded on the wrong booking? The ${formatMoney(payment.amountMinor, payment.currency)} ${METHOD_LABELS[payment.method].toLowerCase()} payment comes off this booking and goes on the one you pick. Your takings don't change.`
              : null}
          </DialogDescription>
        </DialogHeader>
        {blockingInvoice ? (
          <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
            <p>
              Invoice {blockingInvoice.number ?? ""} for this booking already shows this money as
              received. Void it first, then move the payment. You can issue a corrected invoice
              afterwards.
            </p>
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: blockingInvoice.id }}
              className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open invoice {blockingInvoice.number ?? ""}
            </Link>
          </div>
        ) : null}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Client</Label>
            <CustomerSearchPicker value={chosenClient} onSelect={setClient} />
          </div>
          <div className="grid gap-2">
            <Label id="move-target-label">Booking</Label>
            {clientBookings.isLoading || (!chosenClient && leadCustomer.isLoading) ? (
              <p className="text-sm text-muted-foreground">Loading bookings…</p>
            ) : clientBookings.isError ? (
              <p className="text-sm text-destructive">Couldn't load this client's bookings.</p>
            ) : eligible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other booking for this client still owes{" "}
                {payment ? formatMoney(payment.amountMinor, payment.currency) : "that much"}. Pick
                another client, or check the booking you want is confirmed.
              </p>
            ) : (
              <RadioGroup
                value={targetId}
                onValueChange={setTargetId}
                aria-labelledby="move-target-label"
                className="max-h-64 gap-0 divide-y overflow-y-auto rounded-xl border"
              >
                {eligible.map((b) => (
                  <label
                    key={b.id}
                    htmlFor={`move-target-${b.id}`}
                    className="flex cursor-pointer items-start gap-3 p-3"
                  >
                    <RadioGroupItem value={b.id} id={`move-target-${b.id}`} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{serviceName(b)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatInTz(b.start, timezone, { dateStyle: "medium", timeStyle: "short" })}
                        {b.reference ? ` · ${b.reference}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatMoney(b.priceMinor - (b.paidMinor ?? 0), b.currency)} owed
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
            {ineligibleCount > 0 && eligible.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {ineligibleCount === 1
                  ? "1 other booking isn't listed: it's"
                  : `${ineligibleCount} other bookings aren't listed: they're`}{" "}
                cancelled, not yet confirmed, paid by package credit, or owe less than{" "}
                {payment ? formatMoney(payment.amountMinor, payment.currency) : "this"}.
              </p>
            ) : null}
            {chosenClient && chosenClient.id !== from.leadCustomerId ? (
              <p className="text-xs text-muted-foreground">
                The payment will show under {customerDisplayName(chosenClient)}.
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!targetId || move.isPending || Boolean(blockingInvoice)}
            onClick={() => void submit()}
          >
            {move.isPending ? "Moving…" : "Move payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
