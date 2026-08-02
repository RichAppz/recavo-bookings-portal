import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  createIdempotentMutationFn,
  newIdempotencyKey,
  queryKeys,
  toastApiError,
  usePaginatedQuery,
} from "@/lib/api";
import type {
  AvailabilitySlot,
  Booking,
  BookingHistoryEntry,
  CatalogueService,
  ConnectAccount,
  ConsentRecord,
  Conversation,
  ConversationMessage,
  CreditLedgerEntry,
  Customer,
  CustomerNote,
  CustomerTag,
  Dashboard,
  Entitlement,
  EntitlementView,
  Invitation,
  Location,
  Notification,
  Package,
  PackagePurchase,
  Payment,
  PaymentReceipt,
  PublicCataloguePlan,
  Refund,
  Resource,
  Staff,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";

export function useBusinessId() {
  const { businessId } = useTenant();
  return businessId;
}

export function useLocationFilter() {
  const { currentLocationId } = useTenant();
  return currentLocationId === "all" ? undefined : currentLocationId;
}

/* ---------------- Bookings ---------------- */

export function useBookings(filters: {
  from: string;
  to: string;
  staffId?: string;
  status?: string;
  enabled?: boolean;
}) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const query = {
    from: filters.from,
    to: filters.to,
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(locationId ? { locationId } : {}),
  };

  return useQuery({
    queryKey: queryKeys.bookings(businessId, query),
    enabled: Boolean(businessId) && filters.enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ bookings: Booking[]; nextCursor?: string | null }>(
        `/api/v1/businesses/${businessId}/bookings`,
        { query },
      );
      return res.data;
    },
  });
}

export function useBooking(bookingId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.booking(businessId, bookingId ?? ""),
    enabled: Boolean(businessId && bookingId),
    queryFn: async () => {
      const res = await api.get<{ booking: Booking }>(
        `/api/v1/businesses/${businessId}/bookings/${bookingId}`,
      );
      return res.data.booking;
    },
  });
}

export function useAvailability(filters: {
  serviceId?: string;
  locationId?: string;
  from?: string;
  to?: string;
  variantId?: string;
  staffId?: string;
  enabled?: boolean;
}) {
  const businessId = useBusinessId();
  const ready =
    Boolean(businessId && filters.serviceId && filters.locationId && filters.from && filters.to) &&
    filters.enabled !== false;

  const query = {
    serviceId: filters.serviceId!,
    locationId: filters.locationId!,
    from: filters.from!,
    to: filters.to!,
    ...(filters.variantId ? { variantId: filters.variantId } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
  };

  return useQuery({
    queryKey: queryKeys.availability(businessId, query),
    enabled: ready,
    queryFn: async () => {
      const res = await api.get<{ slots: AvailabilitySlot[] }>(
        `/api/v1/businesses/${businessId}/availability`,
        { query },
      );
      return res.data.slots;
    },
  });
}

export function useCreateBooking() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: Record<string, unknown>, idempotencyKey: string) => {
        const res = await api.post<{ booking: Booking }>(
          `/api/v1/businesses/${businessId}/bookings`,
          body,
          { idempotencyKey },
        );
        return res.data.booking;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "bookings"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCreateBookingHold() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: Record<string, unknown>, idempotencyKey: string) => {
        const res = await api.post<{ booking: Booking }>(
          `/api/v1/businesses/${businessId}/booking-holds`,
          body,
          { idempotencyKey },
        );
        return res.data.booking;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

export function useBookingAction(action: "confirm" | "cancel" | "reschedule" | "attendance") {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      Booking,
      { bookingId: string; body?: Record<string, unknown>; ifMatch?: number }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ booking: Booking }>(
        `/api/v1/businesses/${businessId}/bookings/${vars.bookingId}/${action}`,
        vars.body ?? {},
        { idempotencyKey, ifMatch: vars.ifMatch },
      );
      return res.data.booking;
    }),
    onSuccess: (_data, vars) => {
      // Prefix-matches the bookings list query key, which also covers the
      // calendar view (same hook, different filters) — refreshes both.
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "bookings"] });
      void qc.invalidateQueries({
        queryKey: queryKeys.booking(businessId, vars.bookingId),
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.bookingHistory(businessId, vars.bookingId),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useBookingHistory(bookingId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.bookingHistory(businessId, bookingId ?? ""),
    enabled: Boolean(businessId && bookingId),
    queryFn: async () => {
      const res = await api.get<{ history: BookingHistoryEntry[] }>(
        `/api/v1/businesses/${businessId}/bookings/${bookingId}/history`,
      );
      return res.data.history;
    },
  });
}

