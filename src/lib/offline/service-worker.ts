import { toast } from "sonner";

/**
 * Registers /sw.js (built by scripts/build-sw.mjs) and handles updates.
 *
 * A new deploy installs a fresh worker that waits. We tell the person and let
 * them choose when to reload, so a half-filled form isn't lost to an update; the
 * next cold start picks it up regardless. Dev builds and environments without
 * service workers (Lovable preview, old WebViews) simply skip this.
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
    .then(({ Workbox }) => start(new Workbox("/sw.js", { scope: "/" })))
    .catch(() => {
      registered = false;
    });
}

function start(wb: import("workbox-window").Workbox): void {
  // A worker is waiting either because we just found an update, or because one
  // was already parked from an earlier visit.
  wb.addEventListener("waiting", () => {
    toast("A new version of RECAVO is ready", {
      id: "sw-update",
      duration: Infinity,
      description: "Reload to get the latest changes. Your work is saved.",
      action: {
        label: "Reload",
        onClick: () => {
          wb.addEventListener("controlling", () => window.location.reload());
          wb.messageSkipWaiting();
        },
      },
    });
  });

  void wb.register().catch(() => {
    // Registration failing (e.g. an iOS WebView without app-bound domains) just
    // means no offline mode; the app keeps working as before.
    registered = false;
  });
}
