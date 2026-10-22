import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
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
import {
  useCustomer,
  useCustomerLinkedRecords,
  useCustomers,
  useLinkedRecordDefinition,
} from "@/lib/api/hooks";
import { useUpdateInvoice, type Invoice } from "@/lib/api/invoices";
import type { Customer } from "@/lib/api/types";
import { formatMoney } from "@/lib/format";
import {
  INVOICE_LINE_LIMITS,
  INVOICE_LINKED_RECORD_LIMITS,
  emptyLineDraft,
  invoiceLinkedRecord,
  isIsoDate,
  lineToDraft,
  linkedRecordBaseLabel,
  linkedRecordEntries,
  linkedRecordInput,
  linkedRecordProblem,
  pluralRecordTerm,
  showsVat,
  supportsLinkedRecord,
  upperCaseRegistration,
  validateLineDrafts,
  type InvoiceLineDraft,
  type LineDraftError,
} from "@/lib/invoices";
import { summariseLinkedRecord, summaryFieldsOf } from "@/lib/linked-record-summary";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useFormattedChange } from "@/hooks/use-formatted-change";
import { cn } from "@/lib/utils";

/** Pasted line breaks become spaces; registrations are upper-cased as they are typed. */
const formatRecordValue = (raw: string) => upperCaseRegistration(raw.replace(/\r?\n/g, " "));

/**
 * Edit a draft's lines, due date, notes and customer. The API recomputes totals
 * on every save and returns the whole invoice; nothing here does money maths
 * beyond turning "12.50" into 1250 pence.
 */
/**
 * What the page around the editor can do with it: find out whether there are unsaved
 * edits, and save them before rendering a PDF so the preview shows what was typed.
 */
export type InvoiceDraftEditorHandle = {
  /** Saves pending edits. Resolves to the saved invoice, or null when validation or the API refused. */
  save: () => Promise<Invoice | null>;
};

export const INVOICE_DRAFT_EDITOR_ID = "invoice-draft-editor";

