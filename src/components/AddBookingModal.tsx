import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CustomerSearchPicker,
  type LinkedRecordField,
  QuickAddLinkedRecord,
  type QuickAddLinkedRecordHandle,
  activeSortedFields,
} from "@/components/LinkedRecordDialogs";
import { Layers, MapPin, Plus, UserRound } from "lucide-react";
import { ServiceMultiPicker, type PickedService } from "@/components/ServiceMultiPicker";
import { useServiceUpsells } from "@/lib/api/upsells";
import { ServiceDefaultsHint } from "@/components/BookingConsumables";
import { SetupGate } from "@/components/SetupGate";
import { AddClientDialog } from "@/components/QuickActions";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { DropInConfirmDialog } from "@/components/DropInConfirmDialog";
import { ClientLiftFields } from "@/components/ClientLiftFields";
import { CustomerAvatar } from "@/components/CustomerAvatar";
import {
  ChannelBoxes,
  ChoiceCards,
  DayStrip,
  FIELD,
  FooterSummary,
  FormSection,
  LinkButton,
  ModeChip,
  MoneyInput,
  Segmented,
  Strip,
  WaitingLine,
  radioGroupKeys,
  type ChoiceOption,
  type SectionState,
} from "@/components/booking-form/parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BankTransferPanel } from "@/components/BankTransferPanel";
import type { BankTransferInstructions } from "@/lib/api/types";
import {
  useAvailability,
  useBookings,
  useCalendarBlocks,
  useCreateBooking,
  useCustomerCredits,
  useCustomerLinkedRecords,
  useCustomer,
  useCustomers,
  useLinkedRecordDefinition,
  useLocationsList,
  usePackages,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import type { BookingConflict } from "@/lib/api/errors";
import { customerDisplayName } from "@/lib/api/types";
import { isoDayOfWeekFromIsoDate, sessionOfferedOnDay } from "@/lib/availability-windows";
import { formatAllDayDuration, MINUTES_PER_DAY } from "@/lib/booking-duration";
import { configuredDepositMinor } from "@/lib/booking-payment";
import {
  ADD_SECTIONS,
  addBookingBlockers,
  addBookingDirty,
  addDeposit,
  addFooterSummary,
  addNotifyHint,
  bookingWords,
  contactBlocks,
  currencySymbol,
  dayLabel,
  defaultPaymentMethod,
  isRememberedMethod,
  jobPrice,
  moneyInputValue,
  moneyShort,
  NOTIFY_PREFS,
  notifyPrefFrom,
  notifyTicks,
  PAYMENT_METHOD_NAMES,
  priceError,
  priceMode,
  priceModeLabel,
  reachableChannels,
  REMEMBERED_METHODS,
  slotSummary,
  timeRange,
  type AddSection,
  type NotifyPref,
  type PaymentMethod,
  type RememberedMethod,
} from "@/lib/booking-form";
import { clientLiftFromDraft, EMPTY_LIFT_DRAFT, type ClientLiftDraft } from "@/lib/client-lift";
import {
  allDayHolds,
  describeHold,
  eventsWithin,
  hardClashCopy,
  heldAllDayNote,
  timedClashNote,
  timedJobsWithin,
  timedOverlapNote,
  type TimedEntry,
} from "@/lib/drop-in";
import {
  formatDurationLong,
  formatInTz,
  formatMoney,
  isoDateInTz,
  spansDays,
  timeInTz,
  zonedDateTimeToIso,
} from "@/lib/format";
import { outsideWorkingHours } from "@/lib/working-hours";
import {
  addDaysIso,
  formatWorkingSpan,
  layoutExplicitWindow,
  layoutWorkingDuration,
  scheduleFor,
  type WorkingLayout,
} from "@/lib/working-days";
import { adjustmentLabel, formatAdjustment } from "@/lib/booking-price";
import { discountLabel, type Discount } from "@/lib/discount";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DATE_INPUT = cn(
  FIELD,
  "flex w-full border border-input px-3 py-1 text-sm outline-none focus:border-ring",
);

const SECTION_IDS: Record<AddSection, string> = {
  client: "add-booking-client",
  services: "add-booking-services",
  when: "add-booking-when",
  price: "add-booking-price",
  payment: "add-booking-payment",
  notes: "add-booking-notes",
};

/** Sits at the end of the slot grid: books the whole day (or days, for a long job). */
function AllDayTile({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="min-h-11 cursor-pointer rounded-[10px] border border-dashed py-2 text-xs font-medium transition-colors hover:bg-secondary sm:min-h-0"
      title="Block the whole day; the client sees the date rather than a time"
    >
      All day
    </button>
  );
}

/** Start-time grid for staff-made bookings; the public page stays back-to-back. */
const STAFF_SLOT_STEP_MINUTES = 30;

export function AddBookingModal({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultDate,
  defaultStaffId,
  defaultServiceId,
  defaultLinkedRecordId,
  waitlistEntryId,
  onNoAvailability,
  assumeDropIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
  /** Pre-pick the main service — e.g. "Book" on a follow-up for a ceramic top-up. */
  defaultServiceId?: string;
  /** Pre-pick the client's vehicle/record the follow-up was for. */
  defaultLinkedRecordId?: string;
  /** ISO date (YYYY-MM-DD) to start on — e.g. the day clicked in the calendar. */
  defaultDate?: string;
  /** Pre-select a staff member — e.g. the calendar's current staff filter. */
  defaultStaffId?: string;
  /**
   * "Book" from the waitlist: sent with the create call so the API closes the entry
   * once the booking exists. Nothing else about the form changes.
   */
  waitlistEntryId?: string;
  /**
   * Staff picked `defaultDate` on the calendar, where they could already see it was
   * held all day. If it is, book a drop-in straight away without the prompt or notes.
   */
  assumeDropIn?: boolean;
  /**
   * Shown as "Add to waitlist instead" when the chosen day has no availability. Called
   * with what staff had already picked so the waitlist form opens prefilled.
   */
  onNoAvailability?: (picked: {
    customerId: string;
    serviceId: string;
    linkedRecordId?: string;
    locationId?: string;
    staffId?: string;
    date: string;
  }) => void;
}) {
  const tenant = useTenant();
  // Every date and time staff type here is the business's wall clock — what the
  // calendar draws and what the API lays the job out in — never the device's.
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const words = bookingWords(tenant.terminology);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState<string>("none");
  const [staffId, setStaffId] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(defaultDate ?? isoDateInTz(new Date().toISOString(), timezone));
  const [slotKey, setSlotKey] = useState<string | null>(null);
  // Staff either pick from the availability quote ("slot") or set the window
  // themselves ("custom") — start/end, or whole days (RECA-532).
  const [scheduling, setScheduling] = useState<"slot" | "custom">("slot");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(
    defaultDate ?? isoDateInTz(new Date().toISOString(), timezone),
  );
  const [endTime, setEndTime] = useState("10:00");
  // Once the end has been edited by hand it stops following start + service length.
  const [endTouched, setEndTouched] = useState(false);
  const [allDay, setAllDay] = useState(false);
  // Staff confirmed this booking may share its day with the other kind of work: a
  // short job squeezed in beside an all-day one (a "drop-in"), or an all-day job on
  // a day that already has timed work. Sent as `dropIn: true`; the API then ignores
  // clashes with that other kind only. Customers never see or set this.
  const [dropIn, setDropIn] = useState(false);
  // A 409 the API marked overridable: what clashed and the body to re-send with
  // `dropIn: true` once staff confirm (under a fresh Idempotency-Key).
  const [override, setOverride] = useState<{
    conflicts: BookingConflict[];
    body: Record<string, unknown>;
    allDay: boolean;
  } | null>(null);
  // Price override (pounds, as typed). null = the catalogue total.
  const [priceInput, setPriceInput] = useState<string | null>(null);
  // "10% off" / "£10 off" the list price. Typing a price clears it and vice versa,
  // so there's only ever one reason the total differs from the list.
  const [discount, setDiscount] = useState<Discount | null>(null);
  // Set by a click on Create while something is missing: from then on the sections
  // still in the way show an amber number.
  const [showMissing, setShowMissing] = useState(false);
  // "Change" on the chosen client swaps the card back to the search, opened.
  const [changingClient, setChangingClient] = useState(false);

  // Defaults come from wherever the modal was opened (a calendar day, a client's
  // profile) and differ between opens, so apply them each time it opens.
  useEffect(() => {
    if (!open) return;
    const today = isoDateInTz(new Date().toISOString(), timezone);
    setDate(defaultDate ?? today);
    setEndDate(defaultDate ?? today);
    setEndTouched(false);
    setStaffId(defaultStaffId ?? "all");
    setSlotKey(null);
    setDropIn(false);
    // Opened from a follow-up: the client, the service and the vehicle are known.
    if (defaultCustomerId) setCustomerId(defaultCustomerId);
    if (defaultServiceId) {
      setServiceId(defaultServiceId);
      setVariantId("none");
    }
    if (defaultLinkedRecordId) setLinkedRecordId(defaultLinkedRecordId);
  }, [
    open,
    defaultDate,
    defaultStaffId,
    defaultCustomerId,
    defaultServiceId,
    defaultLinkedRecordId,
    timezone,
  ]);
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  // A detailer who is paid after the job should not have to pick that every time, so
  // the payment method sticks per business. Until staff have picked one, automotive
  // businesses default to paying after the job (the norm for that trade) and everyone
  // else to payment up front. The business may still be loading when this mounts, so
  // the default is derived here rather than baked into storage.
  const [lastMethod, setLastMethod] = useStoredState<RememberedMethod | "unset">(
    `recavo.booking.payment.${tenant.businessId}`,
    "unset",
    [...REMEMBERED_METHODS, "unset"],
  );
  const bankTransferEnabled = tenant.configuration?.bankTransfer?.enabled === true;
  const defaultMethod: PaymentMethod = defaultPaymentMethod({
    lastMethod,
    isCarDetailing,
    bankTransferEnabled,
  });
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethod>(defaultMethod);
  // Staff picked a method themselves (the discard check counts that, not the default).
  const [paymentTouched, setPaymentTouched] = useState(false);
  const setPaymentMethod = (next: PaymentMethod) => {
    setPaymentMethodState(next);
    if (isRememberedMethod(next)) setLastMethod(next);
  };
  // The remembered choice can arrive after mount (its storage key needs the business,
  // which loads asynchronously), so keep the closed form in step with it.
  useEffect(() => {
    if (!open) setPaymentMethodState(defaultMethod);
  }, [open, defaultMethod]);
  // Package credit is offered to a business that sells packages; it can only be chosen
  // for a client who actually holds credit. A detailer with no packages never sees it.
  const packages = usePackages();
  const customerCredits = useCustomerCredits(customerId || undefined);
  const noPackages = packages.isSuccess && packages.data.length === 0;
  const noCredit =
    Boolean(customerId) &&
    customerCredits.isSuccess &&
    !customerCredits.data.some((c) => c.balance.available > 0);
  const creditOffered = !noPackages && !noCredit;
  const creditsLeft =
    customerId && customerCredits.isSuccess
      ? customerCredits.data.reduce((sum, c) => sum + Math.max(0, c.balance.available), 0)
      : null;
  // Never leave the form on an option that can't be used: fall back to the remembered
  // up-front / after-the-job choice, which is always available.
  useEffect(() => {
    if (paymentMethod === "credit" && !creditOffered) setPaymentMethodState(defaultMethod);
  }, [paymentMethod, creditOffered, defaultMethod]);
  // Deposit override (pounds, as typed). null = follow the services' configured
  // deposits; "" = staff cleared it, i.e. no deposit / full amount up front.
  const [depositInput, setDepositInput] = useState<string | null>(null);
  const [linkedRecordId, setLinkedRecordId] = useState("none");
  const [notes, setNotes] = useState("");
  // Automotive only: the client needs running somewhere once they've left the car.
  const [lift, setLift] = useState<ClientLiftDraft>(EMPTY_LIFT_DRAFT);
  const clientLift = isCarDetailing ? clientLiftFromDraft(lift) : null;
  // How the client is told straight away (RECA-533): email, text, both or neither.
  // Some clients don't want the confirmation landing in their inbox, so the last
  // choice is remembered per business rather than resetting each time.
  const [notifyPref, setNotifyPref] = useStoredState<NotifyPref>(
    `recavo.booking.notify.${tenant.businessId}`,
    "email",
    NOTIFY_PREFS,
  );
  const smsCredits = useSmsCreditsSummary();
  const ticks = notifyTicks(notifyPref);
  const setChannel = (channel: "email" | "sms", on: boolean) =>
    setNotifyPref(notifyPrefFrom({ ...ticks, [channel]: on }));
  const [submitting, setSubmitting] = useState(false);
  // Account details + reference from a pay-by-bank 201, read out to the customer
  // before closing (RECA-522).
  const [bankResult, setBankResult] = useState<BankTransferInstructions | null>(null);
  const [additional, setAdditional] = useState<
    Array<{ serviceId: string; variantId: string | null }>
  >([]);
  // Per-service prices staff typed on the picked rows (major units, as typed), keyed by
  // service id. Each re-prices that service — sent as the line's own price, so the
  // booking shows it at that price with the list beside it, not as a discount. They
  // and the whole-job Price / Discount are alternatives (the API measures a job total
  // from list), so a row edit clears those and vice versa; the last touched wins.
  const [linePrices, setLinePrices] = useState<Record<string, string>>({});

  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const createBooking = useCreateBooking();
  // Vehicle (or other linked record) on the job — RECA-90. Only offered when the
  // business has a record schema; required when the service or definition says so.
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const customerRecords = useCustomerLinkedRecords(customerId || undefined);
  const recordFields = useMemo<LinkedRecordField[]>(
    () =>
      activeSortedFields(
        (linkedRecordDefinition.data?.fields ?? []) as unknown as LinkedRecordField[],
      ),
    [linkedRecordDefinition.data],
  );
  // Inline "add another" form when the client already has records; with none,
  // the quick-add form shows on its own.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Details typed into the quick-add row but not yet "Added". Create booking saves
  // them to the client first and puts the new record on the booking, so a car
  // typed in and then forgotten about isn't silently lost (it used to be).
  const quickAdd = useRef<QuickAddLinkedRecordHandle | null>(null);
  const [quickAddPending, setQuickAddPending] = useState(false);
  const onQuickAddInput = useCallback((has: boolean) => setQuickAddPending(has), []);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const serviceList = services.data ?? [];
  const locationList = useMemo(() => locations.data ?? [], [locations.data]);
  const customerList = useMemo(() => customers.data?.items ?? [], [customers.data]);
  // The chosen client may sit beyond the first page (e.g. opened from their profile).
  const chosenCustomer = useCustomer(customerId || undefined);
  const selectedCustomer =
    customerList.find((c) => c.id === customerId) ?? chosenCustomer.data ?? null;
  const firstName = selectedCustomer
    ? selectedCustomer.firstName?.trim() || customerDisplayName(selectedCustomer)
    : null;
  const blocks = contactBlocks(selectedCustomer, smsCredits.level === "empty");
  const notifyChannels = reachableChannels(ticks, blocks);
  const notifyHint = addNotifyHint(notifyChannels, blocks);
  const catalogueLoading = services.isLoading || locations.isLoading || customers.isLoading;
  const noServices = services.isSuccess && serviceList.length === 0;
  const noLocations = locations.isSuccess && locationList.length === 0;
  const noClients = customers.isSuccess && customerList.length === 0;

  // A one-person business has nothing to choose: pick them and drop the field.
  // "Any staff member" and the single member are the same search, but pinning
  // the id means the availability quote and booking name them explicitly.
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  useEffect(() => {
    if (!open || !soleStaff) return;
    if (staffId !== soleStaff.id) setStaffId(soleStaff.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, soleStaff?.id]);

  // Nothing to choose when there's a single location, and a top-bar location
  // filter is a clear statement of intent — pre-fill either, but never override
  // a choice already made in the form.
  useEffect(() => {
    if (!open || locationId) return;
    const active = locationList.filter((l) => l.active);
    const pick =
      (tenant.currentLocationId !== "all" &&
        locationList.find((l) => l.id === tenant.currentLocationId)?.id) ||
      (active.length === 1 ? active[0]!.id : undefined) ||
      (locationList.length === 1 ? locationList[0]!.id : undefined);
    if (pick) setLocationId(pick);
  }, [open, locationId, locationList, tenant.currentLocationId]);
  const setupBlocked = noServices || noLocations || noClients;

  const hasLinkedRecords = Boolean(linkedRecordDefinition.data?.definition);
  const recordTerm = tenant.terminology.linkedRecord;
  const recordTermLower = recordTerm.toLowerCase();
  // Short: it shares a line with Cancel / More details / Add and is truncated.
  const quickAddHint = "✓ Saved with the booking";
  const activeRecords = (customerRecords.data ?? []).filter((r) => r.status === "active");
  // Vertical-aware nouns: "Trainer"/"Session" for PT, "Detailer"/"Service" for detailing.
  const staffNoun = words.Staff;
  const staffLower = words.staff;
  const serviceNoun = words.service;
  const service = serviceList.find((s) => s.id === serviceId);
  const currency = service?.currency ?? "GBP";
  const symbol = currencySymbol(currency);
  const money = (minor: number) => formatMoney(minor, currency);
  // The API rejects a missing linkedRecordId when either flag is on, so mirror
  // that here rather than letting the submit bounce.
  const recordRequired =
    hasLinkedRecords &&
    (service?.requiresLinkedRecord === true ||
      linkedRecordDefinition.data?.definition.settings.requireForBooking === true);
  const serviceById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s])),
    [services.data],
  );
  // additionalServices only apply to individual bookings and can't mix with credit (RECA-516).
  const isIndividual = !service || service.bookingMode === "individual";
  const multiAllowed = Boolean(service) && isIndividual && paymentMethod !== "credit";
  // The add-ons the business pairs with the main service: one-tap suggestions under
  // the picker, priced at the pairing price by the API when booked together.
  const suggestions = useServiceUpsells(open && service ? service.id : undefined);
  const suggested = (suggestions.data ?? []).filter(
    (u) =>
      u.service?.active &&
      u.upsellServiceId !== serviceId &&
      !additional.some((a) => a.serviceId === u.upsellServiceId),
  );
  // The tile picker sees one list; the first entry is the main service and the rest
  // are the additional services, which is exactly how the API wants them.
  const picked: PickedService[] = serviceId
    ? [{ serviceId, variantId: variantId !== "none" ? variantId : null }, ...additional]
    : [];
  const setPicked = (next: PickedService[]) => {
    const [main, ...rest] = next;
    setServiceId(main?.serviceId ?? "");
    setVariantId(main?.variantId ?? "none");
    setAdditional(rest);
    setSlotKey(null);
    // A price typed on a row leaves with the row.
    setLinePrices((prev) => {
      const keep = new Set(next.map((p) => p.serviceId));
      const kept = Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id)));
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
    });
  };
  const setLinePrice = (id: string, value: string | null) => {
    if (value === null) {
      // Reverting a row to list is not an edit: tabbing through an untouched row's
      // price (which blurs at the list price) must not wipe a typed total or discount.
      setLinePrices((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _dropped, ...rest } = prev;
        return rest;
      });
      return;
    }
    setLinePrices((prev) => ({ ...prev, [id]: value }));
    setPriceInput(null);
    setDiscount(null);
  };
  // A date input reports "" while someone is part-way through typing a date;
  // an invalid Date would throw on toISOString and take the page down.
  const dayStartIso = zonedDateTimeToIso(date, "00:00", timezone);
  const dayStart = dayStartIso ? new Date(dayStartIso) : new Date(NaN);
  const validDate = !Number.isNaN(dayStart.getTime());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayIsoDate = isoDateInTz(new Date().toISOString(), timezone);

  const availability = useAvailability({
    serviceId: serviceId || undefined,
    locationId: locationId || undefined,
    variantId: variantId !== "none" ? variantId : undefined,
    staffId: staffId !== "all" ? staffId : undefined,
    from: validDate ? dayStart.toISOString() : "",
    to: validDate ? dayEnd.toISOString() : "",
    // Once staff opt for a drop-in the quote ignores all-day holds, so the times
    // the day actually has room for (around timed work and events) show up.
    dropIn: dropIn && scheduling === "slot",
    // Every half hour the day has room for, not just back-to-back from opening: a
    // 2-hour job should be bookable at 09:00, and a drop-in at any free time.
    granularityMinutes: STAFF_SLOT_STEP_MINUTES,
    enabled: open && validDate && scheduling === "slot",
  });

  const slots = useMemo(
    () => (availability.data ?? []).sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  // What is already on the diary for the day(s) in question — so an empty slot
  // grid can say *why* ("Held all day by …") and offer a drop-in, and an all-day
  // pick can warn about the timed work it would share the day with.
  const diaryEnd = (() => {
    if (allDay && scheduling === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      const lastIso = zonedDateTimeToIso(endDate, "00:00", timezone);
      const last = lastIso ? new Date(lastIso) : new Date(NaN);
      if (!Number.isNaN(last.getTime()) && last.getTime() >= dayStart.getTime()) {
        return new Date(last.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    return dayEnd;
  })();
  const diary = useBookings({
    from: validDate ? dayStart.toISOString() : "",
    to: validDate ? diaryEnd.toISOString() : "",
    staffId: staffId !== "all" ? staffId : undefined,
    limit: 200,
    enabled: open && validDate && Boolean(serviceId),
  });
  const diaryBookings = useMemo(() => diary.data?.bookings ?? [], [diary.data]);
  // Events (calendar blocks) on the same day(s): a dentist appointment is something a
  // hand-set time must avoid and an all-day job may be booked around.
  const diaryBlocks = useCalendarBlocks({
    from: validDate ? dayStart.toISOString() : "",
    to: validDate ? diaryEnd.toISOString() : "",
    ...(staffId !== "all" ? { staffId } : {}),
    enabled: open && validDate && Boolean(serviceId),
  });
  const diaryEvents = useMemo(() => diaryBlocks.data ?? [], [diaryBlocks.data]);

  const selectedSlot = slots.find((s) => `${s.start}:${s.staffId}` === slotKey) ?? null;

  const pairingPrices = useMemo(
    () =>
      new Map(
        (suggestions.data ?? [])
          .filter((u) => u.priceMinor !== null)
          .map((u) => [u.upsellServiceId, u.priceMinor as number]),
      ),
    [suggestions.data],
  );
  /** List price of one additional service, as the API will charge it. */
  const additionalListMinor = (a: { serviceId: string; variantId: string | null }): number => {
    const s = serviceById.get(a.serviceId);
    if (!s) return 0;
    const variant = a.variantId ? s.variants.find((v) => v.id === a.variantId) : undefined;
    if (variant?.priceMinor != null) return variant.priceMinor;
    // Paired add-ons are charged at the pairing price (upsells), as the API will.
    return pairingPrices.get(a.serviceId) ?? s.basePriceMinor;
  };
  const additionalTotalMinor = additional.reduce((sum, a) => sum + additionalListMinor(a), 0);
  const primaryMinor =
    selectedSlot?.priceMinor ??
    (service
      ? ((variantId !== "none" ? service.variants.find((v) => v.id === variantId) : undefined)
          ?.priceMinor ?? service.basePriceMinor)
      : 0);
  const rolledTotalMinor = primaryMinor + additionalTotalMinor;

  // Whole-job price (RECA-532): every service keeps its list price and the API records
  // the difference as a discount (or price adjustment) line, so any total from zero up
  // is valid. Row prices are the other route: the lines themselves change.
  const price = jobPrice({
    rolledTotalMinor,
    priceInput,
    discount,
    rows: picked.map((p, idx) => ({
      typed: linePrices[p.serviceId],
      listMinor: idx === 0 ? primaryMinor : additionalListMinor(p),
    })),
  });
  const {
    discountMinor,
    discountInvalid,
    lineInvalid,
    linePricesTouched,
    linesRepriced,
    priceOverridden,
    overridePriceMinor,
    priceInvalid,
    effectiveTotalMinor,
    priceChanged,
  } = price;
  // Row prices go to the API per line (`servicePriceMinor` for the primary,
  // `additionalServices[].priceMinor` for the rest); a typed total / discount goes as
  // the job's `priceMinor`. Never both — one clears the other above.
  const typedLinePrice = (id: string, listMinor: number): number | undefined => {
    const typed = picked.some((p) => p.serviceId === id) ? linePrices[id] : undefined;
    if (typed === undefined) return undefined;
    const rows = jobPrice({
      rolledTotalMinor: 0,
      priceInput: null,
      discount: null,
      rows: [{ typed, listMinor }],
    });
    return rows.linesRepriced ? rows.lineTotalMinor : undefined;
  };
  const primaryLinePrice = service ? typedLinePrice(service.id, primaryMinor) : undefined;
  const sendJobPrice = priceChanged && !linePricesTouched;

  // Catalogue length of the whole job — the default end when staff set the time.
  const catalogueDurationMinutes = (() => {
    if (!service) return 60;
    const variant = variantId !== "none" ? service.variants.find((v) => v.id === variantId) : null;
    const primary = variant?.durationMinutes ?? service.durationMinutes;
    return (
      primary +
      additional.reduce((sum, a) => {
        const s = serviceById.get(a.serviceId);
        if (!s) return sum;
        const v = a.variantId ? s.variants.find((x) => x.id === a.variantId) : undefined;
        return sum + (v?.durationMinutes ?? s.durationMinutes);
      }, 0)
    );
  })();

  // A set time needs someone to do it — "any staff" only makes sense for a quote.
  const customStaffId = staffId !== "all" ? staffId : (soleStaff?.id ?? null);
  const customStaff = customStaffId
    ? ((staff.data ?? []).find((s) => s.id === customStaffId) ?? null)
    : null;
  // The days this person works here: a job of a day or more is laid over these only,
  // the same way the API will save it, so the end we suggest is the end it gets.
  const customLocation = locationList.find((l) => l.id === locationId) ?? null;
  const workingSchedule = useMemo(
    () => scheduleFor(customStaff, customLocation, timezone),
    [customStaff, customLocation, timezone],
  );

  // End follows start + service length until someone edits it. A job of a day or more
  // skips the days that aren't worked: a 3-day job from Thursday ends on Monday.
  useEffect(() => {
    if (scheduling !== "custom" || endTouched || !validDate) return;
    const startIso = allDay
      ? zonedDateTimeToIso(date, "00:00", timezone)
      : zonedDateTimeToIso(date, startTime, timezone);
    if (!startIso) return;
    const layout = layoutWorkingDuration(
      startIso,
      catalogueDurationMinutes,
      workingSchedule,
      timezone,
      {
        allDay,
      },
    );
    if (allDay) {
      setEndDate(layout.occupiedDays[layout.occupiedDays.length - 1] ?? date);
      return;
    }
    setEndDate(isoDateInTz(layout.end, timezone));
    setEndTime(timeInTz(layout.end, timezone));
  }, [
    scheduling,
    endTouched,
    validDate,
    allDay,
    date,
    startTime,
    catalogueDurationMinutes,
    workingSchedule,
    timezone,
  ]);

  // The staff-set window as ISO instants (the business's wall clock). For all-day
  // the server snaps to local midnights at the location; we send day bounds.
  // `minutes` is what the API will store as the job's length: the days between start
  // and end that aren't worked stay free and don't count.
  const customWindow = useMemo<{
    start: string;
    end: string;
    minutes: number;
    layout: WorkingLayout;
  } | null>(() => {
    if (scheduling !== "custom") return null;
    const start = allDay
      ? zonedDateTimeToIso(date, "00:00", timezone)
      : zonedDateTimeToIso(date, startTime, timezone);
    const end = allDay
      ? /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? zonedDateTimeToIso(addDaysIso(endDate, 1), "00:00", timezone)
        : null
      : zonedDateTimeToIso(endDate, endTime, timezone);
    if (!start || !end) return null;
    if (new Date(end).getTime() <= new Date(start).getTime()) return null;
    const layout = layoutExplicitWindow(start, end, workingSchedule, timezone, { allDay });
    return { start, end, minutes: layout.minutes, layout };
  }, [scheduling, allDay, date, startTime, endDate, endTime, workingSchedule, timezone]);
  // "Thu 24 to Mon 28 Sept · 3 working days".
  const customSpan = customWindow ? formatWorkingSpan(customWindow.layout, timezone, " to ") : null;

  // "All day" from the slot grid: one tap instead of switching tabs and ticking
  // the box. The end-date effect above fills in the last day from the job length.
  const pickAllDay = () => {
    // Already booking around the hold: stay a drop-in, just without a time.
    if (dropIn) armDropIn.current = true;
    setScheduling("custom");
    setAllDay(true);
    setSlotKey(null);
    setEndTouched(false);
  };
  // The fast path on a held day: "sometime that day", no time to pick.
  const pickAllDayDropIn = () => {
    armDropIn.current = true;
    pickAllDay();
  };
  const hoursWarning = useMemo(() => {
    if (scheduling !== "custom" || allDay || !customWindow || !customStaff) return null;
    return outsideWorkingHours(customStaff, customWindow, locationId || null, timezone);
  }, [scheduling, allDay, customWindow, customStaff, locationId, timezone]);

  // All-day jobs the new booking would sit beside: the whole day for a slot pick,
  // the exact window for a hand-set time or an all-day span. Filtered to the chosen
  // staff member — someone else's all-day job never blocked this one anyway. An
  // all-day booking onto a held day is an untimed drop-in ("sometime that day").
  const holdWindow =
    scheduling === "custom" && customWindow
      ? customWindow
      : { start: dayStart.toISOString(), end: dayEnd.toISOString() };
  const holdStaffId = scheduling === "custom" ? customStaffId : staffId !== "all" ? staffId : null;
  const holds = useMemo(
    () => (validDate ? allDayHolds(diaryBookings, holdWindow, holdStaffId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validDate, diaryBookings, holdWindow.start, holdWindow.end, holdStaffId],
  );
  // Name the client as the directory knows them; the booking's own lead attendee is
  // the fallback (and is often just the "Lead" placeholder on staff-made bookings).
  const holdNote = heldAllDayNote(
    holds.map((b) => {
      const client = b.leadCustomerId
        ? customerList.find((c) => c.id === b.leadCustomerId)
        : undefined;
      return describeHold(b, client ? customerDisplayName(client) : null);
    }),
  );
  // The mirror: timed work — and events taking part of a day — on the day(s) an
  // all-day job would take. Sorted so the note leads with the earliest.
  const timedOnDay = useMemo<TimedEntry[]>(
    () =>
      allDay && scheduling === "custom" && customWindow
        ? [
            ...timedJobsWithin(diaryBookings, customWindow, customStaffId).map((b) => ({
              start: b.start,
              end: b.end,
              kind: "job" as const,
            })),
            ...eventsWithin(diaryEvents, customWindow, customStaffId).map((e) => ({
              start: e.start,
              end: e.end,
              kind: "event" as const,
              title: e.title,
            })),
          ].sort((a, b) => a.start.localeCompare(b.start))
        : [],
    [allDay, scheduling, customWindow, diaryBookings, diaryEvents, customStaffId],
  );
  const timedNote = timedClashNote(timedOnDay, timezone);
  // A hand-set time on top of this person's other timed work or an event: nothing to
  // override, it has to move — say so before the API does.
  const timedOverlaps = useMemo(
    () =>
      !allDay && scheduling === "custom" && customWindow
        ? [
            ...timedJobsWithin(diaryBookings, customWindow, customStaffId).map((b) => {
              const client = b.leadCustomerId
                ? customerList.find((c) => c.id === b.leadCustomerId)
                : undefined;
              return {
                start: b.start,
                end: b.end,
                kind: "job" as const,
                serviceSnapshot: b.serviceSnapshot,
                // The directory's name for the client, else whatever the booking holds.
                attendees: client
                  ? [{ name: customerDisplayName(client), isLead: true }]
                  : b.attendees,
              };
            }),
            ...eventsWithin(diaryEvents, customWindow, customStaffId).map((e) => ({
              start: e.start,
              end: e.end,
              kind: "event" as const,
              title: e.title,
            })),
          ].sort((a, b) => a.start.localeCompare(b.start))
        : [],
    [allDay, scheduling, customWindow, diaryBookings, diaryEvents, customStaffId, customerList],
  );
  const overlapNote = timedOverlapNote(timedOverlaps, timezone);
  const overlapCopy = overlapNote
    ? `${overlapNote}. Pick a different time${soleStaff ? "" : ` or another ${staffLower}`}.`
    : null;
  // A "yes" to sharing the day is about *this* day, this person and this kind of
  // booking; change any of them and it is asked again. (The last day is not in the
  // list: it follows the start on its own when the kind changes, and `sendDropIn`
  // drops the flag anyway once nothing is left to share with.)
  // …except when the switch itself was "book it as a drop-in instead", which
  // arms the next reset to land on yes.
  const armDropIn = useRef(false);
  useEffect(() => {
    if (armDropIn.current) {
      armDropIn.current = false;
      setDropIn(true);
      return;
    }
    setDropIn(false);
  }, [date, staffId, scheduling, allDay]);
  // Sent when staff have said the two kinds of work may share the day. A slot picked
  // from a drop-in quote always carries it; a hand-set window only while there is
  // still something on the diary to share with.
  const sendDropIn =
    dropIn && (scheduling === "slot" || holds.length > 0 || (allDay && timedOnDay.length > 0));
  // On the calendar day they picked, a full day means a drop-in: switch to it as
  // soon as the hold shows up rather than asking. A slot pick only switches once
  // the ordinary quote is empty, so a day with room left books as normal.
  const pickedHeldDay = Boolean(assumeDropIn) && date === defaultDate && holds.length > 0;
  const autoDropIn =
    pickedHeldDay &&
    !dropIn &&
    (scheduling === "custom"
      ? !allDay || timedOnDay.length === 0
      : availability.isSuccess && slots.length === 0);
  useEffect(() => {
    if (open && autoDropIn) setDropIn(true);
  }, [open, autoDropIn]);
  const quietDropIn = pickedHeldDay && dropIn;

  // The API sums the booked services' deposits unless staff override it here.
  const defaultDepositMinor = configuredDepositMinor(
    [
      ...(service ? [service] : []),
      ...additional.map((a) => serviceById.get(a.serviceId)).filter((s) => s != null),
    ],
    effectiveTotalMinor,
  );
  // Credit settles by entitlement, never money. Every other method can take a deposit —
  // including pay after the job, where it secures the date and the balance follows.
  const depositApplies = paymentMethod !== "credit";
  const deposit = addDeposit({
    depositInput,
    defaultDepositMinor,
    totalMinor: effectiveTotalMinor,
    applies: depositApplies,
  });
  const depositOverridden = deposit.overridden;
  const depositMinor = deposit.minor;
  const depositInvalid = deposit.invalid;

  const vehicleMissing = recordRequired && linkedRecordId === "none" && !quickAddPending;
  const blockerList = addBookingBlockers({
    words,
    hasClient: Boolean(customerId),
    hasService: Boolean(service),
    vehicleMissing,
    hasLocation: Boolean(locationId),
    scheduling,
    hasSlot: Boolean(selectedSlot),
    slotsAvailable: slots.length > 0,
    hasCustomStaff: Boolean(customStaffId),
    hasCustomWindow: Boolean(customWindow),
    allDay,
    clash: Boolean(overlapNote),
    priceInvalid,
    depositInvalid,
  });
  const blockers = blockerList.map((b) => b.label);
  const blocked = blockers.length > 0;
  const blockedSections = new Set(blockerList.map((b) => b.section));
  const sectionState = (key: AddSection, complete: boolean): SectionState =>
    showMissing && blockedSections.has(key) ? "attention" : complete ? "complete" : "idle";
  const scrollToSection = (key: AddSection) =>
    document
      .getElementById(SECTION_IDS[key])
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleConflict = (conflicts: readonly BookingConflict[]) => {
    if (scheduling === "custom") {
      const copy = hardClashCopy({
        conflicts,
        who: customStaff?.displayName ?? null,
        newBookingAllDay: allDay,
        timeZone: timezone,
        // Suggesting someone else only helps when there is someone else.
        alternative: soleStaff ? null : `another ${staffLower}`,
      });
      if (copy.kind === "all-day-job") {
        // Two all-day jobs can't share a day, but a timed drop-in alongside one can.
        toast.error(copy.title, {
          description: copy.description,
          action: {
            label: "Pick a time",
            onClick: () => {
              armDropIn.current = true;
              setAllDay(false);
              setEndTouched(false);
            },
          },
        });
        return;
      }
      toast.error(copy.title, { description: copy.description });
      return;
    }
    toast.error("That slot was just taken", {
      description: "Times have been refreshed. Pick another time.",
    });
    setSlotKey(null);
    void availability.refetch();
  };

  const reset = () => {
    setCustomerId(defaultCustomerId ?? "");
    setLinkedRecordId(defaultLinkedRecordId ?? "none");
    setServiceId(defaultServiceId ?? "");
    setVariantId("none");
    setStaffId("all");
    setLocationId("");
    setSlotKey(null);
    setPaymentMethodState(defaultMethod);
    setPaymentTouched(false);
    setDepositInput(null);
    setPriceInput(null);
    setDiscount(null);
    setLinePrices({});
    setScheduling("slot");
    setAllDay(false);
    setDropIn(false);
    setOverride(null);
    setEndTouched(false);
    setNotes("");
    setLift(EMPTY_LIFT_DRAFT);
    setAdditional([]);
    setBankResult(null);
    setShowMissing(false);
    setChangingClient(false);
  };

  // Sends the booking; a 409 the API marks overridable (only all-day jobs in the way
  // of a timed booking, or only timed jobs in the way of an all-day one) opens the
  // "book anyway?" confirmation instead of a toast. Returns true once created.
  const create = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const { bankTransfer } = await createBooking.mutateAsync(body);
      if (bankTransfer) {
        // Keep the dialog open on the details so staff can read them out.
        setBankResult(bankTransfer);
        toast.success("Booking reserved, awaiting bank transfer");
        return true;
      }
      toast.success(
        notifyChannels.length > 0 ? "Booking created" : "Booking created. Client not notified.",
      );
      reset();
      onOpenChange(false);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.isOverridableConflict && body.dropIn !== true) {
        setOverride({ conflicts: err.conflicts, body, allDay: body.allDay === true });
      } else if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        handleConflict(err.conflicts);
      } else {
        toastApiError(err);
      }
      return false;
    }
  };

  // Staff confirmed the clash: same booking, now flagged as sharing the day. The
  // mutation rotated its Idempotency-Key on the 409, so this is a fresh request.
  const confirmOverride = async () => {
    if (!override) return;
    setSubmitting(true);
    try {
      const ok = await create({ ...override.body, dropIn: true });
      if (ok) setOverride(null);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (blockerList.length > 0) {
      setShowMissing(true);
      scrollToSection(blockerList[0]!.section);
    }
    // Several gaps at once: list them all rather than revealing one per click.
    // A single gap falls through to the specific message for it below.
    if (blockers.length > 1) {
      toast.error("A few things are still needed", {
        description: (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ),
      });
      return;
    }
    if (!customerId || !service || !locationId) {
      toast.error(blockers[0] ?? `Choose a client, ${serviceNoun} and location`);
      return;
    }
    if (scheduling === "slot" && !selectedSlot) {
      toast.error("Pick a time slot", {
        description:
          slots.length > 0 ? undefined : "No availability on this date. Try another day.",
      });
      return;
    }
    if (scheduling === "custom" && (!customWindow || !customStaffId)) {
      toast.error(!customStaffId ? `Choose a ${staffLower}` : "Check the times", {
        description: !customStaffId
          ? "A set time needs someone to do the work."
          : "The end must come after the start.",
      });
      return;
    }
    if (scheduling === "custom" && overlapCopy) {
      toast.error("Pick a free time", { description: overlapCopy });
      return;
    }
    if (priceInvalid) {
      toast.error("Check the price", {
        description: priceError(price, discount, money(rolledTotalMinor), words),
      });
      return;
    }

    if (depositInvalid) {
      toast.error("Check the deposit", {
        description: "It must be less than the total. Clear it for no deposit.",
      });
      return;
    }

    if (vehicleMissing) {
      toast.error(`Choose a ${recordTermLower}`, {
        description: `This ${serviceNoun} needs a ${recordTermLower} on the booking.`,
      });
      return;
    }

    if (additional.length > 0) {
      if (paymentMethod === "credit") {
        toast.error(`Multi-${serviceNoun} jobs can't be paid with package credit`);
        return;
      }
      if (!isIndividual) {
        toast.error(`Only 1-to-1 ${words.services} can bundle extra ${words.services}`);
        return;
      }
      const currencies = new Set([
        service.currency,
        ...additional.map((a) => serviceById.get(a.serviceId)?.currency).filter(Boolean),
      ]);
      if (currencies.size > 1) {
        toast.error(`All ${words.services} on a job must share the same currency`);
        return;
      }
    }

    setSubmitting(true);
    // A vehicle typed into the quick-add row but never "Added" is saved to the
    // client now and goes on the booking, rather than being dropped. Any problem
    // with it (blank required field, API error) shows on the row and stops here.
    let recordId: string | null = linkedRecordId !== "none" ? linkedRecordId : null;
    if (quickAdd.current?.hasInput()) {
      try {
        const record = await quickAdd.current.submit();
        if (!record) {
          setSubmitting(false);
          return;
        }
        recordId = record.id;
      } catch {
        // useCreateCustomerLinkedRecord toasts the error.
        setSubmitting(false);
        return;
      }
    }

    // Staff hold/create bodies use start + staffId from the availability quote.
    // Public booking requires `slotToken`; staff OpenAPI does not — the token is
    // still used server-side when the quote is revalidated on hold/book.
    const body = {
      serviceId: service.id,
      ...(variantId !== "none" ? { variantId } : {}),
      ...(additional.length > 0
        ? {
            additionalServices: additional.map((a) => {
              const priceMinor = typedLinePrice(a.serviceId, additionalListMinor(a));
              return {
                serviceId: a.serviceId,
                ...(a.variantId ? { variantId: a.variantId } : {}),
                ...(priceMinor !== undefined ? { priceMinor } : {}),
              };
            }),
          }
        : {}),
      ...(primaryLinePrice !== undefined ? { servicePriceMinor: primaryLinePrice } : {}),
      locationId,
      ...(scheduling === "custom" && customWindow && customStaffId
        ? {
            staffId: customStaffId,
            start: customWindow.start,
            end: customWindow.end,
            ...(allDay ? { allDay: true } : {}),
          }
        : { staffId: selectedSlot!.staffId, start: selectedSlot!.start }),
      ...(sendJobPrice ? { priceMinor: overridePriceMinor } : {}),
      ...(sendDropIn ? { dropIn: true } : {}),
      leadCustomerId: customerId,
      ...(recordId ? { linkedRecordId: recordId } : {}),
      paymentMethod,
      // Only send an override when staff changed it; otherwise the API applies
      // the services' configured deposits (0 = force no deposit).
      ...(depositOverridden && depositApplies ? { depositMinor: depositMinor ?? 0 } : {}),
      notesInternal: notes || null,
      ...(clientLift ? { clientLift } : {}),
      notifyChannels,
      source: "staff_console",
      ...(waitlistEntryId ? { waitlistEntryId } : {}),
      // Include slotToken when present so backends that accept it can bind the quote.
      ...(scheduling === "slot" && selectedSlot?.slotToken
        ? { slotToken: selectedSlot.slotToken }
        : {}),
    };

    try {
      await create(body);
    } finally {
      setSubmitting(false);
    }
  };

  // Anything a person typed or picked themselves counts as work worth protecting;
  // the defaults the form filled in on their behalf (location, staff, date, the
  // default payment method) do not.
  const dirty = addBookingDirty({
    customerId,
    defaultCustomerId: defaultCustomerId ?? "",
    serviceId,
    defaultServiceId: defaultServiceId ?? "",
    additionalCount: additional.length,
    linkedRecordId,
    defaultLinkedRecordId: defaultLinkedRecordId ?? "none",
    quickAddPending,
    slotPicked: slotKey !== null,
    notes,
    liftNeeded: lift.needed,
    priceInput,
    discount,
    linePriceCount: Object.keys(linePrices).length,
    depositInput,
    paymentTouched,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Esc, the backdrop and the close cross all land here. A half-filled form asks
  // first; an untouched one (or the bank-transfer receipt) closes straight away.
  const requestClose = () => {
    if (dirty && !bankResult && !submitting) {
      setConfirmDiscard(true);
      return;
    }
    reset();
    onOpenChange(false);
  };

  const pickClient = (c: { id: string }) => {
    setCustomerId(c.id);
    // A record belongs to one client, so it can't survive a client change.
    setLinkedRecordId("none");
    setQuickAddOpen(false);
    setChangingClient(false);
  };

  // ---- Footer summary ----------------------------------------------------------------
  const hhmm = (iso: string, tz: string) => timeInTz(iso, tz);
  const whenSummary = (() => {
    if (!service) return null;
    if (scheduling === "slot") {
      if (!selectedSlot) return null;
      const tz = selectedSlot.displayTimezone || timezone;
      const day = dayLabel(isoDateInTz(selectedSlot.start, tz));
      return spansDays(selectedSlot.start, selectedSlot.end, tz)
        ? `${day} · drop-off ${hhmm(selectedSlot.start, tz)}`
        : `${day} · ${timeRange(selectedSlot.start, selectedSlot.end, tz)}`;
    }
    if (!customWindow) return null;
    if (allDay) {
      return endDate !== date ? `${dayLabel(date)} to ${dayLabel(endDate)}` : dayLabel(date);
    }
    return spansDays(customWindow.start, customWindow.end, timezone)
      ? `${dayLabel(date)} ${hhmm(customWindow.start, timezone)} to ${dayLabel(endDate)} ${hhmm(customWindow.end, timezone)}`
      : `${dayLabel(date)} · ${timeRange(customWindow.start, customWindow.end, timezone)}`;
  })();
  const footer = addFooterSummary({
    blockers: blockers.length,
    clientName: selectedCustomer ? customerDisplayName(selectedCustomer) : null,
    when: whenSummary,
    serviceCount: picked.length,
    words,
    totalMinor: effectiveTotalMinor,
    depositMinor: paymentMethod === "credit" ? null : depositMinor,
    currency,
    credit: paymentMethod === "credit",
  });

  // ---- Payment options -----------------------------------------------------------------
  const paymentOptions: ChoiceOption<PaymentMethod>[] = [
    {
      value: "none",
      label: PAYMENT_METHOD_NAMES.none,
      line: "The confirmation is a payment request.",
    },
    {
      value: "pay_later",
      label: PAYMENT_METHOD_NAMES.pay_later,
      line: "Plain confirmation. Take payment when it's done.",
    },
    ...(noPackages
      ? []
      : [
          {
            value: "credit" as const,
            label: PAYMENT_METHOD_NAMES.credit,
            line: noCredit
              ? `No credits on ${firstName ?? "the client"}'s account`
              : additional.length > 0
                ? `Only one ${serviceNoun} can be paid with a credit`
                : creditsLeft !== null
                  ? `${creditsLeft} ${creditsLeft === 1 ? "credit" : "credits"} left · covers one ${serviceNoun} only`
                  : `Covers one ${serviceNoun} only`,
            disabled: noCredit || additional.length > 0,
          },
        ]),
    ...(bankTransferEnabled
      ? [
          {
            value: "bank_transfer" as const,
            label: PAYMENT_METHOD_NAMES.bank_transfer,
            line:
              effectiveTotalMinor <= 0
                ? `Not for ${symbol}0 bookings`
                : "Reserved until the transfer arrives. You'll get the details to read out.",
            disabled: effectiveTotalMinor <= 0,
          },
        ]
      : []),
  ];

  const mode = priceMode(price);
  const priceHelp = (() => {
    const list = money(rolledTotalMinor);
    switch (mode) {
      case "per_service":
        return `Each ${serviceNoun} is booked at its row price, with the ${list} list total beside it. Nothing is recorded as a discount.`;
      case "discount":
        return `${discountLabel(discount!, money)} · −${money(discountMinor!)}. The ${words.services} stay at list and the discount shows as its own line.`;
      case "whole_job":
        return `Adjusted from the ${list} list price. The ${words.services} stay at list and the ${formatAdjustment(
          effectiveTotalMinor - rolledTotalMinor,
          money,
        )} shows as a ${adjustmentLabel(effectiveTotalMinor - rolledTotalMinor).toLowerCase()} line.`;
      case "list":
        return `Type a total, a discount, or a price on a ${serviceNoun} row. Only one applies at a time.`;
    }
  })();

  const waitlistLink = (label: string) =>
    onNoAvailability && validDate && customerId && serviceId ? (
      <p className="text-xs text-muted-foreground">
        {label}
        <button
          type="button"
          className="cursor-pointer font-medium text-primary underline underline-offset-4"
          onClick={() =>
            onNoAvailability({
              customerId,
              serviceId,
              ...(linkedRecordId !== "none" ? { linkedRecordId } : {}),
              ...(locationId ? { locationId } : {}),
              ...(staffId !== "all" ? { staffId } : {}),
              date,
            })
          }
        >
          Add to waitlist instead
        </button>
      </p>
    ) : null;

  const slotTz = (s: { displayTimezone?: string | null }) => s.displayTimezone || timezone;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) onOpenChange(true);
        else requestClose();
      }}
    >
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what="this booking"
        onDiscard={() => {
          setConfirmDiscard(false);
          reset();
          onOpenChange(false);
        }}
      />
      {/* The header and footer stay put; only the body between them scrolls. */}
      <DialogContent className="overflow-hidden sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{bankResult ? "Awaiting bank transfer" : "Add booking"}</DialogTitle>
          <DialogDescription>
            {bankResult
              ? "The booking is reserved. Read these details out to the customer; they've been emailed too."
              : setupBlocked
                ? "Finish a quick bit of setup first, then you can take bookings."
                : "Pick the client and service, choose a time, and it's confirmed straight away."}
          </DialogDescription>
        </DialogHeader>

        {bankResult ? (
          <>
            <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              <BankTransferPanel details={bankResult} audience="staff" />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : catalogueLoading || setupBlocked ? (
          <>
            <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {catalogueLoading ? (
                <div className="grid gap-6" aria-busy="true" aria-label="Loading">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="grid gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-[22px] animate-pulse rounded-full bg-muted" />
                        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      </div>
                      <div className="h-[42px] animate-pulse rounded-[10px] bg-muted" />
                    </div>
                  ))}
                </div>
              ) : noServices ? (
                <SetupGate
                  icon={<Layers className="size-5" />}
                  title={`Create a ${serviceNoun} first`}
                  description="Bookings need something clients can book: duration, price and who can deliver it."
                  step="service"
                  to="/services"
                  search={{ create: true }}
                  cta={`Create ${serviceNoun}`}
                  onNavigate={() => onOpenChange(false)}
                />
              ) : noLocations ? (
                <SetupGate
                  icon={<MapPin className="size-5" />}
                  title="Add a location first"
                  description={`Add where you work, or the area you cover, so we know where this ${words.booking} happens.`}
                  step="location"
                  to="/locations"
                  cta="Add location"
                  onNavigate={() => onOpenChange(false)}
                />
              ) : (
                <SetupGate
                  icon={<UserRound className="size-5" />}
                  title="Add a client first"
                  description="Every booking needs a client on the books."
                  step="client"
                  to="/clients"
                  cta="Add client"
                  onNavigate={() => onOpenChange(false)}
                  onAction={() => setAddClientOpen(true)}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={requestClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Nothing in here may be wider than the sheet. Every grid/flex item defaults
                to `min-width: auto`, so a long client name, vehicle label or service name
                in a nowrap trigger used to grow the row, then the grid, then the sheet
                itself, which scrolled sideways on phones. `truncate` alone can't stop that
                (it doesn't change intrinsic size); `min-w-0` on every descendant does, and
                the explicit 0-minimum column keeps the root from growing past its
                container too. */}
            <div className="no-scrollbar -mx-1 grid min-h-0 min-w-0 flex-1 grid-cols-1 content-start gap-7 overflow-y-auto px-1 pb-2 **:min-w-0">
              <FormSection
                id={SECTION_IDS.client}
                number={ADD_SECTIONS.client}
                title="Client"
                state={sectionState("client", Boolean(customerId) && !vehicleMissing)}
              >
                {selectedCustomer && !changingClient ? (
                  <div className="flex items-center gap-3 rounded-[14px] border bg-secondary/40 px-3 py-2.5">
                    <CustomerAvatar customer={selectedCustomer} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {customerDisplayName(selectedCustomer)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          selectedCustomer.phoneDisplay || selectedCustomer.emailDisplay,
                          hasLinkedRecords && customerRecords.isSuccess
                            ? `${activeRecords.length} ${activeRecords.length === 1 ? words.vehicle : words.vehicles}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setChangingClient(true)}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <CustomerSearchPicker
                        value={selectedCustomer}
                        suggestions={customerList}
                        placeholder="Choose or search for a client"
                        phoneSheet
                        defaultOpen={changingClient}
                        onOpenChange={(o) => {
                          if (!o) setChangingClient(false);
                        }}
                        onSelect={pickClient}
                      />
                    </div>
                    {/* New walk-in? Add them here without leaving the half-filled form. */}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-[42px] shrink-0"
                      onClick={() => setAddClientOpen(true)}
                      aria-label="Add a new client"
                      title="Add a new client"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                )}

                {hasLinkedRecords && customerId ? (
                  <div className="grid gap-2">
                    <Label>
                      {recordTerm}
                      {recordRequired ? <span className="text-destructive"> *</span> : null}
                    </Label>
                    {customerRecords.isSuccess && activeRecords.length === 0 ? (
                      <>
                        {firstName ? (
                          <p className="text-xs text-muted-foreground">
                            {firstName} has no {words.vehicles} yet
                          </p>
                        ) : null}
                        <QuickAddLinkedRecord
                          key={customerId}
                          customerId={customerId}
                          fields={recordFields}
                          term={recordTerm}
                          handleRef={quickAdd}
                          onInputChange={onQuickAddInput}
                          inputHint={quickAddHint}
                          onAdded={(record) => {
                            setLinkedRecordId(record.id);
                            toast.success(`${recordTerm} added`, {
                              description: `${record.displayLabel} is on this booking. Add more details from the client's profile whenever you like.`,
                            });
                          }}
                        />
                      </>
                    ) : quickAddOpen ? (
                      <QuickAddLinkedRecord
                        key={customerId}
                        customerId={customerId}
                        fields={recordFields}
                        term={recordTerm}
                        handleRef={quickAdd}
                        onInputChange={onQuickAddInput}
                        inputHint={quickAddHint}
                        autoFocus
                        onCancel={() => setQuickAddOpen(false)}
                        onAdded={(record) => {
                          setLinkedRecordId(record.id);
                          setQuickAddOpen(false);
                          toast.success(`${recordTerm} added`, {
                            description: `${record.displayLabel} is on this booking. Add more details from the client's profile whenever you like.`,
                          });
                        }}
                      />
                    ) : (
                      <div className="flex gap-2">
                        <Select value={linkedRecordId} onValueChange={setLinkedRecordId}>
                          <SelectTrigger className={cn(FIELD, "flex-1")}>
                            <SelectValue
                              placeholder={recordRequired ? `Choose a ${recordTermLower}` : "None"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {recordRequired ? null : (
                              <SelectItem value="none">No {recordTermLower}</SelectItem>
                            )}
                            {activeRecords.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.displayLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-[42px] shrink-0"
                          onClick={() => setQuickAddOpen(true)}
                          aria-label={`Add another ${recordTermLower}`}
                        >
                          <Plus className="size-4" />
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Once the car is in, does the client need running somewhere? */}
                {isCarDetailing && customerId ? (
                  <ClientLiftFields
                    value={lift}
                    onChange={setLift}
                    idPrefix="booking"
                    clientFirstName={firstName}
                  />
                ) : null}
              </FormSection>

              <FormSection
                id={SECTION_IDS.services}
                number={ADD_SECTIONS.services}
                title={
                  picked.length > 0
                    ? `${picked.length} ${picked.length === 1 ? words.Service : words.Services}`
                    : words.Services
                }
                state={sectionState("services", Boolean(service))}
              >
                <ServiceMultiPicker
                  services={serviceList}
                  value={picked}
                  onChange={setPicked}
                  pairingPrices={pairingPrices}
                  linePrices={linePrices}
                  onLinePriceChange={setLinePrice}
                  multi={!service || multiAllowed}
                  creditRow={paymentMethod === "credit"}
                  singleReason={
                    paymentMethod === "credit"
                      ? `Paying with a credit covers one ${serviceNoun}, so this replaced the other.`
                      : undefined
                  }
                />
                {multiAllowed && suggested.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Suggested add-ons:</span>
                    {suggested.map((u) => (
                      <button
                        key={u.upsellServiceId}
                        type="button"
                        onClick={() =>
                          setPicked([...picked, { serviceId: u.upsellServiceId, variantId: null }])
                        }
                        className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-secondary"
                      >
                        <Plus className="size-3" />
                        {u.service?.name}
                        {u.effectivePriceMinor !== null ? (
                          <span className="text-muted-foreground">
                            {formatMoney(u.effectivePriceMinor, u.service?.currency ?? "GBP")}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {/* Detailing: the materials the job will start with (staff records; not charged). */}
                {isCarDetailing && picked.length > 0 ? (
                  <ServiceDefaultsHint serviceIds={picked.map((p) => p.serviceId)} />
                ) : null}
              </FormSection>

              <FormSection
                id={SECTION_IDS.when}
                number={ADD_SECTIONS.when}
                title="When"
                state={sectionState("when", Boolean(service) && !blockedSections.has("when"))}
              >
                {soleLocation && soleStaff ? null : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* One location is picked for them; nothing to ask. */}
                    {soleLocation ? null : (
                      <div className="grid gap-2">
                        <Label>Location</Label>
                        <Select
                          value={locationId}
                          onValueChange={(v) => {
                            setLocationId(v);
                            setSlotKey(null);
                          }}
                        >
                          <SelectTrigger className={FIELD}>
                            <SelectValue placeholder="Choose a location" />
                          </SelectTrigger>
                          <SelectContent>
                            {locationList.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {soleStaff ? null : (
                      <div className="grid gap-2">
                        <Label>{staffNoun}</Label>
                        <Select
                          value={staffId}
                          onValueChange={(v) => {
                            setStaffId(v);
                            setSlotKey(null);
                          }}
                        >
                          <SelectTrigger className={FIELD}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {scheduling === "custom"
                                ? `Choose a ${staffLower}…`
                                : `Any ${staffLower}`}
                            </SelectItem>
                            {(staff.data ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {scheduling === "custom" && !customStaffId ? (
                          <p className="text-xs text-destructive">
                            A set time needs a {staffLower} to do the work.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-2">
                  <Label id="add-booking-date-label">
                    {scheduling === "custom" ? (allDay ? "First day" : "Date") : "Date"}
                  </Label>
                  <DayStrip
                    value={date}
                    todayIsoDate={todayIsoDate}
                    label={scheduling === "custom" && allDay ? "First day" : "Date"}
                    onChange={(d) => {
                      setDate(d);
                      setSlotKey(null);
                    }}
                  />
                </div>

                {!service ? (
                  <WaitingLine>Choose a {serviceNoun} to see times.</WaitingLine>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Time</Label>
                      <Segmented
                        label="How to set the time"
                        value={scheduling}
                        onChange={(v) => {
                          setScheduling(v);
                          setSlotKey(null);
                          setEndTouched(false);
                        }}
                        options={[
                          { value: "slot", label: "Pick a slot" },
                          { value: "custom", label: "Set the time" },
                        ]}
                      />
                    </div>

                    {scheduling === "custom" ? (
                      <div className="grid gap-3">
                        {/* Whole day or a specific time is the first choice, not a checkbox
                            tucked under the dates: people didn't spot that unticking
                            "All day" is how you get a start time. */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Segmented
                            label="Whole day or a specific time"
                            value={allDay ? "all-day" : "time"}
                            onChange={(v) => {
                              setAllDay(v === "all-day");
                              setEndTouched(false);
                            }}
                            options={[
                              { value: "all-day", label: "All day" },
                              { value: "time", label: "Pick a time" },
                            ]}
                          />
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              customWindow ? "text-muted-foreground" : "text-destructive",
                            )}
                          >
                            {/* All day blocks the diary, it doesn't change the service: a
                                2-hour coating booked all day is "All day · 2 hrs", never "1 day". */}
                            {customWindow
                              ? allDay
                                ? formatAllDayDuration(
                                    catalogueDurationMinutes,
                                    customWindow.minutes,
                                  )
                                : `Duration: ${formatDurationLong(customWindow.minutes)}`
                              : "The end must come after the start."}
                          </span>
                        </div>
                        {allDay ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-2">
                              <Label className="text-xs text-muted-foreground">First day</Label>
                              <p className="flex h-[42px] items-center text-sm font-medium">
                                {validDate ? dayLabel(date) : "Pick a date above"}
                              </p>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="booking-end-date">Last day</Label>
                              <input
                                id="booking-end-date"
                                type="date"
                                value={endDate}
                                min={date}
                                onChange={(e) => {
                                  setEndDate(e.target.value);
                                  setEndTouched(true);
                                }}
                                className={DATE_INPUT}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="grid gap-2">
                                <Label htmlFor="booking-start-time">Start time</Label>
                                <input
                                  id="booking-start-time"
                                  type="time"
                                  aria-label="Start time"
                                  value={startTime}
                                  onChange={(e) => setStartTime(e.target.value)}
                                  className={DATE_INPUT}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="booking-end-time">End time</Label>
                                <input
                                  id="booking-end-time"
                                  type="time"
                                  aria-label="End time"
                                  value={endTime}
                                  onChange={(e) => {
                                    setEndTime(e.target.value);
                                    setEndTouched(true);
                                  }}
                                  className={DATE_INPUT}
                                />
                              </div>
                            </div>
                            {/* The end date only matters past midnight or for a long job;
                                it also shows while the end is before the start so it can
                                be put right. */}
                            {endDate !== date ||
                            catalogueDurationMinutes >= MINUTES_PER_DAY ||
                            !customWindow ? (
                              <div className="grid gap-2">
                                <Label htmlFor="booking-end-date">End date</Label>
                                <input
                                  id="booking-end-date"
                                  type="date"
                                  value={endDate}
                                  min={date}
                                  onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setEndTouched(true);
                                  }}
                                  className={DATE_INPUT}
                                />
                              </div>
                            ) : null}
                          </div>
                        )}
                        {customSpan ? (
                          <p className="text-xs text-muted-foreground">
                            {/* The days the job runs on; the weekend in between stays free. */}
                            {`Runs ${customSpan}${
                              customWindow && customWindow.layout.segments.length > 1
                                ? `; the ${customStaff?.displayName ?? staffLower} is free on the days between.`
                                : "."
                            }`}
                          </p>
                        ) : null}
                        {allDay ? (
                          <p className="text-xs text-muted-foreground">
                            {`Blocks ${customStaff?.displayName ?? `the ${staffLower}`} for the whole ${
                              customWindow && customWindow.minutes > 1440 ? "days" : "day"
                            }; the client sees the ${
                              customWindow && customWindow.minutes > 1440 ? "dates" : "date"
                            } rather than a time.`}
                          </p>
                        ) : null}
                        {hoursWarning ? <Strip tone="amber">{hoursWarning}</Strip> : null}
                        {/* Timed on timed (or on an event) cannot be overridden — the API
                            would refuse it — so flag it while the time is being set. */}
                        {overlapCopy ? (
                          <Strip tone="red" id="add-booking-clash">
                            {overlapCopy}
                          </Strip>
                        ) : null}
                        {/* The mirror of a drop-in: an all-day job landing on a day that
                            already has timed work or an event. Staff say so explicitly; the
                            request then carries dropIn and the API lets the two share the day. */}
                        {allDay && timedNote ? (
                          dropIn ? (
                            <Strip
                              tone="blue"
                              action={
                                <LinkButton onClick={() => setDropIn(false)}>Undo</LinkButton>
                              }
                            >
                              {timedNote}. Booking anyway; both stay on the calendar.
                            </Strip>
                          ) : (
                            <Strip
                              tone="amber"
                              action={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  onClick={() => setDropIn(true)}
                                >
                                  Book anyway
                                </Button>
                              }
                            >
                              {timedNote}. Book anyway?
                            </Strip>
                          )
                        ) : null}
                        {holds.length > 0 && !quietDropIn ? (
                          dropIn ? (
                            <Strip
                              tone="blue"
                              action={
                                <LinkButton onClick={() => setDropIn(false)}>Undo</LinkButton>
                              }
                            >
                              {holdNote}.{" "}
                              {allDay
                                ? "Booked as a drop-in on the same day, no set time."
                                : "Booked as a drop-in alongside it."}
                            </Strip>
                          ) : (
                            <Strip
                              tone="amber"
                              action={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  onClick={() => setDropIn(true)}
                                >
                                  Squeeze in a drop-in
                                </Button>
                              }
                            >
                              {holdNote}.
                            </Strip>
                          )
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {!serviceId || !locationId ? (
                          <WaitingLine>
                            Choose a {serviceNoun} and location to see times.
                          </WaitingLine>
                        ) : !validDate ? (
                          <WaitingLine>Pick a date to see times.</WaitingLine>
                        ) : availability.isLoading ? (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-busy="true">
                            {Array.from({ length: 6 }, (_, i) => (
                              <div
                                key={i}
                                className="h-11 animate-pulse rounded-[10px] bg-primary/10 sm:h-9"
                              />
                            ))}
                          </div>
                        ) : slots.length === 0 ? (
                          <div className="grid gap-3">
                            {/* Held by all-day work: say so, and offer to squeeze the job in
                                beside it. Picking that re-quotes the day ignoring the hold
                                (timed jobs and events still block). */}
                            {holds.length > 0 && !dropIn && !pickedHeldDay ? (
                              <Strip
                                tone="amber"
                                action={
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={pickAllDayDropIn}
                                    >
                                      Any time that day
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() => setDropIn(true)}
                                    >
                                      Pick a time
                                    </Button>
                                  </>
                                }
                              >
                                {holdNote}. Squeeze in a drop-in?
                              </Strip>
                            ) : pickedHeldDay ? (
                              <Strip tone="amber">
                                No free times left this day. Try another day.
                              </Strip>
                            ) : dropIn ? (
                              <Strip
                                tone="amber"
                                action={
                                  <LinkButton onClick={() => setDropIn(false)}>Undo</LinkButton>
                                }
                              >
                                {`No room for a drop-in${customStaff ? ` for ${customStaff.displayName}` : ""}. Timed work, an event or working hours are in the way.`}
                              </Strip>
                            ) : (
                              <Strip tone="amber">
                                <span className="block font-semibold">
                                  No availability on {dayLabel(date)}
                                </span>
                                <span className="block">
                                  {service.availabilityWindows &&
                                  service.availabilityWindows.length > 0 &&
                                  !sessionOfferedOnDay(
                                    service.availabilityWindows,
                                    isoDayOfWeekFromIsoDate(date),
                                  )
                                    ? `This ${serviceNoun} isn't offered on that day.`
                                    : "Try another day, or block the whole day."}
                                </span>
                              </Strip>
                            )}
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              <AllDayTile onPick={pickAllDay} />
                            </div>
                            {/* Nothing suits: capture them instead of losing the enquiry. */}
                            {!dropIn || pickedHeldDay ? waitlistLink("Can't find a time? ") : null}
                          </div>
                        ) : (
                          <div
                            role="radiogroup"
                            aria-label="Times"
                            {...radioGroupKeys}
                            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                          >
                            {slots.map((s, i) => {
                              const key = `${s.start}:${s.staffId}`;
                              const on = key === slotKey;
                              const time = formatInTz(s.start, slotTz(s), {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  tabIndex={on || (!selectedSlot && i === 0) ? 0 : -1}
                                  aria-label={`${time}, ${moneyShort(s.priceMinor, s.currency)}, ends ${timeInTz(s.end, slotTz(s))}`}
                                  onClick={() => setSlotKey(key)}
                                  className={cn(
                                    "min-h-11 cursor-pointer rounded-[10px] border py-2 text-xs tabular-nums transition-colors sm:min-h-0",
                                    on
                                      ? "border-primary bg-primary-soft font-semibold text-primary"
                                      : "bg-card hover:bg-secondary",
                                  )}
                                  title={
                                    s.remainingCapacity > 1
                                      ? `${s.remainingCapacity} places · ${formatMoney(s.priceMinor, s.currency)}`
                                      : formatMoney(s.priceMinor, s.currency)
                                  }
                                >
                                  {time}
                                </button>
                              );
                            })}
                            <AllDayTile onPick={pickAllDay} />
                          </div>
                        )}
                        {dropIn && !quietDropIn && slots.length > 0 ? (
                          <Strip
                            tone="blue"
                            action={<LinkButton onClick={() => setDropIn(false)}>Undo</LinkButton>}
                          >
                            {holds.length > 0 ? `${holdNote}. ` : ""}
                            Times shown are for a drop-in alongside the all-day job.
                          </Strip>
                        ) : null}
                        {selectedSlot ? (
                          <p className="text-xs text-muted-foreground">
                            {slotSummary({
                              slot: selectedSlot,
                              timeZone: slotTz(selectedSlot),
                              multiDay: spansDays(
                                selectedSlot.start,
                                selectedSlot.end,
                                slotTz(selectedSlot),
                              ),
                              capacity:
                                service.bookingMode !== "individual" ? service.capacityMax : null,
                              stepMinutes: STAFF_SLOT_STEP_MINUTES,
                            })}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </FormSection>

              <FormSection
                id={SECTION_IDS.price}
                number={ADD_SECTIONS.price}
                title="Price"
                state={sectionState("price", Boolean(service) && !priceInvalid)}
                aside={
                  service && paymentMethod !== "credit" && priceOverridden ? (
                    <LinkButton
                      onClick={() => {
                        setPriceInput(null);
                        setDiscount(null);
                        setLinePrices({});
                      }}
                    >
                      List {money(rolledTotalMinor)} · reset
                    </LinkButton>
                  ) : null
                }
              >
                {!service ? (
                  <WaitingLine>The price shows once a {serviceNoun} is picked.</WaitingLine>
                ) : paymentMethod === "credit" ? (
                  <WaitingLine>
                    Settled by a package credit. No money is taken, so price and deposit are hidden.
                  </WaitingLine>
                ) : (
                  <div className="grid gap-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="booking-price">Total</Label>
                        <MoneyInput
                          id="booking-price"
                          symbol={symbol}
                          value={
                            priceInput !== null
                              ? priceInput
                              : moneyInputValue(overridePriceMinor ?? rolledTotalMinor)
                          }
                          onValueChange={(v) => {
                            setPriceInput(v);
                            setDiscount(null);
                            setLinePrices({});
                          }}
                          aria-invalid={priceInvalid && !discountInvalid && !lineInvalid}
                          aria-describedby="booking-price-help"
                        />
                      </div>
                      {/* Discount: a percentage or a fixed amount off the list price. Sets
                          the same override as typing a price, just worked out for you. */}
                      <div className="grid gap-2">
                        <Label htmlFor="booking-discount">Discount</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id="booking-discount"
                            inputMode="decimal"
                            placeholder="0"
                            className={cn(FIELD, "w-16 aria-invalid:border-destructive")}
                            value={discount?.value ?? ""}
                            onChange={(e) => {
                              setPriceInput(null);
                              setLinePrices({});
                              setDiscount(
                                e.target.value.trim() === ""
                                  ? null
                                  : { mode: discount?.mode ?? "percent", value: e.target.value },
                              );
                            }}
                            aria-invalid={discountInvalid}
                          />
                          <Segmented
                            label="Discount as"
                            value={discount?.mode ?? "percent"}
                            onChange={(m) => {
                              setPriceInput(null);
                              setLinePrices({});
                              setDiscount({ mode: m, value: discount?.value ?? "" });
                            }}
                            options={[
                              { value: "percent", label: "% off" },
                              { value: "amount", label: `${symbol} off` },
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                    {discountMinor !== null && overridePriceMinor !== null ? (
                      <p className="text-right text-xs text-muted-foreground tabular-nums">
                        {discountLabel(discount!, money)} · −{money(discountMinor)}
                      </p>
                    ) : null}
                    <div id="booking-price-help" className="flex items-start gap-2">
                      {priceInvalid ? (
                        <p className="text-xs text-destructive">
                          {priceError(price, discount, money(rolledTotalMinor), words)}
                        </p>
                      ) : (
                        <>
                          <ModeChip>{priceModeLabel(mode, words)}</ModeChip>
                          <p className="text-xs text-muted-foreground">{priceHelp}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection
                id={SECTION_IDS.payment}
                number={ADD_SECTIONS.payment}
                title="Payment"
                state={sectionState("payment", Boolean(service) && !depositInvalid)}
              >
                {!service ? (
                  <WaitingLine>The price shows once a {serviceNoun} is picked.</WaitingLine>
                ) : (
                  <>
                    <ChoiceCards
                      label="Payment method"
                      value={paymentMethod}
                      options={paymentOptions}
                      onChange={(next) => {
                        if (next === "credit") setAdditional([]);
                        setPaymentMethod(next);
                        setPaymentTouched(true);
                      }}
                    />
                    {paymentMethod === "credit" && creditsLeft !== null && firstName ? (
                      <p className="text-xs text-muted-foreground">
                        {firstName} has {Math.max(0, creditsLeft - 1)}{" "}
                        {creditsLeft - 1 === 1 ? "credit" : "credits"} left after this.
                      </p>
                    ) : null}
                    {depositApplies && effectiveTotalMinor > 0 ? (
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="booking-deposit">Deposit to secure it</Label>
                          {depositOverridden ? (
                            <LinkButton onClick={() => setDepositInput(null)}>
                              Use {serviceNoun} default
                            </LinkButton>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <MoneyInput
                            id="booking-deposit"
                            className="w-[140px]"
                            symbol={symbol}
                            placeholder="0.00"
                            value={
                              depositOverridden
                                ? (depositInput ?? "")
                                : defaultDepositMinor != null
                                  ? moneyInputValue(defaultDepositMinor)
                                  : ""
                            }
                            onValueChange={setDepositInput}
                            aria-invalid={depositInvalid}
                            aria-describedby="booking-deposit-help"
                          />
                          <p
                            id="booking-deposit-help"
                            className={cn(
                              "min-w-0 flex-1 basis-40 text-xs",
                              depositInvalid ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {depositInvalid
                              ? `Must be under ${money(effectiveTotalMinor)}, or clear it for no deposit.`
                              : depositMinor != null
                                ? `${money(depositMinor)} now · ${money(effectiveTotalMinor - depositMinor)} ${paymentMethod === "pay_later" ? "after the job" : "later"}`
                                : "No deposit"}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </FormSection>

              <FormSection
                id={SECTION_IDS.notes}
                number={ADD_SECTIONS.notes}
                title="Notes and confirmation"
                state="idle"
              >
                <div className="grid gap-2">
                  <Label htmlFor="booking-notes">Internal notes</Label>
                  <Textarea
                    id="booking-notes"
                    placeholder="Visible to staff only"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <ChannelBoxes
                  title={`Send confirmation to ${firstName ?? "client"}`}
                  ariaPrefix="Send confirmation"
                  ticks={ticks}
                  blocks={blocks}
                  onChange={setChannel}
                  hint={notifyHint}
                />
                {waitlistLink("")}
              </FormSection>
            </div>

            <ul id="add-booking-missing" className="sr-only">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <DialogFooter className="items-stretch gap-3 max-sm:flex-col sm:items-center sm:gap-2">
              <FooterSummary main={footer.main} sub={footer.sub} attention={footer.attention} />
              <Button variant="ghost" onClick={requestClose} className="max-sm:hidden">
                Cancel
              </Button>
              <Button
                onClick={submit}
                // Looks disabled while something is missing but stays clickable, so
                // the click can explain what's left rather than doing nothing.
                disabled={submitting}
                aria-disabled={submitting || blocked}
                aria-describedby={
                  cn(blocked && "add-booking-missing", overlapCopy && "add-booking-clash") ||
                  undefined
                }
                className={cn(blocked && !submitting && "opacity-50")}
                title={blocked ? blockers.join(" · ") : undefined}
              >
                {submitting ? "Creating…" : "Create booking"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      {/* The API said the only things in the way can share the day: ask, then re-send. */}
      <DropInConfirmDialog
        open={override !== null}
        onOpenChange={(next) => {
          if (!next && !submitting) setOverride(null);
        }}
        conflicts={override?.conflicts ?? []}
        newBookingAllDay={override?.allDay ?? false}
        timezone={timezone}
        busy={submitting}
        onConfirm={() => void confirmOverride()}
      />
      {/* Stacks over the booking drawer; the new client is selected on save. */}
      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          setLinkedRecordId("none");
          setQuickAddOpen(false);
          setChangingClient(false);
        }}
      />
    </Dialog>
  );
}
