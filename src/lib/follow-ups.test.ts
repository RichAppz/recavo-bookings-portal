import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceFollowUp } from "./api/types.ts";
import {
  FOLLOW_UP_INTERVAL_PRESETS,
  draftsFromRules,
  followUpBucket,
  followUpIntervalLabel,
  followUpRuleSummary,
  followUpRulesSummary,
  leadDaysLabel,
  newFollowUpDraft,
  oneMonthFrom,
  relativeDueLabel,
  reminderRuleRows,
  rulesFromDrafts,
  rulesWithSaved,
  rulesWithout,
} from "./follow-ups.ts";

const NOW = new Date("2026-09-13T12:00:00.000Z");

function followUp(overrides: Partial<ServiceFollowUp>): ServiceFollowUp {
  return {
    id: "fu_1",
    businessId: "biz",
    customerId: "cust",
    bookingId: "bk",
    serviceId: "svc",
    ruleId: "rule_1",
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
      followUpRuleSummary({ intervalMonths: 24, label: "Ceramic top-up" }),
      "Ceramic top-up every 2 years",
    );
    assert.equal(followUpRuleSummary({ intervalMonths: 6, label: null }), "Top-up every 6 months");
  });

  it("lists several rules soonest first on the service card", () => {
    assert.equal(
      followUpRulesSummary([
        { intervalMonths: 24, label: "Ceramic top-up" },
        { intervalMonths: 12, label: "Valet" },
      ]),
      "Valet every year · Ceramic top-up every 2 years",
    );
  });
});

