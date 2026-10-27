import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Lock, MoreHorizontal, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WeeklyWindowsEditor, type BusinessHoursPreset } from "@/components/WeeklyWindowsEditor";
import { ServiceConsumablesEditor } from "@/components/consumables/ServiceConsumablesEditor";
import { useConsumablesOn } from "@/components/consumables/use-consumables-on";
import { UpsellEditor } from "@/components/UpsellEditor";
import { UpsellsUpgradeDialog } from "@/components/UpsellsUpgradeDialog";
import { FollowUpRuleEditor, type FollowUpRuleError } from "@/components/FollowUpRuleEditor";
import { TeamAvatar } from "@/components/team/parts";
import {
  useConsumables,
  useCreateService,
  useResources,
  useServiceConsumables,
  useServices,
  useStaffList,
  useUpdateService,
} from "@/lib/api/hooks";
import {
  isFeatureNotAvailable,
  useReplaceServiceUpsells,
  useServiceUpsells,
  useUpsellsEntitled,
} from "@/lib/api/upsells";
import {
  BOOKING_RULE_KEYS,
  bookingRuleDefaults,
  serviceRuleOverrides,
  serviceRuleValue,
  useUpsellPairings,
  type BookingRuleKey,
  type ServiceUsage,
} from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api";
import type { CatalogueService, Staff } from "@/lib/api/types";
import { rowsFromLines, rowsToItems, type UsageRow } from "@/lib/consumables";
import { rowsFromUpsells, rowsToUpsellItems, type UpsellRow } from "@/lib/upsells";
import { draftsFromRules, rulesFromDrafts, type FollowUpRuleDraft } from "@/lib/follow-ups";
import { isValidAvailabilityWindow, type AvailabilityWindow } from "@/lib/availability-windows";
import { knownCategories, normaliseCategory } from "@/lib/service-categories";
import {
  BUFFER_OPTIONS,
  CANCELLATION_OPTIONS,
  HORIZON_OPTIONS,
  NOTICE_OPTIONS,
  currencySymbol,
  mergeDrafts,
  optionRowErrors,
  overlappingWindows,
  ruleValueLabel,
  serviceNoun,
  summariseWindows,
  type BookingMode,
  type RuleOption,
} from "@/lib/services-catalogue";
import { formatMoney, parseMoneyToMinor } from "@/lib/format";
import { UNIT_MINUTES, splitDuration, type DurationUnit } from "@/lib/quick-add-service";
import { useSoleStaff } from "@/lib/sole";
import { resourceWords } from "@/lib/locations";
import { remindersAvailable } from "@/lib/service-reminders";
import { workingRulesToWindows } from "@/lib/working-hours";
import { PERMISSIONS } from "@/lib/permissions";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useIsPhone } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** What Create starts from: a Quick start chip, or a copy of an existing service. */
export type ServiceTemplate = Partial<
  Pick<
    CatalogueService,
    | "name"
    | "description"
    | "category"
    | "durationMinutes"
    | "basePriceMinor"
    | "depositMinor"
    | "capacityMax"
    | "bookingMode"
    | "eligibleStaffIds"
    | "locationIds"
    | "availabilityWindows"
    | "requiredResourceType"
    | "variants"
    | "followUps"
    | "publicVisible"
    | "active"
  >
> & { ruleSource?: CatalogueService };

type VariantRow = {
  id?: string;
  name: string;
  durationValue: string;
  durationUnit: DurationUnit;
  priceMinor: string;
};

type Draft = {
  name: string;
  description: string;
  category: string;
  durationValue: string;
  durationUnit: DurationUnit;
  price: string;
  deposit: string;
  mode: BookingMode;
  partySize: string;
  classSize: string;
  variants: VariantRow[];
  staffMode: "all" | "selected";
  staffIds: string[];
  offeredMode: "all" | "some";
  offeredIds: string[];
  needsResource: boolean;
  restrictWindows: boolean;
  windows: AvailabilityWindow[];
  rules: Record<BookingRuleKey, number | null>;
  followUps: FollowUpRuleDraft[];
  active: boolean;
  publicVisible: boolean;
};

const FIELD_LABELS: Partial<Record<keyof Draft, string>> = {
  name: "name",
  description: "description",
  category: "category",
  durationValue: "length",
  durationUnit: "length",
  price: "price",
  deposit: "deposit",
  mode: "how it's booked",
  partySize: "group size",
  classSize: "class size",
  variants: "options",
  staffMode: "who can do it",
  staffIds: "who can do it",
  offeredMode: "locations",
  offeredIds: "locations",
  needsResource: "space needed",
  restrictWindows: "times",
  windows: "times",
  rules: "booking rules",
  followUps: "reminders",
  active: "taking bookings",
  publicVisible: "booking page",
};

