import { toast } from "sonner";
import {
  GroupedBlock,
  SettingsEmptyState,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusPill,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import type { PushDevice } from "@/lib/api/types";
import { isNativeApp } from "@/lib/native";
import { useMyPushDevices, usePush } from "@/lib/push/use-push";

function formatSeen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function deviceLabel(device: PushDevice): string {
  return (
    device.label ??
    (device.platform === "ios"
      ? "iPhone app"
      : device.platform === "android"
        ? "Android app"
        : "Browser")
  );
}

/**
 * Settings → This device: the push switch for the phone or browser in use, and
 * every device registered to this person (spec §6). Copy changes with what is
 * actually possible here: no provider for this platform yet, a browser without
 * Web Push, or notifications blocked in device settings.
 */
export function DevicePage() {
  const push = usePush();
  const devices = useMyPushDevices(push.available);
  const native = isNativeApp();
  const [saved, flash] = useSavedTick();
  const blocked = push.permission === "denied";
  const others = (devices.data ?? []).filter((d) => d.disabledAt === null).length;
  const notConfigured =
    !push.enabled &&
    (push.unavailableReason === "loading" || push.unavailableReason === "not-configured");

  const toggle = async (next: boolean) => {
    if (next) {
      const ok = await push.enable();
      if (ok) {
        flash();
        toast.success("Notifications are on for this device");
      }
    } else {
      await push.disable();
      flash();
      toast("Notifications are off for this device");
    }
  };

  const hint = push.enabled
    ? "New bookings, package requests, payments and messages buzz this device as they happen."
    : blocked
      ? `Notifications for RECAVO are blocked ${native ? "in your phone's settings" : "by this browser"}. Allow them there, then turn this on.`
      : push.unavailableReason === "browser"
        ? `This browser cannot receive push notifications. ${
            typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent)
              ? "Add RECAVO to your Home Screen from the Share menu, or use the RECAVO app."
              : "Try Chrome, Edge, Firefox or Safari 16+, or use the RECAVO app."
          }`
        : "Get told the moment something needs you — a package to confirm, a new booking, a payment — even when RECAVO is closed.";

  return (
    <SettingsPage
      title="This device"
      description="Notifications on the device you are using right now."
    >
      <SettingsSection
        id="device-push"
        title="Push notifications"
        help="Each phone or browser is switched on separately. Turning one off never affects the others."
      >
        {notConfigured ? (
          <SettingsEmptyState
            title="Push isn't available on this platform yet"
            description="You'll still get emails and see everything in the app."
          />
        ) : (
          <GroupedBlock>
            <SwitchRow
              id="device-push-switch"
              label="Notify this device"
              hint={hint}
              checked={push.enabled}
              saved={saved}
              disabled={push.busy || blocked || (!push.enabled && !push.available)}
              reason={
                blocked
                  ? `Blocked ${native ? "in your phone's settings" : "by this browser"}`
                  : !push.enabled && !push.available
                    ? "Not available here"
                    : undefined
              }
              onCheckedChange={(checked) => void toggle(checked)}
            />
          </GroupedBlock>
        )}
        {push.error && !blocked ? <p className="text-sm text-destructive">{push.error}</p> : null}
      </SettingsSection>

      {devices.data && devices.data.length > 0 ? (
        <SettingsSection
          id="device-list"
          title="Your devices"
          help="Everywhere you have turned notifications on, and when each was last seen."
          aside={others > 0 ? <StatusPill tone="mint">{others} on</StatusPill> : null}
        >
          <GroupedBlock as="ul">
            {devices.data.map((d) => {
              const off = d.disabledAt !== null;
              return (
                <SettingsRow
                  key={d.id}
                  as="li"
                  label={
                    <span className={off ? "text-muted-foreground line-through" : undefined}>
                      {deviceLabel(d)}
                    </span>
                  }
                  hint={
                    off
                      ? d.disabledReason === "provider_unregistered"
                        ? "No longer reachable"
                        : "Turned off"
                      : `Last seen ${formatSeen(d.lastSeenAt)}`
                  }
                >
                  <StatusPill tone={off ? "grey" : "mint"}>{off ? "Off" : "On"}</StatusPill>
                </SettingsRow>
              );
            })}
          </GroupedBlock>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
