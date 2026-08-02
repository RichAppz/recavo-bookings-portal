import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";

function shouldRetry(failureCount: number, error: unknown): boolean {
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

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
      mutations: {
        // Non-idempotent mutations must not auto-retry; idempotent ones reuse the key.
        retry: false,
      },
    },
  });
}
