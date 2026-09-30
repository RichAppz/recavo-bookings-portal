import { ShieldBan } from "lucide-react";
import type { PaymentsHoldNotice as Hold } from "@/lib/api/hooks";

/**
 * RECAVO has switched online payments off for this business.
 *
 * The reason is a support-side note and is never shown here; the owner is told
 * what has stopped, what still works, and who to contact.
 */
export function PaymentsHoldNotice({ hold }: { hold: Hold }) {
  return (
    <div
      role="status"
      className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <ShieldBan className="size-4 shrink-0" />
        Online payments are switched off
      </p>
      <p className="text-muted-foreground">
        RECAVO has paused online payments for this business. Stripe onboarding and new card payments
        are unavailable until this is reviewed. Existing payouts and refunds are not affected.
        Contact RECAVO support for help.
      </p>
      <p className="text-xs text-muted-foreground">
        Since {new Date(hold.since).toLocaleDateString("en-GB")}
      </p>
    </div>
  );
}
