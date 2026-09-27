import type { BusinessConfiguration } from "@/lib/api/types";
import { HEX_COLOUR } from "@/lib/payment-colours";

/**
 * The colour an event is born with when nobody has chosen one, in the app and
 * the API alike (`DEFAULT_BLOCK_COLOUR` there). Events saved with it are read as
 * "no preference", so they follow the business's own default when it sets one.
 */
export const STOCK_EVENT_COLOUR = "#64748B";

/** The colour new events start with for this business. */
export function defaultEventColour(config: BusinessConfiguration | null | undefined): string {
  const custom = config?.calendar?.eventColour;
  return custom && HEX_COLOUR.test(custom) ? custom.toUpperCase() : STOCK_EVENT_COLOUR;
}

/**
 * The colour to draw a saved event in. A hand-picked colour is kept; the stock
 * slate follows the business default so recolouring "Events" in the legend
 * repaints every event that was left as it came.
 */
export function eventColourFor(
  stored: string,
  config: BusinessConfiguration | null | undefined,
): string {
  return stored.toUpperCase() === STOCK_EVENT_COLOUR ? defaultEventColour(config) : stored;
}

export type PublicHolidayRegion = NonNullable<
  NonNullable<BusinessConfiguration["calendar"]>["publicHolidays"]
>;

/** The three sets gov.uk publishes, in the order they are usually listed. */
export const PUBLIC_HOLIDAY_REGIONS: { value: PublicHolidayRegion; label: string }[] = [
  { value: "england-and-wales", label: "England & Wales" },
  { value: "scotland", label: "Scotland" },
  { value: "northern-ireland", label: "Northern Ireland" },
];

export function publicHolidayRegionFrom(
  config: BusinessConfiguration | null | undefined,
): PublicHolidayRegion | null {
  const value = config?.calendar?.publicHolidays ?? null;
  return PUBLIC_HOLIDAY_REGIONS.some((r) => r.value === value) ? value : null;
}
