/**
 * Upsells: the add-ons a service offers, the extras a visitor ticks on the public page,
 * and the offer/request loop after a staff-made booking. Kept out of `hooks.ts`; same
 * conventions (business-scoped keys, problem+json toasts). Gated by the `upsells` plan
 * feature — Business and Growth include it, Solo buys the £5/month bolt-on.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, queryKeys, toastApiError } from "@/lib/api";
import { useBusinessId, usePlanFeature, useSubscription } from "@/lib/api/hooks";
import type { SubscriptionAddon, SubscriptionView } from "@/lib/api/hooks";
import type {
  BookingUpsellSummary,
  PublicUpsellOffer,
  PublicUpsellOfferPage,
  ServiceUpsell,
  UpsellOffer,
  UpsellOfferStatus,
} from "@/lib/api/types";

export type {
  BookingUpsellSummary,
  PublicServiceUpsell,
  PublicUpsellOffer,
  PublicUpsellOfferPage,
  ServiceUpsell,
  UpsellOffer,
  UpsellOfferStatus,
} from "@/lib/api/types";

export const UPSELLS_FEATURE_KEY = "upsells";
export const UPSELLS_ADDON_KEY = "upsells";
export const MAX_UPSELLS_PER_SERVICE = 5;
export const MAX_UPSELL_PITCH_LENGTH = 160;

/* ---------------- Entitlement ---------------- */

/** `undefined` while the subscription loads — don't flash a paywall before we know. */
export function useUpsellsEntitled(): boolean | undefined {
  return usePlanFeature(UPSELLS_FEATURE_KEY);
}

const DEFAULT_UPSELLS_ADDON: Omit<SubscriptionAddon, "status"> = {
  key: UPSELLS_ADDON_KEY,
  featureKey: UPSELLS_FEATURE_KEY,
  unitAmountMinor: 500,
  currency: "GBP",
  interval: "month",
};

/** The upsells bolt-on row; falls back to the default price when the API didn't list it. */
export function upsellsAddonFrom(
  view: SubscriptionView | undefined,
): SubscriptionAddon | undefined {
  if (!view) return undefined;
  const listed = view.addons?.find((a) => a.key === UPSELLS_ADDON_KEY);
  if (listed) return listed;
  return {
    ...DEFAULT_UPSELLS_ADDON,
    status: view.features?.[UPSELLS_FEATURE_KEY] === true ? "included" : "available",
  };
}

export function isFeatureNotAvailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "FEATURE_NOT_AVAILABLE";
}

export function useUpsellsAddon(): SubscriptionAddon | undefined {
  const subscription = useSubscription();
  return upsellsAddonFrom(subscription.data);
}

/* ---------------- Service pairings (staff) ---------------- */

export type UpsellItemInput = {
  upsellServiceId: string;
  priceMinor?: number | null;
  pitch?: string | null;
};

export function useServiceUpsells(serviceId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.serviceUpsells(businessId, serviceId ?? ""),
    enabled: Boolean(businessId && serviceId),
    queryFn: async () => {
      const res = await api.get<{ items: ServiceUpsell[] }>(
        `/api/v1/businesses/${businessId}/services/${serviceId}/upsells`,
      );
      return res.data.items;
    },
  });
}

/** Replaces the whole list, in order. 403 FEATURE_NOT_AVAILABLE when not entitled. */
export function useReplaceServiceUpsells() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { serviceId: string; items: UpsellItemInput[] }) => {
      const res = await api.put<{ items: ServiceUpsell[] }>(
        `/api/v1/businesses/${businessId}/services/${vars.serviceId}/upsells`,
        { items: vars.items },
      );
      return res.data.items;
    },
    onSuccess: (items, vars) => {
      qc.setQueryData(queryKeys.serviceUpsells(businessId, vars.serviceId), items);
      void qc.invalidateQueries({ queryKey: queryKeys.publicServices(businessId) });
    },
  });
}

/* ---------------- Offers (staff) ---------------- */

export function useUpsellOffers(
  statuses: readonly UpsellOfferStatus[] = ["requested"],
  options: { enabled?: boolean } = {},
) {
  const businessId = useBusinessId();
  const query = { status: statuses.join(",") };
  return useQuery({
    queryKey: queryKeys.upsellOffers(businessId, query),
    enabled: Boolean(businessId) && options.enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ offers: UpsellOffer[] }>(
        `/api/v1/businesses/${businessId}/upsell-offers`,
        { query },
      );
      return res.data.offers;
    },
  });
}

/** How many add-on requests await staff — Overview task and badges. */
export function useUpsellOffersSummary(options: { enabled?: boolean } = {}) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.upsellOffersSummary(businessId),
    enabled: Boolean(businessId) && options.enabled !== false,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<{ requested: number }>(
        `/api/v1/businesses/${businessId}/upsell-offers/summary`,
      );
      return res.data;
    },
  });
}

/**
 * The offer on one booking, for the drawer banner. Reads the booking endpoint's
 * `upsellOffer` and keys under the booking so a `booking.changed` hint refreshes it.
 */
export function useBookingUpsellOffer(bookingId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: [...queryKeys.booking(businessId, bookingId ?? ""), "upsell-offer"] as const,
    enabled: Boolean(businessId && bookingId),
    queryFn: async () => {
      const res = await api.get<{ upsellOffer: BookingUpsellSummary | null }>(
        `/api/v1/businesses/${businessId}/bookings/${bookingId}`,
      );
      return res.data.upsellOffer ?? null;
    },
  });
}

export function useDeclineUpsellOffer() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const res = await api.post<{ offer: UpsellOffer }>(
        `/api/v1/businesses/${businessId}/upsell-offers/${offerId}/decline`,
        {},
      );
      return res.data.offer;
    },
    onSettled: (offer) => {
      void qc.invalidateQueries({ queryKey: queryKeys.upsellOffers(businessId) });
      if (offer) {
        void qc.invalidateQueries({ queryKey: queryKeys.booking(businessId, offer.bookingId) });
      }
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Public offer page ---------------- */

export function usePublicUpsellOffer(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicUpsellOffer(token ?? ""),
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const res = await api.get<PublicUpsellOfferPage>(
        `/api/v1/public/upsell-offers/${encodeURIComponent(token!)}`,
        { public: true },
      );
      return res.data;
    },
  });
}

export function useRequestUpsell(token: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (serviceIds: string[]) => {
      const res = await api.post<{ offer: PublicUpsellOffer }>(
        `/api/v1/public/upsell-offers/${encodeURIComponent(token!)}/request`,
        { serviceIds },
        { public: true },
      );
      return res.data.offer;
    },
    onSuccess: (offer) => {
      qc.setQueryData<PublicUpsellOfferPage>(queryKeys.publicUpsellOffer(token ?? ""), (prev) =>
        prev ? { ...prev, offer } : prev,
      );
    },
  });
}
