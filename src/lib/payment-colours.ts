import type { CSSProperties } from "react";

import type { BusinessConfiguration } from "@/lib/api/types";
import type { PaymentTone } from "@/lib/booking-payment";

/** The three payment states a business can recolour. `none` shares `paid`'s colour. */
export type PaymentColourKey = "paid" | "partial" | "unpaid";

export type PaymentColours = Record<PaymentColourKey, string | null> & {
  /** Set when the business colours bookings by person: staff id to `#rrggbb`. */
  byStaff?: ReadonlyMap<string, string> | null;
};

/** "Colour bookings by: {staff}" (Settings › Calendar); payment status otherwise. */
export function colourByStaff(config: BusinessConfiguration | null | undefined): boolean {
  return config?.calendar?.colourBy === "staff";
}

export const PAYMENT_COLOUR_KEYS: PaymentColourKey[] = ["paid", "partial", "unpaid"];

/**
 * Hex versions of the theme's `--success` / `--warning` / `--destructive` tokens, for
 * the colour picker and previews. The calendar itself uses the Tailwind classes when
 * no override is set so it keeps following light/dark mode.
 */
export const DEFAULT_PAYMENT_HEX: Record<PaymentColourKey, string> = {
  paid: "#349d62",
  partial: "#e99239",
  unpaid: "#d62e3e",
};

const DEFAULT_CLASSES: Record<PaymentColourKey, { bar: string; dot: string }> = {
  paid: { bar: "bg-success text-white", dot: "bg-success" },
  partial: { bar: "bg-warning text-neutral-900", dot: "bg-warning" },
  unpaid: { bar: "bg-destructive text-white", dot: "bg-destructive" },
};

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export function toneToColourKey(tone: PaymentTone): PaymentColourKey {
  return tone === "none" ? "paid" : tone;
}

/** Reads the business's overrides off configuration; every key null when unset. */
export function paymentColoursFrom(
  config: BusinessConfiguration | null | undefined,
): PaymentColours {
  const c = config?.calendar?.paymentColours;
  return {
    paid: c?.paid ?? null,
    partial: c?.partial ?? null,
    unpaid: c?.unpaid ?? null,
  };
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableTextOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return lum > 0.45 ? "#171717" : "#ffffff";
}

/**
 * Class + inline style for a booking bar in `tone`. Custom colours go inline (they
 * are per-business data, not theme); defaults stay as classes.
 */
export function paymentBarStyle(
  tone: PaymentTone,
  colours: PaymentColours,
): { className: string; style: CSSProperties | undefined } {
  const key = toneToColourKey(tone);
  const custom = colours[key];
  if (custom && HEX_COLOUR.test(custom)) {
    return { className: "", style: { backgroundColor: custom, color: readableTextOn(custom) } };
  }
  return { className: DEFAULT_CLASSES[key].bar, style: undefined };
}

const TINT_CLASSES: Record<PaymentColourKey, string> = {
  paid: "bg-cal-paid-bg text-cal-paid-fg",
  partial: "bg-cal-deposit-bg text-cal-deposit-fg",
  unpaid: "bg-cal-unpaid-bg text-cal-unpaid-fg",
};

/**
 * Calendar redesign (spec §1.2): a block is a soft tint of its status colour with
 * dark text, not a solid bar. Defaults are theme tokens so they follow light/dark;
 * a business override derives both from the chosen hex — fill at ~16% over the
 * card and text mixed towards the theme's foreground so it stays readable in both
 * modes.
 */
export function paymentTintStyle(
  tone: PaymentTone,
  colours: PaymentColours,
): { className: string; style: CSSProperties | undefined } {
  const key = toneToColourKey(tone);
  const custom = colours[key];
  if (custom && HEX_COLOUR.test(custom)) {
    return {
      className: "",
      style: {
        backgroundColor: `color-mix(in oklab, ${custom} 16%, var(--card))`,
        color: `color-mix(in oklab, ${custom} 55%, var(--foreground))`,
      },
    };
  }
  return { className: TINT_CLASSES[key], style: undefined };
}

/** A booking tinted in its person's colour, same strength as the payment tints. */
export function personTintStyle(hex: string): { className: string; style: CSSProperties } {
  return {
    className: "",
    style: {
      backgroundColor: `color-mix(in oklab, ${hex} 16%, var(--card))`,
      color: `color-mix(in oklab, ${hex} 55%, var(--foreground))`,
    },
  };
}

/** Solid swatch for a "£18 due" pill (spec §1.2): status colour behind white text. */
export function duePillStyle(
  tone: PaymentTone,
  colours: PaymentColours,
): { className: string; style: CSSProperties | undefined } {
  const key = toneToColourKey(tone);
  const custom = colours[key];
  if (custom && HEX_COLOUR.test(custom)) {
    return { className: "text-white", style: { backgroundColor: custom } };
  }
  return {
    className: key === "unpaid" ? "bg-cal-unpaid text-white" : "bg-cal-deposit text-white",
    style: undefined,
  };
}

/** Class + inline style for a legend dot in `tone`. */
export function paymentDotStyle(
  tone: PaymentTone,
  colours: PaymentColours,
): { className: string; style: CSSProperties | undefined } {
  const key = toneToColourKey(tone);
  const custom = colours[key];
  if (custom && HEX_COLOUR.test(custom)) {
    return { className: "", style: { backgroundColor: custom } };
  }
  return { className: DEFAULT_CLASSES[key].dot, style: undefined };
}
