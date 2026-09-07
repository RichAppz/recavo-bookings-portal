import { useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import { TableGhost } from "@/components/ghost";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastApiError } from "@/lib/api";
import type { PortalBusinessSummary } from "@/lib/api/hooks";
import {
  fetchPortalInvoicePdf,
  saveBlob,
  usePortalInvoicesAcrossStudios,
  type PortalInvoice,
} from "@/lib/api/invoices";
import { formatMoney, isoDate, ukDate } from "@/lib/format";
import { invoiceBalanceMinor, isInvoiceOverdue, sortInvoicesNewestFirst } from "@/lib/invoices";

/**
 * A customer's invoices across every studio they deal with — issued and paid
 * only; the API hides drafts and voids from them. Each row can be previewed or
 * downloaded as the PDF the studio sent.
 */
export function AccountInvoices({ studios }: { studios: readonly PortalBusinessSummary[] }) {
  const invoices = usePortalInvoicesAcrossStudios(studios);
  const solo = studios.length === 1;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ invoice: PortalInvoice; url: string } | null>(null);

  const download = async (inv: PortalInvoice) => {
    setBusyId(inv.id);
    try {
      saveBlob(await fetchPortalInvoicePdf(inv.studio.id, inv));
    } catch (err) {
      toastApiError(err, "Couldn't download the invoice");
    } finally {
      setBusyId(null);
    }
  };

  const open = async (inv: PortalInvoice) => {
    setBusyId(inv.id);
    try {
      const { blob } = await fetchPortalInvoicePdf(inv.studio.id, inv);
      setPreview({ invoice: inv, url: URL.createObjectURL(blob) });
    } catch (err) {
      toastApiError(err, "Couldn't open the invoice");
    } finally {
      setBusyId(null);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  if (invoices.isPending) {
    return (
      <SectionCard bodyClassName="p-0 sm:p-0">
        <TableGhost rows={4} />
      </SectionCard>
    );
  }

  const list = sortInvoicesNewestFirst(invoices.data);
  const today = isoDate(new Date());

  return (
    <>
      {invoices.isPartial ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          One of your studios didn't load, so this may be incomplete. Refresh to try again.
        </p>
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="No invoices yet"
          description="Invoices a business sends you will be listed here, ready to download."
        />
      ) : (
        <SectionCard bodyClassName="p-0 sm:p-0">
          <ul className="divide-y">
            {list.map((inv) => {
              const balance = invoiceBalanceMinor(inv);
              const overdue = isInvoiceOverdue(inv, today);
              const busy = busyId === inv.id;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="font-mono text-xs">{inv.number}</span>
                      <span className="tabular-nums">
                        {formatMoney(inv.totalMinor, inv.currency)}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {inv.issueDate ? ukDate(inv.issueDate) : ""}
                      {solo ? "" : ` · ${inv.studio.tradingName}`}
                      {inv.status === "issued" && inv.dueDate
                        ? ` · Due ${ukDate(inv.dueDate)}`
                        : ""}
                      {inv.status === "issued" && balance > 0 && balance !== inv.totalMinor
                        ? ` · ${formatMoney(balance, inv.currency)} outstanding`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={overdue ? "overdue" : inv.status} />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Preview ${inv.number}`}
                      onClick={() => void open(inv)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void download(inv)}
                    >
                      <Download className="size-4" /> {busy ? "Preparing…" : "PDF"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.invoice.number}</DialogTitle>
            <DialogDescription>
              {preview ? `From ${preview.invoice.studio.tradingName}` : ""}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <iframe
              title={`${preview.invoice.number} PDF`}
              src={preview.url}
              className="h-[70vh] w-full rounded-xl border bg-muted"
            />
          ) : null}
          {preview ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void download(preview.invoice)}>
                <Download className="size-4" /> Download
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
