/**
 * Column mapping for customer CSV imports (RECA-529). Source headers are matched to
 * target fields by synonym; the user can override every column in the wizard.
 */

export const IMPORT_TARGETS = [
  "firstName",
  "lastName",
  "fullName",
  "nickname",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postcode",
  "country",
  "notes",
  "tags",
  "marketingConsent",
  "operationalNotifications",
  "externalId",
  "vehicleRegistration",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehicleColour",
] as const;

export type ImportTarget = (typeof IMPORT_TARGETS)[number];
/** `null` = don't import this column. */
export type ColumnMapping = Record<number, ImportTarget | null>;

export const TARGET_LABELS: Record<ImportTarget, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (split into first/last)",
  nickname: "Known as",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "Town / city",
  region: "County / region",
  postcode: "Postcode",
  country: "Country",
  notes: "Notes",
  tags: "Tags (comma or ; separated)",
  marketingConsent: "Marketing consent (yes/no)",
  operationalNotifications: "Booking reminders (yes/no)",
  externalId: "External id",
  vehicleRegistration: "Vehicle registration",
  vehicleMake: "Vehicle make",
  vehicleModel: "Vehicle model",
  vehicleYear: "Vehicle year",
  vehicleColour: "Vehicle colour",
};

/** Column order for the downloadable template; each maps 1:1 onto a target. */
export const TEMPLATE_COLUMNS: { header: string; target: ImportTarget }[] = [
  { header: "First name", target: "firstName" },
  { header: "Last name", target: "lastName" },
  { header: "Known as", target: "nickname" },
  { header: "Email", target: "email" },
  { header: "Phone", target: "phone" },
  { header: "Address line 1", target: "addressLine1" },
  { header: "Address line 2", target: "addressLine2" },
  { header: "Town", target: "city" },
  { header: "County", target: "region" },
  { header: "Postcode", target: "postcode" },
  { header: "Country", target: "country" },
  { header: "Notes", target: "notes" },
  { header: "Tags", target: "tags" },
  { header: "Marketing consent", target: "marketingConsent" },
  { header: "Booking reminders", target: "operationalNotifications" },
  { header: "Vehicle registration", target: "vehicleRegistration" },
  { header: "Vehicle make", target: "vehicleMake" },
  { header: "Vehicle model", target: "vehicleModel" },
  { header: "Vehicle year", target: "vehicleYear" },
  { header: "Vehicle colour", target: "vehicleColour" },
];

export const TEMPLATE_EXAMPLE_ROW: string[] = [
  "Harriet",
  "Cole",
  "Harriet – red Audi",
  "harriet.cole@example.co.uk",
  "07700 900123",
  "12 High Street",
  "",
  "Leeds",
  "West Yorkshire",
  "LS1 1AA",
  "GB",
  "Prefers Saturday mornings",
  "VIP; Audi",
  "yes",
  "yes",
  "AB12 CDE",
  "Audi",
  "A3",
  "2021",
  "Red",
];

/**
 * Header synonyms, matched after normalising to lowercase alphanumerics. Order matters
 * where one header could mean two things; the first hit wins.
 */
const SYNONYMS: [ImportTarget, string[]][] = [
  ["firstName", ["firstname", "first", "forename", "givenname"]],
  ["lastName", ["lastname", "last", "surname", "familyname"]],
  [
    "fullName",
    ["name", "fullname", "customername", "clientname", "customer", "client", "contactname"],
  ],
  ["nickname", ["nickname", "knownas", "alias", "displayname", "preferredname"]],
  ["email", ["email", "emailaddress", "e-mail", "mail"]],
  [
    "phone",
    [
      "phone",
      "phonenumber",
      "mobile",
      "mobilenumber",
      "telephone",
      "tel",
      "cell",
      "cellphone",
      "contactnumber",
    ],
  ],
  ["addressLine1", ["addressline1", "address1", "address", "street", "streetaddress", "line1"]],
  ["addressLine2", ["addressline2", "address2", "line2"]],
  ["city", ["city", "town", "towncity", "locality"]],
  ["region", ["region", "county", "state", "province", "stateprovince"]],
  ["postcode", ["postcode", "postalcode", "zip", "zipcode", "postal"]],
  ["country", ["country", "countrycode"]],
  ["notes", ["notes", "note", "comments", "comment", "remarks"]],
  ["tags", ["tags", "tag", "labels", "groups", "segments"]],
  [
    "marketingConsent",
    [
      "marketingconsent",
      "marketing",
      "receivenewsandoffers",
      "newsandoffers",
      "newsletter",
      "marketingoptin",
      "optin",
    ],
  ],
  [
    "operationalNotifications",
    [
      "receivereminders",
      "reminders",
      "bookingreminders",
      "notifications",
      "operationalnotifications",
    ],
  ],
  [
    "externalId",
    ["id", "customerid", "clientid", "externalid", "ref", "reference", "quickbookscustomerid"],
  ],
  [
    "vehicleRegistration",
    [
      "registration",
      "reg",
      "regno",
      "numberplate",
      "plate",
      "licenceplate",
      "licenseplate",
      "vehicleregistration",
      "vrm",
    ],
  ],
  ["vehicleMake", ["make", "vehiclemake", "carmake", "manufacturer"]],
  ["vehicleModel", ["model", "vehiclemodel", "carmodel"]],
  ["vehicleYear", ["year", "vehicleyear", "caryear", "modelyear"]],
  ["vehicleColour", ["colour", "color", "vehiclecolour", "vehiclecolor", "carcolour"]],
];

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Best-guess mapping for a header row. Each target is used at most once. */
export function autoMap(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<ImportTarget>();
  headers.forEach((header, index) => {
    const key = normaliseHeader(header);
    let hit: ImportTarget | null = null;
    for (const [target, names] of SYNONYMS) {
      if (names.includes(key) && !taken.has(target)) {
        hit = target;
        break;
      }
    }
    if (hit) taken.add(hit);
    mapping[index] = hit;
  });
  // A file with both a full name and first/last: prefer the split columns.
  const targets = Object.values(mapping);
  if (targets.includes("fullName") && targets.includes("firstName")) {
    for (const [i, t] of Object.entries(mapping)) if (t === "fullName") mapping[Number(i)] = null;
  }
  return mapping;
}

