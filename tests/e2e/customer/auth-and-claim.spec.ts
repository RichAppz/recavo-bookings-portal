import { demo, expect, problem, test } from "../support/fixtures.ts";
import { makeSession, SUPABASE_HOST } from "../support/session.ts";

/**
 * How a customer gets an account, and how the sessions they have already paid
 * for follow them into it.
 *
 * Customers buy as guests, so the purchase exists before the account does. The
 * claim link is what ties the two together, and if it fails the customer has
 * paid a studio for credits they cannot see or book. That is the failure these
 * cover.
 */

const CODE = "13579246";

/** Answers Supabase's OTP endpoints: send always works, verify checks the code. */
async function stubEmailCode(
  page: import("@playwright/test").Page,
  options: { accept?: string; email?: string } = {},
) {
  const accept = options.accept ?? CODE;
  const email = options.email ?? demo.personas.customer.email;
  const sent: string[] = [];

  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/^\/auth\/v1\//, "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (endpoint === "otp") {
      sent.push(String(route.request().postDataJSON()?.email ?? ""));
      return json({});
    }
    if (endpoint === "verify") {
      const token = String(route.request().postDataJSON()?.token ?? "");
      if (token !== accept) {
        return json(
          { error: "invalid_grant", error_description: "Token has expired or is invalid" },
          403,
        );
      }
      return json(makeSession({ id: demo.personas.customer.id, email }));
    }
    if (endpoint === "settings") return json({ external: {}, mailer_autoconfirm: true });
    if (endpoint === "logout") return route.fulfill({ status: 204, body: "" });
    return json({});
  });

  return { sent };
}

/** Types the code into the eight boxes, which submit themselves once full. */
async function enterCode(page: import("@playwright/test").Page, code: string) {
  const field = page.getByLabel(/Enter the code we sent to/);
  await field.click();
  await page.keyboard.type(code);
}

test.describe("signing in with an emailed code", () => {
  test("asks for an address and nothing else", async ({ page, signOut }) => {
    await signOut();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Your sessions and credits" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    // No password on the customer host: they visit a few times a year, and a
    // password is a fifth thing to forget.
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await expect(
      page.getByText("No password needed. We'll send a code that signs you in."),
    ).toBeVisible();
  });

  test("sends a code and then asks for it", async ({ page, signOut }) => {
    await signOut();
    const { sent } = await stubEmailCode(page);
    await page.goto("/login");

    await page.getByLabel("Email").fill(demo.personas.customer.email);
    await page.getByRole("button", { name: "Email me a code" }).click();

    await expect(
      page.getByText(`Enter the code we sent to ${demo.personas.customer.email}`),
    ).toBeVisible();
    expect(sent).toEqual([demo.personas.customer.email]);
  });

  test("signs the customer in as soon as the last digit lands", async ({ page, signOut }) => {
    await signOut();
    await stubEmailCode(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(demo.personas.customer.email);
    await page.getByRole("button", { name: "Email me a code" }).click();

    await enterCode(page, CODE);

    await expect(page).toHaveURL(/book\.recavo\.test:\d+\/$|\/account/);
  });

  test("clears the boxes on a wrong code so the next attempt is not a mess", async ({
    page,
    signOut,
  }) => {
    await signOut();
    await stubEmailCode(page, { accept: "00000000" });
    await page.goto("/login");
    await page.getByLabel("Email").fill(demo.personas.customer.email);
    await page.getByRole("button", { name: "Email me a code" }).click();

    await enterCode(page, CODE);

    await expect(page.getByText(/didn't work|expired|invalid/i).first()).toBeVisible();
    await expect(page.getByLabel(/Enter the code we sent to/)).toHaveValue("");
  });

  test("holds the resend button back while the code is in flight", async ({ page, signOut }) => {
    // Rapid resends burn the studio's email quota and trip Supabase's own rate
    // limit, which locks the customer out of the address entirely. The full
    // thirty-second expiry is covered by the component test, which can move the
    // clock rather than sit through it.
    await signOut();
    await stubEmailCode(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(demo.personas.customer.email);
    await page.getByRole("button", { name: "Email me a code" }).click();

    const resend = page.getByRole("button", { name: /Resend in \d+s/ });
    await expect(resend).toBeDisabled();
    // Counting down rather than stuck, so the customer can see it will end.
    await expect(page.getByRole("button", { name: /Resend in 2[0-9]s/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("lets a mistyped address be corrected without a reload", async ({ page, signOut }) => {
    await signOut();
    await stubEmailCode(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/Enter the code we sent to/)).toBeVisible();

    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});

test.describe("buying a package as a guest", () => {
  test.beforeEach(async ({ page, signOut, stripe }) => {
    await stripe();
    await signOut();
    await page.goto(`/${demo.publicBusiness.slug}`);
  });

  test("skips the time picker, since there is no session to choose yet", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(demo.packages[0].name) }).click();

    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await expect(
      page.getByText(`So we know whose ${demo.packages[0].creditsIssued} sessions these are`),
    ).toBeVisible();
    // Notes belong to a session, and there isn't one.
    await expect(page.getByLabel(/Anything we should know/)).toHaveCount(0);
  });

  test("shows what is being bought before asking for a card", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(demo.packages[0].name) }).click();
    await page.getByLabel("First name").fill("Jamie");
    await page.getByLabel("Last name").fill("Ellis");
    await page.getByLabel("Email").fill("jamie@example.co.uk");
    await page.getByLabel("Mobile").fill("07700 900123");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review & pay" })).toBeVisible();
    await expect(page.getByText("Sessions")).toBeVisible();
    await expect(page.getByText(String(demo.packages[0].creditsIssued)).first()).toBeVisible();
    await expect(page.getByTestId("stripe-card-input")).toBeVisible();
  });

  test("offers the claim link once the card clears", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(demo.packages[0].name) }).click();
    await page.getByLabel("First name").fill("Jamie");
    await page.getByLabel("Last name").fill("Ellis");
    await page.getByLabel("Email").fill("jamie@example.co.uk");
    await page.getByLabel("Mobile").fill("07700 900123");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^Pay £/ }).click();

    await expect(page.getByRole("heading", { name: "Package bought" })).toBeVisible();
    await expect(page.getByText(/receipt is on its way to jamie@example\.co\.uk/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Book your sessions" })).toHaveAttribute(
      "href",
      new RegExp(`/claim/${demo.claim.token}`),
    );
  });
});

