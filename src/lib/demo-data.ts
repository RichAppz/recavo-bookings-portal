import { addDays, demoToday, isoDate } from "./format";

export type BookingStatus =
  | "confirmed"
  | "awaiting_payment"
  | "completed"
  | "cancelled"
  | "late_cancellation"
  | "no_show"
  | "refunded";

export type PaymentStatus = "paid" | "failed" | "refunded" | "partially_refunded" | "pending";
export type AttendanceStatus = "scheduled" | "attended" | "no_show" | "cancelled";

/** Job / workflow states. Industry templates pick their own subset. */
export const DETAILING_JOB_STATUSES = [
  "booked",
  "checked_in",
  "inspection_complete",
  "in_progress",
  "quality_check",
  "ready_for_collection",
  "completed",
  "cancelled",
] as const;

export const BARBER_JOB_STATUSES = [
  "booked",
  "checked_in",
  "waiting",
  "in_chair",
  "completed",
  "no_show",
  "cancelled",
] as const;

export const PT_JOB_STATUSES = [
  "booked",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
] as const;

export type PricingModel = "fixed" | "from" | "by_record_size" | "by_staff" | "quote";
export type PaymentRule = "deposit" | "full" | "after";
export type ServicePlace = "business" | "customer" | "mobile" | "online";
export type SizeCategory = "Small" | "Medium" | "Large" | "Extra Large";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "email"
  | "tel"
  | "image"
  | "file"
  | "reference";

export interface CustomFieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  staffOnly: boolean;
  inRegistration: boolean;
  inBooking: boolean;
  searchable: boolean;
  options?: string[];
}

export interface CustomRecordConfig {
  enabled: boolean;
  singular: string;
  plural: string;
  icon: string;
  multiplePerCustomer: boolean;
  requiredAtBooking: boolean;
  customerCanCreate: boolean;
  customerCanEdit: boolean;
  active: boolean;
  fields: CustomFieldDef[];
}

export interface Terminology {
  staff: string;
  staffPlural: string;
  service: string;
  servicePlural: string;
  booking: string;
  bookingPlural: string;
  customer: string;
  customerPlural: string;
  location: string;
  locationPlural: string;
  package: string;
  packagePlural: string;
}

/** A customer-linked custom record instance (vehicle, pet, student, property…). */
export interface CustomRecord {
  id: string;
  clientId: string;
  title: string;
  subtitle: string;
  image?: string;
  sizeCategory?: SizeCategory;
  lastVisit?: string;
  lifetimeSpend: number;
  status: "active" | "inactive";
  values: Record<string, string>;
}


export interface Staff {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  avatar: string;
  locations: string[];
  services: string[];
  weeklyBookings: number;
  revenue: number;
  availabilityComplete: boolean;
  permission: "Business owner" | "Administrator" | "Trainer" | "Detailer" | "Barber" | "Restricted";
  bio: string;
  colour: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  openingHours: string;
  staff: string[];
  services: string[];
  monthlyBookings: number;
  revenue: number;
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  capacity: number;
  staff: string[];
  locations: string[];
  bookingNotice: string;
  cancellationPeriod: string;
  buffer: string;
  active: boolean;
  colour: string;
  pricingModel?: PricingModel;
  sizePricing?: Partial<Record<SizeCategory, number>>;
  deposit?: number;
  paymentRule?: PaymentRule;
  place?: ServicePlace;
  travelFee?: number;
}

export interface PackageDef {
  id: string;
  name: string;
  price: number;
  credits: number;
  validity: string;
  eligibleServices: string[];
  sold: number;
  revenue: number;
  active: boolean;
}

export interface ClientPackage {
  id: string;
  packageId: string;
  clientId: string;
  purchased: string;
  credits: number;
  remaining: number;
  expires: string;
  status: "active" | "expired" | "used";
}

export interface LedgerEntry {
  id: string;
  clientId: string;
  date: string;
  type: "purchase" | "used" | "returned" | "adjustment" | "expired";
  description: string;
  change: number;
  balance: number;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  joined: string;
  status: "active" | "inactive" | "suspended";
  lifetimeSpend: number;
  totalBookings: number;
  attendanceRate: number;
  notes: { id: string; date: string; author: string; body: string }[];
  fields?: Record<string, string>;
  address?: string;
}

