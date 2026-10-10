//! RECAVO desktop shell.
//!
//! A thin Tauri window around the hosted portal, the desktop twin of the
//! Capacitor shell in `capacitor.config.ts`: the web app is served from the
//! usual origin (staging by default, production via `tauri.production.conf.json`)
//! and only the parts a WebView cannot do itself live here.
//!
//! - **Leaving the window.** The window has no address bar or back button, so
//!   anything that is not ours opens in the default browser. Clicks on
//!   off-origin links are redirected by the initialization script below, new
//!   windows (`target="_blank"`, `window.open`) by `on_new_window`, and the
//!   identity providers' pages by `on_navigation`, because Google refuses to run
//!   OAuth inside an embedded WebView at all. Plain navigations are otherwise
//!   left alone: Stripe's hosted Checkout, Billing Portal and Connect pages are
//!   loaded in the window on purpose so they can redirect back to our origin,
//!   and the navigation hook fires for *every* frame, so denying by host would
//!   also break the 3-D Secure and Stripe Elements iframes.
//! - **Finishing sign-in.** The `com.richappz.recavo://` URL scheme is
//!   registered so the sign-in that finished in the browser can hand its result
//!   back, via `public/auth/native.html`, the same bounce page the mobile apps
//!   use. The callback is loaded into the WebView on our origin, where the
//!   ordinary web sign-in code completes it.
//! - **Identifying itself.** The page learns it is inside the shell from
//!   `window.__RECAVO_DESKTOP__` (see `isDesktopApp` in `src/lib/native.ts`).
//!   No IPC is exposed to the remote page: the shell talks to the page only
//!   through that script, and the page talks back only by navigating.

use tauri::utils::config::FrontendDist;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

const WINDOW_LABEL: &str = "main";

/// Custom URL scheme the browser hands sign-in results back on. Must match
/// `NATIVE_URL_SCHEME` in `src/lib/native.ts` and `plugins.deep-link` in
/// `tauri.conf.json`.
const URL_SCHEME: &str = "com.richappz.recavo";

/// Whether a navigation to `url` must be taken out of the WebView and given to
/// the system.
///
/// Only destinations that are never legitimately loaded in a frame of our own
/// pages belong here (see the module docs): the identity providers' sign-in
/// pages, Supabase's OAuth entry point that redirects to them (matched by path,
/// since the auth host can be a custom domain), and links to other apps.
fn leaves_webview(url: &Url) -> bool {
    match url.scheme() {
        "mailto" | "tel" | "sms" | "facetime" => true,
        "http" | "https" => {
            let host = url.host_str().unwrap_or("");
            host == "accounts.google.com"
                || host.ends_with(".accounts.google.com")
                || host == "appleid.apple.com"
                || url.path().starts_with("/auth/v1/authorize")
        }
        _ => false,
    }
}

/// Turns a `com.richappz.recavo://auth/callback?…#…` deep link into the URL on
/// our origin that carries the same query and fragment. supabase-js reads the
/// session (or the provider's error) out of that URL on load, exactly as it
/// does after a browser-tab sign-in. Any other link on the scheme is ignored.
fn callback_target(link: &Url, home: &Url) -> Option<Url> {
    if link.scheme() != URL_SCHEME || link.host_str() != Some("auth") || link.path() != "/callback" {
        return None;
    }
    let mut target = home.clone();
    target.set_path("/");
    target.set_query(link.query());
    target.set_fragment(link.fragment());
    Some(target)
}

/// The portal origin this build is pinned to: `build.devUrl` under `tauri dev`,
/// otherwise `build.frontendDist`, both of which hold a URL in this project.
fn home_url(app: &AppHandle) -> Url {
    let build = &app.config().build;
    if tauri::is_dev() {
        if let Some(url) = &build.dev_url {
            return url.clone();
        }
    }
    match &build.frontend_dist {
        Some(FrontendDist::Url(url)) => url.clone(),
        _ => panic!("tauri.conf.json: build.frontendDist must be the portal URL"),
    }
}

