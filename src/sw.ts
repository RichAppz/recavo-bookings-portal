/// <reference lib="webworker" />
/**
 * RECAVO service worker — the offline app shell.
 *
 * Built by scripts/build-sw.mjs into .output/public/sw.js after the app build,
 * which also injects the precache manifest (every hashed asset + the shell page).
 *
 * What it does:
 *  - Precaches the JS/CSS bundle and `/app-shell` so every page's code is on the
 *    device after the first visit.
 *  - Navigations go to the network first (real SSR, fresh meta). When the network
 *    fails or takes longer than NAV_TIMEOUT_MS — no signal, or one bar in a car
 *    park — the cached shell is served and the client router renders the page
 *    from the bundle. Data then comes from the persisted query cache.
 *  - Google Fonts are cached so type doesn't fall back offline.
 *  - API calls are never cached here: TanStack Query owns data (and its auth).
 *
 * Updates: a new deploy installs a new worker that waits until the page asks it
 * to take over (see src/lib/offline/service-worker.ts), so a session is never
 * half old bundle, half new.
 */
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const SHELL_URL = "/app-shell";
/** Past this the page is considered unreachable and the shell is used instead. */
const NAV_TIMEOUT_MS = 6000;

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

/** Paths that are not app pages and must never get the shell. */
const NOT_A_PAGE = [
  /^\/api\//,
  /^\/_serverFn\//,
  /^\/auth\//,
  /^\/native\//,
  /^\/sw\.js$/,
  /\.[a-z0-9]{2,5}$/i, // anything with a file extension
];

registerRoute(
  new NavigationRoute(
    async ({ event, request }) => {
      const fetchEvent = event as FetchEvent;
      try {
        return await fetchWithTimeout(request, fetchEvent.preloadResponse, NAV_TIMEOUT_MS);
      } catch {
        const shell = await matchPrecache(SHELL_URL);
        if (shell) return shell;
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    },
    { denylist: NOT_A_PAGE },
  ),
);

async function fetchWithTimeout(
  request: Request,
  preload: Promise<Response | undefined> | undefined,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const preloaded = preload ? await preload : undefined;
    if (preloaded) return preloaded;
    const res = await fetch(request, { signal: controller.signal });
    // A 5xx from the edge while offline-ish is no better than no response.
    if (res.status >= 500) throw new Error(`upstream ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Google Fonts: stylesheet revalidates in the background, font files are immutable.
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "google-fonts-css" }),
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-files",
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  }),
);

// Same-origin images that aren't part of the hashed bundle (logo, icons).
registerRoute(
  ({ url, request }) => url.origin === self.location.origin && request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "static-images",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

// ---------------------------------------------------------------------------
// Web Push (src/lib/push). The API sends a JSON payload shaped like PushMessage:
// { title, body, link, businessId, notificationId, tag }. We show it, and on click
// hand the data to an open tab (or open one) so the page can navigate in-app.

/** Must match PUSH_OPEN_MESSAGE in src/lib/push/push-support.ts. */
const PUSH_OPEN_MESSAGE = "recavo:push-open";

type PushPayload = {
  title?: string;
  body?: string;
  link?: string | null;
  businessId?: string | null;
  notificationId?: string | null;
  tag?: string | null;
};

function safeLink(link: unknown): string | null {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() as PushPayload) ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const data = {
    link: safeLink(payload.link),
    businessId: payload.businessId ?? null,
    notificationId: payload.notificationId ?? null,
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || "RECAVO", {
      body: payload.body || "",
      icon: "/apple-touch-icon.png",
      data,
      ...(payload.tag ? { tag: payload.tag, renotify: true } : {}),
    } as NotificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as {
    link?: string | null;
    businessId?: string | null;
    notificationId?: string | null;
  };
  const target = `${self.location.origin}${data.link ?? "/"}`;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: PUSH_OPEN_MESSAGE, data });
        return;
      }
      // No tab open: the page boots from the link itself; businessId/notificationId
      // ride along in the hash so PushBootstrap can still switch and mark read.
      const params = new URLSearchParams();
      if (data.businessId) params.set("businessId", data.businessId);
      if (data.notificationId) params.set("notificationId", data.notificationId);
      const extra = params.toString();
      await self.clients.openWindow(extra ? `${target}#push=${encodeURIComponent(extra)}` : target);
    })(),
  );
});

/** Only seen if the shell was never cached (first ever visit happened offline). */
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>RECAVO — offline</title>
<style>html,body{margin:0;height:100%;background:#0b0b0f;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;text-align:center;padding:2rem}
h1{font-size:1.25rem;margin:0}p{margin:0;color:#9ca3af;max-width:22rem}button{margin-top:.5rem;padding:.6rem 1.2rem;border-radius:.6rem;border:0;background:#22c55e;color:#052e16;font-weight:600}</style></head>
<body><div class="w"><h1>You're offline</h1><p>RECAVO needs to load once with signal before it can work offline. Try again when you're connected.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;
