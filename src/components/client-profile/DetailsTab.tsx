import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ChevronDown, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { CustomerAddressFields } from "@/components/CustomerAddressFields";
import { TableGhost } from "@/components/ghost";
import { TagChips } from "@/components/client-profile/Tags";
import { TonePill } from "@/components/client-profile/parts";
import {
  GroupedBlock,
  SettingsRow,
  SettingsSection,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiError } from "@/lib/api";
import {
  useAnonymiseCustomer,
  useCustomerConsents,
  useCustomerDsarExport,
  useLinkCustomerPortal,
  useRecordCustomerConsent,
  useUpdateCustomer,
  type CustomerUpdateBody,
} from "@/lib/api/hooks";
import { customerDisplayName, type ConsentRecord, type Customer } from "@/lib/api/types";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { looksLikeEmail, toE164 } from "@/lib/client-journey";
import {
  isMaskedContact,
  longDate,
  shortDate,
  splitE164,
  type DetailsSection,
} from "@/lib/client-profile";
import { defaultDiallingCode } from "@/lib/clients-list";
import { addressToForm, formToAddress, type AddressFormState } from "@/lib/customers/address-form";
import { cn } from "@/lib/utils";

const DIALLING_CODES: { code: string; label: string }[] = [
  { code: "44", label: "UK +44" },
  { code: "353", label: "IE +353" },
  { code: "1", label: "US/CA +1" },
  { code: "61", label: "AU +61" },
  { code: "64", label: "NZ +64" },
  { code: "33", label: "FR +33" },
  { code: "49", label: "DE +49" },
  { code: "34", label: "ES +34" },
  { code: "351", label: "PT +351" },
  { code: "31", label: "NL +31" },
  { code: "39", label: "IT +39" },
  { code: "27", label: "ZA +27" },
  { code: "971", label: "AE +971" },
];

type Channel = Customer["contactPreferences"]["preferredChannel"];

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "sms", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "none", label: "None" },
];

type Form = {
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  phone: { code: string; national: string };
  preferredChannel: Channel;
  address: AddressFormState;
};

type FieldKey = keyof Form;

const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: "first name",
  lastName: "last name",
  nickname: "known as",
  email: "email",
  phone: "mobile",
  preferredChannel: "channel",
  address: "address",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function baseForm(client: Customer, fallbackCode: string): Form {
  return {
    firstName: client.firstName,
    lastName: client.lastName ?? "",
    nickname: client.nickname ?? "",
    email: client.emailDisplay ?? "",
    phone: splitE164(
      client.phoneDisplay,
      DIALLING_CODES.map((d) => d.code),
      fallbackCode,
    ),
    preferredChannel: client.contactPreferences.preferredChannel,
    address: addressToForm(client.address),
  };
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="text-xs text-destructive">{children}</p> : null;
}

function marketingLine(client: Customer, timezone: string): string {
  const mc = client.marketingConsent;
  if (!mc.updatedAt) return "Never asked";
  return `${mc.granted ? "Agreed" : "Said no"} ${longDate(mc.updatedAt, timezone)}`;
}

const CONSENT_SOURCE_LABELS: Record<string, string> = {
  staff_console: "recorded by your team",
  booking_flow: "when booking online",
  portal: "in the client portal",
  import: "from an import",
};

function consentLine(c: ConsentRecord, timezone: string): string {
  const channel = c.channel.charAt(0).toUpperCase() + c.channel.slice(1);
  const source = c.source ? (CONSENT_SOURCE_LABELS[c.source] ?? c.source.replace(/_/g, " ")) : null;
  return [channel, c.granted ? "granted" : "withdrawn", source, shortDate(c.recordedAt, timezone)]
    .filter(Boolean)
    .join(" · ");
}

