import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Offline app shell.
 *
 * The service worker (src/sw.ts) caches this page's HTML and serves it for any
 * navigation it can't reach the network for. Because the route is client-only
 * (`ssr: false`), the server renders just the root document — the same markup
 * for every URL — and on the client the router matches whatever URL the tab is
 * actually on and renders that page from the cached bundle. That is how Start's
 * own SPA mode works; here it is limited to the offline path so every other
 * page keeps full SSR.
 *
 * Reached directly (someone typed it), it just sends them home.
 */
export const Route = createFileRoute("/app-shell")({
  ssr: false,
  head: () => ({ meta: [{ title: "RECAVO" }, { name: "robots", content: "noindex" }] }),
  component: AppShellRedirect,
});

function AppShellRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}
