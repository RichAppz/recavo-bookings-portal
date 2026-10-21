import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Notification } from "@/lib/api/types";
import {
  announcementCounter,
  buildStream,
  clientReach,
  dayLabel,
  defaultReplyChannel,
  defaultSubject,
  eventLineFor,
  inboxPreview,
  inboxRowLabel,
  inboxTime,
  laterLabel,
  mentionedTime,
  messageStatus,
  quickReplies,
  smsSegments,
  staffSmsText,
  unansweredText,
  type MessageLike,
} from "./messages.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-21T10:00:00.000Z"); // Wed 21 Oct, 11:00 BST

function msg(over: Partial<MessageLike> = {}): MessageLike {
  return {
    id: "m1",
    businessId: "b",
    conversationId: "c",
    senderType: "customer",
    senderId: "x",
    body: "Hello",
    createdAt: "2026-10-21T09:00:00.000Z",
    isAnnouncement: false,
    readByCustomerAt: null,
    readByStaffAt: null,
    ...over,
  };
}

function notification(over: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    businessId: "b",
    recipientType: "customer",
    recipientId: "c1",
    channel: "sms",
    templateKey: "reminder",
    templateVersion: 1,
    subject: null,
    body: "See you tomorrow",
    bookingId: null,
    readAt: null,
    createdAt: "2026-10-21T08:00:00.000Z",
    ...over,
  } as Notification;
}

describe("smsSegments", () => {
  it("counts plain text in 160 then 153 character parts", () => {
    assert.equal(smsSegments("a".repeat(160)).segments, 1);
    assert.equal(smsSegments("a".repeat(161)).segments, 2);
    assert.equal(smsSegments("a".repeat(306)).segments, 2);
    assert.equal(smsSegments("a".repeat(307)).segments, 3);
  });

  it("counts extended characters twice and drops to 70 with emoji", () => {
    assert.equal(smsSegments("€").units, 2);
    const emoji = smsSegments(`${"a".repeat(69)}🙂`);
    assert.equal(emoji.encoding, "unicode");
    assert.equal(emoji.segments, 2);
  });

  it("leads staff texts with the business name", () => {
    assert.equal(staffSmsText("Northline", "  See you at 11 "), "Northline: See you at 11");
  });
});

describe("time labels", () => {
  it("formats inbox times", () => {
    assert.equal(inboxTime("2026-10-21T05:21:00.000Z", NOW, TZ), "06:21");
    assert.equal(inboxTime("2026-10-20T18:00:00.000Z", NOW, TZ), "Yesterday");
    assert.equal(inboxTime("2026-10-17T12:00:00.000Z", NOW, TZ), "Sat");
    assert.equal(inboxTime("2026-10-14T12:00:00.000Z", NOW, TZ), "14 Oct");
    assert.equal(inboxTime("2025-03-03T12:00:00.000Z", NOW, TZ), "3 Mar 2025");
  });

  it("uses the business time zone for the day boundary", () => {
    // 23:30 UTC on the 20th is 00:30 on the 21st in London.
    assert.equal(inboxTime("2026-10-20T23:30:00.000Z", NOW, TZ), "00:30");
  });

  it("labels day dividers", () => {
    assert.equal(dayLabel("2026-10-21T08:00:00.000Z", NOW, TZ), "Today");
    assert.equal(dayLabel("2026-10-20T08:00:00.000Z", NOW, TZ), "Yesterday");
    assert.equal(dayLabel("2026-10-14T08:00:00.000Z", NOW, TZ), "Wed 14 Oct");
    assert.equal(dayLabel("2025-03-03T08:00:00.000Z", NOW, TZ), "3 Mar 2025");
  });

  it("labels a time ahead", () => {
    assert.equal(laterLabel("2026-10-21T15:30:00.000Z", NOW, TZ), "16:30 today");
    assert.equal(laterLabel("2026-10-22T05:32:00.000Z", NOW, TZ), "06:32 tomorrow");
    assert.equal(laterLabel("2026-10-24T07:00:00.000Z", NOW, TZ), "08:00 on Sat 24 Oct");
  });
});

