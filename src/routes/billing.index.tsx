import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/BillingPage";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/billing/")({
  component: () => (
    <>
      {/* Billing state varies (no plan, trialing, past due), so the state-specific
          line lives in BillingPage rather than being asserted in the header. */}
      <PageHeader title="Recavo plan" description="Your plan, invoices and payment details." />
      <BillingPage />
    </>
  ),
});
