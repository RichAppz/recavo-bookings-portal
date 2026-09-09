import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";

/**
 * Shown from the moment a password-reset link lands until the new-password form is
 * ready. Wherever the link drops the person — Supabase may send them to the site
 * root rather than /reset — this is what they see instead of a dashboard.
 */
export function RecoveryPending() {
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
