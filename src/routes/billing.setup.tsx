import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { TotpQr, TotpSecretField } from "@/components/TotpEnrollFields";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-store";

export const Route = createFileRoute("/billing/setup")({
  head: () => ({
    meta: [
      { title: "Set up two-factor authentication — RECAVO" },
      {
        name: "description",
        content: "Add an authenticator app before choosing a Recavo plan.",
      },
    ],
  }),
  component: TotpSetupPage,
});

function TotpSetupPage() {
  const navigate = useNavigate();
  const {
    mfaEnrolled,
    mfaEnrollment,
    mfaStatusReady,
    startTotpEnrollment,
    verifyMfa,
    refreshMfaStatus,
  } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshMfaStatus();
  }, [refreshMfaStatus]);

  useEffect(() => {
    if (mfaStatusReady && mfaEnrolled) {
      void navigate({ to: "/billing" });
    }
  }, [mfaStatusReady, mfaEnrolled, navigate]);

  if (!mfaStatusReady || mfaEnrolled) {
    return <p className="text-sm text-muted-foreground">Checking two-factor status…</p>;
  }

  return (
    <>
      <PageHeader
        title="Protect your account first"
        description="Two-factor authentication is required before you pick a plan."
      />
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">Why this step exists</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Starting a Recavo plan takes a card, and we charge it when the trial ends. Refunds,
            billing changes and data exports can move money or client records. An authenticator
            app means a stolen password is not enough to do any of that.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Google Authenticator, 1Password, and Authy all work. You’ll need this app again when
            you sign in and when you change billing.
          </p>

          {mfaEnrollment ? (
            <div className="mt-6 space-y-4">
              <TotpQr qrCode={mfaEnrollment.qrCode} />
              <TotpSecretField secret={mfaEnrollment.secret} />
              <div className="space-y-2">
                <Label htmlFor="setup-mfa-code">Authentication code</Label>
                <Input
                  id="setup-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                  maxLength={8}
                />
              </div>
              <Button
                className="w-full"
                disabled={busy || code.length < 6}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const ok = await verifyMfa(code);
                    if (ok) {
                      setCode("");
                      await navigate({ to: "/billing" });
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Verifying…" : "Verify and continue"}
              </Button>
            </div>
          ) : (
            <Button
              className="mt-6 w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await startTotpEnrollment();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing…" : "Set up authenticator"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
