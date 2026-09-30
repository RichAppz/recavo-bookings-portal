import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const SETUP_GUIDES: readonly Guide[] = [
  {
    slug: "add-your-location",
    title: "Add your location and opening hours",
    summary: {
      personal_training:
        "Where you train and when the doors are open. Trainer hours and the booking page both sit inside this.",
      car_detailing:
        "Where the work happens and when you're open. Staff hours and the booking page both sit inside this.",
    },
    category: "setup",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "address",
      "opening times",
      "hours",
      "site",
      "studio",
      "unit",
      "workshop",
      "timezone",
    ],
    steps: [
      {
        heading: "Open Locations",
        body: "In the sidebar, under **Studio**, choose **Locations**. Each card is one place clients can book, with its opening hours, team and the {services} offered there. Most businesses have one; add another if you work from a second site.",
        image: {
          name: "locations",
          alt: "The Locations page showing one location card with its opening hours, team and services.",
        },
        link: { to: "/locations", label: "Open Locations" },
      },
      {
        heading: "Add or edit a location",
        body: "Click **Add location**, or the pencil on an existing card. Give it a name your clients will recognise and pick the timezone — every time on the calendar and in messages is shown in it.",
        image: {
          name: "location-form",
          alt: "The Edit location panel with name, timezone, day-by-day opening hours and booking page visibility.",
        },
      },
      {
        heading: "Set the opening hours",
        body: "Switch each day you open on and set the start and finish. Opening hours are the outer limit for the whole site: nobody can be booked outside them, even if their own hours say otherwise. **Visible on booking page** hides the whole location from clients if you turn it off.",
      },
    ],
    related: ["add-staff-and-hours", "create-your-services"],
  },
  {
    slug: "add-staff-and-hours",
    title: {
      personal_training: "Add trainers and set their hours",
      car_detailing: "Add staff and set their hours",
    },
    summary: {
      personal_training:
        "Every session is booked with a trainer. Add each one, choose which sessions they run and the hours they can be booked.",
      car_detailing:
        "Every job is booked with a member of staff. Add each one, choose which services they do and the hours they can be booked.",
    },
    category: "setup",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "team",
      "working hours",
      "availability",
      "invite",
      "rota",
      "time off",
      "holiday",
      "colour",
      "solo",
      "my hours",
    ],
    steps: [
      {
        heading: { personal_training: "Open Trainers", car_detailing: "Open Staff" },
        body: "In the sidebar choose **{Staff}**. You're already listed as the first {staff}. Pick someone in the **Team** list to see their locations, weekly availability and time off on the right.",
        image: {
          name: "staff",
          alt: "The staff page: a team list on the left and the selected person's availability on the right.",
        },
        link: { to: "/staff", label: "Open {Staff}" },
      },
      {
        heading: "Add someone",
        body: "Click **Add staff**. Their name and title are what clients see. Tick the {services} they can be booked for (leave all unticked for any), pick a **calendar colour**, and use **Visible for booking** to decide whether clients can choose them on the booking page.",
        image: {
          name: "staff-form",
          alt: "The Add staff panel with name, title, bio, calendar colour, booking visibility, services delivered and working hours.",
        },
      },
      {
        heading: "Set working hours",
        body: "Under **Working hours**, **Add hours** once for each block they work — two blocks on the same day leaves a gap for lunch. Hours have to sit inside the location's opening hours. Their availability shows week by week on the staff page.",
        image: {
          name: "staff-hours",
          alt: "The weekly availability card for a staff member showing hours for each day.",
        },
      },
      {
        heading: "On your own?",
        body: "On the **Solo** plan there's no **{Staff}** page — you are the team. Your hours live on your {services} instead: open **{Services}**, edit any {service}, and set **Your availability**. It's one set of hours for everything you offer, so change it in one place and every {service} follows. **Use business hours** copies the location's opening times to start from.",
        image: {
          name: "solo-availability",
          alt: {
            personal_training:
              "The Edit session panel for a one-person business, showing the Your availability grid with hours for each weekday.",
            car_detailing:
              "The Edit service panel for a one-person business, showing the Your availability grid with hours for each weekday.",
          },
        },
        link: { to: "/services", label: "Open {Services}" },
      },
      {
        heading: "Time off and signing in",
        body: "Book holidays under **Time off and blocks** on their card: the calendar is blocked and those days disappear from the booking page. **Invite by email** sends them a sign-in link; once accepted they see their own calendar, and you can widen their access from **Settings → Team**.",
        link: { to: "/settings", search: { tab: "team" }, label: "Open Team settings" },
      },
    ],
    related: ["add-your-location", "create-your-services", "events-and-blocking-time"],
  },
  {
    slug: "create-your-services",
    title: {
      personal_training: "Create your session types",
      car_detailing: "Create your services",
    },
    summary: {
      personal_training:
        "What clients book, how long it takes and what it costs — with options for different lengths, deposits and group classes.",
      car_detailing:
        "What customers book, how long it takes and what it costs — with options for different levels, deposits and add-ons.",
    },
    category: "setup",
    verticals: BOTH,
    minutes: 5,
    keywords: [
      "price",
      "duration",
      "variant",
      "option",
      "deposit",
      "menu",
      "catalogue",
      "bookable",
      "category",
      "availability",
      "hours",
      "solo",
      "offered",
    ],
    steps: [
      {
        heading: { personal_training: "Open Sessions", car_detailing: "Open Services" },
        body: "In the sidebar choose **{Services}**. Each card is something a client can book, grouped by category, with its price, duration and booking rules. The **Bookable** switch takes a {service} off the booking page without deleting it.",
        image: {
          name: "services",
          alt: "The services page with cards showing price, duration, booking notice and cancellation rules.",
        },
        link: { to: "/services", label: "Open {Services}" },
      },
      {
        heading: "Create a {service}",
        body: {
          personal_training:
            "Click **Create session**. Set the name, a short description clients will see, the duration and the price. **Booking notice** is how much warning you need before a session can be booked; **cancellation** is how late a client can cancel without charge.",
          car_detailing:
            "Click **Create service**. Set the name, a short description customers will see, how long it takes and the price. **Booking notice** is how much warning you need before a job can be booked; **cancellation** is how late a customer can cancel without charge.",
        },
        image: {
          name: "service-form",
          alt: "The create service form with name, description, duration, price, deposit and booking rules.",
        },
      },
      {
        heading: "When it can be booked",
        body: {
          personal_training:
            "**On your own?** The form has a **Your availability** grid: the hours clients can book you. It's the same hours whichever session you open — set it once and every session follows. Leave **Only offer this session at certain times** off unless this one really is narrower, like a Saturday-only class. **With a team**, each trainer's hours are set under **{Staff}**, and **When this session is offered** narrows just this session — leave it empty to offer it whenever a trainer is free.",
          car_detailing:
            "**On your own?** The form has a **Your availability** grid: the hours customers can book you. It's the same hours whichever service you open — set it once and every service follows. Leave **Only offer this service at certain times** off unless this one really is narrower, like a weekend-only wash. **With a team**, each {staff}'s hours are set under **{Staff}**, and **When this service is offered** narrows just this service — leave it empty to offer it whenever someone is free.",
        },
        image: {
          name: "service-availability",
          alt: {
            personal_training:
              "The Create session form for a one-person business: the Your availability grid with the trainer's hours for each weekday, and the “Only offer this session at certain times” switch off beneath it.",
            car_detailing:
              "The Create service form for a one-person business: the Your availability grid with the owner's hours for each weekday, and the “Only offer this service at certain times” switch off beneath it.",
          },
        },
      },
      {
        heading: "Options and deposits",
        body: {
          personal_training:
            "Add **options** when the same session comes in different lengths or prices (30, 60 and 90 minutes, say) — clients pick one when they book. Set a **deposit** to take part of the price up front; the rest is collected on the day.",
          car_detailing:
            "Add **options** when the same service comes in different levels (single-stage or two-stage correction, say) — customers pick one when they book. Set a **deposit** on bigger jobs to take part of the price up front; the balance is collected when the car is collected.",
        },
      },
      {
        heading: {
          personal_training: "Group classes",
          car_detailing: "Who does it, and what it uses",
        },
        body: {
          personal_training:
            "Turn on **Group** and set the number of places to run a class. Clients book a place rather than the whole slot, and the calendar shows how many are left. See *Group sessions* for the details.",
          car_detailing:
            "Choose which staff can be booked for the service. Add **consumables** — products used up on the job, like coating or pads — so each job's cost is tracked. A **follow-up** interval reminds you to rebook a customer when a coating or protection is due.",
        },
        link: { to: "/services", label: "Open {Services}" },
      },
    ],
    related: ["add-staff-and-hours", "share-your-booking-page", "add-a-booking"],
  },
  {
    slug: "share-your-booking-page",
    title: {
      personal_training: "Share your booking link",
      car_detailing: "Share your booking page",
    },
    summary:
      "Your public page is where clients book and pay themselves. Find the link, put it where clients will see it, and switch things off when you need to.",
    category: "setup",
    verticals: BOTH,
    minutes: 3,
    keywords: ["link", "public", "online booking", "website", "instagram", "share", "url", "slug"],
    steps: [
      {
        heading: "Find your link",
        body: "Go to **Settings → Business**. Under **Booking page**, the link ends in a short name you can change — keep it short and easy to say out loud. Use the copy button to grab the full link.",
        image: {
          name: "booking-link",
          alt: "Settings, Business tab, showing the public booking link with a copy button.",
        },
        link: { to: "/settings", search: { tab: "business" }, label: "Open Business settings" },
      },
      {
        heading: "See what clients see",
        body: "**View booking page** in the top bar opens your page as a client sees it: your {services} with prices and deposits, then a choice of {staff} and time. Only {services} marked **Bookable** and {staffs} marked **Visible for booking** appear.",
        image: {
          name: "booking-page",
          alt: "The public booking page listing the business's services with prices.",
        },
      },
      {
        heading: "Put it where clients are",
        body: "Add the link to your Instagram bio, Google Business profile, website and email signature. Bookings made through it land on your calendar straight away and the client gets a confirmation.",
      },
      {
        heading: "Turning things off",
        body: "To stop taking online bookings for a while, switch each {service}'s **Bookable** toggle off — the page stays up but there's nothing to book. To hide one {staff}, turn off their **Visible for booking** setting. To hide a whole site, turn off **Visible on booking page** on the location.",
        link: { to: "/services", label: "Open {Services}" },
      },
    ],
    related: ["create-your-services", "connect-stripe", "publish-cancellation-terms"],
  },
  {
    slug: "connect-stripe",
    title: "Connect Stripe and get paid",
    summary:
      "Take card payments and deposits online through Stripe, or give clients your bank details for transfers — or both.",
    category: "setup",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "card",
      "stripe",
      "payout",
      "bank transfer",
      "deposit",
      "online payment",
      "connect",
      "sort code",
    ],
    steps: [
      {
        heading: "Connect your payout account",
        body: "Open **Payments** in the sidebar. Under **Payout account**, click **Connect Stripe** and follow Stripe's steps — your business details, the bank account payouts go to, and an ID check. Stripe handles the card details and payouts; RECAVO never sees or stores them.",
        image: {
          name: "payout-account",
          alt: "The Payments page with the Payout account card inviting you to connect Stripe.",
        },
        link: { to: "/payments", label: "Open Payments" },
      },
      {
        heading: "Turn online payment on",
        body: "Go to **Settings → Payments** and switch **Take payment online** on. Clients booking online now pay (or leave a deposit) by card as they book. While it's off, priced {bookings} can still be made — you just collect the money yourself.",
        image: {
          name: "payments-settings",
          alt: "Settings, Payments tab, with the Take payment online switch and the bank transfer section.",
        },
        link: { to: "/settings", search: { tab: "payments" }, label: "Open Payments settings" },
      },
      {
        heading: "Bank transfers",
        body: "In the same tab, switch **Pay by bank transfer** on and enter your account name, sort code and account number. Clients who choose it see the details and their booking reference on the confirmation, and the {booking} waits as *awaiting payment* until you mark the money received.",
        image: {
          name: "bank-transfer",
          alt: "The Pay by bank transfer section with account name, sort code and account number fields.",
        },
      },
      {
        heading: "Cash and everything else",
        body: "Whatever clients choose, you can always record a cash, card-machine or transfer payment on the {booking} itself — see *Record a payment*.",
      },
    ],
    related: ["record-a-payment", "take-a-card-payment", "share-your-booking-page"],
  },
  {
    slug: "publish-cancellation-terms",
    title: "Publish your cancellation terms",
    summary:
      "Clients agree to your terms when they book. Write them once, publish, and every booking and reminder points to them.",
    category: "setup",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "policy",
      "terms",
      "no-show",
      "late cancellation",
      "t&c",
      "conditions",
      "privacy",
      "draft with ai",
    ],
    steps: [
      {
        heading: "Open Policies",
        body: "Go to **Settings → Policies**. **Policy documents** lists what you've published — a cancellation policy, terms and conditions, a privacy notice — each with a version number. **Seed defaults** gives you sensible starting drafts to edit.",
        image: {
          name: "policies",
          alt: "Settings, Policies tab, listing the published cancellation policy and the Create draft form.",
        },
        link: { to: "/settings", search: { tab: "policies" }, label: "Open Policies" },
      },
      {
        heading: "Write and publish",
        body: "Under **Create draft**, choose the type, write in plain language (headings and bullet points work) and click **Create**. Switch on **Publish immediately** to make it live straight away, or publish later once you've read it back. **Draft with AI** writes a first version from a few facts about how you work.",
      },
      {
        heading: "What to cover",
        body: {
          personal_training:
            "How much notice you need, what a late cancellation or no-show costs, and whether a package credit is returned. A new version doesn't change what earlier bookings agreed to.",
          car_detailing:
            "How much notice you need, what happens to a deposit inside that window, and what you expect at drop-off. A new version doesn't change what earlier bookings agreed to.",
        },
      },
      {
        heading: "Where clients see it",
        body: "The current version is linked from the booking page, the confirmation and every reminder. Clients booking online tick to accept it, and that acceptance is kept on their record — useful if a late cancellation is ever disputed.",
      },
    ],
    related: ["cancel-no-show-and-refunds", "confirmations-and-reminders"],
  },
  {
    slug: "choose-your-plan",
    title: "Choose your plan and manage billing",
    summary:
      "Pick the plan that fits, switch on add-ons like invoicing, and change or cancel whenever you like from the Billing page.",
    category: "setup",
    verticals: BOTH,
    minutes: 3,
    sharedImages: true,
    keywords: [
      "subscription",
      "plan",
      "billing",
      "upgrade",
      "downgrade",
      "trial",
      "cancel plan",
      "bolt-on",
      "add-on",
      "solo",
      "business",
      "growth",
    ],
    steps: [
      {
        heading: "Open Billing",
        body: "Go to **Settings → Billing**, or click your business name at the bottom of the sidebar. **Current plan** shows what you're on, when the period ends and whether you're in a trial.",
        image: {
          name: "billing",
          alt: "The Recavo plan page showing the current plan, period end, plan actions and add-ons.",
        },
        link: { to: "/billing", label: "Open Billing" },
      },
      {
        heading: "Pick or change a plan",
        body: "**Solo** is one person at one location. **Business** adds a team of up to five, two locations, group bookings and staff permissions. **Growth** adds unlimited texts, invoicing and data exports. **Upgrade plan** applies straight away; moving down takes effect at your next renewal.",
      },
      {
        heading: "Add-ons",
        body: "Extras you can switch on without changing plan, prorated onto your current bill: **Invoicing** (numbered PDF invoices, £8/month) and **Upsells** (offer add-ons with each {service}, £5/month on Solo). Each shows *Included* when your plan already has it.",
      },
      {
        heading: "Card details and cancelling",
        body: "**Manage in Stripe** opens Stripe's secure portal to change your card or download RECAVO's invoices. **Cancel at period end** keeps everything working until the end of what you've paid for, and you can undo it any time before then.",
      },
    ],
    related: ["sms-credits", "invoices"],
  },
];
