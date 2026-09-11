import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/api/token";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";
import { openLiveStream } from "./live-updates";
import { setLiveStatus } from "./live-status";
import { queryKeysForLiveEvent } from "./sse";

/** Bursts (a confirmation sends an email, a text and records both) coalesce into one refetch per key. */
const COALESCE_MS = 250;

/**
 * Mount once in the staff shell. Subscribes to the business's live-updates stream
 * and turns each hint into `invalidateQueries`, so the credit balance, booking
 * message history, bookings and invoices refresh the moment the API records a
 * change — no refresh, no focus needed. Not mounted on customer surfaces.
 */
export function useLiveUpdates() {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const { businessId } = useTenant();

  useEffect(() => {
    if (status !== "authenticated" || !businessId) {
      setLiveStatus("idle");
      return;
    }
    const controller = new AbortController();
    const pending = new Map<string, readonly unknown[]>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      const keys = [...pending.values()];
      pending.clear();
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    openLiveStream({
      businessId,
      getToken: getAccessToken,
      signal: controller.signal,
      onStatus: (next) => setLiveStatus(next),
      onEvent: (event) => {
        for (const key of queryKeysForLiveEvent(event)) {
          pending.set(JSON.stringify(key), key);
        }
        if (!flushTimer) flushTimer = setTimeout(flush, COALESCE_MS);
      },
    });

    return () => {
      controller.abort();
      if (flushTimer) clearTimeout(flushTimer);
      setLiveStatus("idle");
    };
  }, [queryClient, status, businessId]);
}
