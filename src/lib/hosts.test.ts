import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingUrlFor, isCustomerHost, staffHostFor, staffUrlFor } from "./hosts.ts";

describe("isCustomerHost", () => {
  it("recognises the customer hostname in both environments", () => {
    assert.equal(isCustomerHost("book.recavo.app"), true);
    assert.equal(isCustomerHost("staging.book.recavo.app"), true);
  });

  it("does not treat the staff hostname as a customer one", () => {
    assert.equal(isCustomerHost("bookings.recavo.app"), false);
    assert.equal(isCustomerHost("staging.bookings.recavo.app"), false);
  });

  it("treats a bare host as staff, so local development keeps the studio flow", () => {
    assert.equal(isCustomerHost("localhost"), false);
    assert.equal(isCustomerHost("127.0.0.1"), false);
  });

  it("matches on the whole label, not a prefix", () => {
    // Guards startsWith("book"): bookings.recavo.app is the staff host, and
    // booking-api.recavo.app is the API. Neither is the customer hostname.
    assert.equal(isCustomerHost("bookings.recavo.app"), false);
    assert.equal(isCustomerHost("booking.recavo.app"), false);
    assert.equal(isCustomerHost("booking-api.recavo.app"), false);
    assert.equal(isCustomerHost("book-api.recavo.app"), false);
  });
});

describe("staffHostFor", () => {
  it("pairs each customer hostname with its own environment's staff one", () => {
    assert.equal(staffHostFor("book.recavo.app"), "bookings.recavo.app");
    assert.equal(staffHostFor("staging.book.recavo.app"), "staging.bookings.recavo.app");
  });

  it("returns null where there is no pair to point at", () => {
    // Better to show no link than to send someone to a hostname we invented.
    assert.equal(staffHostFor("bookings.recavo.app"), null);
    assert.equal(staffHostFor("localhost"), null);
  });
});

describe("staffUrlFor", () => {
  it("rewrites billing return URLs onto the staff host, keeping path and query", () => {
    assert.equal(
      staffUrlFor("https://book.recavo.app/billing/success?session_id=cs_1"),
      "https://bookings.recavo.app/billing/success?session_id=cs_1",
    );
    assert.equal(
      staffUrlFor("https://staging.book.recavo.app/billing"),
      "https://staging.bookings.recavo.app/billing",
    );
  });

  it("does not invent a staff URL off the recognised pair", () => {
    assert.equal(staffUrlFor("https://bookings.recavo.app/billing"), null);
    assert.equal(staffUrlFor("http://localhost:8080/billing"), null);
  });
});

describe("bookingUrlFor", () => {
  it("hands out the customer hostname even when copied from the staff console", () => {
    // The whole point: a link printed on a business card must not need a login.
    assert.equal(
      bookingUrlFor("northside-strength", "https://bookings.recavo.app"),
      "https://book.recavo.app/northside-strength",
    );
  });

  it("stays within its own environment", () => {
    assert.equal(
      bookingUrlFor("northside-strength", "https://staging.bookings.recavo.app"),
      "https://staging.book.recavo.app/northside-strength",
    );
  });

  it("keeps the current origin where there is no customer hostname, including its port", () => {
    assert.equal(
      bookingUrlFor("northside-strength", "http://localhost:8080"),
      "http://localhost:8080/northside-strength",
    );
  });
});
