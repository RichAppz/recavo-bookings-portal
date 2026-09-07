/**
 * Builds the demo studio in a locally-running `recavo-api`.
 *
 * The mocked Playwright suite is the one that runs on every change. This script
 * exists for the handful of smoke tests that run against the real API, whose
 * only job is to catch the mocks drifting from what the server actually does.
 *
 * It talks to the API over HTTP as a signed-in owner would, rather than writing
 * to the database, because the point is to exercise the same contracts the
 * portal uses. The owner is provisioned just-in-time: the API creates a local
 * user the first time it sees a valid Supabase token it does not recognise, so
 * a single `GET /api/v1/me` is enough to bring the account into being.
 *
 * Usage, with the API running (see README):
 *
 *   SUPABASE_JWT_SECRET=local-test-secret npm run seed:demo
 *
 * It prints the ids it created, and writes them to `.smoke-seed.json` for the
 * smoke specs to read.
 */

import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API = (process.env.SMOKE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_JWT_SECRET ?? "local-test-secret";

/** Kept out of the way of anything a person might have created by hand. */
const OWNER = {
  id: "00000000-0000-4000-8000-00000000d3m0",
  email: "owner@demo-strength.seed",
};

const TIMEZONE = "Europe/London";
const CURRENCY = "GBP";

/**
 * The API's default fake webhook secret, used when `STRIPE_WEBHOOK_SECRET` is
 * unset — which it must be locally, since that is also what selects FakeStripe.
 */
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test";

/** From the API's launch catalogue seed; any plan unlocks the console. */
const PLAN_PRICE_ID = "price_test_recavo_business_gbp_month_v1";

// ---------------------------------------------------------------------------
// A Supabase-shaped token the API will accept
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * An HS256 token signed with the same secret the API verifies against.
 *
 * No `iss` claim: the API only checks the issuer when `SUPABASE_URL` is set,
 * and the local run deliberately leaves it unset so tokens can be minted here
 * without a Supabase project in the loop.
 */
function mintToken(): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: OWNER.id,
      email: OWNER.email,
      email_verified: true,
      aud: "authenticated",
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: issuedAt }],
      session_id: "seed-session",
      iat: issuedAt,
      exp: issuedAt + 24 * 60 * 60,
    }),
  );
  const signature = base64url(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

const token = mintToken();

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

async function call<T = Json>(
  method: string,
  path: string,
  body?: Json,
  options: { idempotent?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  if (body) headers["content-type"] = "application/json";
  // Writes that create money-adjacent records want a key; the API rejects the
  // holds endpoint without one.
  if (options.idempotent) headers["idempotency-key"] = randomUUID();

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();

  let parsed: T;
  try {
    parsed = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    // Almost always something other than the API answering on this port — a
    // dev server, a stale container — and "unexpected token <" sends people
    // looking in the wrong place.
    throw new Error(
      `${method} ${path} → ${res.status}, but the response was not JSON.\n` +
        `Is recavo-api really listening on ${API}?\n` +
        `First 200 characters:\n${text.slice(0, 200)}`,
    );
  }

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

const get = <T = Json>(path: string) => call<T>("GET", path);
const post = <T = Json>(path: string, body?: Json, idempotent = false) =>
  call<T>("POST", path, body, { idempotent });

// ---------------------------------------------------------------------------
// Dates, relative to now so the seeded studio always has a live diary
// ---------------------------------------------------------------------------

const indent = (text: string) =>
  text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

/**
 * `dayOffset` weekdays from today, at `hour` UTC.
 *
 * Weekdays rather than days, because the staff working rules below cover Monday
 * to Friday and the API refuses a booking outside them. Counting in weekdays
 * means the seed produces the same five sessions whichever day of the week it
 * is run on, instead of quietly losing two every weekend.
 */
function at(dayOffset: number, hour: number): string {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  let remaining = dayOffset;
  while (remaining > 0 || d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining -= 1;
  }
  return d.toISOString();
}

/** Monday to Friday, 07:00–20:00, in minutes past midnight. */
const WEEKDAYS = [1, 2, 3, 4, 5];
const openingHours = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  openMinute: 7 * 60,
  closeMinute: 20 * 60,
}));

