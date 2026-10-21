import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { MoreHorizontal, Package, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ConsumableFormDrawer } from "@/components/consumables/ConsumableFormDrawer";
import { ConsumablePicker, Stepper } from "@/components/consumables/parts";
import { useConsumablesOn } from "@/components/consumables/use-consumables-on";
import { AMBER_TEXT, MINT_TINT } from "@/components/waitlist/parts";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import {
  useBookingConsumables,
  useConfirmBookingConsumables,
  useConsumables,
  useReplaceBookingConsumables,
  useServicesConsumables,
} from "@/lib/api/hooks";
import type { Booking, BookingConsumablesUsage, Consumable } from "@/lib/api/types";
import {
  RECORDS_LINE,
  addDefaultsToRows,
  estimateMaterialsCost,
  mergeUsage,
  parseQuantity,
  quantityLabel,
  rowsFromLines,
  rowsToItems,
  shortUsageSummary,
  summariseUsage,
  uncostedLabel,
  type UsageRow,
} from "@/lib/consumables";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type UsageLine = BookingConsumablesUsage["items"][number];

function safeMoney(minor: number, currency: string): string {
  try {
    return formatMoney(minor, currency);
  } catch {
    return "–";
  }
}

/** "Not now" on a prompt is remembered per job and service on this device. */
const DISMISS_KEY = (bookingId: string, what: string) =>
  `recavo:consumables-prompt:${bookingId}:${what}`;

function isDismissed(bookingId: string, what: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY(bookingId, what)) === "1";
  } catch {
    return false;
  }
}

function dismiss(bookingId: string, what: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY(bookingId, what), "1");
  } catch {
    // Private mode: the prompt just comes back next time.
  }
}

/**
 * "Consumables" on the booking panel's Details tab: what the job used, seeded from
 * the booked services' defaults and adjusted by staff. Staff eyes only; nothing
 * here is charged, invoiced or messaged to the client.
 */
