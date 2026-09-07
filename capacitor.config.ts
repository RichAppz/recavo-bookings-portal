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
 * Override the target with CAP_SERVER_URL, e.g. to test local web changes on a
 * simulator before they are deployed (the iOS simulator shares the Mac's
 * network, so localhost resolves to the Vite dev server):
 *
 *   CAP_SERVER_URL=http://localhost:8080 npx cap run ios
 *   CAP_SERVER_URL=https://staging.bookings.recavo.app npx cap run ios
 *
 * Re-run `npx cap sync` (or `cap run`) without the variable to point the native
 * projects back at production before committing / archiving a release build.
 */
const serverUrl = process.env.CAP_SERVER_URL || "https://bookings.recavo.app";

const config: CapacitorConfig = {
  appId: "app.recavo.portal",
  appName: "RECAVO Portal",
  webDir: "mobile/www",
  server: {
    url: serverUrl,
    // Plain http is only allowed for local dev servers.
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
