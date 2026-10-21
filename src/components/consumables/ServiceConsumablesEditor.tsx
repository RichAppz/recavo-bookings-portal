import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConsumableFormDrawer } from "@/components/consumables/ConsumableFormDrawer";
import { ConsumablePicker, Stepper } from "@/components/consumables/parts";
import { MINT_TINT } from "@/components/waitlist/parts";
import type { Consumable } from "@/lib/api/types";
import {
  countUncosted,
  estimateMaterialsCost,
  parseQuantity,
  shareOfPrice,
  uncostedLabel,
  unitCostLabel,
  type UsageRow,
} from "@/lib/consumables";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Consumables used" on the service form: what one job usually uses. Each line has a
 * stepper; the picker blocks duplicates; the estimate uses today's costs and the
 * service price. The parent saves the rows with the service.
 */
export function ServiceConsumablesEditor({
  rows,
  onChange,
  catalogue,
  priceMinor,
  currency,
  canMoney,
  canAddToCatalogue,
  invalid,
}: {
  rows: UsageRow[];
  onChange: (rows: UsageRow[]) => void;
  catalogue: readonly Consumable[];
  priceMinor: number | null;
  currency: string;
  canMoney: boolean;
  canAddToCatalogue: boolean;
  invalid?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const latest = useRef(rows);
  latest.current = rows;
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const money = (minor: number) => {
    try {
      return formatMoney(minor, currency);
    } catch {
      return "–";
    }
  };

  const add = (c: Consumable) => {
    if (latest.current.some((r) => r.consumableId === c.id)) return;
    onChange([...latest.current, { consumableId: c.id, quantity: "1", note: null }]);
  };
  const setQuantity = (id: string, quantity: number) =>
    onChange(
      latest.current.map((r) => (r.consumableId === id ? { ...r, quantity: String(quantity) } : r)),
    );
  const remove = (id: string) => {
    const index = latest.current.findIndex((r) => r.consumableId === id);
    if (index < 0) return;
    const removed = latest.current[index]!;
    onChange(latest.current.filter((r) => r.consumableId !== id));
    const name = byId.get(id)?.name ?? "Consumable";
    toast(`${name} removed`, {
      action: {
        label: "Undo",
        onClick: () => {
          if (latest.current.some((r) => r.consumableId === id)) return;
          const next = [...latest.current];
          next.splice(Math.min(index, next.length), 0, removed);
          onChange(next);
        },
      },
    });
  };

  const lines = rows.map((r) => {
    const c = byId.get(r.consumableId);
    return {
      row: r,
      consumable: c,
      quantity: parseQuantity(r.quantity) ?? 0,
    };
  });
  const costed = lines.map((l) => ({
    name: l.consumable?.name ?? "",
    unit: l.consumable?.unit ?? "",
    quantity: l.quantity,
    unitCostMinor: l.consumable?.unitCostMinor ?? null,
  }));
  const estimate = estimateMaterialsCost(costed);
  const uncosted = uncostedLabel(countUncosted(costed));
  const share = estimate != null ? shareOfPrice(estimate, priceMinor) : null;
  const activeCount = catalogue.filter((c) => c.status === "active").length;
  const selected = new Set(rows.map((r) => r.consumableId));

  const picker = (
    <ConsumablePicker
      catalogue={catalogue}
      selectedIds={selected}
      onPick={add}
      onNew={canAddToCatalogue ? () => setAdding(true) : undefined}
    />
  );

  return (
    <div className="grid gap-3 **:min-w-0">
      {catalogue.length === 0 || (activeCount === 0 && rows.length === 0) ? (
        <div className="grid justify-items-start gap-2 rounded-xl bg-secondary/60 px-3.5 py-3">
          <p className="text-sm text-muted-foreground">
            Your list is empty. Add your first consumable to pick it here.
          </p>
          {canAddToCatalogue ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Add consumable
            </Button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-xl bg-secondary/60 px-3.5 py-3">
          <p className="text-sm text-muted-foreground">Nothing added yet.</p>
          {picker}
        </div>
      ) : (
        <>
          <ul
            className={cn(
              "divide-y overflow-hidden rounded-xl border",
              invalid && "border-destructive",
            )}
          >
            {lines.map(({ row, consumable: c, quantity }) => {
              const name = c?.name ?? "Unknown consumable";
              const unit = c?.unit ?? "";
              const lineCost =
                c?.unitCostMinor != null ? Math.round(quantity * c.unitCostMinor) : null;
              return (
                <li key={row.consumableId} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-bold">
                      {name}
                      {c?.status === "archived" ? (
                        <span className="font-normal text-muted-foreground"> (archived)</span>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c?.unitCostMinor != null
                        ? unitCostLabel(c.unitCostMinor, unit, c.currency)
                        : "No cost set"}
                    </span>
                  </span>
                  <Stepper
                    value={quantity}
                    unit={unit}
                    name={name}
                    onChange={(q) => setQuantity(row.consumableId, q)}
                    onRemove={() => remove(row.consumableId)}
                  />
                  {canMoney ? (
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right text-sm tabular-nums",
                        lineCost == null ? "text-muted-foreground" : "font-bold",
                      )}
                    >
                      {lineCost != null ? money(lineCost) : "No cost"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(row.consumableId)}
                    aria-label={`Remove ${name}`}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive max-sm:size-11"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div>{picker}</div>
        </>
      )}

      {canMoney && estimate != null ? (
        <div className={cn("grid gap-0.5 rounded-xl px-3.5 py-3", MINT_TINT)}>
          <span className="text-sm font-extrabold">About {money(estimate)} a job</span>
          <span className="text-xs opacity-90">
            {[
              share != null && priceMinor ? `${share}% of the ${money(priceMinor)} price` : null,
              uncosted,
            ]
              .filter(Boolean)
              .join(" · ") || "From today's costs"}
          </span>
        </div>
      ) : null}

      <ConsumableFormDrawer
        open={adding}
        consumable={null}
        onOpenChange={setAdding}
        onSaved={(saved) => add(saved)}
      />
    </div>
  );
}
