import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  createIdempotentMutationFn,
  newIdempotencyKey,
  queryKeys,
  toastApiError,
} from "@/lib/api";
import type {
  AuditEvent,
  AvailabilitySlot,
  Booking,
  Business,
  BusinessConfiguration,
  BusinessLifecycle,
  CatalogueService,
  ConnectAccount,
  Conversation,
  ConversationMessage,
  CreditLedgerEntry,
  Customer,
  CustomerNote,
  Dashboard,
  EntitlementView,
  Invitation,
  LinkedRecordDefinition,
  LinkedRecordDefinitionBundle,
  Location,
  Membership,
  Notification,
  Package,
  Payment,
  PolicyDocument,
  PolicyDocumentType,
  PrivacyNotice,
  PublicCataloguePlan,
  SaasInterval,
  SaasPlanCode,
  Staff,
  SubscriptionChangePreview,
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

/* ---------------- Settings: business / config / team ---------------- */

export function useUpdateBusiness() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      version: number;
      body: {
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
      const res = await api.get<{ memberships: Membership[] }>(
        `/api/v1/businesses/${businessId}/memberships`,
      );
      return res.data.memberships;
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
    },
    onError: (err) => toastApiError(err),
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
        dataType:
          | "short_text"
          | "long_text"
          | "integer"
          | "decimal"
          | "boolean"
          | "date"
          | "enum";
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
