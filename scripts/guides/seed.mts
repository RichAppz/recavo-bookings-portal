/**
 * Builds the two fictional businesses the guide screenshots are taken from — a
 * personal-training studio and an automotive detailer — against a LOCAL API
 * (see scripts/guides/README.md). Safe to re-run: everything is looked up by
 * name before it is created, and bookings are only laid down once.
 *
 *   node --experimental-strip-types scripts/guides/seed.mts [personal_training|car_detailing]
 */
import { spawnSync } from "node:child_process";
import { Api, ApiError, emailFor, loadEnv, log, signIn, type Vertical } from "./lib.mts";

const TZ = "Europe/London";
const env = loadEnv();
const only = process.argv[2] as Vertical | undefined;

type Id = { id: string; version: number };
type Business = Id & { tradingName: string; industryTemplateKey: string; slug?: string };
type Location = Id & { name: string; timezone: string };
type Staff = Id & { displayName: string; status: string; userId?: string | null };
type Service = Id & { name: string; durationMinutes: number; variants?: (Id & { name: string })[] };
type Customer = Id & {
  firstName: string;
  lastName?: string | null;
  emailNormalised?: string | null;
};
type Booking = Id & {
  version: number;
  start: string;
  end: string;
  status: string;
  reference: string;
};
type LinkedRecord = Id & { displayLabel: string; values: Record<string, unknown> };
type Pkg = Id & { name: string };
type Consumable = Id & { name: string };

