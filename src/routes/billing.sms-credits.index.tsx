import { createFileRoute, Link } from "@tanstack/react-router";
import { SmsCreditsCard } from "@/components/SmsCreditsCard";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";

/**
 * Landing page for the low-balance emails (`{PUBLIC_APP_URL}/billing/sms-credits`)
 * and the in-app "Buy texts" links. The same card also sits on the Billing page.
 */
export const Route = createFileRoute("/billing/sms-credits/")({
  head: () => ({
    meta: [{ title: "Text credits — RECAVO" }],
  }),
  component: () => (
    <>
      <PageHeader
        title="Text credits"
        description="Prepaid texts for reminders, confirmations and payment requests."
        actions={
          <Button variant="outline" asChild>
            <Link to="/billing">Back to billing</Link>
          </Button>
        }
      />
      <div className="max-w-2xl">
        <SmsCreditsCard />
      </div>
    </>
  ),
});
