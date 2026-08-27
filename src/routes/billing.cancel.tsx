import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/billing/cancel")({
  head: () => ({
    meta: [{ title: "Checkout cancelled — RECAVO" }],
  }),
  component: () => (
    <>
      <PageHeader title="Checkout cancelled" />
      <EmptyState
        title="You didn’t finish checkout"
        description="Pick a plan to start your 14-day trial. The console stays locked until a Recavo subscription is active."
        action={
          <Button asChild>
            <Link to="/billing">Choose a plan</Link>
          </Button>
        }
      />
    </>
  ),
});