export interface Booking {
  id: string;
  ref: string;
  date: string;
  time: string;
  serviceId: string;
  staffId: string;
  locationId: string;
  clientIds: string[];
  status: BookingStatus;
  attendance: AttendanceStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "Card" | "Package credit" | "Cash";
  packageId?: string;
  amount: number;
  capacity: number;
  booked: number;
  notes?: string;
  /** Custom-record link (vehicle, pet, student…). */
  recordId?: string;
  /** Industry workflow state. */
  jobStatus?: string;
  deposit?: number;
  balance?: number;
  mobile?: boolean;
  resource?: string;
  walkIn?: boolean;
  instructions?: string;
  duration?: number;
}

export interface Payment {
  id: string;
  ref: string;
  clientId: string;
  amount: number;
  fee: number;
  date: string;
  time: string;
  description: string;
  type: "Booking" | "Package";
  method: string;
  status: PaymentStatus;
  refunded?: number;
}

export interface Message {
  id: string;
  from: "client" | "business";
  body: string;
  time: string;
  date: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  unread: number;
  messages: Message[];
  kind: "direct" | "announcement";
  title?: string;
}

export interface BlockedTime {
  id: string;
  staffId: string;
  date: string;
  time: string;
  duration: number;
  reason: string;
}

const T = demoToday();
const d = (offset: number) => isoDate(addDays(T, offset));

export const business = {
  name: "Peak Performance Training",
  tagline: "Coaching, bookings and payments in one place",
  email: "hello@peakperformance.co.uk",
  phone: "0161 496 0188",
  bookingUrl: "recavo.app/peak-performance",
  vatNumber: "GB 412 8873 55",
  brandColour: "#1E9C8B",
  initials: "PP",
  plan: "Growth plan",
  owner: "Alex Morgan",
  ownerRole: "Owner and Head Coach",
};


export const staff: Staff[] = [
  {
    id: "s1",
    name: "Alex Morgan",
    role: "Owner and Head Coach",
    email: "alex@peakperformance.co.uk",
    phone: "07700 900112",
    avatar: "https://i.pravatar.cc/160?img=13",
    locations: ["l1", "l2"],
    services: ["sv1", "sv2", "sv4", "sv5"],
    weeklyBookings: 26,
    revenue: 3120,
    availabilityComplete: true,
    permission: "Business owner",
    bio: "Strength and conditioning specialist with 12 years coaching experience.",
    colour: "var(--color-chart-1)",
  },
  {
    id: "s2",
    name: "Sophie Taylor",
    role: "Personal Trainer",
    email: "sophie@peakperformance.co.uk",
    phone: "07700 900224",
    avatar: "https://i.pravatar.cc/160?img=45",
    locations: ["l1"],
    services: ["sv1", "sv2", "sv5"],
    weeklyBookings: 21,
    revenue: 2180,
    availabilityComplete: true,
    permission: "Trainer",
    bio: "Focused on fat loss, mobility and long-term habit change.",
    colour: "var(--color-chart-2)",
  },
  {
    id: "s3",
    name: "Marcus Reed",
    role: "Strength Coach",
    email: "marcus@peakperformance.co.uk",
    phone: "07700 900336",
    avatar: "https://i.pravatar.cc/160?img=33",
    locations: ["l2"],
    services: ["sv1", "sv4", "sv5"],
    weeklyBookings: 18,
    revenue: 1860,
    availabilityComplete: true,
    permission: "Trainer",
    bio: "Powerlifting background, leads the small group strength programme.",
    colour: "var(--color-chart-4)",
  },
  {
    id: "s4",
    name: "Chloe Bennett",
    role: "Youth Fitness Coach",
    email: "chloe@peakperformance.co.uk",
    phone: "07700 900448",
    avatar: "https://i.pravatar.cc/160?img=47",
    locations: ["l1", "l2"],
    services: ["sv3", "sv6"],
    weeklyBookings: 14,
    revenue: 1260,
    availabilityComplete: false,
    permission: "Restricted",
    bio: "Youth athletic development and sibling training sessions.",
    colour: "var(--color-chart-5)",
  },
];

