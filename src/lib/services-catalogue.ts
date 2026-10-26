// Relative so the node test runner (no path aliases) can load it too.
import { formatMoney } from "./format.ts";
import { normaliseCategory } from "./service-categories.ts";

/**
 * Display and filtering rules for the Services catalogue and its form: the
 * business's own word, durations and prices as the list shows them, the "how it's
 * booked" chip, filters, and the checks the form runs before saving.
 */

export type BookingMode = "individual" | "lead_pays_party" | "group";

type ServiceLike = {
  id: string;
  name: string;
  description?: string | null;
  category: string | null;
  durationMinutes: number;
  basePriceMinor: number;
  depositMinor?: number | null;
  currency: string;
  capacityMax: number;
  bookingMode?: BookingMode;
  active: boolean;
  publicVisible: boolean;
  archivedAt?: string | null;
  variants: readonly { name: string; priceMinor?: number | null }[];
};

/**
 * Catalogue noun from the business's terminology: "Session" for PT ("Session type"
 * minus the suffix), "Service" for car detailing.
 */
export function serviceNoun(service: string) {
  const noun = service.replace(/\s+type$/i, "").trim() || "Service";
  const lower = noun.toLowerCase();
  const plural = lower.endsWith("s") ? noun : `${noun}s`;
  return { noun, lower, plural, pluralLower: plural.toLowerCase() };
}

/** "30 min", "1 hr", "1.5 hrs", "1 day", "2 days". */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes >= 1440 && minutes % 720 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes >= 60) {
    const hours = Math.round((minutes / 60) * 100) / 100;
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }
  return `${Math.round(minutes)} min`;
}

export function bookingModeOf(service: Pick<ServiceLike, "bookingMode">): BookingMode {
  return service.bookingMode ?? "individual";
}

export type ModeChip = { label: string; tone: "grey" | "blue" | "green" };

/** "1-to-1", "Bring 1 friend", "Class of 6"; detailing reads "1 vehicle". */
export function modeChip(service: ServiceLike, isDetailing: boolean): ModeChip {
  const mode = bookingModeOf(service);
  if (mode === "group") return { label: `Class of ${service.capacityMax}`, tone: "green" };
  if (mode === "lead_pays_party") {
    const friends = Math.max(1, service.capacityMax - 1);
    return { label: `Bring ${friends} ${friends === 1 ? "friend" : "friends"}`, tone: "blue" };
  }
  return { label: isDetailing ? "1 vehicle" : "1-to-1", tone: "grey" };
}

/** "£50", "from £50" when options are priced differently, "Free" at 0; plus the line under it. */
export function priceLabel(service: ServiceLike): { main: string; sub: string | null } {
  const prices = [
    service.basePriceMinor,
    ...service.variants.map((v) => v.priceMinor).filter((p): p is number => typeof p === "number"),
  ];
  const lowest = Math.min(...prices);
  const varied = new Set(prices).size > 1;
  const main =
    lowest === 0 && !varied
      ? "Free"
      : `${varied ? "from " : ""}${formatMoney(lowest, service.currency, { compact: true })}`;
  const mode = bookingModeOf(service);
  let sub: string | null = null;
  if (mode === "group") sub = "per person";
  else if (mode === "lead_pays_party") sub = `for ${service.capacityMax}`;
  else if (service.depositMinor && service.depositMinor > 0) {
    sub = `${formatMoney(service.depositMinor, service.currency, { compact: true })} deposit`;
  }
  return { main, sub };
}

/** "2 options", or "3 sizes" for detailing. */
export function optionsChip(count: number, isDetailing: boolean): string | null {
  if (count <= 0) return null;
  const word = isDetailing ? (count === 1 ? "size" : "sizes") : count === 1 ? "option" : "options";
  return `${count} ${word}`;
}

export const SERVICE_STATUS_FILTERS = ["taking", "paused", "public", "links"] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUS_FILTERS)[number];
export const SERVICE_STATUS_LABELS: Record<ServiceStatusFilter, string> = {
  taking: "Taking bookings",
  paused: "Paused",
  public: "On booking page",
  links: "Offer links only",
};

