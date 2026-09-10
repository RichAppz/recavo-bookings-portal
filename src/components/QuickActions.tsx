import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Layers, Package, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupGate } from "@/components/SetupGate";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import type { ContactChannel } from "@/lib/api/types";
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
import { CustomerAddressFields } from "@/components/CustomerAddressFields";
import { EMPTY_ADDRESS, formToAddress, type AddressFormState } from "@/lib/customers/address-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  newIdempotencyKey,
  useAddStaffTimeOff,
  useConversations,
  useCreateBooking,
  useCreateCustomer,
  useCustomers,
  useIssuePackagePurchase,
  useLocationsList,
  usePackages,
  useSendMessage,
  useServices,
  useStaffList,
  useStartPackagePurchase,
} from "@/lib/api/hooks";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import { formatMoney, isoDate } from "@/lib/format";
import { toast } from "sonner";

export type QuickAction = "booking" | "client" | "group" | "block" | "package" | "message" | null;

export function QuickActionDialogs({
  action,
  onClose,
  customerId,
}: {
  action: QuickAction;
  onClose: () => void;
  customerId?: string;
}) {
  const open = (k: QuickAction) => action === k;

  return (
    <>
      <AddClientDialog open={open("client")} onClose={onClose} />
      <SellPackageDialog open={open("package")} onClose={onClose} defaultCustomerId={customerId} />
      <GroupSessionDialog open={open("group")} onClose={onClose} />
      <BlockAvailabilityDialog open={open("block")} onClose={onClose} />
      <SendMessageDialog open={open("message")} onClose={onClose} />
    </>
  );
}