export const locations: Location[] = [
  {
    id: "l1",
    name: "Riverside Fitness Studio",
    address: "24 River Lane",
    city: "Manchester",
    postcode: "M3 4LP",
    openingHours: "06:00 – 21:00 Mon–Fri · 08:00 – 14:00 Sat",
    staff: ["s1", "s2", "s4"],
    services: ["sv1", "sv2", "sv3", "sv4", "sv5", "sv6"],
    monthlyBookings: 112,
    revenue: 5180,
    active: true,
  },
  {
    id: "l2",
    name: "Westfield Performance Gym",
    address: "80 Westfield Road",
    city: "Manchester",
    postcode: "M14 6QT",
    openingHours: "06:30 – 20:30 Mon–Fri · 09:00 – 13:00 Sat",
    staff: ["s1", "s3"],
    services: ["sv1", "sv2", "sv4", "sv5"],
    monthlyBookings: 74,
    revenue: 3240,
    active: true,
  },
];

export const services: Service[] = [
  {
    id: "sv1",
    name: "1-to-1 Personal Training",
    description: "Private coaching session built around your individual training plan.",
    duration: 60,
    price: 50,
    capacity: 1,
    staff: ["s1", "s2", "s3"],
    locations: ["l1", "l2"],
    bookingNotice: "12 hours",
    cancellationPeriod: "24 hours",
    buffer: "10 minutes",
    active: true,
    colour: "var(--color-chart-1)",
  },
  {
    id: "sv2",
    name: "2-to-1 Personal Training",
    description: "Train alongside a partner with shared coaching attention.",
    duration: 60,
    price: 75,
    capacity: 2,
    staff: ["s1", "s2"],
    locations: ["l1", "l2"],
    bookingNotice: "24 hours",
    cancellationPeriod: "24 hours",
    buffer: "10 minutes",
    active: true,
    colour: "var(--color-chart-2)",
  },
  {
    id: "sv3",
    name: "Sibling Training Session",
    description: "Coached session for two siblings, adapted for age and ability.",
    duration: 60,
    price: 65,
    capacity: 2,
    staff: ["s4"],
    locations: ["l1"],
    bookingNotice: "24 hours",
    cancellationPeriod: "24 hours",
    buffer: "10 minutes",
    active: true,
    colour: "var(--color-chart-5)",
  },
  {
    id: "sv4",
    name: "Small Group Strength",
    description: "Barbell-led strength class, maximum eight people per session.",
    duration: 60,
    price: 18,
    capacity: 8,
    staff: ["s1", "s3"],
    locations: ["l1", "l2"],
    bookingNotice: "4 hours",
    cancellationPeriod: "12 hours",
    buffer: "15 minutes",
    active: true,
    colour: "var(--color-chart-4)",
  },
  {
    id: "sv5",
    name: "Fitness Assessment",
    description: "Movement screen, body composition and goal-setting consultation.",
    duration: 45,
    price: 35,
    capacity: 1,
    staff: ["s1", "s2", "s3"],
    locations: ["l1", "l2"],
    bookingNotice: "24 hours",
    cancellationPeriod: "24 hours",
    buffer: "15 minutes",
    active: true,
    colour: "var(--color-chart-3)",
  },
  {
    id: "sv6",
    name: "Youth Conditioning",
    description: "Athletic development for 11–16s, focused on speed and coordination.",
    duration: 45,
    price: 20,
    capacity: 8,
    staff: ["s4"],
    locations: ["l1"],
    bookingNotice: "12 hours",
    cancellationPeriod: "24 hours",
    buffer: "15 minutes",
    active: false,
    colour: "var(--color-chart-2)",
  },
];

