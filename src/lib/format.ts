export const gbp = (value: number, opts: { decimals?: boolean } = {}) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(value);

export const gbpExact = (value: number) => gbp(value, { decimals: true });

/** Format integer minor units + ISO-4217 currency for display. Never float-math money. */
export function formatMoney(
  minor: number,
  currency = "GBP",
  opts: { locale?: string; compact?: boolean } = {},
): string {
  const locale = opts.locale ?? "en-GB";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Parse a user-entered decimal amount into integer minor units. */
export function parseMoneyToMinor(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid amount");
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^0-9.-]/g, "").trim();
  if (!cleaned) throw new Error("Invalid amount");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new Error("Invalid amount");
  return Math.round(value * 100);
}

/** Format an RFC 3339 UTC instant in a target IANA timezone. */
export function formatInTz(
  iso: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(new Date(iso));
}

/** Format time-only in a timezone. */
export function formatTimeInTz(iso: string, timeZone: string, locale = "en-GB"): string {
  return formatInTz(iso, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false }, locale);
}

/** Half-open interval helpers: [start, end). */
export function intervalContains(startIso: string, endIso: string, instantIso: string): boolean {
  const t = new Date(instantIso).getTime();
  return t >= new Date(startIso).getTime() && t < new Date(endIso).getTime();
}

export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

/** Base "today" for the demo. UTC-derived so SSR and the browser agree. */
export const demoToday = () => {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

export const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday first
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** UK short date, e.g. 14/03/2026 */
export const ukDate = (iso: string) =>
  parseIso(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

/** UK long date, e.g. Sat 14 Mar */
export const ukDateLong = (iso: string) =>
  parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export const ukDateFull = (iso: string) =>
  parseIso(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export const relativeDay = (iso: string) => {
  const diff = Math.round((parseIso(iso).getTime() - demoToday().getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return ukDateLong(iso);
};

export const minutesToTime = (mins: number) =>
  `${Math.floor(mins / 60)}`.padStart(2, "0") + ":" + `${mins % 60}`.padStart(2, "0");

export const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const endTime = (start: string, duration: number) =>
  minutesToTime(timeToMinutes(start) + duration);

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const pct = (value: number) => `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
