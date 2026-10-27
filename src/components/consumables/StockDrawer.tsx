import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import { useRecordConsumableStock } from "@/lib/api/hooks";
import type { Consumable } from "@/lib/api/types";
import {
  currencySymbol,
  formatQuantity,
  parseCost,
  parseQuantity,
  parseStockQuantity,
  quantityLabel,
  unitFor,
} from "@/lib/consumables";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export type StockKind = "received" | "counted";

/**
 * Record a delivery ("Add stock") or a shelf count ("Count stock"). The first one starts
 * tracking; from then on jobs take what they recorded off the shelf as they start.
 */
export function StockDrawer({
  open,
  consumable,
  initialKind = "received",
  onOpenChange,
}: {
  open: boolean;
  consumable: Consumable | null;
  initialKind?: StockKind;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const record = useRecordConsumableStock();
  const [kind, setKind] = useState<StockKind>(initialKind);
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setQuantity("");
    setCost("");
    setNote("");
    setError(null);
    setTried(false);
  }, [open, initialKind, consumable?.id]);

  if (!consumable) return null;
  const unit = consumable.unit;
  const currency = consumable.currency;
  const stock = consumable.stock;
  const parsed = kind === "counted" ? parseStockQuantity(quantity) : parseQuantity(quantity);
  const parsedCost = kind === "received" && canMoney ? parseCost(cost) : null;
  const onHand = stock?.onHand ?? 0;
  const next = parsed === null ? null : kind === "counted" ? parsed : onHand + parsed;

  const quantityError =
    tried && parsed === null
      ? kind === "counted"
        ? "Enter how many are on the shelf, e.g. 4 or 0."
        : "Enter how many came in, e.g. 6."
      : null;
  const costError =
    tried && parsedCost === "invalid" ? "Enter a cost like 40.00, or leave it blank." : null;

  const submit = async () => {
    setTried(true);
    setError(null);
    if (parsed === null || parsedCost === "invalid") {
      if (parsed === null) quantityRef.current?.focus();
      return;
    }
    try {
      await record.mutateAsync({
        consumableId: consumable.id,
        body: {
          kind,
          quantity: parsed,
          ...(typeof parsedCost === "number" ? { costMinor: parsedCost } : {}),
          note: note.trim() || null,
        },
      });
      toast.success(
        kind === "received"
          ? `${quantityLabel(parsed, unit)} of ${consumable.name} added`
          : `${consumable.name} counted: ${quantityLabel(parsed, unit)}`,
      );
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fieldErrors[0]?.message || err.detail || err.title
          : "Couldn't save. Check your connection and try again.",
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-sheet-peek rounded-t-3xl" : "sm:max-w-[440px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">
            {kind === "received" ? "Add stock" : "Count stock"}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {consumable.name}
            {stock ? ` · ${quantityLabel(stock.onHand, unit)} on hand` : " · Not tracked yet"}
          </SheetDescription>
        </SheetHeader>

        <form
          id="stock-form"
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 sm:px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div
            role="radiogroup"
            aria-label="What happened"
            className="grid h-10 grid-cols-2 rounded-[10px] bg-secondary p-[3px] max-sm:h-11"
          >
            {(
              [
                ["received", "A delivery came in"],
                ["counted", "I counted the shelf"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => {
                  setKind(value);
                  setTried(false);
                }}
                className={cn(
                  "cursor-pointer truncate rounded-lg px-2 text-[13px] font-bold text-muted-foreground transition-colors",
                  kind === value && "bg-card text-foreground shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="stock-quantity">
              {kind === "received" ? "How many came in" : "How many are on the shelf"}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="stock-quantity"
                ref={quantityRef}
                inputMode="decimal"
                className="min-w-0 flex-1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={kind === "received" ? "6" : "4"}
                autoFocus={!phone}
                aria-invalid={Boolean(quantityError)}
                aria-describedby={quantityError ? "stock-quantity-error" : "stock-quantity-help"}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                {unitFor(unit, parsed ?? 2)}
              </span>
            </div>
            {quantityError ? (
              <p id="stock-quantity-error" className="text-xs text-destructive">
                {quantityError}
              </p>
            ) : next !== null ? (
              <p id="stock-quantity-help" role="status" className="text-xs text-muted-foreground">
                On hand {stock ? `goes from ${formatQuantity(onHand)} to` : "starts at"}{" "}
                <span className="font-bold text-foreground">{quantityLabel(next, unit)}</span>.
              </p>
            ) : (
              <p id="stock-quantity-help" className="text-xs text-muted-foreground">
                {kind === "received"
                  ? "Added to what's on the shelf."
                  : "Replaces what we had worked out. Use this to correct the count."}
              </p>
            )}
          </div>

          {kind === "received" && canMoney ? (
            <div className="grid gap-2">
              <Label htmlFor="stock-cost">What the delivery cost</Label>
              <div className="relative sm:max-w-[50%]">
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                >
                  {currencySymbol(currency)}
                </span>
                <Input
                  id="stock-cost"
                  inputMode="decimal"
                  className="pl-8"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(costError)}
                  aria-describedby={costError ? "stock-cost-error" : "stock-cost-help"}
                />
              </div>
              {costError ? (
                <p id="stock-cost-error" className="text-xs text-destructive">
                  {costError}
                </p>
              ) : (
                <p id="stock-cost-help" className="text-xs text-muted-foreground">
                  Optional, for your records. It doesn&rsquo;t change the cost per {unit}.
                </p>
              )}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="stock-note">Note</Label>
            <Textarea
              id="stock-note"
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                kind === "received" ? "Supplier, order number." : "Found two behind the van seat."
              }
            />
          </div>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {phone ? null : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            form="stock-form"
            disabled={record.isPending}
            className={cn(phone && "h-12 w-full")}
          >
            {record.isPending ? "Saving…" : kind === "received" ? "Add stock" : "Save count"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