describe("buildStream", () => {
  it("merges event lines by time with day dividers", () => {
    const stream = buildStream(
      [
        msg({ id: "a", createdAt: "2026-10-20T09:00:00.000Z" }),
        msg({ id: "b", createdAt: "2026-10-21T09:00:00.000Z", senderType: "staff" }),
      ],
      [eventLineFor(notification({ createdAt: "2026-10-21T08:00:00.000Z" }))!],
      NOW,
      TZ,
    );
    assert.deepEqual(
      stream.map((s) => (s.kind === "day" ? s.label : s.kind === "event" ? s.event.label : s.key)),
      ["Yesterday", "msg-a", "Today", "Reminder sent", "msg-b"],
    );
  });

  it("shares one time label across a quick run from the same side", () => {
    const stream = buildStream(
      [
        msg({ id: "a", createdAt: "2026-10-21T09:00:00.000Z" }),
        msg({ id: "b", createdAt: "2026-10-21T09:01:30.000Z" }),
        msg({ id: "c", createdAt: "2026-10-21T09:05:00.000Z" }),
        msg({ id: "d", createdAt: "2026-10-21T09:05:30.000Z", senderType: "staff" }),
      ],
      [],
      NOW,
      TZ,
    );
    const meta = stream.flatMap((s) => (s.kind === "message" ? [[s.key, s.showMeta]] : []));
    assert.deepEqual(meta, [
      ["msg-a", false],
      ["msg-b", true],
      ["msg-c", true],
      ["msg-d", true],
    ]);
  });

  it("shows older automatic thread messages as event lines", () => {
    const stream = buildStream([msg({ senderType: "system", body: "Booking moved" })], [], NOW, TZ);
    assert.equal(stream[1]?.kind, "event");
  });
});

describe("event lines", () => {
  it("maps sent messages and says the channel", () => {
    assert.deepEqual(
      [
        eventLineFor(notification({ templateKey: "booking_confirmation", channel: "email" })),
        eventLineFor(notification({ templateKey: "broadcast" })),
      ].map((e) => `${e?.label} ${e?.channel}`),
      ["Booking confirmed by email", "Announcement sent by text"],
    );
  });

  it("leaves out messages that are not about this client's bookings", () => {
    assert.equal(eventLineFor(notification({ templateKey: "staff_message" })), null);
    assert.equal(eventLineFor(notification({ templateKey: "new_message" })), null);
  });
});

describe("message status", () => {
  it("reads in words", () => {
    assert.equal(messageStatus(msg({ senderType: "customer" })), null);
    assert.equal(messageStatus(msg({ senderType: "staff", id: "optimistic-1" }))?.text, "Sending…");
    assert.equal(
      messageStatus(msg({ senderType: "staff", channel: "sms", deliveryState: "delivered" }))?.text,
      "Delivered",
    );
    assert.equal(
      messageStatus(msg({ senderType: "staff", readByCustomerAt: "2026-10-21T09:00:00Z" }))?.text,
      "Read",
    );
    assert.deepEqual(
      messageStatus(
        msg({
          senderType: "staff",
          deliveryState: "failed",
          deliveryError: "Number not in service",
        }),
      ),
      { tone: "error", text: "Not delivered", reason: "Number not in service" },
    );
  });
});

