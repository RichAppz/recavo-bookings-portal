import { createFileRoute } from "@tanstack/react-router";
import { Copy, CreditCard, Globe, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemo } from "@/lib/demo-store";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RECAVO" },
      {
        name: "description",
        content:
          "Business profile, booking rules, payment setup, notification templates and demo controls.",
      },
      { property: "og:title", content: "RECAVO Settings" },
      { property: "og:description", content: "Configure booking rules, payments and notifications." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const demo = useDemo();

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Configure how RECAVO works for RECAVO."
        actions={
          <Button variant="outline" onClick={() => { demo.resetDemo(); toast.success("Demo data reset"); }}>
            <RotateCcw className="size-4" /> Reset demo data
          </Button>
        }
      />

      <Tabs defaultValue="business">
        <TabsList className="flex-wrap">
          <TabsTrigger value="business">Business profile</TabsTrigger>
          <TabsTrigger value="booking">Booking rules</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-4 grid gap-5 xl:grid-cols-2">
          <SectionCard title="Business details">
            <div className="grid gap-4">
              <Field label="Business name" defaultValue={demo.business.name} />
              <Field label="Tagline" defaultValue={demo.business.tagline} />
              <Field label="Contact email" defaultValue={demo.business.email} />
              <Field label="Phone" defaultValue={demo.business.phone} />
              <Field label="VAT number" defaultValue={demo.business.vatNumber} />
              <Button className="w-fit" onClick={() => toast.success("Business profile saved")}>Save changes</Button>
            </div>
          </SectionCard>

          <SectionCard title="Booking page" description="What clients see when they book">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Public booking link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={demo.business.bookingUrl} />
                  <Button
                    variant="outline"
                    onClick={() => toast.success("Booking link copied to clipboard")}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brand">Brand colour</Label>
                <div className="flex items-center gap-3">
                  <span className="size-9 rounded-lg border" style={{ backgroundColor: demo.business.brandColour }} />
                  <Input id="brand" defaultValue={demo.business.brandColour} className="max-w-40" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="welcome">Welcome message</Label>
                <Textarea id="welcome" rows={3} defaultValue="Book your next session with the RECAVO team. Sessions can be rescheduled up to 24 hours before." />
              </div>
              <Toggle label="Show trainer profiles" description="Clients can pick a specific trainer" defaultChecked />
              <Toggle label="Show remaining places" description="Display spaces left on group sessions" defaultChecked />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="booking" className="mt-4 grid gap-5 xl:grid-cols-2">
          <SectionCard title="Booking window">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Minimum notice</Label>
                <Select defaultValue="12">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Maximum advance booking</Label>
                <Select defaultValue="60">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Slot interval (minutes)" defaultValue="30" />
              <Field label="Buffer between sessions (minutes)" defaultValue="10" />
            </div>
          </SectionCard>

          <SectionCard title="Cancellation policy">
            <div className="grid gap-4">
              <Field label="Free cancellation window" defaultValue="24 hours" />
              <Toggle label="Charge for late cancellations" description="Credit is consumed inside the window" defaultChecked />
              <Toggle label="Charge for no-shows" description="Full session fee taken from card on file" defaultChecked />
              <Toggle label="Allow client self-rescheduling" description="Clients can move a booking once" defaultChecked />
              <Toggle label="Enable waitlists on full group sessions" defaultChecked />
              <Button className="w-fit" onClick={() => toast.success("Booking rules updated")}>Save rules</Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4 grid gap-5 xl:grid-cols-2">
          <SectionCard title="Payment processing" action={<StatusBadge status="connected" />}>
            <div className="flex items-start gap-4 rounded-xl border p-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CreditCard className="size-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">Stripe · acct_1PQ8Kd2Lx</p>
                <p className="text-xs text-muted-foreground">Payouts daily to Barclays ••••4471 · GBP</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast.success("Opening Stripe dashboard")}>Manage</Button>
            </div>
            <div className="mt-4 grid gap-4">
              <Toggle label="Take payment at booking" description="Card charged when the client books" defaultChecked />
              <Toggle label="Allow pay in person" description="Mark as cash or card on arrival" />
              <Toggle label="Store card on file" description="Needed for no-show charges" defaultChecked />
              <Field label="Processing fee" defaultValue="1.5% + 20p" />
            </div>
          </SectionCard>

          <SectionCard title="Invoicing and tax">
            <div className="grid gap-4">
              <Field label="Invoice prefix" defaultValue="PPT-" />
              <Field label="VAT rate" defaultValue="20%" />
              <Toggle label="Send receipts automatically" defaultChecked />
              <Toggle label="Include VAT breakdown on receipts" defaultChecked />
              <Button className="w-fit" onClick={() => toast.success("Payment settings saved")}>Save settings</Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 grid gap-5 xl:grid-cols-2">
          <SectionCard title="Client notifications">
            <div className="grid gap-4">
              <Toggle label="Booking confirmation" description="Email and SMS on booking" defaultChecked />
              <Toggle label="24-hour reminder" description="Sent the day before the session" defaultChecked />
              <Toggle label="2-hour reminder" description="SMS only" />
              <Toggle label="Package expiry warning" description="7 days before credits expire" defaultChecked />
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
                  defaultValue={"Hi {{first_name}}, your {{service}} with {{trainer}} is confirmed for {{date}} at {{time}} at {{location}}. Need to change it? Use {{manage_link}}."}
                />
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="size-3.5" /> Merge tags are replaced automatically when sending.
              </p>
              <Button className="w-fit" onClick={() => toast.success("Templates saved")}>Save templates</Button>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
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
      <Switch defaultChecked={defaultChecked} onCheckedChange={() => toast.success(`${label} updated`)} />
    </div>
  );
}
