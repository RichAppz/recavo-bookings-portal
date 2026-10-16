import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";

/**
 * Must match "OTP Length" in the Supabase project's Auth settings, currently 8.
 * Too few boxes and the last digits have nowhere to go; too many and the field
 * never auto-submits.
 */
const CODE_LENGTH = 8;
const RESEND_SECONDS = 30;

/**
 * Sign-in by emailed code, for customers.
 *
 * There is no sign-up step and no password. Someone who bought as a guest has
 * purchases sitting under their address with no account attached, and asking
 * them to choose between "sign in" and "register" is asking a question they
 * cannot answer. Entering the address handles both cases identically, and
 * proving they control it is what lets those purchases be attached.
 */
export type EmailCodeStep = "email" | "code";

export function EmailCodeSignIn({
  defaultEmail = "",
  onSignedIn,
  onStepChange,
}: {
  /** Prefilled when we already know the address, e.g. from a purchase. */
  readonly defaultEmail?: string;
  readonly onSignedIn?: () => void;
  /** Lets the surrounding page swap its heading to "Check your email" once a code is out. */
  readonly onStepChange?: (step: EmailCodeStep, email: string | null) => void;
}) {
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Guards against the paste-and-submit path firing twice, since the code field
  // submits on its own once full.
  const verifying = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    onStepChange?.(sentTo ? "code" : "email", sentTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentTo]);

  async function send(address: string) {
    setBusy(true);
    try {
      await sendEmailCode(address);
      setSentTo(address);
      setCode("");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    try {
      await verifyEmailCode(sentTo!, value);
      onSignedIn?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(email.trim());
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[15px] font-semibold">
            Email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              className="h-14 rounded-2xl pl-11 text-[17px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-[52px] w-full rounded-full text-[16px] font-semibold"
          disabled={busy || email.trim().length === 0}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Email me a code <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          No password needed. Any bookings you made as a guest with this email will appear in your
          account.
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label htmlFor="code" className="sr-only">
          Code
        </Label>
        <p className="text-[15px] text-muted-foreground">
          We sent a {CODE_LENGTH}-digit code to{" "}
          <span className="font-semibold text-foreground">{sentTo}</span>
        </p>
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
          <InputOTPGroup className="w-full gap-1.5">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-14 flex-1 rounded-xl border text-[22px] font-semibold first:rounded-l-xl last:rounded-r-xl"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[15px]">
        <button
          type="button"
          disabled={resendIn > 0 || busy}
          className="font-medium text-muted-foreground disabled:cursor-default"
          onClick={() => void send(sentTo)}
        >
          {resendIn > 0 ? (
            <>
              Didn't get it? Resend in {Math.floor(resendIn / 60)}:
              {String(resendIn % 60).padStart(2, "0")}
            </>
          ) : (
            <span className="font-semibold text-foreground underline underline-offset-4">
              Resend the code
            </span>
          )}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4"
          onClick={() => {
            setSentTo(null);
            setCode("");
          }}
        >
          <ArrowLeft className="size-3.5" /> Use another email
        </button>
      </div>

      <p className="rounded-2xl border bg-card px-4 py-3 text-[14px] text-muted-foreground">
        No password needed. Signing in links any bookings you made as a guest with this email. The
        code can take a minute to arrive; check your spam folder if it doesn't.
      </p>

      <Button
        type="button"
        size="lg"
        className="h-[52px] w-full rounded-full text-[16px] font-semibold"
        disabled={busy || code.length !== CODE_LENGTH}
        onClick={() => void verify(code)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
      </Button>
    </div>
  );
}
