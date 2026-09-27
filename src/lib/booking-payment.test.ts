import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  balanceDueLabel,
  bookingSettlement,
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
