import type { components } from "./schema";

export type schemas = components["schemas"];

export type User = schemas["User"];
export type Business = schemas["Business"];
export type BusinessSummary = schemas["BusinessSummary"];
export type BusinessConfiguration = schemas["BusinessConfiguration"];
export type Membership = schemas["Membership"];
export type Location = schemas["Location"];
export type Staff = schemas["Staff"];
export type CatalogueService = schemas["CatalogueService"];
export type Booking = schemas["Booking"];
/** History entries are loosely typed in OpenAPI (`additionalProperties: true`). */
export type BookingHistoryEntry = {
  at?: string;
  createdAt?: string;
  timestamp?: string;
  occurredAt?: string;
  action?: string;
  event?: string;
  type?: string;
  fromStatus?: string;
  toStatus?: string;
  status?: string;
  actorType?: string;
  actorId?: string | null;
  actorName?: string | null;
  [key: string]: unknown;
};
export type AvailabilitySlot = schemas["AvailabilitySlot"];
export type Customer = schemas["Customer"];
export type CustomerNote = schemas["CustomerNote"];
export type CustomerTag = schemas["CustomerTag"];
export type Package = schemas["Package"];
export type PackagePurchase = schemas["PackagePurchase"];
export type Entitlement = schemas["Entitlement"];
export type CreditBalance = schemas["CreditBalance"];
export type EntitlementView = schemas["EntitlementView"];
export type CreditLedgerEntry = schemas["CreditLedgerEntry"];
export type PublicCataloguePlan = schemas["PublicCataloguePlan"];
export type Payment = schemas["Payment"];
export type Refund = schemas["Refund"];
export type PaymentReceipt = schemas["PaymentReceipt"];
export type ConnectAccount = schemas["ConnectAccount"];
export type Conversation = schemas["Conversation"];
export type ConversationMessage = schemas["ConversationMessage"];
export type Notification = schemas["Notification"];
export type Dashboard = schemas["Dashboard"];
export type FileResource = schemas["File"];
export type Resource = schemas["Resource"];
export type ExportRequest = schemas["ExportRequest"];
export type OutboxEvent = schemas["OutboxEvent"];
export type FailedJob = schemas["FailedJob"];
export type PolicyDocument = schemas["PolicyDocument"];
export type Invitation = schemas["Invitation"];
export type LinkedRecord = schemas["LinkedRecord"];
export type ConsentRecord = schemas["ConsentRecord"];
export type LinkedRecordDefinition = schemas["LinkedRecordDefinition"];
export type AuditEvent = schemas["AuditEvent"];
export type PrivacyNotice = schemas["PrivacyNotice"];
export type BusinessLifecycle = schemas["BusinessLifecycle"];
export type ProblemDetails = schemas["ProblemDetails"];

export type PolicyDocumentType = PolicyDocument["type"];
export type SaasPlanCode = PublicCataloguePlan["code"];
export type SaasInterval = PublicCataloguePlan["prices"][number]["interval"];

export type LinkedRecordDefinitionBundle = {
  definition: LinkedRecordDefinition;
  fields: Array<Record<string, unknown>>;
};

export type SubscriptionChangePreview = {
  previewToken: string;
  expiresAt: string;
  changeKind: "upgrade" | "downgrade" | "interval_switch";
  timing: "immediate" | "period_end";
  current: { plan: SaasPlanCode; interval: SaasInterval };
  target: { plan: SaasPlanCode; interval: SaasInterval; planVersion: string };
  currency: string;
  chargeNowMinor: number;
  creditNowMinor: number;
  nextAmountMinor?: number | null;
  nextPeriodEnd?: string | null;
  taxMinor: number;
  effectiveAt: string;
  prorationDateUnix: number;
  overLimitBlockers: Array<{
    limitKey: string;
    currentUsage: number;
    targetLimit: number;
  }>;
};

/** Business setup checklist — `GET /api/v1/businesses/{id}/onboarding`. */
export type OnboardingStepKey =
  | "location"
  | "staff_availability"
  | "service"
  | "client"
  | "first_booking"
  | "saas_subscription"
  | "public_booking"
  | "stripe_connect"
  | "policies"
  | "package";

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
  skipped: boolean;
  href: string;
  completedAt?: string | null;
};

export type BusinessOnboarding = {
  businessId: string;
  status: "in_progress" | "complete" | "dismissed";
  percentComplete: number;
  requiredCompleted: number;
  requiredTotal: number;
  dismissedAt?: string | null;
  steps: OnboardingStep[];
  version: number;
};

/** RECA-511 — `POST …/policy-documents/ai/draft` */
export type AiPolicyDraftRequest = {
  businessName: string;
  cancellationWindowHours: number;
  lateCancelNotes?: string;
  refundNotes?: string;
  locale?: string;
  industryHint?: string;
};

export type AiPolicyDraftResponse = {
  drafts: {
    cancellation: PolicyDocument;
    terms: PolicyDocument;
  };
  model: string;
  disclaimer: string;
};

export function customerDisplayName(c: Pick<Customer, "firstName" | "lastName">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

/** The account name and email, as embedded on a membership row or held on the session. */
export type AccountIdentity = {
  name?: string | null;
  email?: string | null;
};

/**
 * `GET …/memberships` still embeds the account behind each membership so the
 * Team list can show a name rather than a uuid. The OpenAPI contract stopped
 * modelling that embed, so it is declared optional here and every reader must
 * cope with it being absent.
 */
export type MembershipWithUser = Membership & {
  user?: (AccountIdentity & { id: string }) | null;
};

/** Editable fields on `PATCH /api/v1/me`. `displayName` is a deprecated alias and unused here. */
export type UserProfileUpdate = {
  name?: string | null;
  phone?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

/** Account / membership name; falls back to email when the name is unset. */
export function userDisplayName(
  user: AccountIdentity | null | undefined,
  fallback = "Signed in",
): string {
  if (!user) return fallback;
  return user.name?.trim() || user.email || fallback;
}
