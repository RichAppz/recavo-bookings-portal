import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api, ApiError, queryKeys } from "@/lib/api";
import {
  bookingsQueryOptions,
  useBusinessId,
  useCalendarBlocks,
  useLocationFilter,
} from "@/lib/api/hooks";
import type { Booking, Dashboard } from "@/lib/api/types";
import { reportRange, type IsoRange } from "@/lib/report-range";
import { addDaysIso, localDay, segmentOn } from "@/lib/working-days";
import { isLiveBooking, trendBuckets, type Period } from "@/lib/overview";

const LIVE_MS = 60_000;

/** A bookings list that re-reads every minute (Today, Up next, attention: spec §5). */
function useLiveBookings(range: IsoRange | null, opts: { limit?: number; live?: boolean } = {}) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  return useQuery({
    ...bookingsQueryOptions(businessId, locationId, {
      from: range?.from ?? "",
      to: range?.to ?? "",
      ...(opts.limit ? { limit: opts.limit } : {}),
    }),
    enabled: Boolean(businessId && range),
    refetchInterval: opts.live === false ? false : LIVE_MS,
  });
}

/** Today's live sessions in time order; a multi-day job that skips today is left out. */
export function useTodayBookings(timeZone: string, now: Date) {
  const today = localDay(now.toISOString(), timeZone);
  const range = useMemo(() => reportRange(today, today, timeZone), [today, timeZone]);
  const query = useLiveBookings(range, { limit: 200 });
  const bookings = useMemo(
    () =>
      (query.data?.bookings ?? [])
        .filter((b) => b.status !== "cancelled_by_customer" && b.status !== "cancelled_by_business")
        .filter((b) => segmentOn(b, today, b.timezone || timeZone) !== null)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [query.data, today, timeZone],
  );
  const events = useCalendarBlocks({ ...range });
  return { query, bookings, events, range };
}

/**
 * Two weeks back to a week ahead: the next session (and tomorrow's first), money
 * still to collect and finished sessions nobody has marked.
 */
export function useActionWindow(timeZone: string, now: Date) {
  const today = localDay(now.toISOString(), timeZone);
  const range = useMemo(
    () => reportRange(addDaysIso(today, -14), addDaysIso(today, 7), timeZone),
    [today, timeZone],
  );
  const query = useLiveBookings(range, { limit: 200 });
  const bookings = useMemo(() => (query.data?.bookings ?? []).filter(isLiveBooking), [query.data]);
  return { query, bookings };
}

/** The whole calendar period's sessions (first 200): still to collect and busiest day. */
export function usePeriodBookings(
  fromDate: string | undefined,
  endDate: string | undefined,
  timeZone: string,
) {
  const range = useMemo(
    () => (fromDate && endDate ? reportRange(fromDate, endDate, timeZone) : null),
    [fromDate, endDate, timeZone],
  );
  const query = useLiveBookings(range, { limit: 200, live: false });
  return { query, bookings: (query.data?.bookings ?? []) as Booking[] };
}

function dashboardQuery(
  businessId: string,
  locationId: string | undefined,
  range: IsoRange | null,
  enabled: boolean,
) {
  const query = {
    ...(range ? { from: range.from, to: range.to } : {}),
    ...(locationId ? { locationId } : {}),
  };
  return {
    queryKey: queryKeys.dashboard(businessId, query),
    enabled: Boolean(businessId) && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get<{ dashboard: Dashboard }>(
        `/api/v1/businesses/${businessId}/reports/dashboard`,
        { query },
      );
      return res.data.dashboard;
    },
    retry: (count: number, err: unknown) => {
      if (err instanceof ApiError && (err.code === "FEATURE_NOT_AVAILABLE" || err.isForbidden)) {
        return false;
      }
      return count < 2;
    },
  };
}

/** The period to date and the same days of the one before. */
export function usePeriodDashboards(
  range: IsoRange | null,
  previous: IsoRange | null,
  enabled: boolean,
) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const current = useQuery(dashboardQuery(businessId, locationId, range, enabled));
  const prev = useQuery(
    dashboardQuery(businessId, locationId, previous, enabled && Boolean(previous)),
  );
  return { current, previous: prev };
}

/** Twelve dashboards, one per trend bucket (desktop only; cached for 5 minutes). */
export function useTrend(period: Period, timeZone: string, now: Date, enabled: boolean) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const today = localDay(now.toISOString(), timeZone);
  const buckets = useMemo(
    () => trendBuckets(period, timeZone, new Date(`${today}T12:00:00Z`)),
    [period, timeZone, today],
  );
  const results = useQueries({
    queries: buckets.map((b) =>
      dashboardQuery(businessId, locationId, reportRange(b.fromDate, b.toDate, timeZone), enabled),
    ),
  });
  const ready = enabled && results.length > 0 && results.every((r) => r.isSuccess);
  return ready ? results.map((r) => r.data as Dashboard) : null;
}