test.describe("claiming what was bought", () => {
  test("asks the buyer to confirm the address they checked out with", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/claim/${demo.claim.token}`);

    await expect(page.getByRole("heading", { name: "Your sessions are waiting" })).toBeVisible();
    await expect(
      page.getByText(
        "Use the same address you gave at checkout — that's what this link is tied to.",
      ),
    ).toBeVisible();
  });

  test("attaches the purchase and opens the account", async ({ page, signOut, api }) => {
    let redeemed: string | null = null;
    api.post("/api/v1/customer-claims/:token/accept", ({ params }) => {
      redeemed = params.token ?? null;
      return { customer: demo.portalCustomer };
    });

    await signOut();
    await stubEmailCode(page);
    await page.goto(`/claim/${demo.claim.token}`);
    await page.getByLabel("Email").fill(demo.personas.customer.email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await enterCode(page, CODE);

    await expect(page).toHaveURL(/\/account/);
    expect(redeemed).toBe(demo.claim.token);
  });

  test("redeems straight away for someone already signed in", async ({ page, signIn, api }) => {
    let redeemed = 0;
    api.post("/api/v1/customer-claims/:token/accept", () => {
      redeemed += 1;
      return { customer: demo.portalCustomer };
    });

    await signIn("customer");
    await page.goto(`/claim/${demo.claim.token}`);

    await expect(page).toHaveURL(/\/account/);
    // Once, not once per render: the endpoint is rate limited.
    expect(redeemed).toBe(1);
  });

  test("explains a link signed in under the wrong address", async ({ page, signIn, api }) => {
    // Two people in a household, one card. Redeeming under the wrong account
    // would move someone else's sessions and there is no way back.
    api.post("/api/v1/customer-claims/:token/accept", () => {
      throw problem(403, "FORBIDDEN", { title: "Different email" });
    });

    await signIn("customer");
    await page.goto(`/claim/${demo.claim.token}`);

    await expect(page.getByRole("heading", { name: "That's a different email" })).toBeVisible();
    await expect(page.getByText(/belongs to the email address used at checkout/)).toBeVisible();
  });

  test("says so when the sessions are already on an account", async ({ page, signIn, api }) => {
    api.post("/api/v1/customer-claims/:token/accept", () => {
      throw problem(409, "ALREADY_CLAIMED", { title: "Already claimed" });
    });

    await signIn("customer");
    await page.goto(`/claim/${demo.claim.token}`);

    await expect(page.getByRole("heading", { name: "Already claimed" })).toBeVisible();
  });

  test("points a spent or expired link back at the studio", async ({ page, signIn, api }) => {
    api.post("/api/v1/customer-claims/:token/accept", () => {
      throw problem(404, "NOT_FOUND", { title: "No such claim" });
    });

    await signIn("customer");
    await page.goto("/claim/tok_expired");

    await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
    await expect(page.getByText(/The studio can link your sessions for you/)).toBeVisible();
  });
});
