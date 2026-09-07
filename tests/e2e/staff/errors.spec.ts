import { demo, expect, problem, test } from "../support/fixtures.ts";
import { makeSupabaseUser, SUPABASE_HOST } from "../support/session.ts";

/**
 * What happens when things go wrong.
 *
 * These are the paths nobody demos and everybody eventually hits. The common
 * thread is that the app has to say something true: a failure rendered as an
 * empty list, a spinner that never stops, or a success message over a failed
 * write are all worse than an error, because the person carries on believing
 * something that isn't so.
 */

/** Opens the add-client dialog and fills the one required field. */
async function openAddClient(page: import("@playwright/test").Page) {
  await page.goto("/clients");
  await page.getByRole("button", { name: "Add client" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Add client" })).toBeVisible();
  await modal.getByLabel("First name").fill("Jamie");
  return modal;
}

test.describe("an error from the API", () => {
  test("shows the studio the API's own words, not a generic apology", async ({
    page,
    signIn,
    api,
  }) => {
    // The API knows why it refused; the portal does not. Replacing a specific
    // reason with "something went wrong" throws away the only useful part.
    api.post("/api/v1/businesses/:businessId/customers", () => {
      throw problem(422, "VALIDATION_FAILED", {
        title: "That email is already on another client",
        detail: "Two clients cannot share an email address at the same studio.",
      });
    });

    await signIn("owner");
    const modal = await openAddClient(page);
    await modal.getByRole("button", { name: "Add client" }).click();

    await expect(page.getByText("That email is already on another client")).toBeVisible();
  });

  test("keeps the form open and filled so the studio can correct it", async ({
    page,
    signIn,
    api,
  }) => {
    // Closing on failure would throw away everything typed, and the studio
    // would reasonably assume the client had been created.
    api.post("/api/v1/businesses/:businessId/customers", () => {
      throw problem(422, "VALIDATION_FAILED", { title: "Please check the form" });
    });

    await signIn("owner");
    const modal = await openAddClient(page);
    await modal.getByLabel("Email").fill("jamie@example.co.uk");
    await modal.getByRole("button", { name: "Add client" }).click();

    await expect(page.getByText("Please check the form")).toBeVisible();
    await expect(modal.getByLabel("First name")).toHaveValue("Jamie");
    await expect(modal.getByLabel("Email")).toHaveValue("jamie@example.co.uk");
  });

  test("does not leave the submit button spinning after a failure", async ({
    page,
    signIn,
    api,
  }) => {
    // A dead button is indistinguishable from a slow one, and the studio ends
    // up reloading and submitting twice.
    api.post("/api/v1/businesses/:businessId/customers", () => {
      throw problem(500, "INTERNAL", { title: "Something broke" });
    });

    await signIn("owner");
    const modal = await openAddClient(page);
    const submit = modal.getByRole("button", { name: "Add client" });
    await submit.click();

    await expect(page.getByText("Something broke")).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test("does not show a studio figures it could not calculate", async ({ page, signIn, api }) => {
    // A revenue figure is acted on. Rendering £0.00 because the request failed
    // is worse than rendering nothing at all.
    api.get("/api/v1/businesses/:businessId/reports/dashboard", () => {
      throw problem(500, "INTERNAL", { title: "Report failed" });
    });

    await signIn("owner");
    await page.goto("/reports");

    await expect(page.getByText("£580.00")).toHaveCount(0);
  });
});

test.describe("the network dropping out", () => {
  test("says the list could not be loaded rather than showing an empty one", async ({
    page,
    signIn,
    api,
  }) => {
    // An empty table reads as "you have no clients", which is a different and
    // much more alarming statement than "we couldn't reach the server".
    api.get("/api/v1/businesses/:businessId/customers", ({ route }) => route.abort("failed"));

    await signIn("owner");
    await page.goto("/clients");

    await expect(page.getByText(/couldn't load|try again|went wrong/i).first()).toBeVisible();
    await expect(page.getByText("Priya Nair")).toHaveCount(0);
  });
});

test.describe("a session that has gone stale", () => {
  test("sends the studio back to sign in rather than looping on 401s", async ({
    page,
    signIn,
    api,
  }) => {
    api.get("/api/v1/me", () => {
      throw problem(401, "UNAUTHENTICATED", { title: "Your session has expired" });
    });

    await signIn("owner");
    await page.goto("/clients");

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("an action that needs a second factor", () => {
  test("asks for the code, then completes the action that triggered it", async ({
    page,
    signIn,
    api,
  }) => {
    // The retry is the whole point. Challenging and then dropping the original
    // request would have the studio type a code and watch nothing happen.
    let attempts = 0;
    api.post("/api/v1/businesses/:businessId/customers", () => {
      attempts += 1;
      if (attempts === 1) {
        throw problem(403, "MFA_REQUIRED", { title: "Two-factor authentication required" });
      }
      return { customer: demo.customers[0] };
    });

    await signIn("owner");
    // After `signIn`, not before: it installs its own catch-all for the auth
    // endpoints, and Playwright gives the most recently registered route first
    // refusal. Registered earlier, the enrolled factor below would be hidden by
    // the default persona's empty one and the challenge would never start.
    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route) => {
      const endpoint = new URL(route.request().url()).pathname.replace(/^\/auth\/v1\//, "");
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

      if (endpoint === "factors/fac_totp/challenge") return json({ id: "cha_1", expires_at: 0 });
      if (endpoint === "factors/fac_totp/verify") {
        return json({ access_token: "verified", user: makeSupabaseUser(demo.personas.owner) });
      }
      if (endpoint === "user") {
        return json(
          makeSupabaseUser(demo.personas.owner, {
            factors: [
              { id: "fac_totp", friendly_name: "Auth", factor_type: "totp", status: "verified" },
            ],
          }),
        );
      }
      return json({});
    });

    const modal = await openAddClient(page);
    await modal.getByRole("button", { name: "Add client" }).click();

    await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
    await page.getByLabel("Authentication code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();

    await expect.poll(() => attempts).toBe(2);
  });

  test("does not retry the action if the challenge is dismissed", async ({ page, signIn, api }) => {
    let attempts = 0;
    api.post("/api/v1/businesses/:businessId/customers", () => {
      attempts += 1;
      throw problem(403, "MFA_REQUIRED", { title: "Two-factor authentication required" });
    });

    await signIn("owner");
    const modal = await openAddClient(page);
    await modal.getByRole("button", { name: "Add client" }).click();

    await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();

    await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeHidden();
    expect(attempts).toBe(1);
  });
});

test.describe("a page that does not exist", () => {
  test("is turned away rather than rendering a broken console", async ({ page, signIn, api }) => {
    // `/$slug` sits at the root of the path space and matches anything, so an
    // unknown path resolves to a studio lookup rather than the router's own 404
    // — on the console host too, where "This booking page isn't available" is
    // an odd thing to be told. It is at least an unambiguous dead end, which is
    // what this pins down.
    api.get("/api/v1/public/businesses/by-slug/:slug", () => {
      throw problem(404, "NOT_FOUND", { title: "No such business" });
    });

    await signIn("owner");
    await page.goto("/no-such-page-at-all");

    await expect(
      page.getByRole("heading", { name: "This booking page isn't available" }),
    ).toBeVisible();
  });

  test("does not let the slug route swallow a real page", async ({ page, signIn }) => {
    // The same catch-all is why `RESERVED_SLUGS` exists on the API side: a
    // static route has to win, or a studio could claim `/settings` and hide it.
    await signIn("owner");

    for (const path of ["/settings", "/clients", "/payments", "/calendar"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: /Book at/ })).toHaveCount(0);
    }
  });
});
