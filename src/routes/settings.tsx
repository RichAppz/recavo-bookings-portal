import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  FileText,
  Globe,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import {
  useApplyPlanChange,
  useAuditEvents,
  useBillingPortal,
  useBusinessDetail,
  useCancelSubscription,
  useConfiguration,
  useConnectAccount,
  useCreatePolicyDocument,
  useCurrentPolicyDocument,
  useInvitationsList,
  useInviteStaff,
  useLifecycle,
  useMembershipsList,
  usePlans,
  usePolicyDocuments,
  usePreviewPlanChange,
  usePublishPolicyDocument,
  useReconcileCheckout,
  useResumeSubscription,
  useSeedPolicyDefaults,
  useStartCheckout,
  useSubscription,
  useUpdateBusiness,
  useUpdateConfiguration,
  useUpdateMembership,
  useCloseLifecycle,
  type BusinessSubscription,
  type PlanChangePreview,
  type PlanCode,
  type PlanInterval,
} from "@/lib/api/hooks";
import type { Membership, PolicyDocument } from "@/lib/api/types";
import { formatMoney, ukDate } from "@/lib/format";
import { toast } from "sonner";

const searchSchema = z.object({
  tab: z.string().optional(),
  session_id: z.string().optional(),
  checkoutAttemptId: z.string().optional(),
});

export const Route = createFileRoute("/settings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Settings — RECAVO" },
      {
        name: "description",
        content: "Business profile, configuration, team, policies and lifecycle management.",
      },
      { property: "og:title", content: "RECAVO Settings" },
      {
        property: "og:description",
        content: "Configure your business, team and legal documents.",
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

const ROLE_LABELS: Record<string, string> = {
  [SYSTEM_ROLES.BUSINESS_OWNER]: "Business owner",
  [SYSTEM_ROLES.ADMINISTRATOR]: "Administrator",
  [SYSTEM_ROLES.MANAGER]: "Manager",
  [SYSTEM_ROLES.STAFF]: "Staff",
  [SYSTEM_ROLES.RECEPTION]: "Reception",
  [SYSTEM_ROLES.FINANCE]: "Finance",
  [SYSTEM_ROLES.RESTRICTED_STAFF]: "Restricted staff",
};

const ASSIGNABLE_ROLES = Object.values(SYSTEM_ROLES).filter(
  (r) => r !== SYSTEM_ROLES.CUSTOMER && r !== SYSTEM_ROLES.BUSINESS_OWNER,
);

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ");
}

