import type { Page } from "@playwright/test";

/**
 * A stand-in for Stripe.js.
 *
 * The real card field is a cross-origin iframe that Playwright can drive but
 * that no test should depend on: it is Stripe's UI, it changes without notice,
 * and it needs a live publishable key and a real PaymentIntent. What matters
 * here is our side of the contract — that the checkout mounts, that the confirm
 * is called with the client secret the API handed back, and that the flow does
 * the right thing with success, failure, and the redirect a bank challenge
 * causes. All of that is testable against a stub.
 *
 * `loadStripe` fetches `https://js.stripe.com/v3` and then reads
 * `window.Stripe`, so both halves are replaced: the script request is answered
 * with the stub's source, and the stub installs itself when it runs.
 */

export type StripeStubOptions = {
  /**
   * What `confirmPayment` does.
   * - `succeed`: resolves with a succeeded PaymentIntent (the default)
   * - `decline`: resolves with a card error, as a declined card does
   * - `redirect`: navigates to `return_url`, as a 3-D Secure challenge does
   */
  behaviour?: "succeed" | "decline" | "redirect";
  /** The message shown for `decline`. */
  declineMessage?: string;
};

export async function stubStripe(page: Page, options: StripeStubOptions = {}): Promise<void> {
  const behaviour = options.behaviour ?? "succeed";
  const declineMessage = options.declineMessage ?? "Your card was declined.";

  const source = `(${stripeStubSource.toString()})(${JSON.stringify({ behaviour, declineMessage })});`;

  // Serve the stub in place of the real script, for whichever of the several
  // URLs @stripe/stripe-js asks for.
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: source,
    }),
  );

  // Also install it up front: @stripe/stripe-js short-circuits if window.Stripe
  // already exists, which avoids a race on the script load.
  await page.addInitScript(source);
}

/**
 * Runs in the page. Implements only what `@stripe/react-stripe-js` touches:
 * `elements()`, `elements.create("payment")`, `mount`, `on`, `unmount`,
 * `getElement`, `submit`, and `confirmPayment`.
 *
 * The mounted element is a real input with a stable test id, so a spec can
 * "fill in the card" in a way that reads like the customer's action rather than
 * a mock detail.
 */
