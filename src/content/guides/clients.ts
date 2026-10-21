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
        body: "**Clients** in the sidebar is everyone who has booked with you or that you've added. The tabs narrow it to **New this month**, **Not seen in 60 days**, **With a package** or **Archived**; search by name, email or phone, sort by last visit, next booking, spend and more, and click a name to open their record. Pills flag anyone who **Owes** money or is **New**. Clients who book online are added here automatically.",
        image: {
          name: "clients",
          alt: "The Clients page with All, New this month, Not seen in 60 days, With a package and Archived tabs, a search box and a list of clients with their last visit, next booking and spend.",
        },
        link: { to: "/clients", label: "Open Clients" },
      },
      {
        heading: "Add one client",
        body: {
          personal_training:
            "Click **Add client**. Only a first name is required; add an email or mobile so confirmations and reminders can reach them. **Known as** is a private nickname to tell two Sams apart — the client never sees it. **How they hear from you** decides whether booking reminders and updates go by email or text. Address, tags and a first note are optional. If someone with the same name, email or mobile is already on your list, the form says so before you create a duplicate. **Add and book** saves them and opens a new booking straight away.",
          car_detailing:
            'Click **Add client**. Only a first name is required; add an email or mobile so confirmations and reminders can reach them. **Known as** is a private note to tell two Daves apart ("Dave – red Audi") — the client never sees it. **How they hear from you** decides whether booking reminders and updates go by email or text, and the **address** is handy for mobile jobs and lifts. If someone with the same name, email or mobile is already on your list, the form says so before you create a duplicate. **Add and book** saves them and opens a new job straight away.',
        },
        image: {
          name: "add-client",
          alt: "The Add client form with name, known as, email, mobile, how they hear from you and address fields.",
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
        body: "Imported clients get no message — nobody is emailed until you book them or send something yourself. Add **tags** under **Details** on a client's record to group them (*Marathon*, *Trade*), and use **New booking** or **⋯ → Add to waitlist** from the top of their profile.",
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
        body: {
          personal_training:
            "The top of a client's record shows their name, a status pill when something stands out (*New*, *Package*, *Owes*) and how to reach them. **New booking** and **Message** are the buttons you'll use most; **⋯** holds **Sell package**, **Add to waitlist**, **New invoice**, copying their email or phone, and **Archive client**. On a phone the buttons are **Book**, **Message**, **Call** and **More** (the same menu). The strip underneath shows sessions attended, their next booking, credits left, what they've spent and anything they owe — tap one to jump to the detail.",
          car_detailing:
            "The top of a customer's record shows their name, a status pill when something stands out (*New*, *Owes*) and how to reach them. **New booking** and **Message** are the buttons you'll use most; **⋯** holds **Add to waitlist**, **Set a reminder**, **New invoice**, copying their email or phone, and **Archive client**. On a phone the buttons are **Book**, **Message**, **Call** and **More** (the same menu). The strip underneath shows jobs done, their next booking, what they've spent and anything they owe — tap one to jump to the detail.",
        },
        image: {
          name: "client-profile",
          alt: "A client's record: name and status, New booking and Message buttons, a strip of summary tiles, and tabs starting with Overview.",
        },
        link: { to: "/clients", label: "Open Clients" },
      },
      {
        heading: "Overview, bookings and money",
        body: {
          personal_training:
            "**Overview** puts what matters now first: **Coming up** with their next {bookings}, any waitlist entry, the latest notes and an **About** card. **Bookings** lists everything, filtered by **Upcoming**, **Past**, **Cancelled**, **No-shows** or **All** — click one to open it. **Money** has their **Payments**, **Packages and credits** and **Invoices**.",
          car_detailing:
            "**Overview** puts what matters now first: **Coming up** with their next jobs, their reminders, any waitlist entry, the latest notes and an **About** card. **Bookings** lists everything, filtered by **Upcoming**, **Past**, **Cancelled**, **No-shows** or **All** — click one to open it. **Money** has their **Payments** and **Invoices**, and **Vehicles** lists their cars.",
        },
        image: {
          name: "client-bookings",
          alt: "The Bookings tab on a client's record with Upcoming, Past, Cancelled, No-shows and All filters above their bookings.",
        },
      },
      {
        heading: "Messages, notes and files",
        body: {
          personal_training:
            "**Messages** is one conversation: what you and they have written, plus every confirmation and reminder RECAVO sent, with whether it was delivered. **Notes and files** holds private team notes — goals, injuries, how they like to train — and files such as PAR-Qs and programmes (up to 25 MB each).",
          car_detailing:
            "**Messages** is one conversation: what you and they have written, plus every confirmation and reminder RECAVO sent, with whether it was delivered. **Notes and files** holds private team notes — how they like the car left, where the spare key lives — and files such as photos (up to 25 MB each).",
        },
        image: {
          name: "client-notes",
          alt: "The Notes and files tab on a client's record with the team's private notes and an upload area for files.",
        },
      },
      {
        heading: "Details, portal and privacy",
        body: "**Details** is where you edit their name, contact details, how they hear from you (email or text), address and **tags**. **Client portal** shows whether they've claimed their login to see and manage their own {bookings}. **Privacy** exports everything held about them, or deletes the record if they ask — bookings are kept for your accounts but the personal details are removed. **Archive** hides them from your list without losing anything.",
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
        body: "Click **Sell package** (also in the **⋯** menu on a client's record and the top bar's **New booking** menu), pick the client and the package, then say how it's paid. **Card checkout** starts a Stripe payment and issues the credits once it succeeds; **Already paid** is for cash or your own card machine and issues them straight away. The sale shows on the client's **Money** tab.",
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
        body: "**Packages and credits**, under the **Money** tab on a client's record, lists each package they hold, credits left and the expiry date, with every credit in and out underneath; the credits tile at the top of their record shows the total. **Adjust credits** changes the balance by hand (a goodwill session, say) with a reason. **Run expiry sweep** on the Packages page retires anything past its date. **Offer links** let you share a package that isn't on your booking page — a discounted block for one client, say.",
        image: {
          name: "client-packages",
          alt: "The Packages and credits card on a client's Money tab showing their package, credits remaining, expiry and credit history.",
        },
      },
    ],
    related: ["group-sessions", "add-a-booking", "reports-and-exports"],
  },
  {
    slug: "vehicles-and-follow-ups",
    title: "Vehicles and reminders",
    summary:
      "Every job is booked against a vehicle, so you can see a car's history at a glance — and reminders tell you and the customer when a wash, coating or treatment is due again.",
    category: "clients",
    verticals: ["car_detailing"],
    minutes: 6,
    keywords: [
      "car",
      "registration",
      "reg",
      "plate",
      "make",
      "model",
      "history",
      "owner",
      "duplicate",
      "repeat",
      "top-up",
      "reminder",
      "coating due",
      "retention",
      "remind a client",
      "one-off",
      "snooze",
      "remove reminder",
      "booked again",
    ],
    steps: [
      {
        heading: "Vehicles",
        body: "**Vehicles** in the sidebar lists every car on record across all your customers, with its number plate, make and model, owner, last job and next booking. The tabs narrow it to **Due back**, **Not seen in 6 months** or **Archived**; search by registration, make, model or owner, and filter by make or fuel. If the same registration is on more than one record — usually a car that changed hands — a banner offers **Review** so you can merge or tidy them.",
        image: {
          name: "vehicles",
          alt: "The Vehicles page with All, Due back, Not seen in 6 months and Archived tabs, a search box and filters above a list of cars with their number plates, owners, last job and next booking.",
        },
        link: { to: "/vehicles", label: "Open Vehicles" },
      },
      {
        heading: "A vehicle's history",
        body: "Click a car to open its panel: the owner (with a link to their profile), how many jobs it has had, what's been spent on it and when it was last in, then every job, photos, condition notes and who has owned it. **Book this vehicle** starts a job with the car and owner filled in; **Edit** changes its details. The **⋯** on each row of the list has the same shortcuts, plus **Photos**, **Ownership history** and **Archive**.",
        image: {
          name: "vehicle-panel",
          alt: "A vehicle's panel showing its number plate, owner, jobs, spend and last visit, a list of jobs, photos, condition and ownership, with Edit and Book this vehicle buttons.",
        },
      },
      {
        heading: "Adding a vehicle",
        body: "Click **Add vehicle** on the Vehicles page, add one from the **Vehicles** tab on the customer's record, or add it right inside **Add job** when the customer has no car on file. Start with the registration, choose the owner, then add what you know — make, model, year, colour and fuel — plus any condition notes or photos. **Add and book** saves it and opens a job for it straight away. Sold the car? **Archive** it and it drops off the pickers but keeps its history.",
        image: {
          name: "client-vehicles",
          alt: "The Vehicles tab on a customer's record listing their cars with an option to add another.",
        },
      },
      {
        heading: "Who is due",
        body: "**Reminders** in the sidebar shows how it's going at the top — **Overdue**, **Due in 30 days**, how many clients **Came back** and what they **Brought in** over the last 90 days. Below, the **Due**, **Booked again**, **Snoozed** and **Dismissed** tabs list each reminder with the client, the service and vehicle, when it's due and when the message goes. **Book** opens a job with the customer, vehicle and service filled in; the **⋯** menu can **Send now**, **Snooze** (a week, two weeks, a month or a date you pick) or **Dismiss** it. On the right, **Repeat reminders** shows each rule and how many it has brought back, and **What clients get** previews the message.",
        image: {
          name: "follow-ups",
          alt: "The Reminders page with Overdue, Due in 30 days, Came back and Brought in tiles, the Due tab listing clients with their vehicle, due date and a Book button, and the Repeat reminders card on the right.",
        },
        link: { to: "/follow-ups", label: "Open Reminders" },
      },
      {
        heading: "Add a reminder",
        body: "Press **Add reminder** and choose who it's for. **Everyone** sets a repeat reminder on a service — a maintenance wash every 2 months, a coating top-up every year — and from then on, each time a job with that service is done, RECAVO schedules a reminder for that customer and vehicle. **One client** is for a single customer — work done before you used RECAVO, or a one-off: pick them (or add a new client), the vehicle, the service and when it was last done. Then choose when it's **Due again**, how far ahead to **Remind them**, and check **How it works** at the bottom before you save.",
        image: {
          name: "reminder-drawer",
          alt: "The Add reminder drawer with Everyone and One client options, the service, Due again after choices, Remind them choices and a How it works timeline.",
        },
        link: { to: "/follow-ups", label: "Open Reminders" },
      },
      {
        heading: "When they book again",
        body: "When that customer is booked in for the same service, the reminder closes by itself and moves to **Booked again** — that's what the **Came back** and **Brought in** figures count. A reminder for one client is marked **One-off** in the list, and **Set a reminder** in the **⋯** menu on a customer's record opens the same drawer with them already picked.",
        link: { to: "/follow-ups", label: "Open Reminders" },
      },
      {
        heading: "Changing or removing a repeat reminder",
        body: "Click a rule under **Repeat reminders** to change how often it's due or when it reminds. **Delete** at the bottom of the drawer removes it; if customers are already waiting on it, choose **Delete and keep them** to let those reminders still go out, or **Delete and dismiss them** so nobody is reminded about something you've stopped offering. Reminders are for automotive businesses.",
        link: { to: "/follow-ups", label: "Open Reminders" },
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
