import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceFollowUp } from "./api/types.ts";
import {
  FOLLOW_UP_INTERVAL_PRESETS,
  clientReminderFromDraft,
  clientReminderSummary,
  dismissEach,
  draftsFromRules,
  existingOpenReminder,
  followUpBucket,
  followUpIntervalLabel,
  followUpIntervalMonths,
  followUpNames,
  followUpRuleSummary,
  followUpRulesSummary,
  leadDaysLabel,
  newFollowUpDraft,
  oneMonthFrom,
  openClientReminders,
  orphanedFollowUps,
  followUpsForRule,
  relativeDueLabel,
  reminderRuleRows,
  rulesFromDrafts,
  rulesWithSaved,
  rulesWithout,
  type ClientReminderDraft,
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
    source: "rule",
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

  it("treats a missing followUps list as no rules, and does not throw", () => {
    const rows = reminderRuleRows([
      { id: "s_old", name: "Old wax", active: true },
      { id: "s_wash", name: null, active: true, followUps: [RULE_B] },
    ] as never);
    assert.deepEqual(
      rows.map((r) => r.rule.id),
      ["r_b"],
    );
    assert.deepEqual(reminderRuleRows(undefined), []);
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

describe("clientReminderFromDraft", () => {
  const base: ClientReminderDraft = {
    customerId: "cust",
    serviceId: "svc",
    linkedRecordId: null,
    lastDone: "2026-09-01",
    preset: "2",
    customMonths: "",
    leadDays: "7",
    label: " Valet reminder ",
  };
  const opts = { timezone: "Europe/London", now: NOW };

  it("builds the API body with the due date and reminder moment the API will compute", () => {
    const out = clientReminderFromDraft(base, opts);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.body, {
      customerId: "cust",
      serviceId: "svc",
      linkedRecordId: null,
      lastDoneAt: "2026-09-01T12:00:00.000Z",
      intervalMonths: 2,
      leadDays: 7,
      label: "Valet reminder",
    });
    assert.equal(out.dueAt.toISOString(), "2026-11-01T12:00:00.000Z");
    assert.equal(out.remindAt.toISOString(), "2026-10-25T12:00:00.000Z");
  });

  it("takes today for a blank last-done date, in the business's zone", () => {
    const out = clientReminderFromDraft({ ...base, lastDone: "" }, opts);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.body.lastDoneAt, "2026-09-13T12:00:00.000Z");
    // Sydney is already on the 14th at midday UTC on the 13th... but not at 12:00Z.
    const late = clientReminderFromDraft(
      { ...base, lastDone: "" },
      { timezone: "Pacific/Auckland", now: new Date("2026-09-13T13:00:00.000Z") },
    );
    assert.equal(late.ok && late.body.lastDoneAt, "2026-09-14T12:00:00.000Z");
  });

  it("clamps month ends like the API and accepts a custom interval", () => {
    const out = clientReminderFromDraft(
      { ...base, lastDone: "2026-01-31", preset: "custom", customMonths: "1" },
      { ...opts, now: new Date("2026-02-01T09:00:00.000Z") },
    );
    assert.equal(out.ok && out.dueAt.toISOString(), "2026-02-28T12:00:00.000Z");
  });

  it("names the field that is wrong", () => {
    const field = (d: Partial<ClientReminderDraft>) => {
      const out = clientReminderFromDraft({ ...base, ...d }, opts);
      return out.ok ? "ok" : out.field;
    };
    assert.equal(field({ customerId: "" }), "customerId");
    assert.equal(field({ serviceId: "" }), "serviceId");
    assert.equal(field({ lastDone: "2026-13-40" }), "lastDone");
    assert.equal(field({ lastDone: "2026-09-20" }), "lastDone");
    assert.equal(field({ preset: "custom", customMonths: "0" }), "intervalMonths");
    assert.equal(field({ leadDays: "400" }), "leadDays");
    assert.equal(field({ label: "x".repeat(81) }), "label");
    // Last done in June with a 2-month interval: due in August, already behind us.
    assert.equal(field({ lastDone: "2026-06-01" }), "intervalMonths");
    // Yesterday counts as not-in-the-future even a few hours ahead of UTC.
    assert.equal(field({ lastDone: "2026-09-13" }), "ok");
  });
});

describe("existingOpenReminder", () => {
  const a = followUp({ id: "a", serviceId: "svc", dueAt: "2028-01-01T00:00:00.000Z" });
  const b = followUp({
    id: "b",
    serviceId: "svc",
    linkedRecordId: "car_2",
    dueAt: "2027-01-01T00:00:00.000Z",
  });
  const closed = followUp({ id: "c", serviceId: "svc", status: "dismissed" });
  const other = followUp({ id: "d", serviceId: "svc_other" });

  it("finds the soonest open one for the service, ignoring closed rows and other services", () => {
    assert.equal(existingOpenReminder([closed, other, a, b], "svc", null)?.id, "b");
    assert.equal(existingOpenReminder([closed, other], "svc", null), null);
    assert.equal(existingOpenReminder(undefined, "svc", null), null);
  });

  it("skips a different vehicle when both sides name one", () => {
    assert.equal(existingOpenReminder([b], "svc", "car_1"), null);
    assert.equal(existingOpenReminder([b], "svc", "car_2")?.id, "b");
    // One side unspecified: still counts as the same thing.
    assert.equal(existingOpenReminder([a], "svc", "car_1")?.id, "a");
  });
});

describe("followUpsForRule", () => {
  const mine = followUp({ id: "a", serviceId: "valet", ruleId: "r_valet" });
  const sent = followUp({ id: "b", serviceId: "valet", ruleId: "r_valet", status: "sent" });
  const closed = followUp({ id: "c", serviceId: "valet", ruleId: "r_valet", status: "dismissed" });
  const otherRule = followUp({ id: "d", serviceId: "valet", ruleId: "r_other" });
  const manual = followUp({ id: "e", serviceId: "valet", ruleId: null, source: "manual" });

  it("returns the open follow-ups that rule scheduled, scheduled or sent", () => {
    const ids = followUpsForRule([mine, sent, closed, otherRule, manual], "valet", "r_valet");
    assert.deepEqual(
      ids.map((f) => f.id),
      ["a", "b"],
    );
    assert.deepEqual(followUpsForRule(undefined, "valet", "r_valet"), []);
  });
});

describe("orphanedFollowUps", () => {
  const services = [
    { id: "valet", followUps: [] },
    {
      id: "coating",
      followUps: [{ id: "r_ceramic", intervalMonths: 24, leadDays: 14, label: "Ceramic" }],
    },
  ];

  it("flags open rule follow-ups whose rule is no longer on their service", () => {
    const removed = followUp({ id: "a", serviceId: "valet", ruleId: "r_valet" });
    const kept = followUp({ id: "b", serviceId: "coating", ruleId: "r_ceramic" });
    assert.deepEqual(
      orphanedFollowUps([removed, kept], services).map((f) => f.id),
      ["a"],
    );
  });

  it("leaves hand-set, closed and unknown-service follow-ups alone", () => {
    const manual = followUp({ id: "m", serviceId: "valet", ruleId: null, source: "manual" });
    const closed = followUp({
      id: "c",
      serviceId: "valet",
      ruleId: "r_valet",
      status: "dismissed",
    });
    const done = followUp({ id: "d", serviceId: "valet", ruleId: "r_valet", status: "completed" });
    // A service not in the list (another location's, or not loaded): can't tell.
    const elsewhere = followUp({ id: "x", serviceId: "unloaded", ruleId: "r_gone" });
    assert.deepEqual(orphanedFollowUps([manual, closed, done, elsewhere], services), []);
  });

  it("says nothing until both lists are loaded", () => {
    const removed = followUp({ serviceId: "valet", ruleId: "r_valet" });
    assert.deepEqual(orphanedFollowUps([removed], undefined), []);
    assert.deepEqual(orphanedFollowUps([removed], []), []);
    assert.deepEqual(orphanedFollowUps(undefined, services), []);
  });

  it("still judges an archived service by its rules", () => {
    const archived = [{ id: "valet", active: false, followUps: [] }];
    const removed = followUp({ serviceId: "valet", ruleId: "r_valet", status: "sent" });
    assert.equal(orphanedFollowUps([removed], archived).length, 1);
  });

  it("does not treat a service that has not loaded its rule list as all rules deleted", () => {
    const kept = followUp({ id: "b", serviceId: "coating", ruleId: "r_ceramic" });
    assert.deepEqual(orphanedFollowUps([kept], [{ id: "coating" }] as never), []);
    assert.doesNotThrow(() =>
      orphanedFollowUps([kept], [{ id: "coating", followUps: null }] as never),
    );
  });
});

describe("followUpNames", () => {
  const who = (firstName: string, lastName: string | null = null) =>
    followUp({
      customer: { id: firstName, firstName, lastName, email: null, phone: null },
    });

  it("lists each client once, with an 'and N more' tail", () => {
    assert.equal(followUpNames([who("Dermetree")]), "Dermetree");
    assert.equal(followUpNames([who("Dermetree"), who("David", "Dbx")]), "Dermetree and David Dbx");
    assert.equal(
      followUpNames([who("A"), who("B"), who("A"), who("C"), who("D"), who("E")]),
      "A, B, C and 2 more",
    );
    assert.equal(followUpNames([followUp({ customer: null })]), "Client");
    assert.equal(followUpNames([]), "");
  });
});

describe("dismissEach", () => {
  it("reports which stopped and which failed, counting already-closed as stopped", async () => {
    const out = await dismissEach(
      ["a", "b", "c"],
      async (id) => {
        if (id === "b") throw new Error("network");
        if (id === "c") throw new Error("409");
      },
      (err) => err instanceof Error && err.message === "409",
    );
    assert.deepEqual(out.stopped, ["a", "c"]);
    assert.deepEqual(
      out.failed.map((f) => f.item),
      ["b"],
    );
  });

  it("runs a few at a time and still reports every item once, in order", async () => {
    let running = 0;
    let peak = 0;
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const out = await dismissEach(
      ids,
      async (id) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, id === "a" ? 15 : 2));
        running -= 1;
        if (id === "e") throw new Error("down");
      },
      undefined,
      3,
    );
    assert.equal(peak, 3);
    assert.deepEqual(out.stopped, ["a", "b", "c", "d", "f", "g"]);
    assert.deepEqual(
      out.failed.map((f) => f.item),
      ["e"],
    );
  });

  it("does nothing for an empty list", async () => {
    const out = await dismissEach([], async () => {
      throw new Error("never");
    });
    assert.deepEqual(out, { stopped: [], failed: [] });
  });
});

