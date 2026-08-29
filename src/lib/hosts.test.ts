import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingUrlFor, isCustomerHost, staffHostFor } from "./hosts.ts";

describe("isCustomerHost", () => {
  it("recognises the customer hostname in both environments", () => {
    assert.equal(isCustomerHost("book.recavo.app"), true);
    assert.equal(isCustomerHost("staging-book.recavo.app"), true);
  });

  it("does not treat the staff hostname as a customer one", () => {
    assert.equal(isCustomerHost("dashboard.recavo.app"), false);
    assert.equal(isCustomerHost("staging-dashboard.recavo.app"), false);
  });

  it("treats a bare host as staff, so local development keeps the studio flow", () => {
    assert.equal(isCustomerHost("localhost"), false);
    assert.equal(isCustomerHost("127.0.0.1"), false);
  });

  it("matches on the whole label, not a prefix", () => {
    // Guards the obvious sloppy implementation, startsWith("book"), which is a
    // real hazard now the label is this short: booking-api.recavo.app exists.
    assert.equal(isCustomerHost("bookings.recavo.app"), false);
    assert.equal(isCustomerHost("booking.recavo.app"), false);
    assert.equal(isCustomerHost("booking-api.recavo.app"), false);
    assert.equal(isCustomerHost("book-api.recavo.app"), false);
  });
});

describe("staffHostFor", () => {
  it("pairs each customer hostname with its own environment's staff one", () => {
    assert.equal(staffHostFor("book.recavo.app"), "dashboard.recavo.app");
    assert.equal(staffHostFor("staging-book.recavo.app"), "staging-dashboard.recavo.app");
  });

  it("returns null where there is no pair to point at", () => {
    // Better to show no link than to send someone to a hostname we invented.
    assert.equal(staffHostFor("dashboard.recavo.app"), null);
    assert.equal(staffHostFor("localhost"), null);
  });
});

describe("bookingUrlFor", () => {
  it("hands out the customer hostname even when copied from the dashboard", () => {
    // The whole point: a link printed on a business card must not need a login.
    assert.equal(
      bookingUrlFor("northside-strength", "https://dashboard.recavo.app"),
      "https://book.recavo.app/northside-strength",
    );
  });

  it("stays within its own environment", () => {
    assert.equal(
      bookingUrlFor("northside-strength", "https://staging-dashboard.recavo.app"),
      "https://staging-book.recavo.app/northside-strength",
    );
  });

  it("keeps the current origin where there is no customer hostname, including its port", () => {
    assert.equal(
      bookingUrlFor("northside-strength", "http://localhost:8080"),
      "http://localhost:8080/northside-strength",
    );
  });
});
