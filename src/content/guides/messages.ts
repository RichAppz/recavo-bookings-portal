import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const MESSAGE_GUIDES: readonly Guide[] = [
  {
    slug: "confirmations-and-reminders",
    title: "Confirmations and reminders",
    summary:
      "Every {booking} can send a confirmation when it's made and reminders before it happens. Set the schedule once, then check or resend from any {booking}.",
    category: "messages",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "reminder",
      "confirmation",
      "resend",
      "sms",
      "email",
      "no-show",
      "automatic",
      "schedule",
      "hours before",
      "client's preference",
    ],
    steps: [
      {
        heading: "Set the reminder schedule",
        body: "Go to **Settings → Notifications**. Under **Booking reminders**, add a row for each reminder — *1 day before*, *2 hours before* — and choose how it goes: **Client's preference** follows each client's contact setting, or force **SMS** or **Email**. Changes apply to upcoming {bookings} straight away; reminders already sent are never repeated.",
        image: {
          name: "reminder-settings",
          alt: "Settings, Notifications tab, with two reminder rows (1 day before by client's preference, 2 hours before by SMS) and the message templates below.",
        },
        link: { to: "/settings", search: { tab: "notifications" }, label: "Open Notifications" },
      },
      {
        heading: "Confirmations",
        body: "When you create a {booking}, **Send confirmation to client** at the bottom of the form chooses email, text or neither. What it says depends on the payment method — a plain confirmation, a payment request with a pay link, or bank details and a reference. Clients booking online always get one.",
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Check or resend on a booking",
        body: "Open the {booking}, click **⋯** and choose **Reminders**. Every message about this {booking} is listed with whether it's sent, scheduled or couldn't go (no mobile number, no credits) — and you can send the confirmation or a reminder again by email or text right there. The **History** tab keeps the delivery record.",
        image: {
          name: "booking-reminders",
          alt: "The Reminders drawer for a booking listing each message with its status and resend options.",
        },
      },
      {
        heading: "Texts and credits",
        body: "Texts come out of your **Text credits**. When you run out, anything set to text goes by email instead, so nothing is silently dropped — but a client with no email won't hear from you until you top up.",
        link: { to: "/billing/sms-credits", label: "Open Text credits" },
      },
    ],
    related: ["notification-preferences", "sms-credits", "add-a-booking"],
  },
  {
    slug: "send-a-message",
    title: "Message a client",
    summary:
      "Two-way messages with one client, or an announcement to many. Everything lands in one inbox and on the client's record.",
    category: "messages",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "inbox",
      "chat",
      "announcement",
      "broadcast",
      "closure",
      "bulk message",
      "text a client",
      "whatsapp",
      "call",
    ],
    steps: [
      {
        heading: "The inbox",
        body: "**Messages** in the sidebar is every client conversation in one place. Pick a thread, type and **Send**. Clients read and reply from their client portal, and their replies appear here and on their record's **Messages** tab.",
        image: {
          name: "messages",
          alt: "The Messages page with the inbox on the left and an open conversation with a client on the right.",
        },
        link: { to: "/messages", label: "Open Messages" },
      },
      {
        heading: "Start from the client",
        body: "**Message** on a client's record (and **Send message** on the **Create** menu) opens a quick composer: pick the conversation, type, send — no need to leave the page you're on. From a {booking}'s panel, **⋯ → Message** takes you to the inbox, and the icons beside the client's name let you **call**, **text** or **WhatsApp** them from your phone.",
        image: {
          name: "client-message",
          alt: "The Send message form with a recipient dropdown and a message box, opened from a client's record.",
        },
      },
      {
        heading: "Send an announcement",
        body: {
          personal_training:
            "**Send announcement** on the Messages page sends the same note to many clients at once — a bank-holiday closure, a new class. Tick the clients (or **Select all**), write it, send. Each person gets their own thread, so replies stay private.",
          car_detailing:
            "**Send announcement** on the Messages page sends the same note to many customers at once — a closure, a winter protection offer. Tick the customers (or **Select all**), write it, send. Each person gets their own thread, so replies stay private.",
        },
        image: {
          name: "announcement",
          alt: "The Send announcement dialog with a message box and a list of clients to tick.",
        },
      },
      {
        heading: "Templates are separate",
        body: "Confirmations and reminders aren't sent from here — they're automatic, and their wording lives under **Settings → Notifications → Message templates**. See *Confirmations and reminders*.",
        link: { to: "/settings", search: { tab: "notifications" }, label: "Open Notifications" },
      },
    ],
    related: ["confirmations-and-reminders", "client-profile-and-history"],
  },
  {
    slug: "notification-preferences",
    title: "Your notifications and message wording",
    summary:
      "What RECAVO tells you about — new bookings, cancellations, waitlist matches — and how to change the wording of what your clients receive.",
    category: "messages",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "bell",
      "alerts",
      "templates",
      "wording",
      "customise",
      "placeholders",
      "first name",
      "notifications",
    ],
    steps: [
      {
        heading: "The bell",
        body: "The bell in the top bar collects what's happened while you weren't looking: online bookings, cancellations, waitlist matches, replies from support. Click an item to jump to the booking or client it's about. Badges on **Waitlist** and **What's new** in the sidebar count what's waiting there, and a dot on the **?** button beside search means Support has replied.",
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Edit what clients receive",
        body: "Under **Settings → Notifications**, **Message templates** holds every message clients get — the confirmation, each reminder, payment requests, cancellations — in an email and a text version. Edit the wording to sound like you. Anything in double braces, like `{{first_name}}`, is filled in for each message; anything in double square brackets, like `[[ at {{location}} ]]`, is only included when the detail is known.",
        image: {
          name: "message-templates",
          alt: "The Message templates section with the email and text version of the booking confirmation.",
        },
        link: { to: "/settings", search: { tab: "notifications" }, label: "Open Notifications" },
      },
      {
        heading: "What's added for you",
        body: "Emails get the booking details table and buttons (view booking, pay, cancel) added under your text automatically; texts get the booking link added at the end. So keep templates short — the essentials are always there.",
      },
      {
        heading: "Your own account",
        body: "Your name, phone, language and timezone are under **Settings → Account**. These are yours, not the business's — the name clients see when they book with you is on your {staff} record. **Emails from RECAVO** on the same tab switches off the tips and getting-started notes we send in your first weeks; billing notices about your subscription are always sent.",
        link: { to: "/settings", search: { tab: "account" }, label: "Open Account" },
      },
    ],
    related: ["confirmations-and-reminders", "send-a-message"],
  },
];
