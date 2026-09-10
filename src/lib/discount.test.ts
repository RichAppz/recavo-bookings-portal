import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discountLabel, discountOffMinor } from "./discount.ts";

describe("discountOffMinor", () => {
  it("takes a percentage off, rounded to the penny", () => {
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "10" }), 6500);
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "10%" }), 6500);
    assert.equal(discountOffMinor(9999, { mode: "percent", value: "33.3" }), 3330);
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "100" }), 65000);
  });

  it("takes a fixed amount off", () => {
    assert.equal(discountOffMinor(65000, { mode: "amount", value: "10" }), 1000);
    assert.equal(discountOffMinor(65000, { mode: "amount", value: "£12.50" }), 1250);
    assert.equal(discountOffMinor(65000, { mode: "amount", value: "650" }), 65000);
  });

  it("rejects blanks, junk, negatives and more than the price", () => {
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "" }), null);
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "abc" }), null);
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "-5" }), null);
    assert.equal(discountOffMinor(65000, { mode: "percent", value: "101" }), null);
    assert.equal(discountOffMinor(65000, { mode: "amount", value: "0" }), null);
    assert.equal(discountOffMinor(65000, { mode: "amount", value: "650.01" }), null);
  });
});

describe("discountLabel", () => {
  const fmt = (minor: number) => `£${(minor / 100).toFixed(2)}`;
  it("reads naturally either way", () => {
    assert.equal(discountLabel({ mode: "percent", value: "10 " }, fmt), "10% off");
    assert.equal(discountLabel({ mode: "amount", value: "10" }, fmt), "£10.00 off");
    assert.equal(discountLabel({ mode: "amount", value: "" }, fmt), "Discount");
  });
});
