import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contiguousRuns,
  formatWorkingSpan,
  isMultiDay,
  layoutExplicitWindow,
  layoutWorkingDuration,
  occupiedDaysOf,
  scheduleFor,
  segmentOn,
  segmentsOf,
  wallToUtc,
} from "./working-days.ts";

const TZ = "Europe/London";
const DAY = 24 * 60;

const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 8 * 60,
  endMinute: 17 * 60,
  locationId: null,
}));
const sam = { workingRules: weekdays, timeOff: [] };
const unit = { id: "loc_1", openingHours: [] };

describe("scheduleFor", () => {
  it("is null with nothing to go on", () => {
    assert.equal(scheduleFor({ workingRules: [] }, unit, TZ), null);
    assert.equal(scheduleFor(null, null, TZ), null);
  });

  it("narrows staff rules to the location's opening hours and skips other sites", () => {
    const schedule = scheduleFor(
      {
        workingRules: [
          { dayOfWeek: 4, startMinute: 7 * 60, endMinute: 20 * 60, locationId: null },
          { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60, locationId: "loc_other" },
        ],
      },
      { id: "loc_1", openingHours: [{ dayOfWeek: 4, openMinute: 8 * 60, closeMinute: 18 * 60 }] },
      TZ,
    )!;
    assert.deepEqual(schedule.hoursOn("2026-09-24"), { open: 8 * 60, close: 18 * 60 });
    assert.equal(schedule.hoursOn("2026-09-26"), null);
  });

  it("treats a day fully covered by time-off as not worked", () => {
    const schedule = scheduleFor(
      {
        workingRules: weekdays,
        timeOff: [{ start: "2026-09-24T23:00:00Z", end: "2026-09-25T23:00:00Z" }],
      },
      unit,
      TZ,
    )!;
    assert.equal(schedule.hoursOn("2026-09-25"), null);
    assert.deepEqual(schedule.hoursOn("2026-09-24"), { open: 8 * 60, close: 17 * 60 });
  });
});

