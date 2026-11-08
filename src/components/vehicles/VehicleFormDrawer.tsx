import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Lock, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AddClientDialog } from "@/components/AddClientDialog";
import { AVATAR_TINTS } from "@/components/client-profile/parts";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, PhotosPanel } from "@/components/LinkedRecordPhotos";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, queryKeys } from "@/lib/api";
import {
  uploadFileViaIntent,
  useBusinessId,
  useCreateCustomerLinkedRecord,
  useCustomer,
  useLinkedRecordDefinition,
  usePatchLinkedRecord,
  usePlanFeature,
  useTransferLinkedRecord,
} from "@/lib/api/hooks";
import {
  customerDisplayName,
  type Customer,
  type LinkedRecord,
  type LinkedRecordWithOwner,
} from "@/lib/api/types";
import { avatarTintIndex } from "@/lib/clients-list";
import { initials } from "@/lib/format";
import { saasPurchasesAllowedInApp } from "@/lib/native";
import { coerceFieldValue } from "@/lib/quick-add-record";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  autoLabel,
  conditionField,
  defaultDistanceUnit,
  detailFields,
  formatPlateInput,
  formatRegistration,
  fuelField,
  isAutoLabel,
  normaliseRegistration,
  registrationField,
  toKm,
  toMiles,
  vehicleTitle,
  yearError,
  type VehicleField,
} from "@/lib/vehicles";

type FormField = VehicleField & { required: boolean; helpText?: string | null };

export type VehicleFormMode =
  | {
      kind: "add";
      /** Preselected owner (client profile); the picker is hidden when `lockOwner`. */
      owner?: Customer | null;
      lockOwner?: boolean;
      /** Prefill, e.g. what was typed into the booking form's quick-add row. */
      values?: Record<string, unknown>;
    }
  | { kind: "edit"; record: LinkedRecord };

const UNEDITABLE = new Set(["image", "file", "reference", "multi_select"]);

/**
 * Add vehicle / Edit vehicle (design spec §3): a right-hand drawer on desktop and
 * full screen on a phone. Starts with the registration, then the owner, the
 * schema's details, condition notes and photos, and a live "Shows on bookings as"
 * preview that replaces the old free-text display label. Works for any record
 * noun; the plate only appears when the schema has a registration field.
 */
