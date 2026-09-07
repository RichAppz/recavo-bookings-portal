import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLES,
  canManageSaasBilling,
  holdsBusinessOwnerRole,
  normalizeRoleKey,
  permissionsForRoles,
  roleLabel,
  roleLabels,
} from "./permissions.ts";

/** How the tenant context asks the question, given a set of role keys. */
const canFor = (roleKeys: readonly string[]) => {
  const permissions = permissionsForRoles(roleKeys);
  return (permission: string) => permissions.has(permission as never);
};

describe("normalizeRoleKey", () => {
  it("tolerates the casing and spacing a human types", () => {
    assert.equal(normalizeRoleKey("  Restricted-Staff "), "restricted_staff");
    assert.equal(normalizeRoleKey("RESTRICTED STAFF"), "restricted_staff");
  });

  it("resolves the aliases the API still emits", () => {
    assert.equal(normalizeRoleKey("owner"), SYSTEM_ROLES.BUSINESS_OWNER);
    assert.equal(normalizeRoleKey("businessOwner"), SYSTEM_ROLES.BUSINESS_OWNER);
    assert.equal(normalizeRoleKey("admin"), SYSTEM_ROLES.ADMINISTRATOR);
  });

  it("leaves a role a business invented alone", () => {
    assert.equal(normalizeRoleKey("Head Coach"), "head_coach");
  });
});

describe("permissionsForRoles", () => {
  it("gives the owner everything except platform administration", () => {
    // platform.billing_admin is Recavo staff only. An owner holding it would be
    // able to edit other businesses' billing from their own console.
    const owner = permissionsForRoles([SYSTEM_ROLES.BUSINESS_OWNER]);
    assert.equal(owner.has(PERMISSIONS.BILLING_MANAGE), true);
    assert.equal(owner.has(PERMISSIONS.PAYMENT_REFUND), true);
    assert.equal(owner.has(PERMISSIONS.TEAM_MANAGE_PERMISSIONS), true);
    assert.equal(owner.has(PERMISSIONS.PLATFORM_BILLING_ADMIN), false);
  });

  it("never hands platform administration to any default role", () => {
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      assert.equal(
        permissions.includes(PERMISSIONS.PLATFORM_BILLING_ADMIN),
        false,
        `${role} must not carry platform.billing_admin`,
      );
    }
  });

  it("keeps reception out of money and the team", () => {
    const reception = permissionsForRoles([SYSTEM_ROLES.RECEPTION]);
    assert.equal(reception.has(PERMISSIONS.BOOKING_RESCHEDULE), true);
    assert.equal(reception.has(PERMISSIONS.PAYMENT_READ), true);
    assert.equal(reception.has(PERMISSIONS.PAYMENT_REFUND), false);
    assert.equal(reception.has(PERMISSIONS.TEAM_INVITE), false);
    assert.equal(reception.has(PERMISSIONS.REPORT_READ), false);
  });

  it("keeps finance out of the diary", () => {
    const finance = permissionsForRoles([SYSTEM_ROLES.FINANCE]);
    assert.equal(finance.has(PERMISSIONS.PAYMENT_REFUND), true);
    assert.equal(finance.has(PERMISSIONS.REPORT_EXPORT), true);
    assert.equal(finance.has(PERMISSIONS.BOOKING_READ_ALL), false);
    assert.equal(finance.has(PERMISSIONS.BOOKING_CREATE), false);
    assert.equal(finance.has(PERMISSIONS.CUSTOMER_READ), false);
  });

  it("limits restricted staff to their own diary", () => {
    const restricted = permissionsForRoles([SYSTEM_ROLES.RESTRICTED_STAFF]);
    assert.deepEqual(
      [...restricted].sort(),
      [PERMISSIONS.BOOKING_READ_OWN, PERMISSIONS.BUSINESS_READ].sort(),
    );
  });

  it("gives ordinary staff their own bookings, not the whole diary", () => {
    const staff = permissionsForRoles([SYSTEM_ROLES.STAFF]);
    assert.equal(staff.has(PERMISSIONS.BOOKING_READ_OWN), true);
    assert.equal(staff.has(PERMISSIONS.BOOKING_READ_ALL), false);
    assert.equal(staff.has(PERMISSIONS.BOOKING_CANCEL), false);
  });

  it("unions the permissions of everyone's roles", () => {
    // Someone can hold two roles at once; the grant must be the union, so a
    // manager who also does the books gets refunds from the finance side.
    const both = permissionsForRoles([SYSTEM_ROLES.MANAGER, SYSTEM_ROLES.FINANCE]);
    assert.equal(both.has(PERMISSIONS.BOOKING_RESCHEDULE), true);
    assert.equal(both.has(PERMISSIONS.PAYMENT_REFUND), true);
  });

  it("grants nothing for a role it does not know", () => {
    // A custom role carries no default permissions, and must not fall through
    // to some other role's bundle.
    assert.equal(permissionsForRoles(["head_coach"]).size, 0);
    assert.equal(permissionsForRoles([]).size, 0);
  });

  it("applies aliases before looking the role up", () => {
    assert.deepEqual(
      [...permissionsForRoles(["Owner"])].sort(),
      [...permissionsForRoles([SYSTEM_ROLES.BUSINESS_OWNER])].sort(),
    );
  });
});

