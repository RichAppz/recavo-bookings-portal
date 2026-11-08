/**
 * Push notifications — the side-effecting half (see ./push-support.ts for the rules).
 *
 * Three delivery paths, one API contract (POST /api/v1/me/push-devices):
 *
 *  - iOS app      → @capacitor/push-notifications hands us the APNs device token.
 *  - Android app  → the same plugin hands us the FCM registration token.
 *  - Browser      → the service worker's PushManager gives a Web Push subscription
 *                   (endpoint + keys), encrypted with the API's VAPID key.
 *
 * The API tells us which of those it can actually send to (GET /api/v1/push/config),
 * so the switch is only offered where a tap will result in a notification.
 *
 * The plugin and the SW are only touched from the browser, never during SSR.
 */
import type { PushNotificationsPlugin } from "@capacitor/push-notifications";
import { api, request } from "@/lib/api/client";
import type { PushConfig, PushDevice, PushPlatform } from "@/lib/api/types";
import { isNativeApp } from "@/lib/native";
import {
  deviceLabelFor,
  parsePushOpenData,
  PUSH_CHOICE_KEY,
  PUSH_DEVICE_KEY,
  PUSH_OPEN_MESSAGE,
  PUSH_PROMPT_DISMISSED_KEY,
  pushPlatformFor,
  vapidKeyBytes,
  webPushSupported,
  type PushChoice,
  type PushOpenData,
  type StoredPushDevice,
} from "./push-support";

export class PushPermissionDeniedError extends Error {
  constructor() {
    super("Notifications are blocked for RECAVO on this device.");
    this.name = "PushPermissionDeniedError";
  }
}

/** How long to wait for the OS to come back with a token before giving up. */
const REGISTRATION_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Local memory of what this device decided

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota: the choice just is not remembered */
  }
}

export function readPushChoice(): PushChoice {
  const raw = readStorage(PUSH_CHOICE_KEY);
  return raw === "on" || raw === "off" ? raw : "unset";
}

export function writePushChoice(choice: PushChoice) {
  writeStorage(PUSH_CHOICE_KEY, choice === "unset" ? null : choice);
}

export function readStoredPushDevice(): StoredPushDevice | null {
  const raw = readStorage(PUSH_DEVICE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPushDevice>;
    if (
      (parsed.platform === "ios" || parsed.platform === "android" || parsed.platform === "web") &&
      typeof parsed.token === "string"
    ) {
      return { platform: parsed.platform, token: parsed.token };
    }
  } catch {
    /* corrupt: treat as none */
  }
  return null;
}

/** Fired on `window` whenever this device's registration changes, so every switch re-reads. */
export const PUSH_CHANGED_EVENT = "recavo:push-changed";

function writeStoredPushDevice(device: StoredPushDevice | null) {
  writeStorage(PUSH_DEVICE_KEY, device ? JSON.stringify(device) : null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));
}

export function isPushPromptDismissed(): boolean {
  return readStorage(PUSH_PROMPT_DISMISSED_KEY) === "1";
}

export function dismissPushPrompt() {
  writeStorage(PUSH_PROMPT_DISMISSED_KEY, "1");
}

// ---------------------------------------------------------------------------
// Platform detection

function capacitorPlatform(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
}

/** Which platform this bundle registers as right now. */
export function currentPushPlatform(): PushPlatform {
  return pushPlatformFor(isNativeApp(), capacitorPlatform());
}

/** Whether this browser (not app) can take a Web Push subscription. */
export function browserPushCapable(): boolean {
  if (typeof window === "undefined") return false;
  return webPushSupported({
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    dev: Boolean(import.meta.env.DEV),
  });
}

export async function fetchPushConfig(): Promise<PushConfig> {
  const res = await api.get<PushConfig>("/api/v1/push/config", { public: true });
  return res.data;
}

// ---------------------------------------------------------------------------
// Native plugin

