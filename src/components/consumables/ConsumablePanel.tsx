import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  ClipboardCheck,
  MoreHorizontal,
  PackagePlus,
  PackageX,
  Trash2,
} from "lucide-react";
import { TonePill } from "@/components/client-profile/parts";
import { StockPill } from "@/components/consumables/NeedsOrdering";
import { ItemTile } from "@/components/consumables/parts";
import type { StockKind } from "@/components/consumables/StockDrawer";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import {
  useConsumableActivity,
  useConsumableStockHistory,
  useStopTrackingConsumableStock,
} from "@/lib/api/hooks";
import type { Consumable, ConsumableActivity, ConsumableUsagePeriod } from "@/lib/api/types";
import { formatQuantity, quantityLabel, stockAdvice, unitCostLabel } from "@/lib/consumables";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const PANEL_PERIODS: { value: ConsumableUsagePeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "3 months" },
  { value: "this_year", label: "This year" },
];

type RecentJob = ConsumableActivity["recentJobs"][number];

function jobDate(job: RecentJob): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: job.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(job.start))
    .replace(",", "");
}

/** Plates read "AB12 CDE"; anything with lower case is a make and model, shown as text. */
function looksLikePlate(label: string): boolean {
  return /^[A-Z0-9 ]{2,10}$/.test(label.trim());
}

/**
 * Click a catalogue row: what it costs, how much the period used, which services
 * start with it and the jobs that recorded it. Right drawer on desktop, full screen
 * on phone. `?item=<id>` keeps it open across reloads.
 */
