import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Clock, Eye, EyeOff, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WeeklyWindowsEditor, type BusinessHoursPreset } from "@/components/WeeklyWindowsEditor";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useCreateService,
  useLocationsList,
  useServices,
  useStaffList,
  useUpdateService,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import {
  formatAvailabilityWindows,
  isValidAvailabilityWindow,
  windowsFromOpeningHours,
  type AvailabilityWindow,
} from "@/lib/availability-windows";
import { formatDuration, formatMoney, parseMoneyToMinor } from "@/lib/format";
import type { CatalogueService } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

/**
 * Catalogue noun from the business's terminology: "Session" for PT
 * ("Session type" minus the suffix), "Service" for car detailing. Keeps this
 * page from reading like a PT product to other trades.
 */
function serviceNoun(service: string) {
  const noun = service.replace(/\s+type$/i, "").trim() || "Service";
  const lower = noun.toLowerCase();
  const plural = lower.endsWith("s") ? noun : `${noun}s`;
  return { noun, lower, plural, pluralLower: plural.toLowerCase() };
}

/**
 * The API stores minutes, but a detailer thinks in "how long do I have the
 * car" — often days. These helpers translate both ways so the form can offer
 * minutes/hours/days without the backend knowing.
 */
type DurationUnit = "minutes" | "hours" | "days";
const UNIT_MINUTES: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function splitDuration(minutes: number): { value: string; unit: DurationUnit } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: String(minutes / 1440), unit: "days" };
  }
  if (minutes >= 60 && minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

const searchSchema = z.object({
  create: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/services")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Services — RECAVO" },
      {
        name: "description",
        content:
          "Manage bookable services: duration, price, capacity, assigned staff, locations and cancellation rules.",
      },
      { property: "og:title", content: "RECAVO Services" },
      {
        property: "og:description",
        content: "One-to-one, two-to-one and group services with full booking rules.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ServicesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function ServicesPage() {
  const tenant = useTenant();
  const { noun, lower, plural, pluralLower } = serviceNoun(tenant.terminology.service);
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const { create: openCreate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const updateService = useUpdateService();
  const [editing, setEditing] = useState<CatalogueService | null>(null);
  const [creating, setCreating] = useState(false);
  // New services default to the business's opening hours — the location picked
  // in the sidebar, else the first active one with hours set.
  const businessHours = useMemo<BusinessHoursPreset | undefined>(() => {
    const list = locations.data ?? [];
    const chosen =
      list.find((l) => l.id === tenant.currentLocationId && l.openingHours.length > 0) ??
      list.find((l) => l.active && l.openingHours.length > 0) ??
      list.find((l) => l.openingHours.length > 0);
    if (!chosen) return undefined;
    return { label: chosen.name, windows: windowsFromOpeningHours(chosen.openingHours) };
  }, [locations.data, tenant.currentLocationId]);

  useEffect(() => {
    if (!openCreate) return;
    setCreating(true);
    void navigate({ search: { create: undefined }, replace: true });
  }, [openCreate, navigate]);

  useEffect(() => {
    if (!editing) return;
    const fresh = (services.data ?? []).find((s) => s.id === editing.id);
    if (fresh && fresh.version !== editing.version) setEditing(fresh);
  }, [services.data, editing]);

  return (
    <>
      <PageHeader
        title={plural}
        description="What clients can book, how long it takes and what it costs."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create {lower}
          </Button>
        }
      />

      {services.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="surface-card h-[280px] animate-pulse" />
          ))}
        </div>
      ) : services.isError ? (
        <EmptyState
          title={`Couldn't load ${pluralLower}`}
          description={
            services.error instanceof ApiError
              ? services.error.detail || services.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => services.refetch()}>Try again</Button>}
        />
      ) : (services.data ?? []).length === 0 ? (
        <EmptyState
          title={`No ${pluralLower} yet`}
          description={`Create your first bookable ${lower} to start taking bookings.`}
          action={<Button onClick={() => setCreating(true)}>Create {lower}</Button>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(services.data ?? []).map((s) => (
            <article key={s.id} className="surface-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.colour ?? "var(--color-chart-2)" }}
                />
                <div className="flex items-center gap-2">
                  {s.publicVisible ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3.5" /> Public
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <EyeOff className="size-3.5" /> Hidden from booking page
                    </span>
                  )}
                  <StatusBadge status={s.active ? "active" : "inactive"} />
                </div>
              </div>
              <h2 className="mt-3 text-lg font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />
                  {formatDuration(s.durationMinutes)}
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {formatMoney(s.basePriceMinor, s.currency)}
                  {s.capacityMax > 1 ? " pp" : ""}
                </span>
                {isDetailing && s.capacityMax === 1 ? null : (
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4 text-muted-foreground" />
                    {s.capacityMax} {s.capacityMax === 1 ? "place" : "places"}
                  </span>
                )}
              </div>

              {s.variants.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {s.variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between">
                      <span>{v.name}</span>
                      <span className="tabular-nums">
                        {v.durationMinutes ? formatDuration(v.durationMinutes) : "—"} ·{" "}
                        {v.priceMinor != null ? formatMoney(v.priceMinor, s.currency) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <dl className="mt-4 space-y-2 border-t pt-4 text-xs">
                <Row
                  label={
                    tenant.terminology.staff.toLowerCase().endsWith("s")
                      ? tenant.terminology.staff
                      : `${tenant.terminology.staff}s`
                  }
                  value={
                    s.eligibleStaffIds
                      .map((id) => staff.data?.find((m) => m.id === id)?.displayName)
                      .filter(Boolean)
                      .join(", ") || "Any"
                  }
                />
                <Row
                  label="Locations"
                  value={
                    s.locationIds
                      .map((id) => locations.data?.find((l) => l.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "All"
                  }
                />
                <Row
                  label="Booking notice"
                  value={`${Math.round(s.bookingNoticeMinutes / 60)} hours`}
                />
                <Row label="Cancellation" value={`${s.cancellationPolicy.windowHours} hours`} />
                <Row
                  label="Buffer"
                  value={`${s.bufferBeforeMinutes + s.bufferAfterMinutes} minutes`}
                />
                <Row label="Offered" value={formatAvailabilityWindows(s.availabilityWindows)} />
              </dl>

              <div className="mt-5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={s.active}
                    disabled={updateService.isPending}
                    onCheckedChange={(v) => {
                      updateService.mutate(
                        {
                          serviceId: s.id,
                          version: s.version,
                          body: { active: v, depositMinor: 0 },
                        },
                        {
                          onSuccess: () =>
                            toast.success(v ? `${noun} activated` : `${noun} paused`),
                        },
                      );
                    }}
                  />
                  {s.active ? "Bookable" : "Hidden"}
                </span>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                  Edit {lower}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ServiceDialog
        open={creating || editing !== null}
        service={editing}
        businessHours={businessHours}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

type VariantRow = {
  id?: string;
  name: string;
  /** Number in `durationUnit`, not necessarily minutes — converted on submit. */
  durationValue: string;
  durationUnit: DurationUnit;
  priceMinor: string;
};

function toVariantRows(service: CatalogueService | null, useUnits: boolean): VariantRow[] {
  if (!service) return [];
  return service.variants.map((v) => {
    const split = v.durationMinutes != null ? splitDuration(v.durationMinutes) : null;
    return {
      id: v.id,
      name: v.name,
      durationValue: useUnits
        ? (split?.value ?? "")
        : v.durationMinutes != null
          ? String(v.durationMinutes)
          : "",
      durationUnit: useUnits ? (split?.unit ?? "minutes") : "minutes",
      priceMinor: v.priceMinor != null ? (v.priceMinor / 100).toFixed(2) : "",
    };
  });
}

function ServiceDialog({
  open,
  service,
  businessHours,
  onClose,
}: {
  open: boolean;
  service: CatalogueService | null;
  businessHours?: BusinessHoursPreset;
  onClose: () => void;
}) {
  const tenant = useTenant();
  const { noun, lower } = serviceNoun(tenant.terminology.service);
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  // Example names must read like the user's trade, not like a PT product.
  const namePlaceholder = isDetailing ? "Maintenance wash" : "1-to-1 Personal Training";
  const createService = useCreateService();
  const updateService = useUpdateService();
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(String(service ? service.basePriceMinor / 100 : 50));
  // Detailers state how long they keep the vehicle ("2 days"); the split keeps
  // the stored minutes editable in whichever unit reads naturally.
  const initialDuration = splitDuration(service?.durationMinutes ?? 60);
  const [duration, setDuration] = useState(
    isDetailing ? initialDuration.value : String(service?.durationMinutes ?? 60),
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    isDetailing ? initialDuration.unit : "minutes",
  );
  const [capacity, setCapacity] = useState(String(service?.capacityMax ?? 1));
  const [description, setDescription] = useState(service?.description ?? "");
  const [active, setActive] = useState(service?.active ?? true);
  const [publicVisible, setPublicVisible] = useState(service?.publicVisible ?? true);
  const [variants, setVariants] = useState<VariantRow[]>(() => toVariantRows(service, isDetailing));
  // Creating: start from the business's opening hours so the offer matches the
  // door hours without retyping them. Editing: whatever is saved.
  const defaultWindows = (s: CatalogueService | null) =>
    s ? [...s.availabilityWindows] : [...(businessHours?.windows ?? [])];
  const [windows, setWindows] = useState<AvailabilityWindow[]>(() => defaultWindows(service));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = createService.isPending || updateService.isPending;

  const resetFrom = (s: CatalogueService | null) => {
    setName(s?.name ?? "");
    setPrice(String(s ? s.basePriceMinor / 100 : 50));
    const split = splitDuration(s?.durationMinutes ?? 60);
    setDuration(isDetailing ? split.value : String(s?.durationMinutes ?? 60));
    setDurationUnit(isDetailing ? split.unit : "minutes");
    setCapacity(String(s?.capacityMax ?? 1));
    setDescription(s?.description ?? "");
    setActive(s?.active ?? true);
    setPublicVisible(s?.publicVisible ?? true);
    setVariants(toVariantRows(s, isDetailing));
    setWindows(defaultWindows(s));
    setFieldErrors({});
  };

  // Radix only reports open changes it initiates itself, so a dialog opened by the
  // parent flipping `open` never re-seeded its fields — every edit showed the create
  // defaults, or whatever the previous edit left behind. Rehydrate on version too so
  // a 409 reload replaces stale If-Match and windows.
  useEffect(() => {
    if (open) resetFrom(service);
    // resetFrom closes over fresh setters each render; the service is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, service?.version]);

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeVariant = (index: number) => {
    setVariants((rows) => rows.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(`Give the ${lower} a name`);
      throw new Error("validation");
    }

    let basePriceMinor: number;
    try {
      basePriceMinor = parseMoneyToMinor(price);
    } catch {
      setFieldErrors((prev) => ({ ...prev, basePriceMinor: "Enter a valid price" }));
      toast.error("Enter a valid price");
      throw new Error("validation");
    }

    const durationMinutes = Math.round((Number(duration) || 0) * UNIT_MINUTES[durationUnit]) || 60;
    // Detailing jobs are one vehicle at a time; the field is hidden, so keep
    // whatever the record already has rather than inventing a new value.
    const capacityMax = isDetailing ? (service?.capacityMax ?? 1) : Number(capacity) || 1;

    if (windows.some((w) => !isValidAvailabilityWindow(w))) {
      setFieldErrors((prev) => ({
        ...prev,
        availabilityWindows: "Each window needs a start time before its end.",
      }));
      toast.error(`Check the ${lower} offer windows`);
      throw new Error("validation");
    }

    // depositMinor is offline/manual-only and the API rejects values > 0
    // (TOO_BIG on create, UNSUPPORTED on update) until online deposit
    // capture ships — always send 0.
    const variantsPayload = variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        durationMinutes: v.durationValue.trim()
          ? Math.round(Number(v.durationValue) * UNIT_MINUTES[v.durationUnit]) || null
          : null,
        priceMinor: v.priceMinor.trim() ? parseMoneyToMinor(v.priceMinor) : null,
      }));

    const body: Record<string, unknown> = {
      name,
      description: description || null,
      durationMinutes,
      basePriceMinor,
      capacityMax,
      active,
      publicVisible,
      depositMinor: 0,
      variants: variantsPayload,
      availabilityWindows: windows,
    };

    setFieldErrors({});
    try {
      if (service) {
        await updateService.mutateAsync({
          serviceId: service.id,
          version: service.version,
          body,
        });
        toast.success(`${noun} updated`);
      } else {
        await createService.mutateAsync({ ...body, currency: "GBP", capacityMin: 1 });
        toast.success(`${noun} created`);
      }
    } catch (err) {
      // The mutation hooks already toast the error. On 409, the services list is
      // refetched and this dialog rehydrates from the fresh version.
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ),
        }));
      }
      throw err;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{service ? `Edit ${lower}` : `Create ${lower}`}</DialogTitle>
          <DialogDescription>
            Set pricing, capacity and the booking rules clients see on your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className={cn("grid gap-4", isDetailing ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            <div className="grid gap-2">
              <Label htmlFor="s-dur">
                {isDetailing ? "How long you'll have the vehicle" : "Duration (min)"}
              </Label>
              {isDetailing ? (
                <div className="flex gap-2">
                  <Input
                    id="s-dur"
                    inputMode="numeric"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.durationMinutes)}
                    className="flex-1"
                  />
                  <Select
                    value={durationUnit}
                    onValueChange={(v) => setDurationUnit(v as DurationUnit)}
                  >
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutes</SelectItem>
                      <SelectItem value="hours">hours</SelectItem>
                      <SelectItem value="days">days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Input
                  id="s-dur"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.durationMinutes)}
                />
              )}
              {fieldErrors.durationMinutes ? (
                <p className="text-xs text-destructive">{fieldErrors.durationMinutes}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-price">Price (£)</Label>
              <Input
                id="s-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={Boolean(fieldErrors.basePriceMinor)}
              />
              {fieldErrors.basePriceMinor ? (
                <p className="text-xs text-destructive">{fieldErrors.basePriceMinor}</p>
              ) : null}
            </div>
            {isDetailing ? null : (
              <div className="grid gap-2">
                <Label htmlFor="s-cap">Max capacity</Label>
                <Input
                  id="s-cap"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.capacityMax)}
                />
                {fieldErrors.capacityMax ? (
                  <p className="text-xs text-destructive">{fieldErrors.capacityMax}</p>
                ) : null}
              </div>
            )}
          </div>
          {fieldErrors.depositMinor ? (
            <p className="text-xs text-destructive">
              Deposit: {fieldErrors.depositMinor} — online deposits aren't supported yet, so
              deposits are always kept at £0.
            </p>
          ) : null}

          <div className="grid gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVariants((rows) => [
                    ...rows,
                    {
                      name: "",
                      durationValue: "",
                      durationUnit: isDetailing ? durationUnit : "minutes",
                      priceMinor: "",
                    },
                  ])
                }
              >
                <Plus className="size-3.5" /> Add variant
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isDetailing
                ? 'Optional named options (e.g. "Large vehicle / SUV"). Leave duration or price blank to fall back to the service default.'
                : 'Optional named options (e.g. "60 min" / "90 min"). Leave duration or price blank to fall back to the service default.'}
            </p>
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variants — this service books as-is.
              </p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input
                        value={v.name}
                        onChange={(e) => updateVariant(i, { name: e.target.value })}
                        placeholder={isDetailing ? "Large vehicle / SUV" : "60 minutes"}
                      />
                    </div>
                    {isDetailing ? (
                      <>
                        <div className="grid w-20 gap-1">
                          <Label className="text-xs text-muted-foreground">Duration</Label>
                          <Input
                            inputMode="numeric"
                            value={v.durationValue}
                            onChange={(e) => updateVariant(i, { durationValue: e.target.value })}
                            placeholder={duration}
                          />
                        </div>
                        <div className="grid w-28 gap-1">
                          <Label className="text-xs text-muted-foreground">Unit</Label>
                          <Select
                            value={v.durationUnit}
                            onValueChange={(unit) =>
                              updateVariant(i, { durationUnit: unit as DurationUnit })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">minutes</SelectItem>
                              <SelectItem value="hours">hours</SelectItem>
                              <SelectItem value="days">days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <div className="grid w-24 gap-1">
                        <Label className="text-xs text-muted-foreground">Duration (min)</Label>
                        <Input
                          value={v.durationValue}
                          onChange={(e) => updateVariant(i, { durationValue: e.target.value })}
                          placeholder={duration}
                        />
                      </div>
                    )}
                    <div className="grid w-24 gap-1">
                      <Label className="text-xs text-muted-foreground">Price (£)</Label>
                      <Input
                        value={v.priceMinor}
                        onChange={(e) => updateVariant(i, { priceMinor: e.target.value })}
                        placeholder={price}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariant(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <WeeklyWindowsEditor
            windows={windows}
            onChange={setWindows}
            error={fieldErrors.availabilityWindows}
            businessHours={businessHours}
          />

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Allow new bookings for this service</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Public</p>
                <p className="text-xs text-muted-foreground">Show on the public booking page</p>
              </div>
              <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              try {
                await handleSubmit();
                onClose();
              } catch {
                // Errors are surfaced via toast/inline field messages above.
              }
            }}
          >
            {submitting ? "Saving…" : service ? "Save changes" : `Create ${lower}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
