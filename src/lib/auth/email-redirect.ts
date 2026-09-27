/**
 * Where an emailed sign-in / confirmation link should land.
 *
 * One Worker serves both `book.` (customers) and `bookings.` (staff), and Supabase
 * keeps the session in localStorage, which is per-origin. Left unset, the link in
 * the email bounces to the project's Site URL — the staff hostname — so a customer
 * who asked for a code on `book.recavo.app` gets signed in on `bookings.recavo.app`
 * instead, where they have no account to speak of. Always send people back to the
 * origin they were on, and to the page they were on, so a buyer mid-way through a
 * studio's booking page comes back to that page.
 *
 * The hash is dropped: Supabase appends its own `#access_token=…` fragment.
 */
export function emailReturnUrl(
  location: Pick<Location, "origin" | "pathname" | "search"> = window.location,
): string {
  return `${location.origin}${location.pathname}${location.search}`;
}
