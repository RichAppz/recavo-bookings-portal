import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BellRing,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PackageLinksCard } from "@/components/PackageLinksCard";
import { ServiceDrawer, type ServiceTemplate } from "@/components/services/ServiceDrawer";
import { ArchiveServiceDialog, DeleteServiceDialog } from "@/components/services/ServiceDialogs";
import { TonePill } from "@/components/client-profile/parts";
import type { BusinessHoursPreset } from "@/components/WeeklyWindowsEditor";
import { useConsumablesOn } from "@/components/consumables/use-consumables-on";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useConsumables,
  useDeleteService,
  useLocationsList,
  useServices,
  useServicesConsumables,
  useStaffList,
  useUpdateService,
} from "@/lib/api/hooks";
import {
  useReorderServices,
  useServiceCategoryOrder,
  useServiceUsage,
  useUpsellPairings,
} from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api";
import type { CatalogueService, Staff } from "@/lib/api/types";
import { estimateMaterialsCost } from "@/lib/consumables";
import { groupByCategory, knownCategories, normaliseCategory } from "@/lib/service-categories";
import {
  SERVICE_STATUS_FILTERS,
  SERVICE_STATUS_LABELS,
  countLine,
  durationLabel,
  filterServices,
  modeChip,
  optionsChip,
  priceLabel,
  rowAriaLabel,
  serviceNoun,
  type ServiceStatusFilter,
} from "@/lib/services-catalogue";
import { windowsFromOpeningHours } from "@/lib/availability-windows";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useSoleStaff } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  create: z.coerce.boolean().optional(),
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(SERVICE_STATUS_FILTERS).optional(),
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

const QUICK_START: Record<"pt" | "detailing", ServiceTemplate[]> = {
  pt: [
    { name: "1-to-1 PT", durationMinutes: 60, basePriceMinor: 4500 },
    { name: "Assessment", durationMinutes: 45, basePriceMinor: 3000 },
    {
      name: "Group class",
      durationMinutes: 45,
      basePriceMinor: 1200,
      bookingMode: "group",
      capacityMax: 8,
    },
    { name: "Nutrition", durationMinutes: 30, basePriceMinor: 3500 },
  ],
  detailing: [
    { name: "Mini valet", durationMinutes: 90, basePriceMinor: 4500 },
    { name: "Full valet", durationMinutes: 240, basePriceMinor: 12000 },
    { name: "Ceramic coating", durationMinutes: 1440, basePriceMinor: 45000 },
    { name: "Paint correction", durationMinutes: 2880, basePriceMinor: 60000 },
  ],
};

const NONE = "__none";
const groupKey = (category: string | null) => category?.toLowerCase() ?? NONE;

type Lifted = { kind: "service"; id: string } | { kind: "group"; key: string };

