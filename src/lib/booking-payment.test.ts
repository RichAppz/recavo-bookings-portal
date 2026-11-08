import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  balanceDueLabel,
  bookingSettlement,
  customerLifetimeSpendMinor,
  effectiveDepositMinor,
  paymentLabel,
  paymentTone,
} from "./booking-payment.ts";

const fmt = (minor: number) => `£${(minor / 100).toFixed(2)}`;

describe("effectiveDepositMinor", () => {
  it("keeps a deposit strictly between nothing and the total", () => {
    assert.equal(effectiveDepositMinor(5000, 15000), 5000);
    assert.equal(effectiveDepositMinor(14999, 15000), 14999);
  });

  it("treats anything the total can't sit above as no deposit", () => {
    // The API drops these on the way in, so the form must not offer them as a deposit.
    assert.equal(effectiveDepositMinor(0, 15000), null);
    assert.equal(effectiveDepositMinor(-500, 15000), null);
    assert.equal(effectiveDepositMinor(15000, 15000), null);
    assert.equal(effectiveDepositMinor(20000, 15000), null);
    assert.equal(effectiveDepositMinor(5000, 0), null);
    assert.equal(effectiveDepositMinor(null, 15000), null);
    assert.equal(effectiveDepositMinor(undefined, 15000), null);
  });
});

describe("customerLifetimeSpendMinor", () => {
  type SpendPayment = Parameters<typeof customerLifetimeSpendMinor>[1][number];
  const payment = (o: Partial<SpendPayment> = {}): SpendPayment => ({
    bookingId: null,
    amountMinor: 0,
    amountRefundedMinor: 0,
    state: "succeeded",
    ...o,
  });

  it("counts money taken in person, which never leaves a payment row", () => {
    // The whole bug: cash, a bank transfer marked received and a staff-recorded
    // deposit only move the booking's paidMinor, so payment rows alone read as £0.
    assert.equal(customerLifetimeSpendMinor([{ paidMinor: 5000 }, { paidMinor: 2500 }], []), 7500);
  });

  it("counts a card payment once, not twice", () => {
    // A succeeded card payment rolls into paidMinor *and* leaves a row for the booking.
    assert.equal(
      customerLifetimeSpendMinor(
        [{ paidMinor: 5000 }],
        [payment({ bookingId: "bk_1", amountMinor: 5000 })],
      ),
      5000,
    );
  });

  it("adds purchases with no booking, which exist only as payment rows", () => {
    assert.equal(
      customerLifetimeSpendMinor([{ paidMinor: 5000 }], [payment({ amountMinor: 9900 })]),
      14900,
    );
  });

  it("takes refunds off once, since paidMinor is never reduced", () => {
    assert.equal(
      customerLifetimeSpendMinor(
        [{ paidMinor: 5000 }],
        [
          payment({
            bookingId: "bk_1",
            amountMinor: 5000,
            amountRefundedMinor: 2000,
            state: "partially_refunded",
          }),
        ],
      ),
      3000,
    );
    // A full refund of a package purchase leaves the client having spent nothing.
    assert.equal(
      customerLifetimeSpendMinor(
        [],
        [payment({ amountMinor: 9900, amountRefundedMinor: 9900, state: "refunded" })],
      ),
      0,
    );
  });

  it("ignores payments that never settled, and never goes negative", () => {
    assert.equal(
      customerLifetimeSpendMinor(
        [{ paidMinor: 0 }],
        [payment({ amountMinor: 5000, state: "failed" }), payment({ state: "requires_action" })],
      ),
      0,
    );
    // A refund recorded against a booking whose money was later cleared elsewhere.
    assert.equal(
      customerLifetimeSpendMinor(
        [{ paidMinor: 0 }],
        [
          payment({
            bookingId: "bk_1",
            amountMinor: 5000,
            amountRefundedMinor: 5000,
            state: "refunded",
          }),
        ],
      ),
      0,
    );
  });

  it("treats a booking with no money as nothing, not a crash", () => {
    assert.equal(customerLifetimeSpendMinor([{}, { paidMinor: null }], []), 0);
  });
});

describe("bookingSettlement", () => {
  it("asks for the deposit first on a confirmed booking, then the balance", () => {
    // Staff bookings are confirmed from the start; the pay link still takes the deposit.
    const unpaid = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "pay_later",
      depositMinor: 5000,
      paidMinor: 0,
    });
    assert.equal(unpaid.state, "unpaid");
    assert.equal(unpaid.dueNowMinor, 5000);
    assert.equal(unpaid.outstandingMinor, 15000);
    assert.equal(unpaid.balanceAfterJob, true);

    const depositIn = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "pay_later",
      depositMinor: 5000,
      paidMinor: 5000,
    });
    assert.equal(depositIn.state, "deposit_paid");
    assert.equal(depositIn.dueNowMinor, 10000);
    assert.equal(depositIn.outstandingMinor, 10000);
    assert.equal(paymentTone(depositIn, "confirmed"), "partial");
  });

  it("only treats pay-after-the-job bookings as balance-after-job", () => {
    const upFront = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "none",
      depositMinor: 5000,
      paidMinor: 5000,
    });
    assert.equal(upFront.balanceAfterJob, false);
    assert.equal(balanceDueLabel(upFront), "to collect");
    assert.equal(
      balanceDueLabel(
        bookingSettlement({ priceMinor: 15000, status: "completed", paymentMethod: "pay_later" }),
      ),
      "due after the job",
    );
  });
});

describe("paymentLabel", () => {
  it("says the balance is due after the job once a pay-later deposit is in", () => {
    const s = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "pay_later",
      depositMinor: 5000,
      paidMinor: 5000,
    });
    assert.equal(paymentLabel(s, "GBP", fmt), "Deposit paid · £100.00 due after the job");
  });

  it("names the deposit while it is the thing being asked for", () => {
    const s = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "pay_later",
      depositMinor: 5000,
      paidMinor: 0,
    });
    assert.equal(paymentLabel(s, "GBP", fmt), "Unpaid · £50.00 deposit due");
    const noDeposit = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "none",
      paidMinor: 0,
    });
    assert.equal(paymentLabel(noDeposit, "GBP", fmt), "Unpaid · £150.00 due");
  });

  it("keeps 'to collect' for up-front bookings", () => {
    const s = bookingSettlement({
      priceMinor: 15000,
      status: "confirmed",
      paymentMethod: "none",
      depositMinor: 5000,
      paidMinor: 5000,
    });
    assert.equal(paymentLabel(s, "GBP", fmt), "Deposit paid · £100.00 to collect");
  });
});
