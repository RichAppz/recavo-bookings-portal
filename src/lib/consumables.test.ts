import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDefaultsToRows,
  averageChangeLabel,
  costFieldLabel,
  costInput,
  countUncosted,
  defaultOnLabel,
  estimateMaterialsCost,
  formatQuantity,
  matchesConsumableSearch,
  mergeUsage,
  normaliseUnit,
  parseConsumablesSearch,
  parseCost,
  parseQuantity,
  parseStockQuantity,
  quantityLabel,
  quantityStep,
  RECORDS_LINE,
  rowsFromLines,
  rowsToItems,
  shareOfPrice,
  shortUsageSummary,
  sortConsumables,
  stepQuantity,
  stockAdvice,
  summariseUsage,
  uncostedLabel,
  unitCode,
  unitCostLabel,
  formatUnitCost,
  packUnitsFor,
  unitCostFromPack,
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
      "1 bottle Ceramic coat, 2 pads Foam pad",
    );
    assert.equal(summariseUsage([]), "");
  });
});

describe("units", () => {
  it("plurals above one; ml, each, short and s-ending units never change", () => {
    assert.equal(quantityLabel(1, "bottle"), "1 bottle");
    assert.equal(quantityLabel(2, "bottle"), "2 bottles");
    assert.equal(quantityLabel(0.5, "litre"), "0.5 litre");
    assert.equal(quantityLabel(1.5, "litre"), "1.5 litres");
    assert.equal(quantityLabel(250, "ml"), "250 ml");
    assert.equal(quantityLabel(3, "each"), "3 each");
    assert.equal(quantityLabel(2, "kg"), "2 kg");
    assert.equal(quantityLabel(2, "gloves"), "2 gloves");
  });

  it("folds typed variants onto the list and keeps anything else", () => {
    assert.equal(normaliseUnit(" Bottles "), "bottle");
    assert.equal(normaliseUnit("Liters"), "litre");
    assert.equal(normaliseUnit("sachet"), "sachet");
    assert.equal(unitCode("pad"), "pad");
    assert.equal(unitCode("sachet"), null);
  });

  it("labels the cost field and the cost by unit", () => {
    assert.equal(costFieldLabel("bottle"), "Cost per bottle");
    assert.equal(costFieldLabel("each"), "Cost each");
    assert.equal(costFieldLabel(""), "Cost per unit");
    assert.equal(unitCostLabel(1200, "each"), "£12.00 each");
  });
});

describe("steppers", () => {
  it("steps by 1, or 0.5 for ml, litre and fractional amounts", () => {
    assert.equal(quantityStep("pad", 2), 1);
    assert.equal(quantityStep("litre", 2), 0.5);
    assert.equal(quantityStep("pad", 1.5), 0.5);
    assert.equal(stepQuantity(2, "pad", 1), 3);
    assert.equal(stepQuantity(1.5, "pad", -1), 1);
    assert.equal(stepQuantity(0.5, "litre", -1), null);
    assert.equal(stepQuantity(1, "pad", -1), null);
  });
});

describe("costs and copy", () => {
  it("says how many items have no cost", () => {
    assert.equal(uncostedLabel(0), null);
    assert.equal(uncostedLabel(1), "1 item has no cost");
    assert.equal(uncostedLabel(3), "3 items have no cost");
    assert.equal(countUncosted([{ unitCostMinor: 1 }, { unitCostMinor: null }, {}]), 2);
  });

  it("parses a typed cost", () => {
    assert.equal(parseCost(""), null);
    assert.equal(parseCost("12.50"), 1250);
    assert.equal(parseCost("£3"), 300);
    assert.equal(parseCost("1,5"), 150);
    assert.equal(parseCost("-1"), "invalid");
    assert.equal(parseCost("1.234"), "invalid");
    assert.equal(costInput(1250), "12.50");
    assert.equal(costInput(null), "");
  });

  it("compares the average with the period before", () => {
    assert.equal(averageChangeLabel(1000, 1210, "last month", "GBP"), "Down £2.10 on last month");
    assert.equal(averageChangeLabel(1210, 1000, "last month", "GBP"), "Up £2.10 on last month");
    assert.equal(averageChangeLabel(1000, 1000, "last month", "GBP"), "Same as last month");
    assert.equal(averageChangeLabel(1000, null, "last month", "GBP"), null);
    assert.equal(shareOfPrice(5670, 32000), 18);
    assert.equal(shareOfPrice(5670, 0), null);
  });

  it("summarises the first two and counts the rest", () => {
    const lines = [
      { name: "Ceramic coat", unit: "bottle", quantity: 1 },
      { name: "Foam pad", unit: "pad", quantity: 2 },
      { name: "Towel", unit: "towel", quantity: 2 },
      { name: "IPA", unit: "ml", quantity: 50 },
    ];
    assert.equal(shortUsageSummary(lines), "1 bottle Ceramic coat, 2 pads Foam pad and 2 more");
    assert.equal(shortUsageSummary(lines.slice(0, 2)), "1 bottle Ceramic coat and 2 pads Foam pad");
    assert.deepEqual(defaultOnLabel([]), { head: "Not on any service", more: null });
    assert.deepEqual(defaultOnLabel(["A", "B", "C", "D"]), { head: "A, B", more: "and 2 more" });
  });

  it("uses no dashes in the records line", () => {
    assert.ok(!/[—–]/.test(RECORDS_LINE));
  });
});

