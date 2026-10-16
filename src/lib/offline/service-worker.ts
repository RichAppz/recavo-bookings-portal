/**
 * Registers /sw.js (built by scripts/build-sw.mjs).
 *
 * A new deploy installs a fresh worker that waits until every tab from the old
 * one has closed, then takes over on the next start. Nobody is asked to reload:
 * pages and un-cached assets come from the network anyway, so the running app
 * already shows the latest deploy; only the offline shell lags until the next
 * cold start. Dev builds and environments without service workers (Lovable
 * preview, old WebViews) simply skip this.
 *
 * `workbox-window` is loaded only once those guards pass: it is a CommonJS
 * package, and importing it at module level breaks the dev server's SSR pass
 * ("Named export 'Workbox' not found") even though it is never used there.
 */
let registered = false;

export function registerServiceWorker(): void {
  if (registered) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  registered = true;

  void import("workbox-window")
    .then(({ Workbox }) => new Workbox("/sw.js", { scope: "/" }).register())
    .catch(() => {
      // Registration failing (e.g. an iOS WebView without app-bound domains) just
      // means no offline mode; the app keeps working as before.
      registered = false;
    });
}
