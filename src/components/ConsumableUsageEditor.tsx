import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
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
import type { Consumable } from "@/lib/api/types";
import type { UsageRow } from "@/lib/consumables";

/**
 * Pick materials from the catalogue with a quantity each. Used by the service form
 * (default usage) and the booking panel (what the job actually used). Stacked so it
 * reads on a phone; the parent owns the rows.
 */
export function ConsumableUsageEditor({
  rows,
  onChange,
  catalogue,
  invalidIndex,
  idPrefix = "cu",
}: {
  rows: UsageRow[];
  onChange: (rows: UsageRow[]) => void;
  catalogue: readonly Consumable[];
  /** Highlight the row `rowsToItems` refused. */
  invalidIndex?: number | null;
  idPrefix?: string;
}) {
  const active = catalogue.filter((c) => c.status === "active");
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const update = (index: number, patch: Partial<UsageRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));

  if (catalogue.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No consumables in your catalogue yet.{" "}
        <Link to="/consumables" className="font-medium text-primary hover:underline">
          Add your first consumable
        </Link>{" "}
        — coatings, pads, chemicals — then pick them here.
      </p>
    );
  }

  return (
    <div className="grid gap-2 **:min-w-0">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        rows.map((row, i) => {
          const chosen = row.consumableId ? byId.get(row.consumableId) : undefined;
          // An archived pick stays selectable on its own row so the line still reads.
          const options = chosen && chosen.status !== "active" ? [...active, chosen] : active;
          const invalid = invalidIndex === i;
          return (
            <div
              key={`${row.consumableId || "new"}-${i}`}
              className={`grid gap-2 rounded-xl border p-3 ${invalid ? "border-destructive" : ""}`}
            >
              <div className="flex items-center gap-2">
                <div className="grid flex-1 gap-1">
                  <Label
                    htmlFor={`${idPrefix}-item-${i}`}
                    className="text-xs text-muted-foreground"
                  >
                    Consumable
                  </Label>
                  <Select
                    value={row.consumableId || undefined}
                    onValueChange={(v) => update(i, { consumableId: v })}
                  >
                    <SelectTrigger
                      id={`${idPrefix}-item-${i}`}
                      aria-invalid={invalid && !row.consumableId}
                    >
                      <SelectValue placeholder="Choose a consumable" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.status !== "active" ? " (archived)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-5 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove consumable"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${idPrefix}-qty-${i}`} className="text-xs text-muted-foreground">
                  Quantity{chosen ? ` (${chosen.unit})` : ""}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${idPrefix}-qty-${i}`}
                    inputMode="decimal"
                    className="w-28"
                    value={row.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                    placeholder="1"
                    aria-invalid={invalid && Boolean(row.consumableId)}
                  />
                  {chosen ? (
                    <span className="text-sm text-muted-foreground">{chosen.unit}</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { consumableId: "", quantity: "1", note: null }])}
        >
          <Plus className="size-3.5" /> Add consumable
        </Button>
      </div>
    </div>
  );
}
