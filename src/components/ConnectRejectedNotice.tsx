import { AlertTriangle } from "lucide-react";
import type { ConnectRejection } from "@/lib/connect-rejection";

/**
 * Why card payments stopped, in the same words the business was emailed (RECA-541).
 *
 * `reasonLabel` is absent when the provider gave a reason we may not pass on. The
 * notice still has to run in that case: the business can see its payments have
 * stopped, so saying nothing reads as a fault on our side.
 */
export function ConnectRejectedNotice({ rejection }: { rejection: ConnectRejection }) {
  return (
    <div
      role="status"
      className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        Stripe has rejected this account
      </p>
      <p className="text-muted-foreground">
        Card payments and payouts have stopped.
        {rejection.reasonLabel ? (
          <>
            {" "}
            The reason given was <span className="text-foreground">{rejection.reasonLabel}</span>
            {rejection.detail ? <> — {rejection.detail}</> : null}.
          </>
        ) : null}{" "}
        This is Stripe&rsquo;s decision, not ours, so we cannot reverse it — but you can ask them to
        look again. Anything already paid out to you is unaffected.
      </p>
      {rejection.rejectedAt ? (
        <p className="text-xs text-muted-foreground">
          Rejected {new Date(rejection.rejectedAt).toLocaleDateString("en-GB")}
        </p>
      ) : null}
    </div>
  );
}
