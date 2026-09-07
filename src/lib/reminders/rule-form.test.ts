import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeOffset,
  rowFromRule,
  rowMinutes,
  rulesFromRows,
  validateRows,
  type RuleRow,
} from "./rule-form.ts";

const row = (amount: string, unit: RuleRow["unit"], key = amount + unit): RuleRow => ({
  key,
  amount,
  unit,
  channel: "preferred",
});

describe("reminder rule form (RECA-530)", () => {
  it("shows an offset in the largest unit that divides it exactly", () => {
    assert.deepEqual(
      [1440, 120, 90, 30].map((m) => {
        const r = rowFromRule({ minutesBefore: m, channel: "email" });
        return `${r.amount} ${r.unit}`;
      }),
      ["1 days", "2 hours", "90 minutes", "30 minutes"],
    );
  });

  it("converts rows back to minutes and rejects blanks / fractions", () => {
    assert.equal(rowMinutes(row("2", "days")), 2880);
    assert.equal(rowMinutes(row("", "hours")), null);
    assert.equal(rowMinutes(row("1.5", "hours")), null);
    assert.equal(rowMinutes(row("0", "hours")), null);
  });

  it("flags out-of-range and duplicate offsets, in any unit", () => {
    const issues = validateRows([
      row("31", "days", "a"),
      row("2", "minutes", "b"),
      row("1", "days", "c"),
      row("24", "hours", "d"),
      row("x", "hours", "e"),
    ]);
    assert.equal(issues.get("a"), "OUT_OF_RANGE");
    assert.equal(issues.get("b"), "OUT_OF_RANGE");
    assert.equal(issues.get("c"), undefined);
    assert.equal(issues.get("d"), "DUPLICATE");
    assert.equal(issues.get("e"), "INVALID");
  });

  it("builds the API payload sorted furthest-out first", () => {
    assert.deepEqual(
      rulesFromRows([
        { ...row("1", "hours"), channel: "sms" },
        { ...row("1", "days"), channel: "email" },
      ]),
      [
        { minutesBefore: 1440, channel: "email" },
        { minutesBefore: 60, channel: "sms" },
      ],
    );
  });

  it("describes offsets for the summary line", () => {
    assert.equal(describeOffset(1440), "1 day before");
    assert.equal(describeOffset(2880), "2 days before");
    assert.equal(describeOffset(60), "1 hour before");
    assert.equal(describeOffset(45), "45 min before");
  });
});
