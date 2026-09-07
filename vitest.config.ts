/**
 * Vitest runs against the source directly, not through the app's Vite config:
 * that one pulls in TanStack Start, Nitro and the Cloudflare preset, none of
 * which a unit test needs and all of which cost seconds of startup.
 *
 * Two projects, because the split is real. Logic under `src/lib` is pure and
 * runs fastest with no DOM at all; component tests need jsdom and React
 * Testing Library. Browser journeys live in Playwright (`tests/e2e`), which is
 * excluded here so `vitest` never tries to run a spec it cannot drive.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.output/**", "tests/e2e/**"];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          // A few modules under src/lib touch Web Storage and opt into jsdom
          // with a `@vitest-environment` docblock; the setup file is a no-op
          // for the rest.
          setupFiles: ["./tests/support/env-setup.ts"],
          include: ["src/**/*.test.ts"],
          exclude: EXCLUDE,
        },
      },
      {
        resolve: { tsconfigPaths: true },
        plugins: [react()],
        test: {
          name: "component",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/support/env-setup.ts", "./tests/support/setup.ts"],
          include: ["tests/component/**/*.test.tsx"],
          exclude: EXCLUDE,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/lib/api/schema.d.ts", "src/components/ui/**"],
    },
  },
});
