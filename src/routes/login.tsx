import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthShell, GoogleButton } from "@/components/AuthShell";
import { CustomerAuthLayout } from "@/components/CustomerAuthLayout";
import { EmailCodeSignIn } from "@/components/EmailCodeSignIn";
import { AuthChromeGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";
import { stashPendingReferral } from "@/lib/auth/pending-referral";
import { isCustomerHost } from "@/lib/hosts";

/** Must match the Supabase project's "OTP Length" auth setting (currently 8). */
const CODE_LENGTH = 8;
const RESEND_SECONDS = 30;

/**
 * Signing in with a password before the sign-up email was confirmed: Supabase
 * refuses with this specific error. The account and password are fine — the
 * user just never entered (or received) the code, maybe days ago on another
 * device — so the answer is a fresh code, not a dead-end error toast.
 */
function isEmailNotConfirmed(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "code" in err) {
    if ((err as { code?: unknown }).code === "email_not_confirmed") return true;
  }
  return err instanceof Error && /email not confirmed/i.test(err.message);
}

const searchSchema = z.object({
  redirect: z.string().optional(),
  ref: z.string().optional(),
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

/**
 * On book.recavo the home is `/account`. Old emails and leftover links still
 * point at `/portal` or `/`, and sending a customer there after a code sign-in
 * is how they ended up on the retired per-studio page.
 */
function postLoginPath(value: string | undefined, customerHost: boolean): string {
  const dest = safeRedirect(value);
  if (!customerHost) return dest;
  if (dest === "/" || dest === "/portal" || dest.startsWith("/portal?")) return "/account";
  return dest;
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
  const { redirect, ref } = Route.useSearch();
  // Which form to show depends on the hostname, which the server render cannot
  // see. Deciding in an effect rather than during render is what keeps the
  // customer host from being served the staff form and swapping it a moment
  // later — a password box appearing and vanishing looks like a bug.
  const [customer, setCustomer] = useState<boolean | null>(null);

  useEffect(() => {
    setCustomer(isCustomerHost(window.location.hostname));
  }, []);

  useEffect(() => {
    if (ref?.trim()) stashPendingReferral(ref);
  }, [ref]);

  useEffect(() => {
    if (status !== "authenticated" || customer === null) return;
    void navigate({ to: postLoginPath(redirect, customer) });
  }, [status, redirect, navigate, customer]);

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
  const { signIn, signInWithGoogle, confirmSignUp, resendSignUpCode } = useAuth();
  const { ref } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sign-in hit an unconfirmed account: a fresh code has been sent and we're
  // showing the code-entry step instead of the password form.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  // Guards the paste-and-submit path, since the code field auto-submits when full.
  const verifying = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      // Navigation happens in the effect above once the session is fully
      // established (after any 2FA challenge and /me load).
    } catch (err) {
      if (isEmailNotConfirmed(err)) {
        try {
          await resendSignUpCode(email.trim());
          setAwaitingCode(true);
          setResendIn(RESEND_SECONDS);
          toast.info("Confirm your email to finish signing up", {
            description: `We sent a new ${CODE_LENGTH}-digit code to ${email.trim()}.`,
          });
        } catch (resendErr) {
          toast.error(resendErr instanceof Error ? resendErr.message : "Couldn't send a new code");
        }
      } else {
        toast.error(err instanceof Error ? err.message : "Sign in failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    try {
      await confirmSignUp(email.trim(), value);
      // The auth-state change flips status to "authenticated"; the effect above
      // then navigates — and anything captured at sign-up (name, business) is
      // applied from the account's user_metadata.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  if (awaitingCode) {
    return (
      <AuthShell
        eyebrow="Almost there"
        title="Confirm your email"
        subtitle={`Your account was never confirmed. Enter the ${CODE_LENGTH}-digit code we just sent to finish signing in.`}
        footer={
          <span>
            Wrong account?{" "}
            <button
              type="button"
              onClick={() => {
                setAwaitingCode(false);
                setCode("");
              }}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Back to sign in
            </button>
          </span>
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="code">Enter the code we sent to {email.trim()}</Label>
            <InputOTP
              id="code"
              containerClassName="w-full"
              maxLength={CODE_LENGTH}
              value={code}
              disabled={busy}
              onChange={(value) => {
                setCode(value);
                if (value.length === CODE_LENGTH) void verify(value);
              }}
            >
              <InputOTPGroup className="w-full">
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 flex-1 text-base" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {busy ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Checking…
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={resendIn > 0 || busy}
            className="text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            onClick={() => {
              setBusy(true);
              resendSignUpCode(email.trim())
                .then(() => {
                  setCode("");
                  setResendIn(RESEND_SECONDS);
                  toast.success("Code resent", { description: `Sent again to ${email.trim()}.` });
                })
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : "Couldn't resend the code");
                })
                .finally(() => setBusy(false));
            }}
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>

          <p className="text-xs text-muted-foreground">
            The code can take a minute to arrive. Check your spam folder if it doesn&apos;t.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="PT console"
      title="Sign in to RECAVO"
      subtitle="Pick up where you left off — today's sessions, payments and client messages."
      footer={
        <span>
          New to RECAVO?{" "}
          <Link
            to="/register"
            search={ref?.trim() ? { ref: ref.trim() } : undefined}
            className="font-medium text-primary hover:underline"
          >
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
            // In the mobile app the sheet can be dismissed without signing in,
            // in which case this page stays put and must come back to life.
            if ((await signInWithGoogle()) === "cancelled") setBusy(false);
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
