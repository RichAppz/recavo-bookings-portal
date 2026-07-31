import type {
  BlockedTime,
  Booking,
  Client,
  ClientPackage,
  Conversation,
  CustomRecord,
  LedgerEntry,
  Location,
  PackageDef,
  Payment,
  Service,
  Staff,
} from "./demo-data";
import { DETAILING_JOB_STATUSES } from "./demo-data";
import type { IndustryDataset } from "./industry";
import { addDays, demoToday, isoDate } from "./format";

const T = demoToday();
const d = (o: number) => isoDate(addDays(T, o));

const staff: Staff[] = [
  {
    id: "s1",
    name: "Ryan Cole",
    role: "Owner and Lead Detailer",
    email: "ryan@apexdetailing.co.uk",
    phone: "07700 900311",
    avatar: "https://i.pravatar.cc/160?img=11",
    locations: ["l1", "l2"],
    services: ["sv1", "sv2", "sv3", "sv4", "sv6"],
    weeklyBookings: 11,
    revenue: 4260,
    availabilityComplete: true,
    permission: "Business owner",
    bio: "IDA-certified paint correction and ceramic coating specialist.",
    colour: "var(--color-chart-1)",
  },
  {
    id: "s2",
    name: "Priya Shah",
    role: "Senior Detailer",
    email: "priya@apexdetailing.co.uk",
    phone: "07700 900322",
    avatar: "https://i.pravatar.cc/160?img=32",
    locations: ["l1"],
    services: ["sv1", "sv3", "sv4"],
    weeklyBookings: 9,
    revenue: 2740,
    availabilityComplete: true,
    permission: "Detailer",
    bio: "Interior restoration, leather care and odour removal.",
    colour: "var(--color-chart-2)",
  },
  {
    id: "s3",
    name: "Tom Brennan",
    role: "Mobile Detailer",
    email: "tom@apexdetailing.co.uk",
    phone: "07700 900333",
    avatar: "https://i.pravatar.cc/160?img=54",
    locations: ["l2"],
    services: ["sv1", "sv5"],
    weeklyBookings: 13,
    revenue: 1980,
    availabilityComplete: true,
    permission: "Detailer",
    bio: "Runs the mobile van across Greater Manchester and Cheshire.",
    colour: "var(--color-chart-4)",
  },
  {
    id: "s4",
    name: "Jade Miller",
    role: "Valeter and Prep",
    email: "jade@apexdetailing.co.uk",
    phone: "07700 900344",
    avatar: "https://i.pravatar.cc/160?img=26",
    locations: ["l1"],
    services: ["sv1", "sv4"],
    weeklyBookings: 15,
    revenue: 1420,
    availabilityComplete: false,
    permission: "Restricted",
    bio: "Decontamination, wheels and prep work ahead of correction jobs.",
    colour: "var(--color-chart-5)",
  },
];

const locations: Location[] = [
  {
    id: "l1",
    name: "Apex Studio — Trafford Park",
    address: "Unit 7, Ashburton Road",
    city: "Manchester",
    postcode: "M17 1RY",
    openingHours: "08:00 – 18:00 Mon–Fri · 09:00 – 15:00 Sat",
    staff: ["s1", "s2", "s4"],
    services: ["sv1", "sv2", "sv3", "sv4", "sv6"],
    monthlyBookings: 48,
    revenue: 9840,
    active: true,
  },
  {
    id: "l2",
    name: "Mobile service — Greater Manchester",
    address: "Customer address within 20 miles",
    city: "Manchester",
    postcode: "Mobile",
    openingHours: "08:00 – 17:00 Mon–Sat",
    staff: ["s1", "s3"],
    services: ["sv1", "sv5"],
    monthlyBookings: 26,
    revenue: 3120,
    active: true,
  },
];