describe("reply box", () => {
  it("starts on the last channel used, then preference, then what is reachable", () => {
    const can = { sms: true, email: true };
    assert.equal(
      defaultReplyChannel([msg({ channel: "email", senderType: "staff" })], can),
      "email",
    );
    assert.equal(defaultReplyChannel([], can, "email"), "email");
    assert.equal(defaultReplyChannel([], can), "sms");
    assert.equal(
      defaultReplyChannel([msg({ channel: "sms" })], { sms: false, email: true }),
      "email",
    );
    assert.equal(defaultReplyChannel([], { sms: false, email: false }), null);
  });

  it("prefills the subject", () => {
    assert.equal(defaultSubject([msg({ subject: "Your quote" })], "Northline"), "Re: Your quote");
    assert.equal(
      defaultSubject([msg({ subject: "Re: Your quote" })], "Northline"),
      "Re: Your quote",
    );
    assert.equal(defaultSubject([], "Northline"), "Message from Northline");
  });

  it("finds the time a client asked about", () => {
    assert.equal(mentionedTime("Can I move Saturday to 11?"), "11:00");
    assert.equal(mentionedTime("is 2:30pm ok"), "14:30");
    assert.equal(mentionedTime("how about 3pm"), "15:00");
    assert.equal(mentionedTime("booked for 24 Oct"), null);
    assert.equal(mentionedTime("I have 2 cars"), null);
  });

  it("suggests at most two simple replies", () => {
    assert.deepEqual(quickReplies("Hi, can I move Saturday to 11?"), [
      "Yes, 11:00 works",
      "Sorry, 11:00 isn't free",
    ]);
    assert.deepEqual(quickReplies("Thanks!"), ["You're welcome!", "See you soon"]);
    assert.deepEqual(quickReplies("Do you do ceramic coatings?"), [
      "Let me check and get back to you",
    ]);
    assert.deepEqual(quickReplies("Great, see you then"), []);
    assert.deepEqual(quickReplies(null), []);
  });

  it("reads everything the client said since our last reply", () => {
    const thread = [
      msg({ id: "a", senderType: "staff", body: "Booked for Saturday at 09:00" }),
      msg({ id: "b", body: "Can I move Saturday to 11:00?" }),
      msg({ id: "c", senderType: "system", body: "Reminder sent" }),
      msg({ id: "d", body: "Same car, the BMW." }),
    ];
    const text = unansweredText(thread);
    assert.equal(text, "Can I move Saturday to 11:00?\nSame car, the BMW.");
    assert.deepEqual(quickReplies(text), ["Yes, 11:00 works", "Sorry, 11:00 isn't free"]);
    assert.equal(
      unansweredText([...thread, msg({ id: "e", senderType: "staff", body: "Done" })]),
      null,
    );
    assert.deepEqual(quickReplies("Do you do vans?\nIt's a Transit."), [
      "Let me check and get back to you",
    ]);
  });

  it("says why a client cannot be texted or emailed", () => {
    const reach = clientReach({
      phoneNormalised: "+447700900123",
      emailNormalised: null,
      contactPreferences: { preferredChannel: "sms", operationalNotifications: false },
    } as never);
    assert.deepEqual(reach, {
      sms: false,
      email: false,
      smsWhyNot: "This client has opted out of texts",
      emailWhyNot: "No email address on file",
    });
  });
});

describe("inbox rows", () => {
  it("prefixes our messages and labels the row for screen readers", () => {
    assert.equal(
      inboxPreview({ lastMessage: { body: "See you\nthen", from: "staff" } }),
      "You: See you then",
    );
    assert.equal(
      inboxRowLabel({
        name: "Lily Booth",
        unread: true,
        needsReply: true,
        time: "06:21",
        preview: "Hi, can I move Saturday to 11?",
      }),
      "Lily Booth, unread, needs reply, 06:21, Hi, can I move Saturday to 11?",
    );
  });
});

describe("announcement counter", () => {
  it("counts the text as received, opt-out link included", () => {
    const frame = {
      prefix: "Northline: ",
      suffix: " Opt out: https://booking-api.recavo.app/u/" + "x".repeat(32),
    };
    const short = announcementCounter(
      "Hi {first name}, 20% off",
      frame,
      "https://book.recavo.app/northline",
    );
    assert.equal(short.segments, 1);
    assert.equal(short.limit, 160);
    const long = announcementCounter("a".repeat(120), frame, "");
    assert.equal(long.segments, 2);
    assert.equal(long.limit, 306);
  });
});