export function useBookingPayments(bookingId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.bookingPayments(businessId, bookingId ?? ""),
    enabled: Boolean(businessId && bookingId),
    queryFn: async () => {
      const res = await api.get<{ payments: Payment[] }>(
        `/api/v1/businesses/${businessId}/bookings/${bookingId}/payments`,
      );
      return res.data.payments;
    },
  });
}

export function useTakeBookingPayment() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      { payment?: Payment; clientSecret?: string | null },
      { bookingId: string }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ payment?: Payment; clientSecret?: string | null }>(
        `/api/v1/businesses/${businessId}/bookings/${vars.bookingId}/payment`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "bookings"] });
      void qc.invalidateQueries({
        queryKey: queryKeys.booking(businessId, vars.bookingId),
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.bookingPayments(businessId, vars.bookingId),
      });
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "payments"] });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Catalogue / staff / locations ---------------- */

export function useServices() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.services(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ services: CatalogueService[] }>(
        `/api/v1/businesses/${businessId}/services`,
      );
      return res.data.services;
    },
  });
}

export function useCreateService() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ service: CatalogueService }>(
        `/api/v1/businesses/${businessId}/services`,
        body,
      );
      return res.data.service;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.services(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateService() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      serviceId: string;
      version: number;
      body: Record<string, unknown>;
    }) => {
      const res = await api.patch<{ service: CatalogueService }>(
        `/api/v1/businesses/${businessId}/services/${vars.serviceId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.service;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.services(businessId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.services(businessId) });
      }
      toastApiError(err);
    },
  });
}

export function useStaffList() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.staff(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ staff: Staff[] }>(`/api/v1/businesses/${businessId}/staff`);
      return res.data.staff;
    },
  });
}

/**
 * Creates an active staff seat directly (as distinct from `useInviteStaff`,
 * which sends an email invitation). Reserves `staff.active` plan capacity —
 * 409 PLAN_LIMIT_EXCEEDED / 402 BILLING_ACCESS_REQUIRED surface via toast.
 */
export function useCreateStaff() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ staff: Staff }>(`/api/v1/businesses/${businessId}/staff`, body);
      return res.data.staff;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateStaff() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      staffId: string;
      version: number;
      body: Record<string, unknown>;
    }) => {
      const res = await api.patch<{ staff: Staff }>(
        `/api/v1/businesses/${businessId}/staff/${vars.staffId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.staff;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useInviteStaff() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (vars: {
      email: string;
      roleKeys: string[];
      locationScopeIds?: string[] | null;
    }) => {
      const res = await api.post<{ invitation: Invitation; token: string }>(
        `/api/v1/businesses/${businessId}/invitations`,
        vars,
      );
      return res.data;
    },
    onError: (err) => toastApiError(err),
  });
}

export function useLocationsList() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.locations(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ locations: Location[] }>(
        `/api/v1/businesses/${businessId}/locations`,
      );
      return res.data.locations;
    },
  });
}

