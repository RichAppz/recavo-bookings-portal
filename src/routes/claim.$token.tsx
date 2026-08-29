import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuthLayout } from "@/components/CustomerAuthLayout";
import { EmailCodeSignIn } from "@/components/EmailCodeSignIn";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useRedeemPurchaseClaim } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/auth-store";

export const Route = createFileRoute("/claim/$token")({
  component: ClaimPage,
  head: () => ({
    meta: [
      { title: "Book your sessions — RECAVO" },
      {
        name: "description",
        content: "Set up your account to book the sessions you bought.",
      },
    ],
  }),
});

/** Turns a rejected claim into something the buyer can act on. */
function claimProblem(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    if (error.isForbidden) {
      return {
        title: "That's a different email",
        detail:
          "This link belongs to the email address used at checkout. Sign in with that address, or ask the studio to help.",
      };
    }
    if (error.isConflict) {
      return {
        title: "Already claimed",
        detail:
          "These sessions are attached to an account. Sign in with it, or ask the studio if you think that's wrong.",
      };
    }
    if (error.status === 404) {
      return {
        title: "This link no longer works",
        detail:
          "It may have expired or already been used. The studio can link your sessions for you.",
      };
    }
  }
  return {
    title: "Something went wrong",
    detail: "We couldn't set up your account just now. Please try again in a moment.",
  };
}

/**
 * Lands a public buyer in the portal with the credits they just paid for.
 *
 * They bought without an account, so this page has to cover the whole gap:
 * prove they own the address they checked out with, then spend the one-time
 * token from the purchase to link that account to the customer record the sale
 * created. An emailed code does both at once, which is why there is no password
 * here — this is the worst possible moment to ask someone to invent one.
 */
function ClaimPage() {
  const { token } = Route.useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const redeem = useRedeemPurchaseClaim();

  const [problem, setProblem] = useState<{ title: string; detail: string } | null>(null);
  const [authSettled, setAuthSettled] = useState(false);
  // Redeeming twice is harmless server-side, but re-running on every auth render
  // would fire a burst of requests against the rate limit.
  const attempted = useRef(false);

  // Signing in is only one of the two ways to arrive here, and the slower one to
  // resolve: a cold API or a first page load can leave the session check hanging.
  // Past a short wait, show the form rather than a spinner — someone who bought
  // as a guest needs it regardless, and a signed-in visitor is picked up by the
  // effect below the moment their session lands.
  useEffect(() => {
    if (status !== "loading") {
      setAuthSettled(true);
      return;
    }
    const timer = setTimeout(() => setAuthSettled(true), 2_500);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || attempted.current) return;
    attempted.current = true;
    redeem.mutate(token, {
      onSuccess: () => {
        toast.success("You're all set", { description: "Your sessions are ready to book." });
        void navigate({ to: "/account" });
      },
      onError: (error) => setProblem(claimProblem(error)),
    });
  }, [status, token, redeem, navigate]);

  // `isSuccess` keeps the spinner up while the redirect to the portal happens, so
  // the form never flashes behind a completed claim.
  const redeeming = status === "authenticated" && (redeem.isPending || redeem.isSuccess);

  if (redeeming || !authSettled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {redeeming ? "Setting up your sessions…" : "One moment…"}
        </div>
      </div>
    );
  }

  if (problem) {
    return (
      <CustomerAuthLayout
        title={problem.title}
        subtitle={problem.detail}
        footer={
          <span>
            Already signed up?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </span>
        }
      >
        <Button size="lg" className="h-11 w-full rounded-xl" onClick={() => navigate({ to: "/" })}>
          Back to RECAVO
        </Button>
      </CustomerAuthLayout>
    );
  }

  return (
    <CustomerAuthLayout
      title="Your sessions are waiting"
      subtitle="They're paid for. Confirm your email and they're yours to book whenever you like."
    >
      <EmailCodeSignIn />
      <p className="mt-4 text-xs text-muted-foreground">
        Use the same address you gave at checkout — that's what this link is tied to.
      </p>
    </CustomerAuthLayout>
  );
}
