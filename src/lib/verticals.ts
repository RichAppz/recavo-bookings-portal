/**
 * Product verticals surfaced during signup/onboarding. Each maps to an API
 * `industryTemplateKey` (see the API's INDUSTRY_TEMPLATES) and carries the copy
 * used on the auth brand panel and the onboarding form.
 */
export type VerticalKey = "personal_training" | "car_detailing";

export interface VerticalBrand {
  /** Small pill above the headline on the auth brand panel. */
  chip: string;
  headline: string;
  highlights: string[];
  stats: { value: string; label: string }[];
}

export interface Vertical {
  key: VerticalKey;
  label: string;
  /** One-line description shown under the label in the picker. */
  tagline: string;
  businessLabel: string;
  businessPlaceholder: string;
  brand: VerticalBrand;
}

export const VERTICALS: Record<VerticalKey, Vertical> = {
  personal_training: {
    key: "personal_training",
    label: "Personal training",
    tagline: "Sessions, clients & packages",
    businessLabel: "Studio or business name",
    businessPlaceholder: "Peak Performance PT",
    brand: {
      chip: "Built for personal trainers",
      headline: "Run your PT business in one place.",
      highlights: [
        "Sessions, payments and clients in one console",
        "Packages, credits and memberships built in",
        "Mobile-ready for the gym floor and travelling PTs",
      ],
      stats: [
        { value: "12k+", label: "Sessions a month" },
        { value: "98%", label: "Show-up rate" },
        { value: "4.9", label: "Average rating" },
      ],
    },
  },
  car_detailing: {
    // The key predates the wider branding: "Automotive" covers detailing,
    // wrapping, PPF, tinting and valeting, but existing businesses store
    // `car_detailing` so it must not change.
    key: "car_detailing",
    label: "Automotive",
    tagline: "Jobs, vehicles & reminders",
    businessLabel: "Business or trading name",
    businessPlaceholder: "Prestige Auto Care",
    brand: {
      chip: "Built for automotive businesses",
      headline: "Run your automotive business in one place.",
      highlights: [
        "Multi-service jobs with rolled-up pricing",
        "Every vehicle saved against the customer",
        "SMS reminders that cut no-shows",
      ],
      stats: [
        { value: "30%", label: "Fewer no-shows" },
        { value: "3×", label: "Faster booking" },
        { value: "4.9", label: "Average rating" },
      ],
    },
  },
};

export const VERTICAL_LIST: Vertical[] = Object.values(VERTICALS);

export const DEFAULT_VERTICAL: VerticalKey = "personal_training";

/** Generic brand panel for surfaces that don't pick a vertical (e.g. sign-in). */
export const GENERIC_BRAND: VerticalBrand = {
  chip: "For personal trainers & automotive businesses",
  headline: "Run your bookings business in one place.",
  highlights: [
    "Bookings, clients and payments in one console",
    "Tailored to your trade — from PT to automotive",
    "Mobile-ready wherever you work",
  ],
  stats: [
    { value: "12k+", label: "Bookings a month" },
    { value: "98%", label: "Show-up rate" },
    { value: "4.9", label: "Average rating" },
  ],
};
