import type { Location, PublicCataloguePlan } from "@/lib/api/types";

export type LocationKind = "premises" | "mobile";
export type HoursRange = { openMinute: number; closeMinute: number };
export type OpeningHour = HoursRange & { dayOfWeek: number };
export type LocationAddress = NonNullable<Location["address"]>;
export type ServiceArea = NonNullable<Location["serviceArea"]>;

export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_LONG = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const RADIUS_CHOICES = [5, 10, 15, 25] as const;
export const TRAVEL_CHOICES = [0, 15, 30, 45] as const;
export const NAME_MAX = 80;
export const PARKING_MAX = 300;

/** Physical locations are visited by clients; the other API types all travel to them. */
export function kindOf(location: Pick<Location, "type">): LocationKind {
  return location.type === "physical" ? "premises" : "mobile";
}

export function typeForKind(kind: LocationKind): Location["type"] {
  return kind === "premises" ? "physical" : "service_area";
}

export const KIND_LABEL: Record<LocationKind, string> = {
  premises: "Clients come to us",
  mobile: "We go to the client",
};

export function hm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "08:00 to 17:00, 18:00 to 20:00". Never a dash. */
export function rangesText(ranges: readonly HoursRange[]): string {
  return [...ranges]
    .sort((a, b) => a.openMinute - b.openMinute)
    .map((r) => `${hm(r.openMinute)} to ${hm(r.closeMinute)}`)
    .join(", ");
}

export function rangesOn(hours: readonly OpeningHour[], day: number): HoursRange[] {
  return hours
    .filter((h) => h.dayOfWeek === day)
    .sort((a, b) => a.openMinute - b.openMinute)
    .map(({ openMinute, closeMinute }) => ({ openMinute, closeMinute }));
}

/**
 * "Mon to Fri 08:00 to 17:00 · Sat 09:00 to 13:00": runs of days with the same
 * hours are joined. No hours at all means staff hours decide.
 */
export function hoursSummary(hours: readonly OpeningHour[]): string {
  if (hours.length === 0) return "Open when the team works";
  const parts: string[] = [];
  let day = 1;
  while (day <= 7) {
    const text = rangesText(rangesOn(hours, day));
    if (!text) {
      day += 1;
      continue;
    }
    let end = day;
    while (end < 7 && rangesText(rangesOn(hours, end + 1)) === text) end += 1;
    const days =
      end === day
        ? DAY_SHORT[day]
        : end === day + 1
          ? `${DAY_SHORT[day]}, ${DAY_SHORT[end]}`
          : `${DAY_SHORT[day]} to ${DAY_SHORT[end]}`;
    parts.push(`${days} ${text}`);
    day = end + 1;
  }
  return parts.length > 0 ? parts.join(" · ") : "Closed every day";
}

