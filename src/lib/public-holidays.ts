import { useQuery } from "@tanstack/react-query";
import type { PublicHolidayRegion } from "@/lib/calendar-settings";

/**
 * UK bank holidays, straight from gov.uk. One small public JSON document covers
 * all three legal sets for about ten years either side of today, with substitute
 * days already worked out (Christmas Day on a Saturday → Monday off), so there is
 * nothing to compute here. Fetched by the browser — the feed allows any origin —
 * and cached for the day; the API only stores which set the business wants.
 */
const FEED_URL = "https://www.gov.uk/bank-holidays.json";

export type PublicHoliday = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  title: string;
  /** e.g. "Substitute day" — gov.uk's note when the date moved. */
  notes: string;
};

type Feed = Record<PublicHolidayRegion, { events: PublicHoliday[] }>;

async function fetchFeed(): Promise<Feed> {
  const res = await fetch(FEED_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`gov.uk bank holidays: HTTP ${res.status}`);
  return (await res.json()) as Feed;
}

/**
 * Holidays for `region`, sorted by date; `[]` while loading, on error, or when
 * the business shows none. The feed is fetched at most once a day per tab and
 * never blocks the calendar — bookings render whether or not it arrives.
 */
export function usePublicHolidays(region: PublicHolidayRegion | null): {
  holidays: PublicHoliday[];
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ["public-holidays", "gov.uk"],
    queryFn: fetchFeed,
    enabled: region !== null,
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
    retry: 1,
  });
  const events = region && query.data ? (query.data[region]?.events ?? []) : [];
  return {
    holidays: events.map((e) => ({ date: e.date, title: e.title, notes: e.notes ?? "" })),
    isError: query.isError,
  };
}
