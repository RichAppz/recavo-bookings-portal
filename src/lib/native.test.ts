import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billingSurface, saasPurchasesAllowedInApp } from "./native.ts";

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
