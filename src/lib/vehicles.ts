/**
 * Pure helpers for the Vehicles page, the add/edit drawer and the vehicle panel:
 * number plates, the "Shows on bookings as" label, per-vehicle job stats, tabs,
 * pills, duplicate registrations, search and sort. The same screens serve any
 * linked record (pets, equipment); plate-specific behaviour only applies when the
 * schema has a registration field.
 */
import type { Booking, LinkedRecordWithOwner, ServiceFollowUp } from "./api/types.ts";
import { daysAgo, relativeVisitLabel } from "./clients-list.ts";

const DAY_MS = 86_400_000;

/* ---------------- Schema ---------------- */

export type VehicleField = {
  fieldKey: string;
  label: string;
  dataType: string;
  required?: boolean;
  status?: string;
  displayOrder?: number;
  constraints?: {
    options?: { value: string; label: string }[];
    maxLength?: number;
    min?: number;
    max?: number;
  } | null;
};

const REGISTRATION_KEYS = new Set(["registration", "reg", "registration_number", "number_plate"]);
const FUEL_KEYS = ["fuel_type", "fuel"];
const CONDITION_KEYS = ["condition_notes", "condition"];

/** The field holding the number plate, when the schema has one. */
export function registrationField<F extends VehicleField>(fields: readonly F[]): F | null {
  return (
    fields.find((f) => REGISTRATION_KEYS.has(f.fieldKey) && f.dataType === "short_text") ?? null
  );
}

export function fuelField<F extends VehicleField>(fields: readonly F[]): F | null {
  return (
    fields.find((f) => FUEL_KEYS.includes(f.fieldKey) && f.dataType === "single_select") ?? null
  );
}

export function conditionField<F extends VehicleField>(fields: readonly F[]): F | null {
  return (
    fields.find((f) => CONDITION_KEYS.includes(f.fieldKey) && f.dataType === "long_text") ?? null
  );
}

/** Fields the form can't edit inline (uploads go through the photos section instead). */
const NON_FORM_TYPES = new Set(["image", "file", "reference", "multi_select"]);

const DETAIL_ORDER = ["make", "model", "year", "colour", "color"];

/**
 * The details section, in the spec's order: make and model, year and colour, fuel,
 * mileage, then any other custom fields. Registration and condition notes have their
 * own sections, and upload fields are handled by Photos.
 */
export function detailFields<F extends VehicleField>(fields: readonly F[]): F[] {
  const reg = registrationField(fields);
  const fuel = fuelField(fields);
  const condition = conditionField(fields);
  const rank = (f: F) => {
    const i = DETAIL_ORDER.indexOf(f.fieldKey);
    if (i >= 0) return i;
    if (f === fuel) return DETAIL_ORDER.length;
    if (f.fieldKey === "mileage") return DETAIL_ORDER.length + 1;
    return DETAIL_ORDER.length + 2;
  };
  return fields
    .filter((f) => f !== reg && f !== condition && !NON_FORM_TYPES.has(f.dataType))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map(({ f }) => f);
}

/* ---------------- Number plates ---------------- */

/** Uppercase, letters and digits only: what registrations are matched on. */
export function normaliseRegistration(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Current UK format: two letters, two digits, three letters (e.g. YA18AEK). */
const UK_CURRENT = /^[A-Z]{2}\d{2}[A-Z]{3}$/;

/**
 * A registration as it's shown on a plate: uppercase, with the standard space for
 * current UK plates ("YA18 AEK"). Anything else (private, older or foreign formats)
 * shows as typed, uppercased with spacing tidied.
 */
export function formatRegistration(raw: string | null | undefined): string {
  const norm = normaliseRegistration(raw);
  if (UK_CURRENT.test(norm)) return `${norm.slice(0, 4)} ${norm.slice(4)}`;
  return (raw ?? "").toUpperCase().trim().replace(/\s+/g, " ");
}

/**
 * The plate input while typing: uppercases, and once a current-format plate goes past
 * its fourth character puts the space in ("YA18A" → "YA18 A").
 */
export function formatPlateInput(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/g, " ").replace(/^\s+/, "");
  const norm = normaliseRegistration(upper);
  if (norm.length > 4 && /^[A-Z]{2}\d{2}[A-Z]{1,3}$/.test(norm)) {
    return `${norm.slice(0, 4)} ${norm.slice(4)}`;
  }
  return upper;
}

