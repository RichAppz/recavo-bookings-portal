import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelsLabel,
  lastSentFromHistory,
  lastSentLabel,
  relativeTimeAgo,
  reminderChannels,
  resendTemplateKeys,
  smsBlockedReason,
} from "./booking-reminders.ts";

const both = { email: "a@b.c", phone: "+447700900123", smsOptedOut: false };
const phoneOnly = { email: null, phone: "+447700900123", smsOptedOut: false };
const emailOnly = { email: "a@b.c", phone: null, smsOptedOut: false };
const nobody = { email: null, phone: null, smsOptedOut: false };

describe("reminderChannels", () => {
  it("texts a phone-only client on their own when there are credits", () => {
    assert.deepEqual(reminderChannels(phoneOnly, "ok"), { channels: ["sms"], blocked: null });
    assert.deepEqual(reminderChannels(phoneOnly, "unlimited"), {
      channels: ["sms"],
      blocked: null,
    });
    // Still loading: let the API decide rather than show a false "off".
    assert.deepEqual(reminderChannels(phoneOnly, "unknown"), { channels: ["sms"], blocked: null });
  });

  it("emails an email-only client, and uses both when both are on file", () => {
    assert.deepEqual(reminderChannels(emailOnly, "ok"), { channels: ["email"], blocked: null });
    assert.deepEqual(reminderChannels(both, "low"), {
      channels: ["email", "sms"],
      blocked: null,
    });
  });

  it("drops to email alone when texts can't go, and only blocks when neither can", () => {
    assert.deepEqual(reminderChannels(both, "empty"), { channels: ["email"], blocked: null });
    assert.deepEqual(reminderChannels({ ...both, smsOptedOut: true }, "ok"), {
      channels: ["email"],
      blocked: null,
    });
    assert.equal(reminderChannels(nobody, "ok").blocked, "No phone or email on file");
    assert.equal(
      reminderChannels(phoneOnly, "empty").blocked,
      "Out of text credits and no email on file",
    );
    assert.equal(
      reminderChannels({ ...phoneOnly, smsOptedOut: true }, "ok").blocked,
      "Opted out of texts and no email on file",
    );
  });
});

describe("smsBlockedReason / channelsLabel", () => {
  it("names the customer-side reason a text can't go", () => {
    assert.equal(smsBlockedReason(both), null);
    assert.equal(smsBlockedReason(emailOnly), "No mobile number on file");
    assert.equal(
      smsBlockedReason({ ...both, smsOptedOut: true }),
      "Customer has opted out of texts",
    );
  });

  it("words the channel list", () => {
    assert.equal(channelsLabel(["sms"]), "By text");
    assert.equal(channelsLabel(["email"]), "By email");
    assert.equal(channelsLabel(["email", "sms"]), "By email and text");
    assert.equal(channelsLabel([]), "");
  });
});

describe("lastSentFromHistory", () => {
  const history = [
    { kind: "status", action: "confirmed", occurredAt: "2026-09-01T09:00:00Z" },
    {
      kind: "message",
      notificationId: "n1",
      occurredAt: "2026-09-01T09:00:05Z",
      channel: "email",
      requestedChannel: null,
      templateKey: "booking_confirmation",
      status: "sent",
      reasonCode: null,
    },
    {
      kind: "message",
      notificationId: "n2",
      occurredAt: "2026-09-10T08:00:00Z",
      channel: "email",
      requestedChannel: null,
      templateKey: "reminder",
      status: "sent",
      reasonCode: null,
    },
    {
      kind: "message",
      notificationId: "n3",
      occurredAt: "2026-09-10T08:00:02Z",
      channel: "sms",
      requestedChannel: null,
      templateKey: "reminder",
      status: "sent",
      reasonCode: null,
    },
    {
      kind: "message",
      notificationId: "n4",
      occurredAt: "2026-09-11T08:00:00Z",
      channel: "sms",
      requestedChannel: null,
      templateKey: "reminder",
      status: "failed",
      reasonCode: "provider_error",
    },
  ];

  it("finds the latest delivered send and groups both channels of it", () => {
    const last = lastSentFromHistory(history, ["reminder"]);
    assert.deepEqual(last, { at: "2026-09-10T08:00:02Z", channels: ["sms", "email"] });
  });

  it("ignores failures and other templates; null when nothing went", () => {
    assert.deepEqual(lastSentFromHistory(history, ["booking_confirmation"]), {
      at: "2026-09-01T09:00:05Z",
      channels: ["email"],
    });
    assert.equal(lastSentFromHistory(history, ["payment_reminder"]), null);
    assert.equal(lastSentFromHistory(undefined, ["reminder"]), null);
  });

  it("words the result for the drawer", () => {
    const now = new Date("2026-09-12T08:00:02Z");
    assert.equal(
      lastSentLabel(lastSentFromHistory(history, ["reminder"]), now),
      "Last sent 2 days ago by email and text",
    );
    assert.equal(lastSentLabel(null, now), "Not sent yet");
  });
});

describe("relativeTimeAgo", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  it("steps through minutes, hours, days and weeks", () => {
    assert.equal(relativeTimeAgo("2026-09-12T11:59:40Z", now), "just now");
    assert.equal(relativeTimeAgo("2026-09-12T11:59:00Z", now), "1 minute ago");
    assert.equal(relativeTimeAgo("2026-09-12T11:15:00Z", now), "45 minutes ago");
    assert.equal(relativeTimeAgo("2026-09-12T09:00:00Z", now), "3 hours ago");
    assert.equal(relativeTimeAgo("2026-09-11T12:00:00Z", now), "yesterday");
    assert.equal(relativeTimeAgo("2026-09-08T12:00:00Z", now), "4 days ago");
    assert.equal(relativeTimeAgo("2026-08-22T12:00:00Z", now), "3 weeks ago");
    assert.equal(relativeTimeAgo("2026-06-12T12:00:00Z", now), "3 months ago");
  });
});

describe("resendTemplateKeys", () => {
  it("follows what the API would resend for the booking's state", () => {
    assert.deepEqual(resendTemplateKeys("awaiting_payment", true), ["bank_transfer_instructions"]);
    assert.deepEqual(resendTemplateKeys("awaiting_payment", false), ["booking_payment_request"]);
    assert.deepEqual(resendTemplateKeys("confirmed", false), [
      "booking_confirmation",
      "booking_payment_request",
    ]);
    assert.deepEqual(resendTemplateKeys("late_cancelled", false), ["cancellation"]);
    assert.deepEqual(resendTemplateKeys("completed", false), []);
  });
});
