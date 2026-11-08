import type { Location } from "@/lib/api/types";
import { hm, todayState } from "./locations.ts";
import type { TodayState } from "./locations.ts";
import { addDaysIso, localDay, wallToUtc } from "./working-days.ts";

/** A stretch of time a location is shut. Dates and minutes are local to the location. */
export type LocationClosure = {
  id: string;
  businessId: string;
  locationId: string;
  startsOn: string;
  endsOn: string;
  /** Both null for whole days. */
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  source: "manual" | "bank_holiday";
  version: number;
};

export type JobsInTheWay = "rebook" | "keep" | "cancel";

export type BookingInTheWay = {
  bookingId: string;
  start: string;
  allDay: boolean;
  serviceName: string;
  clientName: string | null;
  recordLabel: string | null;
};

export const CLOSURE_REASON_MAX = 60;

/** How far ahead an upcoming closure replaces today's hours on a location card. */
const SOON_DAYS = 14;

/** The closure as exact instants, in the location's zone. */
export function closureInterval(
  c: Pick<LocationClosure, "startsOn" | "endsOn" | "startMinute" | "endMinute">,
  timeZone: string,
): { start: Date; end: Date } {
  if (c.startMinute === null || c.endMinute === null) {
    return {
      start: wallToUtc(c.startsOn, 0, timeZone),
      end: wallToUtc(addDaysIso(c.endsOn, 1), 0, timeZone),
    };
  }
  return {
    start: wallToUtc(c.startsOn, c.startMinute, timeZone),
    end: wallToUtc(c.endsOn, c.endMinute, timeZone),
  };
}

/** "22 Dec" (a `YYYY-MM-DD`, read as that calendar day). */
export function dayText(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/** "22 Dec", "22 Dec to 2 Jan", "22 Dec, 12:00 to 14:00" or "22 Dec 12:00 to 23 Dec 09:00". */
export function closureDatesText(
  c: Pick<LocationClosure, "startsOn" | "endsOn" | "startMinute" | "endMinute">,
): string {
  if (c.startMinute === null || c.endMinute === null) {
    return c.startsOn === c.endsOn
      ? dayText(c.startsOn)
      : `${dayText(c.startsOn)} to ${dayText(c.endsOn)}`;
  }
  if (c.startsOn === c.endsOn) {
    return `${dayText(c.startsOn)}, ${hm(c.startMinute)} to ${hm(c.endMinute)}`;
  }
  return `${dayText(c.startsOn)} ${hm(c.startMinute)} to ${dayText(c.endsOn)} ${hm(c.endMinute)}`;
}

/** "Closed for Christmas", or "Closed" without a reason. */
export function closedLabel(c: Pick<LocationClosure, "reason">): string {
  return c.reason ? `Closed for ${c.reason}` : "Closed";
}

/** Not over yet, soonest first. */
export function upcomingClosures(
  closures: readonly LocationClosure[],
  location: Pick<Location, "id" | "timezone">,
  now: Date = new Date(),
): LocationClosure[] {
  return closures
    .filter((c) => c.locationId === location.id && closureInterval(c, location.timezone).end > now)
    .sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) || (a.startMinute ?? -1) - (b.startMinute ?? -1),
    );
}

/**
 * Today's pill with closures folded in: shut all day ("Closed for Christmas"), shut
 * right now for part of the day ("Closed until 14:00"), or open with a closure coming
 * up soon on the line under ("Closure on 22 Dec").
 */
export function todayWithClosures(
  location: Pick<Location, "id" | "openingHours" | "timezone">,
  closures: readonly LocationClosure[],
  now: Date = new Date(),
): TodayState {
  const base = todayState(location, now);
  const today = localDay(now.toISOString(), location.timezone);
  const ahead = upcomingClosures(closures, location, now);

  const wholeDay = ahead.find(
    (c) => c.startMinute === null && c.startsOn <= today && today <= c.endsOn,
  );
  if (wholeDay) {
    return {
      tone: "grey",
      pill: wholeDay.reason ? closedLabel(wholeDay) : "Closed today",
      line:
        wholeDay.endsOn === today
          ? "Closed all day"
          : `Closed until ${dayText(addDaysIso(wholeDay.endsOn, 1))}`,
      open: false,
    };
  }

  const partNow = ahead.find((c) => {
    if (c.startMinute === null) return false;
    const { start, end } = closureInterval(c, location.timezone);
    return start <= now && now < end;
  });
  if (partNow) {
    const until = closureInterval(partNow, location.timezone).end;
    const sameDay = localDay(until.toISOString(), location.timezone) === today;
    return {
      tone: "grey",
      pill: sameDay ? `Closed until ${hm(partNow.endMinute!)}` : closedLabel(partNow),
      line: closureDatesText(partNow),
      open: false,
    };
  }

  const soon = ahead.find((c) => c.startsOn <= addDaysIso(today, SOON_DAYS));
  if (soon) {
    return {
      ...base,
      line: soon.startsOn === today ? `Closed later today` : `Closure on ${dayText(soon.startsOn)}`,
    };
  }
  return base;
}

export type ClosureShade = { startMin: number; endMin: number; label: string };

function minutesInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * Where each closure falls on each day in view, in minutes of that day in the
 * calendar's zone, for the striped "Closed" bands on the day and week grids.
 */
export function closureShades(
  closures: readonly LocationClosure[],
  locationZone: string,
  days: readonly string[],
  calendarZone: string,
): Map<string, ClosureShade[]> {
  const out = new Map<string, ClosureShade[]>();
  for (const c of closures) {
    const span = closureInterval(c, locationZone);
    for (const day of days) {
      const dayStart = wallToUtc(day, 0, calendarZone);
      const dayEnd = wallToUtc(addDaysIso(day, 1), 0, calendarZone);
      if (span.end <= dayStart || span.start >= dayEnd) continue;
      const startMin = span.start <= dayStart ? 0 : minutesInZone(span.start, calendarZone);
      const endMin = span.end >= dayEnd ? 24 * 60 : minutesInZone(span.end, calendarZone);
      if (endMin <= startMin) continue;
      const list = out.get(day) ?? [];
      list.push({ startMin, endMin, label: c.reason ? `Closed: ${c.reason}` : "Closed" });
      out.set(day, list);
    }
  }
  return out;
}

/** Toast after adding: "Closed 22 Dec to 2 Jan · 3 clients asked to rebook". */
export function closureAddedText(
  c: Pick<LocationClosure, "startsOn" | "endsOn" | "startMinute" | "endMinute">,
  outcome: { asked: number; cancelled: number },
): string {
  const head = `Closed ${closureDatesText(c)}`;
  if (outcome.asked > 0) {
    return `${head} · ${outcome.asked} ${outcome.asked === 1 ? "client" : "clients"} asked to rebook`;
  }
  if (outcome.cancelled > 0) {
    return `${head} · ${outcome.cancelled} cancelled`;
  }
  return head;
}