export function useCreateLocation() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ location: Location }>(
        `/api/v1/businesses/${businessId}/locations`,
        body,
      );
      return res.data.location;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateLocation() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      locationId: string;
      version: number;
      body: Record<string, unknown>;
    }) => {
      const res = await api.patch<{ location: Location }>(
        `/api/v1/businesses/${businessId}/locations/${vars.locationId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.location;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
      }
      toastApiError(err);
    },
  });
}

/**
 * Bookable resources (rooms/bays/chairs/equipment). A service's
 * `requiredResourceType` (if set) must match a resource's `type` for that
 * resource to satisfy the service's booking requirement.
 */
export function useResources() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.resources(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ resources: Resource[] }>(
        `/api/v1/businesses/${businessId}/resources`,
      );
      return res.data.resources;
    },
  });
}

export function useCreateResource() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; type: string; locationId?: string | null }) => {
      const res = await api.post<{ resource: Resource }>(
        `/api/v1/businesses/${businessId}/resources`,
        body,
      );
      return res.data.resource;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.resources(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

/**
 * Activates/deactivates a resource. Note: unlike most write endpoints this
 * one does not take an If-Match header (the API's body is `{ active }` only).
 */
export function useUpdateResource() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { resourceId: string; active: boolean }) => {
      const res = await api.patch<{ resource: Resource }>(
        `/api/v1/businesses/${businessId}/resources/${vars.resourceId}`,
        { active: vars.active },
      );
      return res.data.resource;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.resources(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Customers ---------------- */

export function useCustomers(
  filters: { search?: string; status?: string; enabled?: boolean } = {},
) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  return useQuery({
    queryKey: queryKeys.customers(businessId, query),
    enabled: Boolean(businessId) && filters.enabled !== false,
    queryFn: async () => {
      const res = await api.get<{ items: Customer[]; nextCursor?: string | null }>(
        `/api/v1/businesses/${businessId}/customers`,
        { query },
      );
      return res.data;
    },
  });
}

/** Cursor-paginated customer list for the clients page (search + status + Load more). */
export function useCustomersInfinite(filters: { search?: string; status?: string } = {}) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  return usePaginatedQuery<Customer, "items">({
    queryKey: [...queryKeys.customers(businessId, query), "infinite"],
    path: `/api/v1/businesses/${businessId}/customers`,
    listKey: "items",
    query,
    limit: 20,
    enabled: Boolean(businessId),
  });
}

export function useCustomer(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customer(businessId, customerId ?? ""),
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}`,
      );
      return res.data.customer;
    },
  });
}

export function useCustomerBookings(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: [...queryKeys.customer(businessId, customerId ?? ""), "bookings"] as const,
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ bookings: Booking[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/bookings`,
      );
      return res.data.bookings;
    },
  });
}

export function useCreateCustomer() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: Record<string, unknown>, idempotencyKey: string) => {
        const res = await api.post<{ customer: Customer }>(
          `/api/v1/businesses/${businessId}/customers`,
          body,
          { idempotencyKey },
        );
        return res.data.customer;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "customers"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateCustomerStatus() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      customerId: string;
      version: number;
      status: "active" | "archived" | "anonymised";
    }) => {
      const res = await api.patch<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${vars.customerId}`,
        { status: vars.status },
        { ifMatch: vars.version },
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "customers"] });
      void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, customer.id) });
    },
    onError: (err) => toastApiError(err),
  });
}

/**
 * Generic customer PATCH under optimistic concurrency. On 409 the customer
 * query is refetched so the caller picks up the latest `version` and can retry.
 */
export function useUpdateCustomer() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      customerId: string;
      version: number;
      body: Record<string, unknown>;
    }) => {
      const res = await api.patch<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${vars.customerId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "customers"] });
      void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, customer.id) });
    },
    onError: (err, vars) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, vars.customerId) });
      }
      toastApiError(err);
    },
  });
}

/* ---------------- Customer tags & consents (RECA-78) ---------------- */

/** Business-level tag catalogue (create + list). */
export function useCustomerTagsCatalogue() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customerTagsCatalogue(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ tags: CustomerTag[] }>(
        `/api/v1/businesses/${businessId}/customer-tags`,
      );
      return res.data.tags;
    },
  });
}

