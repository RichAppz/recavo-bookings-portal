type SubscriptionLike =
  | {
      accessState?: string | null;
      status?: string | null;
    }
  | null
  | undefined;

export type BillingAccessState =
  "none" | "pending" | "trial" | "entitled" | "grace" | "restricted" | "ended";

const CONSOLE_OK = new Set<string>(["trial", "entitled", "grace"]);
const BLOCKED = new Set<string>(["none", "pending", "restricted", "ended"]);

export function subscriptionAccessState(subscription: SubscriptionLike): BillingAccessState {
  const access = subscription?.accessState;
  if (
    access === "none" ||
    access === "pending" ||
    access === "trial" ||
    access === "entitled" ||
    access === "grace" ||
    access === "restricted" ||
    access === "ended"
  ) {
    return access;
  }
  return "none";
}

/** Staff console is usable during trial, paid access, and payment-failure grace. */
export function isConsoleAccessAllowed(subscription: SubscriptionLike): boolean {
  return CONSOLE_OK.has(subscriptionAccessState(subscription));
}

export function isBillingBlocked(subscription: SubscriptionLike): boolean {
  if (!subscription) return true;
  return BLOCKED.has(subscriptionAccessState(subscription));
}

type ProviderLike = { provider?: "stripe" | "apple" | null } | null | undefined;

/**
 * Who bills the subscription. Rows written before App Store billing existed have
 * no `provider`, and they are all Stripe.
 */
export function subscriptionProvider(subscription: ProviderLike): "stripe" | "apple" {
  return subscription?.provider === "apple" ? "apple" : "stripe";
}

/**
 * Whether the plan and bolt-ons can be changed from the surface we are on.
 * An App Store subscription is managed by Apple: the website may show it but
 * not touch it (and the API refuses if it tries), and the reverse holds for a
 * Stripe subscription seen from the iOS app.
 */
export function subscriptionManagedHere(
  subscription: ProviderLike,
  surface: "web" | "store" | "none",
): boolean {
  if (surface === "none") return false;
  // Nothing yet: whoever is here can start one.
  if (!subscription) return true;
  const provider = subscriptionProvider(subscription);
  return surface === "web" ? provider === "stripe" : provider === "apple";
}

export function isBillingPath(pathname: string): boolean {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

export function isSaasSubscriptionComplete(subscription: SubscriptionLike): boolean {
  const access = subscriptionAccessState(subscription);
  if (CONSOLE_OK.has(access)) return true;
  const status = subscription?.status;
  return status === "trialing" || status === "active";
}