export function ConsumablePanel({
  consumable,
  open,
  initialPeriod,
  canEdit,
  canMoney,
  onClose,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onOpenBooking,
  onStock,
}: {
  consumable: Consumable | null;
  open: boolean;
  initialPeriod: ConsumableUsagePeriod;
  canEdit: boolean;
  canMoney: boolean;
  onClose: () => void;
  onEdit: (c: Consumable) => void;
  onArchive: (c: Consumable) => void;
  onRestore: (c: Consumable) => void;
  onDelete: (c: Consumable) => void;
  onOpenBooking: (bookingId: string) => void;
  onStock: (c: Consumable, kind: StockKind) => void;
}) {
  const phone = useIsPhone();
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-sheet-peek rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        {consumable ? (
          <PanelBody
            key={consumable.id}
            consumable={consumable}
            initialPeriod={initialPeriod}
            canEdit={canEdit}
            canMoney={canMoney}
            onEdit={onEdit}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
            onOpenBooking={onOpenBooking}
            onStock={onStock}
          />
        ) : (
          <>
            <SheetHeader className="px-4 sm:px-6 pt-6 pb-4 text-left">
              <SheetTitle>
                <Skeleton className="h-6 w-40" />
              </SheetTitle>
              <SheetDescription className="sr-only">Loading the consumable</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4 sm:px-6">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  consumable: c,
  initialPeriod,
  canEdit,
  canMoney,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onOpenBooking,
  onStock,
}: {
  consumable: Consumable;
  initialPeriod: ConsumableUsagePeriod;
  canEdit: boolean;
  canMoney: boolean;
  onEdit: (c: Consumable) => void;
  onArchive: (c: Consumable) => void;
  onRestore: (c: Consumable) => void;
  onDelete: (c: Consumable) => void;
  onOpenBooking: (bookingId: string) => void;
  onStock: (c: Consumable, kind: StockKind) => void;
}) {
  const [period, setPeriod] = useState<ConsumableUsagePeriod>(
    PANEL_PERIODS.some((p) => p.value === initialPeriod) ? initialPeriod : "this_month",
  );
  const [showAll, setShowAll] = useState(false);
  const activity = useConsumableActivity(c.id, period, { limit: showAll ? 100 : 4 });
  const a = activity.data;
  const money = (minor: number) => {
    try {
      return formatMoney(minor, a?.currency ?? c.currency);
    } catch {
      return "–";
    }
  };
  const referenced = c.serviceIds.length > 0 || c.jobCount > 0;
  const canDelete = c.status === "active" || !referenced;
  const history = useConsumableStockHistory(c.id, { enabled: c.stock !== null });
  const stopTracking = useStopTrackingConsumableStock();
  const [confirmStop, setConfirmStop] = useState(false);

  return (
    <>
      <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
        <div className="flex items-center gap-3 pr-8">
          <ItemTile size={44} />
          <div className="grid min-w-0 gap-0.5">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
              <span className="truncate">{c.name}</span>
              {c.status === "archived" ? <TonePill tone="grey">Archived</TonePill> : null}
            </SheetTitle>
            <SheetDescription className="text-[13px]">
              {unitCostLabel(c.unitCostMinor, c.unit, c.currency)}
              {" · "}
              {c.sku ? `SKU ${c.sku}` : "No SKU"}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 sm:px-6 py-5">
        <div role="group" aria-label="Period" className="flex gap-2">
          {PANEL_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "inline-flex h-[34px] cursor-pointer items-center rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors max-sm:h-11",
                period === p.value
                  ? "bg-primary font-extrabold text-primary-foreground"
                  : "bg-secondary font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <section
          aria-label="Facts"
          className={cn("grid gap-2", canMoney ? "grid-cols-3" : "grid-cols-2")}
        >
          {activity.isLoading && !a ? (
            Array.from({ length: canMoney ? 3 : 2 }, (_, i) => (
              <Skeleton key={i} className="h-[64px] rounded-xl" />
            ))
          ) : (
            <>
              <Fact
                label="Used"
                value={a && a.usage.quantity > 0 ? quantityLabel(a.usage.quantity, c.unit) : "None"}
              />
              {canMoney ? (
                <Fact
                  label="Spent"
                  value={a?.usage.spendMinor != null ? money(a.usage.spendMinor) : "–"}
                />
              ) : null}
              <Fact label="Jobs" value={String(a?.usage.jobs ?? 0)} />
            </>
          )}
        </section>

        <section aria-label="Stock" className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-extrabold">
              Stock
              {c.stock && c.stock.status !== "ok" ? <StockPill status={c.stock.status} /> : null}
            </h3>
            {canEdit && c.stock ? (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-sm:h-10"
                  onClick={() => onStock(c, "counted")}
                >
                  <ClipboardCheck className="size-3.5" /> Count
                </Button>
                <Button
                  size="sm"
                  className="h-8 max-sm:h-10"
                  onClick={() => onStock(c, "received")}
                >
                  <PackagePlus className="size-3.5" /> Add stock
                </Button>
              </div>
            ) : null}
          </div>
          {c.stock ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Fact label="On hand" value={quantityLabel(c.stock.onHand, c.unit)} />
                <Fact label="Booked" value={quantityLabel(c.stock.upcoming, c.unit)} />
                <Fact
                  label="After booked"
                  value={
                    c.stock.afterUpcoming < 0
                      ? `\u2212${quantityLabel(-c.stock.afterUpcoming, c.unit)}`
                      : quantityLabel(c.stock.afterUpcoming, c.unit)
                  }
                />
              </div>
              <p className="text-[13px] text-muted-foreground">
                {stockAdvice(c.stock, c.unit)}.
                {c.stock.reorderLevel != null && c.stock.status !== "low"
                  ? ` Reorder at ${formatQuantity(c.stock.reorderLevel)}.`
                  : ""}{" "}
                Jobs take what they record off the shelf when they start.
              </p>
              {history.data && history.data.length > 0 ? (
                <ul className="divide-y overflow-hidden rounded-xl border">
                  {history.data.slice(0, 5).map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]"
                    >
                      <span className="grid min-w-0">
                        <span className="font-semibold">
                          {m.kind === "received" ? "Delivery" : "Counted"}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {movementDate(m.occurredAt)}
                          </span>
                        </span>
                        {m.note ? (
                          <span className="truncate text-xs text-muted-foreground">{m.note}</span>
                        ) : null}
                      </span>
                      <span className="grid shrink-0 text-right">
                        <span className="font-bold tabular-nums">
                          {m.kind === "received" ? "+" : ""}
                          {quantityLabel(m.quantity, c.unit)}
                        </span>
                        {canMoney && m.costMinor != null ? (
                          <span className="text-xs text-muted-foreground">
                            {money(m.costMinor)}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="grid gap-2 rounded-xl border border-dashed px-3.5 py-3">
              <p className="text-sm text-muted-foreground">
                Not tracked. Count what you have and we&rsquo;ll warn you when booked jobs need more
                than is on the shelf.
              </p>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button size="sm" className="h-9" onClick={() => onStock(c, "counted")}>
                    <ClipboardCheck className="size-3.5" /> Count stock
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => onStock(c, "received")}
                  >
                    <PackagePlus className="size-3.5" /> Add a delivery
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-extrabold">
              Default on {a?.services.length ?? c.serviceIds.length}{" "}
              {(a?.services.length ?? c.serviceIds.length) === 1 ? "service" : "services"}
            </h3>
            <Link
              to="/services"
              className="inline-flex items-center text-[13px] font-semibold text-primary hover:underline"
            >
              Edit services <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {a && a.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not on any service yet.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {(a?.services ?? []).map((s) => (
                <li
                  key={s.serviceId}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                >
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {quantityLabel(s.quantity, c.unit)} a job
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-extrabold">Recent jobs</h3>
            {a && a.usage.jobs > 4 && !showAll ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex cursor-pointer items-center text-[13px] font-semibold text-primary hover:underline"
              >
                All {a.usage.jobs} <ChevronRight className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          {a && a.recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs recorded it in this period.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {(a?.recentJobs ?? []).map((job) => (
                <li key={job.bookingId}>
                  <button
                    type="button"
                    onClick={() => onOpenBooking(job.bookingId)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
                  >
                    <span className="w-[84px] shrink-0 text-[13px] font-bold whitespace-nowrap">
                      {jobDate(job)}
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
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {job.serviceName}
                      </span>
                    </span>
                    <span className="grid shrink-0 text-right">
                      <span className="text-[13px] font-bold">
                        {quantityLabel(job.quantity, c.unit)}
                      </span>
                      {canMoney && job.costMinor != null ? (
                        <span className="text-xs text-muted-foreground">
                          {money(job.costMinor)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {c.notes ? (
          <section className="grid gap-1.5">
            <h3 className="text-[15px] font-extrabold">Notes</h3>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.notes}</p>
          </section>
        ) : null}
      </div>

      {canEdit ? (
        <footer className="flex items-center gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-10 shrink-0"
                aria-label={`More actions for ${c.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {c.status === "active" ? (
                <DropdownMenuItem onSelect={() => onArchive(c)}>
                  <Archive className="size-4" /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onRestore(c)}>
                  <ArchiveRestore className="size-4" /> Restore
                </DropdownMenuItem>
              )}
              {c.stock ? (
                <DropdownMenuItem onSelect={() => setConfirmStop(true)}>
                  <PackageX className="size-4" /> Stop tracking stock
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <DropdownMenuItem
                  onSelect={() => onDelete(c)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="h-10 flex-1" onClick={() => onEdit(c)}>
            Edit
          </Button>
        </footer>
      ) : null}

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking {c.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its deliveries and counts are removed and it won&rsquo;t warn you about booked jobs
              any more. Jobs keep what they recorded. You can start again with a count.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={stopTracking.isPending}
              onClick={(e) => {
                e.preventDefault();
                stopTracking.mutate(c.id, {
                  onSuccess: () => {
                    setConfirmStop(false);
                    toast.success(`Stopped tracking ${c.name}`);
                  },
                });
              }}
            >
              Stop tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function movementDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-secondary/60 px-3 py-2.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="truncate text-[15px] font-extrabold tabular-nums">{value}</span>
    </div>
  );
}
