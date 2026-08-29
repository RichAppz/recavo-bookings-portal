import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TotpQr({ qrCode }: { qrCode: string }) {
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

export function TotpSecretField({ secret }: { secret: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="mfa-secret">Or enter this key manually</Label>
      <div className="flex gap-2">
        <Input
          id="mfa-secret"
          readOnly
          value={secret}
          className="font-mono text-sm tracking-wide"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(secret);
            toast.success("Secret copied");
          }}
        >
          <Copy className="size-4" />
          <span className="sr-only">Copy secret</span>
        </Button>
      </div>
    </div>
  );
}
