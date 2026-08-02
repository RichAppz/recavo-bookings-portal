import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  ApiError,
  createIdempotentMutationFn,
  newIdempotencyKey,
  queryKeys,
  request,
  toastApiError,
} from "@/lib/api";
import type {
  AvailabilitySlot,
  Booking,
  CatalogueService,
  ConnectAccount,
  Conversation,
  ConversationMessage,
  CreditLedgerEntry,
  Customer,
  CustomerNote,
  Dashboard,
  Entitlement,
  EntitlementView,
  FileResource,
  Invitation,
  LinkedRecord,
  Location,
  Notification,
  Package,
  PackagePurchase,
  Payment,
  PublicCataloguePlan,
  Staff,
} from "@/lib/api/types";
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
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "bookings"] });
      void qc.invalidateQueries({
        queryKey: queryKeys.booking(businessId, vars.bookingId),
      });
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

export function useSendMessage(conversationId: string | undefined) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.post<{ message: ConversationMessage }>(
        `/api/v1/businesses/${businessId}/conversations/${conversationId}/messages`,
        { body },
      );
      return res.data.message;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.messages(businessId, conversationId ?? ""),
      });
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
        return { data: res.data, requestId: res.requestId };
      },
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["biz", businessId, "admin", "outbox"] });
    },
    onError: (err) => toastApiError(err),
  });
}

/* ---------------- Public booking journey (RECA-507) ---------------- */

export function usePublicServices(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicServices(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ services: CatalogueService[] }>(
        `/api/v1/public/businesses/${businessId}/services`,
        { public: true },
      );
      return res.data.services.filter((s) => s.active);
    },
  });
}

export function usePublicLocations(businessId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicLocations(businessId ?? ""),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ locations: Location[] }>(
        `/api/v1/public/businesses/${businessId}/locations`,
        { public: true },
      );
      return res.data.locations.filter((l) => l.active);
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
        const res = await api.post<{ booking: Booking; holdToken: string }>(
          `/api/v1/public/businesses/${businessId}/booking-holds`,
          body,
          { public: true, idempotencyKey },
        );
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
