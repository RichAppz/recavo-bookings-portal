import { CalendarPlus, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant/tenant-context";
import { ukDateLong } from "@/lib/format";

/**
 * "Booking or event?" — the fork after clicking an empty calendar slot (RECA-531).
 * A booking is customer work; an event is the staff member's own time (dentist,
 * school run) that just needs the slot kept free.
 */
export function AddToCalendarChooser({
  open,
  onOpenChange,
  date,
  time,
  onBooking,
  onEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO date (YYYY-MM-DD) the click landed on, for the heading. */
  date?: string;
  /** HH:MM when the click landed on a specific hour. */
  time?: string;
  onBooking: () => void;
  onEvent: () => void;
}) {
  const tenant = useTenant();
  const booking = tenant.terminology.booking || "Booking";
  const when = date ? `${ukDateLong(date)}${time ? ` at ${time}` : ""}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What would you like to add?</DialogTitle>
          <DialogDescription>
            {when ? `${when}. ` : ""}A {booking.toLowerCase()} is customer work; an event keeps the
            time free for you.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onBooking}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarPlus className="size-4" />
            </span>
            <span className="font-semibold">{booking}</span>
            <span className="text-xs text-muted-foreground">Book a client in for a service.</span>
          </button>
          <button
            type="button"
            onClick={onEvent}
            className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-foreground/40 hover:bg-secondary"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-[#64748B] text-white">
              <Clock className="size-4" />
            </span>
            <span className="font-semibold">Event</span>
            <span className="text-xs text-muted-foreground">
              Block out your own time — dentist, school run, admin.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
