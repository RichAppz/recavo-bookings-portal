import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const MONEY_GUIDES: readonly Guide[] = [
  {
    slug: "record-a-payment",
    title: "Record a payment",
    summary:
      "Took cash, a bank transfer or a payment on your own card machine? Log it on the {booking} so the balance is right and the client's record shows it.",
    category: "money",
    verticals: BOTH,
    minutes: 2,
    keywords: [
      "cash",
      "paid",
      "mark paid",
      "outstanding",
      "balance",
      "card machine",
      "terminal",
      "sumup",
      "zettle",
      "bank transfer",
      "part payment",
    ],
    steps: [
      {
        heading: "Open the Payments tab",
        body: "Click the {booking} on the calendar and choose the **Payments** tab. The card at the top says what's outstanding and why — *due after the job*, a deposit still owed, a bank transfer you're waiting on — with the actions that fit.",
        image: {
          name: "payments-tab",
          alt: "The Payments tab of a booking showing the amount due and the Take card payment, Record payment and Send payment reminder buttons.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Record what you took",
        body: "Click **Record payment**. The amount defaults to what's outstanding — change it for a part payment — and pick **how it was paid**: *Cash*, *Bank transfer*, *Card (taken elsewhere)* for your own machine, or *Other*. The booking updates straight away; record the rest later if they're paying in stages.",
        image: {
          name: "record-payment",
          alt: "The Record a payment dialog with the amount pre-filled and a How was it paid dropdown.",
        },
      },
      {
        heading: "The quick way",
        body: "The footer of every unpaid {booking} has **Record payment · £… outstanding** so you can log it as you mark them attended, without hunting for the tab.",
      },
      {
        heading: "Where it ends up",
        body: "Payments you record appear on the booking's Payments tab and on the client's **Payments** tab, and count towards what's outstanding. Card payments taken through Stripe are listed under **Payments** in the sidebar with their receipts and refunds.",
        link: { to: "/payments", label: "Open Payments" },
      },
    ],
    related: ["take-a-card-payment", "invoices", "cancel-no-show-and-refunds"],
  },
  {
    slug: "take-a-card-payment",
    title: "Take a card payment",
    summary:
      "Send a pay link, take a card on the spot, or wait for a bank transfer — and see everything that's come in under Payments.",
    category: "money",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "stripe",
      "pay link",
      "checkout",
      "online payment",
      "deposit",
      "awaiting payment",
      "bank transfer",
      "mark received",
      "receipt",
    ],
    steps: [
      {
        heading: "Ask for it with the booking",
        body: "The simplest route is the **payment method** you choose when you book. *Request payment up front* sends a confirmation with the amount and a **pay online** link (once Stripe is connected). Clients booking through your page pay or leave a deposit as they book, so there's nothing to chase.",
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Take a card on the day",
        body: "On the {booking}'s **Payments** tab, **Take card payment** opens a Stripe checkout for whatever is outstanding — hand them your phone or type the card in. **Send payment reminder** messages the client the amount due and how to pay, without taking anything.",
        image: {
          name: "take-card",
          alt: "The payment card on a booking with the Take card payment, Record payment and Send payment reminder buttons.",
        },
      },
      {
        heading: "Bank transfers",
        body: "A {booking} paid by transfer waits as *awaiting payment* with the reference the client was given. When the money shows in your account, click **Mark received** — the booking confirms and the client is emailed. Chose transfer by mistake? **Change how it's paid** switches it to pay on the day.",
        image: {
          name: "bank-transfer-pending",
          alt: "The Payments tab of a booking waiting for a bank transfer, with the reference and a Mark received button.",
        },
      },
      {
        heading: "Everything in one place",
        body: "**Payments** in the sidebar lists every payment — card, transfer and recorded — with its status, receipt and a **Refund** action for card payments. The totals at the top cover the range you've chosen, and **Reports** breaks them down by method.",
        image: {
          name: "payments-page",
          alt: "The Payments page with totals for the period and a table of payments by date, client, amount and status.",
        },
        link: { to: "/payments", label: "Open Payments" },
      },
    ],
    related: ["connect-stripe", "record-a-payment", "cancel-no-show-and-refunds"],
  },
  {
    slug: "invoices",
    title: "Invoices",
    summary: {
      personal_training:
        "Numbered PDF invoices for clients and companies who need one — raised by hand from a session, or automatically when it's attended.",
      car_detailing:
        "Numbered PDF invoices for trade customers and anyone who needs one — raised by hand from a job, or automatically when it's marked done.",
    },
    category: "money",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "invoice",
      "pdf",
      "receipt",
      "vat",
      "trade",
      "company",
      "numbering",
      "payment terms",
      "overdue",
      "add-on",
      "bolt-on",
    ],
    steps: [
      {
        heading: "Turn invoicing on",
        body: "Invoicing is included on Growth and an add-on on other plans — switch it on under **Settings → Billing**. Then in **Settings → Payments**, set your **number prefix**, **payment terms** (days until due) and a **footer note**. **Invoice automatically when a job is completed** issues and emails one every time a {booking} is marked attended.",
        image: {
          name: "invoicing-settings",
          alt: "The Invoicing settings with the automatic invoicing switch, number prefix, payment terms and footer note.",
        },
        link: { to: "/settings", search: { tab: "payments" }, label: "Open Payments settings" },
      },
      {
        heading: "Raise one by hand",
        body: "From a {booking}'s **Payments** tab, click **Create invoice** under *Invoices* — the client, {service}s and prices are filled in. **New invoice** on the Invoices page starts a blank one for a one-off charge. Adjust lines, add a note, then **Issue** to number it and email the PDF.",
        link: { to: "/invoices", label: "Open Invoices" },
      },
      {
        heading: "The Invoices list",
        body: "**Invoices** in the sidebar shows what's outstanding, overdue and paid, with filters by client and status. *Auto* marks invoices RECAVO raised for you. Click a number to open it.",
        image: {
          name: "invoices",
          alt: "The Invoices page with outstanding, overdue and paid totals and a table of invoices by number, client, dates, total, balance and status.",
        },
      },
      {
        heading: "One invoice",
        body: "The invoice page shows its lines, totals and the frozen *from* and *bill to* details, with **Preview** and **Download PDF**, **Send** (or **Resend**) to email it, and **Mark paid** when the money arrives outside Stripe. Raised it wrong? **Void & redo** cancels it and opens a corrected draft; a voided number is never reused.",
        image: {
          name: "invoice-detail",
          alt: "A single invoice showing its number, status, dates, lines and totals, with Preview, Download PDF, Send and Void actions.",
        },
      },
    ],
    related: ["record-a-payment", "choose-your-plan", "reports-and-exports"],
  },
  {
    slug: "reports-and-exports",
    title: "Reports and exports",
    summary:
      "Revenue, bookings, attendance and how you were paid for any date range — plus CSV exports of payments, bookings and clients for your accountant.",
    category: "money",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "revenue",
      "takings",
      "csv",
      "export",
      "accountant",
      "occupancy",
      "attendance",
      "no-show rate",
      "download",
      "tax return",
    ],
    steps: [
      {
        heading: "Pick a range",
        body: "Open **Reports** and set **From** and **To**. The four cards — **Revenue**, **Bookings**, **Attendance rate** and **Occupancy rate** — cover that range and compare it with the period before.",
        image: {
          name: "reports",
          alt: "The Reports page with a date range and cards for revenue, bookings, attendance rate and occupancy rate.",
        },
        link: { to: "/reports", label: "Open Reports" },
      },
      {
        heading: "The breakdowns",
        body: {
          personal_training:
            "**How you were paid** splits card payments taken through RECAVO from your own machine, cash and transfers. **Revenue breakdown** shows net, refunded and disputed. **Attendance** counts attended, no-show and cancelled sessions, **Occupancy** compares seats booked with capacity, and **Packages and credits** totals what you've sold and how many credits were used.",
          car_detailing:
            "**How you were paid** splits card payments taken through RECAVO from your own machine, cash and transfers. **Revenue breakdown** shows net, refunded and disputed. **Attendance** counts completed, no-show and cancelled jobs, and **Occupancy** compares bay time booked with what was available.",
        },
        image: {
          name: "reports-detail",
          alt: "The full Reports page with the payment method, revenue, attendance and occupancy breakdowns.",
        },
      },
      {
        heading: "Export for your accountant",
        body: "**Export payments**, **Export bookings** and **Export customers** at the top each prepare a CSV for the chosen range and hand you a download link. Data exports are part of the Growth plan; the reports themselves are on every plan.",
      },
    ],
    related: ["take-a-card-payment", "invoices", "choose-your-plan"],
  },
  {
    slug: "sms-credits",
    title: "Text credits",
    summary:
      "Texts to clients — confirmations, reminders, payment requests — use prepaid credits. See how many you have, top up, and know what happens when they run out.",
    category: "money",
    verticals: BOTH,
    minutes: 2,
    sharedImages: true,
    keywords: ["sms", "text", "credits", "top up", "buy texts", "running low", "message credits"],
    steps: [
      {
        heading: "Your balance",
        body: "The **Text credits** card in the sidebar shows what's left and turns amber when you're running low. Click it (or go to **Billing → Text credits**) for the detail: bought, sent, and the recent activity.",
        image: {
          name: "sms-credits",
          alt: "The Text credits page showing texts left, a Buy button, a running-low warning and recent activity.",
        },
        link: { to: "/billing/sms-credits", label: "Open Text credits" },
      },
      {
        heading: "Buy more",
        body: "**Buy 150 texts** takes you to a Stripe checkout and the credits are added the moment it completes. One credit is one text, however long. Credits never expire and stay with you if you change plan. Growth includes unlimited texts.",
      },
      {
        heading: "When they run out",
        body: "Nothing stops. Any message set to go by text is sent by email instead until you top up, and the client's record shows which channel was used. A client with no email and no credits left simply doesn't get that message — so keep an eye on the amber card.",
      },
    ],
    related: ["confirmations-and-reminders", "choose-your-plan"],
  },
];
