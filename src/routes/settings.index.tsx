import { createFileRoute, redirect } from "@tanstack/react-router";
import { BusinessDetailsPage } from "@/components/settings/pages/BusinessDetailsPage";
import { legacySettingsTarget } from "@/lib/settings-nav";

/**
 * `/settings` itself. Old `?tab=` links (and Stripe's checkout return) are sent
 * to their new home before anything renders. With nothing to redirect, a desktop
 * shows Business details beside the index; a phone shows the index alone (the
 * layout hides this page there).
 */
export const Route = createFileRoute("/settings/")({
  beforeLoad: ({ search }) => {
    if (search.session_id || search.checkoutAttemptId) {
      throw redirect({
        to: "/billing/success",
        search: {
          session_id: search.session_id,
          checkoutAttemptId: search.checkoutAttemptId,
        },
        replace: true,
      });
    }
    if (search.tab !== undefined) {
      const target = legacySettingsTarget(search);
      throw redirect({
        to: "/settings/$page",
        params: { page: target.page },
        search: target.assist ? { assist: "1" } : {},
        hash: target.hash,
        replace: true,
      });
    }
  },
  component: BusinessDetailsPage,
});
