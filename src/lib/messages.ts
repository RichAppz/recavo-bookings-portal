import type { ConversationMessage, Customer, Notification } from "@/lib/api/types";
import { isoDateInTz, timeInTz } from "./format.ts";

/* ---------------- Text credits ---------------- */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";
const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

/** Longest staff text the API accepts: three parts. */
export const MAX_SMS_SEGMENTS = 3;

export type SmsSegments = {
  encoding: "gsm" | "unicode";
  /** Length in encoding units (an extended GSM character counts twice). */
  units: number;
  segments: number;
  /** Units per part at the current length (160 / 153, or 70 / 67 with emoji). */
  perSegment: number;
};

/** One credit per part; the same rules as the API, so the cost shown is the cost charged. */
export function smsSegments(text: string): SmsSegments {
  let gsmUnits = 0;
  let unicode = false;
  for (const ch of text) {
    if (BASIC.has(ch)) gsmUnits += 1;
    else if (EXTENDED.has(ch)) gsmUnits += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const units = text.length;
    const perSegment = units <= 70 ? 70 : 67;
    return {
      encoding: "unicode",
      units,
      segments: Math.max(1, Math.ceil(units / perSegment)),
      perSegment,
    };
  }
  const perSegment = gsmUnits <= 160 ? 160 : 153;
  return {
    encoding: "gsm",
    units: gsmUnits,
    segments: Math.max(1, Math.ceil(gsmUnits / perSegment)),
    perSegment,
  };
}

/** What a staff text actually says: texts come from one platform sender, so the name leads. */
export function staffSmsText(businessName: string, body: string): string {
  const name = businessName.trim();
  const text = body.trim();
  return name ? `${name}: ${text}` : text;
}

export function creditsLabel(n: number): string {
  return `${n} credit${n === 1 ? "" : "s"}`;
}

/** Below this many credits the cost note turns amber with a Buy credits link. */
export const LOW_CREDITS = 10;

/* ---------------- Time labels ---------------- */

const DAY_MS = 86_400_000;

function dayNumber(iso: string, tz: string): number {
  const [y, m, d] = isoDateInTz(iso, tz).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY_MS;
}

function yearIn(iso: string, tz: string): string {
  return isoDateInTz(iso, tz).slice(0, 4);
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso));
}

/** Inbox row time: "06:21" today, "Yesterday", "Mon" this week, "14 Oct", "14 Oct 2025". */
export function inboxTime(iso: string, now: Date, tz: string): string {
  const days = dayNumber(now.toISOString(), tz) - dayNumber(iso, tz);
  if (days <= 0) return timeInTz(iso, tz);
  if (days === 1) return "Yesterday";
  if (days < 7) return fmt(iso, tz, { weekday: "short" });
  if (yearIn(iso, tz) === yearIn(now.toISOString(), tz)) {
    return fmt(iso, tz, { day: "numeric", month: "short" });
  }
  return fmt(iso, tz, { day: "numeric", month: "short", year: "numeric" });
}

