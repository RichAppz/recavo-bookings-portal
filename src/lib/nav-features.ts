import type { BusinessConfiguration } from "@/lib/api/types";

/**
 * Console menu items a business can switch off in Settings → Configuration → Menu.
 * Mirrors the API's NAV_FEATURES; anything not listed here (calendar, bookings,
 * sessions, clients, locations, payments, settings) always shows. Hiding is
 * cosmetic — the routes still work — so a hidden page reached from a link or
 * the setup checklist is fine.
 */
export type NavFeature = NonNullable<
  NonNullable<BusinessConfiguration["navigation"]>["hidden"]
>[number];

export const NAV_FEATURES: {
  key: NavFeature;
  /** Sidebar route the item points at. */
  path: string;
  label: string;
  hint: string;
}[] = [
  { key: "waitlist", path: "/waitlist", label: "Waitlist", hint: "Clients waiting for a slot." },
  {
    key: "consumables",
    path: "/consumables",
    label: "Consumables",
    hint: "Materials a job uses up — coatings, pads, chemicals.",
  },
  {
    key: "packages",
    path: "/packages",
    label: "Packages",
    hint: "Blocks of sessions sold as credits.",
  },
  {
    key: "offer_links",
    path: "/offer-links",
    label: "Offer links",
    hint: "Shareable pages for a package or promotion.",
  },
  {
    key: "follow_ups",
    path: "/follow-ups",
    label: "Follow-ups",
    hint: "Clients due a repeat visit.",
  },
  {
    key: "records",
    path: "/vehicles",
    label: "Records",
    hint: "Vehicles or other items linked to a client.",
  },
  {
    key: "staff",
    path: "/staff",
    label: "Staff",
    hint: "Team members, their hours and time off.",
  },
  {
    key: "messages",
    path: "/messages",
    label: "Messages",
    hint: "Text conversations with clients.",
  },
  { key: "invoices", path: "/invoices", label: "Invoices", hint: "PDF invoices and their status." },
  { key: "reports", path: "/reports", label: "Reports", hint: "Revenue, attendance and trends." },
  {
    key: "referrals",
    path: "/referrals",
    label: "Referrals",
    hint: "Your referral code and rewards.",
  },
];

const BY_PATH = new Map(NAV_FEATURES.map((f) => [f.path, f.key]));

export function navFeatureForPath(path: string): NavFeature | undefined {
  return BY_PATH.get(path);
}

export function hiddenNavFrom(
  config: BusinessConfiguration | null | undefined,
): ReadonlySet<NavFeature> {
  return new Set(config?.navigation?.hidden ?? []);
}