export const packageDefs: PackageDef[] = [
  {
    id: "p1",
    name: "Single 1-to-1 Session",
    price: 50,
    credits: 1,
    validity: "1 month",
    eligibleServices: ["sv1"],
    sold: 64,
    revenue: 3200,
    active: true,
  },
  {
    id: "p2",
    name: "Monthly 1-to-1 Package",
    price: 180,
    credits: 4,
    validity: "1 month",
    eligibleServices: ["sv1", "sv5"],
    sold: 41,
    revenue: 7380,
    active: true,
  },
  {
    id: "p3",
    name: "Three-Month Training Package",
    price: 510,
    credits: 12,
    validity: "4 months",
    eligibleServices: ["sv1", "sv5"],
    sold: 18,
    revenue: 9180,
    active: true,
  },
  {
    id: "p4",
    name: "2-to-1 Session",
    price: 75,
    credits: 1,
    validity: "1 month",
    eligibleServices: ["sv2"],
    sold: 22,
    revenue: 1650,
    active: true,
  },
  {
    id: "p5",
    name: "Sibling Training Package",
    price: 240,
    credits: 4,
    validity: "1 month",
    eligibleServices: ["sv3"],
    sold: 12,
    revenue: 2880,
    active: true,
  },
  {
    id: "p6",
    name: "Group Training Pack",
    price: 80,
    credits: 5,
    validity: "2 months",
    eligibleServices: ["sv4", "sv6"],
    sold: 37,
    revenue: 2960,
    active: true,
  },
];

const clientSeed: [string, string, number, number, number, number][] = [
  ["James Wilson", "img=12", 1, 2140, 48, 96],
  ["Sarah Lewis", "img=44", 2, 1680, 39, 94],
  ["Olivia Carter", "img=31", 3, 960, 22, 91],
  ["Daniel Evans", "img=51", 4, 745, 17, 88],
  ["Emma Roberts", "img=25", 5, 1320, 31, 97],
  ["Noah Thompson", "img=15", 6, 480, 12, 83],
  ["Mia Harris", "img=41", 7, 1105, 26, 92],
  ["Ethan Walker", "img=60", 8, 620, 15, 87],
  ["Ava Phillips", "img=49", 9, 890, 21, 95],
  ["Lucas Green", "img=57", 10, 355, 9, 78],
];

export const clients: Client[] = clientSeed.map(
  ([name, img, i, spend, bookings, attendance]) => ({
    id: `c${i}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.co.uk`,
    phone: `07700 9${(100000 + i * 7311).toString().slice(0, 5)}`,
    avatar: `https://i.pravatar.cc/160?${img}`,
    joined: d(-(30 + i * 26)),
    status: i === 10 ? "inactive" : "active",
    lifetimeSpend: spend,
    totalBookings: bookings,
    attendanceRate: attendance,
    notes:
      i === 1
        ? [
            {
              id: "n1",
              date: d(-6),
              author: "Alex Morgan",
              body: "Right shoulder still sensitive overhead — keep pressing to landmine variations for now.",
            },
          ]
        : [],
  }),
);

export const clientPackages: ClientPackage[] = [
  { id: "cp1", packageId: "p2", clientId: "c1", purchased: d(-24), credits: 4, remaining: 1, expires: d(6), status: "active" },
  { id: "cp2", packageId: "p3", clientId: "c2", purchased: d(-52), credits: 12, remaining: 5, expires: d(68), status: "active" },
  { id: "cp3", packageId: "p6", clientId: "c3", purchased: d(-40), credits: 5, remaining: 2, expires: d(4), status: "active" },
  { id: "cp4", packageId: "p5", clientId: "c4", purchased: d(-20), credits: 4, remaining: 3, expires: d(10), status: "active" },
  { id: "cp5", packageId: "p2", clientId: "c5", purchased: d(-27), credits: 4, remaining: 0, expires: d(3), status: "used" },
  { id: "cp6", packageId: "p6", clientId: "c7", purchased: d(-15), credits: 5, remaining: 4, expires: d(45), status: "active" },
  { id: "cp7", packageId: "p2", clientId: "c9", purchased: d(-26), credits: 4, remaining: 2, expires: d(5), status: "active" },
  { id: "cp8", packageId: "p1", clientId: "c6", purchased: d(-70), credits: 1, remaining: 0, expires: d(-40), status: "expired" },
];

export const ledger: LedgerEntry[] = [
  { id: "le1", clientId: "c1", date: d(-24), type: "purchase", description: "Monthly 1-to-1 Package purchased", change: 4, balance: 4 },
  { id: "le2", clientId: "c1", date: d(-17), type: "used", description: "1-to-1 Personal Training — Alex Morgan", change: -1, balance: 3 },
  { id: "le3", clientId: "c1", date: d(-10), type: "used", description: "1-to-1 Personal Training — Alex Morgan", change: -1, balance: 2 },
  { id: "le4", clientId: "c1", date: d(-8), type: "used", description: "1-to-1 Personal Training — Sophie Taylor", change: -1, balance: 1 },
  { id: "le5", clientId: "c1", date: d(-4), type: "returned", description: "Session cancelled within policy — credit returned", change: 1, balance: 2 },
  { id: "le6", clientId: "c1", date: d(-1), type: "used", description: "1-to-1 Strength Training — Alex Morgan", change: -1, balance: 1 },
];

