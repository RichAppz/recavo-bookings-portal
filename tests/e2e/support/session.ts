import type { Page, Route } from "@playwright/test";

/**
 * Signs a persona in without going near Supabase.
 *
 * Customers sign in with an eight-digit code emailed to them. Nothing in either
 * repo can read that code back, so a test cannot complete the real flow — and
 * even for staff passwords, driving hosted Supabase would make every run
 * depend on a live third party and leave real users behind. Instead the session
 * supabase-js would have written is written directly, and the auth endpoints
 * are stubbed as a backstop for anything the client still calls.
 *
 * This works because of one detail: supabase-js derives its storage key from
 * the first label of the project hostname. `.env.test` pins that to
 * `recavo-test`, so the key is always `sb-recavo-test-auth-token`.
 */

/** Must match the host in `.env.test`. */
export const SUPABASE_HOST = "recavo-test.supabase.co";
export const SUPABASE_STORAGE_KEY = "sb-recavo-test-auth-token";

export type Persona = {
  id: string;
  email: string;
  /**
   * Present on the JWT so the API mock can tell who is asking. Readonly because
   * the demo personas are declared `as const`, and nothing here mutates them.
   */
  roleKeys?: readonly string[];
};

function base64url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A structurally valid HS256 JWT. The signature is a fixed string: nothing in
 * the browser verifies it, and the mocked API never sees a real verifier
 * either. The real API in the smoke suite gets a properly signed token from
 * `scripts/seed-demo.ts` instead.
 */
export function makeAccessToken(persona: Persona, overrides: Record<string, unknown> = {}): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: `https://${SUPABASE_HOST}/auth/v1`,
    sub: persona.id,
    aud: "authenticated",
    role: "authenticated",
    email: persona.email,
    phone: "",
    iat: issuedAt,
    // Ten years out. A token that can expire mid-run would have supabase-js
    // firing a refresh at an unpredictable moment and turning a flake into a
    // mystery.
    exp: issuedAt + 315_360_000,
    session_id: `ses_${persona.id}`,
    is_anonymous: false,
    // aal1 with no enrolled factors means `getAuthenticatorAssuranceLevel()`
    // reports nextLevel === "aal1", so the store skips its proactive MFA
    // challenge. The MFA spec overrides this deliberately.
    aal: "aal1",
    amr: [{ method: "password", timestamp: issuedAt }],
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    ...overrides,
  };
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.test-signature`;
}

export function makeSupabaseUser(persona: Persona, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: persona.id,
    aud: "authenticated",
    role: "authenticated",
    email: persona.email,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    // Empty rather than absent: `listFactors()` reads this, and undefined makes
    // the assurance-level check throw rather than report "no 2FA".
    factors: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
    ...overrides,
  };
}

export function makeSession(persona: Persona, overrides: Record<string, unknown> = {}) {
  const accessToken = makeAccessToken(persona);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 315_360_000,
    expires_at: Math.floor(Date.now() / 1000) + 315_360_000,
    refresh_token: `refresh-${persona.id}`,
    user: makeSupabaseUser(persona),
    ...overrides,
  };
}

/**
 * Answers every Supabase auth call in the page.
 *
 * A backstop rather than the main mechanism: with a far-future session in
 * storage the client should not need to call anything. When it does — a
 * refresh, a `getUser`, a sign-out — an unanswered request would hang until the
 * test timed out, and Chromium's host resolver has already made the real host
 * unreachable.
 */
export async function stubSupabaseAuth(
  page: Page,
  options: {
    persona?: Persona;
    /** Per-endpoint overrides, keyed by the path after `/auth/v1/`. */
    handlers?: Record<string, (route: Route) => Promise<void> | void>;
  } = {},
) {
  const { persona, handlers = {} } = options;

  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/^\/auth\/v1\//, "");

    const custom = handlers[endpoint];
    if (custom) {
      await custom(route);
      return;
    }

    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (endpoint === "logout") return route.fulfill({ status: 204, body: "" });
    if (endpoint === "settings") {
      return json({ external: {}, disable_signup: false, mailer_autoconfirm: true });
    }
    if (endpoint === "user") {
      return persona ? json(makeSupabaseUser(persona)) : json({ message: "not_found" }, 404);
    }
    if (endpoint === "token") {
      return persona
        ? json(makeSession(persona))
        : json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
    }
    if (endpoint === "verify" || endpoint === "signup") {
      return persona ? json(makeSession(persona)) : json({ msg: "ok" });
    }
    // otp, recover, resend and anything else: accepted, nothing sent.
    return json({});
  });
}

/**
 * Puts `persona` in the page as a signed-in user before any script runs.
 *
 * `addInitScript` rather than a post-load `evaluate`: the auth store reads
 * storage during its first render, and writing afterwards would leave the app
 * having already decided the visitor was signed out.
 */
export async function signInAs(page: Page, persona: Persona): Promise<void> {
  await stubSupabaseAuth(page, { persona });
  const session = makeSession(persona);
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [SUPABASE_STORAGE_KEY, JSON.stringify(session)] as const,
  );
}

/** Leaves the page signed out, with the auth endpoints still unreachable. */
export async function signedOut(page: Page): Promise<void> {
  await stubSupabaseAuth(page);
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key as string);
  }, SUPABASE_STORAGE_KEY);
}
