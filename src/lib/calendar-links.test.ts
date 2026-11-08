import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleCalendarUrl, icsContent } from "./calendar-links.ts";

const event = {
  title: "1-to-1 session with Mia",
  start: "2026-10-16T08:00:00.000Z",
  end: "2026-10-16T09:00:00.000Z",
  location: "12 Mill Street, Leeds",
  details: "Ref: ABC123; bring water",
};

describe("googleCalendarUrl", () => {
  it("builds a template link with compact UTC instants", () => {
    const url = new URL(googleCalendarUrl(event));
    assert.equal(url.hostname, "calendar.google.com");
    assert.equal(url.searchParams.get("action"), "TEMPLATE");
    assert.equal(url.searchParams.get("dates"), "20261016T080000Z/20261016T090000Z");
    assert.equal(url.searchParams.get("location"), event.location);
  });
});

describe("icsContent", () => {
  it("is a single VEVENT with escaped text and CRLF line ends", () => {
    const ics = icsContent(event, "test@recavo.app");
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.match(ics, /\r\nDTSTART:20261016T080000Z\r\n/);
    assert.match(ics, /\r\nDTEND:20261016T090000Z\r\n/);
    assert.match(ics, /\r\nUID:test@recavo\.app\r\n/);
    assert.match(ics, /SUMMARY:1-to-1 session with Mia/);
    assert.match(ics, /LOCATION:12 Mill Street\\, Leeds/);
    assert.match(ics, /DESCRIPTION:Ref: ABC123\\; bring water/);
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  });
});
