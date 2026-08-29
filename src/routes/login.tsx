import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthShell, GoogleButton } from "@/components/AuthShell";
import { CustomerAuthLayout } from "@/components/CustomerAuthLayout";
import { EmailCodeSignIn } from "@/components/EmailCodeSignIn";
import { AuthChromeGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";
import { isCustomerHost } from "@/lib/hosts";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

/**
 * Only follow in-app absolute paths. Rejects full URLs and protocol-relative
 * paths (open redirect), and /login itself (redirect loop).
 */
function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — RECAVO" },
      {
        name: "description",
        content: "Sign in to the RECAVO staff console to manage bookings, clients and payments.",
      },
    ],
  }),
});

function LoginPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  // Which form to show depends on the hostname, which the server render cannot
  // see. Deciding in an effect rather than during render is what keeps the
  // customer host from being served the staff form and swapping it a moment
  // later — a password box appearing and vanishing looks like a bug.
  const [customer, setCustomer] = useState<boolean | null>(null);

  useEffect(() => {
    setCustomer(isCustomerHost(window.location.hostname));
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void navigate({ to: safeRedirect(redirect) });
    }
  }, [status, redirect, navigate]);

  if (customer === null) {
    return <AuthChromeGhost />;
  }
  return customer ? <CustomerLogin /> : <StaffLogin />;
}

/**
 * Customers get a code by email and nothing else. They visit a handful of times
 * a year, so a password is a fifth thing to forget; staff, who are in this all
 * day, keep passwords where password managers and MFA earn their place.
 */
function CustomerLogin() {
  return (
    <CustomerAuthLayout
      title="Your sessions and credits"
      subtitle="Sign in with your email to see what you've booked, use your credits and buy more."
    >
      <EmailCodeSignIn />
    </CustomerAuthLayout>
  );
}

function StaffLogin() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      // Navigation happens in the effect above once the session is fully
      // established (after any 2FA challenge and /me load).
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="PT console"
      title="Sign in to RECAVO"
      subtitle="Pick up where you left off — today's sessions, payments and client messages."
      footer={
        <span>
          New to RECAVO?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <GoogleButton
        label="Continue with Google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Google sign-in failed");
            setBusy(false);
          }
        }}
      />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@recavo.co.uk"
              className="h-11 rounded-xl pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/reset" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
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
              Sign in <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
