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
} from "@/components/ui/alert-dialog";
import { useDeleteInvoice, type Invoice } from "@/lib/api/invoices";
import { formatMoney } from "@/lib/format";

/**
 * Confirm-and-delete for a draft invoice. Drafts have no number, so deleting one
 * leaves no gap on record — unlike issued invoices, which are voided instead.
 */
export function DeleteDraftInvoiceDialog({
  invoice,
  onOpenChange,
  onDeleted,
}: {
  /** The draft to delete; null keeps the dialog closed. */
  invoice: Pick<Invoice, "id" | "status" | "totalMinor" | "currency"> | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteInvoice();
  const open = invoice !== null && invoice.status === "draft";

  const confirm = async () => {
    if (!invoice) return;
    try {
      await del.mutateAsync({ invoiceId: invoice.id });
      toast.success("Draft deleted");
      onOpenChange(false);
      onDeleted?.();
    } catch {
      // toasted by the hook; a 409 means it was issued meanwhile — the list refreshes.
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            {invoice
              ? `The ${formatMoney(invoice.totalMinor, invoice.currency)} draft is removed for good. It has no invoice number, so nothing is left on record — you can always raise a new one.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction disabled={del.isPending} onClick={() => void confirm()}>
            {del.isPending ? "Deleting…" : "Delete draft"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