describe("layoutWorkingDuration — mirrors the API rule", () => {
  const schedule = scheduleFor(sam, unit, TZ);
  const thu9 = "2026-09-24T08:00:00.000Z"; // Thu 24 Sept 09:00 BST

  it("leaves an hours-based job alone", () => {
    const layout = layoutWorkingDuration(thu9, 180, schedule, TZ, { allDay: false });
    assert.equal(layout.end, "2026-09-24T11:00:00.000Z");
    assert.deepEqual(layout.occupiedDays, ["2026-09-24"]);
  });

  it("skips the weekend: three days from Thursday are Thu, Fri, Mon", () => {
    const layout = layoutWorkingDuration(thu9, 3 * DAY, schedule, TZ, { allDay: false });
    assert.deepEqual(layout.occupiedDays, ["2026-09-24", "2026-09-25", "2026-09-28"]);
    assert.deepEqual(layout.segments, [
      { start: "2026-09-24T08:00:00.000Z", end: "2026-09-24T16:00:00.000Z" },
      { start: "2026-09-25T07:00:00.000Z", end: "2026-09-25T16:00:00.000Z" },
      { start: "2026-09-28T07:00:00.000Z", end: "2026-09-28T16:00:00.000Z" },
    ]);
    assert.equal(layout.end, "2026-09-28T16:00:00.000Z");
  });

  it("holds whole local days for an all-day job", () => {
    const layout = layoutWorkingDuration("2026-09-23T23:00:00.000Z", 3 * DAY, schedule, TZ, {
      allDay: true,
    });
    assert.deepEqual(layout.segments, [
      { start: "2026-09-23T23:00:00.000Z", end: "2026-09-24T23:00:00.000Z" },
      { start: "2026-09-24T23:00:00.000Z", end: "2026-09-25T23:00:00.000Z" },
      { start: "2026-09-27T23:00:00.000Z", end: "2026-09-28T23:00:00.000Z" },
    ]);
  });

  it("runs leftover hours on the next working day from opening", () => {
    const layout = layoutWorkingDuration("2026-09-25T08:00:00.000Z", DAY + 180, schedule, TZ, {
      allDay: false,
    });
    assert.deepEqual(layout.occupiedDays, ["2026-09-25", "2026-09-28"]);
    assert.equal(layout.segments[1]!.end, "2026-09-28T10:00:00.000Z");
  });

  it("is one continuous span with no schedule", () => {
    const layout = layoutWorkingDuration(thu9, 3 * DAY, null, TZ, { allDay: false });
    assert.equal(layout.end, "2026-09-27T08:00:00.000Z");
    assert.equal(layout.segments.length, 1);
    assert.deepEqual(layout.occupiedDays, ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("keeps 08:00 as 08:00 across the autumn clock change", () => {
    const layout = layoutWorkingDuration("2026-10-23T08:00:00.000Z", 2 * DAY, schedule, TZ, {
      allDay: false,
    });
    assert.deepEqual(layout.occupiedDays, ["2026-10-23", "2026-10-26"]);
    assert.deepEqual(layout.segments[1], {
      start: "2026-10-26T08:00:00.000Z",
      end: "2026-10-26T17:00:00.000Z",
    });
  });
});

describe("layoutExplicitWindow", () => {
  const schedule = scheduleFor(sam, unit, TZ);

  it("frees the weekend inside a hand-set Thursday → Monday window", () => {
    const layout = layoutExplicitWindow(
      "2026-09-24T08:00:00.000Z",
      "2026-09-28T16:00:00.000Z",
      schedule,
      TZ,
      { allDay: false },
    );
    assert.deepEqual(layout.occupiedDays, ["2026-09-24", "2026-09-25", "2026-09-28"]);
    assert.equal(layout.end, "2026-09-28T16:00:00.000Z");
  });

  it("keeps a last day staff picked even when it is not worked", () => {
    const layout = layoutExplicitWindow(
      "2026-09-23T23:00:00.000Z",
      "2026-09-26T23:00:00.000Z",
      schedule,
      TZ,
      { allDay: true },
    );
    assert.deepEqual(layout.occupiedDays, ["2026-09-24", "2026-09-25", "2026-09-26"]);
  });
});

describe("reading saved bookings", () => {
  const job = {
    start: "2026-09-24T08:00:00.000Z",
    end: "2026-09-28T16:00:00.000Z",
    segments: [
      { start: "2026-09-24T08:00:00.000Z", end: "2026-09-24T16:00:00.000Z" },
      { start: "2026-09-25T07:00:00.000Z", end: "2026-09-25T16:00:00.000Z" },
      { start: "2026-09-28T07:00:00.000Z", end: "2026-09-28T16:00:00.000Z" },
    ],
    occupiedDays: ["2026-09-24", "2026-09-25", "2026-09-28"],
  };

  it("uses the API's segments and days when present", () => {
    assert.equal(segmentsOf(job).length, 3);
    assert.deepEqual(occupiedDaysOf(job, TZ), job.occupiedDays);
    assert.deepEqual(segmentOn(job, "2026-09-25", TZ), job.segments[1]);
    assert.equal(segmentOn(job, "2026-09-26", TZ), null);
    assert.equal(isMultiDay(job, TZ), true);
  });

  it("reads an older booking (no segments) as one continuous span, as stored", () => {
    const old = { start: "2026-09-24T08:00:00.000Z", end: "2026-09-27T08:00:00.000Z" };
    assert.deepEqual(segmentsOf(old), [{ start: old.start, end: old.end }]);
    assert.deepEqual(occupiedDaysOf(old, TZ), [
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    assert.ok(segmentOn(old, "2026-09-26", TZ));
  });

  it("an end exactly on midnight belongs to the day before", () => {
    const allDay = { start: "2026-09-23T23:00:00.000Z", end: "2026-09-24T23:00:00.000Z" };
    assert.deepEqual(occupiedDaysOf(allDay, TZ), ["2026-09-24"]);
    assert.equal(isMultiDay(allDay, TZ), false);
  });

  it("splits columns into contiguous bars", () => {
    assert.deepEqual(contiguousRuns([3, 4, 0]), [
      { startCol: 3, endCol: 4 },
      { startCol: 0, endCol: 0 },
    ]);
    assert.deepEqual(contiguousRuns([0, 1, 2]), [{ startCol: 0, endCol: 2 }]);
    assert.deepEqual(contiguousRuns([]), []);
  });

  it("spells the real span with the working-day count", () => {
    assert.equal(formatWorkingSpan(job, TZ), "Thu 24 – Mon 28 Sept · 3 working days");
    assert.equal(
      formatWorkingSpan({ start: "2026-09-24T08:00:00.000Z", end: "2026-09-24T11:00:00.000Z" }, TZ),
      null,
    );
    // One continuous span (an older booking, or nothing to skip): plain days.
    assert.equal(
      formatWorkingSpan({ start: "2026-09-29T23:00:00.000Z", end: "2026-10-01T23:00:00.000Z" }, TZ),
      "Wed 30 Sept – Thu 1 Oct · 2 days",
    );
  });
});

describe("layoutExplicitWindow — minutes the API will store", () => {
  const schedule = scheduleFor(sam, unit, TZ);

  it("counts only the occupied days of a timed Thursday → Monday window", () => {
    const layout = layoutExplicitWindow(
      "2026-09-24T08:00:00.000Z",
      "2026-09-28T16:00:00.000Z",
      schedule,
      TZ,
      { allDay: false },
    );
    // Thu + Fri whole, then Monday 08:00 → 17:00 local.
    assert.equal(layout.minutes, 2 * DAY + 9 * 60);
  });

  it("is whole days for an all-day window and raw minutes with no schedule", () => {
    const allDay = layoutExplicitWindow(
      "2026-09-23T23:00:00.000Z",
      "2026-09-28T23:00:00.000Z",
      schedule,
      TZ,
      { allDay: true },
    );
    assert.deepEqual(allDay.occupiedDays, ["2026-09-24", "2026-09-25", "2026-09-28"]);
    assert.equal(allDay.minutes, 3 * DAY);
    const plain = layoutExplicitWindow(
      "2026-09-24T08:00:00.000Z",
      "2026-09-28T16:00:00.000Z",
      null,
      TZ,
      { allDay: false },
    );
    assert.equal(plain.minutes, 4 * DAY + 8 * 60);
  });
});

describe("wallToUtc", () => {
  it("converts local wall-clock minutes in both halves of the year", () => {
    assert.equal(wallToUtc("2026-09-24", 9 * 60, TZ).toISOString(), "2026-09-24T08:00:00.000Z");
    assert.equal(wallToUtc("2026-01-12", 9 * 60, TZ).toISOString(), "2026-01-12T09:00:00.000Z");
    assert.equal(wallToUtc("2026-09-24", 24 * 60, TZ).toISOString(), "2026-09-24T23:00:00.000Z");
  });
});
