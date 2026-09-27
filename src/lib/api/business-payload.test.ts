import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCreateBusinessPayload } from "./business-payload.ts";

describe("buildCreateBusinessPayload", () => {
  it("trims names and omits blank optional fields", () => {
    assert.deepEqual(
      buildCreateBusinessPayload({
        legalName: "  Peak Performance PT ",
        tradingName: "   ",
        industryTemplateKey: "personal_training",
        referralCode: "",
      }),
      { legalName: "Peak Performance PT", industryTemplateKey: "personal_training" },
    );
  });

  it("keeps trading name and referral code when provided", () => {
    assert.deepEqual(
      buildCreateBusinessPayload({
        legalName: "Prestige Auto Care Ltd",
        tradingName: " Prestige ",
        industryTemplateKey: "car_detailing",
        referralCode: " ABCD-EFGH ",
      }),
      {
        legalName: "Prestige Auto Care Ltd",
        tradingName: "Prestige",
        industryTemplateKey: "car_detailing",
        referralCode: "ABCD-EFGH",
      },
    );
  });

  it("never emits an undefined key", () => {
    const payload = buildCreateBusinessPayload({
      legalName: "Solo",
      industryTemplateKey: "personal_training",
    });
    assert.equal("tradingName" in payload, false);
    assert.equal("referralCode" in payload, false);
  });
});
