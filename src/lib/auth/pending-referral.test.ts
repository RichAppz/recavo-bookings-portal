import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayReferralCode, normaliseReferralCode } from "./pending-referral.ts";

describe("referral code helpers", () => {
  it("normalises display form and rejects bad shapes", () => {
    assert.equal(normaliseReferralCode("abcd-efgh"), "ABCDEFGH");
    assert.equal(normaliseReferralCode("ab cd efgh"), "ABCDEFGH");
    assert.equal(normaliseReferralCode("NOPE-NOPE"), null);
    assert.equal(normaliseReferralCode("ABCD"), null);
  });

  it("displays with a hyphen", () => {
    assert.equal(displayReferralCode("ABCDEFGH"), "ABCD-EFGH");
    assert.equal(displayReferralCode("abcd-efgh"), "ABCD-EFGH");
  });
});
