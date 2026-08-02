/** Hierarchical React Query keys, namespaced by businessId for tenant switches. */
export const queryKeys = {
  me: () => ["me"] as const,
  myBusinesses: () => ["me", "businesses"] as const,

  biz: (businessId: string) => ["biz", businessId] as const,
  business: (businessId: string) => ["biz", businessId, "business"] as const,
  configuration: (businessId: string) => ["biz", businessId, "configuration"] as const,
  locations: (businessId: string) => ["biz", businessId, "locations"] as const,
  memberships: (businessId: string) => ["biz", businessId, "memberships"] as const,

  bookings: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "bookings", filters ?? {}] as const,
  booking: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId] as const,
  bookingHistory: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId, "history"] as const,

  availability: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "availability", filters ?? {}] as const,

  customers: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "customers", filters ?? {}] as const,
  customersInfinite: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "customers", "infinite", filters ?? {}] as const,
  customer: (businessId: string, customerId: string) =>
    ["biz", businessId, "customers", customerId] as const,
  customerTagsCatalogue: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "customer-tags", filters ?? {}] as const,
  customerAssignedTags: (businessId: string, customerId: string) =>
    ["biz", businessId, "customers", customerId, "tags"] as const,
  customerConsents: (businessId: string, customerId: string) =>
    ["biz", businessId, "customers", customerId, "consents"] as const,
  customerLinkedRecords: (businessId: string, customerId: string) =>
    ["biz", businessId, "customers", customerId, "linked-records"] as const,

  services: (businessId: string) => ["biz", businessId, "services"] as const,
  service: (businessId: string, serviceId: string) =>
    ["biz", businessId, "services", serviceId] as const,

  staff: (businessId: string) => ["biz", businessId, "staff"] as const,
  staffMember: (businessId: string, staffId: string) =>
    ["biz", businessId, "staff", staffId] as const,

  packages: (businessId: string) => ["biz", businessId, "packages"] as const,
  package: (businessId: string, packageId: string) =>
    ["biz", businessId, "packages", packageId] as const,
  entitlements: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "entitlements", filters ?? {}] as const,
  creditLedger: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "credit-ledger", filters ?? {}] as const,

  payments: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "payments", filters ?? {}] as const,
  payment: (businessId: string, paymentId: string) =>
    ["biz", businessId, "payments", paymentId] as const,
  connectAccount: (businessId: string) => ["biz", businessId, "connect"] as const,

  conversations: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "conversations", filters ?? {}] as const,
  conversation: (businessId: string, conversationId: string) =>
    ["biz", businessId, "conversations", conversationId] as const,
  messages: (businessId: string, conversationId: string) =>
    ["biz", businessId, "conversations", conversationId, "messages"] as const,
  notifications: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "notifications", filters ?? {}] as const,

  dashboard: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "reports", "dashboard", filters ?? {}] as const,
  reports: (businessId: string, report: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "reports", report, filters ?? {}] as const,

  subscription: (businessId: string) => ["biz", businessId, "subscription"] as const,
  plans: () => ["plans"] as const,

  resources: (businessId: string) => ["biz", businessId, "resources"] as const,

  // Public / portal surfaces
  publicServices: (businessId: string) => ["public", businessId, "services"] as const,
  publicLocations: (businessId: string) => ["public", businessId, "locations"] as const,
  publicAvailability: (businessId: string, filters?: Record<string, unknown>) =>
    ["public", businessId, "availability", filters ?? {}] as const,

  portalMe: () => ["portal", "me"] as const,
  portalBookings: (filters?: Record<string, unknown>) =>
    ["portal", "bookings", filters ?? {}] as const,
} as const;
