/**
 * Mirrors RECAVO API permission keys (spec §5.4) and default role bundles.
 * Source of truth: recavo-api/src/modules/access/{permissions,roles}.ts
 */

export const PERMISSIONS = {
  BUSINESS_READ: "business.read",
  BUSINESS_UPDATE: "business.update",
  TEAM_INVITE: "team.invite",
  TEAM_MANAGE_PERMISSIONS: "team.manage_permissions",
  CUSTOMER_READ: "customer.read",
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_EXPORT: "customer.export",
  BOOKING_READ_ALL: "booking.read_all",
  BOOKING_READ_OWN: "booking.read_own",
  BOOKING_CREATE: "booking.create",
  BOOKING_RESCHEDULE: "booking.reschedule",
  BOOKING_CANCEL: "booking.cancel",
  BOOKING_MARK_ATTENDANCE: "booking.mark_attendance",
  PAYMENT_READ: "payment.read",
  PAYMENT_REFUND: "payment.refund",
  PACKAGE_MANAGE: "package.manage",
  CREDIT_ADJUST: "credit.adjust",
  REPORT_READ: "report.read",
  REPORT_EXPORT: "report.export",
  AUDIT_READ: "audit.read",
  CONNECT_MANAGE: "connect.manage",
  BILLING_MANAGE: "billing.manage",
  PLATFORM_BILLING_ADMIN: "platform.billing_admin",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLES = {
  BUSINESS_OWNER: "business_owner",
  ADMINISTRATOR: "administrator",
  MANAGER: "manager",
  STAFF: "staff",
  RECEPTION: "reception",
  FINANCE: "finance",
  RESTRICTED_STAFF: "restricted_staff",
  CUSTOMER: "customer",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const P = PERMISSIONS;

const TENANT_PERMISSIONS: readonly PermissionKey[] = Object.values(P).filter(
  (p) => p !== P.PLATFORM_BILLING_ADMIN,
);

export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRoleKey, readonly PermissionKey[]> = {
  [SYSTEM_ROLES.BUSINESS_OWNER]: TENANT_PERMISSIONS,
  [SYSTEM_ROLES.ADMINISTRATOR]: [
    P.BUSINESS_READ,
    P.BUSINESS_UPDATE,
    P.TEAM_INVITE,
    P.TEAM_MANAGE_PERMISSIONS,
    P.CUSTOMER_READ,
    P.CUSTOMER_CREATE,
    P.CUSTOMER_UPDATE,
    P.CUSTOMER_EXPORT,
    P.BOOKING_READ_ALL,
    P.BOOKING_CREATE,
    P.BOOKING_RESCHEDULE,
    P.BOOKING_CANCEL,
    P.BOOKING_MARK_ATTENDANCE,
    P.PAYMENT_READ,
    P.PAYMENT_REFUND,
    P.PACKAGE_MANAGE,
    P.CREDIT_ADJUST,
    P.REPORT_READ,
    P.REPORT_EXPORT,
    P.AUDIT_READ,
    P.CONNECT_MANAGE,
    P.BILLING_MANAGE,
  ],
  [SYSTEM_ROLES.MANAGER]: [
    P.BUSINESS_READ,
    P.CUSTOMER_READ,
    P.CUSTOMER_CREATE,
    P.CUSTOMER_UPDATE,
    P.BOOKING_READ_ALL,
    P.BOOKING_CREATE,
    P.BOOKING_RESCHEDULE,
    P.BOOKING_CANCEL,
    P.BOOKING_MARK_ATTENDANCE,
    P.REPORT_READ,
  ],
  [SYSTEM_ROLES.STAFF]: [
    P.BUSINESS_READ,
    P.CUSTOMER_READ,
    P.BOOKING_READ_OWN,
    P.BOOKING_CREATE,
    P.BOOKING_MARK_ATTENDANCE,
  ],
  [SYSTEM_ROLES.RECEPTION]: [
    P.BUSINESS_READ,
    P.CUSTOMER_READ,
    P.CUSTOMER_CREATE,
    P.CUSTOMER_UPDATE,
    P.BOOKING_READ_ALL,
    P.BOOKING_CREATE,
    P.BOOKING_RESCHEDULE,
    P.BOOKING_CANCEL,
    P.PAYMENT_READ,
  ],
  [SYSTEM_ROLES.FINANCE]: [
    P.BUSINESS_READ,
    P.PAYMENT_READ,
    P.PAYMENT_REFUND,
    P.REPORT_READ,
    P.REPORT_EXPORT,
    P.BILLING_MANAGE,
    P.CONNECT_MANAGE,
    P.CREDIT_ADJUST,
  ],
  [SYSTEM_ROLES.RESTRICTED_STAFF]: [P.BUSINESS_READ, P.BOOKING_READ_OWN],
  [SYSTEM_ROLES.CUSTOMER]: [P.BOOKING_READ_OWN],
};

const ROLE_ALIASES: Record<string, SystemRoleKey> = {
  owner: SYSTEM_ROLES.BUSINESS_OWNER,
  businessowner: SYSTEM_ROLES.BUSINESS_OWNER,
  admin: SYSTEM_ROLES.ADMINISTRATOR,
};

export function normalizeRoleKey(key: string): string {
  const normalised = key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[normalised] ?? normalised;
}

export function permissionsForRoles(roleKeys: readonly string[]): Set<PermissionKey> {
  const result = new Set<PermissionKey>();
  for (const key of roleKeys) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[normalizeRoleKey(key) as SystemRoleKey];
    if (permissions) {
      for (const permission of permissions) result.add(permission);
    }
  }
  return result;
}

/** Who may start or manage the Recavo SaaS plan (not client payments). */
export function canManageSaasBilling(input: {
  can: (permission: PermissionKey | string) => boolean;
  roleKeys: readonly string[];
  /** When the console is gated, unknown/empty roles must not be a dead end. */
  blocked?: boolean;
}): boolean {
  if (input.can(PERMISSIONS.BILLING_MANAGE) || input.can(PERMISSIONS.BUSINESS_UPDATE)) {
    return true;
  }
  const roles = new Set(input.roleKeys.map(normalizeRoleKey));
  if (
    roles.has(SYSTEM_ROLES.BUSINESS_OWNER) ||
    roles.has(SYSTEM_ROLES.ADMINISTRATOR) ||
    roles.has(SYSTEM_ROLES.FINANCE)
  ) {
    return true;
  }
  return Boolean(input.blocked && input.roleKeys.length === 0);
}

export function holdsBusinessOwnerRole(roleKeys: readonly string[] | undefined): boolean {
  return (roleKeys ?? []).some((key) => normalizeRoleKey(key) === SYSTEM_ROLES.BUSINESS_OWNER);
}
