import { GroupedBlock, SwitchRow, useSavedTick } from "@/components/settings/primitives";
import { Switch } from "@/components/ui/switch";
import { useWaitlistOnBookingPage } from "@/components/waitlist/use-waitlist-setting";
import { cn } from "@/lib/utils";

/**
 * "Join the waitlist" on the public booking page. `row` is the Settings switch row;
 * `inline` sits in the Waitlist page's empty state.
 */
export function WaitlistPageSetting({
  variant = "row",
  className,
}: {
  variant?: "row" | "inline";
  className?: string;
}) {
  const { enabled, canEdit, set, pending } = useWaitlistOnBookingPage();
  const [saved, flash] = useSavedTick();
  const change = (next: boolean) =>
    void set(next)
      .then(flash)
      .catch(() => undefined);

  if (variant === "row") {
    return (
      <GroupedBlock className={className}>
        <SwitchRow
          id="waitlist-on-booking-page"
          label={<>&ldquo;Join the waitlist&rdquo; on your booking page</>}
          hint="Clients see it when no time suits. Staff can always add people from the Waitlist page."
          checked={enabled}
          saved={saved}
          disabled={!canEdit || pending}
          onCheckedChange={change}
        />
      </GroupedBlock>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3 text-left",
        className,
      )}
    >
      <div className="grid gap-0.5">
        <label htmlFor="waitlist-on-booking-page-inline" className="text-sm font-bold">
          &ldquo;Join the waitlist&rdquo; on your booking page
        </label>
        <span className="text-xs text-muted-foreground">
          Clients see it when no time suits. Turn it off in Settings › Booking rules.
        </span>
      </div>
      <Switch
        id="waitlist-on-booking-page-inline"
        checked={enabled}
        disabled={!canEdit || pending}
        onCheckedChange={change}
      />
    </div>
  );
}
