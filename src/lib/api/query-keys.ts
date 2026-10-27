/** Hierarchical React Query keys, namespaced by businessId for tenant switches. */
export const queryKeys = {
  me: () => ["me"] as const,
  accountDeletionPreview: () => ["me", "deletion-preview"] as const,
  emailPreferences: () => ["me", "email-preferences"] as const,
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
  bookingSettlements: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId, "settlements"] as const,

  /** Prefix for every calendar-block list — invalidate after any block write. */
  calendarBlocksAll: (businessId: string) => ["biz", businessId, "calendar-blocks"] as const,
  calendarBlocks: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "calendar-blocks", filters ?? {}] as const,

  availability: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "availability", filters ?? {}] as const,

  customers: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "customers", filters ?? {}] as const,
  customersInfinite: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "customers", "infinite", filters ?? {}] as const,
  customerCounts: (businessId: string) => ["biz", businessId, "customers", "counts"] as const,
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
  customerNotifications: (businessId: string, customerId: string) =>
    ["biz", businessId, "customers", customerId, "notifications"] as const,
  /** Prefix for every business-wide record list — invalidate after any record write. */
  linkedRecordsAll: (businessId: string) => ["biz", businessId, "linked-records", "list"] as const,
  linkedRecords: (businessId: string, query: Record<string, string>) =>
    ["biz", businessId, "linked-records", "list", query] as const,
  linkedRecord: (businessId: string, recordId: string) =>
    ["biz", businessId, "linked-records", recordId] as const,
  linkedRecordOwnership: (businessId: string, recordId: string) =>
    ["biz", businessId, "linked-records", recordId, "ownership"] as const,

  services: (businessId: string) => ["biz", businessId, "services"] as const,
  service: (businessId: string, serviceId: string) =>
    ["biz", businessId, "services", serviceId] as const,
  /** Under `services` so any catalogue change refreshes them too. */
  serviceCategoryOrder: (businessId: string) =>
    ["biz", businessId, "services", "~category-order"] as const,
  serviceUsage: (businessId: string) => ["biz", businessId, "services", "~usage"] as const,
  upsellPairings: (businessId: string) =>
    ["biz", businessId, "services", "~upsell-pairings"] as const,

  /** Consumables catalogue (automotive); the list carries `serviceIds` for "used by N services". */
  consumables: (businessId: string) => ["biz", businessId, "consumables"] as const,
  /** The catalogue with each row's usage for a period (the page's "Used this month" column). */
  consumablesForPeriod: (businessId: string, period: string) =>
    ["biz", businessId, "consumables", "period", period] as const,
  consumableFigures: (businessId: string, period: string) =>
    ["biz", businessId, "consumables", "figures", period] as const,
  consumableActivity: (businessId: string, consumableId: string, period: string, limit: number) =>
    ["biz", businessId, "consumables", "activity", consumableId, period, limit] as const,
  serviceConsumables: (businessId: string, serviceId: string) =>
    ["biz", businessId, "services", serviceId, "consumables"] as const,
  bookingConsumables: (businessId: string, bookingId: string) =>
    ["biz", businessId, "bookings", bookingId, "consumables"] as const,

  /** Service follow-ups (top-up reminders). Lists are keyed by their filter so the prefix invalidates all. */
  followUps: (businessId: string, filter?: Record<string, unknown>) =>
    filter
      ? (["biz", businessId, "follow-ups", filter] as const)
      : (["biz", businessId, "follow-ups"] as const),
  followUp: (businessId: string, followUpId: string) =>
    ["biz", businessId, "follow-ups", "one", followUpId] as const,

  /** Waitlist. Lists are keyed by their filter; the bare prefix invalidates lists and the count. */
  waitlist: (businessId: string, filter?: Record<string, unknown>) =>
    filter
      ? (["biz", businessId, "waitlist", filter] as const)
      : (["biz", businessId, "waitlist"] as const),
  waitlistSummary: (businessId: string) => ["biz", businessId, "waitlist", "summary"] as const,
  waitlistEntry: (businessId: string, entryId: string) =>
    ["biz", businessId, "waitlist", "entry", entryId] as const,
  waitlistFigures: (businessId: string, locationId?: string) =>
    ["biz", businessId, "waitlist", "figures", locationId ?? null] as const,
  waitlistSlotEvents: (businessId: string, locationId?: string) =>
    ["biz", businessId, "waitlist", "slot-events", locationId ?? null] as const,
  waitlistFreeTimes: (businessId: string, entryId: string) =>
    ["biz", businessId, "waitlist", "free-times", entryId] as const,

  /** Upsells: a service's add-on pairings, and the offers/requests on staff-made bookings. */
  serviceUpsells: (businessId: string, serviceId: string) =>
    ["biz", businessId, "services", serviceId, "upsells"] as const,
  upsellOffers: (businessId: string, filter?: Record<string, unknown>) =>
    filter
      ? (["biz", businessId, "upsell-offers", filter] as const)
      : (["biz", businessId, "upsell-offers"] as const),
  upsellOffersSummary: (businessId: string) =>
    ["biz", businessId, "upsell-offers", "summary"] as const,
  publicUpsellOffer: (token: string) => ["public", "upsell-offer", token] as const,

  staff: (businessId: string) => ["biz", businessId, "staff"] as const,
  staffMember: (businessId: string, staffId: string) =>
    ["biz", businessId, "staff", staffId] as const,
  team: (businessId: string) => ["biz", businessId, "staff", "team"] as const,
  teamBookability: (businessId: string, staffId: string) =>
    ["biz", businessId, "staff", "team", "bookability", staffId] as const,
  teamTimeAway: (businessId: string, staffId: string, range?: Record<string, unknown>) =>
    range
      ? (["biz", businessId, "staff", "team", "time-away", staffId, range] as const)
      : (["biz", businessId, "staff", "team", "time-away", staffId] as const),

  packages: (businessId: string) => ["biz", businessId, "packages"] as const,
  package: (businessId: string, packageId: string) =>
    ["biz", businessId, "packages", packageId] as const,
  packageLinks: (businessId: string) => ["biz", businessId, "package-links"] as const,
  packageRequests: (businessId: string, status: string) =>
    ["biz", businessId, "package-requests", status] as const,
  supportRequests: (businessId: string) => ["biz", businessId, "support-requests"] as const,
  supportRequest: (businessId: string, requestId: string) =>
    ["biz", businessId, "support-requests", requestId] as const,
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
  paymentsActivity: (businessId: string, from: string, to: string) =>
    ["biz", businessId, "payments", "~activity", from, to] as const,
  paymentsOwed: (businessId: string) => ["biz", businessId, "payments", "~owed"] as const,
  connectAccount: (businessId: string) => ["biz", businessId, "connect"] as const,

  /** Prefix for every invoice list — invalidate after any invoice write. */
  invoicesAll: (businessId: string) => ["biz", businessId, "invoices", "list"] as const,
  invoices: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "invoices", "list", filters ?? {}] as const,
  invoice: (businessId: string, invoiceId: string) =>
    ["biz", businessId, "invoices", invoiceId] as const,

  conversations: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "conversations", filters ?? {}] as const,
  conversation: (businessId: string, conversationId: string) =>
    ["biz", businessId, "conversations", conversationId] as const,
  messages: (businessId: string, conversationId: string) =>
    ["biz", businessId, "conversations", conversationId, "messages"] as const,
  /** Paged thread (newest page first) for the Messages page; under `messages` so both refresh. */
  threadPages: (businessId: string, conversationId: string) =>
    ["biz", businessId, "conversations", conversationId, "messages", "pages"] as const,
  /** Under `conversations` so a `conversation.changed` hint refreshes every inbox view. */
  inbox: (businessId: string, filters?: Record<string, unknown>) =>
    ["biz", businessId, "conversations", "inbox", filters ?? {}] as const,
  savedReplies: (businessId: string) => ["biz", businessId, "saved-replies"] as const,
  broadcasts: (businessId: string) => ["biz", businessId, "broadcasts"] as const,
  broadcastPreview: (businessId: string, input: Record<string, unknown>) =>
    ["biz", businessId, "broadcasts", "preview", input] as const,
  broadcastOptions: (businessId: string) => ["biz", businessId, "broadcasts", "options"] as const,
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
  appStoreConfig: (businessId: string) => ["biz", businessId, "iap-config"] as const,
  smsCredits: (businessId: string) => ["biz", businessId, "sms-credits"] as const,
  referral: (businessId: string) => ["biz", businessId, "referral"] as const,
  plans: () => ["plans"] as const,
  billingCatalogue: () => ["billing", "catalogue"] as const,

  invitations: (businessId: string) => ["biz", businessId, "invitations"] as const,
  policyDocuments: (businessId: string) => ["biz", businessId, "policy-documents"] as const,
  policyDocumentCurrent: (businessId: string, type: string) =>
    ["biz", businessId, "policy-documents", "current", type] as const,
  privacyNoticeLatest: (businessId: string) =>
    ["biz", businessId, "privacy-notices", "latest"] as const,
  notificationTemplates: (businessId: string) =>
    ["biz", businessId, "notification-templates"] as const,
  notificationTemplatePreview: (businessId: string, key: string, channel: string, body: string) =>
    ["biz", businessId, "notification-templates", "preview", key, channel, body] as const,
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
  ownerFiles: (businessId: string, ownerType: string, ownerId: string) =>
    ["biz", businessId, "files", "owner", ownerType, ownerId] as const,
  fileDownloadUrl: (businessId: string, fileId: string) =>
    ["biz", businessId, "files", fileId, "download-url"] as const,

  // Public / portal surfaces
  /** Keyed by handle, not id: resolving the handle is the point of the request. */
  publicBusiness: (handle: string) => ["public", "business", handle] as const,
  publicServices: (businessId: string) => ["public", businessId, "services"] as const,
  publicCategoryOrder: (businessId: string) =>
    ["public", businessId, "service-category-order"] as const,
  publicLocations: (businessId: string) => ["public", businessId, "locations"] as const,
  publicPackages: (businessId: string) => ["public", businessId, "packages"] as const,
  publicPackageLink: (businessId: string, code: string) =>
    ["public", businessId, "package-links", code] as const,
  publicAvailability: (businessId: string, filters?: Record<string, unknown>) =>
    ["public", businessId, "availability", filters ?? {}] as const,
  /** Every cached day of availability, for when a booking has just taken a slot. */
  publicAvailabilityAll: (businessId: string) => ["public", businessId, "availability"] as const,
  publicStaff: (businessId: string) => ["public", businessId, "staff"] as const,
  publicCancellationPolicy: (businessId: string) =>
    ["public", businessId, "policies", "cancellation"] as const,
  publicReviews: (businessId: string) => ["public", businessId, "reviews"] as const,
  /** The Google listing a studio connected for its booking page, staff side. */
  googlePlace: (businessId: string) => ["biz", businessId, "booking-page", "google-place"] as const,
  googlePlaceSearch: (businessId: string, q: string) =>
    ["biz", businessId, "booking-page", "google-place", "search", q] as const,
  /** The studio's own booking page settings (draft + published), staff side. */
  bookingPage: (businessId: string) => ["biz", businessId, "booking-page"] as const,
  slugAvailability: (businessId: string, slug: string) =>
    ["biz", businessId, "slug-availability", slug] as const,
  portalWaitlist: (businessId: string) => ["portal", businessId, "waitlist"] as const,

  /** Not business-scoped: it is the lookup that finds which businesses to scope to. */
  portalBusinesses: () => ["portal", "businesses"] as const,
  /** Runs once per session, before the businesses lookup can be trusted. */
  portalLink: () => ["portal", "link"] as const,
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
  portalPurchases: (businessId: string) => ["portal", businessId, "purchases"] as const,
  portalPackageRequests: (businessId: string) =>
    ["portal", businessId, "package-requests"] as const,
  portalPackageLinks: (businessId: string) => ["portal", businessId, "package-links"] as const,
  portalLinkedRecords: (businessId: string) => ["portal", businessId, "linked-records"] as const,
  portalInvoices: (businessId: string) => ["portal", businessId, "invoices"] as const,
  portalInvoice: (businessId: string, invoiceId: string) =>
    ["portal", businessId, "invoices", invoiceId] as const,

  // Platform admin: cross-tenant billing (RECA-509)
  platformBilling: (businessId: string) => ["platform", businessId, "billing"] as const,
  platformOverrides: (businessId: string) => ["platform", businessId, "overrides"] as const,
} as const;
