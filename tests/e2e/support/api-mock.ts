import type { Page, Route } from "@playwright/test";
import { permissionsForRoles, type PermissionKey } from "@/lib/permissions";
import * as demo from "../fixtures/demo.ts";

/**
 * A stand-in for recavo-api, served from inside the browser.
 *
 * Every call the portal makes is same-origin `/api/v1/*` in development, so one
 * `page.route` pattern catches the lot. Routes are matched by method plus a
 * path template, most-specific first, and anything unmatched is answered with a
 * loud 501 rather than left to hang — a test that fails saying which endpoint
 * was missing is worth far more than one that times out.
 */

export type MockContext = {
  method: string;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  route: Route;
};

export type Handler = (ctx: MockContext) => unknown | Promise<unknown>;

/** Thrown by a handler to answer with problem+json instead of a body. */
export class MockProblem extends Error {
  constructor(
    readonly status: number,
    readonly problem: Record<string, unknown>,
  ) {
    super(`${status} ${problem.code ?? ""}`);
  }
}

export function problem(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): MockProblem {
  return new MockProblem(status, {
    type: `https://api.recavo.test/problems/${code.toLowerCase().replace(/_/g, "-")}`,
    title: extra.title ?? "Request failed",
    status,
    code,
    requestId: "req_test_0001",
    ...extra,
  });
}

type Registered = { method: string; segments: string[]; handler: Handler };

/**
 * Matches `/api/v1/businesses/:businessId/bookings/:bookingId` style templates.
 * A literal beats a parameter at the same position, so a specific route can be
 * registered after a general one without being shadowed.
 */
function toSegments(template: string) {
  return template.replace(/^\//, "").split("/");
}

function match(segments: string[], path: string[]): Record<string, string> | null {
  if (segments.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(path[i]);
    else if (segment !== path[i]) return null;
  }
  return params;
}

/** Literal segments first, so `/subscription/checkout` wins over `/:id`. */
function specificity(segments: string[]) {
  return (
    segments.reduce((score, s) => score + (s.startsWith(":") ? 0 : 1), 0) * 100 + segments.length
  );
}

export class ApiMock {
  readonly #routes: Registered[] = [];
  readonly #calls: Array<{ method: string; path: string; body: unknown }> = [];

  on(method: string, template: string, handler: Handler): this {
    this.#routes.push({ method: method.toUpperCase(), segments: toSegments(template), handler });
    return this;
  }

  get = (template: string, handler: Handler) => this.on("GET", template, handler);
  post = (template: string, handler: Handler) => this.on("POST", template, handler);
  patch = (template: string, handler: Handler) => this.on("PATCH", template, handler);
  put = (template: string, handler: Handler) => this.on("PUT", template, handler);
  delete = (template: string, handler: Handler) => this.on("DELETE", template, handler);

  /** Every request that reached the mock, for asserting what was called. */
  get calls() {
    return [...this.#calls];
  }

  callsTo(method: string, pathFragment: string) {
    return this.#calls.filter(
      (c) => c.method === method.toUpperCase() && c.path.includes(pathFragment),
    );
  }

  async install(page: Page): Promise<void> {
    // Later-registered routes are tried first at equal specificity, which is
    // what lets a spec override one endpoint without rebuilding the router.
    const ordered = () =>
      [...this.#routes]
        .map((route, index) => ({ route, index }))
        .sort(
          (a, b) =>
            specificity(b.route.segments) - specificity(a.route.segments) || b.index - a.index,
        )
        .map((entry) => entry.route);

    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\//, "").split("/");
      const method = request.method();

      let body: unknown = undefined;
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = request.postDataJSON();
        } catch {
          body = request.postData();
        }
      }
      this.#calls.push({ method, path: url.pathname, body });

      for (const registered of ordered()) {
        if (registered.method !== method) continue;
        const params = match(registered.segments, path);
        if (!params) continue;

        // A handler given the raw route may answer the request itself — most
        // often `route.abort()` to simulate the network dropping. Playwright
        // does not report whether a route has been answered, and answering it
        // twice is a hard error, so the calls are watched here rather than
        // relying on every spec to remember a sentinel return value.
        let answered = false;
        const watched = new Proxy(route, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (
              typeof value === "function" &&
              (property === "fulfill" ||
                property === "abort" ||
                property === "continue" ||
                property === "fallback")
            ) {
              return (...args: unknown[]) => {
                answered = true;
                return (value as (...a: unknown[]) => unknown).apply(target, args);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

        try {
          const result = await registered.handler({
            method,
            url,
            params,
            query: url.searchParams,
            body,
            route: watched,
          });
          if (answered || result === HANDLED) return;
          if (result === undefined) {
            // Nothing to send; treat as 204 so the client is not left waiting.
            await route.fulfill({ status: 204, body: "" });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "x-request-id": "req_test_0001" },
            body: JSON.stringify(result),
          });
        } catch (error) {
          if (answered) throw error;
          if (error instanceof MockProblem) {
            await route.fulfill({
              status: error.status,
              contentType: "application/problem+json",
              headers: { "x-request-id": "req_test_0001" },
              body: JSON.stringify(error.problem),
            });
            return;
          }
          throw error;
        }
        return;
      }

      await route.fulfill({
        status: 501,
        contentType: "application/problem+json",
        body: JSON.stringify({
          title: "No mock for this endpoint",
          status: 501,
          code: "MOCK_MISSING",
          detail: `${method} ${url.pathname} is not in the mock router. Add it in tests/e2e/support/api-mock.ts.`,
        }),
      });
    });
  }
}

