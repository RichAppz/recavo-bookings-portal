/**
 * In-App Purchase for the store apps (App Store Review Guideline 3.1.1).
 *
 * Recavo's own plans, bolt-ons and text bundles are digital services sold to
 * individuals, so inside the iOS app they must be bought with StoreKit. This
 * module wraps the RevenueCat Capacitor plugin: it is the only place that talks
 * to the store, and every purchase is bound to the *business* (RevenueCat App
 * User ID `biz:<business id>`, handed to us by the API) rather than the
 * signed-in person, because the subscription entitles the business. After a
 * purchase or restore the caller asks the API to reconcile, which pulls the
 * RevenueCat snapshot and unlocks the console — the store receipt never
 * reaches our servers directly.
 *
 * Everything here is a no-op outside the native app; the plugin is imported
 * lazily so the SSR render and the web bundle never load it.
 */

import type { CustomerInfo, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import type { AppStoreConfig, AppStoreProduct } from "@/lib/api/hooks";
import { billingSurface, isNativeApp, revenueCatApiKey } from "@/lib/native";

/** Whether this surface sells through the store at all (native iOS + key set). */
export function iapAvailable(): boolean {
  return billingSurface() === "store";
}

type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
type PurchasesPlugin = PurchasesModule["Purchases"];

let modulePromise: Promise<PurchasesModule> | undefined;
let configuredFor: string | undefined;

/**
 * Loads the plugin once. Returns it wrapped in an object on purpose: a Capacitor
 * plugin is a Proxy that turns *every* property read into a native call, so
 * resolving a Promise with it (or returning it from an async function) makes the
 * Promise machinery read `.then` and the bridge throws
 * `"Purchases.then()" is not implemented on ios` (same trap as appleSignInPlugin).
 */
async function purchases(): Promise<{ plugin: PurchasesPlugin }> {
  if (!modulePromise) {
    modulePromise = import("@revenuecat/purchases-capacitor");
  }
  const { Purchases } = await modulePromise;
  return { plugin: Purchases };
}

/**
 * Points the SDK at the given business. Configures once per app launch and
 * switches App User ID when the active business changes (an owner may hold
 * several); RevenueCat aliases nothing on `logIn` when the id is a fresh,
 * non-anonymous one, so purchases never bleed between businesses.
 */
export async function configureIap(appUserId: string): Promise<void> {
  if (!iapAvailable()) return;
  const apiKey = revenueCatApiKey();
  if (!apiKey) return;
  const { plugin: Purchases } = await purchases();
  if (!configuredFor) {
    await Purchases.configure({ apiKey, appUserID: appUserId });
    configuredFor = appUserId;
    return;
  }
  if (configuredFor !== appUserId) {
    await Purchases.logIn({ appUserID: appUserId });
    configuredFor = appUserId;
  }
}

/** Forget the business on sign-out so the next sign-in cannot see its receipts. */
export async function resetIap(): Promise<void> {
  if (!configuredFor) return;
  try {
    const { plugin: Purchases } = await purchases();
    await Purchases.logOut();
  } catch {
    // Already anonymous, or the SDK was never configured in this session.
  } finally {
    configuredFor = undefined;
  }
}

/**
 * A store product joined to what it buys. The price fields come from StoreKit
 * already localised for the user's storefront; they are the only prices the
 * app may show for Recavo's own services.
 */
export type IapProduct = {
  productId: string;
  product: AppStoreProduct;
  store: PurchasesStoreProduct;
  /** e.g. "£22.99" */
  priceString: string;
  /** Free trial / intro offer StoreKit says this user is eligible for, if any. */
  introOffer: { priceString: string; period: string; cycles: number } | null;
};

/**
 * Fetches StoreKit products for the API's catalogue. Products missing from the
 * store (not yet approved, wrong bundle id, sandbox not signed in) are simply
 * absent; callers hide what they cannot price.
 */
export async function loadIapProducts(config: AppStoreConfig): Promise<IapProduct[]> {
  if (!iapAvailable()) return [];
  const { plugin: Purchases } = await purchases();
  const ids = config.products.map((p) => p.productId);
  const { products } = await Purchases.getProducts({ productIdentifiers: ids });
  const byId = new Map(config.products.map((p) => [p.productId, p]));
  const out: IapProduct[] = [];
  for (const store of products) {
    const product = byId.get(store.identifier);
    if (!product) continue;
    out.push({
      productId: store.identifier,
      product,
      store,
      priceString: store.priceString,
      introOffer: store.introPrice
        ? {
            priceString: store.introPrice.priceString,
            period: store.introPrice.period,
            cycles: store.introPrice.cycles,
          }
        : null,
    });
  }
  return out;
}

export type IapPurchaseResult =
  | { status: "purchased"; customerInfo: CustomerInfo }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** Runs the StoreKit payment sheet for one product. */
export async function purchaseIapProduct(item: IapProduct): Promise<IapPurchaseResult> {
  if (!iapAvailable()) return { status: "error", message: "Purchases are not available here." };
  const { plugin: Purchases } = await purchases();
  try {
    const { customerInfo } = await Purchases.purchaseStoreProduct({ product: item.store });
    return { status: "purchased", customerInfo };
  } catch (err) {
    if (isUserCancelled(err)) return { status: "cancelled" };
    return { status: "error", message: purchaseErrorMessage(err) };
  }
}

/** Re-syncs receipts already on this Apple ID (new device, reinstall, second owner). */
export async function restoreIapPurchases(): Promise<IapPurchaseResult> {
  if (!iapAvailable()) return { status: "error", message: "Purchases are not available here." };
  const { plugin: Purchases } = await purchases();
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return { status: "purchased", customerInfo };
  } catch (err) {
    return { status: "error", message: purchaseErrorMessage(err) };
  }
}

/**
 * Apple's subscription management page for this account. Auto-renewal is turned
 * off there, not in the app: StoreKit owns the subscription, we only reflect it.
 */
export async function iapManagementUrl(): Promise<string> {
  const fallback = "https://apps.apple.com/account/subscriptions";
  if (!iapAvailable()) return fallback;
  try {
    const { plugin: Purchases } = await purchases();
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo.managementURL ?? fallback;
  } catch {
    return fallback;
  }
}

export async function openIapManagement(): Promise<void> {
  const url = await iapManagementUrl();
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** RevenueCat rejects with `{ code, message, userCancelled }`; code "1" is the user backing out. */
function isUserCancelled(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; userCancelled?: unknown; message?: unknown };
  if (e.userCancelled === true) return true;
  if (String(e.code) === "1") return true;
  return typeof e.message === "string" && /cancel/i.test(e.message);
}

function purchaseErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  if (/network|offline|connection/i.test(raw))
    return "Couldn't reach the App Store. Check your connection and try again.";
  if (/not allowed|restricted|parental/i.test(raw))
    return "Purchases are restricted on this device.";
  if (/already (purchased|subscribed)|already owns/i.test(raw))
    return "You already have this. Try Restore purchases.";
  // RevenueCat code 11: the build's public SDK key is wrong or missing — ours to fix, not theirs.
  if (/credentials|invalid api key/i.test(raw))
    return "Purchases aren't available in this build. Please update the app or contact support.";
  return raw || "The purchase didn't go through. Nothing was charged.";
}

/** Sort key so the storefront lists Solo → Business → Growth, monthly before yearly. */
export function planOrder(product: AppStoreProduct): number {
  const tier = product.plan === "solo" ? 0 : product.plan === "business" ? 1 : 2;
  return tier * 2 + (product.interval === "year" ? 1 : 0);
}
