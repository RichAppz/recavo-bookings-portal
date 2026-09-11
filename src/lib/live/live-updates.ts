import { getApiBaseUrl } from "@/lib/api/client";
import { backoffDelayMs, createSseParser, parseLiveEvent, type LiveEvent } from "./sse";

export type LiveStreamStatus = "connecting" | "connected" | "disconnected" | "paused";

export type OpenLiveStreamOptions = {
  businessId: string;
  /** Bearer token at connect time; re-read on every (re)connect so refreshes are picked up. */
  getToken: () => string | null;
  onEvent: (event: LiveEvent) => void;
  onStatus?: (status: LiveStreamStatus, detail?: { consecutiveFailures: number }) => void;
  /** Aborting closes the stream and stops reconnecting. */
  signal: AbortSignal;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  documentRef?: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  > | null;
};

/** How long a tab may stay hidden before the stream is dropped to save the connection. */
export const HIDDEN_PAUSE_MS = 60_000;
/** Past this many failures in a row the app is treated as running without push. */
export const FALLBACK_AFTER_FAILURES = 3;
/** Log (once) when the stream has been down this long — no banner, by design. */
const LOG_OUTAGE_AFTER_MS = 60_000;
/**
 * The server writes a `: keepalive` comment every 25s. If nothing at all arrives for
 * this long the connection is half-open (dead proxy, dropped mobile link) and is torn
 * down so the normal reconnect path takes over.
 */
export const STALL_TIMEOUT_MS = 65_000;

/**
 * Opens `GET /businesses/:id/live` and keeps it open: `fetch` + `ReadableStream`
 * rather than `EventSource`, which cannot send the `Authorization` header.
 *
 * - Reconnects with jittered exponential backoff (1s → 30s), reset once the server's
 *   `hello` arrives.
 * - Pauses after the tab has been hidden for {@link HIDDEN_PAUSE_MS} and reconnects
 *   the moment it is visible again (the `hello` on reconnect is the catch-up).
 * - Never throws: a failing stream reports `disconnected` and the caller keeps the
 *   app working exactly as without push.
 */
export function openLiveStream(options: OpenLiveStreamOptions): void {
  const {
    businessId,
    getToken,
    onEvent,
    onStatus,
    signal,
    fetchImpl = fetch,
    documentRef = typeof document === "undefined" ? null : document,
  } = options;
  const url = `${getApiBaseUrl()}/api/v1/businesses/${businessId}/live`;

  let attempt = 0;
  let consecutiveFailures = 0;
  let current: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let downSince: number | null = null;
  let outageLogged = false;

  const report = (status: LiveStreamStatus) => {
    if (signal.aborted) return;
    onStatus?.(status, { consecutiveFailures });
  };

  const noteFailure = () => {
    consecutiveFailures += 1;
    downSince ??= Date.now();
    if (!outageLogged && Date.now() - downSince >= LOG_OUTAGE_AFTER_MS) {
      outageLogged = true;
      console.warn(
        `[live] updates stream has been unavailable for over a minute (${consecutiveFailures} attempts); falling back to polling`,
      );
    }
  };

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (signal.aborted || paused || reconnectTimer) return;
    const delay = backoffDelayMs(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async (): Promise<void> => {
    if (signal.aborted || paused) return;
    const controller = new AbortController();
    current = controller;
    report("connecting");

    const token = getToken();
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetchImpl(url, { headers, signal: controller.signal, cache: "no-store" });
    } catch {
      if (controller.signal.aborted) return;
      noteFailure();
      report("disconnected");
      scheduleReconnect();
      return;
    }

    if (!response.ok || !response.body) {
      noteFailure();
      report("disconnected");
      // A 4xx will not fix itself in a second (no route, no membership, stale token):
      // skip straight to the long delay instead of hammering the API.
      if (response.status >= 400 && response.status < 500) attempt = Math.max(attempt, 5);
      scheduleReconnect();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser();
    let sawHello = false;
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, STALL_TIMEOUT_MS);
    };
    armStallTimer();

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        armStallTimer();
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          const event = parseLiveEvent(message);
          if (!event || event.businessId !== businessId) continue;
          if (event.type === "hello") {
            sawHello = true;
            attempt = 0;
            consecutiveFailures = 0;
            downSince = null;
            outageLogged = false;
            report("connected");
          }
          onEvent(event);
        }
      }
    } catch {
      // Network drop, stall watchdog, or our own abort — handled below.
    }

    if (stallTimer) clearTimeout(stallTimer);
    if (controller.signal.aborted && !stalled) return;
    if (current === controller) current = null;
    // The server ended the stream (deploy, proxy idle timeout) or it went quiet. A
    // stream that never said hello counts as a failure; one that did is just a reconnect.
    if (!sawHello) noteFailure();
    report("disconnected");
    scheduleReconnect();
  };

  const dropCurrent = () => {
    clearReconnect();
    if (current) {
      current.abort();
      current = null;
    }
  };

  const onVisibility = () => {
    if (!documentRef) return;
    if (documentRef.visibilityState === "hidden") {
      if (hiddenTimer) return;
      hiddenTimer = setTimeout(() => {
        hiddenTimer = null;
        paused = true;
        dropCurrent();
        report("paused");
      }, HIDDEN_PAUSE_MS);
      return;
    }
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
    if (paused) {
      paused = false;
      attempt = 0;
      void connect();
    }
  };

  documentRef?.addEventListener("visibilitychange", onVisibility);
  signal.addEventListener(
    "abort",
    () => {
      documentRef?.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      dropCurrent();
    },
    { once: true },
  );

  void connect();
}