// ---- Dates (business wall clock) -----------------------------------------------

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Local `HH:MM` on `YYYY-MM-DD` in TZ → ISO instant. */
function at(isoDate: string, hhmm: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, min!);
  let utc = guess - tzOffsetMinutes(guess, TZ) * 60_000;
  const off2 = tzOffsetMinutes(utc, TZ);
  if (off2 !== tzOffsetMinutes(guess, TZ)) utc = guess - off2 * 60_000;
  return new Date(utc).toISOString();
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function weekday(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

const MIN = (h: number, m = 0) => h * 60 + m;

// ---- Plans -----------------------------------------------------------------------

type ServicePlan = {
  name: string;
  description: string;
  category?: string;
  minutes: number;
  price: number;
  deposit?: number;
  colour?: string;
  bookingMode?: "individual" | "group";
  capacityMax?: number;
  variants?: { name: string; minutes?: number; price?: number }[];
  followUp?: { intervalMonths: number; label: string };
  consumables?: { name: string; quantity: number }[];
};

type CustomerPlan = {
  first: string;
  last: string;
  email: string;
  phone: string;
  tags?: string[];
  vehicle?: { registration: string; make: string; model: string; year: number; colour: string };
};

type BookingPlan = {
  /** Days from today; negative = past. */
  day: number;
  time: string;
  service: string;
  variant?: string;
  extra?: string[];
  staff: number;
  customer: number;
  payment?: "none" | "pay_later" | "bank_transfer";
  /** After the fact: what happened / how it was paid. */
  paid?: "cash" | "card" | "bank_transfer";
  attended?: boolean;
  cancelled?: boolean;
  allDayDays?: number;
  notes?: string;
  lift?: string;
};

type Plan = {
  vertical: Vertical;
  legalName: string;
  tradingName: string;
  slug: string;
  ownerName: string;
  location: { name: string; type: "physical" | "mobile"; hours: [number, number, number][] };
  staff: { name: string; title: string; colour: string; hours: [number, number, number][] }[];
  services: ServicePlan[];
  consumables?: { name: string; unit: string; unitCost: number }[];
  packages?: {
    name: string;
    description: string;
    price: number;
    credits: number;
    months: number;
  }[];
  customers: CustomerPlan[];
  bookings: BookingPlan[];
  waitlist?: { customer: number; service: string; notes: string };
  event?: { staff: number; title: string; day: number; from: string; to: string };
  invoiceFor?: number;
  bankTransfer: { accountName: string; sortCode: string; accountNumber: string };
  support?: { subject: string; body: string };
  cancellationPolicy: string;
  terms: string;
};

// Mon–Fri 06:00–20:00, Sat 08:00–13:00.
const PT_HOURS: [number, number, number][] = [
  ...[1, 2, 3, 4, 5].map((d) => [d, MIN(6), MIN(20)] as [number, number, number]),
  [6, MIN(8), MIN(13)],
];
// Mon–Fri 08:00–18:00, Sat 08:00–14:00.
const AUTO_HOURS: [number, number, number][] = [
  ...[1, 2, 3, 4, 5].map((d) => [d, MIN(8), MIN(18)] as [number, number, number]),
  [6, MIN(8), MIN(14)],
];

const PT: Plan = {
  vertical: "personal_training",
  legalName: "Peak Performance PT Ltd",
  tradingName: "Peak Performance PT",
  slug: "peak-performance-pt",
  ownerName: "Sam Okafor",
  location: { name: "Peak Studio, Leeds", type: "physical", hours: PT_HOURS },
  staff: [
    { name: "Sam Okafor", title: "Head coach", colour: "#0f766e", hours: PT_HOURS },
    {
      name: "Priya Nair",
      title: "Strength & conditioning",
      colour: "#7c3aed",
      hours: [
        ...[1, 3, 5].map((d) => [d, MIN(7), MIN(15)] as [number, number, number]),
        [2, MIN(12), MIN(20)],
        [4, MIN(12), MIN(20)],
      ],
    },
  ],
  services: [
    {
      name: "Personal training session",
      description: "One-to-one coaching tailored to your goals.",
      category: "Coaching",
      minutes: 60,
      price: 4500,
      colour: "#0f766e",
      variants: [
        { name: "30 minutes", minutes: 30, price: 2500 },
        { name: "90 minutes", minutes: 90, price: 6500 },
      ],
    },
    {
      name: "Initial assessment",
      description: "Movement screen, goals and a plan for your first block.",
      category: "Coaching",
      minutes: 60,
      price: 3000,
      deposit: 1000,
      colour: "#2563eb",
    },
    {
      name: "Group HIIT class",
      description: "High-intensity circuits for up to 8 people.",
      category: "Classes",
      minutes: 45,
      price: 1200,
      bookingMode: "group",
      capacityMax: 8,
      colour: "#dc2626",
    },
    {
      name: "Nutrition consultation",
      description: "Review your food diary and set weekly targets.",
      category: "Coaching",
      minutes: 45,
      price: 4000,
      colour: "#ca8a04",
    },
    {
      name: "Online check-in",
      description: "A video call to review progress and adjust the programme.",
      category: "Online",
      minutes: 30,
      price: 2000,
      colour: "#0891b2",
    },
  ],
  packages: [
    {
      name: "10-session block",
      description: "Ten one-to-one sessions, valid for three months.",
      price: 40000,
      credits: 10,
      months: 3,
    },
    {
      name: "Starter 5",
      description: "Five sessions to get going.",
      price: 21000,
      credits: 5,
      months: 2,
    },
  ],
  customers: [
    {
      first: "Hannah",
      last: "Reid",
      email: "hannah.reid@example.com",
      phone: "+447700900101",
      tags: ["Strength"],
    },
    { first: "Marcus", last: "Bell", email: "marcus.bell@example.com", phone: "+447700900102" },
    {
      first: "Aisha",
      last: "Khan",
      email: "aisha.khan@example.com",
      phone: "+447700900103",
      tags: ["Marathon"],
    },
    { first: "Tom", last: "Whitfield", email: "tom.whitfield@example.com", phone: "+447700900104" },
    { first: "Grace", last: "O'Neill", email: "grace.oneill@example.com", phone: "+447700900105" },
    {
      first: "Daniel",
      last: "Foster",
      email: "daniel.foster@example.com",
      phone: "+447700900106",
      tags: ["Rehab"],
    },
    { first: "Chloe", last: "Adams", email: "chloe.adams@example.com", phone: "+447700900107" },
    { first: "Ben", last: "Hughes", email: "ben.hughes@example.com", phone: "+447700900108" },
  ],
  bookings: [
    {
      day: -6,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 0,
      paid: "card",
      attended: true,
    },
    {
      day: -6,
      time: "08:00",
      service: "Personal training session",
      variant: "30 minutes",
      staff: 0,
      customer: 1,
      paid: "cash",
      attended: true,
    },
    {
      day: -5,
      time: "12:00",
      service: "Group HIIT class",
      staff: 1,
      customer: 2,
      paid: "card",
      attended: true,
    },
    {
      day: -4,
      time: "09:00",
      service: "Initial assessment",
      staff: 0,
      customer: 3,
      paid: "bank_transfer",
      attended: true,
    },
    {
      day: -3,
      time: "17:00",
      service: "Personal training session",
      staff: 0,
      customer: 4,
      attended: false,
    },
    {
      day: -2,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 5,
      paid: "card",
      attended: true,
    },
    {
      day: -1,
      time: "13:00",
      service: "Nutrition consultation",
      staff: 1,
      customer: 0,
      paid: "card",
      attended: true,
    },
    {
      day: 0,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 1,
      payment: "pay_later",
    },
    {
      day: 0,
      time: "08:30",
      service: "Personal training session",
      variant: "90 minutes",
      staff: 0,
      customer: 2,
      payment: "none",
      paid: "card",
    },
    { day: 0, time: "12:00", service: "Group HIIT class", staff: 1, customer: 3, payment: "none" },
    {
      day: 0,
      time: "17:30",
      service: "Online check-in",
      staff: 0,
      customer: 6,
      payment: "pay_later",
    },
    {
      day: 1,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 4,
      payment: "none",
      paid: "card",
      notes: "Focus on deadlift technique",
    },
    {
      day: 1,
      time: "09:00",
      service: "Initial assessment",
      staff: 0,
      customer: 7,
      payment: "none",
    },
    {
      day: 1,
      time: "13:00",
      service: "Personal training session",
      staff: 1,
      customer: 5,
      payment: "bank_transfer",
    },
    {
      day: 2,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 0,
      payment: "pay_later",
    },
    {
      day: 2,
      time: "12:00",
      service: "Group HIIT class",
      staff: 1,
      customer: 1,
      payment: "none",
      cancelled: true,
    },
    {
      day: 3,
      time: "08:00",
      service: "Personal training session",
      staff: 0,
      customer: 2,
      payment: "none",
    },
    {
      day: 3,
      time: "14:00",
      service: "Nutrition consultation",
      staff: 1,
      customer: 3,
      payment: "none",
    },
    {
      day: 4,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 5,
      payment: "pay_later",
    },
    {
      day: 6,
      time: "07:00",
      service: "Personal training session",
      staff: 0,
      customer: 6,
      payment: "none",
    },
    { day: 7, time: "12:00", service: "Group HIIT class", staff: 1, customer: 4, payment: "none" },
    {
      day: 8,
      time: "09:00",
      service: "Personal training session",
      staff: 0,
      customer: 7,
      payment: "none",
    },
  ],
  waitlist: {
    customer: 6,
    service: "Personal training session",
    notes: "Any weekday morning before work",
  },
  event: { staff: 0, title: "Level 3 CPD workshop", day: 5, from: "09:00", to: "13:00" },
  invoiceFor: 3,
  bankTransfer: {
    accountName: "Peak Performance PT Ltd",
    sortCode: "040004",
    accountNumber: "12345678",
  },
  cancellationPolicy: [
    "## Cancellations and late changes",
    "",
    "Please give at least 24 hours' notice if you need to move or cancel a session. Sessions cancelled with less than 24 hours' notice, or missed without notice, are charged in full and any package credit used is not returned.",
    "",
    "If we need to cancel, you will be offered the next available slot or a full refund.",
  ].join("\n"),
  terms: [
    "## Terms and conditions",
    "",
    "Sessions are booked with Peak Performance PT Ltd. Please tell your trainer about any injuries or medical conditions before training, and follow instructions on equipment use. Packages are valid for six months from purchase and are non-transferable.",
  ].join("\n"),
  support: {
    subject: "Can clients book two sessions at once?",
    body: "One of my clients wants to book a double session on Saturdays. Is there a way to let them do that from the booking page?",
  },
};

const AUTO: Plan = {
  vertical: "car_detailing",
  legalName: "Prestige Auto Care Ltd",
  tradingName: "Prestige Auto Care",
  slug: "prestige-auto-care",
  ownerName: "Jordan Blake",
  location: { name: "Unit 4, Riverside Trading Estate", type: "physical", hours: AUTO_HOURS },
  staff: [
    { name: "Jordan Blake", title: "Owner / detailer", colour: "#0f766e", hours: AUTO_HOURS },
    { name: "Taylor Morgan", title: "Detailer", colour: "#ea580c", hours: AUTO_HOURS },
  ],
  services: [
    {
      name: "Maintenance wash",
      description: "Safe two-bucket wash, wheels, tyres and a quick interior tidy.",
      category: "Washing",
      minutes: 90,
      price: 4500,
      colour: "#0891b2",
    },
    {
      name: "Full valet",
      description:
        "Inside and out: shampooed seats and carpets, dressed trim, decontaminated paint.",
      category: "Valeting",
      minutes: 240,
      price: 15000,
      deposit: 3000,
      colour: "#2563eb",
    },
    {
      name: "Interior deep clean",
      description: "Full interior extraction, leather cleaning and odour treatment.",
      category: "Valeting",
      minutes: 180,
      price: 12000,
      colour: "#7c3aed",
    },
    {
      name: "Paint correction",
      description: "Machine polishing to remove swirls and light scratches.",
      category: "Detailing",
      minutes: 480,
      price: 35000,
      deposit: 10000,
      colour: "#ca8a04",
      variants: [
        { name: "Single stage", minutes: 480, price: 35000 },
        { name: "Two stage", minutes: 960, price: 65000 },
      ],
    },
    {
      name: "Ceramic coating",
      description: "Professional-grade coating with a two-year top-up reminder.",
      category: "Protection",
      minutes: 480,
      price: 60000,
      deposit: 15000,
      colour: "#0f766e",
      followUp: { intervalMonths: 24, label: "Coating top-up" },
      consumables: [
        { name: "Ceramic coating 50ml", quantity: 1 },
        { name: "Coating applicator pads", quantity: 4 },
      ],
    },
    {
      name: "Wheels-off detail",
      description: "Wheels removed, arches and calipers cleaned and sealed.",
      category: "Detailing",
      minutes: 120,
      price: 8000,
      colour: "#dc2626",
    },
    {
      name: "Headlight restoration",
      description: "Sand, polish and seal cloudy headlights.",
      category: "Detailing",
      minutes: 60,
      price: 6000,
      colour: "#65a30d",
    },
  ],
  consumables: [
    { name: "Ceramic coating 50ml", unit: "bottle", unitCost: 4500 },
    { name: "Coating applicator pads", unit: "pad", unitCost: 120 },
    { name: "Iron fallout remover 500ml", unit: "bottle", unitCost: 900 },
    { name: "Microfibre towels", unit: "towel", unitCost: 250 },
  ],
  customers: [
    {
      first: "Oliver",
      last: "Grant",
      email: "oliver.grant@example.com",
      phone: "+447700900201",
      vehicle: {
        registration: "LT21 KDX",
        make: "BMW",
        model: "M340i",
        year: 2021,
        colour: "Portimao Blue",
      },
    },
    {
      first: "Sophie",
      last: "Marsh",
      email: "sophie.marsh@example.com",
      phone: "+447700900202",
      vehicle: {
        registration: "YE19 PQR",
        make: "Audi",
        model: "RS3",
        year: 2019,
        colour: "Nardo Grey",
      },
    },
    {
      first: "James",
      last: "Patel",
      email: "james.patel@example.com",
      phone: "+447700900203",
      tags: ["Trade"],
      vehicle: {
        registration: "GX70 HLM",
        make: "Tesla",
        model: "Model 3",
        year: 2020,
        colour: "Pearl White",
      },
    },
    {
      first: "Emily",
      last: "Carter",
      email: "emily.carter@example.com",
      phone: "+447700900204",
      vehicle: {
        registration: "RJ18 WSA",
        make: "Land Rover",
        model: "Defender 110",
        year: 2022,
        colour: "Pangea Green",
      },
    },
    {
      first: "Liam",
      last: "Doyle",
      email: "liam.doyle@example.com",
      phone: "+447700900205",
      vehicle: {
        registration: "BD65 TKV",
        make: "Porsche",
        model: "911 Carrera",
        year: 2016,
        colour: "Guards Red",
      },
    },
    {
      first: "Isla",
      last: "Fraser",
      email: "isla.fraser@example.com",
      phone: "+447700900206",
      vehicle: {
        registration: "MK22 ZFA",
        make: "Mercedes-Benz",
        model: "A-Class",
        year: 2022,
        colour: "Polar White",
      },
    },
    {
      first: "Noah",
      last: "Brennan",
      email: "noah.brennan@example.com",
      phone: "+447700900207",
      vehicle: {
        registration: "PO14 GHB",
        make: "Volkswagen",
        model: "Golf GTI",
        year: 2014,
        colour: "Tornado Red",
      },
    },
    {
      first: "Mia",
      last: "Sullivan",
      email: "mia.sullivan@example.com",
      phone: "+447700900208",
      vehicle: {
        registration: "WR23 LNM",
        make: "Range Rover",
        model: "Sport",
        year: 2023,
        colour: "Santorini Black",
      },
    },
  ],
  bookings: [
    {
      day: -6,
      time: "08:00",
      service: "Full valet",
      staff: 0,
      customer: 0,
      paid: "card",
      attended: true,
    },
    {
      day: -6,
      time: "09:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 1,
      paid: "cash",
      attended: true,
    },
    {
      day: -5,
      time: "08:00",
      service: "Ceramic coating",
      staff: 0,
      customer: 2,
      paid: "bank_transfer",
      attended: true,
      allDayDays: 1,
    },
    {
      day: -4,
      time: "10:00",
      service: "Wheels-off detail",
      staff: 1,
      customer: 3,
      paid: "card",
      attended: true,
    },
    {
      day: -3,
      time: "08:00",
      service: "Interior deep clean",
      staff: 1,
      customer: 4,
      attended: false,
    },
    {
      day: -2,
      time: "08:00",
      service: "Full valet",
      extra: ["Headlight restoration"],
      staff: 0,
      customer: 5,
      paid: "card",
      attended: true,
    },
    {
      day: -1,
      time: "13:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 6,
      paid: "cash",
      attended: true,
    },
    {
      day: 0,
      time: "08:00",
      service: "Paint correction",
      variant: "Two stage",
      staff: 0,
      customer: 0,
      payment: "pay_later",
      allDayDays: 2,
      lift: "Leeds station",
      notes: "Customer wants swirl-free bonnet photographed before coating",
    },
    {
      day: 0,
      time: "08:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 7,
      payment: "pay_later",
      paid: "card",
    },
    {
      day: 0,
      time: "10:00",
      service: "Wheels-off detail",
      staff: 1,
      customer: 1,
      payment: "pay_later",
    },
    {
      day: 0,
      time: "13:00",
      service: "Interior deep clean",
      staff: 1,
      customer: 2,
      payment: "none",
    },
    {
      day: 1,
      time: "08:00",
      service: "Full valet",
      extra: ["Headlight restoration"],
      staff: 1,
      customer: 3,
      payment: "none",
      paid: "card",
      notes: "Dog hair in the boot",
    },
    {
      day: 1,
      time: "13:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 4,
      payment: "pay_later",
    },
    {
      day: 2,
      time: "08:00",
      service: "Ceramic coating",
      staff: 0,
      customer: 5,
      payment: "bank_transfer",
      allDayDays: 1,
      lift: "Home — 14 Elm Road",
    },
    {
      day: 2,
      time: "08:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 6,
      payment: "pay_later",
      cancelled: true,
    },
    { day: 2, time: "10:00", service: "Wheels-off detail", staff: 1, customer: 7, payment: "none" },
    { day: 3, time: "08:00", service: "Full valet", staff: 0, customer: 1, payment: "none" },
    {
      day: 3,
      time: "09:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 0,
      payment: "pay_later",
    },
    {
      day: 4,
      time: "08:00",
      service: "Interior deep clean",
      staff: 1,
      customer: 2,
      payment: "pay_later",
    },
    {
      day: 6,
      time: "08:00",
      service: "Paint correction",
      variant: "Single stage",
      staff: 0,
      customer: 4,
      payment: "none",
      allDayDays: 1,
    },
    {
      day: 7,
      time: "08:00",
      service: "Ceramic coating",
      staff: 0,
      customer: 3,
      payment: "bank_transfer",
      allDayDays: 1,
    },
    {
      day: 8,
      time: "09:00",
      service: "Maintenance wash",
      staff: 1,
      customer: 5,
      payment: "pay_later",
    },
  ],
  waitlist: { customer: 6, service: "Ceramic coating", notes: "Any Saturday in the next month" },
  event: { staff: 1, title: "Van MOT", day: 5, from: "08:00", to: "10:00" },
  invoiceFor: 2,
  bankTransfer: {
    accountName: "Prestige Auto Care Ltd",
    sortCode: "040004",
    accountNumber: "87654321",
  },
  cancellationPolicy: [
    "## Cancellations, deposits and late changes",
    "",
    "Please give at least 48 hours' notice to move or cancel a job. Deposits are refundable with 48 hours' notice; inside that window the deposit covers the reserved bay time and products ordered for your vehicle.",
    "",
    "Please arrive within 15 minutes of your drop-off time. Vehicles arriving later may need to be rebooked.",
  ].join("\n"),
  terms: [
    "## Terms and conditions",
    "",
    "Work is carried out by Prestige Auto Care Ltd. Please remove valuables before drop-off and tell us about any existing damage, aftermarket parts or previous coatings. Prices quoted online assume a vehicle in average condition; heavy contamination or pet hair may be charged extra, and we will always agree that with you before starting.",
  ].join("\n"),
  support: {
    subject: "Reminder text for a two-day job",
    body: "When a job runs over two days, does the client get a reminder for each day or just the first?",
  },
};

// ---- Seeding --------------------------------------------------------------------

async function ensureBusiness(api: Api, plan: Plan): Promise<Business> {
  const mine = await api.get<{ businesses: Business[] }>("/api/v1/me/businesses");
  const existing = mine.businesses.find((b) => b.tradingName === plan.tradingName);
  if (existing) {
    log("business", `${existing.tradingName} (exists)`);
    return existing;
  }
  const created = await api.post<{ business: Business }>("/api/v1/businesses", {
    legalName: plan.legalName,
    tradingName: plan.tradingName,
    industryTemplateKey: plan.vertical,
    currency: "GBP",
    defaultTimezone: TZ,
    locale: "en-GB",
  });
  log("business", `${created.business.tradingName} (created)`);
  return created.business;
}

/**
 * The portal keeps a business without a subscription on /billing, and the fake
 * Stripe checkout used locally never completes, so grant the fictional business
 * an active Business plan straight in the local database (owner role). Skipped
 * when GUIDES_DATABASE_URL is not set.
 */
function grantSubscription(businessId: string): string {
  const url = env.GUIDES_DATABASE_URL;
  if (!url) return "skipped (GUIDES_DATABASE_URL not set)";
  if (!/localhost|127\.0\.0\.1/.test(url)) return "skipped (GUIDES_DATABASE_URL is not local)";
  const sql = `
    INSERT INTO business_saas_subscriptions
      (id, business_id, plan_id, plan_version, status, access_state, stripe_customer_id,
       stripe_price_id, current_period_start, current_period_end, entitlements, provider, provider_ref)
    SELECT gen_random_uuid(), '${businessId}', p.id, 'business_v1', 'active', 'entitled',
           'cus_guides_${businessId}', p.stripe_price_id,
           now() - interval '12 days', now() + interval '18 days', '{}'::jsonb, 'stripe',
           'sub_guides_${businessId}'
    FROM saas_plans p WHERE p.code = 'business_month'
    AND NOT EXISTS (
      SELECT 1 FROM business_saas_subscriptions s
      WHERE s.business_id = '${businessId}' AND s.status NOT IN ('cancelled', 'incomplete_expired')
    );
    INSERT INTO active_entitlements (id, business_id, feature_key, lookup_key, active, synced_at)
    SELECT gen_random_uuid(), '${businessId}', 'invoicing', 'recavo_addon_invoicing_gbp_month_v1', true, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM active_entitlements e WHERE e.business_id = '${businessId}' AND e.feature_key = 'invoicing'
    );`;
  const result = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-Atc", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) return `failed (${result.stderr.trim()})`;
  const inserted = (result.stdout.match(/INSERT 0 1/g) ?? []).length;
  return inserted > 0 ? "Business plan (active) + invoicing add-on" : "already present";
}

async function seed(plan: Plan): Promise<void> {
  console.log(`\n${plan.tradingName} (${plan.vertical})`);
  const session = await signIn(env, emailFor(env, plan.vertical));
  const api = new Api(env.API_BASE_URL, session.accessToken);

  await api.patch("/api/v1/me", { name: plan.ownerName, timezone: TZ, locale: "en-GB" });
  const business = await ensureBusiness(api, plan);
  const B = `/api/v1/businesses/${business.id}`;
  log("subscription", grantSubscription(business.id));

  if (business.slug !== plan.slug) {
    try {
      await api.patch(B, { slug: plan.slug }, { ifMatch: business.version });
      log("slug", plan.slug);
    } catch (err) {
      log("slug", `skipped (${(err as Error).message})`);
    }
  }

  await api.patch(`${B}/configuration`, {
    bankTransfer: { enabled: true, ...plan.bankTransfer },
    invoicing: { numberPrefix: "INV-", dueDays: 14 },
    reminders: {
      rules: [
        { minutesBefore: 24 * 60, channel: "preferred" },
        { minutesBefore: 120, channel: "sms" },
      ],
    },
    legalAddress: {
      line1: plan.location.name,
      city: "Leeds",
      postalCode: "LS1 4AP",
      country: "GB",
    },
  });
  log("configuration", "bank transfer, reminders, invoicing");

  // Location
  const locations = await api.get<{ locations: Location[] }>(`${B}/locations`);
  let location = locations.locations.find((l) => l.name === plan.location.name);
  if (!location) {
    location = (
      await api.post<{ location: Location }>(`${B}/locations`, {
        name: plan.location.name,
        type: plan.location.type,
        timezone: TZ,
        openingHours: plan.location.hours.map(([dayOfWeek, openMinute, closeMinute]) => ({
          dayOfWeek,
          openMinute,
          closeMinute,
        })),
        publicVisible: true,
      })
    ).location;
  }
  log("location", location.name);

  // Services (staff eligibility is set after staff exist)
  const existingServices = await api.get<{ services: Service[] }>(`${B}/services`);
  const services = new Map<string, Service>();
  for (const s of plan.services) {
    let svc = existingServices.services.find((x) => x.name === s.name);
    if (!svc) {
      svc = (
        await api.post<{ service: Service }>(`${B}/services`, {
          name: s.name,
          description: s.description,
          category: s.category ?? null,
          durationMinutes: s.minutes,
          basePriceMinor: s.price,
          currency: "GBP",
          depositMinor: s.deposit ?? null,
          bookingMode: s.bookingMode ?? "individual",
          capacityMax: s.capacityMax ?? 1,
          locationIds: [location.id],
          publicVisible: true,
          colour: s.colour ?? null,
          bookingNoticeMinutes: 0,
          bookingHorizonDays: 180,
          variants: s.variants?.map((v) => ({
            name: v.name,
            durationMinutes: v.minutes ?? null,
            priceMinor: v.price ?? null,
          })),
          ...(s.followUp
            ? {
                followUp: {
                  intervalMonths: s.followUp.intervalMonths,
                  leadDays: 30,
                  label: s.followUp.label,
                },
              }
            : {}),
        })
      ).service;
    }
    services.set(s.name, svc);
  }
  log("services", `${services.size}`);

  // Staff
  const existingStaff = await api.get<{ staff: Staff[] }>(`${B}/staff`);
  const staff: Staff[] = [];
  for (const [i, s] of plan.staff.entries()) {
    let member = existingStaff.staff.find((x) => x.displayName === s.name);
    const body = {
      displayName: s.name,
      title: s.title,
      locationIds: [location.id],
      eligibleServiceIds: [...services.values()].map((x) => x.id),
      workingRules: s.hours.map(([dayOfWeek, startMinute, endMinute]) => ({
        dayOfWeek,
        startMinute,
        endMinute,
        locationId: location.id,
      })),
      bookingVisible: true,
      calendarColour: s.colour,
    };
    if (!member) {
      member = (
        await api.post<{ staff: Staff }>(
          `${B}/staff`,
          i === 0 ? { ...body, userId: undefined } : body,
        )
      ).staff;
    } else {
      member = (
        await api.patch<{ staff: Staff }>(`${B}/staff/${member.id}`, body, {
          ifMatch: member.version,
        })
      ).staff;
    }
    staff.push(member);
  }
  // The owner is the first staff member.
  const me = await api.get<{ user: { id: string } }>("/api/v1/me");
  if (staff[0]!.userId !== me.user.id) {
    try {
      staff[0] = (
        await api.patch<{ staff: Staff }>(
          `${B}/staff/${staff[0]!.id}`,
          { userId: me.user.id },
          { ifMatch: staff[0]!.version },
        )
      ).staff;
    } catch (err) {
      log("staff link", `skipped (${(err as Error).message})`);
    }
  }
  log("staff", staff.map((s) => s.displayName).join(", "));

  // Consumables (automotive)
  if (plan.consumables) {
    const existing = await api.get<{ consumables: Consumable[] }>(`${B}/consumables`);
    const byName = new Map<string, Consumable>();
    for (const c of plan.consumables) {
      let item = existing.consumables.find((x) => x.name === c.name);
      if (!item) {
        item = (
          await api.post<{ consumable: Consumable }>(`${B}/consumables`, {
            name: c.name,
            unit: c.unit,
            unitCostMinor: c.unitCost,
            currency: "GBP",
          })
        ).consumable;
      }
      byName.set(c.name, item);
    }
    for (const s of plan.services) {
      if (!s.consumables) continue;
      await api.put(`${B}/services/${services.get(s.name)!.id}/consumables`, {
        items: s.consumables.map((c) => ({
          consumableId: byName.get(c.name)!.id,
          quantity: c.quantity,
        })),
      });
    }
    log("consumables", `${byName.size}`);
  }

  // Packages (PT)
  const packages: Pkg[] = [];
  if (plan.packages) {
    const existing = await api.get<{ packages: Pkg[] }>(`${B}/packages`);
    for (const p of plan.packages) {
      let pkg = existing.packages.find((x) => x.name === p.name);
      if (!pkg) {
        pkg = (
          await api.post<{ package: Pkg }>(`${B}/packages`, {
            name: p.name,
            description: p.description,
            priceMinor: p.price,
            currency: "GBP",
            creditsIssued: p.credits,
            eligibleServiceIds: [services.get("Personal training session")!.id],
            validity: { kind: "calendar_months", amount: p.months },
            salesAvailable: true,
          })
        ).package;
      }
      packages.push(pkg);
    }
    log("packages", packages.map((p) => p.name).join(", "));
  }

  // The vehicle schema is provisioned asynchronously (outbox) after signup —
  // wait for it, and fall back to applying the template ourselves.
  if (plan.customers.some((c) => c.vehicle)) {
    let ready = false;
    for (let attempt = 0; attempt < 10 && !ready; attempt++) {
      const def = await api.get<{ definition: unknown | null }>(`${B}/linked-record-definition`);
      ready = def.definition !== null;
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) {
      await api.post(`${B}/linked-record-definition/apply-template`, { templateKey: "vehicle" });
      log("vehicles", "applied vehicle template");
    }
  }

  // Customers (+ vehicles)
  const existingCustomers = await api.get<{ items: Customer[] }>(`${B}/customers`, {
    limit: "100",
  });
  const customers: Customer[] = [];
  const vehicles: (LinkedRecord | null)[] = [];
  for (const c of plan.customers) {
    let cust = existingCustomers.items.find(
      (x) => x.emailNormalised?.toLowerCase() === c.email.toLowerCase(),
    );
    if (!cust) {
      cust = (
        await api.post<{ customer: Customer }>(`${B}/customers`, {
          firstName: c.first,
          lastName: c.last,
          email: c.email,
          phone: c.phone,
          preferredChannel: "sms",
          operationalNotifications: true,
          marketingConsent: false,
          tags: c.tags ?? [],
          createdSource: "staff",
        })
      ).customer;
    }
    customers.push(cust);
    if (c.vehicle) {
      const records = await api.get<{ records: LinkedRecord[] }>(
        `${B}/customers/${cust.id}/linked-records`,
      );
      let rec = records.records.find((r) => r.values?.registration === c.vehicle!.registration);
      if (!rec) {
        rec = (
          await api.post<{ record: LinkedRecord }>(`${B}/customers/${cust.id}/linked-records`, {
            displayLabel: `${c.vehicle.make} ${c.vehicle.model} · ${c.vehicle.registration}`,
            values: {
              registration: c.vehicle.registration,
              make: c.vehicle.make,
              model: c.vehicle.model,
              year: c.vehicle.year,
              colour: c.vehicle.colour,
            },
          })
        ).record;
      }
      vehicles.push(rec);
    } else {
      vehicles.push(null);
    }
  }
  log("customers", `${customers.length}${plan.customers[0]?.vehicle ? " with vehicles" : ""}`);

  // A package credit for one PT client, so "use credit" has something to use.
  if (packages.length > 0) {
    const credits = await api.get<{ credits: unknown[] }>(
      `${B}/customers/${customers[0]!.id}/credits`,
    );
    if (credits.credits.length === 0) {
      await api.post(`${B}/package-purchases`, {
        customerId: customers[0]!.id,
        packageId: packages[0]!.id,
        paymentRef: "seed-cash-001",
        providerEventId: `seed-${customers[0]!.id}`,
      });
      log("package purchase", `${customers[0]!.firstName} → ${packages[0]!.name}`);
    }
  }

  // Bookings — only once, so re-running the seed doesn't double the diary.
  const today = todayIso();
  const from = addDays(today, -8);
  const to = addDays(today, 12);
  const existingBookings = await api.get<{ bookings: Booking[] }>(`${B}/bookings`, {
    from: at(from, "00:00"),
    to: at(to, "00:00"),
    limit: "200",
  });
  if (existingBookings.bookings.length > 0) {
    log("bookings", `${existingBookings.bookings.length} already in the diary — skipped`);
  } else {
    const now = Date.now();
    let made = 0;
    let firstCompleted: Booking | null = null;
    const madeBookings: Booking[] = [];
    for (const [i, b] of plan.bookings.entries()) {
      const svc = services.get(b.service)!;
      const variant = b.variant ? svc.variants?.find((v) => v.name === b.variant) : undefined;
      const date = addDays(today, b.day);
      // Keep every job on a working day (Sunday rolls to Monday).
      const day = weekday(date) === 7 ? addDays(date, 1) : date;
      const start = at(day, b.time);
      const minutes =
        (variant &&
          plan.services
            .find((s) => s.name === b.service)
            ?.variants?.find((v) => v.name === b.variant)?.minutes) ||
        svc.durationMinutes;
      const inPast = new Date(start).getTime() < now + 60 * 60_000;
      const cust = customers[b.customer]!;
      const body: Record<string, unknown> = {
        serviceId: svc.id,
        variantId: variant?.id ?? null,
        additionalServices: (b.extra ?? []).map((name) => ({ serviceId: services.get(name)!.id })),
        locationId: location.id,
        staffId: staff[b.staff]!.id,
        start,
        leadCustomerId: cust.id,
        linkedRecordId: vehicles[b.customer]?.id ?? null,
        paymentMethod: b.payment ?? "pay_later",
        notesInternal: b.notes ?? null,
        notifyCustomer: false,
        source: "staff",
        ...(b.allDayDays
          ? { allDay: true, end: at(addDays(day, b.allDayDays), "00:00") }
          : inPast
            ? { end: plusMinutes(start, minutes) }
            : {}),
        ...(b.lift ? { clientLift: { destination: b.lift } } : {}),
      };
      try {
        let booking = (await api.post<{ booking: Booking }>(`${B}/bookings`, body)).booking;
        made += 1;
        if (b.paid) {
          booking = (
            await api.post<{ booking: Booking }>(`${B}/bookings/${booking.id}/record-payment`, {
              method: b.paid,
            })
          ).booking;
        }
        if (b.cancelled) {
          booking = (
            await api.post<{ booking: Booking }>(`${B}/bookings/${booking.id}/cancel`, {
              by: "customer",
              reason: "Client asked to move it",
              notifyCustomer: false,
            })
          ).booking;
        } else if (b.attended !== undefined && inPast) {
          try {
            booking = (
              await api.post<{ booking: Booking }>(`${B}/bookings/${booking.id}/attendance`, {
                attended: b.attended,
              })
            ).booking;
            if (b.attended && !firstCompleted && i === plan.invoiceFor) firstCompleted = booking;
          } catch (err) {
            log(
              `attendance ${booking.reference}`,
              `skipped (${(err as Error).message.slice(0, 80)})`,
            );
          }
        }
        madeBookings.push(booking);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        log(`booking ${b.service} d${b.day}`, `FAILED ${msg.slice(0, 120)}`);
      }
    }
    log("bookings", `${made} created`);

    // An invoice for one completed job.
    const target =
      firstCompleted ??
      madeBookings.find((x) => x.status === "completed" || x.status === "attended");
    if (target) {
      try {
        const inv = await api.post<{ invoice: Id & { number?: string } }>(`${B}/invoices`, {
          bookingId: target.id,
        });
        await api.post(`${B}/invoices/${inv.invoice.id}/issue`, { send: false });
        log("invoice", `issued for ${target.reference}`);
      } catch (err) {
        log("invoice", `skipped (${(err as Error).message.slice(0, 100)})`);
      }
    }
  }

  // Waitlist
  if (plan.waitlist) {
    const wl = await api.get<{ entries: unknown[] } | { items: unknown[] }>(`${B}/waitlist`);
    const count = ("entries" in wl ? wl.entries : ((wl as { items: unknown[] }).items ?? []))
      .length;
    if (count === 0) {
      await api.post(`${B}/waitlist`, {
        customerId: customers[plan.waitlist.customer]!.id,
        serviceId: services.get(plan.waitlist.service)!.id,
        locationId: location.id,
        preferences: { from: today, to: addDays(today, 30), timeOfDay: "morning" },
        notes: plan.waitlist.notes,
        priority: "normal",
      });
      log("waitlist", "1 entry");
    }
  }

  // Event (calendar block)
  if (plan.event) {
    const day = addDays(today, plan.event.day);
    const blocks = await api.get<{ blocks: { title: string }[] }>(`${B}/calendar-blocks`, {
      from: at(from, "00:00"),
      to: at(to, "00:00"),
    });
    if (!blocks.blocks.some((x) => x.title === plan.event!.title)) {
      await api.post(`${B}/calendar-blocks`, {
        staffId: staff[plan.event.staff]!.id,
        locationId: location.id,
        title: plan.event.title,
        start: at(day, plan.event.from),
        end: at(day, plan.event.to),
      });
      log("event", plan.event.title);
    }
  }

  // Time off for the second staff member next week.
  try {
    const off = addDays(today, 9);
    const fresh = (
      await api.get<{ staff: Staff & { timeOff?: unknown[] } }>(`${B}/staff/${staff[1]!.id}`)
    ).staff;
    if ((fresh.timeOff?.length ?? 0) === 0) {
      await api.post(
        `${B}/staff/${staff[1]!.id}/time-off`,
        {
          start: at(off, "00:00"),
          end: at(addDays(off, 1), "00:00"),
          originatingTimezone: TZ,
          reason: "Holiday",
        },
        { ifMatch: fresh.version },
      );
      log("time off", `${staff[1]!.displayName} on ${off}`);
    }
  } catch (err) {
    log("time off", `skipped (${(err as Error).message})`);
  }

  // Published cancellation terms and T&Cs (together they complete the last setup step).
  for (const [type, content] of [
    ["cancellation", plan.cancellationPolicy],
    ["terms", plan.terms],
  ] as const) {
    const existing = await api.get<{ documents: { type: string; status: string }[] }>(
      `${B}/policy-documents`,
      { type },
    );
    if (!existing.documents.some((d) => d.status === "published")) {
      await api.post(`${B}/policy-documents`, { type, content, publish: true });
      log("policy", `${type} published`);
    }
  }

  // A support thread so the Support screenshots aren't empty.
  if (plan.support) {
    const existing = await api.get<{ requests: { subject: string }[] }>(`${B}/support-requests`);
    if (!existing.requests.some((r) => r.subject === plan.support!.subject)) {
      await api.post(`${B}/support-requests`, { category: "question", ...plan.support });
      log("support request", plan.support.subject);
    }
  }

  // A conversation so Messages has history.
  try {
    const convs = await api.get<{ conversations: { id: string; customerId: string }[] }>(
      `${B}/conversations`,
    );
    if (convs.conversations.length === 0) {
      const conv = await api.post<{ conversation: Id }>(`${B}/conversations`, {
        customerId: customers[0]!.id,
      });
      await api.post(`${B}/conversations/${conv.conversation.id}/messages`, {
        body:
          plan.vertical === "car_detailing"
            ? "Hi Oliver — the car's ready for collection whenever suits. We're open until 6."
            : "Hi Hannah — great session today. Remember to stretch tonight and I'll see you Thursday.",
      });
      log("conversation", "1 message");
    }
  } catch (err) {
    log("conversation", `skipped (${(err as Error).message.slice(0, 80)})`);
  }

  console.log(`  ✓ ${plan.tradingName} ready`);
}

const plans = [PT, AUTO].filter((p) => !only || p.vertical === only);
for (const plan of plans) {
  await seed(plan);
}