export type ImportAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
};

export type ImportRow = {
  firstName: string;
  lastName?: string | null;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: ImportAddress | null;
  notes?: string | null;
  tags?: string[];
  marketingConsent?: boolean;
  operationalNotifications?: boolean;
  externalId?: string | null;
  vehicle?: {
    registration?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    colour?: string | null;
  } | null;
};

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "on", "opted in", "optedin", "subscribed"]);
const FALSE_WORDS = new Set([
  "false",
  "no",
  "n",
  "0",
  "off",
  "opted out",
  "optedout",
  "unsubscribed",
]);

/** `undefined` when the cell is blank or unrecognised so the server default applies. */
export function parseYesNo(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return undefined;
}

function cell(row: string[], index: number): string {
  return (row[index] ?? "").trim();
}

function blankToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

/** Splits "Harriet Cole" → first "Harriet", last "Cole"; a single word stays the first name. */
export function splitFullName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/** Builds the API row for one CSV record from the chosen mapping. */
export function buildImportRow(record: string[], mapping: ColumnMapping): ImportRow {
  const get = (target: ImportTarget): string => {
    for (const [index, t] of Object.entries(mapping)) {
      if (t === target) return cell(record, Number(index));
    }
    return "";
  };
  const has = (target: ImportTarget) => Object.values(mapping).includes(target);

  let firstName = get("firstName");
  let lastName: string | null = blankToNull(get("lastName"));
  if (!has("firstName") && has("fullName")) {
    const split = splitFullName(get("fullName"));
    firstName = split.firstName;
    lastName = lastName ?? split.lastName;
  }

  const address: ImportAddress = {
    line1: blankToNull(get("addressLine1")),
    line2: blankToNull(get("addressLine2")),
    city: blankToNull(get("city")),
    region: blankToNull(get("region")),
    postcode: blankToNull(get("postcode")),
    country: blankToNull(get("country")),
  };
  const hasAddress = Object.values(address).some(Boolean);

  const tags = get("tags")
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const yearRaw = get("vehicleYear");
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const vehicle = {
    registration: blankToNull(get("vehicleRegistration")),
    make: blankToNull(get("vehicleMake")),
    model: blankToNull(get("vehicleModel")),
    year,
    colour: blankToNull(get("vehicleColour")),
  };
  const hasVehicle = Object.values(vehicle).some((v) => v !== null);

  const marketing = has("marketingConsent") ? parseYesNo(get("marketingConsent")) : undefined;
  const reminders = has("operationalNotifications")
    ? parseYesNo(get("operationalNotifications"))
    : undefined;

  return {
    firstName,
    lastName,
    nickname: blankToNull(get("nickname")),
    email: blankToNull(get("email")),
    phone: blankToNull(get("phone")),
    address: hasAddress ? address : null,
    notes: blankToNull(get("notes")),
    ...(tags.length > 0 ? { tags } : {}),
    ...(marketing !== undefined ? { marketingConsent: marketing } : {}),
    ...(reminders !== undefined ? { operationalNotifications: reminders } : {}),
    externalId: blankToNull(get("externalId")),
    vehicle: hasVehicle ? vehicle : null,
  };
}

/** True when the mapping can produce a first name for every row. */
export function mappingHasName(mapping: ColumnMapping): boolean {
  const targets = Object.values(mapping);
  return targets.includes("firstName") || targets.includes("fullName");
}
