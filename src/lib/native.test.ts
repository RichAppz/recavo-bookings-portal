import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saasPurchasesAllowedInApp } from "./native.ts";

describe("saasPurchasesAllowedInApp", () => {
  it("allows Recavo plan, bolt-on and bundle purchases in a browser", () => {
    assert.equal(saasPurchasesAllowedInApp(false), true);
  });

  it("refuses them inside the store apps (App Store 3.1.1 / 3.1.3, Play equivalent)", () => {
    assert.equal(saasPurchasesAllowedInApp(true), false);
  });

  it("defaults to the browser when no Capacitor bridge is present", () => {
    // Node has no `window`, which is what isNativeApp() reads.
    assert.equal(saasPurchasesAllowedInApp(), true);
  });
});
