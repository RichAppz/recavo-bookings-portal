import { nativeStore, type NativeStore } from "./native.ts";

/**
 * Store-specific wording for In-App Purchase screens, keyed by the billing
 * provider the API records for a store subscription. The app we are running in
 * decides which store sells (`nativeStore()`); the subscription's `provider`
 * decides which store a *given* subscription is managed in, which matters on the
 * website and when a business opens the other platform's app.
 */
export type StoreCopy = {
  /** "App Store" / "Google Play". */
  name: string;
  /** What the charge appears on: "your Apple ID" / "your Google account". */
  account: string;
  /** Where auto-renew is turned off, as the OS labels it. */
  managePath: string;
  /** The Recavo app for that store, as a customer would call it. */
  appName: string;
  /** Subscription-management page when RevenueCat has no better URL. */
  managementUrl: string;
  /** Standard EULA the store expects linked beside subscription pricing, if any. */
  eulaUrl: string | null;
};

export const STORE_COPY: Record<NativeStore, StoreCopy> = {
  apple: {
    name: "App Store",
    account: "your Apple ID",
    managePath: "Settings › Apple ID › Subscriptions",
    appName: "Recavo iPhone app",
    managementUrl: "https://apps.apple.com/account/subscriptions",
    // App Store Review requires a Terms of Use link beside subscription pricing.
    eulaUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  },
  google: {
    name: "Google Play",
    account: "your Google account",
    managePath: "Google Play › Payments & subscriptions › Subscriptions",
    appName: "Recavo Android app",
    managementUrl: "https://play.google.com/store/account/subscriptions",
    eulaUrl: null,
  },
};

/** Copy for the store this build sells through; Apple's when not in a store app. */
export function currentStoreCopy(): StoreCopy {
  return STORE_COPY[nativeStore() ?? "apple"];
}

/** Copy for the store a subscription with this provider is managed in; null for Stripe. */
export function storeCopyFor(provider: string | null | undefined): StoreCopy | null {
  return provider === "apple" || provider === "google" ? STORE_COPY[provider] : null;
}
