import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eventDatesFromInterval,
  eventInterval,
  eventSpanDays,
  formatEventDateRange,
  isMultiDay,
  MAX_EVENT_DAYS,
  rangeFromTaps,
} from "./event-dates.ts";

/** Local midnight as the browser would store it, whatever zone the tests run in. */
const localMidnight = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const local = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

const TODAY = new Date(2026, 8, 13);

describe("eventInterval — the range picker's dates become the API's [start, end)", () => {
  it("saves a Mon–Fri holiday as midnight Monday to midnight the following Saturday", () => {
    const range = eventInterval({
      startDate: "2026-09-21",
      endDate: "2026-09-25",
      allDay: false,
      from: "09:00",
      to: "10:00",
    });
    assert.deepEqual(range, {
      start: localMidnight("2026-09-21"),
      end: localMidnight("2026-09-26"),
    });
  });

  it("keeps a one-day all-day event as midnight to next midnight, as before", () => {
    const range = eventInterval({
      startDate: "2026-09-21",
      endDate: "2026-09-21",
      allDay: true,
      from: "09:00",
      to: "10:00",
    });
    assert.deepEqual(range, {
      start: localMidnight("2026-09-21"),
      end: localMidnight("2026-09-22"),
    });
  });

  it("keeps a one-day timed event on its From/To times", () => {
    const range = eventInterval({
      startDate: "2026-09-21",
      endDate: "2026-09-21",
      allDay: false,
      from: "09:00",
      to: "10:30",
    });
    assert.deepEqual(range, {
      start: local("2026-09-21", "09:00"),
      end: local("2026-09-21", "10:30"),
    });
  });

  it("rejects a timed event whose end is not after its start", () => {
    const dates = { startDate: "2026-09-21", endDate: "2026-09-21", allDay: false };
    assert.equal(eventInterval({ ...dates, from: "10:00", to: "10:00" }), null);
    assert.equal(eventInterval({ ...dates, from: "10:00", to: "09:00" }), null);
    assert.equal(eventInterval({ ...dates, from: "", to: "09:00" }), null);
  });

  it("rejects a range that runs backwards, is unparsable, or is longer than the API allows", () => {
    const base = { allDay: true, from: "00:00", to: "23:59" };
    assert.equal(eventInterval({ ...base, startDate: "2026-09-25", endDate: "2026-09-21" }), null);
    assert.equal(eventInterval({ ...base, startDate: "", endDate: "2026-09-21" }), null);
    assert.equal(eventInterval({ ...base, startDate: "2026-09-01", endDate: "2026-10-02" }), null);
    // A whole month of days is exactly the limit.
    assert.notEqual(
      eventInterval({ ...base, startDate: "2026-09-01", endDate: "2026-10-01" }),
      null,
    );
    assert.notEqual(
      eventInterval({ ...base, startDate: "2026-01-01", endDate: "2026-01-31" }),
      null,
    );
  });

  it("spans a DST change without gaining or losing a day", () => {
    // Clocks go back on Sun 25 Oct 2026 in the UK.
    assert.equal(eventSpanDays("2026-10-23", "2026-10-27"), 5);
    const range = eventInterval({
      startDate: "2026-10-23",
      endDate: "2026-10-27",
      allDay: true,
      from: "",
      to: "",
    });
    assert.deepEqual(range, {
      start: localMidnight("2026-10-23"),
      end: localMidnight("2026-10-28"),
    });
  });
});

describe("eventDatesFromInterval — reading a saved event back into the form", () => {
  it("reads several whole days as an all-day range ending on the last covered day", () => {
    const dates = eventDatesFromInterval(localMidnight("2026-09-21"), localMidnight("2026-09-26"));
    assert.equal(dates.startDate, "2026-09-21");
    assert.equal(dates.endDate, "2026-09-25");
    assert.equal(dates.allDay, true);
  });

  it("reads one whole day as a single all-day date", () => {
    const dates = eventDatesFromInterval(localMidnight("2026-09-21"), localMidnight("2026-09-22"));
    assert.deepEqual(
      [dates.startDate, dates.endDate, dates.allDay],
      ["2026-09-21", "2026-09-21", true],
    );
  });

  it("reads a timed event as one day with its times", () => {
    const dates = eventDatesFromInterval(
      local("2026-09-21", "09:00"),
      local("2026-09-21", "10:30"),
    );
    assert.deepEqual(dates, {
      startDate: "2026-09-21",
      endDate: "2026-09-21",
      allDay: false,
      from: "09:00",
      to: "10:30",
    });
  });

  it("round-trips through eventInterval unchanged", () => {
    for (const [start, end] of [
      [localMidnight("2026-09-21"), localMidnight("2026-09-26")],
      [localMidnight("2026-01-12"), localMidnight("2026-01-13")],
      [local("2026-09-21", "14:00"), local("2026-09-21", "15:00")],
    ]) {
      assert.deepEqual(eventInterval(eventDatesFromInterval(start, end)), { start, end });
    }
  });
});

describe("range taps and labels", () => {
  it("counts days inclusively and calls more than one 'multi-day'", () => {
    assert.equal(eventSpanDays("2026-09-21", "2026-09-21"), 1);
    assert.equal(eventSpanDays("2026-09-21", "2026-09-25"), 5);
    assert.equal(eventSpanDays("2026-09-01", "2026-10-01"), MAX_EVENT_DAYS);
    assert.equal(eventSpanDays("2026-09-25", "2026-09-21"), -3);
    assert.equal(isMultiDay("2026-09-21", "2026-09-21"), false);
    assert.equal(isMultiDay("2026-09-21", "2026-09-22"), true);
  });

  it("makes a range from two taps in either order; the same day twice is one day", () => {
    assert.deepEqual(rangeFromTaps("2026-09-21", "2026-09-25"), {
      startDate: "2026-09-21",
      endDate: "2026-09-25",
    });
    assert.deepEqual(rangeFromTaps("2026-09-25", "2026-09-21"), {
      startDate: "2026-09-21",
      endDate: "2026-09-25",
    });
    assert.deepEqual(rangeFromTaps("2026-09-21", "2026-09-21"), {
      startDate: "2026-09-21",
      endDate: "2026-09-21",
    });
  });

  it("labels one day, a range in a month, and a range over a month boundary", () => {
    assert.equal(formatEventDateRange("2026-09-21", "2026-09-21", TODAY), "Mon 21 Sept");
    assert.equal(formatEventDateRange("2026-09-21", "2026-09-25", TODAY), "Mon 21 – Fri 25 Sept");
    assert.equal(
      formatEventDateRange("2026-09-28", "2026-10-02", TODAY),
      "Mon 28 Sept – Fri 2 Oct",
    );
  });

  it("adds the year only when the range is outside the current year", () => {
    assert.equal(formatEventDateRange("2027-01-04", "2027-01-08", TODAY), "Mon 4 – Fri 8 Jan 2027");
    assert.equal(formatEventDateRange("2027-01-04", "2027-01-04", TODAY), "Mon 4 Jan 2027");
    assert.equal(
      formatEventDateRange("2026-12-28", "2027-01-01", TODAY),
      "Mon 28 Dec – Fri 1 Jan 2027",
    );
  });
});
