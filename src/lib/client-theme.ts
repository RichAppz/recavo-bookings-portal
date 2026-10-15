import type { CSSProperties } from "react";

/**
 * How a studio's public booking page looks (client booking spec, Oct 2026).
 *
 * The page is built from the same design tokens as the rest of the portal, so a
 * theme is applied by overriding the CSS variables on a wrapper element rather than
 * by a second component library. Everything inside then picks the theme up through
 * the usual `bg-background`, `bg-card`, `text-muted-foreground`, `bg-primary`
 * utilities.
 */

export const BOOKING_PAGE_THEMES = ["studio", "night", "editorial"] as const;
export type BookingPageTheme = (typeof BOOKING_PAGE_THEMES)[number];

export const BOOKING_PAGE_SECTIONS = ["reviews", "about", "staff", "location", "gallery"] as const;
export type BookingPageSectionKey = (typeof BOOKING_PAGE_SECTIONS)[number];

export type BookingPageSection = { key: BookingPageSectionKey; enabled: boolean };

export type BookingPageContent = {
  theme: BookingPageTheme;
  headerImageUrl: string | null;
  headerFocalPoint: { x: number; y: number };
  accentColour: string | null;
  description: string | null;
  about: string | null;
  sections: BookingPageSection[];
  reviewsMinStars: 0 | 4 | 5;
  venue: { address: string | null; parkingNote: string | null };
};

