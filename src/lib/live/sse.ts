/**
 * Pure pieces of the live-updates client (no DOM, no fetch) so they run under
 * `node --test`: SSE framing, reconnect backoff, and the event → query-key map.
 */
import { queryKeys } from "../api/query-keys.ts";

export type SseMessage = {
  event: string;
  data: string;
  id: string | null;
};

/**
 * Incremental parser for `text/event-stream` (WHATWG HTML §9.2.6). Feed it decoded
 * chunks as they arrive — frames may split anywhere — and it returns every complete
 * message. Comment lines (`: keepalive`) and unknown fields are ignored; multiple
 * `data:` lines join with `\n`; a frame without `data` is dropped, as the spec says.
 */
export function createSseParser() {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let id: string | null = null;

  function dispatch(out: SseMessage[]) {
    if (data.length > 0) {
      out.push({ event: event || "message", data: data.join("\n"), id });
    }
    event = "";
    data = [];
  }

  function handleLine(line: string, out: SseMessage[]) {
    if (line === "") {
      dispatch(out);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        data.push(value);
        break;
      case "id":
        // A NUL in the id means "ignore", per spec.
        if (!value.includes("\0")) id = value;
        break;
      default:
        // `retry:` and anything else: not used by this client.
        break;
    }
  }

  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk;
      const out: SseMessage[] = [];
      // Normalise CRLF/CR line endings, then consume every complete line.
      let idx: number;
      while ((idx = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, idx);
        const sep = buffer.startsWith("\r\n", idx) ? 2 : 1;
        buffer = buffer.slice(idx + sep);
        handleLine(line, out);
      }
      return out;
    },
  };
}

export type LiveEventType =
  "hello" | "sms_credits.changed" | "notification.recorded" | "booking.changed" | "invoice.changed";

export type LiveEvent = {
  type: LiveEventType;
  businessId: string;
  bookingId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
};

const LIVE_EVENT_TYPES = new Set<string>([
  "hello",
  "sms_credits.changed",
  "notification.recorded",
  "booking.changed",
  "invoice.changed",
]);

/** Turns a raw SSE frame into a typed hint, or null for anything we do not recognise. */
export function parseLiveEvent(message: SseMessage): LiveEvent | null {
  if (!LIVE_EVENT_TYPES.has(message.event)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.businessId !== "string" || !raw.businessId) return null;
  const optional = (key: "bookingId" | "customerId" | "invoiceId") =>
    typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : null;
  return {
    type: message.event as LiveEventType,
    businessId: raw.businessId,
    bookingId: optional("bookingId"),
    customerId: optional("customerId"),
    invoiceId: optional("invoiceId"),
  };
}

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;

/**
 * Jittered exponential backoff: 1s, 2s, 4s … capped at 30s, each multiplied by a
 * random factor in [0.5, 1.5) so a fleet of tabs does not reconnect in lockstep
 * after a deploy. `random` is injectable for tests.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 0.5 + random();
  return Math.round(Math.min(BACKOFF_CAP_MS, exp * jitter));
}

/**
 * Which cached queries a hint should refresh. Prefix keys are deliberate: the
 * bookings prefix covers every list filter, the calendar range queries, booking
 * detail and history in one invalidation. `hello` is the catch-up after a
 * (re)connect, so it is the union of everything the stream can move.
 */
export function queryKeysForLiveEvent(event: LiveEvent): readonly (readonly unknown[])[] {
  const biz = event.businessId;
  const bookingsPrefix = queryKeys.bookings(biz).slice(0, 3);
  const notificationsPrefix = queryKeys.notifications(biz).slice(0, 3);
  const invoicesPrefix = queryKeys.invoice(biz, "").slice(0, 3);
  const dashboardPrefix = queryKeys.dashboard(biz).slice(0, 4);
  switch (event.type) {
    case "hello":
      return [
        queryKeys.smsCredits(biz),
        bookingsPrefix,
        queryKeys.calendarBlocksAll(biz),
        invoicesPrefix,
        notificationsPrefix,
        dashboardPrefix,
      ];
    case "sms_credits.changed":
      return [queryKeys.smsCredits(biz)];
    case "notification.recorded": {
      const keys: (readonly unknown[])[] = [notificationsPrefix];
      // History only: the booking detail key is a prefix of history/payments and
      // would refetch all three for what is just a new message row.
      if (event.bookingId) keys.push(queryKeys.bookingHistory(biz, event.bookingId));
      if (event.customerId) keys.push(queryKeys.customerNotifications(biz, event.customerId));
      return keys;
    }
    case "booking.changed":
      return [bookingsPrefix, dashboardPrefix];
    case "invoice.changed": {
      const keys: (readonly unknown[])[] = [invoicesPrefix];
      if (event.bookingId) keys.push(queryKeys.booking(biz, event.bookingId));
      return keys;
    }
    default:
      return [];
  }
}
