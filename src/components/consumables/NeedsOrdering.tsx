import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { TONE_TEXT, TonePill } from "@/components/client-profile/parts";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { Button } from "@/components/ui/button";
import type { ConsumableStockOverview, ConsumableStockStatus } from "@/lib/api/types";
import {
  STOCK_STATUS_LABEL,
  STOCK_STATUS_TONE,
  quantityLabel,
  stockAdvice,
  summariseUsage,
} from "@/lib/consumables";
import { cn } from "@/lib/utils";

export function StockPill({ status }: { status: ConsumableStockStatus }) {
  return <TonePill tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</TonePill>;
}

type ShortJob = ConsumableStockOverview["jobs"][number];

function jobWhen(job: ShortJob): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: job.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(job.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
    })
      .format(new Date(job.start))
      .replace(",", "");
  } catch {
    return "";
  }
}

function looksLikePlate(label: string): boolean {
  return /^[A-Z0-9 ]{2,10}$/.test(label.trim());
}

/**
 * Top of the Consumables page when anything tracked won't cover booked jobs, has run
 * out or is at its reorder level: what to order, and the jobs that would go without.
 */
export function NeedsOrdering({
  overview,
  canEdit,
  onOpenItem,
  onAddStock,
  onOpenBooking,
}: {
  overview: ConsumableStockOverview;
  canEdit: boolean;
  onOpenItem: (consumableId: string) => void;
  onAddStock: (consumableId: string) => void;
  onOpenBooking: (bookingId: string) => void;
}) {
  if (overview.toOrder.length === 0 && overview.jobsShort === 0) return null;
  const short = overview.toOrder.filter((i) => i.status === "short").length;
  const more = overview.jobsShort - overview.jobs.length;

  return (
    <section
      aria-label="Needs ordering"
      className="surface-card grid gap-0 overflow-hidden rounded-2xl"
    >
      <header className="flex items-start gap-3 border-b px-4 py-3.5">
        <span
          aria-hidden
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]"
        >
          <AlertTriangle className="size-4" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 className="text-[15px] font-extrabold">Needs ordering</h2>
          <p className="text-[13px] text-muted-foreground">
            {short > 0 && overview.jobsShort > 0
              ? `${overview.jobsShort} booked ${overview.jobsShort === 1 ? "job needs" : "jobs need"} more than you have on the shelf.`
              : "Worked out from your stock and what booked jobs will use."}
          </p>
        </div>
      </header>

      {overview.toOrder.length > 0 ? (
        <ul className="divide-y">
          {overview.toOrder.map((item) => (
            <li key={item.consumableId} className="flex items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => onOpenItem(item.consumableId)}
                className="grid min-w-0 flex-1 cursor-pointer gap-0.5 text-left"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-bold">{item.name}</span>
                  <StockPill status={item.status} />
                </span>
                <span className="truncate text-[12.5px] text-muted-foreground">
                  {quantityLabel(item.onHand, item.unit)} on hand
                  {item.upcoming > 0 ? ` · ${quantityLabel(item.upcoming, item.unit)} booked` : ""}
                  {" · "}
                  {stockAdvice(item, item.unit)}
                  {item.sku ? ` · SKU ${item.sku}` : ""}
                </span>
              </button>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 max-sm:h-10"
                  onClick={() => onAddStock(item.consumableId)}
                >
                  <Plus className="size-3.5" /> Add stock
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {overview.jobs.length > 0 ? (
        <div className="grid gap-1 border-t bg-secondary/30 px-4 py-3">
          <h3 className="text-xs font-bold text-muted-foreground">Booked jobs that are short</h3>
          <ul className="grid">
            {overview.jobs.map((job) => (
              <li key={job.bookingId}>
                <button
                  type="button"
                  onClick={() => onOpenBooking(job.bookingId)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-secondary/60 sm:px-2"
                >
                  <span className="w-[104px] shrink-0 text-[13px] font-bold whitespace-nowrap">
                    {jobWhen(job)}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                      {job.vehicleLabel && looksLikePlate(job.vehicleLabel) ? (
                        <NumberPlate registration={job.vehicleLabel} size="small" />
                      ) : null}
                      <span className="truncate font-semibold">
                        {job.customerName ??
                          (job.vehicleLabel && !looksLikePlate(job.vehicleLabel)
                            ? job.vehicleLabel
                            : "Walk-in")}
                      </span>
                      <span className="truncate text-muted-foreground">· {job.serviceName}</span>
                    </span>
                    <span className={cn("truncate text-xs font-semibold", TONE_TEXT.red)}>
                      Short{" "}
                      {summariseUsage(
                        job.items.map((i) => ({ name: i.name, unit: i.unit, quantity: i.short })),
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className="text-xs text-muted-foreground">
              And {more} more {more === 1 ? "job" : "jobs"} later on.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
