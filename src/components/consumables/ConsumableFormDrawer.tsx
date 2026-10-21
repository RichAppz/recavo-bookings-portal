import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { AMBER_TEXT } from "@/components/waitlist/parts";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import {
  useConsumables,
  useCreateConsumable,
  useServices,
  useUpdateConsumable,
} from "@/lib/api/hooks";
import type { Consumable } from "@/lib/api/types";
import {
  RECORDS_LINE,
  UNIT_CODES,
  costFieldLabel,
  costInput,
  currencySymbol,
  formatQuantity,
  formatUnitCost,
  normaliseUnit,
  packUnitsFor,
  parseCost,
  parseQuantity,
  unitCode,
  unitCostFromPack,
  unitCostLabel,
  unitFor,
} from "@/lib/consumables";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type Field = "name" | "unit" | "unitCostMinor" | "packSize" | "packCost" | "sku" | "notes";

const MESSAGES: Record<"name" | "unit" | "unitCostMinor" | "packSize" | "packCost", string> = {
  name: "Give it a name.",
  unit: "Pick how you count it, e.g. bottle or pad.",
  unitCostMinor: "Enter a cost like 12.50, or leave it blank.",
  packSize: "Enter how much you buy, e.g. 5.",
  packCost: "Enter what you paid, like 40.00.",
};

/** API field → form field; a pack in the wrong unit shows under the size. */
const API_FIELDS: Record<string, Field> = {
  name: "name",
  unit: "unit",
  unitCostMinor: "unitCostMinor",
  "pack.size": "packSize",
  "pack.unit": "packSize",
  "pack.costMinor": "packCost",
  sku: "sku",
  notes: "notes",
};

type CostMode = "paid" | "unit";

export type ConsumablePrefill = { name: string; unit: string };

/**
 * Add or edit one consumable. Right drawer on desktop, full-height bottom sheet on
 * phone. Errors show under their field, never as toasts.
 */
