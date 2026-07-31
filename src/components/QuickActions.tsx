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
import { useDemo } from "@/lib/demo-store";
import { demoToday, isoDate, gbp } from "@/lib/format";
import { toast } from "sonner";

export type QuickAction =
  | "booking"
  | "client"
  | "group"
  | "block"
  | "package"
  | "message"
  | null;

export function QuickActionDialogs({
  action,
  onClose,
  clientId,
}: {
  action: QuickAction;
  onClose: () => void;
  clientId?: string;
}) {
  const demo = useDemo();
  const open = (k: QuickAction) => action === k;

  return (
    <>
      <AddClientDialog open={open("client")} onClose={onClose} />
      <SellPackageDialog open={open("package")} onClose={onClose} defaultClient={clientId} />
      <GroupSessionDialog open={open("group")} onClose={onClose} />
      <BlockAvailabilityDialog open={open("block")} onClose={onClose} />
      <SendMessageDialog open={open("message")} onClose={onClose} />
      {demo ? null : null}
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={() => {
              setSaving(true);
              window.setTimeout(() => {
                onSubmit();
                setSaving(false);
                onClose();
              }, 500);
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
  const demo = useDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Add client"
      description="Create a client record. They will receive an invitation to the booking page."
      submitLabel="Add client"
      onSubmit={() => {
        if (!name.trim()) return toast.error("A client name is required");
        demo.addClient({ name, email, phone });
        setName("");
        setEmail("");
        setPhone("");
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="c-name">Full name</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Harriet Cole" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="c-email">Email</Label>
        <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="harriet.cole@example.co.uk" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="c-phone">Mobile</Label>
        <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900123" />
      </div>
    </Shell>
  );
}

function SellPackageDialog({
  open,
  onClose,
  defaultClient,
}: {
  open: boolean;
  onClose: () => void;
  defaultClient?: string;
}) {
  const demo = useDemo();
  const [client, setClient] = useState(defaultClient ?? "c1");
  const [pkg, setPkg] = useState("p2");
  const def = demo.packageById(pkg);
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Sell package"
      description="Take payment for a package and add the credits to the client's balance."
      submitLabel={`Charge ${def ? gbp(def.price) : ""}`}
      onSubmit={() => demo.sellPackage(client, pkg)}
    >
      <div className="grid gap-2">
        <Label>Client</Label>
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {demo.clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Package</Label>
        <Select value={pkg} onValueChange={setPkg}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {demo.packageDefs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — {gbp(p.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {def ? (
        <div className="rounded-xl bg-secondary p-4 text-sm">
          <p className="font-medium">{def.credits} credits · valid {def.validity}</p>
          <p className="mt-1 text-muted-foreground">
            Charged to the card on file and recorded in the client credit ledger.
          </p>
        </div>
      ) : null}
    </Shell>
  );
}

function GroupSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = useDemo();
  const [service, setService] = useState("sv4");
  const [staff, setStaff] = useState("s3");
  const [location, setLocation] = useState("l2");
  const [date, setDate] = useState(isoDate(demoToday()));
  const [time, setTime] = useState("18:00");
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Create group session"
      description="Publish a group session to the booking page with limited spaces."
      submitLabel="Publish session"
      onSubmit={() =>
        demo.createBooking({
          clientId: "c1",
          serviceId: service,
          staffId: staff,
          locationId: location,
          date,
          time,
          paymentMethod: "Card",
          sendConfirmation: false,
        })
      }
    >
      <div className="grid gap-2">
        <Label>Service</Label>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {demo.services.filter((s) => s.capacity > 2).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Trainer</Label>
          <Select value={staff} onValueChange={setStaff}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {demo.staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Location</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {demo.locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
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
  const demo = useDemo();
  const [staff, setStaff] = useState("s1");
  const [date, setDate] = useState(isoDate(demoToday()));
  const [time, setTime] = useState("14:00");
  const [reason, setReason] = useState("Admin time");
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Block availability"
      description="Stop new bookings being taken during a period."
      submitLabel="Block time"
      onSubmit={() => demo.blockAvailability(staff, date, time, reason)}
    >
      <div className="grid gap-2">
        <Label>Staff member</Label>
        <Select value={staff} onValueChange={setStaff}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {demo.staff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="b-date">Date</Label>
          <Input id="b-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="b-time">From</Label>
          <Input id="b-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
  const demo = useDemo();
  const [conversation, setConversation] = useState("cv1");
  const [body, setBody] = useState("");
  return (
    <Shell
      open={open}
      onClose={onClose}
      title="Send message"
      description="Message a client directly from anywhere in RECAVO."
      submitLabel="Send message"
      onSubmit={() => {
        if (!body.trim()) return toast.error("Write a message first");
        demo.sendMessage(conversation, body);
        setBody("");
        toast.success("Message sent");
      }}
    >
      <div className="grid gap-2">
        <Label>Recipient</Label>
        <Select value={conversation} onValueChange={setConversation}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {demo.conversations.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title ?? demo.clientById(c.clientId)?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="m-body">Message</Label>
        <Textarea id="m-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi James, just confirming Thursday at 07:30…" />
      </div>
    </Shell>
  );
}
