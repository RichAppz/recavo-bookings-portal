import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, MapPin, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useCreateLocation, useServices, useStaffList } from "@/lib/api/hooks";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

export const Route = createFileRoute("/locations")({
  head: () => ({
    meta: [
      { title: "Locations — RECAVO" },
      {
        name: "description",
        content:
          "Studio locations with opening hours, assigned staff, bookable services and monthly performance.",
      },
      { property: "og:title", content: "RECAVO Locations" },
      { property: "og:description", content: "Multi-site scheduling across every studio you run." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <LocationsPage />
      </AppShell>
    </RequireAuth>
  ),
});

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function minutesLabel(mins: number) {
  return `${Math.floor(mins / 60)}`.padStart(2, "0") + ":" + `${mins % 60}`.padStart(2, "0");
}

function LocationsPage() {
  const tenant = useTenant();
  const staff = useStaffList();
  const services = useServices();
  const [creating, setCreating] = useState(false);

  const locations = tenant.locations;

  return (
    <>
      <PageHeader
        title="Locations"
        description="Every site you run, with its own hours, team and services."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add location
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Active locations"
          value={String(locations.filter((l) => l.active).length)}
          icon={<Building2 className="size-4" />}
        />
        <StatCard label="Total locations" value={String(locations.length)} />
      </div>

      {tenant.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading locations…</p>
      ) : locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          description="Add your first location to start assigning services and staff."
          action={<Button onClick={() => setCreating(true)}>Add location</Button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {locations.map((l) => {
            const teamHere = (staff.data ?? []).filter(
              (s) => s.locationIds.length === 0 || s.locationIds.includes(l.id),
            );
            const servicesHere = (services.data ?? []).filter(
              (s) => s.locationIds.length === 0 || s.locationIds.includes(l.id),
            );
            return (
              <SectionCard
                key={l.id}
                title={l.name}
                description={l.type.replace(/_/g, " ")}
                action={<StatusBadge status={l.active ? "active" : "inactive"} />}
              >
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-4" /> {l.timezone}
                </p>

                <div className="mt-4 space-y-1 text-sm">
                  {l.openingHours.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No opening hours configured.</p>
                  ) : (
                    l.openingHours
                      .slice()
                      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                      .map((h) => (
                        <p
                          key={h.dayOfWeek}
                          className="flex justify-between text-xs text-muted-foreground"
                        >
                          <span>{DAY_NAMES[h.dayOfWeek]}</span>
                          <span>
                            {minutesLabel(h.openMinute)} – {minutesLabel(h.closeMinute)}
                          </span>
                        </p>
                      ))
                  )}
                </div>

                <div className="mt-4 space-y-3 border-t pt-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Team</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {teamHere.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No staff assigned</span>
                      ) : (
                        teamHere.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-secondary px-2.5 py-1 text-xs"
                          >
                            {s.displayName}
                          </span>
                        ))
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Services offered</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {servicesHere.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No services assigned</span>
                      ) : (
                        servicesHere.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-secondary px-2.5 py-1 text-xs"
                          >
                            {s.name}
                          </span>
                        ))
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      tenant.setCurrentLocationId(l.id);
                      toast.success(`Viewing schedule for ${l.name}`);
                    }}
                  >
                    <MapPin className="size-4" /> View schedule
                  </Button>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <NewLocationDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewLocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant();
  const createLocation = useCreateLocation();
  const [name, setName] = useState("");
  const [publicVisible, setPublicVisible] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add location</DialogTitle>
          <DialogDescription>Create a new site your clients can book at.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="loc-name">Location name</Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="City Centre Studio"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Visible on booking page</p>
              <p className="text-xs text-muted-foreground">
                Clients can choose this location when booking
              </p>
            </div>
            <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createLocation.isPending}
            onClick={async () => {
              if (!name.trim()) return toast.error("Give the location a name");
              await createLocation.mutateAsync({
                name,
                type: "physical",
                timezone: tenant.business?.defaultTimezone ?? "Europe/London",
                publicVisible,
              });
              toast.success("Location created");
              setName("");
              onClose();
            }}
          >
            Create location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
