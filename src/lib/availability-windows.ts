import { minutesToTime } from "./format.ts";

/** ISO weekday labels: index 0 = Monday … 6 = Sunday (`dayOfWeek` 1–7). */
export const ISO_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type AvailabilityWindow = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

/**
 * ISO weekday 1 = Monday … 7 = Sunday.
 * Do not use `Date#getDay()` as a `dayOfWeek` value — that is 0 = Sunday.
 */
export function isoDayOfWeek(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

/** ISO weekday for a `YYYY-MM-DD` calendar date in local time. */
export function isoDayOfWeekFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return isoDayOfWeek(new Date(year, (month ?? 1) - 1, day ?? 1));
}

export function isValidAvailabilityWindow(window: AvailabilityWindow): boolean {
  return (
    Number.isInteger(window.dayOfWeek) &&
    window.dayOfWeek >= 1 &&
    window.dayOfWeek <= 7 &&
    Number.isInteger(window.startMinute) &&
    Number.isInteger(window.endMinute) &&
    window.startMinute >= 0 &&
    window.endMinute <= 1440 &&
    window.startMinute < window.endMinute
  );
}

/** Empty / missing windows are unrestricted — offered whenever the trainer is free. */
export function sessionOfferedOnDay(
  windows: readonly AvailabilityWindow[] | undefined,
  dayOfWeek: number,
): boolean {
  if (!windows || windows.length === 0) return true;
  return windows.some((window) => window.dayOfWeek === dayOfWeek);
}

export function emptySlotsMessage(
  windows: readonly AvailabilityWindow[] | undefined,
  isoDate: string,
): string {
  const dayOfWeek = isoDayOfWeekFromIsoDate(isoDate);
  if (windows && windows.length > 0 && !sessionOfferedOnDay(windows, dayOfWeek)) {
    return "This session isn't offered on that day.";
  }
  return "No availability on this date. Try another day.";
}

/** A location's opening hours expressed as offer windows (same ISO weekday scheme). */
export function windowsFromOpeningHours(
  openingHours: readonly { dayOfWeek: number; openMinute: number; closeMinute: number }[],
): AvailabilityWindow[] {
  return openingHours
    .map((h) => ({ dayOfWeek: h.dayOfWeek, startMinute: h.openMinute, endMinute: h.closeMinute }))
    .filter(isValidAvailabilityWindow)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
}

export function sameWindows(
  a: readonly AvailabilityWindow[],
  b: readonly AvailabilityWindow[],
): boolean {
  if (a.length !== b.length) return false;
  const key = (w: AvailabilityWindow) => `${w.dayOfWeek}:${w.startMinute}:${w.endMinute}`;
  const sa = [...a].map(key).sort();
  const sb = [...b].map(key).sort();
  return sa.every((k, i) => k === sb[i]);
}

export function formatAvailabilityWindows(
  windows: readonly AvailabilityWindow[] | undefined,
): string {
  if (!windows || windows.length === 0) return "Whenever staff are available";
  return [...windows]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)
    .map((window) => {
      const day = ISO_WEEKDAY_LABELS[window.dayOfWeek - 1] ?? `Day ${window.dayOfWeek}`;
      return `${day} ${minutesToTime(window.startMinute)}–${minutesToTime(window.endMinute)}`;
    })
    .join(", ");
}
