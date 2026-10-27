import {
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { activeSortedFields, type LinkedRecordField } from "@/components/LinkedRecordDialogs";
import {
  useCreateCustomer,
  useCustomers,
  useCustomerTagsCatalogue,
  useLinkedRecordDefinition,
  useSaveNewClientExtras,
} from "@/lib/api/hooks";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { looksLikeEmail, toE164 } from "@/lib/client-journey";
import {
  defaultDiallingCode,
  defaultReminderChannel,
  DUPLICATE_REASON_LABELS,
  findDuplicateClient,
  reminderChannelHint,
  type DuplicateMatch,
  type ReminderChannel,
} from "@/lib/clients-list";
import { EMPTY_ADDRESS, formToAddress, type AddressFormState } from "@/lib/customers/address-form";
import { formatInTz } from "@/lib/format";
import { buildQuickAddRecord, hasQuickAddInput, quickAddFields } from "@/lib/quick-add-record";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

// Lazy: the booking form opens this drawer itself, so a static import would be circular.
const AddBookingModal = lazy(() =>
  import("@/components/AddBookingModal").then((m) => ({ default: m.AddBookingModal })),
);

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

const CHANNELS: { value: ReminderChannel; label: string }[] = [
  { value: "sms", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "none", label: "None" },
];

type MoreRow = "address" | "tags" | "notes" | "vehicle";

/**
 * The add-client drawer. Also opened over the top of the Add booking, waitlist and
 * reminder forms via their "+" — pass `onCreated` there so the new client lands
 * straight in the picker, the toast doesn't offer to navigate away from the
 * half-filled form, and "Add and book" is hidden (it's already a booking).
 */
export function AddClientDialog({
  open,
  onClose,
  onCreated,
  openProfileOnCreate = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
  /** After "Add client", go to the new client's profile (the Clients page does). */
  openProfileOnCreate?: boolean;
}) {
  const navigate = useNavigate();
  const tenant = useTenant();
  const timezone = tenant.business?.defaultTimezone ?? "Europe/London";
  const smsCredits = useSmsCreditsSummary();
  const createCustomer = useCreateCustomer();
  const saveExtras = useSaveNewClientExtras();
  const customers = useCustomers({ enabled: open });
  const tagCatalogue = useCustomerTagsCatalogue({ status: "active" });
  const linkedRecordDefinition = useLinkedRecordDefinition();
  const recordTerm = tenant.terminology.linkedRecord || "Vehicle";
  const recordFields = useMemo(
    () =>
      quickAddFields(
        activeSortedFields(
          (linkedRecordDefinition.data?.fields ?? []) as unknown as LinkedRecordField[],
        ),
      ),
    [linkedRecordDefinition.data],
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [diallingCode, setDiallingCode] = useState(() => defaultDiallingCode(timezone));
  const [phone, setPhone] = useState("");
  const [chosenChannel, setChosenChannel] = useState<ReminderChannel | null>(null);
  const [operationalNotifications, setOperationalNotifications] = useState(true);
  const [address, setAddress] = useState<AddressFormState>(EMPTY_ADDRESS);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [note, setNote] = useState("");
  const [recordValues, setRecordValues] = useState<Record<string, string>>({});
  const [openRows, setOpenRows] = useState<Set<MoreRow>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [duplicate, setDuplicate] = useState<DuplicateMatch<Customer> | null>(null);
  const [peek, setPeek] = useState<Customer | null>(null);
  const [saving, setSaving] = useState<"add" | "book" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [bookFor, setBookFor] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const phoneE164 = phone.trim() ? toE164(phone, diallingCode) : null;
  const hasMobile = Boolean(phoneE164);
  const channel = chosenChannel ?? defaultReminderChannel(smsCredits.canText, hasMobile);
  const hint = reminderChannelHint(
    channel,
    {
      canText: smsCredits.canText,
      unlimited: smsCredits.level === "unlimited",
      balance: smsCredits.credits?.balance ?? null,
    },
    hasMobile,
  );

  const addressTouched = Object.values(address).some((v) => v.trim());
  const dirty = Boolean(
    firstName.trim() ||
    lastName.trim() ||
    nickname.trim() ||
    email.trim() ||
    phone.trim() ||
    addressTouched ||
    tags.length > 0 ||
    tagInput.trim() ||
    note.trim() ||
    hasQuickAddInput(recordValues),
  );

  const reset = () => {
    setFirstName("");
    setLastName("");
    setNickname("");
    setEmail("");
    setDiallingCode(defaultDiallingCode(timezone));
    setPhone("");
    setChosenChannel(null);
    setOperationalNotifications(true);
    setAddress(EMPTY_ADDRESS);
    setTags([]);
    setTagInput("");
    setNote("");
    setRecordValues({});
    setOpenRows(new Set());
    setErrors({});
    setDuplicate(null);
  };

  const close = () => {
    onClose();
    reset();
  };
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else close();
  };

  const checkDuplicate = (
    next: Partial<{ email: string; phoneE164: string | null; first: string; last: string }> = {},
  ) => {
    setDuplicate(
      findDuplicateClient(customers.data?.items ?? [], {
        email: next.email ?? (looksLikeEmail(email) ? email : ""),
        phoneE164: next.phoneE164 !== undefined ? next.phoneE164 : phoneE164,
        firstName: next.first ?? firstName,
        lastName: next.last ?? lastName,
      }),
    );
  };

  const validateEmail = () => {
    const bad = email.trim() !== "" && !looksLikeEmail(email);
    setErrors((e) => ({
      ...e,
      email: bad ? "That doesn't look like an email address." : undefined,
    }));
    return !bad;
  };
  const validatePhone = () => {
    const bad = phone.trim() !== "" && !phoneE164;
    setErrors((e) => ({
      ...e,
      phone: bad ? "That doesn't look like a mobile number." : undefined,
    }));
    return !bad;
  };

  const addTag = (raw: string) => {
    const name = raw.trim().replace(/,$/, "").trim();
    if (!name) return;
    setTags((list) =>
      list.some((t) => t.toLowerCase() === name.toLowerCase()) ? list : [...list, name],
    );
    setTagInput("");
  };
  const tagSuggestions = (tagCatalogue.data ?? [])
    .filter((t) => !tags.some((x) => x.toLowerCase() === t.name.toLowerCase()))
    .filter((t) => !tagInput.trim() || t.nameNormalised.includes(tagInput.trim().toLowerCase()))
    .slice(0, 8);

  const toggleRow = (row: MoreRow) =>
    setOpenRows((s) => {
      const next = new Set(s);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });

  const submit = async (mode: "add" | "book") => {
    if (!firstName.trim()) {
      setErrors((e) => ({ ...e, firstName: "Add a first name." }));
      firstRef.current?.focus();
      return;
    }
    const emailOk = validateEmail();
    const phoneOk = validatePhone();
    if (!emailOk) {
      emailRef.current?.focus();
      return;
    }
    if (!phoneOk) {
      phoneRef.current?.focus();
      return;
    }
    const built = hasQuickAddInput(recordValues)
      ? buildQuickAddRecord(recordFields, recordValues, recordTerm)
      : null;
    if (built?.kind === "invalid") {
      setOpenRows((s) => new Set(s).add("vehicle"));
      const missing = recordFields.find((f) => built.errors[f.fieldKey]);
      setErrors((e) => ({ ...e, record: `${missing?.label ?? "A field"} is required.` }));
      return;
    }
    const pendingTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags;

    setSaving(mode);
    try {
      const { customer, possibleDuplicates } = await createCustomer.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        nickname: nickname.trim() || null,
        address: formToAddress({ ...address, postcode: address.postcode.toUpperCase() }),
        email: email.trim() || null,
        phone: phoneE164,
        preferredChannel: channel,
        operationalNotifications,
      });
      const extras =
        pendingTags.length > 0 || note.trim() || built?.kind === "ok"
          ? await saveExtras.mutateAsync({
              customerId: customer.id,
              tags: pendingTags,
              note,
              record:
                built?.kind === "ok"
                  ? { displayLabel: built.displayLabel, values: built.values }
                  : null,
            })
          : { failed: [] as string[] };

      onCreated?.(customer);
      const name = customerDisplayName(customer);
      const leavesForm = Boolean(onCreated);
      if (possibleDuplicates.length > 0) {
        const first = possibleDuplicates[0]!;
        toast.warning(
          `Client added — ${possibleDuplicates.length} similar ${
            possibleDuplicates.length === 1 ? "record" : "records"
          } already exist`,
          {
            description: `Did you mean ${customerDisplayName(first)}? Check you haven't created a duplicate.`,
            action: leavesForm
              ? undefined
              : {
                  label: "View match",
                  onClick: () =>
                    void navigate({ to: "/clients/$clientId", params: { clientId: first.id } }),
                },
          },
        );
      } else {
        toast.success(`${name} added`, {
          action:
            leavesForm || openProfileOnCreate || mode === "book"
              ? undefined
              : {
                  label: "Open",
                  onClick: () =>
                    void navigate({ to: "/clients/$clientId", params: { clientId: customer.id } }),
                },
        });
      }
      if (extras.failed.length > 0) {
        const what = extras.failed
          .map((f) => (f === "record" ? recordTerm.toLowerCase() : f))
          .join(" and ");
        toast.error(`Couldn't save the ${what}`, {
          description: `${name} was added. Add the ${what} from their profile.`,
        });
      }
      close();
      if (mode === "book") setBookFor(customer.id);
      else if (openProfileOnCreate && !leavesForm) {
        void navigate({ to: "/clients/$clientId", params: { clientId: customer.id } });
      }
    } catch {
      // useCreateCustomer has already toasted the API's reason; keep the form as typed.
    } finally {
      setSaving(null);
    }
  };

  const onChannelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const i = CHANNELS.findIndex((c) => c.value === channel);
    const next = CHANNELS[(i + step + CHANNELS.length) % CHANNELS.length]!;
    setChosenChannel(next.value);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-channel="${next.value}"]`)?.focus();
  };

  const duplicateBox = (reason: DuplicateMatch<Customer>["reason"]) =>
    duplicate?.reason === reason ? (
      <div
        role="status"
        className="flex items-start justify-between gap-3 rounded-[10px] border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] text-warning-foreground"
      >
        <p>
          <span className="font-bold">
            {customerDisplayName(duplicate.customer)} may already be a client.
          </span>{" "}
          {DUPLICATE_REASON_LABELS[reason]}, added{" "}
          {formatInTz(duplicate.customer.createdAt, timezone, { day: "numeric", month: "short" })}.
        </p>
        <button
          type="button"
          className="shrink-0 cursor-pointer font-bold underline-offset-2 hover:underline"
          onClick={() => setPeek(duplicate.customer)}
        >
          View
        </button>
      </div>
    ) : null;

  const busy = saving !== null;
  const showVehicle = recordFields.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
        <DiscardChangesDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          what="this client"
          onDiscard={() => {
            setConfirmDiscard(false);
            close();
          }}
        />
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[22px] font-extrabold tracking-tight">
              Add client
            </DialogTitle>
            <DialogDescription>
              Only a first name is needed. Add the rest now or later.
            </DialogDescription>
          </DialogHeader>

          <form
            id="add-client-form"
            className="grid gap-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit("add");
            }}
          >
            <Section title="Name">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="c-first"
                  label={
                    <>
                      First name <span className="text-destructive">*</span>
                    </>
                  }
                  error={errors.firstName}
                >
                  <Input
                    ref={firstRef}
                    id="c-first"
                    autoFocus
                    value={firstName}
                    aria-required
                    aria-invalid={Boolean(errors.firstName) || undefined}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((x) => ({ ...x, firstName: undefined }));
                    }}
                    onBlur={() => checkDuplicate()}
                    placeholder="Harriet"
                    autoComplete="off"
                  />
                </Field>
                <Field id="c-last" label="Last name">
                  <Input
                    id="c-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onBlur={() => checkDuplicate()}
                    placeholder="Cole"
                    autoComplete="off"
                  />
                </Field>
              </div>
              {duplicateBox("name")}
              <Field
                id="c-nickname"
                label={
                  <>
                    Known as{" "}
                    <span className="font-normal text-muted-foreground">
                      · only your team sees this
                    </span>
                  </>
                }
              >
                <Input
                  id="c-nickname"
                  value={nickname}
                  maxLength={80}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Harriet, red Audi"
                  autoComplete="off"
                />
              </Field>
            </Section>

            <Section title="Contact">
              <Field id="c-email" label="Email" error={errors.email}>
                <Input
                  ref={emailRef}
                  id="c-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  aria-invalid={Boolean(errors.email) || undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
                  }}
                  onBlur={() => {
                    if (validateEmail()) checkDuplicate();
                  }}
                  placeholder="harriet.cole@example.co.uk"
                  autoComplete="off"
                />
              </Field>
              {duplicateBox("email")}
              <Field id="c-phone" label="Mobile" error={errors.phone}>
                <div className="flex gap-2">
                  <Select
                    value={diallingCode}
                    onValueChange={(v) => {
                      setDiallingCode(v);
                      if (phone.trim()) {
                        const next = toE164(phone, v);
                        setErrors((x) => ({
                          ...x,
                          phone: next ? undefined : x.phone,
                        }));
                        checkDuplicate({ phoneE164: next });
                      }
                    }}
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
                    ref={phoneRef}
                    id="c-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    aria-invalid={Boolean(errors.phone) || undefined}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((x) => ({ ...x, phone: undefined }));
                    }}
                    onBlur={() => {
                      if (validatePhone()) checkDuplicate();
                    }}
                    placeholder="07700 900123"
                    autoComplete="off"
                  />
                </div>
              </Field>
              {duplicateBox("mobile")}
            </Section>

            <Section title="How they hear from you">
              <div className="grid gap-2">
                <p id="c-channel-label" className="text-sm font-semibold">
                  Preferred channel
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby="c-channel-label"
                  className="grid grid-cols-4 gap-2"
                  onKeyDown={onChannelKey}
                >
                  {CHANNELS.map((c) => {
                    const selected = c.value === channel;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-channel={c.value}
                        onClick={() => setChosenChannel(c.value)}
                        className={cn(
                          "h-10 cursor-pointer rounded-[10px] border text-sm font-semibold transition-colors max-sm:h-11",
                          selected
                            ? "border-ring bg-primary-soft font-bold text-foreground"
                            : "bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <p
                  className={cn(
                    "text-[12.5px]",
                    hint.warn ? "text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {hint.text}
                </p>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border bg-background p-3">
                <span>
                  <span className="block text-sm font-semibold">Booking reminders and updates</span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    Confirmations, reminders and changes to their bookings
                  </span>
                </span>
                <Switch
                  checked={operationalNotifications}
                  onCheckedChange={setOperationalNotifications}
                />
              </label>
            </Section>

            <section className="grid gap-2">
              <h3 className="text-[15px] font-extrabold">
                More <span className="font-semibold text-muted-foreground">(optional)</span>
              </h3>
              <div className="divide-y overflow-hidden rounded-[14px] border bg-secondary/30">
                <MoreRowShell
                  id="address"
                  title="Address"
                  hint="Handy for mobile jobs and invoices"
                  open={openRows.has("address")}
                  onToggle={() => toggleRow("address")}
                  filled={addressTouched}
                >
                  <div className="grid gap-2">
                    <Input
                      aria-label="Address line 1"
                      placeholder="Line 1"
                      value={address.line1}
                      onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                      autoComplete="off"
                    />
                    <Input
                      aria-label="Address line 2"
                      placeholder="Line 2"
                      value={address.line2}
                      onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                      autoComplete="off"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label="Town or city"
                        placeholder="Town or city"
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        autoComplete="off"
                      />
                      <Input
                        aria-label="County or region"
                        placeholder="County or region"
                        value={address.region}
                        onChange={(e) => setAddress({ ...address, region: e.target.value })}
                        autoComplete="off"
                      />
                      <Input
                        aria-label="Postcode"
                        placeholder="Postcode"
                        className="uppercase"
                        value={address.postcode}
                        onChange={(e) => setAddress({ ...address, postcode: e.target.value })}
                        autoComplete="off"
                      />
                      <Input
                        aria-label="Country"
                        placeholder="Country"
                        value={address.country}
                        onChange={(e) => setAddress({ ...address, country: e.target.value })}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </MoreRowShell>

                <MoreRowShell
                  id="tags"
                  title="Tags"
                  hint="e.g. Morning person, Referred by Sam"
                  open={openRows.has("tags")}
                  onToggle={() => toggleRow("tags")}
                  filled={tags.length > 0}
                >
                  <div className="grid gap-2">
                    {tags.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Tags to add">
                        {tags.map((t) => (
                          <li
                            key={t}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-2.5 text-[13px] font-semibold"
                          >
                            {t}
                            <button
                              type="button"
                              className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-background"
                              aria-label={`Remove ${t}`}
                              onClick={() => setTags((list) => list.filter((x) => x !== t))}
                            >
                              <X className="size-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Input
                      aria-label="Add a tag"
                      placeholder="Type a tag and press Enter"
                      value={tagInput}
                      onChange={(e) => {
                        if (e.target.value.endsWith(",")) addTag(e.target.value);
                        else setTagInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(tagInput);
                        }
                      }}
                      autoComplete="off"
                    />
                    {tagSuggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tagSuggestions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => addTag(t.name)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="size-3" aria-hidden />
                            {t.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </MoreRowShell>

                <MoreRowShell
                  id="notes"
                  title="Notes"
                  hint="Injuries, goals, preferences"
                  open={openRows.has("notes")}
                  onToggle={() => toggleRow("notes")}
                  filled={Boolean(note.trim())}
                >
                  <Textarea
                    aria-label="Notes"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Only your team sees this."
                  />
                </MoreRowShell>

                {showVehicle ? (
                  <MoreRowShell
                    id="vehicle"
                    title={recordTerm}
                    hint={recordFields.map((f) => f.label).join(", ")}
                    open={openRows.has("vehicle")}
                    onToggle={() => toggleRow("vehicle")}
                    filled={hasQuickAddInput(recordValues)}
                  >
                    <div className="grid gap-2">
                      {recordFields.map((f) =>
                        f.dataType === "single_select" ? (
                          <Select
                            key={f.fieldKey}
                            value={recordValues[f.fieldKey] ?? ""}
                            onValueChange={(v) =>
                              setRecordValues((p) => ({ ...p, [f.fieldKey]: v }))
                            }
                          >
                            <SelectTrigger aria-label={f.label}>
                              <SelectValue placeholder={f.label} />
                            </SelectTrigger>
                            <SelectContent>
                              {(f.constraints?.options ?? []).map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            key={f.fieldKey}
                            aria-label={f.label}
                            placeholder={f.required ? `${f.label} (required)` : f.label}
                            type={
                              f.dataType === "integer" || f.dataType === "decimal"
                                ? "number"
                                : "text"
                            }
                            maxLength={f.constraints?.maxLength}
                            value={recordValues[f.fieldKey] ?? ""}
                            onChange={(e) => {
                              setRecordValues((p) => ({ ...p, [f.fieldKey]: e.target.value }));
                              if (errors.record) setErrors((x) => ({ ...x, record: undefined }));
                            }}
                            autoComplete="off"
                          />
                        ),
                      )}
                      {errors.record ? (
                        <p className="text-[12.5px] text-destructive">{errors.record}</p>
                      ) : null}
                    </div>
                  </MoreRowShell>
                ) : null}
              </div>
            </section>
          </form>

          <DialogFooter className="flex-row gap-2 sm:gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              className="max-sm:hidden"
              onClick={requestClose}
              disabled={busy}
            >
              Cancel
            </Button>
            {onCreated ? null : (
              <Button
                type="button"
                variant="outline"
                className="max-sm:flex-1"
                disabled={busy}
                onClick={() => void submit("book")}
              >
                {saving === "book" ? "Adding…" : "Add and book"}
              </Button>
            )}
            <Button type="submit" form="add-client-form" className="max-sm:flex-1" disabled={busy}>
              {saving === "add" ? "Adding…" : "Add client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicatePeek
        customer={peek}
        timezone={timezone}
        onClose={() => setPeek(null)}
        onOpenProfile={(id) => {
          setPeek(null);
          close();
          void navigate({ to: "/clients/$clientId", params: { clientId: id } });
        }}
      />

      {bookFor ? (
        <Suspense fallback={null}>
          <AddBookingModal
            open
            onOpenChange={(o) => {
              if (!o) setBookFor(null);
            }}
            defaultCustomerId={bookFor}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-[15px] font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MoreRowShell({
  id,
  title,
  hint,
  open,
  onToggle,
  filled,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  filled: boolean;
  children: ReactNode;
}) {
  const panelId = `more-${id}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-secondary/50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold">
            {title}
            {filled && !open ? (
              <span className="ml-1.5 text-xs font-semibold text-primary">Added</span>
            ) : null}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">{hint}</span>
        </span>
        {open ? (
          <Minus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>
      {open ? (
        <div id={panelId} className="px-4 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A look at the possible match without losing the half-filled form underneath. */
function DuplicatePeek({
  customer,
  timezone,
  onClose,
  onOpenProfile,
}: {
  customer: Customer | null;
  timezone: string;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <Dialog open={customer !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        {customer ? (
          <>
            <DialogHeader>
              <DialogTitle>{customerDisplayName(customer)}</DialogTitle>
              <DialogDescription>
                Added{" "}
                {formatInTz(customer.createdAt, timezone, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {customer.status !== "active" ? ` · ${customer.status}` : ""}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-3 text-sm">
              {customer.nickname ? (
                <div>
                  <dt className="text-muted-foreground">Known as</dt>
                  <dd className="font-semibold">{customer.nickname}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-semibold">{customer.emailDisplay ?? "No email"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mobile</dt>
                <dd className="font-semibold">{customer.phoneDisplay ?? "No mobile"}</dd>
              </div>
            </dl>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Back to the form
              </Button>
              <Button variant="outline" onClick={() => onOpenProfile(customer.id)}>
                Open profile
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
