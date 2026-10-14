import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FileText, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteDraftInvoiceDialog } from "@/components/DeleteDraftInvoiceDialog";
import { TableGhost } from "@/components/ghost";
import { InvoiceNumber, InvoiceOriginTag, InvoiceStatusBadge } from "@/components/InvoicesTable";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { Button } from "@/components/ui/button";
import {
  isCustomerHasNoEmail,
  isFeatureNotAvailable,
  useBookingInvoices,
  useCreateInvoice,
  useInvoicingEntitled,
  useSendInvoice,
  type Invoice,
} from "@/lib/api/invoices";
import type { Booking } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import { invoiceAllows } from "@/lib/invoices";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * The invoices raised against one job, inside the booking panel. Shows the
 * auto-invoice once the completion worker has run, lets staff raise a manual
 * one pre-filled from the booking, and offers "Send" when an invoice was issued
 * but never emailed (customer had no address at the time).
 */
export function BookingInvoices({
  booking,
  customerEmail,
  onNavigate,
}: {
  booking: Booking;
  customerEmail: string | null;
  /** Called before navigating away so the host can close the panel. */
  onNavigate?: () => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const invoices = useBookingInvoices(booking.id);
  const create = useCreateInvoice();
  const send = useSendInvoice();
  const entitled = useInvoicingEntitled();
  const [upsell, setUpsell] = useState(false);
  const [deleting, setDeleting] = useState<Invoice | null>(null);

  if (!tenant.can(PERMISSIONS.INVOICE_READ)) return null;
  const canManage = tenant.can(PERMISSIONS.INVOICE_MANAGE);
  const list = invoices.data ?? [];
  const hasLive = list.some((inv) => inv.status !== "void");

  const createFromBooking = async () => {
    if (entitled === false) {
      setUpsell(true);
      return;
    }
    try {
      const invoice = await create.mutateAsync({ bookingId: booking.id });
      toast.success("Draft invoice created from this job");
      onNavigate?.();
      void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
    }
  };

  const sendOne = async (invoiceId: string, number: string | null) => {
    if (entitled === false) {
      setUpsell(true);
      return;
    }
    try {
      await send.mutateAsync({ invoiceId });
      toast.success(`Invoice ${number ?? ""} sent`.trim());
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
      else if (isCustomerHasNoEmail(err)) {
        toast.error("This client has no email address", {
          description: "Add one to their profile and try again.",
        });
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Invoices
        </p>
        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            disabled={create.isPending || entitled === undefined}
            title={
              entitled === false
                ? "Invoicing isn’t on your plan yet — add the bolt-on to raise invoices."
                : hasLive
                  ? "Raise a follow-up invoice for this job"
                  : undefined
            }
            onClick={() => void createFromBooking()}
          >
            <Plus className="size-4" />
            {create.isPending ? "Creating…" : hasLive ? "Create another" : "Create invoice"}
          </Button>
        ) : null}
      </div>

      {invoices.isLoading ? (
        <TableGhost rows={2} />
      ) : invoices.isError ? (
        <p className="text-xs text-destructive">Couldn't load invoices.</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <FileText className="mr-1.5 inline size-3.5 align-text-bottom" />
          No invoice for this job yet.
          {entitled && booking.status !== "completed"
            ? " One is issued automatically when it’s marked attended, if auto-invoicing is on."
            : ""}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {/* The whole row opens the invoice — on a phone the number alone was too small a
              target. The link is stretched over the row with a pseudo-element; the Send
              and Delete buttons sit above it so they still act on their own. */}
          {list.map((inv) => (
            <li
              key={inv.id}
              className="relative flex items-center justify-between gap-3 p-3 transition-colors hover:bg-secondary/60 has-[a:focus-visible]:bg-secondary/60 active:bg-secondary"
            >
              <div className="min-w-0">
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: inv.id }}
                  onClick={onNavigate}
                  aria-label={`Open invoice ${inv.number ?? "draft"}`}
                  className="flex items-center gap-2 text-sm font-medium outline-none after:absolute after:inset-0 after:content-['']"
                >
                  <InvoiceNumber invoice={inv} />
                  <InvoiceOriginTag invoice={inv} />
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(inv.totalMinor, inv.currency)}
                  {inv.status === "issued" || inv.status === "paid"
                    ? inv.sentAt
                      ? " · Sent"
                      : " · Not sent"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <InvoiceStatusBadge invoice={inv} />
                {canManage && !inv.sentAt && invoiceAllows(inv.status, "send") ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="relative z-10"
                    disabled={send.isPending || !customerEmail}
                    title={!customerEmail ? "Add an email address to the client first" : undefined}
                    onClick={() => void sendOne(inv.id, inv.number)}
                  >
                    <Mail className="size-4" /> Send
                  </Button>
                ) : null}
                {canManage && invoiceAllows(inv.status, "delete") ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete draft"
                    title="Delete this draft"
                    className="relative z-10 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(inv)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <DeleteDraftInvoiceDialog
        invoice={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
      <InvoicingUpgradeDialog open={upsell} onOpenChange={setUpsell} />
    </div>
  );
}
