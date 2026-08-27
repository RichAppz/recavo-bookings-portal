import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/lib/auth/RequireAuth";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing — RECAVO" },
      {
        name: "description",
        content: "Choose a Recavo plan and start a 14-day trial for your PT business.",
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
