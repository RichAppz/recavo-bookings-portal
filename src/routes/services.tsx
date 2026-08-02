import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
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
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useCreateService,
  useLocationsList,
  useServices,
  useStaffList,
  useUpdateService,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format";
import type { CatalogueService } from "@/lib/api/types";
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
      {
        property: "og:description",
        content: "One-to-one, two-to-one and group services with full booking rules.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ServicesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function ServicesPage() {
  const services = useServices();
  const staff = useStaffList();
  const locations = useLocationsList();
  const updateService = useUpdateService();
  const [editing, setEditing] = useState<CatalogueService | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Services"
        description="What clients can book, how long it takes and what it costs."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create service
          </Button>
        }
      />

      {services.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : services.isError ? (
        <EmptyState title="Couldn't load services" description="Please try again shortly." />
      ) : (services.data ?? []).length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Create your first bookable service to start taking bookings."
          action={<Button onClick={() => setCreating(true)}>Create service</Button>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(services.data ?? []).map((s) => (
            <article key={s.id} className="surface-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.colour ?? "var(--color-chart-2)" }}
                />
                <StatusBadge status={s.active ? "active" : "inactive"} />
              </div>
              <h2 className="mt-3 text-lg font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />
                  {s.durationMinutes} min
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {formatMoney(s.basePriceMinor, s.currency)}
                  {s.capacityMax > 1 ? " pp" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4 text-muted-foreground" />
                  {s.capacityMax} {s.capacityMax === 1 ? "place" : "places"}
                </span>
              </div>

              <dl className="mt-4 space-y-2 border-t pt-4 text-xs">
                <Row
                  label="Trainers"
                  value={
                    s.eligibleStaffIds
                      .map((id) => staff.data?.find((m) => m.id === id)?.displayName)
                      .filter(Boolean)
                      .join(", ") || "Any"
                  }
                />
                <Row
                  label="Locations"
                  value={
                    s.locationIds
                      .map((id) => locations.data?.find((l) => l.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "All"
                  }
                />
                <Row
                  label="Booking notice"
                  value={`${Math.round(s.bookingNoticeMinutes / 60)} hours`}
                />
                <Row label="Cancellation" value={`${s.cancellationPolicy.windowHours} hours`} />
                <Row
                  label="Buffer"
                  value={`${s.bufferBeforeMinutes + s.bufferAfterMinutes} minutes`}
                />
              </dl>

              <div className="mt-5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={s.active}
                    disabled={updateService.isPending}
                    onCheckedChange={(v) => {
                      updateService.mutate(
                        { serviceId: s.id, version: s.version, body: { active: v } },
                        {
                          onSuccess: () =>
                            toast.success(v ? "Service activated" : "Service paused"),
                        },
                      );
                    }}
                  />
                  {s.active ? "Bookable" : "Hidden"}
                </span>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                  Edit service
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ServiceDialog
        open={creating || editing !== null}
        service={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
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
  service: CatalogueService | null;
  onClose: () => void;
}) {
  const createService = useCreateService();
  const updateService = useUpdateService();
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(String(service ? service.basePriceMinor / 100 : 50));
  const [duration, setDuration] = useState(String(service?.durationMinutes ?? 60));
  const [capacity, setCapacity] = useState(String(service?.capacityMax ?? 1));
  const [description, setDescription] = useState(service?.description ?? "");
  const [active, setActive] = useState(service?.active ?? true);

  const submitting = createService.isPending || updateService.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setName(service?.name ?? "");
          setPrice(String(service ? service.basePriceMinor / 100 : 50));
          setDuration(String(service?.durationMinutes ?? 60));
          setCapacity(String(service?.capacityMax ?? 1));
          setDescription(service?.description ?? "");
          setActive(service?.active ?? true);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Create service"}</DialogTitle>
          <DialogDescription>
            Set pricing, capacity and the booking rules clients see on your booking page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="1-to-1 Personal Training"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Show this service on the booking page</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              if (!name.trim()) return toast.error("Give the service a name");
              const durationMinutes = Number(duration) || 60;
              const basePriceMinor = Math.round((Number(price) || 0) * 100);
              const capacityMax = Number(capacity) || 1;
              if (service) {
                await updateService.mutateAsync({
                  serviceId: service.id,
                  version: service.version,
                  body: {
                    name,
                    description: description || null,
                    durationMinutes,
                    basePriceMinor,
                    capacityMax,
                    active,
                  },
                });
                toast.success("Service updated");
              } else {
                await createService.mutateAsync({
                  name,
                  description: description || null,
                  durationMinutes,
                  basePriceMinor,
                  currency: "GBP",
                  capacityMax,
                  capacityMin: 1,
                });
                toast.success("Service created");
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