const B = (
  n: number,
  date: number,
  time: string,
  serviceId: string,
  staffId: string,
  locationId: string,
  clientIds: string[],
  status: BookingStatus,
  paymentStatus: PaymentStatus,
  paymentMethod: Booking["paymentMethod"],
  booked?: number,
): Booking => {
  const svc = services.find((s) => s.id === serviceId)!;
  return {
    id: `b${n}`,
    ref: `BK-${(4820 + n).toString()}`,
    date: d(date),
    time,
    serviceId,
    staffId,
    locationId,
    clientIds,
    status,
    attendance:
      status === "completed"
        ? "attended"
        : status === "no_show"
          ? "no_show"
          : status === "cancelled" || status === "late_cancellation"
            ? "cancelled"
            : "scheduled",
    paymentStatus,
    paymentMethod,
    amount: svc.capacity > 2 ? svc.price * (booked ?? 1) : svc.price,
    capacity: svc.capacity,
    booked: booked ?? clientIds.length,
    packageId: paymentMethod === "Package credit" ? "p2" : undefined,
  };
};

export const bookings: Booking[] = [
  // today
  B(1, 0, "07:00", "sv1", "s1", "l1", ["c1"], "confirmed", "paid", "Package credit"),
  B(2, 0, "08:00", "sv1", "s2", "l1", ["c2"], "confirmed", "paid", "Card"),
  B(3, 0, "09:30", "sv3", "s4", "l1", ["c3", "c6"], "confirmed", "paid", "Package credit"),
  B(4, 0, "11:00", "sv5", "s3", "l2", ["c4"], "awaiting_payment", "pending", "Card"),
  B(5, 0, "17:30", "sv4", "s3", "l2", ["c5", "c7", "c8", "c9", "c10", "c2"], "confirmed", "paid", "Card", 6),
  B(6, 0, "19:00", "sv4", "s1", "l1", ["c1", "c3", "c4", "c5", "c6", "c7", "c9"], "confirmed", "paid", "Card", 7),
  B(7, 0, "13:00", "sv1", "s2", "l1", ["c8"], "cancelled", "refunded", "Card"),
  // tomorrow onwards
  B(8, 1, "07:30", "sv1", "s1", "l1", ["c5"], "confirmed", "paid", "Card"),
  B(9, 1, "09:00", "sv2", "s2", "l1", ["c2", "c9"], "confirmed", "paid", "Card"),
  B(10, 1, "12:00", "sv5", "s3", "l2", ["c10"], "awaiting_payment", "pending", "Card"),
  B(11, 1, "18:00", "sv4", "s3", "l2", ["c1", "c4", "c7", "c8"], "confirmed", "paid", "Card", 4),
  B(12, 2, "08:00", "sv1", "s2", "l1", ["c7"], "confirmed", "paid", "Package credit"),
  B(13, 2, "10:00", "sv3", "s4", "l1", ["c3", "c6"], "confirmed", "paid", "Package credit"),
  B(14, 2, "17:00", "sv4", "s1", "l1", ["c2", "c5", "c9", "c10", "c8"], "confirmed", "paid", "Card", 5),
  B(15, 3, "07:00", "sv1", "s1", "l2", ["c4"], "confirmed", "paid", "Card"),
  B(16, 3, "11:30", "sv5", "s2", "l1", ["c8"], "confirmed", "paid", "Card"),
  B(17, 4, "09:00", "sv1", "s3", "l2", ["c1"], "confirmed", "paid", "Package credit"),
  B(18, 4, "18:30", "sv4", "s3", "l2", ["c2", "c3", "c5"], "confirmed", "paid", "Card", 3),
  B(19, 5, "10:00", "sv2", "s1", "l1", ["c5", "c7"], "confirmed", "paid", "Card"),
  B(20, 6, "09:00", "sv1", "s2", "l1", ["c9"], "confirmed", "paid", "Card"),
  // past
  B(21, -1, "07:00", "sv1", "s1", "l1", ["c1"], "completed", "paid", "Package credit"),
  B(22, -1, "08:30", "sv1", "s2", "l1", ["c2"], "completed", "paid", "Card"),
  B(23, -1, "18:00", "sv4", "s3", "l2", ["c4", "c5", "c7", "c8", "c9"], "completed", "paid", "Card", 5),
  B(24, -2, "07:30", "sv5", "s3", "l2", ["c10"], "no_show", "paid", "Card"),
  B(25, -2, "12:00", "sv1", "s1", "l1", ["c6"], "late_cancellation", "paid", "Card"),
  B(26, -3, "09:00", "sv1", "s2", "l1", ["c3"], "completed", "paid", "Card"),
  B(27, -3, "17:30", "sv4", "s1", "l1", ["c1", "c2", "c9"], "completed", "paid", "Card", 3),
  B(28, -4, "08:00", "sv2", "s1", "l1", ["c5", "c7"], "refunded", "refunded", "Card"),
  B(29, -5, "10:00", "sv3", "s4", "l1", ["c3", "c6"], "completed", "paid", "Package credit"),
  B(30, -6, "07:00", "sv1", "s1", "l2", ["c4"], "completed", "paid", "Card"),
];