function stripeStubSource(config: { behaviour: string; declineMessage: string }) {
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  function makeElement(type: string) {
    let node: HTMLElement | null = null;
    const element = {
      type,
      mount(selectorOrNode: string | HTMLElement) {
        node =
          typeof selectorOrNode === "string"
            ? (document.querySelector(selectorOrNode) as HTMLElement)
            : selectorOrNode;
        if (!node) return;
        const input = document.createElement("input");
        input.setAttribute("data-testid", "stripe-card-input");
        input.setAttribute("aria-label", "Card number");
        input.placeholder = "Card number";
        input.style.width = "100%";
        input.style.padding = "8px";
        node.appendChild(input);
        // React-stripe waits for `ready` before enabling the pay button.
        window.setTimeout(() => element.emit("ready", { elementType: type }), 0);
      },
      unmount() {
        if (node) node.innerHTML = "";
      },
      destroy() {
        element.unmount();
      },
      on(event: string, handler: (e: unknown) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
        return element;
      },
      off(event: string, handler: (e: unknown) => void) {
        listeners.get(event)?.delete(handler);
        return element;
      },
      emit(event: string, payload: unknown) {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      },
      update() {
        return element;
      },
      focus() {},
      blur() {},
      clear() {},
    };
    return element;
  }

  function makeElements(elementsOptions: Record<string, unknown>) {
    const created = new Map<string, ReturnType<typeof makeElement>>();
    return {
      create(type: string) {
        const element = makeElement(type);
        created.set(type, element);
        return element;
      },
      getElement(type: string) {
        return created.get(typeof type === "string" ? type : "payment") ?? null;
      },
      update() {},
      fetchUpdates: async () => ({}),
      submit: async () => ({}),
      _options: elementsOptions,
    };
  }

  const Stripe = (publishableKey: string) => ({
    _publishableKey: publishableKey,
    // `loadStripe` calls this on whatever `window.Stripe` returns, and
    // `@stripe/react-stripe-js` checks for the payment methods below before it
    // will treat the object as a Stripe instance. Missing any of them leaves
    // `useStripe()` null for ever, and the pay button permanently disabled.
    _registerWrapper() {},
    registerAppInfo() {},
    elements: (elementsOptions: Record<string, unknown> = {}) => makeElements(elementsOptions),
    async createPaymentMethod() {
      return { paymentMethod: { id: "pm_test_demo" } };
    },
    async createToken() {
      return { token: { id: "tok_test_demo" } };
    },
    async confirmSetup() {
      return { setupIntent: { id: "seti_test_demo", status: "succeeded" } };
    },
    async retrieveSetupIntent(clientSecret: string) {
      return {
        setupIntent: { id: "seti_test_demo", status: "succeeded", client_secret: clientSecret },
      };
    },
    async confirmPayment(args: {
      clientSecret?: string;
      confirmParams?: { return_url?: string };
      redirect?: string;
      elements?: unknown;
    }) {
      const clientSecret =
        args.clientSecret ??
        ((args.elements as { _options?: { clientSecret?: string } } | undefined)?._options
          ?.clientSecret as string | undefined);

      // Recorded so a spec can assert we confirmed with the secret the API
      // gave us, rather than one we invented.
      (window as unknown as Record<string, unknown>).__stripeStubCalls = [
        ...(((window as unknown as Record<string, unknown>).__stripeStubCalls as unknown[]) ?? []),
        { method: "confirmPayment", clientSecret, returnUrl: args.confirmParams?.return_url },
      ];

      if (config.behaviour === "decline") {
        return {
          error: {
            type: "card_error",
            code: "card_declined",
            message: config.declineMessage,
          },
        };
      }

      if (config.behaviour === "redirect") {
        const returnUrl = args.confirmParams?.return_url;
        if (returnUrl) {
          window.setTimeout(() => {
            const url = new URL(returnUrl, window.location.origin);
            // All three, as Stripe appends them. The flow decides whether it is
            // resuming from a bank challenge by looking for the client secret
            // specifically, so a stub that only set `redirect_status` would
            // land back on step one and quietly prove nothing.
            url.searchParams.set("payment_intent", "pi_test_demo");
            url.searchParams.set(
              "payment_intent_client_secret",
              clientSecret ?? "pi_test_demo_secret",
            );
            url.searchParams.set("redirect_status", "succeeded");
            window.location.assign(url.toString());
          }, 0);
        }
        // Never resolves. When Stripe takes the customer to their bank the page
        // is on its way out, and the caller's `await` simply never returns.
        // Resolving as well would let the flow run its inline success path —
        // confirming the booking and clearing the stored journey — so the
        // redirect would land on a page with nothing left to resume, and the
        // test would be exercising the wrong branch entirely.
        return new Promise<never>(() => {});
      }

      return {
        paymentIntent: {
          id: "pi_test_demo",
          status: "succeeded",
          client_secret: clientSecret,
        },
      };
    },
    async confirmCardPayment(clientSecret: string) {
      return {
        paymentIntent: { id: "pi_test_demo", status: "succeeded", client_secret: clientSecret },
      };
    },
    async retrievePaymentIntent(clientSecret: string) {
      return {
        paymentIntent: { id: "pi_test_demo", status: "succeeded", client_secret: clientSecret },
      };
    },
    async handleNextAction() {
      return { paymentIntent: { id: "pi_test_demo", status: "succeeded" } };
    },
  });

  (Stripe as unknown as Record<string, unknown>).version = "stub";
  (window as unknown as Record<string, unknown>).Stripe = Stripe;
}

/** What the stub was asked to confirm, for asserting the client secret. */
export async function stripeCalls(page: Page) {
  return page.evaluate(
    () =>
      ((window as unknown as Record<string, unknown>).__stripeStubCalls as Array<{
        method: string;
        clientSecret?: string;
        returnUrl?: string;
      }>) ?? [],
  );
}
