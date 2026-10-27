import { useEffect, useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/MoneyInput";
import { PersonAvatar } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import {
  useCustomerBookings,
  useCustomers,
  useMarkBankTransferReceived,
  useRecordBookingPayment,
  type RecordPaymentMethod,
} from "@/lib/api/hooks";
import { useRefreshPayments } from "@/lib/api/payments-activity";
import { customerDisplayName } from "@/lib/api/types";
import { bookingSettlement } from "@/lib/booking-payment";
import { bookingTitle } from "@/lib/client-profile";
import { formatMoney } from "@/lib/format";
import { dayLabel, expectedMethod, type OwedRow } from "@/lib/payments-page";
import { currencySymbol } from "@/lib/services-catalogue";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useBookingWords } from "@/lib/booking-words";

const RECORD_METHODS: { value: RecordPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card machine" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const NOTE_MAX = 300;

function toMinor(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const n = Math.round(Number(cleaned) * 100);
  return Number.isFinite(n) ? n : null;
}

const toInput = (minor: number) => (minor / 100).toFixed(2);

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || err.message : fallback;
}

/** One booking the payment can go against, from the Owed list or the client's bookings. */
type Candidate = {
  bookingId: string;
  title: string;
  start: string;
  timezone: string;
  outstandingMinor: number;
  currency: string;
  /** Pay-by-bank booking still waiting for the transfer: confirming it is the only way. */
  awaitingTransfer: boolean;
};

function fromOwed(row: OwedRow): Candidate {
  return {
    bookingId: row.bookingId,
    title: row.serviceName,
    start: row.start,
    timezone: row.timezone,
    outstandingMinor: row.outstandingMinor,
    currency: row.currency,
    awaitingTransfer: row.paymentMethod === "bank_transfer" && row.status === "awaiting_payment",
  };
}

/** Records one payment against a booking, or confirms a pay-by-bank booking's transfer. */
function useSavePayment() {
  const record = useRecordBookingPayment();
  const received = useMarkBankTransferReceived();
  const refresh = useRefreshPayments();
  return {
    pending: record.isPending || received.isPending,
    save: async (
      c: Candidate,
      vars: { amountMinor: number; method: RecordPaymentMethod; note: string },
    ) => {
      if (c.awaitingTransfer) {
        await received.mutateAsync({ bookingId: c.bookingId });
      } else {
        await record.mutateAsync({
          bookingId: c.bookingId,
          amountMinor: vars.amountMinor,
          method: vars.method,
          note: vars.note.trim() || null,
        });
      }
      refresh();
    },
  };
}

function AmountField({
  id,
  currency,
  value,
  onChange,
  maxMinor,
  error,
  disabled,
}: {
  id: string;
  currency: string;
  value: string;
  onChange: (v: string) => void;
  maxMinor: number;
  error: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Amount</Label>
      {disabled ? (
        <p id={id} className="text-sm font-bold tabular-nums">
          {formatMoney(maxMinor, currency)}
        </p>
      ) : (
        <MoneyInput
          id={id}
          symbol={currencySymbol(currency)}
          value={value}
          onChange={onChange}
          invalid={Boolean(error)}
          ariaDescribedBy={`${id}-help`}
        />
      )}
      <p
        id={`${id}-help`}
        className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ??
          (disabled
            ? "The amount the client was asked to send."
            : `${formatMoney(maxMinor, currency)} still owed`)}
      </p>
    </div>
  );
}

function amountError(value: string, maxMinor: number, currency: string): string | null {
  const minor = toMinor(value);
  if (minor == null || minor <= 0 || minor > maxMinor) {
    return `Enter an amount up to ${formatMoney(maxMinor, currency)}.`;
  }
  return null;
}

