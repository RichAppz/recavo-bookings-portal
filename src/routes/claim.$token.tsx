import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthShell, GoogleButton } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * They bought without an account, so this page has to cover the whole gap: get
 * them authenticated however they like, then spend the one-time token from the
 * purchase to link that account to the customer record the sale created.
 */
function ClaimPage() {
  const { token } = Route.useParams();
  const { status, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const redeem = useRedeemPurchaseClaim();

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);
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
      onSuccess: ({ businessId }) => {
        toast.success("You're all set", { description: "Your sessions are ready to book." });
        void navigate({ to: "/portal", search: { businessId } });
      },
      onError: (error) => setProblem(claimProblem(error)),
    });
  }, [status, token, redeem, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (mode === "signup") {
        await signUp(email, password);
        // Supabase either signs them straight in — the effect above then takes
        // over — or waits on a confirmation email, which we cannot tell apart
        // from here. The link keeps working either way, so say so.
        setCheckInbox(true);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

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
      <AuthShell
        eyebrow="Your sessions"
        title={problem.title}
        subtitle={problem.detail}
        footer={
          <span>
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </span>
        }
      >
        <Button size="lg" className="h-11 w-full rounded-xl" onClick={() => navigate({ to: "/" })}>
          Back to RECAVO
        </Button>
      </AuthShell>
    );
  }

  if (checkInbox) {
    return (
      <AuthShell
        eyebrow="Almost there"
        title="Check your inbox"
        subtitle={`We've sent a confirmation to ${email}. Open it, then come back to this link to finish setting up your sessions.`}
        footer={<span>The link in your receipt stays valid, so you can pick this up later.</span>}
      >
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => setCheckInbox(false)}
        >
          Use a different email
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Your sessions"
      title={mode === "signup" ? "Set up your account" : "Sign in to book"}
      subtitle="Your sessions are paid for and waiting. Set up an account to book them whenever you like."
      footer={
        mode === "signup" ? (
          <span>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </span>
        ) : (
          <span>
            No account yet?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="font-medium text-primary hover:underline"
            >
              Create one
            </button>
          </span>
        )
      }
    >
      <GoogleButton
        label="Continue with Google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            // Come back to this page, not the app root, so the token is still in
            // hand when Google sends them home.
            await signInWithGoogle(window.location.href);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Google sign-in failed");
            setBusy(false);
          }
        }}
      />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="claim-email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="claim-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.co.uk"
              className="h-11 rounded-xl pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use the same address you gave at checkout.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="claim-password">Password</Label>
          <div className="relative">
            <Input
              id="claim-password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="••••••••"
              className="h-11 rounded-xl pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {mode === "signup" ? "Create account" : "Sign in"} <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