/**
 * Puts the business on a trial so the console unlocks.
 *
 * Not through Checkout: FakeStripe hands back a URL that goes nowhere and
 * carries no session id, so `reconcile` has nothing to reconcile and quietly
 * returns a null subscription. The subscription only ever comes into being when
 * Stripe reports it, which means a webhook — the same route the API's own
 * billing tests drive, signed the way FakeStripe signs.
 *
 * If any of this fails the seed carries on. The public booking page does not
 * depend on a subscription, and a studio with a locked console is still worth
 * more than no studio at all.
 */
async function startTrial(businessId: string): Promise<string | null> {
  const now = Date.now();
  const body = JSON.stringify({
    id: `evt_seed_${now}`,
    type: "customer.subscription.created",
    data: {
      subscriptionId: `sub_seed_${businessId}`,
      businessId,
      stripePriceId: PLAN_PRICE_ID,
      stripeCustomerId: `cus_seed_${businessId}`,
      status: "trialing",
      trialStart: new Date(now).toISOString(),
      trialEnd: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodEnd: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  try {
    const res = await fetch(`${API}/api/v1/billing/webhooks/stripe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // FakeStripe verifies a plain HMAC of the body rather than Stripe's
        // timestamped scheme. The secret is the API's own default.
        "stripe-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      },
      body,
    });
    if (!res.ok) throw new Error(`webhook → ${res.status} ${await res.text()}`);

    // The webhook is ingested onto a queue and projected by a worker, so the
    // subscription is not readable the instant the POST returns.
    const state = await waitForSubscription(businessId);
    console.log(`  billing  ${state ?? "no subscription projected — the console stays locked"}`);
    return state;
  } catch (error) {
    console.warn(
      `  no subscription, so the console will stay locked:\n${indent((error as Error).message)}`,
    );
    return null;
  }
}

async function waitForSubscription(businessId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { subscription } = await get<{ subscription: { accessState?: string } | null }>(
      `/api/v1/businesses/${businessId}/subscription`,
    );
    if (subscription?.accessState) return subscription.accessState;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function main() {
  console.log(`Seeding ${API}`);

  // Brings the owner into being. The API links or creates a local user from the
  // token's `sub` on the first authenticated request.
  const me = await get<{ user: { id: string } }>("/api/v1/me");
  console.log(`  owner   ${me.user.id} (${OWNER.email})`);

  const { business } = await post<{ business: { id: string; slug?: string } }>(
    "/api/v1/businesses",
    {
      legalName: "Demo Strength Co Ltd",
      tradingName: "Demo Strength Co",
      industryTemplateKey: "personal_training",
      currency: CURRENCY,
      defaultTimezone: TIMEZONE,
    },
  );
  console.log(`  business ${business.id}`);

  // The console is locked until the business has a subscription, and that gate
  // lives in the portal, so relaxing the API's own flag is not enough. With
  // FakeStripe in play, checkout is a pair of calls rather than a card: ask for
  // a session, then reconcile it into a trial.
  const billingAccessState = await startTrial(business.id);

  const { location } = await post<{ location: { id: string } }>(
    `/api/v1/businesses/${business.id}/locations`,
    {
      name: "Northside Studio",
      type: "physical",
      timezone: TIMEZONE,
      openingHours,
      publicVisible: true,
    },
  );
  console.log(`  location ${location.id}`);

  const serviceSpecs = [
    { name: "1:1 Personal Training", durationMinutes: 60, basePriceMinor: 5500 },
    { name: "Movement Assessment", durationMinutes: 45, basePriceMinor: 4000 },
    { name: "Small Group Strength", durationMinutes: 60, basePriceMinor: 2200 },
  ];
  const services: Array<{ id: string; name: string }> = [];
  for (const spec of serviceSpecs) {
    const { service } = await post<{ service: { id: string } }>(
      `/api/v1/businesses/${business.id}/services`,
      {
        ...spec,
        currency: CURRENCY,
        bookingNoticeMinutes: 0,
        bookingHorizonDays: 90,
        locationIds: [location.id],
        publicVisible: true,
      },
    );
    services.push({ id: service.id, name: spec.name });
    console.log(`  service  ${service.id} ${spec.name}`);
  }

  // Working rules matter more than they look: without them availability comes
  // back empty and the public booking smoke test has nothing to click.
  const workingRules = WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 7 * 60,
    endMinute: 20 * 60,
    locationId: null,
  }));

  const staff: Array<{ id: string; name: string }> = [];
  for (const displayName of ["Alex Rivera", "Jo Mensah"]) {
    const created = await post<{ staff: { id: string } }>(
      `/api/v1/businesses/${business.id}/staff`,
      {
        displayName,
        locationIds: [location.id],
        eligibleServiceIds: services.map((s) => s.id),
        workingRules,
      },
    );
    staff.push({ id: created.staff.id, name: displayName });
    console.log(`  staff    ${created.staff.id} ${displayName}`);
  }

  const customerSpecs = [
    { firstName: "Priya", lastName: "Nair", email: "priya@example.test" },
    { firstName: "Tom", lastName: "Whitfield", email: "tom@example.test" },
    { firstName: "Sam", lastName: "Okonkwo", email: "sam@example.test" },
  ];
  const customers: Array<{ id: string; name: string }> = [];
  for (const spec of customerSpecs) {
    const { customer } = await post<{ customer: { id: string } }>(
      `/api/v1/businesses/${business.id}/customers`,
      spec,
    );
    customers.push({ id: customer.id, name: `${spec.firstName} ${spec.lastName}` });
    console.log(`  customer ${customer.id} ${spec.firstName}`);
  }

  const { package: pkg } = await post<{ package: { id: string } }>(
    `/api/v1/businesses/${business.id}/packages`,
    {
      name: "10-Session Block",
      description: "Ten 1:1 sessions, six months to use them.",
      creditsIssued: 10,
      priceMinor: 49500,
      currency: CURRENCY,
      eligibleServiceIds: [services[0].id],
      validity: { kind: "calendar_months", amount: 6 },
      transferable: false,
      salesAvailable: true,
    },
  );
  console.log(`  package  ${pkg.id}`);

  // All in the future: the API rejects a booking inside the notice window, so a
  // studio's history cannot be created over HTTP. The mocked suite is where
  // past sessions get exercised; here the diary only needs to be non-empty.
  const bookingSpecs = [
    { dayOffset: 1, hour: 8, service: 0, staff: 0, customer: 0 },
    { dayOffset: 2, hour: 12, service: 2, staff: 1, customer: 2 },
    { dayOffset: 3, hour: 17, service: 1, staff: 1, customer: 1 },
    { dayOffset: 4, hour: 10, service: 0, staff: 0, customer: 1 },
    { dayOffset: 5, hour: 15, service: 0, staff: 1, customer: 0 },
  ];
  const bookings: string[] = [];
  for (const spec of bookingSpecs) {
    try {
      const { booking } = await post<{ booking: { id: string } }>(
        `/api/v1/businesses/${business.id}/bookings`,
        {
          serviceId: services[spec.service].id,
          staffId: staff[spec.staff].id,
          locationId: location.id,
          start: at(spec.dayOffset, spec.hour),
          leadCustomerId: customers[spec.customer].id,
          source: "staff_console",
        },
        true,
      );
      bookings.push(booking.id);
      console.log(`  booking  ${booking.id} ${at(spec.dayOffset, spec.hour)}`);
    } catch (error) {
      // A seeded slot can fall outside working hours once the clock moves past
      // a weekend. One missing session is not worth failing the whole seed.
      console.warn(`  skipped a booking:\n${indent((error as Error).message)}`);
    }
  }

  const seed = {
    apiUrl: API,
    ownerEmail: OWNER.email,
    ownerSub: OWNER.id,
    businessId: business.id,
    slug: business.slug ?? null,
    // Null means the console is locked behind the billing gate, which the smoke
    // specs report as a skip reason rather than a mystery failure.
    billingAccessState,
    locationId: location.id,
    services,
    staff,
    customers,
    packageId: pkg.id,
    bookings,
    seededAt: new Date().toISOString(),
  };

  writeFileSync(".smoke-seed.json", `${JSON.stringify(seed, null, 2)}\n`);
  console.log("\nWrote .smoke-seed.json");
  console.log(`Booking page: /${business.slug ?? "<no slug>"}`);
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
