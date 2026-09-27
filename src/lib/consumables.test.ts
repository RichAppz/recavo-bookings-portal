import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateMaterialsCost,
  formatQuantity,
  mergeUsage,
  parseQuantity,
  rowsFromLines,
  rowsToItems,
  summariseUsage,
  unitCostLabel,
  usageLabel,
} from "./consumables.ts";

describe("formatQuantity", () => {
  it("drops trailing zeros and keeps up to three decimals", () => {
    assert.equal(formatQuantity(1), "1");
    assert.equal(formatQuantity(0.5), "0.5");
    assert.equal(formatQuantity(2.125), "2.125");
    assert.equal(formatQuantity(250), "250");
    assert.equal(formatQuantity(Number.NaN), "0");
  });
});

describe("parseQuantity", () => {
  it("accepts plain numbers, decimals with either separator, and typed units", () => {
    assert.equal(parseQuantity("1"), 1);
    assert.equal(parseQuantity("0.5"), 0.5);
    assert.equal(parseQuantity("1,5"), 1.5);
    assert.equal(parseQuantity("2 pads"), 2);
    assert.equal(parseQuantity(" 250ml "), 250);
  });

  it("rejects blanks, zero, negatives and more than three decimals", () => {
    assert.equal(parseQuantity(""), null);
    assert.equal(parseQuantity("0"), null);
    assert.equal(parseQuantity("-1"), null);
    assert.equal(parseQuantity("abc"), null);
    assert.equal(parseQuantity("1.0005"), null);
  });
});

describe("usageLabel / summariseUsage", () => {
  it("reads quantity, unit then name", () => {
    assert.equal(
      usageLabel({ name: "Ceramic coat", unit: "bottle", quantity: 1 }),
      "1 bottle Ceramic coat",
    );
    assert.equal(
      summariseUsage([
        { name: "Ceramic coat", unit: "bottle", quantity: 1 },
        { name: "Foam pad", unit: "pad", quantity: 2 },
      ]),
      "1 bottle Ceramic coat, 2 pad Foam pad",
    );
    assert.equal(summariseUsage([]), "");
  });
});

describe("estimateMaterialsCost", () => {
  it("sums quantity × unit cost over costed lines only", () => {
    assert.equal(
      estimateMaterialsCost([
        { name: "Ceramic coat", unit: "bottle", quantity: 1, unitCostMinor: 4500 },
        { name: "Foam pad", unit: "pad", quantity: 2, unitCostMinor: 350 },
        { name: "Snow foam", unit: "ml", quantity: 250, unitCostMinor: null },
      ]),
      5200,
    );
  });

  it("is null when no line carries a cost, and rounds fractional quantities", () => {
    assert.equal(estimateMaterialsCost([{ name: "Snow foam", unit: "ml", quantity: 250 }]), null);
    assert.equal(estimateMaterialsCost([]), null);
    assert.equal(
      estimateMaterialsCost([{ name: "Coating", unit: "ml", quantity: 12.5, unitCostMinor: 33 }]),
      413,
    );
  });
});

describe("unitCostLabel", () => {
  it("formats in the currency per unit, or says none is recorded", () => {
    assert.equal(unitCostLabel(1250, "bottle"), "£12.50 per bottle");
    assert.equal(unitCostLabel(null, "pad"), "No cost recorded");
  });
});

describe("rowsToItems", () => {
  it("drops blank rows, refuses half-filled ones and parses the rest", () => {
    assert.deepEqual(
      rowsToItems([
        { consumableId: "a", quantity: "1" },
        { consumableId: "", quantity: "" },
        { consumableId: "b", quantity: "0.5", note: "ran low" },
      ]),
      {
        ok: true,
        items: [
          { consumableId: "a", quantity: 1 },
          { consumableId: "b", quantity: 0.5, note: "ran low" },
        ],
      },
    );
    assert.deepEqual(rowsToItems([{ consumableId: "", quantity: "2" }]), { ok: false, index: 0 });
    assert.deepEqual(
      rowsToItems([
        { consumableId: "a", quantity: "1" },
        { consumableId: "b", quantity: "0" },
      ]),
      { ok: false, index: 1 },
    );
  });

  it("round-trips lines through rows", () => {
    const rows = rowsFromLines([{ consumableId: "a", quantity: 2.5, note: null }]);
    assert.deepEqual(rows, [{ consumableId: "a", quantity: "2.5", note: null }]);
    assert.deepEqual(rowsToItems(rows), {
      ok: true,
      items: [{ consumableId: "a", quantity: 2.5 }],
    });
  });
});

describe("mergeUsage", () => {
  it("merges the same consumable across services by adding quantities", () => {
    const merged = mergeUsage([
      [
        { consumableId: "a", quantity: 1 },
        { consumableId: "b", quantity: 2 },
      ],
      [{ consumableId: "a", quantity: 0.5 }],
    ]);
    assert.deepEqual(merged, [
      { consumableId: "a", quantity: 1.5 },
      { consumableId: "b", quantity: 2 },
    ]);
  });
});
