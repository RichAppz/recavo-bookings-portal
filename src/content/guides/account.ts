import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const ACCOUNT_GUIDES: readonly Guide[] = [
  {
    slug: "working-offline",
    title: "Working offline",
    summary:
      "No signal in the car park or the basement studio? The week ahead is already on your phone, and changes you make are sent as soon as you're back online.",
    category: "account",
    verticals: BOTH,
    minutes: 3,
    sharedImages: true,
    keywords: [
      "offline",
      "no signal",
      "no internet",
      "saved data",
      "sync",
      "queued",
      "waiting to send",
      "cache",
      "install",
      "home screen",
      "app",
    ],
    steps: [
      {
        heading: "What's kept on your device",
        body: "While the app is open and online it quietly saves the next seven days of {bookings} — each one's details, client, payments and history — and refreshes them every few minutes. If the connection drops, the calendar and those {bookings} still open.",
        image: {
          name: "offline-strip",
          alt: "The calendar with the amber strip at the top reading Offline — showing saved data.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "The offline strip",
        body: "A strip under the top bar says **Offline — showing saved data**. Lists carry a note saying when their saved copy is from. Anything that needs the server — the booking page, card payments, sending a message — waits until you're back.",
      },
      {
        heading: "Changes wait, then send",
        body: "Mark attendance, record a cash payment or add a note while offline and it's queued: the strip counts *changes waiting to send* and the {booking} shows a queued marker. When the signal returns everything is sent in order and the strip briefly reads **Back online — sending**.",
      },
      {
        heading: "Put it on your home screen",
        body: "RECAVO works as an app. On iPhone, open it in Safari, tap **Share** then **Add to Home Screen**; on Android, Chrome offers **Install app** from its menu. You get a full-screen app with its own icon, and the offline copy is kept even when Safari's tabs are cleared.",
      },
    ],
    related: ["whats-new-and-support", "record-a-payment"],
  },
  {
    slug: "dark-mode-and-calendar-colours",
    title: "Dark mode and calendar colours",
    summary:
      "RECAVO follows your device's light or dark setting. Choose what the calendar colours mean, and give each {staff} their own colour.",
    category: "account",
    verticals: BOTH,
    minutes: 2,
    keywords: [
      "theme",
      "appearance",
      "dark",
      "light",
      "night",
      "colours",
      "colors",
      "calendar colour",
      "staff colour",
      "payment status",
    ],
    steps: [
      {
        heading: "Dark mode",
        body: "There's no switch to find — RECAVO follows the light or dark setting on your phone or computer, and changes with it if you schedule dark mode for the evening. The booking page your clients see does the same.",
        image: { name: "dark-calendar", alt: "The calendar shown in dark mode." },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "What the calendar colours mean",
        body: "By default {bookings} are coloured by **payment status**: green for paid or nothing to collect, amber for a deposit or part payment, red for unpaid, and slate for events. Change any of them under **Settings → Configuration → Calendar colours** — pick a colour, or clear the box to go back to the default — then **Save colours**.",
        image: {
          name: "calendar-colours",
          alt: "The Calendar colours settings with a colour for paid, deposit or part paid, unpaid and events.",
        },
        link: { to: "/settings", search: { tab: "configuration" }, label: "Open Configuration" },
      },
      {
        heading: "Colour by {staff}",
        body: "Each {staff} has a **calendar colour** on their card under **{Staff}**. Filter the calendar to one person to see just their day, or use the colour to tell teams apart at a glance.",
        link: { to: "/staff", label: "Open {Staff}" },
      },
    ],
    related: ["add-staff-and-hours", "notification-preferences"],
  },
  {
    slug: "two-factor-authentication",
    title: "Passwords and two-factor authentication",
    summary:
      "Change your password, and add an authenticator app so privileged actions need a code as well.",
    category: "account",
    verticals: BOTH,
    minutes: 2,
    sharedImages: true,
    keywords: [
      "2fa",
      "mfa",
      "authenticator",
      "security",
      "password",
      "sign in",
      "google authenticator",
      "1password",
      "authy",
      "code",
    ],
    steps: [
      {
        heading: "Change your password",
        body: "Go to **Settings → Security**. Under **Password**, enter your current password and the new one (at least 8 characters) and click **Update password**. Forgotten it? Sign out and use **Forgot password?** on the sign-in screen for a reset link.",
        image: {
          name: "security",
          alt: "Settings, Security tab, with the Password form and the Two-factor authentication card with an Enrol authenticator button.",
        },
        link: { to: "/settings", search: { tab: "security" }, label: "Open Security" },
      },
      {
        heading: "Turn on two-factor",
        body: "Under **Two-factor authentication**, click **Enrol authenticator**, scan the code with Google Authenticator, 1Password, Authy or similar, and enter the six-digit code it shows to finish. Once it's on, sensitive actions — changing payout details, deleting data, team permissions — ask for a fresh code.",
      },
      {
        heading: "Your team",
        body: "Two-factor is per person, not per business. Ask everyone on your team — especially owners and managers under **Settings → Team** — to turn it on. Lost your phone? Contact support from the **Support** page and we'll verify you and reset it.",
        link: { to: "/settings", search: { tab: "team" }, label: "Open Team" },
      },
    ],
    related: ["add-staff-and-hours", "whats-new-and-support"],
  },
  {
    slug: "whats-new-and-support",
    title: "What's new, guides and support",
    summary:
      "See what changed from the sidebar, and find a guide or get help from a person from the ? button beside search.",
    category: "account",
    verticals: BOTH,
    minutes: 2,
    sharedImages: true,
    keywords: [
      "help",
      "support",
      "contact",
      "bug",
      "feature request",
      "suggest",
      "changelog",
      "release notes",
      "updates",
      "guides",
      "tutorials",
    ],
    steps: [
      {
        heading: "What's new",
        body: "**What's new** lists every improvement, newest first, with where to find it. The badge shows how many you haven't read. **Suggest something** at the top takes you to Support, where you can raise an idea — we read all of them.",
        image: {
          name: "whats-new",
          alt: "The What's new page listing recent improvements grouped by release.",
        },
        link: { to: "/whats-new", label: "Open What's new" },
      },
      {
        heading: "Guides",
        body: "**Guides** — where you are now — is step-by-step help with screenshots, written for your kind of business. Open it from the **?** button beside the search bar. Search it from the box at the top, or from the app's search (**⌘K** / **Ctrl K**) which finds guides alongside clients and bookings.",
        image: {
          name: "guides",
          alt: "The Guides page with a search box and guides grouped by category.",
        },
        link: { to: "/support/guides", label: "Open Guides" },
      },
      {
        heading: "Ask a person",
        body: "**Support** (under the **?** button beside search) shows your requests and our replies. **New request** asks what it's about — a question, a problem, an idea — and for a short summary and the detail. We can see which business you're writing from, so there's no need to include that. Replies arrive here and by email, and a dot on the **?** button shows when there's something to read.",
        image: {
          name: "contact-support",
          alt: "The Contact support form with a type, subject and message.",
        },
        link: { to: "/support", label: "Open Support" },
      },
      {
        heading: "Reporting a problem well",
        body: "Say what you did, what you expected and what happened instead, and name the client or booking reference it relates to (like *B-BAPAVX5J*). If it's about a message a client didn't get, their record's **Notifications** tab shows what was sent and where it went.",
        image: {
          name: "support",
          alt: "The Support page listing your requests with their status.",
        },
      },
    ],
    related: ["working-offline", "two-factor-authentication"],
  },
];
