import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PortalCredit } from "./api/hooks.ts";
import {
  creditBalance,
  creditsCovering,
  creditsLeftLabel,
  usableCredits,
} from "./portal-credits.ts";

const now = Date.parse("2026-10-08T10:00:00.000Z");
const credit = (over: Partial<PortalCredit>): PortalCredit => ({
  id: "c",
  packageId: "p",
  eligibleServiceIds: [] as string[],
  unitsIssued: 10,
  available: 3,
  reserved: 0,
  expiresAt: "2026-12-01T00:00:00.000Z",
  status: "active",
  ...over,
});

describe("usableCredits — only credits a client can actually spend", () => {
  it("drops expired, exhausted and inactive packs and sorts by expiry", () => {
    const list = usableCredits(
      [
        credit({ id: "late", expiresAt: "2027-01-01T00:00:00.000Z" }),
        credit({ id: "expired", expiresAt: "2026-01-01T00:00:00.000Z" }),
        credit({ id: "empty", available: 0 }),
        credit({ id: "void", status: "voided" }),
        credit({ id: "soon", expiresAt: "2026-11-01T00:00:00.000Z" }),
      ],
      now,
    );
    assert.deepEqual(
      list.map((c) => c.id),
      ["soon", "late"],
    );
  });
});

describe("creditBalance — what the calendar shows next to 'Book with 1 credit'", () => {
  it("sums every usable pack when no service is chosen", () => {
    const balance = creditBalance(
      [credit({ available: 3 }), credit({ id: "b", available: 2 })],
      null,
      now,
    );
    assert.equal(balance.available, 5);
    assert.equal(balance.restricted, false);
    assert.equal(balance.nextExpiresAt, "2026-12-01T00:00:00.000Z");
  });

  it("only counts packs that cover the picked service", () => {
    const credits = [
      credit({ id: "pt", eligibleServiceIds: ["svc-pt"], available: 8 }),
      credit({ id: "any", available: 1 }),
    ];
    assert.equal(creditBalance(credits, "svc-pt", now).available, 9);
    assert.equal(creditBalance(credits, "svc-pt", now).restricted, true);
    assert.equal(creditBalance(credits, "svc-massage", now).available, 1);
    assert.deepEqual(
      creditsCovering(credits, "svc-massage", now).map((c) => c.id),
      ["any"],
    );
  });

  it("is empty when nothing is usable", () => {
    assert.deepEqual(creditBalance([], null, now), {
      available: 0,
      restricted: false,
      nextExpiresAt: null,
    });
  });
});

describe("creditsLeftLabel", () => {
  it("reads naturally", () => {
    assert.equal(creditsLeftLabel(0), "No credits left");
    assert.equal(creditsLeftLabel(1), "1 credit left");
    assert.equal(creditsLeftLabel(4), "4 credits left");
  });
});
