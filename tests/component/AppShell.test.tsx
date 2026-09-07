import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import {
  apiHooksModule,
  makeAuth,
  makeTenant,
  resetApiHooks,
  setApiHook,
  type TenantStub,
} from "../support/mocks.ts";
import { renderWithRouter } from "../support/render.tsx";

const tenant: { value: TenantStub } = { value: makeTenant() };
const auth: { value: ReturnType<typeof makeAuth> } = { value: makeAuth() };

vi.mock("@/lib/api/hooks", () => apiHooksModule);
vi.mock("@/lib/auth/auth-store", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/tenant/tenant-context", () => ({
  useTenant: () => tenant.value,
  Can: ({ permission, children }: { permission: string; children: React.ReactNode }) =>
    tenant.value.can(permission) ? <>{children}</> : null,
  RequirePermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RequireBusiness: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { AppShell } = await import("@/components/AppShell");

/** An entitled subscription, so the console is not locked by billing. */
const ENTITLED = { subscription: { accessState: "entitled", status: "active" } };

beforeEach(() => {
  resetApiHooks();
  tenant.value = makeTenant();
  auth.value = makeAuth();
  setApiHook("useSubscription", { ...idle(), data: ENTITLED });
});

function idle() {
  return { isLoading: false, isSuccess: true, isFetched: true, isPending: false, error: null };
}

const renderShell = (path = "/") =>
  renderWithRouter(
    <ThemeProvider>
      <AppShell>
        <p>Page body</p>
      </AppShell>
    </ThemeProvider>,
    { path },
  );

/** The labels of the links in the sidebar nav, in order. */
function navLabels() {
  const nav = document.querySelector("nav");
  return [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.textContent?.trim() ?? "");
}

describe("navigation by role", () => {
  it("shows an owner everything", async () => {
    tenant.value = makeTenant({ roleKeys: ["business_owner"] });
    await renderShell();
    expect(navLabels()).toEqual([
      "Overview",
      "Calendar",
      "Bookings",
      "Clients",
      "Services",
      "Packages",
      "Staff",
      "Locations",
      "Messages",
      "Payments",
      "Reports",
      "Billing",
      "Settings",
    ]);
  });

  it("keeps reception out of reports and billing", async () => {
    // Reception can run the desk — diary, clients, taking payment — but the
    // studio's numbers and the Recavo plan are not theirs to see.
    tenant.value = makeTenant({ roleKeys: ["reception"] });
    await renderShell();
    const labels = navLabels();
    expect(labels).toContain("Calendar");
    expect(labels).toContain("Clients");
    expect(labels).toContain("Payments");
    expect(labels).not.toContain("Reports");
    expect(labels).not.toContain("Billing");
  });

  it("keeps finance out of the diary and the client list", async () => {
    // Finance gets the money pages plus anything gated only on business.read —
    // Packages and Staff fall back to it — but nothing that names a client or
    // shows who is training when.
    tenant.value = makeTenant({ roleKeys: ["finance"] });
    await renderShell();
    const labels = navLabels();
    expect(labels).toEqual([
      "Overview",
      "Services",
      "Packages",
      "Staff",
      "Locations",
      "Payments",
      "Reports",
      "Billing",
      "Settings",
    ]);
    expect(labels).not.toContain("Calendar");
    expect(labels).not.toContain("Bookings");
    expect(labels).not.toContain("Clients");
    expect(labels).not.toContain("Messages");
  });

  it("narrows restricted staff to their own diary", async () => {
    tenant.value = makeTenant({ roleKeys: ["restricted_staff"] });
    await renderShell();
    const labels = navLabels();
    expect(labels).toContain("Calendar");
    expect(labels).toContain("Bookings");
    expect(labels).not.toContain("Clients");
    expect(labels).not.toContain("Payments");
    expect(labels).not.toContain("Messages");
  });

  it("hides the platform link from a business, however senior", async () => {
    // platform.billing_admin belongs to Recavo staff; an owner holding it could
    // edit another studio's billing.
    tenant.value = makeTenant({ roleKeys: ["business_owner"] });
    await renderShell();
    expect(screen.queryByRole("link", { name: /Platform view/ })).not.toBeInTheDocument();
  });

  it("shows the platform link to a platform administrator", async () => {
    tenant.value = makeTenant({
      roleKeys: ["business_owner"],
      permissions: new Set(["platform.billing_admin", "business.read"] as never),
      can: (p) => ["platform.billing_admin", "business.read"].includes(p as string),
    });
    await renderShell();
    expect(screen.getByRole("link", { name: /Platform view/ })).toBeInTheDocument();
  });
});

describe("industry terminology", () => {
  it("renames the nav to match how the studio speaks", async () => {
    tenant.value = makeTenant({
      roleKeys: ["business_owner"],
      terminology: {
        staff: "Trainers",
        service: "Session",
        booking: "Session",
        client: "Member",
        linkedRecord: "Linked record",
      },
    });
    await renderShell();
    const labels = navLabels();
    expect(labels).toContain("Members");
    expect(labels).toContain("Trainers");
    expect(labels).toContain("Sessions");
    // Service and booking share a word here, so the catalogue has to say
    // "Session types" or the sidebar lists "Sessions" twice.
    expect(labels).toContain("Session types");
  });
});

describe("empty account", () => {
  it("waits for the customer link before deciding what someone is", async () => {
    // Asking "do you own a studio?" before the guest-purchase link resolves
    // shows the wrong screen and then corrects itself a moment later.
    tenant.value = makeTenant({ businesses: [], business: null, isLoading: false });
    setApiHook("usePortalLink", { ...idle(), isFetched: false });
    setApiHook("usePortalBusinesses", { ...idle(), isLoading: true });
    await renderShell();
    expect(screen.getByText("Loading your account…")).toBeInTheDocument();
  });

  it("sends a customer with purchases to their own account", async () => {
    tenant.value = makeTenant({ businesses: [], business: null });
    setApiHook("usePortalLink", { ...idle(), isFetched: true });
    setApiHook("usePortalBusinesses", { ...idle(), data: [{ id: "biz_9" }] });
    const { currentPath } = await renderShell();
    await vi.waitFor(() => expect(currentPath()).toBe("/account"));
  });

  it("offers to set up a studio on the staff host", async () => {
    tenant.value = makeTenant({ businesses: [], business: null });
    setApiHook("usePortalLink", { ...idle(), isFetched: true });
    setApiHook("usePortalBusinesses", { ...idle(), data: [] });
    await renderShell();
    expect(screen.queryByText("Loading your account…")).not.toBeInTheDocument();
    expect(screen.queryByText("Page body")).not.toBeInTheDocument();
  });
});

describe("billing lock", () => {
  it("lets an entitled business through to the page", async () => {
    setApiHook("useSubscription", { ...idle(), data: ENTITLED });
    await renderShell("/calendar");
    expect(screen.getByText("Page body")).toBeInTheDocument();
  });

  it("holds the console while the subscription is still unknown", async () => {
    // Rendering the console and then yanking it away is worse than a moment of
    // "checking", and rendering /billing to a paying studio is worse still.
    setApiHook("useSubscription", { isLoading: true, isSuccess: false, isFetched: false });
    await renderShell("/calendar");
    expect(screen.getByText("Checking subscription…")).toBeInTheDocument();
  });

  it("sends a blocked business to billing", async () => {
    setApiHook("useSubscription", {
      ...idle(),
      data: { subscription: { accessState: "restricted" } },
    });
    const { currentPath } = await renderShell("/calendar");
    await vi.waitFor(() => expect(currentPath()).toBe("/billing"));
  });

  it("strips the console to a sign-out once it is locked on the billing page", async () => {
    // Leaving the sidebar in place would let a locked studio click straight
    // back into the console it has not paid for.
    setApiHook("useSubscription", {
      ...idle(),
      data: { subscription: { accessState: "restricted" } },
    });
    await renderShell("/billing");
    expect(screen.getByText("Page body")).toBeInTheDocument();
    expect(document.querySelector("nav")).toBeNull();
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("lets a platform administrator past the lock", async () => {
    // Recavo staff have to reach /platform to fix the very billing problem that
    // locked the workspace.
    tenant.value = makeTenant({
      can: (p) => p === "platform.billing_admin" || p === "business.read",
    });
    setApiHook("useSubscription", {
      ...idle(),
      data: { subscription: { accessState: "restricted" } },
    });
    const { currentPath } = await renderShell("/platform");
    expect(currentPath()).toBe("/platform");
  });
});

describe("business switcher", () => {
  it("names the current business and the role held in it", async () => {
    tenant.value = makeTenant({ roleKeys: ["manager"] });
    await renderShell();
    const sidebar = document.querySelector("aside")!;
    expect(within(sidebar).getByText("Demo Strength Co")).toBeInTheDocument();
    expect(within(sidebar).getByText("Manager")).toBeInTheDocument();
  });
});