function SettingsPage() {
  const tenant = useTenant();
  const business = tenant.business;
  const bookingUrl = business ? `${window.location.origin}/book?businessId=${business.id}` : "";
  const search = Route.useSearch();
  const [tab, setTab] = useState(
    () => search.tab ?? (search.session_id || search.checkoutAttemptId ? "billing" : "business"),
  );

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
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="business">Business profile</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="policies">Policy documents</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="billing">SaaS billing</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="business" className="mt-4 grid gap-5 xl:grid-cols-2">
            <BusinessProfileTab />

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
                <p className="text-xs text-muted-foreground">
                  Booking-page copy and toggles above aren't yet backed by the API — coming soon.
                </p>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="configuration" className="mt-4 grid gap-5 xl:grid-cols-2">
            <ConfigurationTab />
          </TabsContent>

          <TabsContent value="team" className="mt-4 space-y-6">
            <TeamTab />
          </TabsContent>

          <TabsContent value="policies" className="mt-4 space-y-6">
            <PolicyDocumentsTab />
          </TabsContent>

          <TabsContent value="lifecycle" className="mt-4 space-y-6">
            <LifecycleTab />
          </TabsContent>

          <TabsContent value="audit" className="mt-4 space-y-6">
            <AuditTab />
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

/* ---------------- Business profile (RECA-503 #1) ---------------- */

function BusinessProfileTab() {
  const tenant = useTenant();
  const business = useBusinessDetail();
  const updateBusiness = useUpdateBusiness();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);

  const data = business.data;
  const [legalName, setLegalName] = useState(data?.legalName ?? "");
  const [tradingName, setTradingName] = useState(data?.tradingName ?? "");
  const [currency, setCurrency] = useState(data?.currency ?? "GBP");
  const [defaultTimezone, setDefaultTimezone] = useState(data?.defaultTimezone ?? "Europe/London");
  const [locale, setLocale] = useState(data?.locale ?? "en-GB");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  if (data && hydratedFor !== data.id) {
    setLegalName(data.legalName);
    setTradingName(data.tradingName);
    setCurrency(data.currency);
    setDefaultTimezone(data.defaultTimezone);
    setLocale(data.locale);
    setHydratedFor(data.id);
  }

  const save = async () => {
    if (!data) return;
    setFieldErrors({});
    try {
      await updateBusiness.mutateAsync({
        version: data.version,
        body: { legalName, tradingName, currency, defaultTimezone, locale },
      });
      toast.success("Business profile saved");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isConflict) {
          toast.error("Someone else updated this business — refreshed with the latest version.");
        } else if (err.fieldErrors.length > 0) {
          setFieldErrors(
            Object.fromEntries(
              err.fieldErrors
                .filter((fe) => fe.field)
                .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
            ),
          );
        }
      }
    }
  };

  return (
    <SectionCard
      title="Business details"
      description={
        canEdit
          ? "Changes use optimistic concurrency — if someone else saved first you'll be asked to retry."
          : "You have read-only access. Ask an owner or administrator to make changes."
      }
    >
      {business.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading business…</p>
      ) : !data ? (
        <EmptyState
          title="Couldn't load business details"
          description="Please try again shortly."
        />
      ) : (
        <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-2">
            <Label htmlFor="biz-trading">Trading name</Label>
            <Input
              id="biz-trading"
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.tradingName)}
            />
            {fieldErrors.tradingName ? (
              <p className="text-xs text-destructive">{fieldErrors.tradingName}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="biz-legal">Legal name</Label>
            <Input
              id="biz-legal"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.legalName)}
            />
            {fieldErrors.legalName ? (
              <p className="text-xs text-destructive">{fieldErrors.legalName}</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="biz-currency">Currency</Label>
              <Input
                id="biz-currency"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                aria-invalid={Boolean(fieldErrors.currency)}
              />
              {fieldErrors.currency ? (
                <p className="text-xs text-destructive">{fieldErrors.currency}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Non-GBP currencies may be rejected during the pilot.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="biz-tz">Timezone</Label>
              <Input
                id="biz-tz"
                value={defaultTimezone}
                onChange={(e) => setDefaultTimezone(e.target.value)}
                aria-invalid={Boolean(fieldErrors.defaultTimezone)}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="biz-locale">Locale</Label>
            <Input id="biz-locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            <StatusBadge status={data.status} /> account status
          </p>
          {canEdit ? (
            <Button className="w-fit" onClick={save} disabled={updateBusiness.isPending}>
              {updateBusiness.isPending ? "Saving…" : "Save changes"}
            </Button>
          ) : null}
        </fieldset>
      )}
    </SectionCard>
  );
}

/* ---------------- Configuration: terminology, booking, tax, retention (RECA-503 #2) ---------------- */

