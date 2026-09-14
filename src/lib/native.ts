/**
 * Helpers for running inside the Capacitor mobile shell (see capacitor.config.ts).
 *
 * The shell loads the hosted web app, and Capacitor injects its bridge into
 * that page, so the same bundle serves the browser and the app. Everything
 * here is a no-op in a normal browser tab.
 *
 * Plugin modules are imported lazily so the SSR render and the ordinary web
 * bundle never touch them.
 */

import type { SignInWithApplePlugin } from "@capacitor-community/apple-sign-in";

/** Custom URL scheme registered in ios/App/App/Info.plist and AndroidManifest.xml. */
export const NATIVE_URL_SCHEME = "app.recavo.portal";

/**
 * Deep link the app receives once Google sign-in has completed. Supabase does
 * not redirect here directly: it sends the browser to the https bounce page
 * (see nativeAuthRedirectUrl), which relays the result to this URL.
 */
export const NATIVE_AUTH_REDIRECT = `${NATIVE_URL_SCHEME}://auth/callback`;

/**
 * Where Supabase sends the browser after Google sign-in when running in the
 * app: public/auth/native.html on the origin the app is loaded from (served
 * extensionless by Cloudflare's asset handling). That origin is already in
 * each Supabase project's Redirect URL allowlist (the web sign-in depends on
 * it), so no per-scheme dashboard entry is needed. The page forwards the
 * tokens on to NATIVE_AUTH_REDIRECT.
 */
export function nativeAuthRedirectUrl(): string {
  return `${window.location.origin}/auth/native`;
}

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  return Boolean(capacitor()?.isNativePlatform?.());
}

export function isNativeIOS(): boolean {
  return isNativeApp() && capacitor()?.getPlatform?.() === "ios";
}

async function closeInAppBrowser(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // Not supported on Android; the deep link already brought the app forward.
  }
}

type Unsubscribe = () => void;

/** Wraps a Capacitor plugin listener whose registration is async into a sync unsubscribe. */
function subscribe(register: () => Promise<{ remove: () => Promise<void> }>): Unsubscribe {
  let removed = false;
  let handle: { remove: () => Promise<void> } | undefined;
  void register().then((h) => {
    if (removed) void h.remove();
    else handle = h;
  });
  return () => {
    removed = true;
    void handle?.remove();
  };
}

function onAppUrlOpen(handler: (url: string) => void): Unsubscribe {
  return subscribe(async () => {
    const { App } = await import("@capacitor/app");
    return App.addListener("appUrlOpen", (event) => handler(event.url));
  });
}

/** Fires when the user dismisses the in-app browser sheet themselves (not on Browser.close()). */
function onInAppBrowserDismissed(handler: () => void): Unsubscribe {
  return subscribe(async () => {
    const { Browser } = await import("@capacitor/browser");
    return Browser.addListener("browserFinished", handler);
  });
}

export type NativeOAuthTokens = { access_token: string; refresh_token: string };
export type NativeOAuthCallback =
  { code: string } | { tokens: NativeOAuthTokens } | { error: string };
export type NativeOAuthResult = NativeOAuthCallback | { cancelled: true };

/**
 * Runs an OAuth round-trip in the system in-app browser sheet
 * (SFSafariViewController / Chrome Custom Tab) — a first-class browser that
 * Google permits for OAuth and that shares the user's existing Google session,
 * unlike the WebView.
 *
 * Resolves when the provider redirects back to NATIVE_AUTH_REDIRECT (with the
 * session tokens, a PKCE code, or the provider's error), or with `cancelled`
 * when the user closes the sheet without finishing. The sheet is closed before
 * resolving.
 */
