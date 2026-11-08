import { Link } from "@tanstack/react-router";
import { BillingPage } from "@/components/BillingPage";
import { SettingsPage } from "@/components/settings/primitives";

/**
 * Settings → RECAVO plan (spec §5): the subscription, add-ons, text credits and
 * plan chooser. The content is the existing billing surface — it already handles
 * the web, store and read-only store cases, the payment-failed card, the discount
 * banner and the change preview — under the one Settings page header.
 */
export function PlanPage() {
  return (
    <SettingsPage
      title="RECAVO plan"
      description={
        <>
          Your subscription, add-ons and text credits. How clients pay you is under{" "}
          <Link
            to="/settings/$page"
            params={{ page: "get-paid" }}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Get paid
          </Link>
          .
        </>
      }
    >
      <div className="pt-1">
        <BillingPage />
      </div>
    </SettingsPage>
  );
}
