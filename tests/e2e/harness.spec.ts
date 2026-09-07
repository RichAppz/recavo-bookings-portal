import { expect, test } from "@playwright/test";

/**
 * Proves the scaffolding itself before any journey relies on it: the two
 * hostnames resolve to the dev server, the test environment reached the client
 * bundle, and nothing can escape to the real internet.
 */
test.describe("harness", () => {
  test("serves the app on this project's hostname", async ({ page, baseURL }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    expect(new URL(page.url()).hostname).toBe(new URL(baseURL!).hostname);
  });

  test("built the client against the test Supabase project, not staging", async ({ page }) => {
    // If .env.test failed to reach the dev server the app would be wired to the
    // real recavo-staging project, and a sign-in test would create a live user.
    const hosts = new Set<string>();
    page.on("request", (request) => hosts.add(new URL(request.url()).hostname));

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const supabaseHosts = [...hosts].filter((h) => h.endsWith(".supabase.co"));
    expect(supabaseHosts.every((h) => h === "recavo-test.supabase.co")).toBe(true);
    expect(hosts).not.toContain("llxyiqfmbjjgbpacbnol.supabase.co");
  });

  test("cannot reach anything outside the dev server", async ({ page }) => {
    await page.goto("/");
    const reachable = await page.evaluate(async () => {
      try {
        await fetch("https://example.com", { mode: "no-cors" });
        return true;
      } catch {
        return false;
      }
    });
    expect(reachable).toBe(false);
  });
});