/** Returned by a handler that fulfilled the route itself. */
export const HANDLED = Symbol("handled");

const page = <T>(items: T[], key: string) => ({ [key]: items, nextCursor: null });

/**
 * The full mock for Demo Strength Co, healthy and fully set up.
 *
 * `overrides` runs last, so a spec can replace any endpoint with an error, an
 * empty list, or a different state without reassembling the router.
 */
export function demoApi(
  options: {
    /**
     * Read on every request rather than captured, because the harness builds
     * the router before the test body has said who is signing in.
     */
    persona?: () => keyof typeof demo.personas;
  } = {},
): ApiMock {
  const currentKey = options.persona ?? (() => "owner" as const);
  const currentPersona = () => demo.personas[currentKey()];
  const isStaff = () => currentPersona().roleKeys.length > 0;

  /**
   * Refuses what the real API would refuse.
   *
   * Without this the mock hands every persona the full dataset, and a
   * permissions test proves only that a link is hidden — which is styling, not
   * a control. Reading the same role table the portal reads means a change to
   * the bundles moves both sides at once.
   */
  const require = (permission: PermissionKey) => {
    const held = permissionsForRoles(currentPersona().roleKeys);
    if (!held.has(permission)) {
      throw problem(403, "FORBIDDEN", {
        title: "You do not have permission to do that",
        detail: `Requires ${permission}.`,
      });
    }
  };

  /**
   * The booking flow asks for one day at a time and renders whatever comes
   * back. Ignoring `from`/`to` would hand it the whole fortnight, so every date
   * would look identical and picking a different day would prove nothing.
   */
  const slotsInWindow = (query: URLSearchParams) => {
    const all = demo.availabilitySlots(query.get("serviceId") ?? undefined);
    const from = query.get("from");
    const to = query.get("to");
    if (!from || !to) return all;
    return all.filter((slot) => {
      const start = String(slot.start);
      return start >= from && start < to;
    });
  };

  const mock = new ApiMock();

  // --- identity -----------------------------------------------------------
  mock.get("/api/v1/me", () => ({ user: demo.users[currentKey()] }));
  mock.patch("/api/v1/me", ({ body }) => ({
    user: { ...demo.users[currentKey()], ...(body as Record<string, unknown>) },
  }));
  mock.get("/api/v1/me/businesses", () => ({
    businesses: isStaff()
      ? [{ ...demo.businessSummary, roleKeys: [...currentPersona().roleKeys] }]
      : // A customer has no staff membership; this empty list is what sends
        // them to /account rather than into the console.
        [],
  }));

  // --- business -----------------------------------------------------------
  mock.get("/api/v1/businesses/:businessId", () => ({ business: demo.business }));
  mock.patch("/api/v1/businesses/:businessId", ({ body }) => ({
    business: { ...demo.business, ...(body as Record<string, unknown>) },
  }));
  mock.get("/api/v1/businesses/:businessId/configuration", () => ({
    configuration: demo.configuration,
  }));
  mock.patch("/api/v1/businesses/:businessId/configuration", ({ body }) => ({
    configuration: { ...demo.configuration, ...(body as Record<string, unknown>) },
  }));
  mock.get("/api/v1/businesses/:businessId/onboarding", () => demo.onboarding);
  mock.post("/api/v1/businesses/:businessId/onboarding/dismiss", () => ({}));
  mock.post("/api/v1/businesses/:businessId/onboarding/steps/:key/skip", () => ({}));

  // --- team ---------------------------------------------------------------
  mock.get("/api/v1/businesses/:businessId/memberships", () => ({
    memberships: demo.memberships,
  }));
  mock.patch("/api/v1/businesses/:businessId/memberships/:membershipId", ({ params, body }) => ({
    membership: {
      ...demo.memberships.find((m) => m.id === params.membershipId),
      ...(body as Record<string, unknown>),
    },
  }));
  mock.get("/api/v1/businesses/:businessId/invitations", () => ({
    invitations: demo.invitations,
  }));
  mock.post("/api/v1/businesses/:businessId/invitations", ({ body }) => ({
    invitation: { ...demo.invitations[0], ...(body as Record<string, unknown>), id: "inv_new" },
    token: "invite_demo_token",
  }));
  mock.post("/api/v1/invitations/:token/accept", () => ({ membership: demo.memberships[0] }));

  // --- catalogue and diary ------------------------------------------------
  mock.get("/api/v1/businesses/:businessId/locations", () => ({ locations: demo.locations }));
  mock.get("/api/v1/businesses/:businessId/staff", () => ({ staff: demo.staff }));
  mock.get("/api/v1/businesses/:businessId/services", () => ({ services: demo.services }));
  mock.get("/api/v1/businesses/:businessId/packages", () => ({ packages: demo.packages }));
  mock.get("/api/v1/businesses/:businessId/resources", () => ({ resources: [] }));

  mock.get("/api/v1/businesses/:businessId/bookings", ({ query }) => {
    // Restricted staff only ever see their own diary; the API enforces it, and
    // the mock has to as well or the permissions spec proves nothing.
    let items = demo.bookings;
    const staffId = query.get("staffId");
    if (staffId) items = items.filter((b) => b.staffId === staffId);
    const status = query.get("status");
    if (status) items = items.filter((b) => b.status === status);
    return page(items, "bookings");
  });
  mock.get("/api/v1/businesses/:businessId/bookings/:bookingId", ({ params }) => {
    const booking = demo.bookings.find((b) => b.id === params.bookingId);
    if (!booking) throw problem(404, "NOT_FOUND", { title: "Booking not found" });
    return { booking };
  });
  mock.get("/api/v1/businesses/:businessId/bookings/:bookingId/history", () => ({ history: [] }));
  mock.get("/api/v1/businesses/:businessId/bookings/:bookingId/payments", ({ params }) => ({
    payments: demo.payments.filter((p) => p.bookingId === params.bookingId),
  }));
  mock.get("/api/v1/businesses/:businessId/availability", ({ query }) => ({
    slots: slotsInWindow(query),
  }));

  // --- customers ----------------------------------------------------------
  mock.get("/api/v1/businesses/:businessId/customers", ({ query }) => {
    require("customer.read");
    const search = (query.get("search") ?? "").trim().toLowerCase();
    const items = search
      ? demo.customers.filter((c) =>
          `${c.firstName} ${c.lastName ?? ""} ${c.emailDisplay ?? ""}`
            .toLowerCase()
            .includes(search),
        )
      : demo.customers;
    return page(items, "items");
  });
  mock.get("/api/v1/businesses/:businessId/customers/:customerId", ({ params }) => {
    require("customer.read");
    const customer = demo.customers.find((c) => c.id === params.customerId);
    if (!customer) throw problem(404, "NOT_FOUND", { title: "Client not found" });
    return { customer };
  });
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/bookings", ({ params }) => ({
    bookings: demo.bookings.filter((b) => b.leadCustomerId === params.customerId),
  }));
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/credits", ({ params }) => ({
    credits: demo.entitlements.filter((e) => e.entitlement.customerId === params.customerId),
  }));
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/notes", () => ({ notes: [] }));
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/tags", () => ({ tags: [] }));
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/consents", () => ({
    consents: [],
  }));
  mock.get("/api/v1/businesses/:businessId/customers/:customerId/linked-records", () => ({
    records: [],
  }));
  mock.get("/api/v1/businesses/:businessId/customer-tags", () => ({ tags: [] }));

  // --- money --------------------------------------------------------------
  mock.get("/api/v1/businesses/:businessId/payments", () => {
    require("payment.read");
    return page(demo.payments, "payments");
  });
  mock.get("/api/v1/businesses/:businessId/payments/:paymentId", ({ params }) => {
    const payment = demo.payments.find((p) => p.id === params.paymentId);
    if (!payment) throw problem(404, "NOT_FOUND", { title: "Payment not found" });
    return { payment };
  });
  mock.get("/api/v1/businesses/:businessId/payments/:paymentId/receipt", ({ params }) => ({
    receipt: { paymentId: params.paymentId, number: "DS-R-0001", lines: [] },
  }));
  mock.get("/api/v1/businesses/:businessId/entitlements", () =>
    page(demo.entitlements, "entitlements"),
  );
  mock.get("/api/v1/businesses/:businessId/entitlements/:entitlementId/ledger", () =>
    page([], "entries"),
  );
  mock.get("/api/v1/businesses/:businessId/reports/dashboard", () => ({
    dashboard: demo.dashboard,
  }));
  mock.get("/api/v1/businesses/:businessId/reports/:report", () => {
    require("report.read");
    return { rows: [] };
  });
  mock.get("/api/v1/businesses/:businessId/exports", () => ({ exports: [] }));

  // --- messages and notifications ----------------------------------------
  mock.get("/api/v1/businesses/:businessId/conversations", () =>
    page(demo.conversations, "conversations"),
  );
  mock.get("/api/v1/businesses/:businessId/conversations/:conversationId/messages", ({ params }) =>
    page(demo.messages[params.conversationId] ?? [], "messages"),
  );
  mock.post(
    "/api/v1/businesses/:businessId/conversations/:conversationId/messages",
    ({ body }) => ({
      message: {
        id: "msg_new",
        businessId: demo.business.id,
        conversationId: "cnv_priya",
        senderType: "staff",
        senderId: currentPersona().id,
        body: (body as { body?: string })?.body ?? "",
        createdAt: new Date().toISOString(),
      },
    }),
  );
  mock.get("/api/v1/businesses/:businessId/notifications", () =>
    page(demo.notifications, "notifications"),
  );
  mock.post("/api/v1/businesses/:businessId/notifications/:id/read", () => ({}));

  // --- policies and settings ---------------------------------------------
  mock.get("/api/v1/businesses/:businessId/policy-documents", () => ({
    documents: demo.policyDocuments,
  }));
  mock.get("/api/v1/businesses/:businessId/policy-documents/current/:type", ({ params }) => ({
    document: demo.policyDocuments.find((d) => d.type === params.type) ?? null,
  }));
  mock.get("/api/v1/businesses/:businessId/privacy-notices/latest", () => ({ notice: null }));
  mock.get("/api/v1/businesses/:businessId/linked-record-definition", () => ({
    definition: null,
  }));
  mock.get("/api/v1/businesses/:businessId/lifecycle", () => ({ lifecycle: null }));
  mock.get("/api/v1/businesses/:businessId/audit-events", () => page([], "events"));

  // --- SaaS billing -------------------------------------------------------
  mock.get("/api/v1/saas/plans", () => ({ plans: demo.plans }));
  mock.get("/api/v1/billing/catalogue", () => ({ plans: demo.plans }));
  mock.get("/api/v1/businesses/:businessId/subscription", () => ({
    subscription: demo.subscription,
    plan: demo.plans[1],
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/checkout", () => ({
    checkoutUrl: "/billing/success?session_id=cs_test_demo",
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/checkout/reconcile", () => ({
    subscription: demo.subscription,
    plan: demo.plans[1],
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/portal", () => ({
    portalUrl: "/billing?portal=returned",
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/change-preview", () => ({
    prorationMinor: 1200,
    nextInvoiceMinor: 5900,
    currency: "GBP",
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/change-apply", () => ({
    subscription: demo.subscription,
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/cancel", () => ({
    subscription: { ...demo.subscription, cancelAtPeriodEnd: true },
  }));
  mock.post("/api/v1/businesses/:businessId/subscription/resume", () => ({
    subscription: demo.subscription,
  }));

  // --- Stripe Connect -----------------------------------------------------
  mock.get("/api/v1/businesses/:businessId/connect/account", () => ({
    account: demo.connectAccount,
  }));
  mock.post("/api/v1/businesses/:businessId/connect/account", () => ({
    account: { ...demo.connectAccount, onboardingState: "pending", chargesEnabled: false },
    onboardingUrl: "/payments?connect=returned",
  }));
  mock.post("/api/v1/businesses/:businessId/connect/sync", () => ({
    account: demo.connectAccount,
  }));

  // --- public booking -----------------------------------------------------
  mock.get("/api/v1/public/businesses/by-slug/:slug", ({ params }) => {
    if (params.slug !== demo.business.slug) {
      throw problem(404, "NOT_FOUND", { title: "No such booking page" });
    }
    return { business: demo.publicBusiness };
  });
  mock.get("/api/v1/public/businesses/:businessId/profile", () => ({
    business: demo.publicBusiness,
  }));
  mock.get("/api/v1/public/businesses/:businessId/services", () => ({
    services: demo.publicServices,
  }));
  mock.get("/api/v1/public/businesses/:businessId/locations", () => ({
    locations: demo.publicLocations,
  }));
  mock.get("/api/v1/public/businesses/:businessId/packages", () => ({
    packages: demo.publicPackages,
  }));
  mock.get("/api/v1/public/businesses/:businessId/availability", ({ query }) => ({
    slots: slotsInWindow(query),
  }));
  /**
   * The flow identifies a slot by its opaque token, so the hold has to resolve
   * it back to a time. Defaulting to "the first slot of the fortnight" instead
   * would put a different time on the review screen than the one that was
   * tapped, and every assertion about the summary would be meaningless.
   */
  const slotByToken = (token: string | undefined) => {
    if (!token) return null;
    for (const service of demo.services) {
      const found = demo.availabilitySlots(service.id).find((slot) => slot.slotToken === token);
      if (found) return found;
    }
    return null;
  };

  /** The held booking, so confirm can return the same session that was held. */
  let lastHeld: ReturnType<typeof demo.makeBooking> | null = null;

  mock.post("/api/v1/public/businesses/:businessId/booking-holds", ({ body }) => {
    const input = (body ?? {}) as { slotToken?: string };
    const slot = slotByToken(input.slotToken);
    if (!slot) {
      throw problem(409, "SLOT_UNAVAILABLE", {
        title: "That time is no longer available",
      });
    }
    lastHeld = demo.makeBooking({
      id: "bkg_held",
      start: slot.start as string,
      serviceId: slot.serviceId as string,
      staffId: slot.staffId as string,
      locationId: slot.locationId as string,
      status: "held",
      // Ten minutes, matching the studio's configured hold window.
      holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    return { booking: lastHeld, holdToken: "hold_demo_token", onlinePaymentRequired: true };
  });
  mock.post("/api/v1/public/businesses/:businessId/bookings/confirm", () => {
    if (!lastHeld) throw problem(404, "NOT_FOUND", { title: "No such hold" });
    return { booking: { ...lastHeld, status: "confirmed", holdExpiresAt: null } };
  });
  mock.post("/api/v1/public/businesses/:businessId/bookings/payment", () => ({
    clientSecret: "pi_test_demo_secret_abc",
    connectedAccountId: demo.connectAccount.accountId,
    publishableKey: "pk_test_demo",
    amountMinor: 5500,
    currency: "GBP",
  }));
  mock.post("/api/v1/public/businesses/:businessId/package-purchases/payment", () => ({
    clientSecret: "pi_test_package_secret_abc",
    connectedAccountId: demo.connectAccount.accountId,
    publishableKey: "pk_test_demo",
    amountMinor: demo.packages[0].priceMinor,
    currency: "GBP",
    packageName: demo.packages[0].name,
    creditsIssued: demo.packages[0].creditsIssued,
    claimToken: demo.claim.token,
  }));

  // --- staff-side package sales ------------------------------------------
  mock.post("/api/v1/businesses/:businessId/package-purchases/payment", () => ({
    payment: demo.payments[0],
    clientSecret: "pi_test_demo_secret_abc",
    packagePurchaseId: "pur_new",
  }));
  mock.post("/api/v1/businesses/:businessId/package-purchases", () => ({
    purchase: { id: "pur_new", packageId: demo.packages[0].id },
    entitlement: demo.entitlements[0].entitlement,
  }));

  // --- customer portal ----------------------------------------------------
  // Only the customer persona has purchases attached to their address; the
  // stranger is signed in with nothing anywhere, which is what produces the
  // NoCustomerAccount screen.
  const knownCustomer = () => currentKey() === "customer";
  mock.post("/api/v1/portal/links", () => ({
    businessIds: knownCustomer() ? [demo.business.id] : [],
  }));
  mock.get("/api/v1/portal/businesses", () => ({
    businesses: knownCustomer() ? demo.portalBusinesses : [],
  }));
  mock.get("/api/v1/portal/me", () => ({ customer: demo.portalCustomer }));
  mock.get("/api/v1/portal/bookings", () => ({ bookings: demo.portalBookings }));
  mock.get("/api/v1/portal/bookings/:bookingId", ({ params }) => {
    const booking = demo.portalBookings.find((b) => b.id === params.bookingId);
    if (!booking) throw problem(404, "NOT_FOUND", { title: "Session not found" });
    return { booking };
  });
  mock.post("/api/v1/portal/bookings", () => ({
    booking: demo.makeBooking({ id: "bkg_portal_new", start: demo.at(6, 10) }),
  }));
  mock.post("/api/v1/portal/bookings/:bookingId/cancel", ({ params }) => ({
    booking: {
      ...demo.portalBookings.find((b) => b.id === params.bookingId),
      status: "cancelled_by_customer",
    },
  }));
  mock.post("/api/v1/portal/bookings/:bookingId/reschedule", ({ params, body }) => ({
    booking: {
      ...demo.portalBookings.find((b) => b.id === params.bookingId),
      start: (body as { start?: string })?.start ?? demo.at(7, 10),
    },
  }));
  mock.get("/api/v1/portal/credits", () => ({ credits: demo.portalCredits }));
  mock.get("/api/v1/portal/payments", () => ({ payments: demo.portalPayments }));
  mock.get("/api/v1/portal/conversations", () => ({ conversation: demo.conversations[0] }));
  mock.get("/api/v1/portal/conversations/messages", () => ({
    messages: demo.messages.cnv_priya,
  }));
  mock.post("/api/v1/portal/conversations/messages", ({ body }) => ({
    message: {
      id: "msg_portal_new",
      businessId: demo.business.id,
      conversationId: "cnv_priya",
      senderType: "customer",
      senderId: demo.ids.customerPriya,
      body: (body as { body?: string })?.body ?? "",
      createdAt: new Date().toISOString(),
    },
  }));
  mock.get("/api/v1/portal/notes", () => ({ notes: [] }));
  mock.get("/api/v1/portal/linked-records", () => ({ records: [] }));

  // --- claim --------------------------------------------------------------
  mock.post("/api/v1/customer-claims/:token/accept", ({ params }) => {
    if (params.token !== demo.claim.token) {
      throw problem(404, "CLAIM_NOT_FOUND", { title: "That link is no longer valid" });
    }
    return { businessId: demo.claim.businessId, customerId: demo.claim.customerId };
  });

  return mock;
}
