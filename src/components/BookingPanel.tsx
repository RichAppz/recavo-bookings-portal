import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, CheckCircle2, MessageSquare, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { PersonAvatar, StatusBadge } from "@/components/ui-bits";
import {
  useBooking,
  useBookingAction,
  useCustomer,
  useLocationsList,
  useStaffList,
} from "@/lib/api/hooks";
import { toastApiError } from "@/lib/api";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export function BookingPanel({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const tenant = useTenant();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const bookingQuery = useBooking(bookingId ?? undefined);
  const staffList = useStaffList();
  const locations = useLocationsList();
  const confirmAction = useBookingAction("confirm");
  const cancelAction = useBookingAction("cancel");
  const attendanceAction = useBookingAction("attendance");

  const booking = bookingQuery.data;
  const customer = useCustomer(booking?.leadCustomerId);

  if (!bookingId) return null;

  const timezone = booking?.timezone || tenant.business?.defaultTimezone || "Europe/London";
  const trainer = staffList.data?.find((s) => s.id === booking?.staffId);
  const location = locations.data?.find((l) => l.id === booking?.locationId);

  const run = async (action: typeof confirmAction, body?: Record<string, unknown>) => {
    if (!booking) return;
    try {
      await action.mutateAsync({ bookingId: booking.id, ifMatch: booking.version, body });
    } catch (err) {
      toastApiError(err);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-float">
        <header className="flex items-start justify-between gap-3 border-b p-5">
          {bookingQuery.isLoading || !booking ? (
            <p className="text-sm text-muted-foreground">Loading booking…</p>
          ) : (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{booking.reference}</p>
              <h2 className="mt-1 text-lg font-semibold">{booking.serviceSnapshot.name}</h2>
              <p className="text-sm text-muted-foreground">
                {formatInTz(booking.start, timezone, { dateStyle: "medium", timeStyle: "short" })} –{" "}
                {formatInTz(booking.end, timezone, { timeStyle: "short" })}
              </p>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </header>

        {bookingQuery.isError ? (
          <div className="flex-1 p-5">
            <p className="text-sm text-destructive">
              {bookingQuery.error instanceof Error
                ? bookingQuery.error.message
                : "Failed to load booking"}
            </p>
          </div>
        ) : !booking ? (
          <div className="flex-1 p-5">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={booking.status} />
                <StatusBadge status={booking.attendanceStatus} />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {booking.attendees.length > 1 ? "Attendees" : "Client"}
                </p>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: booking.leadCustomerId }}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-secondary"
                >
                  <PersonAvatar
                    name={customer.data ? customerDisplayName(customer.data) : "Client"}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {customer.data ? customerDisplayName(customer.data) : "Loading…"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customer.data?.emailDisplay ?? customer.data?.phoneDisplay ?? ""}
                    </p>
                  </div>
                </Link>
                {booking.attendees.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {booking.seatCount} of {booking.attendees.length} spaces booked
                  </p>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <Detail label="Trainer" value={trainer?.displayName ?? "—"} />
                <Detail label="Location" value={location?.name ?? "—"} />
                <Detail
                  label="Payment method"
                  value={booking.paymentMethod === "credit" ? "Package credit" : "Card / other"}
                />
                <Detail label="Amount" value={formatMoney(booking.priceMinor, booking.currency)} />
                <Detail
                  label="Duration"
                  value={`${booking.serviceSnapshot.durationMinutes} minutes`}
                />
                <Detail label="Source" value={booking.source} />
              </dl>

              <Separator />

              {booking.notesInternal ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Internal notes
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{booking.notesInternal}</p>
                </div>
              ) : null}
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t p-4">
              {booking.status === "awaiting_payment" ||
              booking.status === "held" ||
              booking.status === "draft" ? (
                <Button
                  variant="outline"
                  className="col-span-2"
                  disabled={confirmAction.isPending}
                  onClick={() => run(confirmAction)}
                >
                  <CheckCircle2 className="size-4" /> Confirm booking
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={attendanceAction.isPending}
                onClick={() => run(attendanceAction, { attended: true })}
              >
                <CheckCircle2 className="size-4" /> Mark attended
              </Button>
              <Button
                variant="outline"
                disabled={attendanceAction.isPending}
                onClick={() => run(attendanceAction, { attended: false })}
              >
                <UserX className="size-4" /> No-show
              </Button>
              <Button variant="outline" asChild>
                <Link to="/messages" onClick={onClose}>
                  <MessageSquare className="size-4" /> Message
                </Link>
              </Button>
              <Button
                variant="destructive"
                disabled={
                  booking.status === "cancelled_by_business" ||
                  booking.status === "cancelled_by_customer"
                }
                onClick={() => setConfirmCancel(true)}
              >
                <Ban className="size-4" /> Cancel
              </Button>
            </footer>
          </>
        )}
      </aside>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The client will be notified and any eligible package credit returned to their balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void run(cancelAction, { by: "business" });
                setConfirmCancel(false);
              }}
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn(className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
