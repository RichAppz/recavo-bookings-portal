import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deviceLabelFor,
  parsePushOpenData,
  parsePushOpenHash,
  pushAvailable,
  pushPlatformFor,
  safePushLink,
  shouldOfferPushPrompt,
  vapidKeyBytes,
  webPushSupported,
} from "./push-support.ts";

const config = {
  platforms: { ios: true, android: false, web: true },
  vapidPublicKey: "BPublicKey",
};

describe("pushPlatformFor", () => {
  it("is the app's platform inside Capacitor and web everywhere else", () => {
    assert.equal(pushPlatformFor(true, "ios"), "ios");
    assert.equal(pushPlatformFor(true, "android"), "android");
    assert.equal(pushPlatformFor(false, "ios"), "web");
    assert.equal(pushPlatformFor(true, undefined), "web");
  });
});

describe("webPushSupported", () => {
  const all = { serviceWorker: true, pushManager: true, notification: true, dev: false };
  it("needs the worker, PushManager and Notification, and never the dev server", () => {
    assert.equal(webPushSupported(all), true);
    assert.equal(webPushSupported({ ...all, pushManager: false }), false);
    assert.equal(webPushSupported({ ...all, serviceWorker: false }), false);
    assert.equal(webPushSupported({ ...all, notification: false }), false);
    assert.equal(webPushSupported({ ...all, dev: true }), false);
  });
});

describe("pushAvailable", () => {
  it("offers the switch only where the API can send and the device can receive", () => {
    assert.equal(pushAvailable("ios", config, true), true);
    assert.equal(pushAvailable("android", config, true), false);
    assert.equal(pushAvailable("web", config, true), true);
    assert.equal(pushAvailable("web", config, false), false);
    assert.equal(pushAvailable("web", { ...config, vapidPublicKey: null }, true), false);
    assert.equal(pushAvailable("ios", undefined, true), false);
  });
});

describe("safePushLink", () => {
  it("keeps in-app paths and drops anything that could leave the origin", () => {
    assert.equal(safePushLink("/packages?request=abc"), "/packages?request=abc");
    assert.equal(safePushLink("https://evil.example/x"), null);
    assert.equal(safePushLink("//evil.example/x"), null);
    assert.equal(safePushLink("packages"), null);
    assert.equal(safePushLink(undefined), null);
    assert.equal(safePushLink(42), null);
  });
});

describe("parsePushOpenData", () => {
  it("reads the three fields from an APNs / FCM / web payload and ignores junk", () => {
    assert.deepEqual(
      parsePushOpenData({ link: "/calendar", businessId: "b1", notificationId: "n1", aps: {} }),
      { link: "/calendar", businessId: "b1", notificationId: "n1" },
    );
    assert.deepEqual(parsePushOpenData({ link: "http://x", businessId: "" }), {
      link: null,
      businessId: null,
      notificationId: null,
    });
    assert.deepEqual(parsePushOpenData(null), {
      link: null,
      businessId: null,
      notificationId: null,
    });
  });
});

describe("parsePushOpenHash", () => {
  it("unpacks the cold-start hash the service worker adds and ignores other hashes", () => {
    const hash = `#push=${encodeURIComponent("businessId=b1&notificationId=n1")}`;
    assert.deepEqual(parsePushOpenHash(hash), {
      link: null,
      businessId: "b1",
      notificationId: "n1",
    });
    assert.equal(parsePushOpenHash("#tab=notifications"), null);
    assert.equal(parsePushOpenHash(""), null);
  });
});

describe("vapidKeyBytes", () => {
  it("decodes base64url without padding into the raw key bytes", () => {
    // "hello" → aGVsbG8 (base64url, no padding)
    assert.deepEqual(Array.from(vapidKeyBytes("aGVsbG8")), [104, 101, 108, 108, 111]);
    // URL-safe alphabet: '-' and '_' map to '+' and '/'
    assert.deepEqual(Array.from(vapidKeyBytes("-_8")), [251, 255]);
  });
});

describe("deviceLabelFor", () => {
  it("names apps by platform and browsers by browser + OS", () => {
    assert.equal(deviceLabelFor("ios", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "iPhone app");
    assert.equal(deviceLabelFor("ios", "Mozilla/5.0 (iPad; CPU OS 17_0)"), "iPad app");
    assert.equal(deviceLabelFor("android", "Mozilla/5.0 (Linux; Android 14)"), "Android app");
    assert.equal(
      deviceLabelFor(
        "web",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      ),
      "Safari on Mac",
    );
    assert.equal(
      deviceLabelFor(
        "web",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0",
      ),
      "Edge on Windows",
    );
    assert.equal(
      deviceLabelFor(
        "web",
        "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
      ),
      "Firefox on Linux",
    );
  });
});

describe("shouldOfferPushPrompt", () => {
  const base = {
    available: true,
    choice: "unset" as const,
    dismissed: false,
    permission: "default" as const,
  };
  it("nudges only when push can be had, nothing was decided and it was not waved off", () => {
    assert.equal(shouldOfferPushPrompt(base), true);
    assert.equal(shouldOfferPushPrompt({ ...base, available: false }), false);
    assert.equal(shouldOfferPushPrompt({ ...base, dismissed: true }), false);
    assert.equal(shouldOfferPushPrompt({ ...base, choice: "on" }), false);
    assert.equal(shouldOfferPushPrompt({ ...base, choice: "off" }), false);
    assert.equal(shouldOfferPushPrompt({ ...base, permission: "denied" }), false);
  });
});