function toVariantRows(variants: CatalogueService["variants"] | undefined): VariantRow[] {
  return (variants ?? []).map((v) => {
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

function money(minor: number | null | undefined): string {
  return minor != null ? String(minor / 100) : "";
}

function draftFrom(source: CatalogueService | ServiceTemplate | null, isEdit: boolean): Draft {
  const s = source ?? {};
  const split = s.durationMinutes ? splitDuration(s.durationMinutes) : null;
  const mode: BookingMode = s.bookingMode ?? "individual";
  const ruleService = isEdit
    ? (source as CatalogueService)
    : ((source as ServiceTemplate | null)?.ruleSource ?? null);
  const overrides = ruleService ? serviceRuleOverrides(ruleService) : [];
  const rules = Object.fromEntries(
    BOOKING_RULE_KEYS.map((k) => [
      k,
      ruleService && overrides.includes(k) ? serviceRuleValue(ruleService, k) : null,
    ]),
  ) as Record<BookingRuleKey, number | null>;
  const windows = [...(s.availabilityWindows ?? [])];
  return {
    name: s.name ?? "",
    description: s.description ?? "",
    category: s.category ?? "",
    durationValue: split?.value ?? (isEdit ? "" : "1"),
    durationUnit: split?.unit ?? "hours",
    price: s.basePriceMinor != null ? money(s.basePriceMinor) : "",
    deposit: s.depositMinor && s.depositMinor > 0 ? money(s.depositMinor) : "",
    mode,
    partySize: mode === "lead_pays_party" ? String(s.capacityMax ?? 2) : "2",
    classSize: mode === "group" ? String(s.capacityMax ?? 6) : "6",
    variants: toVariantRows(s.variants),
    staffMode: (s.eligibleStaffIds?.length ?? 0) > 0 ? "selected" : "all",
    staffIds: [...(s.eligibleStaffIds ?? [])],
    offeredMode: (s.locationIds?.length ?? 0) > 0 ? "some" : "all",
    offeredIds: [...(s.locationIds ?? [])],
    needsResource: Boolean(s.requiredResourceType),
    restrictWindows: windows.length > 0,
    windows,
    rules,
    followUps: draftsFromRules(s.followUps),
    active: s.active ?? true,
    publicVisible: s.publicVisible ?? true,
  };
}

/** Follow-up drafts carry a random `key` per load; compare without it. */
function sameValue(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) =>
    JSON.stringify(v, (k, val: unknown) => (k === "key" ? undefined : val));
  return strip(a) === strip(b);
}

type SectionId = "basics" | "price" | "who" | "rules" | "extras" | "visibility";
type FieldError = { message: string; section: SectionId; target: string };

function parseMoney(value: string): number | null {
  try {
    return parseMoneyToMinor(value);
  } catch {
    return null;
  }
}

export function ServiceDrawer({
  open,
  service,
  template,
  usage,
  businessHours,
  readOnly,
  onClose,
  onSaved,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  open: boolean;
  /** Editing this service; null creates one (from `template` when given). */
  service: CatalogueService | null;
  template?: ServiceTemplate | null;
  usage?: ServiceUsage;
  businessHours?: BusinessHoursPreset;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (service: CatalogueService, created: boolean) => void;
  onDuplicate?: (service: CatalogueService) => void;
  onArchive?: (service: CatalogueService) => void;
  onDelete?: (service: CatalogueService) => void;
}) {
  const tenant = useTenant();
  const phone = useIsPhone();
  const { noun, lower, pluralLower } = serviceNoun(tenant.terminology.service);
  const isDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const currency = service?.currency || tenant.business?.currency || "GBP";
  const symbol = currencySymbol(currency);
  const namePlaceholder = isDetailing ? "Maintenance wash" : "1-to-1 Personal Training";
  const staffWord = tenant.terminology.staff.trim() || "Staff";
  const staffPluralLower = (() => {
    const t = staffWord.toLowerCase();
    return t.endsWith("s") ? t : `${t}s`;
  })();
  const bookingLower = tenant.terminology.booking.toLowerCase();
  const isEdit = service !== null;

  const createService = useCreateService();
  const updateService = useUpdateService();
  const replaceUpsells = useReplaceServiceUpsells();
  const catalogue = useServices();
  const staffList = useStaffList();
  const soleStaff = useSoleStaff();
  const { user } = useAuth();
  const resourcesQuery = useResources();
  const words = resourceWords(tenant.business?.industryTemplateKey);
  const pairings = useUpsellPairings({ enabled: open && isEdit });
  const defaults = bookingRuleDefaults(tenant.configuration);

  const activeStaff = useMemo(
    () => (staffList.data ?? []).filter((m) => m.status !== "suspended" && m.bookable !== false),
    [staffList.data],
  );
  const activeLocations = tenant.locations.filter((l) => l.active);
  const showResourceField =
    (resourcesQuery.data ?? []).some((r) => r.active) || Boolean(service?.requiredResourceType);
  const categorySuggestions = useMemo(
    () => knownCategories((catalogue.data ?? []).filter((s) => !s.archivedAt)),
    [catalogue.data],
  );

  const [draft, setDraft] = useState<Draft>(() => draftFrom(service ?? template ?? null, isEdit));
  const [initial, setInitial] = useState<Draft>(draft);
  const [base, setBase] = useState<CatalogueService | null>(service);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [editingWindows, setEditingWindows] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [conflict, setConflict] = useState<{
    taken: (keyof Draft)[];
    conflicts: (keyof Draft)[];
    theirs: Draft;
  } | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("basics");
  const scrollRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerErrors({});
  };

  // Consumables (detailing): saved in the same request as the service.
  const consumablesOn = useConsumablesOn();
  const consumableCatalogue = useConsumables({ enabled: consumablesOn && open });
  const serviceUsageLines = useServiceConsumables(service?.id, { enabled: consumablesOn && open });
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageDirty, setUsageDirty] = useState(false);
  const [usageInvalid, setUsageInvalid] = useState<number | null>(null);
  // Add-ons: saved with the service on edit; after it on create (the new id is needed).
  const upsellsEntitled = useUpsellsEntitled();
  const serviceUpsells = useServiceUpsells(open ? service?.id : undefined);
  const [upsellRows, setUpsellRows] = useState<UpsellRow[]>([]);
  const [upsellsDirty, setUpsellsDirty] = useState(false);
  const [upsellInvalid, setUpsellInvalid] = useState<{ index: number; message: string } | null>(
    null,
  );
  const [upsellsPaywall, setUpsellsPaywall] = useState(false);
  const [followUpError, setFollowUpError] = useState<FollowUpRuleError | null>(null);

  useEffect(() => {
    if (open && !upsellsDirty && serviceUpsells.data) {
      setUpsellRows(rowsFromUpsells(serviceUpsells.data));
    }
  }, [open, upsellsDirty, serviceUpsells.data]);
  useEffect(() => {
    if (open && !usageDirty && serviceUsageLines.data) {
      setUsageRows(rowsFromLines(serviceUsageLines.data));
    }
  }, [open, usageDirty, serviceUsageLines.data]);

  // Fresh form each time it opens, or when it switches to another service.
  useEffect(() => {
    if (!open) return;
    const next = draftFrom(service ?? template ?? null, isEdit);
    setDraft(next);
    setInitial(next);
    setBase(service);
    setShowErrors(false);
    setServerErrors({});
    setNewCategory(null);
    setShowAllOptions(false);
    setEditingWindows(false);
    setConflict(null);
    setUsageRows(service && serviceUsageLines.data ? rowsFromLines(serviceUsageLines.data) : []);
    setUsageDirty(false);
    setUsageInvalid(null);
    setUpsellRows(service && serviceUpsells.data ? rowsFromUpsells(serviceUpsells.data) : []);
    setUpsellsDirty(false);
    setUpsellInvalid(null);
    setFollowUpError(null);
    setActiveSection("basics");
    scrollRef.current?.scrollTo({ top: 0 });
    // Only a new open or another service resets; version changes are merged below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, template]);

  // Someone else saved while this was open: keep the user's edits, take their changes
  // to anything the user didn't touch, and list clashes so the user can choose.
  useEffect(() => {
    if (!open || !service || !base || service.id !== base.id) return;
    if (service.version === base.version) return;
    const baseDraft = draftFrom(base, true);
    const theirs = draftFrom(service, true);
    const userEdited = !sameValue(draft, initial);
    setBase(service);
    setInitial(theirs);
    if (!userEdited) {
      setDraft(theirs);
      return;
    }
    const result = mergeDrafts(baseDraft, draft, theirs, sameValue);
    setDraft(result.merged);
    if (result.taken.length > 0 || result.conflicts.length > 0) {
      setConflict({ taken: result.taken, conflicts: result.conflicts, theirs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.version]);

  const optionErrors = optionRowErrors(draft.variants);
  const overlaps = overlappingWindows(draft.windows);
  const reconcile = useMemo(
    () =>
      staffNeedingReconcile(
        service?.id ?? null,
        draft.staffMode === "selected" ? draft.staffIds : [],
        activeStaff,
      ),
    [service?.id, draft.staffMode, draft.staffIds, activeStaff],
  );
  const pairedWith = useMemo(() => {
    if (!service) return [];
    const byId = new Map((catalogue.data ?? []).map((s) => [s.id, s]));
    return (pairings.data ?? [])
      .filter((p) => p.upsellServiceId === service.id)
      .map((p) => byId.get(p.serviceId))
      .filter((s): s is CatalogueService => Boolean(s && !s.archivedAt));
  }, [pairings.data, catalogue.data, service]);

  const priceMinor = parseMoney(draft.price);
  const depositMinor = draft.deposit.trim() ? parseMoney(draft.deposit) : 0;
  const durationMinutes = (() => {
    const n = Number(draft.durationValue.trim());
    if (!draft.durationValue.trim() || !Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * UNIT_MINUTES[draft.durationUnit]) || null;
  })();

  const errors = useMemo(() => {
    const out: Record<string, FieldError> = {};
    const add = (key: string, message: string, section: SectionId, target = key) => {
      out[key] = { message, section, target };
    };
    if (!draft.name.trim()) add("name", "Give it a name.", "basics", "s-name");
    else if (draft.name.trim().length > 80) {
      add("name", "Keep the name to 80 characters.", "basics", "s-name");
    }
    if (draft.description.length > 500) {
      add("description", "Keep the description to 500 characters.", "basics", "s-desc");
    }
    if (durationMinutes === null) {
      add("durationMinutes", "Enter how long it takes.", "price", "s-dur");
    }
    if (!draft.price.trim() || priceMinor === null || priceMinor < 0) {
      add("basePriceMinor", "Enter a price. It can be 0.", "price", "s-price");
    }
    if (draft.deposit.trim()) {
      if (depositMinor === null || depositMinor < 0) {
        add("depositMinor", "Enter a deposit like 10 or 10.50.", "price", "s-deposit");
      } else if (priceMinor !== null && depositMinor > 0 && depositMinor >= priceMinor) {
        add("depositMinor", "Must be less than the price.", "price", "s-deposit");
      } else if (depositMinor > 0) {
        const cheaper = draft.variants.find((v) => {
          if (!v.name.trim() || !v.priceMinor.trim()) return false;
          const p = parseMoney(v.priceMinor);
          return p !== null && depositMinor >= p;
        });
        if (cheaper) {
          add(
            "depositMinor",
            `Must be less than the ${cheaper.name.trim()} price (${formatMoney(
              parseMoney(cheaper.priceMinor) ?? 0,
              currency,
              { compact: true },
            )}).`,
            "price",
            "s-deposit",
          );
        }
      }
    }
    if (!isDetailing && draft.mode === "lead_pays_party") {
      const n = Number(draft.partySize);
      if (!Number.isInteger(n) || n < 2 || n > 100) {
        add("capacityMax", "Enter 2 or more people.", "price", "s-party");
      }
    }
    if (!isDetailing && draft.mode === "group") {
      const n = Number(draft.classSize);
      if (!Number.isInteger(n) || n < 2 || n > 1000) {
        add("capacityMax", "Enter 2 or more places.", "price", "s-class");
      }
    }
    optionErrors.forEach((message, i) => {
      if (message) add(`variant-${i}`, message, "price", `s-variant-${i}`);
    });
    draft.variants.forEach((v, i) => {
      if (!v.name.trim() || optionErrors[i]) return;
      if (v.priceMinor.trim() && parseMoney(v.priceMinor) === null) {
        add(`variant-${i}`, "Enter a price like 45 or 45.50.", "price", `s-variant-${i}`);
      }
    });
    if (!soleStaff && draft.staffMode === "selected" && draft.staffIds.length === 0) {
      add("eligibleStaffIds", "Pick at least one person.", "who", "s-staff");
    }
    if (
      activeLocations.length > 1 &&
      draft.offeredMode === "some" &&
      draft.offeredIds.length === 0
    ) {
      add("locationIds", "Pick at least one location.", "who", "s-locations");
    }
    if (draft.restrictWindows) {
      if (draft.windows.length === 0) {
        add("availabilityWindows", "Add at least one time, or switch this off.", "who", "s-when");
      } else if (draft.windows.some((w) => !isValidAvailabilityWindow(w))) {
        add("availabilityWindows", "Each time needs a start before its end.", "who", "s-when");
      } else if (overlaps.size > 0) {
        add("availabilityWindows", "These times overlap.", "who", "s-when");
      }
    }
    for (const [field, message] of Object.entries(serverErrors)) {
      if (!out[field]) add(field, message, sectionForField(field), targetForField(field));
    }
    return out;
  }, [
    draft,
    durationMinutes,
    priceMinor,
    depositMinor,
    optionErrors,
    overlaps,
    soleStaff,
    activeLocations.length,
    isDetailing,
    currency,
    serverErrors,
  ]);

  const visibleErrors = showErrors ? errors : {};
  const err = (key: string) => visibleErrors[key]?.message;
  const errorCount =
    Object.keys(visibleErrors).length +
    (showErrors && usageInvalid !== null ? 1 : 0) +
    (showErrors && upsellInvalid ? 1 : 0) +
    (showErrors && followUpError ? 1 : 0);
  const sectionHasError = (id: SectionId) =>
    Object.values(visibleErrors).some((e) => e.section === id) ||
    (id === "extras" &&
      showErrors &&
      (usageInvalid !== null || upsellInvalid !== null || followUpError !== null));

  const dirty = !sameValue(draft, initial) || usageDirty || upsellsDirty;
  const submitting = createService.isPending || updateService.isPending || replaceUpsells.isPending;

  const sections: { id: SectionId; label: string }[] = [
    { id: "basics", label: "Basics" },
    { id: "price", label: "Price" },
    { id: "who", label: "Who and when" },
    { id: "rules", label: "Rules" },
    { id: "extras", label: "Extras" },
    { id: "visibility", label: "Visibility" },
  ];

  // Highlight the shortcut for whichever section is at the top of the scroll area.
  useEffect(() => {
    const root = scrollRef.current;
    if (!open || !root) return;
    const onScroll = () => {
      const top = root.getBoundingClientRect().top;
      let current: SectionId = "basics";
      for (const s of sections) {
        const el = root.querySelector<HTMLElement>(`[data-section="${s.id}"]`);
        if (el && el.getBoundingClientRect().top - top <= 80) current = s.id;
      }
      setActiveSection(current);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const jumpTo = (id: SectionId) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };
  const focusField = (target: string) => {
    const el = document.getElementById(target);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el && "focus" in el) (el as HTMLElement).focus({ preventScroll: true });
  };

  const requestClose = () => {
    if (!readOnly && dirty && !submitting) setConfirmDiscard(true);
    else onClose();
  };

  const handleSubmit = async () => {
    setShowErrors(true);
    const usage = consumablesOn && usageDirty ? rowsToItems(usageRows) : null;
    setUsageInvalid(usage && !usage.ok ? usage.index : null);
    const upsells = upsellsDirty ? rowsToUpsellItems(upsellRows) : null;
    setUpsellInvalid(
      upsells && !upsells.ok ? { index: upsells.index, message: upsells.message } : null,
    );
    const followUps = rulesFromDrafts(draft.followUps);
    setFollowUpError(
      followUps.ok
        ? null
        : { index: followUps.index, field: followUps.field, message: followUps.message },
    );
    if (
      Object.keys(errors).length > 0 ||
      (usage && !usage.ok) ||
      (upsells && !upsells.ok) ||
      !followUps.ok
    ) {
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        summaryRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    const capacityMax = (() => {
      if (isDetailing) return service?.capacityMax ?? 1;
      if (draft.mode === "group") return Number(draft.classSize);
      if (draft.mode === "lead_pays_party") return Number(draft.partySize);
      // 1-to-1 keeps whatever an existing 1-to-1 service already had.
      return service && (service.bookingMode ?? "individual") === "individual"
        ? service.capacityMax
        : 1;
    })();
    const variants = draft.variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        durationMinutes: v.durationValue.trim()
          ? Math.round(Number(v.durationValue) * UNIT_MINUTES[v.durationUnit]) || null
          : null,
        priceMinor: v.priceMinor.trim() ? parseMoney(v.priceMinor) : null,
      }));

    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      category: normaliseCategory(draft.category),
      durationMinutes,
      basePriceMinor: priceMinor,
      depositMinor: depositMinor ?? 0,
      capacityMax,
      active: draft.active,
      publicVisible: draft.publicVisible,
      variants,
      availabilityWindows: draft.restrictWindows ? draft.windows : [],
      followUps: followUps.ok ? followUps.rules : [],
      eligibleStaffIds: soleStaff
        ? (service?.eligibleStaffIds ?? [])
        : draft.staffMode === "selected"
          ? draft.staffIds
          : [],
    };
    if (!isDetailing) body.bookingMode = draft.mode;
    if (activeLocations.length > 1) {
      body.locationIds = draft.offeredMode === "all" ? [] : draft.offeredIds;
    }
    if (showResourceField) {
      body.requiredResourceType = draft.needsResource
        ? (service?.requiredResourceType ?? (words.one === "bay" ? "bay" : "room"))
        : null;
    }
    // Only rules the user touched: a rule left alone keeps following (or overriding) as before.
    for (const key of BOOKING_RULE_KEYS) {
      if (isEdit && draft.rules[key] === initial.rules[key]) continue;
      const value = draft.rules[key];
      if (key === "cancellationWindowHours") {
        body.cancellationPolicy = value === null ? null : { windowHours: value };
      } else {
        body[key] = value;
      }
    }
    if (usage?.ok) {
      body.consumables = usage.items.map((it) => ({
        consumableId: it.consumableId,
        quantity: it.quantity,
      }));
    }
    if (isEdit && upsells?.ok && upsellsEntitled !== false) body.upsells = upsells.items;

    try {
      let saved: CatalogueService;
      if (service && base) {
        saved = await updateService.mutateAsync({
          serviceId: service.id,
          version: base.version,
          body,
        });
        toast.success("Changes saved");
      } else {
        saved = await createService.mutateAsync({
          ...body,
          currency,
          capacityMin: 1,
        });
        toast.success(`${saved.name} created`);
        if (upsells?.ok && upsells.items.length > 0) {
          try {
            await replaceUpsells.mutateAsync({ serviceId: saved.id, items: upsells.items });
          } catch (e) {
            if (isFeatureNotAvailable(e)) setUpsellsPaywall(true);
            else toast.warning("The add-ons didn't save. Open it and add them again.");
          }
        }
      }
      setUsageDirty(false);
      setUpsellsDirty(false);
      setInitial(draft);
      onSaved(saved, !isEdit);
    } catch (e) {
      if (isFeatureNotAvailable(e)) {
        setUpsellsPaywall(true);
        return;
      }
      if (e instanceof ApiError && e.fieldErrors.length > 0) {
        setServerErrors(
          Object.fromEntries(
            e.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field!, fe.message || "Check this."]),
          ),
        );
      }
    }
  };

  const disabled = readOnly || submitting;
  const usedAsAddOnWarning =
    !isDetailing && pairedWith.length > 0 && draft.mode !== "individual"
      ? `It's offered as an add-on with ${
          pairedWith.length === 1
            ? pairedWith[0]!.name
            : `${pairedWith.length} other ${pluralLower}`
        }. Only 1-to-1 ${pluralLower} can be add-ons, so changing this means it won't be offered there any more.`
      : null;
  const hoursOwnerIsMe = Boolean(soleStaff && user && soleStaff.userId === user.id);
  const soleHours = soleStaff
    ? summariseWindows(workingRulesToWindows(soleStaff.workingRules))
    : [];
  const visibleVariants = showAllOptions ? draft.variants : draft.variants.slice(0, 4);

  const errorList = Object.values(visibleErrors);
  const extraErrorLines = [
    showErrors && usageInvalid !== null
      ? { message: "Each consumable needs a quantity above zero.", target: "s-consumables" }
      : null,
    showErrors && upsellInvalid ? { message: upsellInvalid.message, target: "s-upsells" } : null,
    showErrors && followUpError ? { message: followUpError.message, target: "s-followups" } : null,
  ].filter((l): l is { message: string; target: string } => l !== null);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
      >
        <SheetContent
          side={phone ? "bottom" : "right"}
          className={cn(
            "flex w-full flex-col gap-0 p-0",
            phone ? "inset-0 h-dvh rounded-none" : "sm:max-w-[560px]",
          )}
          onInteractOutside={(e) => {
            if (dirty && !readOnly) e.preventDefault();
          }}
        >
          <SheetHeader className="border-b px-4 pt-6 pb-3 text-left sm:px-6">
            <SheetTitle className="text-xl font-extrabold">
              {readOnly ? noun : isEdit ? `Edit ${lower}` : `Create ${lower}`}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? `${service!.name} · booked ${usage?.bookingCount ?? 0} ${
                    (usage?.bookingCount ?? 0) === 1 ? "time" : "times"
                  }`
                : "Fields with * are needed. Everything else can wait."}
            </SheetDescription>
            <nav aria-label="Form sections" className="-mx-1 mt-2 overflow-x-auto no-scrollbar">
              <ul className="flex gap-1.5 px-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(s.id)}
                      aria-current={activeSection === s.id ? "true" : undefined}
                      className={cn(
                        "relative inline-flex h-[30px] cursor-pointer items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
                        activeSection === s.id
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {s.label}
                      {sectionHasError(s.id) ? (
                        <span
                          aria-label="has an error"
                          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-background"
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </SheetHeader>

          <div
            ref={scrollRef}
            className="no-scrollbar grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-4 py-5 sm:px-6"
          >
            {conflict ? (
              <div
                role="status"
                className="grid gap-2 rounded-xl border border-[#c9d4fb] bg-[#eef2fe] p-3 text-sm text-[#2b3f8f] dark:border-[rgba(99,135,255,0.3)] dark:bg-[rgba(99,135,255,0.12)] dark:text-[#c4d0ff]"
              >
                <p className="font-bold">Someone else saved this {lower} while you were editing.</p>
                <p>
                  {conflict.taken.length > 0
                    ? `Their changes to ${listFields(conflict.taken)} are added. `
                    : ""}
                  {conflict.conflicts.length > 0
                    ? `You both changed ${listFields(conflict.conflicts)}. Your other changes are still here.`
                    : "Your changes are still here."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConflict(null)}
                  >
                    Keep mine
                  </Button>
                  {conflict.conflicts.slice(0, 3).map((key) => (
                    <Button
                      key={String(key)}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        set({ [key]: conflict.theirs[key] } as Partial<Draft>);
                        const rest = conflict.conflicts.filter((k) => k !== key);
                        setConflict(rest.length > 0 ? { ...conflict, conflicts: rest } : null);
                      }}
                    >
                      Use their {FIELD_LABELS[key] ?? String(key)}
                    </Button>
                  ))}
                  {conflict.conflicts.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const patch: Partial<Draft> = {};
                        for (const key of conflict.conflicts) {
                          (patch as Record<string, unknown>)[key] = conflict.theirs[key];
                        }
                        set(patch);
                        setConflict(null);
                      }}
                    >
                      Use all of theirs
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showErrors && (errorList.length > 0 || extraErrorLines.length > 0) ? (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                className="grid gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm outline-none"
              >
                <p className="font-bold text-destructive">
                  {errorCount} {errorCount === 1 ? "thing" : "things"} to fix before saving
                </p>
                <ul className="grid gap-1">
                  {[...errorList, ...extraErrorLines].map((e, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="cursor-pointer text-left text-destructive underline underline-offset-2"
                        onClick={() => focusField(e.target)}
                      >
                        {e.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {readOnly ? (
              <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                <Lock className="size-4" /> You can see this {lower} but not change it.
              </p>
            ) : null}

            <fieldset disabled={disabled} className="grid min-w-0 gap-6">
              {/* Basics */}
              <Section id="basics" title="Basics">
                <Field id="s-name" label="Name" required error={err("name")}>
                  <Input
                    id="s-name"
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder={namePlaceholder}
                    aria-invalid={Boolean(err("name"))}
                  />
                </Field>
                <Field
                  id="s-desc"
                  label="Description"
                  optional
                  help="Shown on your booking page."
                  error={err("description")}
                  aside={
                    draft.description.length > 400 ? (
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          draft.description.length > 500
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {draft.description.length}/500
                      </span>
                    ) : null
                  }
                >
                  <Textarea
                    id="s-desc"
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value })}
                    aria-invalid={Boolean(err("description"))}
                  />
                </Field>
                <div className="grid gap-2">
                  <span className="text-sm font-semibold" id="s-category-label">
                    Category <Optional />
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="s-category-label"
                    className="flex flex-wrap gap-1.5"
                  >
                    {categorySuggestions.map((c) => {
                      const on =
                        normaliseCategory(draft.category)?.toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setNewCategory(null);
                            set({ category: on ? "" : c });
                          }}
                          className={cn(
                            "min-h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold transition-colors",
                            on
                              ? "border-primary bg-primary-soft text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          {c}
                        </button>
                      );
                    })}
                    {(() => {
                      const typed = normaliseCategory(draft.category);
                      const isNew =
                        typed &&
                        !categorySuggestions.some((c) => c.toLowerCase() === typed.toLowerCase());
                      return isNew && newCategory === null ? (
                        <button
                          type="button"
                          role="radio"
                          aria-checked
                          onClick={() => set({ category: "" })}
                          className="min-h-8 cursor-pointer rounded-full border border-primary bg-primary-soft px-3 text-[13px] font-semibold text-primary"
                        >
                          {typed}
                        </button>
                      ) : null;
                    })()}
                    {newCategory === null ? (
                      <button
                        type="button"
                        onClick={() => setNewCategory("")}
                        className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-dashed px-3 text-[13px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Plus className="size-3.5" /> New
                      </button>
                    ) : null}
                  </div>
                  {newCategory !== null ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        aria-label="New category"
                        value={newCategory}
                        placeholder={isDetailing ? "Polishing" : "Classes"}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const value = normaliseCategory(newCategory);
                            const match = categorySuggestions.find(
                              (c) => c.toLowerCase() === value?.toLowerCase(),
                            );
                            set({ category: match ?? value ?? "" });
                            setNewCategory(null);
                          }
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setNewCategory(null);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const value = normaliseCategory(newCategory);
                          const match = categorySuggestions.find(
                            (c) => c.toLowerCase() === value?.toLowerCase(),
                          );
                          set({ category: match ?? value ?? "" });
                          setNewCategory(null);
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Groups {pluralLower} on your booking page and in the calendar filter.
                  </p>
                </div>
              </Section>

              {/* Price and length */}
              <Section id="price" title="Price and length">
                <div className={cn("grid gap-4", isDetailing || phone ? "" : "sm:grid-cols-3")}>
                  <Field
                    id="s-dur"
                    label={isDetailing ? "How long you have the vehicle" : "Length"}
                    required
                    error={err("durationMinutes")}
                  >
                    <div className="flex gap-2">
                      <Input
                        id="s-dur"
                        inputMode="decimal"
                        value={draft.durationValue}
                        onChange={(e) => set({ durationValue: e.target.value })}
                        aria-invalid={Boolean(err("durationMinutes"))}
                        className="min-w-0 flex-1"
                      />
                      <Select
                        value={draft.durationUnit}
                        onValueChange={(v) => set({ durationUnit: v as DurationUnit })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="w-24 shrink-0" aria-label="Unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">min</SelectItem>
                          <SelectItem value="hours">hours</SelectItem>
                          <SelectItem value="days">days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                  <Field
                    id="s-price"
                    label="Price"
                    required
                    error={err("basePriceMinor")}
                    help={priceMinor === 0 ? "Shows as Free." : undefined}
                  >
                    <MoneyInput
                      id="s-price"
                      symbol={symbol}
                      value={draft.price}
                      onChange={(v) => set({ price: v })}
                      invalid={Boolean(err("basePriceMinor"))}
                    />
                  </Field>
                  <Field
                    id="s-deposit"
                    label="Deposit"
                    optional
                    error={err("depositMinor")}
                    help="Taken when they book. The rest is paid later."
                  >
                    <MoneyInput
                      id="s-deposit"
                      symbol={symbol}
                      value={draft.deposit}
                      placeholder="0"
                      onChange={(v) => set({ deposit: v })}
                      invalid={Boolean(err("depositMinor"))}
                    />
                  </Field>
                </div>

                {isDetailing ? null : (
                  <div className="grid gap-2">
                    <span className="text-sm font-semibold" id="s-mode-label">
                      How it's booked
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby="s-mode-label"
                      className="grid gap-2 sm:grid-cols-3"
                    >
                      {(
                        [
                          ["individual", "1-to-1", "One client books it"],
                          [
                            "lead_pays_party",
                            "Bring friends",
                            "One client books and pays for the group",
                          ],
                          ["group", "Group class", "Each person books their own place"],
                        ] as const
                      ).map(([value, title, help]) => (
                        <OptionCard
                          key={value}
                          checked={draft.mode === value}
                          onSelect={() => set({ mode: value })}
                          title={title}
                          help={help}
                        />
                      ))}
                    </div>
                    {draft.mode === "lead_pays_party" ? (
                      <InlineNumber
                        id="s-party"
                        before="Up to"
                        after="people. Price is for the whole group."
                        value={draft.partySize}
                        onChange={(v) => set({ partySize: v })}
                        error={err("capacityMax")}
                      />
                    ) : null}
                    {draft.mode === "group" ? (
                      <InlineNumber
                        id="s-class"
                        before=""
                        after="places in each class. Price is per person."
                        value={draft.classSize}
                        onChange={(v) => set({ classSize: v })}
                        error={err("capacityMax")}
                      />
                    ) : null}
                    {usedAsAddOnWarning ? <Warning>{usedAsAddOnWarning}</Warning> : null}
                  </div>
                )}

                <div className="grid gap-2 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      Options <Optional />
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        set({
                          variants: [
                            ...draft.variants,
                            {
                              name: "",
                              durationValue: "",
                              durationUnit: draft.durationUnit,
                              priceMinor: "",
                            },
                          ],
                        });
                        setShowAllOptions(true);
                      }}
                    >
                      <Plus className="size-3.5" /> Add option
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Different lengths or sizes with their own price. Leave a box blank to use the
                    main one.
                  </p>
                  {draft.variants.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No options. Clients book it as it is.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {visibleVariants.map((v, i) => (
                        <div key={i} className="grid gap-1">
                          <div className="flex items-end gap-2">
                            <div className="grid min-w-0 flex-1 gap-1">
                              <Label
                                className="text-xs text-muted-foreground"
                                htmlFor={`s-variant-${i}`}
                              >
                                Name
                              </Label>
                              <Input
                                id={`s-variant-${i}`}
                                value={v.name}
                                aria-invalid={Boolean(err(`variant-${i}`))}
                                onChange={(e) => updateVariant(i, { name: e.target.value })}
                                placeholder={isDetailing ? "Large vehicle / SUV" : "60 minutes"}
                              />
                            </div>
                            <div className="grid w-16 gap-1">
                              <Label className="text-xs text-muted-foreground">Length</Label>
                              <Input
                                inputMode="decimal"
                                aria-label="Length"
                                value={v.durationValue}
                                placeholder="Same"
                                onChange={(e) =>
                                  updateVariant(i, { durationValue: e.target.value })
                                }
                              />
                            </div>
                            <div className="grid w-[84px] gap-1">
                              <Label className="text-xs text-muted-foreground">Unit</Label>
                              <Select
                                value={v.durationUnit}
                                disabled={disabled}
                                onValueChange={(unit) =>
                                  updateVariant(i, { durationUnit: unit as DurationUnit })
                                }
                              >
                                <SelectTrigger aria-label="Unit">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minutes">min</SelectItem>
                                  <SelectItem value="hours">hours</SelectItem>
                                  <SelectItem value="days">days</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid w-20 gap-1">
                              <Label className="text-xs text-muted-foreground">Price</Label>
                              <MoneyInput
                                symbol={symbol}
                                ariaLabel="Price"
                                value={v.priceMinor}
                                placeholder="Same"
                                onChange={(val) => updateVariant(i, { priceMinor: val })}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${v.name || "option"}`}
                              onClick={() =>
                                set({ variants: draft.variants.filter((_, j) => j !== i) })
                              }
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                          {err(`variant-${i}`) ? (
                            <p className="text-xs text-destructive">{err(`variant-${i}`)}</p>
                          ) : null}
                        </div>
                      ))}
                      {!showAllOptions && draft.variants.length > 4 ? (
                        <button
                          type="button"
                          className="cursor-pointer justify-self-start text-sm font-semibold text-primary"
                          onClick={() => setShowAllOptions(true)}
                        >
                          Show all {draft.variants.length}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </Section>

              {/* Who and where, and when */}
              <Section id="who" title="Who and where">
                {soleStaff ? null : (
                  <div className="grid gap-2" id="s-staff" tabIndex={-1}>
                    <span className="text-sm font-semibold" id="s-who-label">
                      Who can do it
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby="s-who-label"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <OptionCard
                        checked={draft.staffMode === "all"}
                        onSelect={() => set({ staffMode: "all" })}
                        title={`All ${staffPluralLower}`}
                        help="Including people you add later."
                      />
                      <OptionCard
                        checked={draft.staffMode === "selected"}
                        onSelect={() => set({ staffMode: "selected" })}
                        title="Only certain people"
                        help="Pick who can be booked."
                      />
                    </div>
                    {draft.staffMode === "selected" ? (
                      activeStaff.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No {staffPluralLower} yet. Add your team first.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {activeStaff.map((m) => {
                            const on = draft.staffIds.includes(m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  set({
                                    staffIds: on
                                      ? draft.staffIds.filter((id) => id !== m.id)
                                      : [...draft.staffIds, m.id],
                                  })
                                }
                                className={cn(
                                  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold transition-colors",
                                  on
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "text-muted-foreground hover:bg-secondary",
                                )}
                              >
                                <TeamAvatar
                                  name={m.displayName}
                                  photoUrl={m.photoUrl}
                                  colour={(m as Staff & { colour?: string | null }).colour}
                                  size={32}
                                />
                                {m.displayName}
                              </button>
                            );
                          })}
                        </div>
                      )
                    ) : null}
                    {err("eligibleStaffIds") ? (
                      <p className="text-xs text-destructive">{err("eligibleStaffIds")}</p>
                    ) : null}
                    {reconcile.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {reconcile.length === 1
                          ? `${reconcile[0]!.displayName} only does certain ${pluralLower}. Saving adds this one to ${reconcile[0]!.displayName}'s list.`
                          : `${reconcile.map((m) => m.displayName).join(", ")} only do certain ${pluralLower}. Saving adds this one to their lists.`}
                      </p>
                    ) : null}
                  </div>
                )}

                {activeLocations.length > 1 ? (
                  <div className="grid gap-2" id="s-locations" tabIndex={-1}>
                    <span className="text-sm font-semibold" id="s-offered-label">
                      Offered at
                    </span>
                    <div
                      role="radiogroup"
                      aria-labelledby="s-offered-label"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <OptionCard
                        checked={draft.offeredMode === "all"}
                        onSelect={() => set({ offeredMode: "all" })}
                        title="All locations"
                        help="Including any you add later."
                      />
                      <OptionCard
                        checked={draft.offeredMode === "some"}
                        onSelect={() => set({ offeredMode: "some" })}
                        title="Only some locations"
                        help="Clients only see it where it's offered."
                      />
                    </div>
                    {draft.offeredMode === "some" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeLocations.map((l) => (
                          <label key={l.id} className="flex min-h-9 items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft.offeredIds.includes(l.id)}
                              onCheckedChange={(checked) =>
                                set({
                                  offeredIds: checked
                                    ? [...draft.offeredIds, l.id]
                                    : draft.offeredIds.filter((id) => id !== l.id),
                                })
                              }
                            />
                            {l.name}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {err("locationIds") ? (
                      <p className="text-xs text-destructive">{err("locationIds")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Staff can still book it elsewhere after a warning.
                      </p>
                    )}
                  </div>
                ) : null}

                {showResourceField ? (
                  <SwitchRow
                    id="s-needs-resource"
                    title={`Needs a ${words.one}`}
                    help={`Each ${bookingLower} takes a free ${words.one} at its location. Times with none free aren't offered.`}
                    checked={draft.needsResource}
                    onChange={(v) => set({ needsResource: v })}
                  />
                ) : null}

                <div className="grid gap-3" id="s-when" tabIndex={-1}>
                  <SwitchRow
                    id="s-restrict"
                    title="Only at certain times"
                    help={`Off: whenever the ${staffWord.toLowerCase()} is working. On: narrow it, e.g. early mornings only.`}
                    checked={draft.restrictWindows}
                    onChange={(v) => {
                      set({ restrictWindows: v });
                      if (v && draft.windows.length === 0) setEditingWindows(true);
                    }}
                  />
                  {draft.restrictWindows ? (
                    editingWindows || draft.windows.length === 0 || err("availabilityWindows") ? (
                      <WeeklyWindowsEditor
                        windows={draft.windows}
                        onChange={(windows) => set({ windows })}
                        error={
                          err("availabilityWindows") === "These times overlap."
                            ? undefined
                            : err("availabilityWindows")
                        }
                        businessHours={businessHours}
                        presets={[
                          { label: "Weekdays only", windows: weekdays() },
                          { label: "Weekends only", windows: weekends() },
                        ]}
                        className="border-t-0 pt-0"
                        copy={{
                          label: `When this ${lower} is offered`,
                          matchesPreset: (preset) =>
                            `Same as ${preset} opening hours. Clients can only book it inside these times.`,
                          hint: `Clients can only book this ${lower} inside these times.`,
                          empty: "No times yet. Add some, or pick a starting point above.",
                        }}
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
                        <ul className="grid gap-0.5 text-sm">
                          {summariseWindows(draft.windows).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingWindows(true)}
                        >
                          Edit
                        </Button>
                      </div>
                    )
                  ) : null}
                  {soleStaff ? (
                    <p className="text-sm text-muted-foreground">
                      {hoursOwnerIsMe ? "Your hours" : `${soleStaff.displayName}'s hours`}:{" "}
                      {soleHours.length > 0
                        ? soleHours.join("; ")
                        : "none set yet, so nobody can book"}{" "}
                      ·{" "}
                      <Link
                        to="/team"
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        Edit
                      </Link>
                    </p>
                  ) : null}
                </div>
              </Section>

              {/* Booking rules */}
              <Section
                id="rules"
                title="Booking rules"
                aside={
                  <Link
                    to="/settings/$page"
                    params={{ page: "booking-rules" }}
                    className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Business defaults in Settings
                  </Link>
                }
              >
                <RuleRow
                  label="Time between bookings"
                  help="Set up and clear down"
                  changed={
                    draft.rules.bufferBeforeMinutes !== null ||
                    draft.rules.bufferAfterMinutes !== null
                  }
                >
                  <div className="flex gap-2">
                    <RuleSelect
                      ariaLabel="Before"
                      prefix="Before"
                      kind="buffer"
                      options={BUFFER_OPTIONS}
                      value={draft.rules.bufferBeforeMinutes}
                      fallback={defaults.bufferBeforeMinutes}
                      disabled={disabled}
                      onChange={(v) => setRule("bufferBeforeMinutes", v)}
                    />
                    <RuleSelect
                      ariaLabel="After"
                      prefix="After"
                      kind="buffer"
                      options={BUFFER_OPTIONS}
                      value={draft.rules.bufferAfterMinutes}
                      fallback={defaults.bufferAfterMinutes}
                      disabled={disabled}
                      onChange={(v) => setRule("bufferAfterMinutes", v)}
                    />
                  </div>
                </RuleRow>
                <RuleRow
                  label="Notice needed"
                  help="How soon before it starts"
                  changed={draft.rules.bookingNoticeMinutes !== null}
                >
                  <RuleSelect
                    ariaLabel="Notice needed"
                    kind="notice"
                    options={NOTICE_OPTIONS}
                    value={draft.rules.bookingNoticeMinutes}
                    fallback={defaults.bookingNoticeMinutes}
                    disabled={disabled}
                    onChange={(v) => setRule("bookingNoticeMinutes", v)}
                  />
                </RuleRow>
                <RuleRow
                  label="Book up to"
                  help="How far ahead"
                  changed={draft.rules.bookingHorizonDays !== null}
                >
                  <RuleSelect
                    ariaLabel="Book up to"
                    kind="horizon"
                    options={HORIZON_OPTIONS}
                    value={draft.rules.bookingHorizonDays}
                    fallback={defaults.bookingHorizonDays}
                    disabled={disabled}
                    onChange={(v) => setRule("bookingHorizonDays", v)}
                  />
                </RuleRow>
                <RuleRow
                  label="Late cancellation"
                  help="Inside this counts as late"
                  changed={draft.rules.cancellationWindowHours !== null}
                >
                  <RuleSelect
                    ariaLabel="Late cancellation"
                    kind="cancellation"
                    options={CANCELLATION_OPTIONS}
                    value={draft.rules.cancellationWindowHours}
                    fallback={defaults.cancellationWindowHours}
                    disabled={disabled}
                    onChange={(v) => setRule("cancellationWindowHours", v)}
                  />
                </RuleRow>
              </Section>

              {/* Extras */}
              <Section id="extras" title="Extras">
                <div className="grid gap-2" id="s-upsells" tabIndex={-1}>
                  <span className="text-sm font-semibold">Add-ons to suggest</span>
                  <p className="text-xs text-muted-foreground">
                    Offered as extras on the booking page, and by email when you book them in.
                  </p>
                  {upsellsEntitled === false ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Lock className="size-4 text-muted-foreground" />
                        Suggest add-ons when clients book. Included in Business and Growth.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUpsellsPaywall(true)}
                      >
                        <Sparkles className="size-4" /> See plans
                      </Button>
                    </div>
                  ) : null}
                  {upsellsEntitled === false &&
                  upsellRows.length === 0 ? null : serviceUpsells.isLoading ||
                    catalogue.isLoading ? (
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
                      currency={currency}
                      invalidIndex={upsellInvalid?.index ?? null}
                      disabled={upsellsEntitled === false || disabled}
                      idPrefix="su"
                    />
                  )}
                  {showErrors && upsellInvalid ? (
                    <p className="text-xs text-destructive">{upsellInvalid.message}</p>
                  ) : null}
                </div>

                {remindersAvailable(tenant.business?.industryTemplateKey) ? (
                  <div id="s-followups" tabIndex={-1} className="grid gap-1">
                    <FollowUpRuleEditor
                      drafts={draft.followUps}
                      onChange={(next) => {
                        set({ followUps: next });
                        setFollowUpError(null);
                      }}
                      error={followUpError}
                      serviceNoun={lower}
                      idPrefix="sfu"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown on the Reminders page too.
                    </p>
                  </div>
                ) : null}

                {consumablesOn ? (
                  <div className="grid gap-2" id="s-consumables" tabIndex={-1}>
                    <span className="text-sm font-semibold">Consumables used</span>
                    <p className="text-xs text-muted-foreground">
                      What one job usually uses. Every new job starts with this list, and you can
                      change it on the day.
                    </p>
                    {serviceUsageLines.isLoading || consumableCatalogue.isLoading ? (
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
                        priceMinor={priceMinor}
                        currency={currency}
                        canMoney={tenant.can(PERMISSIONS.PAYMENT_READ)}
                        canAddToCatalogue={tenant.can(PERMISSIONS.BUSINESS_UPDATE)}
                        invalid={usageInvalid !== null}
                      />
                    )}
                    {usageInvalid !== null ? (
                      <p className="text-xs text-destructive">
                        Each line needs a quantity above zero.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </Section>

              {/* Visibility */}
              <Section id="visibility" title="Who can book it">
                <SwitchRow
                  id="s-active"
                  title="Taking bookings"
                  help="Off pauses it everywhere. Existing bookings stay."
                  checked={draft.active}
                  onChange={(v) => set({ active: v })}
                />
                <SwitchRow
                  id="s-public"
                  title="Show on your booking page"
                  help="Off: only staff and offer links can book it."
                  checked={draft.publicVisible}
                  onChange={(v) => set({ publicVisible: v })}
                />
              </Section>
            </fieldset>
          </div>

          <div className="flex items-center gap-2 border-t px-4 py-3 sm:px-6">
            {readOnly ? (
              <Button className="w-full sm:ml-auto sm:w-auto" variant="outline" onClick={onClose}>
                Close
              </Button>
            ) : (
              <>
                {isEdit && !phone ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="More actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => onDuplicate?.(service!)}>
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onArchive?.(service!)}>
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => onDelete?.(service!)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {phone ? null : (
                  <Button type="button" variant="ghost" className="ml-auto" onClick={requestClose}>
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  className={cn(phone && "w-full")}
                  disabled={submitting}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? "Saving…" : isEdit ? "Save changes" : `Create ${lower}`}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this {lower} haven't been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpsellsUpgradeDialog open={upsellsPaywall} onOpenChange={setUpsellsPaywall} />
    </>
  );

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    set({ variants: draft.variants.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }

  function setRule(key: BookingRuleKey, value: number | null) {
    // Picking the business default is the same as following it.
    const next = value !== null && value === defaults[key] ? null : value;
    set({ rules: { ...draft.rules, [key]: next } });
  }
}

function listFields(keys: (keyof Draft)[]): string {
  const labels = [...new Set(keys.map((k) => FIELD_LABELS[k] ?? String(k)))];
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function sectionForField(field: string): SectionId {
  if (["name", "description", "category"].includes(field)) return "basics";
  if (
    field.startsWith("variants") ||
    ["durationMinutes", "basePriceMinor", "depositMinor", "capacityMax", "bookingMode"].includes(
      field,
    )
  )
    return "price";
  if (
    ["eligibleStaffIds", "locationIds", "availabilityWindows", "requiredResourceType"].includes(
      field,
    )
  )
    return "who";
  if (field.startsWith("buffer") || field.startsWith("booking") || field.startsWith("cancellation"))
    return "rules";
  if (
    field.startsWith("followUps") ||
    field.startsWith("upsells") ||
    field.startsWith("consumables")
  )
    return "extras";
  return "basics";
}

function targetForField(field: string): string {
  const map: Record<string, string> = {
    name: "s-name",
    description: "s-desc",
    durationMinutes: "s-dur",
    basePriceMinor: "s-price",
    depositMinor: "s-deposit",
    eligibleStaffIds: "s-staff",
    locationIds: "s-locations",
    availabilityWindows: "s-when",
  };
  return map[field] ?? "s-name";
}

function weekdays(): AvailabilityWindow[] {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 }));
}
function weekends(): AvailabilityWindow[] {
  return [6, 7].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 }));
}

/**
 * Staff who are meant to deliver a service (everyone when `eligibleStaffIds` is
 * empty) but whose own `eligibleServiceIds` list is restricted and misses it.
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

function Optional() {
  return <span className="ml-1 text-xs font-normal text-muted-foreground">optional</span>;
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: SectionId;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-section={id}
      aria-labelledby={`s-section-${id}`}
      className="grid scroll-mt-2 gap-4"
    >
      <div className="flex items-baseline justify-between gap-3 border-b pb-2">
        <h3 id={`s-section-${id}`} className="text-base font-extrabold">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  help,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  help?: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
          {required ? (
            <span aria-hidden className="text-destructive">
              {" "}
              *
            </span>
          ) : null}
          {optional ? <Optional /> : null}
        </Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

function OptionCard({
  checked,
  onSelect,
  title,
  help,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  help: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "grid min-h-11 cursor-pointer content-start gap-0.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
        checked ? "border-primary/50 bg-primary-soft/50" : "hover:bg-secondary/60",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        <span
          aria-hidden
          className={cn(
            "size-4 shrink-0 rounded-full border-2",
            checked ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--background)]" : "",
          )}
        />
        {title}
      </span>
      <span className="pl-6 text-xs text-muted-foreground">{help}</span>
    </button>
  );
}

function InlineNumber({
  id,
  before,
  after,
  value,
  onChange,
  error,
}: {
  id: string;
  before: string;
  after: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm">
        {before ? <span>{before}</span> : null}
        <Input
          id={id}
          inputMode="numeric"
          className="h-9 w-16"
          value={value}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{after}</span>
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SwitchRow({
  id,
  title,
  help,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-sm font-bold">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-[#fdf0dc] px-3 py-2 text-xs text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function RuleRow({
  label,
  help,
  changed,
  children,
}: {
  label: string;
  help: string;
  changed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-2 text-sm font-bold">
          {label}
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-extrabold",
              changed
                ? "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {changed ? "Changed" : "Default"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{help}</span>
      </div>
      {children}
    </div>
  );
}

const DEFAULT_VALUE = "__default";

function RuleSelect({
  ariaLabel,
  prefix,
  kind,
  options,
  value,
  fallback,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  prefix?: string;
  kind: "buffer" | "notice" | "horizon" | "cancellation";
  options: RuleOption[];
  value: number | null;
  fallback: number;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const shown = value ?? fallback;
  const list = options.some((o) => o.value === shown)
    ? options
    : [...options, { value: shown, label: ruleValueLabel(kind, shown) }].sort(
        (a, b) => a.value - b.value,
      );
  return (
    <Select
      value={value === null ? DEFAULT_VALUE : String(value)}
      disabled={disabled}
      onValueChange={(v) => onChange(v === DEFAULT_VALUE ? null : Number(v))}
    >
      <SelectTrigger className="h-9 w-auto min-w-[132px]" aria-label={ariaLabel}>
        <SelectValue>
          {prefix ? `${prefix}: ` : ""}
          {ruleValueLabel(kind, shown)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>
          Use default ({ruleValueLabel(kind, fallback)})
        </SelectItem>
        {list.map((o) => (
          <SelectItem key={o.value} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
