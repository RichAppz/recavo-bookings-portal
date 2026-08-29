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

export function isBillingPath(pathname: string): boolean {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

export function isTotpSetupPath(pathname: string): boolean {
  return pathname === "/billing/setup" || pathname.startsWith("/billing/setup/");
}

export function isSaasSubscriptionComplete(subscription: SubscriptionLike): boolean {
  const access = subscriptionAccessState(subscription);
  if (CONSOLE_OK.has(access)) return true;
  const status = subscription?.status;
  return status === "trialing" || status === "active";
}