export type BookingPageSettings = {
  draft: BookingPageContent;
  published: BookingPageContent;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

export const DEFAULT_BOOKING_PAGE: BookingPageContent = {
  theme: "studio",
  headerImageUrl: null,
  headerFocalPoint: { x: 50, y: 50 },
  accentColour: null,
  description: null,
  about: null,
  sections: [
    { key: "reviews", enabled: true },
    { key: "about", enabled: true },
    { key: "staff", enabled: true },
    { key: "location", enabled: true },
    { key: "gallery", enabled: false },
  ],
  reviewsMinStars: 4,
  venue: { address: null, parkingNote: null },
};

export const SECTION_LABELS: Record<BookingPageSectionKey, { title: string; hint: string }> = {
  reviews: { title: "Reviews", hint: "Needs a Google Business Profile connection" },
  about: { title: "About", hint: "A few sentences about the business" },
  staff: { title: "Team", hint: "People marked as visible on the booking page" },
  location: { title: "Location and parking", hint: "Address and how to find you" },
  gallery: { title: "Gallery", hint: "Coming soon" },
};

type ThemeSpec = {
  readonly label: string;
  readonly strap: string;
  readonly background: string;
  readonly card: string;
  readonly text: string;
  readonly muted: string;
  readonly line: string;
  /** Card corner radius in px (the design system derives the rest from `--radius`). */
  readonly radius: number;
  readonly headerRadius: number;
  readonly fontBody: string;
  readonly fontDisplay: string;
  readonly dark: boolean;
  /** Fallback accent when the business has not picked one. */
  readonly accent: string;
  /** The header block when there is no image: a soft gradient in the theme's mood. */
  readonly headerGradient: string;
};

export const THEME_SPECS: Record<BookingPageTheme, ThemeSpec> = {
  studio: {
    label: "Studio",
    strap: "Light and airy",
    background: "#f5f4f1",
    card: "#ffffff",
    text: "#15171c",
    muted: "#5f656e",
    line: "#e6e4df",
    radius: 18,
    headerRadius: 28,
    fontBody: '"Geist", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    fontDisplay: '"Geist", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    dark: false,
    accent: "#2d7a5f",
    headerGradient: gradientFor("dawn"),
  },
  night: {
    label: "Night",
    strap: "Dark and bold",
    background: "#0b0c0f",
    card: "#15171c",
    text: "#f2f3f5",
    muted: "#9aa1ab",
    line: "#262a31",
    radius: 16,
    headerRadius: 24,
    fontBody: '"Sora", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    fontDisplay: '"Sora", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    dark: true,
    accent: "#f0863a",
    headerGradient: gradientFor("dusk"),
  },
  editorial: {
    label: "Editorial",
    strap: "Warm and refined",
    background: "#f1ece4",
    card: "#faf7f2",
    text: "#1d1a16",
    muted: "#675f55",
    line: "#ddd5c9",
    radius: 6,
    headerRadius: 6,
    fontBody: '"Geist", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    fontDisplay: '"Fraunces", Georgia, "Times New Roman", serif',
    dark: false,
    accent: "#a9643a",
    headerGradient: gradientFor("stone"),
  },
};

/** Soft gradient headers a business can pick when it has no photo. */
export const HEADER_PRESETS = ["dawn", "mist", "dusk", "stone"] as const;
export type HeaderPreset = (typeof HEADER_PRESETS)[number];

function gradientFor(preset: HeaderPreset): string {
  switch (preset) {
    case "dawn":
      return "radial-gradient(120% 90% at 85% 10%, #f4b48a 0%, rgba(244,180,138,0) 55%), radial-gradient(110% 80% at 10% 95%, #8fbfae 0%, rgba(143,191,174,0) 60%), linear-gradient(160deg, #f6efe6 0%, #e8d9c8 45%, #7fb39f 100%)";
    case "mist":
      return "radial-gradient(90% 80% at 50% 40%, #c9d3dd 0%, rgba(201,211,221,0) 65%), linear-gradient(180deg, #eef1f4 0%, #d4dbe3 100%)";
    case "dusk":
      return "radial-gradient(110% 90% at 90% 15%, #f58a3c 0%, rgba(245,138,60,0) 55%), radial-gradient(100% 80% at 40% 50%, #b23d82 0%, rgba(178,61,130,0) 60%), linear-gradient(160deg, #2b1a3a 0%, #4a2360 45%, #26324f 100%)";
    case "stone":
      return "radial-gradient(100% 90% at 80% 20%, #bfa58b 0%, rgba(191,165,139,0) 60%), linear-gradient(160deg, #efe6da 0%, #d7c6b2 55%, #9f7f63 100%)";
  }
}

export function presetGradient(preset: HeaderPreset): string {
  return gradientFor(preset);
}

/** A header image "URL" that names a preset rather than a file. */
export const PRESET_URL_PREFIX = "preset:";

export function presetFromHeaderUrl(url: string | null): HeaderPreset | null {
  if (!url || !url.startsWith(PRESET_URL_PREFIX)) return null;
  const name = url.slice(PRESET_URL_PREFIX.length);
  return (HEADER_PRESETS as readonly string[]).includes(name) ? (name as HeaderPreset) : null;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX6.test(value);
}

function channel(hex: string, offset: number): number {
  const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export const ACCENT_DARK_TEXT = "#111214";
export const ACCENT_LIGHT_TEXT = "#ffffff";

/** Dark text on light accents, white on everything else (spec: luminance split 0.55). */
export function textOnAccent(accent: string): string {
  return relativeLuminance(accent) > 0.55 ? ACCENT_DARK_TEXT : ACCENT_LIGHT_TEXT;
}

/** Why an accent is unusable, or null when it reads at 4.5:1 with one of the text colours. */
export function accentRejection(accent: string): string | null {
  if (!isHexColour(accent)) return "Pick a colour in the form #rrggbb";
  const onWhite = contrastRatio(accent, ACCENT_LIGHT_TEXT);
  const onDark = contrastRatio(accent, ACCENT_DARK_TEXT);
  if (onWhite >= 4.5 || onDark >= 4.5) return null;
  return `Text would be hard to read on this colour (${onWhite.toFixed(1)}:1 with white, ${onDark.toFixed(1)}:1 with dark text; 4.5:1 is needed). Try a darker or lighter shade.`;
}

/** The accent the page actually uses: the business's pick, else the theme's own. */
export function effectiveAccent(page: Pick<BookingPageContent, "theme" | "accentColour">): string {
  return isHexColour(page.accentColour)
    ? page.accentColour.toLowerCase()
    : THEME_SPECS[page.theme].accent;
}

/**
 * CSS variable overrides that turn the portal's design tokens into the theme. Applied
 * to the page wrapper; `color-mix` derives the tints so an arbitrary accent still gets
 * matching soft/selected states.
 */
export function clientThemeStyle(
  page: Pick<BookingPageContent, "theme" | "accentColour">,
): CSSProperties {
  const spec = THEME_SPECS[page.theme];
  const accent = effectiveAccent(page);
  const onAccent = textOnAccent(accent);
  const vars: Record<string, string> = {
    "--background": spec.background,
    "--foreground": spec.text,
    "--card": spec.card,
    "--card-foreground": spec.text,
    "--popover": spec.card,
    "--popover-foreground": spec.text,
    "--muted": spec.dark ? "#1c1f25" : spec.background,
    "--muted-foreground": spec.muted,
    "--secondary": spec.dark ? "#1c1f25" : `color-mix(in srgb, ${spec.text} 6%, ${spec.card})`,
    "--secondary-foreground": spec.text,
    "--border": spec.line,
    "--input": spec.dark ? "#343941" : `color-mix(in srgb, ${spec.text} 22%, ${spec.card})`,
    "--primary": accent,
    "--primary-foreground": onAccent,
    "--primary-soft": `color-mix(in srgb, ${accent} ${spec.dark ? 22 : 12}%, ${spec.card})`,
    "--accent": `color-mix(in srgb, ${accent} ${spec.dark ? 22 : 10}%, ${spec.card})`,
    "--accent-foreground": spec.dark ? spec.text : accent,
    "--ring": accent,
    "--radius": `${spec.radius}px`,
    "--font-sans": spec.fontBody,
    "--client-font-display": spec.fontDisplay,
    "--client-header-radius": `${spec.headerRadius}px`,
    "--client-accent": accent,
    "--client-on-accent": onAccent,
    "--client-dark-button": spec.dark ? spec.text : "#111214",
    "--client-dark-button-foreground": spec.dark ? spec.background : "#ffffff",
    colorScheme: spec.dark ? "dark" : "light",
  };
  return vars as CSSProperties;
}

/** Inline style for the header block: the uploaded photo, a preset, or the theme gradient. */
export function headerStyle(
  page: Pick<BookingPageContent, "theme" | "headerImageUrl" | "headerFocalPoint">,
): CSSProperties {
  const preset = presetFromHeaderUrl(page.headerImageUrl);
  if (preset) return { backgroundImage: presetGradient(preset) };
  if (page.headerImageUrl) {
    return {
      backgroundImage: `url("${page.headerImageUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: `${page.headerFocalPoint.x}% ${page.headerFocalPoint.y}%`,
    };
  }
  return { backgroundImage: THEME_SPECS[page.theme].headerGradient };
}

/** Google Fonts stylesheet for the theme fonts; loaded only on the client page. */
export const CLIENT_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Sora:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap";

/** Two-letter mark for a business with no logo, e.g. "Northside Strength" → "NS". */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Fills anything an older API build leaves out, so the page never reads `undefined`. */
export function normaliseBookingPage(
  raw: Partial<BookingPageContent> | null | undefined,
): BookingPageContent {
  const theme =
    raw?.theme && (BOOKING_PAGE_THEMES as readonly string[]).includes(raw.theme)
      ? raw.theme
      : DEFAULT_BOOKING_PAGE.theme;
  const seen = new Set<string>();
  const sections: BookingPageSection[] = [];
  for (const s of raw?.sections ?? []) {
    if (!(BOOKING_PAGE_SECTIONS as readonly string[]).includes(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    sections.push({ key: s.key, enabled: Boolean(s.enabled) });
  }
  const hadSections = seen.size > 0;
  for (const d of DEFAULT_BOOKING_PAGE.sections) {
    if (!seen.has(d.key)) sections.push(hadSections ? { key: d.key, enabled: false } : d);
  }
  return {
    theme,
    headerImageUrl: raw?.headerImageUrl ?? null,
    headerFocalPoint: raw?.headerFocalPoint ?? { x: 50, y: 50 },
    accentColour: raw?.accentColour ?? null,
    description: raw?.description ?? null,
    about: raw?.about ?? null,
    sections,
    reviewsMinStars: raw?.reviewsMinStars ?? 4,
    venue: {
      address: raw?.venue?.address ?? null,
      parkingNote: raw?.venue?.parkingNote ?? null,
    },
  };
}

export function sectionEnabled(page: BookingPageContent, key: BookingPageSectionKey): boolean {
  return page.sections.find((s) => s.key === key)?.enabled ?? false;
}
