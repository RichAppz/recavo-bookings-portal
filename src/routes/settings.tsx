import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Copy, CreditCard, Globe, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Markdown } from "@/components/Markdown";
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
import { useAuth } from "@/lib/auth/auth-store";
import {
  useAddLinkedRecordField,
  useAiDraftPolicies,
  isAiPolicyDraftUnavailable,
  useApplyLinkedRecordTemplate,
  useAuditEvents,
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
  useSeedPolicyDefaults,
  useUpdateBusiness,
  useUpdateConfiguration,
  useUpdateMe,
  useUpdateMembership,
  useUpdateNotificationTemplate,
} from "@/lib/api/hooks";
import type { AiPolicyDraftResponse, PolicyDocument, PolicyDocumentType } from "@/lib/api/types";
import { userDisplayName } from "@/lib/api/types";
import { formatInTz } from "@/lib/format";
import { markdownToPlainText, parsePolicyContent } from "@/lib/markdown";
import { PERMISSIONS, SYSTEM_ROLES, holdsBusinessOwnerRole } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";
import { ApiError, toastApiError } from "@/lib/api";

const searchSchema = z.object({
  tab: z.string().optional(),
  /** RECA-512 — open AI policy assist when `1` / `true`. */
  assist: z.union([z.literal("1"), z.literal("true"), z.boolean()]).optional(),
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

const POLICY_TYPE_META: Record<PolicyDocumentType, { label: string; description: string }> = {
  cancellation: {
    label: "Cancellation policy",
    description: "Notice periods, late cancellations and what you charge for them.",
  },
  terms: {
    label: "Terms and conditions",
    description: "The agreement between your business and the people who book with it.",
  },
  privacy: {
    label: "Privacy notice",
    description: "What personal data you collect, why you hold it and for how long.",
  },
  consent_text: {
    label: "Consent wording",
    description: "The text a client agrees to when they confirm a booking.",
  },
  package_terms: {
    label: "Package terms",
    description: "Expiry, transfers and refunds for prepaid packages.",
  },
  dpa: {
    label: "Data processing addendum",
    description: "Controller and processor terms, including subprocessors.",
  },
};

const POLICY_TYPES: PolicyDocumentType[] = [
  "cancellation",
  "terms",
  "privacy",
  "consent_text",
  "package_terms",
  "dpa",
];

function policyLabel(type: string): string {
  return POLICY_TYPE_META[type as PolicyDocumentType]?.label ?? type.replace(/_/g, " ");
}

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
  const navigate = useNavigate({ from: Route.fullPath });
  const business = tenant.business;
  const tab = search.tab ?? "business";
  const assistOpen = search.assist === true || search.assist === "1" || search.assist === "true";

  useEffect(() => {
    if (!search.session_id && !search.checkoutAttemptId) return;
    void navigate({
      to: "/billing/success",
      search: {
        session_id: search.session_id,
        checkoutAttemptId: search.checkoutAttemptId,
      },
    });
  }, [search.session_id, search.checkoutAttemptId, navigate]);

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
        <Tabs
          value={tab}
          onValueChange={(next) => {
            void navigate({
              search: (prev) => ({
                ...prev,
                tab: next,
                assist: next === "policies" ? prev.assist : undefined,
              }),
            });
          }}
        >
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="records">Linked records</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="mt-4">
            <AccountProfileTab />
          </TabsContent>
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
            <PoliciesTab assist={assistOpen} />
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
            <SectionCard title="Recavo subscription">
              <p className="text-sm text-muted-foreground">
                Plans, trial, invoices and cancellation live on the billing page.
              </p>
              <Button className="mt-4 w-fit" asChild>
                <Link to="/billing">Open billing</Link>
              </Button>
            </SectionCard>
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
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AccountProfileTab() {
  const { user } = useAuth();
  const updateMe = useUpdateMe();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user?.firstName, user?.lastName]);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Your profile">
        <div className="grid gap-4">
          <Field
            label="Email"
            value={user?.email ?? ""}
            onChange={() => undefined}
            type="email"
            disabled
            hint="Email can’t be changed here."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={firstName} onChange={setFirstName} />
            <Field label="Last name" value={lastName} onChange={setLastName} />
          </div>
          <Button
            className="w-fit"
            disabled={updateMe.isPending}
            onClick={async () => {
              try {
                await updateMe.mutateAsync({
                  firstName: firstName.trim() || null,
                  lastName: lastName.trim() || null,
                });
                toast.success("Profile updated");
              } catch (err) {
                if (!(err instanceof ApiError)) toastApiError(err);
              }
            }}
          >
            {updateMe.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="How your name appears">
        <p className="text-sm text-muted-foreground">
          Teammates see this on the Team list. Only you can edit your own name.
        </p>
        <p className="mt-4 text-lg font-semibold">{userDisplayName(user, "Add your name")}</p>
        {user?.email ? <p className="mt-1 text-sm text-muted-foreground">{user.email}</p> : null}
      </SectionCard>
      <TwoFactorCard />
    </div>
  );
}