function Shell({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  disabled,
  gate,
  dirty = false,
  what,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: () => Promise<void> | void;
  submitLabel: string;
  disabled?: boolean;
  /** When set, the action can't be done yet — show this instead of the form. */
  gate?: React.ReactNode;
  /** True once something has been typed: Esc / backdrop / Cancel then ask first. */
  dirty?: boolean;
  /** Noun for the discard prompt, e.g. "this client". */
  what?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => {
    if (dirty && !saving && !gate) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what={what}
        onDiscard={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {gate ? (
          <>
            {gate}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid gap-4">{children}</div>
            <DialogFooter>
              <Button variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                disabled={saving || disabled}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSubmit();
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : submitLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** First missing prerequisite for a quick action, or null when it can go ahead. */
function firstGate(
  checks: Array<{ when: boolean; gate: React.ReactNode }>,
): React.ReactNode | null {
  return checks.find((c) => c.when)?.gate ?? null;
}

/**
 * The add-client drawer. Also opened over the top of the Add booking form via its
 * "+" — pass `onCreated` there so the new client lands straight in the picker and
 * the toast doesn't offer to navigate away from the half-filled booking.
 */
export function AddClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
}) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [address, setAddress] = useState<AddressFormState>(EMPTY_ADDRESS);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Default to SMS when a text would actually go out right now (Growth, or credits
  // in hand); with an empty balance default to email so nothing silently falls back.
  const smsCredits = useSmsCreditsSummary();
  const defaultChannel: ContactChannel = smsCredits.canText ? "sms" : "email";
  const [preferredChannel, setPreferredChannel] = useState<ContactChannel>(defaultChannel);
  const [operationalNotifications, setOperationalNotifications] = useState(true);
  const createCustomer = useCreateCustomer();

  const reset = () => {
    setFirstName("");
    setLastName("");
    setNickname("");
    setAddress(EMPTY_ADDRESS);
    setEmail("");
    setPhone("");
    setPreferredChannel(defaultChannel);
    setOperationalNotifications(true);
  };

  return (
    <Shell
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Add client"
      description="Create a client record. They can be invited to the booking page later."
      submitLabel="Add client"
      what="this client"
      dirty={Boolean(
        firstName.trim() ||
        lastName.trim() ||
        nickname.trim() ||
        email.trim() ||
        phone.trim() ||
        Object.values(address).some((v) => String(v ?? "").trim()),
      )}
      onSubmit={async () => {
        if (!firstName.trim()) {
          toast.error("A first name is required");
          return;
        }
        const { customer, possibleDuplicates } = await createCustomer.mutateAsync({
          firstName,
          lastName: lastName || null,
          nickname: nickname.trim() || null,
          address: formToAddress(address),
          email: email || null,
          phone: phone || null,
          preferredChannel,
          operationalNotifications,
        });
        onCreated?.(customer);
        if (possibleDuplicates.length > 0) {
          const first = possibleDuplicates[0];
          toast.warning(
            `Client added — ${possibleDuplicates.length} similar ${
              possibleDuplicates.length === 1 ? "record" : "records"
            } already exist`,
            {
              description: `Did you mean ${customerDisplayName(first)}? Check you haven't created a duplicate.`,
              action: onCreated
                ? undefined
                : {
                    label: "View match",
                    onClick: () =>
                      void navigate({ to: "/clients/$clientId", params: { clientId: first.id } }),
                  },
            },
          );
        } else {
          toast.success("Client added", {
            action: onCreated
              ? undefined
              : {
                  label: "Open",
                  onClick: () =>
                    void navigate({
                      to: "/clients/$clientId",
                      params: { clientId: customer.id },
                    }),
                },
          });
        }
        reset();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="c-first">First name</Label>
          <Input
            id="c-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Harriet"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-last">Last name</Label>
          <Input
            id="c-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Cole"
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="c-nickname">Known as</Label>
          <Input
            id="c-nickname"
            value={nickname}
            maxLength={80}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Harriet – red Audi"
          />
          <p className="text-xs text-muted-foreground">
            Optional. A name that helps you remember them; never shown to the client.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="c-email">Email</Label>
        <Input
          id="c-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="harriet.cole@example.co.uk"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="c-phone">Mobile</Label>
        <Input
          id="c-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07700 900123"
        />
      </div>
      <CustomerAddressFields idPrefix="c-addr" value={address} onChange={setAddress} />
      <div className="grid gap-2">
        <Label>Preferred channel</Label>
        <Select
          value={preferredChannel}
          onValueChange={(v) => setPreferredChannel(v as ContactChannel)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          SMS needs a mobile number — reminders fall back to email until one is saved.
          {preferredChannel === "sms" && smsCredits.level !== "unlimited"
            ? ` ${smsCredits.note}`
            : ""}
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Operational notifications</p>
          <p className="text-xs text-muted-foreground">Booking reminders and service updates.</p>
        </div>
        <Switch checked={operationalNotifications} onCheckedChange={setOperationalNotifications} />
      </label>
    </Shell>
  );
}

function SellPackageDialog({
  open,
  onClose,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
}) {
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [packageId, setPackageId] = useState("");
  const [mode, setMode] = useState<"checkout" | "record">("checkout");
  const [paymentRef, setPaymentRef] = useState("");
  const customers = useCustomers();
  const packages = usePackages();
  const startPurchase = useStartPackagePurchase();
  const issuePurchase = useIssuePackagePurchase();
  const def = packages.data?.find((p) => p.id === packageId);

  const reset = () => {
    setMode("checkout");
    setPaymentRef("");
  };

  const gate = firstGate([
    {
      when: packages.isSuccess && (packages.data ?? []).length === 0,
      gate: (
        <SetupGate
          icon={<Package className="size-5" />}
          title="Create a package first"
          description="A package is a block of credits clients buy up front. Set one up, then you can sell it here."
          step="package"
          to="/packages"
          cta="Create package"
          onNavigate={onClose}
        />
      ),
    },
    {
      when: customers.isSuccess && (customers.data?.items ?? []).length === 0,
      gate: (
        <SetupGate
          icon={<UserRound className="size-5" />}
          title="Add a client first"
          description="Packages are sold to a client on your books."
          step="client"
          to="/clients"
          cta="Add client"
          onNavigate={onClose}
        />
      ),
    },
  ]);

  return (
    <Shell
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      gate={gate}
      what="this sale"
      dirty={customerId !== (defaultCustomerId ?? "") || packageId !== "" || paymentRef !== ""}
      title="Sell package"
      description={
        mode === "checkout"
          ? "Start a card checkout. Credits are issued once payment succeeds."
          : "Issue credits immediately for a payment already taken outside RECAVO (cash, terminal, etc)."
      }
      submitLabel={
        mode === "checkout"
          ? def
            ? `Charge ${formatMoney(def.priceMinor, def.currency)}`
            : "Start checkout"
          : "Issue credits"
      }
      disabled={!customerId || !packageId || (mode === "record" && !paymentRef.trim())}
      onSubmit={async () => {
        if (!customerId || !packageId) {
          toast.error("Choose a client and package");
          return;
        }
        if (mode === "checkout") {
          const result = await startPurchase.mutateAsync({ customerId, packageId });
          toast.success("Checkout started", {
            description: result.clientSecret
              ? "Payment intent created — complete checkout to issue credits."
              : "Payment recorded.",
          });
        } else {
          if (!paymentRef.trim()) {
            toast.error("Enter the payment reference");
            throw new Error("validation");
          }
          await issuePurchase.mutateAsync({
            customerId,
            packageId,
            paymentRef: paymentRef.trim(),
            providerEventId: newIdempotencyKey(),
          });
          toast.success("Credits issued", {
            description: `Recorded against payment reference ${paymentRef.trim()}.`,
          });
        }
      }}
    >
      <div className="grid gap-2">
        <Label>Client</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a client" />
          </SelectTrigger>
          <SelectContent>
            {(customers.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {customerDisplayName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Package</Label>
        <Select value={packageId} onValueChange={setPackageId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a package" />
          </SelectTrigger>
          <SelectContent>
            {(packages.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.priceMinor, p.currency)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {def ? (
        <div className="rounded-xl bg-secondary p-4 text-sm">
          <p className="font-medium">
            {def.creditsIssued} credits · valid {def.validity.amount}{" "}
            {def.validity.kind.replace("_", " ")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {mode === "checkout"
              ? "Recorded in the client credit ledger once payment is confirmed."
              : "Credits are issued straight away against the payment reference below."}
          </p>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label>How was this paid?</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="checkout">Card checkout (via RECAVO)</SelectItem>
            <SelectItem value="record">Already paid (cash / terminal / other)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === "record" ? (
        <div className="grid gap-2">
          <Label htmlFor="pp-payment-ref">Payment reference</Label>
          <Input
            id="pp-payment-ref"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Terminal receipt no., cash log ref, etc."
          />
          <p className="text-xs text-muted-foreground">
            Required — ties the issued credits to proof of payment for reconciliation.
          </p>
        </div>
      ) : null}
    </Shell>
  );
}

function GroupSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState("18:00");
  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const customers = useCustomers();
  const createBooking = useCreateBooking();
  const groupServices = (services.data ?? []).filter((s) => s.capacityMax > 1);
  const locationList = locations.data ?? [];
  // A single location needs no picker: it is filled in and the field stays hidden.
  const soleLocationId = locationList.length === 1 ? locationList[0]!.id : null;
  useEffect(() => {
    if (open && soleLocationId && !locationId) setLocationId(soleLocationId);
  }, [open, soleLocationId, locationId]);

  const gate = firstGate([
    {
      when: services.isSuccess && groupServices.length === 0,
      gate: (
        <SetupGate
          icon={<Layers className="size-5" />}
          title="Create a group service first"
          description="Group sessions come from a service with a capacity above one. Create one, then publish sessions here."
          step="service"
          to="/services"
          search={{ create: true }}
          cta="Create service"
          onNavigate={onClose}
        />
      ),
    },
    {
      when: staff.isSuccess && (staff.data ?? []).length === 0,
      gate: (
        <SetupGate
          icon={<Users className="size-5" />}
          title="Add a staff member first"
          description="Someone has to run the session — add a staff member with working hours."
          step="staff_availability"
          to="/staff"
          cta="Add staff"
          onNavigate={onClose}
        />
      ),
    },
    {
      when: customers.isSuccess && (customers.data?.items ?? []).length === 0,
      gate: (
        <SetupGate
          icon={<UserRound className="size-5" />}
          title="Add a client first"
          description="A group session needs its first attendee on your books."
          step="client"
          to="/clients"
          cta="Add client"
          onNavigate={onClose}
        />
      ),
    },
  ]);

  return (
    <Shell
      open={open}
      onClose={onClose}
      gate={gate}
      what="this session"
      dirty={customerId !== "" || serviceId !== "" || staffId !== ""}
      title="Create group session"
      description="Publish a group session and add the first attendee."
      submitLabel="Create session"
      disabled={!customerId || !serviceId || !staffId || !locationId}
      onSubmit={async () => {
        if (!customerId || !serviceId || !staffId || !locationId) {
          toast.error("Fill in every field");
          return;
        }
        const start = new Date(`${date}T${time}:00`).toISOString();
        await createBooking.mutateAsync({
          serviceId,
          staffId,
          locationId,
          start,
          leadCustomerId: customerId,
          source: "staff_console",
        });
        toast.success("Group session created");
      }}
    >
      <div className="grid gap-2">
        <Label>Lead client</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a client" />
          </SelectTrigger>
          <SelectContent>
            {(customers.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {customerDisplayName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Service</Label>
        <Select value={serviceId} onValueChange={setServiceId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a group service" />
          </SelectTrigger>
          <SelectContent>
            {groupServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Staff</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose staff" />
            </SelectTrigger>
            <SelectContent>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {soleLocationId ? null : (
          <div className="grid gap-2">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose location" />
              </SelectTrigger>
              <SelectContent>
                {locationList.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="g-date">Date</Label>
          <Input id="g-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="g-time">Start time</Label>
          <Input id="g-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
    </Shell>
  );
}

function BlockAvailabilityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState("60");
  const [reason, setReason] = useState("Admin time");
  const staff = useStaffList();
  const addTimeOff = useAddStaffTimeOff();
  const member = (staff.data ?? []).find((s) => s.id === staffId);

  const gate = firstGate([
    {
      when: staff.isSuccess && (staff.data ?? []).length === 0,
      gate: (
        <SetupGate
          icon={<Users className="size-5" />}
          title="Add a staff member first"
          description="Time is blocked against a staff member's working hours."
          step="staff_availability"
          to="/staff"
          cta="Add staff"
          onNavigate={onClose}
        />
      ),
    },
  ]);

  return (
    <Shell
      open={open}
      onClose={onClose}
      gate={gate}
      what="this block"
      dirty={staffId !== "" || reason !== "Admin time"}
      title="Block availability"
      description="Stop new bookings being taken during a period."
      submitLabel="Block time"
      disabled={!member}
      onSubmit={async () => {
        if (!member) {
          toast.error("Choose a staff member");
          return;
        }
        const start = new Date(`${date}T${time}:00`);
        const end = new Date(start.getTime() + (Number(duration) || 60) * 60_000);
        await addTimeOff.mutateAsync({
          staffId: member.id,
          version: member.version,
          start: start.toISOString(),
          end: end.toISOString(),
          originatingTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          reason,
        });
        toast.success("Availability blocked");
      }}
    >
      <div className="grid gap-2">
        <Label>Staff member</Label>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose staff" />
          </SelectTrigger>
          <SelectContent>
            {(staff.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="b-date">Date</Label>
          <Input id="b-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="b-time">From</Label>
          <Input id="b-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="b-duration">Minutes</Label>
          <Input
            id="b-duration"
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="b-reason">Reason</Label>
        <Input id="b-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Shell>
  );
}

function SendMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [conversationId, setConversationId] = useState("");
  const [body, setBody] = useState("");
  const conversations = useConversations();
  const customers = useCustomers();
  const sendMessage = useSendMessage(conversationId || undefined);
  const nameForCustomer = (customerId: string) => {
    const c = customers.data?.items.find((x) => x.id === customerId);
    return c ? customerDisplayName(c) : "Client";
  };

  return (
    <Shell
      open={open}
      onClose={onClose}
      what="this message"
      dirty={body.trim() !== ""}
      title="Send message"
      description="Message a client directly from anywhere in RECAVO."
      submitLabel="Send message"
      disabled={!conversationId}
      onSubmit={async () => {
        if (!conversationId) {
          toast.error("Choose a conversation");
          return;
        }
        if (!body.trim()) {
          toast.error("Write a message first");
          return;
        }
        await sendMessage.mutateAsync(body);
        toast.success("Message sent");
        setBody("");
      }}
    >
      <div className="grid gap-2">
        <Label>Recipient</Label>
        <Select value={conversationId} onValueChange={setConversationId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a conversation" />
          </SelectTrigger>
          <SelectContent>
            {(conversations.data?.conversations ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {nameForCustomer(c.customerId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="m-body">Message</Label>
        <Textarea
          id="m-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hi James, just confirming Thursday at 07:30…"
        />
      </div>
    </Shell>
  );
}
