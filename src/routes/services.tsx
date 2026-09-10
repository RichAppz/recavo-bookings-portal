import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Check, Clock, Eye, EyeOff, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  groupByCategory,
  hasCategories,
  knownCategories,
  normaliseCategory,
} from "@/lib/service-categories";
import { cn } from "@/lib/utils";
import { WeeklyWindowsEditor, type BusinessHoursPreset } from "@/components/WeeklyWindowsEditor";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useCreateService,
  useDeleteService,
  useLocationsList,
  useServices,
  useStaffList,
  useUpdateService,
  useUpdateStaff,
} from "@/lib/api/hooks";
import { DeleteOrFallbackDialog } from "@/components/DeleteOrFallbackDialog";
import { PackageLinksCard } from "@/components/PackageLinksCard";
import { ApiError } from "@/lib/api";
import {
  formatAvailabilityWindows,
  isValidAvailabilityWindow,
  windowsFromOpeningHours,
  type AvailabilityWindow,
} from "@/lib/availability-windows";
import { formatDuration, formatMoney, parseMoneyToMinor } from "@/lib/format";
import type { CatalogueService, Staff } from "@/lib/api/types";
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

/**
 * Preset swatches for the calendar dot. Chosen to stay distinguishable from each
 * other and from the payment colours the calendar chips already use (teal,
 * green, amber, red), so a service dot never reads as a payment state.
 */
