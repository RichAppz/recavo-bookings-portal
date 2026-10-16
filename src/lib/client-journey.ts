import { useEffect, useRef, useState } from "react";
import type { BookingContact } from "@/components/BookingCheckout";
import type { Booking } from "@/lib/api/types";
import { formatMoney } from "./format.ts";

/**
 * Pieces of the public booking journey that must survive a page reload: the hold
 * and contact details stashed across a card's bank authentication, the countdown,
 * and the small input normalisers. Shared by the client booking page and the
 * account drawer's legacy flow, which read and write the same storage key.
 */

export type JourneyHold = {
  booking: Booking;
  holdToken: string;
  onlinePaymentRequired?: boolean;
  bankTransferAvailable?: boolean;
  /** What checkout collects right now: the deposit when one is set. */
  amountDueNowMinor?: number;
};

export type StoredJourney = { hold: JourneyHold; contact: BookingContact };

export const EMPTY_CONTACT: BookingContact = { name: null, email: null, phone: null };

const holdStorageKey = (businessId: string) => `recavo.booking.hold.${businessId}`;

export function readStoredJourney(businessId: string): StoredJourney | null {
  try {
    const raw = sessionStorage.getItem(holdStorageKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredJourney>;
    return parsed.hold ? { hold: parsed.hold, contact: parsed.contact ?? EMPTY_CONTACT } : null;
  } catch {
    return null;
  }
}

export function writeStoredJourney(businessId: string, journey: StoredJourney | null): void {
  try {
    if (journey) sessionStorage.setItem(holdStorageKey(businessId), JSON.stringify(journey));
    else sessionStorage.removeItem(holdStorageKey(businessId));
  } catch {
    // Private browsing can refuse storage; only the redirect-return path suffers.
  }
}

/**
 * Stripe wants E.164. Numbers are typed in national form far more often than not, so
 * a bare leading 0 is expanded using the dialling code of the number's own country.
 * Anything ambiguous is dropped rather than guessed.
 */
export function toE164(raw: string, diallingCode = "44"): string | null {
  const trimmed = raw.replace(/[\s()-]/g, "");
  if (!trimmed) return null;
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  if (/^0\d{9,10}$/.test(trimmed)) return `+${diallingCode}${trimmed.slice(1)}`;
  if (/^[1-9]\d{8,10}$/.test(trimmed)) return `+${diallingCode}${trimmed}`;
  return null;
}

/**
 * The form shows a "+44" box before the number, so a stored `+447700900123` is
 * prefilled as `07700 900123`. Other countries' numbers are left as they are.
 */
export function nationalPhone(stored: string, diallingCode = "44"): string {
  const trimmed = stored.replace(/[\s()-]/g, "");
  if (!trimmed.startsWith(`+${diallingCode}`)) return stored;
  const rest = trimmed.slice(diallingCode.length + 1);
  if (!/^[1-9]\d{8,9}$/.test(rest)) return stored;
  return `0${rest.slice(0, 4)} ${rest.slice(4)}`;
}

/** Enough to catch a mistyped address; the server decides properly. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** True when Stripe has just sent the customer back after authenticating a card. */
export function returnedFromAuthentication(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("payment_intent_client_secret");
}

/** Stripe reports the outcome of the authentication it just took the customer through. */
export function authenticationSucceeded(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("redirect_status") === "succeeded";
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Live countdown to an ISO instant; fires `onExpire` once when it lapses. */
export function useCountdown(targetIso: string | null, onExpire: () => void): number | null {
  const [msLeft, setMsLeft] = useState<number | null>(
    targetIso ? new Date(targetIso).getTime() - Date.now() : null,
  );
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    if (!targetIso) {
      setMsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(targetIso).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  return msLeft;
}

export function splitDisplayName(name: string | null | undefined): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/** "Morning" / "Afternoon" / "Evening" buckets for a time grid, by local hour in the studio's zone. */
export type DayPart = "Morning" | "Afternoon" | "Evening";

export function dayPartFor(hour: number): DayPart {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export type SlotDisplay = { start: string; end: string; staffId: string | null };

/** Groups slots by day part, keeping each group in start order. */
export function groupSlotsByDayPart<T extends { start: string }>(
  slots: readonly T[],
  hourOf: (iso: string) => number,
): { part: DayPart; slots: T[] }[] {
  const buckets = new Map<DayPart, T[]>();
  for (const slot of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const part = dayPartFor(hourOf(slot.start));
    const list = buckets.get(part) ?? [];
    list.push(slot);
    buckets.set(part, list);
  }
  const order: DayPart[] = ["Morning", "Afternoon", "Evening"];
  return order.filter((p) => buckets.has(p)).map((p) => ({ part: p, slots: buckets.get(p)! }));
}

/**
 * Slots sharing a start time with "any staff" collapse to one button; the one with
 * the most capacity left wins so "1 left" only shows when it is truly the last.
 */
export function dedupeSlotsByStart<T extends { start: string; remainingCapacity?: number | null }>(
  slots: readonly T[],
): T[] {
  const byStart = new Map<string, T>();
  for (const slot of slots) {
    const existing = byStart.get(slot.start);
    if (!existing || (slot.remainingCapacity ?? 0) > (existing.remainingCapacity ?? 0)) {
      byStart.set(slot.start, slot);
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** "24 hours", "2 days", "6 hours": the notice window as people say it. */
export function hoursLabel(hours: number): string {
  if (hours % 24 === 0 && hours >= 24) {
    const days = hours / 24;
    return days === 1 ? "24 hours" : `${days} days`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** "£45" for whole pounds, "£12.50" otherwise: how prices read on the client pages. */
export function price(minor: number, currency: string): string {
  return formatMoney(minor, currency, { compact: true });
}
