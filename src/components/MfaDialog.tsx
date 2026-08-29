import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TotpQr, TotpSecretField } from "@/components/TotpEnrollFields";
import { useAuth } from "@/lib/auth/auth-store";

export function MfaDialog() {
  const { mfaRequired, mfaMode, mfaEnrollment, verifyMfa, clearMfa } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const enrolling = mfaMode === "enroll" && Boolean(mfaEnrollment);

  useEffect(() => {
    if (mfaRequired) setCode("");
  }, [mfaRequired, mfaMode]);

  return (
    <Dialog
      open={mfaRequired}
      onOpenChange={(open) => {
        if (!open) {
          setCode("");
          clearMfa();
        }
      }}
    >
      <DialogContent className={enrolling ? "sm:max-w-md" : undefined}>
        <DialogHeader>
          <DialogTitle>
            {enrolling ? "Set up two-factor authentication" : "Two-factor authentication"}
          </DialogTitle>
          <DialogDescription>
            {enrolling
              ? "Scan the QR code with Google Authenticator, 1Password, or Authy, then enter the 6-digit code to confirm."
              : "This action requires a verification code from your authenticator app."}
          </DialogDescription>
        </DialogHeader>
        {enrolling && mfaEnrollment ? (
          <div className="space-y-3">
            <TotpQr qrCode={mfaEnrollment.qrCode} />
            <TotpSecretField secret={mfaEnrollment.secret} />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Authentication code</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            maxLength={8}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={clearMfa} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || code.length < 6}
            onClick={async () => {
              setBusy(true);
              try {
                const ok = await verifyMfa(code);
                if (ok) setCode("");
              } finally {
                setBusy(false);
              }
            }}
          >
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