export function matchesStatus(service: ServiceLike, status: ServiceStatusFilter | null): boolean {
  switch (status) {
    case "taking":
      return service.active;
    case "paused":
      return !service.active;
    case "public":
      return service.publicVisible;
    case "links":
      return !service.publicVisible;
    default:
      return true;
  }
}

/** Search matches name, description and category, case-insensitively. */
export function filterServices<T extends ServiceLike>(
  services: readonly T[],
  filters: { q?: string | null; category?: string | null; status?: ServiceStatusFilter | null },
): T[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  const category = normaliseCategory(filters.category)?.toLowerCase() ?? null;
  return services.filter((s) => {
    if (category === "__none") {
      if (normaliseCategory(s.category)) return false;
    } else if (category && normaliseCategory(s.category)?.toLowerCase() !== category) {
      return false;
    }
    if (!matchesStatus(s, filters.status ?? null)) return false;
    if (!q) return true;
    return [s.name, s.description ?? "", s.category ?? ""].some((v) => v.toLowerCase().includes(q));
  });
}

/** "6 sessions in 3 categories · 1 paused". */
export function countLine(services: readonly ServiceLike[], word: string, plural: string): string {
  const categories = new Set(
    services
      .map((s) => normaliseCategory(s.category)?.toLowerCase())
      .filter((c): c is string => Boolean(c)),
  ).size;
  const paused = services.filter((s) => !s.active).length;
  const parts = [`${services.length} ${services.length === 1 ? word : plural}`];
  if (categories > 0)
    parts[0] += ` in ${categories} ${categories === 1 ? "category" : "categories"}`;
  if (paused > 0) parts.push(`${paused} paused`);
  return parts.join(" · ");
}

/** Full label for a row, read out by screen readers. */
export function rowAriaLabel(
  service: ServiceLike,
  opts: { isDetailing: boolean; who: string | null },
): string {
  const price = priceLabel(service);
  return [
    service.name,
    durationLabel(service.durationMinutes),
    [price.main, price.sub].filter(Boolean).join(" "),
    modeChip(service, opts.isDetailing).label.toLowerCase(),
    opts.who,
    service.publicVisible ? "on booking page" : "offer links only",
    service.active ? "taking bookings" : "paused",
  ]
    .filter(Boolean)
    .join(", ");
}

/* ---------------- Form checks ---------------- */

export type OptionRowInput = { name: string; durationValue: string; priceMinor: string };

/**
 * Per-row option problems: a row with a length or price but no name is flagged
 * (it used to be dropped quietly), and names must be unique within the service.
 * Completely blank rows are ignored.
 */
export function optionRowErrors(rows: readonly OptionRowInput[]): (string | null)[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const name = row.name.trim();
    if (!name) {
      return row.durationValue.trim() || row.priceMinor.trim() ? "Give this option a name." : null;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return "Each option needs its own name.";
    seen.set(key, 1);
    return null;
  });
}

