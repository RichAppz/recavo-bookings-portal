import type { PolicyDocumentType } from "@/lib/api/types";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { VERTICALS, type VerticalKey } from "@/lib/verticals";

/* Plain-English labels the Settings pages share. Pure data: no React, no API. */

export const POLICY_TYPE_META: Record<PolicyDocumentType, { label: string; description: string }> =
  {
    cancellation: {
      label: "Cancellation policy",
      description: "Notice periods, late cancellations and what you charge for them.",
    },
    terms: {
      label: "Terms and conditions",
      description: "The agreement between your business and the people who book with it.",
    },
    privacy: {
      label: "Privacy notice",
      description: "What personal data you collect, why you hold it and for how long.",
    },
    consent_text: {
      label: "Consent wording",
      description: "The text a client agrees to when they confirm a booking.",
    },
    package_terms: {
      label: "Package terms",
      description: "Expiry, transfers and refunds for prepaid packages.",
    },
    dpa: {
      label: "Data processing addendum",
      description: "Controller and processor terms, including subprocessors.",
    },
  };

export const POLICY_TYPES: PolicyDocumentType[] = [
  "cancellation",
  "terms",
  "privacy",
  "consent_text",
  "package_terms",
  "dpa",
];

export function policyLabel(type: string): string {
  return POLICY_TYPE_META[type as PolicyDocumentType]?.label ?? type.replace(/_/g, " ");
}

/**
 * Display label for an industry template key. Known verticals use their product
 * label (`car_detailing` is branded "Automotive"); unknown keys are title-cased.
 */
export function formatIndustry(key: string): string {
  const vertical = VERTICALS[key as VerticalKey];
  if (vertical) return vertical.label;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Sentence-case a raw token like `some_action` → `Some action`. */
export function humanizeToken(token: string): string {
  const words = token
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Known audit action keys → plain-English phrases shown to the business owner. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  "credit.issued": "Credit issued",
  "credit.adjusted": "Credit adjusted",
  "customer.created": "Customer created",
  "payment.refunded": "Payment refunded",
  "file.retention_run": "Data retention run",
  "file.download_url_issued": "File download link issued",
  "file.malware_scan": "File malware scan",
};

/**
 * Map a raw audit action key to a readable label. Unknown keys fall back to the
 * part after the last `.`, sentence-cased (`namespace.some_action` → "Some action").
 */
export function auditActionLabel(action: string): string {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  const tail = action.includes(".") ? action.slice(action.lastIndexOf(".") + 1) : action;
  return humanizeToken(tail) || action;
}

/** The part before the first `.` — what kind of thing the action is about. */
export function auditActionGroup(action: string): string {
  const head = action.includes(".") ? action.slice(0, action.indexOf(".")) : action;
  return humanizeToken(head) || action;
}

/** Actor type → who performed the action. Never surfaces the opaque actor ID. */
const AUDIT_ACTOR_LABELS: Record<string, string> = {
  system: "System",
  user: "Team member",
};

export function auditActorLabel(actorType: string): string {
  return AUDIT_ACTOR_LABELS[actorType] ?? (humanizeToken(actorType) || actorType);
}

/** Target type → what the action affected. Never surfaces the opaque target ID. */
const AUDIT_TARGET_LABELS: Record<string, string> = {
  customer: "a customer",
  entitlement: "a credit/entitlement",
  payment: "a payment",
  retention: "a retention job",
  booking: "a booking",
  file: "a file",
  policy: "a policy document",
  privacy: "a privacy notice",
  business: "the business",
  membership: "a team member",
  invitation: "an invitation",
  user: "a team member",
};

export function auditTargetLabel(targetType: string): string {
  if (AUDIT_TARGET_LABELS[targetType]) return AUDIT_TARGET_LABELS[targetType];
  const humanized = humanizeToken(targetType).toLowerCase();
  return humanized ? `a ${humanized}` : targetType;
}

export const INVITE_ROLES = [
  SYSTEM_ROLES.ADMINISTRATOR,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.STAFF,
  SYSTEM_ROLES.RECEPTION,
  SYSTEM_ROLES.FINANCE,
  SYSTEM_ROLES.RESTRICTED_STAFF,
] as const;

/** One line per role for the Team list — what the role lets someone do. */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  [SYSTEM_ROLES.BUSINESS_OWNER]: "Everything, including the plan and closing the business.",
  [SYSTEM_ROLES.ADMINISTRATOR]: "Everything except owner-only actions.",
  [SYSTEM_ROLES.MANAGER]: "Bookings, clients, invoices and reports.",
  [SYSTEM_ROLES.STAFF]: "Their own bookings and the client list.",
  [SYSTEM_ROLES.RECEPTION]: "All bookings and clients; sees payments and invoices.",
  [SYSTEM_ROLES.FINANCE]: "Payments, refunds, invoices, reports and the plan.",
  [SYSTEM_ROLES.RESTRICTED_STAFF]: "Their own bookings only.",
};

/** ISO 4217 codes offered in the currency select; the saved value is always included too. */
export const CURRENCY_OPTIONS: readonly { code: string; label: string }[] = [
  { code: "GBP", label: "British pound (GBP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "US dollar (USD)" },
  { code: "AUD", label: "Australian dollar (AUD)" },
  { code: "CAD", label: "Canadian dollar (CAD)" },
  { code: "NZD", label: "New Zealand dollar (NZD)" },
  { code: "CHF", label: "Swiss franc (CHF)" },
  { code: "SEK", label: "Swedish krona (SEK)" },
  { code: "NOK", label: "Norwegian krone (NOK)" },
  { code: "DKK", label: "Danish krone (DKK)" },
  { code: "PLN", label: "Polish złoty (PLN)" },
  { code: "CZK", label: "Czech koruna (CZK)" },
  { code: "AED", label: "UAE dirham (AED)" },
  { code: "ZAR", label: "South African rand (ZAR)" },
  { code: "SGD", label: "Singapore dollar (SGD)" },
  { code: "HKD", label: "Hong Kong dollar (HKD)" },
  { code: "JPY", label: "Japanese yen (JPY)" },
  { code: "INR", label: "Indian rupee (INR)" },
];

/** Enough coverage for the markets we sell in; the API accepts any BCP 47 tag. */
export const LOCALE_OPTIONS = [
  "en-GB",
  "en-US",
  "en-IE",
  "en-AU",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "nl-NL",
  "pt-PT",
  "pl-PL",
] as const;

export function localeLabel(tag: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    return display && display !== tag ? `${display} (${tag})` : tag;
  } catch {
    return tag;
  }
}

/** ISO 3166-1 alpha-2 codes offered in the country select, UK and Ireland first. */
export const COUNTRY_OPTIONS: readonly string[] = [
  "GB",
  "IE",
  "US",
  "CA",
  "AU",
  "NZ",
  "FR",
  "DE",
  "ES",
  "IT",
  "NL",
  "BE",
  "PT",
  "AT",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CZ",
  "AE",
  "ZA",
  "SG",
  "HK",
  "JP",
  "IN",
];

export function countryLabel(code: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return display && display !== code ? display : code;
  } catch {
    return code;
  }
}
