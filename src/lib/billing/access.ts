import { nativeStore } from "../native.ts";

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

export type SubscriptionProvider = "stripe" | "apple" | "google";
type ProviderLike = { provider?: SubscriptionProvider | null } | null | undefined;

/**
 * Who bills the subscription. Rows written before store billing existed have
 * no `provider`, and they are all Stripe.
 */
export function subscriptionProvider(subscription: ProviderLike): SubscriptionProvider {
  const p = subscription?.provider;
  return p === "apple" || p === "google" ? p : "stripe";
}

/** Billed through the App Store or Google Play rather than Stripe. */
export function isStoreBilled(subscription: ProviderLike): boolean {
  return subscriptionProvider(subscription) !== "stripe";
}

/**
 * Whether the plan and bolt-ons can be changed from the surface we are on.
 * A store subscription is managed by that store: the website may show it but
 * not touch it (and the API refuses if it tries), the reverse holds for a
 * Stripe subscription seen from a store app, and an App Store subscription seen
 * from the Android app (or vice versa) is read-only too — each store only
 * manages its own.
 */
export function subscriptionManagedHere(
  subscription: ProviderLike,
  surface: "web" | "store" | "none",
  store: "apple" | "google" | undefined = nativeStore(),
): boolean {
  if (surface === "none") return false;
  // Nothing yet: whoever is here can start one.
  if (!subscription) return true;
  const provider = subscriptionProvider(subscription);
  return surface === "web" ? provider === "stripe" : provider === store;
}

/**
 * A Stripe subscription whose renewal didn't go through (grace or locked out).
 * The way back in is paying the open invoice, never a new Checkout: the API
 * refuses one while this row is live. Store subscriptions are the store's to
 * chase, so they never count.
 */
export function isPaymentFailed(
  subscription: (SubscriptionLike & ProviderLike) | null | undefined,
): boolean {
  if (!subscription || isStoreBilled(subscription)) return false;
  return subscription.status === "past_due" || subscription.status === "unpaid";
}

export type BillingNavAlert = {
  /** `grace`: still working, deadline ahead. `locked`: the workspace is read-only. */
  level: "grace" | "locked";
  /** ISO deadline while in grace, when the API knows it. */
  graceEndsAt: string | null;
  /** Whether paying from this surface is possible (Stripe, managed here). */
  payableHere: boolean;
};

/**
 * What the sidebar should warn about when the subscription's payment is in
 * trouble. Grace and a lock-out both qualify, whoever bills; a store-billed
 * subscription is the store's to chase so it is never "payable here". Nothing
 * for a healthy, trialling, ended or missing subscription.
 */
export function billingNavAlert(
  subscription:
    (SubscriptionLike & ProviderLike & { graceEndsAt?: string | null }) | null | undefined,
  surface: "web" | "store" | "none",
  store: "apple" | "google" | undefined = nativeStore(),
): BillingNavAlert | null {
  if (!subscription) return null;
  const access = subscriptionAccessState(subscription);
  const failed = isPaymentFailed(subscription);
  if (access !== "grace" && access !== "restricted" && !failed) return null;
  // `restricted` without a failed payment (e.g. paused) is still a lock-out;
  // a failed payment that has not restricted anything yet still works.
  const level: BillingNavAlert["level"] = access === "restricted" ? "locked" : "grace";
  return {
    level,
    graceEndsAt: level === "grace" ? (subscription.graceEndsAt ?? null) : null,
    payableHere:
      subscriptionProvider(subscription) === "stripe" &&
      subscriptionManagedHere(subscription, surface, store),
  };
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