const SERVICE_COLOURS = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#0891b2", // cyan
  "#ea580c", // orange
  "#4d7c0f", // olive
  "#78350f", // brown
  "#475569", // slate
];

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function splitDuration(minutes: number): { value: string; unit: DurationUnit } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: String(minutes / 1440), unit: "days" };
  }
  if (minutes >= 60 && minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

/** Deposit input shows blank for "no deposit" so the field reads as optional. */
function depositToInput(minor: number | null | undefined): string {
  return minor && minor > 0 ? String(minor / 100) : "";
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
  const deleteService = useDeleteService();
  const [editing, setEditing] = useState<CatalogueService | null>(null);
  const [deleting, setDeleting] = useState<CatalogueService | null>(null);
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
        <div className="space-y-8">
          {groupByCategory(services.data ?? []).map((group) => (
            <section key={group.category ?? "__none"} className="space-y-3">
              {/* Headings only once categories are in use; a flat catalogue stays flat. */}
              {hasCategories(services.data ?? []) ? (
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.category ?? "Other"}
                  <span className="ml-2 font-normal tabular-nums normal-case">
                    {group.items.length}
                  </span>
                </h2>
              ) : null}
              <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((s) => (
                  <article key={s.id} className="surface-card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="size-2.5 rounded-full"
                        // Same fallback as the calendar dot, so the card matches what staff see there.
                        style={{ backgroundColor: s.colour ?? "var(--color-chart-1)" }}
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
                      {s.depositMinor && s.depositMinor > 0 ? (
                        <span className="text-muted-foreground">
                          {formatMoney(s.depositMinor, s.currency)} deposit
                        </span>
                      ) : null}
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
                        value={describeDeliverers(s, staff.data ?? [])}
                      />
                      {(locations.data ?? []).length > 1 ? (
                        <Row
                          label="Locations"
                          value={
                            s.locationIds
                              .map((id) => locations.data?.find((l) => l.id === id)?.name)
                              .filter(Boolean)
                              .join(", ") || "All"
                          }
                        />
                      ) : null}
                      <Row
                        label="Booking notice"
                        value={`${Math.round(s.bookingNoticeMinutes / 60)} hours`}
                      />
                      <Row
                        label="Cancellation"
                        value={`${s.cancellationPolicy.windowHours} hours`}
                      />
                      <Row
                        label="Buffer"
                        value={`${s.bufferBeforeMinutes + s.bufferAfterMinutes} minutes`}
                      />
                      <Row
                        label="Offered"
                        value={formatAvailabilityWindows(s.availabilityWindows)}
                      />
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
                                body: { active: v },
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${lower}`}
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                          Edit {lower}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tenant.business ? <PackageLinksCard slug={tenant.business.slug} /> : null}

      <ServiceDialog
        open={creating || editing !== null}
        service={editing}
        businessHours={businessHours}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <DeleteOrFallbackDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        copy={(s) => ({
          title: `Delete ${s.name}?`,
          description: `This permanently removes the ${lower} from your catalogue. It can't be undone.`,
          inUseTitle: `Pause this ${lower} instead?`,
          inUseDescription: `This ${lower} has bookings against it, so it can't be deleted without losing that history. Pausing hides it from your booking page and pickers while past bookings keep their details.`,
          fallbackLabel: "Pause",
        })}
        onDelete={async (s) => {
          await deleteService.mutateAsync(s.id);
          toast.success(`${noun} deleted`);
        }}
        onFallback={async (s) => {
          await updateService.mutateAsync({
            serviceId: s.id,
            version: s.version,
            body: { active: false },
          });
          toast.success(`${noun} paused`);
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
  const { noun, lower, pluralLower } = serviceNoun(tenant.terminology.service);
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  // Example names must read like the user's trade, not like a PT product.
  const namePlaceholder = isDetailing ? "Maintenance wash" : "1-to-1 Personal Training";
  const createService = useCreateService();
  const updateService = useUpdateService();
  const updateStaff = useUpdateStaff();
  const staffList = useStaffList();
  const activeStaff = useMemo(
    () => (staffList.data ?? []).filter((m) => m.status !== "suspended"),
    [staffList.data],
  );
  const [name, setName] = useState(service?.name ?? "");
  // Who delivers it. Empty `eligibleStaffIds` on the API means everyone, which is
  // the default — owners shouldn't have to visit each staff record to switch a
  // new service on.
  const [staffMode, setStaffMode] = useState<"all" | "selected">(
    service && service.eligibleStaffIds.length > 0 ? "selected" : "all",
  );
  const [staffIds, setStaffIds] = useState<string[]>(service?.eligibleStaffIds ?? []);
  const staffPluralLower = (() => {
    const t = tenant.terminology.staff.trim().toLowerCase() || "staff member";
    return t.endsWith("s") ? t : `${t}s`;
  })();
  const reconcileNames = useMemo(
    () =>
      staffNeedingReconcile(
        service?.id ?? null,
        staffMode === "selected" ? staffIds : [],
        activeStaff,
      ).map((m) => m.displayName),
    [service?.id, staffMode, staffIds, activeStaff],
  );
  const [price, setPrice] = useState(String(service ? service.basePriceMinor / 100 : 50));
  const [deposit, setDeposit] = useState(depositToInput(service?.depositMinor));
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
  // Free text, but the categories already in use are offered as one-tap chips so
  // "Polishing" is spelt the same way on every service and groups cleanly.
  const [category, setCategory] = useState(service?.category ?? "");
  const catalogue = useServices();
  const categorySuggestions = useMemo(
    () => knownCategories(catalogue.data ?? []),
    [catalogue.data],
  );
  const [active, setActive] = useState(service?.active ?? true);
  const [publicVisible, setPublicVisible] = useState(service?.publicVisible ?? true);
  // Calendar swatch; null = "no colour", which renders the theme default.
  const [colour, setColour] = useState<string | null>(service?.colour ?? null);
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
    setStaffMode(s && s.eligibleStaffIds.length > 0 ? "selected" : "all");
    setStaffIds(s?.eligibleStaffIds ?? []);
    setPrice(String(s ? s.basePriceMinor / 100 : 50));
    setDeposit(depositToInput(s?.depositMinor));
    const split = splitDuration(s?.durationMinutes ?? 60);
    setDuration(isDetailing ? split.value : String(s?.durationMinutes ?? 60));
    setDurationUnit(isDetailing ? split.unit : "minutes");
    setCapacity(String(s?.capacityMax ?? 1));
    setDescription(s?.description ?? "");
    setCategory(s?.category ?? "");
    setActive(s?.active ?? true);
    setPublicVisible(s?.publicVisible ?? true);
    setColour(s?.colour ?? null);
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

    // Deposit: what the customer pays to secure the booking; the balance is
    // collected later. Blank/0 = pay in full. A deposit at or above the price is
    // just "pay in full" too, so refuse it here rather than storing a confusing one.
    let depositMinor = 0;
    if (deposit.trim()) {
      try {
        depositMinor = parseMoneyToMinor(deposit);
      } catch {
        setFieldErrors((prev) => ({ ...prev, depositMinor: "Enter a valid deposit" }));
        toast.error("Enter a valid deposit");
        throw new Error("validation");
      }
      if (depositMinor >= basePriceMinor) {
        setFieldErrors((prev) => ({
          ...prev,
          depositMinor:
            "The deposit must be less than the price — leave blank to take full payment.",
        }));
        toast.error("Deposit must be less than the price");
        throw new Error("validation");
      }
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

    const eligibleStaffIds = staffMode === "selected" ? staffIds : [];
    if (staffMode === "selected" && staffIds.length === 0) {
      setFieldErrors((prev) => ({ ...prev, eligibleStaffIds: "Pick at least one person." }));
      toast.error(`Choose who delivers this ${lower}`);
      throw new Error("validation");
    }

    const body: Record<string, unknown> = {
      name,
      eligibleStaffIds,
      description: description || null,
      category: normaliseCategory(category),
      durationMinutes,
      basePriceMinor,
      capacityMax,
      active,
      publicVisible,
      colour,
      depositMinor,
      variants: variantsPayload,
      availabilityWindows: windows,
    };

    setFieldErrors({});
    try {
      let saved: CatalogueService;
      if (service) {
        saved = await updateService.mutateAsync({
          serviceId: service.id,
          version: service.version,
          body,
        });
        toast.success(`${noun} updated`);
      } else {
        saved = await createService.mutateAsync({ ...body, currency: "GBP", capacityMin: 1 });
        toast.success(`${noun} created`);
      }
      // A staff record with its own service list would silently veto this service
      // even though it was just assigned to them here. Bring those lists into line
      // so this dialog is the one place that decides who delivers what.
      const toReconcile = staffNeedingReconcile(saved.id, eligibleStaffIds, activeStaff);
      if (toReconcile.length > 0) {
        const results = await Promise.allSettled(
          toReconcile.map((m) =>
            updateStaff.mutateAsync({
              staffId: m.id,
              version: m.version,
              body: { eligibleServiceIds: [...m.eligibleServiceIds, saved.id] },
            }),
          ),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.warning(
            `${failed} staff record${failed === 1 ? "" : "s"} couldn't be updated — check their services list.`,
          );
        }
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
          <div className="grid gap-2">
            <Label htmlFor="s-category">Category (optional)</Label>
            <Input
              id="s-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={isDetailing ? "Polishing" : "Classes"}
              list="s-category-options"
              autoComplete="off"
            />
            <datalist id="s-category-options">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {categorySuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categorySuggestions.map((c) => {
                  const on = normaliseCategory(category)?.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(on ? "" : c)}
                      aria-pressed={on}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        on
                          ? "border-primary bg-primary-soft text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Groups {pluralLower} on your booking page and in the calendar filter — e.g. all your
              polishing work under one heading.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-colour">Calendar colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SERVICE_COLOURS.map((hex) => {
                const selected = colour?.toLowerCase() === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColour(hex)}
                    aria-label={`Use colour ${hex}`}
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/50",
                      selected && "ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: hex }}
                  >
                    {selected ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
                  </button>
                );
              })}
              {/* Anything off-palette: the native picker, shown as one more swatch. */}
              <label
                className={cn(
                  "relative inline-flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-input ring-offset-2 ring-offset-background hover:ring-2 hover:ring-ring/50",
                  colour && !SERVICE_COLOURS.includes(colour.toLowerCase()) && "ring-2 ring-ring",
                )}
                style={
                  colour && !SERVICE_COLOURS.includes(colour.toLowerCase())
                    ? { backgroundColor: colour, borderStyle: "solid" }
                    : undefined
                }
                title="Custom colour"
              >
                <input
                  id="s-colour"
                  type="color"
                  value={colour && HEX_COLOUR.test(colour) ? colour : "#2563eb"}
                  onChange={(e) => setColour(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Custom colour"
                />
                {!colour || SERVICE_COLOURS.includes(colour.toLowerCase()) ? (
                  <Plus className="pointer-events-none size-3.5 text-muted-foreground" />
                ) : null}
              </label>
              {colour ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setColour(null)}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Marks this {lower} on the calendar and legend. Payment status sets the chip colour;
              this is the dot.
            </p>
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
          <div className="grid gap-2">
            <Label htmlFor="s-deposit">Deposit to book (£)</Label>
            <Input
              id="s-deposit"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              aria-invalid={Boolean(fieldErrors.depositMinor)}
            />
            <p className="text-xs text-muted-foreground">
              {deposit.trim() && Number(deposit) > 0
                ? `Customers pay £${deposit.trim()} to secure the booking and the balance later. Leave blank to take the full price up front.`
                : "Optional. Take part of the price now to secure the booking and collect the rest on the day."}
            </p>
            {fieldErrors.depositMinor ? (
              <p className="text-xs text-destructive">{fieldErrors.depositMinor}</p>
            ) : null}
          </div>

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

          <div className="grid gap-3 border-t pt-4">
            <Label>Who delivers this {lower}</Label>
            <RadioGroup
              value={staffMode}
              onValueChange={(v) => setStaffMode(v as "all" | "selected")}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                  staffMode === "all" && "border-primary/40 bg-primary-soft/40",
                )}
              >
                <RadioGroupItem value="all" className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">All {staffPluralLower}</span>
                  <span className="text-xs text-muted-foreground">
                    Anyone on the team, including people you add later.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                  staffMode === "selected" && "border-primary/40 bg-primary-soft/40",
                )}
              >
                <RadioGroupItem value="selected" className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">Only certain people</span>
                  <span className="text-xs text-muted-foreground">
                    Pick who can be booked for it.
                  </span>
                </span>
              </label>
            </RadioGroup>
            {staffMode === "selected" ? (
              activeStaff.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No {staffPluralLower} yet — add your team first.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeStaff.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={staffIds.includes(m.id)}
                        onCheckedChange={(checked) =>
                          setStaffIds((ids) =>
                            checked ? [...ids, m.id] : ids.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.displayName}
                    </label>
                  ))}
                </div>
              )
            ) : null}
            {fieldErrors.eligibleStaffIds ? (
              <p className="text-xs text-destructive">{fieldErrors.eligibleStaffIds}</p>
            ) : null}
            {reconcileNames.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {reconcileNames.join(", ")} {reconcileNames.length === 1 ? "has" : "have"} a
                restricted services list — saving will add this {lower} to it.
              </p>
            ) : null}
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

