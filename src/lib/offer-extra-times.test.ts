import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeExtraTimesCount,
  describeExtraWindow,
  extraTimeRowError,
  formatClock,
  fromExtraWindows,
  hasExtraTimesForService,
  MAX_EXTRA_TIMES,
  newExtraTimeRow,
  parseClock,
  toExtraWindows,
  validateExtraTimeRows,
  type ExtraTimeRow,
} from "./offer-extra-times.ts";

const base: ExtraTimeRow = {
  key: "k1",
  serviceId: "svc_1",
  mode: "weekly",
  dayOfWeek: 7,
  date: "",
  start: "10:00",
  end: "14:00",
};

describe("parseClock / formatClock", () => {
  it("round-trips wall-clock minutes, including midnight at the end of the day", () => {
    assert.equal(parseClock("09:30"), 570);
    assert.equal(parseClock("9:05"), 545);
    assert.equal(parseClock("24:00"), 1440);
    assert.equal(formatClock(570), "09:30");
    assert.equal(formatClock(1440), "24:00");
  });

  it("rejects anything that is not a complete time", () => {
    assert.equal(parseClock(""), null);
    assert.equal(parseClock("10"), null);
    assert.equal(parseClock("25:00"), null);
    assert.equal(parseClock("10:60"), null);
    assert.equal(parseClock("24:30"), null);
  });
});

describe("extraTimeRowError", () => {
  it("accepts a weekly window and a dated window", () => {
    assert.equal(extraTimeRowError(base), null);
    assert.equal(extraTimeRowError({ ...base, mode: "date", date: "2026-10-25" }), null);
  });

  it("asks for a date when 'on a date' has none", () => {
    assert.equal(extraTimeRowError({ ...base, mode: "date", date: "" }), "Pick a date");
    assert.equal(extraTimeRowError({ ...base, mode: "date", date: "25/10/2026" }), "Pick a date");
  });

  it("insists the end is after the start and both are complete", () => {
    assert.equal(extraTimeRowError({ ...base, end: "10:00" }), "End must be after start");
    assert.equal(extraTimeRowError({ ...base, end: "09:00" }), "End must be after start");
    assert.equal(extraTimeRowError({ ...base, start: "" }), "Enter a start and end time");
  });
});

describe("validateExtraTimeRows", () => {
  it("collects per-row errors by key and caps the list", () => {
    const rows = [base, { ...base, key: "k2", end: "08:00" }];
    const result = validateExtraTimeRows(rows);
    assert.deepEqual([...result.byKey.entries()], [["k2", "End must be after start"]]);
    assert.equal(result.listError, null);

    const tooMany = Array.from({ length: MAX_EXTRA_TIMES + 1 }, (_, i) => ({
      ...base,
      key: `k${i}`,
    }));
    assert.equal(
      validateExtraTimeRows(tooMany).listError,
      `Up to ${MAX_EXTRA_TIMES} extra times per link`,
    );
    assert.equal(validateExtraTimeRows(tooMany.slice(1)).listError, null);
  });
});

describe("toExtraWindows / fromExtraWindows", () => {
  it("produces the API shape with exactly one of date / dayOfWeek set", () => {
    assert.deepEqual(
      toExtraWindows([base, { ...base, key: "k2", mode: "date", date: "2026-10-25" }]),
      [
        { serviceId: "svc_1", date: null, dayOfWeek: 7, startMinute: 600, endMinute: 840 },
        {
          serviceId: "svc_1",
          date: "2026-10-25",
          dayOfWeek: null,
          startMinute: 600,
          endMinute: 840,
        },
      ],
    );
  });

  it("rebuilds editable rows from stored windows", () => {
    const rows = fromExtraWindows([
      {
        serviceId: "svc_2",
        date: "2026-10-25",
        dayOfWeek: null,
        startMinute: 1020,
        endMinute: 1200,
      },
      { serviceId: "svc_1", date: null, dayOfWeek: 3, startMinute: 0, endMinute: 1440 },
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map(({ key: _key, ...rest }) => rest),
      [
        {
          serviceId: "svc_2",
          mode: "date",
          dayOfWeek: 7,
          date: "2026-10-25",
          start: "17:00",
          end: "20:00",
        },
        {
          serviceId: "svc_1",
          mode: "weekly",
          dayOfWeek: 3,
          date: "",
          start: "00:00",
          end: "24:00",
        },
      ],
    );
    assert.notEqual(rows[0]!.key, rows[1]!.key);
    assert.deepEqual(toExtraWindows(rows), [
      {
        serviceId: "svc_2",
        date: "2026-10-25",
        dayOfWeek: null,
        startMinute: 1020,
        endMinute: 1200,
      },
      { serviceId: "svc_1", date: null, dayOfWeek: 3, startMinute: 0, endMinute: 1440 },
    ]);
  });

  it("gives each new row its own key and sensible defaults", () => {
    const a = newExtraTimeRow("svc_1");
    const b = newExtraTimeRow("svc_1");
    assert.notEqual(a.key, b.key);
    assert.equal(a.mode, "weekly");
    assert.equal(extraTimeRowError(a), null);
  });
});

describe("summaries", () => {
  it("describes a window the way the business would say it", () => {
    assert.equal(
      describeExtraWindow({
        serviceId: "s",
        date: null,
        dayOfWeek: 7,
        startMinute: 600,
        endMinute: 840,
      }),
      "Every Sunday 10:00–14:00",
    );
    assert.equal(
      describeExtraWindow({
        serviceId: "s",
        date: "2026-10-25",
        dayOfWeek: null,
        startMinute: 1020,
        endMinute: 1200,
      }),
      "Sun 25 Oct 17:00–20:00",
    );
  });

  it("counts extra times for the link list and knows which sessions have them", () => {
    const windows = [
      { serviceId: "svc_1", date: null, dayOfWeek: 7, startMinute: 600, endMinute: 840 },
      { serviceId: "svc_1", date: null, dayOfWeek: 6, startMinute: 600, endMinute: 840 },
    ];
    assert.equal(describeExtraTimesCount(undefined), null);
    assert.equal(describeExtraTimesCount([]), null);
    assert.equal(describeExtraTimesCount(windows.slice(0, 1)), "+1 extra time");
    assert.equal(describeExtraTimesCount(windows), "+2 extra times");
    assert.equal(hasExtraTimesForService(windows, "svc_1"), true);
    assert.equal(hasExtraTimesForService(windows, "svc_2"), false);
    assert.equal(hasExtraTimesForService(undefined, "svc_1"), false);
    assert.equal(hasExtraTimesForService(windows, null), false);
  });
});
