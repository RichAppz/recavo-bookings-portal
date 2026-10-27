import { useTenant } from "@/lib/tenant/tenant-context";

/** The business's word for a booking ("Job", "Session") in the forms copy needs. */
export function bookingWords(term: string | null | undefined, industry?: string | null) {
  const one = term?.trim() || "Booking";
  const lower = one.toLowerCase();
  const plural = lower.endsWith("s") ? lower : `${lower}s`;
  return {
    one: one.charAt(0).toUpperCase() + one.slice(1),
    lower,
    plural,
    Plural: plural.charAt(0).toUpperCase() + plural.slice(1),
    detailing: industry === "car_detailing",
  };
}

export type BookingWords = ReturnType<typeof bookingWords>;

export function useBookingWords(): BookingWords {
  const tenant = useTenant();
  return bookingWords(tenant.terminology.booking, tenant.business?.industryTemplateKey);
}
