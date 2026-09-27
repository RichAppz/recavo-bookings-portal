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

/**
 * Everything below is a London business. The instants are spelled out in UTC so the
 * tests mean the same thing whatever zone the machine running them is in — that
 * independence from the device zone is the whole point of the module.
 */
const TZ = "Europe/London";
/** London midnight on a BST date (UTC+1) or a GMT date (UTC+0). */
const londonMidnight = (date: string) => {
  const [, m] = date.split("-").map(Number);
  const bst = m! >= 4 && m! <= 10; // good enough for the dates used here
  return `${bst ? addDay(date, -1) : date}T${bst ? "23" : "00"}:00:00.000Z`;
};
const london = (date: string, time: string) => {
  const [h, mm] = time.split(":").map(Number);
  const [, m] = date.split("-").map(Number);
  const bst = m! >= 4 && m! <= 10;
  return new Date(Date.UTC(...ymd(date), h! - (bst ? 1 : 0), mm!)).toISOString();
};
const ymd = (date: string): [number, number, number] => {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m! - 1, d!];
};
const addDay = (date: string, n: number) =>
  new Date(Date.UTC(...ymd(date)) + n * 86_400_000).toISOString().slice(0, 10);

const TODAY = new Date(2026, 8, 13);

describe("eventInterval — the range picker's dates become the API's [start, end)", () => {
  it("saves a Mon–Fri holiday as midnight Monday to midnight the following Saturday", () => {
    const range = eventInterval(
      {
        startDate: "2026-09-21",
        endDate: "2026-09-25",
        allDay: false,
        from: "09:00",
        to: "10:00",
      },
      TZ,
    );
    assert.deepEqual(range, {
      start: londonMidnight("2026-09-21"),
      end: londonMidnight("2026-09-26"),
    });
  });

  it("keeps a one-day all-day event as midnight to next midnight, as before", () => {
    const range = eventInterval(
      {
        startDate: "2026-09-21",
        endDate: "2026-09-21",
        allDay: true,
        from: "09:00",
        to: "10:00",
      },
      TZ,
    );
    assert.deepEqual(range, {
      start: londonMidnight("2026-09-21"),
      end: londonMidnight("2026-09-22"),
    });
  });

  it("keeps a one-day timed event on its From/To times", () => {
    const range = eventInterval(
      {
        startDate: "2026-09-21",
        endDate: "2026-09-21",
        allDay: false,
        from: "09:00",
        to: "10:30",
      },
      TZ,
    );
    assert.deepEqual(range, {
      start: london("2026-09-21", "09:00"),
      end: london("2026-09-21", "10:30"),
    });
  });

  it("rejects a timed event whose end is not after its start", () => {
    const dates = { startDate: "2026-09-21", endDate: "2026-09-21", allDay: false };
    assert.equal(eventInterval({ ...dates, from: "10:00", to: "10:00" }, TZ), null);
    assert.equal(eventInterval({ ...dates, from: "10:00", to: "09:00" }, TZ), null);
    assert.equal(eventInterval({ ...dates, from: "", to: "09:00" }, TZ), null);
  });

  it("rejects a range that runs backwards, is unparsable, or is longer than the API allows", () => {
    const base = { allDay: true, from: "00:00", to: "23:59" };
    assert.equal(
      eventInterval({ ...base, startDate: "2026-09-25", endDate: "2026-09-21" }, TZ),
      null,
    );
    assert.equal(eventInterval({ ...base, startDate: "", endDate: "2026-09-21" }, TZ), null);
    assert.equal(
      eventInterval({ ...base, startDate: "2026-09-01", endDate: "2026-10-02" }, TZ),
      null,
    );
    // A whole month of days is exactly the limit.
    assert.notEqual(
      eventInterval({ ...base, startDate: "2026-09-01", endDate: "2026-10-01" }, TZ),
      null,
    );
    assert.notEqual(
      eventInterval({ ...base, startDate: "2026-01-01", endDate: "2026-01-31" }, TZ),
      null,
    );
  });

  it("spans a DST change without gaining or losing a day", () => {
    // Clocks go back on Sun 25 Oct 2026 in the UK.
    assert.equal(eventSpanDays("2026-10-23", "2026-10-27"), 5);
    const range = eventInterval(
      {
        startDate: "2026-10-23",
        endDate: "2026-10-27",
        allDay: true,
        from: "",
        to: "",
      },
      TZ,
    );
    assert.deepEqual(range, {
      start: "2026-10-22T23:00:00.000Z", // BST
      end: "2026-10-28T00:00:00.000Z", // GMT: clocks went back on the 25th
    });
  });
});

describe("eventInterval — the phone's zone is irrelevant", () => {
  it("saves a London holiday as London midnight even when the form runs in another zone", () => {
    // Regression: an owner on holiday in Spain (UTC+2) created Mon 21 – Thu 24 Sep.
    // The old browser-zone code stored 2026-09-20T22:00Z, which London draws as a
    // 23:00 Sunday start. The business zone is the only one that matters.
    const dates = {
      startDate: "2026-09-21",
      endDate: "2026-09-24",
      allDay: true,
      from: "",
      to: "",
    };
    assert.deepEqual(eventInterval(dates, "Europe/London"), {
      start: "2026-09-20T23:00:00.000Z",
      end: "2026-09-24T23:00:00.000Z",
    });
    // And a Madrid business gets Madrid midnight.
    assert.deepEqual(eventInterval(dates, "Europe/Madrid"), {
      start: "2026-09-20T22:00:00.000Z",
      end: "2026-09-24T22:00:00.000Z",
    });
  });

  it("reads the saved London instants back as the same London dates", () => {
    const dates = eventDatesFromInterval(
      "2026-09-20T23:00:00.000Z",
      "2026-09-24T23:00:00.000Z",
      "Europe/London",
    );
    assert.deepEqual(
      [dates.startDate, dates.endDate, dates.allDay],
      ["2026-09-21", "2026-09-24", true],
    );
  });
});

describe("eventDatesFromInterval — reading a saved event back into the form", () => {
  it("reads several whole days as an all-day range ending on the last covered day", () => {
    const dates = eventDatesFromInterval(
      londonMidnight("2026-09-21"),
      londonMidnight("2026-09-26"),
      TZ,
    );
    assert.equal(dates.startDate, "2026-09-21");
    assert.equal(dates.endDate, "2026-09-25");
    assert.equal(dates.allDay, true);
  });

  it("reads one whole day as a single all-day date", () => {
    const dates = eventDatesFromInterval(
      londonMidnight("2026-09-21"),
      londonMidnight("2026-09-22"),
      TZ,
    );
    assert.deepEqual(
      [dates.startDate, dates.endDate, dates.allDay],
      ["2026-09-21", "2026-09-21", true],
    );
  });

  it("reads a timed event as one day with its times", () => {
    const dates = eventDatesFromInterval(
      london("2026-09-21", "09:00"),
      london("2026-09-21", "10:30"),
      TZ,
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
      [londonMidnight("2026-09-21"), londonMidnight("2026-09-26")],
      [londonMidnight("2026-01-12"), londonMidnight("2026-01-13")],
      [london("2026-09-21", "14:00"), london("2026-09-21", "15:00")],
    ]) {
      assert.deepEqual(eventInterval(eventDatesFromInterval(start, end, TZ), TZ), { start, end });
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
