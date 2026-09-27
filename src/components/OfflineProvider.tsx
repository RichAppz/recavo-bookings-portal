import { useQueryClient } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  type PersistQueryClientProviderProps,
} from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useOnline } from "@/lib/offline/network";
import {
  reapplyQueuedPatches,
  registerOutboxMutations,
  useOutboxCount,
} from "@/lib/offline/outbox";
import {
  CACHE_VERSION,
  PERSIST_MAX_AGE_MS,
  queryPersister,
  shouldPersistQuery,
} from "@/lib/offline/persist";
import { registerServiceWorker } from "@/lib/offline/service-worker";
import { cn } from "@/lib/utils";

/**
 * Wraps the app in the persisted query cache, starts the service worker and
 * shows the connectivity strip. Replaces the plain QueryClientProvider in the
 * root route; on the server the persister is a no-op so SSR is unchanged.
 */
export function OfflineProvider({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  const persistOptions = useMemo<PersistQueryClientProviderProps["persistOptions"]>(
    () => ({
      persister: queryPersister,
      maxAge: PERSIST_MAX_AGE_MS,
      buster: CACHE_VERSION,
      dehydrateOptions: {
        shouldDehydrateQuery: shouldPersistQuery,
        // Paused mutations (the outbox) travel with the cache so a queued
        // "job done" survives the app being killed before signal came back.
        shouldDehydrateMutation: (m) => m.state.isPaused,
      },
    }),
    [],
  );

  useEffect(() => {
    registerOutboxMutations(queryClient);
    registerServiceWorker();
  }, [queryClient]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Deliberately not returned: the provider awaits onSuccess before it
        // clears `isRestoring`, and while offline a paused mutation never
        // settles — the whole app would sit on skeletons until signal returned.
        reapplyQueuedPatches(queryClient);
        void queryClient.resumePausedMutations();
      }}
    >
      {children}
      <ConnectivityStrip />
    </PersistQueryClientProvider>
  );
}

/**
 * Thin strip under the status bar while offline, and a brief "back online,
 * syncing" when connectivity returns with work queued.
 */
function ConnectivityStrip() {
  const online = useOnline();
  const queued = useOutboxCount();
  const queryClient = useQueryClient();
  const [showBack, setShowBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowBack(false);
      return;
    }
    if (!wasOffline) return;
    setShowBack(true);
    void queryClient.invalidateQueries();
    const t = setTimeout(() => {
      setShowBack(false);
      setWasOffline(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [online, wasOffline, queryClient]);

  if (online && !showBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto mt-1 flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium shadow-md",
          online ? "bg-success text-success-foreground" : "bg-foreground text-background",
        )}
      >
        {online ? (
          <>
            <RefreshCw className="size-3.5 animate-spin" aria-hidden />
            {queued > 0
              ? `Back online — sending ${queued} change${queued === 1 ? "" : "s"}`
              : "Back online — refreshing"}
          </>
        ) : (
          <>
            <CloudOff className="size-3.5" aria-hidden />
            {queued > 0
              ? `Offline — showing saved data · ${queued} change${queued === 1 ? "" : "s"} waiting to send`
              : "Offline — showing saved data"}
          </>
        )}
      </div>
    </div>
  );
}
