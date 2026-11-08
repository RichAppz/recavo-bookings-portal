import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creditsCards, pendingHeadline, pendingLine } from "./credits-card.ts";

const north = { id: "n", tradingName: "Northside Strength" };
const gloss = { id: "g", tradingName: "Gloss Detailing Co." };

const credit = (studio: typeof north, available: number, expiresAt: string) => ({
  studio,
  available,
  expiresAt,
});
const request = (
  studio: typeof north,
  creditsIssued: number,
  status = "pending",
  packageName = "10 session block",
) => ({ studio, creditsIssued, status, packageName });
const pkg = (studio: typeof north, id = "p1") => ({ studio, id });

describe("creditsCards", () => {
  it("sums a studio's credits and uses the soonest expiry", () => {
    const cards = creditsCards({
      studios: [north],
      credits: [credit(north, 4, "2027-02-14T00:00:00Z"), credit(north, 2, "2026-12-01T00:00:00Z")],
      requests: [],
      packages: [],
    });
    assert.deepEqual(cards, [
      { kind: "credits", studio: north, total: 6, useBy: "2026-12-01T00:00:00Z", pending: null },
    ]);
  });

  it("folds a pending package into the credits card as +N on the way", () => {
    const [card] = creditsCards({
      studios: [north],
      credits: [credit(north, 6, "2027-02-14T00:00:00Z")],
      requests: [request(north, 10)],
      packages: [],
    });
    assert.equal(card?.kind, "credits");
    assert.deepEqual(card?.kind === "credits" && card.pending, {
      credits: 10,
      count: 1,
      packageName: "10 session block",
    });
  });

  it("shows the pending state when nothing is usable yet", () => {
    const cards = creditsCards({
      studios: [north],
      credits: [credit(north, 0, "2027-02-14T00:00:00Z")],
      requests: [request(north, 10), request(north, 5, "confirmed")],
      packages: [],
    });
    assert.deepEqual(cards, [
      {
        kind: "pending",
        studio: north,
        pending: { credits: 10, count: 1, packageName: "10 session block" },
      },
    ]);
  });

  it("invites a purchase only when a studio sells packages, once, from the first seller", () => {
    assert.deepEqual(
      creditsCards({ studios: [north, gloss], credits: [], requests: [], packages: [] }),
      [],
    );
    assert.deepEqual(
      creditsCards({
        studios: [north, gloss],
        credits: [],
        requests: [],
        packages: [pkg(gloss)],
      }),
      [{ kind: "none", studio: gloss }],
    );
  });

  it("does not add a no-credits card beside a studio that has credits", () => {
    const cards = creditsCards({
      studios: [north, gloss],
      credits: [credit(north, 3, "2027-01-01T00:00:00Z")],
      requests: [],
      packages: [pkg(gloss)],
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.kind, "credits");
  });

  it("gives each studio with something its own card", () => {
    const cards = creditsCards({
      studios: [north, gloss],
      credits: [credit(north, 3, "2027-01-01T00:00:00Z")],
      requests: [request(gloss, 4, "pending", "Valet pack")],
      packages: [],
    });
    assert.deepEqual(
      cards.map((c) => [c.kind, c.studio.id]),
      [
        ["credits", "n"],
        ["pending", "g"],
      ],
    );
  });
});

describe("pending wording", () => {
  it("names the package when there is one request, counts them otherwise", () => {
    assert.equal(
      pendingHeadline({ credits: 10, count: 1, packageName: "10 session block" }, "Northside"),
      "Your 10 session block from Northside is on its way",
    );
    assert.equal(
      pendingHeadline({ credits: 15, count: 2, packageName: null }, "Northside"),
      "Your 2 packages from Northside are on their way",
    );
    assert.equal(pendingLine({ credits: 10, count: 1, packageName: "x" }), "+10 on the way");
    assert.equal(
      pendingLine({ credits: 15, count: 2, packageName: null }),
      "+15 on the way (2 requests)",
    );
  });
});
