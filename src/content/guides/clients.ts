import type { Guide } from "../../lib/guides.ts";

const BOTH = ["personal_training", "car_detailing"] as const;

export const CLIENT_GUIDES: readonly Guide[] = [
  {
    slug: "add-and-import-clients",
    title: "Add and import clients",
    summary:
      "Add clients one at a time, or bring your whole list across from a spreadsheet or another booking system in one go.",
    category: "clients",
    verticals: BOTH,
    minutes: 4,
    keywords: [
      "customer",
      "new client",
      "csv",
      "spreadsheet",
      "import",
      "migrate",
      "excel",
      "contacts",
      "upload",
    ],
    steps: [
      {
        heading: "The Clients list",
        body: "**Clients** in the sidebar is everyone who has booked with you or that you've added. Search by name, email or phone, filter by status, and click a name to open their record. Clients who book online are added here automatically.",
        image: {
          name: "clients",
          alt: "The Clients page with a search box, status filter and a table of clients with their contact details.",
        },
        link: { to: "/clients", label: "Open Clients" },
      },
      {
        heading: "Add one client",
        body: {
          personal_training:
            "Click **Add client**. Only a first name is required; add an email or mobile so confirmations and reminders can reach them. **Known as** is a private nickname to tell two Sams apart — the client never sees it. **Preferred channel** decides whether they get texts or emails by default.",
          car_detailing:
            'Click **Add client**. Only a first name is required; add an email or mobile so confirmations and reminders can reach them. **Known as** is a private note to tell two Daves apart ("Dave – red Audi") — the client never sees it. The **address** is handy for mobile jobs and lifts; **Preferred channel** decides whether they get texts or emails by default.',
        },
        image: {
          name: "add-client",
          alt: "The Add client form with name, known as, email, mobile, address and preferred channel fields.",
        },
      },
      {
        heading: "Import a spreadsheet",
        body: "Click **Import** on the Clients page. Drop in a CSV — an export from your old system is fine — then match its columns to RECAVO's on the next step. You check what will be created before anything is saved, and for anyone already on your list you choose whether to skip them or update their details from the file. **Download template** gives you a blank file with the right headings if you're starting from scratch.",
        image: {
          name: "import",
          alt: "The Import clients page: step 1 of 4 with a drop zone for a CSV file and a Download template button.",
        },
        link: { to: "/clients/import", label: "Open Import" },
      },
      {
        heading: "After importing",
        body: "Imported clients get no message — nobody is emailed until you book them or send something yourself. Add **tags** from a client's record to group them (*Marathon*, *Trade*), and use **Add to waitlist** or **Create booking** from the top of their profile.",
      },
    ],
    related: ["client-profile-and-history", "add-a-booking", "send-a-message"],
  },
  {
    slug: "client-profile-and-history",
    title: "A client's profile and history",
    summary:
      "Everything about one client in one place: contact details, upcoming and past {bookings}, payments, notes, consents and what you've sent them.",
    category: "clients",
    verticals: BOTH,
    minutes: 3,
    keywords: [
      "record",
      "profile",
      "history",
      "notes",
      "tags",
      "consent",
      "gdpr",
      "delete client",
      "export",
      "spend",
    ],
    steps: [
      {
        heading: "The header",
        body: "The top of a client's record shows their contact details and status, with buttons for the things you do most: **Message**, **Sell package**, **Add to waitlist** and **Create booking**. The cards underneath total their bookings, upcoming {bookings}, lifetime spend and credit balance.",
        image: {
          name: "client-profile",
          alt: "A client's record: contact details and action buttons, summary cards, and a row of tabs starting with Profile.",
        },
        link: { to: "/clients", label: "Open Clients" },
      },
      {
        heading: "Upcoming and past bookings",
        body: "**Upcoming** lists what they've got booked, with a link into each {booking}. **Payments** and **Invoices** show what they've paid and what's owed. **Messages** is the conversation with them, and **Notifications** every confirmation and reminder that went out, with delivery status.",
        image: {
          name: "client-upcoming",
          alt: "The Upcoming tab on a client's record listing their next bookings.",
        },
      },
      {
        heading: "Notes, tags and files",
        body: {
          personal_training:
            "**Notes** are private to your team — goals, injuries, how they like to train. **Tags** group clients for filtering. **Files** holds PAR-Qs, programmes and anything else you want to hand. **Consents** records what they've agreed to, including your cancellation terms and marketing.",
          car_detailing:
            "**Notes** are private to your team — how they like the car left, where the spare key lives. **Tags** group clients (*Trade*, *Fleet*). **Files** holds photos and anything else worth keeping. **Consents** records what they've agreed to, including your cancellation terms and marketing.",
        },
        image: {
          name: "client-notes",
          alt: "The Notes tab on a client's record with the team's private notes.",
        },
      },
      {
        heading: "Portal and privacy",
        body: "**Portal** shows whether they've claimed their client login, where they can see and manage their own {bookings}. **Privacy** is where you export everything held about them or delete the record if they ask — bookings are kept for your accounts but the personal details are removed.",
      },
    ],
    related: ["add-and-import-clients", "send-a-message", "record-a-payment"],
  },
  {
    slug: "packages-and-credits",
    title: "Sell packages and use credits",
    summary:
      "Bundle sessions and sell them up front. Each session booked against the package uses one credit, and the balance lives on the client's record.",
    category: "clients",
    verticals: ["personal_training"],
    minutes: 4,
    keywords: [
      "block booking",
      "bundle",
      "10 pack",
      "credits",
      "prepaid",
      "expiry",
      "sell package",
      "package",
    ],
    steps: [
      {
        heading: "Create a package",
        body: "Open **Packages** in the sidebar and click **Create package**. Set the name, price, the number of **credits** and how long it's **valid** after purchase. **Eligible services** limits which sessions a credit can pay for. **On sale** puts it on your booking page so clients can buy it themselves.",
        image: {
          name: "packages",
          alt: "The Packages page showing package cards with price, number of sessions, validity, eligible services and an On sale switch.",
        },
        link: { to: "/packages", label: "Open Packages" },
      },
      {
        heading: "Sell one to a client",
        body: "Click **Sell package** (also on a client's record and the **Create** menu), pick the client and the package, then say how it's paid. **Card checkout** starts a Stripe payment and issues the credits once it succeeds; **Already paid** is for cash or your own card machine and issues them straight away. The sale shows under the client's **Payments**.",
        image: {
          name: "sell-package",
          alt: "The Sell package form with client, package and a choice between card checkout and already paid.",
        },
      },
      {
        heading: "Book with a credit",
        body: "When you book a client who has credits for that session, choose **Use package credit** as the payment method — the booking is marked as paid with a credit and one credit is held. The credit is used when the session is attended, and returned if it's cancelled inside your cancellation window. Clients booking online with credits are offered the same choice.",
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Balances and expiry",
        body: "The **Packages** tab on a client's record lists each package they hold, credits left and the expiry date. **+** and **−** adjust the balance by hand (a goodwill session, say) and **Ledger** shows every credit in and out. **Run expiry sweep** on the Packages page retires anything past its date. **Offer links** let you share a package that isn't on your booking page — a discounted block for one client, say.",
        image: {
          name: "client-packages",
          alt: "The Packages tab on a client's record showing their packages, credits remaining and expiry.",
        },
      },
    ],
    related: ["group-sessions", "add-a-booking", "reports-and-exports"],
  },
  {
    slug: "vehicles-and-follow-ups",
    title: "Vehicles and follow-ups",
    summary:
      "Every job is booked against a vehicle, so you can see a car's history at a glance — and follow-ups remind you and the customer when a coating or treatment is due again.",
    category: "clients",
    verticals: ["car_detailing"],
    minutes: 4,
    keywords: [
      "car",
      "registration",
      "reg",
      "plate",
      "make",
      "model",
      "history",
      "repeat",
      "top-up",
      "reminder",
      "coating due",
      "retention",
    ],
    steps: [
      {
        heading: "Vehicles",
        body: "**Vehicles** in the sidebar lists every car on record across all your customers — registration, make, model and owner. Search by reg or owner, and click one to see the jobs done on it. A customer with more than one car has each listed separately.",
        image: {
          name: "vehicles",
          alt: "The Vehicles page listing cars with registration, make and model, owner, last update and status.",
        },
        link: { to: "/vehicles", label: "Open Vehicles" },
      },
      {
        heading: "Adding a vehicle",
        body: "Add one from the **Vehicles** tab on the customer's record, from the **Add vehicle** button on the Vehicles page, or right inside **Add job** when you pick a customer with no car on file. Registration, make and model are enough; year and colour help when two cars look alike. Sold the car? **Archive** it and it drops off the pickers but keeps its history.",
        image: {
          name: "client-vehicles",
          alt: "The Vehicles tab on a customer's record listing their cars with an option to add another.",
        },
      },
      {
        heading: "Set a follow-up interval",
        body: "On a service — a ceramic coating, say — set the **follow-up** interval under **Services**: *every 2 years*, *every 6 months*. When a job with that service is marked done, RECAVO schedules the follow-up for that vehicle automatically.",
        link: { to: "/services", label: "Open Services" },
      },
      {
        heading: "Follow-ups",
        body: "**Follow-ups** in the sidebar lists every scheduled repeat, with when it's due and when the reminder goes to the customer. Click **Book** to turn one into a job with the customer, vehicle and service filled in, or use its menu to snooze it or dismiss it. The customer gets a reminder ahead of the due date so they come back to you rather than someone else.",
        image: {
          name: "follow-ups",
          alt: "The Follow-ups page with an upcoming coating top-up showing the vehicle, due date, reminder date and a Book button.",
        },
        link: { to: "/follow-ups", label: "Open Follow-ups" },
      },
    ],
    related: ["create-your-services", "client-profile-and-history", "add-a-booking"],
  },
  {
    slug: "client-lifts",
    title: "Client lifts",
    summary:
      "When a customer needs running home or to the station after dropping the car off, note it on the job so whoever is on that day knows.",
    category: "clients",
    verticals: ["car_detailing"],
    minutes: 2,
    keywords: ["lift", "drop off", "collection", "courtesy", "run home", "station", "transport"],
    steps: [
      {
        heading: "Tick it on the job",
        body: "In **Add job** (or **Edit booking**), once you've picked the customer, tick **Client needs a lift**. Say where to — *Home — 14 Elm Road*, *Leeds station* — and add a note such as when they're coming back to collect.",
        image: {
          name: "lift-fields",
          alt: "The Add job form with a customer chosen, showing the Client needs a lift tick box with destination and notes fields.",
        },
        link: { to: "/calendar", label: "Open Calendar" },
      },
      {
        heading: "Where it shows",
        body: "The job's calendar chip is marked so you can see lifts at a glance when planning the day, and the destination and notes sit on the job's panel. The customer isn't messaged about the lift — it's for your team.",
        image: {
          name: "lift-on-booking",
          alt: "A job's panel showing the client lift destination and notes alongside the vehicle and services.",
        },
      },
    ],
    related: ["add-a-booking", "all-day-and-multi-day-jobs"],
  },
];