function TwoFactorCard() {
  const { mfaEnrolled, ensureAal2, unenrollMfa, refreshMfaStatus } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshMfaStatus();
  }, [refreshMfaStatus]);

  return (
    <SectionCard
      title="Two-factor authentication"
      description="Privileged actions require a code from an authenticator app once this is on."
    >
      {mfaEnrolled ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            An authenticator app is enrolled on this account.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-fit" disabled={busy}>
                Unenrol
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove two-factor authentication?</AlertDialogTitle>
                <AlertDialogDescription>
                  You’ll need to enter a code from your authenticator app to confirm. Privileged
                  actions will no longer require 2FA until you enrol again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setBusy(true);
                    void unenrollMfa().finally(() => setBusy(false));
                  }}
                >
                  Unenrol
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Add Google Authenticator, 1Password, or Authy so checkout and other privileged
            actions require a code.
          </p>
          <Button
            className="w-fit"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ok = await ensureAal2();
                if (ok) toast.success("Two-factor authentication is on");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : "Enrol authenticator"}
          </Button>
        </div>
      )}
    </SectionCard>
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
  // `src/lib/api/schema.d.ts` is generated from a committed openapi.json that predates
  // this setting, and regenerating it drags in unrelated API drift the portal has yet
  // to absorb. Read and write the one new field through a narrow local shape until the
  // schema is refreshed as its own change.
  const bookingConfig = config?.booking as
    | {
        cancellationWindowHours?: number;
        defaultHoldMinutes?: number;
        requireOnlinePayment?: boolean;
      }
    | undefined;
  const brandingConfig = (
    config as { branding?: { logoUrl?: string | null; accentColour?: string | null } } | undefined
  )?.branding;
  const [staffTerm, setStaffTerm] = useState(config?.terminology?.staff ?? "Staff");
  const [serviceTerm, setServiceTerm] = useState(config?.terminology?.service ?? "Service");
  const [bookingTerm, setBookingTerm] = useState(config?.terminology?.booking ?? "Booking");
  const [linkedTerm, setLinkedTerm] = useState(config?.terminology?.linkedRecord ?? "Record");
  const [holdMinutes, setHoldMinutes] = useState(String(config?.booking?.defaultHoldMinutes ?? 10));
  const [cancelHours, setCancelHours] = useState(
    String(config?.booking?.cancellationWindowHours ?? 24),
  );
  const [requireOnlinePayment, setRequireOnlinePayment] = useState(
    Boolean(bookingConfig?.requireOnlinePayment),
  );
  const [logoUrl, setLogoUrl] = useState(brandingConfig?.logoUrl ?? "");
  const [accentColour, setAccentColour] = useState(brandingConfig?.accentColour ?? "");
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
    setRequireOnlinePayment(Boolean(bookingConfig?.requireOnlinePayment));
    setLogoUrl(brandingConfig?.logoUrl ?? "");
    setAccentColour(brandingConfig?.accentColour ?? "");
    setVatRegistered(Boolean(config?.tax?.vatRegistered));
    setVatNumber(config?.tax?.vatNumber ?? "");
    setClosureDays(String(config?.retention?.closureWindowDays ?? 30));
    setLine1(config?.legalAddress?.line1 ?? "");
    setLine2(config?.legalAddress?.line2 ?? "");
    setCity(config?.legalAddress?.city ?? "");
    setRegion(config?.legalAddress?.region ?? "");
    setPostalCode(config?.legalAddress?.postalCode ?? "");
    setCountry(config?.legalAddress?.country ?? "GB");
  }, [
    config,
    bookingConfig?.requireOnlinePayment,
    brandingConfig?.logoUrl,
    brandingConfig?.accentColour,
  ]);

  const accentValid = accentColour === "" || /^#[0-9a-fA-F]{6}$/.test(accentColour);
  const logoValid = logoUrl === "" || logoUrl.startsWith("https://");

  // Branding has the same generated-schema gap as `requireOnlinePayment` above, so it
  // rides along on a widened patch type until openapi.json is refreshed.
  type ConfigPatch = Parameters<typeof update.mutateAsync>[0] & {
    branding?: { logoUrl: string | null; accentColour: string | null };
  };

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
          <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Take payment online</p>
              <p className="text-xs text-muted-foreground">
                Priced sessions booked on your public page are paid for by card before they're
                confirmed. Needs a connected Stripe account that can accept payments.
              </p>
            </div>
            <Switch checked={requireOnlinePayment} onCheckedChange={setRequireOnlinePayment} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Branding">
        <div className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            Used on the emails your customers receive. Leave either field empty to fall back to
            RECAVO's.
          </p>
          <div className="grid gap-1.5">
            <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} />
            <p className="text-xs text-muted-foreground">
              {logoValid
                ? "Must be a public https link — email apps cannot load private files."
                : "Must start with https://"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="Accent colour" value={accentColour} onChange={setAccentColour} />
              </div>
              <input
                type="color"
                aria-label="Pick accent colour"
                value={accentValid && accentColour ? accentColour : "#019c86"}
                onChange={(event) => setAccentColour(event.target.value)}
                className="size-10 shrink-0 cursor-pointer rounded-lg border bg-background p-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {accentValid ? "Buttons and highlights in your emails." : "Must be a #rrggbb value."}
            </p>
          </div>
          <div className="rounded-xl border bg-background p-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Email preview</p>
            {logoValid && logoUrl ? (
              <img src={logoUrl} alt="" className="mb-2 h-9 w-auto object-contain" />
            ) : (
              <p className="mb-2 text-[17px] font-extrabold uppercase tracking-[0.06em]">
                {tenant.business?.tradingName ?? "Your business"}
              </p>
            )}
            <div
              className="h-[3px] w-11 rounded-sm"
              style={{ background: accentValid && accentColour ? accentColour : "#019c86" }}
            />
            <p className="mt-4 text-base font-bold">Your sessions are ready</p>
            <button
              type="button"
              disabled
              className="mt-3 rounded-[10px] px-6 py-3 text-sm font-semibold text-white"
              style={{ background: accentValid && accentColour ? accentColour : "#019c86" }}
            >
              Book your sessions
            </button>
          </div>
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
            disabled={update.isPending || !accentValid || !logoValid}
            onClick={async () => {
              const patch: ConfigPatch = {
                branding: {
                  logoUrl: logoUrl.trim() || null,
                  accentColour: accentColour.trim().toLowerCase() || null,
                },
                terminology: {
                  staff: staffTerm.trim(),
                  service: serviceTerm.trim(),
                  booking: bookingTerm.trim(),
                  linkedRecord: linkedTerm.trim(),
                },
                booking: {
                  defaultHoldMinutes: Number(holdMinutes) || 10,
                  cancellationWindowHours: Number(cancelHours) || 0,
                  requireOnlinePayment,
                } as NonNullable<Parameters<typeof update.mutateAsync>[0]["booking"]>,
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
              };
              await update.mutateAsync(patch);
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
            {(memberships.data ?? []).map((m) => {
              const name = userDisplayName(m.user, m.user?.email ?? m.userId);
              const email = m.user?.email;
              const isOwner = holdsBusinessOwnerRole(m.roleKeys);
              const roles = isOwner ? "Owner" : (m.roleKeys ?? []).join(", ") || "No roles";
              const subtitle = [email && name !== email ? email : null, roles]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={m.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                  <StatusBadge status={m.status} />
                  {isOwner ? (
                    <p className="w-[160px] text-right text-xs text-muted-foreground">
                      Owner role is fixed
                    </p>
                  ) : (
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
                  )}
                </li>
              );
            })}
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

function PoliciesTab({ assist = false }: { assist?: boolean }) {
  const tenant = useTenant();
  const docs = usePolicyDocuments();
  const createDoc = useCreatePolicyDocument();
  const publishDoc = usePublishPolicyDocument();
  const seed = useSeedPolicyDefaults();
  const aiDraft = useAiDraftPolicies();
  const [type, setType] = useState<PolicyDocumentType>("cancellation");
  const [content, setContent] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [showAssist, setShowAssist] = useState(assist);
  const [aiResult, setAiResult] = useState<AiPolicyDraftResponse | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const config = tenant.configuration;
  const [businessName, setBusinessName] = useState(
    tenant.business?.tradingName || tenant.business?.legalName || "",
  );
  const [cancelHours, setCancelHours] = useState(
    String(config?.booking?.cancellationWindowHours ?? 24),
  );
  const [lateCancelNotes, setLateCancelNotes] = useState("50% of session fee");
  const [refundNotes, setRefundNotes] = useState("Unused packs transferable within 30 days");
  const [locale, setLocale] = useState(tenant.business?.locale || "en-GB");
  const [industryHint, setIndustryHint] = useState(
    tenant.business?.industryTemplateKey?.replaceAll("_", " ") || "personal training",
  );

  const current = useCurrentPolicyDocument(type);
  const { reviewStatus: currentReview, body: currentBody } = parsePolicyContent(
    current.data?.content,
  );

  useEffect(() => {
    if (assist) setShowAssist(true);
  }, [assist]);

  useEffect(() => {
    setBusinessName(tenant.business?.tradingName || tenant.business?.legalName || "");
    setLocale(tenant.business?.locale || "en-GB");
    setIndustryHint(
      tenant.business?.industryTemplateKey?.replaceAll("_", " ") || "personal training",
    );
  }, [
    tenant.business?.tradingName,
    tenant.business?.legalName,
    tenant.business?.locale,
    tenant.business?.industryTemplateKey,
  ]);

  useEffect(() => {
    setCancelHours(String(config?.booking?.cancellationWindowHours ?? 24));
  }, [config?.booking?.cancellationWindowHours]);

  const generateAiDrafts = async () => {
    setAiUnavailable(false);
    try {
      const result = await aiDraft.mutateAsync({
        businessName: businessName.trim() || "Your business",
        cancellationWindowHours: Number(cancelHours) || 24,
        lateCancelNotes: lateCancelNotes.trim() || undefined,
        refundNotes: refundNotes.trim() || undefined,
        locale: locale.trim() || "en-GB",
        industryHint: industryHint.trim() || undefined,
      });
      setAiResult(result);
      toast.success("Drafts ready for review");
    } catch (err) {
      if (isAiPolicyDraftUnavailable(err)) {
        setAiUnavailable(true);
        toast.message("AI drafting isn’t available yet", {
          description:
            "Use Seed defaults for standard cancellation and terms, or write a draft manually.",
        });
        return;
      }
    }
  };

  const publishAiDraft = async (doc: PolicyDocument) => {
    await publishDoc.mutateAsync({ documentId: doc.id });
    toast.success(`${doc.type} published`);
    setAiResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        drafts: {
          ...prev.drafts,
          [doc.type]: { ...doc, status: "published" as const },
        },
      };
    });
  };

  return (
    <div className="space-y-5">
      <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
        {showAssist ? (
          <SectionCard
            title="AI policy assist"
            action={
              <Button size="sm" variant="ghost" onClick={() => setShowAssist(false)}>
                Hide
              </Button>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Answer a few questions and we’ll draft cancellation and terms policies for you to
                review. Nothing is published until you confirm.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ai-biz">Business name</Label>
                  <Input
                    id="ai-biz"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-hours">Cancellation window (hours)</Label>
                  <Input
                    id="ai-hours"
                    type="number"
                    min={0}
                    value={cancelHours}
                    onChange={(e) => setCancelHours(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="ai-late">Late cancel / no-show notes</Label>
                  <Input
                    id="ai-late"
                    value={lateCancelNotes}
                    onChange={(e) => setLateCancelNotes(e.target.value)}
                    placeholder="e.g. 50% of session fee"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="ai-refund">Refund / package notes</Label>
                  <Input
                    id="ai-refund"
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder="e.g. Unused packs transferable within 30 days"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-locale">Locale</Label>
                  <Input
                    id="ai-locale"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    placeholder="en-GB"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-industry">Industry</Label>
                  <Input
                    id="ai-industry"
                    value={industryHint}
                    onChange={(e) => setIndustryHint(e.target.value)}
                    placeholder="personal training"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={aiDraft.isPending} onClick={() => void generateAiDrafts()}>
                  <Sparkles className="size-4" />
                  {aiDraft.isPending ? "Drafting…" : "Draft with AI"}
                </Button>
                <Button
                  variant="outline"
                  disabled={seed.isPending}
                  onClick={async () => {
                    const result = await seed.mutateAsync();
                    toast.success("Defaults seeded", {
                      description: `Published ${result.published.length}, skipped ${result.skipped.length}.`,
                    });
                  }}
                >
                  Seed defaults instead
                </Button>
              </div>
              {aiUnavailable ? (
                <p className="rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  AI drafting isn’t enabled on this environment. Use{" "}
                  <span className="font-medium text-foreground">Seed defaults</span> for standard
                  cancellation and terms, or write drafts manually below.
                </p>
              ) : null}
              {aiResult ? (
                <div className="space-y-4 rounded-xl border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">{aiResult.disclaimer}</p>
                  <p className="text-[11px] text-muted-foreground">Model: {aiResult.model}</p>
                  {(["cancellation", "terms"] as const).map((key) => {
                    const doc = aiResult.drafts[key];
                    const published = doc.status === "published";
                    const draft = parsePolicyContent(doc.content);
                    return (
                      <div key={key} className="space-y-2 rounded-lg border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{policyLabel(key)}</p>
                            <StatusBadge status={doc.status} />
                            {draft.reviewStatus ? (
                              <StatusBadge status={draft.reviewStatus} />
                            ) : null}
                          </div>
                          {!published ? (
                            <Button
                              size="sm"
                              disabled={publishDoc.isPending}
                              onClick={() => void publishAiDraft(doc)}
                            >
                              Publish
                            </Button>
                          ) : null}
                        </div>
                        <Markdown className="max-h-48 overflow-y-auto text-muted-foreground">
                          {draft.body || "—"}
                        </Markdown>
                      </div>
                    );
                  })}
                  {aiResult.drafts.cancellation.status === "draft" ||
                  aiResult.drafts.terms.status === "draft" ? (
                    <Button
                      className="w-fit"
                      disabled={publishDoc.isPending}
                      onClick={async () => {
                        for (const key of ["cancellation", "terms"] as const) {
                          const doc = aiResult.drafts[key];
                          if (doc.status === "draft") await publishAiDraft(doc);
                        }
                      }}
                    >
                      Publish both
                    </Button>
                  ) : (
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      Cancellation and terms are published.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAssist(true)}>
              <Sparkles className="size-4" /> Draft with AI
            </Button>
          </div>
        )}
      </Can>

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
              {(docs.data ?? []).map((doc) => {
                const reviewStatus = parsePolicyContent(doc.content).reviewStatus;
                const summary =
                  POLICY_TYPE_META[doc.type]?.description ||
                  markdownToPlainText(doc.content).slice(0, 120) ||
                  "No content";
                return (
                  <li key={doc.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium">{policyLabel(doc.type)}</p>
                        <span className="text-xs text-muted-foreground">Version {doc.version}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {reviewStatus ? <StatusBadge status={reviewStatus} /> : null}
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
                );
              })}
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
                          {POLICY_TYPE_META[t].label}
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
          <SectionCard title={policyLabel(type)} description={POLICY_TYPE_META[type]?.description}>
            {!current.data ? (
              <p className="text-sm text-muted-foreground">No published document.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Version {current.data.version}
                  </span>
                  <StatusBadge status={current.data.status} />
                  {currentReview ? <StatusBadge status={currentReview} /> : null}
                </div>
                {currentReview === "pending_counsel_review" ? (
                  <p className="text-xs text-muted-foreground">
                    Placeholder wording from the RECAVO template. Have it checked by a solicitor
                    before you rely on it.
                  </p>
                ) : null}
                <Markdown className="max-h-[32rem] overflow-y-auto text-muted-foreground">
                  {currentBody || "—"}
                </Markdown>
              </div>
            )}
          </SectionCard>
        </div>
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
