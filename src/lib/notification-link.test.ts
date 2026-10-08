import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationHref } from "./notification-link.ts";

describe("notificationHref — the bell opens what the alert is about", () => {
  it("uses the link the API stored", () => {
    assert.equal(
      notificationHref({
        link: "/packages?request=req-1",
        bookingId: null,
        templateKey: "package_request_received_staff",
      }),
      "/packages?request=req-1",
    );
  });

  it("falls back to the booking drawer for older rows about a booking", () => {
    assert.equal(
      notificationHref({ link: null, bookingId: "b-1", templateKey: "bank_transfer_pending" }),
      "/bookings?booking=b-1",
    );
  });

  it("keeps the follow-ups shortcut for API builds without links", () => {
    assert.equal(
      notificationHref({ bookingId: "b-1", templateKey: "service_follow_up_staff" }),
      "/follow-ups",
    );
  });

  it("refuses anything that is not an in-app path", () => {
    assert.equal(notificationHref({ link: "https://evil.example/x", bookingId: null }), null);
    assert.equal(notificationHref({ link: "//evil.example/x", bookingId: null }), null);
    assert.equal(notificationHref({ link: "packages", bookingId: null }), null);
  });

  it("returns null when there is nowhere to go", () => {
    assert.equal(
      notificationHref({ link: null, bookingId: null, templateKey: "owner_tips" }),
      null,
    );
  });
});
