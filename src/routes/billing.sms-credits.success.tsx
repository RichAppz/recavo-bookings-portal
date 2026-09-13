import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { SmsCreditsCard } from "@/components/SmsCreditsCard";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { bundleLabel } from "@/lib/billing/sms-credits";
import {
  useReconcileSmsCreditsCheckout,
  useSmsCredits,
  type SmsCreditsReconcileResult,
} from "@/lib/api/hooks";

const searchSchema = z.object({
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/billing/sms-credits/success")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Texts added — RECAVO" }],
  }),
  component: SmsCreditsSuccessPage,
});

/** How long to keep asking Stripe before telling the user to check back. */
const MAX_ATTEMPTS = 10;
const RETRY_MS = 3000;

/**
 * Stripe returns here after a bundle purchase. Reconciling on the Session id is
 * idempotent, and the webhook may already have credited the balance, so the page
 * treats `credited: false` + `paid` as success too and always reads the card's
 * numbers from the API rather than from the redirect.
 */
function SmsCreditsSuccessPage() {
  const { session_id: sessionId } = Route.useSearch();
  const reconcile = useReconcileSmsCreditsCheckout();
  const credits = useSmsCredits();
  const [result, setResult] = useState<SmsCreditsReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const inFlight = useRef(false);

  const paid = result?.paymentStatus === "paid" || result?.paymentStatus === "no_payment_required";
  const gaveUp = !paid && attempts >= MAX_ATTEMPTS;

  useEffect(() => {
    if (!sessionId || paid || error || gaveUp || inFlight.current) return;
    inFlight.current = true;
    let timer: number | undefined;
    void (async () => {
      try {
        const next = await reconcile.mutateAsync({ stripeCheckoutSessionId: sessionId });
        setResult(next);
        if (next.paymentStatus !== "paid" && next.paymentStatus !== "no_payment_required") {
          timer = window.setTimeout(() => setAttempts((n) => n + 1), RETRY_MS);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError(
            "We couldn't match this checkout to your business. If you were charged, the credits will still arrive within a few minutes.",
          );
        } else if (err instanceof ApiError && err.status === 429) {
          timer = window.setTimeout(() => setAttempts((n) => n + 1), RETRY_MS * 2);
        } else {
          setError(err instanceof ApiError ? (err.detail ?? err.title) : "Something went wrong.");
        }
      } finally {
        inFlight.current = false;
      }
    })();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
    // `attempts` is the retry trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attempts]);

  if (!sessionId) {
    return (
      <>
        <PageHeader title="Text credits" />
        <EmptyState
          title="Nothing to confirm"
          description="This page is where Stripe sends you after buying a bundle."
          action={
            <Button asChild>
              <Link to="/billing/sms-credits">Text credits</Link>
            </Button>
          }
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Text credits" />
        <EmptyState
          title="Couldn't confirm the purchase"
          description={error}
          action={
            <Button asChild>
              <Link to="/billing/sms-credits">Text credits</Link>
            </Button>
          }
        />
      </>
    );
  }

  if (!paid) {
    return (
      <>
        <PageHeader title="Confirming your purchase" />
        <EmptyState
          title={gaveUp ? "Still waiting for Stripe" : "Processing payment…"}
          description={
            gaveUp
              ? "Stripe hasn't confirmed the payment yet. Your credits will land automatically once it does — check the balance in a minute."
              : "This usually takes a few seconds. Your credits are added the moment Stripe confirms the payment."
          }
          action={
            <Button variant="outline" asChild>
              <Link to="/billing/sms-credits">Text credits</Link>
            </Button>
          }
        />
      </>
    );
  }

  const bundle = credits.data?.bundle ?? result?.smsCredits.bundle;
  const balance = credits.data?.balance ?? result?.balance ?? 0;

  return (
    <>
      <PageHeader
        title="Texts added"
        description={
          bundle
            ? `${bundleLabel(bundle)} added to your balance.`
            : "Your bundle has been added to your balance."
        }
        actions={
          <Button asChild>
            <Link to="/billing">Back to billing</Link>
          </Button>
        }
      />
      <div className="grid max-w-2xl gap-5">
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-medium">
              You now have {balance} {balance === 1 ? "text" : "texts"} ready to send.
            </p>
            <p className="mt-1 text-muted-foreground">
              <MessageSquareText className="mr-1 inline size-3.5 align-text-bottom" />
              Reminders, confirmations and payment requests set to SMS will go by text until the
              balance runs out, then by email. Credits never expire.
            </p>
          </div>
        </div>
        <SmsCreditsCard />
      </div>
    </>
  );
}
