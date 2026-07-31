import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, MapPin, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemo } from "@/lib/demo-store";
import { gbp } from "@/lib/format";
import type { Service } from "@/lib/demo-data";
import { toast } from "sonner";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — RECAVO" },
      {
        name: "description",
        content:
          "Manage bookable services: duration, price, capacity, assigned trainers, locations and cancellation rules.",
      },
      { property: "og:title", content: "RECAVO Services" },
      { property: "og:description", content: "One-to-one, two-to-one and group services with full booking rules." },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  const demo = useDemo();
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Services"
        description="What clients can book, how long it takes and what it costs."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create service
          </Button>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {demo.services.map((s) => (
          <article key={s.id} className="surface-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.colour }} />
              <StatusBadge status={s.active ? "active" : "inactive"} />
            </div>
            <h2 className="mt-3 text-lg font-semibold">{s.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" />{s.duration} min</span>
              <span className="flex items-center gap-1.5 font-semibold">{gbp(s.price)}{s.capacity > 2 ? " pp" : ""}</span>
              <span className="flex items-center gap-1.5"><Users className="size-4 text-muted-foreground" />{s.capacity} {s.capacity === 1 ? "place" : "places"}</span>
            </div>

            <dl className="mt-4 space-y-2 border-t pt-4 text-xs">
              <Row label="Trainers" value={s.staff.map((id) => demo.staffById(id).name.split(" ")[0]).join(", ")} />
              <Row label="Locations" value={s.locations.map((id) => demo.locationById(id).name).join(", ")} />
              <Row label="Booking notice" value={s.bookingNotice} />
              <Row label="Cancellation" value={s.cancellationPeriod} />
              <Row label="Buffer" value={s.buffer} />
            </dl>

            <div className="mt-5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={s.active}
                  onCheckedChange={(v) => {
                    demo.updateService(s.id, { active: v });
                    toast.success(v ? "Service activated" : "Service paused");
                  }}
                />
                {s.active ? "Bookable" : "Hidden"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditing(s)}>Edit service</Button>
            </div>
          </article>
        ))}
      </div>

      <ServiceDialog
        open={creating || editing !== null}
        service={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function ServiceDialog({
  open,
  service,
  onClose,
}: {
  open: boolean;
  service: Service | null;
  onClose: () => void;
}) {
  const demo = useDemo();
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(String(service?.price ?? 50));
  const [duration, setDuration] = useState(String(service?.duration ?? 60));
  const [capacity, setCapacity] = useState(String(service?.capacity ?? 1));
  const [description, setDescription] = useState(service?.description ?? "");
  const [active, setActive] = useState(service?.active ?? true);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setName(service?.name ?? "");
          setPrice(String(service?.price ?? 50));
          setDuration(String(service?.duration ?? 60));
          setCapacity(String(service?.capacity ?? 1));
          setDescription(service?.description ?? "");
          setActive(service?.active ?? true);
        }
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Create service"}</DialogTitle>
          <DialogDescription>
            Set pricing, capacity and the booking rules clients see on your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="1-to-1 Personal Training" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="s-dur">Duration (min)</Label>
              <Input id="s-dur" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-price">Price (£)</Label>
              <Input id="s-price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-cap">Max capacity</Label>
              <Input id="s-cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="s-notice">Minimum booking notice</Label>
              <Input id="s-notice" defaultValue={service?.bookingNotice ?? "12 hours"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-cancel">Cancellation deadline</Label>
              <Input id="s-cancel" defaultValue={service?.cancellationPeriod ?? "24 hours"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-buffer">Booking buffer</Label>
              <Input id="s-buffer" defaultValue={service?.buffer ?? "10 minutes"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-pkg">Eligible packages</Label>
              <Input id="s-pkg" defaultValue="Monthly 1-to-1 Package" />
            </div>
          </div>
          <div className="rounded-xl border p-3 text-sm">
            <p className="mb-2 font-medium">Assigned trainers and locations</p>
            <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {demo.staff.map((s) => (
                <span key={s.id} className="rounded-full bg-secondary px-2.5 py-1">{s.name}</span>
              ))}
              <MapPin className="size-3.5" />
              {demo.locations.map((l) => (
                <span key={l.id} className="rounded-full bg-secondary px-2.5 py-1">{l.name}</span>
              ))}
            </p>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Show this service on the booking page</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (service) {
                demo.updateService(service.id, {
                  name,
                  description,
                  price: Number(price) || service.price,
                  duration: Number(duration) || service.duration,
                  capacity: Number(capacity) || service.capacity,
                  active,
                });
                toast.success("Service updated");
              } else {
                if (!name.trim()) return toast.error("Give the service a name");
                demo.addService({
                  id: `sv${Math.random().toString(36).slice(2, 6)}`,
                  name,
                  description,
                  duration: Number(duration) || 60,
                  price: Number(price) || 0,
                  capacity: Number(capacity) || 1,
                  staff: ["s1"],
                  locations: ["l1"],
                  bookingNotice: "12 hours",
                  cancellationPeriod: "24 hours",
                  buffer: "10 minutes",
                  active,
                  colour: "var(--color-chart-2)",
                });
              }
              onClose();
            }}
          >
            {service ? "Save changes" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