/** Day divider: "Today", "Yesterday", "Wed 14 Oct", "3 Mar 2025". */
export function dayLabel(iso: string, now: Date, tz: string): string {
  const days = dayNumber(now.toISOString(), tz) - dayNumber(iso, tz);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (yearIn(iso, tz) === yearIn(now.toISOString(), tz)) {
    return fmt(iso, tz, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  }
  return fmt(iso, tz, { day: "numeric", month: "short", year: "numeric" });
}

/** A time ahead: "06:32 today", "06:32 tomorrow", "06:32 on Sat 24 Oct". */
export function laterLabel(iso: string, now: Date, tz: string): string {
  const days = dayNumber(iso, tz) - dayNumber(now.toISOString(), tz);
  const time = timeInTz(iso, tz);
  if (days <= 0) return `${time} today`;
  if (days === 1) return `${time} tomorrow`;
  return `${time} on ${fmt(iso, tz, { weekday: "short", day: "numeric", month: "short" }).replace(",", "")}`;
}

/* ---------------- Automatic messages as event lines ---------------- */

const EVENT_LABELS: Record<string, string> = {
  booking_confirmation: "Booking confirmed",
  reschedule: "Booking moved",
  cancellation: "Booking cancelled",
  reminder: "Reminder sent",
  booking_payment_request: "Payment link sent",
  package_payment_request: "Payment link sent",
  payment_reminder: "Payment link sent",
  invoice_issued: "Invoice sent",
  broadcast: "Announcement sent",
  group_announcement: "Announcement sent",
  service_follow_up: "Service reminder sent",
  payment_confirmation: "Receipt sent",
};

export type EventLine = {
  id: string;
  label: string;
  /** "by text", "by email", or empty when it only went to the client portal. */
  channel: string;
  at: string;
  /** The message as it was sent; null for an older automatic line stored in the thread. */
  notification: Notification | null;
};

/** A message the system sent this client, as a grey line in the thread; null to leave it out. */
export function eventLineFor(n: Notification): EventLine | null {
  const label = EVENT_LABELS[n.templateKey];
  if (!label) return null;
  const channel = n.channel === "sms" ? "by text" : n.channel === "email" ? "by email" : "";
  return { id: n.id, label, channel, at: n.createdAt, notification: n };
}

/* ---------------- The thread ---------------- */

export type MessageLike = ConversationMessage & {
  channel?: "in_app" | "sms" | "email";
  subject?: string | null;
  deliveryState?: "sending" | "sent" | "delivered" | "failed" | null;
  deliveryError?: string | null;
  creditsUsed?: number;
};

export type StreamItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "event"; key: string; event: EventLine }
  | {
      kind: "message";
      key: string;
      message: MessageLike;
      mine: boolean;
      /** The last of a run from the same side within 2 minutes carries the time. */
      showMeta: boolean;
    };

const GROUP_MS = 2 * 60_000;

/** A message that reads as an automatic line rather than a bubble. */
function isAutomatic(m: MessageLike): boolean {
  return m.senderType === "system";
}

/**
 * Messages and automatic events merged by time, with a divider at each new day.
 * Consecutive bubbles from one side within 2 minutes share one time label (the last).
 */
