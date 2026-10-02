import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billingSurface,
  clientPlatform,
  clientPlatformFor,
  revenueCatApiKey,
  saasPurchasesAllowedInApp,
} from "./native.ts";
import { subscriptionManagedHere } from "./billing/access.ts";

describe("billingSurface", () => {
  it("is the web (Stripe) in a browser tab whatever the store readiness", () => {
    assert.equal(billingSurface(false, false), "web");
    assert.equal(billingSurface(false, true), "web");
  });

  it("is the store (In-App Purchase) in a store app once RevenueCat is configured", () => {
    assert.equal(billingSurface(true, true), "store");
  });

  it("sells nothing in a store app without In-App Purchase (3.1.1 / 3.1.3)", () => {
    assert.equal(billingSurface(true, false), "none");
  });

  it("defaults to the browser when no Capacitor bridge is present", () => {
    // Node has no `window`, which is what isNativeApp() reads.
    assert.equal(billingSurface(), "web");
  });
});

describe("saasPurchasesAllowedInApp", () => {
  it("allows Recavo plan, bolt-on and bundle purchases in a browser", () => {
    assert.equal(saasPurchasesAllowedInApp(false), true);
  });

  it("allows them in a store app through In-App Purchase", () => {
    assert.equal(saasPurchasesAllowedInApp(true, true), true);
  });

  it("refuses them inside a store app that cannot sell", () => {
    assert.equal(saasPurchasesAllowedInApp(true, false), false);
  });

  it("defaults to the browser when no Capacitor bridge is present", () => {
    assert.equal(saasPurchasesAllowedInApp(), true);
  });
});

describe("clientPlatformFor", () => {
  it("names the app platform when running inside the Capacitor shell", () => {
    assert.equal(clientPlatformFor(true, "ios"), "ios");
    assert.equal(clientPlatformFor(true, "android"), "android");
  });

  it("is the web in a browser tab, whatever Capacitor's web fallback reports", () => {
    assert.equal(clientPlatformFor(false, "web"), "web");
    assert.equal(clientPlatformFor(false, undefined), "web");
    assert.equal(clientPlatformFor(false, "ios"), "web");
  });

  it("falls back to web for a native platform it does not know", () => {
    assert.equal(clientPlatformFor(true, "electron"), "web");
  });

  it("sends nothing during the server render, where there is no device", () => {
    assert.equal(clientPlatform(), undefined);
  });
});

describe("revenueCatApiKey", () => {
  it("has no key outside a store app, so a browser can never configure the SDK", () => {
    // Node has no import.meta.env, so both store keys read as unset too.
    assert.equal(revenueCatApiKey(undefined), undefined);
    assert.equal(revenueCatApiKey("apple"), undefined);
    assert.equal(revenueCatApiKey("google"), undefined);
  });
});

describe("subscriptionManagedHere", () => {
  const stripe = { provider: "stripe" as const };
  const apple = { provider: "apple" as const };
  const google = { provider: "google" as const };

  it("lets the web manage Stripe only, and a fresh business start anywhere that sells", () => {
    assert.equal(subscriptionManagedHere(stripe, "web"), true);
    assert.equal(subscriptionManagedHere(apple, "web"), false);
    assert.equal(subscriptionManagedHere(google, "web"), false);
    assert.equal(subscriptionManagedHere(null, "web"), true);
    assert.equal(subscriptionManagedHere(null, "store", "google"), true);
    assert.equal(subscriptionManagedHere(null, "none"), false);
  });

  it("lets each store app manage only its own store's subscription", () => {
    assert.equal(subscriptionManagedHere(apple, "store", "apple"), true);
    assert.equal(subscriptionManagedHere(google, "store", "google"), true);
    assert.equal(subscriptionManagedHere(apple, "store", "google"), false);
    assert.equal(subscriptionManagedHere(google, "store", "apple"), false);
    assert.equal(subscriptionManagedHere(stripe, "store", "google"), false);
  });

  it("treats rows without a provider as Stripe", () => {
    assert.equal(subscriptionManagedHere({}, "web"), true);
    assert.equal(subscriptionManagedHere({}, "store", "apple"), false);
  });
});