export function useCreateCustomerTag() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post<{ tag: CustomerTag }>(
        `/api/v1/businesses/${businessId}/customer-tags`,
        { name },
      );
      return res.data.tag;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customerTagsCatalogue(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

/** Tags assigned to a single customer. */
export function useCustomerTags(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customerTags(businessId, customerId ?? ""),
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ tags: CustomerTag[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/tags`,
      );
      return res.data.tags;
    },
  });
}

export function useAssignCustomerTag(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await api.post<{ tag: CustomerTag }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/tags`,
        { tagId },
      );
      return res.data.tag;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerTags(businessId, customerId ?? ""),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRemoveCustomerTag(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      await api.delete(`/api/v1/businesses/${businessId}/customers/${customerId}/tags/${tagId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerTags(businessId, customerId ?? ""),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCustomerConsents(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customerConsents(businessId, customerId ?? ""),
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ consents: ConsentRecord[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/consents`,
      );
      return res.data.consents;
    },
  });
}

export function useAddCustomerConsent(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { channel: string; granted: boolean; source?: string | null }) => {
      const res = await api.post<{ consent: ConsentRecord }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/consents`,
        vars,
      );
      return res.data.consent;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerConsents(businessId, customerId ?? ""),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Customer portal link / GDPR (RECA-81, RECA-479, RECA-495) ---------------- */

/**
 * Links an existing global portal user account to this customer. The API
 * requires a known `userId` (e.g. from the customer's own portal
 * registration) — it does not mint a self-serve invite URL.
 */
export function useLinkCustomerPortalUser() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { customerId: string; userId: string }) => {
      const res = await api.post<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${vars.customerId}/portal-link`,
        { userId: vars.userId },
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, customer.id) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRequestCustomerDsarExport() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(async (customerId: string, idempotencyKey: string) => {
      const res = await api.post<Record<string, unknown>>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/dsar-export`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onError: (err) => toastApiError(err),
  });
}

export function useAnonymiseCustomer() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customerId: string) => {
      const res = await api.post<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/anonymise`,
        {},
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "customers"] });
      void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, customer.id) });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Packages / payments / dashboard ---------------- */

export function usePackages() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.packages(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ packages: Package[] }>(
        `/api/v1/businesses/${businessId}/packages`,
      );
      return res.data.packages;
    },
  });
}

