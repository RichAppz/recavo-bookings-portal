import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const BOOKING_GUIDES: readonly Guide[] = [
  {
    slug: "add-a-booking",
    title: { personal_training: "Add a session", car_detailing: "Book a job" },
    summary: {
      personal_training:
        "Book a client in from the calendar in a few taps: pick the client and session, choose a time, decide how they'll pay.",
      car_detailing:
        "Book a job in from the calendar in a few taps: pick the customer and services, choose a time, decide how they'll pay.",
    },
    category: "bookings",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "new booking",
      "create booking",
      "book",
      "appointment",
      "walk-in",
      "phone booking",
      "manual booking",
    ],
    steps: [
      {
        heading: "Open the form",
        body: {
          personal_training:
            "On the **Calendar**, click **Add session** — or click an empty slot to start with that time filled in. The **Create** button in the top bar and **Create booking** on a client's profile open the same form.",
          car_detailing:
            "On the **Calendar**, click **Add job** — or click an empty slot to start with that time filled in. The **Create** button in the top bar and **Create booking** on a customer's profile open the same form.",
        },
        image: {
          name: "create-menu",
          alt: "The Create menu in the top bar, listing Add booking, Add to waitlist, Add client, Add event and more.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Pick the client and what they're having",
        body: {
          personal_training:
            "Start typing a name, email or phone number under **Client**. Someone new? The **+** button adds them without leaving the form. Then tick the **session** — you can tick more than one, and each keeps its own price.",
          car_detailing:
            "Start typing a name, email or phone number under **Client**. Someone new? The **+** button adds them without leaving the form. Choose the **vehicle** (or add one on the spot), then tick every **service** in the job — a valet plus a headlight restoration, say. Each keeps its own price and the total adds up underneath.",
        },
        image: {
          name: "add-booking",
          alt: "The Add booking form with a client and a service chosen, showing staff, date, payment method and confirmation options.",
        },
      },
      {
        heading: "Choose who, when and how they pay",
        body: {
          personal_training:
            "Pick a **trainer** (or leave it on *Any*), then a **date** — the free slots for that day appear underneath, or use **Set the time** for an exact start. Knock money off with the **Discount** box (a percentage or an amount). **Payment method** decides what the confirmation asks for: *Request payment up front* sends the amount due with a pay link if card payments are on; *Pay after the session* sends a plain confirmation; *Use package credit* takes one credit from a package they've bought.",
          car_detailing:
            "Pick a **staff member** (or leave it on *Any*), then a **date** — the free slots for that day appear underneath, **Set the time** takes an exact start, and **All day** books the bay for the whole day. Knock money off with the **Discount** box (a percentage or an amount). **Payment method** is *Pay after the job* by default: a plain confirmation, and you take payment when the car is collected. Switch to *Request payment up front* to send the amount with a pay link, or *Bank transfer* to send your account details and hold the job as *awaiting payment*.",
        },
      },
      {
        heading: "Notes and the confirmation",
        body: "**Internal notes** are only ever seen by your team. Under **Send confirmation**, choose email, text or both — texts use your credit balance. Click **Create booking** and it appears on the calendar straight away, confirmed.",
      },
      {
        heading: "Open it any time",
        body: "Click the booking on the calendar to open its panel: the client's contact buttons, who's doing it, the amount and what's outstanding, plus **History** and **Payments** tabs. The **⋯** menu holds Edit, Reminders, Message and Cancel.",
        image: {
          name: "booking-panel",
          alt: "A booking's side panel showing the client, staff member, amount paid, duration and the attendance controls.",
        },
      },
    ],
    related: [
      "reschedule-a-booking",
      "edit-a-booking",
      "record-a-payment",
      "confirmations-and-reminders",
    ],
  },
  {
    slug: "all-day-and-multi-day-jobs",
    title: "All-day and multi-day jobs",
    summary:
      "Corrections and coatings take the bay for a day or more. Book them as all-day jobs so the calendar shows the car is in, and set the last day when it changes.",
    category: "bookings",
    verticals: ["car_detailing"],
    minutes: 3,
    keywords: [
      "all day",
      "two days",
      "overnight",
      "coating",
      "correction",
      "last day",
      "end date",
      "block bay",
      "bay",
    ],
    steps: [
      {
        heading: "Book it all day",
        body: "Start a job as usual, and under the date switch to **All day**. Instead of a start time you pick the **first day** and the **last day** — a two-stage correction booked Tuesday to Wednesday, say. The duration on the service still counts for pricing; *All day* only decides how it sits on the calendar.",
        image: {
          name: "all-day-form",
          alt: "The Add job form with All day selected, showing first day and last day fields instead of a time slot.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "How it looks on the calendar",
        body: "All-day jobs run along the strip at the top of each day, spanning every day the car is in, so the timed slots underneath stay free for washes and quick jobs. The chip shows the registration and how many days.",
        image: {
          name: "multi-day-calendar",
          alt: "The week calendar with a two-day paint correction running along the all-day strip above the timed bookings.",
        },
      },
      {
        heading: "Shorten or extend it",
        body: "Finished a day early, or found more paint to fix? Open the job, choose **Edit booking → Reschedule** and use **Move the day**. Change the **Last day** at the same time to shorten or extend the job; leave it alone and the job keeps its length. The customer is told about the new dates.",
        image: {
          name: "multi-day-panel",
          alt: "The panel for a two-day job showing its first and last day, the vehicle and the client lift.",
        },
      },
      {
        heading: "Blocking a bay without a job",
        body: "For a bay that's out of use — a lift being serviced, a delivery of product — use **Add event** on the calendar and tick **All day** instead. Events block the time without a customer attached. See *Events and blocking time*.",
      },
    ],
    related: ["reschedule-a-booking", "client-lifts", "events-and-blocking-time"],
  },
  {
    slug: "reschedule-a-booking",
    title: { personal_training: "Reschedule a session", car_detailing: "Reschedule a job" },
    summary:
      "Move a booking to a new time, with or without a different {staff}. The client is told, their reminders move with it, and the change is written into the booking's history.",
    category: "bookings",
    verticals: BOTH,
    minutes: 2,
    keywords: [
      "move",
      "change time",
      "change date",
      "rebook",
      "postpone",
      "fix date",
      "wrong date",
      "reschedule",
    ],
    steps: [
      {
        heading: "Open Edit booking",
        body: "Click the {booking} on the calendar, open the **⋯** menu and choose **Edit booking**. The **When** row at the top shows the current date and time with two buttons: **Fix date** and **Reschedule**.",
        image: {
          name: "edit-booking",
          alt: "The Edit booking dialog with the When row showing the current time and the Fix date and Reschedule buttons.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Fix or reschedule?",
        body: "**Reschedule** is for a real change of plan — the client is notified and their reminders move. **Fix date** is a quiet correction for when the booking was simply entered wrong: nothing is sent, and the history records *Date corrected*.",
      },
      {
        heading: "Pick the new time",
        body: {
          personal_training:
            "In **Reschedule booking**, choose a trainer (or *Any trainer*) and a date, then pick one of the free slots shown. **Set the time** lets you type an exact start instead. **Confirm new time** moves the session and tells the client.",
          car_detailing:
            "In **Reschedule booking**, choose a staff member (or *Any staff member*) and a date, then pick one of the free slots shown. **Set the time** lets you type an exact start instead. For an all-day job the tab is **Move the day**, and you can change the **Last day** at the same time. **Confirm new time** moves the job and tells the customer.",
        },
        image: {
          name: "reschedule-dialog",
          alt: "The Reschedule booking dialog with staff, date and the free slots to choose from.",
        },
      },
      {
        heading: "What the client sees",
        body: "They get a message with the new time (email, text or both, following the same choice you made when you created the booking). Anything they'd already paid stays on the booking. If they can't make the new time either, cancel it — see *Cancel, no-show and refunds*.",
      },
    ],
    related: ["edit-a-booking", "cancel-no-show-and-refunds", "all-day-and-multi-day-jobs"],
  },
  {
    slug: "edit-a-booking",
    title: "Edit a booking",
    summary: {
      personal_training:
        "Change the session, trainer, price or notes on an existing booking without cancelling and starting again.",
      car_detailing:
        "Add a service to a job, swap who's doing it, change a price or add notes — without cancelling and starting again.",
    },
    category: "bookings",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "change price",
      "add service",
      "swap staff",
      "notes",
      "amend",
      "update booking",
      "discount",
    ],
    steps: [
      {
        heading: "Find the menu",
        body: "Open the {booking} from the calendar (or from **Bookings** in the sidebar) and click **⋯** in the top corner. **Edit booking** is at the top; **Reminders**, **Message**, **Cancel booking** and **Delete booking** sit underneath. Edit is greyed out once a {booking} has been marked attended or cancelled — it's a record then.",
        image: {
          name: "booking-menu",
          alt: "The booking panel's actions menu open, listing Edit booking, Reminders, Message, Cancel booking and Delete booking.",
        },
        link: { to: "/bookings", label: "Open Bookings" },
      },
      {
        heading: "What you can change",
        body: {
          personal_training:
            "**Sessions** — swap the session, pick a different option, or tick another to add it. **Price** — each session has its own box, so a one-off discount is just a lower number. **Trainer**, **payment method** and **internal notes** too. The date lives in the **When** row: *Fix date* for a quiet correction, *Reschedule* to tell the client.",
          car_detailing:
            "**Services** — tick another service to add it to the job (the *Add another service* bar sits under the ones already picked), swap an option or remove one. **Price** — each service has its own box, so charging £150 for a £200 coating is just a lower number. **Staff member**, **vehicle**, **payment method** and **internal notes** too. The date lives in the **When** row: *Fix date* for a quiet correction, *Reschedule* to tell the customer.",
        },
        image: {
          name: "edit-form",
          alt: "The Edit booking dialog showing the services on the booking with their prices, the staff member and payment fields.",
        },
      },
      {
        heading: "Save and tell them, or not",
        body: "The summary at the bottom lists what changed. If the change is something the client would notice — a different {service}, a new price — you can send them an updated confirmation as you save; a tick box controls it. Payments already taken stay on the booking, and the difference shows as outstanding or as credit.",
      },
      {
        heading: "Everything is in History",
        body: "The **History** tab on the booking records every change with who made it and when — handy when a client asks why the price moved.",
      },
    ],
    related: ["reschedule-a-booking", "record-a-payment", "add-a-booking"],
  },
  {
    slug: "cancel-no-show-and-refunds",
    title: "Cancel, no-show and refunds",
    summary:
      "Cancel a booking (and say who cancelled), mark whether the client turned up, and refund a card payment when you need to.",
    category: "bookings",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "cancel",
      "cancellation",
      "did not attend",
      "dna",
      "no show",
      "refund",
      "attended",
      "delete booking",
      "late cancel",
    ],
    steps: [
      {
        heading: "Cancel a booking",
        body: "Open the {booking}, click **⋯** and choose **Cancel booking**. Say whether it was cancelled by the **business** or the **customer** — that's what your cancellation policy and reports go by — and add a reason your team will see. Tick **Send the client a cancellation message** unless they already know. Their reminders are removed either way.",
        image: {
          name: "cancel-dialog",
          alt: "The Cancel booking dialog asking who cancelled, for an optional reason, and whether to message the client.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Attended or no-show",
        body: {
          personal_training:
            "Once a session has started, the bottom of its panel shows **Attended** and **No-show**. Marking it keeps your attendance rate honest in Reports, and a package credit is only used up when a session is attended (or no-showed outside the cancellation window). Anything outstanding can be recorded from the same footer.",
          car_detailing:
            "Once a job has started, the bottom of its panel shows **Attended** and **No-show**. Marking it done is what triggers automatic invoicing and follow-ups, and keeps your attendance rate honest in Reports. Anything outstanding can be recorded from the same footer.",
        },
        image: {
          name: "attendance",
          alt: "A booking panel for a session earlier today with the Attended and No-show controls and Record payment at the bottom.",
        },
      },
      {
        heading: "Refund a card payment",
        body: "Refunds go back the way the money came. Open **Payments** in the sidebar, find the payment and click **Refund** — full or partial. Stripe returns it to the client's card within a few days and the booking shows the refund. Cash and bank transfers you hand back yourself; record a note on the client if you want a trail.",
        image: {
          name: "refunds",
          alt: "The Payments page listing card payments with their status and a Refund action on each.",
        },
        link: { to: "/payments", label: "Open Payments" },
      },
      {
        heading: "Delete versus cancel",
        body: "**Delete booking** removes it as if it never happened — nobody is told and it drops out of reports. Use it for test entries or duplicates only; a booking with payments against it can't be deleted, so cancel or refund instead.",
      },
    ],
    related: ["publish-cancellation-terms", "record-a-payment", "waitlist"],
  },
  {
    slug: "waitlist",
    title: "Use the waitlist",
    summary:
      "Couldn't find them a slot? Note who wants what and roughly when. When a cancellation frees matching time you're nudged, and you book them from there.",
    category: "bookings",
    verticals: BOTH,
    minutes: 2,
    keywords: ["waiting list", "cancellation list", "standby", "fully booked", "nudge", "priority"],
    steps: [
      {
        heading: "Add someone",
        body: "Open **Waitlist** in the sidebar and click **Add to waitlist** (it's on the **Create** menu too). Pick the client and the {service} they want, and optionally a {staff}. **Roughly when** and **Days they can do** narrow the match; leave them blank for *as soon as possible*. **High priority** puts them first when a slot frees.",
        image: {
          name: "add-to-waitlist",
          alt: "The Add to waitlist form with client, service, staff, date range, days they can do, time of day and priority.",
        },
        link: { to: "/waitlist", label: "Open Waitlist" },
      },
      {
        heading: "When a slot frees",
        body: "Cancelling or moving a {booking} checks the list. If someone fits the freed time, the waitlist badge in the sidebar lights up and the calendar's **Waitlist** button shows a count. Open the list and click **Book** on the entry — the Add booking form opens with the client, {service} and time already filled.",
        image: {
          name: "waitlist",
          alt: "The Waitlist page showing a waiting client with the service, dates and notes they gave.",
        },
      },
      {
        heading: "Keeping it tidy",
        body: 'Entries you\'ve booked move to *Booked*; use the status filter to see them or to remove someone who no longer needs a slot. Notes such as "prefers a text" sit on the entry so whoever picks it up knows.',
      },
    ],
    related: ["cancel-no-show-and-refunds", "add-a-booking"],
  },
  {
    slug: "events-and-blocking-time",
    title: "Events and blocking time",
    summary: {
      personal_training:
        "Keep personal time, courses and closures off the booking page: add an event, or book time off for a trainer.",
      car_detailing:
        "Keep MOTs, deliveries and closures off the booking page: add an event, or book time off for a member of staff.",
    },
    category: "bookings",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "block",
      "block out",
      "unavailable",
      "holiday",
      "time off",
      "personal time",
      "closed",
      "event",
      "busy",
    ],
    steps: [
      {
        heading: "Add an event",
        body: {
          personal_training:
            "On the **Calendar**, click **Add event**. Give it a title, pick the trainer it applies to (or leave blank for the whole studio), the date and time — or tick **All day**. No session can be booked over it, online or by you. Pick a **colour** so it stands out from sessions.",
          car_detailing:
            "On the **Calendar**, click **Add event**. Give it a title — *Van MOT*, *Product delivery* — pick the staff member it applies to (or leave blank for the whole site), the date and time, or tick **All day**. No job can be booked over it, online or by you. Pick a **colour** so it stands out from jobs.",
        },
        image: {
          name: "add-event",
          alt: "The Add event form with title, staff member, dates, from and to times, All day, colour and notes.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "See them all",
        body: "**Events** in the sidebar lists every event in a date range, with who it's for and where. Click one to edit or delete it. Bank holidays show on the calendar automatically — turn them on or off under **Settings → Configuration**.",
        image: {
          name: "events",
          alt: "The Events page listing upcoming events with their date, staff member and location.",
        },
        link: { to: "/events", label: "Open Events" },
      },
      {
        heading: "Time off for one person",
        body: "For holidays and days off, use **Time off and blocks** on the {staff}'s card under **{Staff}**. Add a range and the whole period is blocked on their calendar and hidden from the booking page, while everyone else stays bookable.",
        image: {
          name: "time-off",
          alt: "The Time off and blocks card on a staff member's page with the ranges they are away.",
        },
        link: { to: "/staff", label: "Open {Staff}" },
      },
      {
        heading: "Block availability quickly",
        body: "The **Create** menu has **Block availability** for a quick one-off: pick the {staff}, day and hours and it's blocked without the ceremony of an event.",
      },
    ],
    related: ["add-staff-and-hours", "add-your-location"],
  },
  {
    slug: "group-sessions",
    title: "Run group sessions",
    summary:
      "Classes and small groups: set the number of places on the session type, book clients into the same slot, and see who's coming.",
    category: "bookings",
    verticals: ["personal_training"],
    minutes: 3,
    keywords: ["class", "group", "bootcamp", "capacity", "places", "spaces", "attendees", "roster"],
    steps: [
      {
        heading: "Make the session a group",
        body: "Under **Sessions**, edit (or create) the session type and turn on **Group**, then set the **places**. Clients booking online take one place each; the slot stays bookable until it's full. Group booking is part of the Business and Growth plans.",
        link: { to: "/services", label: "Open Sessions" },
      },
      {
        heading: "Start a class",
        body: "**Create → Create group session** publishes a class at a set time with a trainer and books the first attendee — the **lead client**. From then on the slot shows on the booking page as something to join, and each person who books takes one place.",
        image: {
          name: "create-group-session",
          alt: "The Create group session dialog with lead client, group service, staff, date and start time.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Each attendee is a booking",
        body: "Everyone in the class has their own booking at the same time, with their own payment and attendance. Click the class on the calendar to open one; the chip shows how many places are taken. To add someone yourself, book them as usual and pick the class as the session at the same time.",
        image: {
          name: "group-booking",
          alt: "The panel for one attendee's booking in a group class, showing the client, trainer, amount and attendance controls.",
        },
      },
      {
        heading: "Cancelling a class",
        body: "Cancelling one person's booking frees their place. To cancel the whole class, cancel each booking — every client is told, and any package credits go back.",
      },
    ],
    related: ["create-your-services", "packages-and-credits", "cancel-no-show-and-refunds"],
  },
];
