import { useEffect, useMemo, useState } from "react";
import { Package, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConsumableUsageEditor } from "@/components/ConsumableUsageEditor";
import {
  useBookingConsumables,
  useConsumables,
  useReplaceBookingConsumables,
} from "@/lib/api/hooks";
import type { BookingConsumablesUsage } from "@/lib/api/types";
import {
  estimateMaterialsCost,
  formatQuantity,
  rowsFromLines,
  rowsToItems,
  type UsageRow,
} from "@/lib/consumables";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * "Consumables" on the booking panel's Details tab (automotive only): what the job
 * used — seeded from the booked services' defaults when the booking was created,
 * adjusted by staff as the work happens. Staff eyes only: nothing here is charged,
 * invoiced or messaged to the client.
 */
export function BookingConsumablesSection({ bookingId }: { bookingId: string }) {
  const tenant = useTenant();
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const canEdit = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const usage = useBookingConsumables(bookingId, { enabled: isCarDetailing });
  const [editOpen, setEditOpen] = useState(false);

  if (!isCarDetailing) return null;

  const items = usage.data?.items ?? [];
  const currency = usage.data?.currency ?? "GBP";

  return (
    <div className="**:min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Consumables
        </p>
        {canEdit && usage.isSuccess ? (
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 h-8 text-muted-foreground"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" /> {items.length === 0 ? "Add" : "Edit"}
          </Button>
        ) : null}
      </div>

      {usage.isLoading ? (
        <div className="mt-2 h-10 animate-pulse rounded-xl bg-secondary/70" />
      ) : usage.isError ? (
        <p className="mt-2 text-xs text-destructive">Couldn't load consumables.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing recorded for this job yet.
          {canEdit ? " Add what it used — coatings, pads, chemicals." : ""}
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {items.map((line) => (
              <li
                key={line.consumableId}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Package className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{line.name}</span>
                    {line.archived ? (
                      <span className="text-xs text-muted-foreground">(archived)</span>
                    ) : null}
                  </span>
                  {line.note ? (
                    <span className="block pl-5 text-xs text-muted-foreground">{line.note}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {formatQuantity(line.quantity)} {line.unit}
                  {line.unitCostMinor != null ? (
                    <span className="block text-xs text-muted-foreground">
                      {formatMoney(Math.round(line.quantity * line.unitCostMinor), line.currency)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 bg-secondary/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Estimated cost of materials (not charged)
              </span>
              <span className="font-medium tabular-nums">
                {usage.data?.estimatedCostMinor != null
                  ? formatMoney(usage.data.estimatedCostMinor, currency)
                  : "—"}
              </span>
            </li>
          </ul>
        </div>
      )}

      {usage.data ? (
        <EditBookingConsumablesDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          bookingId={bookingId}
          usage={usage.data}
        />
      ) : null}
    </div>
  );
}

function EditBookingConsumablesDialog({
  open,
  onClose,
  bookingId,
  usage,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  usage: BookingConsumablesUsage;
}) {
  const catalogue = useConsumables({ enabled: open });
  const replace = useReplaceBookingConsumables();
  const [rows, setRows] = useState<UsageRow[]>(() => rowsFromLines(usage.items));
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);

  // Reseed each time the dialog opens so a cancelled edit doesn't linger.
  useEffect(() => {
    if (open) {
      setRows(rowsFromLines(usage.items));
      setInvalidIndex(null);
    }
  }, [open, usage.items]);

  // Live preview of the figure the API will return, from the catalogue's current
  // costs (the API snapshots those same costs as it writes).
  const preview = useMemo(() => {
    const byId = new Map((catalogue.data ?? []).map((c) => [c.id, c]));
    const parsed = rowsToItems(rows);
    if (!parsed.ok) return null;
    return estimateMaterialsCost(
      parsed.items.map((it) => {
        const c = byId.get(it.consumableId);
        return {
          name: c?.name ?? "",
          unit: c?.unit ?? "",
          quantity: it.quantity,
          unitCostMinor: c?.unitCostMinor ?? null,
        };
      }),
    );
  }, [rows, catalogue.data]);

  const save = async () => {
    const parsed = rowsToItems(rows);
    if (!parsed.ok) {
      setInvalidIndex(parsed.index);
      toast.error("Pick a consumable and a quantity above zero on each line");
      return;
    }
    setInvalidIndex(null);
    try {
      await replace.mutateAsync({ bookingId, items: parsed.items });
      toast.success("Consumables updated");
      onClose();
    } catch {
      // Toasted by the hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Consumables used</DialogTitle>
          <DialogDescription>
            Record what this job used. For your records only — the client isn't charged for or shown
            any of this.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1">
          {catalogue.isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-secondary/70" />
          ) : (
            <ConsumableUsageEditor
              rows={rows}
              onChange={(next) => {
                setRows(next);
                setInvalidIndex(null);
              }}
              catalogue={catalogue.data ?? []}
              invalidIndex={invalidIndex}
              idPrefix="bc"
            />
          )}
          {(catalogue.data ?? []).length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Estimated cost of materials (not charged):{" "}
              <span className="font-medium text-foreground tabular-nums">
                {preview != null ? formatMoney(preview, usage.currency) : "—"}
              </span>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={replace.isPending || catalogue.isLoading} onClick={() => void save()}>
            {replace.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
