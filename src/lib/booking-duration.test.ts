import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allDayBlockDays,
  bookingJobMinutes,
  bookingWindowMinutes,
  describeAllDayBlock,
  formatAllDayDuration,
  lineItemJobMinutes,
} from "./booking-duration.ts";

// What the API returns for a 2-hour "5 year coating" booked with the All day tile:
// start/end are local midnights and the primary line item carries the whole-day
// window, while the snapshot still holds the catalogue length.
const allDayCoating = {
  start: "2026-10-13T23:00:00.000Z",
  end: "2026-10-14T23:00:00.000Z",
  allDay: true,
  serviceSnapshot: { durationMinutes: 120 },
  lineItems: [{ position: 0, durationMinutes: 1440 }],
};

describe("bookingJobMinutes — a 2-hour service booked all day is still 2 hours", () => {
  it("reads the catalogue length for an all-day job, not the day it blocks", () => {
    assert.equal(bookingWindowMinutes(allDayCoating), 1440);
    assert.equal(bookingJobMinutes(allDayCoating), 120);
  });

  it("adds the additional services, which the API never overrides", () => {
    assert.equal(
      bookingJobMinutes({
        ...allDayCoating,
        lineItems: [
          { position: 0, durationMinutes: 1440 - 45 },
          { position: 1, durationMinutes: 45 },
        ],
      }),
      165,
    );
  });

  it("keeps the window for a timed booking, including a hand-set length", () => {
    const timed = {
      start: "2026-09-23T13:00:00.000Z",
      end: "2026-09-23T15:30:00.000Z",
      allDay: false,
      serviceSnapshot: { durationMinutes: 120 },
      lineItems: [{ position: 0, durationMinutes: 150 }],
    };
    assert.equal(bookingJobMinutes(timed), 150);
    assert.equal(bookingJobMinutes({ ...timed, allDay: undefined }), 150);
  });

  it("counts only the days a working-day job actually holds, not the weekend it skips", () => {
    // Thu, Fri, Mon (all day) for a Mon–Fri detailer: start → end is five days.
    const weekend = {
      start: "2026-09-23T23:00:00.000Z",
      end: "2026-09-28T23:00:00.000Z",
      allDay: true,
      segments: [
        { start: "2026-09-23T23:00:00.000Z", end: "2026-09-24T23:00:00.000Z" },
        { start: "2026-09-24T23:00:00.000Z", end: "2026-09-25T23:00:00.000Z" },
        { start: "2026-09-27T23:00:00.000Z", end: "2026-09-28T23:00:00.000Z" },
      ],
      serviceSnapshot: { durationMinutes: 3 * 1440 },
      lineItems: [{ position: 0, durationMinutes: 3 * 1440 }],
    };
    assert.equal(bookingWindowMinutes(weekend), 3 * 1440);
    assert.equal(allDayBlockDays(bookingWindowMinutes(weekend)), 3);
    assert.equal(bookingJobMinutes(weekend), 3 * 1440);

    // The timed version: the line items carry the 3-day length, start → end does not.
    const timed = {
      start: "2026-09-24T08:00:00.000Z",
      end: "2026-09-28T16:00:00.000Z",
      allDay: false,
      segments: [
        { start: "2026-09-24T08:00:00.000Z", end: "2026-09-24T16:00:00.000Z" },
        { start: "2026-09-25T07:00:00.000Z", end: "2026-09-25T16:00:00.000Z" },
        { start: "2026-09-28T07:00:00.000Z", end: "2026-09-28T16:00:00.000Z" },
      ],
      serviceSnapshot: { durationMinutes: 3 * 1440 },
      lineItems: [{ position: 0, durationMinutes: 3 * 1440 }],
    };
    assert.equal(bookingJobMinutes(timed), 3 * 1440);
    // An older booking with a single stored span still reads start → end.
    assert.equal(bookingWindowMinutes({ ...timed, segments: undefined }), 4 * 1440 + 8 * 60);
    assert.equal(
      bookingJobMinutes({ ...timed, segments: undefined, lineItems: [] }),
      4 * 1440 + 8 * 60,
    );
  });

  it("copes with a booking that has no line items yet", () => {
    assert.equal(bookingJobMinutes({ ...allDayCoating, lineItems: null }), 120);
    assert.equal(bookingJobMinutes({ ...allDayCoating, lineItems: undefined }), 120);
  });
});

describe("lineItemJobMinutes — the services list under an all-day job", () => {
  it("swaps the overridden primary for the snapshot and leaves the rest alone", () => {
    const booking = { allDay: true, serviceSnapshot: { durationMinutes: 120 } };
    assert.equal(lineItemJobMinutes(booking, { position: 0, durationMinutes: 1395 }), 120);
    assert.equal(lineItemJobMinutes(booking, { position: 1, durationMinutes: 45 }), 45);
  });

  it("trusts the line items of a timed booking", () => {
    const booking = { allDay: false, serviceSnapshot: { durationMinutes: 120 } };
    assert.equal(lineItemJobMinutes(booking, { position: 0, durationMinutes: 150 }), 150);
  });
});

describe("formatAllDayDuration — 'All day · 2 hrs', never '1 day'", () => {
  it("names the block and the service length separately", () => {
    assert.equal(formatAllDayDuration(120, 1440), "All day · 2 hrs");
    assert.equal(formatAllDayDuration(90, 1440), "All day · 1 hr 30 min");
  });

  it("counts the days of a multi-day block", () => {
    assert.equal(formatAllDayDuration(120, 2880), "All day, 2 days · 2 hrs");
    assert.equal(formatAllDayDuration(2880, 2880), "All day, 2 days · 2 days");
  });

  it("rounds a DST-shortened or -lengthened day back to whole days", () => {
    assert.equal(allDayBlockDays(1380), 1);
    assert.equal(allDayBlockDays(1500), 1);
    assert.equal(allDayBlockDays(2820), 2);
    assert.equal(allDayBlockDays(0), 1);
  });
});

describe("describeAllDayBlock — the hint under the duration", () => {
  it("explains the day against the service length", () => {
    assert.equal(
      describeAllDayBlock(120, 1440),
      "Blocks the whole day; the service itself takes 2 hrs.",
    );
    assert.equal(
      describeAllDayBlock(120, 2880),
      "Blocks 2 whole days; the service itself takes 2 hrs.",
    );
  });
});
