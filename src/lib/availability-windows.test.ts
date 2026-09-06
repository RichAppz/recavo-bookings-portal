import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptySlotsMessage,
  formatAvailabilityWindows,
  isoDayOfWeek,
  isoDayOfWeekFromIsoDate,
  isValidAvailabilityWindow,
  sessionOfferedOnDay,
} from "./availability-windows.ts";

const ptExample = [
  { dayOfWeek: 1, startMinute: 1020, endMinute: 1140 },
  { dayOfWeek: 4, startMinute: 720, endMinute: 780 },
];

describe("isoDayOfWeek", () => {
  it("uses ISO weekdays, not Date#getDay()", () => {
    // 2026-08-31 is a Monday; getDay() would be 1, ISO dayOfWeek is also 1.
    assert.equal(isoDayOfWeek(new Date(2026, 7, 31)), 1);
    // 2026-09-06 is a Sunday; getDay() is 0, ISO dayOfWeek must be 7.
    assert.equal(isoDayOfWeek(new Date(2026, 8, 6)), 7);
    assert.equal(isoDayOfWeekFromIsoDate("2026-09-01"), 2);
    assert.equal(isoDayOfWeekFromIsoDate("2026-09-03"), 4);
  });
});

describe("availability window validation", () => {
  it("accepts the PT example and rejects inverted / out-of-range windows", () => {
    for (const window of ptExample) {
      assert.equal(isValidAvailabilityWindow(window), true);
    }
    assert.equal(
      isValidAvailabilityWindow({ dayOfWeek: 1, startMinute: 600, endMinute: 600 }),
      false,
    );
    assert.equal(isValidAvailabilityWindow({ dayOfWeek: 9, startMinute: 0, endMinute: 60 }), false);
  });
});

describe("sessionOfferedOnDay", () => {
  it("treats empty windows as unrestricted", () => {
    assert.equal(sessionOfferedOnDay([], 2), true);
    assert.equal(sessionOfferedOnDay(undefined, 2), true);
  });

  it("restricts to listed weekdays when windows are set", () => {
    assert.equal(sessionOfferedOnDay(ptExample, 1), true);
    assert.equal(sessionOfferedOnDay(ptExample, 4), true);
    assert.equal(sessionOfferedOnDay(ptExample, 2), false);
  });
});

describe("emptySlotsMessage", () => {
  it("says the session isn't offered when the weekday is outside the windows", () => {
    assert.equal(
      emptySlotsMessage(ptExample, "2026-09-01"),
      "This session isn't offered on that day.",
    );
    assert.equal(
      emptySlotsMessage(ptExample, "2026-08-31"),
      "No availability on this date. Try another day.",
    );
    assert.equal(
      emptySlotsMessage([], "2026-09-01"),
      "No availability on this date. Try another day.",
    );
  });
});

describe("formatAvailabilityWindows", () => {
  it("summarises windows and the unrestricted empty state", () => {
    assert.equal(formatAvailabilityWindows(ptExample), "Mon 17:00–19:00, Thu 12:00–13:00");
    assert.equal(formatAvailabilityWindows([]), "Whenever staff are available");
  });
});
