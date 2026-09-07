/**
 * Demo Strength Co — the one dataset every journey runs against.
 *
 * A single coherent studio rather than per-spec fixtures, for two reasons. A
 * booking made in the customer journey has to be the same booking the staff
 * journey finds in the diary, which only works if both read the same store. And
 * a shared dataset gets exercised from every angle, so a field that is subtly
 * wrong surfaces on some screen rather than hiding in a fixture only one test
 * ever reads.
 *
 * Dates are relative to the moment the suite starts: a fixture pinned to a
 * literal date drifts into the past and quietly stops producing "upcoming"
 * bookings.
 */

const CURRENCY = "GBP";
export const TIMEZONE = "Europe/London";

const NOW = new Date();

/** Midnight UTC today, so day bucketing does not depend on the clock. */
function midnight(offsetDays: number): Date {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** An instant `days` from today at `hour` UTC, as RFC 3339. */
export function at(days: number, hour: number, minute = 0): string {
  const d = midnight(days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

const plusMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const iso = (days: number) => midnight(days).toISOString().slice(0, 10);

export const ids = {
  business: "biz_demo_strength",
  owner: "usr_owner",
  reception: "usr_reception",
  restricted: "usr_restricted",
  finance: "usr_finance",
  trainerAlex: "stf_alex",
  trainerJo: "stf_jo",
  locationNorth: "loc_north",
  locationMobile: "loc_mobile",
  serviceOneToOne: "svc_1to1",
  serviceAssessment: "svc_assessment",
  serviceSmallGroup: "svc_group",
  serviceOnline: "svc_online",
  packageTen: "pkg_ten",
  customerPriya: "cus_priya",
  customerTom: "cus_tom",
  customerSam: "cus_sam",
  customerNina: "cus_nina",
  customerOmar: "cus_omar",
  customerElla: "cus_ella",
} as const;

export const business = {
  id: ids.business,
  slug: "demo-strength",
  legalName: "Demo Strength Co Ltd",
  tradingName: "Demo Strength Co",
  industryTemplateKey: "personal_training",
  currency: CURRENCY,
  defaultTimezone: TIMEZONE,
  locale: "en-GB",
  status: "active",
  onboardingState: "complete",
  closedAt: null,
  closureExportUntil: null,
  deletionScheduledAt: null,
  statusReason: null,
  version: 3,
  createdAt: at(-400, 9),
  updatedAt: at(-2, 9),
};

export const businessSummary = {
  id: business.id,
  slug: business.slug,
  tradingName: business.tradingName,
  roleKeys: ["business_owner"],
};

export const configuration = {
  businessId: business.id,
  terminology: {
    staff: "Trainers",
    service: "Session",
    booking: "Session",
    linkedRecord: "Health questionnaire",
  },
  booking: { cancellationWindowHours: 24, defaultHoldMinutes: 10 },
  tax: { vatRegistered: true, vatNumber: "GB123456789" },
  retention: { closureWindowDays: 30, fileRetentionDays: 365 },
  legalAddress: {
    line1: "14 Bridge Street",
    line2: null,
    city: "Manchester",
    region: null,
    postalCode: "M3 3AB",
    country: "GB",
  },
};

/** Who can sign in, and what each of them is allowed to see. */
export const personas = {
  owner: {
    id: ids.owner,
    email: "owner@demo-strength.test",
    firstName: "Ada",
    lastName: "Okafor",
    roleKeys: ["business_owner"],
  },
  reception: {
    id: ids.reception,
    email: "reception@demo-strength.test",
    firstName: "Ravi",
    lastName: "Shah",
    roleKeys: ["reception"],
  },
  restricted: {
    id: ids.restricted,
    email: "coach@demo-strength.test",
    firstName: "Kim",
    lastName: "Berg",
    roleKeys: ["restricted_staff"],
  },
  finance: {
    id: ids.finance,
    email: "finance@demo-strength.test",
    firstName: "Noor",
    lastName: "Haddad",
    roleKeys: ["finance"],
  },
  /** A customer with purchases but no staff membership anywhere. */
  customer: {
    id: "usr_priya",
    email: "priya@example.test",
    firstName: "Priya",
    lastName: "Nair",
    roleKeys: [],
  },
  /** Signed in, but attached to nothing at all — the NoCustomerAccount case. */
  stranger: {
    id: "usr_stranger",
    email: "stranger@example.test",
    firstName: null,
    lastName: null,
    roleKeys: [],
  },
} as const;

export type PersonaKey = keyof typeof personas;

export const users = Object.fromEntries(
  Object.entries(personas).map(([key, p]) => [
    key,
    {
      id: p.id,
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      emailVerified: true,
      status: "active",
    },
  ]),
) as Record<
  PersonaKey,
  {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    emailVerified: boolean;
    status: string;
  }
>;

export const memberships = (["owner", "reception", "restricted", "finance"] as const).map(
  (key, index) => ({
    id: `mem_${key}`,
    businessId: business.id,
    userId: personas[key].id,
    staffId: key === "restricted" ? ids.trainerJo : null,
    status: "active",
    roleKeys: [...personas[key].roleKeys],
    locationScopeIds: null,
    joinedAt: at(-300 + index, 9),
    createdAt: at(-300 + index, 9),
    updatedAt: at(-300 + index, 9),
    user: {
      id: personas[key].id,
      email: personas[key].email,
      firstName: personas[key].firstName,
      lastName: personas[key].lastName,
    },
  }),
);

const weekdayHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  openMinute: 6 * 60,
  closeMinute: 20 * 60,
}));

