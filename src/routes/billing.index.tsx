import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/BillingPage";
import { PageHeader } from "@/components/ui-bits";
import { saasPurchasesAllowedInApp } from "@/lib/native";

export const Route = createFileRoute("/billing/")({
  component: () => (
    <>
      {/* Billing state varies (no plan, trialing, past due), so the state-specific
          line lives in BillingPage rather than being asserted in the header. The
          store apps show the plan only — invoices and payment details are web. */}
      <PageHeader
        title="Recavo plan"
        description={
          saasPurchasesAllowedInApp() ? "Your plan, invoices and payment details." : "Your plan."
        }
      />
      <BillingPage />
    </>
  ),
});
