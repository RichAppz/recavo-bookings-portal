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

/** Custom URL scheme registered in ios/App/App/Info.plist and AndroidManifest.xml. */
export const NATIVE_URL_SCHEME = "app.recavo.portal";

/**
 * Where Supabase sends the browser after Google sign-in when running in the
 * app. Must be listed under Authentication → URL Configuration → Redirect URLs
 * in every Supabase project the app is built against (staging and production).
 */
export const NATIVE_AUTH_REDIRECT = `${NATIVE_URL_SCHEME}://auth/callback`;

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
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