describe("followUpIntervalMonths / clientReminderSummary", () => {
  it("reads the interval back from last done and due", () => {
    const valet = followUp({
      title: "Full valet",
      lastDoneAt: "2026-09-16T12:00:00.000Z",
      dueAt: "2026-11-16T12:00:00.000Z",
    });
    assert.equal(followUpIntervalMonths(valet), 2);
    assert.equal(clientReminderSummary(valet), "Full valet every 2 months");
    assert.equal(
      clientReminderSummary(
        followUp({
          title: "Top-up",
          lastDoneAt: "2024-09-13T12:00:00.000Z",
          dueAt: "2026-09-13T12:00:00.000Z",
        }),
      ),
      "Top-up every 2 years",
    );
  });

  it("follows the month-end clamp the API uses", () => {
    assert.equal(
      followUpIntervalMonths({
        lastDoneAt: "2026-08-31T12:00:00.000Z",
        dueAt: "2026-10-31T12:00:00.000Z",
      }),
      2,
    );
    assert.equal(
      followUpIntervalMonths({
        lastDoneAt: "2026-12-31T12:00:00.000Z",
        dueAt: "2027-02-28T12:00:00.000Z",
      }),
      2,
    );
  });

  it("falls back to the title when the dates are not whole months apart", () => {
    const odd = followUp({
      title: "Full valet",
      lastDoneAt: "2026-09-16T12:00:00.000Z",
      dueAt: "2026-11-20T12:00:00.000Z",
    });
    assert.equal(followUpIntervalMonths(odd), null);
    assert.equal(clientReminderSummary(odd), "Full valet");
  });
});

describe("openClientReminders", () => {
  it("keeps open hand-set reminders, soonest due first", () => {
    const later = followUp({
      id: "l",
      source: "manual",
      ruleId: null,
      dueAt: "2027-03-01T00:00:00.000Z",
    });
    const sooner = followUp({
      id: "s",
      source: "manual",
      ruleId: null,
      status: "sent",
      dueAt: "2026-12-01T00:00:00.000Z",
    });
    const booked = followUp({ id: "b", source: "manual", ruleId: null, status: "completed" });
    const rule = followUp({ id: "r" });
    assert.deepEqual(
      openClientReminders([later, rule, booked, sooner]).map((f) => f.id),
      ["s", "l"],
    );
  });
});
