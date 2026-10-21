/**
 * The Settings index (RECAVO-settings-redesign-spec §1): groups, the pages in
 * each, what each needs to be seen, the words "Search settings" matches on, and
 * where every old `?tab=` link goes. Pure data and functions so the layout and
 * the redirect route share one model and it can be unit tested.
 */

export type SettingsPageKey =
  | "profile"
  | "security"
  | "device"
  | "business"
  | "team"
  | "policies"
  | "booking-rules"
  | "branding"
  | "calendar"
  | "tax"
  | "client-messages"
  | "get-paid"
  | "plan"
  | "activity";

export type SettingsGroupKey = "account" | "business" | "how" | "clients" | "money" | "records";

export type SettingsNavItem = {
  key: SettingsPageKey;
  label: string;
  /** One line under the item on the phone index. */
  hint: string;
  /** Page description under the title. */
  description: string;
  /**
   * Names of settings inside the page, so a search for "VAT" finds Tax and
   * address even though neither word is in its label.
   */
  keywords: readonly string[];
  /** Permission needed to see the page at all. Pages without one are open to every member. */
  requires?: "audit.read" | "billing.manage";
};

export type SettingsNavGroup = {
  key: SettingsGroupKey;
  label: string;
  items: readonly SettingsNavItem[];
};

export const SETTINGS_NAV: readonly SettingsNavGroup[] = [
  {
    key: "account",
    label: "Your account",
    items: [
      {
        key: "profile",
        label: "Profile",
        hint: "Your name, phone, language and time zone.",
        description: "Your own account — the same across every business you belong to.",
        keywords: [
          "name",
          "phone",
          "language",
          "time zone",
          "timezone",
          "email",
          "tips",
          "delete account",
        ],
      },
      {
        key: "security",
        label: "Security",
        hint: "Password and two-factor authentication.",
        description: "How you sign in.",
        keywords: ["password", "two-factor", "2fa", "authenticator", "google", "sign in"],
      },
      {
        key: "device",
        label: "This device",
        hint: "Push notifications on this phone or browser.",
        description: "Notifications on the device you are using right now.",
        keywords: ["push", "notifications", "devices", "buzz"],
      },
    ],
  },
  {
    key: "business",
    label: "Business",
    items: [
      {
        key: "business",
        label: "Business details",
        hint: "Names, booking link, region and menu.",
        description: "Who you are, where clients book you, and what shows in your menu.",
        keywords: [
          "trading name",
          "legal name",
          "industry",
          "booking link",
          "slug",
          "currency",
          "time zone",
          "timezone",
          "locale",
          "format",
          "menu",
          "waitlist",
          "staff",
        ],
      },
      {
        key: "team",
        label: "Team",
        hint: "Members, roles and invitations.",
        description: "Who can sign in to this business and what they can do.",
        keywords: [
          "members",
          "roles",
          "invite",
          "invitation",
          "administrator",
          "manager",
          "reception",
          "finance",
        ],
      },
      {
        key: "policies",
        label: "Policies",
        hint: "Cancellation, terms and your privacy notice.",
        description: "The documents clients agree to when they book.",
        keywords: [
          "cancellation",
          "terms",
          "privacy",
          "consent",
          "package terms",
          "dpa",
          "ai",
          "draft",
        ],
      },
    ],
  },
  {
    key: "how",
    label: "How it works",
    items: [
      {
        key: "booking-rules",
        label: "Booking rules",
        hint: "Holds, cancellation window, paying online, waitlist, words.",
        description: "How bookings behave and what things are called.",
        keywords: [
          "hold",
          "cancellation window",
          "take payment online",
          "terminology",
          "words",
          "labels",
        ],
      },
      {
        key: "branding",
        label: "Branding",
        hint: "Logo and accent colour.",
        description: "Your logo and colour on emails, invoices and the booking page.",
        keywords: ["logo", "accent", "colour", "color", "brand", "email preview"],
      },
      {
        key: "calendar",
        label: "Calendar",
        hint: "Booking colours and bank holidays.",
        description: "How the calendar colours bookings, and which bank holidays it marks.",
        keywords: [
          "colours",
          "colors",
          "paid",
          "unpaid",
          "deposit",
          "events",
          "bank holidays",
          "public holidays",
        ],
      },
      {
        key: "tax",
        label: "Tax and address",
        hint: "VAT, legal address and data retention.",
        description: "What goes on your invoices, and how long data is kept after you close.",
        keywords: ["vat", "tax", "address", "country", "retention", "closure", "export"],
      },
    ],
  },
  {
    key: "clients",
    label: "Clients",
    items: [
      {
        key: "client-messages",
        label: "Client messages",
        hint: "Reminder timing and message wording.",
        description: "When clients are reminded, and what every email and text says.",
        keywords: ["reminders", "templates", "email", "text", "sms", "wording", "placeholders"],
      },
    ],
  },
  {
    key: "money",
    label: "Money",
    items: [
      {
        key: "get-paid",
        label: "Get paid",
        hint: "Card payments, bank transfer and invoicing.",
        description: "How clients pay you. Your RECAVO subscription is under RECAVO plan.",
        keywords: [
          "stripe",
          "card",
          "bank transfer",
          "sort code",
          "invoicing",
          "invoices",
          "payouts",
          "fees",
        ],
      },
      {
        key: "plan",
        label: "RECAVO plan",
        hint: "Your subscription, add-ons and text credits.",
        description: "Your RECAVO subscription, add-ons and text credits.",
        keywords: [
          "plan",
          "subscription",
          "billing",
          "add-ons",
          "text credits",
          "sms",
          "invoice",
          "cancel",
          "upgrade",
        ],
        requires: "billing.manage",
      },
    ],
  },
  {
    key: "records",
    label: "Records",
    items: [
      {
        key: "activity",
        label: "Activity log",
        hint: "Who changed what, and when.",
        description: "Every change made in this business, newest first.",
        keywords: ["audit", "history", "log", "activity", "events"],
        requires: "audit.read",
      },
    ],
  },
];