export async function runNativeOAuth(url: string): Promise<NativeOAuthResult> {
  const { Browser } = await import("@capacitor/browser");

  return new Promise<NativeOAuthResult>((resolve) => {
    let settled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: NativeOAuthResult) => {
      if (settled) return;
      settled = true;
      if (dismissTimer) clearTimeout(dismissTimer);
      stopUrl();
      stopDismiss();
      resolve(result);
    };

    const stopUrl = onAppUrlOpen((incoming) => {
      const parsed = parseAuthCallback(incoming);
      if (!parsed) return;
      void closeInAppBrowser().finally(() => settle(parsed));
    });

    // On Android the tab closing and the deep link arriving are separate
    // events, so give a redirect a moment to land before calling it a cancel.
    const stopDismiss = onInAppBrowserDismissed(() => {
      dismissTimer = setTimeout(() => settle({ cancelled: true }), 400);
    });

    void Browser.open({ url }).catch((err: unknown) => {
      settle({ error: err instanceof Error ? err.message : "Could not open the sign-in window" });
    });
  });
}

/** Deep link a page on our origin uses to hand its URL back to the app (see native-return.ts). */
export const NATIVE_RETURN_PREFIX = `${NATIVE_URL_SCHEME}://return`;

export function nativeReturnLink(path: string): string {
  return `${NATIVE_RETURN_PREFIX}?to=${encodeURIComponent(path)}`;
}

/**
 * Parses the return deep link back into a same-origin path. Rejects anything
 * that is not a plain absolute path, so the scheme cannot send the app
 * off-origin.
 */
