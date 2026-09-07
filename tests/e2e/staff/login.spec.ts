import { demo, expect, problem, test } from "../support/fixtures.ts";
import { makeSession, makeSupabaseUser } from "../support/session.ts";

/**
 * Getting into the console.
 *
 * The password itself is Supabase's business, so what these check is our side
 * of it: that the right form appears on the staff host, that a failure says so
 * instead of hanging, and — the part with teeth — that `?redirect=` sends
 * people where they were going and nowhere else.
 */

test.describe("the sign-in form", () => {
  test("asks a member of staff for a password", async ({ page, signOut }) => {
    await signOut();
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in to RECAVO" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();

    // The eight-digit code form belongs to customers on the booking host.
    await expect(page.getByText(/code|Send code/i)).toHaveCount(0);
  });

  test("lets a password be revealed, since typing one blind on a laptop is worse than the shoulder-surfing risk", async ({
    page,
    signOut,
  }) => {
    await signOut();
    await page.goto("/login");

    const password = page.getByLabel("Password", { exact: true });
    await password.fill("correct horse battery staple");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });

  test("signs the owner in and opens the console", async ({ page, offerSignIn }) => {
    await offerSignIn("owner");
    await page.goto("/login");

    await page.getByLabel("Email").fill(demo.personas.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/$|\/#/);
    await expect(page.getByRole("heading", { name: /Today|Overview/i }).first()).toBeVisible();
  });

  test("says so when the password is wrong rather than sitting there", async ({
    page,
    signOut,
  }) => {
    // `signOut` stubs Supabase with no persona, so the token grant returns the
    // same invalid_grant a real wrong password would.
    await signOut();
    await page.goto("/login");

    await page.getByLabel("Email").fill(demo.personas.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    // Still usable: a failed attempt must not leave the button spinning.
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("offers a way out when the password is forgotten", async ({ page, signOut }) => {
    await signOut();
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/reset/);
  });
});

test.describe("where sign-in sends you", () => {
  test("carries on to the page that asked for a login", async ({ page, offerSignIn }) => {
    await offerSignIn("owner");
    await page.goto("/login?redirect=%2Fclients");

    await page.getByLabel("Email").fill(demo.personas.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  });

  test("keeps the query string of the page that asked", async ({ page, offerSignIn }) => {
    // A deep link into a filtered view is the common case, and dropping the
    // filter silently lands someone on a different list than they clicked.
    await offerSignIn("owner");
    await page.goto("/login?redirect=%2Fbookings%3Fstatus%3Dcancelled");

    await page.getByLabel("Email").fill(demo.personas.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/bookings\?status=cancelled/);
  });

  for (const hostile of [
    "https://evil.example.com/harvest",
    "//evil.example.com/harvest",
    "http://evil.example.com",
  ]) {
    test(`refuses to forward to ${hostile}`, async ({ page, offerSignIn }) => {
      // An open redirect off the back of a login is a credible phishing route:
      // the link genuinely is our domain right up until it isn't.
      await offerSignIn("owner");
      await page.goto(`/login?redirect=${encodeURIComponent(hostile)}`);

      await page.getByLabel("Email").fill(demo.personas.owner.email);
      await page.getByLabel("Password", { exact: true }).fill("hunter2");
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/dashboard\.recavo\.test/);
      await expect(page).not.toHaveURL(/evil\.example\.com/);
    });
  }

  test("does not bounce back to the login page and loop", async ({ page, offerSignIn }) => {
    await offerSignIn("owner");
    await page.goto("/login?redirect=%2Flogin%3Fredirect%3D%252Flogin");

    await page.getByLabel("Email").fill(demo.personas.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: /Today|Overview/i }).first()).toBeVisible();
  });

  test("sends a signed-out visitor to the login page with their destination attached", async ({
    page,
    signOut,
  }) => {
    await signOut();
    await page.goto("/payments");

    await expect(page).toHaveURL(/\/login\?redirect=%2Fpayments/);
  });
});

test.describe("two-factor authentication", () => {
  test("challenges before the console opens when a factor is enrolled", async ({
    page,
    signOut,
  }) => {
    // Supabase reports aal1-now/aal2-required for an enrolled account. The
    // store is expected to stop and ask rather than let a half-authenticated
    // session through.
    const owner = demo.personas.owner;
    await signOut();
    await page.route("**/recavo-test.supabase.co/auth/v1/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname.replace(/^\/auth\/v1\//, "");
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

      if (endpoint === "token") {
        return json({
          ...makeSession(owner),
          user: makeSupabaseUser(owner, {
            factors: [
              {
                id: "fac_totp",
                friendly_name: "Authenticator",
                factor_type: "totp",
                status: "verified",
              },
            ],
          }),
        });
      }
      if (endpoint === "factors/fac_totp/challenge") return json({ id: "cha_1", expires_at: 0 });
      if (endpoint === "factors/fac_totp/verify") return json(makeSession(owner));
      if (endpoint === "user") {
        return json(
          makeSupabaseUser(owner, {
            factors: [
              {
                id: "fac_totp",
                friendly_name: "Authenticator",
                factor_type: "totp",
                status: "verified",
              },
            ],
          }),
        );
      }
      return json({});
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Password", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText(/two-factor|authentication code|verification code/i).first(),
    ).toBeVisible();
  });
});

test.describe("an invite link", () => {
  test("asks an unknown visitor to sign in, keeping the token", async ({ page, signOut }) => {
    await signOut();
    await page.goto(`/invite?token=${demo.invitations[0].token}`);

    await expect(page.getByRole("heading", { name: "Accept your invite" })).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    // The token has to survive the detour or the invite is lost.
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(demo.invitations[0].token)));
  });

  test("joins a signed-in user to the business and opens the console", async ({
    page,
    signIn,
    api,
  }) => {
    let accepted: string | null = null;
    api.post("/api/v1/invitations/:token/accept", ({ params }) => {
      accepted = params.token ?? null;
      return { membership: { businessId: demo.business.id, roleKeys: ["reception"] } };
    });

    await signIn("owner");
    await page.goto(`/invite?token=${demo.invitations[0].token}`);

    await expect(page.getByText("Invitation accepted")).toBeVisible();
    expect(accepted).toBe(demo.invitations[0].token);
    await expect(page).toHaveURL(/dashboard\.recavo\.test:\d+\/$/);
  });

  test("explains a link with no token instead of showing a blank page", async ({
    page,
    signOut,
  }) => {
    await signOut();
    await page.goto("/invite");
    await expect(page.getByRole("heading", { name: "Missing invite token" })).toBeVisible();
  });

  test("surfaces an expired invite rather than pretending it worked", async ({
    page,
    signIn,
    api,
  }) => {
    api.post("/api/v1/invitations/:token/accept", () => {
      throw problem(410, "INVITATION_EXPIRED", {
        title: "This invitation has expired",
        detail: "Ask an owner to send you a new one.",
      });
    });

    await signIn("owner");
    await page.goto("/invite?token=inv_expired");

    await expect(page.getByText(/expired/i).first()).toBeVisible();
  });
});
