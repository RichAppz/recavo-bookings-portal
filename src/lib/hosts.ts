/**
 * Which of the two public hostnames served us.
 *
 * One Worker answers on both `dashboard.` and `book.` (and their `staging-`
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
const STAFF_LABEL = "dashboard";
const STAGING_PREFIX = "staging-";

/** Splits `staging-book.recavo.app` into its environment and role parts. */
function parse(hostname: string): { staging: boolean; role: string; domain: string } | null {
  const [label, ...rest] = hostname.split(".");
  // A bare host — localhost, or an IP in a preview — names no role.
  if (!label || rest.length === 0) return null;
  const staging = label.startsWith(STAGING_PREFIX);
  return {
    staging,
    role: staging ? label.slice(STAGING_PREFIX.length) : label,
    domain: rest.join("."),
  };
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
  return `${parts.staging ? STAGING_PREFIX : ""}${STAFF_LABEL}.${parts.domain}`;
}

/**
 * Where a studio's booking link should point, seen from wherever we are now.
 *
 * A studio copying its link out of the staff dashboard must be handed the
 * customer hostname, not the one in their address bar — otherwise every link
 * on every business card sends people to a login page. Off the recognised
 * pair, where there is no customer hostname to name, this falls back to the
 * current origin, which is what makes the link usable on localhost.
 */
export function bookingUrlFor(slug: string, origin: string = window.location.origin): string {
  const url = new URL(origin);
  const parts = parse(url.hostname);
  if (parts && (parts.role === STAFF_LABEL || parts.role === CUSTOMER_LABEL)) {
    url.hostname = `${parts.staging ? STAGING_PREFIX : ""}${CUSTOMER_LABEL}.${parts.domain}`;
  }
  url.pathname = `/${slug}`;
  return url.toString().replace(/\/$/, "");
}
