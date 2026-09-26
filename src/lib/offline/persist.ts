import type { Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { OFFLINE_CACHE_MAX_AGE_MS } from "@/lib/query-client";

/**
 * The query cache, saved to the device.
 *
 * Everything TanStack Query has fetched successfully is written to IndexedDB
 * (throttled) and restored on the next launch, so a booking looked at this
 * morning is still there in a basement this afternoon. Bump CACHE_VERSION when
 * the shape of API responses changes in a way old cached data can't satisfy.
 */
const KEY = "recavo.query-cache";
/** Part of the persister's `buster`; anything saved under another version is discarded. */
export const CACHE_VERSION = "1";

export const PERSIST_MAX_AGE_MS = OFFLINE_CACHE_MAX_AGE_MS;
/** Longest the app will wait for the saved cache before starting without it. */
const RESTORE_TIMEOUT_MS = 4000;

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export const queryPersister: Persister = {
  async persistClient(client: PersistedClient) {
    if (!hasIndexedDb()) return;
    try {
      await set(KEY, client);
    } catch {
      // Quota / private mode — the in-memory cache still works for this session.
    }
  },
  async restoreClient() {
    if (!hasIndexedDb()) return undefined;
    try {
      // IndexedDB can stall indefinitely in some WebViews (WebKit after a
      // background relaunch, a database mid-upgrade in another tab). The whole
      // app waits on this restore, so give it a bounded budget and start empty
      // rather than sit on the splash screen.
      const timeout = new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), RESTORE_TIMEOUT_MS),
      );
      return (await Promise.race([get<PersistedClient>(KEY), timeout])) ?? undefined;
    } catch {
      return undefined;
    }
  },
  async removeClient() {
    if (!hasIndexedDb()) return;
    try {
      await del(KEY);
    } catch {
      // Nothing to do; a failed delete just leaves stale data the buster will ignore.
    }
  },
};

/**
 * What gets saved: successful queries only, minus anything a hook marks
 * `meta: { persist: false }` (one-off lookups, availability probes, exports).
 */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;
  if (query.meta?.persist === false) return false;
  return true;
}

/** Sign-out: nothing of the business may remain on the device. */
export async function clearPersistedQueries(): Promise<void> {
  await queryPersister.removeClient();
}
