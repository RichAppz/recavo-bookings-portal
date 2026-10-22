import { useEffect, useState } from "react";
import { Layers, Package, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupGate } from "@/components/SetupGate";
import { AddClientDialog } from "@/components/AddClientDialog";
import { useSoleLocation, useSoleStaff } from "@/lib/sole";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
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
  newIdempotencyKey,
  useAddStaffTimeOff,
  useConversations,
  useCreateBooking,
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

export { AddClientDialog };

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
  // A single location or staff member needs no picker: filled in, field hidden.
  const soleLocationId = useSoleLocation()?.id ?? null;
  const soleStaffId = useSoleStaff()?.id ?? null;
  useEffect(() => {
    if (open && soleLocationId && !locationId) setLocationId(soleLocationId);
  }, [open, soleLocationId, locationId]);
  useEffect(() => {
    if (open && soleStaffId && !staffId) setStaffId(soleStaffId);
  }, [open, soleStaffId, staffId]);

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
      dirty={customerId !== "" || serviceId !== "" || (staffId !== "" && staffId !== soleStaffId)}
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
        {soleStaffId ? null : (
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
        )}
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
  const soleStaff = useSoleStaff();
  useEffect(() => {
    if (open && soleStaff && !staffId) setStaffId(soleStaff.id);
  }, [open, soleStaff, staffId]);
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
      dirty={(staffId !== "" && staffId !== soleStaff?.id) || reason !== "Admin time"}
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
      {soleStaff ? null : (
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
      )}
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