export const locations = [
  {
    id: ids.locationNorth,
    businessId: business.id,
    name: "Northside Studio",
    type: "physical",
    timezone: TIMEZONE,
    openingHours: [...weekdayHours, { dayOfWeek: 6, openMinute: 8 * 60, closeMinute: 14 * 60 }],
    active: true,
    publicVisible: true,
    version: 1,
    createdAt: at(-395, 9),
    updatedAt: at(-100, 9),
  },
  {
    id: ids.locationMobile,
    businessId: business.id,
    name: "Client's home",
    type: "customer_address",
    timezone: TIMEZONE,
    openingHours: weekdayHours,
    active: true,
    publicVisible: false,
    version: 1,
    createdAt: at(-380, 9),
    updatedAt: at(-100, 9),
  },
];

const workingRules = (locationId: string) =>
  [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 7 * 60,
    endMinute: 19 * 60,
    locationId,
  }));

export const staff = [
  {
    id: ids.trainerAlex,
    businessId: business.id,
    userId: ids.owner,
    displayName: "Alex Rivera",
    title: "Head coach",
    bio: "Strength and conditioning, 12 years.",
    locationIds: [ids.locationNorth, ids.locationMobile],
    eligibleServiceIds: [ids.serviceOneToOne, ids.serviceAssessment, ids.serviceSmallGroup],
    workingRules: workingRules(ids.locationNorth),
    timeOff: [],
    bookingVisible: true,
    calendarColour: "#2563eb",
    status: "active",
    version: 2,
    createdAt: at(-390, 9),
    updatedAt: at(-30, 9),
  },
  {
    id: ids.trainerJo,
    businessId: business.id,
    userId: ids.restricted,
    displayName: "Jo Mensah",
    title: "Coach",
    bio: "Rehab and mobility.",
    locationIds: [ids.locationNorth],
    eligibleServiceIds: [ids.serviceOneToOne, ids.serviceOnline],
    workingRules: workingRules(ids.locationNorth),
    timeOff: [
      {
        id: "off_1",
        start: at(21, 0),
        end: at(28, 0),
        originatingTimezone: TIMEZONE,
        reason: "Annual leave",
      },
    ],
    bookingVisible: true,
    calendarColour: "#059669",
    status: "active",
    version: 2,
    createdAt: at(-200, 9),
    updatedAt: at(-30, 9),
  },
];

/**
 * The fixture shapes are spelled out rather than borrowed from
 * `src/lib/api/types`, so that a change to the real types shows up here as a
 * failing assertion about behaviour rather than silently reshaping the data
 * every spec depends on. They only carry the fields the portal reads.
 */
