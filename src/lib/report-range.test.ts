import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentMonthRange,
  lastDaysRange,
  monthStartIn,
  previousReportRange,
  rangeDays,
  reportRange,
  todayIn,
} from "./report-range.ts";

const LONDON = "Europe/London";
const AUCKLAND = "Pacific/Auckland";

describe("the default range the Reports page opens on", () => {
  it("starts on the first of the month even in British Summer Time", () => {
    // The bug: `new Date(2026, 8, 1).toISOString().slice(0, 10)` is "2026-08-31" in BST,
    // because local midnight on the 1st is 23:00 UTC on the 31st. The page opened a day
    // early and every figure on it included that day.
    const midSeptember = new Date("2026-09-15T12:00:00Z");
    assert.equal(monthStartIn(LONDON, midSeptember), "2026-09-01");
    assert.equal(todayIn(LONDON, midSeptember), "2026-09-15");
  });

  it("is the business's calendar day, not the UTC one, either side of midnight", () => {
    // 00:30 in London on 1 September is still 31 August in UTC.
    assert.equal(todayIn(LONDON, new Date("2026-08-31T23:30:00Z")), "2026-09-01");
    assert.equal(monthStartIn(LONDON, new Date("2026-08-31T23:30:00Z")), "2026-09-01");

    // And a zone the other side of UTC: 23:00 on 31 August in London is already 1 September
    // in Auckland.
    assert.equal(todayIn(AUCKLAND, new Date("2026-08-31T22:00:00Z")), "2026-09-01");
  });

  it("agrees with UTC in winter, when London has no offset", () => {
    const midJanuary = new Date("2026-01-15T12:00:00Z");
    assert.equal(monthStartIn(LONDON, midJanuary), "2026-01-01");
    assert.equal(todayIn(LONDON, midJanuary), "2026-01-15");
  });
});

describe("the window sent to the API", () => {
  it("covers whole local days as a half-open range", () => {
    const range = reportRange("2026-09-01", "2026-09-30", LONDON);
    // Local midnight on 1 September in BST is 23:00 UTC on 31 August.
    assert.equal(range.from, "2026-08-31T23:00:00.000Z");
    // Opens the day after the last, so 23:59:59.999 on the 30th is inside the window. The
    // old bound was 23:59:59 local, which dropped the final second of the range.
    assert.equal(range.to, "2026-09-30T23:00:00.000Z");
  });

  it("covers a single day as that day, not as nothing", () => {
    const range = reportRange("2026-09-15", "2026-09-15", LONDON);
    assert.equal(range.from, "2026-09-14T23:00:00.000Z");
    assert.equal(range.to, "2026-09-15T23:00:00.000Z");
    assert.equal(new Date(range.to).getTime() - new Date(range.from).getTime(), 86_400_000);
  });

  it("is 24 hours a day in winter and still whole days across the spring change", () => {
    const january = reportRange("2026-01-05", "2026-01-05", LONDON);
    assert.equal(january.from, "2026-01-05T00:00:00.000Z");
    assert.equal(january.to, "2026-01-06T00:00:00.000Z");

    // The clocks go forward on 29 March 2026, so this month is one hour short of 31 days —
    // which is correct, and is what a fixed-millisecond range gets wrong.
    const march = reportRange("2026-03-01", "2026-03-31", LONDON);
    const hours = (new Date(march.to).getTime() - new Date(march.from).getTime()) / 3_600_000;
    assert.equal(hours, 31 * 24 - 1);
  });
});

