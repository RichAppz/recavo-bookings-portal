import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingsPage, SettingsSection, StatusPill } from "@/components/settings/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";

const MIN_PASSWORD_LENGTH = 8;

/** How this person signs in, as a sentence ("You sign in with Google"). */
function signInMethods(providers: string[]): string {
  const names = providers
    .map((p) =>
      p === "email"
        ? "your email and password"
        : p === "google"
          ? "Google"
          : p === "apple"
            ? "Apple"
            : p,
    )
    .filter((v, i, arr) => arr.indexOf(v) === i);
  if (names.length === 0) return "You sign in with a magic link or code sent to your email.";
  if (names.length === 1) return `You sign in with ${names[0]}.`;
  return `You sign in with ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

/** Settings → Security: password and two-factor as two sections (spec §6). */
export function SecurityPage() {
  const { supabaseUser } = useAuth();
  const providers = (supabaseUser?.identities ?? []).map((i) => i.provider);
  return (
    <SettingsPage title="Security" description={signInMethods(providers)}>
      <PasswordSection hasPassword={providers.includes("email")} />
      <TwoFactorSection />
    </SettingsPage>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const { updatePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    !busy &&
    (!hasPassword || current.length > 0) &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await updatePassword({
        ...(hasPassword ? { currentPassword: current } : {}),
        newPassword: next,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(hasPassword ? "Password updated" : "Password set", {
        description: hasPassword
          ? "Use your new password next time you sign in."
          : "You can now sign in with your email and password as well as Google.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      id="security-password"
      title={hasPassword ? "Password" : "Set a password"}
      help={
        hasPassword
          ? "Change the password you sign in with."
          : "You currently sign in with Google. Add a password to sign in with your email too."
      }
    >
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        {hasPassword ? (
          <div className="grid gap-2">
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="pw-next">New password</Label>
          <Input
            id="pw-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort}
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch ? <p className="text-xs text-destructive">Passwords don't match.</p> : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-fit" disabled={!canSubmit}>
          {busy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
        </Button>
      </form>
    </SettingsSection>
  );
}

function TwoFactorSection() {
  const { mfaEnrolled, ensureAal2, unenrollMfa, refreshMfaStatus } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshMfaStatus();
  }, [refreshMfaStatus]);

  return (
    <SettingsSection
      id="security-2fa"
      title="Two-factor authentication"
      help="Privileged actions require a code from an authenticator app once this is on."
      aside={
        <StatusPill tone={mfaEnrolled ? "mint" : "grey"}>{mfaEnrolled ? "On" : "Off"}</StatusPill>
      }
    >
      {mfaEnrolled ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            An authenticator app is enrolled on this account.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-fit" disabled={busy}>
                Unenrol
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove two-factor authentication?</AlertDialogTitle>
                <AlertDialogDescription>
                  You’ll need to enter a code from your authenticator app to confirm. Privileged
                  actions will no longer require 2FA until you enrol again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setBusy(true);
                    void unenrollMfa().finally(() => setBusy(false));
                  }}
                >
                  Unenrol
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Add Google Authenticator, 1Password, or Authy. You can require a code for privileged
            actions once this is on.
          </p>
          <Button
            variant="outline"
            className="w-fit"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ok = await ensureAal2();
                if (ok) toast.success("Two-factor authentication is on");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : "Enrol authenticator"}
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}
