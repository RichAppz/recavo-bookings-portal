import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomer, useCustomers } from "@/lib/api/hooks";
import { isFeatureNotAvailable, useCreateInvoice } from "@/lib/api/invoices";
import type { Customer } from "@/lib/api/types";
import { emptyLineDraft, validateLineDrafts, type InvoiceLineDraft } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * Start a manual invoice: pick the client and the first line (the API needs at
 * least one), then land in the draft editor for the rest. Jobs skip this — the
 * booking panel creates from the booking directly with its lines pre-filled.
 */
export function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a client (e.g. opened from their profile). */
  defaultCustomerId?: string;
}) {
  const navigate = useNavigate();
  const create = useCreateInvoice();
  const customers = useCustomers();
  const preselected = useCustomer(defaultCustomerId);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [line, setLine] = useState<InvoiceLineDraft>(emptyLineDraft);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLine(emptyLineDraft());
    setError(null);
    setCustomer(preselected.data ?? null);
  }, [open, preselected.data]);

  const submit = async () => {
    setError(null);
    if (!customer) {
      setError("Choose a client.");
      return;
    }
    const result = validateLineDrafts([line]);
    if (!result.ok) {
      const first = result.errors[0] ?? {};
      setError(
        first.description ??
          first.quantity ??
          first.unitPrice ??
          result.form ??
          "Check the first line.",
      );
      return;
    }
    try {
      const invoice = await create.mutateAsync({ customerId: customer.id, lines: result.lines });
      onOpenChange(false);
      toast.success("Draft invoice created");
      void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    } catch (err) {
      if (isFeatureNotAvailable(err)) setUpsell(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>
              Start with the client and one line. You can add more lines, set a due date and add
              notes before issuing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Client</Label>
              <CustomerSearchPicker
                value={customer}
                suggestions={customers.data?.items ?? []}
                placeholder="Choose or search for a client"
                onSelect={setCustomer}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-invoice-description">First line</Label>
              <Input
                id="new-invoice-description"
                placeholder="e.g. Full valet"
                value={line.description}
                onChange={(e) => setLine((l) => ({ ...l, description: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="new-invoice-qty" className="text-xs text-muted-foreground">
                    Quantity
                  </Label>
                  <Input
                    id="new-invoice-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => setLine((l) => ({ ...l, quantity: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-invoice-price" className="text-xs text-muted-foreground">
                    Unit price
                  </Label>
                  <Input
                    id="new-invoice-price"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="tabular-nums"
                    value={line.unitPrice}
                    onChange={(e) => setLine((l) => ({ ...l, unitPrice: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            {error ? <p className={cn("text-sm text-destructive")}>{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={create.isPending} onClick={() => void submit()}>
              {create.isPending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InvoicingUpgradeDialog open={upsell} onOpenChange={setUpsell} />
    </>
  );
}
