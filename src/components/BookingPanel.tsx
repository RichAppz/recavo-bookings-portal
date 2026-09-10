import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Landmark,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { BookingInvoices } from "@/components/BookingInvoices";
import { TableGhost } from "@/components/ghost";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAvailability,
  useBooking,
  useBookingAction,
  useBusinessId,
  useBookingHistory,
  useBookingPayments,
  useCustomer,
  useLinkedRecord,
  useLocationsList,
  useMarkBankTransferReceived,
  useRecordBookingPayment,
  useResendBookingMessage,
  useSendPaymentReminder,
  useServices,
  useStaffList,
  stripeCheckoutFrom,
  stripeCheckoutUnavailableMessage,
  useTakeBookingPayment,
  useSyncBookingPayment,
  type PublicBookingPayment,
  type RecordPaymentMethod,
  type ResendChannel,
} from "@/lib/api/hooks";
import { ApiError, queryKeys, toastApiError } from "@/lib/api";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import {
  customerDisplayName,
  type Booking,
  type BookingHistoryEntry,
  type Staff,
} from "@/lib/api/types";
import {
  bookingNeedsPayment,
  bookingSettlement,
  isSettledPaymentState,
} from "@/lib/booking-payment";
import { emptySlotsMessage } from "@/lib/availability-windows";
import {
  formatBookingWhen,
  formatDurationLong,
  localDateTimeToIso,
  formatInTz,
  formatMoney,
  isoDate,
  parseMoneyToMinor,
} from "@/lib/format";
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
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBy, setCancelBy] = useState<"business" | "customer">("business");
  const [cancelReason, setCancelReason] = useState("");
  // Off when the client already knows (they rang to cancel) and a message would be noise.
  const [cancelNotify, setCancelNotify] = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [confirmReceived, setConfirmReceived] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
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
  const syncPayment = useSyncBookingPayment();
  const markReceived = useMarkBankTransferReceived();
  const recordPayment = useRecordBookingPayment();
  const resend = useResendBookingMessage();
  const paymentReminder = useSendPaymentReminder();
  const smsCredits = useSmsCreditsSummary();
  // Set when a manual text was refused for lack of credits (422) — the one place a
  // zero balance is an error rather than a silent email fallback (ADR 0020 §3.4).
  const [resendError, setResendError] = useState<string | null>(null);

  const booking = bookingQuery.data;
  const customer = useCustomer(booking?.leadCustomerId);
  // The vehicle (or other linked record) on the job — resolves even after archive (RECA-90).
  const linkedRecord = useLinkedRecord(booking?.linkedRecordId ?? undefined);
  const history = useBookingHistory(booking?.id);
  const payments = useBookingPayments(booking?.id);

  if (!bookingId) return null;

  const timezone = booking?.timezone || tenant.business?.defaultTimezone || "Europe/London";
  const trainer = staffList.data?.find((s) => s.id === booking?.staffId);
  const location = locations.data?.find((l) => l.id === booking?.locationId);
  const isFinal = booking ? FINAL_BOOKING_STATUSES.has(booking.status) : false;
  // Pay-by-bank bookings sit in awaiting_payment with no expiry until staff either
  // mark the money received or cancel (RECA-522).
  const bankPending =
    booking?.paymentMethod === "bank_transfer" && booking.status === "awaiting_payment";
  const hasSucceededPayment = (payments.data ?? []).some(
    (p) => p.state === "succeeded" || p.state === "partially_refunded" || p.state === "refunded",
  );
  // Deposit / balance view (RECA-523): outstanding = price − paid across every channel.
  const settlement = booking ? bookingSettlement(booking) : null;
  // Catalogue total the job was priced from (RECA-532): the primary's snapshot price
  // plus the additional services, which never carry an override. Differs from
  // priceMinor only when staff adjusted it at create.
  const listPriceMinor = booking
    ? booking.serviceSnapshot.priceMinor +
      (booking.lineItems ?? []).slice(1).reduce((sum, li) => sum + li.priceMinor, 0)
    : null;
  const totalMinutes = booking
    ? Math.max(
        0,
        Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60_000),
      )
    : 0;
  const canRecordPayment =
    Boolean(settlement && settlement.outstandingMinor > 0 && settlement.state !== "credit") &&
    (booking?.status === "confirmed" || booking?.status === "completed");
  // "Pay after the job": once the work is done (or any time it is still unpaid) staff
  // can nudge the client about the balance. Same conditions as recording a payment.
  const canRemindPayment = canRecordPayment && !bankPending;
  const jobOver = booking ? new Date(booking.end).getTime() <= Date.now() : false;
  // What "Resend" would send, mirroring the API's choice by status (RECA-525).
  const resendLabel: string | null = (() => {
    switch (booking?.status) {
      case "awaiting_payment":
        return bankPending ? "payment instructions" : "payment request";
      case "confirmed":
        // Pay-after-the-job bookings are confirmed plainly; the nudge is the separate
        // "Send payment reminder" action.
        return settlement &&
          settlement.state === "unpaid" &&
          booking.source !== "public" &&
          booking.paymentMethod !== "pay_later"
          ? "payment request"
          : "confirmation";
      case "cancelled_by_customer":
      case "cancelled_by_business":
      case "late_cancelled":
        return "cancellation notice";
      default:
        return null;
    }
  })();
  const customerPhone = customer.data?.phoneNormalised ?? null;
  const customerEmail = customer.data?.emailNormalised ?? null;
  const smsOptedOut = customer.data?.contactPreferences?.operationalNotifications === false;
  const smsBlocked = !customerPhone
    ? "No mobile number on file"
    : smsOptedOut
      ? "Customer has opted out of texts"
      : null;
  // What the text will cost, shown as the menu subtitle when it isn't blocked.
  const smsHint =
    smsCredits.level === "unlimited"
      ? customerPhone
      : smsCredits.level === "empty"
        ? "No text credits left"
        : smsCredits.credits
          ? `${customerPhone} · ${smsCredits.credits.balance} left`
          : customerPhone;

  const sendAgain = async (channel: ResendChannel) => {
    if (!booking) return;
    setResendError(null);
    try {
      await resend.mutateAsync({ bookingId: booking.id, channel });
      toast.success(
        `${resendLabel ? resendLabel[0]!.toUpperCase() + resendLabel.slice(1) : "Message"} sent by ${
          channel === "sms" ? "text" : "email"
        }`,
      );
    } catch (err) {
      if (channel === "sms" && err instanceof ApiError && err.status === 422) {
        setResendError(
          err.detail ?? "You have no text credits left; buy a bundle to send text messages.",
        );
        return;
      }
      toastApiError(err);
    }
  };

  const remindPayment = async () => {
    if (!booking || !settlement) return;
    try {
      const result = await paymentReminder.mutateAsync({ bookingId: booking.id });
      const by = result.channels.includes("sms") ? "email and text" : "email";
      toast.success(`Payment reminder sent by ${by}`, {
        description: `${customer.data ? customerDisplayName(customer.data) : "The client"} was asked for the ${formatMoney(result.outstandingMinor, booking.currency)} outstanding.`,
      });
    } catch (err) {
      // 409 = sent a few minutes ago; 422 = nothing outstanding / no email / send failed.
      // Both carry a plain-English detail from the API, so show that as the headline.
      if (err instanceof ApiError && (err.status === 409 || err.status === 422) && err.detail) {
        toast.error("Payment reminder not sent", { description: err.detail });
        return;
      }
      toastApiError(err);
    }
  };

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
      // Marking attended completes the job, and the outbox worker may then issue
      // an invoice a second or two later. It isn't in the attendance response, so
      // poll the job's invoices a couple of times to surface it (ADR 0019 §7).
      if (action === attendanceAction && body?.attended === true) {
        for (const delay of [1500, 4000]) {
          setTimeout(() => {
            void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll(businessId) });
          }, delay);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        void bookingQuery.refetch();
      }
      toastApiError(err);
    }
  };

  const submitMarkReceived = async () => {
    if (!booking) return;
    try {
      await markReceived.mutateAsync({ bookingId: booking.id });
      toast.success(
        settlement?.depositMinor != null
          ? "Deposit received — booking confirmed"
          : "Bank transfer received — booking confirmed",
      );
      setConfirmReceived(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // Someone else confirmed (or the booking changed) since this panel loaded.
        toast.error("This booking is no longer awaiting a bank transfer", {
          description: "Refreshing its latest state.",
        });
        setConfirmReceived(false);
        void bookingQuery.refetch();
        return;
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
        body: {
          by: cancelBy,
          reason: cancelReason.trim() || null,
          ...(cancelNotify ? {} : { notifyCustomer: false }),
        },
      });
      toast.success(cancelNotify ? "Booking cancelled" : "Booking cancelled — client not messaged");
      setConfirmCancel(false);
      setCancelReason("");
      setCancelBy("business");
      setCancelNotify(true);
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) void bookingQuery.refetch();
      toastApiError(err);
    }
  };

  const handleTakePayment = async () => {
    if (!booking) return;
    try {
      try {
        const existing = await syncPayment.mutateAsync({ bookingId: booking.id });
        if (isSettledPaymentState(existing.state)) {
          toast.success("Payment received");
          void bookingQuery.refetch();
          void payments.refetch();
          return;
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          toastApiError(err);
          return;
        }
      }
      const result = await takePayment.mutateAsync({ bookingId: booking.id });
      const started = stripeCheckoutFrom({
        ...result,
        amountMinor: result.amountMinor ?? booking.priceMinor,
        currency: result.currency ?? booking.currency,
      });
      if (!started) {
        toast.error(stripeCheckoutUnavailableMessage(result));
        return;
      }
      setCheckout(started);
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
                {formatBookingWhen(booking, timezone)}
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
            <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={booking.status} />
                <StatusBadge status={booking.attendanceStatus} />
                {settlement?.state === "deposit_paid" || settlement?.state === "part_paid" ? (
                  <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                    {settlement.state === "deposit_paid" ? "Deposit paid" : "Part paid"} ·{" "}
                    {formatMoney(settlement.outstandingMinor, booking.currency)} to collect
                  </span>
                ) : settlement?.state === "paid" ? (
                  <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-foreground">
                    Paid in full
                  </span>
                ) : bookingNeedsPayment(booking, payments.data ?? []) && !bankPending ? (
                  <StatusBadge status="payment_due" />
                ) : null}
                {bankPending ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                    <Landmark className="size-3" />
                    Waiting for bank transfer
                    {booking.reference ? ` · ref ${booking.reference}` : ""}
                  </span>
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
                    <Detail
                      label={tenant.terminology.staff || "Staff"}
                      value={trainer?.displayName ?? "—"}
                    />
                    <Detail label="Location" value={location?.name ?? "—"} />
                    {booking.linkedRecordId ? (
                      <Detail
                        label={tenant.terminology.linkedRecord}
                        value={linkedRecord.data?.displayLabel ?? "…"}
                      />
                    ) : null}
                    <Detail
                      label="Payment method"
                      value={
                        booking.paymentMethod === "credit"
                          ? "Package credit"
                          : booking.paymentMethod === "bank_transfer"
                            ? "Bank transfer"
                            : "Card / other"
                      }
                    />
                    <Detail
                      label="Amount"
                      value={formatMoney(booking.priceMinor, booking.currency)}
                      hint={
                        listPriceMinor !== null && listPriceMinor !== booking.priceMinor
                          ? `Adjusted from ${formatMoney(listPriceMinor, booking.currency)}`
                          : undefined
                      }
                    />
                    {settlement && settlement.depositMinor != null ? (
                      <Detail
                        label="Deposit"
                        value={formatMoney(settlement.depositMinor, booking.currency)}
                      />
                    ) : null}
                    {settlement && settlement.state !== "credit" && settlement.state !== "free" ? (
                      <Detail
                        label="Outstanding"
                        value={
                          settlement.outstandingMinor > 0
                            ? formatMoney(settlement.outstandingMinor, booking.currency)
                            : "Paid in full"
                        }
                      />
                    ) : null}
                    <Detail
                      label="Duration"
                      value={
                        booking.allDay
                          ? `All day · ${formatDurationLong(totalMinutes)}`
                          : formatDurationLong(totalMinutes)
                      }
                    />
                    <Detail label="Source" value={booking.source} />
                  </dl>

                  {(booking.lineItems?.length ?? 0) > 1 ? (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Services on this job
                        </p>
                        <ul className="divide-y rounded-xl border">
                          {booking.lineItems.map((li) => (
                            <li
                              key={`${li.serviceId}-${li.position}`}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span className="min-w-0">
                                {li.name}
                                {li.variantName ? (
                                  <span className="text-muted-foreground"> · {li.variantName}</span>
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  · {li.durationMinutes} min
                                </span>
                              </span>
                              <span className="tabular-nums">
                                {formatMoney(li.priceMinor, li.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : null}

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
                  ) : settlement && settlement.state === "paid" ? (
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">
                        Paid in full — {formatMoney(settlement.paidMinor, booking.currency)}{" "}
                        received.
                      </p>
                    </div>
                  ) : bankPending && settlement ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">
                        Waiting for a bank transfer of{" "}
                        {formatMoney(settlement.dueNowMinor, booking.currency)}
                        {settlement.depositMinor != null ? " (deposit)" : ""}
                        {booking.reference ? `, reference ${booking.reference}` : ""}. Check your
                        account, then mark it received.
                        {settlement.depositMinor != null
                          ? ` The remaining ${formatMoney(settlement.priceMinor - settlement.depositMinor, booking.currency)} is collected later.`
                          : ""}
                      </p>
                      {bankPending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={markReceived.isPending}
                          onClick={() => setConfirmReceived(true)}
                        >
                          <Landmark className="size-4" />
                          Mark received
                        </Button>
                      ) : null}
                    </div>
                  ) : settlement ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">
                        {settlement.state === "deposit_paid"
                          ? `Deposit of ${formatMoney(settlement.depositMinor ?? 0, booking.currency)} received — ${formatMoney(settlement.outstandingMinor, booking.currency)} balance to collect.`
                          : settlement.state === "part_paid"
                            ? `${formatMoney(settlement.paidMinor, booking.currency)} received so far — ${formatMoney(settlement.outstandingMinor, booking.currency)} still to collect.`
                            : hasSucceededPayment
                              ? "Payment received for this booking."
                              : `Payment of ${formatMoney(settlement.outstandingMinor, booking.currency)} is due.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            takePayment.isPending ||
                            settlement.outstandingMinor <= 0 ||
                            (hasSucceededPayment && settlement.depositMinor == null)
                          }
                          onClick={handleTakePayment}
                        >
                          <CreditCard className="size-4" />
                          {takePayment.isPending ? "Starting…" : "Take card payment"}
                        </Button>
                        {canRecordPayment ? (
                          <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)}>
                            <Landmark className="size-4" />
                            Record payment
                          </Button>
                        ) : null}
                        {canRemindPayment ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={paymentReminder.isPending}
                            onClick={() => void remindPayment()}
                          >
                            <BellRing className="size-4" />
                            {paymentReminder.isPending ? "Sending…" : "Send payment reminder"}
                          </Button>
                        ) : null}
                      </div>
                      {canRemindPayment ? (
                        <p className="text-xs text-muted-foreground">
                          The reminder emails {customerEmail ?? "the client"} the{" "}
                          {formatMoney(settlement.outstandingMinor, booking.currency)} outstanding
                          and how to pay
                          {customerPhone && !smsOptedOut ? ", and texts them too" : ""}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

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

                  <Separator />
                  <BookingInvoices
                    booking={booking}
                    customerEmail={customerEmail}
                    onNavigate={onClose}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t p-4">
              {bankPending ? (
                <Button
                  className="col-span-2"
                  disabled={markReceived.isPending}
                  onClick={() => setConfirmReceived(true)}
                >
                  <Landmark className="size-4" /> Mark bank transfer received
                </Button>
              ) : booking.status === "awaiting_payment" ||
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
              {canRecordPayment && !bankPending ? (
                <Button
                  variant="outline"
                  className="col-span-2"
                  onClick={() => setRecordOpen(true)}
                >
                  <Landmark className="size-4" /> Record payment ·{" "}
                  {formatMoney(settlement!.outstandingMinor, booking.currency)} outstanding
                </Button>
              ) : null}
              {canRemindPayment ? (
                <Button
                  variant="outline"
                  className="col-span-2"
                  disabled={paymentReminder.isPending}
                  onClick={() => void remindPayment()}
                >
                  <BellRing className="size-4" />
                  {paymentReminder.isPending
                    ? "Sending…"
                    : jobOver
                      ? "Send payment reminder"
                      : "Send payment reminder (job not yet done)"}
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
              {resendLabel ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="col-span-2" disabled={resend.isPending}>
                      <Send className="size-4" />
                      {resend.isPending ? "Sending…" : `Resend ${resendLabel}`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Send the {resendLabel} again to{" "}
                      {customer.data ? customerDisplayName(customer.data) : "the customer"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!customerEmail}
                      onSelect={() => void sendAgain("email")}
                    >
                      <Mail className="size-4" />
                      <span className="flex-1">Email</span>
                      <span className="max-w-[9rem] truncate text-xs text-muted-foreground">
                        {customerEmail ?? "No email on file"}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={Boolean(smsBlocked)}
                      onSelect={() => void sendAgain("sms")}
                    >
                      <Smartphone className="size-4" />
                      <span className="flex-1">Text message</span>
                      <span className="max-w-[9rem] truncate text-xs text-muted-foreground">
                        {smsBlocked ?? smsHint}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {resendError ? (
                <p className="col-span-2 text-xs text-destructive">
                  {resendError}{" "}
                  <Link
                    to="/billing/sms-credits"
                    onClick={onClose}
                    className="font-medium underline underline-offset-2"
                  >
                    Buy texts
                  </Link>
                </p>
              ) : null}
              <Button variant="outline" asChild>
                <Link to="/messages" onClick={onClose}>
                  <MessageSquare className="size-4" /> Message
                </Link>
              </Button>
              {/* On a phone, hand off to the device's own Messages app. Hidden where
                  there is a mouse (no SMS app to open); the number is E.164 so the
                  sms: link works on iOS and Android alike. */}
              {customerPhone ? (
                <Button
                  variant="outline"
                  asChild
                  className="hidden [@media(hover:none)]:inline-flex"
                >
                  <a href={`sms:${customerPhone}`}>
                    <Smartphone className="size-4" /> Text
                  </a>
                </Button>
              ) : null}
              <Button
                variant="destructive"
                disabled={isFinal}
                onClick={() => setConfirmCancel(true)}
                className={cn(customerPhone && "[@media(hover:none)]:col-span-2")}
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
            setCancelNotify(true);
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
                : cancelNotify
                  ? "The client will be notified."
                  : "The client will not be messaged."}
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
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={cancelNotify}
                onCheckedChange={(v) => setCancelNotify(v === true)}
                className="mt-0.5"
              />
              <span>
                Send the client a cancellation message
                <span className="block text-xs text-muted-foreground">
                  Untick if they already know — reminders are removed either way.
                </span>
              </span>
            </label>
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

      <AlertDialog open={confirmReceived} onOpenChange={setConfirmReceived}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark the bank transfer as received?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm you've seen{" "}
              {booking && settlement
                ? formatMoney(settlement.dueNowMinor, booking.currency)
                : "the payment"}
              {settlement?.depositMinor != null ? " (the deposit)" : ""}
              {booking?.reference ? ` with reference ${booking.reference}` : ""} arrive in your
              account. The booking is confirmed straight away and the client is emailed.
              {booking && settlement?.depositMinor != null
                ? ` The remaining ${formatMoney(settlement.priceMinor - settlement.depositMinor, booking.currency)} stays outstanding until you record it.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={markReceived.isPending}
              onClick={(e) => {
                e.preventDefault();
                void submitMarkReceived();
              }}
            >
              {markReceived.isPending ? "Confirming…" : "Money received"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {booking && settlement ? (
        <RecordPaymentDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          bookingId={booking.id}
          currency={booking.currency}
          outstandingMinor={settlement.outstandingMinor}
          pending={recordPayment.isPending}
          onSubmit={async (amountMinor, method) => {
            try {
              await recordPayment.mutateAsync({ bookingId: booking.id, amountMinor, method });
              toast.success(
                amountMinor >= settlement.outstandingMinor
                  ? "Payment recorded — paid in full"
                  : `Recorded ${formatMoney(amountMinor, booking.currency)}`,
              );
              setRecordOpen(false);
            } catch (err) {
              if (err instanceof ApiError && err.status === 422) {
                toast.error("Nothing left to record on this booking", {
                  description: "Refreshing its latest state.",
                });
                setRecordOpen(false);
                void bookingQuery.refetch();
                return;
              }
              toastApiError(err);
            }
          }}
        />
      ) : null}

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
          if (!booking) return;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
              const pulled = await syncPayment.mutateAsync({ bookingId: booking.id });
              if (isSettledPaymentState(pulled.state)) {
                setCheckout(null);
                toast.success("Payment received");
                return;
              }
            } catch (err) {
              if (!(err instanceof ApiError) || err.status !== 404) {
                toastApiError(err);
                return;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 750));
          }
          setCheckout(null);
          toast.error(
            "Your payment went through, but it hasn't shown up yet. Refresh in a moment.",
          );
        }}
        onOpenChange={(open) => {
          if (!open) setCheckout(null);
        }}
      />
    </>
  );
}

function Detail({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  /** Small secondary line, e.g. the catalogue price a total was adjusted from. */
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
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

const RECORD_METHODS: { value: RecordPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card (taken elsewhere)" },
  { value: "other", label: "Other" },
];

/**
 * Staff log money received outside the platform — the balance after a deposit,
 * or a partial payment. Defaults to settling the full outstanding amount.
 */
function RecordPaymentDialog({
  open,
  onOpenChange,
  bookingId,
  currency,
  outstandingMinor,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currency: string;
  outstandingMinor: number;
  pending: boolean;
  onSubmit: (amountMinor: number, method: RecordPaymentMethod) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(outstandingMinor / 100));
  const [method, setMethod] = useState<RecordPaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(outstandingMinor / 100));
      setMethod("cash");
      setError(null);
    }
  }, [open, bookingId, outstandingMinor]);

  const submit = async () => {
    let minor: number;
    try {
      minor = parseMoneyToMinor(amount);
    } catch {
      setError("Enter a valid amount");
      return;
    }
    if (minor <= 0) {
      setError("Enter an amount above zero");
      return;
    }
    if (minor > outstandingMinor) {
      setError(`That's more than the ${formatMoney(outstandingMinor, currency)} outstanding`);
      return;
    }
    setError(null);
    await onSubmit(minor, method);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Log money you've taken for this booking — cash, a bank transfer or a card taken
            elsewhere. {formatMoney(outstandingMinor, currency)} is outstanding.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="record-amount">Amount (£)</Label>
            <Input
              id="record-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {parseFloat(amount) * 100 < outstandingMinor && !error ? (
              <button
                type="button"
                className="text-left text-xs text-primary underline-offset-4 hover:underline"
                onClick={() => setAmount(String(outstandingMinor / 100))}
              >
                Settle the full {formatMoney(outstandingMinor, currency)}
              </button>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label>How was it paid?</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as RecordPaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORD_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const tenant = useTenant();
  const staffNoun = tenant.terminology.staff || "Staff member";
  const services = useServices();
  const catalogue = (services.data ?? []).find((s) => s.id === booking.serviceSnapshot.serviceId);

  // A job whose window staff set by hand (all-day, or a length that isn't the
  // catalogue's) won't appear in the slot quote, so it moves by date/time instead
  // and keeps its length (RECA-532).
  const lengthMinutes = Math.round(
    (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60_000,
  );
  const customLength =
    booking.allDay ||
    (booking.lineItems?.[0]?.durationMinutes ?? booking.serviceSnapshot.durationMinutes) !==
      booking.serviceSnapshot.durationMinutes;
  const [mode, setMode] = useState<"slot" | "custom">(customLength ? "custom" : "slot");
  const [time, setTime] = useState(() => {
    const d = new Date(booking.start);
    return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
  });

  useEffect(() => {
    if (open) {
      setStaffId(booking.staffId);
      setDate(isoDate(new Date(booking.start)));
      setSlotStart(null);
      setMode(customLength ? "custom" : "slot");
      const d = new Date(booking.start);
      setTime(`${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`);
    }
  }, [open, booking.id, booking.staffId, booking.start, customLength]);

  const customStart = booking.allDay
    ? localDateTimeToIso(date, "00:00")
    : localDateTimeToIso(date, time);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = useAvailability({
    serviceId: booking.serviceSnapshot.serviceId,
    locationId: booking.locationId,
    staffId: staffId !== "any" ? staffId : undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: open && mode === "slot",
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );
  const selectedSlot = slots.find((s) => s.start === slotStart) ?? null;
  const customStaffId = staffId !== "any" ? staffId : null;
  const canSubmit = mode === "slot" ? Boolean(selectedSlot) : Boolean(customStart && customStaffId);

  const submit = async () => {
    if (mode === "slot" && !selectedSlot) {
      toast.error("Choose a new time slot");
      return;
    }
    if (mode === "custom" && (!customStart || !customStaffId)) {
      toast.error(!customStaffId ? `Choose a ${staffNoun.toLowerCase()}` : "Check the date");
      return;
    }
    try {
      await rescheduleAction.mutateAsync({
        bookingId: booking.id,
        ifMatch: booking.version,
        body:
          mode === "slot"
            ? { start: selectedSlot!.start, staffId: selectedSlot!.staffId }
            : { start: customStart!, staffId: customStaffId! },
      });
      toast.success("Booking rescheduled");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        if (mode === "custom") {
          const who = staffOptions.find((s) => s.id === customStaffId)?.displayName;
          toast.error(`Clashes with another booking${who ? ` for ${who}` : ""}`, {
            description: "Pick a different day or time.",
          });
          return;
        }
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
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as typeof mode);
              setSlotStart(null);
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="slot" className="text-xs">
                Pick a slot
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs">
                {booking.allDay ? "Move the day" : "Set the time"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{staffNoun}</Label>
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
                  <SelectItem value="any">Any {staffNoun.toLowerCase()}</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reschedule-date">{mode === "custom" ? "New start" : "Date"}</Label>
              <div className="flex gap-2">
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
                {mode === "custom" && !booking.allDay ? (
                  <input
                    type="time"
                    aria-label="Start time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="flex h-9 w-28 shrink-0 rounded-md border border-input bg-card px-3 py-1 text-sm outline-none focus:border-ring"
                  />
                ) : null}
              </div>
            </div>
          </div>

          {mode === "custom" ? (
            <p className="text-xs text-muted-foreground">
              {booking.allDay
                ? `Stays an all-day job of ${formatDurationLong(lengthMinutes)}, starting on the new date.`
                : `Keeps its ${formatDurationLong(lengthMinutes)} length from the new start.`}
              {staffId === "any" ? ` Choose a ${staffNoun.toLowerCase()} to move it.` : ""}
            </p>
          ) : (
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
                  {emptySlotsMessage(catalogue?.availabilityWindows, date)}
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
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={rescheduleAction.isPending || !canSubmit}>
            {rescheduleAction.isPending ? "Rescheduling…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
