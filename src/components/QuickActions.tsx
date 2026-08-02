import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, newIdempotencyKey } from "@/lib/api";
import {
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
import { customerDisplayName } from "@/lib/api/types";
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: () => Promise<void> | void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || disabled}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit();
                onClose();
              } catch {
                // Errors are surfaced via toast (mutation onError or explicit
                // validation toasts) — keep the dialog open so the user can fix it.
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredChannel, setPreferredChannel] = useState<"email" | "phone" | "none">("email");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createCustomer = useCreateCustomer();

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPreferredChannel("email");
    setFieldErrors({});
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
      onSubmit={async () => {
        if (!firstName.trim()) {
          setFieldErrors({ firstName: "A first name is required" });
          toast.error("A first name is required");
          throw new Error("validation");
        }
        setFieldErrors({});
        try {
          await createCustomer.mutateAsync({
            firstName,
            lastName: lastName || null,
            email: email || null,
            phone: phone || null,
            preferredChannel,
          });
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
          throw err;
        }
        toast.success("Client added");
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
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
          {fieldErrors.firstName ? (
            <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-last">Last name</Label>
          <Input
            id="c-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Cole"
            aria-invalid={Boolean(fieldErrors.lastName)}
          />
          {fieldErrors.lastName ? (
            <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
          ) : null}
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
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email ? <p className="text-xs text-destructive">{fieldErrors.email}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="c-phone">Mobile</Label>
          <Input
            id="c-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07700 900123"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone ? (
            <p className="text-xs text-destructive">{fieldErrors.phone}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label>Preferred contact</Label>
          <Select
            value={preferredChannel}
            onValueChange={(v) => setPreferredChannel(v as "email" | "phone" | "none")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          {fieldErrors.preferredChannel ? (
            <p className="text-xs text-destructive">{fieldErrors.preferredChannel}</p>
          ) : null}
        </div>
      </div>
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

  return (
    <Shell
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
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

  return (
    <Shell
      open={open}
      onClose={onClose}
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
        <div className="grid gap-2">
          <Label>Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose location" />
            </SelectTrigger>
            <SelectContent>
              {(locations.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

  return (
    <Shell
      open={open}
      onClose={onClose}
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
      title="Send message"
      description="Message a client directly from anywhere in RECAVO."
      submitLabel="Send message"
      disabled={!conversationId}
      onSubmit={async () => {
        if (!conversationId) {
          toast.error("Choose a conversation");
          throw new Error("validation");
        }
        if (!body.trim()) {
          toast.error("Write a message first");
          throw new Error("validation");
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
