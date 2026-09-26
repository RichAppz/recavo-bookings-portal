import type { ReleaseNote } from "../lib/release-notes.ts";

/**
 * What's shipped, newest first. One entry per release day; add to the top.
 * Speak to the business owner: what they can now see or do. See `src/lib/release-notes.ts`.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-09-26",
    title: "Change how a booking is paid, and find a client's jobs faster",
    items: [
      {
        kind: "new",
        text: "Picked bank transfer by mistake, or the client will pay on the day? Open the booking and change how it's paid — it confirms straight away and the client gets a fresh confirmation instead of the “transfer to confirm” text.",
        where: "Bookings → open a booking → Change how it's paid",
      },
      {
        kind: "improved",
        text: "Search a client's name and their jobs appear right under it — upcoming first, any date.",
        where: "Search (⌘K)",
      },
      { kind: "new", text: "This What's new page, so you can see what has shipped." },
    ],
  },
  {
    date: "2026-09-25",
    title: "Support threads, package requests and unlimited texts",
    items: [
      {
        kind: "new",
        text: "Support page: ask the RECAVO team anything and carry on the conversation in one thread. Replies also land in your inbox.",
        where: "Your name (bottom left) → Contact support",
      },
      {
        kind: "new",
        text: "Clients can request a package even when you don't take card payments; you confirm it once they've paid you.",
        where: "Account page (clients) · Packages (you)",
      },
      {
        kind: "new",
        text: "Unlimited texts bolt-on (£10/month). Once RECAVO offers it to you it appears on Billing to add yourself.",
        where: "Billing",
      },
      {
        kind: "new",
        text: "Search everywhere: press ⌘K / Ctrl K or tap the magnifier to find clients, vehicles, packages, bookings and pages.",
      },
      {
        kind: "new",
        text: "Referrals page with your partner code and stats, plus a banner on Billing when a discount is applied.",
        where: "Referrals · Billing",
      },
      {
        kind: "fixed",
        text: "Calendar events are saved and shown in your business's timezone, not the phone's.",
      },
      {
        kind: "fixed",
        text: "Emailed sign-in links bring you back to the page you asked for.",
      },
    ],
  },
  {
    date: "2026-09-24",
    title: "Clients can manage their own bookings",
    items: [
      {
        kind: "new",
        text: "Clients can move or cancel a booking from their account page on the web, within the rules you've set.",
        where: "Client account page",
      },
      {
        kind: "new",
        text: "Contact support from inside the app.",
      },
    ],
  },
  {
    date: "2026-09-22",
    title: "Offer links and Safari fixes",
    items: [
      {
        kind: "new",
        text: "Preview an offer link's booking page before you share it, and choose whether the link hides the way out to your full booking page.",
        where: "Offer links",
      },
      { kind: "fixed", text: "Editing opening hours no longer crashes Safari." },
      {
        kind: "fixed",
        text: "Dates typed by staff are read in the business's timezone, not the device's.",
      },
    ],
  },
  {
    date: "2026-09-20",
    title: "Price each service on a booking",
    items: [
      {
        kind: "new",
        text: "When adding a booking, edit each service's price before it goes through. A changed price is the price — not a discount.",
        where: "Create → Add booking",
      },
      { kind: "fixed", text: "The calendar's booked total stays visible on phones." },
    ],
  },
  {
    date: "2026-09-19",
    title: "Drop-ins, calendar settings and a tidier menu",
    items: [
      {
        kind: "new",
        text: "Untimed drop-ins: squeeze a job onto a held day without picking a time.",
        where: "Calendar",
      },
      {
        kind: "new",
        text: "Calendar settings: scroll toggle, event colours and UK bank holidays.",
        where: "Settings → Calendar",
      },
      {
        kind: "new",
        text: "Hide menu items you don't use. On Solo, Staff becomes your own availability.",
        where: "Settings",
      },
      { kind: "fixed", text: "Phone layouts respect left/right safe areas (notch, landscape)." },
    ],
  },
];
