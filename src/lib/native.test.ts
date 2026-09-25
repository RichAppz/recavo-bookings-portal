import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billingSurface,
  clientPlatform,
  clientPlatformFor,
  saasPurchasesAllowedInApp,
} from "./native.ts";

describe("billingSurface", () => {
  it("is the web (Stripe) in a browser tab whatever the store readiness", () => {
    assert.equal(billingSurface(false, false), "web");
    assert.equal(billingSurface(false, true), "web");
  });

  it("is the store (In-App Purchase) in the iOS app once RevenueCat is configured", () => {
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

  it("allows them in the iOS app through In-App Purchase", () => {
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
