/**
 * Rules behind the booking panel's Reminders drawer: which channels a staff-sent
 * reminder would go by, why it can't go, and when it last went — all derived on the
 * client from the customer record, the SMS credit balance and the booking's history,
 * so staff see the answer before they tap Send.
 *
 * Channel choice mirrors the API's `reminderChannels`: email whenever the customer has
 * an address, text whenever they can actually receive one (number on file, not opted
 * out, credits in hand). A phone-only client is texted alone; only when neither channel
 * works is the reminder off.
 */
import { isMessageHistoryEntry, type MessageChannel } from "./message-history.ts";
import type { SmsCreditsLevel } from "@/lib/billing/sms-credits";

export type ReminderChannel = "email" | "sms";

export interface ReminderContact {
  email: string | null;
  phone: string | null;
  /** Customer switched off operational texts. */
  smsOptedOut: boolean;
}

/**
 * Why a text to this customer would not go as a text right now, or null when it would.
 * Credits are the business's problem, not the customer's, so they're reported separately
 * by {@link reminderChannels}; this is only about the customer record.
 */
export function smsBlockedReason(contact: ReminderContact): string | null {
  if (!contact.phone) return "No mobile number on file";
  if (contact.smsOptedOut) return "Customer has opted out of texts";
  return null;
}

/**
 * Channels a reminder would go by, or the one-line reason it can't go at all.
 * An unknown credit level (still loading) is treated as textable: the API has the
 * final say and a false "off" would be worse than a failed tap.
 */
export function reminderChannels(
  contact: ReminderContact,
  credits: SmsCreditsLevel,
): { channels: ReminderChannel[]; blocked: string | null } {
  const channels: ReminderChannel[] = [];
  if (contact.email) channels.push("email");
  const canText = !smsBlockedReason(contact) && credits !== "empty";
  if (canText) channels.push("sms");
  if (channels.length > 0) return { channels, blocked: null };

  if (!contact.phone) return { channels, blocked: "No phone or email on file" };
  if (contact.smsOptedOut) return { channels, blocked: "Opted out of texts and no email on file" };
  return { channels, blocked: "Out of text credits and no email on file" };
}

/** "By text", "By email", "By email and text". */
export function channelsLabel(channels: readonly ReminderChannel[]): string {
  const hasEmail = channels.includes("email");
  const hasSms = channels.includes("sms");
  if (hasEmail && hasSms) return "By email and text";
  if (hasSms) return "By text";
  if (hasEmail) return "By email";
  return "";
}

/** "email and text" / "text" / "email" — for a success toast. */
export function channelsPhrase(channels: readonly string[]): string {
  const hasEmail = channels.includes("email");
  const hasSms = channels.includes("sms");
  if (hasEmail && hasSms) return "email and text";
  if (hasSms) return "text";
  return "email";
}

export interface LastSent {
  at: string;
  channels: MessageChannel[];
}

/**
 * The most recent time one of `templateKeys` reached the customer (sent, or fell back
 * to another channel), with every channel that went in the same send. Failed attempts
 * don't count — nothing arrived. Entries within a minute of the latest are treated as
 * one send, since a reminder that goes by email and text produces two rows.
 */
export function lastSentFromHistory(
  history: readonly unknown[] | undefined,
  templateKeys: readonly string[],
): LastSent | null {
  const keys = new Set(templateKeys);
  const hits = (history ?? [])
    .filter(isMessageHistoryEntry)
    .filter((e) => keys.has(e.templateKey) && (e.status === "sent" || e.status === "fallback"))
    .map((e) => ({ at: new Date(e.occurredAt).getTime(), iso: e.occurredAt, channel: e.channel }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => b.at - a.at);
  const latest = hits[0];
  if (!latest) return null;
  const channels: MessageChannel[] = [];
  for (const hit of hits) {
    if (latest.at - hit.at > 60_000) break;
    if (!channels.includes(hit.channel)) channels.push(hit.channel);
  }
  return { at: latest.iso, channels };
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", "3 weeks ago". */
export function relativeTimeAgo(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** "Last sent 2 days ago by text" / "Not sent yet". */
export function lastSentLabel(last: LastSent | null, now: Date = new Date()): string {
  if (!last) return "Not sent yet";
  const by = channelsLabel(last.channels.filter((c): c is ReminderChannel => c !== "in_app"));
  return `Last sent ${relativeTimeAgo(last.at, now)}${by ? ` ${by.toLowerCase()}` : ""}`;
}

/**
 * Template keys behind "Resend …" for a booking in this state — what the API's
 * `resendBookingMessage` would send, so "Last sent" for that row looks at the right
 * messages. Empty when there's nothing to resend.
 */
export function resendTemplateKeys(status: string, bankPending: boolean): string[] {
  switch (status) {
    case "awaiting_payment":
      return bankPending ? ["bank_transfer_instructions"] : ["booking_payment_request"];
    case "confirmed":
      return ["booking_confirmation", "booking_payment_request"];
    case "cancelled_by_customer":
    case "cancelled_by_business":
    case "late_cancelled":
      return ["cancellation"];
    default:
      return [];
  }
}
