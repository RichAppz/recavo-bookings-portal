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
import type { BookingConflict } from "@/lib/api/errors";
import { describeConflict, overrideCopy } from "@/lib/drop-in";

/**
 * Shown when the API answered a booking or reschedule with `409 BOOKING_CONFLICT`
 * and `overridable: true`: the only things in the way are all-day jobs (for a timed
 * booking) or timed jobs (for an all-day one). Confirming re-sends the same request
 * with `dropIn: true` under a fresh Idempotency-Key; cancelling leaves the form as
 * it was so staff can pick another time instead.
 */
export function DropInConfirmDialog({
  open,
  onOpenChange,
  conflicts,
  newBookingAllDay,
  timezone,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: readonly BookingConflict[];
  /** Whether the booking being made is the all-day one (the mirror case). */
  newBookingAllDay: boolean;
  timezone: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const copy = overrideCopy(newBookingAllDay);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>
        {conflicts.length > 0 ? (
          <ul className="space-y-1 rounded-md bg-secondary/60 px-3 py-2 text-sm">
            {conflicts.map((c) => (
              <li key={`${c.kind}:${c.bookingId}`} className="truncate">
                {describeConflict(c, timezone)}
              </li>
            ))}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Pick another time</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy}>
            {busy ? "Booking…" : newBookingAllDay ? "Book anyway" : "Book as a drop-in"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