export function parseNativeReturn(url: string): string | null {
  if (!url.startsWith(NATIVE_RETURN_PREFIX)) return null;
  const to = new URL(url.replace(/^[a-z.]+:\/\//i, "https://x/")).searchParams.get("to");
  if (!to || !to.startsWith("/") || to.startsWith("//")) return null;
  return to;
}

/**
 * Sends the user to a hosted third-party flow (Stripe Checkout, the Stripe
 * Billing Portal, Connect onboarding) that ends by redirecting back to a URL on
 * our own origin.
 *
 * In a browser tab that is a plain navigation. In the app it is not: the
 * WebView only navigates to hosts in `server.allowNavigation`, anything else
 * is handed to Safari; and a WebView is the wrong place for a payment page
 * anyway — Apple Pay is only supported in Safari and SFSafariViewController,
 * and it draws under the notch and offers no way back. So the app opens the
 * flow in the system in-app browser sheet, entering through
 * public/native/go.html so the page Stripe eventually redirects to knows it is
 * inside the sheet and hands its URL back over the app's URL scheme. On
 * arrival the sheet is closed and the main WebView (which holds the signed-in
 * session) navigates to that same URL, so the return page runs exactly as it
 * does on the web.
 *
 * Resolves once the hand-off has happened, or with `{ closed: true }` when the
 * user dismisses the sheet themselves — the Billing Portal has no "finished"
 * moment, so callers refresh what they show when that happens.
 */
/** Fired on `window` when the user dismisses a hosted-flow sheet without a return. */
export const HOSTED_FLOW_CLOSED_EVENT = "recavo:hosted-flow-closed";

export async function openHostedFlow(
  url: string,
): Promise<{ closed: true } | { returned: string }> {
  if (!isNativeApp()) {
    window.location.assign(url);
    return new Promise(() => {}); // the page is going away
  }

  const { Browser } = await import("@capacitor/browser");
  const entry = `${window.location.origin}/native/go?to=${encodeURIComponent(url)}`;

  return new Promise((resolve) => {
    let settled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: { closed: true } | { returned: string }) => {
      if (settled) return;
      settled = true;
      if (dismissTimer) clearTimeout(dismissTimer);
      stopUrl();
      stopDismiss();
      resolve(result);
    };

    const stopUrl = onAppUrlOpen((incoming) => {
      const path = parseNativeReturn(incoming);
      if (!path) return;
      void closeInAppBrowser().finally(() => {
        settle({ returned: path });
        window.location.assign(`${window.location.origin}${path}`);
      });
    });

    // As in runNativeOAuth: on Android the tab closing and the deep link
    // arriving are separate events, so give a return a moment to land first.
    const stopDismiss = onInAppBrowserDismissed(() => {
      dismissTimer = setTimeout(() => {
        settle({ closed: true });
        // Whatever they did in there (changed plan, added a card, finished
        // onboarding) is not reflected in the app's cached data yet.
        window.dispatchEvent(new Event(HOSTED_FLOW_CLOSED_EVENT));
      }, 400);
    });

    void Browser.open({ url: entry }).catch(() => {
      // Could not present the sheet; fall back to the plain navigation and let
      // Capacitor's allowNavigation keep it in the WebView.
      settle({ closed: true });
      window.location.assign(url);
    });
  });
}

export type NativeAppleSignInResult =
  { identityToken: string; nonce: string; name: string | null } | { cancelled: true };

/**
 * Runs the system Sign in with Apple sheet (ASAuthorizationController) on iOS
 * and returns Apple's identity token for `supabase.auth.signInWithIdToken`.
 *
 * Apple echoes the nonce we hand the request into the identity token, and
 * Supabase checks that claim against the SHA-256 of the nonce we send it, so
 * the request gets the hash and the caller gets the raw value. Apple only
 * reveals the user's name on their very first authorisation, so it is returned
 * for the caller to persist.
 */
let signInWithApplePlugin: SignInWithApplePlugin | undefined;

/**
 * Binds to the native plugin by name rather than importing
 * @capacitor-community/apple-sign-in's JS: its web fallback touches `document`
 * at module scope, which crashes the SSR worker once the bundler inlines the
 * import. Only ever called on iOS, so no web fallback is needed. Bound once —
 * Capacitor warns if the same plugin name is registered twice.
 *
 * Returned inside a holder, never directly: Capacitor's plugin object is a
 * Proxy that turns every property access into a native call, so resolving a
 * promise with it makes the runtime invoke `.then` as a plugin method and hang.
 */
async function appleSignInPlugin(): Promise<{ plugin: SignInWithApplePlugin }> {
  if (!signInWithApplePlugin) {
    const { registerPlugin } = await import("@capacitor/core");
    signInWithApplePlugin = registerPlugin<SignInWithApplePlugin>("SignInWithApple");
  }
  return { plugin: signInWithApplePlugin };
}

export async function runNativeAppleSignIn(): Promise<NativeAppleSignInResult> {
  const { plugin: SignInWithApple } = await appleSignInPlugin();
  const nonce = randomNonce();
  try {
    const { response } = await SignInWithApple.authorize({
      // clientId/redirectURI only matter for the plugin's web flow; iOS uses the bundle id.
      clientId: NATIVE_URL_SCHEME,
      redirectURI: NATIVE_AUTH_REDIRECT,
      scopes: "email name",
      nonce: await sha256Hex(nonce),
    });
    const name = [response.givenName, response.familyName].filter(Boolean).join(" ").trim();
    return { identityToken: response.identityToken, nonce, name: name || null };
  } catch (err) {
    // ASAuthorizationError.canceled (1001): the user dismissed the sheet.
    const message = err instanceof Error ? err.message : String(err);
    if (/1001|cancel/i.test(message)) return { cancelled: true };
    throw err;
  }
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parses the Supabase OAuth callback carried by a deep link.
 *
 * With the client's default implicit flow Supabase puts the session in the
 * fragment (`#access_token=…&refresh_token=…`); with PKCE it puts a `?code=`
 * in the query. Errors can land in either. Custom-scheme URLs do not always
 * parse with `new URL`, so both parts are read by hand.
 */
export function parseAuthCallback(url: string): NativeOAuthCallback | null {
  if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return null;
  const [beforeHash, hash = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  for (const [key, value] of new URLSearchParams(hash)) params.append(key, value);

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) return { tokens: { access_token, refresh_token } };
  const code = params.get("code");
  if (code) return { code };
  const error = params.get("error_description") ?? params.get("error");
  return { error: error ?? "Sign-in was cancelled or did not complete." };
}
