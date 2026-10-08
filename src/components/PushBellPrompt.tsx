import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";
import { usePush } from "@/lib/push/use-push";

/**
 * One-line nudge at the top of the bell menu: the person is already looking at
 * their notifications, which is the moment to offer having them pushed. Shown only
 * where push can actually be had, until they say yes or wave it off.
 */
export function PushBellPrompt() {
  const push = usePush();
  if (!push.offerPrompt) return null;

  return (
    <div className="mx-1 mb-1 flex items-start gap-2.5 rounded-lg bg-primary-soft/60 px-2.5 py-2">
      <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs leading-snug text-foreground">
          Get these {isNativeApp() ? "on your lock screen" : "as notifications on this device"},
          even when RECAVO is closed.
        </p>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={push.busy}
            onClick={() => {
              void push.enable().then((ok) => {
                if (ok) toast.success("Notifications are on for this device");
              });
            }}
          >
            Turn on
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs"
            onClick={push.dismissPrompt}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