/**
 * Staff who are meant to deliver a service (everyone when `eligibleStaffIds` is
 * empty) but whose own `eligibleServiceIds` list is restricted and misses it. With
 * a null service id (creating) we can only report who *will* need the update.
 */
function staffNeedingReconcile(
  serviceId: string | null,
  eligibleStaffIds: readonly string[],
  staff: readonly Staff[],
): Staff[] {
  return staff.filter(
    (m) =>
      (eligibleStaffIds.length === 0 || eligibleStaffIds.includes(m.id)) &&
      m.eligibleServiceIds.length > 0 &&
      (serviceId === null || !m.eligibleServiceIds.includes(serviceId)),
  );
}

/** Who can actually be booked for a service once both sides' restrictions apply. */
function describeDeliverers(service: CatalogueService, staff: readonly Staff[]): string {
  const active = staff.filter((m) => m.status === "active");
  if (active.length === 0) return service.eligibleStaffIds.length === 0 ? "All staff" : "—";
  const can = active.filter(
    (m) =>
      (service.eligibleStaffIds.length === 0 || service.eligibleStaffIds.includes(m.id)) &&
      (m.eligibleServiceIds.length === 0 || m.eligibleServiceIds.includes(service.id)),
  );
  if (can.length === 0) return "Nobody yet";
  if (can.length === active.length && service.eligibleStaffIds.length === 0) return "All staff";
  return can.map((m) => m.displayName).join(", ");
}
