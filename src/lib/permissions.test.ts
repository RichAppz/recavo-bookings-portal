import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  permissionsForRoles,
  roleLabel,
  roleLabels,
} from "./permissions.ts";

describe("invoice permissions", () => {
  const manage = [
    SYSTEM_ROLES.BUSINESS_OWNER,
    SYSTEM_ROLES.ADMINISTRATOR,
    SYSTEM_ROLES.MANAGER,
    SYSTEM_ROLES.FINANCE,
  ];

  it("owner, admin, manager and finance can read and manage", () => {
    for (const role of manage) {
      const perms = permissionsForRoles([role]);
      assert.ok(perms.has(PERMISSIONS.INVOICE_READ), `${role} reads`);
      assert.ok(perms.has(PERMISSIONS.INVOICE_MANAGE), `${role} manages`);
    }
  });

  it("reception is read-only", () => {
    const perms = permissionsForRoles([SYSTEM_ROLES.RECEPTION]);
    assert.ok(perms.has(PERMISSIONS.INVOICE_READ));
    assert.equal(perms.has(PERMISSIONS.INVOICE_MANAGE), false);
  });

  it("staff and restricted staff see nothing", () => {
    for (const role of [SYSTEM_ROLES.STAFF, SYSTEM_ROLES.RESTRICTED_STAFF]) {
      const perms = permissionsForRoles([role]);
      assert.equal(perms.has(PERMISSIONS.INVOICE_READ), false, role);
      assert.equal(perms.has(PERMISSIONS.INVOICE_MANAGE), false, role);
    }
  });

  it("portal customers hold read_own only", () => {
    const perms = permissionsForRoles([SYSTEM_ROLES.CUSTOMER]);
    assert.ok(perms.has(PERMISSIONS.INVOICE_READ_OWN));
    assert.equal(perms.has(PERMISSIONS.INVOICE_READ), false);
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
