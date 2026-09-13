import type { Staff } from "@/lib/api/types";

/** Local weekday (1 = Monday … 7 = Sunday) and minutes past midnight of an instant. */
function localClock(iso: string, timeZone: string): { dayOfWeek: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dayOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday) + 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { dayOfWeek: dayOfWeek || 1, minute: hour * 60 + minute };
}

const clock = (minute: number) =>
  `${`${Math.floor(minute / 60)}`.padStart(2, "0")}:${`${minute % 60}`.padStart(2, "0")}`;

/**
 * Non-blocking heads-up when a staff-set window falls outside the person's working
 * rules (RECA-532). Returns the sentence to show, or null when the window fits — or
 * when we have no rules to judge by, since the server will still take the booking.
 *
 * Both ends are checked against the rules for their own day, so a job that runs
 * 16:00 Monday → 10:00 Tuesday passes if each end sits inside that day's hours.
 */
export function outsideWorkingHours(
  staff: Pick<Staff, "displayName" | "workingRules">,
  window: { start: string; end: string },
  locationId: string | null,
  timeZone: string,
): string | null {
  const rules = staff.workingRules.filter((r) => !r.locationId || r.locationId === locationId);
  if (rules.length === 0) return null;

  const within = (iso: string, inclusiveEnd: boolean) => {
    const { dayOfWeek, minute } = localClock(iso, timeZone);
    return rules.some(
      (r) =>
        r.dayOfWeek === dayOfWeek &&
        r.startMinute <= minute &&
        (inclusiveEnd ? minute <= r.endMinute : minute < r.endMinute),
    );
  };
  const startOk = within(window.start, false);
  const endOk = within(window.end, true);
  if (startOk && endOk) return null;

  const startDay = localClock(window.start, timeZone).dayOfWeek;
  const dayRules = rules
    .filter((r) => r.dayOfWeek === startDay)
    .sort((a, b) => a.startMinute - b.startMinute);
  const usual =
    dayRules.length > 0
      ? dayRules.map((r) => `${clock(r.startMinute)}–${clock(r.endMinute)}`).join(", ")
      : null;
  return usual
    ? `Outside ${staff.displayName}'s usual hours (${usual}). You can still book it.`
    : `${staff.displayName} doesn't usually work that day. You can still book it.`;
}