export const blockedTimes: BlockedTime[] = [
  { id: "bt1", staffId: "s1", date: d(0), time: "14:00", duration: 90, reason: "Admin and programme writing" },
  { id: "bt2", staffId: "s2", date: d(1), time: "13:00", duration: 60, reason: "Lunch" },
  { id: "bt3", staffId: "s3", date: d(3), time: "15:00", duration: 120, reason: "CPD course" },
];

export const payments: Payment[] = [
  { id: "pay1", ref: "pi_3QxT4L2eZvKY", clientId: "c1", amount: 180, fee: 3.02, date: d(-24), time: "09:14", description: "Monthly 1-to-1 Package", type: "Package", method: "Visa •••• 4242", status: "paid" },
  { id: "pay2", ref: "pi_3QxU8M2eZvKY", clientId: "c2", amount: 510, fee: 7.67, date: d(-52), time: "18:02", description: "Three-Month Training Package", type: "Package", method: "Mastercard •••• 8210", status: "paid" },
  { id: "pay3", ref: "pi_3QxV1P2eZvKY", clientId: "c3", amount: 80, fee: 1.56, date: d(-40), time: "11:45", description: "Group Training Pack", type: "Package", method: "Visa •••• 1191", status: "paid" },
  { id: "pay4", ref: "pi_3QxW6R2eZvKY", clientId: "c4", amount: 240, fee: 3.89, date: d(-20), time: "20:31", description: "Sibling Training Package", type: "Package", method: "Amex •••• 3005", status: "paid" },
  { id: "pay5", ref: "pi_3QxX2S2eZvKY", clientId: "c5", amount: 50, fee: 1.12, date: d(-8), time: "07:52", description: "1-to-1 Personal Training", type: "Booking", method: "Visa •••• 7781", status: "paid" },
  { id: "pay6", ref: "pi_3QxY9T2eZvKY", clientId: "c7", amount: 75, fee: 1.49, date: d(-4), time: "16:20", description: "2-to-1 Personal Training", type: "Booking", method: "Visa •••• 5540", status: "refunded", refunded: 75 },
  { id: "pay7", ref: "pi_3QxZ4U2eZvKY", clientId: "c8", amount: 50, fee: 1.12, date: d(-2), time: "10:09", description: "1-to-1 Personal Training", type: "Booking", method: "Mastercard •••• 6602", status: "partially_refunded", refunded: 25 },
  { id: "pay8", ref: "pi_3Qy0A62eZvKY", clientId: "c10", amount: 35, fee: 0.9, date: d(-1), time: "19:47", description: "Fitness Assessment", type: "Booking", method: "Visa •••• 9034", status: "failed" },
  { id: "pay9", ref: "pi_3Qy1B72eZvKY", clientId: "c9", amount: 180, fee: 3.02, date: d(-26), time: "08:33", description: "Monthly 1-to-1 Package", type: "Package", method: "Visa •••• 2213", status: "paid" },
  { id: "pay10", ref: "pi_3Qy2C82eZvKY", clientId: "c6", amount: 18, fee: 0.66, date: d(-1), time: "17:05", description: "Small Group Strength", type: "Booking", method: "Apple Pay", status: "paid" },
  { id: "pay11", ref: "pi_3Qy3D92eZvKY", clientId: "c2", amount: 50, fee: 1.12, date: d(0), time: "07:58", description: "1-to-1 Personal Training", type: "Booking", method: "Visa •••• 8210", status: "paid" },
  { id: "pay12", ref: "pi_3Qy4E02eZvKY", clientId: "c7", amount: 80, fee: 1.56, date: d(-15), time: "12:12", description: "Group Training Pack", type: "Package", method: "Visa •••• 5540", status: "paid" },
];

