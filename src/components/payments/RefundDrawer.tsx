import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useCardRefund, useRecordManualRefund } from "@/lib/api/payments-activity";
import { formatMoney } from "@/lib/format";
import {
  METHOD_LABELS,
  REFUND_REASONS,
  clientName,
  refundableMinor,
  shortDate,
  whatFor,
  type ActivityRow,
  type PaymentMethod,
} from "@/lib/payments-page";
import { currencySymbol } from "@/lib/services-catalogue";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MANUAL_METHODS = ["cash", "bank_transfer", "card_manual", "other"] as const;
type ManualMethod = (typeof MANUAL_METHODS)[number];
const NOTE_MAX = 300;

function firstName(row: ActivityRow): string {
  return clientName(row).split(/\s+/)[0] ?? clientName(row);
}

function cardWords(row: ActivityRow): string {
  const brand = row.card?.brand;
  const last4 = row.card?.last4;
  const pretty = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null;
  if (pretty && last4) return `${pretty} ending ${last4}`;
  if (last4) return `card ending ${last4}`;
  return "card";
}

/** Parses "40", "40.5" or "£40.50" to minor units; null when it isn't a number. */
function toMinor(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const n = Math.round(Number(cleaned) * 100);
  return Number.isFinite(n) ? n : null;
}

export function RefundDrawer({
  row,
  timeZone,
  onClose,
}: {
  row: ActivityRow | null;
  timeZone: string;
  onClose: () => void;
}) {
  const phone = useIsPhone();
  const ids = useId();
  const manual = row ? row.method !== "card_online" : false;
  const cardRefund = useCardRefund();
  const manualRefund = useRecordManualRefund();
  const [mode, setMode] = useState<"full" | "part">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(REFUND_REASONS[0].code);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<ManualMethod>("cash");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setMode("full");
    setAmount("");
    setReason(REFUND_REASONS[0].code);
    setNote("");
    setTouched(false);
    setServerError(null);
    setMethod(
      (MANUAL_METHODS as readonly string[]).includes(row.method)
        ? (row.method as ManualMethod)
        : "cash",
    );
  }, [row]);

  if (!row) {
    return (
      <Sheet open={false}>
        <SheetContent className="hidden" />
      </Sheet>
    );
  }

  const max = refundableMinor(row);
  const money = (minor: number) => formatMoney(minor, row.currency);
  const partMinor = toMinor(amount);
  const amountError =
    mode === "part" && (partMinor == null || partMinor <= 0 || partMinor > max)
      ? `Enter an amount up to ${money(max)}.`
      : null;
  const refundMinor = mode === "full" ? max : (partMinor ?? 0);
  const pending = cardRefund.isPending || manualRefund.isPending;
  const name = firstName(row);
  const what = whatFor(row, timeZone, new Date());
  const paidBy = row.method === "card_online" ? "card" : METHOD_LABELS[row.method].toLowerCase();

  const submit = async () => {
    setTouched(true);
    if (amountError || refundMinor <= 0) return;
    setServerError(null);
    const amountMinor = mode === "full" ? undefined : refundMinor;
    try {
      if (manual) {
        await manualRefund.mutateAsync({
          settlementId: row.id,
          reasonCode: reason,
          method,
          note: note.trim() || null,
          ...(amountMinor !== undefined ? { amountMinor } : {}),
        });
        toast.success(`Refund of ${money(refundMinor)} recorded for ${name}`);
      } else {
        await cardRefund.mutateAsync({
          paymentId: row.paymentId ?? row.id,
          reasonCode: reason,
          note: note.trim() || null,
          ...(amountMinor !== undefined ? { amountMinor } : {}),
        });
        toast.success(`Refund of ${money(refundMinor)} sent to ${name}`);
      }
      onClose();
    } catch (err) {
      setServerError(
        err instanceof ApiError
          ? err.detail || err.message
          : "The refund didn't go through. Try again.",
      );
    }
  };

  const whatHappens = manual
    ? [`This records that you gave ${money(refundMinor)} back. It doesn't move any money.`]
    : [
        `${money(refundMinor)} goes back to ${name}'s ${cardWords(row)}. It usually shows in 5 to 10 days.`,
        `${name} gets an email saying it's on its way.`,
        "Stripe keeps its original fee. This can't be undone.",
      ];

  return (
    <Sheet open onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-[90px] h-auto rounded-t-2xl" : "sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="border-b px-5 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">
            {manual ? "Record a refund" : `Refund ${clientName(row)}`}
          </SheetTitle>
          <SheetDescription>
            {[what, `paid ${money(row.amountMinor)} by ${paidBy} on ${shortDate(row.at, timeZone)}`]
              .filter(Boolean)
              .join(" · ")}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <fieldset className="grid grid-cols-2 gap-2.5">
            <legend className="sr-only">How much</legend>
            {(["full", "part"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  mode === m ? "border-foreground ring-1 ring-foreground" : "hover:bg-secondary/60",
                )}
              >
                <span className="block text-sm font-bold">
                  {m === "full" ? "Full refund" : "Part refund"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {m === "full" ? money(max) : "Choose an amount"}
                </span>
              </button>
            ))}
          </fieldset>

          {mode === "part" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-amount`}>Amount</Label>
              <MoneyInput
                id={`${ids}-amount`}
                symbol={currencySymbol(row.currency)}
                value={amount}
                onChange={setAmount}
                invalid={touched && Boolean(amountError)}
                ariaDescribedBy={`${ids}-amount-help`}
              />
              <p
                id={`${ids}-amount-help`}
                className={cn(
                  "text-xs",
                  touched && amountError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {touched && amountError ? amountError : `Up to ${money(max)}`}
              </p>
            </div>
          ) : null}

          {manual ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-method`}>How you gave it back</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as ManualMethod)}>
                <SelectTrigger id={`${ids}-method`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m as PaymentMethod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <span className="text-sm font-medium" id={`${ids}-why`}>
              Why
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${ids}-why`}
              className="flex flex-wrap gap-1.5"
            >
              {REFUND_REASONS.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.code}
                  onClick={() => setReason(r.code)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold",
                    reason === r.code
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-note`}>
              Note <span className="font-normal text-muted-foreground">(optional, staff only)</span>
            </Label>
            <Textarea
              id={`${ids}-note`}
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
            {note.length > NOTE_MAX - 60 ? (
              <p className="text-right text-xs text-muted-foreground">
                {note.length}/{NOTE_MAX}
              </p>
            ) : null}
          </div>

          <section
            aria-labelledby={`${ids}-what`}
            className="rounded-xl border bg-secondary/40 p-3.5"
          >
            <h3 id={`${ids}-what`} className="mb-2 text-sm font-bold">
              What happens
            </h3>
            <ul className="space-y-1.5 text-[13px]">
              {whatHappens.map((line) => (
                <li key={line} className="flex gap-2">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-[#1f6b41] dark:text-[#9fe3bf]"
                    aria-hidden
                  />
                  {line}
                </li>
              ))}
            </ul>
          </section>

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
          <Button
            variant="destructive"
            disabled={pending || max <= 0}
            onClick={() => void submit()}
          >
            {manual ? `Record ${money(refundMinor)} refund` : `Refund ${money(refundMinor)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