function ConfigurationTab() {
  const tenant = useTenant();
  const configuration = useConfiguration();
  const updateConfiguration = useUpdateConfiguration();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const cfg = configuration.data;

  const [terminology, setTerminology] = useState({
    staff: cfg?.terminology?.staff ?? "",
    service: cfg?.terminology?.service ?? "",
    booking: cfg?.terminology?.booking ?? "",
    linkedRecord: cfg?.terminology?.linkedRecord ?? "",
  });
  const [booking, setBooking] = useState({
    defaultHoldMinutes: cfg?.booking?.defaultHoldMinutes ?? 10,
    cancellationWindowHours: cfg?.booking?.cancellationWindowHours ?? 24,
  });
  const [tax, setTax] = useState({
    vatRegistered: cfg?.tax?.vatRegistered ?? false,
    vatNumber: cfg?.tax?.vatNumber ?? "",
  });
  const [retention, setRetention] = useState({
    closureWindowDays: cfg?.retention?.closureWindowDays ?? 30,
    fileRetentionDays: cfg?.retention?.fileRetentionDays ?? undefined,
  });
  const [legalAddress, setLegalAddress] = useState({
    line1: cfg?.legalAddress?.line1 ?? "",
    line2: cfg?.legalAddress?.line2 ?? "",
    city: cfg?.legalAddress?.city ?? "",
    region: cfg?.legalAddress?.region ?? "",
    postalCode: cfg?.legalAddress?.postalCode ?? "",
    country: cfg?.legalAddress?.country ?? "GB",
  });
  const [hydrated, setHydrated] = useState(false);

  if (cfg && !hydrated) {
    setTerminology({
      staff: cfg.terminology?.staff ?? "",
      service: cfg.terminology?.service ?? "",
      booking: cfg.terminology?.booking ?? "",
      linkedRecord: cfg.terminology?.linkedRecord ?? "",
    });
    setBooking({
      defaultHoldMinutes: cfg.booking?.defaultHoldMinutes ?? 10,
      cancellationWindowHours: cfg.booking?.cancellationWindowHours ?? 24,
    });
    setTax({ vatRegistered: cfg.tax?.vatRegistered ?? false, vatNumber: cfg.tax?.vatNumber ?? "" });
    setRetention({
      closureWindowDays: cfg.retention?.closureWindowDays ?? 30,
      fileRetentionDays: cfg.retention?.fileRetentionDays ?? undefined,
    });
    setLegalAddress({
      line1: cfg.legalAddress?.line1 ?? "",
      line2: cfg.legalAddress?.line2 ?? "",
      city: cfg.legalAddress?.city ?? "",
      region: cfg.legalAddress?.region ?? "",
      postalCode: cfg.legalAddress?.postalCode ?? "",
      country: cfg.legalAddress?.country ?? "GB",
    });
    setHydrated(true);
  }

  const savePatch = async (patch: Record<string, unknown>, label: string) => {
    try {
      await updateConfiguration.mutateAsync(patch);
      toast.success(`${label} saved`);
    } catch {
      // Toasted by the mutation's onError.
    }
  };

  if (configuration.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading configuration…</p>;
  }
  if (configuration.isError || !cfg) {
    return (
      <EmptyState title="Couldn't load configuration" description="Please try again shortly." />
    );
  }

  return (
    <>
      <SectionCard
        title="Terminology"
        description={'Rename these concepts across the whole app — e.g. "Staff" → "Trainers"'}
      >
        <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="term-staff">Staff</Label>
              <Input
                id="term-staff"
                value={terminology.staff}
                placeholder="Staff"
                onChange={(e) => setTerminology((t) => ({ ...t, staff: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="term-service">Service</Label>
              <Input
                id="term-service"
                value={terminology.service}
                placeholder="Service"
                onChange={(e) => setTerminology((t) => ({ ...t, service: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="term-booking">Booking</Label>
              <Input
                id="term-booking"
                value={terminology.booking}
                placeholder="Booking"
                onChange={(e) => setTerminology((t) => ({ ...t, booking: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="term-linked">Linked record</Label>
              <Input
                id="term-linked"
                value={terminology.linkedRecord}
                placeholder="Record"
                onChange={(e) => setTerminology((t) => ({ ...t, linkedRecord: e.target.value }))}
              />
            </div>
          </div>
          {canEdit ? (
            <Button
              className="w-fit"
              disabled={updateConfiguration.isPending}
              onClick={() => savePatch({ terminology }, "Terminology")}
            >
              Save terminology
            </Button>
          ) : null}
        </fieldset>
      </SectionCard>

      <SectionCard title="Booking window">
        <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-2">
            <Label htmlFor="cfg-hold">Default hold duration (minutes)</Label>
            <Input
              id="cfg-hold"
              type="number"
              min={1}
              value={booking.defaultHoldMinutes}
              onChange={(e) =>
                setBooking((b) => ({ ...b, defaultHoldMinutes: Number(e.target.value) || 1 }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cfg-cancel">Cancellation window (hours)</Label>
            <Input
              id="cfg-cancel"
              type="number"
              min={0}
              value={booking.cancellationWindowHours}
              onChange={(e) =>
                setBooking((b) => ({ ...b, cancellationWindowHours: Number(e.target.value) || 0 }))
              }
            />
          </div>
          {canEdit ? (
            <Button
              className="w-fit"
              disabled={updateConfiguration.isPending}
              onClick={() => savePatch({ booking }, "Booking window")}
            >
              Save booking window
            </Button>
          ) : null}
        </fieldset>
      </SectionCard>

      <SectionCard title="Tax">
        <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">VAT registered</p>
              <p className="text-xs text-muted-foreground">Show VAT breakdown on receipts</p>
            </div>
            <Switch
              checked={tax.vatRegistered}
              onCheckedChange={(v) => setTax((t) => ({ ...t, vatRegistered: v }))}
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cfg-vat">VAT number</Label>
            <Input
              id="cfg-vat"
              value={tax.vatNumber ?? ""}
              onChange={(e) => setTax((t) => ({ ...t, vatNumber: e.target.value }))}
              disabled={!tax.vatRegistered}
            />
          </div>
          {canEdit ? (
            <Button
              className="w-fit"
              disabled={updateConfiguration.isPending}
              onClick={() =>
                savePatch({ tax: { ...tax, vatNumber: tax.vatNumber || null } }, "Tax settings")
              }
            >
              Save tax settings
            </Button>
          ) : null}
        </fieldset>
      </SectionCard>

      <SectionCard
        title="Retention & legal address"
        description="Used for closure export windows and receipts"
      >
        <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cfg-closure">Closure export window (days)</Label>
              <Input
                id="cfg-closure"
                type="number"
                min={1}
                value={retention.closureWindowDays}
                onChange={(e) =>
                  setRetention((r) => ({ ...r, closureWindowDays: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-file-retention">File retention (days, blank = forever)</Label>
              <Input
                id="cfg-file-retention"
                type="number"
                min={1}
                value={retention.fileRetentionDays ?? ""}
                onChange={(e) =>
                  setRetention((r) => ({
                    ...r,
                    fileRetentionDays: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="addr-line1">Address line 1</Label>
              <Input
                id="addr-line1"
                value={legalAddress.line1}
                onChange={(e) => setLegalAddress((a) => ({ ...a, line1: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addr-line2">Address line 2</Label>
              <Input
                id="addr-line2"
                value={legalAddress.line2 ?? ""}
                onChange={(e) => setLegalAddress((a) => ({ ...a, line2: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addr-city">City</Label>
              <Input
                id="addr-city"
                value={legalAddress.city}
                onChange={(e) => setLegalAddress((a) => ({ ...a, city: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addr-region">Region</Label>
              <Input
                id="addr-region"
                value={legalAddress.region ?? ""}
                onChange={(e) => setLegalAddress((a) => ({ ...a, region: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addr-postcode">Postal code</Label>
              <Input
                id="addr-postcode"
                value={legalAddress.postalCode}
                onChange={(e) => setLegalAddress((a) => ({ ...a, postalCode: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addr-country">Country (ISO-2)</Label>
              <Input
                id="addr-country"
                maxLength={2}
                value={legalAddress.country}
                onChange={(e) =>
                  setLegalAddress((a) => ({ ...a, country: e.target.value.toUpperCase() }))
                }
              />
            </div>
          </div>
          {canEdit ? (
            <Button
              className="w-fit"
              disabled={updateConfiguration.isPending}
              onClick={() => savePatch({ retention, legalAddress }, "Retention & legal address")}
            >
              Save retention & address
            </Button>
          ) : null}
        </fieldset>
      </SectionCard>
    </>
  );
}

/* ---------------- Team: memberships & invitations (RECA-503 #3) ---------------- */

function TeamTab() {
  const memberships = useMembershipsList();
  const invitations = useInvitationsList();
  const tenant = useTenant();
  const [editing, setEditing] = useState<Membership | null>(null);
  const [inviting, setInviting] = useState(false);

  const locationName = (id: string) => tenant.locations.find((l) => l.id === id)?.name ?? id;

  return (
    <>
      <SectionCard
        title="Team members"
        description="Roles and location scope for everyone on your team"
        action={
          <Can permission={PERMISSIONS.TEAM_INVITE}>
            <Button size="sm" onClick={() => setInviting(true)}>
              <Plus className="size-4" /> Invite
            </Button>
          </Can>
        }
        bodyClassName="p-0"
      >
        {memberships.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading team…</p>
        ) : memberships.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load team" description="Please try again shortly." />
          </div>
        ) : (memberships.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState title="No teammates yet" description="Invite your first team member." />
          </div>
        ) : (
          <ul className="divide-y">
            {(memberships.data ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{m.userId}</span>
                    <StatusBadge status={m.status} />
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {m.roleKeys.map((r) => (
                      <Badge key={r} variant="secondary">
                        {roleLabel(r)}
                      </Badge>
                    ))}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.locationScopeIds === null || m.locationScopeIds.length === 0
                      ? "All locations"
                      : m.locationScopeIds.map(locationName).join(", ")}
                  </p>
                </div>
                <Can permission={PERMISSIONS.TEAM_MANAGE_PERMISSIONS}>
                  <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Can permission={PERMISSIONS.TEAM_INVITE}>
        <SectionCard title="Pending invitations" bodyClassName="p-0">
          {invitations.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading invitations…</p>
          ) : invitations.isError ? (
            <div className="p-6">
              <EmptyState
                title="Couldn't load invitations"
                description="Please try again shortly."
              />
            </div>
          ) : (invitations.data ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState title="No pending invitations" />
            </div>
          ) : (
            <ul className="divide-y">
              {(invitations.data ?? []).map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{inv.email}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {inv.roleKeys.map((r) => (
                        <Badge key={r} variant="secondary">
                          {roleLabel(r)}
                        </Badge>
                      ))}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Expires {ukDate(inv.expiresAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </Can>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <MembershipDialog membership={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invite = useInviteStaff();
  const [email, setEmail] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>([SYSTEM_ROLES.STAFF]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setEmail("");
    setRoleKeys([SYSTEM_ROLES.STAFF]);
    setFieldErrors({});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They'll get a one-time link to join your business.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="new.teammate@example.co.uk"
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label>Roles</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASSIGNABLE_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roleKeys.includes(r)}
                    onCheckedChange={() =>
                      setRoleKeys((keys) =>
                        keys.includes(r) ? keys.filter((k) => k !== r) : [...keys, r],
                      )
                    }
                  />
                  {roleLabel(r)}
                </label>
              ))}
            </div>
            {fieldErrors.roleKeys ? (
              <p className="text-xs text-destructive">{fieldErrors.roleKeys}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invite.isPending}
            onClick={async () => {
              if (!email.trim()) return toast.error("Enter an email address");
              if (roleKeys.length === 0) return toast.error("Choose at least one role");
              setFieldErrors({});
              try {
                await invite.mutateAsync({ email: email.trim(), roleKeys });
                toast.success("Invitation sent");
                onClose();
                reset();
              } catch (err) {
                if (err instanceof ApiError && err.fieldErrors.length > 0) {
                  setFieldErrors(
                    Object.fromEntries(
                      err.fieldErrors
                        .filter((fe) => fe.field)
                        .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
                    ),
                  );
                }
              }
            }}
          >
            {invite.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembershipDialog({
  membership,
  onClose,
}: {
  membership: Membership | null;
  onClose: () => void;
}) {
  const updateMembership = useUpdateMembership();
  const [roleKeys, setRoleKeys] = useState<string[]>(membership?.roleKeys ?? []);
  const [status, setStatus] = useState<Membership["status"]>(membership?.status ?? "active");
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  if (membership && hydratedFor !== membership.id) {
    setRoleKeys(membership.roleKeys);
    setStatus(membership.status);
    setHydratedFor(membership.id);
  }

  return (
    <Dialog open={membership !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit membership</DialogTitle>
          <DialogDescription>Change roles, status or location scope.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Roles</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASSIGNABLE_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roleKeys.includes(r)}
                    onCheckedChange={() =>
                      setRoleKeys((keys) =>
                        keys.includes(r) ? keys.filter((k) => k !== r) : [...keys, r],
                      )
                    }
                  />
                  {roleLabel(r)}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Membership["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={updateMembership.isPending}
            onClick={async () => {
              if (!membership) return;
              if (roleKeys.length === 0) return toast.error("Choose at least one role");
              await updateMembership.mutateAsync({
                membershipId: membership.id,
                body: { roleKeys, status },
              });
              toast.success("Membership updated");
              onClose();
            }}
          >
            {updateMembership.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Policy documents (RECA-503 #4) ---------------- */

const POLICY_TYPES: PolicyDocument["type"][] = [
  "terms",
  "privacy",
  "cancellation",
  "consent_text",
  "package_terms",
  "dpa",
];

const POLICY_LABELS: Record<PolicyDocument["type"], string> = {
  terms: "Terms of service",
  privacy: "Privacy policy",
  cancellation: "Cancellation policy",
  consent_text: "Consent wording",
  package_terms: "Package terms",
  dpa: "Data processing agreement",
};

function PolicyDocumentsTab() {
  const tenant = useTenant();
  const documents = usePolicyDocuments();
  const seedDefaults = useSeedPolicyDefaults();
  const publish = usePublishPolicyDocument();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const [drafting, setDrafting] = useState<PolicyDocument["type"] | null>(null);

  const byType = (type: PolicyDocument["type"]) =>
    (documents.data ?? []).filter((d) => d.type === type).sort((a, b) => b.version - a.version);

  return (
    <>
      <SectionCard
        title="Policy documents"
        description="Versioned legal wording shown to clients (terms, privacy, cancellation, etc.)"
        action={
          canEdit ? (
            <Button
              variant="outline"
              size="sm"
              disabled={seedDefaults.isPending}
              onClick={async () => {
                const result = await seedDefaults.mutateAsync();
                toast.success("Default wording seeded", {
                  description: `Published ${result.published.length}, skipped ${result.skipped.length} (already had documents).`,
                });
              }}
            >
              <ShieldCheck className="size-4" /> Seed defaults
            </Button>
          ) : null
        }
        bodyClassName="p-0"
      >
        {documents.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading policy documents…</p>
        ) : documents.isError ? (
          <div className="p-6">
            <EmptyState
              title="Couldn't load policy documents"
              description="Please try again shortly."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {POLICY_TYPES.map((type) => {
              const versions = byType(type);
              const current = versions.find((d) => d.status === "published");
              const draft = versions.find((d) => d.status === "draft");
              return (
                <li key={type} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{POLICY_LABELS[type]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {current
                        ? `Published v${current.version} · effective ${ukDate(current.effectiveAt.slice(0, 10))}`
                        : "No published version yet"}
                      {draft ? ` · draft v${draft.version} pending publish` : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      {draft ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publish.isPending}
                          onClick={async () => {
                            await publish.mutateAsync({ documentId: draft.id });
                            toast.success(`${POLICY_LABELS[type]} published`);
                          }}
                        >
                          Publish draft
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setDrafting(type)}>
                        New draft
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <NewPolicyDraftDialog type={drafting} onClose={() => setDrafting(null)} />
    </>
  );
}

function NewPolicyDraftDialog({
  type,
  onClose,
}: {
  type: PolicyDocument["type"] | null;
  onClose: () => void;
}) {
  const createDocument = useCreatePolicyDocument();
  const currentDoc = useCurrentPolicyDocument(type ?? undefined);
  const [content, setContent] = useState("");
  const [publishNow, setPublishNow] = useState(false);

  return (
    <Dialog
      open={type !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setContent("");
          setPublishNow(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New draft — {type ? POLICY_LABELS[type] : ""}</DialogTitle>
          <DialogDescription>
            {currentDoc.data
              ? `This will become v${currentDoc.data.version + 1} once published.`
              : "This will become the first version once published."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="policy-content">Content</Label>
            <Textarea
              id="policy-content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the reviewed legal wording here…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={publishNow} onCheckedChange={(v) => setPublishNow(v === true)} />
            Publish immediately (supersedes the current published version)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createDocument.isPending || !type}
            onClick={async () => {
              if (!type) return;
              if (!content.trim()) return toast.error("Add some content first");
              await createDocument.mutateAsync({ type, content, publish: publishNow });
              toast.success(publishNow ? "Draft created and published" : "Draft created");
              onClose();
              setContent("");
              setPublishNow(false);
            }}
          >
            {createDocument.isPending ? "Saving…" : publishNow ? "Create & publish" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Lifecycle (RECA-503 #5) ---------------- */

function LifecycleTab() {
  const tenant = useTenant();
  const lifecycle = useLifecycle();
  const closeLifecycle = useCloseLifecycle();
  const canClose = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const [reason, setReason] = useState("");

  if (lifecycle.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading lifecycle status…</p>;
  }
  if (lifecycle.isError || !lifecycle.data) {
    return (
      <EmptyState title="Couldn't load lifecycle status" description="Please try again shortly." />
    );
  }

  const data = lifecycle.data;
  const isClosed = data.status === "closed";

  return (
    <>
      <SectionCard
        title="Tenant lifecycle"
        description="Business status and what it currently allows"
        action={<StatusBadge status={data.status} />}
      >
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Operational creates</dt>
            <dd className="mt-1 font-medium">
              {data.allowsOperationalCreates ? "Allowed" : "Blocked"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Export access</dt>
            <dd className="mt-1 font-medium">{data.allowsExportAccess ? "Allowed" : "Blocked"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">In closure export window</dt>
            <dd className="mt-1 font-medium">{data.inClosureExportWindow ? "Yes" : "No"}</dd>
          </div>
          {data.closedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">Closed at</dt>
              <dd className="mt-1 font-medium">{ukDate(data.closedAt.slice(0, 10))}</dd>
            </div>
          ) : null}
          {data.closureExportUntil ? (
            <div>
              <dt className="text-xs text-muted-foreground">Export access until</dt>
              <dd className="mt-1 font-medium">{ukDate(data.closureExportUntil.slice(0, 10))}</dd>
            </div>
          ) : null}
          {data.deletionScheduledAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">Deletion scheduled</dt>
              <dd className="mt-1 font-medium">{ukDate(data.deletionScheduledAt.slice(0, 10))}</dd>
            </div>
          ) : null}
        </dl>
        {data.statusReason ? (
          <p className="mt-4 text-xs text-muted-foreground">Reason: {data.statusReason}</p>
        ) : null}
      </SectionCard>

      {canClose ? (
        <SectionCard
          title="Close this business"
          description="Irreversible from here — cancels billing, disconnects payouts and starts the retention clock"
        >
          {isClosed ? (
            <p className="text-sm text-muted-foreground">This business is already closed.</p>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <AlertTriangle className="size-4" /> Close business
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this business?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This preserves export access for{" "}
                    {data.closureExportUntil ? "a limited window" : "the configured window"}, then
                    schedules retention/anonymisation. Subscription and payout onboarding are
                    disconnected. This cannot be undone from the console.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2 px-6 pb-2">
                  <Label htmlFor="close-reason">Reason (optional)</Label>
                  <Textarea
                    id="close-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Business no longer trading"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={closeLifecycle.isPending}
                    onClick={async () => {
                      await closeLifecycle.mutateAsync({
                        version: data.version,
                        reason: reason.trim() || null,
                      });
                      toast.success("Business closed");
                    }}
                  >
                    {closeLifecycle.isPending ? "Closing…" : "Close permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}

/* ---------------- Audit log (RECA-503 #6) ---------------- */

function AuditTab() {
  return (
    <Can
      permission={PERMISSIONS.AUDIT_READ}
      fallback={
        <EmptyState
          title="Audit log is restricted"
          description="Ask a business owner or administrator to grant you audit access."
        />
      }
    >
      <AuditTabContent />
    </Can>
  );
}

function AuditTabContent() {
  const events = useAuditEvents();

  return (
    <SectionCard
      title="Audit events"
      description="Newest first — every sensitive action taken across your business"
      bodyClassName="p-0"
    >
      {events.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading audit events…</p>
      ) : events.isError ? (
        <div className="p-6">
          <EmptyState title="Couldn't load audit events" description="Please try again shortly." />
        </div>
      ) : (events.data ?? []).length === 0 ? (
        <div className="p-6">
          <EmptyState title="No audit events yet" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["When", "Actor", "Action", "Target"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(events.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {e.actorType}:{e.actorId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{e.action}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {e.targetType}:{e.targetId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/* ---------------- Payments (unchanged, own ticket) ---------------- */

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

/** Subscription responses don't carry the current billing interval directly — infer it from period length. */
function inferBillingInterval(sub?: BusinessSubscription | null): PlanInterval | null {
  if (!sub?.currentPeriodStart || !sub?.currentPeriodEnd) return null;
  const days =
    (new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) /
    86_400_000;
  return days > 60 ? "year" : "month";
}

function BillingTab() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const subscription = useSubscription();
  const plans = usePlans();
  const checkout = useStartCheckout();
  const portal = useBillingPortal();
  const cancelSub = useCancelSubscription();
  const resumeSub = useResumeSubscription();
  const reconcile = useReconcileCheckout();
  const previewChange = usePreviewPlanChange();
  const applyChange = useApplyPlanChange();

  const [billingInterval, setBillingInterval] = useState<PlanInterval>("month");
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const reconciledRef = useRef(false);

  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const currentInterval = inferBillingInterval(current);

  // Stripe redirects back with `session_id` (default Checkout convention) or, for
  // internally-triggered flows, `checkoutAttemptId`. Reconcile once, then drop the
  // params so a refresh doesn't replay the exchange.
  useEffect(() => {
    if (reconciledRef.current) return;
    if (!search.session_id && !search.checkoutAttemptId) return;
    reconciledRef.current = true;
    void (async () => {
      try {
        await reconcile.mutateAsync(
          search.session_id
            ? { stripeCheckoutSessionId: search.session_id }
            : { checkoutAttemptId: search.checkoutAttemptId },
        );
        toast.success("Subscription updated");
      } catch {
        // Errors are toasted by the hook's onError.
      } finally {
        void navigate({
          to: Route.fullPath,
          search: { tab: "billing" },
          replace: true,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = async (targetPlan: PlanCode, targetInterval: PlanInterval) => {
    try {
      const result = await previewChange.mutateAsync({
        plan: targetPlan,
        interval: targetInterval,
      });
      setPreview(result);
      setPreviewOpen(true);
    } catch {
      // Errors are toasted by the hook's onError.
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    try {
      await applyChange.mutateAsync({ previewToken: preview.previewToken });
      toast.success("Plan updated");
      setPreviewOpen(false);
      setPreview(null);
    } catch {
      // Errors are toasted by the hook's onError.
    }
  };

  return (
    <>
      <SectionCard
        title="Subscription"
        action={current?.status ? <StatusBadge status={current.status} /> : null}
      >
        {subscription.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading subscription…</p>
        ) : subscription.isError ? (
          <EmptyState title="Couldn't load subscription" description="Please try again shortly." />
        ) : !current ? (
          <EmptyState
            title="No plan selected"
            description="Choose a plan below to start a Stripe Checkout session."
          />
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Plan</dt>
                <dd className="mt-1 font-medium">{plan?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Access</dt>
                <dd className="mt-1 font-medium capitalize">{current.accessState ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {current.status === "trialing" ? "Trial ends" : "Renews"}
                </dt>
                <dd className="mt-1 font-medium">
                  {(current.status === "trialing" ? current.trialEnd : current.currentPeriodEnd)
                    ? new Date(
                        (current.status === "trialing"
                          ? current.trialEnd
                          : current.currentPeriodEnd)!,
                      ).toLocaleDateString("en-GB")
                    : "—"}
                </dd>
              </div>
            </dl>
            {current.cancelAtPeriodEnd ? (
              <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                Your subscription is set to cancel
                {current.currentPeriodEnd
                  ? ` on ${new Date(current.currentPeriodEnd).toLocaleDateString("en-GB")}`
                  : " at the end of the current period"}
                .
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
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
              {current.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  disabled={resumeSub.isPending}
                  onClick={async () => {
                    await resumeSub.mutateAsync();
                    toast.success("Subscription resumed");
                  }}
                >
                  Resume subscription
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={cancelSub.isPending}>
                      Cancel subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll keep access until the current period ends
                        {current.currentPeriodEnd
                          ? ` on ${new Date(current.currentPeriodEnd).toLocaleDateString("en-GB")}`
                          : ""}
                        . You can resume any time before then.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          await cancelSub.mutateAsync();
                          toast.success("Cancellation scheduled for period end");
                        }}
                      >
                        Cancel at period end
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Available plans"
        action={
          <div className="inline-flex rounded-lg border p-0.5 text-xs">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBillingInterval(i)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  billingInterval === i
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        {plans.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading plans…</p>
        ) : plans.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load plans" />
          </div>
        ) : (
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            {(plans.data ?? []).map((p) => {
              const price = p.prices.find((pr) => pr.interval === billingInterval) ?? p.prices[0];
              const isCurrentPlan =
                Boolean(current) &&
                plan?.code === p.code &&
                (currentInterval === null ||
                  currentInterval === (price?.interval ?? billingInterval));
              const pending =
                checkout.isPending || previewChange.isPending || applyChange.isPending;

              return (
                <div key={p.code} className="surface-card p-5">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {price ? formatMoney(price.amountMinor, p.currency) : "—"}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{price?.interval ?? billingInterval}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.trialDays > 0 ? `${p.trialDays} day free trial` : "No trial"}
                  </p>
                  <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                    {Object.entries(p.limits).map(([key, value]) => (
                      <li key={key} className="flex justify-between gap-2">
                        <span className="capitalize">{key.replace(/[._]/g, " ")}</span>
                        <span className="font-medium">{value}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan ? (
                    <Button className="mt-4 w-full" variant="outline" disabled>
                      <Check className="size-4" /> Current plan
                    </Button>
                  ) : !current ? (
                    <Button
                      className="mt-4 w-full"
                      disabled={pending}
                      onClick={async () => {
                        const result = await checkout.mutateAsync({
                          plan: p.code,
                          interval: price?.interval ?? billingInterval,
                        });
                        const url = result.url ?? result.checkoutUrl;
                        if (url) window.location.assign(url);
                      }}
                    >
                      {p.trialDays > 0 ? "Start free trial" : "Subscribe"}
                    </Button>
                  ) : (
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      disabled={pending}
                      onClick={() => handlePreview(p.code, price?.interval ?? billingInterval)}
                    >
                      {previewChange.isPending ? "Checking…" : "Change to this plan"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <PlanChangeDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreview(null);
        }}
        preview={preview}
        isApplying={applyChange.isPending}
        onApply={handleApply}
      />
    </>
  );
}

function PlanChangeDialog({
  open,
  onOpenChange,
  preview,
  isApplying,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PlanChangePreview | null;
  isApplying: boolean;
  onApply: () => void;
}) {
  const hasBlockers = (preview?.overLimitBlockers.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm plan change</DialogTitle>
          <DialogDescription>
            Review the proration below before applying — this reflects exactly what Stripe will
            charge or credit.
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-xs text-muted-foreground">From</p>
                <p className="font-medium capitalize">
                  {preview.current.plan} · {preview.current.interval}
                </p>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">To</p>
                <p className="font-medium capitalize">
                  {preview.target.plan} · {preview.target.interval}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Charged now</dt>
                <dd className="mt-0.5 font-medium">
                  {formatMoney(preview.chargeNowMinor, preview.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Credited now</dt>
                <dd className="mt-0.5 font-medium">
                  {formatMoney(preview.creditNowMinor, preview.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tax</dt>
                <dd className="mt-0.5 font-medium">
                  {formatMoney(preview.taxMinor, preview.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Next billing amount</dt>
                <dd className="mt-0.5 font-medium">
                  {preview.nextAmountMinor !== null
                    ? formatMoney(preview.nextAmountMinor, preview.currency)
                    : "—"}
                </dd>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              {preview.timing === "immediate"
                ? `Takes effect immediately (${new Date(preview.effectiveAt).toLocaleString("en-GB")}).`
                : `Scheduled for the end of the current period${
                    preview.nextPeriodEnd
                      ? ` (${new Date(preview.nextPeriodEnd).toLocaleDateString("en-GB")})`
                      : ""
                  }.`}
            </p>

            {hasBlockers ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-3.5" /> Over plan limits
                </p>
                <ul className="space-y-1">
                  {preview.overLimitBlockers.map((b) => (
                    <li key={b.limitKey}>
                      {b.limitKey.replace(/[._]/g, " ")}: using {b.currentUsage}, limit{" "}
                      {b.targetLimit}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">Reduce usage below the target plan's limits to continue.</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!preview || hasBlockers || isApplying} onClick={onApply}>
            {isApplying ? "Applying…" : "Confirm change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
