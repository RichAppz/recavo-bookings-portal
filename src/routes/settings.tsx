import { createFileRoute } from "@tanstack/react-router";
import { Copy, CreditCard, Globe } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useTenant } from "@/lib/tenant/tenant-context";
import {
  useBillingPortal,
  useConnectAccount,
  usePlans,
  useStartCheckout,
  useSubscription,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RECAVO" },
      {
        name: "description",
        content: "Business profile, booking rules, payment setup and notification templates.",
      },
      { property: "og:title", content: "RECAVO Settings" },
      {
        property: "og:description",
        content: "Configure booking rules, payments and notifications.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SettingsPage />
      </AppShell>
    </RequireAuth>
  ),
});

function SettingsPage() {
  const tenant = useTenant();
  const business = tenant.business;
  const bookingUrl = business ? `${window.location.origin}/book?businessId=${business.id}` : "";

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Configure how RECAVO works for ${business?.tradingName ?? "your business"}.`}
      />

      {tenant.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      ) : !business ? (
        <EmptyState title="Couldn't load your business" description="Please try again shortly." />
      ) : (
        <Tabs defaultValue="business">
          <TabsList className="flex-wrap">
            <TabsTrigger value="business">Business profile</TabsTrigger>
            <TabsTrigger value="booking">Booking rules</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="billing">SaaS billing</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="business" className="mt-4 grid gap-5 xl:grid-cols-2">
            <SectionCard title="Business details">
              <div className="grid gap-4">
                <Field label="Trading name" defaultValue={business.tradingName} />
                <Field label="Legal name" defaultValue={business.legalName} />
                <Field label="Currency" defaultValue={business.currency} />
                <Field label="Timezone" defaultValue={business.defaultTimezone} />
                <Field
                  label="VAT number"
                  defaultValue={tenant.configuration?.tax?.vatNumber ?? ""}
                />
                <p className="text-xs text-muted-foreground">
                  <StatusBadge status={business.status} /> account status
                </p>
                <Button
                  className="w-fit"
                  onClick={() => toast.message("Business profile editing is coming soon")}
                >
                  Save changes
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Booking page" description="What clients see when they book">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Public booking link</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={bookingUrl} />
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(bookingUrl);
                        toast.success("Booking link copied to clipboard");
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="welcome">Welcome message</Label>
                  <Textarea
                    id="welcome"
                    rows={3}
                    defaultValue={`Book your next session with the ${business.tradingName} team.`}
                  />
                </div>
                <Toggle
                  label="Show trainer profiles"
                  description="Clients can pick a specific trainer"
                  defaultChecked
                />
                <Toggle
                  label="Show remaining places"
                  description="Display spaces left on group sessions"
                  defaultChecked
                />
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="booking" className="mt-4 grid gap-5 xl:grid-cols-2">
            <SectionCard title="Booking window">
              <div className="grid gap-4">
                <Field
                  label="Default hold duration (minutes)"
                  defaultValue={String(tenant.configuration?.booking?.defaultHoldMinutes ?? 10)}
                />
                <Field
                  label="Cancellation window (hours)"
                  defaultValue={String(
                    tenant.configuration?.booking?.cancellationWindowHours ?? 24,
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  These values come from your live business configuration. Editing will be available
                  soon.
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Cancellation policy">
              <div className="grid gap-4">
                <Toggle
                  label="Charge for late cancellations"
                  description="Credit is consumed inside the window"
                  defaultChecked
                />
                <Toggle
                  label="Charge for no-shows"
                  description="Full session fee taken from card on file"
                  defaultChecked
                />
                <Toggle
                  label="Allow client self-rescheduling"
                  description="Clients can move a booking once"
                  defaultChecked
                />
                <Toggle label="Enable waitlists on full group sessions" defaultChecked />
                <Button
                  className="w-fit"
                  onClick={() => toast.message("Booking rules editing is coming soon")}
                >
                  Save rules
                </Button>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="payments" className="mt-4 grid gap-5 xl:grid-cols-2">
            <PaymentsTab />
          </TabsContent>

          <TabsContent value="billing" className="mt-4 grid gap-5 xl:grid-cols-2">
            <BillingTab />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4 grid gap-5 xl:grid-cols-2">
            <SectionCard title="Client notifications">
              <div className="grid gap-4">
                <Toggle
                  label="Booking confirmation"
                  description="Email and SMS on booking"
                  defaultChecked
                />
                <Toggle
                  label="24-hour reminder"
                  description="Sent the day before the session"
                  defaultChecked
                />
                <Toggle label="2-hour reminder" description="SMS only" />
                <Toggle
                  label="Package expiry warning"
                  description="7 days before credits expire"
                  defaultChecked
                />
                <Toggle label="Win-back message" description="After 30 days of inactivity" />
              </div>
            </SectionCard>

            <SectionCard title="Message templates">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tpl">Booking confirmation</Label>
                  <Textarea
                    id="tpl"
                    rows={4}
                    defaultValue={
                      "Hi {{first_name}}, your {{service}} with {{trainer}} is confirmed for {{date}} at {{time}} at {{location}}. Need to change it? Use {{manage_link}}."
                    }
                  />
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="size-3.5" /> Merge tags are replaced automatically when sending.
                </p>
                <Button
                  className="w-fit"
                  onClick={() => toast.message("Template editing is coming soon")}
                >
                  Save templates
                </Button>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function PaymentsTab() {
  const connect = useConnectAccount();

  return (
    <>
      <SectionCard
        title="Payment processing"
        action={connect.data ? <StatusBadge status={connect.data.onboardingState} /> : null}
      >
        {connect.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking payout account…</p>
        ) : connect.isError || !connect.data ? (
          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="No payout account connected"
            description="Connect a payment provider to start taking card payments."
            action={
              <Button onClick={() => toast.message("Connect account flow is coming soon")}>
                Connect account
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-start gap-4 rounded-xl border p-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CreditCard className="size-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {connect.data.provider} · {connect.data.accountId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Charges {connect.data.chargesEnabled ? "enabled" : "disabled"} · Payouts{" "}
                  {connect.data.payoutsEnabled ? "enabled" : "disabled"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.message("Provider dashboard link is coming soon")}
              >
                Manage
              </Button>
            </div>
            {connect.data.requirementsDue.length > 0 ? (
              <p className="mt-3 text-xs text-amber-600">
                {connect.data.requirementsDue.length} outstanding requirement(s):{" "}
                {connect.data.requirementsDue.join(", ")}
              </p>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="Invoicing and tax">
        <div className="grid gap-4">
          <Field label="Invoice prefix" defaultValue="INV-" />
          <Field label="VAT rate" defaultValue="20%" />
          <Toggle label="Send receipts automatically" defaultChecked />
          <Toggle label="Include VAT breakdown on receipts" defaultChecked />
          <Button
            className="w-fit"
            onClick={() => toast.message("Payment settings editing is coming soon")}
          >
            Save settings
          </Button>
        </div>
      </SectionCard>
    </>
  );
}

function BillingTab() {
  const subscription = useSubscription();
  const plans = usePlans();
  const checkout = useStartCheckout();
  const portal = useBillingPortal();
  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;

  return (
    <>
      <SectionCard
        title="Subscription"
        action={current?.status ? <StatusBadge status={current.status} /> : null}
      >
        {subscription.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading subscription…</p>
        ) : !current ? (
          <EmptyState
            title="No plan selected"
            description="Choose a plan below to start a Stripe Checkout session."
          />
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Plan:</span>{" "}
              <span className="font-medium">{plan?.name ?? "—"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Access:</span>{" "}
              <span className="font-medium capitalize">{current.accessState ?? "—"}</span>
            </p>
            <Button
              variant="outline"
              disabled={portal.isPending}
              onClick={async () => {
                const result = await portal.mutateAsync();
                const url = result.url ?? result.portalUrl;
                if (url) window.location.assign(url);
                else toast.success("Billing portal opened");
              }}
            >
              Manage in Stripe
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Available plans">
        <div className="space-y-3">
          {(plans.data ?? []).map((p) => (
            <div
              key={p.code}
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.prices[0]
                    ? `${formatMoney(p.prices[0].amountMinor, p.currency)} / ${p.prices[0].interval}`
                    : "—"}
                </p>
              </div>
              <Button
                size="sm"
                disabled={checkout.isPending}
                onClick={async () => {
                  const result = await checkout.mutateAsync({
                    plan: p.code,
                    interval: p.prices[0]?.interval ?? "month",
                  });
                  const url = result.url ?? result.checkoutUrl;
                  if (url) window.location.assign(url);
                }}
              >
                Checkout
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input defaultValue={defaultValue} />
    </div>
  );
}

function Toggle({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch
        defaultChecked={defaultChecked}
        onCheckedChange={() => toast.success(`${label} updated`)}
      />
    </div>
  );
}
