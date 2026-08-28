import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Payout account — RECAVO" },
      {
        name: "description",
        content: "Finish connecting the Stripe account that receives your takings.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  ),
});
