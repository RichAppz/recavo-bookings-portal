import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, Mail, MailCheck } from "lucide-react";
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

function ResetPage() {
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
