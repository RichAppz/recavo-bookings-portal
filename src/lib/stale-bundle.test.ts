import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RELOAD_COOLDOWN_MS, isStaleBundleError, shouldReload } from "./stale-bundle.ts";

describe("isStaleBundleError", () => {
  it("spots a missing bundle in Safari, Chrome and Firefox wording", () => {
    assert.ok(isStaleBundleError(new TypeError("Importing a module script failed.")));
    assert.ok(
      isStaleBundleError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://bookings.recavo.app/assets/bookings-X.js",
        ),
      ),
    );
    assert.ok(isStaleBundleError(new Error("error loading dynamically imported module: x")));
    assert.ok(isStaleBundleError(new Error("Unable to preload CSS for /assets/a.css")));
  });

  it("leaves ordinary errors alone", () => {
    assert.equal(isStaleBundleError(new TypeError("Cannot read properties of undefined")), false);
    assert.equal(isStaleBundleError(null), false);
  });
});

describe("shouldReload", () => {
  it("reloads the first time and again after the cooldown, not in between", () => {
    assert.equal(shouldReload(null, 1_000), true);
    assert.equal(shouldReload(1_000, 1_000 + RELOAD_COOLDOWN_MS - 1), false);
    assert.equal(shouldReload(1_000, 1_000 + RELOAD_COOLDOWN_MS + 1), true);
  });
});
