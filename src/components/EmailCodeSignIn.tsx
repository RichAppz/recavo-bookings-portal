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
export function EmailCodeSignIn({
  defaultEmail = "",
  onSignedIn,
}: {
  /** Prefilled when we already know the address, e.g. from a purchase. */
  readonly defaultEmail?: string;
  readonly onSignedIn?: () => void;
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
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 rounded-xl pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl"
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
        <p className="text-xs text-muted-foreground">
          No password needed. We'll send a code that signs you in.
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="code">Enter the code we sent to {sentTo}</Label>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          onClick={() => {
            setSentTo(null);
            setCode("");
          }}
        >
          <ArrowLeft className="size-3.5" /> Use a different email
        </button>
        <button
          type="button"
          disabled={resendIn > 0 || busy}
          className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          onClick={() => void send(sentTo)}
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        The code can take a minute to arrive. Check your spam folder if it doesn't.
      </p>
    </div>
  );
}
