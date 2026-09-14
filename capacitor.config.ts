import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the RECAVO Portal mobile shell (iOS + Android).
 *
 * STARTER APPROACH — remote URL wrapper:
 * The web app is TanStack Start (SSR) deployed to Cloudflare, so there is no
 * static SPA bundle to ship inside the app. To get running on a simulator
 * quickly, the native shell loads the live hosted portal over HTTPS via
 * `server.url`. The `webDir` below is only a local splash fallback that shows
 * while the remote page loads (or if the device is offline).
 *
 * Trade-offs of the remote-URL approach:
 *   - Needs network connectivity; there is no offline mode yet.
 *   - Apple review guideline 4.2 can reject a pure website wrapper, so before
 *     App Store submission add real native features (push, camera, biometrics).
 *
 * NEXT STEP (offline / store-friendly) — bundle a static client build:
 *   Produce a client-only build of the frontend, point `webDir` at it, remove
 *   the `server` block, and run `npx cap sync`. Then the UI ships inside the
 *   app and only API calls go over the network.
 *
 * Which portal the shell loads:
 *
 *   default                      staging  — every dev/simulator build, so the app
 *                                           is tested against what is about to ship
 *   CAP_ENV=production           production — only for App Store / Play release
 *                                           builds (npm run cap:sync:production)
 *   CAP_SERVER_URL=<url>         anything else, e.g. the local Vite dev server
 *                                           (the iOS simulator shares the Mac's
 *                                           network, so localhost resolves)
 *
 *   CAP_SERVER_URL=http://localhost:8080 npx cap run ios
 *
 * `npx cap sync` bakes the URL into the native projects, so re-run it (via the
 * matching npm script) before archiving a release build.
 */
const SERVER_URLS = {
  staging: "https://staging.bookings.recavo.app",
  production: "https://bookings.recavo.app",
} as const;

const serverUrl =
  process.env.CAP_SERVER_URL ||
  (process.env.CAP_ENV === "production" ? SERVER_URLS.production : SERVER_URLS.staging);

const config: CapacitorConfig = {
  appId: "app.recavo.portal",
  appName: "RECAVO",
  webDir: "mobile/www",
  server: {
    url: serverUrl,
    // Plain http is only allowed for local dev servers.
    cleartext: serverUrl.startsWith("http://"),
    // Hosts the WebView may navigate to in-app. Anything else is handed to the
    // system browser, and once there Stripe's success/cancel/return redirects to
    // our origin would land in Safari rather than back in the app. Stripe Checkout
    // (subscriptions, SMS credits), the Billing Portal and Connect onboarding all
    // redirect back to our own origin, so keeping them in the WebView completes the
    // round trip inside the app.
    allowNavigation: ["*.stripe.com"],
  },
};

export default config;
