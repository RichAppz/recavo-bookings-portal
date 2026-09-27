import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration } from "./format.ts";

describe("formatDuration — service lengths on the public booking page", () => {
  it("keeps short jobs in minutes", () => {
    assert.equal(formatDuration(15), "15 min");
    assert.equal(formatDuration(45), "45 min");
  });

  it("reads whole hours as hours", () => {
    assert.equal(formatDuration(60), "1 hour");
    assert.equal(formatDuration(240), "4 hours");
    assert.equal(formatDuration(300), "5 hours");
  });

  it("mixes hours and minutes the way people say them", () => {
    assert.equal(formatDuration(90), "1 hr 30 min");
    assert.equal(formatDuration(150), "2 hrs 30 min");
  });

  it("turns multi-day detailing jobs into days", () => {
    assert.equal(formatDuration(1440), "1 day");
    assert.equal(formatDuration(2880), "2 days");
    assert.equal(formatDuration(1440 + 240), "1 day 4 hours");
    assert.equal(formatDuration(1440 + 60), "1 day 1 hour");
    assert.equal(formatDuration(2 * 1440 + 90), "2 days 1 hr 30 min");
  });

  it("never renders nonsense for empty or bad input", () => {
    assert.equal(formatDuration(0), "0 min");
    assert.equal(formatDuration(-30), "0 min");
    assert.equal(formatDuration(Number.NaN), "0 min");
  });
});
