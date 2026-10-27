import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronDown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CustomerSearchPicker,
  type LinkedRecordField,
  QuickAddLinkedRecord,
  type QuickAddLinkedRecordHandle,
  activeSortedFields,
} from "@/components/LinkedRecordDialogs";
import { ServiceMultiPicker, type PickedService } from "@/components/ServiceMultiPicker";
import { useServiceUpsells } from "@/lib/api/upsells";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { ClientLiftFields } from "@/components/ClientLiftFields";
import { StatusBadge } from "@/components/ui-bits";
import {
  Box,
  ChannelBoxes,
  ChoiceCards,
  FIELD,
  FooterSummary,
  FormSection,
  LinkButton,
  LockedRow,
  ModeChip,
  MoneyInput,
  Segmented,
  Strip,
  WaitingLine,
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
import {
  useAmendBooking,
  useCorrectBookingTime,
  useCustomer,
  useCustomerLinkedRecords,
  useCustomers,
  useLinkedRecord,
  useLinkedRecordDefinition,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import type { AmendBookingBody, Booking } from "@/lib/api/types";
import { customerDisplayName } from "@/lib/api/types";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { paymentMethodLabel } from "@/lib/booking-changes";
import { bookingJobMinutes, MINUTES_PER_DAY, windowFit } from "@/lib/booking-duration";
import {
  bookingWords,
  contactBlocks,
  currencySymbol,
  editDefaultTicks,
  editDeposit,
  editFooterSummary,
  editNotifyHint,
  jobPrice,
  moneyInputValue,
  NOTIFY_PREFS,
  PAYMENT_METHOD_NAMES,
  priceError,
  priceMode,
  priceModeLabel,
  reachableChannels,
  type ChannelTicks,
  type ContactBlocks,
  type NotifyChannel,
  type NotifyPref,
} from "@/lib/booking-form";
import {
  clientLiftFromDraft,
  describeClientLift,
  draftFromClientLift,
  sameClientLift,
  type ClientLiftDraft,
} from "@/lib/client-lift";
import {
  adjustmentLabel,
  bookingPriceBreakdown,
  formatAdjustment,
  linePricesMatch,
  linePriceMinor,
  repricedLines,
} from "@/lib/booking-price";
import { discountLabel, type Discount } from "@/lib/discount";
import {
  addDays,
  formatBookingWhen,
  formatDurationLong,
  formatInTz,
  formatMoney,
  isoDate,
  isoDateInTz,
  parseIso,
  timeInTz,
  todayLabelInTz,
  zonedDateTimeToIso,
} from "@/lib/format";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import { cn } from "@/lib/utils";
import { layoutWorkingDuration, scheduleFor } from "@/lib/working-days";

type EditablePaymentMethod = "none" | "bank_transfer" | "pay_later";

type Change = {
  label: string;
  from: string;
  to: string;
  clientVisible: boolean;
  /** How the notify hint names it ("price"); the label, lower-cased, when unset. */
  word?: string;
};

const SECTION_IDS = {
  when: "edit-booking-when-card",
  services: "edit-booking-services",
  price: "edit-booking-price-section",
  payment: "edit-booking-payment",
  more: "edit-booking-more-section",
  notify: "edit-booking-notify",
} as const;

/** How long "Change how it's paid" keeps the Payment section lit after scrolling to it. */
const PAYMENT_FLASH_MS = 2000;

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whole-map comparison of two sets of row prices, for tracking a refreshed booking. */
function sameLinePrices(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  return linePricesMatch(a, b, [...new Set([...Object.keys(a), ...Object.keys(b)])]);
}

/**
 * Date/time inputs for a booking's current window, in the business's zone — the same
 * clock the calendar draws it on and the API snaps all-day jobs to. Reading it on the
 * phone's clock instead put a job's "13 Oct" on the 12th for staff abroad.
 */
function whenFields(booking: { start: string; end: string }, timeZone: string) {
  // `end` is exclusive: the last day is the one containing the minute before it.
  const last = new Date(new Date(booking.end).getTime() - 60_000).toISOString();
  return {
    date: isoDateInTz(booking.start, timeZone),
    time: timeInTz(booking.start, timeZone),
    lastDay: isoDateInTz(last, timeZone),
  };
}

/** "13 Oct 2026, 10:00 to 11:15": the form's copy never joins times with a dash. */
function whenText(booking: { start: string; end: string; allDay?: boolean }, timeZone: string) {
  return formatBookingWhen(booking, timeZone).replaceAll(" – ", " to ");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function samePicked(a: PickedService[], b: PickedService[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.serviceId === b[i]!.serviceId && (x.variantId ?? null) === (b[i]!.variantId ?? null),
    )
  );
}

/**
 * Change what a booking *is* — services, who does it, where, which vehicle, the
 * price, how it's paid, the internal note — from the booking panel. When it
 * happens stays read-only here and hands off to Reschedule (RECA edit booking).
 *
 * Mount only while open: the form reads the booking once, so a colleague's
 * concurrent change refreshes the version behind the scenes without wiping edits.
 */
export function EditBookingDialog({
  booking,
  onClose,
  onReschedule,
  addServiceIds,
  focusPayment,
}: {
  booking: Booking;
  onClose: () => void;
  /** Close this and open the reschedule dialog. */
  onReschedule: () => void;
  /** Services to start with added (a customer's add-on request); duplicates are ignored. */
  addServiceIds?: readonly string[];
  /** Open scrolled to Payment, lit up briefly ("Change how it's paid"). */
  focusPayment?: boolean;
}) {
  const tenant = useTenant();
  const timezone = booking.timezone || tenant.business?.defaultTimezone || "Europe/London";
  const amend = useAmendBooking();
  const words = bookingWords(tenant.terminology);

  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const smsCredits = useSmsCreditsSummary();

  // ---- What the booking is now -------------------------------------------------
  // A line's variant id can predate a service edit that re-created its variants (older
  // API builds did that on every save). Map it onto the current variant with the same
  // name so the picker shows "Level 2 · S" and sends an id the catalogue knows.
  const originalPicked = useMemo<PickedService[]>(
    () =>
      [...(booking.lineItems ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((li) => {
          const variantId = li.variantId ?? null;
          if (!variantId) return { serviceId: li.serviceId, variantId: null };
          const service = services.data?.find((s) => s.id === li.serviceId);
          if (!service || service.variants.some((v) => v.id === variantId)) {
            return { serviceId: li.serviceId, variantId };
          }
          const byName = li.variantName
            ? service.variants.find(
                (v) => v.name.trim().toLowerCase() === li.variantName!.trim().toLowerCase(),
              )
            : undefined;
          return { serviceId: li.serviceId, variantId: byName?.id ?? variantId };
        }),
    [booking.lineItems, services.data],
  );
  const originalLabels = useMemo(
    () =>
      [...(booking.lineItems ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((li) => (li.variantName ? `${li.name} · ${li.variantName}` : li.name)),
    [booking.lineItems],
  );
  // Catalogue total the job was priced from: every line's list price (RECA-532). The
  // price differs from it when staff priced a service, or the job, differently.
  const breakdown = bookingPriceBreakdown(booking);
  const snapshotListMinor = breakdown.listPriceMinor;
  const originallyOverridden = booking.priceMinor !== snapshotListMinor;
  // Priced per service, with no whole-job discount: setting a total here would replace
  // that with a Discount / Price adjustment line, so say so before it happens.
  const pricedPerService = breakdown.hasRepricedLine && breakdown.adjustmentMinor === 0;
  const paidMinor = booking.paidMinor ?? 0;
  const credit = booking.paymentMethod === "credit";
  const completed = booking.status === "completed";
  // Once money has changed hands the booking belongs to whoever paid (the API 409s).
  const clientLocked = credit || paidMinor > 0;
  // A pay-by-bank booking still waiting for the money can be moved to another way of
  // paying — the API confirms it on the spot, nothing recorded as paid.
  const bankPending =
    booking.status === "awaiting_payment" &&
    booking.paymentMethod === "bank_transfer" &&
    paidMinor === 0;
  const paymentEditable = (booking.status === "confirmed" || bankPending) && !credit;
  // The job's length is its line items, not start → end: a 3-day job that skips a
  // weekend is 3 days, and the API lays it over working days again after an edit.
  const currentMinutes = bookingJobMinutes(booking);
  // Mirrors the API: an all-day or hand-set window survives a service change, a
  // catalogue-length job grows or shrinks from its start.
  const customWindow =
    booking.allDay ||
    (booking.lineItems?.[0]?.durationMinutes ?? booking.serviceSnapshot.durationMinutes) !==
      booking.serviceSnapshot.durationMinutes;

  // ---- Form state ---------------------------------------------------------------
  const [picked, setPickedState] = useState<PickedService[]>(() => {
    const extra = (addServiceIds ?? [])
      .filter((id) => !originalPicked.some((p) => p.serviceId === id))
      .map((serviceId) => ({ serviceId, variantId: null }));
    return [...originalPicked, ...extra];
  });
  // Row prices the booking already has. A line charged away from its list price keeps
  // that price in the form, so opening the dialog and saving never quietly puts it back
  // to list — and neither does adding a service beside it, which makes the API rebuild
  // every line from the catalogue.
  const originalLinePrices = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const li of booking.lineItems ?? []) {
      if (li.priceMinor !== li.listPriceMinor) out[li.serviceId] = (li.priceMinor / 100).toFixed(2);
    }
    return out;
  }, [booking.lineItems]);
  const [linePrices, setLinePrices] = useState<Record<string, string>>(originalLinePrices);
  // A colleague re-pricing a service while this form is open refreshes the booking under
  // it. Adopt their prices while nobody here has typed one, so saving an unrelated edit
  // doesn't put their line back to list.
  const seenLinePrices = useRef(originalLinePrices);
  useEffect(() => {
    if (sameLinePrices(seenLinePrices.current, originalLinePrices)) return;
    setLinePrices((current) =>
      sameLinePrices(current, seenLinePrices.current) ? originalLinePrices : current,
    );
    seenLinePrices.current = originalLinePrices;
  }, [originalLinePrices]);
  // If the catalogue arrived after mount and remapped a stale variant id, carry that
  // into the untouched picker (a stale id in `picked` would otherwise read as a change).
  const seenOriginal = useRef(originalPicked);
  useEffect(() => {
    if (samePicked(seenOriginal.current, originalPicked)) return;
    setPickedState((current) =>
      samePicked(current, seenOriginal.current)
        ? originalPicked
        : current.map((p) => {
            const remapped = originalPicked.find(
              (o, i) =>
                o.serviceId === p.serviceId && seenOriginal.current[i]?.variantId === p.variantId,
            );
            return remapped ? { ...p, variantId: remapped.variantId } : p;
          }),
    );
    seenOriginal.current = originalPicked;
  }, [originalPicked]);
  const [customerId, setCustomerId] = useState(booking.leadCustomerId);
  const [linkedRecordId, setLinkedRecordId] = useState(booking.linkedRecordId ?? "none");
  const [staffId, setStaffId] = useState(booking.staffId);
  const [locationId, setLocationId] = useState(booking.locationId);
  // Price override (pounds, as typed). null = the list price for the picked services.
  const [priceInput, setPriceInput] = useState<string | null>(
    originallyOverridden ? (booking.priceMinor / 100).toFixed(2) : null,
  );
  const [discount, setDiscount] = useState<Discount | null>(null);
  // Deposit due up front (pounds, as typed); "" = no deposit. Editable after the fact
  // because staff often only learn of a deposit once the job is already written up.
  const [depositInput, setDepositInput] = useState(
    booking.depositMinor != null ? (booking.depositMinor / 100).toFixed(2) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<Booking["paymentMethod"]>(
    booking.paymentMethod,
  );
  const leavesBankPending = bankPending && paymentMethod !== "bank_transfer";
  const [notes, setNotes] = useState(booking.notesInternal ?? "");
  // Automotive only: the run home/to the station once the car has been dropped off.
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const [lift, setLift] = useState<ClientLiftDraft>(() => draftFromClientLift(booking.clientLift));
  // null = follow the default (the remembered channels, for anything the client would
  // notice). Read-only here: only Add booking changes what's remembered.
  const [notifyChoice, setNotifyChoice] = useState<ChannelTicks | null>(null);
  const [notifyPref] = useStoredState<NotifyPref>(
    `recavo.booking.notify.${tenant.businessId}`,
    "email",
    NOTIFY_PREFS,
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAdd = useRef<QuickAddLinkedRecordHandle | null>(null);
  const [quickAddPending, setQuickAddPending] = useState(false);
  const onQuickAddInput = useCallback((has: boolean) => setQuickAddPending(has), []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paymentFlash, setPaymentFlash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // What to do once the person agrees to drop their edits: close, or open Reschedule.
  const afterDiscard = useRef<() => void>(() => undefined);

  // ---- When: a quiet fix to the diary (not a reschedule) ------------------------------
  // Wall clock at the business (like RescheduleDialog). All-day jobs edit first/last
  // day; timed jobs edit date + start and keep their length.
  const correctTime = useCorrectBookingTime();
  const whenOriginal = whenFields(booking, timezone);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whenDate, setWhenDate] = useState(whenOriginal.date);
  const [whenTime, setWhenTime] = useState(whenOriginal.time);
  const [whenLastDay, setWhenLastDay] = useState(whenOriginal.lastDay);
  const resetWhen = (fields: { date: string; time: string; lastDay: string }) => {
    setWhenDate(fields.date);
    setWhenTime(fields.time);
    setWhenLastDay(fields.lastDay);
  };

  // ---- Lookups ------------------------------------------------------------------
  const serviceList = useMemo(() => services.data ?? [], [services.data]);
  const serviceById = useMemo(() => new Map(serviceList.map((s) => [s.id, s])), [serviceList]);
  const staffList = (staff.data ?? []).filter(
    (s) => s.status === "active" || s.id === booking.staffId,
  );
  const locationList = (locations.data ?? []).filter(
    (l) => l.active || l.id === booking.locationId,
  );
  const customerList = customers.data?.items ?? [];
  const originalCustomer = useCustomer(booking.leadCustomerId);
  const chosenCustomer = useCustomer(customerId);
  const selectedCustomer =
    customerList.find((c) => c.id === customerId) ?? chosenCustomer.data ?? null;
  const originalRecord = useLinkedRecord(booking.linkedRecordId ?? undefined);
  const customerRecords = useCustomerLinkedRecords(customerId);
  const activeRecords = (customerRecords.data ?? []).filter(
    (r) => r.status === "active" || r.id === booking.linkedRecordId,
  );
  const recordFields = useMemo<LinkedRecordField[]>(
    () =>
      activeSortedFields(
        (linkedRecordDefinition.data?.fields ?? []) as unknown as LinkedRecordField[],
      ),
    [linkedRecordDefinition.data],
  );
  const hasLinkedRecords = Boolean(linkedRecordDefinition.data?.definition);
  const recordTerm = tenant.terminology.linkedRecord;
  const recordTermLower = recordTerm.toLowerCase();
  const staffNoun = tenant.terminology.staff.trim() || "Staff";
  const staffLower = staffNoun.toLowerCase();
  const serviceNoun = words.service;

  const primary = picked[0];
  const service = primary ? serviceById.get(primary.serviceId) : undefined;
  const servicesChanged = !samePicked(picked, originalPicked);
  const pickedLabels = picked.map((p) => {
    const s = serviceById.get(p.serviceId);
    const v = p.variantId ? s?.variants.find((x) => x.id === p.variantId) : undefined;
    return s ? (v ? `${s.name} · ${v.name}` : s.name) : `Unknown ${serviceNoun}`;
  });
  const recordRequired =
    hasLinkedRecords &&
    (service?.requiresLinkedRecord === true ||
      booking.serviceSnapshot.requiresLinkedRecord === true ||
      linkedRecordDefinition.data?.definition.settings.requireForBooking === true);
  const isIndividual = booking.serviceSnapshot.bookingMode === "individual";

  const setPicked = (next: PickedService[]) => {
    if (next.length === 0) return; // a booking always has a service
    setPickedState(next);
    // A typed price belonged to the old services; a percentage discount still applies.
    setPriceInput(null);
  };

  // The two ways to price a job are exclusive: a whole-job total makes the API put every
  // line back to catalogue and record one adjustment, which would throw the row prices
  // away. So each route clears the other rather than silently losing to it.
  const setLinePrice = (serviceId: string, value: string | null) => {
    setPriceInput(null);
    setDiscount(null);
    setLinePrices((prev) => {
      const next = { ...prev };
      if (value === null) delete next[serviceId];
      else next[serviceId] = value;
      return next;
    });
  };
  const clearLinePrices = () => setLinePrices({});

  // ---- Money --------------------------------------------------------------------
  // The API re-prices from the catalogue when services change and otherwise keeps
  // the snapshot, so "list" means whichever of those applies.
  // Add-ons the main service pairs with carry their own price (upsells); the API
  // prices those lines the same way, so the estimate matches what gets saved.
  const pairings = useServiceUpsells(picked[0]?.serviceId);
  const pairingPrices = useMemo(
    () =>
      new Map(
        (pairings.data ?? [])
          .filter((u) => u.priceMinor !== null)
          .map((u) => [u.upsellServiceId, u.priceMinor as number]),
      ),
    [pairings.data],
  );
  const catalogueMinor = (p: PickedService, index: number) => {
    const s = serviceById.get(p.serviceId);
    if (!s) return 0;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    if (v?.priceMinor != null) return v.priceMinor;
    if (index > 0) {
      const paired = pairingPrices.get(p.serviceId);
      if (paired !== undefined) return paired;
    }
    return s.basePriceMinor;
  };
  const rolledTotalMinor = servicesChanged
    ? picked.reduce((sum, p, index) => sum + catalogueMinor(p, index), 0)
    : snapshotListMinor;
  // Row prices: each row is charged at what staff typed (when valid), else its list
  // price. Their sum is the total those edits imply — the job is simply what the
  // services cost, with no discount line, which is what "charging £150 for the wheel
  // coating" means rather than £200 less a £50 discount. The services keep their list
  // prices under a typed total or discount, and the API records the difference as a
  // discount line, so any total from zero up is valid.
  const price = jobPrice({
    rolledTotalMinor,
    priceInput,
    discount,
    rows: picked.map((p, index) => ({
      typed: linePrices[p.serviceId],
      listMinor: catalogueMinor(p, index),
    })),
  });
  const {
    discountMinor,
    discountInvalid,
    lineInvalid,
    overridePriceMinor,
    priceOverridden,
    priceInvalid,
    effectiveTotalMinor,
  } = price;
  const linePricesActive = price.linePricesTouched;
  const linePricesChanged = !linePricesMatch(
    linePrices,
    originalLinePrices,
    picked.map((p) => p.serviceId),
  );
  const priceBelowPaid = effectiveTotalMinor < paidMinor;
  const currency = booking.currency;
  const symbol = currencySymbol(currency);
  const money = (minor: number) => formatMoney(minor, currency);

  // What to send for the price, if anything. Omitted = keep (or catalogue when the
  // services change); null = back to list; a number = an override.
  // Row prices go to the API per line (`servicePriceMinor` for the main service,
  // `additionalServices[].priceMinor` for the rest): a number re-prices that line, `null`
  // puts it back to list. A typed total or a discount goes as the job's `priceMinor`
  // instead — never both, because a job total makes the API return every line to
  // catalogue and record the difference as one adjustment, which would wipe the rows.
  const linePriceFor = (p: PickedService, index: number): number | null | undefined => {
    const typed = linePriceMinor(linePrices[p.serviceId]);
    const list = catalogueMinor(p, index);
    if (typeof typed === "number") return typed === list ? undefined : typed;
    // A price the booking had, now cleared: ask for list, or the line would keep it.
    return originalLinePrices[p.serviceId] !== undefined ? null : undefined;
  };

  const priceBody: { priceMinor?: number | null } = (() => {
    if (credit || linePricesActive) return {};
    if (servicesChanged) {
      return effectiveTotalMinor !== rolledTotalMinor ? { priceMinor: effectiveTotalMinor } : {};
    }
    if (effectiveTotalMinor === booking.priceMinor) return {};
    if (effectiveTotalMinor === snapshotListMinor) return { priceMinor: null };
    return { priceMinor: effectiveTotalMinor };
  })();

  // ---- Deposit ------------------------------------------------------------------
  // Credit settles by entitlement, never money, and a deposit needs a total to sit
  // under. Otherwise it can be set after the fact: a deposit is often only discovered
  // once the job is already written up.
  const depositApplies = !credit && effectiveTotalMinor > 0;
  const { minor: nextDepositMinor, invalid: depositInvalid } = editDeposit({
    depositInput,
    totalMinor: effectiveTotalMinor,
    applies: depositApplies,
  });
  const depositBody: { depositMinor?: number | null } =
    !credit && nextDepositMinor !== (booking.depositMinor ?? null)
      ? { depositMinor: nextDepositMinor }
      : {};

  // ---- Duration hint -------------------------------------------------------------
  const serviceMinutes = (p: PickedService) => {
    const s = serviceById.get(p.serviceId);
    if (!s) return 0;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    return v?.durationMinutes ?? s.durationMinutes;
  };
  const newMinutes = picked.reduce((sum, p) => sum + serviceMinutes(p), 0);
  const durationChanges = servicesChanged && !customWindow && newMinutes !== currentMinutes;
  // Previews follow the working days of whoever will do the job, as the API will.
  const workingSchedule = scheduleFor(
    (staff.data ?? []).find((s) => s.id === staffId) ?? null,
    (locations.data ?? []).find((l) => l.id === locationId) ?? null,
    timezone,
  );
  const newEnd = durationChanges
    ? layoutWorkingDuration(booking.start, newMinutes, workingSchedule, timezone, { allDay: false })
        .end
    : null;

  // A custom window (all-day, or a hand-set length) survives a service change: the API
  // keeps the days as they are and fits the main service into whatever is left after the
  // others. Once those others fill the window on their own there is nothing left for the
  // main service and the save is refused outright. Work it out here, where the job can
  // still be given another day, rather than letting the server turn the save away.
  const windowDays = booking.allDay
    ? Math.max(
        1,
        Math.round((parseIso(whenLastDay).getTime() - parseIso(whenDate).getTime()) / DAY_MS) + 1,
      )
    : 0;
  const { fits, daysNeeded } = windowFit({
    windowMinutes: booking.allDay ? windowDays * MINUTES_PER_DAY : currentMinutes,
    windowDays,
    totalMinutes: newMinutes,
    additionalMinutes: picked.slice(1).reduce((sum, p) => sum + serviceMinutes(p), 0),
  });
  const windowTooShort = servicesChanged && customWindow && !fits;

  // ---- The diff, for the summary and the notify default -----------------------------
  const staffName = (id: string) =>
    (staff.data ?? []).find((s) => s.id === id)?.displayName ?? "Unassigned";
  const locationName = (id: string) =>
    (locations.data ?? []).find((l) => l.id === id)?.name ?? "Unknown location";
  const recordLabel = (id: string | null) =>
    id
      ? (activeRecords.find((r) => r.id === id)?.displayLabel ??
        (id === booking.linkedRecordId ? originalRecord.data?.displayLabel : undefined) ??
        recordTerm)
      : `No ${recordTermLower}`;
  const nextRecordId = linkedRecordId !== "none" ? linkedRecordId : null;

  // The corrected window, as the API will see it. For an all-day job the last day is
  // sent as midday on that day (the API snaps it to the following local midnight).
  const whenChanged = booking.allDay
    ? whenDate !== whenOriginal.date || whenLastDay !== whenOriginal.lastDay
    : whenDate !== whenOriginal.date || whenTime !== whenOriginal.time;
  const whenStartIso = booking.allDay
    ? zonedDateTimeToIso(whenDate, "00:00", timezone)
    : zonedDateTimeToIso(whenDate, whenTime, timezone);
  const whenLastDayIso = booking.allDay ? zonedDateTimeToIso(whenLastDay, "12:00", timezone) : null;
  const whenEndIso = (() => {
    if (!whenStartIso) return null;
    if (!booking.allDay) {
      return layoutWorkingDuration(whenStartIso, currentMinutes, workingSchedule, timezone, {
        allDay: false,
      }).end;
    }
    const lastMidnight = zonedDateTimeToIso(whenLastDay, "00:00", timezone);
    if (!lastMidnight) return null;
    const end = new Date(lastMidnight).getTime() + DAY_MS;
    return end > new Date(whenStartIso).getTime() ? new Date(end).toISOString() : null;
  })();
  const whenInvalid = whenChanged && (!whenStartIso || !whenEndIso);

  const changes: Change[] = [];
  if (whenChanged) {
    changes.push({
      label: "When",
      from: whenText(booking, timezone),
      to:
        whenStartIso && whenEndIso
          ? whenText({ start: whenStartIso, end: whenEndIso, allDay: booking.allDay }, timezone)
          : "not set",
      // A correction is deliberately quiet: only Reschedule tells the client.
      clientVisible: false,
    });
  }
  if (servicesChanged) {
    const several = pickedLabels.length > 1 || originalLabels.length > 1;
    changes.push({
      label: several ? words.Services : words.Service,
      from: originalLabels.join(" + "),
      to: pickedLabels.join(" + "),
      clientVisible: true,
      word: several ? words.services : words.service,
    });
  }
  if (!credit && effectiveTotalMinor !== booking.priceMinor) {
    changes.push({
      label: "Price",
      from: money(booking.priceMinor),
      to: money(effectiveTotalMinor),
      clientVisible: true,
    });
  }
  // A row price can move without moving the total (£50 more on one service, £50 less on
  // another), so name the rows that moved. Otherwise the form would look unchanged and
  // refuse to save an edit that is real.
  if (!credit) {
    const rows = picked.map((p, index) => ({
      serviceId: p.serviceId,
      wasMinor: booking.lineItems?.find((li) => li.serviceId === p.serviceId)?.priceMinor,
      listMinor: catalogueMinor(p, index),
    }));
    for (const line of repricedLines(rows, linePrices, originalLinePrices)) {
      changes.push({
        label: serviceById.get(line.serviceId)?.name ?? `${words.Service} price`,
        from: money(line.fromMinor),
        to: money(line.toMinor),
        clientVisible: true,
        word: "price",
      });
    }
  }
  if (!credit && nextDepositMinor !== (booking.depositMinor ?? null)) {
    changes.push({
      label: "Deposit",
      from: booking.depositMinor != null ? money(booking.depositMinor) : "none",
      to: nextDepositMinor != null ? money(nextDepositMinor) : "none",
      clientVisible: true,
    });
  }
  if (durationChanges && newEnd) {
    changes.push({
      label: "Finishes",
      from: formatInTz(booking.end, timezone, { hour: "2-digit", minute: "2-digit" }),
      to: formatInTz(newEnd, timezone, { hour: "2-digit", minute: "2-digit" }),
      clientVisible: true,
      word: "finish time",
    });
  }
  if (staffId !== booking.staffId) {
    changes.push({
      label: staffNoun,
      from: staffName(booking.staffId),
      to: staffName(staffId),
      clientVisible: true,
    });
  }
  if (locationId !== booking.locationId) {
    changes.push({
      label: "Location",
      from: locationName(booking.locationId),
      to: locationName(locationId),
      clientVisible: true,
    });
  }
  if (customerId !== booking.leadCustomerId) {
    changes.push({
      label: "Client",
      from: originalCustomer.data ? customerDisplayName(originalCustomer.data) : "Unknown client",
      to: selectedCustomer ? customerDisplayName(selectedCustomer) : "Unknown client",
      clientVisible: true,
    });
  }
  if (nextRecordId !== (booking.linkedRecordId ?? null) || quickAddPending) {
    changes.push({
      label: recordTerm,
      from: recordLabel(booking.linkedRecordId ?? null),
      to: quickAddPending ? `New ${recordTermLower}` : recordLabel(nextRecordId),
      clientVisible: true,
    });
  }
  if (paymentMethod !== booking.paymentMethod) {
    changes.push({
      label: "Payment",
      from: paymentMethodLabel(booking.paymentMethod),
      to: paymentMethodLabel(paymentMethod),
      clientVisible: false,
    });
  }
  const notesChanged = notes.trim() !== (booking.notesInternal ?? "").trim();
  if (notesChanged) {
    changes.push({
      label: "Internal notes",
      from: booking.notesInternal ? "updated" : "none",
      to: notes.trim() ? "updated" : "cleared",
      clientVisible: false,
    });
  }
  // The client's confirmation carries the lift line, so a change is worth telling them.
  const nextLift = isCarDetailing ? clientLiftFromDraft(lift) : (booking.clientLift ?? null);
  const liftChanged = !sameClientLift(nextLift, booking.clientLift ?? null);
  if (liftChanged) {
    changes.push({
      label: "Lift",
      from: describeClientLift(booking.clientLift) ?? "none",
      to: describeClientLift(nextLift) ?? "none",
      clientVisible: true,
    });
  }
  const dirty = changes.length > 0;
  // Everything but the date fix goes through PATCH; the fix is its own request.
  const amendDirty = changes.some((c) => c.label !== "When");
  const clientVisible = changes.some((c) => c.clientVisible);
  const visibleChanges = [
    ...new Set(changes.filter((c) => c.clientVisible).map((c) => c.word ?? c.label.toLowerCase())),
  ];

  // ---- Who can be told, and how --------------------------------------------------
  // A client still loading can't be reached yet: nothing is ticked or sent for them.
  const blocks: ContactBlocks = selectedCustomer
    ? contactBlocks(selectedCustomer, smsCredits.level === "empty")
    : { email: "client not loaded", sms: "client not loaded" };
  const clientName = selectedCustomer ? customerDisplayName(selectedCustomer) : null;
  const firstName = selectedCustomer
    ? selectedCustomer.firstName?.trim() || customerDisplayName(selectedCustomer)
    : null;
  const ticks: ChannelTicks =
    notifyChoice ?? editDefaultTicks({ pref: notifyPref, blocks, clientVisible });
  // A date fix on its own has nothing to send: Reschedule is how the client hears of a
  // new time.
  const notifyChannels: NotifyChannel[] = amendDirty ? reachableChannels(ticks, blocks) : [];
  const setChannel = (channel: NotifyChannel, on: boolean) =>
    setNotifyChoice({ ...ticks, [channel]: on });
  const notifyHint = editNotifyHint({
    name: clientName ?? "the client",
    amendDirty,
    onlyDateFix: !amendDirty && whenChanged,
    channels: notifyChannels,
    blocks,
    followingDefault: notifyChoice === null,
    visibleChanges,
    leavesBankPending,
    nextMessage: paymentMethod === "none" ? "payment request" : "confirmation",
  });

  // ---- Blockers -----------------------------------------------------------------
  const recordMissing = recordRequired && nextRecordId === null && !quickAddPending;
  const blockers: string[] = [];
  if (!primary) blockers.push(`Choose a ${serviceNoun}`);
  if (recordMissing) blockers.push(`Choose a ${recordTermLower}`);
  if (priceInvalid) blockers.push("Check the price");
  if (depositInvalid) blockers.push("Check the deposit");
  if (whenInvalid)
    blockers.push(booking.allDay ? "The last day can't be before the first" : "Check the date");
  if (windowTooShort)
    blockers.push(
      booking.allDay
        ? `The job needs ${daysNeeded} days to fit`
        : "The job is longer than the time booked",
    );
  if (priceBelowPaid)
    blockers.push(`The price can't be below the ${money(paidMinor)} already paid. Refund first.`);
  if (!dirty) blockers.push("Nothing has changed");
  const blocked = blockers.length > 0;

  const sectionState = (needsLook: boolean): SectionState => (needsLook ? "attention" : "idle");

  // ---- More options: what is folded away, and when it must show itself ----------------
  const moreLabels = new Set([
    "Client",
    recordTerm,
    "Lift",
    "Location",
    staffNoun,
    "Internal notes",
  ]);
  const moreChanges = changes.filter((c) => moreLabels.has(c.label)).length;
  // A decision the save depends on can't sit behind a closed toggle: a required
  // vehicle still to pick.
  const moreNeedsAttention = recordMissing;
  const moreVisible = moreOpen || moreNeedsAttention;
  const moreSummary = [
    clientLocked ? null : "client",
    hasLinkedRecords ? recordTermLower : null,
    isCarDetailing ? "lift" : null,
    soleLocation ? null : "location",
    soleStaff ? null : staffLower,
    "notes",
  ]
    .filter((x): x is string => x !== null)
    .map((x, i) => (i === 0 ? sentence(x) : x))
    .join(", ");

  const catalogueLoading = services.isLoading || staff.isLoading || locations.isLoading;

  // "Change how it's paid" lands on Payment and lights it up for a moment.
  const paymentFocused = useRef(false);
  useEffect(() => {
    if (!focusPayment || catalogueLoading || paymentFocused.current) return;
    paymentFocused.current = true;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(SECTION_IDS.payment)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPaymentFlash(true);
    });
    const timer = window.setTimeout(() => setPaymentFlash(false), PAYMENT_FLASH_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusPayment, catalogueLoading]);

  // Esc, the backdrop, Cancel and the Reschedule hand-off all land here: edits in
  // progress ask first, an untouched form goes straight through.
  const guard = (then: () => void) => {
    if (dirty && !submitting) {
      afterDiscard.current = then;
      setConfirmDiscard(true);
      return;
    }
    then();
  };
  const requestClose = () => guard(onClose);

  const submit = async () => {
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
    if (blockers.length === 1) {
      toast.error(blockers[0]!);
      return;
    }
    if (!primary) return;

    setSubmitting(true);
    let recordId: string | null = nextRecordId;
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

    const primaryLinePrice = linePriceFor(primary, 0);
    const body: AmendBookingBody = {
      // Row prices travel with the services, so the block also goes when only a price
      // moved: the API needs the lines named to know which one to re-price.
      ...(servicesChanged || linePricesChanged
        ? {
            serviceId: primary.serviceId,
            variantId: primary.variantId ?? null,
            ...(primaryLinePrice !== undefined ? { servicePriceMinor: primaryLinePrice } : {}),
            additionalServices: picked.slice(1).map((p, i) => {
              const linePrice = linePriceFor(p, i + 1);
              return {
                serviceId: p.serviceId,
                ...(p.variantId ? { variantId: p.variantId } : {}),
                ...(linePrice !== undefined ? { priceMinor: linePrice } : {}),
              };
            }),
          }
        : {}),
      ...(staffId !== booking.staffId ? { staffId } : {}),
      ...(locationId !== booking.locationId ? { locationId } : {}),
      ...(customerId !== booking.leadCustomerId ? { leadCustomerId: customerId } : {}),
      ...(recordId !== (booking.linkedRecordId ?? null) ? { linkedRecordId: recordId } : {}),
      ...priceBody,
      ...depositBody,
      ...(paymentMethod !== booking.paymentMethod && paymentMethod !== "credit"
        ? { paymentMethod: paymentMethod as EditablePaymentMethod }
        : {}),
      ...(notesChanged ? { notesInternal: notes.trim() || null } : {}),
      ...(liftChanged ? { clientLift: nextLift } : {}),
      ...(notifyChannels.length > 0 ? { notify: { channels: notifyChannels } } : {}),
    };

    // The date fix goes first: it is the request most likely to be refused (a clash),
    // and if the client is being sent the new details the message then carries the
    // corrected time. The PATCH follows with the version the fix handed back.
    let version = booking.version;
    if (whenChanged && whenStartIso) {
      try {
        const fixed = await correctTime.mutateAsync({
          bookingId: booking.id,
          body: {
            start: whenStartIso,
            ...(booking.allDay && whenLastDayIso ? { end: whenLastDayIso } : {}),
          },
        });
        version = fixed.version;
        // The fix is saved; don't send it again if the PATCH below fails.
        resetWhen(whenFields(fixed, timezone));
        setWhenOpen(false);
        if (!amendDirty) toast.success("Date corrected. The client wasn't told.");
      } catch {
        // useCorrectBookingTime toasts the failure; the form keeps the edits.
        setSubmitting(false);
        return;
      }
    }
    if (!amendDirty) {
      setSubmitting(false);
      onClose();
      return;
    }

    try {
      await amend.mutateAsync({ bookingId: booking.id, ifMatch: version, body });
      onClose();
    } catch {
      // useAmendBooking toasts every failure; a stale version also refetches the
      // booking, so the next Save carries the fresh version with these edits intact.
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Copy that depends on the state above ------------------------------------------
  const mode = priceMode(price);
  const priceHelp: { text: string; chip: boolean; tone: "muted" | "destructive" } | null = (() => {
    if (priceInvalid) {
      return {
        text: lineInvalid
          ? `Check the price beside each ${serviceNoun} above.`
          : priceError(price, discount, money(rolledTotalMinor), words),
        chip: false,
        tone: "destructive",
      };
    }
    if (priceBelowPaid) {
      return {
        text: `${money(paidMinor)} has already been paid. Refund the difference first, then lower the price.`,
        chip: false,
        tone: "destructive",
      };
    }
    if (paidMinor > 0) {
      return {
        text: `${money(paidMinor)} paid so far. ${money(Math.max(0, effectiveTotalMinor - paidMinor))} would be outstanding.`,
        chip: true,
        tone: "muted",
      };
    }
    if (pricedPerService && !servicesChanged && effectiveTotalMinor === booking.priceMinor) {
      return {
        text: `List ${money(rolledTotalMinor)}. A different total here puts the ${words.services} back to list and records the difference as a discount or price adjustment line.`,
        chip: true,
        tone: "muted",
      };
    }
    if (linePricesActive) {
      // Row prices and a job total are exclusive, so don't describe this one as a
      // discount off the list price: it is what the services cost here.
      return {
        text: `Each ${serviceNoun} is charged at its row price (list ${money(rolledTotalMinor)}), with no discount line. Typing a total here instead puts every ${serviceNoun} back to list.`,
        chip: true,
        tone: "muted",
      };
    }
    if (discountMinor !== null && overridePriceMinor !== null) {
      return {
        text: `${discountLabel(discount!, money)} · −${money(discountMinor)}, taking it to ${money(overridePriceMinor)}. The ${words.services} stay at list and the discount shows as its own line.`,
        chip: true,
        tone: "muted",
      };
    }
    if (effectiveTotalMinor !== rolledTotalMinor) {
      return {
        text: `Adjusted from the ${money(rolledTotalMinor)} list price. The ${words.services} stay at list and the ${formatAdjustment(
          effectiveTotalMinor - rolledTotalMinor,
          money,
        )} shows as a ${adjustmentLabel(effectiveTotalMinor - rolledTotalMinor).toLowerCase()} line.`,
        chip: true,
        tone: "muted",
      };
    }
    return { text: "", chip: true, tone: "muted" };
  })();

  const bankTransferOffered =
    tenant.configuration?.bankTransfer?.enabled === true ||
    booking.paymentMethod === "bank_transfer";
  const depositNote =
    booking.depositMinor != null && booking.depositMinor < effectiveTotalMinor
      ? booking.depositMinor
      : null;
  const paymentOptions: ChoiceOption<EditablePaymentMethod>[] = [
    {
      value: "none",
      label: PAYMENT_METHOD_NAMES.none,
      line: "The next message is a payment request.",
    },
    {
      value: "pay_later",
      label: PAYMENT_METHOD_NAMES.pay_later,
      line: "Take payment when it's done.",
    },
    ...(bankTransferOffered
      ? [
          {
            value: "bank_transfer" as const,
            label: PAYMENT_METHOD_NAMES.bank_transfer,
            line:
              effectiveTotalMinor <= 0
                ? `Not for ${symbol}0 bookings`
                : "Paid to your account using the booking reference.",
            disabled: effectiveTotalMinor <= 0,
          },
        ]
      : []),
  ];
  const paymentNote = (() => {
    if (leavesBankPending) {
      const then =
        paymentMethod === "pay_later"
          ? depositNote !== null
            ? `The ${money(depositNote)} deposit is requested; the balance is taken when the job is done.`
            : "Take payment when the job is done."
          : "The client is sent a payment request for the balance.";
      return `The booking is confirmed straight away, with no bank transfer needed to secure it. ${then} Tick Email or Text message under Tell the client so they know not to transfer anything.`;
    }
    if (paymentEditable && paymentMethod !== booking.paymentMethod) {
      return paymentMethod === "pay_later"
        ? depositNote !== null
          ? `The ${money(depositNote)} deposit still secures the date; the balance is taken when the job is done.`
          : "No payment is asked for up front; take it when the job is done."
        : paymentMethod === "none"
          ? "The next message to the client is a payment request for the balance."
          : "The client is asked to pay by bank transfer using your account details.";
    }
    if (paymentEditable && paymentMethod === "pay_later") {
      return depositNote !== null
        ? `${money(depositNote)} deposit up front, the balance when the job is done.`
        : "Nothing up front; take payment when the job is done.";
    }
    return null;
  })();

  const footer = editFooterSummary({
    changes: changes.length,
    amendDirty,
    notifying: notifyChannels.length > 0,
    name: firstName ?? "The client",
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what="these changes"
        onDiscard={() => {
          setConfirmDiscard(false);
          afterDiscard.current();
        }}
      />
      {/* The header and footer stay put; only the body between them scrolls. */}
      <DialogContent className="overflow-hidden sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={booking.status} />
            {booking.reference ? (
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {booking.reference}
              </span>
            ) : null}
          </div>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Change what the booking is. To move it and tell the client, use Reschedule.
          </DialogDescription>
        </DialogHeader>

        {catalogueLoading ? (
          <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : (
          // Same guard as Add booking: nothing may grow the sheet sideways on a phone.
          <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <div className="grid min-w-0 grid-cols-1 gap-7 pb-2 **:min-w-0">
              {/* When — two doors: "Fix date" quietly corrects a typo in the diary (no
                  message, "Date corrected" in the history); Reschedule moves the job and
                  tells the client. */}
              <Box className="grid gap-2">
                <div
                  id={SECTION_IDS.when}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
                >
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      When
                    </p>
                    <p className="text-sm font-semibold">{whenText(booking, timezone)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant={whenOpen ? "secondary" : "ghost"}
                      size="sm"
                      aria-expanded={whenOpen}
                      aria-controls="edit-booking-when"
                      onClick={() => {
                        if (whenOpen) resetWhen(whenOriginal);
                        setWhenOpen((o) => !o);
                      }}
                    >
                      <Pencil className="size-4" /> {whenOpen ? "Undo" : "Fix date"}
                    </Button>
                    {completed ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => guard(onReschedule)}
                      >
                        <CalendarClock className="size-4" /> Reschedule
                      </Button>
                    )}
                  </div>
                </div>
                {whenOpen ? (
                  <div id="edit-booking-when" className="grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      Today is {todayLabelInTz(timezone)}
                    </p>
                    {booking.allDay ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1">
                          <Label htmlFor="edit-when-first" className="text-xs">
                            First day
                          </Label>
                          <input
                            id="edit-when-first"
                            type="date"
                            value={whenDate}
                            onChange={(e) => {
                              setWhenDate(e.target.value);
                              // Keep the span whole when the first day passes the last.
                              if (e.target.value > whenLastDay) setWhenLastDay(e.target.value);
                            }}
                            className={cn(
                              FIELD,
                              "flex w-full border border-input px-3 py-1 text-sm outline-none focus:border-ring",
                            )}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="edit-when-last" className="text-xs">
                            Last day
                          </Label>
                          <input
                            id="edit-when-last"
                            type="date"
                            min={whenDate}
                            value={whenLastDay}
                            onChange={(e) => setWhenLastDay(e.target.value)}
                            aria-invalid={whenInvalid}
                            className={cn(
                              FIELD,
                              "flex w-full border border-input px-3 py-1 text-sm outline-none focus:border-ring aria-invalid:border-destructive",
                            )}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          id="edit-when-date"
                          type="date"
                          aria-label="Date"
                          value={whenDate}
                          onChange={(e) => setWhenDate(e.target.value)}
                          className={cn(
                            FIELD,
                            "flex w-full border border-input px-3 py-1 text-sm outline-none focus:border-ring",
                          )}
                        />
                        <input
                          type="time"
                          aria-label="Start time"
                          value={whenTime}
                          onChange={(e) => setWhenTime(e.target.value)}
                          className={cn(
                            FIELD,
                            "flex w-28 shrink-0 border border-input px-3 py-1 text-sm outline-none focus:border-ring",
                          )}
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {booking.allDay
                        ? "Stays an all-day job. "
                        : `Keeps its ${formatDurationLong(currentMinutes)} from the new start. `}
                      Nothing is sent to the client; this just corrects the diary.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {completed
                      ? "The job is done, so a date fix only corrects the record."
                      : "Reschedule tells the client. Fix date only corrects the diary."}
                  </p>
                )}
              </Box>

              <FormSection
                id={SECTION_IDS.services}
                number={1}
                title={words.Services}
                state={sectionState(windowTooShort)}
              >
                {credit ? (
                  <LockedRow
                    title={originalLabels.join(" + ")}
                    reason={`Paid with a package credit. To use a different ${serviceNoun}, cancel this booking (the credit comes back) and rebook.`}
                  />
                ) : (
                  <>
                    <ServiceMultiPicker
                      services={serviceList}
                      value={picked}
                      onChange={setPicked}
                      pairingPrices={pairingPrices}
                      // What each service is charged on this job. A job is often priced
                      // per service rather than discounted as a whole — "£150 for the
                      // wheel coating", not £200 with £50 off.
                      linePrices={linePrices}
                      onLinePriceChange={setLinePrice}
                      multi={isIndividual}
                      singleReason={
                        isIndividual ? undefined : `A group session covers one ${serviceNoun}.`
                      }
                    />
                    {windowTooShort ? (
                      // The job no longer fits the days it has, which the server refuses
                      // rather than quietly moving the end of the booking. Say so in terms
                      // of days, and offer the fix instead of leaving them to find it.
                      <Strip
                        tone="red"
                        action={
                          booking.allDay ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setWhenOpen(true);
                                setWhenLastDay(
                                  isoDate(addDays(parseIso(whenDate), Math.max(0, daysNeeded - 1))),
                                );
                              }}
                            >
                              Give it {daysNeeded} days
                            </Button>
                          ) : undefined
                        }
                      >
                        {formatDurationLong(newMinutes)} of work won't fit{" "}
                        {booking.allDay
                          ? windowDays === 1
                            ? "one day"
                            : `${windowDays} days`
                          : `the ${formatDurationLong(currentMinutes)} booked`}
                        . {booking.allDay ? `It needs ${daysNeeded} days.` : "Reschedule it first."}
                      </Strip>
                    ) : servicesChanged ? (
                      <p className="text-xs text-muted-foreground">
                        {customWindow
                          ? `Keeps its ${booking.allDay ? "all-day" : formatDurationLong(currentMinutes)} window.`
                          : durationChanges && newEnd
                            ? `Now ${formatDurationLong(newMinutes)}, so it finishes at ${formatInTz(newEnd, timezone, { hour: "2-digit", minute: "2-digit" })}${newMinutes > currentMinutes ? ". The extra time must be free in the diary" : ""}.`
                            : `Still ${formatDurationLong(currentMinutes)}.`}
                      </p>
                    ) : null}
                  </>
                )}
              </FormSection>

              <FormSection
                id={SECTION_IDS.price}
                number={2}
                title="Price"
                state={sectionState(!credit && (priceInvalid || priceBelowPaid))}
                aside={
                  !credit && priceOverridden ? (
                    <LinkButton
                      onClick={() => {
                        setPriceInput(null);
                        setDiscount(null);
                        clearLinePrices();
                      }}
                    >
                      List {money(rolledTotalMinor)} · reset
                    </LinkButton>
                  ) : null
                }
              >
                {credit ? (
                  <WaitingLine>
                    Settled by a package credit. No money is taken, so price and deposit are hidden.
                  </WaitingLine>
                ) : (
                  <div className="grid gap-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-booking-price">Total</Label>
                        <MoneyInput
                          id="edit-booking-price"
                          symbol={symbol}
                          value={
                            priceInput !== null
                              ? priceInput
                              : moneyInputValue(overridePriceMinor ?? rolledTotalMinor)
                          }
                          onValueChange={(v) => {
                            setPriceInput(v);
                            setDiscount(null);
                            clearLinePrices();
                          }}
                          aria-invalid={
                            (priceInvalid && !discountInvalid && !lineInvalid) || priceBelowPaid
                          }
                          aria-describedby="edit-booking-price-help"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-booking-discount">Discount</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id="edit-booking-discount"
                            inputMode="decimal"
                            placeholder="0"
                            className={cn(FIELD, "w-16 aria-invalid:border-destructive")}
                            value={discount?.value ?? ""}
                            onChange={(e) => {
                              setPriceInput(null);
                              clearLinePrices();
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
                    <div id="edit-booking-price-help" className="flex items-start gap-2">
                      {priceHelp && priceHelp.chip ? (
                        <ModeChip>{priceModeLabel(mode, words)}</ModeChip>
                      ) : null}
                      {priceHelp?.text ? (
                        <p
                          className={cn(
                            "text-xs",
                            priceHelp.tone === "destructive"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {priceHelp.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection
                id={SECTION_IDS.payment}
                number={3}
                title="Payment"
                state={sectionState(depositInvalid)}
                className={cn(
                  "rounded-[14px] transition-shadow duration-500",
                  paymentFlash && "ring-2 ring-primary/50 ring-offset-4 ring-offset-background",
                )}
              >
                {paymentEditable ? (
                  <ChoiceCards
                    label="Payment method"
                    value={paymentMethod as EditablePaymentMethod}
                    options={paymentOptions}
                    onChange={setPaymentMethod}
                  />
                ) : (
                  <LockedRow
                    title={PAYMENT_METHOD_NAMES[booking.paymentMethod]}
                    reason={
                      credit
                        ? "Package credit can't be swapped for another way of paying."
                        : "Can be changed once the booking is confirmed."
                    }
                  />
                )}
                {paymentNote ? (
                  <p className="text-xs text-muted-foreground">{paymentNote}</p>
                ) : null}

                {depositApplies ? (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="edit-booking-deposit">Deposit to secure it</Label>
                      {depositInput.trim() !== "" ? (
                        <LinkButton onClick={() => setDepositInput("")}>No deposit</LinkButton>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <MoneyInput
                        id="edit-booking-deposit"
                        className="w-[140px]"
                        symbol={symbol}
                        placeholder="0.00"
                        value={depositInput}
                        onValueChange={setDepositInput}
                        aria-invalid={depositInvalid}
                        aria-describedby="edit-booking-deposit-help"
                      />
                      <p
                        id="edit-booking-deposit-help"
                        className={cn(
                          "min-w-0 flex-1 basis-40 text-xs",
                          depositInvalid ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {depositInvalid
                          ? `Enter an amount under ${money(effectiveTotalMinor)}, or clear it for no deposit.`
                          : nextDepositMinor === null
                            ? `No deposit. The full ${money(effectiveTotalMinor)} is due${paymentMethod === "pay_later" ? " after the job" : ""}.`
                            : paidMinor >= nextDepositMinor
                              ? `Already covered by the ${money(paidMinor)} received. ${money(Math.max(0, effectiveTotalMinor - paidMinor))} left to collect.`
                              : `${money(nextDepositMinor)} due up front, ${money(effectiveTotalMinor - nextDepositMinor)} balance later. Already paid it? Save, then use “Deposit taken” on the booking to record the money.`}
                      </p>
                    </div>
                  </div>
                ) : null}
              </FormSection>

              {/* Everything staff rarely touch at the counter lives behind one toggle. It
                  stays mounted while closed so a typed value survives collapsing it, and
                  it opens itself when something inside needs a decision before saving. */}
              <section id={SECTION_IDS.more} className="rounded-[14px] border">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left text-sm"
                  aria-expanded={moreVisible}
                  aria-controls="edit-booking-more"
                  onClick={() => setMoreOpen((o) => !o)}
                >
                  <span className="min-w-0">
                    <span className="font-semibold">More options</span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-xs",
                        moreNeedsAttention ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {moreNeedsAttention
                        ? "Something in here needs a look before saving."
                        : moreChanges > 0 && !moreVisible
                          ? `${moreChanges} ${moreChanges === 1 ? "change" : "changes"} · ${moreSummary}`
                          : moreSummary}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      moreVisible && "rotate-180",
                    )}
                  />
                </button>
                <div
                  id="edit-booking-more"
                  hidden={!moreVisible}
                  className="grid min-w-0 grid-cols-1 gap-4 border-t px-3 pt-3 pb-3 **:min-w-0"
                >
                  <div className="grid gap-2">
                    <Label>Client</Label>
                    {clientLocked ? (
                      <LockedRow
                        title={
                          originalCustomer.data
                            ? customerDisplayName(originalCustomer.data)
                            : "Unknown client"
                        }
                        reason={
                          credit
                            ? "Paid with a package credit, so the booking stays with this client."
                            : `${money(paidMinor)} has been paid, so the booking stays with this client. Refund it first, or cancel and rebook.`
                        }
                      />
                    ) : (
                      <CustomerSearchPicker
                        value={selectedCustomer}
                        suggestions={customerList}
                        placeholder="Choose or search for a client"
                        onSelect={(c) => {
                          setCustomerId(c.id);
                          // A record belongs to one client, so it can't survive a client change.
                          if (c.id !== booking.leadCustomerId) setLinkedRecordId("none");
                          else setLinkedRecordId(booking.linkedRecordId ?? "none");
                          setQuickAddOpen(false);
                        }}
                      />
                    )}
                  </div>

                  {hasLinkedRecords ? (
                    <div className="grid gap-2">
                      <Label>
                        {recordTerm}
                        {recordRequired ? <span className="text-destructive"> *</span> : null}
                      </Label>
                      {quickAddOpen || (customerRecords.isSuccess && activeRecords.length === 0) ? (
                        <QuickAddLinkedRecord
                          key={customerId}
                          customerId={customerId}
                          fields={recordFields}
                          term={recordTerm}
                          handleRef={quickAdd}
                          onInputChange={onQuickAddInput}
                          inputHint="Saved with the booking."
                          autoFocus={quickAddOpen}
                          onCancel={
                            activeRecords.length > 0
                              ? () => {
                                  setQuickAddOpen(false);
                                  setQuickAddPending(false);
                                }
                              : undefined
                          }
                          onAdded={(record) => {
                            setLinkedRecordId(record.id);
                            setQuickAddOpen(false);
                            setQuickAddPending(false);
                            toast.success(`${recordTerm} added`, {
                              description: `${record.displayLabel} is on this booking.`,
                            });
                          }}
                        />
                      ) : (
                        <div className="flex gap-2">
                          <Select value={linkedRecordId} onValueChange={setLinkedRecordId}>
                            <SelectTrigger className="flex-1">
                              <SelectValue
                                placeholder={
                                  recordRequired ? `Choose a ${recordTermLower}` : "None"
                                }
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
                            className="shrink-0"
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

                  {isCarDetailing ? (
                    <ClientLiftFields
                      value={lift}
                      onChange={setLift}
                      idPrefix="edit-booking"
                      clientFirstName={firstName ?? undefined}
                    />
                  ) : null}

                  {soleLocation && soleStaff ? null : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {soleLocation ? null : (
                        <div className="grid gap-2">
                          <Label>Location</Label>
                          <Select value={locationId} onValueChange={setLocationId}>
                            <SelectTrigger>
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
                          {isIndividual ? (
                            <Select value={staffId} onValueChange={setStaffId}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {staffList.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.displayName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <LockedRow
                              title={staffName(staffId)}
                              reason={`A group ${serviceNoun} keeps its ${staffLower}. Cancel and rebook to change it.`}
                            />
                          )}
                          {staffId !== booking.staffId ? (
                            <p className="text-xs text-muted-foreground">
                              {staffName(staffId)} must be free for the whole job and able to do{" "}
                              {picked.length > 1
                                ? `every ${serviceNoun} on it`
                                : `this ${serviceNoun}`}
                              .
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="edit-booking-notes">Internal notes</Label>
                    <Textarea
                      id="edit-booking-notes"
                      placeholder="Visible to staff only"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <FormSection
                id={SECTION_IDS.notify}
                number={4}
                title="Tell the client"
                state={sectionState(notifyHint.tone === "destructive")}
              >
                <ChannelBoxes
                  title={`Send ${firstName ?? "the client"} the updated details`}
                  ariaPrefix="Send the updated details"
                  ticks={ticks}
                  blocks={blocks}
                  onChange={setChannel}
                  disabled={!amendDirty}
                  hint={sentence(notifyHint.text)}
                  hintTone={notifyHint.tone}
                  attention={notifyHint.tone === "destructive"}
                />
              </FormSection>

              {dirty ? (
                <Box>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Changes
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {changes.map((c) => (
                      <li key={c.label} className="flex flex-wrap gap-x-1.5">
                        <span className="text-muted-foreground">{c.label}:</span>
                        <span className="line-through decoration-muted-foreground/60">
                          {c.from}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="sr-only">changes to</span>
                        <span className="font-medium">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                </Box>
              ) : null}
            </div>
          </div>
        )}

        <ul id="edit-booking-missing" className="sr-only">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <DialogFooter className="items-stretch gap-3 max-sm:flex-col sm:items-center sm:gap-2">
          <FooterSummary main={footer.main} sub={footer.sub} />
          <Button variant="ghost" onClick={requestClose} className="max-sm:hidden">
            Cancel
          </Button>
          <Button
            onClick={submit}
            // Looks disabled while something is missing but stays clickable, so
            // the click can explain what's left rather than doing nothing.
            disabled={submitting || catalogueLoading}
            aria-disabled={submitting || blocked}
            aria-describedby={blocked ? "edit-booking-missing" : undefined}
            className={cn(blocked && !submitting && "opacity-50")}
            title={blocked ? blockers.join(" · ") : undefined}
          >
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