let plugin: PushNotificationsPlugin | undefined;

async function pushPlugin(): Promise<{ plugin: PushNotificationsPlugin }> {
  if (!plugin) {
    const mod = await import("@capacitor/push-notifications");
    plugin = mod.PushNotifications;
  }
  // Wrapped in an object: Capacitor plugin proxies treat `.then` as a native call.
  return { plugin };
}

export type PushPermission = NotificationPermission | "unsupported";

/** Current OS-level permission, without prompting. */
export async function currentPushPermission(): Promise<PushPermission> {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeApp()) {
    try {
      const { plugin: push } = await pushPlugin();
      const status = await push.checkPermissions();
      if (status.receive === "granted") return "granted";
      if (status.receive === "denied") return "denied";
      return "default";
    } catch {
      return "unsupported";
    }
  }
  if (!browserPushCapable()) return "unsupported";
  return Notification.permission;
}

async function nativeToken(prompt: boolean): Promise<string> {
  const { plugin: push } = await pushPlugin();
  let status = await push.checkPermissions();
  if (prompt && (status.receive === "prompt" || status.receive === "prompt-with-rationale")) {
    status = await push.requestPermissions();
  }
  if (status.receive !== "granted") throw new PushPermissionDeniedError();

  return new Promise<string>((resolve, reject) => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    let settled = false;
    const finish = (outcome: { token: string } | { error: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const h of handles) void h.then((x) => x.remove());
      if ("token" in outcome) resolve(outcome.token);
      else reject(outcome.error);
    };
    const timer = setTimeout(
      () => finish({ error: new Error("The device did not return a push token in time.") }),
      REGISTRATION_TIMEOUT_MS,
    );
    handles.push(push.addListener("registration", (t) => finish({ token: t.value })));
    handles.push(
      push.addListener("registrationError", (e) =>
        finish({ error: new Error(e.error || "Push registration failed.") }),
      ),
    );
    void push.register().catch((err: unknown) => {
      finish({ error: err instanceof Error ? err : new Error(String(err)) });
    });
  });
}

// ---------------------------------------------------------------------------
// Web Push

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  // `ready` never settles when no worker is registered (e.g. a WebView that
  // refused registration), so put a ceiling on it.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("The offline worker is not ready yet. Try again in a moment.")),
        REGISTRATION_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function webSubscription(vapidPublicKey: string, prompt: boolean): Promise<PushSubscription> {
  const registration = await serviceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  if (Notification.permission === "denied") throw new PushPermissionDeniedError();
  if (Notification.permission !== "granted") {
    if (!prompt) throw new PushPermissionDeniedError();
    const outcome = await Notification.requestPermission();
    if (outcome !== "granted") throw new PushPermissionDeniedError();
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKeyBytes(vapidPublicKey) as BufferSource,
  });
}

// ---------------------------------------------------------------------------
// The API contract

type RegisterBody = {
  platform: PushPlatform;
  token: string;
  keys?: { p256dh: string; auth: string } | null;
  label?: string | null;
};

async function postDevice(body: RegisterBody): Promise<PushDevice> {
  const res = await api.post<{ device: PushDevice }>("/api/v1/me/push-devices", body);
  writeStoredPushDevice({ platform: body.platform, token: body.token });
  return res.data.device;
}

/**
 * Turns push on for this device: asks the OS (when `prompt`), gets the token or
 * subscription, and registers it with the API. Idempotent — re-running on launch
 * refreshes `lastSeenAt` and revives a device the provider had retired.
 */
export async function registerPushDevice(
  config: PushConfig,
  options: { prompt: boolean },
): Promise<PushDevice> {
  const platform = currentPushPlatform();
  const label = deviceLabelFor(platform, navigator.userAgent);

  if (platform === "web") {
    if (!config.vapidPublicKey) throw new Error("Push is not set up for browsers yet.");
    const sub = await webSubscription(config.vapidPublicKey, options.prompt);
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("This browser returned an incomplete push subscription.");
    }
    return postDevice({
      platform,
      token: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      label,
    });
  }

  const token = await nativeToken(options.prompt);
  return postDevice({ platform, token, label });
}

