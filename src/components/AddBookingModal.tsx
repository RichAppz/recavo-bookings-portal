import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, MapPin, Plus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useBookingAction,
  useCreateBooking,
  useCreateBookingHold,
  useCustomerLinkedRecords,
  useCustomers,
  useLinkedRecordDefinition,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { emptySlotsMessage } from "@/lib/availability-windows";
import { formatDuration, formatInTz, formatMoney, isoDate } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

function SetupGate({
  icon,
  title,
  description,
  onNavigate,
  link,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onNavigate: () => void;
  link: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-4" onClick={onNavigate}>
        {link}
      </div>
    </div>
  );
}

export function AddBookingModal({
  open,
  onOpenChange,
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
}) {
  const tenant = useTenant();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState<string>("none");
  const [staffId, setStaffId] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [slotKey, setSlotKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"none" | "credit" | "bank_transfer">("none");
  const [linkedRecordId, setLinkedRecordId] = useState("none");
  const [mode, setMode] = useState<"create" | "hold">("create");
  const [notes, setNotes] = useState("");
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
  const createHold = useCreateBookingHold();
  const confirmAction = useBookingAction("confirm");
  // Vehicle (or other linked record) on the job — RECA-90. Only offered when the
  // business has a record schema; required when the service or definition says so.
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const customerRecords = useCustomerLinkedRecords(customerId || undefined);

  const serviceList = services.data ?? [];
  const locationList = locations.data ?? [];
  const customerList = customers.data?.items ?? [];
  const catalogueLoading = services.isLoading || locations.isLoading || customers.isLoading;
  const noServices = services.isSuccess && serviceList.length === 0;
  const noLocations = locations.isSuccess && locationList.length === 0;
  const noClients = customers.isSuccess && customerList.length === 0;
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
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = useAvailability({
    serviceId: serviceId || undefined,
    locationId: locationId || undefined,
    variantId: variantId !== "none" ? variantId : undefined,
    staffId: staffId !== "all" ? staffId : undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: open,
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

  const handleConflict = () => {
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
    setMode("create");
    setNotes("");
    setAdditional([]);
    setBankResult(null);
  };

  const submit = async () => {
    if (!customerId || !service || !locationId || !selectedSlot) {
      toast.error("Choose a client, service, location and time slot");
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
      staffId: selectedSlot.staffId,
      start: selectedSlot.start,
      leadCustomerId: customerId,
      ...(linkedRecordId !== "none" ? { linkedRecordId } : {}),
      paymentMethod,
      notesInternal: notes || null,
      source: "staff_console",
      // Include slotToken when present so backends that accept it can bind the quote.
      ...(selectedSlot.slotToken ? { slotToken: selectedSlot.slotToken } : {}),
    };

    setSubmitting(true);
    try {
      // Holds reject bank_transfer — the method is chosen at final booking only.
      if (mode === "hold" && paymentMethod !== "bank_transfer") {
        const held = await createHold.mutateAsync(body);
        await confirmAction.mutateAsync({
          bookingId: held.id,
          ifMatch: held.version,
        });
        toast.success("Slot held and booking confirmed");
      } else {
        const { bankTransfer } = await createBooking.mutateAsync(body);
        if (bankTransfer) {
          // Keep the dialog open on the details so staff can read them out.
          setBankResult(bankTransfer);
          toast.success("Booking reserved — awaiting bank transfer");
          return;
        }
        toast.success("Booking created");
      }
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
                : "Search availability, pick a quote slot, then create directly or hold then confirm."}
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
            onNavigate={() => onOpenChange(false)}
            link={
              <Button asChild>
                <Link to="/services" search={{ create: true }}>
                  <Plus className="size-4" />
                  Create {serviceNoun}
                </Link>
              </Button>
            }
          />
        ) : noLocations ? (
          <SetupGate
            icon={<MapPin className="size-5" />}
            title="Add a location first"
            description="Pick where this booking happens — your premises, a mobile visit, or a service area."
            onNavigate={() => onOpenChange(false)}
            link={
              <Button asChild>
                <Link to="/locations">
                  <Plus className="size-4" />
                  Add location
                </Link>
              </Button>
            }
          />
        ) : noClients ? (
          <SetupGate
            icon={<UserRound className="size-5" />}
            title="Add a client first"
            description="Every booking needs a client on the books."
            onNavigate={() => onOpenChange(false)}
            link={
              <Button asChild>
                <Link to="/clients">
                  <Plus className="size-4" />
                  Add client
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={customerId}
                onValueChange={(v) => {
                  setCustomerId(v);
                  // A record belongs to one client, so it can't survive a client change.
                  setLinkedRecordId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {customerList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {customerDisplayName(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasLinkedRecords && customerId ? (
              <div className="grid gap-2">
                <Label>
                  {recordTerm}
                  {recordRequired ? <span className="text-destructive"> *</span> : null}
                </Label>
                {activeRecords.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    This client has no {recordTermLower} on record.{" "}
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: customerId }}
                      onClick={() => onOpenChange(false)}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Add one from their profile
                    </Link>
                    {recordRequired ? " before booking." : "."}
                  </p>
                ) : (
                  <Select value={linkedRecordId} onValueChange={setLinkedRecordId}>
                    <SelectTrigger>
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
                )}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Service</Label>
                <Select
                  value={serviceId}
                  onValueChange={(v) => {
                    setServiceId(v);
                    setVariantId("none");
                    setSlotKey(null);
                    setAdditional([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Variant</Label>
                <Select
                  value={variantId}
                  onValueChange={(v) => {
                    setVariantId(v);
                    setSlotKey(null);
                  }}
                  disabled={!service || service.variants.length === 0}
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
                    <SelectItem value="all">Any {staffLower}</SelectItem>
                    {(staff.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm outline-none focus:border-ring"
                />
              </div>
              <div className="grid gap-2">
                <Label>Flow</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Create confirmed</SelectItem>
                    <SelectItem value="hold" disabled={paymentMethod === "bank_transfer"}>
                      Hold then confirm
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  <Select
                    value=""
                    onValueChange={(v) =>
                      setAdditional((prev) => [...prev, { serviceId: v, variantId: null }])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add another service" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            <div className="grid gap-2">
              <Label>Available times</Label>
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
                  {emptySlotsMessage(service?.availabilityWindows, date)}
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

            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  const next = v as typeof paymentMethod;
                  if (next === "credit") setAdditional([]);
                  // Holds reject bank_transfer, so the flow falls back to direct create.
                  if (next === "bank_transfer") setMode("create");
                  setPaymentMethod(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    Take payment separately
                    {service ? ` — ${formatMoney(rolledTotalMinor, service.currency)}` : ""}
                  </SelectItem>
                  <SelectItem value="credit" disabled={additional.length > 0}>
                    Use package credit
                  </SelectItem>
                  {bankTransferEnabled ? (
                    <SelectItem value="bank_transfer" disabled={rolledTotalMinor <= 0}>
                      Bank transfer — awaits payment
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              {paymentMethod === "bank_transfer" ? (
                <p className="text-xs text-muted-foreground">
                  The booking waits as “awaiting payment”. You'll get the account details and
                  reference to read out, and the customer is emailed them too.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="booking-notes">Internal notes</Label>
              <Textarea
                id="booking-notes"
                placeholder="Visible to staff only"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
              <Button onClick={submit} disabled={submitting || !selectedSlot}>
                {submitting
                  ? mode === "hold"
                    ? "Holding…"
                    : "Creating…"
                  : mode === "hold"
                    ? "Hold & confirm"
                    : "Create booking"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
