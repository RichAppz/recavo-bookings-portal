import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, KeyRound, Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";

export const Route = createFileRoute("/reset")({
  component: ResetPage,
  head: () => ({ meta: [{ title: "Reset password — RECAVO" }] }),
});

const MIN_PASSWORD_LENGTH = 8;

/**
 * Two halves of the same journey. Signed out: ask for the email and send the link.
 * Arriving from that link: Supabase has already signed the person in and flagged a
 * recovery, so ask for the new password instead of showing the request form again.
 */
function ResetPage() {
  const { status, passwordRecovery } = useAuth();

  if (passwordRecovery) {
    // The session from the link may still be settling; keep the intent on screen
    // rather than flashing the request form.
    return status === "authenticated" ? <ChooseNewPassword /> : <SettingUp />;
  }
  return <RequestReset />;
}

function SettingUp() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="One moment"
      subtitle="Checking your reset link."
      footer={null}
    >
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    </AuthShell>
  );
}

function ChooseNewPassword() {
  const { updatePassword, clearPasswordRecovery, signOut, supabaseUser } = useAuth();
  const navigate = useNavigate();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = !busy && next.length >= MIN_PASSWORD_LENGTH && next === confirm;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // The reset link is the proof of identity here, so no current password.
      await updatePassword({ newPassword: next });
      toast.success("Password updated", {
        description: "You're signed in — use the new password next time.",
      });
      void navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      subtitle={
        supabaseUser?.email
          ? `You're resetting the password for ${supabaseUser.email}.`
          : "Pick something you haven't used here before."
      }
      footer={
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => {
            clearPasswordRecovery();
            void signOut();
            void navigate({ to: "/login", replace: true });
          }}
        >
          Cancel and sign out
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="h-11 rounded-xl pl-9"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort}
              autoFocus
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-xl"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            required
          />
          {mismatch ? <p className="text-xs text-destructive">Passwords don't match.</p> : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={!canSubmit}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Save new password <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

function RequestReset() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      subtitle="Enter the email you sign in with and we'll send a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
            <MailCheck className="size-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-foreground">Check your inbox</p>
            <p className="mt-1 text-muted-foreground">
              If an account exists for {email || "that email"}, a reset link is on its way.
            </p>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await resetPassword(email);
              setSent(true);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Request failed");
            } finally {
              setBusy(false);
            }
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
                placeholder="you@recavo.co.uk"
                className="h-11 rounded-xl pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Send reset link <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
