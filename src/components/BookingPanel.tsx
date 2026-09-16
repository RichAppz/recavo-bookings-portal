import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  BellRing,
  CarFront,
  Pencil,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Mail,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  Repeat,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { BookingConsumablesSection } from "@/components/BookingConsumables";
import { BookingFollowUpDetail } from "@/components/BookingFollowUpDetail";
import { EditBookingDialog } from "@/components/EditBookingDialog";
import { useBookingUpsellOffer, useDeclineUpsellOffer } from "@/lib/api/upsells";
import { BookingRemindersDrawer, type ReminderRow } from "@/components/BookingRemindersDrawer";
import { useBookingInvoices } from "@/lib/api/invoices";
import { BookingMessageHistoryRow } from "@/components/BookingMessageHistoryRow";
import { TableGhost } from "@/components/ghost";
import { useQueryClient } from "@tanstack/react-query";
import { DropInConfirmDialog } from "@/components/DropInConfirmDialog";
import {
  useAvailability,
  useBooking,
  useBookingAction,
  useBookings,
  useBusinessId,
  useBookingHistory,
  useBookingPayments,
  useCustomer,
  useDeleteBooking,
  useLinkedRecord,
  useLocationsList,
  useMarkBankTransferReceived,
  useRecordBookingPayment,
  useResendBookingMessage,
  useSendBookingReminder,
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
import type { BookingConflict } from "@/lib/api/errors";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import {
  allDayHolds,
  describeHold,
  heldAllDayNote,
  timedClashNote,
  timedJobsWithin,
} from "@/lib/drop-in";
import {
  customerDisplayName,
  type Booking,
  type BookingHistoryEntry,
  type Staff,
} from "@/lib/api/types";
import {
  balanceDueLabel,
  bookingNeedsPayment,
  bookingSettlement,
  isSettledPaymentState,
} from "@/lib/booking-payment";
import { adjustmentLabel, bookingPriceBreakdown, formatAdjustment } from "@/lib/booking-price";
import { emptySlotsMessage } from "@/lib/availability-windows";
import {
  allDayBlockDays,
  bookingJobMinutes,
  bookingWindowMinutes,
  describeAllDayBlock,
  formatAllDayDuration,
  lineItemJobMinutes,
} from "@/lib/booking-duration";
import {
  formatBookingWhen,
  formatDuration,
  formatDurationLong,
  localDateTimeToIso,
  formatInTz,
  formatMoney,
  isoDate,
  parseMoneyToMinor,
} from "@/lib/format";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { isMessageHistoryEntry } from "@/lib/message-history";
import { formatWorkingSpan } from "@/lib/working-days";
import {
  channelsLabel,
  channelsPhrase,
  lastSentFromHistory,
  lastSentLabel,
  reminderChannels,
  resendTemplateKeys,
  smsBlockedReason,
} from "@/lib/booking-reminders";
import { describeBookingChange, summariseBookingChanges } from "@/lib/booking-changes";
import { describeClientLift } from "@/lib/client-lift";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  /** Services to pre-add when Edit opens from an add-on request. */
  const [editAddServiceIds, setEditAddServiceIds] = useState<string[]>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [confirmReceived, setConfirmReceived] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  // "Deposit taken" opens the same record-payment dialog preset to the deposit
  // still owed, so confirming a deposit is one tap rather than typing the amount.
  const [recordIntent, setRecordIntent] = useState<"payment" | "deposit">("payment");
  const [tab, setTab] = useState("details");
  const [checkout, setCheckout] = useState<PublicBookingPayment | null>(null);

  const bookingQuery = useBooking(bookingId ?? undefined);
  // The add-on offer emailed after this (staff-made) booking, if any (upsells).
  const upsellOffer = useBookingUpsellOffer(bookingId ?? undefined);
  const declineUpsell = useDeclineUpsellOffer();
  const staffList = useStaffList();
  const soleStaff = useSoleStaff();
  const soleLocation = useSoleLocation();
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
  const bookingReminder = useSendBookingReminder();
  const deleteBooking = useDeleteBooking();
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
  // Same query the Payments tab uses, so this costs nothing extra.
  const invoices = useBookingInvoices(booking?.id);

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
  // Services at list, the staff discount (if any) and the total (RECA-532). The list
  // price differs from priceMinor only when staff adjusted it.
  const breakdown = booking ? bookingPriceBreakdown(booking) : null;
  const listPriceMinor = breakdown?.listPriceMinor ?? null;
  // The work itself, not the diary it blocks: an all-day booking of a 2-hour coating
  // is still a 2-hour job (the API writes the whole day onto start/end and the primary
  // line item, so read the catalogue length back from the snapshot).
  const totalMinutes = booking ? bookingJobMinutes(booking) : 0;
  const blockMinutes = booking ? bookingWindowMinutes(booking) : 0;
  const workingSpan = booking ? formatWorkingSpan(booking, timezone) : null;
  const canRecordPayment =
    Boolean(settlement && settlement.outstandingMinor > 0 && settlement.state !== "credit") &&
    (booking?.status === "confirmed" || booking?.status === "completed");
  // Deposit still owed (RECA-523): what "Deposit taken" will record.
  const depositOwedMinor =
    settlement && settlement.depositMinor != null
      ? Math.max(0, settlement.depositMinor - settlement.paidMinor)
      : 0;
  const canConfirmDeposit = canRecordPayment && !bankPending && depositOwedMinor > 0;
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
        // Pay-after-the-job bookings are confirmed plainly unless a deposit secures
        // them (then the deposit is requested); the balance nudge is the separate
        // "Send payment reminder" action either way.
        return settlement &&
          settlement.state === "unpaid" &&
          booking.source !== "public" &&
          (booking.paymentMethod !== "pay_later" || settlement.depositMinor != null)
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
  const customerName = customer.data ? customerDisplayName(customer.data) : "the client";
  const smsOptedOut = customer.data?.contactPreferences?.operationalNotifications === false;
  const contact = { email: customerEmail, phone: customerPhone, smsOptedOut };
  // Customer-side reason a text can't go (no number / opted out); null when it can.
  const smsBlocked = smsBlockedReason(contact);
  // What the text will cost, shown under "By text" when it isn't blocked.
  const smsHint =
    smsCredits.level === "unlimited"
      ? customerPhone
      : smsCredits.level === "empty"
        ? "No text credits left"
        : smsCredits.credits
          ? `${customerPhone} · ${smsCredits.credits.balance} left`
          : customerPhone;

  // Reminders drawer. Each row always shows; when one cannot go, the reason sits as
  // its sub-text, mirroring the API's 409/422s so staff see why before the tap. The
  // channels follow the API: email when there's an address, text when the client can
  // receive one — so a phone-only client is texted alone, and a row is only off for
  // contact reasons when neither channel works.
  const reminderRoute = reminderChannels(contact, smsCredits.level);
  const reminderChannelsHint = channelsLabel(reminderRoute.channels);
  const bookingStarted = booking ? new Date(booking.start).getTime() <= Date.now() : false;
  // The API only reminds confirmed / awaiting-payment bookings that have not started.
  const bookingReminderBlocked: string | null = !booking
    ? null
    : booking.status === "completed"
      ? "Job already done"
      : booking.status !== "confirmed" && booking.status !== "awaiting_payment"
        ? closedReminderReason(booking.status)
        : bookingStarted
          ? "Job already started"
          : reminderRoute.blocked;
  const paymentReminderBlocked: string | null = !booking
    ? null
    : settlement?.state === "credit"
      ? "Paid with a package credit"
      : (settlement?.outstandingMinor ?? 0) <= 0
        ? "Nothing outstanding"
        : bankPending
          ? "Awaiting bank transfer"
          : !canRemindPayment
            ? closedReminderReason(booking.status)
            : reminderRoute.blocked;

  const remindBooking = async () => {
    if (!booking) return;
    try {
      const result = await bookingReminder.mutateAsync({ bookingId: booking.id });
      const by = channelsPhrase(result.channels);
      toast.success(`Booking reminder sent by ${by}`, {
        description: `${customer.data ? customerDisplayName(customer.data) : "The client"} was reminded about ${formatBookingWhen(booking, timezone)}.`,
      });
    } catch (err) {
      // 409 = not live / already started / sent minutes ago; 422 = no email / send failed.
      if (err instanceof ApiError && (err.status === 409 || err.status === 422) && err.detail) {
        toast.error("Booking reminder not sent", { description: err.detail });
        return;
      }
      toastApiError(err);
    }
  };

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
      const by = channelsPhrase(result.channels);
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
  // Has the client ever heard about this booking? Drives the cancel dialog's default:
  // no point sending a cancellation for a job they were never told about. Until the
  // history loads, assume they were (the safer default).
  const clientWasTold = history.data
    ? history.data.some(
        (entry) =>
          isMessageHistoryEntry(entry) && (entry.status === "sent" || entry.status === "fallback"),
      )
    : true;

  // Rows of the Reminders drawer: every message staff can send about this booking, with
  // when it last went (from the History tab's message entries) and why it's off, if it is.
  const resendTitle = resendLabel
    ? `Resend ${resendLabel}`
    : booking?.status === "completed"
      ? "Resend confirmation"
      : "Resend message";
  const resendDescription: string = (() => {
    if (!booking || !settlement) return "";
    switch (resendLabel) {
      case "payment instructions":
        return `Bank transfer details for ${formatMoney(settlement.dueNowMinor, booking.currency)}`;
      case "payment request":
        return `Asks for ${formatMoney(settlement.dueNowMinor, booking.currency)} with a pay link`;
      case "confirmation":
        return `The booking confirmation for ${formatBookingWhen(booking, timezone)}`;
      case "cancellation notice":
        return "That the booking was cancelled";
      default:
        return booking.status === "completed"
          ? "Nothing to resend once the job is done"
          : `Nothing to resend while the booking is ${booking.status.replace(/_/g, " ")}`;
    }
  })();
  const reminderRows: ReminderRow[] = booking
    ? [
        {
          key: "booking",
          icon: BellRing,
          title: "Booking reminder",
          description: `That the job is coming up · ${formatBookingWhen(booking, timezone)}`,
          blocked: bookingReminderBlocked,
          meta: [
            ...(bookingReminderBlocked ? [] : [reminderChannelsHint]),
            lastSentLabel(lastSentFromHistory(history.data, ["reminder"])),
          ],
          actions: [
            {
              key: "send",
              label: "Send",
              icon: Send,
              disabled: Boolean(bookingReminderBlocked),
              pending: bookingReminder.isPending,
              onClick: () => void remindBooking(),
            },
          ],
        },
        {
          key: "payment",
          icon: CreditCard,
          title: "Payment reminder",
          description:
            settlement && settlement.outstandingMinor > 0 && settlement.state !== "credit"
              ? `${formatMoney(settlement.outstandingMinor, booking.currency)} outstanding${
                  jobOver ? "" : " · job not done yet"
                }`
              : "What's still owed and how to pay it",
          blocked: paymentReminderBlocked,
          meta: [
            ...(paymentReminderBlocked ? [] : [reminderChannelsHint]),
            lastSentLabel(lastSentFromHistory(history.data, ["payment_reminder"])),
          ],
          actions: [
            {
              key: "send",
              label: "Send",
              icon: Send,
              disabled: Boolean(paymentReminderBlocked),
              pending: paymentReminder.isPending,
              onClick: () => void remindPayment(),
            },
          ],
        },
        {
          key: "resend",
          icon: Repeat,
          title: resendTitle,
          description: resendDescription,
          blocked: !resendLabel
            ? "Nothing to resend"
            : !customerEmail && smsBlocked
              ? `${smsBlocked} · no email on file`
              : null,
          meta: [
            ...(resendLabel
              ? [
                  `Email: ${customerEmail ?? "no email on file"}`,
                  `Text: ${smsBlocked ? smsBlocked.toLowerCase() : smsHint}`,
                ]
              : []),
            lastSentLabel(
              lastSentFromHistory(history.data, resendTemplateKeys(booking.status, bankPending)),
            ),
          ],
          actions: resendLabel
            ? [
                {
                  key: "email",
                  label: "By email",
                  icon: Mail,
                  disabled: !customerEmail,
                  pending: resend.isPending && resend.variables?.channel === "email",
                  onClick: () => void sendAgain("email"),
                },
                {
                  key: "sms",
                  label: "By text",
                  icon: MessageSquareText,
                  disabled: Boolean(smsBlocked),
                  pending: resend.isPending && resend.variables?.channel === "sms",
                  onClick: () => void sendAgain("sms"),
                },
              ]
            : [],
          error: resendError ? (
            <>
              {resendError}{" "}
              <Link
                to="/billing/sms-credits"
                onClick={onClose}
                className="font-medium underline underline-offset-2"
              >
                Buy texts
              </Link>
            </>
          ) : null,
        },
      ]
    : [];

  // Attendance: the API only moves a confirmed booking to completed / no-show, and never
  // back, so the checkboxes are live on a confirmed job and locked once one is ticked.
  const attendanceMarked =
    booking?.attendanceStatus === "attended" || booking?.attendanceStatus === "no_show";
  // Detailers don't tick people in — the car either turned up or it didn't — so
  // their row is just "No-show", and it goes once the job is marked attended.
  const noShowOnly = tenant.business?.industryTemplateKey === "car_detailing";
  const showAttendance =
    (booking?.status === "confirmed" || attendanceMarked) &&
    !(noShowOnly && booking?.attendanceStatus === "attended");
  const attendanceLocked = attendanceMarked || booking?.status !== "confirmed";
  // Footer actions: a pending bank transfer is "confirmed" by marking the money
  // received; anything else not yet live gets a plain Confirm.
  const showConfirm =
    bankPending ||
    booking?.status === "awaiting_payment" ||
    booking?.status === "held" ||
    booking?.status === "draft";
  const showRecordPayment = canRecordPayment && !bankPending;

  // Why delete is off, mirroring the API's 409s so staff see the reason before the click.
  const hasIssuedInvoice = (invoices.data ?? []).some((inv) => inv.status !== "draft");
  const deleteBlocked: string | null = !booking
    ? null
    : (settlement?.paidMinor ?? 0) > 0 || hasSucceededPayment
      ? "Has payments — refund or cancel instead"
      : hasIssuedInvoice
        ? "Has an invoice — void it or cancel instead"
        : null;

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

  const openCancel = () => {
    setCancelNotify(clientWasTold);
    setConfirmCancel(true);
  };

  const submitDelete = async () => {
    if (!booking) return;
    try {
      await deleteBooking.mutateAsync({
        bookingId: booking.id,
        customerId: booking.leadCustomerId,
      });
      toast.success("Booking deleted");
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      // 409 = money or an invoice is attached; the API says which in plain English.
      if (err instanceof ApiError && err.status === 409 && err.detail) {
        toast.error("Booking not deleted", { description: err.detail });
        setConfirmDelete(false);
        void payments.refetch();
        void invoices.refetch();
        return;
      }
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
      <aside className="pt-safe pb-safe fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card">
        <header className="flex items-start justify-between gap-3 border-b p-5">
          {bookingQuery.isLoading || !booking ? (
            <div className="w-full">
              <TableGhost rows={3} />
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{booking.reference}</p>
              <h2 className="mt-1 text-lg font-semibold">{booking.serviceSnapshot.name}</h2>
              <p className="text-sm text-muted-foreground">
                {formatBookingWhen(booking, timezone)}
              </p>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {booking ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {/* Edit covers what (services, price, who, where, vehicle, notes)
                      and, via its "Reschedule" hand-off, when — so it's the single
                      entry point. Final bookings are a record, so it locks. */}
                  <DropdownMenuItem
                    disabled={isFinal}
                    onSelect={() => {
                      setEditAddServiceIds([]);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="size-4" /> Edit booking
                  </DropdownMenuItem>
                  {isFinal ? (
                    <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                      {editLockedReason(booking.status)}
                    </p>
                  ) : null}
                  <DropdownMenuSeparator />
                  {/* Every message staff can send — booking reminder, payment reminder,
                      resend by email / text — lives in one drawer beside the panel, so
                      the menu stays short and nothing clips at phone widths. */}
                  <DropdownMenuItem onSelect={() => setRemindersOpen(true)}>
                    <BellRing className="size-4" /> Reminders
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/messages" onClick={onClose}>
                      <MessageSquare className="size-4" /> Message
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={isFinal} onSelect={openCancel}>
                    <Ban className="size-4" /> Cancel booking
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={Boolean(deleteBlocked) || deleteBooking.isPending}
                    onSelect={() => setConfirmDelete(true)}
                    className="text-destructive focus:text-destructive data-[disabled]:text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                    <span className="flex-1">Delete booking</span>
                  </DropdownMenuItem>
                  {deleteBlocked ? (
                    <p className="px-2 pb-1.5 text-xs text-muted-foreground">{deleteBlocked}</p>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
              <X className="size-4" />
            </Button>
          </div>
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
            <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-5 pb-12 sm:pb-5">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={booking.status} />
                {/* Only once marked: an "Unknown" pill before then just restates the
                    untouched attendance row in the footer. */}
                {attendanceMarked ? <StatusBadge status={booking.attendanceStatus} /> : null}
                {/* Staff squeezed this in beside an all-day job (or booked the all-day
                    job over timed work) — the calendar shows both on the same day. */}
                {booking.dropIn ? (
                  <span
                    className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary"
                    title={
                      booking.allDay
                        ? "Booked over timed work on the same day"
                        : "Booked as a drop-in alongside an all-day job"
                    }
                  >
                    {booking.allDay ? "Shares the day" : "Drop-in"}
                  </span>
                ) : null}
                {/* The client needs running somewhere once the car is in — obvious at a
                    glance so it is planned for, not discovered at the door. */}
                {booking.clientLift ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary"
                    title={describeClientLift(booking.clientLift) ?? undefined}
                  >
                    <CarFront className="size-3" aria-hidden />
                    Lift needed
                  </span>
                ) : null}
                {settlement?.state === "deposit_paid" || settlement?.state === "part_paid" ? (
                  <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                    {settlement.state === "deposit_paid" ? "Deposit paid" : "Part paid"} ·{" "}
                    {formatMoney(settlement.outstandingMinor, booking.currency)}{" "}
                    {balanceDueLabel(settlement)}
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

              {upsellOffer.data?.status === "requested" && upsellOffer.data.requested.length > 0 ? (
                <div className="rounded-xl border border-primary/40 bg-primary-soft p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Sparkles className="size-4 text-primary" />
                    Client asked to add{" "}
                    {upsellOffer.data.requested
                      .map((r) => `${r.name} (${formatMoney(r.priceMinor, r.currency)})`)
                      .join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From the offer email. Adding it extends the job by{" "}
                    {formatDuration(
                      upsellOffer.data.requested.reduce((sum, r) => sum + r.durationMinutes, 0),
                    )}{" "}
                    — check it still fits, then save and they get an updated confirmation.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={isFinal}
                      onClick={() => {
                        setEditAddServiceIds(upsellOffer.data!.requested.map((r) => r.serviceId));
                        setEditOpen(true);
                      }}
                    >
                      Add to booking
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={declineUpsell.isPending}
                      onClick={() => {
                        void declineUpsell.mutateAsync(upsellOffer.data!.offerId).then(() => {
                          toast.success("Request declined");
                        });
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ) : null}

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
                    <div className="flex items-center gap-2 rounded-xl border p-2 pl-3">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: booking.leadCustomerId }}
                        onClick={onClose}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 transition-colors hover:text-primary"
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
                      {/* Ring or text the client from the device's own apps; the number
                          is E.164 so tel:/sms: links work on iOS and Android alike. */}
                      {customerPhone ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button variant="outline" size="icon" asChild className="rounded-full">
                            <a
                              href={`tel:${customerPhone}`}
                              aria-label={`Call ${customer.data?.phoneDisplay ?? "client"}`}
                              title="Call"
                            >
                              <Phone className="size-4" />
                            </a>
                          </Button>
                          <Button variant="outline" size="icon" asChild className="rounded-full">
                            <a
                              href={`sms:${customerPhone}`}
                              aria-label={`Text ${customer.data?.phoneDisplay ?? "client"}`}
                              title="Text"
                            >
                              <MessageSquareText className="size-4" />
                            </a>
                          </Button>
                          <Button variant="outline" size="icon" asChild className="rounded-full">
                            <a
                              href={`https://wa.me/${customerPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`WhatsApp ${customer.data?.phoneDisplay ?? "client"}`}
                              title="WhatsApp"
                            >
                              <WhatsAppIcon className="size-4" />
                            </a>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {booking.attendees.length > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        {booking.seatCount} of {booking.attendees.length} spaces booked
                      </p>
                    ) : null}
                  </div>

                  <dl className="grid grid-cols-2 gap-y-3 text-sm">
                    {/* Obvious who and where in a one-person, one-place business. */}
                    {soleStaff ? null : (
                      <Detail
                        label={tenant.terminology.staff || "Staff"}
                        value={trainer?.displayName ?? "—"}
                      />
                    )}
                    {soleLocation ? null : (
                      <Detail label="Location" value={location?.name ?? "—"} />
                    )}
                    {booking.linkedRecordId ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {tenant.terminology.linkedRecord}
                        </dt>
                        <dd className="font-medium">
                          {/* Straight to the client's record so staff can see the
                              car's details, photos and history from the job. */}
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: booking.leadCustomerId }}
                            search={{ tab: "linked", record: booking.linkedRecordId }}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 underline-offset-4 hover:text-primary hover:underline"
                          >
                            {linkedRecord.data?.displayLabel ?? "…"}
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          </Link>
                        </dd>
                      </div>
                    ) : null}
                    {/* "Next top-up due": follow-ups this job scheduled, once it is done. */}
                    <BookingFollowUpDetail
                      bookingId={booking.id}
                      timezone={timezone}
                      onNavigate={onClose}
                    />
                    {booking.clientLift ? (
                      <Detail
                        label="Lift"
                        value={
                          booking.clientLift.destination?.trim()
                            ? `Drop client at ${booking.clientLift.destination.trim()}`
                            : "Lift needed"
                        }
                        hint={booking.clientLift.notes?.trim() || undefined}
                        // Destinations are addresses; give the line the full width.
                        className="col-span-2"
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
                          ? listPriceMinor > booking.priceMinor
                            ? `${formatMoney(listPriceMinor - booking.priceMinor, booking.currency)} discount`
                            : `${formatMoney(booking.priceMinor - listPriceMinor, booking.currency)} added to the list price`
                          : undefined
                      }
                    />
                    {settlement && settlement.depositMinor != null ? (
                      <Detail
                        label="Deposit"
                        value={formatMoney(settlement.depositMinor, booking.currency)}
                        hint={
                          settlement.paidMinor >= settlement.depositMinor
                            ? "Paid"
                            : settlement.paidMinor > 0
                              ? `${formatMoney(settlement.paidMinor, booking.currency)} received so far`
                              : "Requested, not yet paid"
                        }
                        action={
                          canConfirmDeposit ? (
                            <button
                              type="button"
                              className="text-left text-xs font-medium text-primary underline-offset-4 hover:underline"
                              onClick={() => {
                                setRecordIntent("deposit");
                                setRecordOpen(true);
                              }}
                            >
                              Deposit taken
                            </button>
                          ) : undefined
                        }
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
                        hint={
                          settlement.outstandingMinor > 0 && settlement.balanceAfterJob
                            ? settlement.depositMinor != null &&
                              settlement.paidMinor < settlement.depositMinor
                              ? `${formatMoney(settlement.dueNowMinor, booking.currency)} deposit now, the rest after the job`
                              : "Due after the job"
                            : undefined
                        }
                      />
                    ) : null}
                    <Detail
                      label="Duration"
                      value={
                        booking.allDay
                          ? formatAllDayDuration(totalMinutes, blockMinutes)
                          : formatDurationLong(totalMinutes)
                      }
                      hint={
                        // A job over several days names the days it actually runs on —
                        // "Thu 24 – Mon 28 Sept · 3 working days" when it skips a weekend.
                        [
                          workingSpan,
                          booking.allDay ? describeAllDayBlock(totalMinutes, blockMinutes) : null,
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                    />
                  </dl>

                  {breakdown?.hasBreakdown ? (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Services on this job
                        </p>
                        <ul className="divide-y rounded-xl border">
                          {breakdown.lines.map((li) => (
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
                                  · {formatDuration(lineItemJobMinutes(booking, li))}
                                </span>
                              </span>
                              <span className="tabular-nums">
                                {formatMoney(li.priceMinor, li.currency)}
                              </span>
                            </li>
                          ))}
                          {breakdown.adjustmentMinor !== 0 ? (
                            <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground">
                              <span>{adjustmentLabel(breakdown.adjustmentMinor)}</span>
                              <span className="tabular-nums">
                                {formatAdjustment(breakdown.adjustmentMinor, (m) =>
                                  formatMoney(m, booking.currency),
                                )}
                              </span>
                            </li>
                          ) : null}
                          <li className="flex items-center justify-between gap-2 bg-secondary/40 px-3 py-2 text-sm font-medium">
                            <span>Total</span>
                            <span className="tabular-nums">
                              {formatMoney(breakdown.totalMinor, booking.currency)}
                            </span>
                          </li>
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

                  {/* Materials the job used (automotive only; renders nothing elsewhere). Staff eyes only. */}
                  <BookingConsumablesSection bookingId={booking.id} />
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
                        <HistoryRow
                          key={String(entry.id ?? entry.notificationId ?? i)}
                          entry={entry}
                          timezone={timezone}
                          booking={booking}
                        />
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
                          ? `Deposit of ${formatMoney(settlement.depositMinor ?? 0, booking.currency)} received — ${formatMoney(settlement.outstandingMinor, booking.currency)} balance ${balanceDueLabel(settlement)}.`
                          : settlement.state === "part_paid"
                            ? `${formatMoney(settlement.paidMinor, booking.currency)} received so far — ${formatMoney(settlement.outstandingMinor, booking.currency)} still ${balanceDueLabel(settlement)}.`
                            : hasSucceededPayment
                              ? "Payment received for this booking."
                              : settlement.depositMinor != null
                                ? `Deposit of ${formatMoney(settlement.depositMinor, booking.currency)} is due now; the remaining ${formatMoney(settlement.outstandingMinor - settlement.depositMinor, booking.currency)} is ${balanceDueLabel(settlement)}.`
                                : settlement.balanceAfterJob
                                  ? `${formatMoney(settlement.outstandingMinor, booking.currency)} is due after the job.`
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
                            disabled={Boolean(paymentReminderBlocked) || paymentReminder.isPending}
                            onClick={() => void remindPayment()}
                          >
                            <BellRing className="size-4" />
                            {paymentReminder.isPending ? "Sending…" : "Send payment reminder"}
                          </Button>
                        ) : null}
                      </div>
                      {canRemindPayment ? (
                        <p className="text-xs text-muted-foreground">
                          {paymentReminderBlocked
                            ? `Can't send a payment reminder: ${paymentReminderBlocked.toLowerCase()}.`
                            : `The reminder ${describeReminderRoute(reminderRoute.channels, customerName)} the ${formatMoney(settlement.outstandingMinor, booking.currency)} outstanding and how to pay.`}
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

            {/* Only what needs doing on the job right now: attendance, confirming, and
                taking the money. Everything else — edit, reschedule, reminders, resend,
                message, cancel, delete — lives in the header's ⋯ menu. No footer at all
                when none of those apply (a cancelled or expired booking, say). */}
            {showAttendance || showConfirm || showRecordPayment ? (
              <footer className="flex min-w-0 flex-col gap-2 border-t p-4">
                {showAttendance ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Attendance
                    </span>
                    <div className="flex flex-1 items-center justify-end gap-4">
                      {noShowOnly ? null : (
                        <label
                          className={cn(
                            "flex items-center gap-2 text-sm",
                            attendanceLocked ? "cursor-default" : "cursor-pointer",
                          )}
                        >
                          <Checkbox
                            checked={booking.attendanceStatus === "attended"}
                            disabled={attendanceLocked || attendanceAction.isPending}
                            aria-label="Attended"
                            onCheckedChange={(v) => {
                              if (v === true) void run(attendanceAction, { attended: true });
                            }}
                          />
                          Attended
                        </label>
                      )}
                      <label
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          attendanceLocked ? "cursor-default" : "cursor-pointer",
                        )}
                      >
                        <Checkbox
                          checked={booking.attendanceStatus === "no_show"}
                          disabled={attendanceLocked || attendanceAction.isPending}
                          aria-label="No-show"
                          onCheckedChange={(v) => {
                            if (v === true) void run(attendanceAction, { attended: false });
                          }}
                        />
                        No-show
                      </label>
                    </div>
                    {attendanceMarked ? (
                      <p className="basis-full text-xs text-muted-foreground">
                        {noShowOnly
                          ? "A no-show is final once marked."
                          : "Attendance is final once marked."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {bankPending ? (
                  <Button
                    disabled={markReceived.isPending}
                    onClick={() => setConfirmReceived(true)}
                  >
                    <Landmark className="size-4" /> Mark bank transfer received
                  </Button>
                ) : showConfirm ? (
                  <Button
                    variant="outline"
                    disabled={confirmAction.isPending}
                    onClick={() => run(confirmAction)}
                  >
                    <CheckCircle2 className="size-4" /> Confirm booking
                  </Button>
                ) : null}
                {showRecordPayment ? (
                  <Button variant="outline" onClick={() => setRecordOpen(true)}>
                    <Landmark className="size-4" /> Record payment ·{" "}
                    {formatMoney(settlement!.outstandingMinor, booking.currency)} outstanding
                  </Button>
                ) : null}
              </footer>
            ) : null}
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
                  {clientWasTold
                    ? "Untick if they already know — reminders are removed either way."
                    : "Off by default: the client was never sent a confirmation for this booking."}
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              It's removed from the calendar and lists and nobody is notified. Payments recorded
              against it stay on the client's record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBooking.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void submitDelete();
              }}
            >
              {deleteBooking.isPending ? "Deleting…" : "Delete"}
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
          onOpenChange={(open) => {
            setRecordOpen(open);
            if (!open) setRecordIntent("payment");
          }}
          bookingId={booking.id}
          currency={booking.currency}
          outstandingMinor={settlement.outstandingMinor}
          depositOwedMinor={recordIntent === "deposit" ? depositOwedMinor : undefined}
          pending={recordPayment.isPending}
          onSubmit={async (amountMinor, method) => {
            try {
              await recordPayment.mutateAsync({ bookingId: booking.id, amountMinor, method });
              toast.success(
                amountMinor >= settlement.outstandingMinor
                  ? "Payment recorded — paid in full"
                  : recordIntent === "deposit" && amountMinor >= depositOwedMinor
                    ? `Deposit of ${formatMoney(amountMinor, booking.currency)} recorded`
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

      {booking && editOpen ? (
        <EditBookingDialog
          booking={booking}
          addServiceIds={editAddServiceIds}
          onClose={() => {
            setEditOpen(false);
            setEditAddServiceIds([]);
          }}
          onReschedule={() => {
            setEditOpen(false);
            setEditAddServiceIds([]);
            setRescheduleOpen(true);
          }}
        />
      ) : null}

      {booking ? (
        <BookingRemindersDrawer
          open={remindersOpen}
          onOpenChange={(open) => {
            setRemindersOpen(open);
            if (!open) setResendError(null);
          }}
          customerName={customerName}
          rows={reminderRows}
          smsCredits={smsCredits}
          onNavigate={onClose}
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

/** WhatsApp glyph — lucide ships no brand icons; drawn to match its 24px grid. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function Detail({
  label,
  value,
  hint,
  action,
  className,
}: {
  label: string;
  value: string;
  /** Small secondary line, e.g. the catalogue price a total was adjusted from. */
  hint?: string;
  /** Inline follow-up, e.g. "Deposit taken" under an unpaid deposit. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
      {action ? <dd className="mt-0.5">{action}</dd> : null}
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

/** "texts Ahmed" / "emails Ahmed" / "emails and texts Ahmed" — for the Payments tab note. */
function describeReminderRoute(channels: readonly string[], name: string): string {
  const hasEmail = channels.includes("email");
  const hasSms = channels.includes("sms");
  const verb = hasEmail && hasSms ? "emails and texts" : hasSms ? "texts" : "emails";
  return `${verb} ${name}`;
}

/** Why a reminder is off for a booking that is not live (drawer sub-text). */
function closedReminderReason(status: string): string {
  switch (status) {
    case "no_show":
      return "Marked as a no-show";
    case "expired":
      return "This hold expired";
    case "cancelled_by_customer":
    case "cancelled_by_business":
    case "late_cancelled":
      return "Booking cancelled";
    default:
      return "Not confirmed yet";
  }
}

/** Why "Edit booking" is off: the booking has reached a final state and is now a record. */
function editLockedReason(status: string): string {
  switch (status) {
    case "completed":
      return "Marked as attended — it can't be edited now.";
    case "no_show":
      return "Marked as a no-show — it can't be edited now.";
    case "expired":
      return "This hold expired — make a new booking instead.";
    default:
      return "Cancelled bookings can't be edited — make a new booking instead.";
  }
}

/**
 * Machine reasons the API puts on a history entry, in plain English. Anything else
 * is free text staff typed (a cancellation reason) and is shown quoted as-is.
 */
function historyReasonNote(reason: string, booking: Pick<Booking, "allDay">): string | null {
  switch (reason) {
    case "drop_in":
      return booking.allDay
        ? "Booked over timed work already on the day — staff confirmed they can share it"
        : "Booked as a drop-in alongside an all-day job";
    case "rescheduled_drop_in":
      return booking.allDay
        ? "Moved onto a day with timed work — staff confirmed they can share it"
        : "Moved in as a drop-in alongside an all-day job";
    default:
      return null;
  }
}

function HistoryRow({
  entry,
  timezone,
  booking,
}: {
  entry: BookingHistoryEntry;
  timezone: string;
  booking: Pick<Booking, "allDay">;
}) {
  // Messages sent about the booking (confirmation, reminders…) with delivery status.
  if (isMessageHistoryEntry(entry)) {
    return <BookingMessageHistoryRow entry={entry} timezone={timezone} />;
  }
  if (entry.kind === "amended") {
    return <AmendedHistoryRow entry={entry} timezone={timezone} />;
  }
  const ts = historyTimestamp(entry);
  const transition =
    entry.fromStatus && entry.toStatus
      ? `${humanize(entry.fromStatus)} → ${humanize(entry.toStatus)}`
      : null;
  const reason = typeof entry.reason === "string" ? entry.reason : undefined;
  const note = reason ? historyReasonNote(reason, booking) : null;

  return (
    <li className="flex gap-3 border-b py-3 last:border-0">
      <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{historyActionLabel(entry)}</p>
        {transition ? <p className="text-xs text-muted-foreground">{transition}</p> : null}
        {note ? (
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        ) : reason ? (
          <p className="mt-1 text-xs text-muted-foreground">“{reason}”</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {historyActorLabel(entry)}
          {ts ? ` · ${formatInTz(ts, timezone, { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>
      </div>
    </li>
  );
}

/** A staff edit: what changed, in plain English, rather than a status move. */
function AmendedHistoryRow({ entry, timezone }: { entry: BookingHistoryEntry; timezone: string }) {
  const tenant = useTenant();
  const terms = {
    staff: tenant.terminology.staff.trim() || "Staff",
    linkedRecord: tenant.terminology.linkedRecord.trim() || "Record",
  };
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const ts = historyTimestamp(entry);
  return (
    <li className="flex gap-3 border-b py-3 last:border-0">
      <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{summariseBookingChanges(changes, terms)}</p>
        {changes.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {changes.map((c, i) => (
              <li key={`${c.field}-${i}`}>{describeBookingChange(c, terms, timezone)}</li>
            ))}
          </ul>
        ) : null}
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
  depositOwedMinor,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currency: string;
  outstandingMinor: number;
  /** Set when opened via "Deposit taken": presets the amount and rewords the copy. */
  depositOwedMinor?: number;
  pending: boolean;
  onSubmit: (amountMinor: number, method: RecordPaymentMethod) => Promise<void>;
}) {
  const forDeposit = depositOwedMinor != null && depositOwedMinor > 0;
  const presetMinor = forDeposit ? depositOwedMinor : outstandingMinor;
  const [amount, setAmount] = useState(String(presetMinor / 100));
  const [method, setMethod] = useState<RecordPaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(presetMinor / 100));
      setMethod("cash");
      setError(null);
    }
  }, [open, bookingId, presetMinor]);

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
          <DialogTitle>{forDeposit ? "Confirm deposit taken" : "Record a payment"}</DialogTitle>
          <DialogDescription>
            {forDeposit
              ? `Log the ${formatMoney(depositOwedMinor, currency)} deposit you've taken — cash, a bank transfer or a card taken elsewhere. The remaining ${formatMoney(outstandingMinor - depositOwedMinor, currency)} stays outstanding.`
              : `Log money you've taken for this booking — cash, a bank transfer or a card taken elsewhere. ${formatMoney(outstandingMinor, currency)} is outstanding.`}
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
            {pending ? "Recording…" : forDeposit ? "Deposit taken" : "Record payment"}
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
  // The job's own length (its line items), not start → end: a 3-day job that skips a
  // weekend is still 3 days, and the API lays it over working days from the new start.
  const lengthMinutes = booking.allDay ? bookingWindowMinutes(booking) : bookingJobMinutes(booking);
  const customLength =
    booking.allDay ||
    (booking.lineItems?.[0]?.durationMinutes ?? booking.serviceSnapshot.durationMinutes) !==
      booking.serviceSnapshot.durationMinutes;
  const [mode, setMode] = useState<"slot" | "custom">(customLength ? "custom" : "slot");
  const [time, setTime] = useState(() => {
    const d = new Date(booking.start);
    return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
  });
  // Staff said the moved job may share its new day with the other kind of work
  // (see AddBookingModal). A booking that is already a drop-in keeps that on the
  // server unless told otherwise, so this only needs asking for the new day.
  const [dropIn, setDropIn] = useState(false);
  const [override, setOverride] = useState<{
    conflicts: BookingConflict[];
    body: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setStaffId(booking.staffId);
      setDate(isoDate(new Date(booking.start)));
      setSlotStart(null);
      setDropIn(false);
      setOverride(null);
      setMode(customLength ? "custom" : "slot");
      const d = new Date(booking.start);
      setTime(`${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`);
    }
  }, [open, booking.id, booking.staffId, booking.start, customLength]);
  useEffect(() => {
    setDropIn(false);
  }, [date, staffId, mode]);

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
    dropIn: dropIn && mode === "slot",
    // Same half-hour grid as the Add booking form: staff may move a job to any
    // time the day has room for, not just back-to-back from opening.
    granularityMinutes: 30,
    enabled: open && mode === "slot",
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );
  const selectedSlot = slots.find((s) => s.start === slotStart) ?? null;
  const customStaffId = staffId !== "any" ? staffId : null;
  const canSubmit = mode === "slot" ? Boolean(selectedSlot) : Boolean(customStart && customStaffId);

  // The diary on the target day(s), minus this booking: what the move would land on.
  const spanEnd = booking.allDay
    ? new Date(dayStart.getTime() + Math.max(1, Math.ceil(lengthMinutes / 1440)) * 86_400_000)
    : dayEnd;
  const diary = useBookings({
    from: dayStart.toISOString(),
    to: spanEnd.toISOString(),
    staffId: customStaffId ?? undefined,
    limit: 200,
    enabled: open && !Number.isNaN(dayStart.getTime()),
  });
  const others = useMemo(
    () => (diary.data?.bookings ?? []).filter((b) => b.id !== booking.id),
    [diary.data, booking.id],
  );
  const holdWindow =
    mode === "custom" && !booking.allDay && customStart
      ? {
          start: customStart,
          end: new Date(new Date(customStart).getTime() + lengthMinutes * 60_000).toISOString(),
        }
      : { start: dayStart.toISOString(), end: dayEnd.toISOString() };
  const holds = booking.allDay ? [] : allDayHolds(others, holdWindow, customStaffId);
  const holdNote = heldAllDayNote(holds.map((b) => describeHold(b)));
  const timedOnDay =
    booking.allDay && customStart
      ? timedJobsWithin(others, { start: customStart, end: spanEnd.toISOString() }, customStaffId)
      : [];
  const timedNote = timedClashNote(timedOnDay, timezone);
  const sendDropIn =
    dropIn && (mode === "slot" || (booking.allDay ? timedOnDay.length > 0 : holds.length > 0));

  const move = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      await rescheduleAction.mutateAsync({ bookingId: booking.id, ifMatch: booking.version, body });
      toast.success("Booking rescheduled");
      onOpenChange(false);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.isOverridableConflict && body.dropIn !== true) {
        setOverride({ conflicts: err.conflicts, body });
      } else if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") {
        if (mode === "custom") {
          const who = staffOptions.find((s) => s.id === customStaffId)?.displayName;
          toast.error(`Clashes with another booking${who ? ` for ${who}` : ""}`, {
            description: "Pick a different day or time.",
          });
          return false;
        }
        toast.error("That slot was just taken", {
          description: "Availability has been refreshed — pick another time.",
        });
        setSlotStart(null);
        void availability.refetch();
      } else {
        toastApiError(err);
      }
      return false;
    }
  };

  const submit = async () => {
    if (mode === "slot" && !selectedSlot) {
      toast.error("Choose a new time slot");
      return;
    }
    if (mode === "custom" && (!customStart || !customStaffId)) {
      toast.error(!customStaffId ? `Choose a ${staffNoun.toLowerCase()}` : "Check the date");
      return;
    }
    await move({
      ...(mode === "slot"
        ? { start: selectedSlot!.start, staffId: selectedSlot!.staffId }
        : { start: customStart!, staffId: customStaffId! }),
      ...(sendDropIn ? { dropIn: true } : {}),
    });
  };

  const confirmOverride = async () => {
    if (!override) return;
    const ok = await move({ ...override.body, dropIn: true });
    if (ok) setOverride(null);
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
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                {booking.allDay
                  ? `Stays an all-day job${
                      allDayBlockDays(lengthMinutes) > 1
                        ? ` across ${allDayBlockDays(lengthMinutes)} working days`
                        : ""
                    }, starting on the new date.`
                  : `Keeps its ${formatDurationLong(lengthMinutes)} length from the new start${
                      lengthMinutes >= 1440 ? ", over working days only" : ""
                    }.`}
                {staffId === "any" ? ` Choose a ${staffNoun.toLowerCase()} to move it.` : ""}
              </p>
              {/* Landing on the other kind of work: ask before the API has to say no. */}
              {booking.allDay && timedNote ? (
                dropIn ? (
                  <p className="rounded-md bg-primary-soft px-3 py-2 text-xs text-primary">
                    {timedNote}. Moving anyway — both stay on the calendar.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setDropIn(false)}
                    >
                      Undo
                    </button>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                    <span>{timedNote} — move anyway?</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setDropIn(true)}
                    >
                      Move anyway
                    </Button>
                  </div>
                )
              ) : null}
              {!booking.allDay && holds.length > 0 ? (
                dropIn ? (
                  <p className="rounded-md bg-primary-soft px-3 py-2 text-xs text-primary">
                    {holdNote}. Moved in as a drop-in alongside it.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => setDropIn(false)}
                    >
                      Undo
                    </button>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                    <span>{holdNote}.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setDropIn(true)}
                    >
                      Squeeze in as a drop-in
                    </Button>
                  </div>
                )
              ) : null}
            </div>
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
                holds.length > 0 && !dropIn ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/60 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{holdNote}.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setDropIn(true)}
                    >
                      Squeeze in as a drop-in
                    </Button>
                  </div>
                ) : dropIn ? (
                  <p className="text-xs text-muted-foreground">
                    No room for a drop-in — timed work, an event or working hours are in the way.{" "}
                    <button
                      type="button"
                      className="text-primary underline underline-offset-4"
                      onClick={() => setDropIn(false)}
                    >
                      Undo
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {emptySlotsMessage(catalogue?.availabilityWindows, date)}
                  </p>
                )
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
              {dropIn && slots.length > 0 ? (
                <p className="rounded-md bg-primary-soft px-3 py-2 text-xs text-primary">
                  {holds.length > 0 ? `${holdNote}. ` : ""}
                  Times shown are for a drop-in alongside the all-day job.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setDropIn(false)}
                  >
                    Undo
                  </button>
                </p>
              ) : null}
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
      <DropInConfirmDialog
        open={override !== null}
        onOpenChange={(next) => {
          if (!next && !rescheduleAction.isPending) setOverride(null);
        }}
        conflicts={override?.conflicts ?? []}
        newBookingAllDay={booking.allDay === true}
        timezone={timezone}
        busy={rescheduleAction.isPending}
        onConfirm={() => void confirmOverride()}
      />
    </Dialog>
  );
}
