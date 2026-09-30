import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sameWorkingHours, windowsToWorkingRules, workingRulesToWindows } from "./working-hours.ts";

const soho = "01a0d8b0-1e0a-7681-b397-0de6ac994868";

describe("workingRulesToWindows", () => {
  it("drops the location and sorts by day then start", () => {
    const windows = workingRulesToWindows([
      { dayOfWeek: 3, startMinute: 540, endMinute: 1020, locationId: soho },
      { dayOfWeek: 1, startMinute: 780, endMinute: 1020, locationId: soho },
      { dayOfWeek: 1, startMinute: 540, endMinute: 720, locationId: soho },
    ]);
    assert.deepEqual(windows, [
      { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 1, startMinute: 780, endMinute: 1020 },
      { dayOfWeek: 3, startMinute: 540, endMinute: 1020 },
    ]);
  });
});

describe("windowsToWorkingRules", () => {
  const windows = [
    { dayOfWeek: 1, startMinute: 540, endMinute: 1020 },
    { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
  ];

  it("works anywhere when there were no rules before", () => {
    assert.deepEqual(windowsToWorkingRules(windows, []), [
      { dayOfWeek: 1, startMinute: 540, endMinute: 1020, locationId: null },
      { dayOfWeek: 2, startMinute: 540, endMinute: 1020, locationId: null },
    ]);
  });

  it("keeps a single shared location", () => {
    const rules = windowsToWorkingRules(windows, [
      { dayOfWeek: 5, startMinute: 540, endMinute: 1020, locationId: soho },
    ]);
    assert.ok(rules.every((r) => r.locationId === soho));
  });

  it("falls back to any location when the old rules mixed locations", () => {
    const rules = windowsToWorkingRules(windows, [
      { dayOfWeek: 5, startMinute: 540, endMinute: 1020, locationId: soho },
      { dayOfWeek: 6, startMinute: 540, endMinute: 1020, locationId: null },
    ]);
    assert.ok(rules.every((r) => r.locationId === null));
  });
});

describe("sameWorkingHours", () => {
  const rules = [
    { dayOfWeek: 2, startMinute: 540, endMinute: 1020, locationId: soho },
    { dayOfWeek: 1, startMinute: 540, endMinute: 1020, locationId: soho },
  ];

  it("ignores order and location", () => {
    assert.equal(
      sameWorkingHours(
        [
          { dayOfWeek: 1, startMinute: 540, endMinute: 1020 },
          { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
        ],
        rules,
      ),
      true,
    );
  });

  it("spots a changed time or a missing day", () => {
    assert.equal(
      sameWorkingHours(
        [
          { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
          { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
        ],
        rules,
      ),
      false,
    );
    assert.equal(
      sameWorkingHours([{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }], rules),
      false,
    );
    assert.equal(sameWorkingHours([], []), true);
  });
});