export function InvoiceDraftEditor({
  invoice,
  onSaved,
  onDirtyChange,
  ref,
  disabled = false,
}: {
  invoice: Invoice;
  onSaved?: (invoice: Invoice) => void;
  /** Fires whenever the editor starts or stops holding unsaved edits. */
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<InvoiceDraftEditorHandle>;
  /** Read-only view of a draft (e.g. reception, or the bolt-on has lapsed). */
  disabled?: boolean;
}) {
  const update = useUpdateInvoice();
  const customers = useCustomers();
  const currentCustomer = useCustomer(invoice.customerId);
  const tenant = useTenant();

  // The record(s) the invoice is about (vehicle, pet…) — one row each, so two cars
  // done in one visit go on one document. Labelled with the business's own term;
  // hidden entirely when the API build doesn't know the field yet.
  const recordTerm = tenant.terminology.linkedRecord;
  const recordTermLower = recordTerm.toLowerCase();
  const recordSupported = supportsLinkedRecord(invoice);
  const savedRecord = invoiceLinkedRecord(invoice);
  const savedRecordValue = savedRecord?.value ?? "";
  const recordBase = linkedRecordBaseLabel(savedRecord, recordTerm);
  const savedRecordRows = (): string[] => {
    const entries = linkedRecordEntries(savedRecord);
    return entries.length > 0 ? entries : [""];
  };

  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => invoice.lines.map(lineToDraft));
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [recordValues, setRecordValues] = useState<string[]>(savedRecordRows);
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
    const rows = linkedRecordEntries({ value: savedRecordValue });
    setRecordValues(rows.length > 0 ? rows : [""]);
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
    savedRecordValue,
  ]);

  const selectedCustomer =
    pickedCustomer ??
    customers.data?.items.find((c) => c.id === customerId) ??
    (currentCustomer.data?.id === customerId ? currentCustomer.data : null) ??
    null;

  // The client's saved vehicles, offered one tap away so a second car can be added
  // without retyping its registration. Each chip carries the same "reg · make · model"
  // text the PDF prints (not just the display label), so what is picked is what is
  // invoiced. Anything already on the invoice is left out.
  const customerRecords = useCustomerLinkedRecords(recordSupported ? customerId : undefined);
  const recordDefinition = useLinkedRecordDefinition();
  const summaryFields = useMemo(
    () => summaryFieldsOf(recordDefinition.data?.fields),
    [recordDefinition.data?.fields],
  );
  const typedRecord = recordSupported ? linkedRecordInput(recordBase, recordValues) : null;
  const typedRecordValue = typedRecord?.value ?? "";
  const recordSuggestions = useMemo(() => {
    const present = new Set(
      linkedRecordEntries({ value: typedRecordValue }).map((v) => v.toLowerCase()),
    );
    return (customerRecords.data ?? [])
      .filter((r) => r.status === "active")
      .map((r) => ({
        id: r.id,
        text: formatRecordValue(
          summariseLinkedRecord(
            { displayLabel: r.displayLabel, values: r.values as Record<string, unknown> },
            summaryFields,
          ),
        ),
      }))
      .filter((r) => !present.has(r.text.trim().toLowerCase()))
      .slice(0, 6);
  }, [customerRecords.data, summaryFields, typedRecordValue]);
  const recordRowsFull = recordValues.length >= INVOICE_LINKED_RECORD_LIMITS.maxEntries;
  const onRecordChange = useFormattedChange(
    formatRecordValue,
    useCallback((typed: string, i: number) => {
      setRecordValues((prev) => prev.map((v, j) => (j === i ? typed : v)));
    }, []),
  );
  const addRecordValue = (value: string) => {
    setRecordValues((prev) => {
      const next = [...prev];
      const blank = next.findIndex((v) => v.trim() === "");
      if (blank >= 0) next[blank] = value;
      else if (next.length < INVOICE_LINKED_RECORD_LIMITS.maxEntries) next.push(value);
      return next;
    });
  };

  const vatShown = showsVat(invoice);

  // Live preview of the subtotal from what's typed — labelled as such; the
  // authoritative figures arrive with the saved invoice.
  const typedSubtotal = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const qty = Number(line.quantity);
      const price = Number(line.unitPrice.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(qty) && Number.isFinite(price)) total += Math.round(price * 100) * qty;
    }
    return total;
  }, [lines]);

  const dirty =
    JSON.stringify(lines) !== JSON.stringify(invoice.lines.map(lineToDraft)) ||
    dueDate !== (invoice.dueDate ?? "") ||
    notes !== (invoice.notes ?? "") ||
    (recordSupported && typedRecordValue !== savedRecordValue) ||
    customerId !== invoice.customerId;

  const setLine = (index: number, patch: Partial<InvoiceLineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setLineErrors((prev) => prev.map((e, i) => (i === index ? {} : e)));
  };

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const save = async ({ quiet = false }: { quiet?: boolean } = {}): Promise<Invoice | null> => {
    setFormError(null);
    setServerErrors([]);
    const result = validateLineDrafts(lines);
    if (!result.ok) {
      setLineErrors(result.errors);
      setFormError(result.form ?? "Fix the highlighted lines.");
      return null;
    }
    if (dueDate && !isIsoDate(dueDate)) {
      setFormError("Due date must be a calendar date.");
      return null;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes.length > INVOICE_LINE_LIMITS.notesMax) {
      setFormError(`Notes can be at most ${INVOICE_LINE_LIMITS.notesMax} characters.`);
      return null;
    }
    const record = recordSupported ? linkedRecordInput(recordBase, recordValues) : undefined;
    const recordError = recordSupported ? linkedRecordProblem(record ?? null, recordBase) : null;
    if (recordError) {
      setFormError(recordError);
      return null;
    }
    setLineErrors([]);
    try {
      const saved = await update.mutateAsync({
        invoiceId: invoice.id,
        body: {
          lines: result.lines,
          dueDate: dueDate || null,
          notes: trimmedNotes || null,
          ...(recordSupported ? { linkedRecord: record ?? null } : {}),
          ...(customerId !== invoice.customerId ? { customerId } : {}),
        },
      });
      if (!quiet) toast.success("Draft saved");
      onSaved?.(saved);
      return saved;
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setServerErrors(
          err.fieldErrors.map((fe) => `${fe.field}: ${fe.message ?? fe.code}`.trim()),
        );
      }
      return null;
    }
  };

  // The page's Preview / Download buttons save through this so the PDF shows what has
  // been typed, not the last saved copy. Nothing to save → resolves to the invoice as is.
  useImperativeHandle(ref, () => ({
    save: () => (dirty ? save({ quiet: true }) : Promise.resolve(invoice)),
  }));

  return (
    <SectionCard
      title="Draft"
      description="Edit freely until you issue it. Totals are recalculated when you save."
    >
      <fieldset
        id={INVOICE_DRAFT_EDITOR_ID}
        disabled={disabled || update.isPending}
        className="grid scroll-mt-4 gap-5"
      >
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
          {/* One card per line, description on its own full-width row: a table squeezed
              it to a few characters on a phone, so nobody could read what they typed. */}
          <ol className="divide-y rounded-xl border">
            {lines.map((line, i) => {
              const errs = lineErrors[i] ?? {};
              const id = `inv-line-${i}`;
              return (
                <li key={i} className="grid gap-3 p-3">
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor={`${id}-description`}
                        className="text-xs text-muted-foreground"
                      >
                        Description
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-my-1 -mr-2 h-8 px-2 text-muted-foreground"
                        aria-label={`Remove line ${i + 1}`}
                        disabled={lines.length <= INVOICE_LINE_LIMITS.minLines}
                        onClick={() => {
                          setLines((prev) => prev.filter((_, j) => j !== i));
                          setLineErrors((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only sm:not-sr-only">Remove</span>
                      </Button>
                    </div>
                    <Textarea
                      id={`${id}-description`}
                      rows={1}
                      value={line.description}
                      maxLength={INVOICE_LINE_LIMITS.descriptionMax}
                      placeholder="What was done"
                      aria-invalid={Boolean(errs.description)}
                      className={cn(
                        "field-sizing-content min-h-9 resize-none py-1.5 max-sm:min-h-11 max-sm:py-2.5",
                        errs.description && "border-destructive",
                      )}
                      onChange={(e) =>
                        setLine(i, { description: e.target.value.replace(/\r\n?/g, "\n") })
                      }
                    />
                    {errs.description ? (
                      <p className="text-xs text-destructive">{errs.description}</p>
                    ) : i === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Press Enter for detail lines — they print under the heading.
                      </p>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "grid gap-3",
                      vatShown ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-2",
                    )}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${id}-qty`} className="text-xs text-muted-foreground">
                        Qty
                      </Label>
                      <Input
                        id={`${id}-qty`}
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
                        <p className="text-xs text-destructive">{errs.quantity}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${id}-price`} className="text-xs text-muted-foreground">
                        Unit price
                      </Label>
                      <Input
                        id={`${id}-price`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={line.unitPrice}
                        aria-invalid={Boolean(errs.unitPrice)}
                        className={cn("tabular-nums", errs.unitPrice && "border-destructive")}
                        onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                        onBlur={() => {
                          const n = Number(line.unitPrice.replace(/[^0-9.-]/g, ""));
                          if (Number.isFinite(n) && line.unitPrice.trim() !== "") {
                            setLine(i, { unitPrice: n.toFixed(2) });
                          }
                        }}
                      />
                      {errs.unitPrice ? (
                        <p className="text-xs text-destructive">{errs.unitPrice}</p>
                      ) : null}
                    </div>
                    {vatShown ? (
                      <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-vat`} className="text-xs text-muted-foreground">
                          VAT
                        </Label>
                        <div className="flex h-9 items-center max-sm:h-11">
                          <Switch
                            id={`${id}-vat`}
                            checked={line.taxable}
                            aria-label="VAT applies"
                            onCheckedChange={(v) => setLine(i, { taxable: v })}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
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

        {recordSupported ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="invoice-record-0">
                {recordValues.length > 1 ? pluralRecordTerm(recordBase) : recordBase}
              </Label>
              {recordValues.length > 1 ? (
                <span className="text-xs text-muted-foreground">
                  {recordValues.length}/{INVOICE_LINKED_RECORD_LIMITS.maxEntries}
                </span>
              ) : null}
            </div>
            <ul className="grid gap-2">
              {recordValues.map((value, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input
                    id={`invoice-record-${i}`}
                    value={value}
                    maxLength={INVOICE_LINKED_RECORD_LIMITS.valueMax}
                    placeholder={
                      i === 0
                        ? `Which ${recordTermLower} this invoice is for — optional`
                        : `Another ${recordTermLower}`
                    }
                    aria-label={`${recordBase} ${i + 1}`}
                    autoCapitalize="characters"
                    onChange={onRecordChange(i)}
                  />
                  {recordValues.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-muted-foreground max-sm:h-11"
                      aria-label={`Remove ${recordTermLower} ${i + 1}`}
                      onClick={() => setRecordValues((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={recordRowsFull}
                onClick={() => setRecordValues((prev) => [...prev, ""])}
              >
                <Plus className="size-4" /> Add another {recordTermLower}
              </Button>
              {recordSuggestions.map((r) => (
                <Button
                  key={r.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="max-w-full"
                  disabled={recordRowsFull && !recordValues.some((v) => v.trim() === "")}
                  title={`Add ${r.text}`}
                  onClick={() => addRecordValue(r.text)}
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">{r.text}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Filled from the booking&apos;s {recordTermLower}. Did more than one {recordTermLower}{" "}
              in the same visit? Add each one — they are all printed on the PDF and in the email.
              Leave empty to omit it.
            </p>
          </div>
        ) : null}

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
                setRecordValues(savedRecordRows());
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
