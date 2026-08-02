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
import {
  useAddStaffTimeOff,
  useConversations,
  useCreateBooking,
  useCreateCustomer,
  useCustomers,
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
  const createCustomer = useCreateCustomer();

  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Add client"
      description="Create a client record. They can be invited to the booking page later."
      submitLabel="Add client"
      onSubmit={async () => {
        if (!firstName.trim()) {
          toast.error("A first name is required");
          return;
        }
        await createCustomer.mutateAsync({
          firstName,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
        });
        toast.success("Client added");
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
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
  const customers = useCustomers();
  const packages = usePackages();
  const startPurchase = useStartPackagePurchase();
  const def = packages.data?.find((p) => p.id === packageId);

  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Sell package"
      description="Start a package checkout. Credits are issued once payment succeeds."
      submitLabel={def ? `Charge ${formatMoney(def.priceMinor, def.currency)}` : "Start checkout"}
      disabled={!customerId || !packageId}
      onSubmit={async () => {
        if (!customerId || !packageId) {
          toast.error("Choose a client and package");
          return;
        }
        const result = await startPurchase.mutateAsync({ customerId, packageId });
        toast.success("Checkout started", {
          description: result.clientSecret
            ? "Payment intent created — complete checkout to issue credits."
            : "Payment recorded.",
        });
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
            Recorded in the client credit ledger once payment is confirmed.
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
