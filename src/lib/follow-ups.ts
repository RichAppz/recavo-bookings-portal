import type {
  CatalogueService,
  ServiceFollowUp,
  ServiceFollowUpRule,
  ServiceFollowUpStatus,
} from "@/lib/api/types";

/**
 * Interval presets offered on the service form and the Reminders page; "custom" opens
 * a months field. Short ones for upkeep (a maintenance wash every 2 months), long
 * ones for treatments that wear off.
 */
export const FOLLOW_UP_INTERVAL_PRESETS: ReadonlyArray<{ months: number; label: string }> = [
  { months: 1, label: "1 month" },
  { months: 2, label: "2 months" },
  { months: 3, label: "3 months" },
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

/** One reminder rule with the service it hangs off — a row on the Reminders page. */
export type ReminderRuleRow = {
  serviceId: string;
  serviceName: string;
  serviceActive: boolean;
  rule: ServiceFollowUpRule;
};

/**
 * Every reminder rule across the catalogue, for the Reminders page: active services
 * first, A–Z by name, and within a service soonest interval first. Services without
 * rules contribute nothing.
 */
export function reminderRuleRows(
  services: readonly Pick<CatalogueService, "id" | "name" | "active" | "followUps">[],
): ReminderRuleRow[] {
  return services
    .slice()
    .sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1))
    .flatMap((s) =>
      s.followUps
        .slice()
        .sort((a, b) => a.intervalMonths - b.intervalMonths)
        .map((rule) => ({
          serviceId: s.id,
          serviceName: s.name,
          serviceActive: s.active,
          rule,
        })),
    );
}

/**
 * The `followUps` payload for a service after one rule is saved from the Reminders
 * page: the edited rule (matched by id) replaced in place, or a new one appended.
 * The other rules are sent back untouched, ids included, so the API keeps the
 * follow-ups they have already scheduled.
 */
export function rulesWithSaved(
  existing: readonly ServiceFollowUpRule[],
  saved: FollowUpRuleInput,
): FollowUpRuleInput[] {
  const keep = existing.map((r): FollowUpRuleInput => ({
    id: r.id,
    intervalMonths: r.intervalMonths,
    leadDays: r.leadDays,
    label: r.label ?? null,
  }));
  if (saved.id) {
    const index = keep.findIndex((r) => r.id === saved.id);
    if (index >= 0) {
      keep[index] = saved;
      return keep;
    }
  }
  return [...keep, saved];
}

/** The `followUps` payload with one rule removed; an empty list switches reminders off. */
export function rulesWithout(
  existing: readonly ServiceFollowUpRule[],
  ruleId: string,
): FollowUpRuleInput[] {
  return existing
    .filter((r) => r.id !== ruleId)
    .map((r) => ({
      id: r.id,
      intervalMonths: r.intervalMonths,
      leadDays: r.leadDays,
      label: r.label ?? null,
    }));
}

