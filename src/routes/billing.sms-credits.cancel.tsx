import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/billing/sms-credits/cancel")({
  head: () => ({
    meta: [{ title: "Purchase cancelled — RECAVO" }],
  }),
  component: () => (
    <>
      <PageHeader title="Purchase cancelled" />
      <EmptyState
        title="No texts were bought"
        description="Nothing has been charged. Your balance is unchanged — you can buy a bundle whenever you're ready."
        action={
          <Button asChild>
            <Link to="/billing/sms-credits">Back to text credits</Link>
          </Button>
        }
      />
    </>
  ),
});
