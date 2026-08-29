import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYSTEM_ROLES, roleLabel, roleLabels } from "./permissions.ts";

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