/** "Remind 14 days before" / "Remind on the day". */
export function leadDaysLabel(leadDays: number): string {
  if (leadDays === 0) return "Remind on the day";
  return `Remind ${leadDays} ${leadDays === 1 ? "day" : "days"} before`;
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

/* ---------------- Reminders whose rule has gone ---------------- */

type RuleLink = Pick<ServiceFollowUp, "status" | "source" | "serviceId" | "ruleId">;

/**
 * The open follow-ups one rule scheduled — what removing that rule should stop.
 * Hand-set ones (no rule) never match.
 */
export function followUpsForRule<T extends RuleLink>(
  followUps: readonly T[] | undefined,
  serviceId: string,
  ruleId: string,
): T[] {
  return (followUps ?? []).filter(
    (f) => isOpenFollowUp(f) && f.serviceId === serviceId && f.ruleId === ruleId,
  );
}

/**
 * Open follow-ups scheduled by a rule that is no longer on its service — left behind
 * when the reminder was removed, and still due to go out. Only judged when the
 * service itself is in `services`: one missing from the list (another location's,
 * not loaded yet) says nothing about its rules, so it is never called orphaned.
 */
export function orphanedFollowUps<T extends RuleLink>(
  followUps: readonly T[] | undefined,
  services: readonly Pick<CatalogueService, "id" | "followUps">[] | undefined,
): T[] {
  if (!followUps?.length || !services?.length) return [];
  const rulesByService = new Map(
    services.map((s) => [s.id, new Set(s.followUps.map((r) => r.id))]),
  );
  return followUps.filter((f) => {
    if (!isOpenFollowUp(f) || f.source !== "rule" || !f.ruleId) return false;
    const rules = rulesByService.get(f.serviceId);
    return rules !== undefined && !rules.has(f.ruleId);
  });
}

/** "Dermetree, David Dbx and 1 more" — who a batch of follow-ups is for, each name once. */
export function followUpNames(
  followUps: readonly Pick<ServiceFollowUp, "customer">[],
  max = 3,
): string {
  const names: string[] = [];
  for (const f of followUps) {
    const c = f.customer;
    const name = c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client" : "Client";
    if (!names.includes(name)) names.push(name);
  }
  if (names.length <= max) {
    return names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

export type DismissOutcome<T> = { stopped: T[]; failed: { item: T; error: unknown }[] };

/**
 * Dismisses each follow-up in turn and reports which stopped and which did not, so a
 * partial failure can be shown and retried rather than reported as done. One that
 * is already closed (`alreadyClosed`, the API's 409) counts as stopped — it will not
 * go out either way.
 */
export async function dismissEach<T>(
  items: readonly T[],
  dismiss: (item: T) => Promise<unknown>,
  alreadyClosed: (error: unknown) => boolean = () => false,
): Promise<DismissOutcome<T>> {
  const out: DismissOutcome<T> = { stopped: [], failed: [] };
  for (const item of items) {
    try {
      await dismiss(item);
      out.stopped.push(item);
    } catch (error) {
      if (alreadyClosed(error)) out.stopped.push(item);
      else out.failed.push({ item, error });
    }
  }
  return out;
}

/* ---------------- Reminders set for one client ---------------- */

/**
 * The interval a follow-up was set with, read back from its last-done and due dates
 * (the API does not return it): calendar months in UTC, the same arithmetic that
 * produced `dueAt`. Null when the dates do not line up with a whole number of months.
 */
export function followUpIntervalMonths(
  followUp: Pick<ServiceFollowUp, "lastDoneAt" | "dueAt">,
): number | null {
  const done = new Date(followUp.lastDoneAt);
  const due = new Date(followUp.dueAt);
  if (Number.isNaN(done.getTime()) || Number.isNaN(due.getTime())) return null;
  const guess =
    (due.getUTCFullYear() - done.getUTCFullYear()) * 12 + (due.getUTCMonth() - done.getUTCMonth());
  const dueDay = due.toISOString().slice(0, 10);
  for (const months of [guess, guess - 1, guess + 1]) {
    if (months < FOLLOW_UP_MIN_INTERVAL_MONTHS || months > FOLLOW_UP_MAX_INTERVAL_MONTHS) continue;
    if (addCalendarMonths(done, months).toISOString().slice(0, 10) === dueDay) return months;
  }
  return null;
}

/** "Full valet every 2 months" — or just the title when the interval can't be read back. */
export function clientReminderSummary(
  followUp: Pick<ServiceFollowUp, "title" | "lastDoneAt" | "dueAt">,
): string {
  const months = followUpIntervalMonths(followUp);
  return months ? `${followUp.title} ${followUpIntervalLabel(months)}` : followUp.title;
}

/** Open reminders set by hand for one client, soonest due first. */
export function openClientReminders<T extends Pick<ServiceFollowUp, "status" | "source" | "dueAt">>(
  followUps: readonly T[] | undefined,
): T[] {
  return (followUps ?? [])
    .filter((f) => isOpenFollowUp(f) && f.source === "manual")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
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

/* ---------------- A reminder set by hand for one client ---------------- */

/**
 * Form state for "Remind a client": who, what, when it was last done (a calendar
 * date; blank means today), and the same interval / notice / label fields as a rule.
 */
export type ClientReminderDraft = {
  customerId: string;
  serviceId: string;
  linkedRecordId: string | null;
  /** `YYYY-MM-DD`, or "" for today. */
  lastDone: string;
  preset: string;
  customMonths: string;
  leadDays: string;
  label: string;
};

export type ClientReminderField = "customerId" | "serviceId" | "lastDone" | FollowUpRuleField;

export type ClientReminderResult =
  | {
      ok: true;
      body: {
        customerId: string;
        serviceId: string;
        linkedRecordId: string | null;
        lastDoneAt: string;
        intervalMonths: number;
        leadDays: number;
        label: string | null;
      };
      dueAt: Date;
      remindAt: Date;
    }
  | { ok: false; field: ClientReminderField; message: string };

/**
 * Adds calendar months in UTC, clamping to the month's last day — the API's rule, so
 * the due date shown before saving is the one that comes back.
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/**
 * A calendar date as an instant: midday UTC, so the same day shows everywhere from
 * the Azores to Moscow and the due date lands on the day the business expects.
 */
export function dateAtMidday(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const out = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(out.getTime()) || !out.toISOString().startsWith(day) ? null : out;
}

/** Today as `YYYY-MM-DD` in the given zone (the date input's default). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Validates the form into the `POST …/follow-ups` body, with the due date and reminder
 * moment the API will compute. Blank "last done" means today; a due date already past
 * is refused here (the API would too) with the interval field, since that is what to
 * change.
 */
export function clientReminderFromDraft(
  draft: ClientReminderDraft,
  opts: { timezone: string; now?: Date },
): ClientReminderResult {
  const now = opts.now ?? new Date();
  if (!draft.customerId) {
    return { ok: false, field: "customerId", message: "Pick who this reminder is for." };
  }
  if (!draft.serviceId) {
    return { ok: false, field: "serviceId", message: "Pick what it is for." };
  }
  const day = draft.lastDone.trim() || todayIn(opts.timezone, now);
  const lastDoneAt = dateAtMidday(day);
  if (!lastDoneAt) {
    return { ok: false, field: "lastDone", message: "Enter the date it was last done." };
  }
  if (lastDoneAt.getTime() > now.getTime() + DAY_MS) {
    return { ok: false, field: "lastDone", message: "Last done can't be in the future." };
  }
  const rule = rulesFromDrafts([
    {
      key: "client-reminder",
      id: null,
      preset: draft.preset,
      customMonths: draft.customMonths,
      leadDays: draft.leadDays,
      label: draft.label,
    },
  ]);
  if (!rule.ok) return { ok: false, field: rule.field, message: rule.message };
  const [input] = rule.rules;
  const dueAt = addCalendarMonths(lastDoneAt, input!.intervalMonths);
  const remindAt = new Date(dueAt.getTime() - input!.leadDays * DAY_MS);
  if (dueAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      field: "intervalMonths",
      message: "That would already be due. Pick a longer interval or a later last-done date.",
    };
  }
  return {
    ok: true,
    body: {
      customerId: draft.customerId,
      serviceId: draft.serviceId,
      linkedRecordId: draft.linkedRecordId,
      lastDoneAt: lastDoneAt.toISOString(),
      intervalMonths: input!.intervalMonths,
      leadDays: input!.leadDays,
      label: input!.label,
    },
    dueAt,
    remindAt,
  };
}

/**
 * The open follow-up a client already has for this service (and vehicle, when both
 * say), so the form can say "Lee already has one due 30 Sept 2028" before adding a
 * second.
 */
export function existingOpenReminder<
  T extends Pick<ServiceFollowUp, "status" | "serviceId" | "linkedRecordId" | "dueAt">,
>(followUps: readonly T[] | undefined, serviceId: string, linkedRecordId: string | null): T | null {
  let found: T | null = null;
  for (const f of followUps ?? []) {
    if (!isOpenFollowUp(f) || f.serviceId !== serviceId) continue;
    if (linkedRecordId && f.linkedRecordId && f.linkedRecordId !== linkedRecordId) continue;
    if (!found || new Date(f.dueAt) < new Date(found.dueAt)) found = f;
  }
  return found;
}
