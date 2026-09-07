import { demo, expect, problem, stripeCalls, test } from "../support/fixtures.ts";

/**
 * A stranger with a link books a session.
 *
 * This is the journey the business is paid for, and the one with the most ways
 * to go quietly wrong: a slot taken between choosing and paying, a hold that
 * lapses while the card is being typed, a bank challenge that navigates the
 * page away mid-payment. Each of those has a test here, because each of them
 * ends with either a double booking or a customer charged for nothing.
 */

const SLUG = demo.publicBusiness.slug;

/** Picks the first service, then the first time offered on the default day. */
async function chooseFirstSlot(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();
  const time = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
  await time.click();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function fillDetails(
  page: import("@playwright/test").Page,
  over: Partial<Record<"first" | "last" | "email" | "phone", string>> = {},
) {
  await page.getByLabel("First name").fill(over.first ?? "Jamie");
  await page.getByLabel("Last name").fill(over.last ?? "Ellis");
  await page.getByLabel("Email").fill(over.email ?? "jamie@example.co.uk");
  await page.getByLabel("Mobile").fill(over.phone ?? "07700 900123");
}

test.describe("the booking page", () => {
  test("greets the visitor with the studio's name and its sessions", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/${SLUG}`);

    await expect(
      page.getByRole("heading", { name: `Book at ${demo.publicBusiness.tradingName}` }),
    ).toBeVisible();
    for (const service of demo.publicServices) {
      await expect(page.getByText(service.name).first()).toBeVisible();
    }
    await expect(page.getByText("£55.00").first()).toBeVisible();
  });

  test("shows times only once a session is chosen", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/${SLUG}`);

    await expect(page.locator("button", { hasText: /^\d{2}:\d{2}$/ })).toHaveCount(0);
    await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();
    await expect(page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
  });

  test("names the timezone the times are shown in", async ({ page, signOut }) => {
    // The studio sets its own timezone and the customer may be anywhere, so an
    // unlabelled "09:00" is an invitation to turn up at the wrong hour.
    await signOut();
    await page.goto(`/${SLUG}`);
    await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();

    await expect(page.getByText(`Times shown in ${demo.TIMEZONE}.`)).toBeVisible();
  });

  test("says when a day has nothing free instead of showing an empty grid", async ({
    page,
    signOut,
    api,
  }) => {
    api.get("/api/v1/public/businesses/:businessId/availability", () => ({ slots: [] }));

    await signOut();
    await page.goto(`/${SLUG}`);
    await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();

    await expect(page.getByText("No availability on this date. Try another day.")).toBeVisible();
  });

  test("lets a mis-tapped session be closed again", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/${SLUG}`);
    const service = page.getByRole("button", { name: new RegExp(demo.services[0].name) });

    await service.click();
    await expect(service).toHaveAttribute("aria-expanded", "true");
    await service.click();
    await expect(service).toHaveAttribute("aria-expanded", "false");
  });

  test("does not offer to continue until a time is picked", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/${SLUG}`);
    await page.getByRole("button", { name: new RegExp(demo.services[0].name) }).click();

    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await page
      .locator("button", { hasText: /^\d{2}:\d{2}$/ })
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("turns an unknown studio away rather than showing an empty booking page", async ({
    page,
    signOut,
    api,
  }) => {
    api.get("/api/v1/public/businesses/by-slug/:slug", () => {
      throw problem(404, "NOT_FOUND", { title: "No such business" });
    });

    await signOut();
    await page.goto("/not-a-real-studio");

    await expect(
      page.getByRole("heading", { name: "This booking page isn't available" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Book at/ })).toHaveCount(0);
  });

  test("forwards the old ?businessId= link to the studio's page", async ({ page, signOut }) => {
    // Links already in the wild, in receipts and emails, still have to land.
    await signOut();
    await page.goto(`/book?businessId=${demo.business.id}`);

    await expect(
      page.getByRole("heading", { name: `Book at ${demo.publicBusiness.tradingName}` }),
    ).toBeVisible();
  });
});

