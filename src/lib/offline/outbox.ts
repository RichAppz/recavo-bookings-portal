import {
  useMutationState,
  useQueryClient,
  type Mutation,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { request } from "@/lib/api/client";
import { ApiError, newIdempotencyKey, toastApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import type { Booking } from "@/lib/api/types";
import { isNetworkError } from "@/lib/query-client";

/**
 * The outbox: a small set of on-the-job actions that work without signal.
 *
 * Each is a POST the API already treats as idempotent (Idempotency-Key) and
 * version-checked (If-Match), so replaying later is safe and a colleague's
 * change in the meantime comes back as a 409 rather than being overwritten.
 *
 * Offline, the mutation pauses instead of failing; TanStack Query resumes it
 * when connectivity returns, and because paused mutations are persisted with the
 * query cache (see OfflineProvider) it survives the app being killed. The
 * mutationFn lives in `setMutationDefaults` so a mutation restored from disk
 * knows how to run — that is why the variables carry everything needed,
 * including the business id and the idempotency key minted when it was queued.
 */

export const OUTBOX_KEY = ["outbox", "api-post"] as const;

export type OutboxVariables = {
  /** Shown in toasts: "Marked Brad Ohair's job done". */
  label: string;
  path: string;
  body: unknown;
  ifMatch?: number;
  idempotencyKey: string;
  /** Query keys to refresh once the API has taken the change. */
  invalidate: QueryKey[];
  /** Booking to patch optimistically so the panel reflects the change straight away. */
  booking?: { businessId: string; bookingId: string; patch: Partial<Booking> };
};

type Result = { booking?: Booking };

export function registerOutboxMutations(qc: QueryClient): void {
  qc.setMutationDefaults(OUTBOX_KEY, {
    networkMode: "offlineFirst",
    // Only ever retry when the network is the problem; the retryer then parks
    // the mutation until onlineManager says we're back.
    retry: (_count: number, err: unknown) => isNetworkError(err),
    retryDelay: 1000,
    mutationFn: async (vars: OutboxVariables): Promise<Result> => {
      const res = await request<Result>({
        method: "POST",
        path: vars.path,
        body: vars.body,
        idempotencyKey: vars.idempotencyKey,
        ifMatch: vars.ifMatch,
      });
      return res.data;
    },
    onMutate: (vars: OutboxVariables) => {
      if (vars.booking) applyBookingPatch(qc, vars.booking);
    },
    onSuccess: (_data: Result, vars: OutboxVariables) => {
      for (const key of vars.invalidate) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: unknown, vars: OutboxVariables) => {
      for (const key of vars.invalidate) void qc.invalidateQueries({ queryKey: key });
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        toast.error(`Couldn't apply: ${vars.label}`, {
          id: `outbox-${vars.idempotencyKey}`,
          duration: Infinity,
          description:
            err.detail ??
            "The booking changed while you were offline. It has been refreshed — check it and try again.",
        });
        return;
      }
      if (!isNetworkError(err)) toastApiError(err);
    },
  });
}

type BookingsList = { bookings: Booking[] };

function isBookingsList(data: unknown): data is BookingsList {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { bookings?: unknown }).bookings)
  );
}

/**
 * Reflects a queued change in the cached booking and in every cached bookings
 * list that contains it, so the panel, the jobs list and the calendar all agree
 * while the change waits for signal.
 */
function applyBookingPatch(
  qc: QueryClient,
  { businessId, bookingId, patch }: NonNullable<OutboxVariables["booking"]>,
): void {
  qc.setQueryData<Booking>(queryKeys.booking(businessId, bookingId), (old) =>
    old ? { ...old, ...patch } : old,
  );
  qc.setQueriesData<unknown>(
    { queryKey: ["biz", businessId, "bookings"], predicate: (q) => isBookingsList(q.state.data) },
    (old: unknown) =>
      isBookingsList(old)
        ? {
            ...old,
            bookings: old.bookings.map((b) => (b.id === bookingId ? { ...b, ...patch } : b)),
          }
        : old,
  );
}

/**
 * After the cache is restored from disk, put the optimistic patches back for
 * every change still waiting to send — `onMutate` only runs when a mutation is
 * first fired, not when it is restored, and the list may have been written to
 * disk before the patch landed.
 */
export function reapplyQueuedPatches(qc: QueryClient): void {
  for (const m of qc.getMutationCache().findAll({ mutationKey: OUTBOX_KEY, status: "pending" })) {
    const vars = m.state.variables as OutboxVariables | undefined;
    if (m.state.isPaused && vars?.booking) applyBookingPatch(qc, vars.booking);
  }
}

/** How many changes are waiting for signal (pending or paused outbox mutations). */
export function useOutboxCount(): number {
  const pending = useMutationState({
    filters: { mutationKey: OUTBOX_KEY, status: "pending" },
    select: (m) => m.state.isPaused,
  });
  return pending.length;
}

/** Whether this booking has a change queued for when signal returns. */
export function useBookingQueued(bookingId: string | undefined): boolean {
  const queued = useMutationState({
    filters: {
      mutationKey: OUTBOX_KEY,
      status: "pending",
      predicate: (m) =>
        (m.state.variables as OutboxVariables | undefined)?.booking?.bookingId === bookingId,
    },
    select: (m) => m.state.isPaused,
  });
  return bookingId !== undefined && queued.length > 0;
}

export type OutboxOutcome = { queued: true } | { queued: false; data: Result };

/**
 * Sends an outbox action. Online it behaves like an ordinary awaited mutation
 * (errors throw for the caller to explain). When there is no signal — known up
 * front, or discovered when the request dies — it resolves `{ queued: true }`
 * as soon as the mutation parks, so buttons don't spin until the van leaves the
 * basement.
 */
export function useOutbox() {
  const qc = useQueryClient();
  return useCallback(
    (vars: Omit<OutboxVariables, "idempotencyKey">): Promise<OutboxOutcome> => {
      const full: OutboxVariables = { ...vars, idempotencyKey: newIdempotencyKey() };
      const cache = qc.getMutationCache();
      const mutation = cache.build(qc, {
        ...qc.getMutationDefaults(OUTBOX_KEY),
        mutationKey: [...OUTBOX_KEY],
      }) as Mutation<Result, unknown, OutboxVariables>;

      return new Promise<OutboxOutcome>((resolve, reject) => {
        let settled = false;
        const unsubscribe = cache.subscribe((event) => {
          if (settled || event.mutation !== mutation) return;
          if (event.type === "updated" && mutation.state.isPaused) {
            settled = true;
            unsubscribe();
            resolve({ queued: true });
          }
        });
        mutation
          .execute(full)
          .then((data) => {
            if (settled) return;
            settled = true;
            unsubscribe();
            resolve({ queued: false, data });
          })
          .catch((err: unknown) => {
            if (settled) return;
            settled = true;
            unsubscribe();
            reject(err);
          });
      });
    },
    [qc],
  );
}

/** Standard "it'll go when you're back" notice. */
export function toastQueued(label: string): void {
  toast(label, {
    description:
      "No signal right now — saved on this device and sent as soon as you're back online.",
    duration: 6000,
  });
}
