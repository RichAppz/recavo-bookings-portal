import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";

/** A fetch that never got a response — no signal, DNS dead, request torn down by the OS. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0 && error.code === "NETWORK_ERROR";
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  // No network: the API client has just flipped onlineManager offline, so asking
  // for a retry parks the query (data intact) until connectivity returns instead of
  // erroring the page. See lib/offline/network.ts.
  if (isNetworkError(error)) return true;
  if (error instanceof ApiError) {
    // Never retry auth / validation / conflict / MFA — client must act.
    if (
      error.status === 0 ||
      error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 409 ||
      error.status === 422
    ) {
      return false;
    }
  }
  return failureCount < 2;
}

/**
 * How long data is kept once nothing is looking at it. Long on purpose: the
 * cache is persisted to the device (lib/offline/persist.ts) so someone out on
 * the road can open the app without signal and see what they loaded earlier.
 * Must be at least the persister's maxAge or restored entries are dropped.
 */
export const OFFLINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: OFFLINE_CACHE_MAX_AGE_MS,
        refetchOnWindowFocus: true,
        // Try the network even when the OS says offline (it is often wrong), and
        // pause — rather than fail — when it really is unreachable.
        networkMode: "offlineFirst",
        retry: shouldRetry,
      },
      mutations: {
        // Non-idempotent mutations must not auto-retry; idempotent ones reuse the key.
        retry: false,
        networkMode: "offlineFirst",
      },
    },
  });
}