describe("draftsFromRules / rulesFromDrafts", () => {
  const topUp = { id: "rule_top", intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" };
  const custom = { id: "rule_custom", intervalMonths: 30, leadDays: 0, label: null };

  it("round-trips a preset and a custom interval, keeping each rule's id", () => {
    const drafts = draftsFromRules([topUp, custom]);
    assert.deepEqual(
      drafts.map(({ key: _key, ...rest }) => rest),
      [
        { id: "rule_top", preset: "24", customMonths: "", leadDays: "14", label: "Ceramic top-up" },
        { id: "rule_custom", preset: "custom", customMonths: "30", leadDays: "0", label: "" },
      ],
    );
    assert.deepEqual(rulesFromDrafts(drafts), {
      ok: true,
      rules: [
        { id: "rule_top", intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" },
        { id: "rule_custom", intervalMonths: 30, leadDays: 0, label: null },
      ],
    });
  });

  it("is off with no rules, defaults the lead time, trims the label, sends no id for a new rule", () => {
    assert.deepEqual(draftsFromRules(undefined), []);
    assert.deepEqual(rulesFromDrafts([]), { ok: true, rules: [] });
    const fresh = newFollowUpDraft([]);
    assert.equal(fresh.id, null);
    assert.equal(fresh.preset, "24");
    assert.deepEqual(rulesFromDrafts([{ ...fresh, leadDays: "", label: "  " }]), {
      ok: true,
      rules: [{ intervalMonths: 24, leadDays: 14, label: null }],
    });
  });

  it("offers an interval not already used when adding another reminder", () => {
    const first = newFollowUpDraft([]);
    const second = newFollowUpDraft([first]);
    assert.equal(second.preset, "12");
    const third = newFollowUpDraft([first, second]);
    assert.equal(third.preset, "6");
    assert.notEqual(second.key, third.key);
  });

  it("refuses out-of-range or non-integer values, naming the reminder and field", () => {
    const base = newFollowUpDraft([]);
    const bad = (patch: Partial<typeof base>) =>
      rulesFromDrafts([base, { ...newFollowUpDraft([base]), ...patch }]) as {
        ok: false;
        index: number;
        field: string;
      };
    assert.equal(rulesFromDrafts([{ ...base, preset: "custom", customMonths: "0" }]).ok, false);
    assert.deepEqual(
      [
        bad({ preset: "custom", customMonths: "1.5" }).index,
        bad({ preset: "custom", customMonths: "1.5" }).field,
      ],
      [1, "intervalMonths"],
    );
    assert.equal(bad({ leadDays: "400" }).field, "leadDays");
    assert.equal(bad({ label: "x".repeat(81) }).field, "label");
  });

  it("refuses two reminders with the same interval, pointing at the second", () => {
    const first = newFollowUpDraft([]);
    const result = rulesFromDrafts([first, { ...newFollowUpDraft([first]), preset: "24" }]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.index, 1);
      assert.equal(result.field, "intervalMonths");
      assert.match(result.message, /Reminder 1 already uses 2 years/);
    }
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

describe("interval presets", () => {
  it("offer the short upkeep intervals a wash needs as well as the long ones", () => {
    assert.deepEqual(
      FOLLOW_UP_INTERVAL_PRESETS.map((p) => p.months),
      [1, 2, 3, 6, 12, 18, 24, 36],
    );
    assert.equal(FOLLOW_UP_INTERVAL_PRESETS.find((p) => p.months === 2)?.label, "2 months");
    assert.equal(followUpIntervalLabel(2), "every 2 months");
    assert.equal(followUpIntervalLabel(1), "every month");
  });
});

const RULE_A = { id: "r_a", intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" };
const RULE_B = { id: "r_b", intervalMonths: 2, leadDays: 7, label: null };
const RULE_C = { id: "r_c", intervalMonths: 12, leadDays: 14, label: null };

describe("reminderRuleRows", () => {
  it("lists every rule, active services A–Z first, soonest interval first within one", () => {
    const rows = reminderRuleRows([
      { id: "s_old", name: "Old wax", active: false, followUps: [RULE_C] },
      { id: "s_coat", name: "Ceramic coating", active: true, followUps: [RULE_A, RULE_B] },
      { id: "s_wash", name: "Maintenance wash", active: true, followUps: [] },
      { id: "s_alloy", name: "Alloy refurb", active: true, followUps: [RULE_C] },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.serviceName, r.rule.id, r.serviceActive]),
      [
        ["Alloy refurb", "r_c", true],
        ["Ceramic coating", "r_b", true],
        ["Ceramic coating", "r_a", true],
        ["Old wax", "r_c", false],
      ],
    );
  });
});

describe("rulesWithSaved / rulesWithout", () => {
  it("appends a new rule after the existing ones, ids kept", () => {
    assert.deepEqual(rulesWithSaved([RULE_A], { intervalMonths: 2, leadDays: 7, label: null }), [
      { id: "r_a", intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" },
      { intervalMonths: 2, leadDays: 7, label: null },
    ]);
  });

  it("replaces an edited rule in place by id", () => {
    assert.deepEqual(
      rulesWithSaved([RULE_A, RULE_B], {
        id: "r_b",
        intervalMonths: 3,
        leadDays: 7,
        label: "Wash",
      }),
      [
        { id: "r_a", intervalMonths: 24, leadDays: 14, label: "Ceramic top-up" },
        { id: "r_b", intervalMonths: 3, leadDays: 7, label: "Wash" },
      ],
    );
  });

  it("treats an unknown id as a new rule rather than dropping it", () => {
    const out = rulesWithSaved([RULE_A], {
      id: "r_gone",
      intervalMonths: 6,
      leadDays: 14,
      label: null,
    });
    assert.equal(out.length, 2);
    assert.equal(out[1]?.id, "r_gone");
  });

  it("removes one rule and leaves the rest, so an empty list switches reminders off", () => {
    assert.deepEqual(rulesWithout([RULE_A, RULE_B], "r_a"), [
      { id: "r_b", intervalMonths: 2, leadDays: 7, label: null },
    ]);
    assert.deepEqual(rulesWithout([RULE_A], "r_a"), []);
  });
});

describe("leadDaysLabel", () => {
  it("reads naturally for none, one and many days", () => {
    assert.equal(leadDaysLabel(0), "Remind on the day");
    assert.equal(leadDaysLabel(1), "Remind 1 day before");
    assert.equal(leadDaysLabel(14), "Remind 14 days before");
  });
});