/**
 * Turns push off for this device: tells the API, drops the browser subscription,
 * and forgets the local token. Best-effort on the API call so a flaky connection
 * still leaves the device quiet (a retired token also gets pruned on first use).
 */
export async function unregisterPushDevice(): Promise<void> {
  const stored = readStoredPushDevice();
  writeStoredPushDevice(null);
  if (stored) {
    try {
      await request({ method: "DELETE", path: "/api/v1/me/push-devices", body: stored });
    } catch {
      /* already gone, or offline */
    }
  }
  if (!isNativeApp() && browserPushCapable()) {
    try {
      const registration = await serviceWorkerRegistration();
      const sub = await registration.pushManager.getSubscription();
      await sub?.unsubscribe();
    } catch {
      /* nothing to drop */
    }
  }
}

/**
 * On launch, when this device previously said yes: re-register silently so a token
 * the OS rotated, or a device the API retired while we were away, comes back.
 * Never prompts.
 */
export async function syncPushRegistration(config: PushConfig): Promise<void> {
  if (readPushChoice() !== "on") return;
  if (!config.platforms[currentPushPlatform()]) return;
  try {
    await registerPushDevice(config, { prompt: false });
  } catch {
    /* permission revoked in OS settings, or offline; the switch shows the real state */
  }
}

/**
 * Sign-out hook: revoke this device's registration *while we still hold the session*,
 * so the next person signing in on it does not get the previous one's alerts.
 * Keeps the person's on/off choice, so their next sign-in re-registers without asking.
 */
export async function forgetPushDeviceForSignOut(): Promise<void> {
  await unregisterPushDevice();
}

// ---------------------------------------------------------------------------
// Taps

type Unsubscribe = () => void;

/**
 * Calls `handler` when the person opens a notification: from the native plugin in
 * the apps, or via the service worker's `notificationclick` message on the web.
 */
export function onPushOpened(handler: (data: PushOpenData) => void): Unsubscribe {
  if (typeof window === "undefined") return () => {};

  if (isNativeApp()) {
    let removed = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void pushPlugin().then(({ plugin: push }) =>
      push
        .addListener("pushNotificationActionPerformed", (action) => {
          handler(parsePushOpenData(action.notification.data));
        })
        .then((h) => {
          if (removed) void h.remove();
          else handle = h;
        }),
    );
    return () => {
      removed = true;
      void handle?.remove();
    };
  }

  if (!("serviceWorker" in navigator)) return () => {};
  const listener = (event: MessageEvent) => {
    const msg = event.data as { type?: string; data?: unknown } | undefined;
    if (msg?.type !== PUSH_OPEN_MESSAGE) return;
    handler(parsePushOpenData(msg.data));
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}

export type ForegroundPush = { title: string; body: string } & PushOpenData;

/**
 * Apps only: a push that arrives while the app is open does not show as a banner
 * by default (see capacitor.config.ts presentationOptions), so the page shows it
 * itself. Browsers always display web pushes from the service worker.
 */
export function onPushReceivedInForeground(handler: (push: ForegroundPush) => void): Unsubscribe {
  if (typeof window === "undefined" || !isNativeApp()) return () => {};
  let removed = false;
  let handle: { remove: () => Promise<void> } | undefined;
  void pushPlugin().then(({ plugin: push }) =>
    push
      .addListener("pushNotificationReceived", (n) => {
        handler({
          title: n.title ?? "RECAVO",
          body: n.body ?? "",
          ...parsePushOpenData(n.data),
        });
      })
      .then((h) => {
        if (removed) void h.remove();
        else handle = h;
      }),
  );
  return () => {
    removed = true;
    void handle?.remove();
  };
}
