import { demo, expect, problem, test } from "../support/fixtures.ts";

/**
 * What each role can see, driven through the real router and the real
 * permission map rather than a stub.
 *
 * The nav is the visible half; the other half is that a page nobody should
 * reach is not reachable by typing its address. Both are checked, because a
 * hidden link is presentation and a blocked route is the actual control.
 */

/** The sidebar links, as a person would read them. */
async function navLinks(page: import("@playwright/test").Page) {
  await page.waitForSelector("nav a");
  return page.getByRole("navigation").getByRole("link").allInnerTexts();
}

test.describe("the owner", () => {
  test("gets the whole console", async ({ page, signIn }) => {
    await signIn("owner");
    await page.goto("/");
    const links = (await navLinks(page)).map((t) => t.trim());
    expect(links).toEqual(
      expect.arrayContaining([
        "Overview",
        "Calendar",
        "Sessions",
        "Clients",
        "Packages",
        "Trainers",
        "Locations",
        "Payments",
        "Reports",
        "Billing",
        "Settings",
      ]),
    );
  });

  test("is not offered the platform view", async ({ page, signIn }) => {
    // platform.billing_admin is Recavo staff only; an owner holding it could
    // reach into another studio's billing.
    await signIn("owner");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Platform view" })).toBeHidden();
  });
});

test.describe("reception", () => {
  test("runs the desk but sees no reports or billing", async ({ page, signIn }) => {
    await signIn("reception");
    await page.goto("/");
    const links = (await navLinks(page)).map((t) => t.trim().split("\n")[0]);
    expect(links).toContain("Calendar");
    expect(links).toContain("Clients");
    expect(links).toContain("Payments");
    expect(links).not.toContain("Reports");
    expect(links).not.toContain("Billing");
  });

  test("is turned away from reports when typing the address", async ({ page, signIn }) => {
    // Hiding the link is presentation; the in-page gate is the control.
    await signIn("reception");
    await page.goto("/reports");
    await expect(page.getByText("Reports are restricted")).toBeVisible();
    await expect(page.getByText("£580.00")).toBeHidden();
  });
});

test.describe("restricted staff", () => {
  test("sees their own diary and nothing about anyone else's clients", async ({ page, signIn }) => {
    await signIn("restricted");
    await page.goto("/");
    const links = (await navLinks(page)).map((t) => t.trim().split("\n")[0]);
    expect(links).toContain("Calendar");
    expect(links).toContain("Sessions");
    expect(links).not.toContain("Clients");
    expect(links).not.toContain("Payments");
    expect(links).not.toContain("Messages");
    expect(links).not.toContain("Reports");
  });

  test("is shown no client names even when typing the address", async ({ page, signIn }) => {
    // `/clients` carries no in-page permission gate the way `/reports` does, so
    // the only thing standing between restricted staff and the client list is
    // the API refusing. That refusal is what this asserts: whatever the page
    // chooses to render, no client's name may appear on it.
    await signIn("restricted");
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    for (const name of ["Priya", "Tom Whitfield", "Sam Okonkwo", "Nina", "Omar"]) {
      await expect(page.getByText(name, { exact: false })).toHaveCount(0);
    }
  });

  test("is shown no payment figures either", async ({ page, signIn }) => {
    await signIn("restricted");
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("£495.00")).toHaveCount(0);
  });
});

test.describe("finance", () => {
  test("gets the money pages but not the diary", async ({ page, signIn }) => {
    await signIn("finance");
    await page.goto("/");
    const links = (await navLinks(page)).map((t) => t.trim().split("\n")[0]);
    expect(links).toContain("Payments");
    expect(links).toContain("Reports");
    expect(links).toContain("Billing");
    expect(links).not.toContain("Calendar");
    expect(links).not.toContain("Clients");
  });
});

test.describe("the API's word is final", () => {
  test("a 403 is surfaced rather than swallowed into an empty list", async ({
    page,
    signIn,
    api,
  }) => {
    // Server-side permissions can be narrower than the token suggests. An empty
    // table would read as "this studio has no clients", which is a lie, and one
    // that would have someone adding a client who already exists.
    await signIn("owner");
    api.get("/api/v1/businesses/:businessId/customers", () => {
      throw problem(403, "FORBIDDEN", { title: "You do not have access to clients" });
    });

    await page.goto("/clients");
    await expect(
      page.getByText(/couldn't load|do not have access|went wrong|restricted/i).first(),
    ).toBeVisible();
    await expect(page.getByText("Priya Nair")).toHaveCount(0);
  });
});

test.describe("the booking page link", () => {
  test("points at the customer hostname, not the console's", async ({ page, signIn }) => {
    // A link copied off the dashboard and printed on a business card must not
    // need a login.
    await signIn("owner");
    await page.goto("/");
    const link = page.getByRole("link", { name: /View booking page/ });
    await expect(link).toHaveAttribute(
      "href",
      new RegExp(`^http://book\\.recavo\\.test:\\d+/${demo.business.slug}$`),
    );
  });
});
