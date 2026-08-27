import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useReconcileCheckout, useSubscription } from "@/lib/api/hooks";
import { isConsoleAccessAllowed } from "@/lib/billing/access";

const searchSchema = z.object({
  session_id: z.string().optional(),
  checkoutAttemptId: z.string().optional(),
});

export const Route = createFileRoute("/billing/success")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Subscription confirmed — RECAVO" }],
  }),
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const { session_id: sessionId, checkoutAttemptId } = Route.useSearch();
  const subscription = useSubscription();
  const reconcile = useReconcileCheckout();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!sessionId && !checkoutAttemptId) return;
    started.current = true;
    void (async () => {
      await reconcile.mutateAsync({
        ...(sessionId ? { stripeCheckoutSessionId: sessionId } : {}),
        ...(checkoutAttemptId ? { checkoutAttemptId } : {}),
      });
    })();
  }, [sessionId, checkoutAttemptId, reconcile]);

  useEffect(() => {
    if (isConsoleAccessAllowed(subscription.data?.subscription)) {
      void navigate({ to: "/" });
    }
  }, [subscription.data, navigate]);

  useEffect(() => {
    if (sessionId || checkoutAttemptId) return;
    const id = window.setInterval(() => {
      void subscription.refetch();
    }, 2000);
    return () => window.clearInterval(id);
  }, [sessionId, checkoutAttemptId, subscription]);

  const confirming = reconcile.isPending || subscription.isFetching;

  return (
    <>
      <PageHeader title="Confirming your plan" />
      <EmptyState
        title={confirming ? "Confirming checkout…" : "Waiting for Stripe"}
        description="This can take a few seconds. We’ll open the console as soon as your trial is active."
        action={
          <Button variant="outline" asChild>
            <Link to="/billing">Back to billing</Link>
          </Button>
        }
      />
    </>
  );
}