const services: Service[] = [
  {
    id: "sv1",
    name: "Maintenance Detail",
    description: "Safe wash, decontamination, sealant top-up and interior tidy.",
    duration: 150,
    price: 75,
    capacity: 1,
    staff: ["s1", "s2", "s3", "s4"],
    locations: ["l1", "l2"],
    bookingNotice: "24 hours",
    cancellationPeriod: "48 hours",
    buffer: "30 minutes",
    active: true,
    colour: "var(--color-chart-1)",
    pricingModel: "by_record_size",
    sizePricing: { Small: 65, Medium: 75, Large: 95, "Extra Large": 115 },
    paymentRule: "full",
    place: "business",
  },
  {
    id: "sv2",
    name: "Full Paint Correction",
    description: "Two-stage machine polish removing swirls and light scratches.",
    duration: 480,
    price: 450,
    capacity: 1,
    staff: ["s1"],
    locations: ["l1"],
    bookingNotice: "5 days",
    cancellationPeriod: "72 hours",
    buffer: "60 minutes",
    active: true,
    colour: "var(--color-chart-3)",
    pricingModel: "from",
    deposit: 100,
    paymentRule: "deposit",
    place: "business",
  },
  {
    id: "sv3",
    name: "Ceramic Coating — 5 Year",
    description: "Full prep, correction and a five-year warranted ceramic coating.",
    duration: 720,
    price: 850,
    capacity: 1,
    staff: ["s1", "s2"],
    locations: ["l1"],
    bookingNotice: "7 days",
    cancellationPeriod: "72 hours",
    buffer: "60 minutes",
    active: true,
    colour: "var(--color-chart-4)",
    pricingModel: "by_record_size",
    sizePricing: { Small: 750, Medium: 850, Large: 995, "Extra Large": 1150 },
    deposit: 200,
    paymentRule: "deposit",
    place: "business",
  },
  {
    id: "sv4",
    name: "Interior Deep Clean",
    description: "Steam clean, extraction, leather feed and full odour treatment.",
    duration: 210,
    price: 140,
    capacity: 1,
    staff: ["s1", "s2", "s4"],
    locations: ["l1"],
    bookingNotice: "48 hours",
    cancellationPeriod: "48 hours",
    buffer: "30 minutes",
    active: true,
    colour: "var(--color-chart-2)",
    pricingModel: "by_record_size",
    sizePricing: { Small: 120, Medium: 140, Large: 170, "Extra Large": 195 },
    paymentRule: "full",
    place: "business",
  },
  {
    id: "sv5",
    name: "Mobile Wash and Wax",
    description: "We come to you — safe wash, wheels, glass and spray wax.",
    duration: 90,
    price: 55,
    capacity: 1,
    staff: ["s1", "s3"],
    locations: ["l2"],
    bookingNotice: "24 hours",
    cancellationPeriod: "24 hours",
    buffer: "45 minutes",
    active: true,
    colour: "var(--color-chart-5)",
    pricingModel: "fixed",
    paymentRule: "full",
    place: "customer",
    travelFee: 12,
  },
  {
    id: "sv6",
    name: "Alloy Wheel Refurbishment",
    description: "Off-car refurb, priced after inspection of kerb damage.",
    duration: 300,
    price: 320,
    capacity: 1,
    staff: ["s1"],
    locations: ["l1"],
    bookingNotice: "7 days",
    cancellationPeriod: "72 hours",
    buffer: "60 minutes",
    active: true,
    colour: "var(--color-chart-3)",
    pricingModel: "quote",
    deposit: 80,
    paymentRule: "deposit",
    place: "business",
  },
];

const packageDefs: PackageDef[] = [
  { id: "p1", name: "Maintenance Plan — 4 visits", price: 260, credits: 4, validity: "4 months", eligibleServices: ["sv1"], sold: 26, revenue: 6760, active: true },
  { id: "p2", name: "Maintenance Plan — 12 visits", price: 720, credits: 12, validity: "12 months", eligibleServices: ["sv1", "sv5"], sold: 11, revenue: 7920, active: true },
  { id: "p3", name: "Mobile Wash Bundle", price: 200, credits: 4, validity: "4 months", eligibleServices: ["sv5"], sold: 19, revenue: 3800, active: true },
  { id: "p4", name: "Coating Aftercare Plan", price: 340, credits: 4, validity: "12 months", eligibleServices: ["sv1", "sv4"], sold: 8, revenue: 2720, active: true },
];

const clientSeed: [string, string, number, number, number, string, string][] = [
  ["Daniel Frost", "img=12", 1, 1840, 11, "Trafford", "Collection and delivery"],
  ["Aisha Rahman", "img=44", 2, 2650, 14, "Didsbury", "Waits on site"],
  ["Michael Doyle", "img=51", 3, 980, 6, "Altrincham", "Mobile only"],
  ["Hannah Price", "img=25", 4, 3120, 9, "Wilmslow", "Key safe on the wall"],
  ["Ollie Bright", "img=15", 5, 420, 3, "Salford", "Text on arrival"],
  ["Grace Kimani", "img=41", 6, 1560, 8, "Stockport", "Second vehicle usually booked together"],
  ["Peter Novak", "img=60", 7, 745, 4, "Chorlton", "Fleet invoice at month end"],
  ["Laura Sinclair", "img=49", 8, 2280, 10, "Hale", "Coating warranty customer"],
];

