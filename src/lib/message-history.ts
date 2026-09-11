/**
 * Message entries in a booking's history (`GET …/bookings/{id}/history`, `kind: "message"`).
 *
 * The API says what was sent, on which channel, whether it got there and — when it did
 * not, or went by email instead of text — a reason code. These helpers turn the codes into
 * the words staff see, so a failed text reads "Mobile number isn't valid — check the
 * client's number" rather than a Twilio error.
 */

export type MessageChannel = "email" | "sms" | "in_app";
export type MessageStatus = "sent" | "failed" | "fallback";
export type MessageReasonCode =
  | "invalid_phone"
  | "no_phone"
  | "no_email"
  | "opted_out"
  | "no_credits"
  | "not_entitled"
  | "sms_unavailable"
  | "provider_error";

export interface MessageHistoryEntry {
  kind: "message";
  notificationId: string;
  occurredAt: string;
  channel: MessageChannel;
  /** What was asked for when it differs from `channel` (a text that went as email). */
  requestedChannel: MessageChannel | null;
  templateKey: string;
  status: MessageStatus;
  reasonCode: MessageReasonCode | null;
}

export function isMessageHistoryEntry(entry: unknown): entry is MessageHistoryEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    e.kind === "message" &&
    typeof e.channel === "string" &&
    typeof e.status === "string" &&
    typeof e.templateKey === "string"
  );
}

export function messageChannelLabel(channel: string): string {
  switch (channel) {
    case "sms":
      return "Text";
    case "email":
      return "Email";
    case "in_app":
      return "In-app";
    default:
      return channel;
  }
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_confirmation: "Confirmation",
  booking_confirmation_deposit: "Confirmation",
  booking_confirmation_balance: "Confirmation",
  booking_confirmation_paid: "Confirmation",
  reminder: "Reminder",
  reschedule: "Rescheduled notice",
  cancellation: "Cancellation notice",
  refund: "Refund notice",
  payment_request: "Payment request",
  payment_reminder: "Payment reminder",
  bank_transfer_instructions: "Bank transfer details",
  bank_transfer_received: "Payment received",
  package_purchase_receipt: "Package receipt",
  package_payment_link: "Package payment link",
  invoice_issued: "Invoice",
  invoice_receipt: "Invoice receipt",
};

/** "Confirmation", "Reminder"… from the API template key; unknown keys are humanised. */
export function messageTemplateLabel(templateKey: string): string {
  const known = TEMPLATE_LABELS[templateKey];
  if (known) return known;
  const cleaned = templateKey.replace(/[._]/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Message";
}

/** One-line headline for the history row, e.g. "Confirmation · Text". */
export function messageHeadline(entry: MessageHistoryEntry): string {
  return `${messageTemplateLabel(entry.templateKey)} · ${messageChannelLabel(entry.channel)}`;
}

export function messageStatusLabel(entry: MessageHistoryEntry): string {
  switch (entry.status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "fallback":
      return `Fell back to ${messageChannelLabel(entry.channel).toLowerCase()}`;
    default:
      return entry.status;
  }
}

/** Short, human reason for a failure or fallback; null when the message simply went. */
export function messageReasonLabel(entry: MessageHistoryEntry): string | null {
  if (entry.status === "sent") return null;
  switch (entry.reasonCode) {
    case "invalid_phone":
      return "Mobile number isn't valid — check the client's number";
    case "no_phone":
      return "No mobile number on the client's record";
    case "no_email":
      return "No email address on the client's record";
    case "opted_out":
      return "Client has opted out of text messages";
    case "no_credits":
      return "No text credits left — top up to send texts";
    case "not_entitled":
      return "Text messages aren't included in your plan";
    case "sms_unavailable":
      return "Text messaging isn't set up";
    case "provider_error":
      return entry.channel === "sms"
        ? "The text couldn't be delivered — try again later"
        : "The email couldn't be delivered — try again later";
    case null:
    default:
      return entry.status === "failed" ? "Couldn't be delivered" : null;
  }
}
