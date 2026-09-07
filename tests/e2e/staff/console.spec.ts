import { demo, expect, test } from "../support/fixtures.ts";

/**
 * A walk through the staff console as the owner: every page in the sidebar
 * loads, and the demo data reaches the screen rather than an empty state.
 *
 * Deliberately broad and shallow. The point is that no page in the console is
 * broken — a route that throws, a query whose envelope key changed, a table
 * that renders nothing — which is exactly the class of breakage that unit tests
 * cannot see and that nobody notices until a customer does.
 */

test.beforeEach(async ({ signIn }) => {
  await signIn("owner");
});

test("the overview shows the studio's numbers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // £580.00 net, from the dashboard fixture.
  await expect(page.getByText("£580.00").first()).toBeVisible();
});

test("the sidebar names the business and the role held in it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Demo Strength Co\s+Owner/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ada Okafor/ })).toBeVisible();
});

test("the sidebar speaks the studio's own vocabulary", async ({ page }) => {
  // The configuration fixture renames bookings to "Sessions" and staff to
  // "Trainers"; a console still saying "Bookings" means terminology is being
  // fetched but not applied.
  await page.goto("/");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Sessions" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Trainers" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Session types" })).toBeVisible();
});

test("the calendar places this week's sessions on the grid", async ({ page }) => {
  await page.goto("/calendar");
  await expect(
    page.getByRole("button", { name: /1:1 Personal Training.*Alex Rivera/ }).first(),
  ).toBeVisible();
});

test("the bookings list shows past and upcoming sessions", async ({ page }) => {
  await page.goto("/bookings");
  await expect(page.getByText("DS-1005")).toBeVisible();
});

test("the clients list shows every client", async ({ page }) => {
  await page.goto("/clients");
  for (const name of ["Priya", "Tom", "Sam", "Nina", "Omar"]) {
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  }
});

test("a client profile shows their sessions and credits", async ({ page }) => {
  await page.goto(`/clients/${demo.ids.customerPriya}`);
  await expect(page.getByText("Priya Nair").first()).toBeVisible();
  // Six of ten left on the active block, with the expired one not counted.
  await expect(page.getByText("6 credits")).toBeVisible();

  await page.getByRole("tab", { name: "Packages" }).click();
  await expect(page.getByText("10-Session Block").first()).toBeVisible();
});

test("services, packages, staff and locations all load", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByText("1:1 Personal Training").first()).toBeVisible();

  await page.goto("/packages");
  await expect(page.getByText("10-Session Block").first()).toBeVisible();

  await page.goto("/staff");
  await expect(page.getByText("Alex Rivera").first()).toBeVisible();

  await page.goto("/locations");
  await expect(page.getByText("Northside Studio").first()).toBeVisible();
});

test("messages shows the conversation list", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByText("Priya", { exact: false }).first()).toBeVisible();
});

test("payments shows what has been taken", async ({ page }) => {
  await page.goto("/payments");
  await expect(page.getByText("£495.00").first()).toBeVisible();
});

test("reports and settings load", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.locator("main")).toBeVisible();

  await page.goto("/settings");
  await expect(page.locator("main")).toBeVisible();
});

test("no page in the console asks the API for something we do not mock", async ({ page, api }) => {
  // A 501 from the router means the app calls an endpoint the mock does not
  // know, which is how the mock drifts from the real API without anyone
  // noticing. Catch it across the whole walkthrough rather than per page.
  const missing: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 501)
      missing.push(`${response.request().method()} ${new URL(response.url()).pathname}`);
  });

  for (const path of [
    "/",
    "/calendar",
    "/bookings",
    "/clients",
    "/services",
    "/packages",
    "/staff",
    "/locations",
    "/messages",
    "/payments",
    "/reports",
    "/settings",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  expect(missing, `unmocked endpoints:\n${[...new Set(missing)].join("\n")}`).toEqual([]);
  expect(api.calls.length).toBeGreaterThan(0);
});
