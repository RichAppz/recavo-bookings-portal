import { createFileRoute, redirect } from "@tanstack/react-router";
import { ActivityPage } from "@/components/settings/pages/ActivityPage";
import { BookingRulesPage } from "@/components/settings/pages/BookingRulesPage";
import { BrandingPage } from "@/components/settings/pages/BrandingPage";
import { BusinessDetailsPage } from "@/components/settings/pages/BusinessDetailsPage";
import { CalendarPage } from "@/components/settings/pages/CalendarPage";
import { ClientMessagesPage } from "@/components/settings/pages/ClientMessagesPage";
import { DevicePage } from "@/components/settings/pages/DevicePage";
import { GetPaidPage } from "@/components/settings/pages/GetPaidPage";
import { PlanPage } from "@/components/settings/pages/PlanPage";
import { PoliciesPage } from "@/components/settings/pages/PoliciesPage";
import { ProfilePage } from "@/components/settings/pages/ProfilePage";
import { SecurityPage } from "@/components/settings/pages/SecurityPage";
import { TaxAddressPage } from "@/components/settings/pages/TaxAddressPage";
import { TeamPage } from "@/components/settings/pages/TeamPage";
import { SettingsEmptyState } from "@/components/settings/primitives";
import { PERMISSIONS } from "@/lib/permissions";
import { isSettingsPageKey, settingsItem, type SettingsPageKey } from "@/lib/settings-nav";
import { useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/settings/$page")({
  beforeLoad: ({ params }) => {
    if (!isSettingsPageKey(params.page)) {
      throw redirect({ to: "/settings", search: {}, replace: true });
    }
  },
  head: ({ params }) => {
    const item = isSettingsPageKey(params.page) ? settingsItem(params.page) : null;
    return {
      meta: [{ title: `${item ? `${item.label} — ` : ""}Settings — RECAVO` }],
    };
  },
  component: SettingsPageRoute,
});

function SettingsPageRoute() {
  const { page } = Route.useParams();
  const search = Route.useSearch();
  const tenant = useTenant();
  const key = (isSettingsPageKey(page) ? page : "business") as SettingsPageKey;
  const assist =
    search.assist === true ||
    search.assist === 1 ||
    search.assist === "1" ||
    search.assist === "true";

  switch (key) {
    case "profile":
      return <ProfilePage />;
    case "security":
      return <SecurityPage />;
    case "device":
      return <DevicePage />;
    case "business":
      return <BusinessDetailsPage />;
    case "team":
      return <TeamPage />;
    case "policies":
      return <PoliciesPage assist={assist} />;
    case "booking-rules":
      return <BookingRulesPage />;
    case "branding":
      return <BrandingPage />;
    case "calendar":
      return <CalendarPage />;
    case "tax":
      return <TaxAddressPage />;
    case "client-messages":
      return <ClientMessagesPage />;
    case "get-paid":
      return <GetPaidPage />;
    case "plan":
      return <PlanPage />;
    case "activity":
      return tenant.can(PERMISSIONS.AUDIT_READ) ? (
        <ActivityPage />
      ) : (
        <SettingsEmptyState
          title="Activity log"
          description="Your role can't see the activity log."
        />
      );
  }
}
