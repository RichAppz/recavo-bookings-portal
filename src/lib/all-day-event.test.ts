import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllDayEvent } from "./format.ts";

const TZ = "Europe/London";

describe("isAllDayEvent — an event saved as midnight to midnight holds the whole day", () => {
  it("recognises one whole day in the business's timezone (BST)", () => {
    // 11 Sept 2026 00:00 BST is 10 Sept 23:00 UTC.
    assert.equal(isAllDayEvent("2026-09-10T23:00:00.000Z", "2026-09-11T23:00:00.000Z", TZ), true);
  });

  it("recognises one whole day in winter (GMT)", () => {
    assert.equal(isAllDayEvent("2026-01-12T00:00:00.000Z", "2026-01-13T00:00:00.000Z", TZ), true);
  });

  it("recognises several whole days as one all-day event", () => {
    assert.equal(isAllDayEvent("2026-09-10T23:00:00.000Z", "2026-09-13T23:00:00.000Z", TZ), true);
  });

  it("does not treat a timed event as all-day", () => {
    assert.equal(isAllDayEvent("2026-09-11T08:00:00.000Z", "2026-09-11T09:00:00.000Z", TZ), false);
  });

  it("does not treat UTC midnight as all-day when it is 01:00 locally", () => {
    assert.equal(isAllDayEvent("2026-09-11T00:00:00.000Z", "2026-09-12T00:00:00.000Z", TZ), false);
  });

  it("needs the end to come after the start", () => {
    assert.equal(isAllDayEvent("2026-09-10T23:00:00.000Z", "2026-09-10T23:00:00.000Z", TZ), false);
  });
});
