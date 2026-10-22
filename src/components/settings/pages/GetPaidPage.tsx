import { Link } from "@tanstack/react-router";
import { CreditCard, Landmark } from "lucide-react";
import { BankTransferSetting } from "@/components/BankTransferSetting";
import { ConnectRejectedNotice } from "@/components/ConnectRejectedNotice";
import { InvoicingSetting } from "@/components/InvoicingSetting";
import { PaymentsHoldNotice } from "@/components/PaymentsHoldNotice";
import {
  GroupedBlock,
  ReadOnlyNotice,
  SettingsBanner,
  SettingsPage,
  SettingsSection,
  StatusPill,
} from "@/components/settings/primitives";
import { TakePaymentOnlineSetting } from "@/components/TakePaymentOnlineSetting";
import { Button } from "@/components/ui/button";
import {
  stripeHidden,
  useConnectAccount,
  useConnectLoginLink,
  usePaymentsHold,
} from "@/lib/api/hooks";
import type { ConnectAccount } from "@/lib/api/types";
import { connectRejection } from "@/lib/connect-rejection";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";

function connectPill(account: ConnectAccount | null | undefined, onHold: boolean) {
  if (!account) return <StatusPill tone="grey">Not set up</StatusPill>;
  if (onHold) return <StatusPill tone="red">On hold</StatusPill>;
  if (account.chargesEnabled && account.payoutsEnabled)
    return <StatusPill tone="mint">Active</StatusPill>;
  if (account.onboardingState === "not_started")
    return <StatusPill tone="grey">Not set up</StatusPill>;
  return <StatusPill tone="amber">Setting up</StatusPill>;
}

/**
 * Settings → Get paid (spec §5): how clients pay the business. The RECAVO
 * subscription is deliberately somewhere else (RECAVO plan). The amber banner
 * appears while there is no way to get paid; Take payment online stays locked
 * with the reason until Stripe or bank transfer is ready.
 */
export function GetPaidPage() {
  const tenant = useTenant();
  const connect = useConnectAccount();
  const hold = usePaymentsHold().data ?? null;
  const loginLink = useConnectLoginLink();
  const rejection = connectRejection(connect.data);
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  // Never getting Stripe (RECAVO decision) and nothing connected: no Stripe section at all.
  const hideStripe = stripeHidden(hold) && !connect.isLoading && !connect.data;

  const chargesReady = connect.data?.chargesEnabled === true && !hold;
  const bankReady = tenant.configuration?.bankTransfer?.enabled === true;
  const loaded = !connect.isLoading && !tenant.isLoading;
  const nothingReady = loaded && !chargesReady && !bankReady;

  const openStripeDashboard = async () => {
    const url = await loginLink.mutateAsync();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <SettingsPage
      title="Get paid"
      description={
        <>
          How clients pay you. Your RECAVO subscription is under{" "}
          <Link
            to="/settings/$page"
            params={{ page: "plan" }}
            className="font-medium text-foreground underline underline-offset-2"
          >
            RECAVO plan
          </Link>
          .
        </>
      }
      banner={
        nothingReady || !canEdit ? (
          <div className="grid gap-3">
            {!canEdit ? <ReadOnlyNotice /> : null}
            {nothingReady ? (
              <SettingsBanner title="No way to get paid yet">
                {hideStripe
                  ? "Add your bank transfer details so clients can pay you."
                  : "Connect Stripe for card payments or add your bank transfer details."}
              </SettingsBanner>
            ) : null}
          </div>
        ) : null
      }
    >
      <SettingsSection
        id="get-paid-online"
        title="Take payment online"
        help="Ask for payment when a client books a priced session, instead of settling on the day."
      >
        <TakePaymentOnlineSetting variant="row" />
      </SettingsSection>

      {hideStripe ? null : (
        <SettingsSection
          id="get-paid-cards"
          title="Card payments"
          help="Stripe takes the card and pays out to your bank. RECAVO never stores your bank details and takes no cut of each payment."
          aside={connect.isLoading ? null : connectPill(connect.data, Boolean(hold))}
        >
          {hold ? <PaymentsHoldNotice hold={hold} /> : null}
          {rejection ? <ConnectRejectedNotice rejection={rejection} /> : null}
          <GroupedBlock>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CreditCard className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-sm font-medium">
                  {connect.data
                    ? connect.data.provider === "stripe"
                      ? "Stripe"
                      : connect.data.provider
                    : "Stripe"}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {connect.data
                    ? `Charges ${connect.data.chargesEnabled ? "on" : "off"} · Payouts ${
                        connect.data.payoutsEnabled ? "on" : "off"
                      }`
                    : "Not connected. Set up takes a few minutes."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!connect.data ? (
                  hold ? null : (
                    <Can permission={PERMISSIONS.CONNECT_MANAGE}>
                      <Button asChild size="sm">
                        <Link to="/payments">Set up</Link>
                      </Button>
                    </Can>
                  )
                ) : (
                  <Can permission={PERMISSIONS.CONNECT_MANAGE}>
                    {connect.data.onboardingState !== "not_started" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loginLink.isPending}
                        onClick={() => void openStripeDashboard()}
                      >
                        <Landmark className="size-4" aria-hidden />
                        {connect.data.payoutsEnabled ? "Manage payouts" : "Open Stripe"}
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link to="/payments">Finish set up</Link>
                      </Button>
                    )}
                  </Can>
                )}
              </div>
            </div>
          </GroupedBlock>
          <p className="text-[13px] text-muted-foreground">
            Stripe takes <span className="text-foreground">1.5% + 20p</span> on UK cards,{" "}
            <span className="text-foreground">2.5% + 20p</span> on EEA cards and{" "}
            <span className="text-foreground">3.25% + 20p</span> on international cards. No monthly
            fee, and RECAVO takes nothing per payment.{" "}
            <a
              href="https://stripe.com/gb/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              Stripe's full UK pricing
            </a>
            .
          </p>
        </SettingsSection>
      )}

      <SettingsSection
        id="get-paid-bank"
        title="Bank transfer"
        help="Show your account details on booking confirmations and invoices so clients can pay you directly. The switch unlocks once the details are filled in."
      >
        <BankTransferSetting variant="section" />
      </SettingsSection>

      <SettingsSection
        id="get-paid-invoicing"
        title="Invoicing"
        help="Send numbered invoices for sessions and packages, with your own prefix, payment terms and footer."
      >
        <InvoicingSetting variant="section" />
      </SettingsSection>
    </SettingsPage>
  );
}
