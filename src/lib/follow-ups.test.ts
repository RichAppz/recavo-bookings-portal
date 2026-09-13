import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceFollowUp } from "./api/types.ts";
import {
  draftFromRule,
  followUpBucket,
  followUpIntervalLabel,
  followUpRuleSummary,
  oneMonthFrom,
  relativeDueLabel,
  ruleFromDraft,
} from "./follow-ups.ts";

const NOW = new Date("2026-09-13T12:00:00.000Z");

function followUp(overrides: Partial<ServiceFollowUp>): ServiceFollowUp {
  return {
    id: "fu_1",
    businessId: "biz",
    customerId: "cust",
    bookingId: "bk",
    serviceId: "svc",
    linkedRecordId: null,
    serviceName: "Ceramic coating",
    label: "Ceramic top-up",
    title: "Ceramic top-up",
    lastDoneAt: "2024-09-13T12:00:00.000Z",
    dueAt: "2026-09-13T12:00:00.000Z",
    remindAt: "2026-08-30T12:00:00.000Z",
    status: "scheduled",
    sentAt: null,
    dismissedAt: null,
    snoozedUntil: null,
    supersededByBookingId: null,
    customer: null,
    linkedRecord: null,
    booking: null,
    createdAt: "2024-09-13T12:00:00.000Z",
    updatedAt: "2024-09-13T12:00:00.000Z",
    ...overrides,
  };
}

describe("followUpIntervalLabel / followUpRuleSummary", () => {
  it("reads whole years as years and everything else as months", () => {
    assert.equal(followUpIntervalLabel(24), "every 2 years");
    assert.equal(followUpIntervalLabel(12), "every year");
    assert.equal(followUpIntervalLabel(18), "every 18 months");
    assert.equal(followUpIntervalLabel(1), "every month");
  });

  it("uses the rule's label when it has one, else 'Top-up'", () => {
    assert.equal(
      followUpRuleSummary({ intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" }),
      "Ceramic top-up every 2 years",
    );
    assert.equal(
      followUpRuleSummary({ intervalMonths: 6, leadDays: 7, label: null }),
      "Top-up every 6 months",
    );
  });
});

describe("draftFromRule / ruleFromDraft", () => {
  it("round-trips a preset and a custom interval", () => {
    const preset = draftFromRule({ intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" });
    assert.deepEqual(preset, {
      enabled: true,
      preset: "24",
      customMonths: "",
      leadDays: "14",
      label: "Ceramic top-up",
    });
    assert.deepEqual(ruleFromDraft(preset), {
      ok: true,
      rule: { intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" },
    });

    const custom = draftFromRule({ intervalMonths: 30, leadDays: 0, label: null });
    assert.equal(custom.preset, "custom");
    assert.equal(custom.customMonths, "30");
    assert.deepEqual(ruleFromDraft(custom), {
      ok: true,
      rule: { intervalMonths: 30, leadDays: 0, label: null },
    });
  });

  it("is off by default, defaults the lead time, trims the label", () => {
    const off = draftFromRule(null);
    assert.equal(off.enabled, false);
    assert.deepEqual(ruleFromDraft(off), { ok: true, rule: null });
    assert.deepEqual(ruleFromDraft({ ...off, enabled: true, leadDays: "", label: "  " }), {
      ok: true,
      rule: { intervalMonths: 24, leadDays: 14, label: null },
    });
  });

  it("refuses out-of-range or non-integer values with the field named", () => {
    const base = { ...draftFromRule(null), enabled: true };
    assert.equal(ruleFromDraft({ ...base, preset: "custom", customMonths: "0" }).ok, false);
    assert.equal(
      (ruleFromDraft({ ...base, preset: "custom", customMonths: "1.5" }) as { field: string })
        .field,
      "intervalMonths",
    );
    assert.equal(
      (ruleFromDraft({ ...base, leadDays: "400" }) as { field: string }).field,
      "leadDays",
    );
    assert.equal(
      (ruleFromDraft({ ...base, label: "x".repeat(81) }) as { field: string }).field,
      "label",
    );
  });
});

describe("followUpBucket", () => {
  it("sorts open follow-ups by urgency and closes the rest", () => {
    assert.equal(followUpBucket(followUp({ dueAt: "2026-09-01T00:00:00.000Z" }), NOW), "overdue");
    assert.equal(followUpBucket(followUp({ dueAt: "2026-09-20T00:00:00.000Z" }), NOW), "due_soon");
    assert.equal(
      followUpBucket(
        followUp({ dueAt: "2027-09-13T12:00:00.000Z", remindAt: "2027-08-30T12:00:00.000Z" }),
        NOW,
      ),
      "upcoming",
    );
    assert.equal(followUpBucket(followUp({ status: "dismissed" }), NOW), "closed");
    assert.equal(followUpBucket(followUp({ status: "completed" }), NOW), "closed");
    assert.equal(followUpBucket(followUp({ status: "sent" }), NOW), "due_soon");
  });
});

describe("relativeDueLabel", () => {
  it("reads coarse spans either side of today", () => {
    assert.equal(relativeDueLabel("2026-09-13T18:00:00.000Z", NOW), "due today");
    assert.equal(relativeDueLabel("2026-09-16T12:00:00.000Z", NOW), "in 3 days");
    assert.equal(relativeDueLabel("2026-10-04T12:00:00.000Z", NOW), "in 3 weeks");
    assert.equal(relativeDueLabel("2027-01-13T12:00:00.000Z", NOW), "in 4 months");
    assert.equal(relativeDueLabel("2028-09-13T12:00:00.000Z", NOW), "in 2 years");
    assert.equal(relativeDueLabel("2026-09-03T12:00:00.000Z", NOW), "10 days overdue");
  });
});

describe("oneMonthFrom", () => {
  it("is a calendar month ahead", () => {
    assert.equal(oneMonthFrom(new Date("2026-09-13T12:00:00.000Z")), "2026-10-13T12:00:00.000Z");
  });
});