export function useCreatePackage() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ package: Package }>(
        `/api/v1/businesses/${businessId}/packages`,
        body,
      );
      return res.data.package;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.packages(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdatePackage() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      packageId: string;
      version: number;
      body: Record<string, unknown>;
    }) => {
      const res = await api.patch<{ package: Package }>(
        `/api/v1/businesses/${businessId}/packages/${vars.packageId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.package;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.packages(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePayments(filters: Record<string, string | undefined> = {}) {
  const businessId = useBusinessId();
  const query = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
  return useQuery({
    queryKey: queryKeys.payments(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ payments: Payment[]; nextCursor?: string | null }>(
        `/api/v1/businesses/${businessId}/payments`,
        { query },
      );
      return res.data;
    },
  });
}

/**
 * Cursor-paginated payments list (RECA-500). Allow-listed filters mirror the
 * API: `from`/`to` (half-open UTC on createdAt), `state`, `customerId`.
 */
export function usePaymentsInfinite(
  filters: { from?: string; to?: string; state?: string; customerId?: string } = {},
) {
  const businessId = useBusinessId();
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => Boolean(v))) as Record<
    string,
    string
  >;
  return usePaginatedQuery<Payment, "payments">({
    queryKey: [...queryKeys.payments(businessId, query), "infinite"],
    path: `/api/v1/businesses/${businessId}/payments`,
    listKey: "payments",
    query,
    limit: 25,
    enabled: Boolean(businessId),
  });
}

/** Single payment detail (RECA-448) — kept fresh after refunds via invalidation. */
export function usePayment(paymentId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.payment(businessId, paymentId ?? ""),
    enabled: Boolean(businessId && paymentId),
    queryFn: async () => {
      const res = await api.get<{ payment: Payment }>(
        `/api/v1/businesses/${businessId}/payments/${paymentId}`,
      );
      return res.data.payment;
    },
  });
}

/** Purchase-time receipt snapshot (RECA-142) — seller/tax/amount only, no card data. */
export function usePaymentReceipt(paymentId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.paymentReceipt(businessId, paymentId ?? ""),
    enabled: Boolean(businessId && paymentId),
    queryFn: async () => {
      const res = await api.get<{ receipt: PaymentReceipt }>(
        `/api/v1/businesses/${businessId}/payments/${paymentId}/receipt`,
      );
      return res.data.receipt;
    },
  });
}

export function useConnectAccount() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.connectAccount(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ account: ConnectAccount }>(
        `/api/v1/businesses/${businessId}/connect/account`,
      );
      return res.data.account;
    },
  });
}

/** Creates (or resyncs) the Stripe Connect account and returns a hosted onboarding URL. */
export function useConnectOnboard() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ account: ConnectAccount; onboardingUrl: string }>(
        `/api/v1/businesses/${businessId}/connect/account`,
        {},
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.connectAccount(businessId), data.account);
    },
    onError: (err) => toastApiError(err),
  });
}

/** Resyncs Connect account status (charges/payouts enabled, requirements) from Stripe. */
export function useConnectSync() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ account: ConnectAccount }>(
        `/api/v1/businesses/${businessId}/connect/sync`,
        {},
      );
      return res.data.account;
    },
    onSuccess: (account) => {
      qc.setQueryData(queryKeys.connectAccount(businessId), account);
    },
    onError: (err) => toastApiError(err),
  });
}

/** Full or partial refund. Requires payment.refund; server enforces Idempotency-Key. */
export function useCreateRefund() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      Refund,
      { paymentId: string; amountMinor?: number; reasonCode: string }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ refund: Refund }>(
        `/api/v1/businesses/${businessId}/refunds`,
        vars,
        { idempotencyKey },
      );
      return res.data.refund;
    }),
    onSuccess: (_refund, vars) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "payments"] });
      void qc.invalidateQueries({ queryKey: queryKeys.payment(businessId, vars.paymentId) });
      void qc.invalidateQueries({
        queryKey: queryKeys.paymentReceipt(businessId, vars.paymentId),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useDashboard(filters: { from?: string; to?: string } = {}) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const query = {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(locationId ? { locationId } : {}),
  };
  return useQuery({
    queryKey: queryKeys.dashboard(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ dashboard: Dashboard }>(
        `/api/v1/businesses/${businessId}/reports/dashboard`,
        { query },
      );
      return res.data.dashboard;
    },
  });
}

/* ---------------- Messaging ---------------- */

export function useConversations() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.conversations(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{
        conversations: Conversation[];
        nextCursor?: string | null;
      }>(`/api/v1/businesses/${businessId}/conversations`);
      return res.data;
    },
  });
}

export function useOpenConversation() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { customerId: string; bookingId?: string | null }) => {
      const res = await api.post<{ conversation: Conversation }>(
        `/api/v1/businesses/${businessId}/conversations`,
        vars,
      );
      return res.data.conversation;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useMessages(conversationId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.messages(businessId, conversationId ?? ""),
    enabled: Boolean(businessId && conversationId),
    queryFn: async () => {
      const res = await api.get<{
        messages: ConversationMessage[];
        nextCursor?: string | null;
      }>(`/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`);
      return res.data;
    },
  });
}

type MessagePage = { messages: ConversationMessage[]; nextCursor?: string | null };

/**
 * Sends a message with optimistic UI: the draft appears immediately under a
 * client-generated id, and rolls back to the pre-send state if the request
 * fails (e.g. permission denied, rate limited).
 */
export function useSendMessage(conversationId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<
    ConversationMessage,
    ApiError,
    string,
    { previous: MessagePage | undefined; optimisticId: string }
  >({
    mutationFn: async (body: string) => {
      const res = await api.post<{ message: ConversationMessage }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`,
        { body },
      );
      return res.data.message;
    },
    onMutate: async (body) => {
      const key = queryKeys.messages(businessId, conversationId ?? "");
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MessagePage>(key);
      const optimisticId = `optimistic-${newIdempotencyKey()}`;
      const optimisticMessage: ConversationMessage = {
        id: optimisticId,
        businessId,
        conversationId: conversationId ?? "",
        senderType: "staff",
        senderId: user?.id ?? "me",
        body,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<MessagePage>(key, (old) => ({
        messages: [...(old?.messages ?? []), optimisticMessage],
        nextCursor: old?.nextCursor ?? null,
      }));
      return { previous, optimisticId };
    },
    onError: (err, _body, context) => {
      const key = queryKeys.messages(businessId, conversationId ?? "");
      if (context) qc.setQueryData<MessagePage>(key, context.previous);
      toastApiError(err);
    },
    onSuccess: (message, _body, context) => {
      const key = queryKeys.messages(businessId, conversationId ?? "");
      qc.setQueryData<MessagePage>(key, (old) => ({
        messages: (old?.messages ?? []).map((m) => (m.id === context.optimisticId ? message : m)),
        nextCursor: old?.nextCursor ?? null,
      }));
      void qc.invalidateQueries({ queryKey: queryKeys.conversations(businessId) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.messages(businessId, conversationId ?? "") });
    },
  });
}

