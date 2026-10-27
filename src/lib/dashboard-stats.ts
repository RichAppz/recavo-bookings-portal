/**
 * The fourth key number on the Overview and Reports pages depends on the trade.
 *
 * Occupancy is seats booked ÷ capacity across confirmed bookings. A class-based
 * business (trainers, studios) fills seats in a session, so it means something. A
 * detailing job is always one car in one slot — 1 of 1 — so the figure can only ever
 * read 0% or 100% and tells the business nothing. Those businesses get the average
 * value of a job instead, which the dashboard can already compute.
 */
export type FourthStat =
  { kind: "occupancy" } | { kind: "average_job_value"; averageMinor: number | null; count: number };

export function usesOccupancy(industryTemplateKey: string | null | undefined): boolean {
  return industryTemplateKey !== "car_detailing";
}

/** Average booked value per job, rounded to the nearest minor unit; null with no jobs. */
export function averageJobValueMinor(bookings: {
  count: number;
  valueMinor: number;
}): number | null {
  if (!Number.isFinite(bookings.count) || bookings.count <= 0) return null;
  return Math.round(bookings.valueMinor / bookings.count);
}

export function fourthStatFor(
  industryTemplateKey: string | null | undefined,
  bookings: { count: number; valueMinor: number },
): FourthStat {
  if (usesOccupancy(industryTemplateKey)) return { kind: "occupancy" };
  return {
    kind: "average_job_value",
    averageMinor: averageJobValueMinor(bookings),
    count: bookings.count,
  };
}