/** Indexes of windows that overlap another on the same day. */
export function overlappingWindows(
  windows: readonly { dayOfWeek: number; startMinute: number; endMinute: number }[],
): Set<number> {
  const bad = new Set<number>();
  windows.forEach((a, i) => {
    windows.forEach((b, j) => {
      if (i >= j || a.dayOfWeek !== b.dayOfWeek) return;
      if (a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
        bad.add(i);
        bad.add(j);
      }
    });
  });
  return bad;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function hhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Day rows for a set of weekly windows, joining runs of days with the same times:
 * ["Mon to Fri · 06:00 to 09:00, 17:00 to 20:00", "Sat · 08:00 to 12:00"].
 */
export function summariseWindows(
  windows: readonly { dayOfWeek: number; startMinute: number; endMinute: number }[],
): string[] {
  const byDay = new Map<number, string>();
  for (let day = 1; day <= 7; day += 1) {
    const times = windows
      .filter((w) => w.dayOfWeek === day)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((w) => `${hhmm(w.startMinute)} to ${hhmm(w.endMinute)}`);
    if (times.length > 0) byDay.set(day, times.join(", "));
  }
  const lines: string[] = [];
  let day = 1;
  while (day <= 7) {
    const times = byDay.get(day);
    if (!times) {
      day += 1;
      continue;
    }
    let end = day;
    while (end + 1 <= 7 && byDay.get(end + 1) === times) end += 1;
    const label =
      end === day
        ? DAY_NAMES[day - 1]
        : end === day + 1
          ? `${DAY_NAMES[day - 1]}, ${DAY_NAMES[end - 1]}`
          : `${DAY_NAMES[day - 1]} to ${DAY_NAMES[end - 1]}`;
    lines.push(`${label} · ${times}`);
    day = end + 1;
  }
  return lines;
}

/** The first weekday (1 = Mon) with no window, so "+" doesn't always add Monday. */
export function nextFreeDay(windows: readonly { dayOfWeek: number }[]): number {
  const used = new Set(windows.map((w) => w.dayOfWeek));
  for (let day = 1; day <= 7; day += 1) if (!used.has(day)) return day;
  return 1;
}

/* ---------------- Booking rules ---------------- */

export type RuleOption = { value: number; label: string };

export const BUFFER_OPTIONS: RuleOption[] = [0, 5, 10, 15, 30].map((m) => ({
  value: m,
  label: m === 0 ? "None" : `${m} min`,
}));
export const NOTICE_OPTIONS: RuleOption[] = [0, 1, 2, 4, 12, 24, 48].map((h) => ({
  value: h * 60,
  label: h === 0 ? "None" : `${h} ${h === 1 ? "hour" : "hours"}`,
}));
export const HORIZON_OPTIONS: RuleOption[] = [
  { value: 14, label: "2 weeks" },
  { value: 28, label: "4 weeks" },
  { value: 56, label: "8 weeks" },
  { value: 84, label: "12 weeks" },
  { value: 182, label: "6 months" },
  { value: 365, label: "1 year" },
];
export const CANCELLATION_OPTIONS: RuleOption[] = [0, 2, 12, 24, 48].map((h) => ({
  value: h,
  label: h === 0 ? "None" : `${h} hours`,
}));

/** Label for any stored value, including ones the presets don't list. */
export function ruleValueLabel(
  kind: "buffer" | "notice" | "horizon" | "cancellation",
  value: number,
): string {
  const options = {
    buffer: BUFFER_OPTIONS,
    notice: NOTICE_OPTIONS,
    horizon: HORIZON_OPTIONS,
    cancellation: CANCELLATION_OPTIONS,
  }[kind];
  const preset = options.find((o) => o.value === value);
  if (preset) return preset.label;
  if (kind === "buffer") return `${value} min`;
  if (kind === "horizon") return value % 7 === 0 ? `${value / 7} weeks` : `${value} days`;
  if (kind === "notice") {
    if (value % 60 === 0) {
      const h = value / 60;
      return `${h} ${h === 1 ? "hour" : "hours"}`;
    }
    return `${value} min`;
  }
  return `${value} hours`;
}

/** "£" for GBP, "€" for EUR; the code itself when the browser has no symbol. */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "10 min after", "5 min before, 10 min after", "None". */
export function bufferSummary(before: number, after: number): string {
  const parts: string[] = [];
  if (before > 0) parts.push(`${before} min before`);
  if (after > 0) parts.push(`${after} min after`);
  return parts.length > 0 ? parts.join(", ") : "None";
}

/* ---------------- Someone else saved ---------------- */

/**
 * Three-way merge of form values after someone else saved. Fields only they changed
 * are taken silently; fields both changed differently are conflicts for the user.
 */
export function mergeDrafts<T extends Record<string, unknown>>(
  base: T,
  mine: T,
  theirs: T,
  same: (a: unknown, b: unknown) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): { merged: T; taken: (keyof T)[]; conflicts: (keyof T)[] } {
  const merged = { ...mine };
  const taken: (keyof T)[] = [];
  const conflicts: (keyof T)[] = [];
  for (const key of Object.keys(theirs) as (keyof T)[]) {
    if (same(base[key], theirs[key])) continue;
    if (same(base[key], mine[key])) {
      merged[key] = theirs[key];
      taken.push(key);
    } else if (!same(mine[key], theirs[key])) {
      conflicts.push(key);
    }
  }
  return { merged, taken, conflicts };
}