/**
 * Bulk announcement fan-out (RECA-501): posts one message per attendee's own
 * conversation. Requires customer.update — gate the trigger UI with `Can`.
 */
export function useCreateAnnouncement() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      customerIds: string[];
      body: string;
      bookingId?: string | null;
    }) => {
      const res = await api.post<{ recipients: number; messageIds: string[] }>(
        `/api/v1/businesses/${businessId}/announcements`,
        vars,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useNotifications() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.notifications(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{
        notifications: Notification[];
        nextCursor?: string | null;
      }>(`/api/v1/businesses/${businessId}/notifications`);
      return res.data;
    },
  });
}

/** Marks a single staff notification read; optimistically stamps `readAt` for an instant badge update. */
export function useMarkNotificationRead() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await api.post<{ notification: Notification }>(
        `/api/v1/businesses/${businessId}/notifications/${notificationId}/read`,
        {},
      );
      return res.data.notification;
    },
    onMutate: async (notificationId) => {
      const key = queryKeys.notifications(businessId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ notifications: Notification[] }>(key);
      qc.setQueryData<{ notifications: Notification[] }>(key, (old) => ({
        notifications: (old?.notifications ?? []).map((n) =>
          n.id === notificationId ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
      }));
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.notifications(businessId), context.previous);
      toastApiError(err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications(businessId) });
    },
  });
}

export function useCustomerCredits(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.entitlements(businessId, { customerId }),
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ credits: EntitlementView[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/credits`,
      );
      return res.data.credits;
    },
  });
}

export function useCustomerNotes(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: [...queryKeys.customer(businessId, customerId ?? ""), "notes"] as const,
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ notes: CustomerNote[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/notes`,
      );
      return res.data.notes;
    },
  });
}