/** The list, plus the manual record form the old Consents tab had. */
function ConsentHistoryDialog({
  customerId,
  open,
  onOpenChange,
  timezone,
  canEdit,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  canEdit: boolean;
}) {
  const consents = useCustomerConsents(open ? customerId : undefined);
  const record = useRecordCustomerConsent(customerId);
  const [manualOpen, setManualOpen] = useState(false);
  const [channel, setChannel] = useState("email");
  const [granted, setGranted] = useState(true);
  const [source, setSource] = useState("staff_console");
  const list = [...(consents.data ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Consent history</DialogTitle>
          <DialogDescription>
            Every time consent was given or withdrawn, newest first.
          </DialogDescription>
        </DialogHeader>
        {consents.isLoading ? (
          <div className="overflow-hidden rounded-xl border">
            <TableGhost rows={3} />
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>{consentLine(c, timezone)}</span>
                <TonePill tone={c.granted ? "green" : "grey"}>
                  {c.granted ? "Granted" : "Withdrawn"}
                </TonePill>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div className="rounded-xl border">
            <button
              type="button"
              onClick={() => setManualOpen((o) => !o)}
              aria-expanded={manualOpen}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left text-sm font-semibold"
            >
              Record consent by hand
              <ChevronDown
                className={cn("size-4 transition-transform", manualOpen && "rotate-180")}
              />
            </button>
            {manualOpen ? (
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="consent-channel">Channel</Label>
                  <Input
                    id="consent-channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="consent-source">Source</Label>
                  <Input
                    id="consent-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-3 sm:col-span-2">
                  <Switch checked={granted} onCheckedChange={setGranted} />
                  <span className="text-sm">{granted ? "Granted" : "Withdrawn"}</span>
                </label>
                <Button
                  className="sm:col-span-2 sm:w-fit"
                  disabled={record.isPending}
                  onClick={async () => {
                    if (!channel.trim()) return toast.error("Add a channel first");
                    await record.mutateAsync({
                      channel: channel.trim(),
                      granted,
                      source: source.trim() || null,
                    });
                    toast.success("Consent recorded");
                  }}
                >
                  {record.isPending ? "Recording…" : "Record consent"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Kept from the old Portal tab: link to a portal account someone already has, by its user ID. */
function PortalLinkByIdForm({ client }: { client: Customer }) {
  const link = useLinkCustomerPortal(client.id);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-foreground/70 hover:text-foreground"
      >
        Link an existing portal account
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-3 grid gap-2 sm:max-w-lg">
          <Label htmlFor="portal-user">Portal user ID</Label>
          <div className="flex gap-2">
            <Input
              id="portal-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            <Button
              variant="outline"
              disabled={link.isPending}
              onClick={async () => {
                if (!userId.trim()) return toast.error("Paste the portal user ID first");
                await link.mutateAsync(userId.trim());
                setUserId("");
                toast.success("Portal account linked");
              }}
            >
              {link.isPending ? "Linking…" : "Link"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            For support use. Ask RECAVO support for the ID if you need it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DetailsTab({
  client,
  timezone,
  canEdit,
  canExport,
  section,
  sectionKey,
  onArchive,
  onReactivate,
  onDirtyChange,
  onRefresh,
}: {
  client: Customer;
  timezone: string;
  canEdit: boolean;
  canExport: boolean;
  /** Section to scroll to on arrival (old `?tab=privacy` links and the like). */
  section?: DetailsSection;
  /** Changes each time the page asks for a scroll to `section`. */
  sectionKey: number;
  onArchive?: () => void;
  onReactivate?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onRefresh: () => void;
}) {
  const update = useUpdateCustomer();
  const quickUpdate = useUpdateCustomer();
  const consents = useCustomerConsents(client.id);
  const recordConsent = useRecordCustomerConsent(client.id);
  const dsarExport = useCustomerDsarExport(client.id);
  const anonymise = useAnonymiseCustomer(client.id);
  const smsCredits = useSmsCreditsSummary();
  const [remindersSaved, flashReminders] = useSavedTick();
  const [marketingSaved, flashMarketing] = useSavedTick();

  const fallbackCode = defaultDiallingCode(timezone);
  const base = useMemo(() => baseForm(client, fallbackCode), [client, fallbackCode]);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [consentsOpen, setConsentsOpen] = useState(false);
  const [confirmDsar, setConfirmDsar] = useState(false);
  const [confirmAnonymise, setConfirmAnonymise] = useState(false);
  const [anonymiseName, setAnonymiseName] = useState("");

  const value = <K extends FieldKey>(k: K): Form[K] => (edits[k] ?? base[k]) as Form[K];
  const set = <K extends FieldKey>(k: K, v: Form[K]) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (same(v, base[k])) delete next[k];
      else next[k] = v;
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const changed = (Object.keys(edits) as FieldKey[]).filter((k) => !same(edits[k], base[k]));
  const dirty = canEdit && changed.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirtyRef.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  useEffect(() => {
    if (!section) return;
    const el = document.getElementById(`details-${section}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section, sectionKey]);

  const emailMasked = isMaskedContact(client.emailDisplay);
  const phoneMasked = isMaskedContact(client.phoneDisplay);
  const disabled = !canEdit;
  const firstName = client.firstName;

  const validate = (): Partial<Record<string, string>> => {
    const next: Partial<Record<string, string>> = {};
    if (!value("firstName").trim()) next.firstName = "Add a first name.";
    if (value("nickname").trim().length > 80) next.nickname = "Keep it to 80 characters.";
    if (changed.includes("email") && value("email").trim() && !looksLikeEmail(value("email"))) {
      next.email = "Enter a full email address, like name@example.co.uk.";
    }
    const phone = value("phone");
    if (changed.includes("phone") && phone.national.trim() && !toE164(phone.national, phone.code)) {
      next.phone = "Enter a mobile number, like 07700 900123.";
    }
    return next;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    const problems = Object.values(found).filter(Boolean) as string[];
    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0]! : "A few things need fixing", {
        description: problems.length === 1 ? undefined : problems.join(" "),
      });
      return;
    }
    const body: CustomerUpdateBody = {};
    for (const k of changed) {
      if (k === "firstName") body.firstName = value("firstName").trim();
      if (k === "lastName") body.lastName = value("lastName").trim() || null;
      if (k === "nickname") body.nickname = value("nickname").trim() || null;
      if (k === "email" && !emailMasked) body.email = value("email").trim() || null;
      if (k === "phone" && !phoneMasked) {
        const p = value("phone");
        body.phone = p.national.trim() ? toE164(p.national, p.code) : null;
      }
      if (k === "preferredChannel") body.preferredChannel = value("preferredChannel");
      if (k === "address") body.address = formToAddress(value("address"));
    }
    try {
      await update.mutateAsync({ customerId: client.id, version: client.version, body });
      setEdits({});
      toast.success("Details saved");
    } catch (err) {
      if (!(err instanceof ApiError)) return;
      if (err.isConflict) {
        toast.error("This client was updated elsewhere", {
          description: "Refresh to see their changes. Your edits are kept.",
          action: { label: "Refresh", onClick: onRefresh },
        });
        return;
      }
      const next: Record<string, string> = {};
      for (const fe of err.fieldErrors) {
        if (fe.field) next[fe.field] = fe.message || fe.code || "Invalid";
      }
      setErrors(next);
    }
  };

  const saveReminders = async (on: boolean) => {
    await quickUpdate.mutateAsync({
      customerId: client.id,
      version: client.version,
      body: { operationalNotifications: on },
    });
    flashReminders();
  };

  const saveMarketing = async (granted: boolean) => {
    const startedAt = Date.now();
    await quickUpdate.mutateAsync({
      customerId: client.id,
      version: client.version,
      body: { marketingConsent: granted, marketingConsentSource: "staff_console" },
    });
    flashMarketing();
    // Only write a consent record when the API didn't already log one for this change.
    const fresh = await consents.refetch();
    const logged = (fresh.data ?? []).some(
      (c) =>
        c.channel === "marketing" &&
        c.granted === granted &&
        Date.parse(c.recordedAt) >= startedAt - 60_000,
    );
    if (!logged) {
      await recordConsent.mutateAsync({ channel: "marketing", granted, source: "staff_console" });
    }
  };

  const downloadDsar = async () => {
    const data = await dsarExport.mutateAsync();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dsar-${client.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data export downloaded");
    setConfirmDsar(false);
  };

  const phone = value("phone");
  const channel = value("preferredChannel");

  return (
    <div className="pb-24">
      {disabled ? (
        <p className="mb-6 rounded-xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          Only an admin can change these details.
        </p>
      ) : null}

      <div className="divide-y">
        <SettingsSection title="Name" help="First name is the only thing needed.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="d-first">First name</Label>
              <Input
                id="d-first"
                value={value("firstName")}
                disabled={disabled}
                aria-invalid={Boolean(errors.firstName) || undefined}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="off"
              />
              <FieldError>{errors.firstName}</FieldError>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-last">Last name</Label>
              <Input
                id="d-last"
                value={value("lastName")}
                disabled={disabled}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="off"
              />
              <FieldError>{errors.lastName}</FieldError>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="d-nickname">
                Known as{" "}
                <span className="font-normal text-muted-foreground">
                  · only your team sees this
                </span>
              </Label>
              <Input
                id="d-nickname"
                value={value("nickname")}
                maxLength={80}
                disabled={disabled}
                aria-invalid={Boolean(errors.nickname) || undefined}
                onChange={(e) => set("nickname", e.target.value)}
                placeholder="e.g. Dave – red Audi"
                autoComplete="off"
              />
              <FieldError>{errors.nickname}</FieldError>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Contact" help="Used for confirmations and reminders.">
          <div className="grid gap-2">
            <Label htmlFor="d-email">Email</Label>
            <Input
              id="d-email"
              type="email"
              inputMode="email"
              value={value("email")}
              disabled={disabled || emailMasked}
              readOnly={emailMasked}
              aria-invalid={Boolean(errors.email) || undefined}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@example.co.uk"
              autoComplete="off"
            />
            {emailMasked ? (
              <p className="text-xs text-muted-foreground">Hidden for your role</p>
            ) : (
              <FieldError>{errors.email}</FieldError>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-phone">Mobile</Label>
            {phoneMasked ? (
              <Input id="d-phone" value={client.phoneDisplay ?? ""} disabled readOnly />
            ) : (
              <div className="flex gap-2">
                <Select
                  value={phone.code}
                  disabled={disabled}
                  onValueChange={(code) => set("phone", { ...phone, code })}
                >
                  <SelectTrigger className="w-[112px] shrink-0" aria-label="Country code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIALLING_CODES.map((d) => (
                      <SelectItem key={d.code} value={d.code}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="d-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone.national}
                  disabled={disabled}
                  aria-invalid={Boolean(errors.phone) || undefined}
                  onChange={(e) => set("phone", { ...phone, national: e.target.value })}
                  placeholder="07700 900123"
                  autoComplete="off"
                />
              </div>
            )}
            {phoneMasked ? (
              <p className="text-xs text-muted-foreground">Hidden for your role</p>
            ) : (
              <FieldError>{errors.phone}</FieldError>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="How they hear from you"
          help={
            smsCredits.level === "unlimited" ? "Texts are included on your plan." : smsCredits.note
          }
        >
          <div className="grid gap-2">
            <p id="d-channel-label" className="text-sm font-semibold">
              Preferred channel
            </p>
            <div
              role="radiogroup"
              aria-labelledby="d-channel-label"
              className="grid grid-cols-4 gap-2 sm:max-w-md"
            >
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={channel === c.value}
                  disabled={disabled}
                  onClick={() => set("preferredChannel", c.value)}
                  className={cn(
                    "h-10 cursor-pointer rounded-[10px] border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60",
                    channel === c.value
                      ? "border-ring bg-primary-soft text-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {channel === "sms" ? (
              <p className="text-xs text-muted-foreground">
                Texts need a mobile number. Reminders go by email until one is saved.
              </p>
            ) : null}
            <FieldError>{errors.preferredChannel}</FieldError>
          </div>
          <GroupedBlock>
            <SwitchRow
              id="d-reminders"
              label="Booking reminders and updates"
              hint="Confirmations, reminders and changes to their bookings."
              checked={client.contactPreferences.operationalNotifications}
              disabled={disabled || quickUpdate.isPending}
              saved={remindersSaved}
              onCheckedChange={(on) => void saveReminders(on)}
            />
            <SwitchRow
              id="d-marketing"
              label="Marketing"
              hint={marketingLine(client, timezone)}
              checked={client.marketingConsent.granted}
              disabled={disabled || quickUpdate.isPending}
              saved={marketingSaved}
              onCheckedChange={(on) => void saveMarketing(on)}
            />
          </GroupedBlock>
        </SettingsSection>

        <SettingsSection title="Address" help="Handy for mobile jobs and invoices.">
          <CustomerAddressFields
            idPrefix="d-addr"
            value={value("address")}
            onChange={(a) => set("address", a)}
            disabled={disabled}
          />
        </SettingsSection>

        <SettingsSection
          id="details-tags"
          title="Tags"
          help="Group clients for filters and messages."
        >
          <TagChips customerId={client.id} canEdit={canEdit} emptyText="No tags yet" />
        </SettingsSection>

        <SettingsSection
          id="details-portal"
          title="Client portal"
          help={`Lets ${firstName} see bookings, credits and offers.`}
        >
          <GroupedBlock>
            <SettingsRow
              label={client.userId ? "Signed up" : "Not signed up yet"}
              hint={
                client.userId
                  ? `${firstName} has a portal account linked to this profile.`
                  : `${firstName} can create an account from your booking page with their email address.`
              }
            >
              {client.userId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(client.userId!);
                    toast.success("Portal user ID copied");
                  }}
                >
                  <Copy className="size-4" /> Copy ID
                </Button>
              ) : null}
            </SettingsRow>
          </GroupedBlock>
          {canEdit ? <PortalLinkByIdForm client={client} /> : null}
        </SettingsSection>

        <SettingsSection
          id="details-privacy"
          title="Privacy"
          help="Consent history, data export and removal."
        >
          <GroupedBlock>
            <SettingsRow label="Consent history" hint="Marketing and notice consents on record.">
              <Button variant="outline" size="sm" onClick={() => setConsentsOpen(true)}>
                View
              </Button>
            </SettingsRow>
            {canExport ? (
              <SettingsRow
                label="Export their data"
                hint="Download everything you hold about them as a file."
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dsarExport.isPending}
                  onClick={() => setConfirmDsar(true)}
                >
                  <Download className="size-4" /> Export
                </Button>
              </SettingsRow>
            ) : null}
            {canEdit ? (
              <SettingsRow
                label="Anonymise"
                hint="Removes their personal details for good. Bookings and payments stay for your records."
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setAnonymiseName("");
                    setConfirmAnonymise(true);
                  }}
                >
                  Anonymise
                </Button>
              </SettingsRow>
            ) : null}
          </GroupedBlock>
        </SettingsSection>

        {onArchive || onReactivate ? (
          <SettingsSection
            title="Archive"
            help={`Hides ${firstName} from the client list. Bookings and history stay.`}
          >
            <div>
              {client.status === "archived" ? (
                <Button variant="outline" onClick={onReactivate}>
                  Reactivate
                </Button>
              ) : (
                <Button variant="outline" onClick={onArchive}>
                  Archive
                </Button>
              )}
            </div>
          </SettingsSection>
        ) : null}
      </div>

      <div
        aria-hidden={!dirty}
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-40 flex justify-center px-4 transition-all duration-200",
          dirty ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div
          role="status"
          aria-label="Unsaved changes"
          className={cn(
            "flex items-center gap-2 rounded-full border bg-card py-1.5 pr-1.5 pl-4 shadow-[0_8px_30px_rgba(16,23,42,0.18)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
            dirty && "pointer-events-auto",
          )}
        >
          <span
            className="text-sm font-medium"
            title={changed.map((k) => FIELD_LABELS[k]).join(", ")}
          >
            {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={update.isPending}
            onClick={() => {
              setEdits({});
              setErrors({});
            }}
          >
            Discard
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={update.isPending}
            onClick={() => void save()}
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You've changed {firstName}'s details without saving. Leaving now loses them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEdits({});
                blocker.proceed?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConsentHistoryDialog
        customerId={client.id}
        open={consentsOpen}
        onOpenChange={setConsentsOpen}
        timezone={timezone}
        canEdit={canEdit}
      />

      <AlertDialog open={confirmDsar} onOpenChange={setConfirmDsar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export {customerDisplayName(client)}'s data?</AlertDialogTitle>
            <AlertDialogDescription>
              This downloads everything you hold about them as a JSON file, for a data request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={dsarExport.isPending}
              onClick={(e) => {
                e.preventDefault();
                void downloadDsar();
              }}
            >
              {dsarExport.isPending ? "Exporting…" : "Export"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAnonymise} onOpenChange={setConfirmAnonymise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise this client?</AlertDialogTitle>
            <AlertDialogDescription>
              This is irreversible. Personal details will be stripped and further edits will be
              disabled. Type <strong>{firstName}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={anonymiseName}
            onChange={(e) => setAnonymiseName(e.target.value)}
            aria-label={`Type ${firstName} to confirm`}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep client</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                anonymise.isPending ||
                anonymiseName.trim().toLowerCase() !== firstName.trim().toLowerCase()
              }
              onClick={async (e) => {
                e.preventDefault();
                setEdits({});
                await anonymise.mutateAsync();
                toast.success("Client anonymised");
                setConfirmAnonymise(false);
              }}
            >
              {anonymise.isPending ? "Anonymising…" : "Anonymise"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
