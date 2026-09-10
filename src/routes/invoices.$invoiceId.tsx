import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, CheckCircle2, ChevronDown, Download, Eye, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BookingPanel } from "@/components/BookingPanel";
import { DetailGhost } from "@/components/ghost";
import { InvoiceDraftEditor } from "@/components/InvoiceDraftEditor";
import { InvoiceOriginTag, InvoiceStatusBadge } from "@/components/InvoicesTable";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { EmptyState, SectionCard } from "@/components/ui-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, toastApiError } from "@/lib/api";
import { useBusinessId, useCustomer } from "@/lib/api/hooks";
import {
  fetchInvoicePdf,
  isCustomerHasNoEmail,
  isFeatureNotAvailable,
  saveBlob,
  useInvoice,
  useInvoicingEntitled,
  useIssueInvoice,
  useMarkInvoicePaid,
  useSendInvoice,
  useVoidInvoice,
  type Invoice,
} from "@/lib/api/invoices";
import { customerDisplayName } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { formatInTz, formatMoney, ukDate } from "@/lib/format";
import {
  formatVatRate,
  invoiceAllows,
  invoiceBalanceMinor,
  invoiceLinkedRecord,
  showsVat,
  type InvoiceAddress,
} from "@/lib/invoices";
import { PERMISSIONS } from "@/lib/permissions";
import { RequirePermission, useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — RECAVO" },
      { name: "description", content: "Invoice detail: lines, totals, payment and PDF." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <RequirePermission permission={PERMISSIONS.INVOICE_READ}>
          <InvoiceDetail />
        </RequirePermission>
      </AppShell>
    </RequireAuth>
  ),
});

