import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AuthDivider, AuthShell, GoogleButton } from "@/components/AuthShell";
import { VerticalPicker } from "@/components/VerticalPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";
import { stashPendingBusiness } from "@/lib/auth/pending-business";
import { stashPendingProfile } from "@/lib/auth/pending-profile";
import {
  displayReferralCode,
  readPendingReferral,
  stashPendingReferral,
} from "@/lib/auth/pending-referral";
import { DEFAULT_VERTICAL, VERTICALS, type VerticalKey } from "@/lib/verticals";

const searchSchema = z.object({
  ref: z.string().optional(),
});

/** Must match the Supabase project's "OTP Length" auth setting (currently 8). */
const CODE_LENGTH = 8;
const RESEND_SECONDS = 30;

export const Route = createFileRoute("/register")({
  validateSearch: searchSchema,
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Create your account — RECAVO" },
      {
        name: "description",
        content:
          "Set up RECAVO for your personal training or automotive business in minutes: bookings, payments, clients and staff in one place.",
      },
    ],
  }),
});

function RegisterPage() {
  const { signUp, confirmSignUp, resendSignUpCode, signInWithGoogle, status } = useAuth();
  const navigate = useNavigate();
  const { ref } = Route.useSearch();
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [vertical, setVertical] = useState<VerticalKey>(DEFAULT_VERTICAL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(() =>
    displayReferralCode(ref ?? readPendingReferral() ?? ""),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set once sign-up succeeds without an immediate session: the account exists
  // but the email must be confirmed with the code Supabase just sent.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  // Guards the paste-and-submit path, since the code field auto-submits when full.
  const verifying = useRef(false);

  useEffect(() => {
    const incoming = ref?.trim() || readPendingReferral();
    if (!incoming) return;
    stashPendingReferral(incoming);
    setReferralCode(displayReferralCode(incoming));
  }, [ref]);

  useEffect(() => {
    if (status === "authenticated") {
      void navigate({ to: "/" });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function persistReferralField() {
    if (referralCode.trim()) stashPendingReferral(referralCode);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const trimmedName = name.trim();
      const trimmedBusiness = business.trim();
      persistReferralField();
      // Carry business + name into post-auth onboarding: the Supabase account is
      // created now; PATCH /me and CreateFirstBusiness run once authenticated.
      if (trimmedBusiness) {
        stashPendingBusiness({
          legalName: trimmedBusiness,
          industryTemplateKey: vertical,
        });
      }
      if (trimmedName) {
        stashPendingProfile({ name: trimmedName });
      }
      // Duplicate the choices into Supabase user_metadata: unlike the stash it
      // survives confirming the email on a different device or browser, and
      // even a plain sign-in days later after the code expired.
      const { session } = await signUp(email, password, {
        full_name: trimmedName || undefined,
        ...(trimmedBusiness
          ? { business_name: trimmedBusiness, industry_template_key: vertical }
          : {}),
      });
      // A session means email confirmation is off — the effect above navigates
      // once authenticated. Otherwise move to the code-entry step in place.
      if (session) {
        toast.success("Account created");
      } else {
        setAwaitingCode(true);
        setResendIn(RESEND_SECONDS);
        toast.success("Check your email", {
          description: `We sent a ${CODE_LENGTH}-digit code to ${email.trim()}.`,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
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
      // then navigates into the app.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await resendSignUpCode(email.trim());
      setCode("");
      setResendIn(RESEND_SECONDS);
      toast.success("Code resent", { description: `Sent again to ${email.trim()}.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the code");
    } finally {
      setBusy(false);
    }
  }

  if (awaitingCode) {
    return (
      <AuthShell
        eyebrow="One last step"
        title="Check your email"
        subtitle={`Enter the ${CODE_LENGTH}-digit code we sent to confirm your account.`}
        brand={VERTICALS[vertical].brand}
        footer={
          <span>
            Entered the wrong details?{" "}
            <button
              type="button"
              onClick={() => {
                setAwaitingCode(false);
                setCode("");
              }}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Back to sign up
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
            onClick={() => void resend()}
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
      eyebrow="Free 14-day trial"
      title="Create your workspace"
      subtitle="Set up bookings, clients and payments in minutes — tailored to your trade."
      brand={VERTICALS[vertical].brand}
      footer={
        <span>
          Already have an account?{" "}
          <Link
            to="/login"
            search={referralCode.trim() ? { ref: referralCode.trim() } : undefined}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <div className="mb-6 flex flex-col gap-4">
        <Label>What do you do?</Label>
        <VerticalPicker value={vertical} onChange={setVertical} disabled={busy} />
      </div>

      <GoogleButton
        label="Sign up with Google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          persistReferralField();
          if (business.trim()) {
            stashPendingBusiness({
              legalName: business.trim(),
              industryTemplateKey: vertical,
            });
          }
          if (name.trim()) {
            stashPendingProfile({ name: name.trim() });
          }
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
          <Label htmlFor="business">{VERTICALS[vertical].businessLabel}</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="business"
              placeholder={VERTICALS[vertical].businessPlaceholder}
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

        <div className="space-y-2">
          <Label htmlFor="referralCode">Referral code (optional)</Label>
          <Input
            id="referralCode"
            autoComplete="off"
            placeholder="ABCD-EFGH"
            className="h-11 rounded-xl"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll get the normal 14-day trial. The trainer who referred you earns a free month
            after your first paid invoice.
          </p>
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