const clients: Client[] = clientSeed.map(([name, img, i, spend, count, area, note]) => ({
  id: `c${i}`,
  name,
  email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.co.uk`,
  phone: `07700 8${(100000 + i * 6421).toString().slice(0, 5)}`,
  avatar: `https://i.pravatar.cc/160?${img}`,
  joined: d(-(40 + i * 31)),
  status: i === 5 ? "inactive" : "active",
  lifetimeSpend: spend,
  totalBookings: count,
  attendanceRate: 96,
  address: `${area}, Manchester`,
  fields: {
    "cf-area": area,
    "cf-access": note,
    "cf-source": i % 3 === 0 ? "Instagram" : i % 3 === 1 ? "Google" : "Referral",
  },
  notes:
    i === 1
      ? [{ id: "n1", date: d(-9), author: "Ryan Cole", body: "Front bumper has existing stone chips — photographed at check-in." }]
      : [],
}));

const records: CustomRecord[] = [
  { id: "v1", clientId: "c1", title: "BMW M340i", subtitle: "MA71 XKD · Tanzanite Blue", sizeCategory: "Medium", lastVisit: d(-28), lifetimeSpend: 1840, status: "active", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=640&q=60", values: { registration: "MA71 XKD", make: "BMW", model: "M340i", year: "2021", colour: "Tanzanite Blue", type: "Saloon", size: "Medium", fuel: "Petrol", condition: "Light swirls on bonnet", products: "Gyeon Q2 One", damage: "Stone chips on front bumper" } },
  { id: "v2", clientId: "c1", title: "Volkswagen Transporter", subtitle: "MJ19 TRV · Reflex Silver", sizeCategory: "Extra Large", lastVisit: d(-61), lifetimeSpend: 420, status: "active", values: { registration: "MJ19 TRV", make: "Volkswagen", model: "Transporter T6", year: "2019", colour: "Reflex Silver", type: "Van", size: "Extra Large", fuel: "Diesel", condition: "Work van — heavy soiling", products: "Sealant only", damage: "Rear door dent" } },
  { id: "v3", clientId: "c2", title: "Tesla Model 3", subtitle: "MD22 ELC · Pearl White", sizeCategory: "Medium", lastVisit: d(-12), lifetimeSpend: 2650, status: "active", image: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=640&q=60", values: { registration: "MD22 ELC", make: "Tesla", model: "Model 3 Performance", year: "2022", colour: "Pearl White", type: "Saloon", size: "Medium", fuel: "Electric", condition: "Ceramic coated Jan", products: "Coating-safe shampoo only", damage: "None recorded" } },
  { id: "v4", clientId: "c3", title: "Ford Ranger Wildtrak", subtitle: "MK20 RNG · Sea Grey", sizeCategory: "Extra Large", lastVisit: d(-40), lifetimeSpend: 980, status: "active", values: { registration: "MK20 RNG", make: "Ford", model: "Ranger Wildtrak", year: "2020", colour: "Sea Grey", type: "Pick-up", size: "Extra Large", fuel: "Diesel", condition: "Farm use, heavy mud", products: "Any", damage: "Load bed scratches" } },
  { id: "v5", clientId: "c4", title: "Porsche 911 Carrera", subtitle: "HP68 POR · Guards Red", sizeCategory: "Small", lastVisit: d(-5), lifetimeSpend: 3120, status: "active", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=640&q=60", values: { registration: "HP68 POR", make: "Porsche", model: "911 Carrera S", year: "2018", colour: "Guards Red", type: "Coupe", size: "Small", fuel: "Petrol", condition: "Show condition", products: "Gtechniq Crystal Serum", damage: "None recorded" } },
  { id: "v6", clientId: "c5", title: "Vauxhall Corsa", subtitle: "MV16 CRS · Summit White", sizeCategory: "Small", lastVisit: d(-92), lifetimeSpend: 420, status: "inactive", values: { registration: "MV16 CRS", make: "Vauxhall", model: "Corsa SRi", year: "2016", colour: "Summit White", type: "Hatchback", size: "Small", fuel: "Petrol", condition: "Daily driver", products: "Any", damage: "Kerbed nearside wheels" } },
  { id: "v7", clientId: "c6", title: "Range Rover Evoque", subtitle: "MA70 EVQ · Santorini Black", sizeCategory: "Large", lastVisit: d(-18), lifetimeSpend: 1180, status: "active", values: { registration: "MA70 EVQ", make: "Land Rover", model: "Range Rover Evoque", year: "2020", colour: "Santorini Black", type: "SUV", size: "Large", fuel: "Hybrid", condition: "Dog hair in boot", products: "Odour treatment requested", damage: "Light scuff on rear arch" } },
  { id: "v8", clientId: "c6", title: "Mini Cooper S", subtitle: "MF19 MIN · Chili Red", sizeCategory: "Small", lastVisit: d(-18), lifetimeSpend: 380, status: "active", values: { registration: "MF19 MIN", make: "Mini", model: "Cooper S", year: "2019", colour: "Chili Red", type: "Hatchback", size: "Small", fuel: "Petrol", condition: "Good", products: "Any", damage: "None recorded" } },
  { id: "v9", clientId: "c7", title: "Mercedes Sprinter", subtitle: "MP21 SPR · Arctic White", sizeCategory: "Extra Large", lastVisit: d(-33), lifetimeSpend: 745, status: "active", values: { registration: "MP21 SPR", make: "Mercedes-Benz", model: "Sprinter 314", year: "2021", colour: "Arctic White", type: "Van", size: "Extra Large", fuel: "Diesel", condition: "Fleet vehicle 3 of 6", products: "Any", damage: "Signwriting — no polish on decals" } },
  { id: "v10", clientId: "c8", title: "Audi RS6 Avant", subtitle: "MB72 RS6 · Nardo Grey", sizeCategory: "Large", lastVisit: d(-2), lifetimeSpend: 2280, status: "active", image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=640&q=60", values: { registration: "MB72 RS6", make: "Audi", model: "RS6 Avant", year: "2022", colour: "Nardo Grey", type: "Estate", size: "Large", fuel: "Petrol", condition: "5-year coating applied", products: "Coating-safe shampoo only", damage: "None recorded" } },
];

interface JobSeed {
  n: number;
  date: number;
  time: string;
  serviceId: string;
  staffId: string;
  locationId: string;
  clientId: string;
  recordId: string;
  status: Booking["status"];
  jobStatus: string;
  paymentStatus: Booking["paymentStatus"];
  paymentMethod: Booking["paymentMethod"];
  amount: number;
  deposit?: number;
  mobile?: boolean;
  resource?: string;
  instructions?: string;
}

const jobSeeds: JobSeed[] = [
  { n: 1, date: 0, time: "08:00", serviceId: "sv3", staffId: "s1", locationId: "l1", clientId: "c8", recordId: "v10", status: "confirmed", jobStatus: "in_progress", paymentStatus: "pending", paymentMethod: "Card", amount: 995, deposit: 200, resource: "Detailing Bay", instructions: "Coating cure overnight — collection tomorrow after 12:00." },
  { n: 2, date: 0, time: "08:30", serviceId: "sv4", staffId: "s2", locationId: "l1", clientId: "c6", recordId: "v7", status: "confirmed", jobStatus: "inspection_complete", paymentStatus: "pending", paymentMethod: "Card", amount: 170, resource: "Bay 2", instructions: "Heavy dog hair in the boot — odour treatment agreed." },
  { n: 3, date: 0, time: "09:00", serviceId: "sv5", staffId: "s3", locationId: "l2", clientId: "c3", recordId: "v4", status: "confirmed", jobStatus: "in_progress", paymentStatus: "paid", paymentMethod: "Card", amount: 67, mobile: true, resource: "Mobile van", instructions: "Farm track access — park on the hard standing by the barn." },
  { n: 4, date: 0, time: "11:00", serviceId: "sv1", staffId: "s4", locationId: "l1", clientId: "c1", recordId: "v1", status: "confirmed", jobStatus: "checked_in", paymentStatus: "paid", paymentMethod: "Package credit", amount: 75, resource: "Bay 1" },
  { n: 5, date: 0, time: "13:00", serviceId: "sv5", staffId: "s3", locationId: "l2", clientId: "c4", recordId: "v5", status: "confirmed", jobStatus: "booked", paymentStatus: "paid", paymentMethod: "Card", amount: 67, mobile: true, resource: "Mobile van", instructions: "Garage code 4471. Car is on the left." },
  { n: 6, date: 0, time: "14:00", serviceId: "sv1", staffId: "s2", locationId: "l1", clientId: "c2", recordId: "v3", status: "confirmed", jobStatus: "quality_check", paymentStatus: "paid", paymentMethod: "Card", amount: 75, resource: "Bay 2" },
  { n: 7, date: 0, time: "15:30", serviceId: "sv1", staffId: "s4", locationId: "l1", clientId: "c7", recordId: "v9", status: "confirmed", jobStatus: "ready_for_collection", paymentStatus: "pending", paymentMethod: "Cash", amount: 115, resource: "Bay 1", instructions: "Fleet invoice — do not take payment on site." },
  { n: 8, date: 1, time: "08:00", serviceId: "sv2", staffId: "s1", locationId: "l1", clientId: "c4", recordId: "v5", status: "confirmed", jobStatus: "booked", paymentStatus: "pending", paymentMethod: "Card", amount: 620, deposit: 100, resource: "Detailing Bay" },
  { n: 9, date: 1, time: "09:30", serviceId: "sv1", staffId: "s2", locationId: "l1", clientId: "c6", recordId: "v8", status: "confirmed", jobStatus: "booked", paymentStatus: "paid", paymentMethod: "Package credit", amount: 65, resource: "Bay 2" },
  { n: 10, date: 1, time: "12:00", serviceId: "sv5", staffId: "s3", locationId: "l2", clientId: "c1", recordId: "v2", status: "confirmed", jobStatus: "booked", paymentStatus: "pending", paymentMethod: "Card", amount: 67, mobile: true, resource: "Mobile van" },
  { n: 11, date: 2, time: "08:00", serviceId: "sv6", staffId: "s1", locationId: "l1", clientId: "c5", recordId: "v6", status: "awaiting_payment", jobStatus: "booked", paymentStatus: "pending", paymentMethod: "Card", amount: 320, deposit: 80, resource: "Detailing Bay", instructions: "Quote to be confirmed after inspection of all four wheels." },
  { n: 12, date: 2, time: "10:00", serviceId: "sv4", staffId: "s2", locationId: "l1", clientId: "c3", recordId: "v4", status: "confirmed", jobStatus: "booked", paymentStatus: "paid", paymentMethod: "Card", amount: 195, resource: "Bay 2" },
  { n: 13, date: 3, time: "08:00", serviceId: "sv3", staffId: "s1", locationId: "l1", clientId: "c2", recordId: "v3", status: "confirmed", jobStatus: "booked", paymentStatus: "pending", paymentMethod: "Card", amount: 850, deposit: 200, resource: "Detailing Bay" },
  { n: 14, date: 3, time: "13:00", serviceId: "sv1", staffId: "s4", locationId: "l1", clientId: "c8", recordId: "v10", status: "confirmed", jobStatus: "booked", paymentStatus: "paid", paymentMethod: "Package credit", amount: 95, resource: "Bay 1" },
  { n: 15, date: 4, time: "09:00", serviceId: "sv5", staffId: "s3", locationId: "l2", clientId: "c7", recordId: "v9", status: "confirmed", jobStatus: "booked", paymentStatus: "pending", paymentMethod: "Card", amount: 67, mobile: true, resource: "Mobile van" },
  { n: 16, date: 5, time: "08:30", serviceId: "sv1", staffId: "s2", locationId: "l1", clientId: "c4", recordId: "v5", status: "confirmed", jobStatus: "booked", paymentStatus: "paid", paymentMethod: "Card", amount: 65, resource: "Bay 2" },
  { n: 17, date: -1, time: "08:00", serviceId: "sv1", staffId: "s4", locationId: "l1", clientId: "c8", recordId: "v10", status: "completed", jobStatus: "completed", paymentStatus: "paid", paymentMethod: "Card", amount: 95, resource: "Bay 1" },
  { n: 18, date: -2, time: "08:00", serviceId: "sv2", staffId: "s1", locationId: "l1", clientId: "c1", recordId: "v1", status: "completed", jobStatus: "completed", paymentStatus: "paid", paymentMethod: "Card", amount: 540, deposit: 100, resource: "Detailing Bay" },
  { n: 19, date: -3, time: "10:00", serviceId: "sv5", staffId: "s3", locationId: "l2", clientId: "c3", recordId: "v4", status: "completed", jobStatus: "completed", paymentStatus: "paid", paymentMethod: "Card", amount: 67, mobile: true, resource: "Mobile van" },
  { n: 20, date: -4, time: "09:00", serviceId: "sv4", staffId: "s2", locationId: "l1", clientId: "c6", recordId: "v7", status: "completed", jobStatus: "completed", paymentStatus: "paid", paymentMethod: "Card", amount: 170, resource: "Bay 2" },
  { n: 21, date: -5, time: "11:00", serviceId: "sv1", staffId: "s4", locationId: "l1", clientId: "c5", recordId: "v6", status: "cancelled", jobStatus: "cancelled", paymentStatus: "refunded", paymentMethod: "Card", amount: 65, resource: "Bay 1" },
  { n: 22, date: -6, time: "08:00", serviceId: "sv1", staffId: "s3", locationId: "l2", clientId: "c2", recordId: "v3", status: "completed", jobStatus: "completed", paymentStatus: "paid", paymentMethod: "Package credit", amount: 75, mobile: true, resource: "Mobile van" },
];

const bookings: Booking[] = jobSeeds.map((j) => {
  const svc = services.find((s) => s.id === j.serviceId)!;
  return {
    id: `b${j.n}`,
    ref: `JOB-${3100 + j.n}`,
    date: d(j.date),
    time: j.time,
    serviceId: j.serviceId,
    staffId: j.staffId,
    locationId: j.locationId,
    clientIds: [j.clientId],
    status: j.status,
    attendance:
      j.status === "completed" ? "attended" : j.status === "cancelled" ? "cancelled" : "scheduled",
    paymentStatus: j.paymentStatus,
    paymentMethod: j.paymentMethod,
    amount: j.amount,
    capacity: 1,
    booked: 1,
    recordId: j.recordId,
    jobStatus: j.jobStatus,
    deposit: j.deposit,
    balance: j.deposit ? j.amount - j.deposit : undefined,
    mobile: j.mobile,
    resource: j.resource,
    instructions: j.instructions,
    duration: svc.duration,
    packageId: j.paymentMethod === "Package credit" ? "p1" : undefined,
  };
});

const clientPackages: ClientPackage[] = [
  { id: "cp1", packageId: "p1", clientId: "c1", purchased: d(-64), credits: 4, remaining: 1, expires: d(9), status: "active" },
  { id: "cp2", packageId: "p2", clientId: "c8", purchased: d(-120), credits: 12, remaining: 7, expires: d(240), status: "active" },
  { id: "cp3", packageId: "p3", clientId: "c3", purchased: d(-30), credits: 4, remaining: 2, expires: d(90), status: "active" },
  { id: "cp4", packageId: "p1", clientId: "c6", purchased: d(-45), credits: 4, remaining: 3, expires: d(75), status: "active" },
  { id: "cp5", packageId: "p4", clientId: "c2", purchased: d(-200), credits: 4, remaining: 0, expires: d(160), status: "used" },
];

const ledger: LedgerEntry[] = [
  { id: "le1", clientId: "c1", date: d(-64), type: "purchase", description: "Maintenance Plan — 4 visits purchased", change: 4, balance: 4 },
  { id: "le2", clientId: "c1", date: d(-44), type: "used", description: "Maintenance Detail — BMW M340i", change: -1, balance: 3 },
  { id: "le3", clientId: "c1", date: d(-28), type: "used", description: "Maintenance Detail — BMW M340i", change: -1, balance: 2 },
  { id: "le4", clientId: "c1", date: d(-6), type: "used", description: "Maintenance Detail — VW Transporter", change: -1, balance: 1 },
];

const payments: Payment[] = [
  { id: "pay1", ref: "pi_3RaC1L2eZvKY", clientId: "c8", amount: 200, fee: 3.3, date: d(-9), time: "10:12", description: "Ceramic Coating deposit — Audi RS6", type: "Booking", method: "Visa •••• 4242", status: "paid" },
  { id: "pay2", ref: "pi_3RaD2M2eZvKY", clientId: "c1", amount: 260, fee: 4.14, date: d(-64), time: "17:40", description: "Maintenance Plan — 4 visits", type: "Package", method: "Mastercard •••• 8210", status: "paid" },
  { id: "pay3", ref: "pi_3RaE3N2eZvKY", clientId: "c3", amount: 200, fee: 3.3, date: d(-30), time: "12:05", description: "Mobile Wash Bundle", type: "Package", method: "Visa •••• 1191", status: "paid" },
  { id: "pay4", ref: "pi_3RaF4P2eZvKY", clientId: "c1", amount: 540, fee: 8.06, date: d(-2), time: "16:22", description: "Full Paint Correction — BMW M340i", type: "Booking", method: "Amex •••• 3005", status: "paid" },
  { id: "pay5", ref: "pi_3RaG5Q2eZvKY", clientId: "c6", amount: 170, fee: 2.85, date: d(-4), time: "13:18", description: "Interior Deep Clean — Evoque", type: "Booking", method: "Visa •••• 7781", status: "paid" },
  { id: "pay6", ref: "pi_3RaH6R2eZvKY", clientId: "c5", amount: 65, fee: 1.44, date: d(-5), time: "09:47", description: "Maintenance Detail — Corsa", type: "Booking", method: "Visa •••• 5540", status: "refunded", refunded: 65 },
  { id: "pay7", ref: "pi_3RaJ7S2eZvKY", clientId: "c4", amount: 100, fee: 2.1, date: d(-1), time: "19:03", description: "Paint Correction deposit — Porsche 911", type: "Booking", method: "Visa •••• 9034", status: "paid" },
  { id: "pay8", ref: "pi_3RaK8T2eZvKY", clientId: "c7", amount: 115, fee: 2.39, date: d(-33), time: "08:26", description: "Maintenance Detail — Sprinter", type: "Booking", method: "Bank transfer", status: "pending" },
  { id: "pay9", ref: "pi_3RaL9U2eZvKY", clientId: "c2", amount: 340, fee: 5.26, date: d(-200), time: "11:31", description: "Coating Aftercare Plan", type: "Package", method: "Visa •••• 2213", status: "paid" },
  { id: "pay10", ref: "pi_3RaM0V2eZvKY", clientId: "c3", amount: 67, fee: 1.47, date: d(-3), time: "12:44", description: "Mobile Wash and Wax — Ranger", type: "Booking", method: "Apple Pay", status: "paid" },
  { id: "pay11", ref: "pi_3RaN1W2eZvKY", clientId: "c5", amount: 80, fee: 1.72, date: d(0), time: "08:15", description: "Alloy refurb deposit — Corsa", type: "Booking", method: "Visa •••• 6602", status: "failed" },
];

const conversations: Conversation[] = [
  {
    id: "cv1",
    clientId: "c8",
    unread: 2,
    kind: "direct",
    messages: [
      { id: "m1", from: "business", body: "Morning Laura — the RS6 is in the booth and prep is underway. I'll send correction photos this afternoon.", time: "08:22", date: d(0) },
      { id: "m2", from: "client", body: "Brilliant. Is it still fine to collect tomorrow lunchtime?", time: "09:05", date: d(0) },
      { id: "m3", from: "client", body: "Also — can you look at the nearside wheel while it's in?", time: "09:06", date: d(0) },
    ],
  },
  {
    id: "cv2",
    clientId: "c3",
    unread: 0,
    kind: "direct",
    messages: [
      { id: "m4", from: "business", body: "Hi Michael, Tom is on his way to you now for the mobile wash. ETA 20 minutes.", time: "08:40", date: d(0) },
      { id: "m5", from: "client", body: "Perfect, gates are open.", time: "08:44", date: d(0) },
    ],
  },
  {
    id: "cv3",
    clientId: "c5",
    unread: 1,
    kind: "direct",
    messages: [
      { id: "m6", from: "business", body: "Hi Ollie — your alloy refurb deposit didn't go through. Here's a new payment link.", time: "08:20", date: d(0) },
      { id: "m7", from: "client", body: "Sorry, new card. I'll sort it tonight.", time: "10:11", date: d(0) },
    ],
  },
  {
    id: "cv4",
    clientId: "c1",
    unread: 0,
    kind: "announcement",
    title: "Winter protection offer",
    messages: [
      { id: "m8", from: "business", body: "Winter is coming — book any maintenance detail in November and we'll add a free sealant top-up.", time: "09:00", date: d(-7) },
    ],
  },
];

const blockedTimes: BlockedTime[] = [
  { id: "bt1", staffId: "s1", date: d(0), time: "17:00", duration: 60, reason: "Quotes and callbacks" },
  { id: "bt2", staffId: "s3", date: d(1), time: "13:00", duration: 60, reason: "Travel and restock" },
  { id: "bt3", staffId: "s2", date: d(2), time: "15:00", duration: 120, reason: "Coating training" },
];

export const detailingDataset: IndustryDataset = {
  id: "car-detailing",
  label: "Car Detailing",
  sector: "Automotive services",
  blurb: "Vehicle-linked jobs, deposits, size-based pricing and a mobile van.",
  business: {
    name: "Apex Auto Detailing",
    tagline: "Run your service business in one place",
    email: "hello@apexdetailing.co.uk",
    phone: "0161 402 7710",
    bookingUrl: "recavo.app/apex-detailing",
    vatNumber: "GB 388 1042 66",
    brandColour: "#1E9C8B",
    initials: "AD",
    plan: "Growth plan",
    owner: "Ryan Cole",
    ownerRole: "Owner and Lead Detailer",
  },
  terms: {
    staff: "Detailer",
    staffPlural: "Detailers",
    service: "Service",
    servicePlural: "Services",
    booking: "Job",
    bookingPlural: "Jobs",
    customer: "Customer",
    customerPlural: "Customers",
    location: "Unit",
    locationPlural: "Units",
    package: "Care plan",
    packagePlural: "Care plans",
  },
  jobStatuses: DETAILING_JOB_STATUSES,
  customerFields: [
    { id: "cf-area", label: "Area", type: "text", required: false, staffOnly: false, inRegistration: true, inBooking: false, searchable: true },
    { id: "cf-access", label: "Access notes", type: "textarea", required: false, staffOnly: false, inRegistration: true, inBooking: true, searchable: false },
    { id: "cf-source", label: "How did you hear about us?", type: "select", required: false, staffOnly: false, inRegistration: true, inBooking: false, searchable: false, options: ["Google", "Instagram", "Referral", "Repeat customer"] },
    { id: "cf-fleet", label: "Fleet account", type: "checkbox", required: false, staffOnly: true, inRegistration: false, inBooking: false, searchable: false },
  ],
  customRecord: {
    enabled: true,
    singular: "Vehicle",
    plural: "Vehicles",
    icon: "Car",
    multiplePerCustomer: true,
    requiredAtBooking: true,
    customerCanCreate: true,
    customerCanEdit: true,
    active: true,
    fields: [
      { id: "registration", label: "Registration", type: "text", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: true },
      { id: "make", label: "Make", type: "text", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: true },
      { id: "model", label: "Model", type: "text", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: true },
      { id: "year", label: "Year", type: "number", required: false, staffOnly: false, inRegistration: false, inBooking: false, searchable: false },
      { id: "colour", label: "Colour", type: "text", required: false, staffOnly: false, inRegistration: false, inBooking: false, searchable: false },
      { id: "type", label: "Vehicle type", type: "select", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: false, options: ["Hatchback", "Saloon", "Estate", "Coupe", "SUV", "Van", "Pick-up"] },
      { id: "size", label: "Size category", type: "select", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: false, options: ["Small", "Medium", "Large", "Extra Large"] },
      { id: "fuel", label: "Fuel type", type: "select", required: false, staffOnly: false, inRegistration: false, inBooking: false, searchable: false, options: ["Petrol", "Diesel", "Hybrid", "Electric"] },
      { id: "condition", label: "Condition notes", type: "textarea", required: false, staffOnly: true, inRegistration: false, inBooking: false, searchable: false },
      { id: "damage", label: "Existing damage", type: "textarea", required: false, staffOnly: true, inRegistration: false, inBooking: false, searchable: false },
      { id: "products", label: "Preferred products", type: "text", required: false, staffOnly: true, inRegistration: false, inBooking: false, searchable: false },
    ],
  },
  records,
  resources: [
    { id: "r1", name: "Bay 1", locationId: "l1" },
    { id: "r2", name: "Bay 2", locationId: "l1" },
    { id: "r3", name: "Detailing Bay", locationId: "l1" },
    { id: "r4", name: "Mobile van", locationId: "l2" },
  ],
  features: {
    mobileService: true,
    walkIns: false,
    queue: false,
    deposits: true,
    sizePricing: true,
    staffPricing: false,
    customRecords: true,
    resourceLabel: "Bay",
  },
  dashboard: {
    greeting: "Good morning, Ryan",
    headline: [
      { label: "Revenue this month", value: "£12,960", change: 11.4, hint: "vs £11,640" },
      { label: "Jobs this month", value: "74", change: 6.2, hint: "vs 69" },
      { label: "Average job value", value: "£175", change: 4.8, hint: "vs £167" },
      { label: "Bay utilisation", value: "78%", change: 2.1, hint: "3 bays" },
    ],
    industryCards: [
      { label: "Vehicles in the unit", value: "4", hint: "2 mid-job, 1 ready" },
      { label: "Ready for collection", value: "1", hint: "Mercedes Sprinter" },
      { label: "Deposits outstanding", value: "£380", hint: "3 jobs" },
      { label: "Mobile jobs today", value: "2", hint: "38 miles routed" },
      { label: "Quotes awaiting approval", value: "1", hint: "alloy refurb" },
    ],
  },
  quickActions: [
    { id: "booking", label: "New job", icon: "CalendarPlus" },
    { id: "record", label: "Add vehicle", icon: "Car" },
    { id: "client", label: "Add customer", icon: "UserPlus" },
    { id: "package", label: "Sell care plan", icon: "Package" },
  ],
  reportSections: [
    {
      title: "Jobs and workflow",
      description: "Throughput across bays and the mobile van",
      rows: [
        { label: "Average turnaround", value: "4h 20m", hint: "check-in to collection" },
        { label: "Jobs per bay per week", value: "6.1" },
        { label: "Mobile jobs", value: "26", hint: "35% of volume" },
        { label: "Repeat customer rate", value: "64%" },
      ],
    },
    {
      title: "Revenue by vehicle size",
      description: "Where size-based pricing is landing",
      rows: [
        { label: "Small", value: "£1,840", hint: "18 jobs" },
        { label: "Medium", value: "£4,120", hint: "26 jobs" },
        { label: "Large", value: "£4,460", hint: "19 jobs" },
        { label: "Extra Large", value: "£2,540", hint: "11 jobs" },
      ],
    },
  ],
  revenueSeries: [
    { month: "Feb", revenue: 8420, bookings: 52 },
    { month: "Mar", revenue: 9640, bookings: 58 },
    { month: "Apr", revenue: 10240, bookings: 61 },
    { month: "May", revenue: 11080, bookings: 66 },
    { month: "Jun", revenue: 11640, bookings: 69 },
    { month: "Jul", revenue: 12960, bookings: 74 },
  ],
  staff,
  locations,
  services,
  packageDefs,
  clients,
  bookings,
  clientPackages,
  ledger,
  payments,
  conversations,
  blockedTimes,
};
