import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ReadOnlyNotice, SettingsPage, SettingsSection } from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { TakePaymentOnlineSetting } from "@/components/TakePaymentOnlineSetting";
import { WaitlistPageSetting } from "@/components/waitlist/WaitlistPageSetting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import type { BusinessConfiguration } from "@/lib/api/types";
import { isOnlinePaymentRequired } from "@/lib/booking-payment";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

type Draft = {
  holdMinutes: string;
  cancelHours: string;
  staff: string;
  service: string;
  booking: string;
  linkedRecord: string;
};

function draftFrom(config: BusinessConfiguration | null | undefined): Draft {
  return {
    holdMinutes: String(config?.booking?.defaultHoldMinutes ?? 10),
    cancelHours: String(config?.booking?.cancellationWindowHours ?? 24),
    staff: config?.terminology?.staff ?? "Staff",
    service: config?.terminology?.service ?? "Service",
    booking: config?.terminology?.booking ?? "Booking",
    linkedRecord: config?.terminology?.linkedRecord ?? "Record",
  };
}

function wholeNumber(value: string, min: number, max: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Settings → Booking rules (spec §6): holds and cancellations, paying online, words. */
export function BookingRulesPage() {
  const tenant = useTenant();
  const config = tenant.configuration;
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const update = useUpdateConfiguration();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [dirty, setDirty] = useState(false);

  const savedSnapshot = JSON.stringify(draftFrom(config));
  useEffect(() => {
    if (dirty) return;
    setDraft(draftFrom(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const hold = wholeNumber(draft.holdMinutes, 1, 100000);
  const cancel = wholeNumber(draft.cancelHours, 0, 100000);
  const words = {
    staff: draft.staff.trim(),
    service: draft.service.trim(),
    booking: draft.booking.trim(),
    linkedRecord: draft.linkedRecord.trim(),
  };
  const wordsValid = Object.values(words).every((w) => w.length > 0);
  const valid = hold !== null && cancel !== null && wordsValid;

  const save = async () => {
    await update.mutateAsync({
      terminology: words,
      booking: {
        defaultHoldMinutes: hold ?? 10,
        cancellationWindowHours: cancel ?? 0,
        // Preserve the payments toggle; that control saves on its own and a
        // booking patch that omitted it would turn online payments off.
        requireOnlinePayment: isOnlinePaymentRequired(config),
      } as NonNullable<Parameters<typeof update.mutateAsync>[0]["booking"]>,
    });
    setDirty(false);
    toast.success("Booking rules saved");
  };

  useSettingsDraft({
    dirty: canEdit && dirty,
    valid,
    saving: update.isPending,
    save,
    discard: () => {
      setDraft(draftFrom(config));
      setDirty(false);
    },
  });

  return (
    <SettingsPage
      title="Booking rules"
      description="How bookings behave and what things are called."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="rules-timing"
        title="Holds and cancellations"
        help="How long a slot is held while a client checks out, and how close to the start they can still cancel without it counting as late."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="rule-hold">Hold a slot for (minutes)</Label>
            <Input
              id="rule-hold"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.holdMinutes}
              disabled={!canEdit}
              aria-invalid={hold === null ? true : undefined}
              onChange={(e) => set({ holdMinutes: e.target.value })}
            />
            <p
              className={
                hold === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {hold === null
                ? "A whole number of minutes, 1 or more."
                : "Slots are released if checkout isn't finished in time."}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-cancel">Cancellation window (hours)</Label>
            <Input
              id="rule-cancel"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.cancelHours}
              disabled={!canEdit}
              aria-invalid={cancel === null ? true : undefined}
              onChange={(e) => set({ cancelHours: e.target.value })}
            />
            <p
              className={
                cancel === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {cancel === null
                ? "A whole number of hours, 0 or more."
                : cancel === 0
                  ? "Clients can cancel right up to the start."
                  : `Cancelling inside ${cancel} hour${cancel === 1 ? "" : "s"} counts as late.`}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="rules-payment"
        title="Paying online"
        help="Whether priced sessions must be paid before they're confirmed. Saves straight away."
      >
        <TakePaymentOnlineSetting variant="row" />
      </SettingsSection>

      <SettingsSection
        id="rules-waitlist"
        title="Waitlist"
        help="Whether clients can ask to be added from your booking page when no time suits. Saves straight away."
      >
        <WaitlistPageSetting />
      </SettingsSection>

      <SettingsSection
        id="rules-words"
        title="Words"
        help="What RECAVO calls things across the console, your booking page and client emails. Singular, capitalised."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["staff", "Staff"],
              ["service", "Service"],
              ["booking", "Booking"],
              ["linkedRecord", "Linked record"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={`word-${key}`}>{label}</Label>
              <Input
                id={`word-${key}`}
                value={draft[key]}
                disabled={!canEdit}
                aria-invalid={draft[key].trim().length === 0 ? true : undefined}
                onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
              />
              {draft[key].trim().length === 0 ? (
                <p className="text-xs text-destructive">Enter a word.</p>
              ) : null}
            </div>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
