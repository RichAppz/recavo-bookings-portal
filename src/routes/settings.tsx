import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Copy, CreditCard, Globe } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/ui-bits";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useAddLinkedRecordField,
  useApplyLinkedRecordTemplate,
  useAuditEvents,
  useBillingCatalogue,
  useBillingPortal,
  useCancelSubscription,
  useCloseBusiness,
  useConnectAccount,
  useCreateLinkedRecordDefinition,
  useCreatePolicyDocument,
  useCurrentPolicyDocument,
  useInvitations,
  useInviteStaff,
  useLatestPrivacyNotice,
  useLifecycle,
  useLifecycleTransition,
  useLinkedRecordDefinition,
  useMemberships,
  usePolicyDocuments,
  usePublishPolicyDocument,
  usePublishPrivacyNotice,
  useReconcileCheckout,
  useResumeSubscription,
  useSeedPolicyDefaults,
  useStartCheckout,
  useSubscription,
  useSubscriptionChangeApply,
  useSubscriptionChangePreview,
  useUpdateBusiness,
  useUpdateConfiguration,
  useUpdateMembership,
  useUpdateNotificationTemplate,
} from "@/lib/api/hooks";
import type {
  PolicyDocumentType,
  SaasInterval,
  SaasPlanCode,
  SubscriptionChangePreview,
} from "@/lib/api/types";
import { formatInTz, formatMoney } from "@/lib/format";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
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
        content: "Business profile, configuration, team access, policies, lifecycle and billing.",
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

const POLICY_TYPES: PolicyDocumentType[] = [
  "cancellation",
  "terms",
  "privacy",
  "consent_text",
  "package_terms",
  "dpa",
];

const INVITE_ROLES = [
  SYSTEM_ROLES.ADMINISTRATOR,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.STAFF,
  SYSTEM_ROLES.RECEPTION,
  SYSTEM_ROLES.FINANCE,
  SYSTEM_ROLES.RESTRICTED_STAFF,
] as const;

const NOTIFICATION_TEMPLATE_KEYS = [
  {
    key: "booking_confirmation",
    label: "Booking confirmation",
    placeholder:
      "Hi {{first_name}}, your {{service}} with {{trainer}} is confirmed for {{date}} at {{time}}.",
  },
  {
    key: "booking_reminder_24h",
    label: "24-hour reminder",
    placeholder: "Reminder: your {{service}} is tomorrow at {{time}}.",
  },
  {
    key: "booking_cancelled",
    label: "Booking cancelled",
    placeholder: "Your {{service}} on {{date}} has been cancelled.",
  },
  {
    key: "package_expiry",
    label: "Package expiry warning",
    placeholder: "Your package expires on {{expiry_date}}. Renew to keep booking.",
  },
] as const;

const AUDIT_PAGE_SIZE = 25;

