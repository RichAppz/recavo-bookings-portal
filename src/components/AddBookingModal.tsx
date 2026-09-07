import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CustomerSearchPicker,
  type LinkedRecordField,
  QuickAddLinkedRecord,
  activeSortedFields,
} from "@/components/LinkedRecordDialogs";
import { Layers, MapPin, Plus, UserRound, X } from "lucide-react";
import { ServiceSearchPicker } from "@/components/ServiceSearchPicker";
import { SetupGate } from "@/components/SetupGate";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BankTransferPanel } from "@/components/BankTransferPanel";
import type { BankTransferInstructions } from "@/lib/api/types";
import {
  useAvailability,
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const [paymentMethod, setPaymentMethod] = useState<"none" | "credit" | "bank_transfer">("none");
  // Deposit override (pounds, as typed). null = follow the services' configured
  // deposits; "" = staff cleared it, i.e. no deposit / full amount up front.
  const [depositInput, setDepositInput] = useState<string | null>(null);
  const [linkedRecordId, setLinkedRecordId] = useState("none");
  const [notes, setNotes] = useState("");
  // Whether the client is told straight away (RECA-533). Some clients don't want the
  // confirmation landing in their inbox, so this is remembered per business and comes
  // back the way it was last left rather than resetting each time.
  const [notifyPref, setNotifyPref] = useStoredState<"on" | "off">(
    `recavo.booking.notify.${tenant.businessId}`,
    "on",
    ["on", "off"],
  );
  const notifyCustomer = notifyPref === "on";
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

  const serviceList = services.data ?? [];
  const locationList = useMemo(() => locations.data ?? [], [locations.data]);
  const customerList = customers.data?.items ?? [];
  // The chosen client may sit beyond the first page (e.g. opened from their profile).
  const chosenCustomer = useCustomer(customerId || undefined);
  const selectedCustomer =
    customerList.find((c) => c.id === customerId) ?? chosenCustomer.data ?? null;
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
  const availableToAdd = serviceList.filter(
    (s) => s.id !== serviceId && !additional.some((a) => a.serviceId === s.id),
  );
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
  const priceOverridden = priceInput !== null;
  const overridePriceMinor: number | null = (() => {
    if (!priceOverridden) return null;
    try {
      const minor = parseMoneyToMinor(priceInput);
      return minor >= additionalTotalMinor ? minor : null;
    } catch {
      return null;
    }
  })();
  const priceInvalid = priceOverridden && overridePriceMinor === null;
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
  const depositMinor: number | null = (() => {
    if (paymentMethod === "credit") return null;
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
    setPaymentMethod("none");
    setDepositInput(null);
    setPriceInput(null);
    setScheduling("slot");
    setAllDay(false);
    setEndTouched(false);
    setNotes("");
    setAdditional([]);
    setBankResult(null);
  };

  const submit = async () => {
    if (!customerId || !service || !locationId) {
      toast.error("Choose a client, service and location");
      return;
    }
    if (scheduling === "slot" && !selectedSlot) {
      toast.error("Choose a time slot");
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
      ...(depositOverridden && paymentMethod !== "credit"
        ? { depositMinor: depositMinor ?? 0 }
        : {}),
      notesInternal: notes || null,
      ...(notifyCustomer ? {} : { notifyCustomer: false }),
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
      toast.success(notifyCustomer ? "Booking created" : "Booking created — client not notified");
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
          />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Client</Label>
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
              <div className="grid gap-2">
                <Label>Service</Label>
                <ServiceSearchPicker
                  services={serviceList}
                  value={serviceId}
                  onSelect={(s) => {
                    setServiceId(s.id);
                    setVariantId("none");
                    setSlotKey(null);
                    setAdditional([]);
                  }}
                />
              </div>
              {/* Only worth a field when the service actually has variants. */}
              {service && service.variants.length > 0 ? (
                <div className="grid gap-2">
                  <Label>Variant</Label>
                  <Select
                    value={variantId}
                    onValueChange={(v) => {
                      setVariantId(v);
                      setSlotKey(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default (no variant)</SelectItem>
                      {(service?.variants ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {[
                            v.name,
                            // Blank duration/price fall back to the service default,
                            // so only show what the variant actually overrides.
                            v.durationMinutes != null ? formatDuration(v.durationMinutes) : null,
                            v.priceMinor != null
                              ? formatMoney(v.priceMinor, service!.currency)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
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

            {multiAllowed ? (
              <div className="grid gap-2">
                <Label>Additional services (optional)</Label>
                {additional.map((a, idx) => {
                  const s = serviceById.get(a.serviceId);
                  if (!s) return null;
                  return (
                    <div
                      key={a.serviceId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    >
                      <span className="min-w-0 flex-1 text-sm font-medium">{s.name}</span>
                      {s.variants.length > 0 ? (
                        <Select
                          value={a.variantId ?? "none"}
                          onValueChange={(v) =>
                            setAdditional((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, variantId: v === "none" ? null : v } : x,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Default</SelectItem>
                            {s.variants.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} · {formatMoney(v.priceMinor ?? 0, s.currency)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatMoney(s.basePriceMinor, s.currency)}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setAdditional((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                {availableToAdd.length > 0 ? (
                  <ServiceSearchPicker
                    services={availableToAdd}
                    value={null}
                    placeholder="Add another service"
                    onSelect={(s) =>
                      setAdditional((prev) => [...prev, { serviceId: s.id, variantId: null }])
                    }
                  />
                ) : null}
                {additional.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Reserves the combined duration and rolls up to an estimated{" "}
                    {formatMoney(rolledTotalMinor, service!.currency)}. The server confirms the
                    final price and end time.
                  </p>
                ) : null}
              </div>
            ) : null}

            {service ? (
              <div className="grid gap-3 rounded-xl border p-3">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="booking-price">Price (£)</Label>
                    {priceOverridden ? (
                      <button
                        type="button"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                        onClick={() => setPriceInput(null)}
                      >
                        List {formatMoney(rolledTotalMinor, service.currency)} · reset
                      </button>
                    ) : null}
                  </div>
                  <Input
                    id="booking-price"
                    inputMode="decimal"
                    value={priceOverridden ? priceInput : (rolledTotalMinor / 100).toFixed(2)}
                    onChange={(e) => setPriceInput(e.target.value)}
                    aria-invalid={priceInvalid}
                  />
                  {priceInvalid ? (
                    <p className="text-xs text-destructive">
                      {additionalTotalMinor > 0
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
                  <SelectItem value="none">
                    Take payment separately
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

            {service && paymentMethod !== "credit" && effectiveTotalMinor > 0 ? (
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

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="booking-notify" className="cursor-pointer">
                  Send confirmation to client
                </Label>
                <p className="text-xs text-muted-foreground">
                  {notifyCustomer
                    ? selectedCustomer?.contactPreferences.operationalNotifications === false
                      ? "This client has turned off booking messages, so nothing will be sent."
                      : `Goes out by ${
                          selectedCustomer?.contactPreferences.preferredChannel === "sms"
                            ? "SMS"
                            : "email"
                        } as soon as the booking is created.`
                    : "Nothing is sent now. Use Resend on the booking when they're ready to hear from you."}
                </p>
              </div>
              <Switch
                id="booking-notify"
                checked={notifyCustomer}
                onCheckedChange={(checked) => setNotifyPref(checked ? "on" : "off")}
                aria-label="Send confirmation to client"
              />
            </div>
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
                disabled={
                  submitting ||
                  priceInvalid ||
                  (scheduling === "slot" ? !selectedSlot : !customWindow || !customStaffId)
                }
              >
                {submitting ? "Creating…" : "Create booking"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
