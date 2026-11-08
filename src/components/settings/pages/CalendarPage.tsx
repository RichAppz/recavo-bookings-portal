import { CalendarColoursForm, PublicHolidaysSelect } from "@/components/CalendarColoursSetting";
import { ReadOnlyNotice, SettingsPage, SettingsSection } from "@/components/settings/primitives";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

/** Settings → Calendar (spec §6): booking colours with live bars, and bank holidays. */
export function CalendarPage() {
  const tenant = useTenant();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  return (
    <SettingsPage
      title="Calendar"
      description="How the calendar colours bookings, and which bank holidays it marks."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="calendar-colours"
        title="Booking colours"
        help="Booking bars on the calendar are coloured by payment status; events have a colour of their own. Pick yours, or leave blank for the defaults, which follow light and dark mode."
      >
        <CalendarColoursForm />
      </SettingsSection>

      <SettingsSection
        id="calendar-holidays"
        title="Bank holidays"
        help="Mark the public holidays for where you trade at the top of each day. They are a reminder only — bookings can still be taken on them. Dates come from gov.uk. Saves straight away."
      >
        <PublicHolidaysSelect className="w-full sm:w-72" />
      </SettingsSection>
    </SettingsPage>
  );
}
