import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCancelRecordedPayment } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/invoices";
import type { RecordedMoneyLine } from "@/lib/booking-money";
import { settlementMethodLabel } from "@/lib/booking-money";
import { formatMoney } from "@/lib/format";

/**
 * Cancel on a payment staff recorded by hand. For one entered by mistake: it comes off the
 * booking and out of takings. An issued invoice says the money arrived, so that has to be
 * voided first; the API refuses otherwise.
 */
export function CancelRecordedPayment({
  bookingId,
  line,
  issuedInvoice,
}: {
  bookingId: string;
  line: RecordedMoneyLine;
  issuedInvoice: Invoice | undefined;
}) {
  const cancel = useCancelRecordedPayment();
  const amount = formatMoney(line.amountMinor, line.currency);
  const method = settlementMethodLabel(line.method).toLowerCase();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={cancel.isPending}>
          {cancel.isPending ? "Cancelling…" : "Cancel"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this {amount} payment?</AlertDialogTitle>
          <AlertDialogDescription>
            {issuedInvoice ? (
              <>
                This booking's invoice shows the money as received. Void the invoice first, then
                cancel the payment.{" "}
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: issuedInvoice.id }}
                  className="font-medium text-primary underline"
                >
                  Open the invoice
                </Link>
              </>
            ) : (
              <>
                For a {method} payment recorded by mistake. It comes off this booking and out of
                your takings, as if it was never recorded. If you gave the money back, record a
                refund instead.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep payment</AlertDialogCancel>
          {issuedInvoice ? null : (
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                cancel.mutate(
                  { settlementId: line.id, bookingId },
                  { onSuccess: () => toast.success(`${amount} payment cancelled`) },
                )
              }
            >
              Cancel payment
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
