import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paidRowLabel } from "./invoice-labels.ts";

describe("paidRowLabel", () => {
  it("says Deposit taken while the money received is the deposit and a balance is due", () => {
    assert.equal(
      paidRowLabel({ totalMinor: 30000, paidMinor: 10000, depositMinor: 10000 }),
      "Deposit taken",
    );
    // A deposit recorded short still reads as the deposit.
    assert.equal(
      paidRowLabel({ totalMinor: 30000, paidMinor: 6000, depositMinor: 10000 }),
      "Deposit taken",
    );
  });

  it("says Paid once more than the deposit has been received", () => {
    assert.equal(
      paidRowLabel({ totalMinor: 30000, paidMinor: 15000, depositMinor: 10000 }),
      "Paid",
    );
  });

  it("says Paid once the invoice is settled", () => {
    assert.equal(
      paidRowLabel({ totalMinor: 30000, paidMinor: 30000, depositMinor: 10000 }),
      "Paid",
    );
    assert.equal(
      paidRowLabel({ totalMinor: 10000, paidMinor: 10000, depositMinor: 10000 }),
      "Paid",
    );
    assert.equal(
      paidRowLabel({ totalMinor: 10000, paidMinor: 12000, depositMinor: 10000 }),
      "Paid",
    );
  });

  it("says Paid for manual invoices, bookings without a deposit, and older API builds", () => {
    assert.equal(paidRowLabel({ totalMinor: 30000, paidMinor: 10000, depositMinor: null }), "Paid");
    assert.equal(paidRowLabel({ totalMinor: 30000, paidMinor: 10000, depositMinor: 0 }), "Paid");
    assert.equal(paidRowLabel({ totalMinor: 30000, paidMinor: 10000 }), "Paid");
    assert.equal(paidRowLabel({ totalMinor: 30000, paidMinor: 0, depositMinor: 10000 }), "Paid");
  });
});
