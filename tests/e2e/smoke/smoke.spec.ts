import { existsSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * Three tests against a real `recavo-api`, run by hand.
 *
 * Everything else in `tests/e2e` runs against a mock, which makes it fast and
 * hermetic and gives it one blind spot: it cannot tell when the mock and the
 * server have drifted apart. That is the only thing this suite is for, so it
 * checks the three shapes the mock gets most wrong — the console's own data,
 * public availability, and the customer's view — and stops there.
 *
 * Run `npm run seed:demo` against a local API first. See the README for how to
 * bring one up. Without a seed file, these skip rather than fail: a red suite
 * that only means "the API isn't running" trains people to ignore red suites.
 */

type Seed = {
  apiUrl: string;
  ownerEmail: string;
  ownerSub: string;
  businessId: string;
  slug: string | null;
  billingAccessState: string | null;
  services: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  packageId: string;
  bookings: string[];
};

const SEED_FILE = ".smoke-seed.json";
const seed: Seed | null = existsSync(SEED_FILE)
  ? (JSON.parse(readFileSync(SEED_FILE, "utf8")) as Seed)
  : null;

test.skip(!seed, `No ${SEED_FILE}. Start a local recavo-api and run \`npm run seed:demo\` first.`);

const SUPABASE_HOST = "recavo-test.supabase.co";
const STORAGE_KEY = "sb-recavo-test-auth-token";

/**
 * `baseURL` is the customer host, since the booking journey is the half that
 * depends on the hostname. Console pages are asked for by absolute URL rather
 * than relying on the router serving staff routes from the booking host.
 */
const STAFF_ORIGIN = (process.env.SMOKE_BASE_URL ?? "http://book.recavo.test:8182").replace(
  "book.",
  "dashboard.",
);

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * The same token the seed script minted, signed with the same secret.
 *
 * This is the one place in the suite where the signature has to be real: the
 * API verifies it. The mocked suite gets away with a fixed dummy signature
 * because nothing there ever checks.
 */
function realToken(): string {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "local-test-secret";
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: seed!.ownerSub,
      email: seed!.ownerEmail,
      email_verified: true,
      aud: "authenticated",
      role: "authenticated",
      aal: "aal1",
      session_id: "smoke-session",
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Signs the owner in without stubbing the API.
 *
 * Supabase's own endpoints are still stubbed — there is no Supabase project in
 * a local run, and the token is minted here. What is *not* stubbed is
 * `/api/v1/**`, which is the entire point.
 */
async function signInForReal(page: import("@playwright/test").Page) {
  const token = realToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: seed!.ownerSub,
    aud: "authenticated",
    role: "authenticated",
    email: seed!.ownerEmail,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    }),
  );

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [
      STORAGE_KEY,
      JSON.stringify({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: expiresAt,
        refresh_token: "smoke-refresh",
        user,
      }),
    ] as const,
  );
}

/**
 * The portal locks the console until the business has a subscription, and the
 * seed can only get one by way of a billing webhook. When that does not project
 * — which it does not on a local FakeStripe run today — every console page
 * redirects to `/billing`, and a failed assertion there would say nothing about
 * whether the console works. Skipping with the reason is the honest signal.
 */
const CONSOLE_LOCKED = !seed?.billingAccessState
  ? "The seeded business has no subscription, so the console is locked. See the README."
  : null;

test.describe("@smoke against a real API", () => {
  test("the console shows the seeded studio's own data", async ({ page }) => {
    test.skip(!!CONSOLE_LOCKED, CONSOLE_LOCKED ?? "");

    await signInForReal(page);
    await page.goto(`${STAFF_ORIGIN}/clients`);

    // Names the seed created, served by the real API through the real client.
    for (const customer of seed!.customers) {
      await expect(page.getByText(customer.name.split(" ")[0]).first()).toBeVisible();
    }
  });

  test("the booking page reaches review on real availability", async ({ page }) => {
    // The card step is skipped: FakeStripe's client secrets cannot drive
    // Stripe.js, and stubbing Stripe here would defeat the point of the suite.
    test.skip(!seed!.slug, "The seeded business has no public slug.");

    await page.goto(`/${seed!.slug}`);
    await page.getByRole("button", { name: new RegExp(seed!.services[0].name) }).click();

    // The strip opens on today, which may be a weekend the seeded staff do not
    // work. Walking it until a time appears keeps the test independent of the
    // day it happens to run on, and still fails if nothing is bookable at all.
    const times = page.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    const days = page.getByRole("button", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ / });
    await expect(days.first()).toBeVisible({ timeout: 15_000 });

    for (let day = 0; day < (await days.count()); day += 1) {
      await days.nth(day).click();
      // A short wait per day, since this polls the real availability endpoint.
      if (
        await times
          .first()
          .isVisible({ timeout: 3_000 })
          .catch(() => false)
      )
        break;
    }

    await expect(
      times.first(),
      "No bookable time on any day in the strip — check the seeded working rules.",
    ).toBeVisible();
    await times.first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("First name").fill("Smoke");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Email").fill("smoke@example.test");
    await page.getByLabel("Mobile").fill("07700 900999");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review & confirm" })).toBeVisible();
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
  });

  test("the calendar shows a seeded session", async ({ page }) => {
    test.skip(!!CONSOLE_LOCKED, CONSOLE_LOCKED ?? "");
    test.skip(seed!.bookings.length === 0, "The seed created no bookings.");

    await signInForReal(page);
    await page.goto(`${STAFF_ORIGIN}/calendar`);

    await expect(
      page
        .getByText(seed!.services[0].name)
        .first()
        .or(page.getByText(seed!.staff[0].name).first()),
    ).toBeVisible({ timeout: 15_000 });
  });
});
