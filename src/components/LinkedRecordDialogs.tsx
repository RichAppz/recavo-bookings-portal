import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { TableGhost } from "@/components/ghost";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, queryKeys, toastApiError } from "@/lib/api";
import {
  useCreateCustomerLinkedRecord,
  useCustomer,
  useCustomers,
  useDeleteLinkedRecord,
  useLinkedRecordOwnership,
  useMemberships,
  usePatchLinkedRecord,
  useTransferLinkedRecord,
} from "@/lib/api/hooks";
import {
  customerDisplayName,
  userDisplayName,
  type Customer,
  type LinkedRecord,
  type LinkedRecordOwnership,
} from "@/lib/api/types";
import { ukDate } from "@/lib/format";
import {
  UNSUPPORTED_FIELD_TYPES,
  buildQuickAddRecord,
  coerceFieldValue,
  hasQuickAddInput,
  quickAddFields,
  type LinkedRecordField,
} from "@/lib/quick-add-record";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Search-as-you-type client picker (Popover + Command). Shared by the transfer
 * dialog, the Vehicles page's add-record dialog and Add booking. Pass
 * `suggestions` (e.g. the first page of clients) to list them before the user
 * types; one character filters that list locally, two or more search the server.
 */
export function CustomerSearchPicker({
  value,
  onSelect,
  excludeCustomerId,
  suggestions,
  placeholder = "Search for a client…",
}: {
  value: Customer | null;
  onSelect: (customer: Customer) => void;
  /** Hidden from results — e.g. the current owner during a transfer. */
  excludeCustomerId?: string;
  /** Shown before typing, and filtered locally on a single character. */
  suggestions?: Customer[];
  placeholder?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim();
  const searching = term.length > 1;
  const results = useCustomers({ search: term, enabled: pickerOpen && searching });
  const localMatches = (suggestions ?? []).filter((c) => {
    if (!term) return true;
    const needle = term.toLowerCase();
    return (
      customerDisplayName(c).toLowerCase().includes(needle) ||
      (c.emailDisplay ?? "").toLowerCase().includes(needle) ||
      (c.phoneNormalised ?? "").includes(needle)
    );
  });
  const pool = searching ? (results.data?.items ?? []) : localMatches;
  const candidates = pool.filter((c) => c.id !== excludeCustomerId);
  const hasSuggestions = (suggestions?.length ?? 0) > 0;

  // `modal` so the list gets its own scroll-lock shard: without it the hosting
  // Dialog's lock swallows touch scrolling in the portalled popover on iOS.
  return (
    <Popover modal open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={pickerOpen}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? customerDisplayName(value) : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Capped at the room Radix has on whichever side it opens, so a list that flips
          above a low trigger stays fully on screen and scrolls inside, rather than
          running off the top the way the services picker did on phones. */}
      <PopoverContent
        className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) flex-col p-0"
        align="start"
        side="bottom"
        sticky="always"
        collisionPadding={12}
      >
        <Command shouldFilter={false} className="min-h-0 flex-1">
          <CommandInput
            placeholder="Search clients by name, email or phone…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="min-h-0 flex-1">
            {!searching && !hasSuggestions ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Type at least 2 characters to search.
              </p>
            ) : searching && results.isLoading ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Searching…</p>
            ) : candidates.length === 0 ? (
              <CommandEmpty>No clients match.</CommandEmpty>
            ) : (
              <CommandGroup>
                {candidates.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onSelect(c);
                      setPickerOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-4", value?.id === c.id ? "opacity-100" : "opacity-0")}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{customerDisplayName(c)}</p>
                      {c.emailDisplay ? (
                        <p className="truncate text-xs text-muted-foreground">{c.emailDisplay}</p>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Staff-side "transfer to another client" for a linked record (RECA-521) — e.g. a
 * vehicle that changed hands. If-Match guarded: a stale version surfaces an inline
 * "just changed" notice, and the refetched version flows back in via the parent so
 * a retry succeeds. Used from the client profile and the business-wide Vehicles page.
 */
export function TransferLinkedRecordDialog({
  record,
  sourceCustomerId,
  term,
  onOpenChange,
}: {
  record: LinkedRecord | null;
  sourceCustomerId: string;
  term: string;
  onOpenChange: (o: boolean) => void;
}) {
  const open = record !== null;
  const lower = term.toLowerCase();
  const tenant = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const transfer = useTransferLinkedRecord(sourceCustomerId);

  const [target, setTarget] = useState<Customer | null>(null);
  const [reason, setReason] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const recordId = record?.id;
  useEffect(() => {
    if (open) {
      setTarget(null);
      setReason("");
      setPickerError(null);
      setConflict(false);
    }
  }, [open, recordId]);

  const handleSubmit = async () => {
    if (!record) return;
    if (!target) {
      setPickerError("Choose the client to transfer to.");
      return;
    }
    setPickerError(null);
    setConflict(false);
    try {
      await transfer.mutateAsync({
        recordId: record.id,
        version: record.version,
        toCustomerId: target.id,
        reason: reason.trim() || undefined,
      });
      onOpenChange(false);
      toast.success(`${term} transferred to ${customerDisplayName(target)}`, {
        action: {
          label: "View client",
          onClick: () =>
            void navigate({ to: "/clients/$clientId", params: { clientId: target.id } }),
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Someone changed the record since this dialog opened. Refetch so the
          // parent hands us the bumped version, then let the user retry.
          setConflict(true);
          void qc.invalidateQueries({
            queryKey: queryKeys.customerLinkedRecords(tenant.businessId, sourceCustomerId),
          });
          void qc.invalidateQueries({
            queryKey: queryKeys.linkedRecord(tenant.businessId, record.id),
          });
          void qc.invalidateQueries({
            queryKey: queryKeys.linkedRecordsAll(tenant.businessId),
          });
          return;
        }
        const fieldErr = err.fieldErrors.find((fe) => fe.field === "toCustomerId");
        if (fieldErr) {
          setPickerError(
            fieldErr.code === "ALREADY_OWNER"
              ? `That client already owns this ${lower}.`
              : (fieldErr.message ?? "That client can't receive this record."),
          );
          return;
        }
      }
      toastApiError(err, `Couldn't transfer this ${lower}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer {lower}</DialogTitle>
          <DialogDescription>
            Move {record?.displayLabel ?? `this ${lower}`} to another client. Its booking history
            stays with the record, and the change is kept in the ownership history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {conflict ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This {lower} was just changed by someone else — review the details and retry.
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label>Transfer to</Label>
            <CustomerSearchPicker
              value={target}
              onSelect={(c) => {
                setTarget(c);
                setPickerError(null);
              }}
              excludeCustomerId={sourceCustomerId}
            />
            {pickerError ? <p className="text-xs text-destructive">{pickerError}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="transfer-reason">Reason (optional)</Label>
            <Textarea
              id="transfer-reason"
              value={reason}
              maxLength={500}
              placeholder="e.g. Sold to new owner"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={transfer.isPending || !target}>
            {transfer.isPending
              ? "Transferring…"
              : conflict
                ? "Retry transfer"
                : `Transfer ${lower}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One owner name in the history timeline, resolved lazily and linked to their profile. */
function OwnershipOwnerName({ customerId }: { customerId: string }) {
  const customer = useCustomer(customerId);
  if (customer.data) {
    return (
      <Link
        to="/clients/$clientId"
        params={{ clientId: customer.data.id }}
        className="text-sm font-medium hover:underline"
      >
        {customerDisplayName(customer.data)}
      </Link>
    );
  }
  return (
    <span className="text-sm font-medium text-muted-foreground">
      {customer.isLoading ? "Loading…" : "Unknown client"}
    </span>
  );
}

/**
 * Remove a linked record. Deletes outright when nothing has ever been booked
 * against it (the "added by mistake" case); when the API says it has booking
 * history (409) the dialog switches to offering an archive instead, since the
 * record has to stay resolvable from those bookings (RECA-90).
 */
export function DeleteLinkedRecordDialog({
  record,
  term,
  onOpenChange,
  onDone,
}: {
  record: LinkedRecord | null;
  term: string;
  onOpenChange: (o: boolean) => void;
  /** Called after a successful delete or archive. */
  onDone?: (outcome: "deleted" | "archived") => void;
}) {
  const open = record !== null;
  const lower = term.toLowerCase();
  const remove = useDeleteLinkedRecord();
  const patch = usePatchLinkedRecord(record?.customerId);
  const [inUse, setInUse] = useState(false);
  const busy = remove.isPending || patch.isPending;

  useEffect(() => {
    if (!open) setInUse(false);
  }, [open]);

  const confirm = async () => {
    if (!record) return;
    if (inUse) {
      try {
        await patch.mutateAsync({
          recordId: record.id,
          version: record.version,
          body: { status: "archived" },
        });
        toast.success(`${term} archived`);
        onDone?.("archived");
        onOpenChange(false);
      } catch {
        // usePatchLinkedRecord toasts the error.
      }
      return;
    }
    try {
      await remove.mutateAsync({ recordId: record.id, customerId: record.customerId });
      toast.success(`${term} deleted`);
      onDone?.("deleted");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setInUse(true);
        return;
      }
      toastApiError(err);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {inUse ? `Archive this ${lower} instead?` : `Delete ${record?.displayLabel ?? lower}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {inUse
              ? `This ${lower} has bookings against it, so it can't be deleted without losing that history. Archiving hides it from pickers and lists while past bookings keep their record.`
              : `This permanently removes the ${lower} and its ownership history. It can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              // Keep the dialog open until the request settles (or the 409 flips the copy).
              e.preventDefault();
              void confirm();
            }}
            className={cn(
              !inUse && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {busy ? "Working…" : inUse ? "Archive" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Ownership timeline for a linked record (RECA-521), newest interval first. */
export function OwnershipHistoryDialog({
  record,
  term,
  onOpenChange,
}: {
  record: LinkedRecord | null;
  term: string;
  onOpenChange: (o: boolean) => void;
}) {
  const open = record !== null;
  const lower = term.toLowerCase();
  const ownership = useLinkedRecordOwnership(record?.id);
  const memberships = useMemberships();

  // assignedBy is a user id; memberships embed the account so we can show a name.
  const staffNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberships.data ?? []) {
      if (m.userId) map.set(m.userId, userDisplayName(m.user, m.userId));
    }
    return map;
  }, [memberships.data]);

  // API returns oldest first; show the current owner at the top.
  const intervals = useMemo(() => [...(ownership.data ?? [])].reverse(), [ownership.data]);

  const describeInterval = (o: LinkedRecordOwnership) => {
    const from = ukDate(o.startedAt.slice(0, 10));
    const to = o.endedAt ? ukDate(o.endedAt.slice(0, 10)) : "present";
    const by = staffNames.get(o.assignedBy) ?? "a staff member";
    return `${from} – ${to} · added by ${by}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ownership history</DialogTitle>
          <DialogDescription>
            Every client {record?.displayLabel ?? `this ${lower}`} has belonged to, newest first.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {ownership.isLoading ? (
            <TableGhost rows={2} />
          ) : ownership.isError ? (
            <p className="py-4 text-sm text-muted-foreground">
              Couldn't load the ownership history just now. Close and try again.
            </p>
          ) : intervals.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No ownership history yet.</p>
          ) : (
            <ul className="divide-y">
              {intervals.map((o) => (
                <li key={o.id} className="grid gap-1 py-3">
                  <div className="flex items-center gap-2">
                    <OwnershipOwnerName customerId={o.customerId} />
                    {o.endedAt === null ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        Current owner
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{describeInterval(o)}</p>
                  {o.reason ? (
                    <p className="text-xs text-muted-foreground italic">“{o.reason}”</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { LinkedRecordField };
export { quickAddFields };

export function activeSortedFields(fields: LinkedRecordField[]): LinkedRecordField[] {
  return fields
    .filter((f) => (f.status ?? "active") === "active")
    .slice()
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

/** Maps a server field error (which may be keyed `values.<fieldKey>`) back to a field. */
function fieldErrorFor(err: unknown, fieldKey: string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const match = err.fieldErrors.find(
    (fe) =>
      fe.field === fieldKey ||
      fe.field === `values.${fieldKey}` ||
      fe.field.endsWith(`.${fieldKey}`),
  );
  return match ? (match.code ?? "Invalid") : undefined;
}

export function summariseValues(
  fields: LinkedRecordField[],
  values: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (UNSUPPORTED_FIELD_TYPES.has(f.dataType)) continue;
    const v = values[f.fieldKey];
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${f.label}: ${String(v)}`);
  }
  return parts.join(" · ");
}

function LinkedRecordFieldInput({
  field,
  value,
  onChange,
  disabled,
  error,
}: {
  field: LinkedRecordField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  error?: string;
}) {
  const id = `lrf-${field.fieldKey}`;
  let control: ReactNode;

  if (UNSUPPORTED_FIELD_TYPES.has(field.dataType)) {
    control = (
      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {field.dataType === "image" || field.dataType === "file"
          ? "Uploads aren't editable here yet."
          : "This field type isn't editable here yet."}
      </p>
    );
  } else if (field.dataType === "boolean") {
    control = (
      <Switch id={id} disabled={disabled} checked={Boolean(value)} onCheckedChange={onChange} />
    );
  } else if (field.dataType === "long_text") {
    control = (
      <Textarea
        id={id}
        disabled={disabled}
        value={value == null ? "" : String(value)}
        maxLength={field.constraints?.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (field.dataType === "single_select") {
    control = (
      <Select
        value={value == null ? "" : String(value)}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {(field.constraints?.options ?? []).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    const type =
      field.dataType === "integer" || field.dataType === "decimal"
        ? "number"
        : field.dataType === "date"
          ? "date"
          : field.dataType === "datetime"
            ? "datetime-local"
            : field.dataType === "email"
              ? "email"
              : field.dataType === "url"
                ? "url"
                : "text";
    control = (
      <Input
        id={id}
        type={type}
        disabled={disabled}
        value={value == null ? "" : String(value)}
        maxLength={field.constraints?.maxLength}
        min={field.constraints?.min}
        max={field.constraints?.max}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {control}
      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function LinkedRecordFormDialog({
  open,
  onOpenChange,
  fields,
  term,
  initial,
  submitting,
  submitError,
  onSubmit,
  ownerSlot,
  submitDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fields: LinkedRecordField[];
  term: string;
  initial?: { displayLabel: string; values: Record<string, unknown> };
  submitting: boolean;
  submitError: unknown;
  onSubmit: (data: { displayLabel: string; values: Record<string, unknown> }) => Promise<void>;
  /** Extra control above the fields — the Vehicles page uses it for a client picker. */
  ownerSlot?: ReactNode;
  /** Blocks submit while the ownerSlot is unresolved (no client chosen yet). */
  submitDisabled?: boolean;
}) {
  const [displayLabel, setDisplayLabel] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDisplayLabel(initial?.displayLabel ?? "");
      setValues(initial?.values ?? {});
      setLocalErrors({});
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    const payloadValues: Record<string, unknown> = {};
    for (const f of fields) {
      if (UNSUPPORTED_FIELD_TYPES.has(f.dataType)) {
        if (values[f.fieldKey] !== undefined) payloadValues[f.fieldKey] = values[f.fieldKey];
        continue;
      }
      const coerced = coerceFieldValue(f, values[f.fieldKey]);
      if (f.required && (coerced === undefined || coerced === "")) {
        nextErrors[f.fieldKey] = "Required";
        continue;
      }
      if (coerced !== undefined) payloadValues[f.fieldKey] = coerced;
    }
    if (Object.keys(nextErrors).length > 0) {
      setLocalErrors(nextErrors);
      return;
    }
    setLocalErrors({});
    const autoLabel = fields
      .map((f) => payloadValues[f.fieldKey])
      .filter((v) => v !== undefined && v !== "")
      .slice(0, 2)
      .join(" — ");
    await onSubmit({
      displayLabel: displayLabel.trim() || autoLabel || term,
      values: payloadValues,
    });
  };

  const lower = term.toLowerCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${lower}` : `Add ${lower}`}</DialogTitle>
          <DialogDescription>Fields come from your {lower} schema.</DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1">
          {ownerSlot}
          <div className="grid gap-2">
            <Label htmlFor="lr-display-label">Display label</Label>
            <Input
              id="lr-display-label"
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              placeholder="Auto-generated from the fields below if left blank"
            />
          </div>
          {fields.map((f) => (
            <LinkedRecordFieldInput
              key={f.fieldKey}
              field={f}
              value={values[f.fieldKey]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.fieldKey]: v }))}
              error={localErrors[f.fieldKey] ?? fieldErrorFor(submitError, f.fieldKey)}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || submitDisabled}>
            {submitting ? "Saving…" : initial ? "Save changes" : `Add ${lower}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the hosting form can do with the quick-add row besides render it. Add
 * booking uses it so details typed but never "Added" are saved when the booking is
 * created, instead of being dropped on the floor (a car typed into the row and
 * then "Create booking" pressed used to reach the API as no car at all).
 */
export type QuickAddLinkedRecordHandle = {
  /** True when something has been typed and not yet added. */
  hasInput: () => boolean;
  /**
   * Creates the record from what's typed (also firing `onAdded`). Resolves null when
   * the row is empty or a required field is missing — the error shows inline, so
   * the caller just stops. Rejects when the API call fails (already toasted).
   */
  submit: () => Promise<LinkedRecord | null>;
};

/**
 * Compact inline form for adding a linked record without leaving the current
 * flow — the Add booking modal uses it so a vehicle can be created mid-booking.
 * Anything beyond the quick fields can be filled in later from the client's profile
 * or right now via "More details", which opens the full form on top.
 */
export function QuickAddLinkedRecord({
  customerId,
  fields,
  term,
  onAdded,
  onCancel,
  onInputChange,
  handleRef,
  inputHint,
  autoFocus,
}: {
  customerId: string;
  fields: LinkedRecordField[];
  term: string;
  onAdded: (record: LinkedRecord) => void;
  /** Present when the form can be dismissed (the client already has records). */
  onCancel?: () => void;
  /** Fires as the row goes between blank and typed-into (and false on unmount). */
  onInputChange?: (hasInput: boolean) => void;
  /** Lets the host save whatever's typed as part of its own submit. */
  handleRef?: React.MutableRefObject<QuickAddLinkedRecordHandle | null>;
  /** Replaces the status line once something's typed — e.g. "saved with the booking". */
  inputHint?: string;
  autoFocus?: boolean;
}) {
  const create = useCreateCustomerLinkedRecord(customerId);
  const quick = useMemo(() => quickAddFields(fields), [fields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emptyError, setEmptyError] = useState(false);
  // Snapshot of the quick values taken when "More details" opens, so the full form
  // starts pre-filled without resetting on every re-render while it's open.
  const [fullInitial, setFullInitial] = useState<{
    displayLabel: string;
    values: Record<string, unknown>;
  } | null>(null);
  const lower = term.toLowerCase();
  const hasInput = hasQuickAddInput(values);

  useEffect(() => {
    onInputChange?.(hasInput);
  }, [hasInput, onInputChange]);
  useEffect(() => () => onInputChange?.(false), [onInputChange]);

  const submit = async (): Promise<LinkedRecord | null> => {
    const built = buildQuickAddRecord(quick, values, term);
    if (built.kind === "invalid") {
      setErrors(built.errors);
      return null;
    }
    if (built.kind === "empty") {
      setEmptyError(true);
      return null;
    }
    setErrors({});
    setEmptyError(false);
    const record = await create.mutateAsync({
      displayLabel: built.displayLabel,
      values: built.values,
    });
    setValues({});
    onAdded(record);
    return record;
  };

  // Re-pointed every render so the host always calls into the current closure;
  // cleared on unmount so a stale row can't be submitted after a client change.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { hasInput: () => hasInput, submit };
    return () => {
      handleRef.current = null;
    };
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  // One message for the whole row: "Registration is required", or the server's
  // complaint about a specific field.
  const firstError = (() => {
    if (emptyError) return "Add at least one detail.";
    for (const f of quick) {
      const local = errors[f.fieldKey];
      if (local) return local === "Required" ? `${f.label} is required.` : `${f.label}: ${local}`;
      const server = fieldErrorFor(create.error, f.fieldKey);
      if (server) return `${f.label}: ${server}`;
    }
    return null;
  })();

  const requiredLabels = quick.filter((f) => f.required).map((f) => f.label.toLowerCase());
  // Once something's typed, say what happens to it: the host saves it with its own
  // submit, so nobody has to know the small "Add" button is optional.
  const requiredHint =
    hasInput && inputHint
      ? inputHint
      : requiredLabels.length === 0
        ? "Nothing's required — add what you know, the rest later."
        : `Only the ${requiredLabels.join(" and ")} is needed now.`;

  return (
    <div className="rounded-lg border border-dashed p-3">
      {/* Fields in one row (labels as placeholders), then a single status line with
          the actions. Errors are reported in the status line, not under each field,
          so the row never shifts. Stacked on a phone: three text inputs side by side
          can't shrink below their intrinsic width and used to push the whole
          booking sheet wider than the screen. `minmax(0, …)` for the same reason. */}
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-(--quick-add-cols)"
        style={
          {
            "--quick-add-cols": quick
              .map((f) => (f.required ? "minmax(0, 1.25fr)" : "minmax(0, 1fr)"))
              .join(" "),
          } as React.CSSProperties
        }
      >
        {quick.map((f, i) => {
          const id = `quick-lr-${f.fieldKey}`;
          const invalid = Boolean(errors[f.fieldKey] ?? fieldErrorFor(create.error, f.fieldKey));
          return f.dataType === "single_select" ? (
            <Select
              key={f.fieldKey}
              value={values[f.fieldKey] ?? ""}
              onValueChange={(v) => setValues((p) => ({ ...p, [f.fieldKey]: v }))}
            >
              <SelectTrigger
                id={id}
                aria-label={f.label}
                aria-invalid={invalid || undefined}
                className={cn("h-9 min-w-0", invalid && "border-destructive")}
              >
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                {(f.constraints?.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              key={f.fieldKey}
              id={id}
              aria-label={f.label}
              aria-invalid={invalid || undefined}
              className={cn(
                "h-9 min-w-0",
                invalid && "border-destructive focus-visible:ring-destructive/40",
              )}
              autoFocus={autoFocus && i === 0}
              type={f.dataType === "integer" || f.dataType === "decimal" ? "number" : "text"}
              value={values[f.fieldKey] ?? ""}
              maxLength={f.constraints?.maxLength}
              placeholder={f.label}
              onChange={(e) => {
                setValues((p) => ({ ...p, [f.fieldKey]: e.target.value }));
                if (errors[f.fieldKey]) setErrors((p) => ({ ...p, [f.fieldKey]: "" }));
                if (emptyError) setEmptyError(false);
              }}
              onKeyDown={onKeyDown}
              disabled={create.isPending}
            />
          );
        })}
      </div>

      {/* Phone: the hint gets its own line above the actions — squeezed next to them
          it truncated to a few letters, and as `nowrap` text it set the row's minimum
          width to the whole sentence, widening the sheet. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p
          className={cn(
            "min-w-0 basis-full text-xs sm:flex-1 sm:basis-0 sm:truncate",
            firstError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {firstError ?? requiredHint}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {onCancel ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => setFullInitial({ displayLabel: "", values: { ...values } })}
            disabled={create.isPending}
          >
            More details
          </button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => void submit()}
            disabled={create.isPending}
          >
            {create.isPending ? "Adding…" : `Add ${lower}`}
          </Button>
        </div>
      </div>

      <LinkedRecordFormDialog
        open={fullInitial !== null}
        onOpenChange={(o) => {
          if (!o) setFullInitial(null);
        }}
        fields={fields}
        term={term}
        initial={fullInitial ?? undefined}
        submitting={create.isPending}
        submitError={create.error}
        onSubmit={async (data) => {
          const record = await create.mutateAsync(data);
          setFullInitial(null);
          setValues({});
          onAdded(record);
        }}
      />
    </div>
  );
}
