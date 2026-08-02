import { useMemo, useState } from "react";
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
  useCreateBooking,
  useCustomers,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { toastApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

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
  const [staffId, setStaffId] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"none" | "credit">("none");
  const [notes, setNotes] = useState("");

  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const createBooking = useCreateBooking();

  const service = services.data?.find((s) => s.id === serviceId);
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = useAvailability({
    serviceId: serviceId || undefined,
    locationId: locationId || undefined,
    staffId: staffId !== "all" ? staffId : undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: open,
  });

  const slots = useMemo(
    () => (availability.data ?? []).sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const selectedSlot = slots.find((s) => s.start === slotStart) ?? null;
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";

  const reset = () => {
    setCustomerId(defaultCustomerId ?? "");
    setServiceId("");
    setStaffId("all");
    setLocationId("");
    setSlotStart(null);
    setPaymentMethod("none");
    setNotes("");
  };

  const submit = async () => {
    if (!customerId || !service || !locationId || !selectedSlot) {
      toast.error("Choose a client, service, location and time slot");
      return;
    }
    try {
      await createBooking.mutateAsync({
        serviceId: service.id,
        locationId,
        staffId: selectedSlot.staffId,
        start: selectedSlot.start,
        leadCustomerId: customerId,
        paymentMethod,
        notesInternal: notes || null,
        source: "staff_console",
      });
      toast.success("Booking created");
      reset();
      onOpenChange(false);
    } catch (err) {
      toastApiError(err);
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
            Create a session for an existing client and take payment or use a package credit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {(customers.data?.items ?? []).map((c) => (
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
                  setSlotStart(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  {(services.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
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
                  setSlotStart(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent>
                  {(locations.data ?? []).map((l) => (
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
                  setSlotStart(null);
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
                  setSlotStart(null);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
              />
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
                {slots.map((s) => (
                  <button
                    key={`${s.start}-${s.staffId}`}
                    type="button"
                    onClick={() => setSlotStart(s.start)}
                    className={`rounded-lg border py-2 text-xs tabular-nums transition-colors ${
                      s.start === slotStart
                        ? "border-primary bg-primary-soft text-primary"
                        : "hover:bg-secondary"
                    }`}
                  >
                    {formatInTz(s.start, s.displayTimezone || timezone, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </button>
                ))}
              </div>
            )}
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createBooking.isPending}>
            {createBooking.isPending ? "Creating…" : "Create booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
