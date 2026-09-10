import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CustomerSearchPicker,
  type LinkedRecordField,
  QuickAddLinkedRecord,
  activeSortedFields,
} from "@/components/LinkedRecordDialogs";
import { Layers, MapPin, Plus, UserRound } from "lucide-react";
import { ServiceMultiPicker, type PickedService } from "@/components/ServiceMultiPicker";
import { SetupGate } from "@/components/SetupGate";
import { AddClientDialog } from "@/components/QuickActions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BankTransferPanel } from "@/components/BankTransferPanel";
import type { BankTransferInstructions } from "@/lib/api/types";
import {
  useAvailability,
  useConnectAccount,
  useCreateBooking,
  useCustomerLinkedRecords,
  useCustomer,
  useCustomers,
  useLinkedRecordDefinition,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { emptySlotsMessage } from "@/lib/availability-windows";
import { configuredDepositMinor } from "@/lib/booking-payment";
import {
  addDays,
  formatDuration,
  formatDurationLong,
  formatInTz,
  formatMoney,
  isoDate,
  localDateTimeToIso,
  parseIso,
  parseMoneyToMinor,
  spansDays,
} from "@/lib/format";
import { outsideWorkingHours } from "@/lib/working-hours";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { discountLabel, discountOffMinor, type Discount } from "@/lib/discount";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Remembered choice of confirmation channels; "on"/"off" are the pre-tick-box values. */
const NOTIFY_PREFS = ["email", "sms", "both", "none", "on", "off"] as const;
type NotifyPref = (typeof NOTIFY_PREFS)[number];

/**
 * How the money is handled. `none` = request payment up front (the confirmation is a
 * payment request); `pay_later` = pay after the job (plain confirmation, staff send a
 * payment reminder or take it in person later); `credit` / `bank_transfer` as named.
 */
type PaymentMethod = "none" | "credit" | "bank_transfer" | "pay_later";
/** The two "no money yet" choices; the last one used is remembered per business. */
const TIMING_DEFAULTS = ["none", "pay_later"] as const;
type PaymentTiming = (typeof TIMING_DEFAULTS)[number];

const DATE_INPUT =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm outline-none focus:border-ring";

export function AddBookingModal({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultDate,
  defaultStaffId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
  /** ISO date (YYYY-MM-DD) to start on — e.g. the day clicked in the calendar. */
  defaultDate?: string;
  /** Pre-select a staff member — e.g. the calendar's current staff filter. */
  defaultStaffId?: string;
}) {
  const tenant = useTenant();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState<string>("none");
  const [staffId, setStaffId] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(defaultDate ?? isoDate(new Date()));
  const [slotKey, setSlotKey] = useState<string | null>(null);
  // Staff either pick from the availability quote ("slot") or set the window
  // themselves ("custom") — start/end, or whole days (RECA-532).
  const [scheduling, setScheduling] = useState<"slot" | "custom">("slot");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(defaultDate ?? isoDate(new Date()));
  const [endTime, setEndTime] = useState("10:00");
  // Once the end has been edited by hand it stops following start + service length.
  const [endTouched, setEndTouched] = useState(false);
  const [allDay, setAllDay] = useState(false);
  // Price override (pounds, as typed). null = the catalogue total.
  const [priceInput, setPriceInput] = useState<string | null>(null);
  // "10% off" / "£10 off" the list price. Typing a price clears it and vice versa,
  // so there's only ever one reason the total differs from the list.
  const [discount, setDiscount] = useState<Discount | null>(null);

  // Defaults come from wherever the modal was opened (a calendar day, a client's
  // profile) and differ between opens, so apply them each time it opens.
  useEffect(() => {
    if (!open) return;
    setDate(defaultDate ?? isoDate(new Date()));
    setEndDate(defaultDate ?? isoDate(new Date()));
    setEndTouched(false);
    setStaffId(defaultStaffId ?? "all");
    setSlotKey(null);
  }, [open, defaultDate, defaultStaffId]);
  // A detailer who is paid after the job should not have to pick that every time, so
  // the up-front / after-the-job choice sticks per business.
  const [paymentTiming, setPaymentTiming] = useStoredState<PaymentTiming>(
    `recavo.booking.payment.${tenant.businessId}`,
    "none",
    TIMING_DEFAULTS,
  );
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethod>(paymentTiming);
  const setPaymentMethod = (next: PaymentMethod) => {
    setPaymentMethodState(next);
    if (next === "none" || next === "pay_later") setPaymentTiming(next);
  };
  const connect = useConnectAccount();
  const cardPaymentsLive = connect.data?.chargesEnabled === true;
  // Deposit override (pounds, as typed). null = follow the services' configured
  // deposits; "" = staff cleared it, i.e. no deposit / full amount up front.
  const [depositInput, setDepositInput] = useState<string | null>(null);
  const [linkedRecordId, setLinkedRecordId] = useState("none");
  const [notes, setNotes] = useState("");
  // How the client is told straight away (RECA-533): email, text, both or neither.
  // Some clients don't want the confirmation landing in their inbox, so the last
  // choice is remembered per business rather than resetting each time.
  const [notifyPref, setNotifyPref] = useStoredState<NotifyPref>(
    `recavo.booking.notify.${tenant.businessId}`,
    "email",
    NOTIFY_PREFS,
  );
  const smsCredits = useSmsCreditsSummary();
  const wantsEmail = notifyPref === "email" || notifyPref === "both" || notifyPref === "on";
  const wantsSms = notifyPref === "sms" || notifyPref === "both";
  const setChannel = (channel: "email" | "sms", on: boolean) => {
    const email = channel === "email" ? on : wantsEmail;
    const sms = channel === "sms" ? on : wantsSms;
    setNotifyPref(email && sms ? "both" : email ? "email" : sms ? "sms" : "none");
  };
  const [submitting, setSubmitting] = useState(false);
  // Account details + reference from a pay-by-bank 201, read out to the customer
  // before closing (RECA-522).
  const [bankResult, setBankResult] = useState<BankTransferInstructions | null>(null);
  const [additional, setAdditional] = useState<
    Array<{ serviceId: string; variantId: string | null }>
  >([]);

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
  const [addClientOpen, setAddClientOpen] = useState(false);

  const serviceList = services.data ?? [];
  const locationList = useMemo(() => locations.data ?? [], [locations.data]);
  const customerList = customers.data?.items ?? [];
  // The chosen client may sit beyond the first page (e.g. opened from their profile).
  const chosenCustomer = useCustomer(customerId || undefined);
  const selectedCustomer =
    customerList.find((c) => c.id === customerId) ?? chosenCustomer.data ?? null;
  // A box is greyed out (not silently ignored) when that channel can't reach the
  // client, so staff see why before they hit Create rather than in the history later.
  const emailBlocked = selectedCustomer
    ? selectedCustomer.emailDisplay || selectedCustomer.emailNormalised
      ? null
      : "no email address on file"
    : null;
  const smsBlocked = selectedCustomer
    ? !(selectedCustomer.phoneDisplay || selectedCustomer.phoneNormalised)
      ? "no mobile number on file"
      : selectedCustomer.contactPreferences.operationalNotifications === false
        ? "they've turned off text messages"
        : smsCredits.level === "empty"
          ? "you have no text credits left"
          : null
    : null;
  const notifyChannels: ("email" | "sms")[] = [
    ...(wantsEmail && !emailBlocked ? (["email"] as const) : []),
    ...(wantsSms && !smsBlocked ? (["sms"] as const) : []),
  ];
  const notifyHint = (() => {
    const blocked = [
      emailBlocked ? `Email is off: ${emailBlocked}.` : null,
      smsBlocked ? `Text is off: ${smsBlocked}.` : null,
    ].filter(Boolean);
    if (notifyChannels.length === 0) {
      return [
        "Nothing is sent now. Use Resend on the booking when they're ready to hear from you.",
        ...blocked,
      ].join(" ");
    }
    const by =
      notifyChannels.length === 2
        ? "email and text"
        : notifyChannels[0] === "sms"
          ? "text"
          : "email";
    return [`Goes out by ${by} as soon as the booking is created.`, ...blocked].join(" ");
  })();
  const catalogueLoading = services.isLoading || locations.isLoading || customers.isLoading;
  const noServices = services.isSuccess && serviceList.length === 0;
  const noLocations = locations.isSuccess && locationList.length === 0;
  const noClients = customers.isSuccess && customerList.length === 0;

  // A one-person business has nothing to choose: pick them and drop the field.
  // "Any staff member" and the single member are the same search, but pinning
  // the id means the availability quote and booking name them explicitly.
  const activeStaff = useMemo(
    () => (staff.data ?? []).filter((s) => s.status === "active"),
    [staff.data],
  );
  const soleStaff = staff.isSuccess && activeStaff.length === 1 ? activeStaff[0] : null;
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

  const bankTransferEnabled = tenant.configuration?.bankTransfer?.enabled === true;
  const hasLinkedRecords = Boolean(linkedRecordDefinition.data?.definition);
  const recordTerm = tenant.terminology.linkedRecord;
  const recordTermLower = recordTerm.toLowerCase();
  const activeRecords = (customerRecords.data ?? []).filter((r) => r.status === "active");
  // Vertical-aware nouns: "Trainer"/"Session" for PT, "Detailer"/"Service" for detailing.
  const staffNoun = tenant.terminology.staff.trim() || "Staff";
  const staffLower = staffNoun.toLowerCase();
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();
  const service = serviceList.find((s) => s.id === serviceId);
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
  };
  // A date input reports "" while someone is part-way through typing a date;
  // an invalid Date would throw on toISOString and take the page down.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(dayStart.getTime());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = useAvailability({
    serviceId: serviceId || undefined,
    locationId: locationId || undefined,
    variantId: variantId !== "none" ? variantId : undefined,
    staffId: staffId !== "all" ? staffId : undefined,
    from: validDate ? dayStart.toISOString() : "",
    to: validDate ? dayEnd.toISOString() : "",
    enabled: open && validDate && scheduling === "slot",
  });

  const slots = useMemo(
    () => (availability.data ?? []).sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const selectedSlot = slots.find((s) => `${s.start}:${s.staffId}` === slotKey) ?? null;
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";

  const additionalTotalMinor = additional.reduce((sum, a) => {
    const s = serviceById.get(a.serviceId);
    if (!s) return sum;
    const variant = a.variantId ? s.variants.find((v) => v.id === a.variantId) : undefined;
    return sum + (variant?.priceMinor ?? s.basePriceMinor);
  }, 0);
  const primaryMinor =
    selectedSlot?.priceMinor ??
    (service
      ? ((variantId !== "none" ? service.variants.find((v) => v.id === variantId) : undefined)
          ?.priceMinor ?? service.basePriceMinor)
      : 0);
  const rolledTotalMinor = primaryMinor + additionalTotalMinor;

  // Price override (RECA-532): the API puts the difference on the primary service, so
  // the total can never drop below what the additional services alone come to.
  const discountMinor = discount ? discountOffMinor(rolledTotalMinor, discount) : null;
  const discountInvalid =
    discount !== null && discount.value.trim() !== "" && discountMinor === null;
  const priceOverridden = priceInput !== null || discountMinor !== null;
  const overridePriceMinor: number | null = (() => {
    if (priceInput !== null) {
      try {
        const minor = parseMoneyToMinor(priceInput);
        return minor >= additionalTotalMinor ? minor : null;
      } catch {
        return null;
      }
    }
    if (discountMinor !== null) {
      const minor = rolledTotalMinor - discountMinor;
      return minor >= additionalTotalMinor ? minor : null;
    }
    return null;
  })();
  const priceInvalid = (priceOverridden && overridePriceMinor === null) || discountInvalid;
  const effectiveTotalMinor = overridePriceMinor ?? rolledTotalMinor;
  const priceChanged = overridePriceMinor !== null && overridePriceMinor !== rolledTotalMinor;

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

  // End follows start + service length until someone edits it.
  useEffect(() => {
    if (scheduling !== "custom" || endTouched || !validDate) return;
    if (allDay) {
      const days = Math.max(1, Math.ceil(catalogueDurationMinutes / 1440));
      setEndDate(isoDate(addDays(parseIso(date), days - 1)));
      return;
    }
    const startIso = localDateTimeToIso(date, startTime);
    if (!startIso) return;
    const end = new Date(new Date(startIso).getTime() + catalogueDurationMinutes * 60_000);
    setEndDate(isoDate(end));
    setEndTime(`${`${end.getHours()}`.padStart(2, "0")}:${`${end.getMinutes()}`.padStart(2, "0")}`);
  }, [scheduling, endTouched, validDate, allDay, date, startTime, catalogueDurationMinutes]);

  // The staff-set window as ISO instants (browser-local wall clock, like events). For
  // all-day the server snaps to local midnights at the location; we send day bounds.
  const customWindow = useMemo<{ start: string; end: string; minutes: number } | null>(() => {
    if (scheduling !== "custom") return null;
    const start = allDay ? localDateTimeToIso(date, "00:00") : localDateTimeToIso(date, startTime);
    const end = allDay
      ? /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? localDateTimeToIso(isoDate(addDays(parseIso(endDate), 1)), "00:00")
        : null
      : localDateTimeToIso(endDate, endTime);
    if (!start || !end) return null;
    const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
    return minutes > 0 ? { start, end, minutes } : null;
  }, [scheduling, allDay, date, startTime, endDate, endTime]);

  // A set time needs someone to do it — "any staff" only makes sense for a quote.
  const customStaffId = staffId !== "all" ? staffId : (soleStaff?.id ?? null);
  const customStaff = customStaffId
    ? ((staff.data ?? []).find((s) => s.id === customStaffId) ?? null)
    : null;
  const hoursWarning = useMemo(() => {
    if (scheduling !== "custom" || allDay || !customWindow || !customStaff) return null;
    return outsideWorkingHours(customStaff, customWindow, locationId || null, timezone);
  }, [scheduling, allDay, customWindow, customStaff, locationId, timezone]);

  // The API sums the booked services' deposits unless staff override it here.
  const defaultDepositMinor = configuredDepositMinor(
    [
      ...(service ? [service] : []),
      ...additional.map((a) => serviceById.get(a.serviceId)).filter((s) => s != null),
    ],
    effectiveTotalMinor,
  );
  const depositOverridden = depositInput !== null;
  // Nothing is asked for up front when paying after the job, so no deposit applies.
  const depositApplies = paymentMethod !== "credit" && paymentMethod !== "pay_later";
  const depositMinor: number | null = (() => {
    if (!depositApplies) return null;
    if (!depositOverridden) return defaultDepositMinor;
    if (!depositInput.trim()) return null;
    try {
      const minor = parseMoneyToMinor(depositInput);
      return minor > 0 && minor < effectiveTotalMinor ? minor : null;
    } catch {
      return null;
    }
  })();
  const depositInvalid =
    depositOverridden &&
    depositInput.trim() !== "" &&
    (() => {
      try {
        const minor = parseMoneyToMinor(depositInput);
        return minor < 0 || minor >= effectiveTotalMinor;
      } catch {
        return true;
      }
    })();

  // Everything still standing between the form and a booking, in the order the
  // fields appear. The Create button stays clickable while this is non-empty so
  // a click can say what's missing instead of silently doing nothing.
  const blockers: string[] = [];
  if (!customerId) blockers.push("Choose a client");
  if (!service) blockers.push("Choose a service");
  if (recordRequired && linkedRecordId === "none") blockers.push(`Choose a ${recordTermLower}`);
  if (!locationId) blockers.push("Choose a location");
  if (service) {
    if (scheduling === "slot") {
      if (!selectedSlot)
        blockers.push(slots.length > 0 ? "Pick a time slot" : "Pick a date with an available slot");
    } else {
      if (!customStaffId) blockers.push(`Choose a ${staffLower}`);
      if (!customWindow)
        blockers.push(allDay ? "Set the first and last day" : "Set a start and end time");
    }
    if (priceInvalid) blockers.push("Check the price");
    if (depositInvalid) blockers.push("Check the deposit");
  }
  const blocked = blockers.length > 0;

  const handleConflict = () => {
    if (scheduling === "custom") {
      toast.error(
        `Clashes with another booking${customStaff ? ` for ${customStaff.displayName}` : ""}`,
        { description: "Pick a different time, or someone else." },
      );
      return;
    }
    toast.error("That slot was just taken", {
      description: "Availability has been refreshed — pick another time.",
    });
    setSlotKey(null);
    void availability.refetch();
  };

  const reset = () => {
    setCustomerId(defaultCustomerId ?? "");
    setLinkedRecordId("none");
    setServiceId("");
    setVariantId("none");
    setStaffId("all");
    setLocationId("");
    setSlotKey(null);
    setPaymentMethodState(paymentTiming);
    setDepositInput(null);
    setPriceInput(null);
    setDiscount(null);
    setScheduling("slot");
    setAllDay(false);
    setEndTouched(false);
    setNotes("");
    setAdditional([]);
    setBankResult(null);
  };

  const submit = async () => {
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
      toast.error(blockers[0] ?? "Choose a client, service and location");
      return;
    }
    if (scheduling === "slot" && !selectedSlot) {
      toast.error("Pick a time slot", {
        description:
          slots.length > 0 ? undefined : "No availability on this date — try another day.",
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
    if (priceInvalid) {
      toast.error("Check the price", {
        description:
          additionalTotalMinor > 0
            ? `It can't be less than the ${formatMoney(additionalTotalMinor, service.currency)} of additional services.`
            : "Enter an amount, or reset to the list price.",
      });
      return;
    }

    if (depositInvalid) {
      toast.error("Check the deposit", {
        description: "It must be less than the total — clear it to take the full amount.",
      });
      return;
    }

    if (recordRequired && linkedRecordId === "none") {
      toast.error(`Choose a ${recordTermLower}`, {
        description: `This service needs a ${recordTermLower} on the booking.`,
      });
      return;
    }

    if (additional.length > 0) {
      if (paymentMethod === "credit") {
        toast.error("Multi-service jobs can't be paid with package credit");
        return;
      }
      if (!isIndividual) {
        toast.error("Only individual services can bundle extra services");
        return;
      }
      const currencies = new Set([
        service.currency,
        ...additional.map((a) => serviceById.get(a.serviceId)?.currency).filter(Boolean),
      ]);
      if (currencies.size > 1) {
        toast.error("All services on a job must share the same currency");
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
            additionalServices: additional.map((a) => ({
              serviceId: a.serviceId,
              ...(a.variantId ? { variantId: a.variantId } : {}),
            })),
          }
        : {}),
      locationId,
      ...(scheduling === "custom" && customWindow && customStaffId
        ? {
            staffId: customStaffId,
            start: customWindow.start,
            end: customWindow.end,
            ...(allDay ? { allDay: true } : {}),
          }
        : { staffId: selectedSlot!.staffId, start: selectedSlot!.start }),
      ...(priceChanged ? { priceMinor: overridePriceMinor } : {}),
      leadCustomerId: customerId,
      ...(linkedRecordId !== "none" ? { linkedRecordId } : {}),
      paymentMethod,
      // Only send an override when staff changed it; otherwise the API applies
      // the services' configured deposits (0 = force no deposit).
      ...(depositOverridden && depositApplies ? { depositMinor: depositMinor ?? 0 } : {}),
      notesInternal: notes || null,
      notifyChannels,
      source: "staff_console",
      // Include slotToken when present so backends that accept it can bind the quote.
      ...(scheduling === "slot" && selectedSlot?.slotToken
        ? { slotToken: selectedSlot.slotToken }
        : {}),
    };

    setSubmitting(true);
    try {
      const { bankTransfer } = await createBooking.mutateAsync(body);
      if (bankTransfer) {
        // Keep the dialog open on the details so staff can read them out.
        setBankResult(bankTransfer);
        toast.success("Booking reserved — awaiting bank transfer");
        return;
      }
      toast.success(
        notifyChannels.length > 0 ? "Booking created" : "Booking created — client not notified",
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        handleConflict();
      } else {
        toastApiError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bankResult ? "Awaiting bank transfer" : "Add booking"}</DialogTitle>
          <DialogDescription>
            {bankResult
              ? "The booking is reserved. Read these details out to the customer — they've been emailed too."
              : setupBlocked
                ? "Finish a quick bit of setup first — then you can take bookings."
                : "Pick the client and service, choose a time, and the booking is confirmed straight away."}
          </DialogDescription>
        </DialogHeader>

        {bankResult ? (
          <>
            <BankTransferPanel details={bankResult} />
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
        ) : catalogueLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Checking setup…</p>
        ) : noServices ? (
          <SetupGate
            icon={<Layers className="size-5" />}
            title={`Create a ${serviceNoun} first`}
            description="Bookings need something clients can book — duration, price and who can deliver it."
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
            description="Pick where this booking happens — your premises, a mobile visit, or a service area."
            step="location"
            to="/locations"
            cta="Add location"
            onNavigate={() => onOpenChange(false)}
          />
        ) : noClients ? (
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
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Client</Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CustomerSearchPicker
                    value={selectedCustomer}
                    suggestions={customerList}
                    placeholder="Choose or search for a client"
                    onSelect={(c) => {
                      setCustomerId(c.id);
                      // A record belongs to one client, so it can't survive a client change.
                      setLinkedRecordId("none");
                      setQuickAddOpen(false);
                    }}
                  />
                </div>
                {/* New walk-in? Add them here without leaving the half-filled form. */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setAddClientOpen(true)}
                  aria-label="Add a new client"
                  title="Add a new client"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {hasLinkedRecords && customerId ? (
              <div className="grid gap-2">
                <Label>
                  {recordTerm}
                  {recordRequired ? <span className="text-destructive"> *</span> : null}
                </Label>
                {customerRecords.isSuccess && activeRecords.length === 0 ? (
                  <QuickAddLinkedRecord
                    key={customerId}
                    customerId={customerId}
                    fields={recordFields}
                    term={recordTerm}
                    onAdded={(record) => {
                      setLinkedRecordId(record.id);
                      toast.success(`${recordTerm} added`, {
                        description: `${record.displayLabel} is on this booking. Add more details from the client's profile whenever you like.`,
                      });
                    }}
                  />
                ) : quickAddOpen ? (
                  <QuickAddLinkedRecord
                    key={customerId}
                    customerId={customerId}
                    fields={recordFields}
                    term={recordTerm}
                    autoFocus
                    onCancel={() => setQuickAddOpen(false)}
                    onAdded={(record) => {
                      setLinkedRecordId(record.id);
                      setQuickAddOpen(false);
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Services</Label>
                <ServiceMultiPicker
                  services={serviceList}
                  value={picked}
                  onChange={setPicked}
                  multi={!service || multiAllowed}
                  singleReason={
                    paymentMethod === "credit"
                      ? "Paying with a credit covers one service, so this replaced the other."
                      : undefined
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Select
                  value={locationId}
                  onValueChange={(v) => {
                    setLocationId(v);
                    setSlotKey(null);
                  }}
                >
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {scheduling === "custom" ? `Choose a ${staffLower}…` : `Any ${staffLower}`}
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
              {scheduling === "slot" ? (
                <div className="grid gap-2">
                  <Label htmlFor="booking-date">Date</Label>
                  <input
                    id="booking-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSlotKey(null);
                    }}
                    className={DATE_INPUT}
                  />
                </div>
              ) : null}
            </div>

            {service ? (
              <div className="grid gap-3 rounded-xl border p-3">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="booking-price">Price (£)</Label>
                    {priceOverridden ? (
                      <button
                        type="button"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                        onClick={() => {
                          setPriceInput(null);
                          setDiscount(null);
                        }}
                      >
                        List {formatMoney(rolledTotalMinor, service.currency)} · reset
                      </button>
                    ) : null}
                  </div>
                  <Input
                    id="booking-price"
                    inputMode="decimal"
                    value={
                      priceInput !== null
                        ? priceInput
                        : ((overridePriceMinor ?? rolledTotalMinor) / 100).toFixed(2)
                    }
                    onChange={(e) => {
                      setPriceInput(e.target.value);
                      setDiscount(null);
                    }}
                    aria-invalid={priceInvalid}
                  />
                  {/* Discount: a percentage or a fixed amount off the list price. Sets the
                      same override as typing a price, just worked out for you. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="booking-discount" className="text-xs text-muted-foreground">
                      Discount
                    </Label>
                    <Input
                      id="booking-discount"
                      inputMode="decimal"
                      placeholder="0"
                      className="h-8 w-20"
                      value={discount?.value ?? ""}
                      onChange={(e) => {
                        setPriceInput(null);
                        setDiscount(
                          e.target.value.trim() === ""
                            ? null
                            : { mode: discount?.mode ?? "percent", value: e.target.value },
                        );
                      }}
                      aria-invalid={discountInvalid}
                    />
                    <Tabs
                      value={discount?.mode ?? "percent"}
                      onValueChange={(mode) => {
                        setPriceInput(null);
                        setDiscount({
                          mode: mode as Discount["mode"],
                          value: discount?.value ?? "",
                        });
                      }}
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="percent" className="px-2.5 text-xs">
                          % off
                        </TabsTrigger>
                        <TabsTrigger value="amount" className="px-2.5 text-xs">
                          £ off
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {discountMinor !== null && overridePriceMinor !== null ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {discountLabel(discount!, (m) => formatMoney(m, service.currency))} · −
                        {formatMoney(discountMinor, service.currency)}
                      </span>
                    ) : null}
                  </div>
                  {priceInvalid ? (
                    <p className="text-xs text-destructive">
                      {discountInvalid
                        ? discount!.mode === "percent"
                          ? "Enter a percentage between 0 and 100."
                          : `Enter an amount up to ${formatMoney(rolledTotalMinor, service.currency)}.`
                        : additionalTotalMinor > 0
                          ? `Enter at least ${formatMoney(additionalTotalMinor, service.currency)} — the additional services keep their list prices.`
                          : "Enter an amount, or reset to the list price."}
                    </p>
                  ) : priceChanged ? (
                    <p className="text-xs text-muted-foreground">
                      {additionalTotalMinor > 0
                        ? `${formatMoney(effectiveTotalMinor - additionalTotalMinor, service.currency)} for ${service.name}; additional services stay at list price.`
                        : `Adjusted from the ${formatMoney(rolledTotalMinor, service.currency)} list price.`}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Time</Label>
                  <Tabs
                    value={scheduling}
                    onValueChange={(v) => {
                      setScheduling(v as typeof scheduling);
                      setSlotKey(null);
                      setEndTouched(false);
                    }}
                  >
                    <TabsList className="h-8">
                      <TabsTrigger value="slot" className="text-xs">
                        Pick a slot
                      </TabsTrigger>
                      <TabsTrigger value="custom" className="text-xs">
                        Set the time
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {scheduling === "custom" ? (
                  <div className="grid gap-3">
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="booking-start-date">Start</Label>
                        <div className="flex gap-2">
                          <input
                            id="booking-start-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className={cn(DATE_INPUT, "min-w-0 flex-1")}
                          />
                          {allDay ? null : (
                            <input
                              type="time"
                              aria-label="Start time"
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              className={cn(DATE_INPUT, "w-28 shrink-0")}
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="booking-end-date">{allDay ? "Last day" : "End"}</Label>
                        <div className="flex gap-2">
                          <input
                            id="booking-end-date"
                            type="date"
                            value={endDate}
                            min={date}
                            onChange={(e) => {
                              setEndDate(e.target.value);
                              setEndTouched(true);
                            }}
                            className={cn(DATE_INPUT, "min-w-0 flex-1")}
                          />
                          {allDay ? null : (
                            <input
                              type="time"
                              aria-label="End time"
                              value={endTime}
                              onChange={(e) => {
                                setEndTime(e.target.value);
                                setEndTouched(true);
                              }}
                              className={cn(DATE_INPUT, "w-28 shrink-0")}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={allDay}
                          onChange={(e) => {
                            setAllDay(e.target.checked);
                            setEndTouched(false);
                          }}
                        />
                        All day
                      </label>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          customWindow ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        {customWindow
                          ? `Duration: ${formatDurationLong(customWindow.minutes)}`
                          : "The end must come after the start."}
                      </span>
                    </div>
                    {allDay ? (
                      <p className="text-xs text-muted-foreground">
                        {`Blocks ${customStaff?.displayName ?? `the ${staffLower}`} for the whole ${
                          customWindow && customWindow.minutes > 1440 ? "days" : "day"
                        }; the client sees the ${
                          customWindow && customWindow.minutes > 1440 ? "dates" : "date"
                        } rather than a time.`}
                      </p>
                    ) : null}
                    {hoursWarning ? (
                      <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                        {hoursWarning}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {!serviceId || !locationId ? (
                      <p className="text-xs text-muted-foreground">
                        Choose a service and location to see availability.
                      </p>
                    ) : availability.isLoading ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className="h-9 animate-pulse rounded-md bg-primary/10" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {validDate
                          ? emptySlotsMessage(service?.availabilityWindows, date)
                          : "Pick a date to see available times."}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {slots.map((s) => {
                          const key = `${s.start}:${s.staffId}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setSlotKey(key)}
                              className={`rounded-lg border py-2 text-xs tabular-nums transition-colors ${
                                key === slotKey
                                  ? "border-primary bg-primary-soft text-primary"
                                  : "hover:bg-secondary"
                              }`}
                              title={
                                s.remainingCapacity > 1
                                  ? `${s.remainingCapacity} places · ${formatMoney(s.priceMinor, s.currency)}`
                                  : formatMoney(s.priceMinor, s.currency)
                              }
                            >
                              {formatInTz(s.start, s.displayTimezone || timezone, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedSlot &&
                    spansDays(
                      selectedSlot.start,
                      selectedSlot.end,
                      selectedSlot.displayTimezone || timezone,
                    ) ? (
                      <p className="text-xs text-muted-foreground">
                        Drop-off{" "}
                        {formatInTz(selectedSlot.start, selectedSlot.displayTimezone || timezone, {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}ready{" "}
                        {formatInTz(selectedSlot.end, selectedSlot.displayTimezone || timezone, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    ) : null}
                    {selectedSlot ? (
                      <p className="text-xs text-muted-foreground">
                        Quote {formatMoney(selectedSlot.priceMinor, selectedSlot.currency)}
                        {selectedSlot.remainingCapacity > 1
                          ? ` · ${selectedSlot.remainingCapacity} places left`
                          : ""}
                        {selectedSlot.slotToken ? " · slot token attached" : ""}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  const next = v as typeof paymentMethod;
                  if (next === "credit") setAdditional([]);
                  setPaymentMethod(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pay_later">
                    Pay after the job — confirmation only
                    {service ? ` (${formatMoney(effectiveTotalMinor, service.currency)})` : ""}
                  </SelectItem>
                  <SelectItem value="none">
                    Request payment up front
                    {service ? ` — ${formatMoney(effectiveTotalMinor, service.currency)}` : ""}
                  </SelectItem>
                  <SelectItem value="credit" disabled={additional.length > 0}>
                    Use package credit
                  </SelectItem>
                  {bankTransferEnabled ? (
                    <SelectItem value="bank_transfer" disabled={effectiveTotalMinor <= 0}>
                      Bank transfer — awaits payment
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              {paymentMethod === "pay_later" ? (
                <p className="text-xs text-muted-foreground">
                  The client gets a plain booking confirmation — no payment request, pay link or
                  deposit. Take payment when the job is done, or use “Send payment reminder” on the
                  booking if it's still unpaid afterwards.
                </p>
              ) : paymentMethod === "none" && effectiveTotalMinor > 0 ? (
                <p className="text-xs text-muted-foreground">
                  The confirmation is a payment request showing the amount due
                  {cardPaymentsLive ? " with a pay-online link" : ""}. Nothing is taken now — use
                  “Take card payment” or “Record payment” on the booking when the money arrives.
                </p>
              ) : null}
              {paymentMethod === "bank_transfer" ? (
                <p className="text-xs text-muted-foreground">
                  The booking waits as “awaiting payment”
                  {depositMinor != null && service
                    ? ` until the ${formatMoney(depositMinor, service.currency)} deposit arrives`
                    : ""}
                  . You'll get the account details and reference to read out, and the customer is
                  emailed them too.
                </p>
              ) : null}
            </div>

            {service && depositApplies && effectiveTotalMinor > 0 ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="booking-deposit">Deposit to secure (£)</Label>
                  {depositOverridden ? (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => setDepositInput(null)}
                    >
                      Use {serviceNoun.toLowerCase()} default
                    </button>
                  ) : null}
                </div>
                <Input
                  id="booking-deposit"
                  inputMode="decimal"
                  placeholder="0"
                  value={
                    depositOverridden
                      ? depositInput
                      : defaultDepositMinor != null
                        ? String(defaultDepositMinor / 100)
                        : ""
                  }
                  onChange={(e) => setDepositInput(e.target.value)}
                  aria-invalid={depositInvalid}
                />
                <p
                  className={`text-xs ${depositInvalid ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {depositInvalid
                    ? `Enter an amount under ${formatMoney(effectiveTotalMinor, service.currency)}, or clear it to take the full amount.`
                    : depositMinor != null
                      ? `${formatMoney(depositMinor, service.currency)} now, ${formatMoney(effectiveTotalMinor - depositMinor, service.currency)} balance to collect later.`
                      : `No deposit — the full ${formatMoney(effectiveTotalMinor, service.currency)} is due.`}
                </p>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="booking-notes">Internal notes</Label>
              <Textarea
                id="booking-notes"
                placeholder="Visible to staff only"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <fieldset className="grid gap-2 rounded-lg border p-3">
              <legend className="text-sm font-medium">Send confirmation to client</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    emailBlocked ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    checked={wantsEmail && !emailBlocked}
                    disabled={Boolean(emailBlocked)}
                    onCheckedChange={(checked) => setChannel("email", checked === true)}
                    aria-label="Send confirmation by email"
                  />
                  Email
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    smsBlocked ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    checked={wantsSms && !smsBlocked}
                    disabled={Boolean(smsBlocked)}
                    onCheckedChange={(checked) => setChannel("sms", checked === true)}
                    aria-label="Send confirmation by text message"
                  />
                  Text message
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{notifyHint}</p>
            </fieldset>
          </div>
        )}

        {bankResult ? null : (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {setupBlocked || catalogueLoading ? "Close" : "Cancel"}
            </Button>
            {setupBlocked || catalogueLoading ? null : (
              <Button
                onClick={submit}
                // Looks disabled while something is missing but stays clickable, so
                // the click can explain what's left rather than doing nothing.
                disabled={submitting}
                aria-disabled={submitting || blocked}
                className={cn(blocked && !submitting && "opacity-50")}
                title={blocked ? blockers.join(" · ") : undefined}
              >
                {submitting ? "Creating…" : "Create booking"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
      {/* Stacks over the booking drawer; the new client is selected on save. */}
      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          setLinkedRecordId("none");
          setQuickAddOpen(false);
        }}
      />
    </Dialog>
  );
}
