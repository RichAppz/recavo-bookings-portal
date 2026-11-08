/**
 * Push notification rules with no side effects, kept apart from the browser and
 * Capacitor plumbing in ./push-client.ts so they can be unit-tested under Node.
 */
import type { PushConfig, PushPlatform } from "@/lib/api/types";
import { clientPlatformFor } from "../native.ts";

/** localStorage keys. One device, one user at a time: cleared on sign-out. */
export const PUSH_CHOICE_KEY = "recavo.push.choice";
export const PUSH_DEVICE_KEY = "recavo.push.device";
export const PUSH_PROMPT_DISMISSED_KEY = "recavo.push.promptDismissed";

/** What the person last decided; `unset` means never asked. */
export type PushChoice = "on" | "off" | "unset";

/** The registration this device last sent the API, so sign-out can revoke it. */
export type StoredPushDevice = {
  platform: PushPlatform;
  token: string;
};

/** What the service worker / native plugin hands the page when a push is opened. */
export type PushOpenData = {
  link: string | null;
  businessId: string | null;
  notificationId: string | null;
};

/** Message the service worker posts to the page when a web notification is clicked. */
export const PUSH_OPEN_MESSAGE = "recavo:push-open";

/** Which push platform this bundle registers as — mirrors the API's `platform` enum. */
export function pushPlatformFor(native: boolean, platform: string | undefined): PushPlatform {
  return clientPlatformFor(native, platform);
}

type WebPushCapabilities = {
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** Vite dev server: the service worker is never registered there. */
  dev: boolean;
};

/**
 * Whether this browser can take a Web Push subscription at all. Safari on iOS only
 * exposes `PushManager` once the site is installed to the Home Screen, so an
 * ordinary tab there comes back false and the UI explains what to do.
 */
export function webPushSupported(caps: WebPushCapabilities): boolean {
  return caps.serviceWorker && caps.pushManager && caps.notification && !caps.dev;
}

/**
 * Whether the switch should be offered at all on this surface: the browser or app
 * must be able to receive, and the API must be able to send for that platform.
 */
export function pushAvailable(
  platform: PushPlatform,
  config: PushConfig | undefined,
  browserCapable: boolean,
): boolean {
  if (!config?.platforms[platform]) return false;
  if (platform === "web") return browserCapable && Boolean(config.vapidPublicKey);
  return true;
}

/**
 * Only in-app paths may be opened from a notification; anything else (a full URL,
 * a protocol-relative one) is dropped so a payload can never send the app off-origin.
 */
export function safePushLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  return link;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Normalises the `data` block of a push — APNs custom keys, FCM `data`, or the
 * JSON Web Push payload — into the three fields the app acts on.
 */
export function parsePushOpenData(data: unknown): PushOpenData {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    link: safePushLink(d.link),
    businessId: optionalString(d.businessId),
    notificationId: optionalString(d.notificationId),
  };
}

/**
 * A web notification clicked with no RECAVO tab open boots a fresh page at the link,
 * carrying the rest of the payload in the hash (`#push=businessId=…&notificationId=…`)
 * so the page can still switch business and mark the bell row read.
 */
export function parsePushOpenHash(hash: string): PushOpenData | null {
  if (!hash.startsWith("#push=")) return null;
  const params = new URLSearchParams(decodeURIComponent(hash.slice("#push=".length)));
  return {
    link: null,
    businessId: optionalString(params.get("businessId")),
    notificationId: optionalString(params.get("notificationId")),
  };
}

/** Converts a base64url VAPID public key into the bytes `PushManager.subscribe` wants. */
export function vapidKeyBytes(base64url: string): Uint8Array {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A short "which device is this" label for the devices list, from the user agent. */
export function deviceLabelFor(platform: PushPlatform, userAgent: string): string {
  if (platform === "ios") return /iPad/i.test(userAgent) ? "iPad app" : "iPhone app";
  if (platform === "android") return "Android app";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "Mac"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Whether to nudge from the bell: push can be had here, the person has not decided
 * either way, and they have not already waved the nudge off.
 */
export function shouldOfferPushPrompt(input: {
  available: boolean;
  choice: PushChoice;
  dismissed: boolean;
  permission: NotificationPermission | "unsupported";
}): boolean {
  if (!input.available || input.dismissed) return false;
  if (input.permission === "denied") return false;
  return input.choice === "unset";
}