export const SETTINGS_PAGE_KEYS: readonly SettingsPageKey[] = SETTINGS_NAV.flatMap((g) =>
  g.items.map((i) => i.key),
);

export const DEFAULT_SETTINGS_PAGE: SettingsPageKey = "business";

export function isSettingsPageKey(value: string | undefined): value is SettingsPageKey {
  return value !== undefined && (SETTINGS_PAGE_KEYS as readonly string[]).includes(value);
}

export function settingsItem(key: SettingsPageKey): SettingsNavItem {
  for (const group of SETTINGS_NAV) {
    const item = group.items.find((i) => i.key === key);
    if (item) return item;
  }
  throw new Error(`Unknown settings page ${key}`);
}

export function settingsPath(key: SettingsPageKey): `/settings/${SettingsPageKey}` {
  return `/settings/${key}`;
}

export type SettingsVisibility = {
  canReadAudit: boolean;
  canManageBilling: boolean;
};

/** Groups with the pages this person may see; empty groups are dropped. */
export function visibleSettingsNav(visibility: SettingsVisibility, query = ""): SettingsNavGroup[] {
  const q = query.trim().toLowerCase();
  return SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.requires === "audit.read" && !visibility.canReadAudit) return false;
      if (item.requires === "billing.manage" && !visibility.canManageBilling) return false;
      return q === "" || matchesQuery(item, q);
    }),
  })).filter((group) => group.items.length > 0);
}

function matchesQuery(item: SettingsNavItem, q: string): boolean {
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.hint.toLowerCase().includes(q)) return true;
  return item.keywords.some((k) => k.toLowerCase().includes(q));
}

/**
 * Where an old `/settings?tab=…` link lands (spec §1, URLs). Unknown or missing
 * tabs go to the default page. `assist` rides along for the policies page and
 * the old Privacy tab becomes the privacy section of Policies.
 */
export function legacySettingsTarget(search: {
  tab?: string | undefined;
  assist?: string | number | boolean | undefined;
}): { page: SettingsPageKey; assist?: true; hash?: "privacy" } {
  const assist =
    search.assist === true ||
    search.assist === 1 ||
    search.assist === "1" ||
    search.assist === "true";
  switch (search.tab) {
    case "account":
      return { page: "profile" };
    case "security":
      return { page: "security" };
    case "business":
      return { page: "business" };
    case "configuration":
      return { page: "booking-rules" };
    case "team":
      return { page: "team" };
    case "policies":
      return assist ? { page: "policies", assist: true } : { page: "policies" };
    case "privacy":
      return { page: "policies", hash: "privacy" };
    case "notifications":
      return { page: "client-messages" };
    case "audit":
      return { page: "activity" };
    case "payments":
      return { page: "get-paid" };
    case "billing":
      return { page: "plan" };
    default:
      return { page: DEFAULT_SETTINGS_PAGE };
  }
}

export type SettingsAttention = Partial<Record<SettingsPageKey, string>>;

/**
 * Which pages carry an amber dot and why (spec §1): payments not set up, a
 * failed subscription payment, text credits running low. Same amber meaning as
 * the dashboard menu.
 */
export function settingsAttention(input: {
  paymentsReady: boolean;
  paymentFailed: boolean;
  textCredits: "ok" | "low" | "empty" | "unlimited" | "unknown";
}): SettingsAttention {
  const out: SettingsAttention = {};
  if (!input.paymentsReady) out["get-paid"] = "No way to get paid is set up yet";
  if (input.paymentFailed) out.plan = "Your last payment didn't go through";
  else if (input.textCredits === "empty") out.plan = "You're out of text credits";
  else if (input.textCredits === "low") out.plan = "Text credits are running low";
  return out;
}
