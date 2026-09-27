import type { WaitlistEntry, WaitlistPreferences, WaitlistStatus } from "@/lib/api/types";

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  waiting: "Waiting",
  booked: "Booked",
  cancelled: "Removed",
  expired: "Expired",
};

/** ISO weekday numbers as the API stores them (1 = Monday … 7 = Sunday). */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Mondays" },
  { value: 2, short: "Tue", long: "Tuesdays" },
  { value: 3, short: "Wed", long: "Wednesdays" },
  { value: 4, short: "Thu", long: "Thursdays" },
  { value: 5, short: "Fri", long: "Fridays" },
  { value: 6, short: "Sat", long: "Saturdays" },
  { value: 7, short: "Sun", long: "Sundays" },
];

export const TIME_OF_DAY_LABELS: Record<WaitlistPreferences["timeOfDay"], string> = {
  any: "Any time",
  morning: "Mornings",
  afternoon: "Afternoons",
  evening: "Evenings",
};

function shortDate(isoDate: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

/**
 * The preferred window in a phrase: "From 3 Oct", "3–11 Oct", "Saturdays or Sundays",
 * "3–11 Oct · Sat, Sun · mornings". "Whenever" when nothing was stated.
 */
export function describePreferences(p: WaitlistPreferences): string {
  const parts: string[] = [];
  if (p.from && p.to) {
    parts.push(p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)}–${shortDate(p.to)}`);
  } else if (p.from) {
    parts.push(`From ${shortDate(p.from)}`);
  } else if (p.to) {
    parts.push(`By ${shortDate(p.to)}`);
  }
  if (p.days && p.days.length > 0 && p.days.length < 7) {
    const names = WEEKDAYS.filter((d) => p.days!.includes(d.value)).map((d) => d.short);
    parts.push(names.join(", "));
  }
  if (p.timeOfDay !== "any") parts.push(TIME_OF_DAY_LABELS[p.timeOfDay].toLowerCase());
  return parts.length > 0 ? parts.join(" · ") : "Whenever";
}

export function customerName(entry: Pick<WaitlistEntry, "customer">): string {
  const c = entry.customer;
  if (!c) return "Client";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client";
}

/** "Waiting 3 days" / "Waiting since today". */
export function waitingSince(createdAt: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "Added today";
  if (days === 1) return "Waiting 1 day";
  if (days < 7) return `Waiting ${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "Waiting 1 week" : `Waiting ${weeks} weeks`;
}

/**
 * The day to open the booking form on for an entry: the start of their window when it
 * is still ahead, otherwise today. Both as `YYYY-MM-DD`.
 */
export function suggestedBookingDate(p: WaitlistPreferences, todayIso: string): string {
  if (p.from && p.from > todayIso) return p.from;
  return todayIso;
}
