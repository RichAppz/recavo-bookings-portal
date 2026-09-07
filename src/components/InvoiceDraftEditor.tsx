import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useCustomer, useCustomers } from "@/lib/api/hooks";
import { useUpdateInvoice, type Invoice } from "@/lib/api/invoices";
import type { Customer } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import {
  INVOICE_LINE_LIMITS,
  emptyLineDraft,
  isIsoDate,
  lineToDraft,
  showsVat,
  validateLineDrafts,
  type InvoiceLineDraft,
  type LineDraftError,
} from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * Edit a draft's lines, due date, notes and customer. The API recomputes totals
 * on every save and returns the whole invoice; nothing here does money maths
 * beyond turning "12.50" into 1250 pence.
 */
export function InvoiceDraftEditor({
  invoice,
  onSaved,
  disabled = false,
}: {
  invoice: Invoice;
  onSaved?: (invoice: Invoice) => void;
  /** Read-only view of a draft (e.g. reception, or the bolt-on has lapsed). */
  disabled?: boolean;
}) {
  const update = useUpdateInvoice();
  const customers = useCustomers();
  const currentCustomer = useCustomer(invoice.customerId);

  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => invoice.lines.map(lineToDraft));
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [customerId, setCustomerId] = useState(invoice.customerId);
  const [pickedCustomer, setPickedCustomer] = useState<Customer | null>(null);
  const [lineErrors, setLineErrors] = useState<LineDraftError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // A save (or someone else's edit) returns a fresh version; re-seed from it so
  // the form never drifts from what the server holds.
  useEffect(() => {
    setLines(invoice.lines.map(lineToDraft));
    setDueDate(invoice.dueDate ?? "");
    setNotes(invoice.notes ?? "");
    setCustomerId(invoice.customerId);
    setPickedCustomer(null);
    setLineErrors([]);
    setFormError(null);
    setServerErrors([]);
  }, [
    invoice.version,
    invoice.id,
    invoice.lines,
    invoice.dueDate,
    invoice.notes,
    invoice.customerId,
  ]);

  const selectedCustomer =
    pickedCustomer ??
    customers.data?.items.find((c) => c.id === customerId) ??
    (currentCustomer.data?.id === customerId ? currentCustomer.data : null) ??
    null;

  const vatShown = showsVat(invoice);

  // Live preview of the subtotal from what's typed — labelled as such; the
  // authoritative figures arrive with the saved invoice.
  const typedSubtotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const qty = Number(line.quantity);
      const price = Number(line.unitPrice.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(qty) && Number.isFinite(price)) total += Math.round(price * 100) * qty;
    }
    return total;
  }, [lines]);

  const dirty =
    JSON.stringify(lines) !== JSON.stringify(invoice.lines.map(lineToDraft)) ||
    dueDate !== (invoice.dueDate ?? "") ||
    notes !== (invoice.notes ?? "") ||
    customerId !== invoice.customerId;

  const setLine = (index: number, patch: Partial<InvoiceLineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setLineErrors((prev) => prev.map((e, i) => (i === index ? {} : e)));
  };

  const save = async () => {
    setFormError(null);
    setServerErrors([]);
    const result = validateLineDrafts(lines);
    if (!result.ok) {
      setLineErrors(result.errors);
      setFormError(result.form ?? "Fix the highlighted lines.");
      return;
    }
    if (dueDate && !isIsoDate(dueDate)) {
      setFormError("Due date must be a calendar date.");
      return;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes.length > INVOICE_LINE_LIMITS.notesMax) {
      setFormError(`Notes can be at most ${INVOICE_LINE_LIMITS.notesMax} characters.`);
      return;
    }
    setLineErrors([]);
    try {
      const saved = await update.mutateAsync({
        invoiceId: invoice.id,
        body: {
          lines: result.lines,
          dueDate: dueDate || null,
          notes: trimmedNotes || null,
          ...(customerId !== invoice.customerId ? { customerId } : {}),
        },
      });
      toast.success("Draft saved");
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setServerErrors(
          err.fieldErrors.map((fe) => `${fe.field}: ${fe.message ?? fe.code}`.trim()),
        );
      }
    }
  };

  return (
    <SectionCard
      title="Draft"
      description="Edit freely until you issue it. Totals are recalculated when you save."
    >
      <fieldset disabled={disabled || update.isPending} className="grid gap-5">
        <div className="grid gap-2">
          <Label>Bill to</Label>
          <CustomerSearchPicker
            value={selectedCustomer}
            suggestions={customers.data?.items ?? []}
            placeholder="Choose a client"
            onSelect={(c) => {
              setPickedCustomer(c);
              setCustomerId(c.id);
            }}
          />
          {selectedCustomer && !selectedCustomer.emailNormalised ? (
            <p className="text-xs text-warning-foreground">
              This client has no email address, so the invoice can be issued but not emailed.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <span className="text-xs text-muted-foreground">
              {lines.length}/{INVOICE_LINE_LIMITS.maxLines}
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="w-24 px-3 py-2 text-left font-medium">Qty</th>
                  <th className="w-32 px-3 py-2 text-left font-medium">Unit price</th>
                  {vatShown ? <th className="w-20 px-3 py-2 text-left font-medium">VAT</th> : null}
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, i) => {
                  const errs = lineErrors[i] ?? {};
                  return (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-2">
                        <Input
                          value={line.description}
                          maxLength={INVOICE_LINE_LIMITS.descriptionMax}
                          placeholder="What was done"
                          aria-invalid={Boolean(errs.description)}
                          className={cn(errs.description && "border-destructive")}
                          onChange={(e) => setLine(i, { description: e.target.value })}
                        />
                        {errs.description ? (
                          <p className="mt-1 text-xs text-destructive">{errs.description}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={INVOICE_LINE_LIMITS.quantityMin}
                          max={INVOICE_LINE_LIMITS.quantityMax}
                          step={1}
                          value={line.quantity}
                          aria-invalid={Boolean(errs.quantity)}
                          className={cn(errs.quantity && "border-destructive")}
                          onChange={(e) => setLine(i, { quantity: e.target.value })}
                        />
                        {errs.quantity ? (
                          <p className="mt-1 text-xs text-destructive">{errs.quantity}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.unitPrice}
                          aria-invalid={Boolean(errs.unitPrice)}
                          className={cn("tabular-nums", errs.unitPrice && "border-destructive")}
                          onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                          onBlur={() => {
                            const n = Number(line.unitPrice.replace(/[^0-9.]/g, ""));
                            if (Number.isFinite(n) && line.unitPrice.trim() !== "") {
                              setLine(i, { unitPrice: n.toFixed(2) });
                            }
                          }}
                        />
                        {errs.unitPrice ? (
                          <p className="mt-1 text-xs text-destructive">{errs.unitPrice}</p>
                        ) : null}
                      </td>
                      {vatShown ? (
                        <td className="px-3 py-3">
                          <Switch
                            checked={line.taxable}
                            aria-label="VAT applies"
                            onCheckedChange={(v) => setLine(i, { taxable: v })}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove line"
                          disabled={lines.length <= INVOICE_LINE_LIMITS.minLines}
                          onClick={() => {
                            setLines((prev) => prev.filter((_, j) => j !== i));
                            setLineErrors((prev) => prev.filter((_, j) => j !== i));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length >= INVOICE_LINE_LIMITS.maxLines}
              onClick={() => setLines((prev) => [...prev, emptyLineDraft()])}
            >
              <Plus className="size-4" /> Add line
            </Button>
            <p className="text-xs text-muted-foreground">
              Typed subtotal{" "}
              <span className="tabular-nums font-medium text-foreground">
                {formatMoney(typedSubtotal, invoice.currency)}
              </span>
              {vatShown
                ? invoice.pricesIncludeVat
                  ? " · prices include VAT"
                  : " · VAT added on top"
                : ""}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="invoice-due">Due date</Label>
            <Input
              id="invoice-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use your default payment terms when you issue.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-notes">Notes to the client</Label>
            <Textarea
              id="invoice-notes"
              value={notes}
              maxLength={INVOICE_LINE_LIMITS.notesMax}
              rows={3}
              placeholder="Optional — printed above the footer."
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        {serverErrors.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-destructive">
            {serverErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        {!disabled ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty}
              onClick={() => {
                setLines(invoice.lines.map(lineToDraft));
                setDueDate(invoice.dueDate ?? "");
                setNotes(invoice.notes ?? "");
                setCustomerId(invoice.customerId);
                setPickedCustomer(null);
                setLineErrors([]);
                setFormError(null);
                setServerErrors([]);
              }}
            >
              Discard changes
            </Button>
            <Button type="button" disabled={!dirty || update.isPending} onClick={() => void save()}>
              {update.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </SectionCard>
  );
}
