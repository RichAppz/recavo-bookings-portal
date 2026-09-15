import type { CSSProperties } from "react";

import type { BusinessConfiguration } from "@/lib/api/types";
import type { PaymentTone } from "@/lib/booking-payment";

/** The three payment states a business can recolour. `none` shares `paid`'s colour. */
export type PaymentColourKey = "paid" | "partial" | "unpaid";

export type PaymentColours = Record<PaymentColourKey, string | null>;

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
