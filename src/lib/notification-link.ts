/**
 * Where a staff bell notification goes when tapped.
 *
 * The API stores a portal-relative `link` per notification (a package request opens
 * that request, a support reply opens the thread). Rows written before links were
 * stored, and API builds that predate the field, fall back to the booking the alert
 * is about. Only in-app paths are honoured so a bad value can never send the user
 * off-site.
 */
export function notificationHref(n: {
  link?: string | null;
  bookingId?: string | null;
  templateKey?: string;
}): string | null {
  const link = n.link?.trim();
  if (link && isPortalPath(link)) return link;
  if (n.templateKey === "service_follow_up_staff") return "/follow-ups";
  if (n.bookingId) return `/bookings?booking=${encodeURIComponent(n.bookingId)}`;
  return null;
}

function isPortalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/[\s\\]/.test(value);
}
