import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  createIdempotentMutationFn,
  flattenPages,
  newIdempotencyKey,
  queryKeys,
  request,
  toastApiError,
  usePaginatedQuery,
} from "@/lib/api";
import type {
  AiPolicyDraftRequest,
  AiPolicyDraftResponse,
  AuditEvent,
  AvailabilitySlot,
  Booking,
  BookingHistoryEntry,
  Business,
  BusinessConfiguration,
  BusinessLifecycle,
  BusinessOnboarding,
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
  ExportRequest,
  FailedJob,
  FileResource,
  Invitation,
  LinkedRecord,
  LinkedRecordDefinition,
  LinkedRecordDefinitionBundle,
  Location,
  Membership,
  MembershipWithUser,
  Notification,
  OnboardingStepKey,
  OutboxEvent,
  Package,
  PackagePurchase,
  Payment,
  PaymentReceipt,
  PolicyDocument,
  PolicyDocumentType,
  PrivacyNotice,
  PublicCataloguePlan,
  Refund,
  Resource,
  SaasInterval,
  SaasPlanCode,
  Staff,
  SubscriptionChangePreview,
  UserProfileUpdate,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { deriveBusinessOnboarding } from "@/lib/onboarding/derive";
import {
  getSkippedStepsLocally,
  isOnboardingDismissedLocally,
  setOnboardingDismissedLocally,
  skipOnboardingStepLocally,
} from "@/lib/onboarding/local-state";
import { useTenant } from "@/lib/tenant/tenant-context";
import { isSaasSubscriptionComplete } from "@/lib/billing/access";

export type OpeningHourInput = {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
};

export function useBusinessId() {
  const { businessId } = useTenant();
  return businessId;
}

export function useLocationFilter() {
  const { currentLocationId } = useTenant();
  return currentLocationId === "all" ? undefined : currentLocationId;
}

function invalidateOnboarding(qc: ReturnType<typeof useQueryClient>, businessId: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.onboarding(businessId) });
}

function unwrapOnboardingPayload(
  data: BusinessOnboarding | { onboarding: BusinessOnboarding },
): BusinessOnboarding {
  if (data && typeof data === "object" && "onboarding" in data) {
    return data.onboarding;
  }
  return data;
}

/* ---------------- Bookings ---------------- */

export function useBookings(filters: {
  from: string;
  to: string;
  staffId?: string;
  status?: string;
  /** Server default is 50 and its ceiling is 200. Ranges wider than a few days need it raised. */
  limit?: number;
  enabled?: boolean;
}) {
  const businessId = useBusinessId();
  const locationId = useLocationFilter();
  const query = {
    from: filters.from,
    to: filters.to,
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") return;
      toastApiError(err);
    },
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
    onError: (err) => {
      if (err instanceof ApiError && err.code === "BOOKING_CONFLICT") return;
      toastApiError(err);
    },
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
      invalidateOnboarding(qc, businessId);
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
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
      invalidateOnboarding(qc, businessId);
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
      }
      toastApiError(err);
    },
  });
}

export function useInviteStaff() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.invitations(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.memberships(businessId) });
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
    mutationFn: async (body: {
      name: string;
      type: Location["type"];
      timezone: string;
      openingHours?: OpeningHourInput[];
      publicVisible?: boolean;
      active?: boolean;
    }) => {
      const res = await api.post<{ location: Location }>(
        `/api/v1/businesses/${businessId}/locations`,
        body,
      );
      return res.data.location;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
      invalidateOnboarding(qc, businessId);
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
      body: {
        name?: string;
        timezone?: string;
        openingHours?: OpeningHourInput[];
        active?: boolean;
        publicVisible?: boolean;
      };
    }) => {
      const res = await api.patch<{ location: Location }>(
        `/api/v1/businesses/${businessId}/locations/${vars.locationId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.location;
    },
    onSuccess: (location) => {
      void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.location(businessId, location.id) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isConflict) {
        void qc.invalidateQueries({ queryKey: queryKeys.locations(businessId) });
      }
      toastApiError(err);
    },
  });
}

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
    mutationFn: async (body: {
      name: string;
      type: Resource["type"];
      locationId?: string | null;
    }) => {
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

export type CustomerUpdateBody = {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  preferredChannel?: "email" | "phone" | "none";
  operationalNotifications?: boolean;
  marketingConsent?: boolean;
  marketingConsentSource?: string | null;
  status?: "active" | "archived" | "anonymised";
  tags?: string[];
};

function invalidateCustomerQueries(
  qc: ReturnType<typeof useQueryClient>,
  businessId: string,
  customerId?: string,
) {
  void qc.invalidateQueries({ queryKey: ["biz", businessId, "customers"] });
  if (customerId) {
    void qc.invalidateQueries({ queryKey: queryKeys.customer(businessId, customerId) });
  }
  invalidateOnboarding(qc, businessId);
}

/** First page of customers — used by pickers / search. Envelope is `{ items }`. */
export function useCustomers(
  filters: { search?: string; status?: string; tagIds?: string; enabled?: boolean } = {},
) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.tagIds ? { tagIds: filters.tagIds } : {}),
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

/** Cursor-paginated customers list (`items` + `nextCursor`). */
export function useCustomersInfinite(
  filters: { search?: string; status?: string; tagIds?: string; enabled?: boolean } = {},
) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.tagIds ? { tagIds: filters.tagIds } : {}),
  };
  const q = usePaginatedQuery<Customer, "items">({
    queryKey: queryKeys.customersInfinite(businessId, query),
    path: `/api/v1/businesses/${businessId}/customers`,
    listKey: "items",
    query,
    enabled: Boolean(businessId) && filters.enabled !== false,
  });
  return {
    ...q,
    items: flattenPages(q.data, "items"),
  };
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
      invalidateCustomerQueries(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

/** Full customer PATCH with If-Match. */
export function useUpdateCustomer() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { customerId: string; version: number; body: CustomerUpdateBody }) => {
      const res = await api.patch<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${vars.customerId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      invalidateCustomerQueries(qc, businessId, customer.id);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateCustomerStatus() {
  const update = useUpdateCustomer();
  return useMutation({
    mutationFn: async (vars: {
      customerId: string;
      version: number;
      status: "active" | "archived" | "anonymised";
    }) =>
      update.mutateAsync({
        customerId: vars.customerId,
        version: vars.version,
        body: { status: vars.status },
      }),
    onError: (err) => toastApiError(err),
  });
}

export function useCustomerTagsCatalogue(filters: { status?: "active" | "archived" } = {}) {
  const businessId = useBusinessId();
  const query = filters.status ? { status: filters.status } : {};
  return useQuery({
    queryKey: queryKeys.customerTagsCatalogue(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ tags: CustomerTag[] }>(
        `/api/v1/businesses/${businessId}/customer-tags`,
        { query },
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
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "customer-tags"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCustomerAssignedTags(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customerAssignedTags(businessId, customerId ?? ""),
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
        queryKey: queryKeys.customerAssignedTags(businessId, customerId ?? ""),
      });
      invalidateCustomerQueries(qc, businessId, customerId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUnassignCustomerTag(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      await api.delete(`/api/v1/businesses/${businessId}/customers/${customerId}/tags/${tagId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerAssignedTags(businessId, customerId ?? ""),
      });
      invalidateCustomerQueries(qc, businessId, customerId);
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

export function useRecordCustomerConsent(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      channel: string;
      granted: boolean;
      source?: string | null;
      noticeId?: string;
    }) => {
      const res = await api.post<{ consent: ConsentRecord }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/consents`,
        body,
      );
      return res.data.consent;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerConsents(businessId, customerId ?? ""),
      });
      invalidateCustomerQueries(qc, businessId, customerId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCustomerLinkedRecords(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.customerLinkedRecords(businessId, customerId ?? ""),
    enabled: Boolean(businessId && customerId),
    queryFn: async () => {
      const res = await api.get<{ records: LinkedRecord[] }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/linked-records`,
      );
      return res.data.records;
    },
  });
}

