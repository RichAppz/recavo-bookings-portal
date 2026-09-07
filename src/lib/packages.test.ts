import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { PublicPackage } from "@/lib/api/hooks";
import { packageSummary, validityLabel } from "./packages.ts";

const pkg = (creditsIssued: number, validity: PublicPackage["validity"]) =>
  ({ id: "pkg_1", name: "Starter", creditsIssued, validity }) as PublicPackage;

describe("validityLabel", () => {
  it("singularises one", () => {
    assert.equal(validityLabel({ kind: "days", amount: 1 }), "1 day");
    assert.equal(validityLabel({ kind: "calendar_months", amount: 1 }), "1 month");
  });

  it("pluralises everything else", () => {
    assert.equal(validityLabel({ kind: "days", amount: 30 }), "30 days");
    assert.equal(validityLabel({ kind: "calendar_months", amount: 12 }), "12 months");
  });
});

describe("packageSummary", () => {
  it("reads as a sentence a customer would understand", () => {
    assert.equal(
      packageSummary(pkg(10, { kind: "calendar_months", amount: 3 })),
      "10 sessions, valid 3 months",
    );
  });

  it("singularises a one-session package", () => {
    assert.equal(packageSummary(pkg(1, { kind: "days", amount: 1 })), "1 session, valid 1 day");
  });
});
