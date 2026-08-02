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
export type AvailabilitySlot = schemas["AvailabilitySlot"];
export type Customer = schemas["Customer"];
export type CustomerNote = schemas["CustomerNote"];
export type CustomerTag = schemas["CustomerTag"];
export type ConsentRecord = schemas["ConsentRecord"];
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
export type AuditEvent = schemas["AuditEvent"];
export type BusinessLifecycle = schemas["BusinessLifecycle"];
export type ProblemDetails = schemas["ProblemDetails"];

/**
 * Booking status-history entry. The API returns freeform objects
 * (`additionalProperties: true`), so field names are optional and we
 * read whichever the backend populates (audit-log-shaped fields).
 */
export type BookingHistoryEntry = {
  id?: string;
  action?: string;
  status?: string;
  fromStatus?: string;
  toStatus?: string;
  actorId?: string;
  actorType?: string;
  actorName?: string;
  reason?: string;
  occurredAt?: string;
  createdAt?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

export function customerDisplayName(c: Pick<Customer, "firstName" | "lastName">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}