export function useCreateCustomerLinkedRecord(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { displayLabel?: string; values?: Record<string, unknown> }) => {
      const res = await api.post<{ record: LinkedRecord }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/linked-records`,
        body,
      );
      return res.data.record;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.customerLinkedRecords(businessId, customerId ?? ""),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

/** Links a portal user (`userId`) to this customer — not a magic-link URL. */
export function useLinkCustomerPortal(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/portal-link`,
        { userId },
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      invalidateCustomerQueries(qc, businessId, customer.id);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCustomerDsarExport(customerId: string | undefined) {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<Record<string, unknown>>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/dsar-export`,
        {},
      );
      return res.data;
    },
    onError: (err) => toastApiError(err),
  });
}

export function useAnonymiseCustomer(customerId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ customer: Customer }>(
        `/api/v1/businesses/${businessId}/customers/${customerId}/anonymise`,
        {},
      );
      return res.data.customer;
    },
    onSuccess: (customer) => {
      invalidateCustomerQueries(qc, businessId, customer.id);
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
      invalidateOnboarding(qc, businessId);
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePayments(
  filters: {
    from?: string;
    to?: string;
    state?: string;
    customerId?: string;
    enabled?: boolean;
  } = {},
) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
  };
  return usePaginatedQuery<Payment, "payments">({
    queryKey: queryKeys.payments(businessId, query),
    path: `/api/v1/businesses/${businessId}/payments`,
    listKey: "payments",
    query,
    enabled: Boolean(businessId) && filters.enabled !== false,
  });
}

export function usePaymentsList(
  filters: {
    from?: string;
    to?: string;
    state?: string;
    customerId?: string;
    enabled?: boolean;
  } = {},
) {
  const payments = usePayments(filters);
  return {
    ...payments,
    payments: flattenPages(payments.data, "payments"),
  };
}

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
        {
          paymentId: vars.paymentId,
          reasonCode: vars.reasonCode,
          ...(vars.amountMinor !== undefined ? { amountMinor: vars.amountMinor } : {}),
        },
        { idempotencyKey },
      );
      return res.data.refund;
    }),
    onSuccess: (refund) => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "payments"] });
      void qc.invalidateQueries({ queryKey: queryKeys.payment(businessId, refund.paymentId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useConnectAccount() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.connectAccount(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ account: ConnectAccount | null }>(
        `/api/v1/businesses/${businessId}/connect/account`,
      );
      return res.data.account;
    },
  });
}

export function useStartConnectOnboarding() {
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.connectAccount(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useSyncConnectAccount() {
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

/**
 * Mints a single-use Stripe Express Dashboard login link. The URL is short-lived
 * and single-use, so it is never cached — fetch a fresh one on every click and
 * redirect immediately.
 */
export function useConnectLoginLink() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ url: string }>(
        `/api/v1/businesses/${businessId}/connect/login-link`,
        {},
      );
      return res.data.url;
    },
    onError: (err) => toastApiError(err),
  });
}

export function useDashboard(
  filters: { from?: string; to?: string; locationId?: string | null } = {},
) {
  const businessId = useBusinessId();
  const scopedLocationId = useLocationFilter();
  const locationId =
    filters.locationId === undefined
      ? scopedLocationId
      : filters.locationId === null || filters.locationId === "all"
        ? undefined
        : filters.locationId;
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
    retry: (count, err) => {
      if (err instanceof ApiError && (err.code === "FEATURE_NOT_AVAILABLE" || err.isForbidden)) {
        return false;
      }
      return count < 2;
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

export function useSendMessage(conversationId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  type MessagesPage = { messages: ConversationMessage[]; nextCursor?: string | null };
  const messagesKey = queryKeys.messages(businessId, conversationId ?? "");

  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ message: ConversationMessage }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`,
        { body },
      );
      return res.data.message;
    },
    onMutate: async (body) => {
      if (!conversationId) return { previous: undefined as MessagesPage | undefined };
      await qc.cancelQueries({ queryKey: messagesKey });
      const previous = qc.getQueryData<MessagesPage>(messagesKey);
      const optimistic: ConversationMessage = {
        id: `optimistic-${crypto.randomUUID()}`,
        businessId,
        conversationId,
        senderType: "staff",
        senderId: "me",
        body,
        createdAt: new Date().toISOString(),
        isAnnouncement: false,
        readByCustomerAt: null,
        readByStaffAt: new Date().toISOString(),
      };
      qc.setQueryData<MessagesPage>(messagesKey, (old) => ({
        messages: [...(old?.messages ?? []), optimistic],
        nextCursor: old?.nextCursor ?? null,
      }));
      return { previous };
    },
    onError: (err, _body, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(messagesKey, ctx.previous);
      toastApiError(err);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messagesKey });
      void qc.invalidateQueries({ queryKey: queryKeys.conversations(businessId) });
    },
  });
}

export function useCreateAnnouncement() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      customerIds: string[];
      body: string;
      bookingId?: string | null;
    }) => {
      const res = await api.post<Record<string, unknown>>(
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
      await qc.cancelQueries({ queryKey: ["biz", businessId, "notifications"] });
      const snapshots = qc.getQueriesData<{
        notifications: Notification[];
        nextCursor?: string | null;
      }>({ queryKey: ["biz", businessId, "notifications"] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData(key, {
          ...data,
          notifications: data.notifications.map((n) =>
            n.id === notificationId ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
          ),
        });
      }
      return { snapshots };
    },
    onError: (err, _id, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
      toastApiError(err);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "notifications"] });
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

/** Runs the credit-expiry sweep for this business (`POST …/credits/expire`). */
export function useExpireCredits() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ expired: string[] }>(
        `/api/v1/businesses/${businessId}/credits/expire`,
        {},
      );
      return { expired: res.data.expired, requestId: res.requestId };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "entitlements"] });
      void qc.invalidateQueries({ queryKey: queryKeys.creditLedger(businessId) });
    },
    onError: (err) => toastApiError(err),
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
 * payment. `paymentRef` and `providerEventId` are both required by the API.
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