export function BookingConsumablesSection({
  booking,
  plate,
}: {
  booking: Pick<Booking, "id" | "start" | "timezone" | "status" | "lineItems" | "serviceSnapshot">;
  plate?: string | null;
}) {
  const tenant = useTenant();
  const on = useConsumablesOn();
  const canEdit = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const usage = useBookingConsumables(booking.id, { enabled: on });
  const confirm = useConfirmBookingConsumables();
  const [editOpen, setEditOpen] = useState(false);

  if (!on) return null;

  const items = usage.data?.items ?? [];
  const currency = usage.data?.currency ?? tenant.business?.currency ?? "GBP";
  const started = new Date(booking.start).getTime() <= Date.now();
  const goingAhead = ["awaiting_payment", "confirmed", "completed"].includes(booking.status);
  const showPlanned =
    canEdit &&
    usage.data !== undefined &&
    items.length > 0 &&
    usage.data.matchesDefaults &&
    usage.data.confirmedAt === null &&
    started &&
    goingAhead;
  const uncosted = items.filter((l) => l.unitCostMinor == null).length;
  const total = usage.data?.estimatedCostMinor ?? null;

  return (
    <section className="grid gap-2.5 **:min-w-0" aria-label="Consumables">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-[15px] font-extrabold">Consumables</h3>
          <p className="text-xs text-muted-foreground">{RECORDS_LINE}</p>
        </div>
        {canEdit && usage.isSuccess ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setEditOpen(true)}
          >
            {items.length === 0 ? "Add" : "Edit"}
          </Button>
        ) : null}
      </div>

      {usage.isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-secondary/70" />
      ) : usage.isError ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3">
          <p className="text-sm text-destructive">Couldn&rsquo;t load consumables.</p>
          <Button size="sm" variant="outline" onClick={() => usage.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed px-3.5 py-3">
          <p className="text-sm text-muted-foreground">Nothing recorded for this job yet.</p>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Add
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {showPlanned ? (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5",
                MINT_TINT,
              )}
            >
              <p className="text-[13px]">
                <span className="font-extrabold">From the service defaults.</span> Check it matches
                what you used.
              </p>
              <Button
                size="sm"
                className="h-9"
                disabled={confirm.isPending}
                onClick={() =>
                  confirm.mutate(booking.id, {
                    onSuccess: () => toast.success("Saved as planned"),
                  })
                }
              >
                Used as planned
              </Button>
            </div>
          ) : null}
          <ul className="divide-y overflow-hidden rounded-xl border">
            {items.map((line) => (
              <li
                key={line.consumableId}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <span className="grid min-w-0">
                  <span className="truncate text-sm font-bold">
                    {line.name}
                    {line.archived ? (
                      <span className="font-normal text-muted-foreground"> (archived)</span>
                    ) : null}
                  </span>
                  {line.note ? (
                    <span className="truncate text-xs text-muted-foreground">{line.note}</span>
                  ) : null}
                </span>
                <span className="grid shrink-0 text-right">
                  <span className="text-sm font-bold tabular-nums">
                    {quantityLabel(line.quantity, line.unit)}
                  </span>
                  {canMoney ? (
                    line.unitCostMinor != null ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {safeMoney(Math.round(line.quantity * line.unitCostMinor), line.currency)}
                      </span>
                    ) : (
                      <span className={cn("text-xs", AMBER_TEXT)}>No cost</span>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {canMoney ? (
            <div className="grid gap-0.5 rounded-xl bg-secondary/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Materials cost</span>
                {total != null ? (
                  <span className="text-[17px] font-extrabold tabular-nums">
                    {safeMoney(total, currency)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No costs set</span>
                )}
              </div>
              {total != null && uncosted > 0 ? (
                <p className={cn("text-xs font-semibold", AMBER_TEXT)}>
                  {uncostedLabel(uncosted)}, so this is lower than real
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {usage.data ? (
        <JobUsageSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          booking={booking}
          plate={plate ?? null}
          usage={usage.data}
          canMoney={canMoney}
        />
      ) : null}
    </section>
  );
}

/**
 * Under the chosen services on the Add booking form: what the new job will start
 * with, from the picked services' defaults. Renders nothing until there's something
 * to say, or when consumables are off.
 */
export function ServiceDefaultsHint({ serviceIds }: { serviceIds: readonly string[] }) {
  const tenant = useTenant();
  const on = useConsumablesOn();
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const results = useServicesConsumables(on ? serviceIds : []);
  const [expanded, setExpanded] = useState(false);
  // A handful of short lists; merging on render is cheaper than memoising them.
  const merged = mergeUsage(results.map((r) => r.data ?? []));
  if (!on || merged.length === 0) return null;
  const estimate = canMoney ? estimateMaterialsCost(merged) : null;
  const currency = merged[0]?.currency ?? tenant.business?.currency ?? "GBP";
  return (
    <div className="grid gap-2 rounded-xl bg-secondary/60 px-3.5 py-2.5 text-[13px]">
      <div className="flex items-start gap-2.5">
        <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-bold">Uses {shortUsageSummary(merged)}</span>
          <span className="text-xs text-muted-foreground">
            {estimate != null
              ? `About ${safeMoney(estimate, currency)} in materials. For your records, never charged.`
              : "For your records, never charged."}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="shrink-0 cursor-pointer text-[13px] font-semibold text-primary hover:underline"
        >
          {expanded ? "Hide" : "View"}
        </button>
      </div>
      {expanded ? (
        <ul className="grid gap-1 pl-[26px] text-xs text-muted-foreground">
          {merged.map((l) => (
            <li key={l.consumableId}>{summariseUsage([l])}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "Sat 18 Oct" in the booking's own timezone. */
function jobDay(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    })
      .format(new Date(iso))
      .replace(",", "");
  } catch {
    return "";
  }
}

type SheetLine = {
  row: UsageRow;
  name: string;
  unit: string;
  currency: string;
  archived: boolean;
  /** The cost this line will be saved with. */
  costMinor: number | null;
  /** Shown as "Use current cost (£X)" when the line was recorded without a cost. */
  offerCurrent: number | null;
};

function JobUsageSheet({
  open,
  onClose,
  booking,
  plate,
  usage,
  canMoney,
}: {
  open: boolean;
  onClose: () => void;
  booking: Pick<Booking, "id" | "start" | "timezone" | "lineItems" | "serviceSnapshot">;
  plate: string | null;
  usage: BookingConsumablesUsage;
  canMoney: boolean;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const catalogue = useConsumables({ enabled: open });
  const replace = useReplaceBookingConsumables();
  const [rows, setRows] = useState<UsageRow[]>(() => rowsFromLines(usage.items));
  const [noteOpen, setNoteOpen] = useState<ReadonlySet<string>>(new Set());
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef(rows);
  latest.current = rows;

  useEffect(() => {
    if (!open) return;
    setRows(rowsFromLines(usage.items));
    setNoteOpen(new Set(usage.items.filter((l) => l.note).map((l) => l.consumableId)));
    setHandled(new Set());
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = useMemo(() => new Map(usage.items.map((l) => [l.consumableId, l])), [usage.items]);
  const byId = useMemo(
    () => new Map((catalogue.data ?? []).map((c) => [c.id, c])),
    [catalogue.data],
  );

  const lineFor = (row: UsageRow): SheetLine => {
    const existing: UsageLine | undefined = saved.get(row.consumableId);
    const c: Consumable | undefined = byId.get(row.consumableId);
    const current = existing?.currentUnitCostMinor ?? c?.unitCostMinor ?? null;
    const costMinor = existing
      ? (existing.unitCostMinor ?? (row.useCurrentCost ? current : null))
      : (c?.unitCostMinor ?? null);
    return {
      row,
      name: existing?.name ?? c?.name ?? "Consumable",
      unit: existing?.unit ?? c?.unit ?? "",
      currency: existing?.currency ?? c?.currency ?? usage.currency,
      archived: existing?.archived ?? c?.status === "archived",
      costMinor,
      offerCurrent:
        existing && existing.unitCostMinor == null && !row.useCurrentCost ? current : null,
    };
  };
  const lines = rows.map(lineFor);
  const costed = lines.map((l) => ({
    name: l.name,
    unit: l.unit,
    quantity: parseQuantity(l.row.quantity) ?? 0,
    unitCostMinor: l.costMinor,
  }));
  const total = estimateMaterialsCost(costed);
  const uncosted = uncostedLabel(costed.filter((l) => l.unitCostMinor == null).length);

  const update = (id: string, patch: Partial<UsageRow>) =>
    setRows(latest.current.map((r) => (r.consumableId === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => {
    const index = latest.current.findIndex((r) => r.consumableId === id);
    if (index < 0) return;
    const removed = latest.current[index]!;
    const name = lineFor(removed).name;
    setRows(latest.current.filter((r) => r.consumableId !== id));
    toast(`${name} removed`, {
      action: {
        label: "Undo",
        onClick: () => {
          if (latest.current.some((r) => r.consumableId === id)) return;
          const next = [...latest.current];
          next.splice(Math.min(index, next.length), 0, removed);
          setRows(next);
        },
      },
    });
  };
  const add = (c: Consumable) => {
    if (latest.current.some((r) => r.consumableId === c.id)) return;
    setRows([
      ...latest.current,
      { consumableId: c.id, quantity: "1", note: null, source: "added" },
    ]);
  };

  // Prompts: a booked service whose usual materials aren't on the job, or seeded
  // lines whose service has since been removed.
  const onJob = new Set(rows.map((r) => r.consumableId));
  const missing = usage.missingDefaults.filter(
    (m) =>
      !handled.has(m.serviceId) &&
      !isDismissed(booking.id, m.serviceId) &&
      m.items.some((i) => !onJob.has(i.consumableId)),
  );
  const orphaned = usage.orphanedConsumableIds.filter((id) => onJob.has(id));
  const orphanKey = `removed:${[...usage.orphanedConsumableIds].sort().join(",")}`;
  const showOrphans =
    orphaned.length > 0 && !handled.has(orphanKey) && !isDismissed(booking.id, orphanKey);
  const markHandled = (key: string) => setHandled((s) => new Set([...s, key]));

  const save = async () => {
    setError(null);
    const parsed = rowsToItems(rows);
    if (!parsed.ok) {
      setError("Each line needs a quantity above zero.");
      return;
    }
    try {
      await replace.mutateAsync({ bookingId: booking.id, items: parsed.items });
      toast.success("Consumables saved");
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail || err.title
          : "Couldn't save. Check your connection and try again.",
      );
    }
  };

  const serviceLine =
    booking.lineItems.length > 0
      ? booking.lineItems.map((li) => li.name).join(", ")
      : booking.serviceSnapshot.name;
  const subtitle = [serviceLine, plate, jobDay(booking.start, booking.timezone)]
    .filter(Boolean)
    .join(" · ");
  const canAddToCatalogue = tenant.can(PERMISSIONS.BUSINESS_UPDATE);

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0 [&>button.absolute]:hidden",
          phone ? "top-[60px] rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-6 pt-5 pb-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <SheetTitle className="text-xl font-extrabold">What this job used</SheetTitle>
              <SheetDescription className="truncate text-[13px]">{subtitle}</SheetDescription>
            </div>
            <Button variant="ghost" size="sm" className="-mr-2 shrink-0" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </SheetHeader>

        <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-6 py-5">
          {missing.map((m) => (
            <div key={m.serviceId} className={cn("grid gap-2 rounded-xl px-3.5 py-3", MINT_TINT)}>
              <p className="text-[13px]">
                <span className="font-extrabold">{m.serviceName} was added to this job.</span> Add
                what it usually uses?{" "}
                {summariseUsage(m.items.filter((i) => !onJob.has(i.consumableId)))}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setRows(
                      addDefaultsToRows(
                        latest.current,
                        m.items.filter((i) => !onJob.has(i.consumableId)),
                      ),
                    );
                    markHandled(m.serviceId);
                  }}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    dismiss(booking.id, m.serviceId);
                    markHandled(m.serviceId);
                  }}
                >
                  Not now
                </Button>
              </div>
            </div>
          ))}
          {showOrphans ? (
            <div className={cn("grid gap-2 rounded-xl px-3.5 py-3", MINT_TINT)}>
              <p className="text-[13px]">
                <span className="font-extrabold">A service was removed from this job.</span> Remove
                its materials?{" "}
                {orphaned
                  .map((id) => lineFor(rows.find((r) => r.consumableId === id)!).name)
                  .join(", ")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const drop = new Set(orphaned);
                    setRows(latest.current.filter((r) => !drop.has(r.consumableId)));
                    markHandled(orphanKey);
                  }}
                >
                  Remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    dismiss(booking.id, orphanKey);
                    markHandled(orphanKey);
                  }}
                >
                  Keep
                </Button>
              </div>
            </div>
          ) : null}

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3.5 py-4 text-sm text-muted-foreground">
              Nothing recorded yet. Add what this job used from your list.
            </p>
          ) : (
            <ul className="grid gap-2">
              {lines.map((l) => (
                <SwipeLine
                  key={l.row.consumableId}
                  line={l}
                  phone={phone}
                  canMoney={canMoney}
                  noteOpen={noteOpen.has(l.row.consumableId)}
                  onOpenNote={() => setNoteOpen((s) => new Set([...s, l.row.consumableId]))}
                  onNote={(note) => update(l.row.consumableId, { note })}
                  onQuantity={(q) => update(l.row.consumableId, { quantity: String(q) })}
                  onUseCurrent={() => update(l.row.consumableId, { useCurrentCost: true })}
                  onRemove={() => remove(l.row.consumableId)}
                />
              ))}
            </ul>
          )}

          {catalogue.isLoading ? (
            <div className="h-9 w-40 animate-pulse rounded-lg bg-secondary/70" />
          ) : (
            <div>
              <ConsumablePicker
                catalogue={catalogue.data ?? []}
                selectedIds={onJob}
                onPick={add}
                onNew={canAddToCatalogue ? () => setAdding(true) : undefined}
                label="Add from your list"
                triggerClassName="max-sm:h-11"
              />
            </div>
          )}
        </div>

        <footer className="grid gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]"
            aria-live="polite"
          >
            <span>
              {canMoney ? (
                <>
                  <span className="font-extrabold">
                    Materials {total != null ? safeMoney(total, usage.currency) : "no cost"}
                  </span>{" "}
                  · never charged
                </>
              ) : (
                <span className="text-muted-foreground">Never charged or shown to clients</span>
              )}
            </span>
            {canMoney && uncosted && lines.length > 0 ? (
              <span className={cn("font-semibold", AMBER_TEXT)}>{uncosted}</span>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button
              disabled={replace.isPending}
              onClick={() => void save()}
              className={cn(phone && "h-12 w-full")}
            >
              {replace.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </footer>

        <ConsumableFormDrawer
          open={adding}
          consumable={null}
          onOpenChange={setAdding}
          onSaved={(c) => add(c)}
        />
      </SheetContent>
    </Sheet>
  );
}

function SwipeLine({
  line,
  phone,
  canMoney,
  noteOpen,
  onOpenNote,
  onNote,
  onQuantity,
  onUseCurrent,
  onRemove,
}: {
  line: SheetLine;
  phone: boolean;
  canMoney: boolean;
  noteOpen: boolean;
  onOpenNote: () => void;
  onNote: (note: string) => void;
  onQuantity: (q: number) => void;
  onUseCurrent: () => void;
  onRemove: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const quantity = parseQuantity(line.row.quantity) ?? 0;
  const stepper = (
    <Stepper
      value={quantity}
      unit={line.unit}
      name={line.name}
      onChange={onQuantity}
      onRemove={onRemove}
      size={phone ? "phone" : "desk"}
    />
  );
  const noteLink = (
    <button
      type="button"
      onClick={onOpenNote}
      className="w-fit cursor-pointer text-xs font-semibold text-primary hover:underline max-sm:min-h-11"
    >
      + Note
    </button>
  );

  const touch = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0]!;
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchMove: (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0]!;
      const x = t.clientX - start.current.x;
      if (Math.abs(t.clientY - start.current.y) > Math.abs(x)) return;
      setDx(Math.min(0, x));
    },
    onTouchEnd: () => {
      start.current = null;
      if (dx < -96) onRemove();
      setDx(0);
    },
  };

  return (
    <li className="relative overflow-hidden rounded-[14px]">
      {phone && dx < 0 ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-end rounded-[14px] bg-destructive pr-5 text-sm font-bold text-white"
        >
          Remove
        </span>
      ) : null}
      <div
        {...(phone ? touch : {})}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={cn(
          "group relative grid gap-2 rounded-[14px] border bg-background px-3.5 py-3",
          !dx && "transition-transform",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-[15px] font-bold">
              {line.name}
              {line.archived ? (
                <span className="font-normal text-muted-foreground"> (archived)</span>
              ) : null}
            </span>
            <span className="truncate text-xs">
              {canMoney && line.costMinor != null ? (
                <span className="text-muted-foreground">
                  {safeMoney(line.costMinor, line.currency)} · 1 {line.unit}
                </span>
              ) : canMoney ? (
                <span className={AMBER_TEXT}>No cost set</span>
              ) : (
                <span className="text-muted-foreground">{quantityLabel(quantity, line.unit)}</span>
              )}
            </span>
            {canMoney && line.offerCurrent != null ? (
              <button
                type="button"
                onClick={onUseCurrent}
                className="w-fit cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                Use current cost ({safeMoney(line.offerCurrent, line.currency)})
              </button>
            ) : null}
          </span>
          {phone ? null : stepper}
          {phone ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={`More for ${line.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={onRemove}
                  className="text-destructive focus:text-destructive"
                >
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${line.name}`}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {phone ? (
          <div className="flex items-center justify-between gap-3">
            {noteOpen ? <span /> : noteLink}
            {stepper}
          </div>
        ) : null}
        {noteOpen ? (
          <Textarea
            aria-label={`Note for ${line.name}`}
            value={line.row.note ?? ""}
            maxLength={500}
            rows={2}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ran low, used a different pad, anything worth remembering."
            className="min-h-0 bg-secondary/50"
          />
        ) : phone ? null : (
          noteLink
        )}
      </div>
    </li>
  );
}