export function VehicleFormDrawer({
  open,
  onOpenChange,
  mode,
  existing,
  allowBook = true,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: VehicleFormMode;
  /** Every record on file, for the "already on file" check and owner vehicle counts. */
  existing?: readonly LinkedRecordWithOwner[];
  /** "Add and book" (hidden when the drawer was opened from the booking form). */
  allowBook?: boolean;
  onSaved?: (record: LinkedRecord, opts: { book: boolean; created: boolean }) => void;
}) {
  const tenant = useTenant();
  const term = tenant.terminology.linkedRecord || "Vehicle";
  const lower = term.toLowerCase();
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const definition = useLinkedRecordDefinition();
  const hasPhotos = usePlanFeature("custom_records.images");

  const fields = useMemo<FormField[]>(
    () =>
      ((definition.data?.fields ?? []) as unknown as FormField[])
        .filter((f) => (f.status ?? "active") === "active")
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [definition.data],
  );
  const regField = registrationField(fields);
  const condField = conditionField(fields);
  const fuel = fuelField(fields);
  const details = detailFields(fields);
  const isEdit = mode.kind === "edit";
  const editing = mode.kind === "edit" ? mode.record : null;

  const [owner, setOwner] = useState<Customer | null>(null);
  const [reg, setReg] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [unit, setUnit] = useState<"miles" | "km">("miles");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ackDuplicate, setAckDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState<"add" | "book" | "transfer" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const editOwner = useCustomer(editing?.customerId);
  const ownerId = editing?.customerId ?? owner?.id;
  const ownerDetail = useCustomer(isEdit ? undefined : owner?.id);
  const create = useCreateCustomerLinkedRecord(ownerId);
  const patch = usePatchLinkedRecord(editing?.customerId);

  useEffect(() => {
    if (!open) return;
    const localeCountry = (tenant.business?.locale ?? "en-GB").split("-")[1];
    const startUnit = defaultDistanceUnit(localeCountry);
    setUnit(startUnit);
    const inUnit = (v: Record<string, unknown>) =>
      startUnit === "km" && typeof v.mileage === "number" ? { ...v, mileage: toKm(v.mileage) } : v;
    setErrors({});
    setPhotos([]);
    setPhotoError(null);
    setAckDuplicate(null);
    setRenaming(false);
    setDirty(false);
    if (mode.kind === "edit") {
      const v = (mode.record.values ?? {}) as Record<string, unknown>;
      setOwner(null);
      setValues(inUnit(v));
      setReg(regField ? formatRegistration(String(v[regField.fieldKey] ?? "")) : "");
      setLabelOverride(
        isAutoLabel(mode.record.displayLabel, v, fields, term) ? null : mode.record.displayLabel,
      );
    } else {
      const v = mode.values ?? {};
      setOwner(mode.owner ?? null);
      setValues(inUnit(v));
      setReg(regField ? formatPlateInput(String(v[regField.fieldKey] ?? "")) : "");
      setLabelOverride(null);
    }
    // Reset only when the drawer opens (or the schema arrives), not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, regField?.fieldKey]);

  const allValues = useMemo(
    () => (regField ? { ...values, [regField.fieldKey]: reg } : values),
    [values, reg, regField],
  );
  const generated = autoLabel(allValues, fields, term);
  const label = labelOverride?.trim() || generated;

  const normReg = normaliseRegistration(reg);
  const duplicate = useMemo(() => {
    if (!regField || normReg.length < 2) return null;
    return (
      (existing ?? []).find(
        (r) =>
          r.record.id !== editing?.id &&
          r.record.status === "active" &&
          normaliseRegistration(String((r.record.values ?? {})[regField.fieldKey] ?? "")) ===
            normReg,
      ) ?? null
    );
  }, [existing, regField, normReg, editing?.id]);
  const showDuplicate = duplicate && ackDuplicate !== normReg;

  const ownerVehicleCount = owner
    ? (existing ?? []).filter((r) => r.record.customerId === owner.id).length
    : 0;

  const touch = () => setDirty(true);
  const setValue = (key: string, v: unknown) => {
    touch();
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const requestClose = () => {
    if (dirty && saving === null) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!isEdit && !owner) next.owner = `Pick who owns this ${lower}.`;
    if (regField?.required && !normReg) next[regField.fieldKey] = `${regField.label} is required.`;
    for (const f of [...details, ...(condField ? [condField] : [])]) {
      const raw = allValues[f.fieldKey];
      const coerced = coerceFieldValue(f, raw);
      if (f.required && (coerced === undefined || coerced === "")) {
        next[f.fieldKey] = `${f.label} is required.`;
      }
      if (f.fieldKey === "year") {
        const err = yearError(raw, new Date());
        if (err) next[f.fieldKey] = err;
      }
    }
    return next;
  };

  const payloadValues = () => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (UNEDITABLE.has(f.dataType)) {
        if (allValues[f.fieldKey] !== undefined) out[f.fieldKey] = allValues[f.fieldKey];
        continue;
      }
      let v: unknown = allValues[f.fieldKey];
      if (f === regField) v = formatRegistration(reg) || undefined;
      let coerced = coerceFieldValue(f, v);
      if (f.fieldKey === "mileage" && typeof coerced === "number" && unit === "km") {
        coerced = toMiles(coerced);
      }
      if (coerced !== undefined) out[f.fieldKey] = coerced;
      else if (isEdit && f.dataType !== "boolean") out[f.fieldKey] = null;
    }
    return out;
  };

  const uploadPhotos = async (recordId: string) => {
    if (photos.length === 0 || !businessId) return;
    const owner = { ownerType: "linked_record" as const, ownerId: recordId };
    try {
      for (const file of photos) await uploadFileViaIntent(businessId, file, owner);
    } catch (err) {
      toast.error("Some photos didn't upload", {
        description:
          err instanceof ApiError ? err.detail || err.title : "Try again from the photos.",
      });
    } finally {
      void qc.invalidateQueries({
        queryKey: queryKeys.ownerFiles(businessId, owner.ownerType, owner.ownerId),
      });
    }
  };

  const submit = async (how: "add" | "book") => {
    const next = validate();
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(how);
    try {
      const body = { displayLabel: label, values: payloadValues() };
      if (editing) {
        const record = await patch.mutateAsync({
          recordId: editing.id,
          version: editing.version,
          body,
        });
        toast.success(`${term} updated`);
        onOpenChange(false);
        onSaved?.(record, { book: false, created: false });
      } else {
        const record = await create.mutateAsync(body);
        await uploadPhotos(record.id);
        toast.success(`${vehicleTitle(record, fields)} added to ${customerDisplayName(owner!)}`);
        onOpenChange(false);
        onSaved?.(record, { book: how === "book", created: true });
      }
    } catch {
      // The hooks toast API errors; field errors show inline below.
    } finally {
      setSaving(null);
    }
  };

  const transfer = useTransferLinkedRecord(duplicate?.record.customerId);
  const transferDuplicate = async () => {
    if (!duplicate || !owner) return;
    setSaving("transfer");
    try {
      const record = await transfer.mutateAsync({
        recordId: duplicate.record.id,
        version: duplicate.record.version,
        toCustomerId: owner.id,
      });
      toast.success(`${formatRegistration(reg)} moved to ${customerDisplayName(owner)}`);
      onOpenChange(false);
      onSaved?.(record, { book: false, created: false });
    } catch (err) {
      toast.error(`Couldn't transfer the ${lower}`, {
        description: err instanceof ApiError ? err.detail || err.title : undefined,
      });
    } finally {
      setSaving(null);
    }
  };

  const serverError = (key: string) => {
    const err = (isEdit ? patch.error : create.error) as unknown;
    if (!(err instanceof ApiError)) return undefined;
    const match = err.fieldErrors.find(
      (fe) => fe.field === key || fe.field === `values.${key}` || fe.field.endsWith(`.${key}`),
    );
    return match ? (match.message ?? `${key} isn't valid.`) : undefined;
  };
  const errorFor = (key: string) => errors[key] || serverError(key);

  const pickPhotos = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const tooBig = picked.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setPhotoError(`"${tooBig.name}" is too large. Photos can be up to 10 MB.`);
      return;
    }
    setPhotoError(null);
    if (picked.length) touch();
    setPhotos((prev) => [...prev, ...picked]);
  };

  const missing = (() => {
    if (!isEdit && !owner) return "Pick the owner";
    return null;
  })();
  const busy = saving !== null;
  const ownerForCard = isEdit ? (editOwner.data ?? null) : (ownerDetail.data ?? owner);

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
          onOpenAutoFocus={(e) => {
            if (!regField) return;
            e.preventDefault();
            document.getElementById("vf-reg")?.focus();
          }}
        >
          <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
            <SheetTitle className="text-[22px] font-extrabold tracking-tight">
              {isEdit ? `Edit ${lower}` : `Add ${lower}`}
            </SheetTitle>
            {!isEdit ? (
              <SheetDescription>
                {regField
                  ? "Start with the registration, then add what you know."
                  : `Pick the owner, then add what you know about the ${lower}.`}
              </SheetDescription>
            ) : null}
          </SheetHeader>

          <form
            id="vehicle-form"
            noValidate
            className="no-scrollbar grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-4 sm:px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("add");
            }}
          >
            {regField ? (
              <Section>
                <Label htmlFor="vf-reg" className="text-[13px] font-bold">
                  {regField.label}
                  {regField.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <input
                  id="vf-reg"
                  value={reg}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={regField.constraints?.maxLength ?? 12}
                  placeholder="AB12 CDE"
                  aria-invalid={Boolean(errorFor(regField.fieldKey)) || undefined}
                  onChange={(e) => {
                    touch();
                    setReg(formatPlateInput(e.target.value));
                    if (errors[regField.fieldKey])
                      setErrors((x) => ({ ...x, [regField.fieldKey]: "" }));
                  }}
                  className="h-[52px] w-full rounded-md border border-black/20 bg-[#f7d23e] px-4 text-center font-display text-2xl font-extrabold tracking-[0.04em] text-[#111111] uppercase placeholder:text-black/30 focus:border-2 focus:border-ring focus:outline-none"
                />
                <FieldError message={errorFor(regField.fieldKey)} />
                {showDuplicate ? (
                  <div
                    role="status"
                    className="mt-2 rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] text-warning-foreground"
                  >
                    <p>
                      <span className="font-bold">
                        {formatRegistration(reg)} is already on file
                      </span>{" "}
                      for{" "}
                      {duplicate.owner
                        ? `${duplicate.owner.firstName} ${duplicate.owner.lastName ?? ""}`.trim()
                        : "another client"}{" "}
                      (added {new Date(duplicate.record.createdAt).getFullYear()}).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {!isEdit && duplicate.record.customerId !== owner?.id ? (
                        <button
                          type="button"
                          disabled={busy || !owner}
                          onClick={() => void transferDuplicate()}
                          className="cursor-pointer font-bold underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-60"
                        >
                          {owner
                            ? saving === "transfer"
                              ? "Transferring…"
                              : `Transfer to ${customerDisplayName(owner)}`
                            : "Pick the owner to transfer it"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setAckDuplicate(normReg)}
                        className="cursor-pointer font-bold underline-offset-2 hover:underline"
                      >
                        {isEdit ? "Keep it" : "Add anyway"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </Section>
            ) : null}

            {!isEdit && !(mode.kind === "add" && mode.lockOwner) ? (
              <Section title="Owner" required>
                {owner ? (
                  <OwnerCard
                    customer={ownerForCard ?? owner}
                    vehicles={ownerVehicleCount}
                    noun={{ singular: lower, plural: pluralise(lower) }}
                    onChange={() => {
                      touch();
                      setOwner(null);
                    }}
                  />
                ) : (
                  <div className="grid gap-2">
                    <CustomerSearchPicker
                      value={null}
                      onSelect={(c) => {
                        touch();
                        setOwner(c);
                        setErrors((e) => ({ ...e, owner: "" }));
                      }}
                      placeholder="Search for the owner"
                    />
                    <button
                      type="button"
                      onClick={() => setAddClientOpen(true)}
                      className="inline-flex w-fit cursor-pointer items-center gap-1 text-[13px] font-bold text-primary"
                    >
                      <Plus className="size-3.5" /> New client
                    </button>
                  </div>
                )}
                <FieldError message={errors.owner} />
              </Section>
            ) : null}

            {details.length > 0 ? (
              <Section title="Details">
                <div className="grid grid-cols-2 gap-3">
                  {details.map((f) => {
                    const half = ["make", "model", "year", "colour", "color"].includes(f.fieldKey);
                    return (
                      <div
                        key={f.fieldKey}
                        className={cn("grid min-w-0 gap-1.5", !half && "col-span-2")}
                      >
                        <DetailInput
                          field={f}
                          value={values[f.fieldKey]}
                          onChange={(v) => setValue(f.fieldKey, v)}
                          error={errorFor(f.fieldKey)}
                          isFuel={f === fuel}
                          unit={unit}
                          onUnit={(u) => {
                            touch();
                            const current = coerceFieldValue(f, values[f.fieldKey]);
                            if (
                              f.fieldKey === "mileage" &&
                              typeof current === "number" &&
                              u !== unit
                            ) {
                              setValues((prev) => ({
                                ...prev,
                                mileage: u === "km" ? toKm(current) : toMiles(current),
                              }));
                            }
                            setUnit(u);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            {condField || !isEdit ? (
              <Section title="Condition" note="Optional">
                {condField ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="vf-condition" className="sr-only">
                      {condField.label}
                    </Label>
                    <Textarea
                      id="vf-condition"
                      rows={3}
                      value={
                        values[condField.fieldKey] == null ? "" : String(values[condField.fieldKey])
                      }
                      maxLength={condField.constraints?.maxLength}
                      placeholder="Stone chips on the bonnet, light swirls on the driver's door…"
                      onChange={(e) => setValue(condField.fieldKey, e.target.value)}
                    />
                    <FieldError message={errorFor(condField.fieldKey)} />
                  </div>
                ) : null}
                {isEdit && editing ? (
                  hasPhotos ? (
                    <PhotosPanel record={editing} />
                  ) : null
                ) : hasPhotos === false ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-secondary px-2 text-[11px] font-extrabold">
                        <Lock className="size-3" /> Business
                      </span>
                      Photos are on the Business plan
                    </span>
                    {saasPurchasesAllowedInApp() ? (
                      <Link
                        to="/settings/$page"
                        params={{ page: "plan" }}
                        className="font-bold text-foreground hover:underline"
                      >
                        See plans
                      </Link>
                    ) : null}
                  </div>
                ) : hasPhotos ? (
                  <div className="grid gap-2">
                    <input
                      ref={photoInput}
                      type="file"
                      className="sr-only"
                      accept={IMAGE_ACCEPT}
                      multiple
                      onChange={(e) => {
                        pickPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => photoInput.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        pickPhotos(e.dataTransfer.files);
                      }}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground hover:bg-secondary/40"
                    >
                      <ImagePlus className="size-5" />
                      <span className="font-bold text-foreground">Add photos</span>
                      JPEG, PNG or WebP, up to 10 MB each
                    </button>
                    {photos.length > 0 ? (
                      <ul className="grid grid-cols-4 gap-2">
                        {photos.map((p, i) => (
                          <PendingPhoto
                            key={`${p.name}-${i}`}
                            file={p}
                            onRemove={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                          />
                        ))}
                      </ul>
                    ) : null}
                    <FieldError message={photoError ?? undefined} />
                  </div>
                ) : null}
              </Section>
            ) : null}

            <section className="rounded-xl bg-secondary/60 px-4 py-3">
              {renaming ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="vf-label" className="text-[13px] font-bold">
                    Shows on bookings as
                  </Label>
                  <Input
                    id="vf-label"
                    autoFocus
                    value={labelOverride ?? generated}
                    onChange={(e) => {
                      touch();
                      setLabelOverride(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setRenaming(false);
                      }
                    }}
                  />
                  <div className="flex gap-3 text-[13px] font-bold">
                    <button
                      type="button"
                      className="cursor-pointer"
                      onClick={() => setRenaming(false)}
                    >
                      Done
                    </button>
                    {labelOverride !== null ? (
                      <button
                        type="button"
                        className="cursor-pointer text-muted-foreground"
                        onClick={() => {
                          touch();
                          setLabelOverride(null);
                          setRenaming(false);
                        }}
                      >
                        Use automatic name
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    Shows on bookings as
                    {regField && normReg && labelOverride === null ? (
                      <>
                        <NumberPlate registration={reg} size="small" />
                        <span className="truncate font-bold text-foreground">
                          {vehicleTitle({ displayLabel: generated, values: allValues }, fields)}
                        </span>
                      </>
                    ) : (
                      <span className="truncate font-bold text-foreground">{label}</span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer text-[13px] font-bold text-primary"
                    onClick={() => setRenaming(true)}
                  >
                    Rename
                  </button>
                </div>
              )}
            </section>
          </form>

          <footer className="flex gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="max-sm:hidden"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            {!isEdit && allowBook ? (
              <Button
                type="button"
                variant="outline"
                className="max-sm:h-12 max-sm:flex-1"
                disabled={busy}
                onClick={() => void submit("book")}
              >
                {saving === "book" ? "Adding…" : "Add and book"}
              </Button>
            ) : null}
            <Button
              type="submit"
              form="vehicle-form"
              className="max-sm:h-12 max-sm:flex-1"
              disabled={busy}
            >
              {saving === "add"
                ? isEdit
                  ? "Saving…"
                  : "Adding…"
                : isEdit
                  ? "Save"
                  : (missing ?? `Add ${lower}`)}
            </Button>
          </footer>
        </SheetContent>
      </Sheet>

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what={isEdit ? "your changes" : `this ${lower}`}
        onDiscard={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />

      <AddClientDialog
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          touch();
          setOwner(c);
          setErrors((e) => ({ ...e, owner: "" }));
          setAddClientOpen(false);
        }}
      />
    </>
  );
}

const pluralise = (noun: string) => (noun.endsWith("s") ? noun : `${noun}s`);

function Section({
  title,
  note,
  required,
  children,
}: {
  title?: string;
  note?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      {title ? (
        <h3 className="text-[13px] font-extrabold">
          {title}
          {required ? <span className="text-destructive"> *</span> : null}
          {note ? <span className="ml-1.5 font-semibold text-muted-foreground">{note}</span> : null}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function OwnerCard({
  customer,
  vehicles,
  noun,
  onChange,
}: {
  customer: Customer;
  vehicles: number;
  noun: { singular: string; plural: string };
  onChange: () => void;
}) {
  const name = customerDisplayName(customer);
  const meta = [
    customer.emailDisplay,
    `${vehicles} ${vehicles === 1 ? noun.singular : noun.plural}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
          AVATAR_TINTS[avatarTintIndex(customer.id)],
        )}
      >
        {initials(name) || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 cursor-pointer text-[13px] font-bold text-primary"
      >
        Change
      </button>
    </div>
  );
}

function PendingPhoto({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="group relative aspect-square overflow-hidden rounded-lg border bg-secondary/40">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function DetailInput({
  field,
  value,
  onChange,
  error,
  isFuel,
  unit,
  onUnit,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  isFuel: boolean;
  unit: "miles" | "km";
  onUnit: (u: "miles" | "km") => void;
}) {
  const id = `vf-${field.fieldKey}`;
  const str = value == null ? "" : String(value);
  const labelEl = (
    <Label htmlFor={id} className="text-[13px] font-semibold">
      {field.fieldKey === "fuel_type" ? "Fuel" : field.label}
      {field.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );
  let control: ReactNode;

  if (field.dataType === "single_select") {
    const options = field.constraints?.options ?? [];
    const buttons = isFuel ? options.slice(0, 4) : options.length <= 4 ? options : [];
    const more = isFuel ? options.slice(4) : options.length <= 4 ? [] : options;
    if (buttons.length === 0) {
      control = (
        <Select value={str} onValueChange={onChange}>
          <SelectTrigger id={id} aria-invalid={Boolean(error) || undefined}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    } else {
      const moreSelected = more.some((o) => o.value === str);
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {buttons.map((o) => {
            const on = str === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(on ? "" : o.value)}
                className={cn(
                  "h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-secondary",
                )}
              >
                {o.label}
              </button>
            );
          })}
          {more.length > 0 ? (
            <Select value={moreSelected ? str : ""} onValueChange={onChange}>
              <SelectTrigger
                aria-label="More options"
                className={cn(
                  "h-9 w-auto rounded-full text-[13px] font-semibold",
                  moreSelected && "border-primary",
                )}
              >
                <SelectValue placeholder="More" />
              </SelectTrigger>
              <SelectContent>
                {more.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      );
      return (
        <>
          <span id={`${id}-label`} className="text-[13px] font-semibold">
            {field.fieldKey === "fuel_type" ? "Fuel" : field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </span>
          {control}
          <FieldError message={error} />
        </>
      );
    }
  } else if (field.dataType === "boolean") {
    control = <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />;
  } else if (field.dataType === "long_text") {
    control = (
      <Textarea
        id={id}
        value={str}
        maxLength={field.constraints?.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (field.fieldKey === "mileage") {
    control = (
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={str}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
        />
        <div role="radiogroup" aria-label="Distance unit" className="flex rounded-md border p-0.5">
          {(["miles", "km"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => onUnit(u)}
              className={cn(
                "cursor-pointer rounded px-2.5 text-[13px] font-semibold",
                unit === u ? "bg-secondary text-foreground" : "text-muted-foreground",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (field.fieldKey === "year") {
    control = (
      <Input
        id={id}
        inputMode="numeric"
        maxLength={4}
        placeholder="2018"
        value={str}
        aria-invalid={Boolean(error) || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    );
  } else {
    const type =
      field.dataType === "integer" || field.dataType === "decimal"
        ? "number"
        : field.dataType === "date"
          ? "date"
          : field.dataType === "datetime"
            ? "datetime-local"
            : field.dataType === "email"
              ? "email"
              : field.dataType === "url"
                ? "url"
                : "text";
    control = (
      <Input
        id={id}
        type={type}
        value={str}
        maxLength={field.constraints?.maxLength}
        min={field.constraints?.min}
        max={field.constraints?.max}
        aria-invalid={Boolean(error) || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <>
      {labelEl}
      {control}
      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      <FieldError message={error} />
    </>
  );
}