/* ---------------- Settings: business / config / team ---------------- */

export function useUpdateBusiness() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      version: number;
      body: {
        slug?: string;
        legalName?: string;
        tradingName?: string;
        currency?: string;
        defaultTimezone?: string;
        locale?: string;
      };
    }) => {
      const res = await api.patch<{ business: Business }>(
        `/api/v1/businesses/${businessId}`,
        vars.body,
        { ifMatch: vars.version },
      );
      return res.data.business;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.business(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateConfiguration() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<BusinessConfiguration>) => {
      const res = await api.patch<{ configuration: BusinessConfiguration }>(
        `/api/v1/businesses/${businessId}/configuration`,
        body,
      );
      return res.data.configuration;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.configuration(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useMemberships() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.memberships(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ memberships: MembershipWithUser[] }>(
        `/api/v1/businesses/${businessId}/memberships`,
      );
      return res.data.memberships;
    },
  });
}

/**
 * The caller's own account profile — name, phone, locale, timezone. Not
 * tenant-scoped, and nothing to do with email or password, which belong to
 * Supabase Auth.
 *
 * Errors are left to the caller: a 400 here carries per-field codes that belong
 * beside the inputs rather than in a toast.
 */
export function useUpdateMe() {
  const qc = useQueryClient();
  const businessId = useBusinessId();
  const { updateProfile } = useAuth();
  return useMutation({
    mutationFn: (body: UserProfileUpdate) => updateProfile(body),
    onSuccess: () => {
      // A renamed member shows up in the Team list, which embeds the account.
      if (businessId) {
        void qc.invalidateQueries({ queryKey: queryKeys.memberships(businessId) });
      }
    },
  });
}