type FixtureService = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  basePriceMinor: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  capacityMin: number;
  capacityMax: number;
  bookingMode: string;
  currency: string;
  taxBehaviour: string;
  depositMinor: number | null;
  eligibleStaffIds: string[];
  locationIds: string[];
  requiredResourceType: string | null;
  bookingNoticeMinutes: number;
  bookingHorizonDays: number;
  cancellationPolicy: { windowHours: number };
  requiresLinkedRecord: boolean;
  variants: unknown[];
  publicVisible: boolean;
  active: boolean;
  colour: string;
  displayOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type FixtureCustomer = {
  id: string;
  businessId: string;
  userId: string | null;
  firstName: string;
  lastName: string | null;
  emailDisplay: string | null;
  emailNormalised: string | null;
  phoneDisplay: string | null;
  phoneNormalised: string | null;
  contactPreferences: { preferredChannel: string; operationalNotifications: boolean };
  marketingConsent: { granted: boolean; updatedAt: string | null; source: string | null };
  status: string;
  tags: string[];
  createdSource: string;
  acquisitionSource: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * The four fields every service must state are required; the rest fall back to
 * a sensible studio default. Declaring the return type keeps `services[0].name`
 * a real property at the call sites.
 */
function makeService(
  over: Partial<FixtureService> &
    Pick<FixtureService, "id" | "name" | "durationMinutes" | "basePriceMinor">,
): FixtureService {
  return {
    businessId: business.id,
    description: null,
    category: null,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 5,
    capacityMin: 1,
    capacityMax: 1,
    bookingMode: "individual",
    currency: CURRENCY,
    taxBehaviour: "inclusive",
    depositMinor: null,
    eligibleStaffIds: [ids.trainerAlex, ids.trainerJo],
    locationIds: [ids.locationNorth],
    requiredResourceType: null,
    bookingNoticeMinutes: 120,
    bookingHorizonDays: 60,
    cancellationPolicy: { windowHours: 24 },
    requiresLinkedRecord: false,
    variants: [],
    publicVisible: true,
    active: true,
    colour: "#2563eb",
    displayOrder: 0,
    version: 1,
    createdAt: at(-380, 9),
    updatedAt: at(-40, 9),
    ...over,
  };
}

export const services = [
  makeService({
    id: ids.serviceOneToOne,
    name: "1:1 Personal Training",
    description: "One hour, one coach, your programme.",
    category: "Training",
    durationMinutes: 60,
    basePriceMinor: 5500,
    displayOrder: 0,
  }),
  makeService({
    id: ids.serviceAssessment,
    name: "Movement Assessment",
    description: "A 45-minute baseline before your first block.",
    category: "Training",
    durationMinutes: 45,
    basePriceMinor: 4000,
    displayOrder: 1,
  }),
  makeService({
    id: ids.serviceSmallGroup,
    name: "Small Group Strength",
    description: "Up to four people, same session.",
    category: "Group",
    durationMinutes: 60,
    basePriceMinor: 2200,
    capacityMax: 4,
    bookingMode: "group",
    displayOrder: 2,
  }),
  makeService({
    id: ids.serviceOnline,
    name: "Online Check-in",
    description: "Not bookable online — arranged with your coach.",
    category: "Remote",
    durationMinutes: 30,
    basePriceMinor: 2500,
    publicVisible: false,
    eligibleStaffIds: [ids.trainerJo],
    displayOrder: 3,
  }),
];

export const packages = [
  {
    id: ids.packageTen,
    businessId: business.id,
    name: "10-Session Block",
    description: "Ten 1:1 sessions, six months to use them.",
    priceMinor: 49500,
    currency: CURRENCY,
    taxBehaviour: "inclusive",
    creditsIssued: 10,
    eligibleServiceIds: [ids.serviceOneToOne],
    validity: { kind: "calendar_months", amount: 6 },
    transferable: false,
    salesAvailable: true,
    termsVersion: 1,
    active: true,
    version: 1,
    createdAt: at(-300, 9),
    updatedAt: at(-60, 9),
  },
];

function makeCustomer(
  over: Partial<FixtureCustomer> & Pick<FixtureCustomer, "id" | "firstName">,
): FixtureCustomer {
  return {
    businessId: business.id,
    userId: null,
    lastName: null,
    emailDisplay: null,
    emailNormalised: null,
    phoneDisplay: null,
    phoneNormalised: null,
    contactPreferences: { preferredChannel: "email", operationalNotifications: true },
    marketingConsent: { granted: false, updatedAt: null, source: null },
    status: "active",
    tags: [],
    createdSource: "staff",
    acquisitionSource: null,
    version: 1,
    createdAt: at(-200, 9),
    updatedAt: at(-10, 9),
    ...over,
  };
}

export const customers = [
  makeCustomer({
    id: ids.customerPriya,
    userId: personas.customer.id,
    firstName: "Priya",
    lastName: "Nair",
    emailDisplay: "priya@example.test",
    emailNormalised: "priya@example.test",
    phoneDisplay: "07700 900101",
    phoneNormalised: "+447700900101",
    tags: ["Member"],
    createdSource: "public_booking",
  }),
  makeCustomer({
    id: ids.customerTom,
    firstName: "Tom",
    lastName: "Whitfield",
    emailDisplay: "tom@example.test",
    emailNormalised: "tom@example.test",
    phoneDisplay: "07700 900102",
  }),
  makeCustomer({
    id: ids.customerSam,
    firstName: "Sam",
    lastName: "Okonkwo",
    emailDisplay: "sam@example.test",
    emailNormalised: "sam@example.test",
    tags: ["Rehab"],
  }),
  makeCustomer({
    id: ids.customerNina,
    firstName: "Nina",
    lastName: "Sorensen",
    emailDisplay: "nina@example.test",
    emailNormalised: "nina@example.test",
  }),
  makeCustomer({
    id: ids.customerOmar,
    firstName: "Omar",
    lastName: "Haddad",
    emailDisplay: "omar@example.test",
    emailNormalised: "omar@example.test",
  }),
  makeCustomer({
    id: ids.customerElla,
    firstName: "Ella",
    lastName: "Brannigan",
    emailDisplay: "ella@example.test",
    emailNormalised: "ella@example.test",
    status: "archived",
  }),
];

function serviceSnapshot(serviceId: string) {
  const service = services.find((s) => s.id === serviceId)!;
  return {
    serviceId: service.id,
    serviceVersion: service.version,
    name: service.name,
    variantId: null,
    variantName: null,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    capacityMin: service.capacityMin,
    capacityMax: service.capacityMax,
    bookingMode: service.bookingMode,
    priceMinor: service.basePriceMinor,
    currency: service.currency,
    taxBehaviour: service.taxBehaviour,
    requiredResourceType: null,
    cancellationPolicy: service.cancellationPolicy,
    requiresLinkedRecord: false,
  };
}

let bookingSeq = 0;

export function makeBooking(over: {
  id?: string;
  serviceId?: string;
  staffId?: string;
  locationId?: string;
  customerId?: string;
  start: string;
  status?: string;
  attendanceStatus?: string;
  paymentMethod?: string;
  holdExpiresAt?: string | null;
  notesCustomer?: string | null;
}) {
  bookingSeq += 1;
  const serviceId = over.serviceId ?? ids.serviceOneToOne;
  const snapshot = serviceSnapshot(serviceId);
  const customerId = over.customerId ?? ids.customerPriya;
  const customer = customers.find((c) => c.id === customerId)!;
  const end = plusMinutes(over.start, snapshot.durationMinutes);
  return {
    id: over.id ?? `bkg_${bookingSeq}`,
    businessId: business.id,
    reference: `DS-${String(1000 + bookingSeq)}`,
    serviceSnapshot: snapshot,
    locationId: over.locationId ?? ids.locationNorth,
    timezone: TIMEZONE,
    staffId: over.staffId ?? ids.trainerAlex,
    resourceId: null,
    occurrenceId: null,
    start: over.start,
    end,
    occupiedStart: plusMinutes(over.start, -snapshot.bufferBeforeMinutes),
    occupiedEnd: plusMinutes(end, snapshot.bufferAfterMinutes),
    leadCustomerId: customerId,
    linkedRecordId: null,
    attendees: [
      {
        id: `att_${bookingSeq}`,
        name: `${customer.firstName} ${customer.lastName ?? ""}`.trim(),
        isLead: true,
        customerId,
      },
    ],
    seatCount: 1,
    priceMinor: snapshot.priceMinor,
    currency: CURRENCY,
    status: over.status ?? "confirmed",
    paymentMethod: over.paymentMethod ?? "none",
    attendanceStatus: over.attendanceStatus ?? "unknown",
    cancellation: null,
    holdExpiresAt: over.holdExpiresAt ?? null,
    source: "staff",
    createdActorId: ids.owner,
    notesCustomer: over.notesCustomer ?? null,
    notesInternal: null,
    applicablePolicyDocumentIds: { cancellation: "pol_cancel", terms: "pol_terms" },
    version: 1,
    createdAt: at(-20, 9),
    updatedAt: at(-1, 9),
  };
}

/** A spread of past and upcoming sessions, so every filter has something. */
export const bookings = [
  makeBooking({
    id: "bkg_past_1",
    start: at(-14, 9),
    status: "completed",
    attendanceStatus: "attended",
  }),
  makeBooking({
    id: "bkg_past_2",
    start: at(-10, 10),
    customerId: ids.customerTom,
    status: "completed",
    attendanceStatus: "attended",
  }),
  makeBooking({
    id: "bkg_past_3",
    start: at(-7, 11),
    customerId: ids.customerSam,
    staffId: ids.trainerJo,
    status: "no_show",
    attendanceStatus: "no_show",
  }),
  makeBooking({
    id: "bkg_past_4",
    start: at(-3, 8),
    customerId: ids.customerNina,
    status: "cancelled_by_customer",
  }),
  makeBooking({ id: "bkg_today_1", start: at(0, 9), customerId: ids.customerPriya }),
  makeBooking({
    id: "bkg_today_2",
    start: at(0, 14),
    customerId: ids.customerTom,
    serviceId: ids.serviceSmallGroup,
    staffId: ids.trainerJo,
  }),
  makeBooking({
    id: "bkg_soon_1",
    start: at(2, 10),
    customerId: ids.customerPriya,
    paymentMethod: "credit",
    notesCustomer: "Knee still a bit sore.",
  }),
  makeBooking({
    id: "bkg_soon_2",
    start: at(4, 18),
    customerId: ids.customerOmar,
    serviceId: ids.serviceAssessment,
  }),
  makeBooking({
    id: "bkg_soon_3",
    start: at(9, 7),
    customerId: ids.customerSam,
    staffId: ids.trainerJo,
  }),
];

export const entitlements = [
  {
    entitlement: {
      id: "ent_priya_1",
      businessId: business.id,
      customerId: ids.customerPriya,
      purchaseId: "pur_priya_1",
      packageId: ids.packageTen,
      eligibleServiceIds: [ids.serviceOneToOne],
      unitsIssued: 10,
      expiresAt: at(150, 23),
      status: "active",
      createdAt: at(-30, 9),
    },
    balance: {
      entitlementId: "ent_priya_1",
      issued: 10,
      reserved: 1,
      consumed: 3,
      returned: 0,
      expired: 0,
      available: 6,
    },
  },
  {
    entitlement: {
      id: "ent_priya_0",
      businessId: business.id,
      customerId: ids.customerPriya,
      purchaseId: "pur_priya_0",
      packageId: ids.packageTen,
      eligibleServiceIds: [ids.serviceOneToOne],
      unitsIssued: 10,
      expiresAt: at(-20, 23),
      status: "expired",
      createdAt: at(-220, 9),
    },
    balance: {
      entitlementId: "ent_priya_0",
      issued: 10,
      reserved: 0,
      consumed: 8,
      returned: 0,
      expired: 2,
      available: 0,
    },
  },
];

function makePayment(over: Record<string, unknown> & { id: string }) {
  return {
    businessId: business.id,
    customerId: ids.customerPriya,
    bookingId: null,
    packagePurchaseId: null,
    packageId: null,
    provider: "stripe",
    providerPaymentId: "pi_test_123",
    currency: CURRENCY,
    amountRefundedMinor: 0,
    state: "succeeded",
    providerState: "succeeded",
    idempotencyKey: "idem_1",
    // Stripe puts a hosted receipt on every settled charge, and the customer's
    // purchases list is where they go looking for it.
    receiptUrl: "https://pay.stripe.com/receipts/test_receipt_0001",
    receiptNumber: "DS-R-0001",
    sellerLegalName: business.legalName,
    sellerVatNumber: "GB123456789",
    sellerVatRegistered: true,
    sellerAddressSnapshot: "14 Bridge Street, Manchester M3 3AB",
    taxTreatment: "vat_registered",
    documentKind: "receipt",
    createdAt: at(-30, 9),
    updatedAt: at(-30, 9),
    version: 1,
    ...over,
  };
}

export const payments = [
  makePayment({
    id: "pay_1",
    amountMinor: 49500,
    packageId: ids.packageTen,
    packagePurchaseId: "pur_priya_1",
    receiptNumber: "DS-R-0001",
  }),
  makePayment({
    id: "pay_2",
    customerId: ids.customerTom,
    amountMinor: 5500,
    bookingId: "bkg_past_2",
    createdAt: at(-10, 10),
    receiptNumber: "DS-R-0002",
  }),
  makePayment({
    id: "pay_3",
    customerId: ids.customerSam,
    amountMinor: 5500,
    bookingId: "bkg_past_3",
    state: "refunded",
    amountRefundedMinor: 5500,
    createdAt: at(-7, 11),
    receiptNumber: "DS-R-0003",
  }),
  makePayment({
    id: "pay_4",
    customerId: ids.customerOmar,
    amountMinor: 4000,
    state: "partially_refunded",
    amountRefundedMinor: 1000,
    createdAt: at(-5, 12),
    receiptNumber: "DS-R-0004",
  }),
];

export const dashboard = {
  basis: {
    timezone: TIMEZONE,
    currency: CURRENCY,
    dateBasis: "payment_date",
    includesRefundedRevenue: false,
    includesDisputedRevenue: false,
  },
  revenue: { grossMinor: 64500, refundedMinor: 6500, disputedMinor: 0, netMinor: 58000 },
  bookings: { count: 9, valueMinor: 43500 },
  attendance: { attended: 2, noShow: 1, cancelled: 1 },
  occupancy: { seats: 9, capacity: 24, rate: 0.375 },
  packages: { salesMinor: 49500 },
  credits: { issued: 20, expired: 2, redeemed: 11, outstanding: 6 },
};

export const conversations = [
  {
    id: "cnv_priya",
    businessId: business.id,
    customerId: ids.customerPriya,
    bookingId: "bkg_soon_1",
    createdAt: at(-6, 9),
    lastMessageAt: at(-1, 16),
  },
  {
    id: "cnv_tom",
    businessId: business.id,
    customerId: ids.customerTom,
    bookingId: null,
    createdAt: at(-20, 9),
    lastMessageAt: at(-12, 11),
  },
];

export const messages: Record<string, Array<Record<string, unknown>>> = {
  cnv_priya: [
    {
      id: "msg_1",
      businessId: business.id,
      conversationId: "cnv_priya",
      senderType: "customer",
      senderId: ids.customerPriya,
      body: "Could we push Thursday back half an hour?",
      createdAt: at(-2, 15),
      readByStaffAt: at(-2, 16),
      readByCustomerAt: at(-2, 15),
    },
    {
      id: "msg_2",
      businessId: business.id,
      conversationId: "cnv_priya",
      senderType: "staff",
      senderId: ids.owner,
      body: "Of course — moved you to 10:30.",
      createdAt: at(-1, 16),
      readByStaffAt: at(-1, 16),
      readByCustomerAt: null,
    },
  ],
  cnv_tom: [
    {
      id: "msg_3",
      businessId: business.id,
      conversationId: "cnv_tom",
      senderType: "staff",
      senderId: ids.owner,
      body: "Programme for next block is in your account.",
      createdAt: at(-12, 11),
      readByStaffAt: at(-12, 11),
      readByCustomerAt: at(-12, 12),
    },
  ],
};

export const notifications = [
  {
    id: "ntf_1",
    businessId: business.id,
    recipientType: "user",
    recipientId: ids.owner,
    channel: "in_app",
    templateKey: "booking.created",
    templateVersion: 1,
    subject: "New booking from Omar Haddad",
    body: "Movement Assessment, in four days.",
    bookingId: "bkg_soon_2",
    readAt: null,
    createdAt: at(-1, 12),
  },
  {
    id: "ntf_2",
    businessId: business.id,
    recipientType: "user",
    recipientId: ids.owner,
    channel: "in_app",
    templateKey: "payment.succeeded",
    templateVersion: 1,
    subject: "Payment received",
    body: "£495.00 from Priya Nair.",
    bookingId: null,
    readAt: at(-3, 9),
    createdAt: at(-30, 9),
  },
];

export const policyDocuments = [
  {
    id: "pol_cancel",
    businessId: business.id,
    type: "cancellation",
    version: 2,
    content: "Cancel at least 24 hours before your session for a full credit return.",
    objectKey: null,
    effectiveAt: at(-90, 0),
    status: "published",
    createdAt: at(-90, 0),
    updatedAt: at(-90, 0),
  },
  {
    id: "pol_terms",
    businessId: business.id,
    type: "terms",
    version: 1,
    content: "These terms cover your use of Demo Strength Co.",
    objectKey: null,
    effectiveAt: at(-90, 0),
    status: "published",
    createdAt: at(-90, 0),
    updatedAt: at(-90, 0),
  },
];

export const invitations = [
  {
    id: "inv_1",
    // The token is what appears in the emailed link, so specs need it by name.
    token: "invite_tok_newcoach",
    email: "newcoach@demo-strength.test",
    roleKeys: ["staff"],
    locationScopeIds: null,
    status: "pending",
    expiresAt: at(5, 12),
    createdAt: at(-2, 12),
  },
];

export const connectAccount = {
  businessId: business.id,
  provider: "stripe",
  accountId: "acct_test_demo",
  onboardingState: "complete",
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsDue: [],
  lastSyncedAt: at(-1, 9),
};

export const plans = [
  {
    code: "solo",
    name: "Solo",
    version: "2026-01",
    currency: CURRENCY,
    trialDays: 14,
    features: { onlineBooking: true, packages: true, reports: false },
    limits: { staff: 1, locations: 1 },
    prices: [
      { interval: "month", amountMinor: 2900 },
      { interval: "year", amountMinor: 29000 },
    ],
  },
  {
    code: "business",
    name: "Business",
    version: "2026-01",
    currency: CURRENCY,
    trialDays: 14,
    features: { onlineBooking: true, packages: true, reports: true },
    limits: { staff: 10, locations: 5 },
    prices: [
      { interval: "month", amountMinor: 5900 },
      { interval: "year", amountMinor: 59000 },
    ],
  },
  {
    code: "growth",
    name: "Growth",
    version: "2026-01",
    currency: CURRENCY,
    trialDays: 14,
    features: { onlineBooking: true, packages: true, reports: true },
    limits: { staff: 50, locations: 20 },
    prices: [
      { interval: "month", amountMinor: 11900 },
      { interval: "year", amountMinor: 119000 },
    ],
  },
];

/** The healthy default; the billing spec swaps in the locked variants. */
export const subscription = {
  id: "sub_demo",
  businessId: business.id,
  planId: "business",
  status: "active",
  accessState: "entitled",
  planVersion: "2026-01",
  currentPeriodStart: at(-10, 0),
  currentPeriodEnd: at(20, 0),
  trialStart: at(-40, 0),
  trialEnd: at(-26, 0),
  cancelAtPeriodEnd: false,
  limitCompliance: "ok",
  graceStartedAt: null,
  graceEndsAt: null,
};

export const subscriptionStates = {
  entitled: subscription,
  trial: {
    ...subscription,
    status: "trialing",
    accessState: "trial",
    trialStart: at(-3, 0),
    trialEnd: at(11, 0),
  },
  grace: {
    ...subscription,
    status: "past_due",
    accessState: "grace",
    graceStartedAt: at(-2, 0),
    graceEndsAt: at(5, 0),
  },
  restricted: { ...subscription, status: "unpaid", accessState: "restricted" },
  none: null,
};

/** The onboarding checklist for a studio that is fully set up. */
export const onboarding = {
  businessId: business.id,
  status: "in_progress",
  percentComplete: 100,
  requiredCompleted: 5,
  requiredTotal: 5,
  dismissedAt: null,
  version: 1,
  // Each step carries the page that completes it, as the API does — a
  // checklist that only names the task leaves someone hunting for where to do
  // it.
  steps: [
    { key: "location", title: "Add a training location", href: "/locations", required: true },
    { key: "staff_availability", title: "Set your availability", href: "/staff", required: true },
    { key: "service", title: "Create a session type", href: "/services", required: true },
    { key: "client", title: "Add your first client", href: "/clients", required: true },
    { key: "first_booking", title: "Book your first session", href: "/calendar", required: true },
    {
      key: "saas_subscription",
      title: "Choose your Recavo plan",
      href: "/billing",
      required: false,
    },
    { key: "public_booking", title: "Share your booking link", href: "/settings", required: false },
    { key: "stripe_connect", title: "Get paid", href: "/payments", required: false },
    { key: "policies", title: "Publish cancellation & terms", href: "/settings", required: false },
    { key: "package", title: "Offer a package", href: "/packages", required: false },
  ].map((step) => ({
    description: "",
    skipped: false,
    completed: step.key !== "package",
    completedAt: null,
    ...step,
  })),
};

/** A brand-new studio, for the onboarding journey. */
export const emptyOnboarding = {
  ...onboarding,
  percentComplete: 0,
  requiredCompleted: 0,
  steps: onboarding.steps.map((step) => ({ ...step, completed: false })),
};

/** Nothing left to do, so the checklist should take itself off the screen. */
export const completedOnboarding = {
  ...onboarding,
  status: "complete",
  steps: onboarding.steps.map((step) => ({ ...step, completed: true })),
};

// ---------------------------------------------------------------------------
// Public (customer-facing) projections of the same data
// ---------------------------------------------------------------------------

export const publicBusiness = {
  id: business.id,
  slug: business.slug,
  tradingName: business.tradingName,
  currency: CURRENCY,
  defaultTimezone: TIMEZONE,
  branding: { logoUrl: null, accentColour: "#2563eb" },
};

export const publicServices = services
  .filter((s) => s.publicVisible && s.active)
  .map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    durationMinutes: s.durationMinutes,
    basePriceMinor: s.basePriceMinor,
    currency: s.currency,
    colour: s.colour,
  }));

