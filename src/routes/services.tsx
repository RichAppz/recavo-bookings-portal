import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  Archive,
  BellRing,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
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
import { useAuth } from "@/lib/auth/auth-store";
import {
  useConsumables,
  useCreateService,
  useDeleteService,
  useLocationsList,
  useServiceConsumables,
  useServices,
  useServicesConsumables,
  useStaffList,
  useResources,
  useUpdateService,
  useUpdateStaff,
} from "@/lib/api/hooks";
import { ServiceConsumablesEditor } from "@/components/consumables/ServiceConsumablesEditor";
import { useConsumablesOn } from "@/components/consumables/use-consumables-on";
import {
  estimateMaterialsCost,
  rowsFromLines,
  rowsToItems,
  type UsageRow,
} from "@/lib/consumables";
import { PERMISSIONS } from "@/lib/permissions";
import { UpsellEditor } from "@/components/UpsellEditor";
import { rowsFromUpsells, rowsToUpsellItems, type UpsellRow } from "@/lib/upsells";
import { UpsellsUpgradeDialog } from "@/components/UpsellsUpgradeDialog";
import {
  isFeatureNotAvailable,
  useReplaceServiceUpsells,
  useServiceUpsells,
  useUpsellsEntitled,
} from "@/lib/api/upsells";
import { FollowUpRuleEditor, type FollowUpRuleError } from "@/components/FollowUpRuleEditor";
import {
  draftsFromRules,
  followUpRulesSummary,
  rulesFromDrafts,
  type FollowUpRuleDraft,
} from "@/lib/follow-ups";
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
import {
  sameWorkingHours,
  windowsToWorkingRules,
  workingRulesToWindows,
} from "@/lib/working-hours";
import { UNIT_MINUTES, splitDuration, type DurationUnit } from "@/lib/quick-add-service";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { resourceWords } from "@/lib/locations";
import type { CatalogueService, Staff } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { remindersAvailable } from "@/lib/service-reminders";
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
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  // No offer windows on a one-person business means "whenever they're free",
  // which tells them nothing — the row is left off. With windows set it still
  // shows the days and times.
  const offeredLabel = (s: CatalogueService): string | null => {
    if (soleStaff && s.availabilityWindows.length === 0) return null;
    return formatAvailabilityWindows(s.availabilityWindows);
  };
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  // "N consumables" on each card: the catalogue rows carry the services they're on,
  // so one request covers every card. Detailing only; nothing is fetched otherwise.
  const consumablesOn = useConsumablesOn();
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const consumables = useConsumables({ enabled: consumablesOn });
  const consumableCountByService = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of consumables.data ?? []) {
      for (const id of c.serviceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [consumables.data]);
  // "about £12 a job" needs each service's default quantities; only services that
  // have any are fetched, and only for staff who can see money.
  const costedServiceIds = useMemo(
    () => (canMoney ? [...consumableCountByService.keys()].sort() : []),
    [canMoney, consumableCountByService],
  );
  const serviceDefaults = useServicesConsumables(costedServiceIds, { enabled: consumablesOn });
  const materialsByService = new Map<string, number | null>(
    costedServiceIds.map((id, i) => [id, estimateMaterialsCost(serviceDefaults[i]?.data ?? [])]),
  );
  const [editing, setEditing] = useState<CatalogueService | null>(null);
  const [deleting, setDeleting] = useState<CatalogueService | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const allServices = services.data ?? [];
  const listed = allServices.filter((s) => !s.archivedAt);
  const archived = allServices.filter((s) => s.archivedAt);
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
      ) : allServices.length === 0 ? (
        <EmptyState
          title={`No ${pluralLower} yet`}
          description={`Create your first bookable ${lower} to start taking bookings.`}
          action={<Button onClick={() => setCreating(true)}>Create {lower}</Button>}
        />
      ) : (
        <div className="space-y-8">
          {listed.length === 0 ? (
            <EmptyState
              title={`No ${pluralLower} in use`}
              description={`Every ${lower} is archived. Create one, or restore one below.`}
              action={<Button onClick={() => setCreating(true)}>Create {lower}</Button>}
            />
          ) : null}
          {groupByCategory(listed).map((group) => (
            <section key={group.category ?? "__none"} className="space-y-3">
              {/* Headings only once categories are in use; a flat catalogue stays flat. */}
              {hasCategories(listed) ? (
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.category ?? "Other"}
                  <span className="ml-2 font-normal tabular-nums normal-case">
                    {group.items.length}
                  </span>
                </h2>
              ) : null}
              <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((s) => {
                  const offered = offeredLabel(s);
                  const reminderRules = Array.isArray(s.followUps) ? s.followUps : [];
                  return (
                    <article key={s.id} className="surface-card flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
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
                        {consumablesOn && (consumableCountByService.get(s.id) ?? 0) > 0 ? (
                          <span
                            className="flex items-center gap-1.5 text-muted-foreground"
                            title="Materials this service uses by default. For your records only."
                          >
                            <Package className="size-4" />
                            {consumableCountByService.get(s.id)}{" "}
                            {consumableCountByService.get(s.id) === 1
                              ? "consumable"
                              : "consumables"}
                            {materialsByService.get(s.id) != null
                              ? ` · about ${formatMoney(materialsByService.get(s.id)!, s.currency, { compact: true })} a job`
                              : ""}
                          </span>
                        ) : null}
                        {reminderRules.length > 0 ? (
                          <span
                            className="flex items-center gap-1.5 text-muted-foreground"
                            title={
                              reminderRules.length === 1
                                ? `Clients (and you) are reminded ${reminderRules[0]!.leadDays} days before it is due again`
                                : `${reminderRules.length} reminders: clients (and you) are told before each is due`
                            }
                          >
                            <BellRing className="size-4" />
                            {followUpRulesSummary(reminderRules)}
                          </span>
                        ) : null}
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
                        {/* One person / one place: the rows would only ever say "All". */}
                        {soleStaff ? null : (
                          <Row
                            label={
                              tenant.terminology.staff.toLowerCase().endsWith("s")
                                ? tenant.terminology.staff
                                : `${tenant.terminology.staff}s`
                            }
                            value={describeDeliverers(s, staff.data ?? [])}
                          />
                        )}
                        {soleLocation ? null : (
                          <Row
                            label="Locations"
                            value={
                              s.locationIds
                                .map((id) => locations.data?.find((l) => l.id === id)?.name)
                                .filter(Boolean)
                                .join(", ") || "All"
                            }
                          />
                        )}
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
                          value={formatDuration(s.bufferBeforeMinutes + s.bufferAfterMinutes)}
                        />
                        {offered ? <Row label="Offered" value={offered} /> : null}
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
                  );
                })}
              </div>
            </section>
          ))}
          {archived.length > 0 ? (
            <section className="space-y-3">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
              >
                <Archive className="size-4" />
                Archived
                <span className="font-normal tabular-nums normal-case">{archived.length}</span>
                <ChevronDown
                  className={cn("size-4 transition-transform", showArchived && "rotate-180")}
                />
              </button>
              {showArchived ? (
                <ul className="surface-card divide-y">
                  {archived.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Archived{" "}
                          {new Date(s.archivedAt!).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          · Past bookings keep it
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updateService.isPending}
                        onClick={() =>
                          updateService.mutate(
                            { serviceId: s.id, version: s.version, body: { archived: false } },
                            {
                              onSuccess: () =>
                                toast.success(`${noun} restored`, {
                                  description: "It's back in your list, switched off.",
                                }),
                            },
                          )
                        }
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
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
          inUseTitle: `Archive this ${lower} instead?`,
          inUseDescription: `This ${lower} has bookings against it, so it can't be deleted without losing that history. Archiving switches it off and moves it out of your list. Past bookings keep their details, and you can restore it from Archived at the bottom of this page.`,
          fallbackLabel: "Archive",
        })}
        onDelete={async (s) => {
          await deleteService.mutateAsync(s.id);
          toast.success(`${noun} deleted`);
        }}
        onFallback={async (s) => {
          await updateService.mutateAsync({
            serviceId: s.id,
            version: s.version,
            body: { archived: true },
          });
          toast.success(`${noun} archived`);
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

function toVariantRows(service: CatalogueService | null): VariantRow[] {
  if (!service) return [];
  return service.variants.map((v) => {
    const split = v.durationMinutes != null ? splitDuration(v.durationMinutes) : null;
    return {
      id: v.id,
      name: v.name,
      durationValue: split?.value ?? "",
      durationUnit: split?.unit ?? "minutes",
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
  const staffList = useStaffList();
  const soleStaff = useSoleStaff();
  const activeStaff = useMemo(
    () => (staffList.data ?? []).filter((m) => m.status !== "suspended" && m.bookable !== false),
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
  // Where it's offered. Empty `locationIds` means every location, now and later.
  const activeLocations = tenant.locations.filter((l) => l.active);
  const [offeredMode, setOfferedMode] = useState<"all" | "some">(
    service && service.locationIds.length > 0 ? "some" : "all",
  );
  const [offeredIds, setOfferedIds] = useState<string[]>(service?.locationIds ?? []);
  const resourcesQuery = useResources();
  const words = resourceWords(tenant.business?.industryTemplateKey);
  const [needsResource, setNeedsResource] = useState(Boolean(service?.requiredResourceType));
  const showResourceField =
    (resourcesQuery.data ?? []).some((r) => r.active) || Boolean(service?.requiredResourceType);
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
  // Detailers state how long they keep the vehicle ("2 days"), trainers "1.5
  // hours"; the split keeps the stored minutes editable in whichever unit reads
  // naturally rather than bouncing "3.5 hours" back as "210 minutes".
  const initialDuration = splitDuration(service?.durationMinutes ?? 60);
  const [duration, setDuration] = useState(initialDuration.value);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(initialDuration.unit);
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
  const [variants, setVariants] = useState<VariantRow[]>(() => toVariantRows(service));
  // Creating: start from the business's opening hours so the offer matches the
  // door hours without retyping them. Editing: whatever is saved.
  const defaultWindows = (s: CatalogueService | null) =>
    s ? [...s.availabilityWindows] : [...(businessHours?.windows ?? [])];
  const [windows, setWindows] = useState<AvailabilityWindow[]>(() => defaultWindows(service));
  // One person: their availability already says when they can be booked, so a
  // second weekly grid for the session is noise. It stays behind a switch for the
  // odd session that really is narrower (a Saturday-only class); off saves no
  // windows, which the API reads as "whenever they're available".
  const [restrictWindows, setRestrictWindows] = useState(
    () => (service?.availabilityWindows.length ?? 0) > 0,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One-person business: the Staff page is hidden on Solo, so the only person's
  // working hours are set here too — without them nothing is ever bookable, however
  // the session itself is configured. Someone who has never set hours starts from
  // the business's opening hours so saving the session makes them bookable at once.
  const { user } = useAuth();
  const updateStaff = useUpdateStaff();
  const defaultHours = (member: Staff | null) =>
    member
      ? member.workingRules.length > 0
        ? workingRulesToWindows(member.workingRules)
        : [...(businessHours?.windows ?? [])]
      : [];
  const [hours, setHours] = useState<AvailabilityWindow[]>(() => defaultHours(soleStaff));
  const hoursOwnerIsMe = Boolean(soleStaff && user && soleStaff.userId === user.id);
  const hoursCopy = useMemo(() => {
    const who = hoursOwnerIsMe ? "you" : (soleStaff?.displayName ?? "they");
    const whose = hoursOwnerIsMe ? "your" : `${soleStaff?.displayName ?? "their"}'s`;
    return {
      label: hoursOwnerIsMe
        ? "Your availability"
        : `${soleStaff?.displayName ?? "Their"} availability`,
      matchesPreset: (preset: string) =>
        `Matches ${preset}'s opening hours. These are the hours clients can book ${who} for any ${lower}.`,
      hint: `The hours clients can book ${who}. Applies to every ${lower}, not just this one.`,
      empty: `No hours set — clients can't book ${who} until ${whose} hours are added.`,
    };
  }, [hoursOwnerIsMe, soleStaff?.displayName, lower]);

  // Consumables used (detailing, unless hidden from the menu): the materials a job of
  // this service uses by default, saved with the service. Staff-only records; they
  // never touch the price.
  const consumablesOn = useConsumablesOn();
  const consumableCatalogue = useConsumables({ enabled: consumablesOn && open });
  const serviceUsage = useServiceConsumables(service?.id, { enabled: consumablesOn && open });
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageDirty, setUsageDirty] = useState(false);
  const [usageInvalid, setUsageInvalid] = useState<number | null>(null);
  // Upsells: add-ons offered with this service, at a price set here. Their own
  // endpoint, saved after the service; gated by the `upsells` plan feature on write.
  const upsellsEntitled = useUpsellsEntitled();
  const serviceUpsells = useServiceUpsells(open ? service?.id : undefined);
  const replaceUpsells = useReplaceServiceUpsells();
  const [upsellRows, setUpsellRows] = useState<UpsellRow[]>([]);
  const [upsellsDirty, setUpsellsDirty] = useState(false);
  const [upsellInvalid, setUpsellInvalid] = useState<number | null>(null);
  const [upsellsPaywall, setUpsellsPaywall] = useState(false);
  useEffect(() => {
    if (open && !upsellsDirty && serviceUpsells.data) {
      setUpsellRows(rowsFromUpsells(serviceUpsells.data));
    }
  }, [open, upsellsDirty, serviceUpsells.data]);
  // Follow-up reminders ("valet after a year, ceramic top-up every 2 years"): part of
  // the service payload, so they save with the service itself. All verticals.
  const [followUpDrafts, setFollowUpDrafts] = useState<FollowUpRuleDraft[]>(() =>
    draftsFromRules(service?.followUps),
  );
  const [followUpError, setFollowUpError] = useState<FollowUpRuleError | null>(null);
  // The defaults arrive after the dialog opens; adopt them until staff start editing.
  useEffect(() => {
    if (open && !usageDirty && serviceUsage.data) setUsageRows(rowsFromLines(serviceUsage.data));
  }, [open, usageDirty, serviceUsage.data]);

  const submitting =
    createService.isPending ||
    updateService.isPending ||
    updateStaff.isPending ||
    replaceUpsells.isPending;

  const resetFrom = (s: CatalogueService | null) => {
    setName(s?.name ?? "");
    setStaffMode(s && s.eligibleStaffIds.length > 0 ? "selected" : "all");
    setStaffIds(s?.eligibleStaffIds ?? []);
    setPrice(String(s ? s.basePriceMinor / 100 : 50));
    setDeposit(depositToInput(s?.depositMinor));
    const split = splitDuration(s?.durationMinutes ?? 60);
    setDuration(split.value);
    setDurationUnit(split.unit);
    setCapacity(String(s?.capacityMax ?? 1));
    setDescription(s?.description ?? "");
    setCategory(s?.category ?? "");
    setActive(s?.active ?? true);
    setPublicVisible(s?.publicVisible ?? true);
    setVariants(toVariantRows(s));
    setWindows(defaultWindows(s));
    setRestrictWindows((s?.availabilityWindows.length ?? 0) > 0);
    setHours(defaultHours(soleStaff));
    setFieldErrors({});
    // Seed from whatever the usage query already holds. The adopt effect below
    // can't be relied on here: it runs in the same commit as this reset and its
    // deps don't change afterwards, so a reopen after a save used to land on an
    // empty list — and the next save would then wipe the lines already recorded.
    setUsageRows(s && serviceUsage.data ? rowsFromLines(serviceUsage.data) : []);
    setUsageDirty(false);
    setUsageInvalid(null);
    setUpsellRows(s && serviceUpsells.data ? rowsFromUpsells(serviceUpsells.data) : []);
    setUpsellsDirty(false);
    setUpsellInvalid(null);
    setFollowUpDrafts(draftsFromRules(s?.followUps));
    setFollowUpError(null);
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

  // The staff list can land after the dialog opens (and re-lands after a save
  // bumps the version), so the hours follow the person rather than the service.
  useEffect(() => {
    if (open) setHours(defaultHours(soleStaff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, soleStaff?.id, soleStaff?.version]);

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

    const offerWindows = soleStaff && !restrictWindows ? [] : windows;
    if (offerWindows.some((w) => !isValidAvailabilityWindow(w))) {
      setFieldErrors((prev) => ({
        ...prev,
        availabilityWindows: "Each window needs a start time before its end.",
      }));
      toast.error(`Check the ${lower} offer windows`);
      throw new Error("validation");
    }

    // The sole person's hours save alongside the session, only when they changed.
    const hoursChanged = soleStaff ? !sameWorkingHours(hours, soleStaff.workingRules) : false;
    if (hoursChanged && hours.some((w) => !isValidAvailabilityWindow(w))) {
      setFieldErrors((prev) => ({
        ...prev,
        workingRules: "Each day needs a start time before its end.",
      }));
      toast.error("Check the availability hours");
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

    if (activeLocations.length > 1 && offeredMode === "some" && offeredIds.length === 0) {
      setFieldErrors((prev) => ({ ...prev, locationIds: "Pick at least one location." }));
      toast.error(`Choose where this ${lower} is offered`);
      throw new Error("validation");
    }
    const eligibleStaffIds = staffMode === "selected" ? staffIds : [];
    if (staffMode === "selected" && staffIds.length === 0) {
      setFieldErrors((prev) => ({ ...prev, eligibleStaffIds: "Pick at least one person." }));
      toast.error(`Choose who delivers this ${lower}`);
      throw new Error("validation");
    }

    // The materials list saves in the same request as the service, so a bad line
    // fails the whole save rather than leaving one half written.
    const usage = consumablesOn && usageDirty ? rowsToItems(usageRows) : null;
    if (usage && !usage.ok) {
      setUsageInvalid(usage.index);
      throw new Error("validation");
    }
    setUsageInvalid(null);

    const upsells = upsellsDirty ? rowsToUpsellItems(upsellRows) : null;
    if (upsells && !upsells.ok) {
      setUpsellInvalid(upsells.index);
      toast.error(upsells.message);
      throw new Error("validation");
    }
    setUpsellInvalid(null);

    const followUps = rulesFromDrafts(followUpDrafts);
    if (!followUps.ok) {
      setFollowUpError({
        index: followUps.index,
        field: followUps.field,
        message: followUps.message,
      });
      toast.error(
        followUpDrafts.length > 1
          ? `Check follow-up reminder ${followUps.index + 1}`
          : "Check the follow-up reminder",
      );
      throw new Error("validation");
    }
    setFollowUpError(null);

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
      depositMinor,
      variants: variantsPayload,
      availabilityWindows: offerWindows,
      followUps: followUps.rules,
    };
    if (activeLocations.length > 1) {
      body.locationIds = offeredMode === "all" ? [] : offeredIds;
    }
    if (showResourceField) {
      body.requiredResourceType = needsResource
        ? (service?.requiredResourceType ?? (words.one === "bay" ? "bay" : "room"))
        : null;
    }
    if (usage?.ok) {
      body.consumables = usage.items.map((it) => ({
        consumableId: it.consumableId,
        quantity: it.quantity,
      }));
    }

    setFieldErrors({});
    // Hours go first: saving the service can itself touch the staff record (to add
    // the service to a restricted list), which would stale the If-Match we hold.
    // The hook toasts failures and refetches on 409; the dialog stays open.
    if (hoursChanged && soleStaff) {
      await updateStaff.mutateAsync({
        staffId: soleStaff.id,
        version: soleStaff.version,
        body: { workingRules: windowsToWorkingRules(hours, soleStaff.workingRules) },
      });
    }
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
      if (usage?.ok) setUsageDirty(false);
      // Add-ons offered with this service. Its own endpoint; a plan without the
      // feature answers 403, which opens the bolt-on dialog rather than a toast.
      if (upsells?.ok) {
        try {
          await replaceUpsells.mutateAsync({ serviceId: saved.id, items: upsells.items });
        } catch (err) {
          if (isFeatureNotAvailable(err)) {
            setUpsellsPaywall(true);
          } else {
            toast.warning("The add-ons list didn't save — open the service and try again.");
          }
        }
      }
      // A staff record with its own services list would otherwise veto this service
      // even though it was just assigned to them here. The API brings those lists
      // into line on save (so quick-add and other clients get it too); the hooks
      // refetch staff so the pages reflect it.
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
          {/* Detailing stacks duration over price: the long label wraps and would
              leave the price field floating half a line lower beside it. */}
          <div className={cn("grid gap-4", isDetailing ? "" : "sm:grid-cols-3")}>
            <div className="grid gap-2">
              <Label htmlFor="s-dur">
                {isDetailing ? "How long you'll have the vehicle" : "Duration"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="s-dur"
                  inputMode="decimal"
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
                      durationUnit,
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
                    <div className="grid w-20 gap-1">
                      <Label className="text-xs text-muted-foreground">Duration</Label>
                      <Input
                        inputMode="decimal"
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

          {/* Detailing: what a job of this service uses up. Records only; never priced in. */}
          {consumablesOn ? (
            <div className="grid gap-2 border-t pt-4">
              <Label>Consumables used</Label>
              <p className="text-xs text-muted-foreground">
                What one job usually uses. Every new job starts with this list, and you can change
                it on the day.
              </p>
              {serviceUsage.isLoading || consumableCatalogue.isLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-secondary/70" />
              ) : (
                <ServiceConsumablesEditor
                  rows={usageRows}
                  onChange={(rows) => {
                    setUsageRows(rows);
                    setUsageDirty(true);
                    setUsageInvalid(null);
                  }}
                  catalogue={consumableCatalogue.data ?? []}
                  priceMinor={(() => {
                    try {
                      return parseMoneyToMinor(price);
                    } catch {
                      return null;
                    }
                  })()}
                  currency={tenant.business?.currency || "GBP"}
                  canMoney={tenant.can(PERMISSIONS.PAYMENT_READ)}
                  canAddToCatalogue={tenant.can(PERMISSIONS.BUSINESS_UPDATE)}
                  invalid={usageInvalid !== null}
                />
              )}
              {usageInvalid !== null ? (
                <p className="text-xs text-destructive">Each line needs a quantity above zero.</p>
              ) : null}
            </div>
          ) : null}

          {/* Upsells: add-ons offered alongside this service, on the booking page and
              by email after staff book someone in. */}
          <div className="grid gap-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Add-ons to offer</Label>
              {upsellsEntitled === false ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUpsellsPaywall(true)}
                >
                  <Sparkles className="size-4" />
                  Unlock upsells
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Other {lower}s to suggest with this one — ticked as extras when clients book online,
              and offered by email when you book them in. Set a special price for the pairing or
              leave it blank to charge the add-on&apos;s own price.
            </p>
            {serviceUpsells.isLoading || catalogue.isLoading ? (
              <div className="h-10 animate-pulse rounded-xl bg-secondary/70" />
            ) : (
              <UpsellEditor
                rows={upsellRows}
                onChange={(rows) => {
                  setUpsellRows(rows);
                  setUpsellsDirty(true);
                  setUpsellInvalid(null);
                }}
                catalogue={catalogue.data ?? []}
                ownServiceId={service?.id ?? null}
                invalidIndex={upsellInvalid}
                disabled={upsellsEntitled === false}
                idPrefix="su"
              />
            )}
          </div>
          <UpsellsUpgradeDialog open={upsellsPaywall} onOpenChange={setUpsellsPaywall} />

          {/* Follow-up reminder: schedules a top-up nudge from each finished job. */}
          {remindersAvailable(tenant.business?.industryTemplateKey) ? (
            <FollowUpRuleEditor
              drafts={followUpDrafts}
              onChange={(next) => {
                setFollowUpDrafts(next);
                setFollowUpError(null);
              }}
              error={followUpError}
              serviceNoun={lower}
              idPrefix="sfu"
            />
          ) : null}

          {/* With one person on the books "everyone" and "them" are the same answer. */}
          {soleStaff ? null : (
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
          )}

          {activeLocations.length > 1 ? (
            <div className="grid gap-3 border-t pt-4">
              <Label id="s-offered-label">Offered at</Label>
              <RadioGroup
                value={offeredMode}
                onValueChange={(v) => setOfferedMode(v as "all" | "some")}
                aria-labelledby="s-offered-label"
                className="grid gap-2 sm:grid-cols-2"
              >
                {(
                  [
                    ["all", "All locations", "Including any you add later."],
                    ["some", "Only some locations", "Clients only see it where it's offered."],
                  ] as const
                ).map(([value, title, help]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                      offeredMode === value && "border-primary/40 bg-primary-soft/40",
                    )}
                  >
                    <RadioGroupItem value={value} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{title}</span>
                      <span className="text-xs text-muted-foreground">{help}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              {offeredMode === "some" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeLocations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={offeredIds.includes(l.id)}
                        onCheckedChange={(checked) =>
                          setOfferedIds((ids) =>
                            checked ? [...ids, l.id] : ids.filter((id) => id !== l.id),
                          )
                        }
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              ) : null}
              {fieldErrors.locationIds ? (
                <p className="text-xs text-destructive">{fieldErrors.locationIds}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Staff can still book it elsewhere after a warning.
                </p>
              )}
            </div>
          ) : null}

          {showResourceField ? (
            <div className="flex items-start justify-between gap-4 border-t pt-4">
              <div className="grid gap-0.5">
                <Label htmlFor="s-needs-resource">Needs a {words.one}</Label>
                <p className="text-xs text-muted-foreground">
                  Each {tenant.terminology.booking.toLowerCase()} takes a free {words.one} at its
                  location. Times with none free aren't offered.
                </p>
              </div>
              <Switch
                id="s-needs-resource"
                checked={needsResource}
                onCheckedChange={setNeedsResource}
              />
            </div>
          ) : null}

          {soleStaff ? (
            <WeeklyWindowsEditor
              windows={hours}
              onChange={setHours}
              error={fieldErrors.workingRules}
              businessHours={businessHours}
              copy={hoursCopy}
            />
          ) : null}

          {soleStaff ? (
            <div className="grid gap-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Only offer this {lower} at certain times</p>
                  <p className="text-xs text-muted-foreground">
                    Off: clients can book it whenever {hoursOwnerIsMe ? "you're" : "they're"}{" "}
                    available. On: narrow it further — a weekend-only class, early sessions.
                  </p>
                </div>
                <Switch
                  checked={restrictWindows}
                  onCheckedChange={(on) => {
                    setRestrictWindows(on);
                    // Give them something to edit rather than an empty grid.
                    if (on && windows.length === 0) {
                      setWindows(
                        businessHours?.windows.length ? [...businessHours.windows] : [...hours],
                      );
                    }
                  }}
                />
              </div>
              {restrictWindows ? (
                <WeeklyWindowsEditor
                  windows={windows}
                  onChange={setWindows}
                  error={fieldErrors.availabilityWindows}
                  businessHours={businessHours}
                  className="border-t-0 pt-0"
                  copy={{
                    label: `When this ${lower} is offered`,
                    matchesPreset: (preset) =>
                      `Matches ${preset}'s opening hours. Clients can only book this ${lower} inside these times.`,
                    hint: `Clients can only book this ${lower} inside these times, and only when ${hoursOwnerIsMe ? "you're" : "they're"} available.`,
                    empty: `No times listed — turn the switch off to offer it whenever ${hoursOwnerIsMe ? "you're" : "they're"} available.`,
                  }}
                />
              ) : null}
            </div>
          ) : (
            <WeeklyWindowsEditor
              windows={windows}
              onChange={setWindows}
              error={fieldErrors.availabilityWindows}
              businessHours={businessHours}
            />
          )}

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