export function useUpdateMembership() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      membershipId: string;
      body: {
        roleKeys?: string[];
        locationScopeIds?: string[] | null;
        status?: "invited" | "active" | "suspended";
      };
    }) => {
      const res = await api.patch<{ membership: Membership }>(
        `/api/v1/businesses/${businessId}/memberships/${vars.membershipId}`,
        vars.body,
      );
      return res.data.membership;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.memberships(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useInvitations() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.invitations(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ invitations: Invitation[] }>(
        `/api/v1/businesses/${businessId}/invitations`,
      );
      return res.data.invitations;
    },
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await api.post<{ membership?: Membership }>(
        `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
        {},
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Settings: policies / privacy / templates ---------------- */

export function usePolicyDocuments() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.policyDocuments(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ documents: PolicyDocument[] }>(
        `/api/v1/businesses/${businessId}/policy-documents`,
      );
      return res.data.documents;
    },
  });
}

export function useCurrentPolicyDocument(type: PolicyDocumentType | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.policyDocumentCurrent(businessId, type ?? ""),
    enabled: Boolean(businessId && type),
    queryFn: async () => {
      const res = await api.get<{ document: PolicyDocument | null }>(
        `/api/v1/businesses/${businessId}/policy-documents/current/${type}`,
      );
      return res.data.document;
    },
  });
}

export function useCreatePolicyDocument() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      type: PolicyDocumentType;
      content?: string | null;
      objectKey?: string | null;
      effectiveAt?: string;
      publish?: boolean;
    }) => {
      const res = await api.post<{ document: PolicyDocument }>(
        `/api/v1/businesses/${businessId}/policy-documents`,
        body,
      );
      return res.data.document;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.policyDocuments(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePublishPolicyDocument() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { documentId: string; effectiveAt?: string }) => {
      const res = await api.post<{ document: PolicyDocument }>(
        `/api/v1/businesses/${businessId}/policy-documents/${vars.documentId}/publish`,
        vars.effectiveAt ? { effectiveAt: vars.effectiveAt } : {},
      );
      return res.data.document;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.policyDocuments(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useSeedPolicyDefaults() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{
        seedVersion: string;
        published: PolicyDocument[];
        skipped: string[];
      }>(`/api/v1/businesses/${businessId}/policy-documents/seed-defaults`, {});
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.policyDocuments(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

/** True when AI drafting isn’t enabled yet (feature flag off, no key, or route not deployed). */
export function isAiPolicyDraftUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  // Feature flag / missing provider key → 403 FEATURE_NOT_AVAILABLE.
  if (err.code === "FEATURE_NOT_AVAILABLE") return true;
  // Route present but drafting not implemented on this environment → 501.
  if (err.status === 501) return true;
  // Backend not deployed yet → 404 NOT_FOUND / "Route not found".
  if (err.status === 404) return true;
  return false;
}

/** RECA-511 — AI-assisted cancellation + terms drafts (never auto-publishes). */
export function useAiDraftPolicies() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AiPolicyDraftRequest) => {
      const res = await api.post<AiPolicyDraftResponse>(
        `/api/v1/businesses/${businessId}/policy-documents/ai/draft`,
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.policyDocuments(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => {
      if (isAiPolicyDraftUnavailable(err)) return;
      toastApiError(err);
    },
  });
}

export function useLatestPrivacyNotice() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.privacyNoticeLatest(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ notice: PrivacyNotice | null }>(
        `/api/v1/businesses/${businessId}/privacy-notices/latest`,
      );
      return res.data.notice;
    },
  });
}

export function usePublishPrivacyNotice() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; body: string }) => {
      const res = await api.post<{ notice: PrivacyNotice }>(
        `/api/v1/businesses/${businessId}/privacy-notices`,
        body,
      );
      return res.data.notice;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.privacyNoticeLatest(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useUpdateNotificationTemplate() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (body: { key: string; bodyRegion: string }) => {
      await api.put(`/api/v1/businesses/${businessId}/notification-templates`, body);
      return body;
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Business onboarding checklist ---------------- */

/**
 * Loads `GET /businesses/{id}/onboarding`. When the endpoint is not yet
 * available (404/501), derives the same shape from catalogue data so the
 * setup widget works before backend lands.
 */
export function useBusinessOnboarding() {
  const businessId = useBusinessId();
  const [localEpoch, setLocalEpoch] = useState(0);

  const remote = useQuery({
    queryKey: queryKeys.onboarding(businessId),
    enabled: Boolean(businessId),
    retry: false,
    queryFn: async (): Promise<BusinessOnboarding | false> => {
      try {
        const res = await api.get<BusinessOnboarding | { onboarding: BusinessOnboarding }>(
          `/api/v1/businesses/${businessId}/onboarding`,
        );
        return unwrapOnboardingPayload(res.data);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
          return false;
        }
        throw err;
      }
    },
  });

  const needsDerive = remote.isSuccess && remote.data === false;

  const locations = useLocationsList();
  const staff = useStaffList();
  const services = useServices();
  const customers = useCustomers({ enabled: needsDerive });
  const packages = usePackages();
  const policies = usePolicyDocuments();
  const connect = useConnectAccount();
  const subscription = useSubscription();

  const from = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString();
  }, []);
  const to = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }, []);

  const bookings = useBookings({ from, to, enabled: needsDerive });

  const derived = useMemo(() => {
    if (!needsDerive || !businessId) return undefined;
    if (
      !locations.isSuccess ||
      !staff.isSuccess ||
      !services.isSuccess ||
      !customers.isSuccess ||
      !packages.isSuccess ||
      !policies.isSuccess ||
      !bookings.isSuccess
    ) {
      return undefined;
    }
    return deriveBusinessOnboarding({
      businessId,
      locations: locations.data ?? [],
      staff: staff.data ?? [],
      services: services.data ?? [],
      customers: customers.data?.items ?? [],
      bookings: bookings.data?.bookings ?? [],
      packages: packages.data ?? [],
      policies: policies.data ?? [],
      connect: connect.data,
      saasEntitled: isSaasSubscriptionComplete(subscription.data?.subscription),
      skippedKeys: getSkippedStepsLocally(businessId),
      dismissed: isOnboardingDismissedLocally(businessId),
    });
  }, [
    needsDerive,
    businessId,
    locations.isSuccess,
    locations.data,
    staff.isSuccess,
    staff.data,
    services.isSuccess,
    services.data,
    customers.isSuccess,
    customers.data,
    packages.isSuccess,
    packages.data,
    policies.isSuccess,
    policies.data,
    bookings.isSuccess,
    bookings.data,
    connect.data,
    subscription.data,
    localEpoch,
  ]);

  const remoteData = remote.data;
  const data: BusinessOnboarding | undefined =
    remoteData !== undefined && remoteData !== false ? remoteData : derived;

  const isLoading =
    remote.isLoading ||
    (needsDerive &&
      (locations.isLoading ||
        staff.isLoading ||
        services.isLoading ||
        customers.isLoading ||
        packages.isLoading ||
        policies.isLoading ||
        bookings.isLoading));

  return {
    data,
    isLoading,
    isError: remote.isError,
    isDerived: needsDerive,
    bumpLocal: () => setLocalEpoch((n) => n + 1),
    refetch: remote.refetch,
  };
}

export function useDismissOnboarding(isDerived: boolean, onLocalChange?: () => void) {
  const businessId = useBusinessId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (isDerived) {
        setOnboardingDismissedLocally(businessId);
        return;
      }
      try {
        await api.post(`/api/v1/businesses/${businessId}/onboarding/dismiss`, {});
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
          setOnboardingDismissedLocally(businessId);
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      onLocalChange?.();
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useSkipOnboardingStep(isDerived: boolean, onLocalChange?: () => void) {
  const businessId = useBusinessId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (key: OnboardingStepKey) => {
      if (isDerived) {
        skipOnboardingStepLocally(businessId, key);
        return;
      }
      try {
        await api.post(`/api/v1/businesses/${businessId}/onboarding/steps/${key}/skip`, {});
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
          skipOnboardingStepLocally(businessId, key);
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      onLocalChange?.();
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Settings: linked records / lifecycle / audit ---------------- */

export function useLinkedRecordDefinition() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.linkedRecordDefinition(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ definition: LinkedRecordDefinitionBundle | null }>(
        `/api/v1/businesses/${businessId}/linked-record-definition`,
      );
      return res.data.definition;
    },
  });
}

export function useCreateLinkedRecordDefinition() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      key: string;
      singularLabel: string;
      pluralLabel: string;
      iconKey?: string | null;
      description?: string | null;
      settings?: Record<string, unknown>;
    }) => {
      const res = await api.post<{ definition: LinkedRecordDefinition }>(
        `/api/v1/businesses/${businessId}/linked-record-definition`,
        body,
      );
      return res.data.definition;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.linkedRecordDefinition(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useApplyLinkedRecordTemplate() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateKey: string) => {
      const res = await api.post(
        `/api/v1/businesses/${businessId}/linked-record-definition/apply-template`,
        { templateKey },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.linkedRecordDefinition(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useAddLinkedRecordField() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      definitionId: string;
      body: {
        fieldKey: string;
        label: string;
        helpText?: string | null;
        dataType: "short_text" | "long_text" | "integer" | "decimal" | "boolean" | "date" | "enum";
      };
    }) => {
      const res = await api.post<{ field: Record<string, unknown> }>(
        `/api/v1/businesses/${businessId}/linked-record-definition/${vars.definitionId}/fields`,
        vars.body,
      );
      return res.data.field;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.linkedRecordDefinition(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useLifecycle() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.lifecycle(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ lifecycle: BusinessLifecycle }>(
        `/api/v1/businesses/${businessId}/lifecycle`,
      );
      return res.data.lifecycle;
    },
  });
}

export function useLifecycleTransition() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      version: number;
      status: "trial" | "active" | "past_due" | "restricted" | "suspended";
      reason?: string | null;
    }) => {
      const res = await api.post<{ lifecycle: BusinessLifecycle }>(
        `/api/v1/businesses/${businessId}/lifecycle/transitions`,
        { status: vars.status, reason: vars.reason ?? null },
        { ifMatch: vars.version },
      );
      return res.data.lifecycle;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.lifecycle(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.business(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCloseBusiness() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { version: number; reason?: string | null }) => {
      const res = await api.post<{ lifecycle: BusinessLifecycle }>(
        `/api/v1/businesses/${businessId}/lifecycle/close`,
        { reason: vars.reason ?? null },
        { ifMatch: vars.version },
      );
      return res.data.lifecycle;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.lifecycle(businessId) });
      void qc.invalidateQueries({ queryKey: queryKeys.business(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useAuditEvents() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.auditEvents(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ events: AuditEvent[] }>(
        `/api/v1/businesses/${businessId}/audit-events`,
      );
      const events = res.data.events ?? [];
      return [...events].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
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
  graceStartedAt?: string | null;
  graceEndsAt?: string | null;
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

export function useBillingCatalogue() {
  return useQuery({
    queryKey: queryKeys.billingCatalogue(),
    queryFn: async () => {
      const res = await api.get<{ plans: PublicCataloguePlan[] }>("/api/v1/billing/catalogue", {
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
      async (body: { plan: SaasPlanCode; interval: SaasInterval }, idempotencyKey: string) => {
        const res = await api.post<{ checkoutUrl: string; url?: string }>(
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

export function useReconcileCheckout() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        body: { stripeCheckoutSessionId?: string; checkoutAttemptId?: string },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{
          subscription: BusinessSubscription | null;
          plan?: PublicCataloguePlan | null;
        }>(`/api/v1/businesses/${businessId}/subscription/checkout/reconcile`, body, {
          idempotencyKey,
        });
        return res.data;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useBillingPortal() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(async (_: void, idempotencyKey: string) => {
      const res = await api.post<{ portalUrl: string; url?: string }>(
        `/api/v1/businesses/${businessId}/subscription/portal`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onError: (err) => toastApiError(err),
  });
}

export function useSubscriptionChangePreview() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (body: { plan: SaasPlanCode; interval: SaasInterval }) => {
      const res = await api.post<SubscriptionChangePreview>(
        `/api/v1/businesses/${businessId}/subscription/change-preview`,
        body,
      );
      return res.data;
    },
    onError: (err) => toastApiError(err),
  });
}

export function useSubscriptionChangeApply() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (body: { previewToken: string }, idempotencyKey: string) => {
        const res = await api.post(
          `/api/v1/businesses/${businessId}/subscription/change-apply`,
          body,
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
      invalidateOnboarding(qc, businessId);
    },
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
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

export function useResumeSubscription() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(async (_: void, idempotencyKey: string) => {
      const res = await api.post(
        `/api/v1/businesses/${businessId}/subscription/resume`,
        {},
        { idempotencyKey },
      );
      return res.data;
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
      invalidateOnboarding(qc, businessId);
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Files / exports / ops ---------------- */

export type FileOwner = {
  ownerType: "customer" | "booking" | "linked_record" | "business";
  ownerId: string;
};

export function useCreateFileUploadIntent() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        body: { contentType: string; sizeBytes: number } & Partial<FileOwner>,
        idempotencyKey: string,
      ) => {
        const res = await api.post<{ file: FileResource; uploadUrl: string }>(
          `/api/v1/businesses/${businessId}/files`,
          body,
          { idempotencyKey },
        );
        return res.data;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

/** `checksum` is the SHA-256 hex digest — the API rejects `complete` without it. */
export function useCompleteFileUpload() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { fileId: string; checksum: string }, idempotencyKey: string) => {
        const res = await api.post<{ file: FileResource }>(
          `/api/v1/businesses/${businessId}/files/${vars.fileId}/complete`,
          { checksum: vars.checksum },
          { idempotencyKey },
        );
        return res.data.file;
      },
    ),
    onError: (err) => toastApiError(err),
  });
}

/** Metadata for a single file; polls while malware scan is pending. */
export function useBusinessFile(fileId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.file(businessId, fileId ?? ""),
    enabled: Boolean(businessId && fileId),
    queryFn: async () => {
      const res = await api.get<{ file: FileResource }>(
        `/api/v1/businesses/${businessId}/files/${fileId}`,
      );
      return res.data.file;
    },
    refetchInterval: (query) => (query.state.data?.scanStatus === "pending" ? 3000 : false),
  });
}

/** Issues a short-lived signed download URL — never cache/reuse the result. */
export function useFileDownloadUrl() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await api.post<{
        downloadUrl: string;
        expiresInSeconds: number;
        expiresAt: string;
      }>(`/api/v1/businesses/${businessId}/files/${fileId}/download-url`, {});
      return res.data;
    },
    onError: (err) => toastApiError(err),
  });
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PUT with upload progress via XHR (Fetch has no upload progress event). */
function putFileWithProgress(url: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(file);
  });
}

/**
 * Upload a browser File via signed intent → PUT (with progress) → complete
 * (with checksum). Returns the completed `File` resource.
 */
export async function uploadFileViaIntent(
  businessId: string,
  file: File,
  owner?: FileOwner,
  onProgress?: (pct: number) => void,
): Promise<FileResource> {
  const intent = await api.post<{ file: FileResource; uploadUrl: string }>(
    `/api/v1/businesses/${businessId}/files`,
    {
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      ...owner,
    },
    { idempotencyKey: newIdempotencyKey() },
  );

  await putFileWithProgress(intent.data.uploadUrl, file, onProgress);
  const checksum = await sha256Hex(file);

  const completed = await api.post<{ file: FileResource }>(
    `/api/v1/businesses/${businessId}/files/${intent.data.file.id}/complete`,
    { checksum },
    { idempotencyKey: newIdempotencyKey() },
  );
  return completed.data.file;
}

export function useRequestExport() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { type: "customers" | "bookings" }, idempotencyKey: string) => {
        const res = await api.post<{ export: ExportRequest; downloadUrl: string }>(
          `/api/v1/businesses/${businessId}/exports`,
          {},
          { idempotencyKey, query: { type: vars.type } },
        );
        return res.data;
      },
    ),
    onError: (err) => {
      if (!(err instanceof ApiError && err.code === "FEATURE_NOT_AVAILABLE")) {
        toastApiError(err);
      }
    },
  });
}

/** Download a tokenised export; retries briefly while the file is not yet ready. */
export async function downloadExportFile(opts: {
  businessId: string;
  exportId: string;
  token: string;
  downloadUrl?: string;
  filename?: string;
  maxAttempts?: number;
}) {
  const maxAttempts = opts.maxAttempts ?? 8;
  const path =
    opts.downloadUrl && opts.downloadUrl.startsWith("/")
      ? opts.downloadUrl
      : `/api/v1/businesses/${opts.businessId}/exports/${opts.exportId}/download`;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await api.get<string | Record<string, unknown>>(path, {
        query: { token: opts.token },
      });
      const body = res.data;
      const text =
        typeof body === "string" ? body : body != null ? JSON.stringify(body, null, 2) : "";
      if (typeof window !== "undefined") {
        const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = opts.filename ?? `export-${opts.exportId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      return;
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof ApiError && (err.status === 404 || err.status === 409 || err.status === 422);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function useFailedOutbox(filters: { minAttempts?: number; limit?: number } = {}) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.minAttempts !== undefined ? { minAttempts: filters.minAttempts } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
  return useQuery({
    queryKey: queryKeys.failedOutbox(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ events: OutboxEvent[] }>(
        `/api/v1/businesses/${businessId}/admin/outbox/failed`,
        { query },
      );
      return res.data.events;
    },
  });
}

export function useDeadLetterOutbox(filters: { minAttempts?: number; limit?: number } = {}) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.minAttempts !== undefined ? { minAttempts: filters.minAttempts } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
  return useQuery({
    queryKey: queryKeys.deadLetterOutbox(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ events: OutboxEvent[] }>(
        `/api/v1/businesses/${businessId}/admin/outbox/dead-letter`,
        { query },
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
      async (vars: { eventIds: string[] }, idempotencyKey: string) => {
        const res = await api.post(
          `/api/v1/businesses/${businessId}/admin/outbox/replay`,
          { eventIds: vars.eventIds },
          { idempotencyKey },
        );
        return { data: res.data, requestId: res.requestId };
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "admin", "outbox"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRepublishOutboxEvent() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await api.post(
        `/api/v1/businesses/${businessId}/admin/outbox/${eventId}/republish`,
        {},
      );
      return { data: res.data, requestId: res.requestId };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "admin", "outbox"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useFailedJobs(filters: { minAttempts?: number; limit?: number } = {}) {
  const businessId = useBusinessId();
  const query = {
    ...(filters.minAttempts !== undefined ? { minAttempts: filters.minAttempts } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
  return useQuery({
    queryKey: queryKeys.failedJobs(businessId, query),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ jobs: FailedJob[] }>(
        `/api/v1/businesses/${businessId}/admin/jobs/failed`,
        { query },
      );
      return res.data.jobs;
    },
  });
}

export function useResetFailedJob() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.post(`/api/v1/businesses/${businessId}/admin/jobs/${jobId}/reset`, {});
      return { data: res.data, requestId: res.requestId };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "admin", "jobs"] });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useReconcilePayments() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async (vars: { from: string; to: string }) => {
      const res = await api.post(`/api/v1/businesses/${businessId}/admin/payments/reconcile`, vars);
      return { data: res.data, requestId: res.requestId };
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRunRetention() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/v1/businesses/${businessId}/admin/retention/run`, {});
      return { data: res.data, requestId: res.requestId };
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRunFilesRetention() {
  const businessId = useBusinessId();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{
        requested: number;
        softDeleted: number;
        skipped: number;
      }>(`/api/v1/businesses/${businessId}/admin/files/retention/run`, {});
      return { data: res.data, requestId: res.requestId };
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Public booking journey (RECA-507) ---------------- */

/**
 * The public endpoints already return only active, publicly visible rows, and
 * their projection drops the `active` and `publicVisible` flags along with the
 * rest of the staff-facing fields. Typed narrowly so a client-side re-filter on
 * a field that is never sent — which silently empties the booking page — fails
 * to compile instead of shipping.
 */
export type PublicService = Pick<
  CatalogueService,
  "id" | "name" | "description" | "category" | "durationMinutes" | "basePriceMinor" | "currency"
> & { colour: string | null };

export type PublicLocation = Pick<Location, "id" | "name" | "type" | "timezone" | "openingHours">;

export interface PublicBusinessProfile {
  id: string;
  slug: string;
  tradingName: string;
  currency: string;
  defaultTimezone: string;
  branding: { logoUrl: string | null; accentColour: string | null };
}

/**
 * Resolves a booking link to the studio behind it. Takes either the slug from a
 * short link or the id from a link issued before slugs existed, since both are
 * in circulation and the page needs the same answer for each.
 *
 * A studio's name and logo change about as often as its address, so this is held
 * for the session rather than refetched per navigation.
 */
export function usePublicBusiness(handle: string | undefined, by: "slug" | "id" = "slug") {
  return useQuery({
    queryKey: queryKeys.publicBusiness(handle ?? ""),
    enabled: Boolean(handle),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const path =
        by === "slug"
          ? `/api/v1/public/businesses/by-slug/${encodeURIComponent(handle!)}`
          : `/api/v1/public/businesses/${handle}/profile`;
      const res = await api.get<{ business: PublicBusinessProfile }>(path, { public: true });
      return res.data.business;
    },
  });
}

export function usePublicServices(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicServices(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ services: PublicService[] }>(
        `/api/v1/public/businesses/${businessId}/services`,
        { public: true },
      );
      return res.data.services;
    },
  });
}

export function usePublicLocations(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicLocations(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ locations: PublicLocation[] }>(
        `/api/v1/public/businesses/${businessId}/locations`,
        { public: true },
      );
      return res.data.locations;
    },
  });
}

/** Half-open UTC window `[from, to)`. Each slot carries a signed, expiring `slotToken`. */
export function usePublicAvailability(
  businessId: string | undefined,
  filters: {
    serviceId?: string;
    locationId?: string;
    from?: string;
    to?: string;
    enabled?: boolean;
  },
) {
  const ready =
    Boolean(businessId && filters.serviceId && filters.locationId && filters.from && filters.to) &&
    filters.enabled !== false;
  const query = {
    serviceId: filters.serviceId!,
    locationId: filters.locationId!,
    from: filters.from!,
    to: filters.to!,
  };
  return useQuery({
    queryKey: queryKeys.publicAvailability(businessId ?? "", query),
    enabled: ready,
    queryFn: async () => {
      const res = await api.get<{ slots: AvailabilitySlot[] }>(
        `/api/v1/public/businesses/${businessId}/availability`,
        { public: true, query },
      );
      return res.data.slots;
    },
    // Changing the date is a new query key, which would otherwise blank the times and
    // flash a loading line. Holding the previous day's times until the new ones land
    // keeps the grid steady — but only within the same service and location, since
    // showing another service's times, even briefly, invites booking the wrong thing.
    placeholderData: (previous, previousQuery) => {
      const previousFilters = previousQuery?.queryKey?.[3] as
        { serviceId?: string; locationId?: string } | undefined;
      if (!previousFilters) return undefined;
      const sameContext =
        previousFilters.serviceId === query.serviceId &&
        previousFilters.locationId === query.locationId;
      return sameContext ? previous : undefined;
    },
  });
}

/** A package as an unauthenticated buyer sees it on the booking page. */
export type PublicPackage = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  creditsIssued: number;
  /** Empty means the credits work on any service. */
  eligibleServiceIds: string[];
  validity: { kind: "calendar_months" | "days"; amount: number };
};

export function usePublicPackages(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicPackages(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ packages: PublicPackage[] }>(
        `/api/v1/public/businesses/${businessId}/packages`,
        { public: true },
      );
      return res.data.packages;
    },
  });
}

export type PublicPackagePayment = PublicBookingPayment & {
  packageName: string;
  creditsIssued: number;
  /**
   * One-time token that links the buyer's own account to the customer record this
   * purchase created. Without redeeming it they have no way into the portal, and
   * the credits they just paid for stay out of reach.
   */
  claimToken: string;
};

/**
 * Turns a claim token into portal access for the signed-in user. The token names
 * its own business, so there is nothing else to pass.
 */
export function useRedeemPurchaseClaim() {
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await api.post<{ businessId: string; customerId: string }>(
        `/api/v1/customer-claims/${encodeURIComponent(token)}/accept`,
        {},
      );
      return res.data;
    },
  });
}

export function useBuyPublicPackage(businessId: string | undefined) {
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        vars: {
          packageId: string;
          firstName: string;
          lastName?: string | null;
          email?: string | null;
          phone?: string | null;
          marketingConsent?: boolean;
        },
        idempotencyKey: string,
      ) => {
        const res = await api.post<PublicPackagePayment>(
          `/api/v1/public/businesses/${businessId}/package-purchases/payment`,
          vars,
          { public: true, idempotencyKey },
        );
        return res.data;
      },
    ),
  });
}

export function useCreatePublicBookingHold(businessId: string | undefined) {
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (
        body: {
          slotToken: string;
          firstName: string;
          lastName?: string | null;
          email?: string | null;
          phone?: string | null;
          notesCustomer?: string | null;
          marketingConsent?: boolean;
        },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{
          booking: Booking;
          holdToken: string;
          onlinePaymentRequired?: boolean;
        }>(`/api/v1/public/businesses/${businessId}/booking-holds`, body, {
          public: true,
          idempotencyKey,
        });
        return res.data;
      },
    ),
  });
}

export function useConfirmPublicBooking(businessId: string | undefined) {
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { bookingId: string; holdToken: string }, idempotencyKey: string) => {
        const res = await api.post<{ booking: Booking }>(
          `/api/v1/public/businesses/${businessId}/bookings/confirm`,
          vars,
          { public: true, idempotencyKey },
        );
        return res.data.booking;
      },
    ),
  });
}

export type PublicBookingPayment = {
  clientSecret: string;
  /**
   * The charge is created directly on the business's connected account, so Stripe.js
   * has to be initialised against that account rather than the platform.
   */
  connectedAccountId: string;
  publishableKey: string;
  amountMinor: number;
  currency: string;
};

export function useStartPublicBookingPayment(businessId: string | undefined) {
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { bookingId: string; holdToken: string }, idempotencyKey: string) => {
        const res = await api.post<PublicBookingPayment>(
          `/api/v1/public/businesses/${businessId}/bookings/payment`,
          vars,
          { public: true, idempotencyKey },
        );
        return res.data;
      },
    ),
  });
}

/* ---------------- Customer portal (RECA-508) ---------------- */

export type PortalCustomer = {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string | null;
  emailDisplay: string | null;
  phoneDisplay: string | null;
  status?: "active" | "archived" | "anonymised";
} & Record<string, unknown>;

/**
 * Businesses the signed-in user can visit as a customer.
 *
 * Enabled only where it is needed — an account with no staff membership, which
 * has to be told apart from a new owner before it is offered a business to set
 * up. Staff never reach that branch, so they never pay for the request.
 */
export function usePortalBusinesses(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.portalBusinesses(),
    enabled,
    queryFn: async () => {
      const res = await api.get<{ businesses: PortalBusinessSummary[] }>(
        "/api/v1/portal/businesses",
      );
      return res.data.businesses;
    },
  });
}

export type PortalBusinessSummary = { id: string; slug: string; tradingName: string };

/**
 * Attaches anything bought as a guest with this account's verified email.
 *
 * A query rather than a mutation, despite the POST, because what we want is its
 * caching: run once, remember it ran, and let anything that depends on the
 * result wait on the same promise. As a mutation each caller would fire its own.
 * The call is idempotent server-side, so a repeat costs nothing but a round trip.
 *
 * Failure is deliberately quiet. This runs on every sign-in and improves an
 * answer rather than producing one, so an error means "found nothing extra", not
 * "your sign-in is broken" — {@link usePortalBusinesses} still gives the truth.
 */
export function usePortalLink(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.portalLink(),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await api.post<{ businessIds: string[] }>("/api/v1/portal/links", {});
      return res.data.businessIds;
    },
  });
}

export function usePortalMe(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalMe(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ customer: PortalCustomer }>("/api/v1/portal/me", {
        query: { businessId },
      });
      return res.data.customer;
    },
  });
}

export function usePortalBookings(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalBookings(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ bookings: Booking[] }>("/api/v1/portal/bookings", {
        query: { businessId },
      });
      return res.data.bookings;
    },
  });
}

export function usePortalBooking(businessId: string | undefined, bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalBooking(businessId ?? "", bookingId ?? ""),
    enabled: Boolean(businessId && bookingId),
    queryFn: async () => {
      const res = await api.get<{ booking: Booking }>(`/api/v1/portal/bookings/${bookingId}`, {
        query: { businessId },
      });
      return res.data.booking;
    },
  });
}

export function useCancelPortalBooking(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdempotentMutationFn(
      async (vars: { bookingId: string; reason?: string | null }, idempotencyKey: string) => {
        const res = await api.post<{ booking: Booking }>(
          `/api/v1/portal/bookings/${vars.bookingId}/cancel`,
          vars.reason ? { reason: vars.reason } : {},
          { query: { businessId }, idempotencyKey },
        );
        return res.data.booking;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.portalBookings(businessId ?? "") });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useReschedulePortalBooking(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<Booking, ApiError, { bookingId: string; slotToken: string }>({
    mutationFn: createIdempotentMutationFn(
      async (vars: { bookingId: string; slotToken: string }, idempotencyKey: string) => {
        const res = await api.post<{ booking: Booking }>(
          `/api/v1/portal/bookings/${vars.bookingId}/reschedule`,
          { slotToken: vars.slotToken },
          { query: { businessId }, idempotencyKey },
        );
        return res.data.booking;
      },
    ),
    onSuccess: (_booking, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.portalBookings(businessId ?? "") });
      void qc.invalidateQueries({
        queryKey: queryKeys.portalBooking(businessId ?? "", vars.bookingId),
      });
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePortalConversation(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalConversation(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ conversation: Conversation | null }>(
        "/api/v1/portal/conversations",
        { query: { businessId } },
      );
      return res.data.conversation;
    },
  });
}

export function usePortalMessages(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalMessages(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ messages: ConversationMessage[] }>(
        "/api/v1/portal/conversations/messages",
        { query: { businessId } },
      );
      return res.data.messages;
    },
  });
}

export function useSendPortalMessage(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    ConversationMessage,
    ApiError,
    string,
    { previous: ConversationMessage[] | undefined; optimisticId: string }
  >({
    mutationFn: async (body: string) => {
      const res = await api.post<{ message: ConversationMessage }>(
        "/api/v1/portal/conversations/messages",
        { body },
        { query: { businessId } },
      );
      return res.data.message;
    },
    onMutate: async (body) => {
      const key = queryKeys.portalMessages(businessId ?? "");
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConversationMessage[]>(key);
      const optimisticId = `optimistic-${newIdempotencyKey()}`;
      const optimisticMessage: ConversationMessage = {
        id: optimisticId,
        businessId: businessId ?? "",
        conversationId: previous?.[0]?.conversationId ?? "",
        senderType: "customer",
        senderId: "me",
        body,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<ConversationMessage[]>(key, (old) => [...(old ?? []), optimisticMessage]);
      return { previous, optimisticId };
    },
    onError: (err, _body, context) => {
      const key = queryKeys.portalMessages(businessId ?? "");
      if (context) qc.setQueryData<ConversationMessage[]>(key, context.previous);
      toastApiError(err);
    },
    onSuccess: (message, _body, context) => {
      const key = queryKeys.portalMessages(businessId ?? "");
      qc.setQueryData<ConversationMessage[]>(key, (old) =>
        (old ?? []).map((m) => (m.id === context.optimisticId ? message : m)),
      );
      void qc.invalidateQueries({ queryKey: queryKeys.portalConversation(businessId ?? "") });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.portalMessages(businessId ?? "") });
    },
  });
}

export function usePortalPayments(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalPayments(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ payments: Payment[] }>("/api/v1/portal/payments", {
        query: { businessId },
      });
      return res.data.payments;
    },
  });
}

/** A bucket of prepaid sessions, as the customer who owns it sees it. */
export type PortalCredit = {
  id: string;
  packageId: string;
  /** Empty means the credits can be spent on any service. */
  eligibleServiceIds: string[];
  unitsIssued: number;
  available: number;
  reserved: number;
  expiresAt: string;
  status: string;
};

export function usePortalCredits(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalCredits(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ credits: PortalCredit[] }>("/api/v1/portal/credits", {
        query: { businessId },
      });
      return res.data.credits;
    },
  });
}

/** One row of a customer's account, tagged with the studio it came from. */
export type FromStudio<T> = T & { readonly studio: PortalBusinessSummary };

/**
 * Everything a customer has, across every studio they deal with.
 *
 * Assembled in the browser from the per-studio endpoints rather than served by
 * a cross-business one. Every portal read is `businessId`-scoped by design, and
 * ADR 0018 rules out a cross-business customer graph at launch, so fanning out
 * here respects that decision instead of quietly reversing it. Worth revisiting
 * if anyone accumulates enough studios for the request count to matter; in
 * practice that number is one or two.
 *
 * A studio that fails is reported but does not blank the page — the others still
 * have sessions the customer needs to see.
 */
export function usePortalAcrossStudios(studios: PortalBusinessSummary[] | undefined) {
  const list = useMemo(() => studios ?? [], [studios]);

  const bookings = useQueries({
    queries: list.map((studio) => ({
      queryKey: queryKeys.portalBookings(studio.id),
      queryFn: async () => {
        const res = await api.get<{ bookings: Booking[] }>("/api/v1/portal/bookings", {
          query: { businessId: studio.id },
        });
        return res.data.bookings;
      },
    })),
    combine: (results) => combineByStudio(results, list),
  });

  const credits = useQueries({
    queries: list.map((studio) => ({
      queryKey: queryKeys.portalCredits(studio.id),
      queryFn: async () => {
        const res = await api.get<{ credits: PortalCredit[] }>("/api/v1/portal/credits", {
          query: { businessId: studio.id },
        });
        return res.data.credits;
      },
    })),
    combine: (results) => combineByStudio(results, list),
  });

  const payments = useQueries({
    queries: list.map((studio) => ({
      queryKey: queryKeys.portalPayments(studio.id),
      queryFn: async () => {
        const res = await api.get<{ payments: Payment[] }>("/api/v1/portal/payments", {
          query: { businessId: studio.id },
        });
        return res.data.payments;
      },
    })),
    combine: (results) => combineByStudio(results, list),
  });

  return { bookings, credits, payments };
}

function combineByStudio<T>(
  results: readonly { data?: T[]; isPending: boolean; isError: boolean }[],
  studios: readonly PortalBusinessSummary[],
) {
  return {
    data: results.flatMap((result, i) =>
      (result.data ?? []).map((row) => ({ ...row, studio: studios[i] }) as FromStudio<T>),
    ),
    isPending: results.some((r) => r.isPending),
    /** True when a studio failed, even though the rest loaded. */
    isPartial: results.some((r) => r.isError),
  };
}

/**
 * Books a session against a credit the customer already owns. Only the slot is sent:
 * the API resolves who the booking is for from the portal link, so this cannot spend
 * another customer's credits.
 */
export function useBookWithPortalCredit(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<Booking, ApiError, { slotToken: string; notesCustomer?: string | null }>({
    mutationFn: createIdempotentMutationFn(
      async (
        vars: { slotToken: string; notesCustomer?: string | null },
        idempotencyKey: string,
      ) => {
        const res = await api.post<{ booking: Booking }>(
          "/api/v1/portal/bookings",
          { slotToken: vars.slotToken, notesCustomer: vars.notesCustomer ?? null },
          { query: { businessId }, idempotencyKey },
        );
        return res.data.booking;
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.portalBookings(businessId ?? "") });
      void qc.invalidateQueries({ queryKey: queryKeys.portalCredits(businessId ?? "") });
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePortalNotes(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalNotes(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ notes: CustomerNote[] }>("/api/v1/portal/notes", {
        query: { businessId },
      });
      return res.data.notes;
    },
  });
}

export function usePortalLinkedRecords(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portalLinkedRecords(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ records: LinkedRecord[] }>("/api/v1/portal/linked-records", {
        query: { businessId },
      });
      return res.data.records;
    },
  });
}

/* ---------------- Platform admin: cross-tenant billing (RECA-509) ---------------- */

export type PlatformOverride = {
  id: string;
  businessId?: string;
  kind: "grant" | "deny" | "limit" | "billing_bypass" | "suspension";
  featureKey?: string | null;
  limitKey?: string | null;
  limitValue?: number | null;
  reason: string;
  startsAt: string;
  endsAt?: string | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
  createdAt?: string;
} & Record<string, unknown>;

/** Shape is intentionally loose — openapi leaves the admin billing view content unspecified. */
export type PlatformBillingView = {
  business?: { id: string; tradingName?: string | null; status?: string } | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  accessState?: string | null;
  subscription?: Record<string, unknown> | null;
  plan?: PublicCataloguePlan | null;
  usage?: Record<string, number> | null;
  limits?: Record<string, number> | null;
  overrides?: PlatformOverride[];
} & Record<string, unknown>;

export function usePlatformBilling(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.platformBilling(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<PlatformBillingView>(
        `/api/v1/platform/businesses/${businessId}/billing`,
      );
      return res.data;
    },
  });
}

export function useReconcilePlatformBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (businessId: string) => {
      const res = await api.post<PlatformBillingView>(
        `/api/v1/platform/businesses/${businessId}/billing/reconcile`,
        {},
      );
      return { data: res.data, requestId: res.requestId };
    },
    onSuccess: (_result, businessId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.platformBilling(businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCancelPlatformBillingImmediate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { businessId: string; reason: string }) => {
      const res = await api.post<PlatformBillingView>(
        `/api/v1/platform/businesses/${vars.businessId}/billing/cancel-immediate`,
        { reason: vars.reason, confirmation: "CONFIRM" },
      );
      return { data: res.data, requestId: res.requestId };
    },
    onSuccess: (_result, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.platformBilling(vars.businessId) });
    },
    onError: (err) => toastApiError(err),
  });
}

export function usePlatformOverrides(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.platformOverrides(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ overrides: PlatformOverride[] }>(
        `/api/v1/platform/businesses/${businessId}/overrides`,
      );
      return res.data.overrides ?? [];
    },
  });
}

export function useCreatePlatformOverride(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      kind: PlatformOverride["kind"];
      featureKey?: string | null;
      limitKey?: string | null;
      limitValue?: number | null;
      reason: string;
      startsAt?: string;
      endsAt?: string | null;
      confirmation?: string;
    }) => {
      const res = await api.post<{ override: PlatformOverride }>(
        `/api/v1/platform/businesses/${businessId}/overrides`,
        body,
      );
      return { override: res.data.override, requestId: res.requestId };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platformOverrides(businessId ?? "") });
      void qc.invalidateQueries({ queryKey: queryKeys.platformBilling(businessId ?? "") });
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRevokePlatformOverride(businessId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { overrideId: string; reason: string }) => {
      const res = await request({
        method: "DELETE",
        path: `/api/v1/platform/businesses/${businessId}/overrides/${vars.overrideId}`,
        body: { reason: vars.reason },
      });
      return { requestId: res.requestId };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.platformOverrides(businessId ?? "") });
      void qc.invalidateQueries({ queryKey: queryKeys.platformBilling(businessId ?? "") });
    },
    onError: (err) => toastApiError(err),
  });
}

export { newIdempotencyKey };
