import type { ServiceFollowUp, ServiceFollowUpRule, ServiceFollowUpStatus } from "@/lib/api/types";

/** Interval presets offered on the service form; "custom" opens a months field. */
export const FOLLOW_UP_INTERVAL_PRESETS: ReadonlyArray<{ months: number; label: string }> = [
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 18, label: "18 months" },
  { months: 24, label: "2 years" },
  { months: 36, label: "3 years" },
];

export const FOLLOW_UP_DEFAULT_LEAD_DAYS = 14;
export const FOLLOW_UP_MIN_INTERVAL_MONTHS = 1;
export const FOLLOW_UP_MAX_INTERVAL_MONTHS = 120;
export const FOLLOW_UP_MAX_LEAD_DAYS = 365;
export const FOLLOW_UP_MAX_LABEL_LENGTH = 80;

/** "every 6 months", "every year", "every 18 months", "every 2 years". */
export function followUpIntervalLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "every year" : `every ${years} years`;
  }
  return months === 1 ? "every month" : `every ${months} months`;
}

/** One rule's summary: "Ceramic top-up every 2 years" (or "Top-up …" without a label). */
export function followUpRuleSummary(
  rule: Pick<ServiceFollowUpRule, "intervalMonths" | "label">,
): string {
  const what = rule.label?.trim() || "Top-up";
  return `${what} ${followUpIntervalLabel(rule.intervalMonths)}`;
}

/** The hint on a service card: every rule, soonest first — "Valet every year · Top-up every 2 years". */
export function followUpRulesSummary(
  rules: readonly Pick<ServiceFollowUpRule, "intervalMonths" | "label">[],
): string {
  return rules
    .slice()
    .sort((a, b) => a.intervalMonths - b.intervalMonths)
    .map(followUpRuleSummary)
    .join(" · ");
}

/** The most reminders one service can carry; mirrors the API. */
export const FOLLOW_UP_MAX_RULES = 5;

/**
 * Form state for one reminder in the editor; strings so partially typed numbers
 * survive. `id` is the saved rule's id (null for one added this session) so the API
 * keeps its scheduled follow-ups; `key` is only for React.
 */
export type FollowUpRuleDraft = {
  key: string;
  id: string | null;
  /** A preset's months, or "custom". */
  preset: string;
  customMonths: string;
  leadDays: string;
  label: string;
};

let draftSeq = 0;
function nextKey(): string {
  draftSeq += 1;
  return `fu-draft-${draftSeq}`;
}

export function draftFromRule(rule: ServiceFollowUpRule): FollowUpRuleDraft {
  const preset = FOLLOW_UP_INTERVAL_PRESETS.find((p) => p.months === rule.intervalMonths);
  return {
    key: rule.id,
    id: rule.id,
    preset: preset ? String(preset.months) : "custom",
    customMonths: preset ? "" : String(rule.intervalMonths),
    leadDays: String(rule.leadDays),
    label: rule.label ?? "",
  };
}

export function draftsFromRules(
  rules: readonly ServiceFollowUpRule[] | null | undefined,
): FollowUpRuleDraft[] {
  return (rules ?? []).map(draftFromRule);
}

/**
 * A blank reminder to add to the list. Its interval is the first preset not already
 * used, so "Add another" after a 2-year top-up offers something other than 2 years
 * (6 months first: a maintenance wash is the usual second reminder).
 */
export function newFollowUpDraft(existing: readonly FollowUpRuleDraft[]): FollowUpRuleDraft {
  const taken = new Set(existing.map((d) => draftMonths(d)));
  const order = existing.length === 0 ? [24, 12, 6, 18, 36] : [12, 6, 18, 24, 36];
  const months = order.find((m) => !taken.has(m));
  return {
    key: nextKey(),
    id: null,
    preset: months ? String(months) : "custom",
    customMonths: "",
    leadDays: String(FOLLOW_UP_DEFAULT_LEAD_DAYS),
    label: "",
  };
}

function draftMonths(draft: FollowUpRuleDraft): number {
  return draft.preset === "custom" ? Number(draft.customMonths.trim()) : Number(draft.preset);
}

/** What the API accepts for one rule: an existing id to keep, or none for a new one. */
export type FollowUpRuleInput = {
  id?: string;
  intervalMonths: number;
  leadDays: number;
  label: string | null;
};

export type FollowUpRuleField = "intervalMonths" | "leadDays" | "label";

export type FollowUpRulesDraftResult =
  | { ok: true; rules: FollowUpRuleInput[] }
  | { ok: false; index: number; field: FollowUpRuleField; message: string };

/**
 * Validates every draft into the API payload (an empty list switches reminders off).
 * The first problem is reported with the reminder it belongs to; two reminders with the
 * same interval are refused because they would be the same message twice.
 */
