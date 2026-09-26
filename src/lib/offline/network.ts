import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * Connectivity as the app experiences it, not as the OS reports it.
 *
 * `navigator.onLine` is true on one bar in a car park while every request dies,
 * so the API client calls `reportNetworkFailure()` whenever a fetch fails outright
 * and we flip TanStack Query's onlineManager to offline ourselves. Queries then
 * pause (keeping their data) instead of erroring, and a probe brings us back the
 * moment a tiny request gets through. The browser's own online/offline events are
 * honoured too — onlineManager already listens for them.
 */

const PROBE_EVERY_MS = 8000;
const PROBE_TIMEOUT_MS = 5000;

let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeUrl = "/favicon.ico";

/** Where to poke to see if we're back. Same origin by default; the app sets the API health URL. */
export function setConnectivityProbeUrl(url: string) {
  probeUrl = url;
}

export function isOnline(): boolean {
  return onlineManager.isOnline();
}

/** Called by the API client on a failed fetch (status 0). */
export function reportNetworkFailure(): void {
  if (typeof window === "undefined") return;
  if (onlineManager.isOnline()) onlineManager.setOnline(false);
  scheduleProbe();
}

/** Called by the API client on any completed response, however it went. */
export function reportNetworkSuccess(): void {
  if (typeof window === "undefined") return;
  if (!onlineManager.isOnline()) onlineManager.setOnline(true);
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
}

function scheduleProbe() {
  if (probeTimer) return;
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    if (onlineManager.isOnline()) return;
    if (await probe()) reportNetworkSuccess();
    else scheduleProbe();
  }, PROBE_EVERY_MS);
}

async function probe(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const res = await fetch(probeUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/** React view of the same flag; re-renders on change. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof window === "undefined" ? true : onlineManager.isOnline(),
  );
  useEffect(() => {
    setOnline(onlineManager.isOnline());
    return onlineManager.subscribe(setOnline);
  }, []);
  return online;
}
