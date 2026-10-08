import type { ReleaseNote } from "../lib/release-notes.ts";

/**
 * What's shipped, newest first. One entry per release day; add to the top.
 * Speak to the business owner: what they can now see or do. See `src/lib/release-notes.ts`.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-10-08",
    title: "Package requests you can't miss, and credits clients can see",
    items: [
      {
        kind: "new",
        text: "A package a client has asked for but nobody has confirmed now sits at the top of Overview and Calendar until you deal with it — who asked, for what, how long ago — with a button straight to that request. No more finding out a fortnight later.",
        where: "Overview and Calendar",
      },
      {
        kind: "fixed",
        text: "Tapping an alert in the bell used to do nothing. It now takes you to the thing it's about: a package request opens that request, a new booking opens the booking, a text-credit warning opens Text credits.",
        where: "Bell menu",
      },
      {
        kind: "improved",
        text: "Clients booking with a package can now see how many credits they have left — under “Book with 1 credit”, in the confirmation, and beside the calendar — so they know when they're running low before the last one goes.",
        where: "Client account → Calendar",
      },
    ],
  },
  {
    date: "2026-10-05",
    title: "A quicker Edit booking, and messages that name every service",
    items: [
      {
        kind: "improved",
        text: "Edit booking now fits on one phone screen: the date, the services, the price and a tick to send the client the new details. Client, vehicle, lift, staff, discount, payment method, deposit and notes are tucked under “More options” — it opens itself when something in there needs a look before you can save, and tells you how many changes are hiding in it.",
        where: "Bookings → open a booking → Edit booking",
      },
      {
        kind: "fixed",
        text: "A job with several services only ever told the client about the first one. Confirmations, reminders and the updated-details message now list every service on the booking, so the message matches what's been charged.",
        where: "Client emails and texts",
      },
      {
        kind: "improved",
        text: "The confirmation message leads with a single line — “Hi Sam, your booking with Shine Valeting on Sat 10 Oct, 8:00pm is all set — £700 in total” — with the details link at the bottom. The text version no longer itemises the job, so it reads like a note from you rather than a receipt.",
        where: "Client emails and texts",
      },
    ],
  },
  {
    date: "2026-10-04",
    title: "Help & support, one tap away",
    items: [
      {
        kind: "improved",
        text: "Help & support has its own row at the bottom of the menu, so on a phone it's one tap from the drawer rather than hidden behind your name.",
        where: "Menu → Help & support",
      },
    ],
  },
  {
    date: "2026-10-02",
    title: "Subscribe on Android, and events beside all-day jobs",
    items: [
      {
        kind: "new",
        text: "The Android app now takes subscriptions through Google Play, the same way the iPhone app does through the App Store. A subscription is managed in the store that billed it, and Billing says which one that is.",
        where: "Android app → Billing",
      },
      {
        kind: "fixed",
        text: "You can now put an event — a break, an errand, a half-day — on a day that already holds an all-day job. A holiday that would swallow the whole day the job holds is still refused, as is anything that overlaps timed work.",
        where: "Calendar → Add event",
      },
    ],
  },
  {
    date: "2026-10-01",
    title: "Easier on the phone",
    items: [
      {
        kind: "improved",
        text: "Forms on phones now look and feel like the ones built into your phone: a big bold title, a grey close disc, finger-height inputs, switches and checkboxes, and full-width buttons along the bottom. Nothing changes on a laptop.",
        where: "Every form and dialog on a phone",
      },
      {
        kind: "improved",
        text: "Menu, search, bell, Create and every close button are bigger on phones, and the rows in the menu drawer are finger-height.",
        where: "Phone navigation",
      },
      {
        kind: "fixed",
        text: "Record a payment could lock up on iPhone — the drawer painted in one place and listened in another, so nothing responded. The payment method is now a row of buttons rather than a dropdown and the page puts itself right once the keyboard closes.",
        where: "Bookings → open a booking → Record a payment",
      },
      {
        kind: "fixed",
        text: "Each service in the picker is a full-width, finger-sized row that stays put under your thumb, so taps near the edge or on the second line don't miss.",
        where: "Add booking and Edit booking → Services",
      },
      {
        kind: "fixed",
        text: "Add booking opens on the payment method you used last — including bank transfer — instead of always falling back to “Request payment up front”.",
        where: "Create → Add booking",
      },
      {
        kind: "fixed",
        text: "A dialog that was closing could occasionally leave the page dimmed and unresponsive on iPhone. The app now notices and frees the page itself.",
      },
    ],
  },
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
      {
        kind: "new",
        text: "Attach screenshots to a support request or a reply — up to five images at a time. They show in the thread once they've been checked, and we can send images back to you the same way.",
        where: "Help & support",
      },
      {
        kind: "fixed",
        text: "When we reply to your support request you now get an email about it, not just a line in the thread.",
        where: "Help & support",
      },
      {
        kind: "new",
        text: "New businesses get a short series of plain emails from Rich over the first month — a welcome, a nudge towards whatever's left to set up, how to get paid and share your booking link. Every one has a “Turn off tips emails” link at the bottom.",
        where: "Your inbox",
      },
      {
        kind: "fixed",
        text: "The Messages badge in the menu was counting unread bell notifications, so it pointed at an empty inbox. The count now sits on the bell where it belongs.",
        where: "Menu",
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
      {
        kind: "new",
        text: "Change a service's price on a booking that already exists — the same per-service price boxes Add booking has. Charging £150 for a coating that lists at £200 is now a price, not a discount line.",
        where: "Bookings → open a booking → Edit booking",
      },
      {
        kind: "new",
        text: "An “Add another service” bar sits under the services you've picked, so adding a second one is obvious rather than a guess at tapping the summary above.",
        where: "Add booking and Edit booking",
      },
      {
        kind: "improved",
        text: "Today's date is shown beside the date fields, in your business's time zone, so you've a reference point when the phone's picker opens on some other month.",
        where: "Add booking, Reschedule and Edit booking",
      },
      {
        kind: "fixed",
        text: "Adding services that no longer fit an all-day job used to fail with “The request was invalid”. The form now says how many days the job needs and offers to give it them.",
        where: "Edit booking",
      },
      {
        kind: "fixed",
        text: "When something's refused, the message names the field and the reason instead of just “The request was invalid”.",
      },
      {
        kind: "fixed",
        text: "If Stripe rejects your payout account you now see why, with a red Rejected badge, instead of “pending” forever and a Finish onboarding button that couldn't help.",
        where: "Payments · Settings → Payments",
      },
      {
        kind: "fixed",
        text: "Chart hovers are readable in dark mode — no more light-grey text on a white box.",
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
      {
        kind: "new",
        text: "An Events page lists every holiday, break and appointment you've blocked out, with search and filters, and “Add event” is in the Create menu.",
        where: "Events · Create → Add event",
      },
      {
        kind: "new",
        text: "Set or change a booking's deposit after the fact. If a client has already paid one by the time the job is written up, it now has somewhere to go.",
        where: "Bookings → open a booking → Edit booking → Deposit",
      },
      {
        kind: "fixed",
        text: "A client's lifetime spend now counts cash, bank transfers and deposits you've recorded, not just card payments — so a regular who always pays cash no longer shows £0.00.",
        where: "Clients → open a client",
      },
      {
        kind: "fixed",
        text: "Forgot your password? The reset link takes you to a page to choose a new one, then signs you in fresh.",
        where: "Sign in → Forgot password",
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