describe("page search", () => {
  it("keeps known values and drops defaults", () => {
    assert.deepEqual(
      parseConsumablesSearch({
        tab: "archived",
        q: "pad",
        sort: "cost",
        period: "this_year",
        item: "x",
      }),
      { tab: "archived", q: "pad", sort: "cost", period: "this_year", item: "x" },
    );
    assert.deepEqual(
      parseConsumablesSearch({ tab: "active", q: " ", sort: "most_used", period: "this_month" }),
      {},
    );
    assert.deepEqual(parseConsumablesSearch({ sort: "nope", period: "decade" }), {});
  });

  it("searches name, SKU and unit, and sorts by use", () => {
    const base = { sku: null, unitCostMinor: null, createdAt: "2026-01-01" };
    const a = { ...base, name: "Pad", unit: "pad", usage: { quantity: 10, jobs: 2 } };
    const b = {
      ...base,
      name: "Coat",
      unit: "bottle",
      sku: "GT-1",
      usage: { quantity: 1, jobs: 5 },
    };
    const c = { ...base, name: "Alpha", unit: "towel", unitCostMinor: 500 };
    assert.ok(matchesConsumableSearch(b, "gt-"));
    assert.ok(matchesConsumableSearch(c, "TOW"));
    assert.ok(!matchesConsumableSearch(a, "coat"));
    assert.deepEqual(
      sortConsumables([a, b, c], "most_used").map((r) => r.name),
      ["Coat", "Pad", "Alpha"],
    );
    assert.deepEqual(
      sortConsumables([a, b, c], "name").map((r) => r.name),
      ["Alpha", "Coat", "Pad"],
    );
    assert.deepEqual(sortConsumables([a, b, c], "cost").map((r) => r.name)[0], "Alpha");
  });
});

describe("addDefaultsToRows", () => {
  it("adds missing items as defaults and tops up ones already there", () => {
    assert.deepEqual(
      addDefaultsToRows(
        [{ consumableId: "a", quantity: "1" }],
        [
          { consumableId: "a", quantity: 0.5 },
          { consumableId: "b", quantity: 2 },
        ],
      ),
      [
        { consumableId: "a", quantity: "1.5" },
        { consumableId: "b", quantity: "2", source: "default" },
      ],
    );
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
    assert.equal(unitCostLabel(null, "pad"), "No cost");
  });

  it("shows fractions of a penny", () => {
    assert.equal(unitCostLabel(0.8, "ml"), "0.8p per ml");
    assert.equal(formatUnitCost(333.3333), "£3.333333");
    assert.equal(formatUnitCost(0.8, "EUR"), "€0.008");
    assert.equal(formatUnitCost(800), "£8.00");
  });
});

describe("pack price", () => {
  it("works out the cost per unit, converting ml and litres", () => {
    assert.equal(unitCostFromPack({ size: 5, unit: "litre", costMinor: 4000 }, "ml"), 0.8);
    assert.equal(unitCostFromPack({ size: 500, unit: "ml", costMinor: 1200 }, "litre"), 2400);
    assert.equal(unitCostFromPack({ size: 3, unit: "pad", costMinor: 1000 }, "pad"), 333.3333);
    assert.equal(unitCostFromPack({ size: 2, unit: "pad", costMinor: 100 }, "ml"), null);
    assert.equal(unitCostFromPack({ size: 0, unit: "ml", costMinor: 100 }, "ml"), null);
  });

  it("offers ml and litres together, anything else on its own", () => {
    assert.deepEqual(packUnitsFor("ml"), ["ml", "litre"]);
    assert.deepEqual(packUnitsFor("pad"), ["pad"]);
    assert.deepEqual(packUnitsFor(""), []);
  });

  it("takes and shows a cost per ml down to a fraction of a penny", () => {
    assert.equal(parseCost("0.008", { decimals: 6 }), 0.8);
    assert.equal(parseCost("12.5", { decimals: 6 }), 1250);
    assert.equal(parseCost("0.0000001", { decimals: 6 }), "invalid");
    assert.equal(parseCost("0.008"), "invalid");
    assert.equal(costInput(0.8), "0.008");
    assert.equal(costInput(1250), "12.50");
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

describe("stock", () => {
  const stock = {
    onHand: 3,
    upcoming: 0,
    afterUpcoming: 3,
    shortBy: 0,
    reorderLevel: null,
    status: "ok" as const,
  };

  it("parses a stock count, allowing zero", () => {
    assert.equal(parseStockQuantity("0"), 0);
    assert.equal(parseStockQuantity("0,0"), 0);
    assert.equal(parseStockQuantity("2.5 litres"), 2.5);
    assert.equal(parseStockQuantity(""), null);
    assert.equal(parseStockQuantity("-1"), null);
  });

  it("says what the shelf means for booked jobs", () => {
    assert.equal(
      stockAdvice(
        { ...stock, upcoming: 5, afterUpcoming: -2, shortBy: 2, status: "short" },
        "bottle",
      ),
      "Short 2 bottles for booked jobs",
    );
    assert.equal(
      stockAdvice({ ...stock, onHand: 0, afterUpcoming: 0, status: "out" }, "pad"),
      "None left",
    );
    assert.equal(
      stockAdvice(
        { ...stock, upcoming: 2, afterUpcoming: 1, reorderLevel: 2, status: "low" },
        "bottle",
      ),
      "1 bottle left after booked jobs, reorder at 2",
    );
    assert.equal(
      stockAdvice({ ...stock, upcoming: 1, afterUpcoming: 2 }, "pad"),
      "2 pads left after booked jobs",
    );
    assert.equal(stockAdvice(stock, "pad"), "Nothing booked needs it yet");
  });
});
