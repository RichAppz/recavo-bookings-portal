import { useState } from "react";
import { SmsUpgradeDialog, type ContactChannel } from "@/components/SmsUpgradeDialog";
import { SMS_FEATURE_KEY, usePlanFeature } from "@/lib/api/hooks";

export type { ContactChannel };

/**
 * Gate a preferred-channel select on the SMS entitlement: picking SMS without it
 * opens {@link SmsUpgradeDialog} instead of changing the value; every other choice
 * passes straight through. Once the bolt-on is bought the selection completes.
 *
 * While the subscription is still loading the pick is allowed (never block on a
 * spinner); the API tolerates `sms` regardless and falls back to email.
 */
export function useSmsChannelGate(setChannel: (channel: ContactChannel) => void) {
  const entitled = usePlanFeature(SMS_FEATURE_KEY);
  const [open, setOpen] = useState(false);

  const onChannelChange = (next: ContactChannel) => {
    if (next === "sms" && entitled === false) {
      setOpen(true);
      return;
    }
    setChannel(next);
  };

  const dialog = (
    <SmsUpgradeDialog
      open={open}
      onOpenChange={setOpen}
      onEnabled={() => {
        setChannel("sms");
        setOpen(false);
      }}
    />
  );

  return { onChannelChange, dialog, smsEntitled: entitled };
}
