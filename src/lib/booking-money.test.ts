import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingMoneyLines,
  ledgerBehind,
  ledgerReceivedMinor,
  recordedDirectionLabel,
  settlementMethodLabel,
} from "./booking-money.ts";

type Payment = Parameters<typeof bookingMoneyLines>[0] extends readonly (infer P)[] | undefined
  ? P
  : never;
type Line = Parameters<typeof bookingMoneyLines>[1] extends readonly (infer L)[] | undefined
  ? L
  : never;

const payment = (over: Partial<Payment> = {}): Payment =>
  ({
    id: "pay-1",
    amountMinor: 5000,
    currency: "GBP",
    state: "succeeded",
    receiptUrl: null,
    createdAt: "2026-10-10T10:00:00.000Z",
    ...over,
  }) as Payment;

const line = (over: Partial<Line> = {}): Line => ({
  id: "set-1",
  paymentId: null,
  method: "bank_transfer",
  kind: "payment",
  amountMinor: 18000,
  currency: "GBP",
  occurredAt: "2026-10-13T09:12:00.000Z",
  ...over,
});

describe("bookingMoneyLines", () => {
  it("lists money recorded by hand when there are no card payments", () => {
    const lines = bookingMoneyLines([], [line()]);
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0], {
      kind: "recorded",
      id: "set-1",
      at: "2026-10-13T09:12:00.000Z",
      amountMinor: 18000,
      currency: "GBP",
      method: "bank_transfer",
      direction: "payment",
    });
  });

  it("skips ledger rows that mirror a card payment so nothing is listed twice", () => {
    const lines = bookingMoneyLines(
      [payment()],
      [line({ id: "set-card", paymentId: "pay-1", method: "card_online", amountMinor: 5000 })],
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.kind, "payment");
  });

  it("merges both sources newest first", () => {
    const lines = bookingMoneyLines(
      [payment({ createdAt: "2026-10-01T10:00:00.000Z" })],
      [
        line({ id: "cash", method: "cash", occurredAt: "2026-10-05T10:00:00.000Z" }),
        line({ id: "bank", occurredAt: "2026-10-13T09:12:00.000Z" }),
      ],
    );
    assert.deepEqual(
      lines.map((l) => l.id),
      ["bank", "cash", "pay-1"],
    );
  });

  it("copes with either source still loading", () => {
    assert.deepEqual(bookingMoneyLines(undefined, undefined), []);
    assert.equal(bookingMoneyLines(undefined, [line()]).length, 1);
    assert.equal(bookingMoneyLines([payment()], undefined).length, 1);
  });
});

describe("ledgerReceivedMinor / ledgerBehind", () => {
  it("nets refunds and disputes against payments", () => {
    const total = ledgerReceivedMinor([
      line({ amountMinor: 10000 }),
      line({ id: "r", kind: "refund", amountMinor: 2000 }),
      line({ id: "d", kind: "dispute", amountMinor: 1000 }),
      line({ id: "w", kind: "dispute_reversal", amountMinor: 1000 }),
    ]);
    assert.equal(total, 8000);
  });

  it("is behind while the booking counts money the ledger has not caught up with", () => {
    assert.equal(ledgerBehind([], 18000), true);
    assert.equal(ledgerBehind([line({ amountMinor: 18000 })], 18000), false);
    assert.equal(ledgerBehind([line({ amountMinor: 18000 })], 20000), true);
  });

  it("is never behind for an unpaid booking or before the ledger has loaded", () => {
    assert.equal(ledgerBehind([], 0), false);
    assert.equal(ledgerBehind([], null), false);
    assert.equal(ledgerBehind(undefined, 18000), false);
  });
});

describe("labels", () => {
  it("names each method the way the record-payment dialog does", () => {
    assert.equal(settlementMethodLabel("cash"), "Cash");
    assert.equal(settlementMethodLabel("bank_transfer"), "Bank transfer");
    assert.equal(settlementMethodLabel("card_manual"), "Card (taken elsewhere)");
    assert.equal(settlementMethodLabel("card_online"), "Card");
    assert.equal(settlementMethodLabel("other"), "Other");
  });

  it("badges money in as recorded and reversals by name", () => {
    assert.equal(recordedDirectionLabel("payment"), "Recorded");
    assert.equal(recordedDirectionLabel("refund"), "Refunded");
    assert.equal(recordedDirectionLabel("dispute"), "Disputed");
    assert.equal(recordedDirectionLabel("dispute_reversal"), "Dispute won");
  });
});
