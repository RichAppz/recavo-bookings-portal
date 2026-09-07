import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus } from "@/lib/auth/auth-store";
import { renderWithRouter } from "../support/render.tsx";

const authState: { status: AuthStatus } = { status: "loading" };

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => authState,
}));

// Imported after the mock is registered so the component picks it up.
const { RequireAuth } = await import("@/lib/auth/RequireAuth");

beforeEach(() => {
  authState.status = "loading";
});

const renderAt = (path: string) =>
  renderWithRouter(
    <RequireAuth>
      <p>Secret console</p>
    </RequireAuth>,
    { path },
  );

describe("while the session is being checked", () => {
  it("holds rather than bouncing to login", async () => {
    // Redirecting during the check would throw away a perfectly good session
    // every time the page is reloaded.
    authState.status = "loading";
    const { currentPath } = await renderAt("/calendar");
    expect(screen.getByText("Checking session…")).toBeInTheDocument();
    expect(screen.queryByText("Secret console")).not.toBeInTheDocument();
    expect(currentPath()).toBe("/calendar");
  });
});

describe("when auth is not configured", () => {
  it("says which environment variables are missing instead of redirecting", async () => {
    // A blank .env would otherwise present as an endless login loop.
    authState.status = "unconfigured";
    const { currentPath } = await renderAt("/calendar");
    expect(screen.getByRole("heading", { name: "Auth not configured" })).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_ANON_KEY")).toBeInTheDocument();
    expect(currentPath()).toBe("/calendar");
  });
});

describe("when signed out", () => {
  it("sends the visitor to login, carrying where they were headed", async () => {
    authState.status = "unauthenticated";
    const { currentPath, currentSearch } = await renderAt("/calendar");
    await vi.waitFor(() => expect(currentPath()).toBe("/login"));
    expect(currentSearch().redirect).toBe("/calendar");
    expect(screen.queryByText("Secret console")).not.toBeInTheDocument();
  });

  it("keeps the query string, so a deep link survives the detour", async () => {
    // /settings?tab=policies must come back as that exact tab, not the default.
    authState.status = "unauthenticated";
    const { currentPath, currentSearch } = await renderAt("/settings?tab=policies");
    await vi.waitFor(() => expect(currentPath()).toBe("/login"));
    expect(currentSearch().redirect).toBe("/settings?tab=policies");
  });

  it("drops the hash, which is where OAuth puts its tokens", async () => {
    // Landing on /#access_token=… and round-tripping it through ?redirect=
    // would write the access and refresh tokens into browser history.
    authState.status = "unauthenticated";
    const { currentPath, currentSearch } = await renderAt(
      "/#access_token=secret&refresh_token=also",
    );
    await vi.waitFor(() => expect(currentPath()).toBe("/login"));
    expect(String(currentSearch().redirect ?? "")).not.toContain("access_token");
  });
});

describe("when signed in", () => {
  it("renders what it is guarding", async () => {
    authState.status = "authenticated";
    await renderAt("/calendar");
    expect(screen.getByText("Secret console")).toBeInTheDocument();
  });
});
