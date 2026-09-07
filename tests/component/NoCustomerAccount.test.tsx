import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeAuth } from "../support/mocks.ts";

const auth = { value: makeAuth() };
vi.mock("@/lib/auth/auth-store", () => ({ useAuth: () => auth.value }));

const { NoCustomerAccount } = await import("@/components/NoCustomerAccount");

const originalLocation = window.location;

/** jsdom fixes the hostname at ~about:blank, so each case declares its own. */
function onHost(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, hostname, origin: `https://${hostname}` },
  });
}

beforeEach(() => {
  auth.value = makeAuth();
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("what it tells the signed-in person", () => {
  it("names the account they are signed in as", async () => {
    // Almost always the real problem: they signed up with a different address
    // from the one they bought under, and seeing it is what reveals that.
    onHost("book.recavo.app");
    auth.value = makeAuth({ user: { id: "usr_1", email: "ada@example.com" } });
    render(<NoCustomerAccount />);

    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("copes with an account that has no address on it", () => {
    onHost("book.recavo.app");
    auth.value = makeAuth({ user: null });
    render(<NoCustomerAccount />);
    expect(screen.getByText(/no sessions or purchases yet/)).toBeInTheDocument();
  });

  it("never offers to set up a studio", () => {
    // This is the whole reason the component exists: the staff app's empty
    // state asks someone who came to book a session to found a business.
    onHost("book.recavo.app");
    render(<NoCustomerAccount />);
    expect(screen.queryByText(/create.*business|set up.*studio/i)).not.toBeInTheDocument();
  });
});

describe("pointing a studio owner at the right door", () => {
  it("links to the matching staff hostname, in the same environment", () => {
    onHost("staging-book.recavo.app");
    render(<NoCustomerAccount />);
    const link = screen.getByRole("link", { name: /Sign in at staging-dashboard.recavo.app/ });
    expect(link).toHaveAttribute("href", "https://staging-dashboard.recavo.app");
  });

  it("links rather than redirects, because the session cannot cross origins", () => {
    // Supabase keeps the session in localStorage, which is per-origin; bouncing
    // them over would silently sign them out.
    onHost("book.recavo.app");
    render(<NoCustomerAccount />);
    expect(screen.getByRole("link", { name: /Sign in at dashboard.recavo.app/ })).toHaveAttribute(
      "href",
      "https://dashboard.recavo.app",
    );
  });

  it("says nothing on a host with no staff twin", () => {
    // Better to show no link than to invent a hostname that will not resolve.
    onHost("localhost");
    render(<NoCustomerAccount />);
    expect(screen.queryByRole("link", { name: /Sign in at/ })).not.toBeInTheDocument();
  });
});

describe("the way out", () => {
  it("offers to sign out so they can try another address", async () => {
    onHost("book.recavo.app");
    const signOut = vi.fn().mockResolvedValue(undefined);
    auth.value = makeAuth({ signOut });
    const user = userEvent.setup();
    render(<NoCustomerAccount />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