/** "Registration YA18 AEK" read letter by letter. */
export function plateAccessibleName(reg: string): string {
  return `Registration ${formatRegistration(reg).split("").join(" ").replace(/ {3}/g, ", ")}`;
}

/* ---------------- Values ---------------- */

type Values = Record<string, unknown>;

const text = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

export function registrationOf(values: Values | null | undefined, fields: readonly VehicleField[]) {
  const f = registrationField(fields);
  return f ? text((values ?? {})[f.fieldKey]) : null;
}

/** "BMW M340i": make and model, or the first descriptive values for other records. */
export function descriptiveLabel(
  values: Values | null | undefined,
  fields: readonly VehicleField[],
): string | null {
  const v = values ?? {};
  const makeModel = [text(v.make), text(v.model)].filter(Boolean).join(" ");
  if (makeModel) return makeModel;
  const reg = registrationField(fields);
  const parts = fields
    .filter(
      (f) =>
        f !== reg &&
        (f.dataType === "short_text" || f.dataType === "single_select") &&
        f.fieldKey !== "colour" &&
        f.fieldKey !== "color",
    )
    .map((f) => optionLabel(f, v[f.fieldKey]))
    .filter((s): s is string => Boolean(s))
    .slice(0, 2);
  return parts.length ? parts.join(" ") : null;
}

function optionLabel(field: VehicleField, raw: unknown): string | null {
  const t = text(raw);
  if (!t) return null;
  if (field.dataType !== "single_select") return t;
  return field.constraints?.options?.find((o) => o.value === t)?.label ?? t;
}

/** The label a record gets when nobody has renamed it: "BMW M340i · YA18 AEK". */
export function autoLabel(
  values: Values | null | undefined,
  fields: readonly VehicleField[],
  fallback: string,
): string {
  const reg = registrationOf(values, fields);
  const parts = [descriptiveLabel(values, fields), reg ? formatRegistration(reg) : null].filter(
    Boolean,
  );
  return parts.length ? parts.join(" · ") : fallback;
}

/**
 * True when the stored label is what we'd generate anyway, so it should keep
 * following the details. Also accepts the old form's "first two values" label.
 */
export function isAutoLabel(
  label: string,
  values: Values | null | undefined,
  fields: readonly VehicleField[],
  fallback: string,
): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed === fallback) return true;
  if (trimmed === autoLabel(values, fields, fallback)) return true;
  const legacy = fields
    .map((f) => (values ?? {})[f.fieldKey])
    .filter((v) => v !== undefined && v !== null && v !== "")
    .slice(0, 2)
    .join(" — ");
  return trimmed === legacy;
}

/** The heading for a vehicle: make and model, or the label without the plate. */
export function vehicleTitle(
  record: { displayLabel: string; values?: Values | null },
  fields: readonly VehicleField[],
): string {
  const d = descriptiveLabel(record.values, fields);
  if (d) return d;
  const reg = registrationOf(record.values, fields);
  if (reg) {
    const stripped = record.displayLabel
      .replace(formatRegistration(reg), "")
      .replace(/^[\s·—-]+|[\s·—-]+$/g, "");
    return stripped || formatRegistration(reg);
  }
  return record.displayLabel;
}

