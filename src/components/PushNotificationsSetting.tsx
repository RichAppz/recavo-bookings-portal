import { BellOff, BellRing, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import type { PushDevice } from "@/lib/api/types";
import { isNativeApp } from "@/lib/native";
import { useMyPushDevices, usePush } from "@/lib/push/use-push";
import { cn } from "@/lib/utils";

function formatSeen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function DeviceRow({ device }: { device: PushDevice }) {
  const off = device.disabledAt !== null;
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className={cn("truncate", off && "text-muted-foreground line-through")}>
        {device.label ??
          (device.platform === "ios"
            ? "iPhone app"
            : device.platform === "android"
              ? "Android app"
              : "Browser")}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {off
          ? device.disabledReason === "provider_unregistered"
            ? "no longer reachable"
            : "turned off"
          : `last seen ${formatSeen(device.lastSeenAt)}`}
      </span>
    </li>
  );
}

/**
 * The push switch for this device. Lives on Settings → Notifications for staff and
 * on the client account profile: both kinds of user get pushed the same way, and
 * the registration belongs to the person, not to a business.
 *
 * Copy changes with what is actually possible here: the API may not have a
 * provider for this platform yet, a browser may not support Web Push (Safari on
 * iPhone only does once the site is on the Home Screen), or notifications may be
 * blocked in device settings — which no switch of ours can undo.
 */
export function PushNotificationsSetting({ className }: { className?: string }) {
  const push = usePush();
  const devices = useMyPushDevices(push.available);
  const native = isNativeApp();

  const toggle = async (next: boolean) => {
    if (next) {
      const ok = await push.enable();
      if (ok) toast.success("Notifications are on for this device");
    } else {
      await push.disable();
      toast("Notifications are off for this device");
    }
  };

  const blocked = push.permission === "denied";
  const others = (devices.data ?? []).filter((d) => d.disabledAt === null).length;

  return (
    <section
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        push.enabled ? "border-primary/25 bg-primary-soft/50" : "border-border bg-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
              push.enabled ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {push.enabled ? (
              <BellRing className="size-5" />
            ) : blocked ? (
              <BellOff className="size-5" />
            ) : (
              <Smartphone className="size-5" />
            )}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold tracking-tight">Push notifications</p>
            {push.enabled ? (
              <p className="text-sm text-muted-foreground">
                New bookings, package requests, payments and messages buzz this device as they
                happen.
              </p>
            ) : blocked ? (
              <p className="text-sm text-muted-foreground">
                Notifications for RECAVO are blocked{" "}
                {native ? "in your phone's settings" : "by this browser"}. Allow them there, then
                turn this on.
              </p>
            ) : push.unavailableReason === "browser" ? (
              <p className="text-sm text-muted-foreground">
                This browser cannot receive push notifications.{" "}
                {typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent)
                  ? "Add RECAVO to your Home Screen from the Share menu, or use the RECAVO app."
                  : "Try Chrome, Edge, Firefox or Safari 16+, or use the RECAVO app."}
              </p>
            ) : push.unavailableReason === "not-configured" ? (
              <p className="text-sm text-muted-foreground">
                Push is not available on this platform yet.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Get told the moment something needs you — a package to confirm, a new booking, a
                payment — even when RECAVO is closed.
              </p>
            )}
            {push.error && !blocked ? (
              <p className="text-sm text-destructive">{push.error}</p>
            ) : null}
          </div>
        </div>
        <Switch
          checked={push.enabled}
          disabled={push.busy || blocked || (!push.enabled && !push.available)}
          onCheckedChange={(checked) => void toggle(checked)}
          className="mt-1 shrink-0"
          aria-label="Push notifications on this device"
        />
      </div>
      {devices.data && devices.data.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your devices {others > 0 ? `(${others} on)` : ""}
          </p>
          <ul className="space-y-1.5">
            {devices.data.map((d) => (
              <DeviceRow key={d.id} device={d} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
