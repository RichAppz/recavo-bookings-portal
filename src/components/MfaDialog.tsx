import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
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
import { useAuth } from "@/lib/auth/auth-store";

function TotpQr({ qrCode }: { qrCode: string }) {
  const trimmed = qrCode.trim();
  if (trimmed.startsWith("<svg")) {
    return (
      <div
        className="mx-auto size-48 overflow-hidden rounded-lg bg-white p-2 [&_svg]:size-full"
        dangerouslySetInnerHTML={{ __html: trimmed }}
      />
    );
  }
  return (
    <img
      src={trimmed}
      alt="Authenticator QR code"
      className="mx-auto size-48 rounded-lg bg-white p-2"
    />
  );
}

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
            <div className="space-y-2">
              <Label htmlFor="mfa-secret">Or enter this key manually</Label>
              <div className="flex gap-2">
                <Input
                  id="mfa-secret"
                  readOnly
                  value={mfaEnrollment.secret}
                  className="font-mono text-sm tracking-wide"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(mfaEnrollment.secret);
                    toast.success("Secret copied");
                  }}
                >
                  <Copy className="size-4" />
                  <span className="sr-only">Copy secret</span>
                </Button>
              </div>
            </div>
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