function SettingsPage() {
  const tenant = useTenant();
  const search = Route.useSearch();
  const business = tenant.business;
  const defaultTab = search.tab ?? "business";

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
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="business">Business profile</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="team">Team & access</TabsTrigger>
            <TabsTrigger value="policies">Policy documents</TabsTrigger>
            <TabsTrigger value="privacy">Privacy notices</TabsTrigger>
            <TabsTrigger value="notifications">Notification templates</TabsTrigger>
            <TabsTrigger value="records">Linked records</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="billing">SaaS billing</TabsTrigger>
          </TabsList>
          <TabsContent value="business" className="mt-4">
            <BusinessProfileTab />
          </TabsContent>
          <TabsContent value="configuration" className="mt-4">
            <ConfigurationTab />
          </TabsContent>
          <TabsContent value="team" className="mt-4">
            <TeamTab />
          </TabsContent>
          <TabsContent value="policies" className="mt-4">
            <PoliciesTab />
          </TabsContent>
          <TabsContent value="privacy" className="mt-4">
            <PrivacyTab />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationTemplatesTab />
          </TabsContent>
          <TabsContent value="records" className="mt-4">
            <LinkedRecordsTab />
          </TabsContent>
          <TabsContent value="lifecycle" className="mt-4">
            <LifecycleTab />
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <AuditTab />
          </TabsContent>
          <TabsContent value="payments" className="mt-4 grid gap-5 xl:grid-cols-2">
            <PaymentsTab />
          </TabsContent>
          <TabsContent value="billing" className="mt-4">
            <BillingTab />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function BusinessProfileTab() {
  const tenant = useTenant();
  const business = tenant.business!;
  const update = useUpdateBusiness();
  const bookingUrl = `${window.location.origin}/book?businessId=${business.id}`;
  const [tradingName, setTradingName] = useState(business.tradingName);
  const [legalName, setLegalName] = useState(business.legalName);
  const [currency, setCurrency] = useState(business.currency);
  const [timezone, setTimezone] = useState(business.defaultTimezone);
  const [locale, setLocale] = useState(business.locale);

  useEffect(() => {
    setTradingName(business.tradingName);
    setLegalName(business.legalName);
    setCurrency(business.currency);
    setTimezone(business.defaultTimezone);
    setLocale(business.locale);
  }, [business]);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Business details">
        <div className="grid gap-4">
          <Field label="Trading name" value={tradingName} onChange={setTradingName} />
          <Field label="Legal name" value={legalName} onChange={setLegalName} />
          <Field label="Currency" value={currency} onChange={setCurrency} />
          <Field label="Timezone" value={timezone} onChange={setTimezone} />
          <Field label="Locale" value={locale} onChange={setLocale} />
          <p className="text-xs text-muted-foreground">
            <StatusBadge status={business.status} /> · industry{" "}
            <span className="font-medium">{business.industryTemplateKey}</span>
          </p>
          <Can
            permission={PERMISSIONS.BUSINESS_UPDATE}
            fallback={<p className="text-xs text-muted-foreground">Requires business.update</p>}
          >
            <Button
              className="w-fit"
              disabled={update.isPending}
              onClick={async () => {
                await update.mutateAsync({
                  version: business.version,
                  body: {
                    tradingName: tradingName.trim(),
                    legalName: legalName.trim(),
                    currency: currency.trim().toUpperCase(),
                    defaultTimezone: timezone.trim(),
                    locale: locale.trim(),
                  },
                });
                toast.success("Business profile updated");
              }}
            >
              Save changes
            </Button>
          </Can>
        </div>
      </SectionCard>
      <SectionCard title="Booking page">
        <div className="grid gap-2">
          <Label>Public booking link</Label>
          <div className="flex gap-2">
            <Input readOnly value={bookingUrl} />
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(bookingUrl);
                toast.success("Booking link copied");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ConfigurationTab() {
  const tenant = useTenant();
  const config = tenant.configuration;
  const update = useUpdateConfiguration();
  const [staffTerm, setStaffTerm] = useState(config?.terminology?.staff ?? "Staff");
  const [serviceTerm, setServiceTerm] = useState(config?.terminology?.service ?? "Service");
  const [bookingTerm, setBookingTerm] = useState(config?.terminology?.booking ?? "Booking");
  const [linkedTerm, setLinkedTerm] = useState(config?.terminology?.linkedRecord ?? "Record");
  const [holdMinutes, setHoldMinutes] = useState(String(config?.booking?.defaultHoldMinutes ?? 10));
  const [cancelHours, setCancelHours] = useState(
    String(config?.booking?.cancellationWindowHours ?? 24),
  );
  const [vatRegistered, setVatRegistered] = useState(Boolean(config?.tax?.vatRegistered));
  const [vatNumber, setVatNumber] = useState(config?.tax?.vatNumber ?? "");
  const [closureDays, setClosureDays] = useState(
    String(config?.retention?.closureWindowDays ?? 30),
  );
  const [line1, setLine1] = useState(config?.legalAddress?.line1 ?? "");
  const [line2, setLine2] = useState(config?.legalAddress?.line2 ?? "");
  const [city, setCity] = useState(config?.legalAddress?.city ?? "");
  const [region, setRegion] = useState(config?.legalAddress?.region ?? "");
  const [postalCode, setPostalCode] = useState(config?.legalAddress?.postalCode ?? "");
  const [country, setCountry] = useState(config?.legalAddress?.country ?? "GB");

  useEffect(() => {
    setStaffTerm(config?.terminology?.staff ?? "Staff");
    setServiceTerm(config?.terminology?.service ?? "Service");
    setBookingTerm(config?.terminology?.booking ?? "Booking");
    setLinkedTerm(config?.terminology?.linkedRecord ?? "Record");
    setHoldMinutes(String(config?.booking?.defaultHoldMinutes ?? 10));
    setCancelHours(String(config?.booking?.cancellationWindowHours ?? 24));
    setVatRegistered(Boolean(config?.tax?.vatRegistered));
    setVatNumber(config?.tax?.vatNumber ?? "");
    setClosureDays(String(config?.retention?.closureWindowDays ?? 30));
    setLine1(config?.legalAddress?.line1 ?? "");
    setLine2(config?.legalAddress?.line2 ?? "");
    setCity(config?.legalAddress?.city ?? "");
    setRegion(config?.legalAddress?.region ?? "");
    setPostalCode(config?.legalAddress?.postalCode ?? "");
    setCountry(config?.legalAddress?.country ?? "GB");
  }, [config]);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Terminology">
        <div className="grid gap-4">
          <Field label="Staff label" value={staffTerm} onChange={setStaffTerm} />
          <Field label="Service label" value={serviceTerm} onChange={setServiceTerm} />
          <Field label="Booking label" value={bookingTerm} onChange={setBookingTerm} />
          <Field label="Linked record label" value={linkedTerm} onChange={setLinkedTerm} />
        </div>
      </SectionCard>
      <SectionCard title="Booking rules">
        <div className="grid gap-4">
          <Field
            label="Default hold (minutes)"
            value={holdMinutes}
            onChange={setHoldMinutes}
            type="number"
          />
          <Field
            label="Cancellation window (hours)"
            value={cancelHours}
            onChange={setCancelHours}
            type="number"
          />
        </div>
      </SectionCard>
      <SectionCard title="Tax">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <p className="text-sm font-medium">VAT registered</p>
            <Switch checked={vatRegistered} onCheckedChange={setVatRegistered} />
          </div>
          <Field label="VAT number" value={vatNumber} onChange={setVatNumber} />
        </div>
      </SectionCard>
      <SectionCard title="Legal address & retention">
        <div className="grid gap-4">
          <Field label="Address line 1" value={line1} onChange={setLine1} />
          <Field label="Address line 2" value={line2} onChange={setLine2} />
          <Field label="City" value={city} onChange={setCity} />
          <Field label="Region" value={region} onChange={setRegion} />
          <Field label="Postal code" value={postalCode} onChange={setPostalCode} />
          <Field label="Country (ISO-2)" value={country} onChange={setCountry} />
          <Field
            label="Closure export window (days)"
            value={closureDays}
            onChange={setClosureDays}
            type="number"
          />
        </div>
      </SectionCard>
      <div className="xl:col-span-2">
        <Can
          permission={PERMISSIONS.BUSINESS_UPDATE}
          fallback={<p className="text-xs text-muted-foreground">Requires business.update</p>}
        >
          <Button
            disabled={update.isPending}
            onClick={async () => {
              await update.mutateAsync({
                terminology: {
                  staff: staffTerm.trim(),
                  service: serviceTerm.trim(),
                  booking: bookingTerm.trim(),
                  linkedRecord: linkedTerm.trim(),
                },
                booking: {
                  defaultHoldMinutes: Number(holdMinutes) || 10,
                  cancellationWindowHours: Number(cancelHours) || 0,
                },
                tax: { vatRegistered, vatNumber: vatNumber.trim() || null },
                retention: { closureWindowDays: Number(closureDays) || 30 },
                legalAddress: line1.trim()
                  ? {
                      line1: line1.trim(),
                      line2: line2.trim() || null,
                      city: city.trim(),
                      region: region.trim() || null,
                      postalCode: postalCode.trim(),
                      country: country.trim().toUpperCase(),
                    }
                  : null,
              });
              toast.success("Configuration saved");
            }}
          >
            Save configuration
          </Button>
        </Can>
      </div>
    </div>
  );
}

function TeamTab() {
  const memberships = useMemberships();
  const invitations = useInvitations();
  const invite = useInviteStaff();
  const updateMembership = useUpdateMembership();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(SYSTEM_ROLES.STAFF);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Memberships">
        {memberships.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (memberships.data ?? []).length === 0 ? (
          <EmptyState title="No memberships" />
        ) : (
          <ul className="divide-y">
            {(memberships.data ?? []).map((m) => (
              <li key={m.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.userId}</p>
                  <p className="text-xs text-muted-foreground">
                    {(m.roleKeys ?? []).join(", ") || "No roles"}
                  </p>
                </div>
                <StatusBadge status={m.status} />
                <Can permission={PERMISSIONS.TEAM_MANAGE_PERMISSIONS}>
                  <Select
                    value={m.roleKeys[0] ?? SYSTEM_ROLES.STAFF}
                    onValueChange={async (value) => {
                      await updateMembership.mutateAsync({
                        membershipId: m.id,
                        body: { roleKeys: [value] },
                      });
                      toast.success("Role updated");
                    }}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <div className="space-y-5">
        <SectionCard title="Invite teammate">
          <Can
            permission={PERMISSIONS.TEAM_INVITE}
            fallback={<p className="text-sm text-muted-foreground">Requires team.invite</p>}
          >
            <div className="grid gap-4">
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-fit"
                disabled={invite.isPending || !email.trim()}
                onClick={async () => {
                  const result = await invite.mutateAsync({
                    email: email.trim(),
                    roleKeys: [role],
                  });
                  const link = `${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`;
                  await navigator.clipboard.writeText(link);
                  toast.success("Invitation created", { description: "Invite link copied." });
                  setEmail("");
                }}
              >
                Send invite
              </Button>
            </div>
          </Can>
        </SectionCard>
        <SectionCard title="Pending invitations">
          {(invitations.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <ul className="divide-y">
              {(invitations.data ?? []).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {(inv.roleKeys ?? []).join(", ")} · expires{" "}
                      {new Date(inv.expiresAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <StatusBadge status={inv.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function PoliciesTab() {
  const docs = usePolicyDocuments();
  const createDoc = useCreatePolicyDocument();
  const publishDoc = usePublishPolicyDocument();
  const seed = useSeedPolicyDefaults();
  const [type, setType] = useState<PolicyDocumentType>("cancellation");
  const [content, setContent] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const current = useCurrentPolicyDocument(type);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard
        title="Policy documents"
        action={
          <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
            <Button
              size="sm"
              variant="outline"
              disabled={seed.isPending}
              onClick={async () => {
                const result = await seed.mutateAsync();
                toast.success("Defaults seeded", {
                  description: `Published ${result.published.length}, skipped ${result.skipped.length}.`,
                });
              }}
            >
              Seed defaults
            </Button>
          </Can>
        }
      >
        {(docs.data ?? []).length === 0 ? (
          <EmptyState title="No policy documents" />
        ) : (
          <ul className="divide-y">
            {(docs.data ?? []).map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {doc.type} · v{doc.version}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.content?.slice(0, 120) || "No content"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.status === "draft" ? (
                    <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={publishDoc.isPending}
                        onClick={async () => {
                          await publishDoc.mutateAsync({ documentId: doc.id });
                          toast.success("Policy published");
                        }}
                      >
                        Publish
                      </Button>
                    </Can>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <div className="space-y-5">
        <SectionCard title="Create draft">
          <Can
            permission={PERMISSIONS.BUSINESS_UPDATE}
            fallback={<p className="text-sm text-muted-foreground">Requires business.update</p>}
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as PolicyDocumentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
              <div className="flex items-center justify-between rounded-xl border p-3">
                <p className="text-sm font-medium">Publish immediately</p>
                <Switch checked={publishNow} onCheckedChange={setPublishNow} />
              </div>
              <Button
                className="w-fit"
                disabled={createDoc.isPending || !content.trim()}
                onClick={async () => {
                  await createDoc.mutateAsync({
                    type,
                    content: content.trim(),
                    publish: publishNow,
                  });
                  toast.success(publishNow ? "Policy published" : "Draft created");
                  setContent("");
                }}
              >
                Create
              </Button>
            </div>
          </Can>
        </SectionCard>
        <SectionCard title={`Current ${type}`}>
          {!current.data ? (
            <p className="text-sm text-muted-foreground">No published document.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                v{current.data.version} · <StatusBadge status={current.data.status} />
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {current.data.content || "—"}
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function PrivacyTab() {
  const latest = useLatestPrivacyNotice();
  const publish = usePublishPrivacyNotice();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Latest privacy notice">
        {!latest.data ? (
          <EmptyState title="No privacy notice" />
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              {latest.data.title} · v{latest.data.version}
            </p>
            <p className="text-xs text-muted-foreground">
              Published {new Date(latest.data.publishedAt).toLocaleString("en-GB")}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">{latest.data.body}</p>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Publish new notice">
        <Can
          permission={PERMISSIONS.BUSINESS_UPDATE}
          fallback={<p className="text-sm text-muted-foreground">Requires business.update</p>}
        >
          <div className="grid gap-4">
            <Field label="Title" value={title} onChange={setTitle} />
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <Button
              className="w-fit"
              disabled={publish.isPending || !title.trim() || !body.trim()}
              onClick={async () => {
                await publish.mutateAsync({ title: title.trim(), body: body.trim() });
                toast.success("Privacy notice published");
                setTitle("");
                setBody("");
              }}
            >
              Publish
            </Button>
          </div>
        </Can>
      </SectionCard>
    </div>
  );
}

function NotificationTemplatesTab() {
  const update = useUpdateNotificationTemplate();
  const [bodies, setBodies] = useState<Record<string, string>>(() =>
    Object.fromEntries(NOTIFICATION_TEMPLATE_KEYS.map((t) => [t.key, t.placeholder])),
  );
  return (
    <SectionCard
      title="Message templates"
      description="API exposes PUT only — edit known template keys."
    >
      <Can
        permission={PERMISSIONS.BUSINESS_UPDATE}
        fallback={<p className="text-sm text-muted-foreground">Requires business.update</p>}
      >
        <div className="grid gap-5">
          {NOTIFICATION_TEMPLATE_KEYS.map((tpl) => (
            <div key={tpl.key} className="grid gap-2">
              <Label htmlFor={tpl.key}>
                {tpl.label} <span className="font-normal text-muted-foreground">({tpl.key})</span>
              </Label>
              <Textarea
                id={tpl.key}
                rows={3}
                value={bodies[tpl.key] ?? ""}
                onChange={(e) => setBodies((p) => ({ ...p, [tpl.key]: e.target.value }))}
              />
              <Button
                size="sm"
                className="w-fit"
                disabled={update.isPending || !(bodies[tpl.key] ?? "").trim()}
                onClick={async () => {
                  await update.mutateAsync({
                    key: tpl.key,
                    bodyRegion: (bodies[tpl.key] ?? "").trim(),
                  });
                  toast.success(`${tpl.label} saved`);
                }}
              >
                Save {tpl.label}
              </Button>
            </div>
          ))}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="size-3.5" /> Merge tags are replaced automatically.
          </p>
        </div>
      </Can>
    </SectionCard>
  );
}

function LinkedRecordsTab() {
  const def = useLinkedRecordDefinition();
  const applyTemplate = useApplyLinkedRecordTemplate();
  const createDef = useCreateLinkedRecordDefinition();
  const addField = useAddLinkedRecordField();
  const [templateKey, setTemplateKey] = useState("vehicle");
  const [key, setKey] = useState("vehicle");
  const [singular, setSingular] = useState("Vehicle");
  const [plural, setPlural] = useState("Vehicles");
  const [fieldKey, setFieldKey] = useState("registration");
  const [fieldLabel, setFieldLabel] = useState("Registration");
  const [dataType, setDataType] = useState<"short_text" | "long_text" | "integer" | "boolean">(
    "short_text",
  );
  const definition = def.data?.definition;
  const fields = def.data?.fields ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Active definition">
        {!definition ? (
          <EmptyState title="No linked-record definition" />
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-medium">
              {definition.singularLabel} / {definition.pluralLabel}{" "}
              <StatusBadge status={definition.status} />
            </p>
            <p className="text-xs text-muted-foreground">key: {definition.key}</p>
            <ul className="divide-y rounded-xl border">
              {fields.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No fields yet</li>
              ) : (
                fields.map((f, i) => (
                  <li key={String(f.id ?? f.fieldKey ?? i)} className="px-3 py-2 text-xs">
                    <span className="font-medium">{String(f.label ?? f.fieldKey)}</span>{" "}
                    <span className="text-muted-foreground">
                      ({String(f.dataType ?? f.type ?? "field")})
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </SectionCard>
      <div className="space-y-5">
        <SectionCard title="Apply template">
          <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
            <div className="grid gap-3">
              <Field label="Template key" value={templateKey} onChange={setTemplateKey} />
              <Button
                className="w-fit"
                disabled={applyTemplate.isPending || !templateKey.trim()}
                onClick={async () => {
                  await applyTemplate.mutateAsync(templateKey.trim());
                  toast.success("Template applied");
                }}
              >
                Apply template
              </Button>
            </div>
          </Can>
        </SectionCard>
        {!definition ? (
          <SectionCard title="Create definition">
            <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
              <div className="grid gap-3">
                <Field label="Key" value={key} onChange={setKey} />
                <Field label="Singular" value={singular} onChange={setSingular} />
                <Field label="Plural" value={plural} onChange={setPlural} />
                <Button
                  className="w-fit"
                  disabled={createDef.isPending}
                  onClick={async () => {
                    await createDef.mutateAsync({
                      key: key.trim(),
                      singularLabel: singular.trim(),
                      pluralLabel: plural.trim(),
                    });
                    toast.success("Definition created");
                  }}
                >
                  Create
                </Button>
              </div>
            </Can>
          </SectionCard>
        ) : (
          <SectionCard title="Add field">
            <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
              <div className="grid gap-3">
                <Field label="Field key" value={fieldKey} onChange={setFieldKey} />
                <Field label="Label" value={fieldLabel} onChange={setFieldLabel} />
                <Select value={dataType} onValueChange={(v) => setDataType(v as typeof dataType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short_text">short_text</SelectItem>
                    <SelectItem value="long_text">long_text</SelectItem>
                    <SelectItem value="integer">integer</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-fit"
                  disabled={addField.isPending}
                  onClick={async () => {
                    await addField.mutateAsync({
                      definitionId: definition.id,
                      body: { fieldKey: fieldKey.trim(), label: fieldLabel.trim(), dataType },
                    });
                    toast.success("Field added");
                  }}
                >
                  Add field
                </Button>
              </div>
            </Can>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function LifecycleTab() {
  const lifecycle = useLifecycle();
  const transition = useLifecycleTransition();
  const close = useCloseBusiness();
  const [status, setStatus] = useState<
    "trial" | "active" | "past_due" | "restricted" | "suspended"
  >("active");
  const [reason, setReason] = useState("");
  const tz = useTenant().business?.defaultTimezone ?? "Europe/London";
  const data = lifecycle.data;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard
        title="Lifecycle state"
        action={data ? <StatusBadge status={data.status} /> : null}
      >
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>Operational creates: {data.allowsOperationalCreates ? "allowed" : "blocked"}</p>
            <p>Export access: {data.allowsExportAccess ? "allowed" : "blocked"}</p>
            {data.closureExportUntil ? (
              <p className="text-amber-700">
                Export until {formatInTz(data.closureExportUntil, tz)}
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Transitions">
        <Can
          permission={PERMISSIONS.BUSINESS_UPDATE}
          fallback={<p className="text-sm text-muted-foreground">Requires business.update</p>}
        >
          <div className="grid gap-4">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["trial", "active", "past_due", "restricted", "suspended"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Field label="Reason (optional)" value={reason} onChange={setReason} />
            <Button
              className="w-fit"
              disabled={transition.isPending || !data || data.status === "closed"}
              onClick={async () => {
                if (!data) return;
                await transition.mutateAsync({
                  version: data.version,
                  status,
                  reason: reason.trim() || null,
                });
                toast.success(`Lifecycle moved to ${status}`);
              }}
            >
              Apply transition
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-fit"
                  disabled={!data || data.status === "closed" || close.isPending}
                >
                  Close business
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this business?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Starts the closure export window and schedules retention jobs.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      if (!data) return;
                      const result = await close.mutateAsync({
                        version: data.version,
                        reason: reason.trim() || null,
                      });
                      toast.success("Business closed", {
                        description: result.closureExportUntil
                          ? `Export until ${formatInTz(result.closureExportUntil, tz)}`
                          : undefined,
                      });
                    }}
                  >
                    Confirm close
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Can>
      </SectionCard>
    </div>
  );
}

function AuditTab() {
  const events = useAuditEvents();
  const [page, setPage] = useState(0);
  const tz = useTenant().business?.defaultTimezone ?? "Europe/London";
  const all = events.data ?? [];
  const pageCount = Math.max(1, Math.ceil(all.length / AUDIT_PAGE_SIZE));
  const slice = all.slice(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE);

  return (
    <Can
      permission={PERMISSIONS.AUDIT_READ}
      fallback={<EmptyState title="Permission denied" description="Requires audit.read." />}
    >
      <SectionCard title="Audit trail" description="Newest first">
        {slice.length === 0 ? (
          <EmptyState title="No audit events" />
        ) : (
          <>
            <ul className="divide-y">
              {slice.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-muted-foreground">{formatInTz(e.occurredAt, tz)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.actorType}:{e.actorId} → {e.targetType}:{e.targetId}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {pageCount}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </SectionCard>
    </Can>
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
        {!connect.data ? (
          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="No payout account connected"
            description="Connect a payment provider to take card payments."
          />
        ) : (
          <div className="flex items-start gap-4 rounded-xl border p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <CreditCard className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {connect.data.provider} · {connect.data.accountId}
              </p>
              <p className="text-xs text-muted-foreground">
                Charges {connect.data.chargesEnabled ? "enabled" : "disabled"} · Payouts{" "}
                {connect.data.payoutsEnabled ? "enabled" : "disabled"}
              </p>
            </div>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Invoicing and tax">
        <p className="text-sm text-muted-foreground">
          VAT and legal address are managed under Configuration.
        </p>
      </SectionCard>
    </>
  );
}

function BillingTab() {
  const search = Route.useSearch();
  const subscription = useSubscription();
  const catalogue = useBillingCatalogue();
  const plans = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const checkout = useStartCheckout();
  const reconcile = useReconcileCheckout();
  const portal = useBillingPortal();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const preview = useSubscriptionChangePreview();
  const apply = useSubscriptionChangeApply();
  const [interval, setInterval] = useState<SaasInterval>("month");
  const [previewResult, setPreviewResult] = useState<SubscriptionChangePreview | null>(null);
  const current = subscription.data?.subscription;
  const plan = subscription.data?.plan;
  const tz = useTenant().business?.defaultTimezone ?? "Europe/London";

  useEffect(() => {
    const sessionId = search.session_id;
    const attemptId = search.checkoutAttemptId;
    if (!sessionId && !attemptId) return;
    void (async () => {
      await reconcile.mutateAsync({
        ...(sessionId ? { stripeCheckoutSessionId: sessionId } : {}),
        ...(attemptId ? { checkoutAttemptId: attemptId } : {}),
      });
      toast.success("Subscription reconciled");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.session_id, search.checkoutAttemptId]);

  return (
    <Can
      permission={PERMISSIONS.BILLING_MANAGE}
      fallback={<EmptyState title="Permission denied" description="Requires billing.manage." />}
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="Subscription"
          action={current?.status ? <StatusBadge status={current.status} /> : null}
        >
          {!current ? (
            <EmptyState
              title="No plan selected"
              description="Choose a plan below to start Checkout."
            />
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Plan: <span className="font-medium">{plan?.name ?? current.planId ?? "—"}</span>
              </p>
              <p>
                Access: <span className="font-medium capitalize">{current.accessState ?? "—"}</span>
              </p>
              {current.currentPeriodEnd ? (
                <p>Period ends: {formatInTz(current.currentPeriodEnd, tz)}</p>
              ) : null}
              {current.cancelAtPeriodEnd ? (
                <p className="text-amber-700">Cancels at period end</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={portal.isPending}
                  onClick={async () => {
                    const result = await portal.mutateAsync();
                    const url = result.portalUrl ?? result.url;
                    if (url) window.location.assign(url);
                  }}
                >
                  Manage in Stripe
                </Button>
                {current.cancelAtPeriodEnd ? (
                  <Button
                    variant="outline"
                    disabled={resume.isPending}
                    onClick={async () => {
                      await resume.mutateAsync();
                      toast.success("Subscription resumed");
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={cancel.isPending}>
                        Cancel at period end
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Access continues until the current period ends.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep plan</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            await cancel.mutateAsync();
                            toast.success("Cancellation scheduled");
                          }}
                        >
                          Confirm cancel
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
            <Select value={interval} onValueChange={(v) => setInterval(v as SaasInterval)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <div className="space-y-3">
            {plans.map((p) => {
              const price = p.prices.find((x) => x.interval === interval) ?? p.prices[0];
              const isCurrent = plan?.code === p.code || current?.planId === p.code;
              return (
                <div
                  key={p.code}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {p.name} {isCurrent ? <StatusBadge status="active" /> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {price
                        ? `${formatMoney(price.amountMinor, p.currency)} / ${price.interval}`
                        : "—"}
                    </p>
                  </div>
                  {!current ? (
                    <Button
                      size="sm"
                      disabled={checkout.isPending}
                      onClick={async () => {
                        const result = await checkout.mutateAsync({
                          plan: p.code,
                          interval: price?.interval ?? interval,
                        });
                        const url = result.checkoutUrl ?? result.url;
                        if (url) window.location.assign(url);
                      }}
                    >
                      Checkout
                    </Button>
                  ) : !isCurrent ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={preview.isPending}
                      onClick={async () => {
                        const result = await preview.mutateAsync({
                          plan: p.code as SaasPlanCode,
                          interval: (price?.interval ?? interval) as SaasInterval,
                        });
                        setPreviewResult(result);
                      }}
                    >
                      Preview change
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
        {previewResult ? (
          <SectionCard title="Change preview" className="xl:col-span-2">
            <div className="space-y-3 text-sm">
              <p>
                {previewResult.changeKind} · {previewResult.timing} · effective{" "}
                {formatInTz(previewResult.effectiveAt, tz)}
              </p>
              <p>
                Charge now: {formatMoney(previewResult.chargeNowMinor, previewResult.currency)} ·
                Credit now: {formatMoney(previewResult.creditNowMinor, previewResult.currency)} ·
                Tax: {formatMoney(previewResult.taxMinor, previewResult.currency)}
              </p>
              {previewResult.overLimitBlockers.length > 0 ? (
                <p className="text-amber-700">
                  Blockers:{" "}
                  {previewResult.overLimitBlockers
                    .map((b) => `${b.limitKey} (${b.currentUsage}/${b.targetLimit})`)
                    .join(", ")}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  disabled={apply.isPending || previewResult.overLimitBlockers.length > 0}
                  onClick={async () => {
                    await apply.mutateAsync({ previewToken: previewResult.previewToken });
                    setPreviewResult(null);
                    toast.success("Plan change applied");
                  }}
                >
                  Apply change
                </Button>
                <Button variant="outline" onClick={() => setPreviewResult(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </Can>
  );
}
