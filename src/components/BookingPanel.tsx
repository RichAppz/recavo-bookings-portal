import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  MessageSquare,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PersonAvatar, StatusBadge } from "@/components/ui-bits";
import { OutstandingPaymentDialog } from "@/components/OutstandingPaymentDialog";
import { TableGhost } from "@/components/ghost";
import {
  useAvailability,
  useBooking,
  useBookingAction,
  useBookingHistory,
  useBookingPayments,
  useCustomer,
  useLocationsList,
  useStaffList,
  useTakeBookingPayment,
  type PublicBookingPayment,
} from "@/lib/api/hooks";
import { ApiError, toastApiError } from "@/lib/api";
import {
  customerDisplayName,
  type Booking,
  type BookingHistoryEntry,
  type Staff,
} from "@/lib/api/types";
import { bookingNeedsPayment } from "@/lib/booking-payment";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const FINAL_BOOKING_STATUSES = new Set<string>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "completed",
  "no_show",
  "expired",
]);

export function BookingPanel({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const tenant = useTenant();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBy, setCancelBy] = useState<"business" | "customer">("business");
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [tab, setTab] = useState("details");
  const [checkout, setCheckout] = useState<PublicBookingPayment | null>(null);

  const bookingQuery = useBooking(bookingId ?? undefined);
  const staffList = useStaffList();
  const locations = useLocationsList();
  const confirmAction = useBookingAction("confirm");
  const cancelAction = useBookingAction("cancel");
  const rescheduleAction = useBookingAction("reschedule");
  const attendanceAction = useBookingAction("attendance");
  const takePayment = useTakeBookingPayment();

  const booking = bookingQuery.data;
  const customer = useCustomer(booking?.leadCustomerId);
  const history = useBookingHistory(booking?.id);
  const payments = useBookingPayments(booking?.id);

  if (!bookingId) return null;

  const timezone = booking?.timezone || tenant.business?.defaultTimezone || "Europe/London";
  const trainer = staffList.data?.find((s) => s.id === booking?.staffId);
  const location = locations.data?.find((l) => l.id === booking?.locationId);
  const isFinal = booking ? FINAL_BOOKING_STATUSES.has(booking.status) : false;
  const hasSucceededPayment = (payments.data ?? []).some(
    (p) => p.state === "succeeded" || p.state === "partially_refunded" || p.state === "refunded",
  );

  const historyEntries = [...(history.data ?? [])].sort((a, b) => {
    const ta = new Date(historyTimestamp(a) ?? 0).getTime();
    const tb = new Date(historyTimestamp(b) ?? 0).getTime();
    return tb - ta;
  });

  const windowHours = booking?.serviceSnapshot.cancellationPolicy.windowHours ?? 0;
  const cancelDeadlineIso = booking
    ? new Date(new Date(booking.start).getTime() - windowHours * 60 * 60 * 1000).toISOString()
    : null;
  const wouldBeTimely = cancelDeadlineIso
    ? Date.now() < new Date(cancelDeadlineIso).getTime()
    : true;

  const run = async (action: typeof confirmAction, body?: Record<string, unknown>) => {
    if (!booking) return;
    try {
      await action.mutateAsync({ bookingId: booking.id, ifMatch: booking.version, body });
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        void bookingQuery.refetch();
      }
      toastApiError(err);
    }
  };

  const submitCancel = async () => {
    if (!booking) return;
    try {
      await cancelAction.mutateAsync({
        bookingId: booking.id,
        ifMatch: booking.version,
        body: { by: cancelBy, reason: cancelReason.trim() || null },
      });
      toast.success("Booking cancelled");
      setConfirmCancel(false);
      setCancelReason("");
      setCancelBy("business");
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) void bookingQuery.refetch();
      toastApiError(err);
    }
  };

  const handleTakePayment = async () => {
    if (!booking) return;
    try {
      const result = await takePayment.mutateAsync({ bookingId: booking.id });
      if (!result.clientSecret || !result.connectedAccountId || !result.publishableKey) {
        toast.error("Card checkout isn't available for this business yet.");
        return;
      }
      setCheckout({
        clientSecret: result.clientSecret,
        connectedAccountId: result.connectedAccountId,
        publishableKey: result.publishableKey,
        amountMinor: result.amountMinor ?? booking.priceMinor,
        currency: result.currency ?? booking.currency,
      });
    } catch {
      // Mutation onError already surfaced the problem.
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card">
        <header className="flex items-start justify-between gap-3 border-b p-5">
          {bookingQuery.isLoading || !booking ? (
            <div className="w-full">
              <TableGhost rows={3} />
            </div>
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
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={booking.status} />
                <StatusBadge status={booking.attendanceStatus} />
                {bookingNeedsPayment(booking, payments.data ?? []) ? (
                  <StatusBadge status="payment_due" />
                ) : null}
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    History
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="flex-1">
                    Payments
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6">
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
                    <Detail
                      label="Amount"
                      value={formatMoney(booking.priceMinor, booking.currency)}
                    />
                    <Detail
                      label="Duration"
                      value={`${booking.serviceSnapshot.durationMinutes} minutes`}
                    />
                    <Detail label="Source" value={booking.source} />
                  </dl>

                  <Separator />

                  <div className="rounded-xl border bg-secondary/40 p-3 text-xs text-muted-foreground">
                    Cancellation window: {windowHours}h before start (
                    {cancelDeadlineIso
                      ? formatInTz(cancelDeadlineIso, timezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                    ).
                  </div>

                  {booking.cancellation ? (
                    <div className="rounded-xl border bg-secondary/40 p-3 text-xs">
                      <p className="font-medium text-foreground">
                        Cancelled by {booking.cancellation.cancelledBy} ·{" "}
                        {formatInTz(booking.cancellation.decidedAt, timezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {booking.cancellation.timely
                          ? "Within the cancellation window — credit returned."
                          : "Outside the cancellation window — credit not returned."}
                      </p>
                    </div>
                  ) : null}

                  {booking.notesInternal ? (
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Internal notes
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">{booking.notesInternal}</p>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="history">
                  {history.isLoading ? (
                    <TableGhost rows={4} />
                  ) : history.isError ? (
                    <p className="text-xs text-destructive">Couldn't load booking history.</p>
                  ) : historyEntries.length === 0 ? (
                    <EmptyState
                      title="No history yet"
                      description="Status changes and actions on this booking will appear here."
                    />
                  ) : (
                    <ul>
                      {historyEntries.map((entry, i) => (
                        <HistoryRow key={String(entry.id ?? i)} entry={entry} timezone={timezone} />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="space-y-4">
                  {booking.paymentMethod === "credit" ? (
                    <p className="text-xs text-muted-foreground">
                      Paid using a package credit — no card payment required.
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">
                        {hasSucceededPayment
                          ? "Payment received for this booking."
                          : `Payment of ${formatMoney(booking.priceMinor, booking.currency)} is due.`}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={takePayment.isPending || hasSucceededPayment}
                        onClick={handleTakePayment}
                      >
                        <CreditCard className="size-4" />
                        {takePayment.isPending ? "Starting…" : "Take payment"}
                      </Button>
                    </div>
                  )}

                  {payments.isLoading ? (
                    <TableGhost rows={3} />
                  ) : payments.isError ? (
                    <p className="text-xs text-destructive">Couldn't load payments.</p>
                  ) : (payments.data ?? []).length === 0 ? (
                    <EmptyState
                      title="No payments yet"
                      description="Payments taken for this booking will appear here."
                    />
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {payments.data!.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {formatMoney(p.amountMinor, p.currency)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatInTz(p.createdAt, timezone, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={p.state} />
                            {p.receiptUrl ? (
                              <a
                                href={p.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-primary underline"
                              >
                                Receipt
                              </a>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
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
              <Button
                variant="outline"
                className="col-span-2"
                disabled={isFinal}
                onClick={() => setRescheduleOpen(true)}
              >
                <CalendarClock className="size-4" /> Reschedule
              </Button>
              <Button variant="outline" asChild>
                <Link to="/messages" onClick={onClose}>
                  <MessageSquare className="size-4" /> Message
                </Link>
              </Button>
              <Button
                variant="destructive"
                disabled={isFinal}
                onClick={() => setConfirmCancel(true)}
              >
                <Ban className="size-4" /> Cancel
              </Button>
            </footer>
          </>
        )}
      </aside>

      <AlertDialog
        open={confirmCancel}
        onOpenChange={(o) => {
          setConfirmCancel(o);
          if (!o) {
            setCancelReason("");
            setCancelBy("business");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The cancellation policy allows changes up to {windowHours}h before the start time.{" "}
              {booking?.paymentMethod === "credit"
                ? wouldBeTimely
                  ? "Cancelling now is within the window — the package credit will be returned."
                  : "Cancelling now is outside the window — the package credit will not be returned."
                : "The client will be notified."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Cancelled by</Label>
              <RadioGroup
                value={cancelBy}
                onValueChange={(v) => setCancelBy(v as typeof cancelBy)}
                className="grid-flow-col justify-start gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="business" id="cancel-by-business" />
                  Business
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="customer" id="cancel-by-customer" />
                  Customer
                </label>
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cancel-reason">Reason (optional)</Label>
              <Textarea
                id="cancel-reason"
                placeholder="Visible to staff only"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelAction.isPending}
              onClick={(e) => {
                e.preventDefault();
                void submitCancel();
              }}
            >
              {cancelAction.isPending ? "Cancelling…" : "Cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {booking ? (
        <RescheduleDialog
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          booking={booking}
          timezone={timezone}
          staffOptions={staffList.data ?? []}
          rescheduleAction={rescheduleAction}
        />
      ) : null}

      <OutstandingPaymentDialog
        title="Take payment"
        payment={checkout}
        contact={{
          name: customer.data ? customerDisplayName(customer.data) : null,
          email: customer.data?.emailDisplay ?? null,
          phone: customer.data?.phoneDisplay ?? null,
        }}
        onPaid={async () => {
          setCheckout(null);
          toast.success("Payment received");
          void bookingQuery.refetch();
          void payments.refetch();
        }}
        onOpenChange={(open) => {
          if (!open) setCheckout(null);
        }}
      />
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

function historyTimestamp(entry: BookingHistoryEntry): string | undefined {
  return entry.occurredAt ?? entry.timestamp ?? entry.createdAt;
}

function humanize(value: string): string {
  const cleaned = value
    .replace(/^booking\./i, "")
    .replace(/[._]/g, " ")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : value;
}

function historyActorLabel(entry: BookingHistoryEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.actorType === "system" || entry.actorId === "system") return "System";
  if (entry.actorType) return humanize(entry.actorType);
  return "System";
}

function historyActionLabel(entry: BookingHistoryEntry): string {
  const raw = entry.action ?? entry.toStatus ?? entry.status ?? "Updated";
  return humanize(String(raw));
}

function HistoryRow({ entry, timezone }: { entry: BookingHistoryEntry; timezone: string }) {
  const ts = historyTimestamp(entry);
  const transition =
    entry.fromStatus && entry.toStatus
      ? `${humanize(entry.fromStatus)} → ${humanize(entry.toStatus)}`
      : null;
  const reason = typeof entry.reason === "string" ? entry.reason : undefined;

  return (
    <li className="flex gap-3 border-b py-3 last:border-0">
      <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{historyActionLabel(entry)}</p>
        {transition ? <p className="text-xs text-muted-foreground">{transition}</p> : null}
        {reason ? <p className="mt-1 text-xs text-muted-foreground">“{reason}”</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {historyActorLabel(entry)}
          {ts ? ` · ${formatInTz(ts, timezone, { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>
      </div>
    </li>
  );
}

function RescheduleDialog({
  open,
  onOpenChange,
  booking,
  timezone,
  staffOptions,
  rescheduleAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  timezone: string;
  staffOptions: Staff[];
  rescheduleAction: ReturnType<typeof useBookingAction>;
}) {
  const [staffId, setStaffId] = useState(booking.staffId);
  const [date, setDate] = useState(isoDate(new Date(booking.start)));
  const [slotStart, setSlotStart] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStaffId(booking.staffId);
      setDate(isoDate(new Date(booking.start)));
      setSlotStart(null);
    }
  }, [open, booking.id, booking.staffId, booking.start]);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = useAvailability({
    serviceId: booking.serviceSnapshot.serviceId,
    locationId: booking.locationId,
    staffId: staffId !== "any" ? staffId : undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: open,
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );
  const selectedSlot = slots.find((s) => s.start === slotStart) ?? null;

  const submit = async () => {
    if (!selectedSlot) {
      toast.error("Choose a new time slot");
      return;
    }
    try {
      await rescheduleAction.mutateAsync({
        bookingId: booking.id,
        ifMatch: booking.version,
        body: { start: selectedSlot.start, staffId: selectedSlot.staffId },
      });
      toast.success("Booking rescheduled");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        toast.error("That slot was just taken", {
          description: "Availability has been refreshed — pick another time.",
        });
        setSlotStart(null);
        void availability.refetch();
      } else {
        toastApiError(err);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>
            Pick a new time for {booking.reference}. The client will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
                  <SelectItem value="any">Any trainer</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reschedule-date">Date</Label>
              <input
                id="reschedule-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSlotStart(null);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm outline-none focus:border-ring"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Available times</Label>
            {availability.isLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-primary/10" />
                ))}
              </div>
            ) : availability.isError ? (
              <p className="text-xs text-destructive">Couldn't load availability.</p>
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={rescheduleAction.isPending || !selectedSlot}>
            {rescheduleAction.isPending ? "Rescheduling…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
