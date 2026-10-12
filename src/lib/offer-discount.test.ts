import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeDiscount,
  discountedMinor,
  discountMinorOff,
  parseDiscountInput,
} from "./offer-discount.ts";

describe("discountMinorOff / discountedMinor", () => {
  it("takes a whole percentage, rounding half-up to the minor unit like the API", () => {
    assert.equal(discountMinorOff({ kind: "percent", percent: 20 }, 5000), 1000);
    assert.equal(discountMinorOff({ kind: "percent", percent: 15 }, 333), 50);
    assert.equal(discountedMinor({ kind: "percent", percent: 100 }, 5000), 0);
  });

  it("caps a fixed amount at the list price and never goes negative", () => {
    assert.equal(discountMinorOff({ kind: "amount", amountMinor: 500 }, 4000), 500);
    assert.equal(discountMinorOff({ kind: "amount", amountMinor: 2000 }, 1500), 1500);
    assert.equal(discountedMinor({ kind: "amount", amountMinor: 2000 }, 1500), 0);
  });

  it("is a no-op for no discount or a free item", () => {
    assert.equal(discountMinorOff(null, 5000), 0);
    assert.equal(discountMinorOff(undefined, 5000), 0);
    assert.equal(discountMinorOff({ kind: "percent", percent: 50 }, 0), 0);
    assert.equal(discountedMinor(null, 5000), 5000);
  });
});

describe("describeDiscount", () => {
  it("reads as a badge", () => {
    assert.equal(describeDiscount({ kind: "percent", percent: 20 }, "GBP"), "20% off");
    assert.equal(describeDiscount({ kind: "amount", amountMinor: 500 }, "GBP"), "£5 off");
    assert.equal(describeDiscount({ kind: "amount", amountMinor: 550 }, "GBP"), "£5.50 off");
    assert.equal(describeDiscount(null, "GBP"), null);
  });
});

describe("parseDiscountInput", () => {
  it("returns null for no discount and the API shape for valid input", () => {
    assert.equal(parseDiscountInput("none", "whatever"), null);
    assert.deepEqual(parseDiscountInput("percent", " 20 "), { kind: "percent", percent: 20 });
    assert.deepEqual(parseDiscountInput("amount", "5"), { kind: "amount", amountMinor: 500 });
    assert.deepEqual(parseDiscountInput("amount", "5.50"), { kind: "amount", amountMinor: 550 });
  });

  it("refuses what the API would reject so the form can say so first", () => {
    assert.equal(parseDiscountInput("percent", ""), undefined);
    assert.equal(parseDiscountInput("percent", "0"), undefined);
    assert.equal(parseDiscountInput("percent", "101"), undefined);
    assert.equal(parseDiscountInput("percent", "12.5"), undefined);
    assert.equal(parseDiscountInput("percent", "ten"), undefined);
    assert.equal(parseDiscountInput("amount", "0"), undefined);
    assert.equal(parseDiscountInput("amount", "-5"), undefined);
    assert.equal(parseDiscountInput("amount", "5.005"), undefined);
  });
});
