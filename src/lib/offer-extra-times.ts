import type { PackageLinkExtraWindow } from "@/lib/api/types";

/**
 * Extra bookable times on an offer link: windows outside the normal schedule that
 * only a client arriving with the link's code can book. One row per window, kept as
 * raw form values so a half-typed time is not rejected mid-keystroke; the API shape
 * (`PackageLinkExtraWindow`) is produced on submit.
 */
export interface ExtraTimeRow {
  /** Local-only key for React lists; never sent. */
  readonly key: string;
  readonly serviceId: string;
  readonly mode: "weekly" | "date";
  /** ISO weekday 1–7 (Monday = 1) when weekly. */
  readonly dayOfWeek: number;
  /** YYYY-MM-DD when on a single date; empty until picked. */
  readonly date: string;
  /** "HH:MM" from a time input. */
  readonly start: string;
  readonly end: string;
}

export const MAX_EXTRA_TIMES = 50;

export const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

let keyCounter = 0;
export function newExtraTimeRow(serviceId: string): ExtraTimeRow {
  keyCounter += 1;
  return {
    key: `row-${Date.now().toString(36)}-${keyCounter}`,
    serviceId,
    mode: "weekly",
    dayOfWeek: 7,
    date: "",
    start: "10:00",
    end: "14:00",
  };
}

/** "HH:MM" → minutes from midnight; null when not a complete time. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** Minutes from midnight → "HH:MM" (1440 reads as "24:00"). */
export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Why a row cannot be saved, in the business's words; null when it can. Mirrors the
 * API's rules so the form refuses the same things the server would.
 */
export function extraTimeRowError(row: ExtraTimeRow): string | null {
  if (row.mode === "date" && !LOCAL_DATE.test(row.date)) return "Pick a date";
  const start = parseClock(row.start);
  const end = parseClock(row.end);
  if (start === null || end === null) return "Enter a start and end time";
  if (end <= start) return "End must be after start";
  return null;
}

/** Errors for the whole list: per row by key, plus one for the cap. */
export function validateExtraTimeRows(rows: readonly ExtraTimeRow[]): {
  byKey: Map<string, string>;
  listError: string | null;
} {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const error = extraTimeRowError(row);
    if (error) byKey.set(row.key, error);
  }
  return {
    byKey,
    listError:
      rows.length > MAX_EXTRA_TIMES ? `Up to ${MAX_EXTRA_TIMES} extra times per link` : null,
  };
}

/** The API shape. Only call once `validateExtraTimeRows` reports nothing. */
export function toExtraWindows(rows: readonly ExtraTimeRow[]): PackageLinkExtraWindow[] {
  return rows.map((row) => ({
    serviceId: row.serviceId,
    date: row.mode === "date" ? row.date : null,
    dayOfWeek: row.mode === "weekly" ? row.dayOfWeek : null,
    startMinute: parseClock(row.start) ?? 0,
    endMinute: parseClock(row.end) ?? 0,
  }));
}

/** Rows for editing an existing link's windows. */
export function fromExtraWindows(windows: readonly PackageLinkExtraWindow[]): ExtraTimeRow[] {
  return windows.map((w) => ({
    ...newExtraTimeRow(w.serviceId),
    mode: w.date ? "date" : "weekly",
    dayOfWeek: w.dayOfWeek ?? 7,
    date: w.date ?? "",
    start: formatClock(w.startMinute),
    end: formatClock(w.endMinute),
  }));
}

/** "Every Sunday 10:00–14:00" / "Sat 25 Oct 17:00–20:00" for summaries. */
export function describeExtraWindow(w: PackageLinkExtraWindow): string {
  const when = w.date
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${w.date}T12:00:00Z`))
    : `Every ${WEEKDAYS.find((d) => d.value === w.dayOfWeek)?.label ?? "day"}`;
  return `${when} ${formatClock(w.startMinute)}–${formatClock(w.endMinute)}`;
}

/** "+1 extra time" / "+3 extra times" for the link list; null when none. */
export function describeExtraTimesCount(
  windows: readonly PackageLinkExtraWindow[] | undefined,
): string | null {
  const n = windows?.length ?? 0;
  if (n === 0) return null;
  return `+${n} extra ${n === 1 ? "time" : "times"}`;
}

/** Whether the link opens extra times for this session (the client-side note). */
export function hasExtraTimesForService(
  windows: readonly PackageLinkExtraWindow[] | undefined,
  serviceId: string | null | undefined,
): boolean {
  return Boolean(serviceId) && (windows ?? []).some((w) => w.serviceId === serviceId);
}
