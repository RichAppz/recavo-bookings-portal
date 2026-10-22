import { toast } from "sonner";
import { AccountProfileForm } from "@/components/AccountProfileForm";
import { DeleteAccountDialog } from "@/components/DeleteAccountSection";
import {
  GroupedBlock,
  SettingsPage,
  SettingsSection,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import { Button } from "@/components/ui/button";
import { useEmailPreferences, useUpdateEmailPreferences } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/auth-store";

/** Settings → Profile: the person, not the business (spec §6). */
export function ProfilePage() {
  const { user } = useAuth();
  return (
    <SettingsPage
      title="Profile"
      description="Your own account — the same across every business you belong to."
    >
      <SettingsSection
        id="profile-details"
        title="Your details"
        help={
          <>
            Teammates see your name on the Team list; only you can change it. The name clients see
            when they book is set separately, on your staff record.
            {user?.email ? (
              <>
                <br />
                <br />
                Signed in as <span className="font-medium text-foreground">{user.email}</span>.
              </>
            ) : null}
          </>
        }
      >
        <AccountProfileForm showEmail={false} />
      </SettingsSection>

      <SettingsSection
        id="profile-emails"
        title="Emails from RECAVO"
        help="What we send you about your account. Client messages and booking reminders are set per business, under Client messages."
      >
        <GroupedBlock>
          <JourneyEmailsRow />
        </GroupedBlock>
        <p className="text-xs text-muted-foreground">
          Billing notices — your trial ending, a payment that didn't go through, a cancellation —
          are always sent.
        </p>
      </SettingsSection>

      <SettingsSection
        id="profile-delete"
        title="Delete account"
        help="Permanently remove your RECAVO account and personal data."
      >
        <p className="text-sm text-muted-foreground">
          Deleting your account signs you out everywhere, removes your name, email and phone number
          from RECAVO, and closes any business that nobody else owns. Closed businesses keep their
          records for a 30-day export window, then they’re anonymised. This can’t be undone.
        </p>
        <DeleteAccountDialog
          trigger={
            <Button
              variant="outline"
              className="w-fit border-destructive/50 text-destructive hover:bg-destructive-soft hover:text-destructive"
            >
              Delete my account…
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}

/**
 * The one switch for RECAVO's own emails to the owner: the welcome, the setup tips
 * in the first weeks and the milestone notes. Per person, not per business.
 * Billing notices are deliberately outside it — every account gets those.
 */
function JourneyEmailsRow() {
  const prefs = useEmailPreferences();
  const update = useUpdateEmailPreferences();
  const [saved, flash] = useSavedTick();
  const on = prefs.data?.journeyEmails ?? true;
  return (
    <SwitchRow
      id="email-pref-journey"
      label="Tips and getting-started emails"
      hint="A short note from Rich in your first weeks, plus a heads-up on milestones like your first booking. Never more than one a day."
      checked={on}
      saved={saved}
      disabled={prefs.isPending || update.isPending}
      onCheckedChange={(checked) => {
        update.mutate(
          { journeyEmails: checked },
          {
            onSuccess: () => {
              flash();
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
  );
}
