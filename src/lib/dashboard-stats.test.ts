import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { averageJobValueMinor, fourthStatFor, usesOccupancy } from "./dashboard-stats.ts";

describe("fourth key number by trade", () => {
  it("keeps occupancy for class-based trades and drops it for automotive", () => {
    assert.equal(usesOccupancy("personal_training"), true);
    assert.equal(usesOccupancy("general_appointments"), true);
    assert.equal(usesOccupancy(null), true);
    assert.equal(usesOccupancy(undefined), true);
    assert.equal(usesOccupancy("car_detailing"), false);
  });

  it("averages booked value per job and rounds to the penny", () => {
    assert.equal(averageJobValueMinor({ count: 3, valueMinor: 10_000 }), 3333);
    assert.equal(averageJobValueMinor({ count: 2, valueMinor: 58_001 }), 29_001);
    assert.equal(averageJobValueMinor({ count: 0, valueMinor: 0 }), null);
  });

  it("describes the card for each trade", () => {
    assert.deepEqual(fourthStatFor("personal_training", { count: 4, valueMinor: 8_000 }), {
      kind: "occupancy",
    });
    assert.deepEqual(fourthStatFor("car_detailing", { count: 4, valueMinor: 58_000 }), {
      kind: "average_job_value",
      averageMinor: 14_500,
      count: 4,
    });
    assert.deepEqual(fourthStatFor("car_detailing", { count: 0, valueMinor: 0 }), {
      kind: "average_job_value",
      averageMinor: null,
      count: 0,
    });
  });
});
