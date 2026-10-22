import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { purchaseHistory } from "./purchase-history.ts";

const studio = { id: "biz-1" };
const other = { id: "biz-2" };

const payment = (over: Partial<Parameters<typeof purchaseHistory>[0][number]> = {}) => ({
  id: "pay-1",
  packagePurchaseId: null,
  amountMinor: 4500,
  currency: "GBP",
  state: "succeeded",
  receiptUrl: "https://stripe.test/r/1",
  createdAt: "2026-10-10T10:00:00.000Z",
  studio,
  ...over,
});

const purchase = (over: Partial<Parameters<typeof purchaseHistory>[1][number]> = {}) => ({
  id: "pp-1",
  packageName: "PT body",
  creditsIssued: 10,
  amountMinor: 45000,
  currency: "GBP",
  paymentRef: null,
  purchasedAt: "2026-10-12T09:00:00.000Z",
  studio,
  ...over,
});

describe("purchaseHistory", () => {
  it("shows a package paid by bank transfer even though there is no card payment", () => {
    const lines = purchaseHistory([], [purchase()]);
    assert.equal(lines.length, 1);
    assert.deepEqual(
      { ...lines[0], studio: undefined },
      {
        id: "pp-1",
        title: "PT body",
        detail: "10 credits",
        amountMinor: 45000,
        currency: "GBP",
        status: "paid",
        receiptUrl: null,
        at: "2026-10-12T09:00:00.000Z",
        studio: undefined,
      },
    );
  });

  it("joins a card-paid package into one line that keeps the receipt and the package name", () => {
    const lines = purchaseHistory(
      [payment({ packagePurchaseId: "pp-1", amountMinor: 45000 })],
      [purchase({ paymentRef: "pay-1" })],
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.id, "pay-1");
    assert.equal(lines[0]?.title, "PT body");
    assert.equal(lines[0]?.detail, "10 credits");
    assert.equal(lines[0]?.receiptUrl, "https://stripe.test/r/1");
    assert.equal(lines[0]?.status, "succeeded");
  });

  it("joins on paymentRef alone when the payment predates packagePurchaseId", () => {
    const lines = purchaseHistory([payment()], [purchase({ paymentRef: "pay-1" })]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.title, "PT body");
  });

  it("does not join across studios even when ids collide", () => {
    const lines = purchaseHistory(
      [payment({ packagePurchaseId: "pp-1" })],
      [purchase({ studio: other, paymentRef: "pay-1" })],
    );
    assert.equal(lines.length, 2);
    assert.equal(lines.find((l) => l.id === "pay-1")?.title, "Booking payment");
  });

  it("labels a plain booking payment and orders everything newest first", () => {
    const lines = purchaseHistory(
      [payment({ createdAt: "2026-10-01T10:00:00.000Z" })],
      [
        purchase({ id: "pp-old", purchasedAt: "2026-09-01T10:00:00.000Z" }),
        purchase({ id: "pp-new", purchasedAt: "2026-10-12T09:00:00.000Z" }),
      ],
    );
    assert.deepEqual(
      lines.map((l) => l.id),
      ["pp-new", "pay-1", "pp-old"],
    );
    assert.equal(lines[1]?.title, "Booking payment");
    assert.equal(lines[1]?.detail, null);
  });

  it("falls back to a generic name and no credit count when the package is gone", () => {
    const lines = purchaseHistory([], [purchase({ packageName: null, creditsIssued: null })]);
    assert.equal(lines[0]?.title, "Package");
    assert.equal(lines[0]?.detail, null);
  });

  it("uses the singular for one credit", () => {
    const lines = purchaseHistory([], [purchase({ creditsIssued: 1 })]);
    assert.equal(lines[0]?.detail, "1 credit");
  });
});