function ServicesPage() {
  const tenant = useTenant();
  const phone = useIsPhone();
  const { lower, plural, pluralLower } = serviceNoun(tenant.terminology.service);
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const services = useServices();
  const categoryOrder = useServiceCategoryOrder();
  const usage = useServiceUsage();
  const pairings = useUpsellPairings();
  const staff = useStaffList();
  const locations = useLocationsList();
  const soleStaff = useSoleStaff();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const reorder = useReorderServices();

  const consumablesOn = useConsumablesOn();
  const consumables = useConsumables({ enabled: consumablesOn });
  const consumableCountByService = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of consumables.data ?? []) {
      for (const id of c.serviceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [consumables.data]);
  const costedServiceIds = useMemo(
    () => (canMoney ? [...consumableCountByService.keys()].sort() : []),
    [canMoney, consumableCountByService],
  );
  const serviceDefaults = useServicesConsumables(costedServiceIds, { enabled: consumablesOn });
  const materialsByService = new Map<string, number | null>(
    costedServiceIds.map((id, i) => [id, estimateMaterialsCost(serviceDefaults[i]?.data ?? [])]),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<ServiceTemplate | null>(null);
  const [archiving, setArchiving] = useState<{
    service: CatalogueService;
    afterDelete: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<CatalogueService | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const [preview, setPreview] = useState<{ ids: string[]; categories: string[] } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragging = useRef<Lifted | null>(null);
  const longPress = useRef<number | null>(null);
  const lastEditing = useRef<CatalogueService | null>(null);

  const allServices = useMemo(() => services.data ?? [], [services.data]);
  const listed = useMemo(
    () => allServices.filter((s) => !s.archivedAt).sort((a, b) => a.displayOrder - b.displayOrder),
    [allServices],
  );
  const archived = allServices.filter((s) => s.archivedAt);
  const savedCategories = categoryOrder.data ?? [];

  const q = search.q ?? "";
  const status = (search.status ?? null) as ServiceStatusFilter | null;
  const category = search.category ?? null;
  const filtering = Boolean(q.trim() || status || category);
  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const ordered = useMemo(() => {
    if (!preview) return listed;
    const pos = new Map(preview.ids.map((id, i) => [id, i]));
    return [...listed].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  }, [listed, preview]);
  const groupOrder = preview?.categories ?? savedCategories;
  const shown = filterServices(ordered, { q, category, status });
  const groups = groupByCategory(shown, groupOrder);
  const allGroups = groupByCategory(ordered, groupOrder);
  const categoriesInUse = knownCategories(listed);
  const hasUncategorised = listed.some((s) => !normaliseCategory(s.category));
  const grouped = categoriesInUse.length > 0;
  const canReorder = canEdit && !filtering;

  const editing = editingId ? (allServices.find((s) => s.id === editingId) ?? null) : null;
  if (editing) lastEditing.current = editing;
  const drawerService = editingId ? (editing ?? lastEditing.current) : null;

  const businessHours = useMemo<BusinessHoursPreset | undefined>(() => {
    const list = locations.data ?? [];
    const chosen =
      list.find((l) => l.id === tenant.currentLocationId && l.openingHours.length > 0) ??
      list.find((l) => l.active && l.openingHours.length > 0) ??
      list.find((l) => l.openingHours.length > 0);
    if (!chosen) return undefined;
    return { label: chosen.name, windows: windowsFromOpeningHours(chosen.openingHours) };
  }, [locations.data, tenant.currentLocationId]);

  const byId = useMemo(() => new Map(allServices.map((s) => [s.id, s])), [allServices]);
  const offeredWith = (serviceId: string) =>
    (pairings.data ?? [])
      .filter((p) => p.upsellServiceId === serviceId)
      .map((p) => byId.get(p.serviceId))
      .filter((s): s is CatalogueService => Boolean(s && !s.archivedAt));
  const addOnCount = (serviceId: string) =>
    (pairings.data ?? []).filter((p) => p.serviceId === serviceId).length;

  useEffect(() => {
    if (!search.create) return;
    openCreate(null);
    void navigate({ search: (prev) => ({ ...prev, create: undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.create]);

  useEffect(() => {
    if (!highlightId) return;
    document
      .querySelector(`[data-service-row="${highlightId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setHighlightId(null), 2000);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  function openCreate(from: ServiceTemplate | null) {
    setEditingId(null);
    setTemplate(from);
    setCreating(true);
  }
  function openEdit(s: CatalogueService) {
    setCreating(false);
    setTemplate(null);
    setEditingId(s.id);
  }
  function duplicate(s: CatalogueService) {
    openCreate({
      name: `${s.name} (copy)`,
      description: s.description,
      category: s.category,
      durationMinutes: s.durationMinutes,
      basePriceMinor: s.basePriceMinor,
      depositMinor: s.depositMinor,
      capacityMax: s.capacityMax,
      bookingMode: s.bookingMode,
      eligibleStaffIds: s.eligibleStaffIds,
      locationIds: s.locationIds,
      availabilityWindows: s.availabilityWindows,
      requiredResourceType: s.requiredResourceType,
      variants: s.variants.map((v) => ({ ...v, id: "" })),
      followUps: s.followUps,
      publicVisible: s.publicVisible,
      ruleSource: s,
    });
  }

  const setActive = async (s: CatalogueService, active: boolean) => {
    const saved = await updateService.mutateAsync({
      serviceId: s.id,
      version: s.version,
      body: { active },
    });
    if (active) {
      toast.success(`${s.name} is taking bookings`);
      return;
    }
    toast.success(`${s.name} paused. Existing bookings stay.`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          updateService.mutate({
            serviceId: s.id,
            version: saved.version,
            body: { active: true },
          }),
      },
    });
  };
  const setPublic = async (s: CatalogueService, publicVisible: boolean) => {
    await updateService.mutateAsync({
      serviceId: s.id,
      version: s.version,
      body: { publicVisible },
    });
    toast.success(
      publicVisible ? `${s.name} is on your booking page` : `${s.name} is for offer links only`,
    );
  };
  const archive = async (s: CatalogueService) => {
    const saved = await updateService.mutateAsync({
      serviceId: s.id,
      version: s.version,
      body: { archived: true },
    });
    setArchiving(null);
    if (editingId === s.id) setEditingId(null);
    toast.success(`${s.name} archived`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: async () => {
          const restored = await updateService.mutateAsync({
            serviceId: s.id,
            version: saved.version,
            body: { archived: false },
          });
          if (s.active) {
            updateService.mutate({
              serviceId: s.id,
              version: restored.version,
              body: { active: true },
            });
          }
        },
      },
    });
  };
  const restore = async (s: CatalogueService) => {
    await updateService.mutateAsync({
      serviceId: s.id,
      version: s.version,
      body: { archived: false },
    });
    toast.success(`${s.name} restored. It's paused until you switch it on.`);
  };
  const confirmDelete = async (s: CatalogueService) => {
    try {
      await deleteService.mutateAsync(s.id);
      setDeleting(null);
      if (editingId === s.id) setEditingId(null);
      toast.success(`${s.name} deleted`);
    } catch (err) {
      setDeleting(null);
      // Booked since the list loaded: archive is the only way out, and the modal says why.
      if (err instanceof ApiError && err.isConflict)
        setArchiving({ service: s, afterDelete: true });
      else toast.error(err instanceof ApiError ? err.detail || err.title : "Couldn't delete it.");
    }
  };
  const requestDelete = (s: CatalogueService) => {
    const u = usage.data?.get(s.id);
    if (u && !u.canDelete) setArchiving({ service: s, afterDelete: true });
    else setDeleting(s);
  };

  /* ---------------- Reorder ---------------- */

  const flatIds = (groupsList = allGroups) => groupsList.flatMap((g) => g.items.map((s) => s.id));
  const categoryNames = (groupsList = allGroups) =>
    groupsList.map((g) => g.category).filter((c): c is string => c !== null);

  const saveOrder = (ids: string[], categories: string[]) => {
    reorder.mutate(
      { serviceIds: ids, categoryOrder: categories },
      {
        onSuccess: () => toast.success("Order saved"),
        onSettled: () => setPreview(null),
      },
    );
  };

  /** Moves a service before/after another, changing its category when it lands in another group. */
  const moveService = async (
    dragId: string,
    targetId: string | null,
    groupCategory: string | null,
    after: boolean,
  ) => {
    const moving = byId.get(dragId);
    if (!moving || dragId === targetId) return;
    const ids = flatIds().filter((id) => id !== dragId);
    let index: number;
    if (targetId) {
      index = ids.indexOf(targetId) + (after ? 1 : 0);
    } else {
      const inGroup = allGroups.find((g) => groupKey(g.category) === groupKey(groupCategory));
      const last = inGroup?.items.filter((s) => s.id !== dragId).at(-1);
      index = last ? ids.indexOf(last.id) + 1 : ids.length;
    }
    ids.splice(index, 0, dragId);
    const categories = categoryNames();
    setPreview({ ids, categories });
    if (groupKey(normaliseCategory(moving.category)) !== groupKey(groupCategory)) {
      try {
        await updateService.mutateAsync({
          serviceId: moving.id,
          version: moving.version,
          body: { category: groupCategory },
        });
      } catch {
        setPreview(null);
        return;
      }
    }
    saveOrder(ids, categories);
  };

  const moveGroup = (dragKey: string, targetKey: string) => {
    if (dragKey === targetKey || dragKey === NONE || targetKey === NONE) return;
    const keys = allGroups.map((g) => groupKey(g.category));
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    const reordered = [...allGroups];
    const [g] = reordered.splice(from, 1);
    reordered.splice(to, 0, g!);
    const ids = flatIds(reordered);
    const categories = categoryNames(reordered);
    setPreview({ ids, categories });
    saveOrder(ids, categories);
  };

  /** Keyboard: Space lifts and drops, arrows move, Escape puts it back. */
  const onHandleKey = (e: KeyboardEvent, item: Lifted) => {
    const same =
      lifted &&
      lifted.kind === item.kind &&
      (lifted.kind === "service"
        ? lifted.id === (item as { id: string }).id
        : lifted.key === (item as { key: string }).key);
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (same) {
        setLifted(null);
        if (preview) saveOrder(preview.ids, preview.categories);
        setAnnounce("Dropped.");
      } else {
        setLifted(item);
        setPreview({ ids: flatIds(), categories: categoryNames() });
        setAnnounce("Picked up. Use the arrow keys to move, Space to drop.");
      }
      return;
    }
    if (e.key === "Escape" && same) {
      setLifted(null);
      setPreview(null);
      setAnnounce("Move cancelled.");
      return;
    }
    if (!same || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (item.kind === "service") {
      const group = allGroups.find((g) => g.items.some((s) => s.id === item.id));
      if (!group) return;
      const inGroup = group.items.map((s) => s.id);
      const at = inGroup.indexOf(item.id);
      const next = at + dir;
      if (next < 0 || next >= inGroup.length) return;
      const ids = flatIds();
      const a = ids.indexOf(item.id);
      const b = ids.indexOf(inGroup[next]!);
      [ids[a], ids[b]] = [ids[b]!, ids[a]!];
      setPreview({ ids, categories: categoryNames() });
      setAnnounce(`Moved to position ${next + 1} in ${group.category ?? "Other"}.`);
    } else {
      const named = allGroups.filter((g) => g.category !== null);
      const at = named.findIndex((g) => groupKey(g.category) === item.key);
      const next = at + dir;
      if (at < 0 || next < 0 || next >= named.length) return;
      const reordered = [...named];
      [reordered[at], reordered[next]] = [reordered[next]!, reordered[at]!];
      const withOther = [...reordered, ...allGroups.filter((g) => g.category === null)];
      setPreview({ ids: flatIds(withOther), categories: categoryNames(withOther) });
      setAnnounce(`Moved to position ${next + 1}.`);
    }
  };

  const nudge = (s: CatalogueService, dir: -1 | 1) => {
    const group = allGroups.find((g) => g.items.some((x) => x.id === s.id));
    if (!group) return;
    const inGroup = group.items.map((x) => x.id);
    const at = inGroup.indexOf(s.id);
    const swapWith = inGroup[at + dir];
    if (!swapWith) return;
    const ids = flatIds();
    const a = ids.indexOf(s.id);
    const b = ids.indexOf(swapWith);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    const categories = categoryNames();
    setPreview({ ids, categories });
    saveOrder(ids, categories);
  };

  /* ---------------- Render ---------------- */

  const staffPlural = (() => {
    const t = tenant.terminology.staff.trim().toLowerCase() || "staff";
    return t.endsWith("s") ? t : `${t}s`;
  })();
  const activeLocations = (locations.data ?? []).filter((l) => l.active);
  const quickStart = QUICK_START[isDetailing ? "detailing" : "pt"];
  const createButton = canEdit ? (
    phone ? (
      <Button
        size="icon"
        className="size-11 rounded-full"
        aria-label={`Create ${lower}`}
        onClick={() => openCreate(null)}
      >
        <Plus className="size-5" />
      </Button>
    ) : (
      <Button onClick={() => openCreate(null)}>
        <Plus className="size-4" /> Create {lower}
      </Button>
    )
  ) : null;

  const rowMenu = (s: CatalogueService, trigger: React.ReactNode, controlled = false) => {
    const u = usage.data?.get(s.id);
    const deletable = !u || u.canDelete;
    return (
      <DropdownMenu
        {...(controlled
          ? { open: menuFor === s.id, onOpenChange: (o: boolean) => setMenuFor(o ? s.id : null) }
          : {})}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => openEdit(s)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicate(s)}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void setActive(s, !s.active).catch(() => undefined)}>
            {s.active ? "Pause bookings" : "Take bookings"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void setPublic(s, !s.publicVisible).catch(() => undefined)}
          >
            {s.publicVisible ? "Offer links only" : "Show on booking page"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setArchiving({ service: s, afterDelete: false })}
            className="flex-col items-start gap-0"
          >
            Archive
            <span className="text-xs text-muted-foreground">Keeps past bookings</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!deletable}
            onSelect={() => requestDelete(s)}
            className="flex-col items-start gap-0 text-destructive"
          >
            Delete
            {!deletable ? (
              <span className="text-xs text-muted-foreground">
                Not possible: booked {u!.bookingCount} {u!.bookingCount === 1 ? "time" : "times"}
              </span>
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderRow = (s: CatalogueService, group: { category: string | null }) => {
    const price = priceLabel(s);
    const mode = modeChip(s, isDetailing);
    const options = optionsChip(s.variants.length, isDetailing);
    const who = soleStaff ? null : describeDeliverers(s, staff.data ?? [], staffPlural);
    const where =
      activeLocations.length > 1 &&
      s.locationIds.length > 0 &&
      s.locationIds.length < activeLocations.length
        ? s.locationIds.length === 1
          ? `${activeLocations.find((l) => l.id === s.locationIds[0])?.name ?? "1 location"} only`
          : `${s.locationIds.length} locations`
        : null;
    const reminders = Array.isArray(s.followUps) ? s.followUps.length : 0;
    const consumableCount = consumableCountByService.get(s.id) ?? 0;
    const materials = materialsByService.get(s.id);
    const addOns = addOnCount(s.id);
    const isLifted = lifted?.kind === "service" && lifted.id === s.id;
    const label = rowAriaLabel(s, { isDetailing, who: who?.text ?? null });

    const extras = (
      <>
        {where ? <Chip>{where}</Chip> : null}
        {isDetailing && reminders > 0 ? (
          <Chip>
            <BellRing className="size-3" /> {reminders} {reminders === 1 ? "reminder" : "reminders"}
          </Chip>
        ) : null}
        {consumablesOn && consumableCount > 0 ? (
          <Chip title="Materials this service uses by default. For your records only.">
            <Package className="size-3" />
            {canMoney && materials != null
              ? formatMoney(materials, s.currency, { compact: true })
              : `${consumableCount} ${consumableCount === 1 ? "consumable" : "consumables"}`}
          </Chip>
        ) : null}
        {isDetailing && addOns > 0 ? (
          <Chip>
            + {addOns} {addOns === 1 ? "add-on" : "add-ons"}
          </Chip>
        ) : null}
      </>
    );

    const handle = canReorder ? (
      <span
        role="button"
        tabIndex={0}
        draggable
        aria-label={`Reorder ${s.name}`}
        aria-pressed={isLifted}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => onHandleKey(e, { kind: "service", id: s.id })}
        onDragStart={(e) => {
          dragging.current = { kind: "service", id: s.id };
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", s.id);
          const row = (e.currentTarget as HTMLElement).closest("[data-service-row]");
          if (row) e.dataTransfer.setDragImage(row, 24, 24);
        }}
        onDragEnd={() => {
          dragging.current = null;
          setDragOver(null);
        }}
        className={cn(
          "flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          isLifted && "bg-primary-soft text-primary",
        )}
      >
        <GripVertical className="size-4" />
      </span>
    ) : (
      <span />
    );

    const dropProps = canReorder
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (dragging.current?.kind !== "service") return;
            e.preventDefault();
            setDragOver(s.id);
          },
          onDragLeave: () => setDragOver((v) => (v === s.id ? null : v)),
          onDrop: (e: React.DragEvent) => {
            const drag = dragging.current;
            if (drag?.kind !== "service") return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            setDragOver(null);
            void moveService(drag.id, s.id, group.category, after);
          },
        }
      : {};

    const toggle = canEdit ? (
      <Switch
        checked={s.active}
        aria-label={`Taking bookings, ${s.name}`}
        disabled={updateService.isPending}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={(v) => void setActive(s, v).catch(() => undefined)}
      />
    ) : null;

    if (phone) {
      return (
        <li
          key={s.id}
          data-service-row={s.id}
          className={cn(
            "flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors",
            !s.active && "opacity-60",
            highlightId === s.id && "bg-primary-soft",
          )}
          onTouchStart={() => {
            if (!canEdit) return;
            longPress.current = window.setTimeout(() => setMenuFor(s.id), 500);
          }}
          onTouchEnd={() => longPress.current && window.clearTimeout(longPress.current)}
          onTouchMove={() => longPress.current && window.clearTimeout(longPress.current)}
          onContextMenu={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setMenuFor(s.id);
          }}
        >
          <button
            type="button"
            aria-label={label}
            className="min-w-0 flex-1 cursor-pointer text-left"
            onClick={() => openEdit(s)}
          >
            <span className="block truncate text-[15px] font-extrabold">{s.name}</span>
            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
              {[durationLabel(s.durationMinutes), price.main, isDetailing ? null : mode.label]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {!s.publicVisible ? (
              <span className="mt-1 inline-block">
                <TonePill tone="grey">Offer links only</TonePill>
              </span>
            ) : null}
          </button>
          {orderMode && canReorder ? (
            <span className="flex flex-col">
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Move ${s.name} up`}
                onClick={() => nudge(s, -1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Move ${s.name} down`}
                onClick={() => nudge(s, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
            </span>
          ) : (
            toggle
          )}
          {canEdit ? rowMenu(s, <span aria-hidden className="size-0" />, true) : null}
        </li>
      );
    }

    return (
      <li
        key={s.id}
        data-service-row={s.id}
        {...dropProps}
        onClick={() => openEdit(s)}
        className={cn(
          "grid min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40",
          soleStaff
            ? "grid-cols-[18px_1.9fr_80px_100px_1fr_150px_20px]"
            : "grid-cols-[18px_1.9fr_80px_100px_1.1fr_1fr_150px_20px]",
          !s.active && "[&>*:not(:nth-last-child(-n+2))]:opacity-60",
          highlightId === s.id && "bg-primary-soft",
          dragOver === s.id && "shadow-[inset_0_2px_0_var(--primary)]",
          isLifted && "bg-primary-soft/60",
        )}
      >
        {handle}
        <div className="min-w-0">
          <button
            type="button"
            aria-label={label}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(s);
            }}
          >
            <span className="truncate text-[15px] font-extrabold">{s.name}</span>
            {options ? <TonePill tone="grey">{options}</TonePill> : null}
          </button>
          {s.description ? (
            <p className="truncate text-[13px] text-muted-foreground">{s.description}</p>
          ) : null}
        </div>
        <span className="text-sm tabular-nums">{durationLabel(s.durationMinutes)}</span>
        <span className="grid">
          <span className="text-sm font-extrabold tabular-nums">{price.main}</span>
          {price.sub ? <span className="text-xs text-muted-foreground">{price.sub}</span> : null}
        </span>
        {soleStaff ? null : (
          <span className="grid min-w-0 justify-items-start gap-1">
            <TonePill tone={mode.tone}>{mode.label}</TonePill>
            {who ? (
              <span
                className={cn(
                  "max-w-full truncate text-xs",
                  who.none
                    ? "font-semibold text-[#8a5300] dark:text-[#f3b878]"
                    : "text-muted-foreground",
                )}
              >
                {who.text}
              </span>
            ) : null}
          </span>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {soleStaff ? <TonePill tone={mode.tone}>{mode.label}</TonePill> : null}
          <TonePill tone={s.publicVisible ? "green" : "grey"}>
            {s.publicVisible ? "On booking page" : "Offer links only"}
          </TonePill>
          {extras}
        </span>
        <span className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <span
            className={cn(
              "text-xs font-semibold",
              s.active ? "text-[#1f6b41] dark:text-[#9fe3bf]" : "text-muted-foreground",
            )}
          >
            {s.active ? "Taking bookings" : "Paused"}
          </span>
          {toggle}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          {canEdit
            ? rowMenu(
                s,
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`More actions for ${s.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>,
              )
            : null}
        </span>
      </li>
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cn("relative", phone ? "w-full" : "w-[260px]")}>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={`Search ${pluralLower}`}
          placeholder={`Search ${pluralLower}`}
          value={q}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          className="pl-9"
        />
      </div>
      {phone ? null : (
        <>
          {grouped ? (
            <Select
              value={category ?? "all"}
              onValueChange={(v) => setSearch({ category: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-auto min-w-[160px]" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoriesInUse.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                {hasUncategorised ? <SelectItem value={NONE}>Other</SelectItem> : null}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={status ?? "any"}
            onValueChange={(v) =>
              setSearch({ status: v === "any" ? undefined : (v as ServiceStatusFilter) })
            }
          >
            <SelectTrigger className="w-auto min-w-[150px]" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {SERVICE_STATUS_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {SERVICE_STATUS_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch({ q: undefined, category: undefined, status: undefined })}
            >
              <X className="size-3.5" /> Clear filters
            </Button>
          ) : null}
          <span className="ml-auto text-[13px] text-muted-foreground">
            {countLine(shown, lower, pluralLower)}
          </span>
        </>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (services.isLoading) {
    body = (
      <div className="space-y-5" aria-busy>
        {[3, 2].map((n, gi) => (
          <div key={gi} className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
            <div className="surface-card divide-y">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex h-16 items-center gap-4 px-4">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-secondary" />
                  <div className="h-4 w-16 animate-pulse rounded bg-secondary" />
                  <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  } else if (services.isError) {
    body = (
      <div className="surface-card grid justify-items-center gap-2 px-6 py-10 text-center">
        <p className="font-bold">Couldn't load your {pluralLower}</p>
        <p className="text-sm text-muted-foreground">
          {services.error instanceof ApiError
            ? services.error.detail || services.error.title
            : "Please try again shortly."}
        </p>
        <Button onClick={() => void services.refetch()}>Try again</Button>
      </div>
    );
  } else if (allServices.length === 0) {
    body = (
      <div className="grid justify-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Plus className="size-6" />
        </span>
        <p className="text-lg font-extrabold">No {pluralLower} yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Add what clients can book. Start with your most popular one, you can add the rest later.
        </p>
        {canEdit ? (
          <>
            <Button onClick={() => openCreate(null)}>
              <Plus className="size-4" /> Create {lower}
            </Button>
            <div className="mt-2 grid justify-items-center gap-2">
              <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Quick start
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {quickStart.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => openCreate(t)}
                    className="min-h-9 cursor-pointer rounded-full border px-3 text-sm font-semibold hover:bg-secondary"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {listed.length === 0 ? (
          <div className="surface-card grid justify-items-center gap-2 px-6 py-10 text-center">
            <p className="font-bold">No {pluralLower} in use</p>
            <p className="text-sm text-muted-foreground">
              Every {lower} is archived. Create one, or restore one below.
            </p>
            {canEdit ? <Button onClick={() => openCreate(null)}>Create {lower}</Button> : null}
          </div>
        ) : shown.length === 0 ? (
          <div className="surface-card grid justify-items-center gap-2 px-6 py-10 text-center">
            <p className="font-bold">
              {q.trim() ? `No ${pluralLower} match "${q.trim()}"` : `No ${pluralLower} match`}
            </p>
            <Button
              variant="outline"
              onClick={() => setSearch({ q: undefined, category: undefined, status: undefined })}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          groups.map((group) => {
            const key = groupKey(group.category);
            const groupLifted = lifted?.kind === "group" && lifted.key === key;
            const groupDraggable = canReorder && grouped && group.category !== null;
            return (
              <section
                key={key}
                className="space-y-2"
                onDragOver={(e) => {
                  const d = dragging.current;
                  if (!canReorder || !d) return;
                  if (d.kind === "group" && group.category === null) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  const d = dragging.current;
                  if (!canReorder || !d) return;
                  e.preventDefault();
                  setDragOver(null);
                  if (d.kind === "group") moveGroup(d.key, key);
                  else if (!(e.target as HTMLElement).closest("[data-service-row]")) {
                    void moveService(d.id, null, group.category, true);
                  }
                }}
              >
                {grouped ? (
                  <h2 className="flex items-center gap-2 text-[12.5px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                    {groupDraggable ? (
                      <span
                        role="button"
                        tabIndex={0}
                        draggable
                        aria-label={`Reorder ${group.category}`}
                        aria-pressed={groupLifted}
                        onKeyDown={(e) => onHandleKey(e, { kind: "group", key })}
                        onDragStart={(e) => {
                          dragging.current = { kind: "group", key };
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", key);
                          const section = (e.currentTarget as HTMLElement).closest("section");
                          if (section) e.dataTransfer.setDragImage(section, 24, 12);
                        }}
                        onDragEnd={() => {
                          dragging.current = null;
                        }}
                        className={cn(
                          "flex size-6 cursor-grab items-center justify-center rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          groupLifted && "bg-primary-soft text-primary",
                        )}
                      >
                        <GripVertical className="size-4" />
                      </span>
                    ) : null}
                    {group.category ?? "Other"}
                    <span className="font-semibold tabular-nums">{group.items.length}</span>
                  </h2>
                ) : null}
                <ul className="surface-card divide-y overflow-hidden">
                  {group.items.map((s) => renderRow(s, group))}
                </ul>
              </section>
            );
          })
        )}

        {phone && canReorder && listed.length > 1 ? (
          <Button variant="outline" className="w-full" onClick={() => setOrderMode((v) => !v)}>
            {orderMode ? "Done" : "Edit order"}
          </Button>
        ) : null}

        {archived.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-muted-foreground"
            >
              <ChevronRight
                className={cn("size-4 transition-transform", showArchived && "rotate-90")}
              />
              <Archive className="size-4" />
              Archived {archived.length}
            </button>
            {showArchived ? (
              <ul className="surface-card divide-y">
                {archived.map((s) => {
                  const u = usage.data?.get(s.id);
                  const past = Math.max(0, (u?.bookingCount ?? 0) - (u?.upcomingBookingCount ?? 0));
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left"
                        onClick={() => openEdit(s)}
                      >
                        <p className="truncate font-bold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Archived{" "}
                          {new Date(s.archivedAt!).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {past} past {past === 1 ? "booking" : "bookings"}
                        </p>
                      </button>
                      {canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateService.isPending}
                          onClick={() => void restore(s).catch(() => undefined)}
                        >
                          Restore
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={plural}
        description={
          phone && listed.length > 0
            ? countLine(listed, lower, pluralLower)
            : "What clients can book, how long it takes and what it costs."
        }
        actions={createButton}
      />
      {allServices.length > 0 && !services.isError ? toolbar : null}
      {body}
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {tenant.business ? <PackageLinksCard slug={tenant.business.slug} /> : null}

      <ServiceDrawer
        open={creating || editingId !== null}
        service={drawerService}
        template={creating ? template : null}
        usage={drawerService ? usage.data?.get(drawerService.id) : undefined}
        businessHours={businessHours}
        readOnly={!canEdit}
        onClose={() => {
          setCreating(false);
          setEditingId(null);
          setTemplate(null);
        }}
        onSaved={(saved) => {
          setCreating(false);
          setEditingId(null);
          setTemplate(null);
          setHighlightId(saved.id);
        }}
        onDuplicate={(s) => duplicate(s)}
        onArchive={(s) => setArchiving({ service: s, afterDelete: false })}
        onDelete={(s) => requestDelete(s)}
      />

      <ArchiveServiceDialog
        service={archiving?.service ?? null}
        usage={archiving ? usage.data?.get(archiving.service.id) : undefined}
        offeredWith={archiving ? offeredWith(archiving.service.id) : []}
        afterDelete={archiving?.afterDelete ?? false}
        pluralLower={pluralLower}
        pending={updateService.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          const s = archiving?.service;
          if (!s) return;
          const fresh = byId.get(s.id) ?? s;
          void archive(fresh).catch(() => undefined);
        }}
      />
      <DeleteServiceDialog
        service={deleting}
        offeredWith={deleting ? offeredWith(deleting.id) : []}
        pending={deleteService.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void confirmDelete(deleting)}
      />
    </>
  );
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11.5px] font-semibold whitespace-nowrap text-muted-foreground"
    >
      {children}
    </span>
  );
}

/** Who can actually be booked for a service once both sides' restrictions apply. */
function describeDeliverers(
  service: CatalogueService,
  staff: readonly Staff[],
  staffPlural: string,
): { text: string; none: boolean } {
  const all = `All ${staffPlural}`;
  const active = staff.filter((m) => m.status === "active");
  if (active.length === 0) {
    return service.eligibleStaffIds.length === 0
      ? { text: all, none: false }
      : { text: "Nobody yet", none: true };
  }
  const can = active.filter(
    (m) =>
      (service.eligibleStaffIds.length === 0 || service.eligibleStaffIds.includes(m.id)) &&
      (m.eligibleServiceIds.length === 0 || m.eligibleServiceIds.includes(service.id)),
  );
  if (can.length === 0) return { text: "Nobody yet", none: true };
  if (can.length === active.length && service.eligibleStaffIds.length === 0) {
    return { text: all, none: false };
  }
  return { text: can.map((m) => m.displayName).join(", "), none: false };
}
