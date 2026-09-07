import { test as base, expect, type Page } from "@playwright/test";
import * as demo from "../fixtures/demo.ts";
import { ApiMock, demoApi } from "./api-mock.ts";
import { signInAs, signedOut, stubSupabaseAuth, type Persona } from "./session.ts";
import { stubStripe, type StripeStubOptions } from "./stripe.ts";

/**
 * The `test` every spec imports.
 *
 * Each test starts sealed off: the API is answered from the demo dataset, the
 * Supabase endpoints are stubbed, and nothing can reach the network. A spec
 * then says who is signed in and adjusts whichever endpoints its case is about.
 */

export type PersonaKey = keyof typeof demo.personas;

export type Harness = {
  /** The mock router. Register over an endpoint to change one response. */
  api: ApiMock;
  /** Signs a persona in and installs the API mock for them. */
  signIn: (persona: PersonaKey) => Promise<void>;
  /** Leaves the visitor signed out, with the API still mocked. */
  signOut: () => Promise<void>;
  /**
   * Leaves the visitor signed out, but arranges for Supabase to hand back
   * `persona`'s session when credentials are submitted. Lets a spec drive the
   * real sign-in form rather than skipping past it.
   */
  offerSignIn: (persona: PersonaKey) => Promise<void>;
  /** Installs the Stripe.js stub. Not on by default: most specs never pay. */
  stripe: (options?: StripeStubOptions) => Promise<void>;
  /** Dismisses the toast stack, which otherwise covers the page bottom. */
  clearToasts: () => Promise<void>;
};

export const test = base.extend<{ harness: Harness } & Harness>({
  harness: async ({ page }, use) => {
    /**
     * One router for the whole test, installed before the body runs.
     *
     * Rebuilding it inside `signIn` would be the obvious shape and is wrong:
     * Playwright resolves the `api` fixture before the body, so a spec would
     * hold a handle to a router that had since been thrown away, and its
     * overrides would silently go nowhere. Instead the persona is a mutable
     * reference the handlers read on each request.
     */
    let persona: PersonaKey = "owner";
    const api = demoApi({ persona: () => persona });
    await api.install(page);

    const harness: Harness = {
      api,
      async signIn(next) {
        persona = next;
        await signInAs(page, toPersona(next));
      },
      async signOut() {
        await signedOut(page);
      },
      async offerSignIn(next) {
        persona = next;
        await signedOut(page);
        await stubSupabaseAuth(page, { persona: toPersona(next) });
      },
      stripe: (options) => stubStripe(page, options),
      clearToasts: () => clearToasts(page),
    };

    await use(harness);
  },

  api: async ({ harness }, use) => use(harness.api),
  signIn: async ({ harness }, use) => use(harness.signIn),
  signOut: async ({ harness }, use) => use(harness.signOut),
  offerSignIn: async ({ harness }, use) => use(harness.offerSignIn),
  stripe: async ({ harness }, use) => use(harness.stripe),
  clearToasts: async ({ harness }, use) => use(harness.clearToasts),
});

function toPersona(key: PersonaKey): Persona {
  const persona = demo.personas[key];
  return { id: persona.id, email: persona.email, roleKeys: [...persona.roleKeys] };
}

async function clearToasts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-sonner-toast]").forEach((toast) => toast.remove());
  });
}

export { expect, demo, stubSupabaseAuth };
export * from "./stripe.ts";
export { problem } from "./api-mock.ts";
