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
/**
 * "90 min", "3 hours", "2 days" — whole days/hours read as such, oddities stay
 * in minutes. Detailing services can hold a vehicle for days, so raw minutes
 * ("2880 min") are unreadable there.
 */
export function formatDuration(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes >= 120 && minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}

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

/** True when a booking ends on a later calendar day than it starts (in its own timezone). */
export function spansDays(startIso: string, endIso: string, timeZone: string): boolean {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  // An end exactly on midnight still belongs to the previous day.
  const lastInstant = new Date(new Date(endIso).getTime() - 60_000).toISOString();
  return day(startIso) !== day(lastInstant);
}

/**
 * "17 Sept 2026, 09:00 – 10:00" for a same-day booking; multi-day jobs (a two-day
 * detailing) spell out the return day too: "17 Sept 2026, 09:00 – 19 Sept, 09:00".
 */
export function formatBookingSpan(startIso: string, endIso: string, timeZone: string): string {
  const start = formatInTz(startIso, timeZone, { dateStyle: "medium", timeStyle: "short" });
  const end = spansDays(startIso, endIso, timeZone)
    ? formatInTz(endIso, timeZone, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : formatInTz(endIso, timeZone, { timeStyle: "short" });
  return `${start} – ${end}`;
}

/**
 * "Mon 7 Sept 2026" for a one-day all-day job, "Mon 7 – Tue 8 Sept 2026" across days
 * (RECA-532). `endIso` is exclusive, so the last day shown is the day before it.
 */
export function formatAllDaySpan(startIso: string, endIso: string, timeZone: string): string {
  const lastInstant = new Date(new Date(endIso).getTime() - 60_000).toISOString();
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  // en-GB puts a comma after the weekday once a year is present ("Mon, 7 Sept 2026");
  // the shorter forms don't, so strip it for one consistent style.
  const full = (iso: string) =>
    formatInTz(iso, timeZone, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).replace(",", "");
  if (day(startIso) === day(lastInstant)) return full(startIso);
  const sameMonth = day(startIso).slice(0, 7) === day(lastInstant).slice(0, 7);
  const left = sameMonth
    ? formatInTz(startIso, timeZone, { weekday: "short", day: "numeric" })
    : formatInTz(startIso, timeZone, { weekday: "short", day: "numeric", month: "short" });
  return `${left} – ${full(lastInstant)}`;
}

/**
 * The one-line "when" for a booking: all-day jobs read as dates ("Mon 7 – Tue 8 Sept
 * 2026 · All day"), everything else as a time span (RECA-532).
 */
export function formatBookingWhen(
  booking: { start: string; end: string; allDay?: boolean },
  timeZone: string,
): string {
  return booking.allDay
    ? `${formatAllDaySpan(booking.start, booking.end, timeZone)} · All day`
    : formatBookingSpan(booking.start, booking.end, timeZone);
}

/** "2 days 3 hrs", "1 hr 30 min", "45 min" — for a live duration readout (RECA-532). */
export function formatDurationLong(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hr" : "hrs"}`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(" ");
}

/** Local wall-clock `YYYY-MM-DD` + `HH:MM` → ISO instant (browser zone), or null if unparsable. */
export function localDateTimeToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
