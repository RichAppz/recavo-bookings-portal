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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDemo } from "@/lib/demo-store";
import { demoToday, isoDate, gbp } from "@/lib/format";

const TIMES = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00",
  "12:00", "13:00", "14:00", "16:00", "17:00", "17:30", "18:00", "19:00",
];

export function AddBookingModal({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
}) {
  const demo = useDemo();
  const [clientId, setClientId] = useState(defaultClientId ?? "c1");
  const [serviceId, setServiceId] = useState("sv1");
  const [staffId, setStaffId] = useState("s1");
  const [locationId, setLocationId] = useState("l1");
  const [date, setDate] = useState(isoDate(demoToday()));
  const [time, setTime] = useState("09:00");
  const [payment, setPayment] = useState<"Card" | "Package credit" | "Cash">("Card");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState(true);
  const [saving, setSaving] = useState(false);

  const service = demo.serviceById(serviceId);
  const credits = demo.creditsFor(clientId);

  const submit = () => {
    setSaving(true);
    window.setTimeout(() => {
      demo.createBooking({
        clientId,
        serviceId,
        staffId,
        locationId,
        date,
        time,
        paymentMethod: payment,
        notes,
        sendConfirmation: confirmation,
      });
      setSaving(false);
      setNotes("");
      onOpenChange(false);
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add booking</DialogTitle>
          <DialogDescription>
            Create a session for an existing client and take payment or use a package credit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {demo.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {credits > 0 ? `${credits} credit${credits === 1 ? "" : "s"} available` : "No package credits"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {demo.services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Trainer</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {demo.staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {demo.locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-date">Date</Label>
              <Input
                id="booking-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Time</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select value={payment} onValueChange={(v) => setPayment(v as typeof payment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Card">Card — {gbp(service.price)}</SelectItem>
                  <SelectItem value="Package credit" disabled={credits === 0}>
                    Package credit
                  </SelectItem>
                  <SelectItem value="Cash">Pay at studio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="booking-notes">Internal notes</Label>
            <Textarea
              id="booking-notes"
              placeholder="Visible to staff only"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Send confirmation</p>
              <p className="text-xs text-muted-foreground">Email the client their booking details</p>
            </div>
            <Switch checked={confirmation} onCheckedChange={setConfirmation} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
