import { useSyncExternalStore } from "react";

/**
 * Connection state of the live-updates stream, kept outside React so the stream
 * client can set it and any hook can read it. `useSmsCredits` uses it to fall back
 * to polling only while the push channel is *not* delivering.
 */
export type LiveStatus = "idle" | "connecting" | "connected" | "disconnected" | "paused";

let status: LiveStatus = "idle";
const listeners = new Set<() => void>();

export function getLiveStatus(): LiveStatus {
  return status;
}

export function setLiveStatus(next: LiveStatus) {
  if (status === next) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeLiveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(subscribeLiveStatus, getLiveStatus, () => "idle" as const);
}

/** True while hints are flowing, so callers can skip their polling fallback. */
export function useLiveConnected(): boolean {
  return useLiveStatus() === "connected";
}
