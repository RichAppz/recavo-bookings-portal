// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// The deployed API does not send CORS headers for the local dev origin, so in
// dev the browser calls same-origin "/api/*" and Vite proxies to the real API.
//
// Honour `vite dev --mode staging` so the proxy reads .env.staging like the
// client bundle does; NODE_ENV alone is always "development" under `vite dev`,
// which silently sent staging sessions to the local API port.
const modeFlag = process.argv.findIndex((a) => a === "--mode" || a === "-m");
const mode =
  (modeFlag >= 0 ? process.argv[modeFlag + 1] : undefined) || process.env.NODE_ENV || "development";
const env = loadEnv(mode, process.cwd(), "");
const apiTarget = env.VITE_API_BASE_URL || "http://localhost:3000";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          // Staging is HTTPS; the local API is HTTP. Verifying TLS against
          // 127.0.0.1 would refuse the proxy and look like a network error.
          secure: apiTarget.startsWith("https://"),
        },
      },
    },
  },
});