export function buildStream(
  messages: readonly MessageLike[],
  events: readonly EventLine[],
  now: Date,
  tz: string,
): StreamItem[] {
  type Entry = { at: string; message?: MessageLike; event?: EventLine };
  const entries: Entry[] = [
    ...messages.map((m) => ({ at: m.createdAt, message: m })),
    ...events.map((e) => ({ at: e.at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const out: StreamItem[] = [];
  let lastDay: number | null = null;
  for (const entry of entries) {
    const day = dayNumber(entry.at, tz);
    if (day !== lastDay) {
      out.push({ kind: "day", key: `day-${day}`, label: dayLabel(entry.at, now, tz) });
      lastDay = day;
    }
    const m = entry.message;
    if (entry.event) {
      out.push({ kind: "event", key: `event-${entry.event.id}`, event: entry.event });
    } else if (m && isAutomatic(m)) {
      out.push({
        kind: "event",
        key: `msg-${m.id}`,
        event: {
          id: m.id,
          label: m.body,
          channel: "",
          at: m.createdAt,
          notification: null,
        },
      });
    } else if (m) {
      out.push({
        kind: "message",
        key: `msg-${m.id}`,
        message: m,
        mine: m.senderType !== "customer",
        showMeta: true,
      });
    }
  }

  for (let i = 0; i < out.length - 1; i += 1) {
    const cur = out[i]!;
    const next = out[i + 1]!;
    if (cur.kind !== "message" || next.kind !== "message") continue;
    const gap = Date.parse(next.message.createdAt) - Date.parse(cur.message.createdAt);
    if (cur.mine === next.mine && gap <= GROUP_MS && !failed(cur.message)) {
      cur.showMeta = false;
    }
  }
  return out;
}

function failed(m: MessageLike): boolean {
  return m.deliveryState === "failed";
}

export type MessageStatus =
  { tone: "muted"; text: string } | { tone: "error"; text: string; reason: string };

/** The words after the time on our bubbles. Null for the client's messages. */
export function messageStatus(m: MessageLike): MessageStatus | null {
  if (m.senderType === "customer") return null;
  if (m.id.startsWith("optimistic-") || m.deliveryState === "sending") {
    return { tone: "muted", text: "Sending…" };
  }
  if (m.deliveryState === "failed") {
    return { tone: "error", text: "Not delivered", reason: m.deliveryError ?? "Not delivered" };
  }
  if (m.readByCustomerAt) return { tone: "muted", text: "Read" };
  if (m.deliveryState === "delivered") return { tone: "muted", text: "Delivered" };
  return { tone: "muted", text: "Sent" };
}

/** How our bubble reads to a screen reader: who, when, what, then status in words. */
export function bubbleLabel(
  m: MessageLike,
  sender: string,
  tz: string,
  status: MessageStatus | null,
): string {
  const parts = [`${sender}, ${timeInTz(m.createdAt, tz)}: ${m.body}`];
  if (status) parts.push(status.text);
  return parts.join(". ");
}

/* ---------------- Reply box ---------------- */

export type ReplyChannel = "sms" | "email";

/**
 * The switch starts on the channel last used with this client, else their preference,
 * else whatever we can reach them by. Null when they have neither a mobile nor an email.
 */
export function defaultReplyChannel(
  messages: readonly MessageLike[],
  can: { sms: boolean; email: boolean },
  preferred?: string | null,
): ReplyChannel | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const ch = messages[i]!.channel;
    if (ch === "sms" && can.sms) return "sms";
    if (ch === "email" && can.email) return "email";
  }
  if (preferred === "sms" && can.sms) return "sms";
  if (preferred === "email" && can.email) return "email";
  if (can.sms) return "sms";
  if (can.email) return "email";
  return null;
}

/** "Re: {last subject}" or "Message from {business}". */
export function defaultSubject(messages: readonly MessageLike[], businessName: string): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const s = messages[i]!.subject?.trim();
    if (s) return /^re:/i.test(s) ? s : `Re: ${s}`;
  }
  return `Message from ${businessName}`;
}

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A time the client asked about ("move it to 11?", "is 2:30pm ok"), as "11:00". */
export function mentionedTime(text: string): string | null {
  const m =
    /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i.exec(text) ??
    /\b(\d{1,2})\s*(am|pm)\b/i.exec(text) ??
    /\b(?:to|at|for|about|around)\s+(\d{1,2})\b(?![:./]?\d)(?!\s*(?:st|nd|rd|th|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.exec(
      text,
    );
  if (!m) return null;
  let hour = Number(m[1]);
  const hasMinutes = m[2] !== undefined && /^\d{2}$/.test(m[2]);
  const minute = hasMinutes ? Number(m[2]) : 0;
  const meridiem = (hasMinutes ? m[3] : m[2])?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hhmm(hour, minute);
}

/**
 * Up to two one-tap replies to the client's last message. Plain rules, not AI: they
 * only fire on wording that clearly asks for one of these answers.
 */
/**
 * What the client said since our last reply, joined (they often send a question and a
 * follow-up line). Null once we've answered, so suggestions don't go stale.
 */
export function unansweredText(messages: readonly MessageLike[]): string | null {
  const run: string[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.senderType === "system" || m.isAnnouncement) continue;
    if (m.senderType !== "customer") break;
    run.unshift(m.body);
  }
  return run.length ? run.join("\n") : null;
}

export function quickReplies(lastIncoming: string | null | undefined): string[] {
  const text = lastIncoming?.trim() ?? "";
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: string[] = [];
  const time = mentionedTime(text);
  if (
    time &&
    /\b(move|change|swap|instead|work|ok|okay|free|available|possible|can i|could i)\b|\?/.test(
      lower,
    )
  ) {
    out.push(`Yes, ${time} works`, `Sorry, ${time} isn't free`);
  } else if (/\bcancel/.test(lower)) {
    out.push("No problem, I'll cancel it for you", "Would you like to move it instead?");
  } else if (/\b(running late|be late|stuck in traffic|few minutes late)\b/.test(lower)) {
    out.push("No problem, see you soon");
  } else if (/\b(how much|price|cost|quote)\b/.test(lower)) {
    out.push("I'll send you a quote shortly");
  } else if (/\b(thanks|thank you|cheers|ta)\b/.test(lower)) {
    out.push("You're welcome!", "See you soon");
  } else if (/\?\s*$/m.test(text)) {
    out.push("Let me check and get back to you");
  }
  return out.slice(0, 2);
}

/* ---------------- Client reachability ---------------- */

export type Reach = {
  sms: boolean;
  email: boolean;
  smsWhyNot: string | null;
  emailWhyNot: string | null;
};

/** Whether we can text or email this client, and if not, why (for tooltips). */
export function clientReach(
  customer: Pick<Customer, "phoneNormalised" | "emailNormalised" | "contactPreferences">,
): Reach {
  const optedOut = customer.contactPreferences?.operationalNotifications === false;
  const smsWhyNot = !customer.phoneNormalised
    ? "No mobile number on file"
    : optedOut
      ? "This client has opted out of texts"
      : null;
  const emailWhyNot = customer.emailNormalised ? null : "No email address on file";
  return { sms: smsWhyNot === null, email: emailWhyNot === null, smsWhyNot, emailWhyNot };
}

/* ---------------- Inbox rows ---------------- */

export type InboxPreviewInput = {
  lastMessage: { body: string; from: "staff" | "customer" } | null;
};

export function rowName(row: { customer: { firstName: string; lastName: string | null } }): string {
  return [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" ") || "Client";
}

export function inboxPreview(row: InboxPreviewInput): string {
  if (!row.lastMessage) return "";
  const body = row.lastMessage.body.replace(/\s+/g, " ").trim();
  return row.lastMessage.from === "staff" ? `You: ${body}` : body;
}

/** "Lily Booth, unread, needs reply, 06:21, Hi, can I move Saturday to 11?" */
export function inboxRowLabel(input: {
  name: string;
  unread: boolean;
  needsReply: boolean;
  time: string;
  preview: string;
}): string {
  return [
    input.name,
    input.unread ? "unread" : null,
    input.needsReply ? "needs reply" : null,
    input.time,
    input.preview || null,
  ]
    .filter(Boolean)
    .join(", ");
}

/* ---------------- Announcements ---------------- */

export type BroadcastAudienceKind = "all" | "upcoming_30d" | "lapsed_6m" | "list";
export type BroadcastChannelMode = "sms_else_email" | "email" | "sms";

/** Stand-ins while counting characters: names vary, so assume a typical one. */
const SAMPLE_FIRST_NAME = "Alexandra";

export function fillMergeFields(
  text: string,
  values: { firstName: string; bookingLink: string },
): string {
  return text
    .replace(/\{\s*first[ _]name\s*\}/gi, values.firstName.trim() || "there")
    .replace(/\{\s*booking[ _]link\s*\}/gi, values.bookingLink);
}

/**
 * The announcement counter: characters in one text as a client receives it (business
 * name first, opt-out link last, merge fields filled) and how many texts that is.
 */
export function announcementCounter(
  body: string,
  frame: { prefix: string; suffix: string },
  bookingLink: string,
): { units: number; limit: number; segments: number } {
  const filled = fillMergeFields(body, { firstName: SAMPLE_FIRST_NAME, bookingLink });
  const info = smsSegments(`${frame.prefix}${filled.trim()}${frame.suffix}`);
  return { units: info.units, limit: info.perSegment * info.segments, segments: info.segments };
}
