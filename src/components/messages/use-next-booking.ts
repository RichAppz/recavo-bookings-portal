import { useMemo } from "react";
import { useCustomerBookings } from "@/lib/api/hooks";
import { isUpcomingBooking } from "@/lib/client-profile";

/** The next upcoming booking for a client, shared by the panel and the phone header. */
export function useNextBooking(customerId: string | undefined) {
  const bookings = useCustomerBookings(customerId);
  return useMemo(() => {
    const list = bookings.data ?? [];
    const now = Date.now();
    const next = list
      .filter((b) => isUpcomingBooking(b, now))
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    return { next: next ?? null, count: list.length, loading: bookings.isLoading };
  }, [bookings.data, bookings.isLoading]);
}