export const conversations: Conversation[] = [
  {
    id: "cv1",
    clientId: "c1",
    unread: 2,
    kind: "direct",
    messages: [
      { id: "m1", from: "client", body: "Morning Alex — shoulder felt much better after Tuesday's session.", time: "08:12", date: d(-1) },
      { id: "m2", from: "business", body: "Great to hear. We'll keep the landmine press in for another fortnight and reassess.", time: "08:20", date: d(-1) },
      { id: "m3", from: "client", body: "Perfect. Also, can I move Thursday to 07:30?", time: "18:44", date: d(0) },
      { id: "m4", from: "client", body: "And I think I'm down to my last credit?", time: "18:45", date: d(0) },
    ],
  },
  {
    id: "cv2",
    clientId: "c4",
    unread: 0,
    kind: "direct",
    messages: [
      { id: "m5", from: "business", body: "Hi Daniel, your assessment is booked for 11:00 today at Westfield. Payment is still outstanding.", time: "09:02", date: d(0) },
      { id: "m6", from: "client", body: "Thanks — I'll settle it when I arrive.", time: "09:30", date: d(0) },
    ],
  },
  {
    id: "cv3",
    clientId: "c5",
    unread: 0,
    kind: "direct",
    messages: [
      { id: "m7", from: "client", body: "My package expires this week — what are my options?", time: "20:11", date: d(-2) },
      { id: "m8", from: "business", body: "You've a monthly package ending Friday. I can roll the balance into a new block if you renew before then.", time: "20:35", date: d(-2) },
    ],
  },
  {
    id: "cv4",
    clientId: "c7",
    unread: 0,
    kind: "announcement",
    title: "Small Group Strength — 17:30",
    messages: [
      { id: "m9", from: "business", body: "Tonight's 17:30 group is running in Studio 2 — the main floor is being resurfaced.", time: "12:00", date: d(0) },
    ],
  },
];

export const revenueSeries = [
  { month: "Feb", revenue: 6120, bookings: 142 },
  { month: "Mar", revenue: 6840, bookings: 156 },
  { month: "Apr", revenue: 7310, bookings: 161 },
  { month: "May", revenue: 6980, bookings: 154 },
  { month: "Jun", revenue: 7860, bookings: 172 },
  { month: "Jul", revenue: 8420, bookings: 186 },
];

export const platformBusinesses = [
  { name: "Peak Performance Training", industry: "Personal Training", plan: "Growth", staff: 4, locations: 2, bookings: 186, subscription: "Active", payments: "Connected" },
  { name: "Apex Auto Detailing", industry: "Car Detailing", plan: "Growth", staff: 4, locations: 2, bookings: 74, subscription: "Active", payments: "Connected" },
  { name: "North & Blade Barbers", industry: "Barbershop", plan: "Scale", staff: 4, locations: 2, bookings: 462, subscription: "Active", payments: "Connected" },
  { name: "Studio Eight Beauty", industry: "Beauty and Wellness", plan: "Growth", staff: 5, locations: 2, bookings: 342, subscription: "Active", payments: "Action required" },
  { name: "Northside Tutors", industry: "Tutoring", plan: "Starter", staff: 6, locations: 1, bookings: 214, subscription: "Active", payments: "Connected" },
  { name: "Momentum Sports Coaching", industry: "Sports Coaching", plan: "Scale", staff: 11, locations: 4, bookings: 618, subscription: "Active", payments: "Connected" },
  { name: "Harbour Therapy Rooms", industry: "Beauty and Wellness", plan: "Starter", staff: 3, locations: 1, bookings: 96, subscription: "Past due", payments: "Action required" },
];

