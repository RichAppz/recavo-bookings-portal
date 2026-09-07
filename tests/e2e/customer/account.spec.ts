import { demo, expect, problem, test } from "../support/fixtures.ts";

/**
 * What a customer sees after they have bought something.
 *
 * `/account` answers the two questions someone opens the app for — what have I
 * got booked, and what have I already paid for — across every studio they deal
 * with. `/portal?businessId=` is the older per-studio page and still owns the
 * things that only make sense for one studio: messages, cancelling, records.
 */

test.describe("the account overview", () => {
  test.beforeEach(async ({ signIn, page }) => {
    await signIn("customer");
    await page.goto("/account");
  });

  test("leads with the next session rather than a list to read", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await expect(page.getByText("Next session")).toBeVisible();
    await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
    await expect(page.getByText("Credits left")).toBeVisible();
    await expect(page.getByText("Total spent")).toBeVisible();
  });

  test("counts credits across the buckets that are still usable", async ({ page }) => {
    const usable = demo.portalCredits
      .filter((c) => c.status === "active" && c.available > 0)
      .reduce((sum, c) => sum + c.available, 0);

    await expect(
      page
        .getByText("Credits left")
        .locator("xpath=../..")
        .getByText(String(usable), { exact: true }),
    ).toBeVisible();
  });

  test("lists the upcoming sessions with the studio's own service names", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Upcoming sessions" })).toBeVisible();
    await expect(page.getByText(demo.services[0].name).first()).toBeVisible();
  });

  test("offers a way to book, which is the point of being here", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Book a session/ }).first()).toHaveAttribute(
      "href",
      `/${demo.business.slug}`,
    );
  });

  test("links through to the studio's own page for messages and records", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Messages and records" })).toHaveAttribute(
      "href",
      new RegExp(`/portal\\?businessId=${demo.business.id}`),
    );
  });
});

test.describe("the other account views", () => {
  test("the calendar puts the sessions on a month grid", async ({ page, signIn }) => {
    await signIn("customer");
    await page.goto("/account?view=calendar");

    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.getByText("Mon", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  });

  test("credits show what is left, of how many, and when they lapse", async ({ page, signIn }) => {
    // An unused credit that quietly expires is money the customer lost, so the
    // expiry has to be on the card and not a tooltip.
    await signIn("customer");
    await page.goto("/account?view=credits");

    const credit = demo.portalCredits[0];
    await expect(page.getByText(String(credit.available), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`of ${credit.unitsIssued} sessions left`)).toBeVisible();
    await expect(page.getByText(/^Expires /).first()).toBeVisible();
  });

  test("purchases list what was paid, when, and a receipt", async ({ page, signIn }) => {
    await signIn("customer");
    await page.goto("/account?view=purchases");

    await expect(page.getByRole("heading", { name: "Purchases" })).toBeVisible();
    await expect(page.getByText("£495.00").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Receipt" }).first()).toBeVisible();
  });
});

test.describe("an account with nothing on it", () => {
  test("says so plainly instead of showing four zeroes", async ({ page, signIn, api }) => {
    api.get("/api/v1/portal/businesses", () => ({ businesses: [] }));

    await signIn("stranger");
    await page.goto("/account");

    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(page.getByText(/Use the link your studio gave you/)).toBeVisible();
  });

  test("admits when a studio failed to load rather than under-reporting", async ({
    page,
    signIn,
    api,
  }) => {
    // Silently dropping a studio would show a customer fewer sessions than they
    // have, and they would miss one.
    api.get("/api/v1/portal/bookings", () => {
      throw problem(503, "UNAVAILABLE", { title: "Studio is not responding" });
    });

    await signIn("customer");
    await page.goto("/account");

    await expect(
      page.getByText(
        "One of your studios didn't load, so this may be incomplete. Refresh to try again.",
      ),
    ).toBeVisible();
  });
});

test.describe("someone signed in with no purchases anywhere", () => {
  test.beforeEach(async ({ api }) => {
    api.post("/api/v1/portal/links", () => ({ businessIds: [] }));
    api.get("/api/v1/portal/businesses", () => ({ businesses: [] }));
  });

  test("is told where to go rather than left on an empty page", async ({ page, signIn }) => {
    await signIn("stranger");
    await page.goto("/");

    await expect(page.getByText(demo.personas.stranger.email)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
  });

  test("is not offered the studio console from the booking host", async ({ page, signIn }) => {
    // This is `book.`, where a "set up your studio" call to action would be
    // aimed at entirely the wrong person.
    await signIn("stranger");
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Set up your PT business" })).toHaveCount(0);
  });
});

test.describe("the per-studio portal", () => {
  test("shows the customer their own name and sessions", async ({ page, signIn }) => {
    await signIn("customer");
    await page.goto(`/portal?businessId=${demo.business.id}`);

    await expect(
      page.getByRole("heading", { name: new RegExp(demo.portalCustomer.firstName) }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upcoming sessions" })).toBeVisible();
  });

  test("separates messages, payments and the rest into tabs", async ({ page, signIn }) => {
    await signIn("customer");
    await page.goto(`/portal?businessId=${demo.business.id}`);

    for (const tab of ["Bookings", "Messages", "Payments", "More"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("£495.00").first()).toBeVisible();
  });

  test("asks before cancelling a session, and mentions the studio's policy", async ({
    page,
    signIn,
    api,
  }) => {
    // Cancelling can cost the customer money under the studio's policy, and it
    // frees a slot someone else will take. It should not happen on one stray tap.
    let cancelled: string | null = null;
    api.post("/api/v1/portal/bookings/:bookingId/cancel", ({ params }) => {
      cancelled = params.bookingId ?? null;
      return { booking: { ...demo.portalBookings[0], status: "cancelled_by_customer" } };
    });

    await signIn("customer");
    await page.goto(`/portal?businessId=${demo.business.id}`);

    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByRole("heading", { name: "Cancel this session?" })).toBeVisible();
    await expect(page.getByText(/cancellation policy still applies/)).toBeVisible();
    expect(cancelled).toBeNull();

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("Booking cancelled")).toBeVisible();
    expect(cancelled).not.toBeNull();
  });

  test("lets the customer back out of the cancellation", async ({ page, signIn, api }) => {
    let cancelled = 0;
    api.post("/api/v1/portal/bookings/:bookingId/cancel", () => {
      cancelled += 1;
      return { booking: demo.portalBookings[0] };
    });

    await signIn("customer");
    await page.goto(`/portal?businessId=${demo.business.id}`);

    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByRole("button", { name: "Keep booking" }).click();

    await expect(page.getByRole("heading", { name: "Cancel this session?" })).toBeHidden();
    expect(cancelled).toBe(0);
  });

  test("explains a link with no business id", async ({ page, signIn }) => {
    await signIn("customer");
    await page.goto("/portal");

    await expect(page.getByText("Missing business")).toBeVisible();
    await expect(page.getByText(/use the link provided by your studio/i)).toBeVisible();
  });

  test("sends someone with no link at this studio back to where they belong", async ({
    page,
    signIn,
    api,
  }) => {
    // Signing in on a page someone else left open lands you on their URL. A
    // stranger's portal is not the place to leave them.
    api.get("/api/v1/portal/me", () => {
      throw problem(404, "NOT_FOUND", { title: "No customer here" });
    });

    await signIn("stranger");
    await page.goto(`/portal?businessId=${demo.business.id}`);

    await expect(page).not.toHaveURL(/businessId=/);
  });
});