export const publicLocations = locations
  .filter((l) => l.publicVisible && l.active)
  .map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    timezone: l.timezone,
    openingHours: l.openingHours,
  }));

export const publicPackages = packages
  .filter((p) => p.active && p.salesAvailable)
  .map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceMinor: p.priceMinor,
    currency: p.currency,
    creditsIssued: p.creditsIssued,
    eligibleServiceIds: p.eligibleServiceIds,
    validity: p.validity,
  }));

/**
 * Bookable slots for the next fortnight: weekday mornings and evenings, always
 * at least two days out so the 120-minute booking notice never empties the
 * first day a test looks at.
 */
/**
 * Bookable times for the next fortnight.
 *
 * Every day is open, including weekends. A real studio would close on some of
 * them, but the booking flow opens on tomorrow's date, and a fixture that
 * skipped Sundays would put the suite's first step on an empty grid whenever it
 * ran on a Saturday. Specs that need an empty day say so explicitly instead.
 */
export function availabilitySlots(serviceId: string = ids.serviceOneToOne, dayCount = 14) {
  const service = services.find((s) => s.id === serviceId)!;
  const slots: Array<Record<string, unknown>> = [];
  for (let day = 1; day <= dayCount; day += 1) {
    for (const hour of [8, 9, 12, 17, 18]) {
      const start = at(day, hour);
      slots.push({
        serviceId,
        start,
        end: plusMinutes(start, service.durationMinutes),
        displayTimezone: TIMEZONE,
        staffId: hour < 12 ? ids.trainerAlex : ids.trainerJo,
        locationId: ids.locationNorth,
        remainingCapacity: service.capacityMax,
        priceMinor: service.basePriceMinor,
        currency: CURRENCY,
        slotToken: `slot_${serviceId}_${iso(day)}_${hour}`,
      });
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Customer portal projections
// ---------------------------------------------------------------------------

export const portalBusinesses = [
  { id: business.id, slug: business.slug, tradingName: business.tradingName },
];

export const portalCustomer = {
  id: ids.customerPriya,
  businessId: business.id,
  firstName: "Priya",
  lastName: "Nair",
  emailDisplay: "priya@example.test",
  phoneDisplay: "07700 900101",
  status: "active",
};

export const portalBookings = bookings.filter((b) => b.leadCustomerId === ids.customerPriya);

export const portalCredits = [
  {
    id: "ent_priya_1",
    packageId: ids.packageTen,
    eligibleServiceIds: [ids.serviceOneToOne],
    unitsIssued: 10,
    available: 6,
    reserved: 1,
    expiresAt: at(150, 23),
    status: "active",
  },
];

export const portalPayments = payments.filter((p) => p.customerId === ids.customerPriya);

/** A guest purchase waiting to be attached to an account. */
export const claim = {
  token: "claim_demo_token",
  businessId: business.id,
  customerId: ids.customerPriya,
};
