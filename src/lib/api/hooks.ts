import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  ApiError,
  createIdempotentMutationFn,
  flattenPages,
  newIdempotencyKey,
  queryKeys,
  toastApiError,
  usePaginatedQuery,
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
  EntitlementView,
  ExportRequest,
  FailedJob,
  Invitation,
  Location,
  Notification,
  OutboxEvent,
  Package,
  Payment,
  PaymentReceipt,
  PublicCataloguePlan,
  Refund,
  Resource,
  Staff,
} from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";

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

export function usePayments(filters: {
  from?: string;
  to?: string;
  state?: string;
  customerId?: string;
  enabled?: boolean;
} = {}) {
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
      return res.data;
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
      const res = await api.post(
        `/api/v1/businesses/${businessId}/admin/payments/reconcile`,
        vars,
      );
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

export { newIdempotencyKey };
