import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoDateInTz, timeInTz, zonedDateTimeToIso } from "./format.ts";

// Staff type wall-clock dates in the business's zone. These must not depend on the
// zone of the device running them (the phone abroad that put "13 Oct" on the 12th).

describe("zonedDateTimeToIso", () => {
  it("reads a date as midnight at the business, not on the device", () => {
    // BST: London midnight on 13 Oct is 23:00Z on the 12th.
    assert.equal(
      zonedDateTimeToIso("2026-10-13", "00:00", "Europe/London"),
      "2026-10-12T23:00:00.000Z",
    );
    // GMT: the same wall clock in winter is midnight UTC.
    assert.equal(
      zonedDateTimeToIso("2026-12-13", "00:00", "Europe/London"),
      "2026-12-13T00:00:00.000Z",
    );
    assert.equal(
      zonedDateTimeToIso("2026-10-13", "09:30", "Europe/Paris"),
      "2026-10-13T07:30:00.000Z",
    );
  });

  it("returns null while a date or time is part-typed", () => {
    assert.equal(zonedDateTimeToIso("", "00:00", "Europe/London"), null);
    assert.equal(zonedDateTimeToIso("2026-10-1", "00:00", "Europe/London"), null);
    assert.equal(zonedDateTimeToIso("2026-10-13", "9:00", "Europe/London"), null);
  });
});

describe("isoDateInTz / timeInTz", () => {
  it("round-trip the date and time the business sees", () => {
    const iso = "2026-10-12T23:00:00.000Z";
    assert.equal(isoDateInTz(iso, "Europe/London"), "2026-10-13");
    assert.equal(timeInTz(iso, "Europe/London"), "00:00");
    assert.equal(isoDateInTz(iso, "UTC"), "2026-10-12");
    assert.equal(timeInTz(iso, "UTC"), "23:00");
    assert.equal(
      zonedDateTimeToIso(
        isoDateInTz(iso, "Europe/London"),
        timeInTz(iso, "Europe/London"),
        "Europe/London",
      ),
      iso,
    );
  });

  it("gives the exclusive end's last day as the day before it", () => {
    // Mon 12 – Tue 13 Oct all-day: end is Wed 14 00:00 London = 13T23:00Z.
    const end = "2026-10-13T23:00:00.000Z";
    const last = new Date(new Date(end).getTime() - 60_000).toISOString();
    assert.equal(isoDateInTz(last, "Europe/London"), "2026-10-13");
  });
});
