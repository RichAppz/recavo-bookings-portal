import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useEffect, useRef } from "react";
import {
  bookingHistoryQueryOptions,
  bookingPaymentsQueryOptions,
  bookingQueryOptions,
  bookingsQueryOptions,
  calendarBlocksQueryOptions,
  customerQueryOptions,
  linkedRecordQueryOptions,
  useBusinessId,
  useLocationFilter,
  useLocationsList,
  useServices,
  useStaffList,
} from "@/lib/api/hooks";
import { invoicesQueryOptions } from "@/lib/api/invoices";
import { isOnline } from "@/lib/offline/network";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * "Today's pack": what someone on the road needs if the signal goes.
 *
 * While the app is open and online it quietly fetches today's and tomorrow's
 * jobs — the day-view calendar queries exactly as the Calendar page asks for
 * them — then each job's detail, client, vehicle/record, history, payments and
 * invoices, using the same query options the booking panel uses, so opening any
 * of them offline is a cache hit. Runs on launch, when the app comes back to the
 * foreground, when connectivity returns, and every REFRESH_MS in between.
 * Bounded by MAX_JOBS so a very busy business isn't hammered.
 */
const REFRESH_MS = 15 * 60_000;
/** Don't re-run within this of the last run (foreground flaps, quick tab switches). */
const MIN_GAP_MS = 60_000;
const MAX_JOBS = 60;
/** Treat data younger than this as good enough — no point refetching a job every run. */
const PACK_STALE_MS = 10 * 60_000;

export function OfflinePack() {
  const tenant = useTenant();
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const qc = useQueryClient();
  const lastRun = useRef(0);

  const canRead =
    tenant.can(PERMISSIONS.BOOKING_READ_ALL) || tenant.can(PERMISSIONS.BOOKING_READ_OWN);
  const canCustomers = tenant.can(PERMISSIONS.CUSTOMER_READ);

  // The basics every page leans on; keeping them mounted keeps them fresh.
  useStaffList();
  useServices();
  useLocationsList();

  useEffect(() => {
    if (!businessId || !canRead) return;
    let cancelled = false;

    const run = (force = false) => {
      if (cancelled || !isOnline()) return;
      const now = Date.now();
      if (!force && now - lastRun.current < MIN_GAP_MS) return;
      lastRun.current = now;
      void prefetchPack(qc, { businessId, locationId, customers: canCustomers });
    };

    run(true);
    const timer = setInterval(() => run(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onOnline = () => run(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [qc, businessId, locationId, canRead, canCustomers]);

  return null;
}

async function prefetchPack(
  qc: QueryClient,
  opts: { businessId: string; locationId: string | undefined; customers: boolean },
) {
  const { businessId, locationId } = opts;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [today, addDays(today, 1)];

  const warm = <T extends { queryKey: readonly unknown[] }>(options: T) =>
    qc
      .prefetchQuery({ ...options, staleTime: PACK_STALE_MS } as Parameters<
        QueryClient["prefetchQuery"]
      >[0])
      .catch(() => undefined);

  // Day views for today and tomorrow, plus the events beside them.
  const lists = await Promise.all(
    days.map((start) => {
      const range = { from: start.toISOString(), to: addDays(start, 1).toISOString() };
      void warm(calendarBlocksQueryOptions(businessId, locationId, range));
      const options = bookingsQueryOptions(businessId, locationId, { ...range, limit: 200 });
      return qc
        .fetchQuery({ ...options, staleTime: PACK_STALE_MS })
        .then((d) => d.bookings)
        .catch(() => []);
    }),
  );

  const seen = new Set<string>();
  const jobs = lists
    .flat()
    .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, MAX_JOBS);

  // Sequential per job (four to six small requests each) so the pack never
  // competes with what the person is actually doing on screen.
  for (const b of jobs) {
    if (!isOnline()) return;
    await Promise.all([
      warm(bookingQueryOptions(businessId, b.id)),
      warm(bookingHistoryQueryOptions(businessId, b.id)),
      warm(bookingPaymentsQueryOptions(businessId, b.id)),
      warm(invoicesQueryOptions(businessId, { bookingId: b.id })),
      opts.customers && b.leadCustomerId
        ? warm(customerQueryOptions(businessId, b.leadCustomerId))
        : undefined,
      opts.customers && b.linkedRecordId
        ? warm(linkedRecordQueryOptions(businessId, b.linkedRecordId))
        : undefined,
    ]);
  }
}
