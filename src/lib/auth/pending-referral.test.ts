import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayReferralCode } from "./pending-referral.ts";

describe("referral code helpers", () => {
  it("shows a code as it was shared", () => {
    assert.equal(displayReferralCode("abcd-efgh"), "ABCD-EFGH");
    assert.equal(displayReferralCode("ABCDEFGH"), "ABCDEFGH");
    assert.equal(displayReferralCode("sparkles"), "SPARKLES");
    assert.equal(displayReferralCode(" shine cars "), "SHINECARS");
  });
});
