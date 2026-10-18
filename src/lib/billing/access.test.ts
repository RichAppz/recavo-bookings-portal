import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBillingBlocked, isPaymentFailed, subscriptionAccessState } from "./access.ts";

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