/** ISO weekday (1 = Monday) and minutes past midnight in `timeZone`. */
export function wallClock(now: Date, timeZone: string): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = DAY_SHORT.indexOf(get("weekday") as (typeof DAY_SHORT)[number]);
  return {
    weekday: weekday > 0 ? weekday : 1,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export type TodayState = {
  tone: "green" | "grey";
  pill: string;
  /** Today's hours, or when it next opens. */
  line: string;
  open: boolean;
};

/** The "Today" column: open now, opening later, or closed with the next opening. */
export function todayState(
  location: Pick<Location, "openingHours" | "timezone">,
  now: Date = new Date(),
): TodayState {
  const hours = location.openingHours;
  if (hours.length === 0) {
    return { tone: "grey", pill: "Team hours", line: "Open when the team works", open: false };
  }
  const { weekday, minute } = wallClock(now, location.timezone);
  const today = rangesOn(hours, weekday);
  const current = today.find((r) => r.openMinute <= minute && minute < r.closeMinute);
  if (current) {
    return {
      tone: "green",
      pill: `Open until ${hm(current.closeMinute)}`,
      line: rangesText(today),
      open: true,
    };
  }
  const later = today.find((r) => r.openMinute > minute);
  if (later) {
    return {
      tone: "green",
      pill: `Opens at ${hm(later.openMinute)}`,
      line: rangesText(today),
      open: false,
    };
  }
  return {
    tone: "grey",
    pill: today.length === 0 ? "Closed today" : "Closed now",
    line: nextOpening(hours, weekday) ?? "No opening hours",
    open: false,
  };
}

/** "Opens tomorrow at 08:00" / "Opens Thu at 08:00", looking at the days after `weekday`. */
export function nextOpening(hours: readonly OpeningHour[], weekday: number): string | null {
  for (let step = 1; step <= 7; step += 1) {
    const day = ((weekday - 1 + step) % 7) + 1;
    const first = rangesOn(hours, day)[0];
    if (first) {
      const when = step === 1 ? "tomorrow" : DAY_SHORT[day];
      return `Opens ${when} at ${hm(first.openMinute)}`;
    }
  }
  return null;
}

export function addressText(address: LocationAddress | null | undefined): string {
  if (!address) return "";
  return [address.line1, address.line2, address.town, address.postcode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}

/** "Within 15 miles of LS1 4AB · adds 30 min travel". */
export function areaText(area: ServiceArea | null | undefined, travelMinutes: number): string {
  if (!area) return "No area set yet";
  const base = `Within ${area.radiusMiles} miles of ${area.basePostcode}`;
  return travelMinutes > 0 ? `${base} · adds ${travelMinutes} min travel` : base;
}

/** The line under a location's name: its address, or the area a mobile one covers. */
export function whereText(
  location: Pick<Location, "type" | "address" | "serviceArea" | "travelMinutes">,
): string {
  if (kindOf(location) === "mobile") {
    return areaText(location.serviceArea, location.travelMinutes);
  }
  return addressText(location.address) || "No address yet";
}

export function directionsUrl(address: LocationAddress): string {
  const destination =
    address.lat !== null && address.lng !== null
      ? `${address.lat},${address.lng}`
      : addressText(address);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** "UK time" for London, otherwise the city: "Paris time". */
export function timezoneLabel(timeZone: string): string {
  if (timeZone === "Europe/London") return "UK time";
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  const city = timeZone.split("/").pop() ?? timeZone;
  return `${city.replace(/_/g, " ")} time`;
}

export function namePlaceholder(industry: string | null | undefined): string {
  switch (industry) {
    case "car_detailing":
      return "e.g. Unit 4, Riverside";
    case "personal_training":
      return "e.g. Riverside Gym";
    default:
      return "e.g. High Street studio";
  }
}

export function parkingPlaceholder(industry: string | null | undefined): string {
  return industry === "car_detailing"
    ? "e.g. Pull up to the shutter on the left. Ring when you arrive."
    : "e.g. Free parking behind the building. Buzz flat 2.";
}

/** What a business calls its resources: bays for detailers. */
export function resourceWords(industry: string | null | undefined): {
  one: string;
  many: string;
} {
  return industry === "car_detailing"
    ? { one: "bay", many: "Bays" }
    : { one: "resource", many: "Resources" };
}

/** Monday 00:00 to the next Monday 00:00 around `now`, in the browser's time zone. */
export function weekBounds(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const isoDay = from.getDay() === 0 ? 7 : from.getDay();
  from.setDate(from.getDate() - (isoDay - 1));
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export type PlanSeat = {
  planName: string;
  planCode: PublicCataloguePlan["code"] | null;
  /** null = unlimited. */
  allowed: number | null;
  used: number;
  atLimit: boolean;
  next: PublicCataloguePlan | null;
};

/** How many active locations the plan allows and the next plan that allows more. */
export function planSeat(
  plan: PublicCataloguePlan | null | undefined,
  plans: readonly PublicCataloguePlan[],
  used: number,
): PlanSeat {
  // The subscription reports the billed variant ("solo_month", limit key "locations");
  // the catalogue entry it belongs to carries the canonical name and limits.
  const baseCode = plan?.code.replace(/_(month|year)$/, "");
  const listed = plans.find((p) => p.code === baseCode);
  const limits = plan?.limits as Record<string, number | null | undefined> | undefined;
  const allowed =
    listed?.limits["locations.active"] ??
    limits?.["locations.active"] ??
    limits?.["locations"] ??
    null;
  const ordered = [...plans].sort(
    (a, b) => (a.limits["locations.active"] ?? 0) - (b.limits["locations.active"] ?? 0),
  );
  const next =
    allowed === null
      ? null
      : (ordered.find((p) => (p.limits["locations.active"] ?? 0) > allowed) ?? null);
  return {
    planName: listed?.name ?? plan?.name.replace(/\s*\((month|year)\)$/, "") ?? "your",
    planCode: listed?.code ?? plan?.code ?? null,
    allowed,
    used,
    atLimit: allowed !== null && used >= allowed,
    next,
  };
}

export function planLine(seat: PlanSeat): string {
  if (seat.allowed === null) return plural(seat.used, "location");
  return seat.atLimit
    ? `${seat.used} of ${seat.allowed} on ${seat.planName}`
    : `${seat.used} of ${seat.allowed} locations on ${seat.planName}`;
}

/** Validation for one day's ranges in the hours editor. */
export function rangeError(ranges: readonly HoursRange[]): string | null {
  for (const r of ranges) {
    if (r.closeMinute <= r.openMinute) return "Close time must be after open time.";
  }
  const sorted = [...ranges].sort((a, b) => a.openMinute - b.openMinute);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.openMinute < sorted[i - 1]!.closeMinute) return "These times overlap.";
  }
  return null;
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function looksLikeUkPostcode(value: string): boolean {
  return UK_POSTCODE.test(value.trim());
}

/** "ls14ab" → "LS1 4AB". Leaves anything that isn't a UK postcode as typed (trimmed). */
export function tidyPostcode(value: string): string {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!looksLikeUkPostcode(compact)) return value.trim().toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export type PostcodeLookup = { postcode: string; town: string | null; lat: number; lng: number };

/** UK postcode to town and coordinates (postcodes.io). Null when it isn't a real postcode. */
export async function lookupPostcode(
  postcode: string,
  fetcher: typeof fetch = fetch,
): Promise<PostcodeLookup | null> {
  if (!looksLikeUkPostcode(postcode)) return null;
  const res = await fetcher(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Postcode lookup failed (${res.status})`);
  const body = (await res.json()) as {
    result?: {
      postcode: string;
      latitude: number | null;
      longitude: number | null;
      post_town?: string | null;
      admin_district?: string | null;
    };
  };
  const r = body.result;
  if (!r || r.latitude === null || r.longitude === null) return null;
  return {
    postcode: r.postcode,
    town: r.post_town ?? r.admin_district ?? null,
    lat: r.latitude,
    lng: r.longitude,
  };
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Ordered for display: by the owner's order, then name. */
export function sortLocations<T extends Pick<Location, "displayOrder" | "name">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

export function isArchived(location: Pick<Location, "active">): boolean {
  return !location.active;
}