/** "45,210 miles"; null when not a whole, non-negative number. */
export function mileageText(value: unknown): string | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "mile" : "miles"}`;
}

/** "2018 · Blue · Petrol", plus mileage when asked. */
export function vehicleSubline(
  values: Values | null | undefined,
  fields: readonly VehicleField[],
  { mileage = false }: { mileage?: boolean } = {},
): string {
  const v = values ?? {};
  const fuel = fuelField(fields);
  const parts = [
    text(v.year),
    text(v.colour ?? v.color),
    fuel ? optionLabel(fuel, v[fuel.fieldKey]) : null,
    mileage ? mileageText(v.mileage) : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export const KM_PER_MILE = 1.609344;
export const toMiles = (km: number) => Math.round(km / KM_PER_MILE);
export const toKm = (miles: number) => Math.round(miles * KM_PER_MILE);

/** Distance unit staff type mileage in by default: miles in the UK and US, km elsewhere. */
export function defaultDistanceUnit(country: string | null | undefined): "miles" | "km" {
  const c = (country ?? "GB").toUpperCase();
  return c === "GB" || c === "UK" || c === "US" ? "miles" : "km";
}

/** null when fine, otherwise the message the year field shows. */
export function yearError(raw: unknown, now: Date): string | null {
  const s = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!s) return null;
  if (!/^\d{4}$/.test(s)) return "Enter a year like 2018.";
  const n = Number(s);
  if (n < 1900 || n > now.getUTCFullYear() + 1) return "Enter a year like 2018.";
  return null;
}

/* ---------------- Stats ---------------- */

type StatsBooking = Pick<
  Booking,
  | "id"
  | "linkedRecordId"
  | "start"
  | "allDay"
  | "status"
  | "attendanceStatus"
  | "paidMinor"
  | "serviceSnapshot"
>;

export type VehicleVisit = { at: string; allDay: boolean; service: string };

export type VehicleStats = {
  /** Completed (attended) jobs. */
  jobs: number;
  lastJob: VehicleVisit | null;
  nextBooking: VehicleVisit | null;
  /** Money taken on this vehicle's bookings. */
  spentMinor: number;
};

export const EMPTY_VEHICLE_STATS: VehicleStats = {
  jobs: 0,
  lastJob: null,
  nextBooking: null,
  spentMinor: 0,
};

const LIVE = new Set<Booking["status"]>(["held", "awaiting_payment", "confirmed"]);
const CANCELLED = new Set<Booking["status"]>([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
  "draft",
]);

const attended = (b: StatsBooking) => b.status === "completed" || b.attendanceStatus === "attended";

export function vehicleStatsById(
  bookings: readonly StatsBooking[],
  nowMs: number,
): Map<string, VehicleStats> {
  const out = new Map<string, VehicleStats>();
  for (const b of bookings) {
    if (!b.linkedRecordId) continue;
    let s = out.get(b.linkedRecordId);
    if (!s) {
      s = { ...EMPTY_VEHICLE_STATS };
      out.set(b.linkedRecordId, s);
    }
    const startMs = Date.parse(b.start);
    const visit = { at: b.start, allDay: b.allDay, service: b.serviceSnapshot.name };
    if (startMs <= nowMs && attended(b)) {
      s.jobs += 1;
      if (!s.lastJob || startMs > Date.parse(s.lastJob.at)) s.lastJob = visit;
    }
    if (startMs >= nowMs && LIVE.has(b.status)) {
      if (!s.nextBooking || startMs < Date.parse(s.nextBooking.at)) s.nextBooking = visit;
    }
    if (!CANCELLED.has(b.status)) s.spentMinor += b.paidMinor ?? 0;
  }
  return out;
}

export type VehicleJobStatus = "booked" | "done" | "cancelled" | "no_show" | "past";

export function vehicleJobStatus(
  b: Pick<Booking, "status" | "attendanceStatus" | "start">,
  nowMs: number,
): VehicleJobStatus {
  if (b.status === "no_show" || b.attendanceStatus === "no_show") return "no_show";
  if (CANCELLED.has(b.status)) return "cancelled";
  if (b.status === "completed" || b.attendanceStatus === "attended") return "done";
  if (Date.parse(b.start) >= nowMs && LIVE.has(b.status)) return "booked";
  return "past";
}

export const VEHICLE_JOB_STATUS_LABELS: Record<VehicleJobStatus, string> = {
  booked: "Booked",
  done: "Done",
  cancelled: "Cancelled",
  no_show: "No-show",
  past: "Past",
};

/** A vehicle's jobs for the panel: upcoming first (soonest first), then past, newest first. */
export function vehicleJobs<T extends Pick<Booking, "linkedRecordId" | "start" | "status">>(
  bookings: readonly T[],
  recordId: string,
  nowMs: number,
): T[] {
  const mine = bookings.filter((b) => b.linkedRecordId === recordId);
  const upcoming = mine
    .filter((b) => Date.parse(b.start) >= nowMs && LIVE.has(b.status))
    .sort((a, b) => a.start.localeCompare(b.start));
  const rest = mine
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.start.localeCompare(a.start));
  return [...upcoming, ...rest];
}

/* ---------------- Follow-ups ---------------- */

const OPEN_FOLLOW_UP = new Set<ServiceFollowUp["status"]>(["scheduled", "sent"]);

export type VehicleDue = Pick<
  ServiceFollowUp,
  "id" | "dueAt" | "lastDoneAt" | "serviceId" | "serviceName" | "label"
>;

/** The earliest open follow-up per vehicle. */
export function dueByRecord(
  followUps: readonly Pick<
    ServiceFollowUp,
    | "id"
    | "linkedRecordId"
    | "status"
    | "dueAt"
    | "lastDoneAt"
    | "serviceId"
    | "serviceName"
    | "label"
  >[],
): Map<string, VehicleDue> {
  const out = new Map<string, VehicleDue>();
  for (const f of followUps) {
    if (!f.linkedRecordId || !OPEN_FOLLOW_UP.has(f.status)) continue;
    const prev = out.get(f.linkedRecordId);
    if (!prev || f.dueAt < prev.dueAt) out.set(f.linkedRecordId, f);
  }
  return out;
}

/** What the due box calls it: the follow-up's label, else the service. */
export const dueTitle = (d: Pick<VehicleDue, "label" | "serviceName">) =>
  d.label?.trim() || d.serviceName?.trim() || "Follow-up";

/* ---------------- Tabs, pills, summary ---------------- */

export type VehiclesView = "all" | "due" | "stale" | "archived";
export const VEHICLES_VIEWS: readonly VehiclesView[] = ["all", "due", "stale", "archived"];
export const VEHICLES_VIEW_LABELS: Record<VehiclesView, string> = {
  all: "All",
  due: "Due back",
  stale: "Not seen in 6 months",
  archived: "Archived",
};

/** "Due back" reaches this far ahead (overdue ones always count). */
export const DUE_WINDOW_DAYS = 30;
export const STALE_DAYS = 182;
export const NEW_VEHICLE_DAYS = 30;

export type VehicleRowFacts = {
  record: Pick<LinkedRecordWithOwner["record"], "id" | "status" | "createdAt">;
  stats: VehicleStats;
  due: VehicleDue | null;
};

export const isArchivedVehicle = (r: { status: string }) => r.status !== "active";

export function isDueSoon(due: VehicleDue | null, nowMs: number): boolean {
  return Boolean(due) && Date.parse(due!.dueAt) <= nowMs + DUE_WINDOW_DAYS * DAY_MS;
}

/** Last job 6+ months ago and nothing booked. Vehicles never seen aren't stale. */
export function isStale(stats: VehicleStats, now: Date, timeZone: string): boolean {
  if (!stats.lastJob || stats.nextBooking) return false;
  return daysAgo(stats.lastJob.at, now, timeZone) >= STALE_DAYS;
}

export function inVehiclesView(
  view: VehiclesView,
  row: VehicleRowFacts,
  now: Date,
  timeZone: string,
): boolean {
  const archived = isArchivedVehicle(row.record);
  if (view === "archived") return archived;
  if (archived) return false;
  if (view === "due") return isDueSoon(row.due, now.getTime());
  if (view === "stale") return isStale(row.stats, now, timeZone);
  return true;
}

export function vehiclesViewCounts(
  rows: readonly VehicleRowFacts[],
  now: Date,
  timeZone: string,
): Record<VehiclesView, number> {
  const counts: Record<VehiclesView, number> = { all: 0, due: 0, stale: 0, archived: 0 };
  for (const r of rows) {
    for (const v of VEHICLES_VIEWS) if (inVehiclesView(v, r, now, timeZone)) counts[v] += 1;
  }
  return counts;
}

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

/** "38 vehicles across 24 clients · 6 due back this month". */
export function vehiclesSummary(
  rows: readonly (VehicleRowFacts & { ownerId: string | null })[],
  now: Date,
  timeZone: string,
  noun: { singular: string; plural: string },
): string {
  const active = rows.filter((r) => !isArchivedVehicle(r.record));
  const owners = new Set(active.map((r) => r.ownerId).filter(Boolean)).size;
  const monthEnd = endOfMonthMs(now, timeZone);
  const dueThisMonth = active.filter((r) => r.due && Date.parse(r.due.dueAt) <= monthEnd).length;
  const head = `${plural(active.length, noun.singular.toLowerCase(), noun.plural.toLowerCase())} across ${plural(owners, "client")}`;
  return dueThisMonth > 0 ? `${head} · ${dueThisMonth} due back this month` : head;
}

function endOfMonthMs(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  // Midnight UTC on the 1st of next month; close enough for a "this month" count.
  return Date.UTC(y, m, 1);
}

export type VehiclePillKind = "archived" | "owners" | "due" | "new";

/** One pill per row. Priority: Archived › 2 owners › Due › New. */
export function vehiclePill(
  row: VehicleRowFacts & { duplicateOwners: number },
  now: Date,
): VehiclePillKind | null {
  if (isArchivedVehicle(row.record)) return "archived";
  if (row.duplicateOwners > 1) return "owners";
  if (isDueSoon(row.due, now.getTime())) return "due";
  const ageDays = (now.getTime() - Date.parse(row.record.createdAt)) / DAY_MS;
  if (ageDays <= NEW_VEHICLE_DAYS && row.stats.jobs === 0 && !row.stats.nextBooking) return "new";
  return null;
}

export function vehiclePillLabel(
  kind: VehiclePillKind,
  ctx: { due: VehicleDue | null; duplicateOwners: number; timeZone: string },
): string {
  switch (kind) {
    case "archived":
      return "Archived";
    case "owners":
      return `${ctx.duplicateOwners} owners`;
    case "new":
      return "New";
    case "due":
      return ctx.due ? `Due ${shortDay(ctx.due.dueAt, ctx.timeZone)}` : "Due";
  }
}

const shortDay = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(
    new Date(iso),
  );

export const lastJobLabel = (stats: VehicleStats, now: Date, timeZone: string) =>
  stats.lastJob ? relativeVisitLabel(stats.lastJob.at, now, timeZone) : "Never";

/* ---------------- Duplicates ---------------- */

export type DuplicateGroup<R> = {
  /** Normalised registration plus the record ids, so a new copy re-raises the warning. */
  key: string;
  registration: string;
  rows: R[];
  /** Distinct owners across the copies. */
  owners: number;
};

/** Registrations on more than one active record, matched ignoring spaces and case. */
export function duplicateGroups<
  R extends { record: { id: string; status: string; customerId: string; values?: Values | null } },
>(rows: readonly R[], fields: readonly VehicleField[]): DuplicateGroup<R>[] {
  const regField = registrationField(fields);
  if (!regField) return [];
  const byReg = new Map<string, R[]>();
  for (const r of rows) {
    if (isArchivedVehicle(r.record)) continue;
    const norm = normaliseRegistration(text((r.record.values ?? {})[regField.fieldKey]));
    if (norm.length < 2) continue;
    const list = byReg.get(norm) ?? [];
    list.push(r);
    byReg.set(norm, list);
  }
  const groups: DuplicateGroup<R>[] = [];
  for (const [reg, list] of byReg) {
    if (list.length < 2) continue;
    groups.push({
      key: `${reg}:${list
        .map((r) => r.record.id)
        .sort()
        .join(",")}`,
      registration: reg,
      rows: list,
      owners: new Set(list.map((r) => r.record.customerId)).size,
    });
  }
  return groups.sort((a, b) => a.registration.localeCompare(b.registration));
}

/* ---------------- Search, filters, sort ---------------- */

export type VehicleSearchable = {
  record: { displayLabel: string; values?: Values | null };
  ownerName: string;
};

/** Registration ignores spaces and case ("ya18aek" finds "YA18 AEK"); everything else is a contains match. */
export function matchesVehicleSearch(
  row: VehicleSearchable,
  query: string,
  fields: readonly VehicleField[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qNorm = normaliseRegistration(q);
  const reg = registrationOf(row.record.values, fields);
  if (qNorm && reg && normaliseRegistration(reg).includes(qNorm)) return true;
  const v = row.record.values ?? {};
  const haystack = [row.record.displayLabel, text(v.make), text(v.model), row.ownerName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Makes on file, de-duplicated case-insensitively, A to Z. */
export function makesOnFile(records: readonly { values?: Values | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const m = text((r.values ?? {}).make);
    if (m && !seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const makeOf = (values: Values | null | undefined) =>
  text((values ?? {}).make)?.toLowerCase() ?? null;

export type VehiclesSort = "last-job" | "next-booking" | "reg" | "owner" | "jobs" | "newest";
export const VEHICLES_SORTS: readonly VehiclesSort[] = [
  "last-job",
  "next-booking",
  "reg",
  "owner",
  "jobs",
  "newest",
];
export const VEHICLES_SORT_LABELS: Record<VehiclesSort, string> = {
  "last-job": "Last job",
  "next-booking": "Next booking",
  reg: "Registration A to Z",
  owner: "Owner A to Z",
  jobs: "Most jobs",
  newest: "Newest",
};

export type SortableVehicle = {
  record: { displayLabel: string; createdAt: string; values?: Values | null };
  ownerName: string;
  stats: VehicleStats;
};

export function sortVehicles<T extends SortableVehicle>(
  rows: readonly T[],
  sort: VehiclesSort,
  fields: readonly VehicleField[],
): T[] {
  const regKey = (r: T) =>
    normaliseRegistration(registrationOf(r.record.values, fields)) || r.record.displayLabel;
  const cmp: Record<VehiclesSort, (a: T, b: T) => number> = {
    "last-job": (a, b) =>
      (b.stats.lastJob?.at ?? "").localeCompare(a.stats.lastJob?.at ?? "") ||
      a.record.displayLabel.localeCompare(b.record.displayLabel),
    "next-booking": (a, b) => {
      const an = a.stats.nextBooking?.at;
      const bn = b.stats.nextBooking?.at;
      if (an && bn) return an.localeCompare(bn);
      if (an) return -1;
      if (bn) return 1;
      return a.record.displayLabel.localeCompare(b.record.displayLabel);
    },
    reg: (a, b) => regKey(a).localeCompare(regKey(b)),
    owner: (a, b) => a.ownerName.localeCompare(b.ownerName) || regKey(a).localeCompare(regKey(b)),
    jobs: (a, b) => b.stats.jobs - a.stats.jobs || regKey(a).localeCompare(regKey(b)),
    newest: (a, b) => b.record.createdAt.localeCompare(a.record.createdAt),
  };
  return [...rows].sort(cmp[sort]);
}

/* ---------------- Accessibility ---------------- */

export function vehicleRowLabel(parts: {
  registration: string | null;
  title: string;
  year: string | null;
  ownerName: string | null;
  pill: string | null;
  next: string | null;
}): string {
  return [
    parts.registration ? formatRegistration(parts.registration) : null,
    [parts.title, parts.year].filter(Boolean).join(" "),
    parts.ownerName ? `owner ${parts.ownerName}` : null,
    parts.pill ? parts.pill.toLowerCase() : null,
    parts.next ? `next booking ${parts.next}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