export function useAddCustomerNote(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ note: CustomerNote }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/notes`,
        { body, visibility: "internal" as const },
      );
      return res.data.note;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: [...queryKeys.customer(businessId, customerId ?? ""), "notes"],
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useAdjustEntitlement() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      CreditLedgerEntry,
      { entitlementId: string; signedUnits: number; reasonCode: string; note?: string }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ entry: CreditLedgerEntry }>(
        `/api/v1/businesses/${businessId}/entitlements/${vars.entitlementId}/adjustments`,
        { signedUnits: vars.signedUnits, reasonCode: vars.reasonCode, note: vars.note },
        { idempotencyKey },
      );
      return res.data.entry;
    }),
    onSuccess: (_entry, vars) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "entitlements"] });
      void qc.invalidateQueries({
        queryKey: queryKeys.creditLedger(businessId, { entitlementId: vars.entitlementId }),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

/** Credit ledger for an entitlement, always newest-first by ledger `seq`. */
export function useEntitlementLedger(entitlementId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.creditLedger(businessId, { entitlementId }),
    enabled: Boolean(businessId && entitlementId),
    queryFn: async () => {
      const res = await api.get<{
        entries: CreditLedgerEntry[];
        nextCursor?: string | null;
      }>(`/api/v1/businesses/${businessId}/entitlements/${entitlementId}/ledger`);
      return {
        ...res.data,
        entries: [...res.data.entries].sort((a, b) => b.seq - a.seq),
      };
    },
  });
}

/* ---------------- Packages: purchases, staff time-off, platform ---------------- */

export function useStartPackagePurchase() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { customerId: string; packageId: string }, idempotencyKey: string) => {
        const res = await api.post<{
          payment: Payment;
          clientSecret?: string | null;
          packagePurchaseId?: string | null;
        }>(`/api/v1/businesses/${businessId}/package-purchases/payment`, vars, {
          idempotencyKey,
        });
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

/**
 * Directly issues a package purchase + entitlement for an already-verified
 * payment (e.g. cash, card terminal, or an external processor charge taken
 * outside RECAVO checkout). `paymentRef` and `providerEventId` are both
 * required by the API and, together, make repeat submissions idempotent
 * server-side (spec §12.2) in addition to the Idempotency-Key header.
 */
export function useIssuePackagePurchase() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        vars: {
          customerId: string;
          packageId: string;
          paymentRef: string;
          providerEventId: string;
        },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{ purchase: PackagePurchase; entitlement: Entitlement }>(
          `/api/v1/businesses/${businessId}/package-purchases`,
          vars,
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "entitlements"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useAddStaffTimeOff() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      staffId: string;
      version: number;
      start: string;
      end: string;
      originatingTimezone: string;
      reason?: string;
    }) => {
      const res = await api.post<{ staff: Staff }>(
        `/api/v1/businesses/${businessId}/staff/${vars.staffId}/time-off`,
        {
          start: vars.start,
          end: vars.end,
          originatingTimezone: vars.originatingTimezone,
          reason: vars.reason ?? null,
        },
        { ifMatch: vars.version },
      );
      return res.data.staff;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

/** Cancels a [start, end) time-off block by id; requires the staff row's current version. */
export function useRemoveStaffTimeOff() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; timeOffId: string; version: number }) => {
      const res = await api.delete<{ staff: Staff }>(
        `/api/v1/businesses/${businessId}/staff/${vars.staffId}/time-off/${vars.timeOffId}`,
        { ifMatch: vars.version },
      );
      return res.data.staff;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
      }
      toastApiError(err);
    },
  });
}

/* ---------------- Platform / SaaS billing ---------------- */

export type BusinessSubscription = {
  id?: string;
  businessId?: string;
  planId?: string;
  status?:
    | "trialing"
    | "active"
    | "past_due"
    | "cancelled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused";
  accessState?: "none" | "pending" | "trial" | "entitled" | "grace" | "restricted" | "ended";
  planVersion?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialStart?: string | null;
  trialEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  limitCompliance?: "ok" | "over_limit" | "grace_over_limit";
};

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans(),
    queryFn: async () => {
      const res = await api.get<{ plans: PublicCataloguePlan[] }>("/api/v1/saas/plans", {
        public: true,
      });
      return res.data.plans;
    },
  });
}

export function useSubscription() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.subscription(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{
        subscription: BusinessSubscription | null;
        plan?: PublicCataloguePlan | null;
      }>(`/api/v1/businesses/${businessId}/subscription`);
      return res.data;
    },
  });
}

export function useStartCheckout() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        body: { plan: "solo" | "business" | "growth"; interval: "month" | "year" },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{ url?: string; checkoutUrl?: string }>(
          `/api/v1/businesses/${businessId}/subscription/checkout`,
          body,
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

export function useBillingPortal() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(async (_: void, idempotencyKey: string) => {
      const res = await api.post<{ url?: string; portalUrl?: string }>(
        `/api/v1/businesses/${businessId}/subscription/portal`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onError: (err) => toastApiError(err),
  });
}

export function useCancelSubscription() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(async (_: void, idempotencyKey: string) => {
      const res = await api.post(
        `/api/v1/businesses/${businessId}/subscription/cancel`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Files / exports / ops ---------------- */

export function useCreateFileUploadIntent() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        body: {
          contentType: string;
          sizeBytes: number;
          ownerType?: "customer" | "booking" | "linked_record" | "business";
          ownerId?: string;
        },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{
          file: { id: string };
          uploadUrl?: string;
          upload?: { url: string; headers?: Record<string, string> };
        }>(`/api/v1/businesses/${businessId}/files`, body, { idempotencyKey });
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

export function useCompleteFileUpload() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { fileId: string }, idempotencyKey: string) => {
        const res = await api.post(
          `/api/v1/businesses/${businessId}/files/${vars.fileId}/complete`,
          {},
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

export function useFileDownloadUrl() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await api.post<{ url?: string; downloadUrl?: string }>(
        `/api/v1/businesses/${businessId}/files/${fileId}/download-url`,
        {},
      );
      return res.data;
    },
    onError: (err) => toastApiError(err),
  });
}

/** Upload a browser File via signed intent → PUT → complete. */
export async function uploadFileViaIntent(
  businessId: string,
  file: File,
  owner?: { ownerType: "customer" | "booking" | "linked_record" | "business"; ownerId: string },
) {
  const intent = await api.post<{
    file: { id: string };
    uploadUrl?: string;
    upload?: { url: string; headers?: Record<string, string> };
  }>(
    `/api/v1/businesses/${businessId}/files`,
    {
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      ...owner,
    },
    { idempotencyKey: newIdempotencyKey() },
  );

  const uploadUrl = intent.data.uploadUrl ?? intent.data.upload?.url;
  if (!uploadUrl) throw new Error("Upload URL missing from intent response");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      ...(intent.data.upload?.headers ?? {}),
    },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  await api.post(
    `/api/v1/businesses/${businessId}/files/${intent.data.file.id}/complete`,
    {},
    { idempotencyKey: newIdempotencyKey() },
  );
  return intent.data.file;
}

export function useRequestExport() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: Record<string, unknown>, idempotencyKey: string) => {
        const res = await api.post<{ export?: { id: string }; id?: string }>(
          `/api/v1/businesses/${businessId}/exports`,
          body,
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

export function useFailedOutbox() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["biz", businessId, "admin", "outbox", "failed"] as const,
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ events: Array<Record<string, unknown>> }>(
        `/api/v1/businesses/${businessId}/admin/outbox/failed`,
      );
      return res.data.events;
    },
  });
}

export function useDeadLetterOutbox() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["biz", businessId, "admin", "outbox", "dead-letter"] as const,
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ events: Array<Record<string, unknown>> }>(
        `/api/v1/businesses/${businessId}/admin/outbox/dead-letter`,
      );
      return res.data.events;
    },
  });
}

export function useReplayOutbox() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: Record<string, unknown> | void, idempotencyKey: string) => {
        const res = await api.post(
          `/api/v1/businesses/${businessId}/admin/outbox/replay`,
          body ?? {},
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "admin", "outbox"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export { newIdempotencyKey };
