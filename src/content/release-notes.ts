import type { ReleaseNote } from "../lib/release-notes.ts";

/**
 * What's shipped, newest first. One entry per release day; add to the top.
 * Speak to the business owner: what they can now see or do. See `src/lib/release-notes.ts`.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-09-30",
    title: "On your own? Set your hours where you set up what clients book",
    items: [
      {
        kind: "new",
        text: "If you're the only person in the business, your availability now lives in the session or service form. Open any one (or create one) and set the hours clients can book you — one set of hours for everything you offer. Start from “Use business hours” to copy your location's opening times. Until hours are set nothing can be booked, so if your booking page has been showing no times, this is the fix.",
        where: "Sessions or Services → Edit → Your availability",
      },
      {
        kind: "improved",
        text: "The second weekly grid, “When this session is offered”, is out of the way for one-person businesses. It's behind a switch — “Only offer this at certain times” — for the odd session or service that really is narrower, like a Saturday-only class. Off, it's offered whenever you're available, and its card says so.",
        where: "Sessions or Services",
      },
    ],
  },
  {
    date: "2026-09-28",
    title: "Every payment counted, and exports your accountant can use",
    items: [
      {
        kind: "fixed",
        text: "Revenue now counts every way you get paid. Cash, bank transfers and payments on your own card machine were missing from the figure, which only ever added up online card payments — so if you take money offline your totals will go up, including for months that have already been and gone.",
        where: "Overview and Reports",
      },
      {
        kind: "new",
        text: "See how you were paid: your takings split by cash, bank transfer, online card and your own card machine, with each one's share of the total. Online card and your own machine are kept apart, so you can check a Stripe payout against the right line.",
        where: "Reports → How you were paid",
      },
      {
        kind: "new",
        text: "Export your payments as a spreadsheet — every payment and refund with how it arrived, who paid, which job it was for and when, with refunds as negative amounts so the column adds up to what you actually took.",
        where: "Reports → Export payments",
      },
      {
        kind: "improved",
        text: "Exports now cover the dates you've picked rather than everything you've ever had, and carry far more than they did. Bookings come with the client and their contact details, the service, who did it, where, what's been paid and what's still owed — as pounds and pence rather than raw numbers.",
        where: "Reports → Export bookings or Export customers",
      },
      {
        kind: "fixed",
        text: "“This month” started on the last day of the previous month through the summer, so your figures quietly included a day that wasn't in the month. A month now begins on the 1st in your own time zone.",
        where: "Overview and Reports",
      },
    ],
  },
  {
    date: "2026-09-27",
    title: "A full week offline, and an Overview in your own words",
    items: [
      {
        kind: "improved",
        text: "Offline mode now covers the whole week ahead, not just today and tomorrow. Open the app with signal once and every job for the next seven days \u2014 with its client, vehicle, payments and history \u2014 is saved to your phone for when you\u2019re out of range.",
        where: "Everywhere \u2014 works automatically in the background",
      },
      {
        kind: "improved",
        text: "The Overview now talks your trade: automotive businesses see jobs, completed work and how full the diary is, rather than sessions, attendance and seats.",
        where: "Overview",
      },
      {
        kind: "new",
        text: "Hide any card you never look at with the eye icon in its corner, and bring it back from the eye menu next to the date range. Your choice is remembered on this device.",
        where: "Overview",
      },
      {
        kind: "fixed",
        text: "The text-credits alert now says “run out” at zero instead of “running low”, and is cleared automatically the moment you buy more.",
        where: "Notifications",
      },
    ],
  },
  {
    date: "2026-09-26",
    title: "Works offline, change how a booking is paid, find a client's jobs faster",
    items: [
      {
        kind: "new",
        text: "No signal? The app still opens. Every page you've visited, plus today's and tomorrow's jobs with their clients, vehicles and payments, are kept on your phone and shown from the saved copy.",
        where: "Everywhere — look for the “Offline — showing saved data” pill",
      },
      {
        kind: "new",
        text: "Mark a job done or a no-show, record cash, and confirm a bank transfer without signal. They're saved on the device and sent the moment you're back online; the booking shows “Waiting for signal” until then.",
        where: "Bookings → open a job",
      },
      {
        kind: "improved",
        text: "When a new version ships you get a “Reload” prompt instead of a half-updated app.",
      },
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