describe("the buckets behind the dashboard's range picker", () => {
  it("covers the whole current month, including days still to come", () => {
    // Mid-September, so the second half of the month has not happened yet and must still be
    // in range — a "this month" card counts bookings that are coming up.
    const range = currentMonthRange(LONDON, new Date("2026-09-15T12:00:00Z"));
    assert.equal(range.from, "2026-08-31T23:00:00.000Z");
    assert.equal(range.to, "2026-09-30T23:00:00.000Z");
  });

  it("rolls into the next year in December", () => {
    const range = currentMonthRange(LONDON, new Date("2026-12-10T12:00:00Z"));
    assert.equal(range.from, "2026-12-01T00:00:00.000Z");
    assert.equal(range.to, "2027-01-01T00:00:00.000Z");
  });

  it("handles February in a leap year", () => {
    const range = currentMonthRange(LONDON, new Date("2028-02-10T12:00:00Z"));
    assert.equal(range.from, "2028-02-01T00:00:00.000Z");
    assert.equal(range.to, "2028-03-01T00:00:00.000Z");
  });

  it("counts the last N days inclusive of today", () => {
    const seven = lastDaysRange(7, LONDON, new Date("2026-09-15T12:00:00Z"));
    // 9 to 15 September inclusive is seven days.
    assert.equal(seven.from, "2026-09-08T23:00:00.000Z");
    assert.equal(seven.to, "2026-09-15T23:00:00.000Z");
    assert.equal((new Date(seven.to).getTime() - new Date(seven.from).getTime()) / 86_400_000, 7);
  });

  it("spans a month boundary and a DST change without losing a day", () => {
    // 30 days back from 5 April 2026 crosses the 29 March change, so the span is one hour
    // short of 30 days rather than a day out.
    const thirty = lastDaysRange(30, LONDON, new Date("2026-04-05T12:00:00Z"));
    assert.equal(thirty.from, "2026-03-07T00:00:00.000Z");
    assert.equal(thirty.to, "2026-04-05T23:00:00.000Z");
    const hours = (new Date(thirty.to).getTime() - new Date(thirty.from).getTime()) / 3_600_000;
    assert.equal(hours, 30 * 24 - 1);
  });
});

describe("the previous period the page compares against", () => {
  it("is the same number of days ending the day before", () => {
    assert.equal(rangeDays("2026-09-01", "2026-09-30"), 30);
    const previous = previousReportRange("2026-09-01", "2026-09-30", LONDON);
    // 30 days ending 31 August, i.e. 2 August to 31 August inclusive.
    assert.equal(previous.from, "2026-08-01T23:00:00.000Z");
    assert.equal(previous.to, "2026-08-31T23:00:00.000Z");
  });

  it("counts calendar days across a DST change rather than milliseconds", () => {
    // 29 March 2026 loses an hour. A millisecond-width previous period would start an hour
    // out and clip a day; counting days cannot.
    const previous = previousReportRange("2026-04-01", "2026-04-30", LONDON);
    // 2 March opens in GMT; 1 April opens in BST, an hour earlier in UTC terms.
    assert.equal(previous.from, "2026-03-02T00:00:00.000Z");
    assert.equal(previous.to, "2026-03-31T23:00:00.000Z");
    assert.equal(rangeDays("2026-03-02", "2026-03-31"), 30);
  });

  it("does not overlap the current period by a day", () => {
    const current = reportRange("2026-09-10", "2026-09-20", LONDON);
    const previous = previousReportRange("2026-09-10", "2026-09-20", LONDON);
    // Half-open ranges abut exactly: the previous period ends where this one begins.
    assert.equal(previous.to, current.from);
  });

  it("treats a single day as a one-day comparison, not an empty one", () => {
    assert.equal(rangeDays("2026-09-15", "2026-09-15"), 1);
    const previous = previousReportRange("2026-09-15", "2026-09-15", LONDON);
    assert.equal(previous.from, "2026-09-13T23:00:00.000Z");
    assert.equal(previous.to, "2026-09-14T23:00:00.000Z");
  });

  it("survives a range the pickers have momentarily inverted", () => {
    // A user editing the "from" field can transiently make it later than "to". The helper
    // must not return a negative-length comparison period.
    assert.equal(rangeDays("2026-09-20", "2026-09-10"), 1);
    const previous = previousReportRange("2026-09-20", "2026-09-10", LONDON);
    assert.ok(new Date(previous.to).getTime() > new Date(previous.from).getTime());
  });
});
