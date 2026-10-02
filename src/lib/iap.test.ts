import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogueProductId } from "./iap.ts";

describe("catalogueProductId", () => {
  it("strips the Google Play base plan from a subscription identifier", () => {
    assert.equal(catalogueProductId("recavo.plan.solo.month:monthly"), "recavo.plan.solo.month");
    assert.equal(
      catalogueProductId("recavo.plan.business.year:annual-autorenewing"),
      "recavo.plan.business.year",
    );
    assert.equal(
      catalogueProductId("recavo.addon.invoicing.month:p1m"),
      "recavo.addon.invoicing.month",
    );
  });

  it("leaves App Store ids and Play consumables alone", () => {
    assert.equal(catalogueProductId("recavo.plan.solo.month"), "recavo.plan.solo.month");
    assert.equal(catalogueProductId("recavo.sms.150"), "recavo.sms.150");
  });
});