describe("canManageSaasBilling", () => {
  it("lets anyone holding the permission through", () => {
    const roleKeys = [SYSTEM_ROLES.FINANCE];
    assert.equal(canManageSaasBilling({ can: canFor(roleKeys), roleKeys }), true);
  });

  it("accepts business.update as a proxy, for roles predating billing.manage", () => {
    const roleKeys = [SYSTEM_ROLES.ADMINISTRATOR];
    assert.equal(canManageSaasBilling({ can: canFor(roleKeys), roleKeys }), true);
  });

  it("turns away roles with no claim on billing", () => {
    for (const role of [
      SYSTEM_ROLES.MANAGER,
      SYSTEM_ROLES.STAFF,
      SYSTEM_ROLES.RECEPTION,
      SYSTEM_ROLES.RESTRICTED_STAFF,
    ]) {
      const roleKeys = [role];
      assert.equal(
        canManageSaasBilling({ can: canFor(roleKeys), roleKeys }),
        false,
        `${role} should not manage the Recavo plan`,
      );
    }
  });

  it("falls back to the role name when permissions have not loaded", () => {
    // The console can render before /me/businesses resolves. An owner must not
    // briefly see "you cannot manage billing" on their own workspace.
    const never = () => false;
    assert.equal(canManageSaasBilling({ can: never, roleKeys: ["owner"] }), true);
    assert.equal(canManageSaasBilling({ can: never, roleKeys: [SYSTEM_ROLES.FINANCE] }), true);
    assert.equal(canManageSaasBilling({ can: never, roleKeys: [SYSTEM_ROLES.MANAGER] }), false);
  });

  it("opens billing to an unknown role only when the console is locked", () => {
    // Otherwise a blocked workspace with no readable roles is a dead end: no
    // console, and no way to pay to unlock it either.
    const never = () => false;
    assert.equal(canManageSaasBilling({ can: never, roleKeys: [], blocked: true }), true);
    assert.equal(canManageSaasBilling({ can: never, roleKeys: [], blocked: false }), false);
    assert.equal(
      canManageSaasBilling({ can: never, roleKeys: ["head_coach"], blocked: true }),
      false,
      "a known-but-unprivileged role is not a dead end, so it stays out",
    );
  });
});

describe("holdsBusinessOwnerRole", () => {
  it("recognises the owner however the key is spelled", () => {
    assert.equal(holdsBusinessOwnerRole(["owner"]), true);
    assert.equal(holdsBusinessOwnerRole(["Business Owner"]), true);
    assert.equal(holdsBusinessOwnerRole([SYSTEM_ROLES.BUSINESS_OWNER]), true);
  });

  it("is false for everyone else, and for no roles at all", () => {
    assert.equal(holdsBusinessOwnerRole([SYSTEM_ROLES.ADMINISTRATOR]), false);
    assert.equal(holdsBusinessOwnerRole([]), false);
    assert.equal(holdsBusinessOwnerRole(undefined), false);
  });
});

describe("roleLabel", () => {
  it("names every system role in plain English", () => {
    assert.equal(roleLabel(SYSTEM_ROLES.BUSINESS_OWNER), "Owner");
    assert.equal(roleLabel(SYSTEM_ROLES.RESTRICTED_STAFF), "Restricted staff");
    assert.equal(roleLabel(SYSTEM_ROLES.CUSTOMER), "Client");
  });

  it("resolves aliases to the same label as the canonical key", () => {
    assert.equal(roleLabel("owner"), roleLabel(SYSTEM_ROLES.BUSINESS_OWNER));
    assert.equal(roleLabel("admin"), roleLabel(SYSTEM_ROLES.ADMINISTRATOR));
  });

  it("tidies a role we have never seen rather than dropping it", () => {
    assert.equal(roleLabel("head_coach"), "Head coach");
    assert.equal(roleLabel("  Head-Coach "), "Head coach");
  });

  it("returns nothing for an empty key, so callers can fall back", () => {
    assert.equal(roleLabel("   "), "");
  });
});

describe("roleLabels", () => {
  it("joins several roles", () => {
    assert.equal(roleLabels(["manager", "finance"]), "Manager, Finance");
  });

  it("uses the fallback when someone holds no roles", () => {
    assert.equal(roleLabels([], "Member"), "Member");
    assert.equal(roleLabels(undefined, "Member"), "Member");
  });

  it("does not leave a stray separator when a key is blank", () => {
    assert.equal(roleLabels(["staff", ""], "Member"), "Staff");
  });
});
