/**
 * Which of the two public hostnames served us.
 *
 * One Worker answers on both `bookings.` and `book.` (and their `staging.`
 * twins), so the host is not a boundary — it cannot be, because Supabase keeps
 * the session in localStorage and localStorage is per-origin: bouncing a signed-in
 * person from one hostname to the other silently signs them out.
 *
 * So the host never decides *who someone is*. That question has an authoritative
 * answer already, in whether they hold a staff membership or a customer link. The
 * host decides only what to do when both of those come back empty, where there is
 * nothing to go on and the address they typed is the last piece of evidence left.
 */

const CUSTOMER_LABEL = "book";
const STAFF_LABEL = "bookings";

/** Splits `staging.book.recavo.app` into its environment and role parts. */
function parse(hostname: string): { staging: boolean; role: string; domain: string } | null {
  const labels = hostname.split(".");
  // A bare host — localhost, or an IP in a preview — names no role.
  if (labels.length < 2 || !labels[0]) return null;
  if (labels.every((label) => /^\d+$/.test(label))) return null;
  if (labels[0] === "staging" && labels.length >= 3 && labels[1]) {
    return { staging: true, role: labels[1], domain: labels.slice(2).join(".") };
  }
  return { staging: false, role: labels[0], domain: labels.slice(1).join(".") };
}

function hostFor(role: string, staging: boolean, domain: string): string {
  return staging ? `staging.${role}.${domain}` : `${role}.${domain}`;
}

/**
 * True on the hostname customers are given, where nobody should ever be invited
 * to found a studio. False for localhost, which runs the staff app by default.
 */
export function isCustomerHost(hostname: string): boolean {
  return parse(hostname)?.role === CUSTOMER_LABEL;
}

/**
 * The staff hostname matching this one, for offering a link rather than a
 * redirect. Null anywhere the pair does not apply, so callers show nothing
 * instead of guessing a URL that may not resolve.
 */
export function staffHostFor(hostname: string): string | null {
  const parts = parse(hostname);
  if (!parts || parts.role !== CUSTOMER_LABEL) return null;
  return hostFor(STAFF_LABEL, parts.staging, parts.domain);
}

/**
 * Same path on the staff hostname. Null on the staff host itself, localhost,
 * and anywhere the pair does not apply — callers must not invent a URL.
 *
 * Used when Stripe (or a bookmark) drops an owner on `book.recavo.app/billing…`.
 * Session is per-origin, so this has to be a real navigation, not an in-app
 * redirect: the signed-in console lives on `bookings.`, not `book.`.
 */
export function staffUrlFor(href: string): string | null {
  const url = new URL(href);
  const staffHost = staffHostFor(url.hostname);
  if (!staffHost) return null;
  url.hostname = staffHost;
  return url.toString();
}

/**
 * Where a studio's booking link should point, seen from wherever we are now.
 *
 * A studio copying its link out of the staff console must be handed the
 * customer hostname, not the one in their address bar — otherwise every link
 * on every business card sends people to a login page. Off the recognised
 * pair, where there is no customer hostname to name, this falls back to the
 * current origin, which is what makes the link usable on localhost.
 */
export function bookingUrlFor(slug: string, origin: string = window.location.origin): string {
  const url = new URL(origin);
  const parts = parse(url.hostname);
  if (parts && (parts.role === STAFF_LABEL || parts.role === CUSTOMER_LABEL)) {
    url.hostname = hostFor(CUSTOMER_LABEL, parts.staging, parts.domain);
  }
  url.pathname = `/${slug}`;
  return url.toString().replace(/\/$/, "");
}
