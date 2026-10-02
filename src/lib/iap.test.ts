import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogueProductId,
  planFromProductId,
  playPlanReplacement,
  playReplacementMode,
  type IapProduct,
} from "./iap.ts";

const plan = (code: "solo" | "business" | "growth", interval: "month" | "year") => ({
  plan: code,
  interval,
});

function planItem(code: "solo" | "business" | "growth", interval: "month" | "year"): IapProduct {
  const productId = `recavo.plan.${code}.${interval}`;
  return {
    productId,
    product: { kind: "plan", productId, plan: code, interval },
    store: { identifier: `${productId}:base` } as IapProduct["store"],
    priceString: "£0",
    introOffer: null,
  };
}

describe("planFromProductId", () => {
  it("reads tier and period from catalogue and Play identifiers", () => {
    assert.deepEqual(planFromProductId("recavo.plan.solo.month"), plan("solo", "month"));
    assert.deepEqual(planFromProductId("recavo.plan.growth.year:annual"), plan("growth", "year"));
    assert.equal(planFromProductId("recavo.addon.invoicing.month"), undefined);
    assert.equal(planFromProductId("recavo.sms.150"), undefined);
  });
});

describe("playReplacementMode", () => {
  it("charges the difference now when moving up a tier or to yearly", () => {
    assert.equal(
      playReplacementMode(plan("solo", "month"), plan("business", "month")),
      "CHARGE_PRORATED_PRICE",
    );
    assert.equal(
      playReplacementMode(plan("solo", "month"), plan("solo", "year")),
      "CHARGE_PRORATED_PRICE",
    );
    assert.equal(
      playReplacementMode(plan("business", "year"), plan("growth", "year")),
      "CHARGE_PRORATED_PRICE",
    );
    assert.equal(
      playReplacementMode(plan("business", "month"), plan("solo", "year")),
      "CHARGE_PRORATED_PRICE",
    );
  });

  it("defers downgrades and yearly to monthly until the renewal", () => {
    assert.equal(playReplacementMode(plan("growth", "month"), plan("solo", "month")), "DEFERRED");
    assert.equal(playReplacementMode(plan("solo", "year"), plan("solo", "month")), "DEFERRED");
    assert.equal(
      playReplacementMode(plan("growth", "year"), plan("business", "month")),
      "DEFERRED",
    );
  });
});

describe("playPlanReplacement", () => {
  it("names the active plan the purchase must replace", () => {
    assert.deepEqual(
      playPlanReplacement(planItem("business", "month"), [
        "recavo.addon.invoicing.month:monthly",
        "recavo.plan.solo.month:monthly",
      ]),
      { oldProductIdentifier: "recavo.plan.solo.month", replacementMode: "CHARGE_PRORATED_PRICE" },
    );
  });

  it("is a plain purchase when nothing needs replacing", () => {
    assert.equal(playPlanReplacement(planItem("solo", "month"), []), undefined);
    assert.equal(
      playPlanReplacement(planItem("solo", "month"), ["recavo.plan.solo.month:monthly"]),
      undefined,
    );
    assert.equal(
      playPlanReplacement(planItem("solo", "month"), ["recavo.addon.upsells.month:monthly"]),
      undefined,
    );
  });

  it("never touches bolt-ons or credits", () => {
    const addon: IapProduct = {
      ...planItem("solo", "month"),
      productId: "recavo.addon.invoicing.month",
      product: {
        kind: "addon",
        productId: "recavo.addon.invoicing.month",
        addonKey: "invoicing",
      },
    };
    assert.equal(playPlanReplacement(addon, ["recavo.plan.solo.month:monthly"]), undefined);
  });
});

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
