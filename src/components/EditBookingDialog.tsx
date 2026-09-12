import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarClock, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CustomerSearchPicker,
  type LinkedRecordField,
  QuickAddLinkedRecord,
  type QuickAddLinkedRecordHandle,
  activeSortedFields,
} from "@/components/LinkedRecordDialogs";
import { ServiceMultiPicker, type PickedService } from "@/components/ServiceMultiPicker";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useAmendBooking,
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
import { discountLabel, discountOffMinor, type Discount } from "@/lib/discount";
import {
  formatBookingWhen,
  formatDurationLong,
  formatInTz,
  formatMoney,
  parseMoneyToMinor,
} from "@/lib/format";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { useStoredState } from "@/lib/use-stored-state";
import { cn } from "@/lib/utils";

/** Same remembered channel choice the Add booking form keeps per business. */
const NOTIFY_PREFS = ["email", "sms", "both", "none", "on", "off"] as const;
type NotifyPref = (typeof NOTIFY_PREFS)[number];

type EditablePaymentMethod = "none" | "bank_transfer" | "pay_later";

type Change = { label: string; from: string; to: string; clientVisible: boolean };

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
}: {
  booking: Booking;
  onClose: () => void;
  /** Close this and open the reschedule dialog. */
  onReschedule: () => void;
}) {
  const tenant = useTenant();
  const timezone = booking.timezone || tenant.business?.defaultTimezone || "Europe/London";
  const amend = useAmendBooking();

  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const smsCredits = useSmsCreditsSummary();

  // ---- What the booking is now -------------------------------------------------
  const originalPicked = useMemo<PickedService[]>(
    () =>
      [...(booking.lineItems ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((li) => ({ serviceId: li.serviceId, variantId: li.variantId ?? null })),
    [booking.lineItems],
  );
  const originalLabels = useMemo(
    () =>
      [...(booking.lineItems ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((li) => (li.variantName ? `${li.name} · ${li.variantName}` : li.name)),
    [booking.lineItems],
  );
  // Catalogue total the job was priced from: the primary's snapshot price plus the
  // additional items, which never carry an override (RECA-532).
  const snapshotListMinor =
    booking.serviceSnapshot.priceMinor +
    (booking.lineItems ?? []).slice(1).reduce((sum, li) => sum + li.priceMinor, 0);
  const snapshotAdditionalMinor = (booking.lineItems ?? [])
    .slice(1)
    .reduce((sum, li) => sum + li.priceMinor, 0);
  const originallyOverridden = booking.priceMinor !== snapshotListMinor;
  const paidMinor = booking.paidMinor ?? 0;
  const credit = booking.paymentMethod === "credit";
  // Once money has changed hands the booking belongs to whoever paid (the API 409s).
  const clientLocked = credit || paidMinor > 0;
  const paymentEditable = booking.status === "confirmed" && !credit;
  const currentMinutes = Math.max(
    0,
    Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60_000),
  );
  // Mirrors the API: an all-day or hand-set window survives a service change, a
  // catalogue-length job grows or shrinks from its start.
  const customWindow =
    booking.allDay ||
    (booking.lineItems?.[0]?.durationMinutes ?? booking.serviceSnapshot.durationMinutes) !==
      booking.serviceSnapshot.durationMinutes;

  // ---- Form state ---------------------------------------------------------------
  const [picked, setPickedState] = useState<PickedService[]>(originalPicked);
  const [customerId, setCustomerId] = useState(booking.leadCustomerId);
  const [linkedRecordId, setLinkedRecordId] = useState(booking.linkedRecordId ?? "none");
  const [staffId, setStaffId] = useState(booking.staffId);
  const [locationId, setLocationId] = useState(booking.locationId);
  // Price override (pounds, as typed). null = the list price for the picked services.
  const [priceInput, setPriceInput] = useState<string | null>(
    originallyOverridden ? (booking.priceMinor / 100).toFixed(2) : null,
  );
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Booking["paymentMethod"]>(
    booking.paymentMethod,
  );
  const [notes, setNotes] = useState(booking.notesInternal ?? "");
  // null = follow the default (on for anything the client would notice).
  const [notifyChoice, setNotifyChoice] = useState<boolean | null>(null);
  const [notifyPref] = useStoredState<NotifyPref>(
    `recavo.booking.notify.${tenant.businessId}`,
    "email",
    NOTIFY_PREFS,
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAdd = useRef<QuickAddLinkedRecordHandle | null>(null);
  const [quickAddPending, setQuickAddPending] = useState(false);
  const onQuickAddInput = useCallback((has: boolean) => setQuickAddPending(has), []);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // What to do once the person agrees to drop their edits: close, or open Reschedule.
  const afterDiscard = useRef<() => void>(() => undefined);

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

  const primary = picked[0];
  const service = primary ? serviceById.get(primary.serviceId) : undefined;
  const servicesChanged = !samePicked(picked, originalPicked);
  const pickedLabels = picked.map((p) => {
    const s = serviceById.get(p.serviceId);
    const v = p.variantId ? s?.variants.find((x) => x.id === p.variantId) : undefined;
    return s ? (v ? `${s.name} · ${v.name}` : s.name) : "Unknown service";
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

  // ---- Money --------------------------------------------------------------------
  // The API re-prices from the catalogue when services change and otherwise keeps
  // the snapshot, so "list" means whichever of those applies.
  const catalogueMinor = (p: PickedService) => {
    const s = serviceById.get(p.serviceId);
    if (!s) return 0;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    return v?.priceMinor ?? s.basePriceMinor;
  };
  const rolledTotalMinor = servicesChanged
    ? picked.reduce((sum, p) => sum + catalogueMinor(p), 0)
    : snapshotListMinor;
  const additionalTotalMinor = servicesChanged
    ? picked.slice(1).reduce((sum, p) => sum + catalogueMinor(p), 0)
    : snapshotAdditionalMinor;
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
  const priceBelowPaid = effectiveTotalMinor < paidMinor;
  const currency = booking.currency;

  // What to send for the price, if anything. Omitted = keep (or catalogue when the
  // services change); null = back to list; a number = an override.
  const priceBody: { priceMinor?: number | null } = (() => {
    if (credit) return {};
    if (servicesChanged) {
      return effectiveTotalMinor !== rolledTotalMinor ? { priceMinor: effectiveTotalMinor } : {};
    }
    if (effectiveTotalMinor === booking.priceMinor) return {};
    if (effectiveTotalMinor === snapshotListMinor) return { priceMinor: null };
    return { priceMinor: effectiveTotalMinor };
  })();

  // ---- Duration hint -------------------------------------------------------------
  const newMinutes = picked.reduce((sum, p) => {
    const s = serviceById.get(p.serviceId);
    if (!s) return sum;
    const v = p.variantId ? s.variants.find((x) => x.id === p.variantId) : undefined;
    return sum + (v?.durationMinutes ?? s.durationMinutes);
  }, 0);
  const durationChanges = servicesChanged && !customWindow && newMinutes !== currentMinutes;
  const newEnd = durationChanges
    ? new Date(new Date(booking.start).getTime() + newMinutes * 60_000).toISOString()
    : null;

  // ---- The diff, for the summary and the notify default -----------------------------
  const staffName = (id: string) =>
    (staff.data ?? []).find((s) => s.id === id)?.displayName ?? "Unassigned";
  const locationName = (id: string) => (locations.data ?? []).find((l) => l.id === id)?.name ?? "—";
  const recordLabel = (id: string | null) =>
    id
      ? (activeRecords.find((r) => r.id === id)?.displayLabel ??
        (id === booking.linkedRecordId ? originalRecord.data?.displayLabel : undefined) ??
        recordTerm)
      : `No ${recordTermLower}`;
  const nextRecordId = linkedRecordId !== "none" ? linkedRecordId : null;

  const changes: Change[] = [];
  if (servicesChanged) {
    changes.push({
      label: pickedLabels.length > 1 || originalLabels.length > 1 ? "Services" : "Service",
      from: originalLabels.join(" + "),
      to: pickedLabels.join(" + "),
      clientVisible: true,
    });
  }
  if (!credit && effectiveTotalMinor !== booking.priceMinor) {
    changes.push({
      label: "Price",
      from: formatMoney(booking.priceMinor, currency),
      to: formatMoney(effectiveTotalMinor, currency),
      clientVisible: true,
    });
  }
  if (durationChanges && newEnd) {
    changes.push({
      label: "Finishes",
      from: formatInTz(booking.end, timezone, { hour: "2-digit", minute: "2-digit" }),
      to: formatInTz(newEnd, timezone, { hour: "2-digit", minute: "2-digit" }),
      clientVisible: true,
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
      from: originalCustomer.data ? customerDisplayName(originalCustomer.data) : "—",
      to: selectedCustomer ? customerDisplayName(selectedCustomer) : "—",
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
  const dirty = changes.length > 0;
  const clientVisible = changes.some((c) => c.clientVisible);
  const notify = notifyChoice ?? clientVisible;

  // ---- Who can be told, and how --------------------------------------------------
  const emailBlocked = selectedCustomer
    ? selectedCustomer.emailDisplay || selectedCustomer.emailNormalised
      ? null
      : "no email address on file"
    : "client not loaded";
  const smsBlocked = selectedCustomer
    ? !(selectedCustomer.phoneDisplay || selectedCustomer.phoneNormalised)
      ? "no mobile number on file"
      : selectedCustomer.contactPreferences.operationalNotifications === false
        ? "they've turned off text messages"
        : smsCredits.level === "empty"
          ? "you have no text credits left"
          : null
    : "client not loaded";
  const wantsEmail = notifyPref === "email" || notifyPref === "both" || notifyPref === "on";
  const wantsSms = notifyPref === "sms" || notifyPref === "both";
  let notifyChannels: ("email" | "sms")[] = [
    ...(wantsEmail && !emailBlocked ? (["email"] as const) : []),
    ...(wantsSms && !smsBlocked ? (["sms"] as const) : []),
  ];
  // The remembered preference may not reach this client; fall back to whatever does.
  if (notifyChannels.length === 0) {
    notifyChannels = !emailBlocked ? ["email"] : !smsBlocked ? ["sms"] : [];
  }
  const notifyHint = (() => {
    if (!notify) return "Nothing is sent. Use Resend on the booking if you change your mind.";
    if (notifyChannels.length === 0) {
      return `Can't reach ${selectedCustomer ? customerDisplayName(selectedCustomer) : "the client"}: ${[emailBlocked, smsBlocked].filter(Boolean).join("; ")}.`;
    }
    const by =
      notifyChannels.length === 2
        ? "email and text"
        : notifyChannels[0] === "sms"
          ? "text"
          : "email";
    return `${selectedCustomer ? customerDisplayName(selectedCustomer) : "The client"} gets the booking confirmation again by ${by}, with the new details.`;
  })();

  // ---- Blockers -----------------------------------------------------------------
  const blockers: string[] = [];
  if (!primary) blockers.push("Choose a service");
  if (recordRequired && nextRecordId === null && !quickAddPending)
    blockers.push(`Choose a ${recordTermLower}`);
  if (priceInvalid) blockers.push("Check the price");
  if (priceBelowPaid)
    blockers.push(
      `The price can't be below the ${formatMoney(paidMinor, currency)} already paid — refund first`,
    );
  if (!dirty) blockers.push("Nothing has changed");
  const blocked = blockers.length > 0;

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

    const body: AmendBookingBody = {
      ...(servicesChanged
        ? {
            serviceId: primary.serviceId,
            variantId: primary.variantId ?? null,
            additionalServices: picked.slice(1).map((p) => ({
              serviceId: p.serviceId,
              ...(p.variantId ? { variantId: p.variantId } : {}),
            })),
          }
        : {}),
      ...(staffId !== booking.staffId ? { staffId } : {}),
      ...(locationId !== booking.locationId ? { locationId } : {}),
      ...(customerId !== booking.leadCustomerId ? { leadCustomerId: customerId } : {}),
      ...(recordId !== (booking.linkedRecordId ?? null) ? { linkedRecordId: recordId } : {}),
      ...priceBody,
      ...(paymentMethod !== booking.paymentMethod && paymentMethod !== "credit"
        ? { paymentMethod: paymentMethod as EditablePaymentMethod }
        : {}),
      ...(notesChanged ? { notesInternal: notes.trim() || null } : {}),
      ...(notify && notifyChannels.length > 0 ? { notify: { channels: notifyChannels } } : {}),
    };

    try {
      await amend.mutateAsync({ bookingId: booking.id, ifMatch: booking.version, body });
      onClose();
    } catch {
      // useAmendBooking toasts every failure; a stale version also refetches the
      // booking, so the next Save carries the fresh version with these edits intact.
    } finally {
      setSubmitting(false);
    }
  };

  const catalogueLoading = services.isLoading || staff.isLoading || locations.isLoading;

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Change what's booked, who's doing it or the price. Payments already taken stay on the
            booking.
          </DialogDescription>
        </DialogHeader>

        {catalogueLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          // Same guard as Add booking: nothing may grow the sheet sideways on a phone.
          <div className="grid min-w-0 grid-cols-1 gap-4 **:min-w-0">
            {/* When — read-only here; reschedule owns the diary. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-secondary/40 px-3 py-2">
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  When
                </p>
                <p className="text-sm">{formatBookingWhen(booking, timezone)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => guard(onReschedule)}
              >
                <CalendarClock className="size-4" /> Reschedule
              </Button>
            </div>

            <div className="grid gap-2">
              <Label>Client</Label>
              {clientLocked ? (
                <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {originalCustomer.data ? customerDisplayName(originalCustomer.data) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {credit
                        ? "Paid with a package credit, so the booking stays with this client."
                        : `${formatMoney(paidMinor, currency)} has been paid, so the booking stays with this client. Refund it first, or cancel and rebook.`}
                    </p>
                  </div>
                </div>
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

            <div className="grid gap-2">
              <Label>Services</Label>
              {credit ? (
                <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{originalLabels.join(" + ")}</p>
                    <p className="text-xs text-muted-foreground">
                      Paid with a package credit. To use a different service, cancel this booking
                      (the credit comes back) and rebook.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <ServiceMultiPicker
                    services={serviceList}
                    value={picked}
                    onChange={setPicked}
                    multi={isIndividual}
                    singleReason={isIndividual ? undefined : "A group session covers one service."}
                  />
                  {servicesChanged ? (
                    <p className="text-xs text-muted-foreground">
                      {customWindow
                        ? `Keeps its ${booking.allDay ? "all-day" : formatDurationLong(currentMinutes)} window.`
                        : durationChanges && newEnd
                          ? `Now ${formatDurationLong(newMinutes)}, so it finishes at ${formatInTz(newEnd, timezone, { hour: "2-digit", minute: "2-digit" })}${newMinutes > currentMinutes ? " — the extra time must be free in the diary" : ""}.`
                          : `Still ${formatDurationLong(currentMinutes)}.`}
                    </p>
                  ) : null}
                </>
              )}
            </div>

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
                    <Select value={staffId} onValueChange={setStaffId} disabled={!isIndividual}>
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
                    {staffId !== booking.staffId ? (
                      <p className="text-xs text-muted-foreground">
                        {staffName(staffId)} must be free for the whole job and able to do{" "}
                        {picked.length > 1 ? "every service on it" : "this service"}.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {credit ? null : (
              <div className="grid gap-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="edit-booking-price">Price (£)</Label>
                  {priceOverridden ? (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setPriceInput(null);
                        setDiscount(null);
                      }}
                    >
                      List {formatMoney(rolledTotalMinor, currency)} · reset
                    </button>
                  ) : null}
                </div>
                <Input
                  id="edit-booking-price"
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
                  aria-invalid={priceInvalid || priceBelowPaid}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="edit-booking-discount" className="text-xs text-muted-foreground">
                    Discount
                  </Label>
                  <Input
                    id="edit-booking-discount"
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
                      setDiscount({ mode: mode as Discount["mode"], value: discount?.value ?? "" });
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
                      {discountLabel(discount!, (m) => formatMoney(m, currency))} · −
                      {formatMoney(discountMinor, currency)}
                    </span>
                  ) : null}
                </div>
                {priceInvalid ? (
                  <p className="text-xs text-destructive">
                    {discountInvalid
                      ? discount!.mode === "percent"
                        ? "Enter a percentage between 0 and 100."
                        : `Enter an amount up to ${formatMoney(rolledTotalMinor, currency)}.`
                      : additionalTotalMinor > 0
                        ? `Enter at least ${formatMoney(additionalTotalMinor, currency)} — the additional services keep their list prices.`
                        : "Enter an amount, or reset to the list price."}
                  </p>
                ) : priceBelowPaid ? (
                  <p className="text-xs text-destructive">
                    {formatMoney(paidMinor, currency)} has already been paid. Refund the difference
                    first, then lower the price.
                  </p>
                ) : paidMinor > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(paidMinor, currency)} paid so far —{" "}
                    {formatMoney(Math.max(0, effectiveTotalMinor - paidMinor), currency)} would be
                    outstanding.
                  </p>
                ) : effectiveTotalMinor !== rolledTotalMinor ? (
                  <p className="text-xs text-muted-foreground">
                    Adjusted from the {formatMoney(rolledTotalMinor, currency)} list price.
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Payment method</Label>
              {paymentEditable ? (
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as Booking["paymentMethod"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pay_later">
                      Pay after the job
                      {booking.depositMinor != null && booking.depositMinor < effectiveTotalMinor
                        ? ` — ${formatMoney(booking.depositMinor, currency)} deposit now`
                        : " — confirmation only"}
                    </SelectItem>
                    <SelectItem value="none">Request payment up front</SelectItem>
                    {tenant.configuration?.bankTransfer?.enabled === true ||
                    booking.paymentMethod === "bank_transfer" ? (
                      <SelectItem value="bank_transfer" disabled={effectiveTotalMinor <= 0}>
                        Bank transfer
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {sentence(paymentMethodLabel(booking.paymentMethod))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {credit
                        ? "Package credit can't be swapped for another way of paying."
                        : "Can be changed once the booking is confirmed."}
                    </p>
                  </div>
                </div>
              )}
              {paymentEditable && paymentMethod !== booking.paymentMethod ? (
                <p className="text-xs text-muted-foreground">
                  {paymentMethod === "pay_later"
                    ? booking.depositMinor != null && booking.depositMinor < effectiveTotalMinor
                      ? `The ${formatMoney(booking.depositMinor, currency)} deposit still secures the date; the balance is taken when the job is done.`
                      : "No payment is asked for up front; take it when the job is done."
                    : paymentMethod === "none"
                      ? "The next message to the client is a payment request for the balance."
                      : "The client is asked to pay by bank transfer using your account details."}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-booking-notes">Internal notes</Label>
              <Textarea
                id="edit-booking-notes"
                placeholder="Visible to staff only"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <label
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-sm",
                notify && notifyChannels.length === 0 ? "border-destructive/40" : undefined,
              )}
            >
              <Checkbox
                checked={notify}
                onCheckedChange={(checked) => setNotifyChoice(checked === true)}
                aria-label="Send the client the updated details"
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="font-medium">Send the client the updated details</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{notifyHint}</span>
              </span>
            </label>

            {dirty ? (
              <div className="rounded-lg bg-secondary/60 p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Changes
                </p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {changes.map((c) => (
                    <li key={c.label} className="flex flex-wrap gap-x-1.5">
                      <span className="text-muted-foreground">{c.label}:</span>
                      <span className="line-through decoration-muted-foreground/60">{c.from}</span>
                      <span aria-hidden>→</span>
                      <span className="font-medium">{c.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            // Looks disabled while something is missing but stays clickable, so
            // the click can explain what's left rather than doing nothing.
            disabled={submitting || catalogueLoading}
            aria-disabled={submitting || blocked}
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
