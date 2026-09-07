import { demo, expect, problem, test } from "../support/fixtures.ts";

/**
 * Failures on the customer side of the product.
 *
 * A stranger with a booking link has no support channel and no reason to try
 * twice. Anything that looks like "this studio has nothing available" when it
 * really means "we couldn't reach the server" costs the studio the booking.
 */

test.describe("the booking page when the server is unreachable", () => {
  test("says the sessions could not be loaded, not that there are none", async ({
    page,
    signOut,
    api,
  }) => {
    api.get("/api/v1/public/businesses/:businessId/services", ({ route }) => route.abort("failed"));

    await signOut();
    await page.goto(`/${demo.publicBusiness.slug}`);

    await expect(page.getByText("Couldn't load services. Please try again shortly.")).toBeVisible();
  });

  test("distinguishes a studio with no bookable sessions from a failure", async ({
    page,
    signOut,
    api,
  }) => {
    api.get("/api/v1/public/businesses/:businessId/services", () => ({ services: [] }));

    await signOut();
    await page.goto(`/${demo.publicBusiness.slug}`);

    await expect(page.getByText("No bookable services are available right now.")).toBeVisible();
  });

  test("keeps the customer on the review step when the payment cannot be set up", async ({
    page,
    signOut,
    stripe,
    api,
  }) => {
    // Their slot is held. Dropping them back to the start would release it and
    // lose the time they picked over a transient failure.
    api.post("/api/v1/public/businesses/:businessId/bookings/payment", () => {
      throw problem(503, "STRIPE_UNAVAILABLE", { title: "Payments are unavailable" });
    });

    await stripe();
    await signOut();
    await page.goto(`/${demo.publicBusiness.slug}`);
    await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();
    await page
      .locator("button", { hasText: /^\d{2}:\d{2}$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("First name").fill("Jamie");
    await page.getByLabel("Last name").fill("Ellis");
    await page.getByLabel("Email").fill("jamie@example.co.uk");
    await page.getByLabel("Mobile").fill("07700 900123");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review & confirm" })).toBeVisible();
    await expect(
      page.getByText("Payment is unavailable right now. Please try again in a moment."),
    ).toBeVisible();
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
  });
});

test.describe("a page that does not exist on the booking host", () => {
  test("shows the studio-not-found page rather than a bare 404", async ({ page, signOut, api }) => {
    // Every unknown path here looks like a studio slug, so the friendlier
    // "check your link" wording is the right one.
    api.get("/api/v1/public/businesses/by-slug/:slug", () => {
      throw problem(404, "NOT_FOUND", { title: "No such business" });
    });

    await signOut();
    await page.goto("/some-studio-that-closed");

    await expect(
      page.getByRole("heading", { name: "This booking page isn't available" }),
    ).toBeVisible();
  });
});
