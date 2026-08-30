import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, Loader2, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthShell, GoogleButton } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";
import { stashPendingBusiness } from "@/lib/auth/pending-business";
import { stashPendingProfile } from "@/lib/auth/pending-profile";

/** Soft launch: PT-only. Industry picker stays out of the UI for now. */
const DEFAULT_INDUSTRY = "personal_training";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Create your account — RECAVO" },
      {
        name: "description",
        content:
          "Set up RECAVO for your personal training business in minutes: sessions, payments, clients and staff in one place.",
      },
    ],
  }),
});

function RegisterPage() {
  const { signUp, signInWithGoogle, status } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      void navigate({ to: "/" });
    }
  }, [status, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const trimmedName = name.trim();
      // Carry business + name into post-auth onboarding: the Supabase account is
      // created now; PATCH /me and CreateFirstBusiness run once authenticated.
      if (business.trim()) {
        stashPendingBusiness({
          legalName: business.trim(),
          industryTemplateKey: DEFAULT_INDUSTRY,
        });
      }
      if (trimmedName) {
        stashPendingProfile({ name: trimmedName });
      }
      await signUp(email, password, {
        full_name: trimmedName || undefined,
      });
      toast.success("Account created", {
        description: "Check your email to verify if prompted.",
      });
      // When a session is created immediately, the effect above navigates once
      // authenticated; otherwise the user verifies via email and signs in.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Free 14-day trial"
      title="Create your PT workspace"
      subtitle="Built for personal trainers — sessions, clients and payments set up in minutes."
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <GoogleButton
        label="Sign up with Google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Google sign-up failed");
            setBusy(false);
          }
        }}
      />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="name"
              autoComplete="name"
              placeholder="Alex Morgan"
              className="h-11 rounded-xl pl-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="business">Studio or business name</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="business"
              placeholder="Peak Performance PT"
              className="h-11 rounded-xl pl-9"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="work-email">Work email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="work-email"
              type="email"
              autoComplete="email"
              placeholder="you@peakpt.co.uk"
              className="h-11 rounded-xl pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">Password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="h-11 rounded-xl pr-11"
              minLength={8}
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
              Create account <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the RECAVO terms and privacy policy.
        </p>
      </form>
    </AuthShell>
  );
}
