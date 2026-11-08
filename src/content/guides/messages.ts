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
        body: "Go to **Settings → Client messages**. Under **Reminders**, choose **Edit timing** and add a row for each reminder — *1 day before*, *2 hours before* — and choose how it goes: **Client's preference** follows each client's contact setting, or force **SMS** or **Email**. Changes apply to upcoming {bookings} straight away; reminders already sent are never repeated.",
        image: {
          name: "reminder-settings",
          alt: "Settings, Client messages page, with two reminder rows (1 day before by client's preference, 2 hours before by SMS) and the message templates below.",
        },
        link: { to: "/settings/client-messages", label: "Open Client messages" },
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
      "Texts and emails with your clients in one inbox, with their next {booking} beside the conversation. Send one announcement to many when you need to.",
    category: "messages",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "inbox",
      "chat",
      "reply",
      "needs reply",
      "mark as done",
      "unread",
      "saved replies",
      "quick replies",
      "booking link",
      "announcement",
      "broadcast",
      "closure",
      "bulk message",
      "marketing",
      "unsubscribe",
      "schedule",
      "text a client",
      "whatsapp",
      "call",
    ],
    steps: [
      {
        heading: "The inbox",
        body: "**Messages** in the sidebar is every client conversation, newest first. **Unread** shows what you haven't opened yet and **Needs reply** shows conversations where the client wrote last. Search finds a client by name, phone or email, or any word in a message. When nothing more is needed, **Mark as done** takes it off Needs reply; a new message from them puts it back. On a phone, swipe a conversation left to mark it done or unread.",
        image: {
          name: "messages",
          alt: "The Messages page: the inbox with All, Unread and Needs reply tabs on the left, and an open conversation with Mark as done, the Client button, quick reply chips and the Text or Email switch.",
        },
        link: { to: "/messages", label: "Open Messages" },
      },
      {
        heading: "Reply by text or email",
        body: "Under the message box, choose **Text** or **Email**. It starts on whichever the client used last, and the note beside it shows the cost: a text uses 1 credit per 160 characters, and email is free. Press **Enter** to send (**Shift+Enter** adds a new line; on a phone, tap **Send**). The chips above the box suggest a quick answer when the client asks something, insert your **booking link**, or pick one of your **Saved replies**. Reminders and confirmations RECAVO sent show as small lines in the conversation; click one to see exactly what went.",
      },
      {
        heading: "The client beside the conversation",
        body: "The panel on the right shows the client's next {booking}, with **Open** and **Move**, plus quick actions and whether they can be reached by text or email. On a smaller screen it's behind the **Client** button; on a phone, tap **i**. **⋯** has **View profile**, **New booking**, **Mark as unread**, a switch to hide the automatic message lines, and **Block client**.",
      },
      {
        heading: "Start a conversation",
        body: "**+ New message** opens a client picker: your recent conversations first, or search for anyone. Picking a client opens their conversation with the cursor in the message box. **Message** at the top of a client's record opens their **Messages** tab, and from a {booking}'s panel **⋯ → Message** takes you to the inbox. The icons beside the client's name let you **call**, **text** or **WhatsApp** them from your phone.",
        image: {
          name: "client-message",
          alt: "A client's Messages tab showing the conversation, with the reminders and invoices sent to them, and a reply box.",
        },
      },
      {
        heading: "Send an announcement",
        body: {
          personal_training:
            "**Send announcement** sends one message to a group: **All clients**, those **Booked in the next 30 days**, those **Not seen in 6 months**, or **Pick a list** by service, tag or location. Choose **Text, else email**, **Email only** or **Text only**, and use **Insert** to add each client's first name or your booking link. Before you send you'll see how many clients it reaches and the text credits it uses. **Send me a test** sends it to you first, and **Schedule** picks a later time.",
          car_detailing:
            "**Send announcement** sends one message to a group: **All clients**, those **Booked in the next 30 days**, those **Not seen in 6 months**, or **Pick a list** by service, tag, vehicle make or location. Choose **Text, else email**, **Email only** or **Text only**, and use **Insert** to add each client's first name or your booking link. Before you send you'll see how many clients it reaches and the text credits it uses. **Send me a test** sends it to you first, and **Schedule** picks a later time.",
        },
        image: {
          name: "announcement",
          alt: "The Send announcement drawer with Who to send to options and their counts, the Send by choice and the message box.",
        },
      },
      {
        heading: "Announcement rules",
        body: "Announcements only go to clients who agreed to marketing, and each one carries an unsubscribe link. Anyone who uses it is taken off future announcements; their booking messages still arrive. You can send one announcement every 24 hours, and texts only go between 08:00 and 20:00. Outside those hours the button offers to send at 08:00. Each client gets it in their own conversation, so replies stay private. **Scheduled and sent** in the drawer lists what's coming up (with **Cancel**) and how past announcements did: delivered, failed, replies, and {bookings} within 7 days.",
      },
      {
        heading: "Templates are separate",
        body: "Confirmations and reminders aren't sent from here — they're automatic, and their wording lives under **Settings → Client messages**. See *Confirmations and reminders*.",
        link: { to: "/settings/client-messages", label: "Open Client messages" },
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
        body: "Under **Settings → Client messages**, **Message templates** lists every message clients get — the confirmation, each reminder, payment requests, cancellations. Pick one to open it, then switch between **Email** and **Text message** and edit **Your wording** to sound like you. **Add a detail** drops in the client's first name, the time, the location and so on. Anything in double braces, like `{{first_name}}`, is filled in for each message; anything in double square brackets, like `[[ at {{location}} ]]`, is only included when the detail is known.",
        image: {
          name: "message-templates",
          alt: "The booking confirmation template open for editing, with Email and Text message tabs, the wording box and the Add a detail buttons.",
        },
        link: { to: "/settings/client-messages", label: "Open Client messages" },
      },
      {
        heading: "What's added for you",
        body: "Emails get the booking details table and buttons (view booking, pay, cancel) added under your text automatically; texts get the booking link added at the end. So keep templates short — the essentials are always there.",
      },
      {
        heading: "Your own account",
        body: "Your name, phone, language and timezone are under **Settings → Profile**. These are yours, not the business's — the name clients see when they book with you is on your {staff} record. **Emails from RECAVO** on the same page switches off the tips and getting-started notes we send in your first weeks; billing notices about your subscription are always sent.",
        link: { to: "/settings/profile", label: "Open Profile" },
      },
    ],
    related: ["confirmations-and-reminders", "send-a-message"],
  },
];
