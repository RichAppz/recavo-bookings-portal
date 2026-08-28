/** Hierarchical React Query keys, namespaced by businessId for tenant switches. */
export const queryKeys = {
  me: () => ["me"] as const,
  myBusinesses: () => ["me", "businesses"] as const,

  biz: (businessId: string) => ["biz", businessId] as const,
  business: (businessId: string) => ["biz", businessId, "business"] as const,
  onboarding: (businessId: string) => ["biz", businessId, "onboarding"] as const,
  configuration: (businessId: string) => ["biz", businessId, "configuration"] as const,
  locations: (businessId: string) => ["biz", businessId, "locations"] as const,
  location: (businessId: string, locationId: string) =>
    ["biz", businessId, "locations", locationId] as const,
  memberships: (businessId: string) => ["biz", businessId, "memberships"] as const,

  bookings: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "bookings", filters ?? {}] as const,
  booking: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId] as const,
  bookingHistory: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId, "history"] as const,
  bookingPayments: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId, "payments"] as const,

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
  paymentReceipt: (businessId: string, paymentId: string) =>
    ["biz", businessId, "payments", paymentId, "receipt"] as const,
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
  exports: (businessId: string) => ["biz", businessId, "exports"] as const,
  export: (businessId: string, exportId: string) =>
    ["biz", businessId, "exports", exportId] as const,

  subscription: (businessId: string) => ["biz", businessId, "subscription"] as const,
  plans: () => ["plans"] as const,
  billingCatalogue: () => ["billing", "catalogue"] as const,

  invitations: (businessId: string) => ["biz", businessId, "invitations"] as const,
  policyDocuments: (businessId: string) => ["biz", businessId, "policy-documents"] as const,
  policyDocumentCurrent: (businessId: string, type: string) =>
    ["biz", businessId, "policy-documents", "current", type] as const,
  privacyNoticeLatest: (businessId: string) =>
    ["biz", businessId, "privacy-notices", "latest"] as const,
  linkedRecordDefinition: (businessId: string) =>
    ["biz", businessId, "linked-record-definition"] as const,
  lifecycle: (businessId: string) => ["biz", businessId, "lifecycle"] as const,
  auditEvents: (businessId: string) => ["biz", businessId, "audit-events"] as const,

  resources: (businessId: string) => ["biz", businessId, "resources"] as const,

  failedJobs: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "admin", "jobs", "failed", filters ?? {}] as const,
  failedOutbox: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "admin", "outbox", "failed", filters ?? {}] as const,
  deadLetterOutbox: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "admin", "outbox", "dead-letter", filters ?? {}] as const,
  file: (businessId: string, fileId: string) => ["biz", businessId, "files", fileId] as const,

  // Public / portal surfaces
  publicServices: (businessId: string) => ["public", businessId, "services"] as const,
  publicLocations: (businessId: string) => ["public", businessId, "locations"] as const,
  publicPackages: (businessId: string) => ["public", businessId, "packages"] as const,
  publicAvailability: (businessId: string, filters?: Record<string, unknown>) =>
    ["public", businessId, "availability", filters ?? {}] as const,
  /** Every cached day of availability, for when a booking has just taken a slot. */
  publicAvailabilityAll: (businessId: string) => ["public", businessId, "availability"] as const,

  portalMe: (businessId: string) => ["portal", businessId, "me"] as const,
  portalBookings: (businessId: string) => ["portal", businessId, "bookings"] as const,
  portalBooking: (businessId: string, bookingId: string) =>
    ["portal", businessId, "bookings", bookingId] as const,
  portalConversation: (businessId: string) => ["portal", businessId, "conversation"] as const,
  portalMessages: (businessId: string) =>
    ["portal", businessId, "conversation", "messages"] as const,
  portalPayments: (businessId: string) => ["portal", businessId, "payments"] as const,
  portalNotes: (businessId: string) => ["portal", businessId, "notes"] as const,
  portalCredits: (businessId: string) => ["portal", businessId, "credits"] as const,
  portalLinkedRecords: (businessId: string) => ["portal", businessId, "linked-records"] as const,

  // Platform admin: cross-tenant billing (RECA-509)
  platformBilling: (businessId: string) => ["platform", businessId, "billing"] as const,
  platformOverrides: (businessId: string) => ["platform", businessId, "overrides"] as const,
} as const;
