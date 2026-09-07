import type { BusinessConfiguration } from "@/lib/api/types";

export type ReminderRule = NonNullable<BusinessConfiguration["reminders"]>["rules"][number];
export type ReminderChannel = ReminderRule["channel"];
export type ReminderUnit = "minutes" | "hours" | "days";

export const REMINDER_LIMITS = {
  maxRules: 5,
  minMinutes: 5,
  /** 30 days. */
  maxMinutes: 30 * 24 * 60,
} as const;

/** One editable row; `amount` stays a string so the input can be blank mid-edit. */
export type RuleRow = {
  key: string;
  amount: string;
  unit: ReminderUnit;
  channel: ReminderChannel;
};

const UNIT_MINUTES: Record<ReminderUnit, number> = { minutes: 1, hours: 60, days: 1440 };

let seq = 0;
const nextKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Pick the largest unit that divides the offset exactly, so 1440 shows as "1 day". */
export function rowFromRule(rule: ReminderRule): RuleRow {
  const m = rule.minutesBefore;
  const unit: ReminderUnit = m % 1440 === 0 ? "days" : m % 60 === 0 ? "hours" : "minutes";
  return {
    key: nextKey(),
    amount: String(m / UNIT_MINUTES[unit]),
    unit,
    channel: rule.channel,
  };
}

export function rowsFromRules(rules: readonly ReminderRule[] | undefined): RuleRow[] {
  return (rules ?? []).map(rowFromRule);
}

export function newRow(): RuleRow {
  return { key: nextKey(), amount: "2", unit: "hours", channel: "preferred" };
}

/** Minutes for a row, or null when the amount is blank / not a positive whole number. */
export function rowMinutes(row: RuleRow): number | null {
  const n = Number(row.amount.trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n * UNIT_MINUTES[row.unit];
}

export type RowIssue = "INVALID" | "OUT_OF_RANGE" | "DUPLICATE";

/** Per-row problems keyed by row key; empty when the set can be saved. */
export function validateRows(rows: readonly RuleRow[]): Map<string, RowIssue> {
  const issues = new Map<string, RowIssue>();
  const seen = new Set<number>();
  for (const row of rows) {
    const m = rowMinutes(row);
    if (m === null) {
      issues.set(row.key, "INVALID");
      continue;
    }
    if (m < REMINDER_LIMITS.minMinutes || m > REMINDER_LIMITS.maxMinutes) {
      issues.set(row.key, "OUT_OF_RANGE");
      continue;
    }
    if (seen.has(m)) issues.set(row.key, "DUPLICATE");
    seen.add(m);
  }
  return issues;
}

/** API payload; rows are assumed valid. Sorted furthest-out first like the API returns. */
export function rulesFromRows(rows: readonly RuleRow[]): ReminderRule[] {
  return rows
    .map((row) => ({ minutesBefore: rowMinutes(row) ?? 0, channel: row.channel }))
    .sort((a, b) => b.minutesBefore - a.minutesBefore);
}

export function describeOffset(minutesBefore: number): string {
  if (minutesBefore % 1440 === 0) {
    const d = minutesBefore / 1440;
    return `${d} day${d === 1 ? "" : "s"} before`;
  }
  if (minutesBefore % 60 === 0) {
    const h = minutesBefore / 60;
    return `${h} hour${h === 1 ? "" : "s"} before`;
  }
  return `${minutesBefore} min before`;
}

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  preferred: "Client's preference",
  email: "Email",
  sms: "SMS",
};
