import { toast } from "sonner";
import { SectionCard } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import { useEmailPreferences, useUpdateEmailPreferences } from "@/lib/api/hooks";

/**
 * The one switch for RECAVO's own emails to the owner: the welcome, the setup tips
 * in the first weeks and the milestone notes. It is per person, not per business,
 * so it lives under Settings › Account. Billing notices (trial ending, a failed
 * payment, cancellation) are deliberately outside it — every account gets those.
 */
export function EmailPreferencesSetting({ className }: { className?: string }) {
  const prefs = useEmailPreferences();
  const update = useUpdateEmailPreferences();
  const on = prefs.data?.journeyEmails ?? true;
  const id = "email-pref-journey";

  return (
    <SectionCard
      title="Emails from RECAVO"
      description="What we send you about your account. Client messages and booking reminders are set per business, under Messages."
      className={className}
    >
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium">Tips and getting-started emails</span>
          <span className="block text-xs text-muted-foreground">
            A short note from Rich in your first weeks, plus a heads-up on milestones like your
            first booking. Never more than one a day.
          </span>
        </label>
        <Switch
          id={id}
          checked={on}
          disabled={prefs.isPending || update.isPending}
          aria-label="Tips and getting-started emails"
          onCheckedChange={(checked) => {
            update.mutate(
              { journeyEmails: checked },
              {
                onSuccess: () => {
                  toast.success(checked ? "Tips emails on" : "Tips emails off", {
                    description: checked
                      ? "We'll send the occasional note while you get set up."
                      : "You'll still get billing notices about your subscription.",
                  });
                },
              },
            );
          }}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Billing notices — your trial ending, a payment that didn't go through, a cancellation — are
        always sent.
      </p>
    </SectionCard>
  );
}
