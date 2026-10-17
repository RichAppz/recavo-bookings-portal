/**
 * "Add to calendar" and "Directions" links for a confirmed booking. Built in the
 * browser from the booking itself, so they work before any email arrives.
 */

export type CalendarEvent = {
  title: string;
  /** ISO instants. */
  start: string;
  end: string;
  location?: string | null;
  details?: string | null;
};

function compactUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compactUtc(event.start)}/${compactUtc(event.end)}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.details) params.set("details", event.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** A minimal RFC 5545 file Apple Calendar, Outlook and the rest all open. */
export function icsContent(event: CalendarEvent, uid = `${Date.now()}@recavo.app`): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RECAVO//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(event.start)}`,
    `DTEND:${compactUtc(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcs(event.location)}`] : []),
    ...(event.details ? [`DESCRIPTION:${escapeIcs(event.details)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Triggers a download of the .ics; returns false when the browser cannot. */
export function downloadIcs(event: CalendarEvent, filename = "booking.ics"): boolean {
  if (typeof window === "undefined" || typeof Blob === "undefined") return false;
  const blob = new Blob([icsContent(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Opens the address in the device's maps app (Apple Maps on iOS, Google Maps elsewhere). */
export function directionsUrl(address: string): string {
  const query = encodeURIComponent(address);
  const apple =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  return apple
    ? `https://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}
