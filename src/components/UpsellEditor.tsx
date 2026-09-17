import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogueService } from "@/lib/api/types";
import { MAX_UPSELL_PITCH_LENGTH, MAX_UPSELLS_PER_SERVICE } from "@/lib/api/upsells";
import { formatMoney } from "@/lib/format";
import type { UpsellRow } from "@/lib/upsells";

/**
 * Pair add-on services with the one being edited: which service, an optional price for
 * the pairing, and a one-line pitch. Ordered — that is the order customers see. The
 * parent owns the rows and saves them through their own endpoint after the service.
 */
export function UpsellEditor({
  rows,
  onChange,
  catalogue,
  ownServiceId,
  currency = "GBP",
  invalidIndex,
  disabled,
  idPrefix = "up",
}: {
  rows: UpsellRow[];
  onChange: (rows: UpsellRow[]) => void;
  /** Every service in the business; inactive, group and the service itself are filtered out. */
  catalogue: readonly CatalogueService[];
  /** The service being edited (null while creating) — it can't upsell itself. */
  ownServiceId: string | null;
  currency?: string;
  invalidIndex?: number | null;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const byId = new Map(catalogue.map((s) => [s.id, s]));
  const candidates = catalogue.filter(
    (s) =>
      s.id !== ownServiceId &&
      s.active &&
      s.bookingMode === "individual" &&
      (s.currency ?? currency) === currency,
  );
  const taken = new Set(rows.map((r) => r.upsellServiceId));
  const update = (index: number, patch: Partial<UpsellRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  if (candidates.length === 0 && rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add another individually booked service to your catalogue first, then offer it here.
      </p>
    );
  }

  return (
    <div className="grid gap-2 **:min-w-0">
      {rows.map((row, i) => {
        const chosen = row.upsellServiceId ? byId.get(row.upsellServiceId) : undefined;
        const options = candidates.filter((s) => s.id === row.upsellServiceId || !taken.has(s.id));
        // A pairing to a service that has since been archived still reads on its row.
        if (chosen && !options.some((s) => s.id === chosen.id)) options.push(chosen);
        const invalid = invalidIndex === i;
        const own = chosen ? formatMoney(chosen.basePriceMinor, chosen.currency ?? currency) : null;
        return (
          <div
            key={`${row.upsellServiceId || "new"}-${i}`}
            className={`grid gap-2 rounded-xl border p-3 ${invalid ? "border-destructive" : ""}`}
          >
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1">
                <Label htmlFor={`${idPrefix}-svc-${i}`} className="text-xs text-muted-foreground">
                  Add-on service
                </Label>
                <Select
                  value={row.upsellServiceId || undefined}
                  onValueChange={(v) => update(i, { upsellServiceId: v })}
                  disabled={disabled}
                >
                  <SelectTrigger id={`${idPrefix}-svc-${i}`} className="w-full">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {formatMoney(s.basePriceMinor, s.currency ?? currency)}
                        {s.active ? "" : " (archived)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  disabled={disabled || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  disabled={disabled}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
              <div className="grid gap-1">
                <Label htmlFor={`${idPrefix}-price-${i}`} className="text-xs text-muted-foreground">
                  Price with this service
                </Label>
                <Input
                  id={`${idPrefix}-price-${i}`}
                  inputMode="decimal"
                  placeholder={own ? `${own} (own price)` : "Own price"}
                  value={row.price}
                  disabled={disabled}
                  onChange={(e) => update(i, { price: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${idPrefix}-pitch-${i}`} className="text-xs text-muted-foreground">
                  One-line pitch (optional)
                </Label>
                <Input
                  id={`${idPrefix}-pitch-${i}`}
                  placeholder="Protects the paint for another 12 months"
                  maxLength={MAX_UPSELL_PITCH_LENGTH}
                  value={row.pitch}
                  disabled={disabled}
                  onChange={(e) => update(i, { pitch: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
      {rows.length < MAX_UPSELLS_PER_SERVICE && candidates.some((s) => !taken.has(s.id)) ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={disabled}
          onClick={() => onChange([...rows, { upsellServiceId: "", price: "", pitch: "" }])}
        >
          <Plus className="size-4" />
          {rows.length === 0 ? "Offer an add-on" : "Add another"}
        </Button>
      ) : rows.length >= MAX_UPSELLS_PER_SERVICE ? (
        <p className="text-xs text-muted-foreground">Up to {MAX_UPSELLS_PER_SERVICE} add-ons.</p>
      ) : null}
    </div>
  );
}
