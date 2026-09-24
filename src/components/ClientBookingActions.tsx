import { useEffect, useMemo, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
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
import { ApiError } from "@/lib/api";
import {
  useCancelPortalBooking,
  usePublicAvailability,
  useReschedulePortalBooking,
} from "@/lib/api/hooks";
import type { AvailabilitySlot, Booking } from "@/lib/api/types";
import {
  addCalendarDays,
  bookingAdditionalServiceIds,
  canClientCancelBooking,
  canClientMoveBooking,
  clientCancelWindowHours,
  isWithinClientCancelWindow,
} from "@/lib/client-booking";
import { formatInTz, isoDateInTz, zonedDateTimeToIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_CHIPS = 8;

export function ClientBookingActions({
  booking,
  businessId,
}: {
  booking: Booking;
  businessId: string;
}) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const canMove = canClientMoveBooking(booking);
  const canCancel = canClientCancelBooking(booking);
  if (!canMove && !canCancel) return null;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {canMove ? (
          <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock className="size-4" /> Move
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
            <X className="size-4" /> Cancel
          </Button>
        ) : null}
      </div>
      {canMove ? (
        <ClientRescheduleDialog
          booking={booking}
          businessId={businessId}
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
        />
      ) : null}
      {canCancel ? (
        <ClientCancelDialog
          booking={booking}
          businessId={businessId}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
        />
      ) : null}
    </>
  );
}

function ClientRescheduleDialog({
  booking,
  businessId,
  open,
  onOpenChange,
}: {
  booking: Booking;
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const timezone = booking.timezone;
  const today = isoDateInTz(new Date().toISOString(), timezone);
  const [date, setDate] = useState(today);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const move = useReschedulePortalBooking(businessId);

  useEffect(() => {
    if (open) {
      setDate(isoDateInTz(booking.start, timezone));
      setSlotStart(null);
    }
  }, [open, booking.id, booking.start, timezone]);

  const dayStartIso = zonedDateTimeToIso(date, "00:00", timezone);
  const dayStart = dayStartIso ? new Date(dayStartIso) : new Date(NaN);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const extras = bookingAdditionalServiceIds(booking);

  const availability = usePublicAvailability(businessId, {
    serviceId: booking.serviceSnapshot.serviceId,
    locationId: booking.locationId,
    from: Number.isNaN(dayStart.getTime()) ? undefined : dayStart.toISOString(),
    to: Number.isNaN(dayStart.getTime()) ? undefined : dayEnd.toISOString(),
    additionalServiceIds: extras,
    enabled: open && !Number.isNaN(dayStart.getTime()),
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );
  const selected: AvailabilitySlot | null = slots.find((s) => s.start === slotStart) ?? null;
  const chips = Array.from({ length: DAY_CHIPS }, (_, i) => addCalendarDays(today, i));

  const submit = () => {
    if (!selected) {
      toast.error("Choose a new time");
      return;
    }
    move.mutate(
      { bookingId: booking.id, slotToken: selected.slotToken },
      {
        onSuccess: (next) => {
          toast.success("Booking moved", {
            description: formatInTz(next.start, next.timezone, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            toast.error("That time was just taken — pick another.");
            setSlotStart(null);
            void availability.refetch();
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (move.isPending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {booking.serviceSnapshot.name}</DialogTitle>
          <DialogDescription>
            Pick another time. This stays the same session
            {booking.paymentMethod === "credit" ? " — your credit stays on it." : "."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="client-move-date">Date</Label>
            <Input
              id="client-move-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlotStart(null);
              }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {chips.map((d) => {
              const selectedDay = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setSlotStart(null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center text-xs",
                    selectedDay
                      ? "border-primary bg-primary-soft text-primary"
                      : "hover:bg-secondary",
                  )}
                >
                  <span className="text-muted-foreground">{formatChipWeekday(d, timezone)}</span>
                  <span className="font-semibold tabular-nums">{formatChipDay(d, timezone)}</span>
                </button>
              );
            })}
          </div>

          {availability.isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-primary/10" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No times free on this day. Try another.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => {
                const on = s.start === selected?.start && s.staffId === selected?.staffId;
                return (
                  <button
                    key={`${s.start}-${s.staffId}`}
                    type="button"
                    onClick={() => setSlotStart(s.start)}
                    className={cn(
                      "rounded-xl border py-2 text-sm tabular-nums",
                      on ? "border-primary bg-primary-soft text-primary" : "hover:bg-secondary",
                    )}
                  >
                    {formatInTz(s.start, s.displayTimezone, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Keep this time
          </Button>
          <Button disabled={!selected || move.isPending} onClick={submit}>
            {move.isPending ? "Moving…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientCancelDialog({
  booking,
  businessId,
  open,
  onOpenChange,
}: {
  booking: Booking;
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelPortalBooking(businessId);
  const hours = clientCancelWindowHours(booking);
  const timely = isWithinClientCancelWindow(booking);
  const credit = booking.paymentMethod === "credit";

  const submit = () => {
    cancel.mutate(
      { bookingId: booking.id },
      {
        onSuccess: (next) => {
          const returned = credit && (next.cancellation?.timely ?? timely);
          toast.success(returned ? "Cancelled — your credit is back" : "Booking cancelled", {
            description: returned
              ? "You can book another session with it."
              : credit
                ? "This was inside the late-cancel window, so the credit stays used."
                : undefined,
          });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (cancel.isPending ? undefined : onOpenChange(next))}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {hours > 0
              ? `The studio asks for ${hours} hours’ notice.`
              : "You can cancel this booking."}{" "}
            {credit
              ? timely
                ? "Cancel now and the package credit comes back to you."
                : "Cancel now and the package credit stays used — there isn’t enough notice left."
              : "The studio will be told."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            disabled={cancel.isPending}
            onClick={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel booking"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatChipWeekday(date: string, timeZone: string): string {
  const iso = zonedDateTimeToIso(date, "12:00", timeZone);
  return iso ? formatInTz(iso, timeZone, { weekday: "short" }) : date;
}

function formatChipDay(date: string, timeZone: string): string {
  const iso = zonedDateTimeToIso(date, "12:00", timeZone);
  return iso ? formatInTz(iso, timeZone, { day: "numeric" }) : date.slice(8);
}
