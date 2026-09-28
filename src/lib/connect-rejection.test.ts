import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectOnboardingWorthRetrying, connectRejection } from "./connect-rejection.ts";

describe("connectRejection", () => {
  it("is nothing for an account that has not been rejected", () => {
    assert.equal(connectRejection(null), null);
    assert.equal(connectRejection(undefined), null);
    assert.equal(connectRejection({ onboardingState: "complete" }), null);
    assert.equal(connectRejection({ onboardingState: "pending" }), null);
  });

  it("labels the reason and keeps the provider's own wording", () => {
    const rejection = connectRejection({
      onboardingState: "rejected",
      rejectionReasonCode: "terms_of_service",
      rejectionReasonDetail: "Sale of prohibited goods: weapons",
      rejectedAt: "2026-09-28T09:00:00.000Z",
    });

    assert.deepEqual(rejection, {
      reasonLabel: "Terms of service violation",
      detail: "Sale of prohibited goods: weapons",
      rejectedAt: "2026-09-28T09:00:00.000Z",
    });
  });

  it("labels credit risk, which the provider never gives detail for", () => {
    const rejection = connectRejection({
      onboardingState: "rejected",
      rejectionReasonCode: "credit_risk",
      rejectionReasonDetail: null,
      rejectedAt: "2026-09-28T09:00:00.000Z",
    });

    assert.equal(rejection?.reasonLabel, "Credit risk");
    assert.equal(rejection?.detail, null);
  });

  it("still reports the rejection when no reason may be passed on", () => {
    // The API withholds the code for reasons we must not disclose, so the page has to
    // explain that payments have stopped without inventing a reason for it.
    const rejection = connectRejection({
      onboardingState: "rejected",
      rejectionReasonCode: null,
      rejectionReasonDetail: null,
      rejectedAt: null,
    });

    assert.deepEqual(rejection, { reasonLabel: null, detail: null, rejectedAt: null });
  });

  it("does not invent a label for a code it does not know", () => {
    const rejection = connectRejection({
      onboardingState: "rejected",
      rejectionReasonCode: "listed",
      rejectionReasonDetail: "  ",
      rejectedAt: null,
    });

    assert.equal(rejection?.reasonLabel, null);
    assert.equal(rejection?.detail, null);
  });
});

describe("connectOnboardingWorthRetrying", () => {
  it("is pointless once the provider has rejected the account", () => {
    assert.equal(connectOnboardingWorthRetrying({ onboardingState: "rejected" }), false);
  });

  it("is worth offering for every state the business can still finish", () => {
    assert.equal(connectOnboardingWorthRetrying({ onboardingState: "not_started" }), true);
    assert.equal(connectOnboardingWorthRetrying({ onboardingState: "pending" }), true);
    assert.equal(connectOnboardingWorthRetrying(null), true);
  });
});
