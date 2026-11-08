import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billingNavAlert,
  isBillingBlocked,
  isPaymentFailed,
  subscriptionAccessState,
} from "./access.ts";

describe("billingNavAlert", () => {
  it("warns during grace with the deadline, payable on the web for Stripe", () => {
    assert.deepEqual(
      billingNavAlert(
        { status: "past_due", accessState: "grace", graceEndsAt: "2026-10-20T14:35:11.000Z" },
        "web",
        undefined,
      ),
      { level: "grace", graceEndsAt: "2026-10-20T14:35:11.000Z", payableHere: true },
    );
  });

  it("says locked once access is restricted, with no deadline", () => {
    assert.deepEqual(
      billingNavAlert(
        { status: "past_due", accessState: "restricted", graceEndsAt: "2026-10-20T14:35:11.000Z" },
        "web",
        undefined,
      ),
      { level: "locked", graceEndsAt: null, payableHere: true },
    );
    assert.equal(
      billingNavAlert({ status: "paused", accessState: "restricted" }, "web", undefined)?.level,
      "locked",
    );
  });

  it("is not payable from a store app or for a store-billed subscription", () => {
    assert.equal(
      billingNavAlert({ status: "past_due", accessState: "grace" }, "store", "apple")?.payableHere,
      false,
    );
    assert.deepEqual(
      billingNavAlert(
        { status: "past_due", accessState: "grace", provider: "apple" },
        "store",
        "apple",
      ),
      { level: "grace", graceEndsAt: null, payableHere: false },
    );
  });

  it("stays quiet for healthy, trialling, ended and missing subscriptions", () => {
    assert.equal(billingNavAlert({ status: "active", accessState: "entitled" }, "web"), null);
    assert.equal(billingNavAlert({ status: "trialing", accessState: "trial" }, "web"), null);
    assert.equal(billingNavAlert({ status: "cancelled", accessState: "ended" }, "web"), null);
    assert.equal(billingNavAlert(null, "web"), null);
    assert.equal(billingNavAlert(undefined, "web"), null);
  });
});

describe("isPaymentFailed", () => {
  it("is true for a Stripe renewal that failed, in grace or locked out", () => {
    assert.equal(isPaymentFailed({ status: "past_due", accessState: "grace" }), true);
    assert.equal(isPaymentFailed({ status: "past_due", accessState: "restricted" }), true);
    assert.equal(isPaymentFailed({ status: "unpaid", accessState: "restricted" }), true);
    assert.equal(
      isPaymentFailed({ status: "past_due", accessState: "restricted", provider: "stripe" }),
      true,
    );
  });

  it("is false for healthy, ended, missing and store-billed subscriptions", () => {
    assert.equal(isPaymentFailed({ status: "active", accessState: "entitled" }), false);
    assert.equal(isPaymentFailed({ status: "trialing", accessState: "trial" }), false);
    assert.equal(isPaymentFailed({ status: "cancelled", accessState: "ended" }), false);
    assert.equal(isPaymentFailed(null), false);
    assert.equal(isPaymentFailed(undefined), false);
    assert.equal(
      isPaymentFailed({ status: "past_due", accessState: "restricted", provider: "apple" }),
      false,
    );
  });

  it("a locked-out failed payment is still billing-blocked for the shell", () => {
    const sub = { status: "past_due", accessState: "restricted" } as const;
    assert.equal(subscriptionAccessState(sub), "restricted");
    assert.equal(isBillingBlocked(sub), true);
    assert.equal(isBillingBlocked({ status: "past_due", accessState: "grace" }), false);
  });
});
