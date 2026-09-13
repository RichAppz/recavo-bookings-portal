import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useConsumables,
  useCreateConsumable,
  useDeleteConsumable,
  useUpdateConsumable,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import type { Consumable } from "@/lib/api/types";
import { unitCostLabel } from "@/lib/consumables";
import { parseMoneyToMinor } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

export const Route = createFileRoute("/consumables")({
  head: () => ({
    meta: [
      { title: "Consumables — RECAVO" },
      {
        name: "description",
        content:
          "Track the materials each job uses — coatings, pads, chemicals — for your own records.",
      },
      { property: "og:title", content: "RECAVO Consumables" },
      {
        property: "og:description",
        content: "Materials per service and per job, for your records only.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ConsumablesPage />
      </AppShell>
    </RequireAuth>
  ),
});

const EMPTY_COPY =
  "Track what each job uses — coatings, pads, chemicals. Costs are for your records only and never shown to clients.";

/** Suggested units, offered as one-tap chips; the field stays free text. */
const UNIT_SUGGESTIONS = ["bottle", "ml", "litre", "pad", "towel", "pack", "each"];

function usedByLabel(count: number): string {
  if (count === 0) return "Not on any service";
  return `Used by ${count} ${count === 1 ? "service" : "services"}`;
}

function ConsumablesPage() {
  const tenant = useTenant();
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const consumables = useConsumables({ enabled: isCarDetailing });
  const updateConsumable = useUpdateConsumable();
  const deleteConsumable = useDeleteConsumable();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Consumable | null>(null);
  const [deleting, setDeleting] = useState<Consumable | null>(null);

  // A 409 refetch bumps the version; keep the open editor on the fresh row.
  useEffect(() => {
    if (!editing) return;
    const fresh = (consumables.data ?? []).find((c) => c.id === editing.id);
    if (fresh && fresh.version !== editing.version) setEditing(fresh);
  }, [consumables.data, editing]);

  const all = useMemo(() => consumables.data ?? [], [consumables.data]);
  const archivedCount = all.filter((c) => c.status === "archived").length;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => status === "all" || c.status === status)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.unit.toLowerCase().includes(q) ||
          (c.sku ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, query, status]);

  const setArchived = async (c: Consumable, archived: boolean) => {
    await updateConsumable.mutateAsync({
      consumableId: c.id,
      version: c.version,
      body: { status: archived ? "archived" : "active" },
    });
    toast.success(archived ? `${c.name} archived` : `${c.name} restored`);
  };

  if (!tenant.isLoading && !isCarDetailing) {
    return (
      <>
        <PageHeader title="Consumables" />
        <EmptyState
          icon={<Package className="size-6" />}
          title="Consumables are for automotive businesses"
          description="They track the materials a detailing job uses up. This business isn't set up as car detailing, so there's nothing to record here."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Consumables"
        description="The materials your jobs use up. For your records only — nothing here changes a price or is shown to clients."
        actions={
          <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Add consumable
            </Button>
          </Can>
        }
      />

      <div className="surface-card overflow-hidden **:min-w-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, unit or SKU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">
                Archived{archivedCount ? ` (${archivedCount})` : ""}
              </SelectItem>
              <SelectItem value="all">Any status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {consumables.isLoading || tenant.isLoading ? (
          <TableGhost rows={4} />
        ) : consumables.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load consumables"
              description={
                consumables.error instanceof ApiError
                  ? consumables.error.detail || consumables.error.title
                  : "Please try again shortly."
              }
              action={<Button onClick={() => consumables.refetch()}>Try again</Button>}
            />
          </div>
        ) : all.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Package className="size-6" />}
              title="No consumables yet"
              description={EMPTY_COPY}
              action={
                canEdit ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="size-4" /> Add your first consumable
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nothing matches"
              description={
                status === "archived"
                  ? "No archived consumables."
                  : "Try a different search, or add a consumable with the button above."
              }
            />
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((c) => {
              const openEdit = canEdit ? () => setEditing(c) : undefined;
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <button
                    type="button"
                    onClick={openEdit}
                    disabled={!openEdit}
                    className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-default"
                    aria-label={openEdit ? `Edit ${c.name}` : undefined}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.status === "archived" ? <StatusBadge status="archived" /> : null}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {unitCostLabel(c.unitCostMinor, c.unit, c.currency)}
                      {c.sku ? ` · SKU ${c.sku}` : ""}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {usedByLabel(c.serviceIds.length)}
                    </span>
                  </button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          aria-label={`Actions for ${c.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(c)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        {c.status === "active" ? (
                          <DropdownMenuItem onSelect={() => void setArchived(c, true)}>
                            <Archive className="size-4" /> Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => void setArchived(c, false)}>
                            <ArchiveRestore className="size-4" /> Restore
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => setDeleting(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConsumableDialog
        open={creating || editing !== null}
        consumable={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              {deleting && deleting.serviceIds.length > 0
                ? `This consumable is on ${usedByLabel(deleting.serviceIds.length).toLowerCase()}, so it will be archived rather than removed — past jobs keep their records and it drops out of the pickers.`
                : "If any job has recorded this consumable it will be archived instead, so those records stay intact. Otherwise it's removed for good."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConsumable.isPending}
              onClick={async () => {
                if (!deleting) return;
                try {
                  const result = await deleteConsumable.mutateAsync(deleting.id);
                  toast.success(
                    result.deleted
                      ? `${deleting.name} deleted`
                      : `${deleting.name} archived — it's still on past jobs`,
                  );
                  setDeleting(null);
                } catch {
                  // Toasted by the hook.
                }
              }}
            >
              {deleteConsumable.isPending ? "Removing…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function costToInput(minor: number | null | undefined): string {
  return minor == null ? "" : (minor / 100).toFixed(2);
}

function ConsumableDialog({
  open,
  consumable,
  onClose,
}: {
  open: boolean;
  consumable: Consumable | null;
  onClose: () => void;
}) {
  const createConsumable = useCreateConsumable();
  const updateConsumable = useUpdateConsumable();
  const [name, setName] = useState(consumable?.name ?? "");
  const [unit, setUnit] = useState(consumable?.unit ?? "");
  const [cost, setCost] = useState(costToInput(consumable?.unitCostMinor));
  const [sku, setSku] = useState(consumable?.sku ?? "");
  const [notes, setNotes] = useState(consumable?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submitting = createConsumable.isPending || updateConsumable.isPending;

  // Radix only reports open changes it initiates, so reseed when the parent
  // opens us (and on a 409 reload, when the version moves).
  useEffect(() => {
    if (!open) return;
    setName(consumable?.name ?? "");
    setUnit(consumable?.unit ?? "");
    setCost(costToInput(consumable?.unitCostMinor));
    setSku(consumable?.sku ?? "");
    setNotes(consumable?.notes ?? "");
    setFieldErrors({});
  }, [open, consumable?.id, consumable?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Give the consumable a name";
    if (!unit.trim()) errors.unit = "What do you count it in? e.g. bottle, ml, pad";
    let unitCostMinor: number | null = null;
    if (cost.trim()) {
      try {
        unitCostMinor = parseMoneyToMinor(cost);
        if (unitCostMinor < 0) throw new Error("negative");
      } catch {
        errors.unitCostMinor = "Enter a valid cost, or leave blank";
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0]!);
      return false;
    }
    const body = {
      name: name.trim(),
      unit: unit.trim(),
      unitCostMinor,
      sku: sku.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (consumable) {
        await updateConsumable.mutateAsync({
          consumableId: consumable.id,
          version: consumable.version,
          body,
        });
        toast.success("Consumable updated");
      } else {
        await createConsumable.mutateAsync(body);
        toast.success("Consumable added");
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors(
          Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ),
        );
      }
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{consumable ? "Edit consumable" : "Add consumable"}</DialogTitle>
          <DialogDescription>
            A material your jobs use up. The cost is for your own records and is never added to a
            price or shown to a client.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1 **:min-w-0">
          <div className="grid gap-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ceramic coating 50ml"
              aria-invalid={Boolean(fieldErrors.name)}
              autoFocus
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-unit">Unit</Label>
            <Input
              id="c-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="bottle"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.unit)}
            />
            <div className="flex flex-wrap gap-1.5">
              {UNIT_SUGGESTIONS.map((u) => {
                const on = unit.trim().toLowerCase() === u;
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(on ? "" : u)}
                    aria-pressed={on}
                    className={
                      on
                        ? "cursor-pointer rounded-full border border-primary bg-primary-soft px-2.5 py-0.5 text-xs text-primary"
                        : "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    }
                  >
                    {u}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              How you count it on a job — a bottle, millilitres, a pad.
            </p>
            {fieldErrors.unit ? (
              <p className="text-xs text-destructive">{fieldErrors.unit}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-cost">Cost per {unit.trim() || "unit"} (£)</Label>
            <Input
              id="c-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              aria-invalid={Boolean(fieldErrors.unitCostMinor)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. What it costs you, so you can work out what a job really cost later.
            </p>
            {fieldErrors.unitCostMinor ? (
              <p className="text-xs text-destructive">{fieldErrors.unitCostMinor}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-sku">SKU (optional)</Label>
            <Input
              id="c-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Supplier code"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-notes">Notes (optional)</Label>
            <Textarea
              id="c-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Where you buy it, dilution ratio, anything you'd want to remember."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              if (await handleSubmit()) onClose();
            }}
          >
            {submitting ? "Saving…" : consumable ? "Save changes" : "Add consumable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