function addressLines(address: InvoiceAddress | null): string[] {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.city, address.region].filter(Boolean).join(", "),
    address.postalCode,
    address.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
}

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const tenant = useTenant();
  const businessId = useBusinessId();
  const invoiceQuery = useInvoice(invoiceId);
  const invoice = invoiceQuery.data;
  const customer = useCustomer(invoice?.customerId);
  const entitled = useInvoicingEntitled();

  const issue = useIssueInvoice();
  const send = useSendInvoice();
  const markPaid = useMarkInvoicePaid();
  const voidInvoice = useVoidInvoice();

  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<"download" | "preview" | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  const canManage = tenant.can(PERMISSIONS.INVOICE_MANAGE);
  const timezone = invoice?.seller.timezone ?? tenant.business?.defaultTimezone ?? "Europe/London";

  if (invoiceQuery.isLoading) return <DetailGhost />;
  if (invoiceQuery.isError || !invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        description={
          invoiceQuery.error instanceof ApiError
            ? invoiceQuery.error.detail || invoiceQuery.error.title
            : "This invoice may have been removed."
        }
        action={
          <Button asChild>
            <Link to="/invoices">Back to invoices</Link>
          </Button>
        }
      />
    );
  }

  const inv: Invoice = invoice;
  const balance = invoiceBalanceMinor(inv);
  const vat = showsVat(inv);
  const record = invoiceLinkedRecord(inv);
  const customerName = customer.data ? customerDisplayName(customer.data) : inv.billTo.name;
  const customerEmail = inv.billTo.email ?? customer.data?.emailNormalised ?? null;
  const busy = issue.isPending || send.isPending || markPaid.isPending || voidInvoice.isPending;

  const allows = (action: Parameters<typeof invoiceAllows>[1]) =>
    canManage && invoiceAllows(inv.status, action);

  const guardEntitled = (): boolean => {
    if (entitled === false) {
      setUpsell(true);
      return false;
    }
    return true;
  };

  const downloadPdf = async () => {
    setPdfBusy("download");
    try {
      saveBlob(await fetchInvoicePdf(businessId, inv));
    } catch (err) {
      toastApiError(err, "Couldn't download the PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  const previewPdf = async () => {
    setPdfBusy("preview");
    try {
      const { blob } = await fetchInvoicePdf(businessId, inv);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toastApiError(err, "Couldn't load the PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const doIssue = async (withSend: boolean) => {
    if (!guardEntitled()) return;
    try {
      const issued = await issue.mutateAsync({ invoiceId: inv.id, send: withSend });
      toast.success(
        withSend ? `Invoice ${issued.number} issued and sent` : `Invoice ${issued.number} issued`,
        withSend ? undefined : { description: "Download the PDF or send it when you're ready." },
      );
      if (!withSend) void downloadPdf();
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
      else if (isCustomerHasNoEmail(err)) {
        toast.error("This client has no email address", {
          description: "Add one to their profile, or issue and download the PDF instead.",
        });
      }
    }
  };

  const doSend = async () => {
    if (!guardEntitled()) return;
    try {
      await send.mutateAsync({ invoiceId: inv.id });
      toast.success(`Invoice ${inv.number} sent`, {
        description: customerEmail ? `Emailed to ${customerEmail}` : undefined,
      });
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
      else if (isCustomerHasNoEmail(err)) {
        toast.error("This client has no email address", {
          description: "Add one to their profile and try again.",
        });
      }
    }
  };

  const doMarkPaid = async () => {
    if (!guardEntitled()) return;
    try {
      await markPaid.mutateAsync({ invoiceId: inv.id });
      toast.success(`Invoice ${inv.number} marked as paid`);
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
    } finally {
      setConfirmPaid(false);
    }
  };

  const doVoid = async () => {
    if (!guardEntitled()) return;
    try {
      await voidInvoice.mutateAsync({ invoiceId: inv.id });
      toast.success(inv.number ? `Invoice ${inv.number} voided` : "Draft voided");
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
    } finally {
      setConfirmVoid(false);
    }
  };

  const title = inv.number ?? "Draft invoice";

  return (
    <>
      <Link
        to="/invoices"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All invoices
      </Link>

      <div className="surface-card flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <InvoiceStatusBadge invoice={inv} />
            <InvoiceOriginTag invoice={inv} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              to="/clients/$clientId"
              params={{ clientId: inv.customerId }}
              className="font-medium text-foreground hover:underline"
            >
              {customerName}
            </Link>
            {customerEmail ? ` · ${customerEmail}` : " · No email on file"}
            {inv.bookingReference ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="font-mono text-xs hover:underline"
                  onClick={() => setBookingOpen(true)}
                >
                  {inv.bookingReference}
                </button>
              </>
            ) : null}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd>{inv.issueDate ? ukDate(inv.issueDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due</dt>
              <dd>{inv.dueDate ? ukDate(inv.dueDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(inv.totalMinor, inv.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Balance due</dt>
              <dd className="tabular-nums font-medium">
                {inv.status === "void" ? "—" : formatMoney(balance, inv.currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {inv.sentAt
              ? `Sent ${formatInTz(inv.sentAt, timezone)}`
              : inv.status === "issued" || inv.status === "paid"
                ? "Not sent"
                : null}
            {inv.paidAt ? ` · Paid ${formatInTz(inv.paidAt, timezone)}` : null}
            {inv.voidedAt ? ` · Voided ${formatInTz(inv.voidedAt, timezone)}` : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" disabled={pdfBusy !== null} onClick={() => void previewPdf()}>
            <Eye className="size-4" /> {pdfBusy === "preview" ? "Loading…" : "Preview"}
          </Button>
          <Button variant="outline" disabled={pdfBusy !== null} onClick={() => void downloadPdf()}>
            <Download className="size-4" /> {pdfBusy === "download" ? "Preparing…" : "Download PDF"}
          </Button>
          {allows("issue") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={busy || inv.lines.length === 0}>
                  <Send className="size-4" /> {issue.isPending ? "Issuing…" : "Issue"}
                  <ChevronDown className="size-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Allocates the next number and locks the invoice.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!customerEmail} onSelect={() => void doIssue(true)}>
                  <Mail className="size-4" />
                  <span className="flex-1">Issue &amp; send</span>
                  {!customerEmail ? (
                    <span className="text-xs text-muted-foreground">No email</span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void doIssue(false)}>
                  <Download className="size-4" />
                  <span className="flex-1">Issue &amp; download</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {allows("send") ? (
            <Button
              variant={inv.sentAt ? "outline" : "default"}
              disabled={busy || !customerEmail}
              title={!customerEmail ? "Add an email address to the client first" : undefined}
              onClick={() => void doSend()}
            >
              <Mail className="size-4" />
              {send.isPending ? "Sending…" : inv.sentAt ? "Resend" : "Send"}
            </Button>
          ) : null}
          {allows("markPaid") ? (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmPaid(true)}>
              <CheckCircle2 className="size-4" /> Mark paid
            </Button>
          ) : null}
          {allows("void") ? (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmVoid(true)}>
              <Ban className="size-4" /> Void
            </Button>
          ) : null}
        </div>
      </div>

      {inv.status === "draft" ? (
        <InvoiceDraftEditor invoice={inv} disabled={!canManage || entitled === false} />
      ) : null}

      {inv.status === "draft" && entitled === false && canManage ? (
        <p className="text-sm text-muted-foreground">
          Invoicing isn’t on your plan, so this draft can’t be edited or issued until the bolt-on is
          added.{" "}
          <button type="button" className="underline" onClick={() => setUpsell(true)}>
            Add invoicing
          </button>
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Lines" bodyClassName="p-0">
          {record ? (
            <div className="border-b px-4 py-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{record.label}</p>
              <p className="mt-0.5 font-medium">{record.value}</p>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Description</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit</th>
                  {vat ? <th className="px-4 py-2.5 text-right font-medium">Net</th> : null}
                  {vat ? <th className="px-4 py-2.5 text-right font-medium">VAT</th> : null}
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inv.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      {line.description}
                      {vat && !line.taxable ? (
                        <span className="ml-2 text-xs text-muted-foreground">(no VAT)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(line.unitPriceMinor, inv.currency)}
                    </td>
                    {vat ? (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(line.netMinor, inv.currency)}
                      </td>
                    ) : null}
                    {vat ? (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(line.vatMinor, inv.currency)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatMoney(line.totalMinor, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto grid w-full max-w-xs gap-1.5 border-t px-4 py-4 text-sm">
            {vat ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(inv.subtotalMinor, inv.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    VAT @ {formatVatRate(inv.vatRateBps ?? 0)}
                  </dt>
                  <dd className="tabular-nums">{formatMoney(inv.vatMinor, inv.currency)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(inv.totalMinor, inv.currency)}</dd>
            </div>
            {inv.paidMinor > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums">−{formatMoney(inv.paidMinor, inv.currency)}</dd>
              </div>
            ) : null}
            {inv.status !== "void" ? (
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatMoney(balance, inv.currency)}</dd>
              </div>
            ) : null}
          </dl>
          {inv.notes ? (
            <div className="border-t px-4 py-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{inv.notes}</p>
            </div>
          ) : null}
        </SectionCard>

        <div className="grid gap-5 self-start">
          <SectionCard
            title="Parties"
            description={
              inv.status === "draft"
                ? "Filled from your current settings when you issue."
                : "Frozen when the invoice was issued."
            }
          >
            <div className="grid gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">From</p>
                <p className="mt-1 font-medium">{inv.seller.legalName || inv.seller.tradingName}</p>
                {inv.seller.tradingName && inv.seller.tradingName !== inv.seller.legalName ? (
                  <p className="text-muted-foreground">trading as {inv.seller.tradingName}</p>
                ) : null}
                {addressLines(inv.seller.address).map((l) => (
                  <p key={l} className="text-muted-foreground">
                    {l}
                  </p>
                ))}
                {inv.seller.vatNumber ? (
                  <p className="text-muted-foreground">VAT {inv.seller.vatNumber}</p>
                ) : null}
                {inv.taxTreatment === "not_vat_registered" ? (
                  <p className="text-xs text-muted-foreground">Not VAT registered</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Bill to</p>
                <p className="mt-1 font-medium">{inv.billTo.name}</p>
                {inv.billTo.email ? (
                  <p className="text-muted-foreground">{inv.billTo.email}</p>
                ) : null}
                {addressLines(inv.billTo.address).map((l) => (
                  <p key={l} className="text-muted-foreground">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          </SectionCard>

          {inv.paymentInstructions ? (
            <SectionCard
              title="How to pay"
              description="Printed on the PDF while a balance is due."
            >
              <dl className="grid gap-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account name</dt>
                  <dd className="text-right">{inv.paymentInstructions.accountName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Sort code</dt>
                  <dd className="font-mono">{inv.paymentInstructions.sortCode}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account number</dt>
                  <dd className="font-mono">{inv.paymentInstructions.accountNumber}</dd>
                </div>
                {inv.paymentInstructions.iban ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">IBAN</dt>
                    <dd className="font-mono">{inv.paymentInstructions.iban}</dd>
                  </div>
                ) : null}
                {inv.paymentInstructions.bic ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">BIC</dt>
                    <dd className="font-mono">{inv.paymentInstructions.bic}</dd>
                  </div>
                ) : null}
                {inv.number ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-mono">{inv.number}</dd>
                  </div>
                ) : null}
              </dl>
            </SectionCard>
          ) : null}

          {inv.footerNote ? (
            <SectionCard title="Footer">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{inv.footerNote}</p>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {inv.status === "draft"
                ? "Watermarked DRAFT until issued."
                : inv.status === "paid"
                  ? "Stamped PAID."
                  : inv.status === "void"
                    ? "Stamped VOID."
                    : "As the client will receive it."}
            </DialogDescription>
          </DialogHeader>
          {previewUrl ? (
            <iframe
              title={`${title} PDF`}
              src={previewUrl}
              className="h-[70vh] w-full rounded-xl border bg-muted"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmPaid} onOpenChange={setConfirmPaid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {inv.number} as paid?</AlertDialogTitle>
            <AlertDialogDescription>
              Records {formatMoney(balance, inv.currency)} as received outside RECAVO (bank
              transfer, cash…). The PDF will be stamped PAID. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction disabled={markPaid.isPending} onClick={() => void doMarkPaid()}>
              Mark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmVoid} onOpenChange={setConfirmVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {inv.number ?? "this draft"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {inv.number
                ? `${inv.number} stays on record, stamped VOID, and its number is never reused. Raise a new invoice for any corrected charge.`
                : "The draft is kept for your records but can no longer be edited or issued."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={voidInvoice.isPending} onClick={() => void doVoid()}>
              Void invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoicingUpgradeDialog open={upsell} onOpenChange={setUpsell} />
      {inv.bookingId ? (
        <BookingPanel
          bookingId={bookingOpen ? inv.bookingId : null}
          onClose={() => setBookingOpen(false)}
        />
      ) : null}
    </>
  );
}