export const platformIndustryBreakdown = [
  { industry: "Personal Training", businesses: 14 },
  { industry: "Barbershops", businesses: 8 },
  { industry: "Car Detailing", businesses: 6 },
  { industry: "Beauty and Wellness", businesses: 5 },
  { industry: "Other", businesses: 5 },
];

export const ptTerms: Terminology = {
  staff: "Trainer",
  staffPlural: "Trainers",
  service: "Session type",
  servicePlural: "Sessions",
  booking: "Session",
  bookingPlural: "Sessions",
  customer: "Client",
  customerPlural: "Clients",
  location: "Gym",
  locationPlural: "Gyms",
  package: "Training package",
  packagePlural: "Training packages",
};

export const ptCustomerFields: CustomFieldDef[] = [
  { id: "cf-goal", label: "Training goal", type: "select", required: true, staffOnly: false, inRegistration: true, inBooking: false, searchable: true, options: ["Fat loss", "Strength", "Sport performance", "Rehab", "General fitness"] },
  { id: "cf-time", label: "Preferred session time", type: "select", required: false, staffOnly: false, inRegistration: true, inBooking: true, searchable: false, options: ["Early morning", "Daytime", "Evening", "Weekend"] },
  { id: "cf-notes", label: "Coaching notes", type: "textarea", required: false, staffOnly: true, inRegistration: false, inBooking: false, searchable: false },
];

export const ptCustomRecord: CustomRecordConfig = {
  enabled: false,
  singular: "Participant profile",
  plural: "Participant profiles",
  icon: "UserRound",
  multiplePerCustomer: true,
  requiredAtBooking: false,
  customerCanCreate: true,
  customerCanEdit: true,
  active: false,
  fields: [
    { id: "pf-name", label: "Participant name", type: "text", required: true, staffOnly: false, inRegistration: false, inBooking: true, searchable: true },
    { id: "pf-dob", label: "Date of birth", type: "date", required: false, staffOnly: false, inRegistration: false, inBooking: false, searchable: false },
  ],
};

export const ptDashboard = {
  greeting: "Good morning, Alex",
  headline: [
    { label: "Revenue this month", value: "£8,420", change: 7.2, hint: "vs £7,860" },
    { label: "Sessions this month", value: "186", change: 8.1, hint: "vs 172" },
    { label: "Active clients", value: "74", change: 4.2, hint: "vs 71" },
    { label: "Attendance rate", value: "92%", change: -1.4, hint: "vs 93.4%" },
  ],
  industryCards: [
    { label: "Credits expiring this week", value: "3", hint: "3 clients" },
    { label: "Group spaces left today", value: "6", hint: "across 2 sessions" },
    { label: "Unpaid sessions", value: "2", hint: "£85 outstanding" },
    { label: "Availability gaps", value: "4", hint: "peak slots unfilled" },
    { label: "No-shows this month", value: "5", hint: "2.7% of sessions" },
  ],
};


export const initialState = () => ({
  bookings: bookings.map((b) => ({ ...b })),
  clients: clients.map((c) => ({ ...c, notes: [...c.notes] })),
  clientPackages: clientPackages.map((p) => ({ ...p })),
  payments: payments.map((p) => ({ ...p })),
  conversations: conversations.map((c) => ({ ...c, messages: [...c.messages] })),
  ledger: ledger.map((l) => ({ ...l })),
  services: services.map((s) => ({ ...s })),
  packageDefs: packageDefs.map((p) => ({ ...p })),
  staff: staff.map((s) => ({ ...s })),
  locations: locations.map((l) => ({ ...l })),
  blockedTimes: blockedTimes.map((b) => ({ ...b })),
  records: [] as CustomRecord[],
  customRecord: { ...ptCustomRecord, fields: ptCustomRecord.fields.map((f) => ({ ...f })) },
  customerFields: ptCustomerFields.map((f) => ({ ...f })),
  terms: { ...ptTerms },
});
