/**
 * Services catalogue extras: the saved category order, how often each service was
 * booked (delete vs archive), the drag-to-reorder save, and where each service is
 * offered as an add-on. Kept out of `hooks.ts`; same conventions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys, toastApiError } from "@/lib/api";
import { useBusinessId } from "@/lib/api/hooks";
import type { BusinessConfiguration, CatalogueService } from "@/lib/api/types";

export type ServiceUsage = {
  serviceId: string;
  bookingCount: number;
  upcomingBookingCount: number;
  canDelete: boolean;
};

export type UpsellPairing = {
  serviceId: string;
  upsellServiceId: string;
  priceMinor: number | null;
  pitch: string | null;
};

export const BOOKING_RULE_KEYS = [
  "bufferBeforeMinutes",
  "bufferAfterMinutes",
  "bookingNoticeMinutes",
  "bookingHorizonDays",
  "cancellationWindowHours",
] as const;
export type BookingRuleKey = (typeof BOOKING_RULE_KEYS)[number];
export type BookingRuleDefaults = Record<BookingRuleKey, number>;

/** What a service follows when it doesn't set a rule itself. */
export function bookingRuleDefaults(
  config: BusinessConfiguration | null | undefined,
): BookingRuleDefaults {
  const booking = (config?.booking ?? {}) as Partial<Record<BookingRuleKey, number>>;
  return {
    bufferBeforeMinutes: booking.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: booking.bufferAfterMinutes ?? 0,
    bookingNoticeMinutes: booking.bookingNoticeMinutes ?? 0,
    bookingHorizonDays: booking.bookingHorizonDays ?? 90,
    cancellationWindowHours: booking.cancellationWindowHours ?? 24,
  };
}

export function serviceRuleValue(service: CatalogueService, key: BookingRuleKey): number {
  return key === "cancellationWindowHours" ? service.cancellationPolicy.windowHours : service[key];
}

/** Rules the service set itself. Older API responses have no list: everything follows. */
export function serviceRuleOverrides(service: CatalogueService): BookingRuleKey[] {
  const raw = (service as { ruleOverrides?: readonly string[] }).ruleOverrides ?? [];
  return BOOKING_RULE_KEYS.filter((k) => raw.includes(k));
}

export function useServiceCategoryOrder() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.serviceCategoryOrder(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ categoryOrder?: string[] }>(
        `/api/v1/businesses/${businessId}/services`,
      );
      return res.data.categoryOrder ?? [];
    },
  });
}

export function useServiceUsage(opts: { enabled?: boolean } = {}) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.serviceUsage(businessId),
    enabled: Boolean(businessId) && opts.enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ usage: ServiceUsage[] }>(
        `/api/v1/businesses/${businessId}/services/usage`,
      );
      return new Map((res.data.usage ?? []).map((u) => [u.serviceId, u]));
    },
  });
}

export function useUpsellPairings(opts: { enabled?: boolean } = {}) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.upsellPairings(businessId),
    enabled: Boolean(businessId) && opts.enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ pairings: UpsellPairing[] }>(
        `/api/v1/businesses/${businessId}/upsells/pairings`,
      );
      return res.data.pairings ?? [];
    },
  });
}

/**
 * Saves the catalogue order. The list moves at once (optimistic) and rolls back
 * if the save fails; order changes don't bump service versions.
 */
export function useReorderServices() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { serviceIds: string[]; categoryOrder?: string[] }) => {
      const res = await api.post<{ services: CatalogueService[]; categoryOrder: string[] }>(
        `/api/v1/businesses/${businessId}/services/order`,
        vars,
      );
      return res.data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: queryKeys.services(businessId), exact: true });
      const prevServices = qc.getQueryData<CatalogueService[]>(queryKeys.services(businessId));
      const prevOrder = qc.getQueryData<string[]>(queryKeys.serviceCategoryOrder(businessId));
      if (prevServices) {
        const position = new Map(vars.serviceIds.map((id, i) => [id, i]));
        qc.setQueryData<CatalogueService[]>(queryKeys.services(businessId), (old) =>
          old
            ?.map((s) => (position.has(s.id) ? { ...s, displayOrder: position.get(s.id)! } : s))
            .sort((a, b) => a.displayOrder - b.displayOrder),
        );
      }
      if (vars.categoryOrder) {
        qc.setQueryData(queryKeys.serviceCategoryOrder(businessId), vars.categoryOrder);
      }
      return { prevServices, prevOrder };
    },
    onError: (err, _vars, context) => {
      if (context?.prevServices) {
        qc.setQueryData(queryKeys.services(businessId), context.prevServices);
      }
      if (context?.prevOrder) {
        qc.setQueryData(queryKeys.serviceCategoryOrder(businessId), context.prevOrder);
      }
      toastApiError(err);
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.serviceCategoryOrder(businessId), data.categoryOrder);
      void qc.invalidateQueries({ queryKey: queryKeys.services(businessId), exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.publicServices(businessId) });
    },
  });
}
