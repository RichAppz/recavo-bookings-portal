import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuickAddService, durationToMinutes, splitDuration } from "./quick-add-service.ts";

describe("splitDuration — stored minutes back to what was typed", () => {
  it("prefers whole days, then whole/half hours, then minutes", () => {
    assert.deepEqual(splitDuration(2880), { value: "2", unit: "days" });
    assert.deepEqual(splitDuration(1440), { value: "1", unit: "days" });
    assert.deepEqual(splitDuration(210), { value: "3.5", unit: "hours" });
    assert.deepEqual(splitDuration(60), { value: "1", unit: "hours" });
    assert.deepEqual(splitDuration(45), { value: "45", unit: "minutes" });
    assert.deepEqual(splitDuration(100), { value: "100", unit: "minutes" });
  });
});

describe("durationToMinutes — typed value + unit to minutes", () => {
  it("converts each unit and rounds to whole minutes", () => {
    assert.equal(durationToMinutes("90", "minutes"), 90);
    assert.equal(durationToMinutes("1.5", "hours"), 90);
    assert.equal(durationToMinutes("2", "days"), 2880);
    assert.equal(durationToMinutes(" 3 ", "hours"), 180);
  });

  it("rejects blank, zero, negative and non-numeric input", () => {
    assert.equal(durationToMinutes("", "hours"), null);
    assert.equal(durationToMinutes("0", "hours"), null);
    assert.equal(durationToMinutes("-1", "days"), null);
    assert.equal(durationToMinutes("abc", "minutes"), null);
  });
});

describe("buildQuickAddService — the body sent from the booking form", () => {
  const good = {
    name: "  Headlight restoration ",
    category: " Polishing ",
    durationValue: "1.5",
    durationUnit: "hours" as const,
    price: "£85",
    currency: "GBP",
  };

  it("fills in the defaults the full Services form would have used", () => {
    const result = buildQuickAddService(good);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.body, {
      name: "Headlight restoration",
      description: null,
      category: "Polishing",
      durationMinutes: 90,
      basePriceMinor: 8500,
      currency: "GBP",
      capacityMin: 1,
      capacityMax: 1,
      bookingMode: "individual",
      eligibleStaffIds: [],
      locationIds: [],
      availabilityWindows: [],
      variants: [],
      depositMinor: 0,
      active: true,
      publicVisible: true,
      colour: null,
    });
  });

  it("treats a blank category as none and allows a free price of £0", () => {
    const result = buildQuickAddService({ ...good, category: "   ", price: "0" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.body.category, null);
    assert.equal(result.body.basePriceMinor, 0);
  });

  it("reports every missing field at once rather than one per submit", () => {
    const result = buildQuickAddService({
      ...good,
      name: " ",
      durationValue: "",
      price: "lots",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(Object.keys(result.errors).sort(), [
      "basePriceMinor",
      "durationMinutes",
      "name",
    ]);
  });

  it("refuses a negative price", () => {
    const result = buildQuickAddService({ ...good, price: "-5" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.basePriceMinor);
    assert.equal(result.errors.name, undefined);
  });
});