/** "Mark paid" on an Owed row: method as expected, the amount owed, recorded now. */
export function MarkPaidDialog({
  row,
  timeZone,
  onClose,
}: {
  row: OwedRow | null;
  timeZone: string;
  onClose: () => void;
}) {
  const ids = useId();
  const words = useBookingWords();
  const { save, pending } = useSavePayment();
  const [method, setMethod] = useState<RecordPaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setMethod(expectedMethod(row));
    setAmount(toInput(row.outstandingMinor));
    setTouched(false);
    setServerError(null);
  }, [row]);

  const candidate = row ? fromOwed(row) : null;
  const error =
    row && candidate && !candidate.awaitingTransfer
      ? amountError(amount, row.outstandingMinor, row.currency)
      : null;

  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark paid</DialogTitle>
          <DialogDescription>
            {row
              ? `${row.customer?.name ?? "No client"} · ${row.serviceName} · ${dayLabel(row.start, row.timezone || timeZone, new Date())}`
              : null}
          </DialogDescription>
        </DialogHeader>
        {row && candidate ? (
          <div className="grid gap-4">
            {candidate.awaitingTransfer ? (
              <p className="rounded-lg bg-secondary/60 p-3 text-sm">
                This confirms the {words.lower} and tells{" "}
                {row.customer?.name?.split(" ")[0] ?? "the client"} their bank transfer arrived.
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor={`${ids}-method`}>Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as RecordPaymentMethod)}>
                  <SelectTrigger id={`${ids}-method`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <AmountField
              id={`${ids}-amount`}
              currency={row.currency}
              value={amount}
              onChange={setAmount}
              maxMinor={row.outstandingMinor}
              error={touched ? error : null}
              disabled={candidate.awaitingTransfer}
            />
            <p className="text-xs text-muted-foreground">Recorded as paid today.</p>
            {serverError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {serverError}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !row}
            onClick={async () => {
              if (!row || !candidate) return;
              setTouched(true);
              if (error) return;
              setServerError(null);
              try {
                await save(candidate, {
                  amountMinor: toMinor(amount) ?? row.outstandingMinor,
                  method,
                  note: "",
                });
                toast.success("Marked paid");
                onClose();
              } catch (err) {
                setServerError(errorText(err, "That didn't save. Try again."));
              }
            }}
          >
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "+ Record a payment": pick the client, then the booking it was for. */
export function RecordPaymentDrawer({
  open,
  owed,
  timeZone,
  onClose,
}: {
  open: boolean;
  owed: readonly OwedRow[];
  timeZone: string;
  onClose: () => void;
}) {
  const ids = useId();
  const words = useBookingWords();
  const { save, pending } = useSavePayment();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [method, setMethod] = useState<RecordPaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setClient(null);
    setBookingId(null);
    setMethod("cash");
    setAmount("");
    setNote("");
    setTouched(false);
    setServerError(null);
  }, [open]);

  const customers = useCustomers({
    search: debounced,
    enabled: open && !client && debounced.length > 0,
  });
  const clientBookings = useCustomerBookings(open && client ? client.id : undefined);

  const candidates = useMemo(() => {
    if (!client) return [];
    const map = new Map<string, Candidate>();
    for (const row of owed) {
      if (row.customer?.id === client.id) map.set(row.bookingId, fromOwed(row));
    }
    for (const b of clientBookings.data ?? []) {
      if (map.has(b.id) || b.paymentMethod === "credit") continue;
      if (b.status !== "confirmed" && b.status !== "completed") continue;
      const s = bookingSettlement(b);
      if (s.outstandingMinor <= 0) continue;
      map.set(b.id, {
        bookingId: b.id,
        title: bookingTitle(b),
        start: b.start,
        timezone: b.timezone ?? timeZone,
        outstandingMinor: s.outstandingMinor,
        currency: b.currency,
        awaitingTransfer: false,
      });
    }
    return [...map.values()].sort((a, b) => b.start.localeCompare(a.start));
  }, [client, owed, clientBookings.data, timeZone]);

  const picked = candidates.find((c) => c.bookingId === bookingId) ?? null;

  useEffect(() => {
    if (picked) setAmount(toInput(picked.outstandingMinor));
  }, [picked?.bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const error =
    picked && !picked.awaitingTransfer
      ? amountError(amount, picked.outstandingMinor, picked.currency)
      : null;

  const submit = async () => {
    setTouched(true);
    if (!picked || error) return;
    setServerError(null);
    try {
      const minor = picked.awaitingTransfer
        ? picked.outstandingMinor
        : (toMinor(amount) ?? picked.outstandingMinor);
      await save(picked, { amountMinor: minor, method, note });
      toast.success(`Payment of ${formatMoney(minor, picked.currency)} recorded`);
      onClose();
    } catch (err) {
      setServerError(errorText(err, "That didn't save. Try again."));
    }
  };

  const results = (customers.data?.items ?? []).slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b px-5 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">Record a payment</SheetTitle>
          <SheetDescription>
            Cash, card machine, bank transfer or anything else you took yourself.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-client`}>Client</Label>
            {client ? (
              <div className="flex items-center gap-3 rounded-xl border p-2.5">
                <PersonAvatar name={client.name} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{client.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setClient(null);
                    setBookingId(null);
                  }}
                >
                  <X className="size-4" /> Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={`${ids}-client`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search clients"
                    className="h-11 pl-9"
                    autoComplete="off"
                  />
                </div>
                {debounced ? (
                  <ul className="divide-y rounded-xl border">
                    {customers.isLoading ? (
                      <li className="p-3 text-sm text-muted-foreground">Searching…</li>
                    ) : results.length === 0 ? (
                      <li className="p-3 text-sm text-muted-foreground">No clients match.</li>
                    ) : (
                      results.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60"
                            onClick={() => setClient({ id: c.id, name: customerDisplayName(c) })}
                          >
                            <PersonAvatar name={customerDisplayName(c)} size={28} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {customerDisplayName(c)}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          {client ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{words.one}</legend>
              {clientBookings.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading {words.plural}…</p>
              ) : candidates.length === 0 ? (
                <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  {client.name} has no {words.plural} waiting for money. Payments are recorded
                  against a {words.lower}, so add the {words.lower} first.
                </p>
              ) : (
                <div role="radiogroup" className="grid gap-2">
                  {candidates.map((c) => (
                    <button
                      key={c.bookingId}
                      type="button"
                      role="radio"
                      aria-checked={bookingId === c.bookingId}
                      onClick={() => setBookingId(c.bookingId)}
                      className={cn(
                        "flex min-h-11 items-center justify-between gap-3 rounded-xl border p-3 text-left",
                        bookingId === c.bookingId
                          ? "border-foreground ring-1 ring-foreground"
                          : "hover:bg-secondary/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{c.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {dayLabel(c.start, c.timezone, new Date())}
                          {c.awaitingTransfer ? " · waiting for bank transfer" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {formatMoney(c.outstandingMinor, c.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          ) : null}

          {picked ? (
            <>
              {picked.awaitingTransfer ? (
                <p className="rounded-lg bg-secondary/60 p-3 text-sm">
                  This confirms the {words.lower} and tells {client?.name.split(" ")[0]} their bank
                  transfer arrived.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${ids}-method`}>Method</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as RecordPaymentMethod)}>
                    <SelectTrigger id={`${ids}-method`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECORD_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <AmountField
                id={`${ids}-amount`}
                currency={picked.currency}
                value={amount}
                onChange={setAmount}
                maxMinor={picked.outstandingMinor}
                error={touched ? error : null}
                disabled={picked.awaitingTransfer}
              />
              {!picked.awaitingTransfer ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${ids}-note`}>
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional, staff only)
                    </span>
                  </Label>
                  <Textarea
                    id={`${ids}-note`}
                    value={note}
                    maxLength={NOTE_MAX}
                    rows={3}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Recorded as paid today.</p>
            </>
          ) : null}

          {serverError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending || !picked} onClick={() => void submit()}>
            {picked && !picked.awaitingTransfer && !error
              ? `Record ${formatMoney(toMinor(amount) ?? 0, picked.currency)}`
              : picked?.awaitingTransfer
                ? "Mark transfer received"
                : "Record payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