export function ConsumableFormDrawer({
  open,
  consumable,
  prefill,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** The row to edit; null adds a new one. */
  consumable: Consumable | null;
  prefill?: ConsumablePrefill | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: Consumable, created: boolean) => void;
}) {
  const phone = useIsPhone();
  const tenant = useTenant();
  const currency = tenant.business?.currency || consumable?.currency || "GBP";
  const catalogue = useConsumables({ enabled: open && consumable !== null });
  const services = useServices();
  const createConsumable = useCreateConsumable();
  const updateConsumable = useUpdateConsumable();
  // A 409 reloads the list; edit against the freshest copy of the row.
  const current = useMemo(
    () =>
      consumable
        ? ((catalogue.data ?? []).find((c) => c.id === consumable.id) ?? consumable)
        : null,
    [catalogue.data, consumable],
  );

  const [name, setName] = useState("");
  const [unitChoice, setUnitChoice] = useState<string>("");
  const [otherUnit, setOtherUnit] = useState("");
  const [cost, setCost] = useState("");
  const [costMode, setCostMode] = useState<CostMode>("paid");
  const [packSize, setPackSize] = useState("");
  const [packUnit, setPackUnit] = useState("");
  const [packCost, setPackCost] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const otherRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const seed = (c: Consumable | null) => {
    const unit = c?.unit ?? prefill?.unit ?? "";
    const code = unit ? unitCode(normaliseUnit(unit)) : null;
    setName(c?.name ?? prefill?.name ?? "");
    setUnitChoice(code ?? (unit ? "other" : ""));
    setOtherUnit(code ? "" : unit);
    setCost(c?.pack ? "" : costInput(c?.unitCostMinor));
    setCostMode(c?.pack || c?.unitCostMinor == null ? "paid" : "unit");
    setPackSize(c?.pack ? formatQuantity(c.pack.size).replace(/,/g, "") : "");
    setPackUnit(c?.pack?.unit ?? "");
    setPackCost(c?.pack ? costInput(c.pack.costMinor) : "");
    setSku(c?.sku ?? "");
    setNotes(c?.notes ?? "");
    setErrors({});
    setTried(false);
  };

  useEffect(() => {
    if (!open) return;
    seed(consumable);
    setFormError(null);
  }, [open, consumable?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unit = unitChoice === "other" ? otherUnit.trim() : unitChoice;
  const parsedCost = parseCost(cost, { decimals: 6 });
  const packUnits = packUnitsFor(unit);
  const packUnitShown = packUnits.includes(packUnit) ? packUnit : unit;
  const packBlank = !packSize.trim() && !packCost.trim();
  const parsedPackSize = packSize.trim() ? parseQuantity(packSize) : null;
  const parsedPackCost = parseCost(packCost);
  const packCostFrom =
    parsedPackSize !== null && typeof parsedPackCost === "number"
      ? unitCostFromPack(
          { size: parsedPackSize, unit: packUnitShown, costMinor: parsedPackCost },
          unit,
        )
      : null;
  /** The cost per unit this save would record; "invalid" while the cost fields don't add up. */
  const nextUnitCost: number | null | "invalid" =
    costMode === "unit"
      ? parsedCost
      : packBlank
        ? null
        : packCostFrom === null && unit
          ? "invalid"
          : packCostFrom;
  const submitting = createConsumable.isPending || updateConsumable.isPending;

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = MESSAGES.name;
    if (!unit) next.unit = MESSAGES.unit;
    if (costMode === "unit") {
      if (parsedCost === "invalid") next.unitCostMinor = MESSAGES.unitCostMinor;
    } else if (!packBlank) {
      if (parsedPackSize === null) next.packSize = MESSAGES.packSize;
      if (parsedPackCost === null || parsedPackCost === "invalid") {
        next.packCost = MESSAGES.packCost;
      }
    }
    return next;
  };
  const live = tried ? validate() : {};
  const shown = { ...live, ...errors };
  const missing = [
    !name.trim() ? "a name" : null,
    !unit ? "how you count it" : null,
    nextUnitCost === "invalid" ? "a valid cost" : null,
  ].filter(Boolean) as string[];

  const serviceNames = useMemo(() => {
    if (!current) return [];
    const byId = new Map((services.data ?? []).map((s) => [s.id, s.name]));
    return current.serviceIds.map((id) => byId.get(id)).filter(Boolean) as string[];
  }, [current, services.data]);

  const costChanged =
    current !== null &&
    nextUnitCost !== "invalid" &&
    nextUnitCost !== current.unitCostMinor &&
    current.jobCount > 0;

  const submit = async () => {
    setTried(true);
    setFormError(null);
    const found = validate();
    setErrors({});
    if (Object.keys(found).length > 0) {
      if (found.name) nameRef.current?.focus();
      return;
    }
    const cost =
      costMode === "paid" &&
      !packBlank &&
      parsedPackSize !== null &&
      typeof parsedPackCost === "number"
        ? { pack: { size: parsedPackSize, unit: packUnitShown, costMinor: parsedPackCost } }
        : {
            unitCostMinor: costMode === "unit" && parsedCost !== "invalid" ? parsedCost : null,
            pack: null,
          };
    const body = {
      name: name.trim(),
      unit,
      ...cost,
      sku: sku.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (current) {
        const saved = await updateConsumable.mutateAsync({
          consumableId: current.id,
          version: current.version,
          body,
        });
        toast.success("Changes saved");
        onSaved?.(saved, false);
      } else {
        const saved = await createConsumable.mutateAsync(body);
        toast.success(`${saved.name} added`);
        onSaved?.(saved, true);
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        const fresh = await catalogue.refetch();
        const row = fresh.data?.find((c) => c.id === current?.id) ?? null;
        if (row) seed(row);
        setFormError("Someone else just saved this. We've loaded their version.");
        return;
      }
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        const mapped: Partial<Record<Field, string>> = {};
        for (const fe of err.fieldErrors) {
          const key = fe.field
            ? (API_FIELDS[fe.field] ?? API_FIELDS[fe.field.split(".").pop() ?? ""])
            : undefined;
          if (key) mapped[key] = fe.message || "Check this field.";
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      setFormError(
        err instanceof ApiError
          ? err.detail || err.title
          : "Couldn't save. Check your connection and try again.",
      );
    }
  };

  const pickUnit = (value: string) => {
    setUnitChoice(value);
    setErrors((e) => ({ ...e, unit: undefined }));
    if (value === "other") window.setTimeout(() => otherRef.current?.focus(), 0);
  };
  const chips = [...UNIT_CODES, "other"] as const;
  const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = chips[(index + delta + chips.length) % chips.length]!;
    pickUnit(next);
    const group = e.currentTarget.parentElement;
    window.setTimeout(
      () =>
        group?.querySelectorAll<HTMLButtonElement>("[role=radio]")[chips.indexOf(next)]?.focus(),
      0,
    );
  };

  const errorId = (f: Field) => (shown[f] ? `cf-${f}-error` : undefined);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-[60px] rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-xl font-extrabold">
            {consumable ? "Edit consumable" : "Add consumable"}
          </SheetTitle>
          <SheetDescription>{RECORDS_LINE}</SheetDescription>
        </SheetHeader>

        <form
          id="consumable-form"
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          {formError ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              ref={nameRef}
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((x) => ({ ...x, name: undefined }));
              }}
              placeholder="Ceramic coat 50ml"
              aria-invalid={Boolean(shown.name)}
              aria-describedby={errorId("name")}
              autoFocus={!phone}
            />
            {shown.name ? (
              <p id="cf-name-error" className="text-xs text-destructive">
                {shown.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <span id="cf-unit-label" className="text-sm leading-none font-medium">
              How you count it
            </span>
            <div
              role="radiogroup"
              aria-labelledby="cf-unit-label"
              aria-describedby={["cf-unit-help", errorId("unit")].filter(Boolean).join(" ")}
              aria-invalid={Boolean(shown.unit)}
              className="flex flex-wrap gap-2"
            >
              {chips.map((value, i) => {
                const on = unitChoice === value;
                const focusable = on || (!unitChoice && i === 0);
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={focusable ? 0 : -1}
                    onClick={() => pickUnit(value)}
                    onKeyDown={(e) => onChipKey(e, i)}
                    className={cn(
                      "inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors max-sm:h-11",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {value === "other" ? "Other" : value}
                  </button>
                );
              })}
            </div>
            {unitChoice === "other" ? (
              <Input
                ref={otherRef}
                aria-label="Your own unit"
                value={otherUnit}
                maxLength={32}
                onChange={(e) => {
                  setOtherUnit(e.target.value);
                  setErrors((x) => ({ ...x, unit: undefined }));
                }}
                placeholder="sachet"
                autoComplete="off"
                aria-invalid={Boolean(shown.unit)}
              />
            ) : null}
            <p id="cf-unit-help" className="text-xs text-muted-foreground">
              Pick one or type your own. We&rsquo;ll say &ldquo;1 bottle, 2 bottles&rdquo;.
            </p>
            {shown.unit ? (
              <p id="cf-unit-error" className="text-xs text-destructive">
                {shown.unit}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <span id="cf-cost-label" className="text-sm leading-none font-medium">
              What it costs you
            </span>
            <div
              role="radiogroup"
              aria-labelledby="cf-cost-label"
              className="grid h-10 grid-cols-2 rounded-[10px] bg-secondary p-[3px] max-sm:h-11"
            >
              {(
                [
                  ["paid", "What you paid"],
                  ["unit", costFieldLabel(unit)],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={costMode === value}
                  onClick={() => {
                    if (value === "unit" && !cost.trim() && typeof nextUnitCost === "number") {
                      setCost(costInput(nextUnitCost));
                    }
                    setCostMode(value);
                    setErrors((x) => ({
                      ...x,
                      unitCostMinor: undefined,
                      packSize: undefined,
                      packCost: undefined,
                    }));
                  }}
                  className={cn(
                    "cursor-pointer truncate rounded-lg px-2 text-[13px] font-bold text-muted-foreground transition-colors",
                    costMode === value && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {costMode === "paid" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cf-pack-size" className="text-xs text-muted-foreground">
                      You buy
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="cf-pack-size"
                        inputMode="decimal"
                        className="min-w-0 flex-1"
                        value={packSize}
                        onChange={(e) => {
                          setPackSize(e.target.value);
                          setErrors((x) => ({ ...x, packSize: undefined }));
                        }}
                        placeholder={
                          packUnitShown === "ml" ? "500" : packUnitShown === "litre" ? "5" : "1"
                        }
                        aria-invalid={Boolean(shown.packSize)}
                        aria-describedby={["cf-pack-help", errorId("packSize")]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      {packUnits.length > 1 ? (
                        <div
                          role="radiogroup"
                          aria-label="Size in"
                          className="flex h-10 shrink-0 rounded-[10px] bg-secondary p-[3px] max-sm:h-11"
                        >
                          {packUnits.map((u) => (
                            <button
                              key={u}
                              type="button"
                              role="radio"
                              aria-checked={packUnitShown === u}
                              onClick={() => {
                                setPackUnit(u);
                                setErrors((x) => ({ ...x, packSize: undefined }));
                              }}
                              className={cn(
                                "cursor-pointer rounded-lg px-2.5 text-[13px] font-bold text-muted-foreground transition-colors",
                                packUnitShown === u && "bg-card text-foreground shadow-sm",
                              )}
                            >
                              {unitFor(u, 2)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {unit ? unitFor(unit, parsedPackSize ?? 2) : "units"}
                        </span>
                      )}
                    </div>
                    {shown.packSize ? (
                      <p id="cf-packSize-error" className="text-xs text-destructive">
                        {shown.packSize}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cf-pack-cost" className="text-xs text-muted-foreground">
                      For
                    </Label>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                      >
                        {currencySymbol(currency)}
                      </span>
                      <Input
                        id="cf-pack-cost"
                        inputMode="decimal"
                        className="pl-8"
                        value={packCost}
                        onChange={(e) => {
                          setPackCost(e.target.value);
                          setErrors((x) => ({ ...x, packCost: undefined }));
                        }}
                        placeholder="0.00"
                        aria-invalid={Boolean(shown.packCost)}
                        aria-describedby={["cf-pack-help", errorId("packCost")]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    </div>
                    {shown.packCost ? (
                      <p id="cf-packCost-error" className="text-xs text-destructive">
                        {shown.packCost}
                      </p>
                    ) : null}
                  </div>
                </div>
                {typeof nextUnitCost === "number" && unit ? (
                  <p
                    id="cf-pack-help"
                    role="status"
                    className="rounded-xl bg-secondary/60 px-3 py-2 text-[13px]"
                  >
                    That&rsquo;s{" "}
                    <span className="font-bold">{unitCostLabel(nextUnitCost, unit, currency)}</span>
                    . Jobs work out what they used from this.
                  </p>
                ) : (
                  <p id="cf-pack-help" className="text-xs text-muted-foreground">
                    Optional. E.g. a{" "}
                    {unitCode(unit) === "ml" || unitCode(unit) === "litre"
                      ? "5 litre bottle"
                      : `pack of 10 ${unit ? unitFor(unit, 10) : "units"}`}{" "}
                    for {currencySymbol(currency)}40. We work out the cost per{" "}
                    {unit ? unitFor(unit, 1) : "unit"}.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    {currencySymbol(currency)}
                  </span>
                  <Input
                    id="cf-cost"
                    aria-label={costFieldLabel(unit)}
                    inputMode="decimal"
                    className="pl-8"
                    value={cost}
                    onChange={(e) => {
                      setCost(e.target.value);
                      setErrors((x) => ({ ...x, unitCostMinor: undefined }));
                    }}
                    placeholder="0.00"
                    aria-invalid={Boolean(shown.unitCostMinor)}
                    aria-describedby={["cf-cost-help", errorId("unitCostMinor")]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </div>
                <p id="cf-cost-help" className="text-xs text-muted-foreground">
                  Optional. What one {unit ? unitFor(unit, 1) : "unit"} costs you.
                </p>
                {shown.unitCostMinor ? (
                  <p id="cf-unitCostMinor-error" className="text-xs text-destructive">
                    {shown.unitCostMinor}
                  </p>
                ) : null}
              </>
            )}
            {costChanged && current ? (
              <p className={cn("text-xs font-semibold", AMBER_TEXT)} role="status">
                New cost applies to jobs recorded from now on. The {current.jobCount}{" "}
                {current.jobCount === 1 ? "job" : "jobs"} already recorded keep{" "}
                {current.unitCostMinor != null
                  ? formatUnitCost(current.unitCostMinor, currency)
                  : "no cost"}
                .
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:max-w-[50%]">
            <Label htmlFor="cf-sku">SKU</Label>
            <Input
              id="cf-sku"
              value={sku}
              maxLength={64}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Supplier code"
              autoComplete="off"
              aria-invalid={Boolean(shown.sku)}
              aria-describedby={errorId("sku")}
            />
            {shown.sku ? (
              <p id="cf-sku-error" className="text-xs text-destructive">
                {shown.sku}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea
              id="cf-notes"
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Where you buy it, dilution ratio, anything you'd want to remember."
              rows={3}
              aria-invalid={Boolean(shown.notes)}
              aria-describedby={errorId("notes")}
            />
            {shown.notes ? (
              <p id="cf-notes-error" className="text-xs text-destructive">
                {shown.notes}
              </p>
            ) : null}
          </div>

          {current ? (
            <div className="rounded-xl bg-secondary/60 px-3.5 py-3 text-[13px]">
              {serviceNames.length > 0 ? (
                <>
                  <span className="font-bold">
                    Default on {serviceNames.length}{" "}
                    {serviceNames.length === 1 ? "service" : "services"}:
                  </span>{" "}
                  {serviceNames.join(", ")}
                </>
              ) : (
                <span className="text-muted-foreground">Not on any service yet.</span>
              )}
            </div>
          ) : null}
        </form>

        <footer className="grid gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {tried && missing.length > 0 ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Still needed: {missing.join(", ")}.
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {phone ? null : (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              form="consumable-form"
              disabled={submitting}
              className={cn(phone && "h-12 w-full")}
            >
              {submitting ? "Saving…" : consumable ? "Save changes" : "Add consumable"}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
