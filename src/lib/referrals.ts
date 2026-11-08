import type { ReferralProgram, ReferralSummary, ReferredBusiness } from "./api/hooks.ts";
import type { Tone } from "./client-profile.ts";
import { formatMoney } from "./format.ts";

/**
 * The short link we share: `{origin}/join/{code}`. The origin comes from the API's
 * share URL so staging and production each point at their own portal.
 */
export function referralLink(sharePath: string, code: string, fallbackOrigin = ""): string {
  let origin = fallbackOrigin;
  try {
    origin = new URL(sharePath).origin;
  } catch {
    // Relative share path: stay on this portal.
  }
  return `${origin.replace(/\/$/, "")}/join/${code}`;
}

/** The link as shown in the field, without the protocol, split so the code can be bold. */
export function referralLinkParts(link: string): { prefix: string; code: string } {
  const bare = link.replace(/^https?:\/\//i, "");
  const cut = bare.lastIndexOf("/") + 1;
  return { prefix: bare.slice(0, cut), code: bare.slice(cut) };
}

export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 16;

/** What the code field sends and previews: spaces and hyphens dropped, upper case. */
export function compactCode(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

/**
 * Shape check while typing, matching the API's. Whether a code is allowed or free is the
 * API's call (the word screen lives there so it can't be skipped).
 */
export function codeShapeProblem(raw: string): string | null {
  const code = compactCode(raw);
  if (!code) return null;
  if (!/^[A-Z0-9]+$/.test(code)) return "Use letters and numbers only.";
  if (code.length < CODE_MIN_LENGTH) return `Use at least ${CODE_MIN_LENGTH} characters.`;
  if (code.length > CODE_MAX_LENGTH) return `Use ${CODE_MAX_LENGTH} characters or fewer.`;
  if (!/[A-Z]/.test(code)) return "Include at least one letter.";
  return null;
}

/** Message for a `code` field error from PUT …/referral/code. */
export function codeErrorMessage(fieldCode: string | undefined): string {
  switch (fieldCode) {
    case "INVALID":
      return `Use ${CODE_MIN_LENGTH} to ${CODE_MAX_LENGTH} letters or numbers, with at least one letter.`;
    case "NOT_ALLOWED":
      return "That code isn't allowed. Choose something without explicit or offensive words.";
    case "RESERVED":
      return "That code is reserved. Choose something else.";
    case "TAKEN":
      return "Another business has that code. Try a different one.";
    case "LIMIT_REACHED":
      return "You've used all your code changes. You can still go back to a code you've had before.";
    default:
      return "Couldn't change your code. Please try again.";
  }
}

export function changesLeftLine(left: number): string {
  if (left <= 0) return "You can only go back to a code you've had before.";
  return left === 1 ? "You can choose 1 more new code." : `You can choose ${left} more new codes.`;
}

export function shareMessage(link: string, trialDays: number): string {
  return `I use RECAVO for my bookings and payments. Try it free for ${trialDays} days with my link: ${link}`;
}

export const SHARE_SUBJECT = "Try RECAVO for your bookings";

export function shareUrls(link: string, trialDays: number) {
  const text = encodeURIComponent(shareMessage(link, trialDays));
  return {
    whatsapp: `https://wa.me/?text=${text}`,
    email: `mailto:?subject=${encodeURIComponent(SHARE_SUBJECT)}&body=${text}`,
    sms: `sms:?&body=${text}`,
  };
}

const TRADE_LABELS: Record<string, string> = {
  car_detailing: "Automotive",
  personal_training: "Personal training",
};

export function tradeLabel(key: string | null): string {
  if (!key) return "Business";
  return TRADE_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "16 Oct", or "16 Oct 2025" when it isn't this year. */
export function shortDate(iso: string, timeZone: string, now: Date): string {
  const d = new Date(iso);
  const year = (x: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(x);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(year(d) === year(now) ? {} : { year: "numeric" }),
  }).format(d);
}

/** Whole days left until `iso`, never negative. */
export function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

export type StatusView = { label: string; tone: Tone; line: string; faded: boolean };

export function statusView(row: ReferredBusiness, timeZone: string, now: Date): StatusView {
  const date = (iso: string) => shortDate(iso, timeZone, now);
  switch (row.status) {
    case "trial": {
      const days = row.trialEndsAt ? daysUntil(row.trialEndsAt, now) : null;
      const line = days === null ? "Setting up" : days === 1 ? "1 day left" : `${days} days left`;
      return { label: "On free trial", tone: "blue", line, faded: false };
    }
    case "paying": {
      const applied = row.reward?.status === "applied";
      const line = row.firstPaidAt
        ? applied
          ? `Since ${date(row.firstPaidAt)}`
          : `First invoice paid ${date(row.firstPaidAt)}`
        : "Paying";
      return { label: "Paying", tone: "green", line, faded: false };
    }
    case "not_converted":
      return {
        label: "Didn't sign up",
        tone: "grey",
        line: row.endedAt ? `Trial ended ${date(row.endedAt)}` : "Trial ended",
        faded: true,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "grey",
        line: row.endedAt ? `Cancelled ${date(row.endedAt)}` : "Cancelled",
        faded: false,
      };
  }
}

export type RewardView = { main: string; sub: string | null; tone: "muted" | "amber" | "ok" };

export function rewardView(row: ReferredBusiness, timeZone: string, now: Date): RewardView | null {
  const r = row.reward;
  if (!r) return null;
  const date = (iso: string) => shortDate(iso, timeZone, now);
  switch (r.status) {
    case "waiting":
      return { main: "Waiting", sub: "When they pay", tone: "muted" };
    case "pending": {
      const sub = !r.appliesAt
        ? "On its way"
        : r.appliesTo === "renewal"
          ? `Renewal moves to ${date(r.appliesAt)}`
          : `Off your ${date(r.appliesAt)} invoice`;
      return { main: "1 month free", sub, tone: "amber" };
    }
    case "applied": {
      const parts = [
        r.appliedAt ? `Applied ${date(r.appliedAt)}` : "Applied",
        r.amountMinor !== null && r.currency
          ? formatMoney(r.amountMinor, r.currency, { compact: true })
          : null,
      ].filter(Boolean);
      return { main: "1 month free", sub: parts.join(" · "), tone: "ok" };
    }
    case "partner":
      return { main: "Partner discount", sub: "They get the discount", tone: "muted" };
    case "none":
      return {
        main: "No reward",
        sub: row.status === "cancelled" ? "Cancelled before their first invoice" : null,
        tone: "muted",
      };
  }
}

/** Screen-reader sentence for a row, e.g. "Shine, automotive, signed up 2 October, paying, …". */
export function rowLabel(row: ReferredBusiness, timeZone: string, now: Date): string {
  const status = statusView(row, timeZone, now);
  const reward = rewardView(row, timeZone, now);
  const signed = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(new Date(row.signedUpAt));
  return [
    row.name,
    tradeLabel(row.industryTemplateKey).toLowerCase(),
    `signed up ${signed}`,
    status.label.toLowerCase(),
    status.line.toLowerCase(),
    reward ? [reward.main, reward.sub].filter(Boolean).join(" ").toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The progress numbers, from the API summary or, on APIs that predate it, from the old
 * counts (no money, no dates).
 */
export function progressOf(program: ReferralProgram): ReferralSummary {
  if (program.summary) return program.summary;
  const s = program.stats;
  return {
    signedUpCount: s.attributedCount,
    onTrialCount: Math.max(0, s.attributedCount - s.convertedCount),
    payingCount: s.convertedCount,
    pendingRewardCount: s.pendingRewardCount,
    freeMonthsEarned: s.rewardedCount,
    savedMinor: null,
    currency: null,
    nextReward: null,
  };
}

export function earnedTile(
  summary: ReferralSummary,
  timeZone: string,
  now: Date,
): { value: string; sub: string; short: string } {
  const months = summary.freeMonthsEarned;
  const saved =
    summary.savedMinor !== null && summary.currency && months > 0
      ? formatMoney(summary.savedMinor, summary.currency, { compact: true })
      : null;
  const value = saved ? `${months} · ${saved} saved` : String(months);
  const next = summary.nextReward;
  let sub = "Share your link to earn more";
  let short = "Share your link to earn one";
  if (next) {
    const longDate = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(next.at));
    sub =
      next.appliesTo === "renewal"
        ? `Your renewal moves to ${longDate}`
        : `Next one comes off your ${shortDate(next.at, timeZone, now)} invoice`;
    short =
      next.appliesTo === "renewal"
        ? `Renewal moves to ${longDate}`
        : `Next one comes off ${shortDate(next.at, timeZone, now)}`;
  } else if (summary.pendingRewardCount > 0) {
    sub = short = onTheWay(summary.pendingRewardCount);
  }
  return { value, sub, short };
}

export function payingSub(summary: ReferralSummary): string {
  if (summary.pendingRewardCount > 0) return onTheWay(summary.pendingRewardCount);
  return summary.payingCount > 0 ? "All rewards applied" : "None yet";
}

function onTheWay(n: number): string {
  return n === 1 ? "1 reward on its way" : `${n} rewards on their way`;
}
