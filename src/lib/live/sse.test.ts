import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BACKOFF_CAP_MS,
  backoffDelayMs,
  createSseParser,
  parseLiveEvent,
  queryKeysForLiveEvent,
} from "./sse.ts";

const BIZ = "01a08604-64b0-73da-aa5d-fcc6176a1c99";

describe("createSseParser", () => {
  it("parses event/data/id frames and ignores comments", () => {
    const parser = createSseParser();
    const out = parser.push(
      ': keepalive\n\nevent: hello\nid: 7\ndata: {"type":"hello"}\n\n: keepalive\n\n',
    );
    assert.deepEqual(out, [{ event: "hello", data: '{"type":"hello"}', id: "7" }]);
  });

  it("reassembles frames split across chunks and CRLF line endings", () => {
    const parser = createSseParser();
    assert.deepEqual(parser.push("event: sms_cred"), []);
    assert.deepEqual(parser.push('its.changed\r\ndata: {"a":'), []);
    const out = parser.push("1}\r\n\r\ndata: tail\n\n");
    assert.deepEqual(out, [
      { event: "sms_credits.changed", data: '{"a":1}', id: null },
      { event: "message", data: "tail", id: null },
    ]);
  });

  it("joins multiple data lines, drops frames without data, keeps the last id", () => {
    const parser = createSseParser();
    const out = parser.push("id: a\nevent: x\n\ndata: one\ndata:two\n\n");
    assert.deepEqual(out, [{ event: "message", data: "one\ntwo", id: "a" }]);
  });
});

describe("parseLiveEvent", () => {
  it("accepts known hints and normalises optional ids", () => {
    const event = parseLiveEvent({
      event: "notification.recorded",
      data: JSON.stringify({ type: "notification.recorded", businessId: BIZ, bookingId: "b1" }),
      id: null,
    });
    assert.deepEqual(event, {
      type: "notification.recorded",
      businessId: BIZ,
      bookingId: "b1",
      customerId: null,
      invoiceId: null,
    });
  });

  it("rejects unknown events, bad JSON and missing business ids", () => {
    assert.equal(parseLiveEvent({ event: "nope", data: "{}", id: null }), null);
    assert.equal(parseLiveEvent({ event: "hello", data: "{not json", id: null }), null);
    assert.equal(parseLiveEvent({ event: "hello", data: '{"type":"hello"}', id: null }), null);
  });
});

describe("backoffDelayMs", () => {
  it("doubles from 1s with ±50% jitter and caps at 30s", () => {
    assert.equal(
      backoffDelayMs(0, () => 0.5),
      1_000,
    );
    assert.equal(
      backoffDelayMs(1, () => 0.5),
      2_000,
    );
    assert.equal(
      backoffDelayMs(2, () => 0),
      2_000,
    ); // 4s × 0.5
    assert.equal(
      backoffDelayMs(3, () => 0.999),
      11_992,
    ); // 8s × ~1.5
    assert.equal(
      backoffDelayMs(10, () => 0.999),
      BACKOFF_CAP_MS,
    );
    assert.equal(
      backoffDelayMs(10, () => 0),
      15_000,
    );
  });
});

describe("queryKeysForLiveEvent", () => {
  it("maps credits to the credits key only", () => {
    assert.deepEqual(queryKeysForLiveEvent({ type: "sms_credits.changed", businessId: BIZ }), [
      ["biz", BIZ, "sms-credits"],
    ]);
  });

  it("maps a recorded message to history and customer notifications", () => {
    const keys = queryKeysForLiveEvent({
      type: "notification.recorded",
      businessId: BIZ,
      bookingId: "b1",
      customerId: "c1",
    });
    assert.deepEqual(keys, [
      ["biz", BIZ, "notifications"],
      ["biz", BIZ, "bookings", "b1", "history"],
      ["biz", BIZ, "customers", "c1", "notifications"],
    ]);
  });

  it("uses the bookings prefix so every list, range and detail query refreshes", () => {
    assert.deepEqual(queryKeysForLiveEvent({ type: "booking.changed", businessId: BIZ }), [
      ["biz", BIZ, "bookings"],
      ["biz", BIZ, "reports", "dashboard"],
    ]);
  });

  it("hello catches up on everything the stream can move", () => {
    const keys = queryKeysForLiveEvent({ type: "hello", businessId: BIZ });
    assert.ok(keys.some((k) => k[2] === "sms-credits"));
    assert.ok(keys.some((k) => k[2] === "bookings" && k.length === 3));
    assert.ok(keys.some((k) => k[2] === "calendar-blocks"));
    assert.ok(keys.some((k) => k[2] === "invoices" && k.length === 3));
  });
});