/// Runs in the main frame before any page script, on every page the WebView
/// loads. Publishes the shell marker and sends clicks on off-origin links to
/// the default browser by turning them into `window.open`, which lands in
/// `on_new_window`. Values are JSON-encoded so they are valid JS literals.
fn init_script(app: &AppHandle, home: &Url) -> String {
    let marker = serde_json::json!({
        "platform": "macos",
        "version": app.package_info().version.to_string(),
    });
    let home_host = serde_json::json!(home.host_str().unwrap_or(""));
    format!(
        r#"(() => {{
  Object.defineProperty(window, "__RECAVO_DESKTOP__", {{ value: Object.freeze({marker}) }});
  const homeHost = {home_host};
  document.addEventListener("click", (event) => {{
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    let url;
    try {{ url = new URL(anchor.href, location.href); }} catch {{ return; }}
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.host === homeHost) return;
    event.preventDefault();
    window.open(url.href, "_blank", "noopener");
  }}, true);
}})();"#
    )
}

fn open_externally(url: &Url) {
    if let Err(err) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
        eprintln!("could not open {url} in the default browser: {err}");
    }
}

fn build_main_window(app: &AppHandle, home: &Url) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External(home.clone()))
        .title("RECAVO")
        .inner_size(1280.0, 840.0)
        .min_inner_size(900.0, 600.0)
        .initialization_script(init_script(app, home))
        .on_navigation(|url| {
            if !leaves_webview(url) {
                return true;
            }
            open_externally(url);
            false
        })
        .on_new_window(|url, _features| {
            open_externally(&url);
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}

fn handle_deep_link(app: &AppHandle, home: &Url, link: &Url) {
    let Some(target) = callback_target(link, home) else {
        eprintln!("ignoring deep link {}://{}{}", link.scheme(), link.host_str().unwrap_or(""), link.path());
        return;
    };
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else { return };
    if let Err(err) = window.navigate(target) {
        eprintln!("could not load the sign-in callback: {err}");
        return;
    }
    // The browser had focus while the person signed in; bring the app back.
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let home = home_url(&handle);
            build_main_window(&handle, &home)?;

            let link_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&link_handle, &home, &url);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the RECAVO desktop shell");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> Url {
        Url::parse("https://staging.bookings.recavo.app").unwrap()
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn identity_providers_and_other_apps_leave_the_webview() {
        assert!(leaves_webview(&url("https://accounts.google.com/o/oauth2/v2/auth?x=1")));
        assert!(leaves_webview(&url("https://appleid.apple.com/auth/authorize")));
        assert!(leaves_webview(&url("https://xyz.supabase.co/auth/v1/authorize?provider=google")));
        assert!(leaves_webview(&url("https://auth.recavo.app/auth/v1/authorize?provider=apple")));
        assert!(leaves_webview(&url("mailto:hello@recavo.app")));
        assert!(leaves_webview(&url("tel:+441234567890")));
    }

    #[test]
    fn our_pages_stripe_and_frames_stay_in_the_webview() {
        assert!(!leaves_webview(&url("https://staging.bookings.recavo.app/calendar")));
        assert!(!leaves_webview(&url("https://checkout.stripe.com/c/pay/cs_test")));
        assert!(!leaves_webview(&url("https://billing.stripe.com/p/session/x")));
        assert!(!leaves_webview(&url("https://js.stripe.com/v3/elements-inner-payment.html")));
        assert!(!leaves_webview(&url("https://acs.issuing-bank.example/3ds/challenge")));
        assert!(!leaves_webview(&url("https://xyz.supabase.co/auth/v1/verify?token=x")));
        assert!(!leaves_webview(&url("about:blank")));
        assert!(!leaves_webview(&url("blob:https://staging.bookings.recavo.app/uuid")));
    }

    #[test]
    fn auth_callback_is_replayed_on_our_origin() {
        let link = url("com.richappz.recavo://auth/callback#access_token=a&refresh_token=r&type=bearer");
        assert_eq!(
            callback_target(&link, &home()).unwrap().as_str(),
            "https://staging.bookings.recavo.app/#access_token=a&refresh_token=r&type=bearer"
        );

        let error = url("com.richappz.recavo://auth/callback?error=access_denied&error_description=x");
        assert_eq!(
            callback_target(&error, &home()).unwrap().as_str(),
            "https://staging.bookings.recavo.app/?error=access_denied&error_description=x"
        );
    }

    #[test]
    fn other_links_on_the_scheme_are_ignored() {
        assert!(callback_target(&url("com.richappz.recavo://return?to=/billing"), &home()).is_none());
        assert!(callback_target(&url("com.richappz.recavo://auth/other"), &home()).is_none());
        assert!(callback_target(&url("https://auth/callback#access_token=a"), &home()).is_none());
    }
}
