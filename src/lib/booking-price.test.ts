import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjustmentLabel,
  bookingPriceBreakdown,
  formatAdjustment,
  linePriceMinor,
} from "./booking-price.ts";

const fmt = (minor: number) => `£${(minor / 100).toFixed(2)}`;

const snapshot = {
  serviceId: "svc_coat",
  name: "5 year coating",
  variantName: null,
  durationMinutes: 480,
  priceMinor: 40_000,
  currency: "GBP",
};
const coating = {
  serviceId: "svc_coat",
  position: 0,
  name: "5 year coating",
  variantName: null,
  durationMinutes: 480,
  priceMinor: 40_000,
  currency: "GBP",
};
const level1 = {
  serviceId: "svc_l1",
  position: 1,
  name: "Level 1",
  variantName: "M",
  durationMinutes: 480,
  priceMinor: 44_500,
  currency: "GBP",
};

describe("bookingPriceBreakdown", () => {
  it("shows every service at list, a discount row and the total for a staff-priced job", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 70_000,
      adjustmentMinor: -14_500,
      currency: "GBP",
      lineItems: [level1, coating], // out of order on purpose
      serviceSnapshot: snapshot,
    });
    assert.deepEqual(
      b.lines.map((l) => [l.name, l.priceMinor]),
      [
        ["5 year coating", 40_000],
        ["Level 1", 44_500],
      ],
    );
    assert.equal(b.listPriceMinor, 84_500);
    assert.equal(b.adjustmentMinor, -14_500);
    assert.equal(b.totalMinor, 70_000);
    assert.equal(b.legacyFolded, false);
    assert.equal(b.hasBreakdown, true);
  });

  it("derives the adjustment from the lines when the API predates the field", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 70_000,
      currency: "GBP",
      lineItems: [coating, level1],
      serviceSnapshot: snapshot,
    });
    assert.equal(b.adjustmentMinor, -14_500);
    assert.equal(b.hasBreakdown, true);
  });

  it("renders a booking whose discount was folded into the primary as-is, without a discount row", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 70_000,
      adjustmentMinor: 0,
      currency: "GBP",
      lineItems: [{ ...coating, priceMinor: 25_500 }, level1],
      serviceSnapshot: snapshot,
    });
    assert.deepEqual(
      b.lines.map((l) => l.priceMinor),
      [25_500, 44_500],
    );
    assert.equal(b.adjustmentMinor, 0);
    assert.equal(b.legacyFolded, true);
    // "Adjusted from £845.00" is still derivable from the snapshot price.
    assert.equal(b.listPriceMinor, 84_500);
  });

  it("a single service at list has nothing to itemise", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 40_000,
      adjustmentMinor: 0,
      currency: "GBP",
      lineItems: [coating],
      serviceSnapshot: snapshot,
    });
    assert.equal(b.hasBreakdown, false);
    assert.equal(b.legacyFolded, false);
    assert.equal(b.listPriceMinor, 40_000);
  });

  it("a single discounted service still itemises: the line at list, then the discount", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 35_000,
      adjustmentMinor: -5_000,
      currency: "GBP",
      lineItems: [coating],
      serviceSnapshot: snapshot,
    });
    assert.equal(b.hasBreakdown, true);
    assert.equal(b.lines[0]?.priceMinor, 40_000);
  });

  it("falls back to the snapshot when lineItems are missing", () => {
    const b = bookingPriceBreakdown({
      priceMinor: 40_000,
      currency: "GBP",
      lineItems: null,
      serviceSnapshot: snapshot,
    });
    assert.equal(b.lines.length, 1);
    assert.equal(b.lines[0]?.name, "5 year coating");
    assert.equal(b.adjustmentMinor, 0);
  });
});

describe("adjustment row text", () => {
  it("labels and signs discounts and surcharges", () => {
    assert.equal(adjustmentLabel(-14_500), "Discount");
    assert.equal(adjustmentLabel(5_000), "Surcharge");
    assert.equal(formatAdjustment(-14_500, fmt), "−£145.00");
    assert.equal(formatAdjustment(5_000, fmt), "+£50.00");
  });
});

describe("linePriceMinor", () => {
  it("is undefined for an untouched row", () => {
    assert.equal(linePriceMinor(undefined), undefined);
  });

  it("parses a typed amount into minor units", () => {
    assert.equal(linePriceMinor("650"), 65_000);
    assert.equal(linePriceMinor("£1,200.50"), 120_050);
    assert.equal(linePriceMinor("0"), 0);
  });

  it("is null for anything that is not a non-negative amount", () => {
    assert.equal(linePriceMinor(""), null);
    assert.equal(linePriceMinor("abc"), null);
    assert.equal(linePriceMinor("-5"), null);
  });
});
