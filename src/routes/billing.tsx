import { useEffect, useState } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { staffUrlFor } from "@/lib/hosts";

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
  component: BillingLayout,
});

function BillingLayout() {
  // Stripe success/cancel URLs used to fall back to PUBLIC_APP_URL (book.), so
  // an owner can land here on the customer host with no session. Must run in
  // an effect: SSR has no window, and hydrating from that snapshot would skip
  // a useState initializer that reads the hostname.
  const [bouncing, setBouncing] = useState(false);

  useEffect(() => {
    const next = staffUrlFor(window.location.href);
    if (!next) return;
    setBouncing(true);
    window.location.replace(next);
  }, []);

  if (bouncing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening the console…</p>
      </div>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