export function rulesFromDrafts(drafts: readonly FollowUpRuleDraft[]): FollowUpRulesDraftResult {
  const rules: FollowUpRuleInput[] = [];
  const seen = new Map<number, number>();
  for (const [index, draft] of drafts.entries()) {
    const months = draftMonths(draft);
    if (
      !Number.isInteger(months) ||
      months < FOLLOW_UP_MIN_INTERVAL_MONTHS ||
      months > FOLLOW_UP_MAX_INTERVAL_MONTHS
    ) {
      return {
        ok: false,
        index,
        field: "intervalMonths",
        message: `Enter a whole number of months between ${FOLLOW_UP_MIN_INTERVAL_MONTHS} and ${FOLLOW_UP_MAX_INTERVAL_MONTHS}.`,
      };
    }
    const first = seen.get(months);
    if (first !== undefined) {
      return {
        ok: false,
        index,
        field: "intervalMonths",
        message: `Reminder ${first + 1} already uses ${followUpIntervalLabel(months).replace(/^every /, "")}. Pick a different interval or remove one.`,
      };
    }
    seen.set(months, index);
    const lead =
      draft.leadDays.trim() === "" ? FOLLOW_UP_DEFAULT_LEAD_DAYS : Number(draft.leadDays);
    if (!Number.isInteger(lead) || lead < 0 || lead > FOLLOW_UP_MAX_LEAD_DAYS) {
      return {
        ok: false,
        index,
        field: "leadDays",
        message: `Enter a whole number of days between 0 and ${FOLLOW_UP_MAX_LEAD_DAYS}.`,
      };
    }
    const label = draft.label.trim();
    if (label.length > FOLLOW_UP_MAX_LABEL_LENGTH) {
      return {
        ok: false,
        index,
        field: "label",
        message: `Keep the label under ${FOLLOW_UP_MAX_LABEL_LENGTH} characters.`,
      };
    }
    rules.push({
      ...(draft.id ? { id: draft.id } : {}),
      intervalMonths: months,
      leadDays: lead,
      label: label || null,
    });
  }
  return { ok: true, rules };
}

/** Where a follow-up sits relative to today, for grouping and badges. */
export type FollowUpBucket = "overdue" | "due_soon" | "upcoming" | "closed";

const DAY_MS = 86_400_000;

/** Open follow-ups: overdue once `dueAt` has passed, due soon once the reminder moment has. */
export function followUpBucket(followUp: ServiceFollowUp, now: Date = new Date()): FollowUpBucket {
  if (followUp.status !== "scheduled" && followUp.status !== "sent") return "closed";
  const due = new Date(followUp.dueAt).getTime();
  if (due < now.getTime()) return "overdue";
  const remind = new Date(followUp.remindAt).getTime();
  const snoozed = followUp.snoozedUntil ? new Date(followUp.snoozedUntil).getTime() : 0;
  if (Math.max(remind, snoozed) <= now.getTime() || due - now.getTime() <= 30 * DAY_MS) {
    return "due_soon";
  }
  return "upcoming";
}

export const FOLLOW_UP_BUCKET_LABELS: Record<FollowUpBucket, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  closed: "Closed",
};

export const FOLLOW_UP_STATUS_LABELS: Record<ServiceFollowUpStatus, string> = {
  scheduled: "Scheduled",
  sent: "Reminder sent",
  dismissed: "Dismissed",
  completed: "Booked again",
  cancelled: "Cancelled",
};

/** Whether the follow-up is still live (reminder pending or sent, not closed). */
export function isOpenFollowUp(followUp: Pick<ServiceFollowUp, "status">): boolean {
  return followUp.status === "scheduled" || followUp.status === "sent";
}

/** "in 3 weeks", "in 2 years", "3 days ago" — coarse, for list rows. */
export function relativeDueLabel(dueAt: string, now: Date = new Date()): string {
  const diff = new Date(dueAt).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.round(abs / DAY_MS);
  let span: string;
  if (days < 1) span = "today";
  else if (days < 14) span = `${days} ${days === 1 ? "day" : "days"}`;
  else if (days < 60) span = `${Math.round(days / 7)} weeks`;
  else if (days < 365) span = `${Math.round(days / 30)} months`;
  else {
    const years = Math.round((days / 365) * 10) / 10;
    span = `${years % 1 === 0 ? years.toFixed(0) : years.toFixed(1)} ${years === 1 ? "year" : "years"}`;
  }
  if (span === "today") return "due today";
  return diff < 0 ? `${span} overdue` : `in ${span}`;
}

/** ISO instant one calendar month from now (Snooze 1 month). */
export function oneMonthFrom(now: Date = new Date()): string {
  const out = new Date(now.getTime());
  out.setMonth(out.getMonth() + 1);
  return out.toISOString();
}
