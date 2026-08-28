import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useStartConnectOnboarding } from "@/lib/api/hooks";

/**
 * Stripe Account Link `refresh_url` — reached when the link expired or was reused.
 * Restarting is deliberately manual: Stripe can bounce straight back here, and an
 * automatic redirect would loop.
 */
export const Route = createFileRoute("/connect/refresh/$businessId")({
  head: () => ({
    meta: [{ title: "Payout setup — RECAVO" }],
  }),
  component: ConnectRefreshPage,
});

function ConnectRefreshPage() {
  const startOnboarding = useStartConnectOnboarding();

  return (
    <>
      <PageHeader title="Payout setup needs restarting" />
      <EmptyState
        title="That Stripe link expired"
        description="Stripe onboarding links are single-use and short-lived. Starting again picks up from what you already entered."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              disabled={startOnboarding.isPending}
              onClick={async () => {
                const result = await startOnboarding.mutateAsync();
                if (result.onboardingUrl) window.location.assign(result.onboardingUrl);
              }}
            >
              {startOnboarding.isPending ? "Starting…" : "Restart onboarding"}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/payments">Back to payments</Link>
            </Button>
          </div>
        }
      />
    </>
  );
}
