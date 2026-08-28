import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useSyncConnectAccount } from "@/lib/api/hooks";

/** Stripe Account Link `return_url` (see resolveConnectUrl on the API). */
export const Route = createFileRoute("/connect/return/$businessId")({
  head: () => ({
    meta: [{ title: "Payout account — RECAVO" }],
  }),
  component: ConnectReturnPage,
});

function ConnectReturnPage() {
  const navigate = useNavigate();
  const sync = useSyncConnectAccount();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // Stripe sends users here whether or not they finished, so ask Stripe for the
      // account state rather than treating the redirect as proof of completion.
      await sync.mutateAsync().catch(() => null);
      await navigate({ to: "/payments" });
    })();
  }, [sync, navigate]);

  return (
    <>
      <PageHeader title="Finishing payout setup" />
      <EmptyState
        title="Checking your payout account…"
        description="We’re confirming what Stripe sent back. This only takes a moment."
        action={
          <Button variant="outline" asChild>
            <Link to="/payments">Go to payments</Link>
          </Button>
        }
      />
    </>
  );
}
