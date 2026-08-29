import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Layers, MapPin, Plus, UserRound } from "lucide-react";
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
import {
  useAvailability,
  useBookingAction,
  useCreateBooking,
  useCreateBookingHold,
  useCustomers,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
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
  const [paymentMethod, setPaymentMethod] = useState<"none" | "credit">("none");
  const [mode, setMode] = useState<"create" | "hold">("create");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const createBooking = useCreateBooking();
  const createHold = useCreateBookingHold();
  const confirmAction = useBookingAction("confirm");

  const serviceList = services.data ?? [];
  const locationList = locations.data ?? [];
  const customerList = customers.data?.items ?? [];
  const catalogueLoading =
    services.isLoading || locations.isLoading || customers.isLoading;
  const noServices = services.isSuccess && serviceList.length === 0;
  const noLocations = locations.isSuccess && locationList.length === 0;
  const noClients = customers.isSuccess && customerList.length === 0;
  const setupBlocked = noServices || noLocations || noClients;

  const service = serviceList.find((s) => s.id === serviceId);
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

  const handleConflict = () => {
    toast.error("That slot was just taken", {
      description: "Availability has been refreshed — pick another time.",
    });
    setSlotKey(null);
    void availability.refetch();
  };

  const reset = () => {
    setCustomerId(defaultCustomerId ?? "");
    setServiceId("");
    setVariantId("none");
    setStaffId("all");
    setLocationId("");
    setSlotKey(null);
    setPaymentMethod("none");
    setMode("create");
    setNotes("");
  };

  const submit = async () => {
    if (!customerId || !service || !locationId || !selectedSlot) {
      toast.error("Choose a client, service, location and time slot");
      return;
    }

    // Staff hold/create bodies use start + staffId from the availability quote.
    // Public booking requires `slotToken`; staff OpenAPI does not — the token is
    // still used server-side when the quote is revalidated on hold/book.
    const body = {
      serviceId: service.id,
      ...(variantId !== "none" ? { variantId } : {}),
      locationId,
      staffId: selectedSlot.staffId,
      start: selectedSlot.start,
      leadCustomerId: customerId,
      paymentMethod,
      notesInternal: notes || null,
      source: "staff_console",
      // Include slotToken when present so backends that accept it can bind the quote.
      ...(selectedSlot.slotToken ? { slotToken: selectedSlot.slotToken } : {}),
    };

    setSubmitting(true);
    try {
      if (mode === "hold") {
        const held = await createHold.mutateAsync(body);
        await confirmAction.mutateAsync({
          bookingId: held.id,
          ifMatch: held.version,
        });
        toast.success("Slot held and booking confirmed");
      } else {
        await createBooking.mutateAsync(body);
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
          <DialogTitle>Add booking</DialogTitle>
          <DialogDescription>
            {setupBlocked
              ? "Finish a quick bit of setup first — then you can take bookings."
              : "Search availability, pick a quote slot, then create directly or hold then confirm."}
          </DialogDescription>
        </DialogHeader>

        {catalogueLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Checking setup…</p>
        ) : noServices ? (
          <SetupGate
            icon={<Layers className="size-5" />}
            title="Create a service first"
            description="Bookings need something clients can book — duration, price and who can deliver it."
            onNavigate={() => onOpenChange(false)}
            link={
              <Button asChild>
                <Link to="/services" search={{ create: true }}>
                  <Plus className="size-4" />
                  Create service
                </Link>
              </Button>
            }
          />
        ) : noLocations ? (
          <SetupGate
            icon={<MapPin className="size-5" />}
            title="Add a location first"
            description="Pick where this booking happens — studio, mobile visit, or service area."
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
            <Select value={customerId} onValueChange={setCustomerId}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Service</Label>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  setVariantId("none");
                  setSlotKey(null);
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
                      {v.name} · {v.durationMinutes} min ·{" "}
                      {formatMoney(v.priceMinor ?? 0, service!.currency)}
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
              <Label>Trainer</Label>
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
                  <SelectItem value="all">Any trainer</SelectItem>
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
                  <SelectItem value="hold">Hold then confirm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Available times</Label>
            {!serviceId || !locationId ? (
              <p className="text-xs text-muted-foreground">
                Choose a service and location to see availability.
              </p>
            ) : availability.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading availability…</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No availability on this date. Try another day.
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
              onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  Take payment separately
                  {service ? ` — ${formatMoney(service.basePriceMinor, service.currency)}` : ""}
                </SelectItem>
                <SelectItem value="credit">Use package credit</SelectItem>
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}
