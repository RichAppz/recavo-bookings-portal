import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMessageHistoryEntry,
  messageHeadline,
  messageReasonLabel,
  messageStatusLabel,
  messageTemplateLabel,
  type MessageHistoryEntry,
} from "./message-history.ts";

const entry = (over: Partial<MessageHistoryEntry> = {}): MessageHistoryEntry => ({
  kind: "message",
  notificationId: "n1",
  occurredAt: "2026-09-10T14:00:00Z",
  channel: "sms",
  requestedChannel: null,
  templateKey: "booking_confirmation",
  status: "sent",
  reasonCode: null,
  ...over,
});

describe("booking message history", () => {
  it("recognises message entries and leaves status-history rows alone", () => {
    assert.equal(isMessageHistoryEntry(entry()), true);
    assert.equal(
      isMessageHistoryEntry({
        action: "booking.confirmed",
        fromStatus: "held",
        toStatus: "confirmed",
      }),
      false,
    );
    assert.equal(isMessageHistoryEntry(null), false);
    assert.equal(isMessageHistoryEntry("message"), false);
  });

  it("names the message and the channel it went on", () => {
    assert.equal(messageHeadline(entry()), "Confirmation · Text");
    assert.equal(
      messageHeadline(entry({ channel: "email", templateKey: "reminder" })),
      "Reminder · Email",
    );
    assert.equal(messageTemplateLabel("payment_reminder"), "Payment reminder");
    assert.equal(messageTemplateLabel("some_new_thing"), "Some new thing");
  });

  it("says Sent / Failed / Fell back to email", () => {
    assert.equal(messageStatusLabel(entry()), "Sent");
    assert.equal(messageStatusLabel(entry({ status: "failed" })), "Failed");
    assert.equal(
      messageStatusLabel(entry({ status: "fallback", channel: "email", requestedChannel: "sms" })),
      "Fell back to email",
    );
  });

  it("turns reason codes into something staff can act on, and nothing for a plain send", () => {
    assert.equal(messageReasonLabel(entry()), null);
    assert.equal(
      messageReasonLabel(entry({ status: "failed", reasonCode: "invalid_phone" })),
      "Mobile number isn't valid — check the client's number",
    );
    assert.equal(
      messageReasonLabel(entry({ status: "fallback", channel: "email", reasonCode: "no_phone" })),
      "No mobile number on the client's record",
    );
    assert.equal(
      messageReasonLabel(entry({ status: "fallback", channel: "email", reasonCode: "no_credits" })),
      "No text credits left — top up to send texts",
    );
    assert.equal(
      messageReasonLabel(entry({ status: "fallback", channel: "email", reasonCode: "opted_out" })),
      "Client has opted out of text messages",
    );
    assert.equal(
      messageReasonLabel(entry({ status: "failed", reasonCode: "provider_error" })),
      "The text couldn't be delivered — try again later",
    );
    assert.equal(
      messageReasonLabel(
        entry({ status: "failed", channel: "email", reasonCode: "provider_error" }),
      ),
      "The email couldn't be delivered — try again later",
    );
    // A failure the API could not classify still reads as a failure.
    assert.equal(
      messageReasonLabel(entry({ status: "failed", reasonCode: null })),
      "Couldn't be delivered",
    );
  });
});
