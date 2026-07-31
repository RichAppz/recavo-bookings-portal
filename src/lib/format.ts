export const gbp = (value: number, opts: { decimals?: boolean } = {}) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(value);

export const gbpExact = (value: number) => gbp(value, { decimals: true });

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
