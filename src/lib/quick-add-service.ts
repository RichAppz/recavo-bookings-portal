// Relative so the node test runner (no path aliases) can load it too.
import { parseMoneyToMinor } from "./format.ts";
import { normaliseCategory } from "./service-categories.ts";

/**
 * The API stores minutes, but a detailer thinks in "how long do I have the car" —
 * often days — and a trainer in "a 1.5 hour session". These helpers translate both
 * ways so a form can offer minutes/hours/days without the backend knowing. Shared by
 * the Services page and the quick-add dialog in the booking form.
 */
export type DurationUnit = "minutes" | "hours" | "days";
export const UNIT_MINUTES: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * Stored minutes → the value/unit pair someone would have typed. Whole days and
 * whole or half hours come back in that unit ("3.5" hours, not "210" minutes,
 * which is what the owner typed); anything odder stays in minutes.
 */
export function splitDuration(minutes: number): { value: string; unit: DurationUnit } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: String(minutes / 1440), unit: "days" };
  }
  if (minutes >= 60 && minutes % 30 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

/** Typed value + unit → whole minutes, or null when it isn't a positive number. */
export function durationToMinutes(value: string, unit: DurationUnit): number | null {
  const n = Number(value.trim());
  if (!value.trim() || !Number.isFinite(n) || n <= 0) return null;
  const minutes = Math.round(n * UNIT_MINUTES[unit]);
  return minutes > 0 ? minutes : null;
}

export type QuickAddServiceInput = {
  name: string;
  /** Free text; blank means no category. */
  category: string;
  durationValue: string;
  durationUnit: DurationUnit;
  /** Pounds as typed, e.g. "150" or "£150.00". */
  price: string;
  /** ISO-4217, from the catalogue the new service joins. */
  currency: string;
};

export type QuickAddServiceErrors = Partial<
  Record<"name" | "durationMinutes" | "basePriceMinor", string>
>;

/** Exact `POST /businesses/:id/services` body the quick-add sends. */
export type QuickAddServiceBody = {
  name: string;
  description: null;
  category: string | null;
  durationMinutes: number;
  basePriceMinor: number;
  currency: string;
  capacityMin: 1;
  capacityMax: 1;
  bookingMode: "individual";
  /** Empty = everyone on the team can deliver it, including people added later. */
  eligibleStaffIds: [];
  /** Empty = every location. */
  locationIds: [];
  /** Empty = unrestricted; staff working rules and location hours still apply. */
  availabilityWindows: [];
  variants: [];
  depositMinor: 0;
  active: true;
  publicVisible: true;
  colour: null;
};

export type QuickAddServiceResult =
  { ok: true; body: QuickAddServiceBody } | { ok: false; errors: QuickAddServiceErrors };

/**
 * Validates the three things a quick-add asks for and fills in the defaults the full
 * Services form would have used for everything else: one vehicle at a time, anyone on
 * the team, every location, bookable straight away and shown on the booking page.
 * Anything finer — deposit, variants, offer windows, colour — is a follow-up in Services.
 */
export function buildQuickAddService(input: QuickAddServiceInput): QuickAddServiceResult {
  const errors: QuickAddServiceErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Give the service a name.";

  const durationMinutes = durationToMinutes(input.durationValue, input.durationUnit);
  if (durationMinutes === null) errors.durationMinutes = "Enter how long it takes.";

  let basePriceMinor: number | null = null;
  try {
    basePriceMinor = parseMoneyToMinor(input.price);
    if (basePriceMinor < 0) basePriceMinor = null;
  } catch {
    basePriceMinor = null;
  }
  if (basePriceMinor === null) errors.basePriceMinor = "Enter a valid price.";

  if (Object.keys(errors).length > 0 || durationMinutes === null || basePriceMinor === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    body: {
      name,
      description: null,
      category: normaliseCategory(input.category),
      durationMinutes,
      basePriceMinor,
      currency: input.currency,
      capacityMin: 1,
      capacityMax: 1,
      bookingMode: "individual",
      eligibleStaffIds: [],
      locationIds: [],
      availabilityWindows: [],
      variants: [],
      depositMinor: 0,
      active: true,
      publicVisible: true,
      colour: null,
    },
  };
}