test.describe("the details step", () => {
  test.beforeEach(async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/${SLUG}`);
    await chooseFirstSlot(page);
  });

  test("summarises what is being booked so nobody pays for the wrong session", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await expect(page.getByText("Session")).toBeVisible();
    await expect(page.getByText(demo.services[0].name).first()).toBeVisible();
    await expect(page.getByText("Total")).toBeVisible();
  });

  test("waits for every detail the studio needs", async ({ page }) => {
    const submit = page.getByRole("button", { name: "Continue" });
    await expect(submit).toBeDisabled();

    await page.getByLabel("First name").fill("Jamie");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Last name").fill("Ellis");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Email").fill("jamie@example.co.uk");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Mobile").fill("07700 900123");
    await expect(submit).toBeEnabled();
  });

  test("will not accept an address that is obviously mistyped", async ({ page }) => {
    // The confirmation goes to this address; a typo means the customer never
    // hears from the studio again.
    await fillDetails(page, { email: "jamie@example" });
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

    await page.getByLabel("Email").fill("jamie@example.co.uk");
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("goes back to the times without losing the details typed so far", async ({ page }) => {
    await fillDetails(page);
    await page.getByRole("button", { name: "Back" }).click();

    // The chosen session and time are still selected, so stepping back to check
    // something is not a restart.
    await expect(page.getByRole("heading", { name: /Book at/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(demo.services[0].name) }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("First name")).toHaveValue("Jamie");
    await expect(page.getByLabel("Email")).toHaveValue("jamie@example.co.uk");
  });

  test("shows the studio's own words on a field the API rejects", async ({ page, api }) => {
    api.post("/api/v1/public/businesses/:businessId/booking-holds", () => {
      throw problem(422, "VALIDATION_FAILED", {
        title: "Please check your details",
        errors: [{ field: "phone", message: "We can't send reminders to that number" }],
      });
    });

    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("We can't send reminders to that number")).toBeVisible();
    // Still on the form, with everything else intact.
    await expect(page.getByLabel("First name")).toHaveValue("Jamie");
  });

  test("sends the customer back to the times when the slot has gone", async ({ page, api }) => {
    // Someone else took it while this customer was typing. Confirming anyway
    // would double-book the trainer.
    api.post("/api/v1/public/businesses/:businessId/booking-holds", () => {
      throw problem(409, "BOOKING_CONFLICT", { title: "That time was just taken" });
    });

    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("That time was just taken — please choose another.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Book at/ })).toBeVisible();
  });
});

test.describe("paying for a session", () => {
  test.beforeEach(async ({ page, signOut, stripe }) => {
    await stripe();
    await signOut();
    await page.goto(`/${SLUG}`);
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();
  });

  test("holds the time and says for how long", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Review & confirm" })).toBeVisible();
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible();
  });

  test("asks for a card and confirms the booking once it clears", async ({ page }) => {
    await expect(page.getByTestId("stripe-card-input")).toBeVisible();
    await page.getByRole("button", { name: /^Pay £/ }).click();

    await expect(page.getByRole("heading", { name: "You're booked in" })).toBeVisible();
    await expect(page.getByText(/Booking reference/)).toBeVisible();
  });

  test("confirms with the payment intent the API issued, not one of its own", async ({ page }) => {
    await page.getByRole("button", { name: /^Pay £/ }).click();
    await expect(page.getByRole("heading", { name: "You're booked in" })).toBeVisible();

    const calls = await stripeCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "confirmPayment",
      clientSecret: "pi_test_demo_secret_abc",
    });
  });

  test("keeps the hold when the card is declined so the time is not lost", async ({
    page,
    stripe,
  }) => {
    await stripe({ behaviour: "decline", declineMessage: "Your card was declined." });
    await page.reload();
    // Reloading drops the flow, so walk it again with the declining stub in place.
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^Pay £/ }).click();

    await expect(page.getByText("Your card was declined.")).toBeVisible();
    // The slot is still held and the button is live again for another card.
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay £/ })).toBeEnabled();
  });

  test("lets the customer change their mind about the time", async ({ page }) => {
    await page.getByRole("button", { name: "Change time" }).click();

    await expect(
      page.getByText("Your hold was released — please choose a new time."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Book at/ })).toBeVisible();
  });

  test("gives the time back when the hold runs out", async ({ page, api }) => {
    // A slot held by someone who wandered off has to return to the pool, and
    // the customer has to be told rather than left confirming a dead hold.
    api.post("/api/v1/public/businesses/:businessId/booking-holds", () => ({
      booking: demo.makeBooking({
        id: "bkg_expiring",
        start: demo.availabilitySlots()[0].start as string,
        status: "held",
        holdExpiresAt: new Date(Date.now() + 2000).toISOString(),
      }),
      holdToken: "hold_expiring",
      onlinePaymentRequired: true,
    }));

    await page.reload();
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText("Your held time has expired — please choose a new time."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Book at/ })).toBeVisible();
  });
});

test.describe("a card that needs the bank's approval", () => {
  test("picks the booking back up after the customer is sent away and returned", async ({
    page,
    signOut,
    stripe,
  }) => {
    // 3-D Secure navigates the page away entirely, so React state is gone on
    // return. Losing the journey here means a customer who has paid and has no
    // booking — the worst outcome the flow has.
    await stripe({ behaviour: "redirect" });
    await signOut();
    await page.goto(`/${SLUG}`);
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^Pay £/ }).click();

    await expect(page).toHaveURL(/redirect_status=succeeded/);
    await expect(page.getByRole("heading", { name: "You're booked in" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("waits for the webhook rather than claiming success early", async ({
    page,
    signOut,
    stripe,
    api,
  }) => {
    // The booking is confirmed by Stripe's webhook, not by this page. Until
    // that lands the confirm endpoint reports 422, and the flow should say it
    // is still settling instead of showing a confirmation that may not hold.
    let attempts = 0;
    api.post("/api/v1/public/businesses/:businessId/bookings/confirm", () => {
      attempts += 1;
      if (attempts < 2) {
        throw problem(422, "PAYMENT_PENDING", { title: "Payment has not settled yet" });
      }
      return {
        booking: demo.makeBooking({
          id: "bkg_settled",
          start: demo.availabilitySlots()[0].start as string,
          status: "confirmed",
        }),
      };
    });

    await stripe({ behaviour: "redirect" });
    await signOut();
    await page.goto(`/${SLUG}`);
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^Pay £/ }).click();

    await expect(page.getByRole("heading", { name: "You're booked in" })).toBeVisible({
      timeout: 20_000,
    });
    expect(attempts).toBeGreaterThan(1);
  });
});

test.describe("after booking", () => {
  test("offers another session without making the customer retype anything", async ({
    page,
    signOut,
    stripe,
  }) => {
    await stripe();
    await signOut();
    await page.goto(`/${SLUG}`);
    await chooseFirstSlot(page);
    await fillDetails(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^Pay £/ }).click();
    await expect(page.getByRole("heading", { name: "You're booked in" })).toBeVisible();

    await page.getByRole("button", { name: "Book another session" }).click();
    await expect(page.getByRole("heading", { name: /Book at/ })).toBeVisible();

    await chooseFirstSlot(page);
    await expect(page.getByLabel("First name")).toHaveValue("Jamie");
    await expect(page.getByLabel("Email")).toHaveValue("jamie@example.co.uk");
  });
});
