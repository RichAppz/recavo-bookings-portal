import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAllDaySpan, formatBookingWhen, formatDurationLong } from "./format.ts";
import { outsideWorkingHours } from "./working-hours.ts";

const TZ = "Europe/London";

describe("all-day and custom-window formatting (RECA-532)", () => {
  it("reads a one-day all-day job as its date", () => {
    assert.equal(
      formatAllDaySpan("2026-09-06T23:00:00Z", "2026-09-07T23:00:00Z", TZ),
      "Mon 7 Sept 2026",
    );
  });

  it("collapses the month inside a span and spells both across a boundary", () => {
    assert.equal(
      formatAllDaySpan("2026-09-06T23:00:00Z", "2026-09-08T23:00:00Z", TZ),
      "Mon 7 – Tue 8 Sept 2026",
    );
    assert.equal(
      formatAllDaySpan("2026-09-29T23:00:00Z", "2026-10-01T23:00:00Z", TZ),
      "Wed 30 Sept – Thu 1 Oct 2026",
    );
  });

  it("labels all-day bookings and leaves timed ones as a time span", () => {
    assert.equal(
      formatBookingWhen(
        { start: "2026-09-06T23:00:00Z", end: "2026-09-07T23:00:00Z", allDay: true },
        TZ,
      ),
      "Mon 7 Sept 2026 · All day",
    );
    assert.match(
      formatBookingWhen({ start: "2026-09-07T08:00:00Z", end: "2026-09-07T09:30:00Z" }, TZ),
      /09:00 – 10:30$/,
    );
  });

  it("spells durations the way people say them", () => {
    assert.equal(formatDurationLong(45), "45 min");
    assert.equal(formatDurationLong(90), "1 hr 30 min");
    assert.equal(formatDurationLong(2 * 1440 + 180), "2 days 3 hrs");
  });
});

describe("working-hours warning", () => {
  const sam = {
    displayName: "Sam",
    workingRules: [
      { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60, locationId: null },
      { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 17 * 60, locationId: "loc_1" },
    ],
  };

  it("is quiet inside the rules, including a job ending exactly at close", () => {
    // Monday 7 Sept 2026, 10:00–17:00 BST.
    assert.equal(
      outsideWorkingHours(
        sam,
        { start: "2026-09-07T09:00:00Z", end: "2026-09-07T16:00:00Z" },
        null,
        TZ,
      ),
      null,
    );
  });

  it("names the usual hours when the window spills past them", () => {
    assert.equal(
      outsideWorkingHours(
        sam,
        { start: "2026-09-07T09:00:00Z", end: "2026-09-07T18:00:00Z" },
        null,
        TZ,
      ),
      "Outside Sam's usual hours (09:00–17:00). You can still book it.",
    );
  });

  it("says so when the person does not work that day", () => {
    // Wednesday.
    assert.equal(
      outsideWorkingHours(
        sam,
        { start: "2026-09-09T09:00:00Z", end: "2026-09-09T10:00:00Z" },
        null,
        TZ,
      ),
      "Sam doesn't usually work that day. You can still book it.",
    );
  });

  it("only considers rules for the booking's location, and stays quiet with no rules", () => {
    // Tuesday rule is for loc_1 only.
    assert.equal(
      outsideWorkingHours(
        sam,
        { start: "2026-09-08T09:00:00Z", end: "2026-09-08T10:00:00Z" },
        "loc_2",
        TZ,
      ),
      "Sam doesn't usually work that day. You can still book it.",
    );
    assert.equal(
      outsideWorkingHours(
        { displayName: "Jo", workingRules: [] },
        { start: "2026-09-08T09:00:00Z", end: "2026-09-08T10:00:00Z" },
        null,
        TZ,
      ),
      null,
    );
  });
});
