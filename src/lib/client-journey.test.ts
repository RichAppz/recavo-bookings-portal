import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayPartFor,
  dedupeSlotsByStart,
  formatCountdown,
  groupSlotsByDayPart,
  hoursLabel,
  isAccountBooking,
  isTooLateToHold,
  looksLikeEmail,
  nationalPhone,
  splitDisplayName,
  toE164,
} from "./client-journey.ts";

describe("toE164 — UK mobile numbers as people type them", () => {
  it("turns a national number into +44", () => {
    assert.equal(toE164("07700 900123"), "+447700900123");
    assert.equal(toE164("7700900123"), "+447700900123");
  });

  it("keeps an international number as it is", () => {
    assert.equal(toE164("+353 87 123 4567"), "+353871234567");
  });

  it("refuses anything ambiguous instead of guessing", () => {
    assert.equal(toE164("123"), null);
    assert.equal(toE164(""), null);
    assert.equal(toE164("call me"), null);
  });
});

describe("nationalPhone — a stored number back in the form", () => {
  it("shows a +44 number the way it is dialled at home", () => {
    assert.equal(nationalPhone("+447700900123"), "07700 900123");
    assert.equal(toE164(nationalPhone("+447700900123")), "+447700900123");
  });

  it("leaves other countries and odd values alone", () => {
    assert.equal(nationalPhone("+353871234567"), "+353871234567");
    assert.equal(nationalPhone("07700 900123"), "07700 900123");
    assert.equal(nationalPhone(""), "");
  });
});

describe("looksLikeEmail", () => {
  it("catches an obviously mistyped address", () => {
    assert.equal(looksLikeEmail("sam@example.com"), true);
    assert.equal(looksLikeEmail("sam@example"), false);
    assert.equal(looksLikeEmail("sam example.com"), false);
  });
});

describe("formatCountdown", () => {
  it("shows m:ss and never goes negative", () => {
    assert.equal(formatCountdown(9 * 60_000 + 5_000), "9:05");
    assert.equal(formatCountdown(500), "0:01");
    assert.equal(formatCountdown(-10), "0:00");
  });
});

describe("splitDisplayName", () => {
  it("splits first and the rest", () => {
    assert.deepEqual(splitDisplayName("Sam Jo Patel"), { first: "Sam", last: "Jo Patel" });
    assert.deepEqual(splitDisplayName(null), { first: "", last: "" });
  });
});

describe("day parts", () => {
  it("buckets by local hour", () => {
    assert.equal(dayPartFor(8), "Morning");
    assert.equal(dayPartFor(12), "Afternoon");
    assert.equal(dayPartFor(17), "Evening");
  });

  it("groups slots in start order and omits empty parts", () => {
    const slots = [
      { start: "2026-10-16T18:00:00Z" },
      { start: "2026-10-16T08:00:00Z" },
      { start: "2026-10-16T09:00:00Z" },
    ];
    const grouped = groupSlotsByDayPart(slots, (iso) => new Date(iso).getUTCHours());
    assert.deepEqual(
      grouped.map((g) => [g.part, g.slots.length]),
      [
        ["Morning", 2],
        ["Evening", 1],
      ],
    );
    assert.equal(grouped[0]!.slots[0]!.start, "2026-10-16T08:00:00Z");
  });

  it("collapses same-start slots to the one with the most room left", () => {
    const slots = [
      { start: "2026-10-16T09:00:00Z", remainingCapacity: 1 },
      { start: "2026-10-16T09:00:00Z", remainingCapacity: 3 },
      { start: "2026-10-16T08:00:00Z", remainingCapacity: 1 },
    ];
    const deduped = dedupeSlotsByStart(slots);
    assert.equal(deduped.length, 2);
    assert.equal(deduped[1]!.remainingCapacity, 3);
  });
});

describe("hoursLabel", () => {
  it("says it the way people do", () => {
    assert.equal(hoursLabel(24), "24 hours");
    assert.equal(hoursLabel(48), "2 days");
    assert.equal(hoursLabel(6), "6 hours");
    assert.equal(hoursLabel(1), "1 hour");
  });
});

describe("isTooLateToHold — a slot that passed while the visitor typed", () => {
  it("recognises the notice-window refusal and nothing else", () => {
    assert.equal(
      isTooLateToHold({
        status: 422,
        detail: "The selected time is within the booking notice window",
      }),
      true,
    );
    assert.equal(isTooLateToHold({ status: 422, detail: "Payment still settling" }), false);
    assert.equal(
      isTooLateToHold({ status: 409, detail: "within the booking notice window" }),
      false,
    );
    assert.equal(isTooLateToHold({ status: 422 }), false);
  });
});

describe("isAccountBooking — what counts as a booking in the account", () => {
  it("keeps confirmed, unpaid and completed; drops holds and history", () => {
    for (const status of ["awaiting_payment", "confirmed", "completed"]) {
      assert.equal(isAccountBooking({ status }), true, status);
    }
    for (const status of [
      "held",
      "expired",
      "cancelled_by_customer",
      "cancelled_by_business",
      "late_cancelled",
      "no_show",
      "draft",
    ]) {
      assert.equal(isAccountBooking({ status }), false, status);
    }
  });
});
