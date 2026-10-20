import type { Booking, Payment } from "@/lib/api/types";
import { bookingNeedsPayment, bookingSettlement } from "./booking-payment.ts";
import {
  addCalendarDays,
  clientCancelWindowHours,
  isWithinClientCancelWindow,
} from "./client-booking.ts";
import { hoursLabel } from "./client-journey.ts";
import { formatInTz, formatMoney, isoDateInTz } from "./format.ts";

/** "Tomorrow, 09:00" / "Today, 09:00" / "Fri 16 Oct, 09:00" */
export function relativeWhen(start: string, timezone: string, now = new Date()): string {
  const day = isoDateInTz(start, timezone);
  const today = isoDateInTz(now.toISOString(), timezone);
  const time = formatInTz(start, timezone, { hour: "2-digit", minute: "2-digit" });
  if (day === today) return `Today, ${time}`;
  if (day === addCalendarDays(today, 1)) return `Tomorrow, ${time}`;
  return `${formatInTz(start, timezone, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

export type ChipTone = "ok" | "warn" | "neutral";

/**
 * "Confirmed · Paid", "Deposit due", "Pay on the day". Null for a booking paid
 * with a credit: nothing is owed and the Credits card already shows the balance.
 */
export function paymentChip(
  booking: Booking,
  payments: readonly Payment[],
): { label: string; tone: ChipTone } | null {
  const s = bookingSettlement(booking);
  const needsPay = bookingNeedsPayment(booking, payments);
  if (s.state === "credit") return null;
  if (s.state === "free") return { label: "Confirmed", tone: "ok" };
  if (booking.status === "awaiting_payment" && booking.paymentMethod === "bank_transfer") {
    return { label: "Awaiting transfer", tone: "warn" };
  }
  if (needsPay && s.depositMinor != null && s.paidMinor < s.depositMinor) {
    return { label: "Deposit due", tone: "warn" };
  }
  if (needsPay && booking.paymentMethod === "pay_later") {
    return { label: "Pay on the day", tone: "neutral" };
  }
  if (needsPay) return { label: "Payment due", tone: "warn" };
  if (s.state === "deposit_paid") return { label: "Deposit paid", tone: "ok" };
  if (s.state === "paid") return { label: "Confirmed · Paid", tone: "ok" };
  return { label: "Confirmed", tone: "ok" };
}

export type CancelOutcome = {
  tone: "ok" | "warn";
  /** Plain sentence; `emphasis` is the money/credit phrase to set in bold within it. */
  before: string;
  emphasis: string;
  after: string;
};

/**
 * The exact consequence of cancelling now, in money or credits. The API records a
 * timely cancel as refundable but does not move money itself, so a paid booking
 * says the business arranges the refund rather than promising one.
 */
export function cancelOutcome(
  booking: Pick<
    Booking,
    "start" | "status" | "priceMinor" | "currency" | "paymentMethod" | "serviceSnapshot"
  > & { depositMinor?: number | null; paidMinor?: number },
  businessName: string | null,
  now = Date.now(),
): CancelOutcome {
  const hours = clientCancelWindowHours(booking);
  const timely = isWithinClientCancelWindow(booking, now);
  const who = businessName ?? "the business";
  const s = bookingSettlement(booking);
  const price = formatMoney(booking.priceMinor, booking.currency);
  const paid = formatMoney(s.paidMinor, booking.currency);
  const within = hours > 0 ? `It's less than ${hoursLabel(hours)} away, so ` : "";
  const beyond = hours > 0 ? `It's more than ${hoursLabel(hours)} away, so ` : "Free to cancel: ";

  if (s.state === "credit") {
    return timely
      ? {
          tone: "ok",
          before: `${beyond}your `,
          emphasis: "session credit comes back",
          after: " to you.",
        }
      : {
          tone: "warn",
          before: `${within}${who}'s policy means `,
          emphasis: "the session credit is used",
          after: ".",
        };
  }
  if (s.state === "free" || booking.priceMinor <= 0) {
    return {
      tone: "ok",
      before: "Nothing to pay. ",
      emphasis: "",
      after: `${capitalise(who)} will be told.`,
    };
  }
  if (s.paidMinor > 0) {
    return timely
      ? {
          tone: "ok",
          before: beyond,
          emphasis: `the ${paid} you paid is refundable`,
          after: `. ${capitalise(who)} will arrange the refund.`,
        }
      : {
          tone: "warn",
          before: `${within}${who}'s policy means `,
          emphasis: `the ${paid} is not refunded`,
          after: ".",
        };
  }
  return timely
    ? { tone: "ok", before: beyond, emphasis: "there's nothing to pay", after: "." }
    : {
        tone: "warn",
        before: `${within}${who}'s policy counts this as a `,
        emphasis: "late cancellation",
        after: ` of a ${price} session.`,
      };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
