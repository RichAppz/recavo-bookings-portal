import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

/**
 * Browser journeys for the portal.
 *
 * The default run is hermetic: every `/api/v1/*` call and every Supabase call is
 * intercepted in the page, so the suite needs no backend, no database and no
 * network, and can be run on a laptop on a train or in CI unchanged. The
 * `smoke` project is the opposite — it drives the same app against a real
 * recavo-api on localhost — and is excluded unless asked for by name.
 *
 * Two browser projects rather than one, because the portal serves two
 * hostnames from a single Worker and behaves differently on each:
 * `dashboard.` is the staff console, `book.` is the customer surface. The
 * hostnames are real (in the reserved `.test` TLD) and mapped to loopback by
 * Chromium's own resolver, so no /etc/hosts entry and no sudo is needed.
 */
/**
 * Not 8080: that is the port `npm run dev` takes, and a suite that fought the
 * dev server for it would either fail to start or — worse — silently run
 * against whatever branch happened to be served there.
 */
/**
 * The smoke suite needs the opposite of everything below: a dev server pointed
 * at a real API rather than an unreachable one, and a browser that can actually
 * reach localhost:3000. Rather than a second config, the one switch changes
 * both, and the two runs use different ports so they can coexist.
 */
const SMOKE = !!process.env.SMOKE;

const PORT = Number(process.env.E2E_PORT ?? (SMOKE ? 8182 : 8181));
const STAFF_HOST = `http://dashboard.recavo.test:${PORT}`;
const CUSTOMER_HOST = `http://book.recavo.test:${PORT}`;

/**
 * `.env.test` merged over `.env`, handed to the dev server as real environment
 * variables rather than selected with `vite --mode test`.
 *
 * The mode is not free to change: TanStack Start only mounts its SSR handler
 * when the mode is `development`, and `--mode test` serves a bare 404 for every
 * route. Vite's own `loadEnv` applies `process.env` last, so injecting the
 * values wins over `.env` while leaving the mode — and the app — alone.
 */
const testEnv = SMOKE
  ? {
      // Vite proxies /api to this, so the portal talks to the local API the
      // same same-origin way it does in ordinary development.
      VITE_API_BASE_URL: process.env.SMOKE_API_URL ?? "http://localhost:3000",
      VITE_SUPABASE_URL: "https://recavo-test.supabase.co",
      VITE_SUPABASE_ANON_KEY: loadEnv("test", process.cwd(), "VITE_").VITE_SUPABASE_ANON_KEY ?? "",
    }
  : loadEnv("test", process.cwd(), "VITE_");

/**
 * Resolves every *.recavo.test name to loopback inside the browser only. The
 * second rule keeps the rest of the world unreachable, so an un-mocked request
 * fails immediately and loudly instead of hanging until the test times out.
 */
const hostResolver = [
  "--host-resolver-rules=MAP *.recavo.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
];

export default defineConfig({
  testDir: "./tests/e2e",
  // Every spec drives the UI, so a slow assertion is usually a missing mock
  // rather than a slow machine; keep the timeouts short enough to say so.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    testIdAttribute: "data-testid",
  },

  projects: [
    {
      name: "staff",
      testIgnore: ["**/customer/**", "**/smoke/**"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: STAFF_HOST,
        launchOptions: { args: hostResolver },
      },
    },
    {
      name: "customer",
      testIgnore: ["**/staff/**", "**/smoke/**"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: CUSTOMER_HOST,
        launchOptions: { args: hostResolver },
      },
    },
    {
      // Opt in with `npm run test:smoke`. Talks to a real API, so it is neither
      // hermetic nor parallel-safe, and it shares one seeded studio.
      name: "smoke",
      testMatch: ["**/smoke/**/*.spec.ts"],
      fullyParallel: false,
      workers: 1,
      // A real API is slower than a route handler, and a cold start slower
      // still.
      timeout: 90_000,
      use: {
        ...devices["Desktop Chrome"],
        // The customer host, because the booking journey is the half that
        // depends on hostname. The console is reachable from here too.
        baseURL: process.env.SMOKE_BASE_URL ?? CUSTOMER_HOST,
        // Only the `.test` mapping: unlike the mocked run this browser must be
        // able to reach the API on localhost.
        launchOptions: { args: ["--host-resolver-rules=MAP *.recavo.test 127.0.0.1"] },
      },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    env: testEnv,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
