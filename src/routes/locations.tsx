import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, MapPin, Pencil, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  useCreateLocation,
  useCreateResource,
  useResources,
  useServices,
  useStaffList,
  useUpdateLocation,
  useUpdateResource,
  type OpeningHourInput,
} from "@/lib/api/hooks";
import type { Location, Resource } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

export const Route = createFileRoute("/locations")({
  head: () => ({
    meta: [
      { title: "Locations — RECAVO" },
      {
        name: "description",
        content:
          "Studio locations with opening hours, assigned staff, bookable services and resources.",
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

const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Asia/Singapore",
  "UTC",
];

const RESOURCE_TYPES = ["room", "bay", "chair", "equipment"] as const;

function minutesLabel(mins: number) {
  return `${Math.floor(mins / 60)}`.padStart(2, "0") + ":" + `${mins % 60}`.padStart(2, "0");
}

function timeInputValue(mins: number) {
  return minutesLabel(mins);
}

function parseTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

type DayHours = { enabled: boolean; openMinute: number; closeMinute: number };

function defaultDayHours(): Record<number, DayHours> {
  const days: Record<number, DayHours> = {};
  for (let d = 1; d <= 7; d++) {
    days[d] = { enabled: d <= 5, openMinute: 9 * 60, closeMinute: 17 * 60 };
  }
  return days;
}

function hoursFromLocation(location: Location): Record<number, DayHours> {
  const days = defaultDayHours();
  for (const d of Object.keys(days)) {
    days[Number(d)].enabled = false;
  }
  for (const h of location.openingHours) {
    days[h.dayOfWeek] = {
      enabled: true,
      openMinute: h.openMinute,
      closeMinute: h.closeMinute,
    };
  }
  return days;
}

function toOpeningHours(days: Record<number, DayHours>): OpeningHourInput[] {
  return Object.entries(days)
    .filter(([, v]) => v.enabled)
    .map(([day, v]) => ({
      dayOfWeek: Number(day),
      openMinute: v.openMinute,
      closeMinute: v.closeMinute,
    }));
}

function OpeningHoursEditor({
  days,
  onChange,
}: {
  days: Record<number, DayHours>;
  onChange: (days: Record<number, DayHours>) => void;
}) {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
        const row = days[day];
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
            <label className="flex w-16 items-center gap-2 text-sm">
              <Switch
                checked={row.enabled}
                onCheckedChange={(enabled) => onChange({ ...days, [day]: { ...row, enabled } })}
              />
              {DAY_NAMES[day]}
            </label>
            <Input
              type="time"
              className="w-28"
              disabled={!row.enabled}
              value={timeInputValue(row.openMinute)}
              onChange={(e) => {
                const mins = parseTimeInput(e.target.value);
                if (mins !== null) onChange({ ...days, [day]: { ...row, openMinute: mins } });
              }}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              className="w-28"
              disabled={!row.enabled}
              value={timeInputValue(row.closeMinute)}
              onChange={(e) => {
                const mins = parseTimeInput(e.target.value);
                if (mins !== null) onChange({ ...days, [day]: { ...row, closeMinute: mins } });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function LocationsPage() {
  const tenant = useTenant();
  const staff = useStaffList();
  const services = useServices();
  const resources = useResources();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const locations = tenant.locations;

  return (
    <>
      <PageHeader
        title="Locations"
        description="Every site you run, with its own hours, team, services and resources."
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
            const resourcesHere = (resources.data ?? []).filter((r) => r.locationId === l.id);
            return (
              <LocationCard
                key={l.id}
                location={l}
                team={teamHere.map((s) => s.displayName)}
                services={servicesHere.map((s) => s.name)}
                resources={resourcesHere}
                onEdit={() => setEditing(l)}
              />
            );
          })}
        </div>
      )}

      <NewLocationDialog open={creating} onClose={() => setCreating(false)} />
      <EditLocationDialog location={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function LocationCard({
  location: l,
  team,
  services,
  resources,
  onEdit,
}: {
  location: Location;
  team: string[];
  services: string[];
  resources: Resource[];
  onEdit: () => void;
}) {
  const tenant = useTenant();
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const [addingResource, setAddingResource] = useState(false);
  const [resourceName, setResourceName] = useState("");
  const [resourceType, setResourceType] = useState<(typeof RESOURCE_TYPES)[number]>("room");

  return (
    <SectionCard
      title={l.name}
      description={l.type.replace(/_/g, " ")}
      action={
        <div className="flex items-center gap-2">
          <StatusBadge status={l.active ? "active" : "inactive"} />
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit location">
            <Pencil className="size-4" />
          </Button>
        </div>
      }
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="size-4" /> {l.timezone}
        {!l.publicVisible ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
            Hidden from booking page
          </span>
        ) : null}
      </p>

      <div className="mt-4 space-y-1 text-sm">
        {l.openingHours.length === 0 ? (
          <p className="text-xs text-muted-foreground">No opening hours configured.</p>
        ) : (
          l.openingHours
            .slice()
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((h) => (
              <p key={h.dayOfWeek} className="flex justify-between text-xs text-muted-foreground">
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
            {team.length === 0 ? (
              <span className="text-xs text-muted-foreground">No staff assigned</span>
            ) : (
              team.map((name) => (
                <span key={name} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                  {name}
                </span>
              ))
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Services offered</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {services.length === 0 ? (
              <span className="text-xs text-muted-foreground">No services assigned</span>
            ) : (
              services.map((name) => (
                <span key={name} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                  {name}
                </span>
              ))
            )}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Resources</p>
            <Button variant="ghost" size="sm" onClick={() => setAddingResource((v) => !v)}>
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          {addingResource ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                placeholder="Resource name"
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                className="max-w-[160px]"
              />
              <Select
                value={resourceType}
                onValueChange={(v) => setResourceType(v as (typeof RESOURCE_TYPES)[number])}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={createResource.isPending}
                onClick={async () => {
                  if (!resourceName.trim()) return toast.error("Give the resource a name");
                  await createResource.mutateAsync({
                    name: resourceName.trim(),
                    type: resourceType,
                    locationId: l.id,
                  });
                  toast.success("Resource created");
                  setResourceName("");
                  setAddingResource(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : null}
          <ul className="mt-2 space-y-1">
            {resources.length === 0 ? (
              <li className="text-xs text-muted-foreground">No resources yet</li>
            ) : (
              resources.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {r.name}{" "}
                    <span className="text-muted-foreground">({r.type.replace(/_/g, " ")})</span>
                  </span>
                  <Switch
                    checked={r.active}
                    disabled={updateResource.isPending}
                    onCheckedChange={(active) =>
                      updateResource.mutate({ resourceId: r.id, active })
                    }
                  />
                </li>
              ))
            )}
          </ul>
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
}

function NewLocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant();
  const createLocation = useCreateLocation();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [publicVisible, setPublicVisible] = useState(true);
  const [days, setDays] = useState(defaultDayHours);

  useEffect(() => {
    if (open) {
      setName("");
      setTimezone(tenant.business?.defaultTimezone ?? "Europe/London");
      setPublicVisible(true);
      setDays(defaultDayHours());
    }
  }, [open, tenant.business?.defaultTimezone]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
          <div className="grid gap-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Opening hours</Label>
            <OpeningHoursEditor days={days} onChange={setDays} />
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
                name: name.trim(),
                type: "physical",
                timezone,
                openingHours: toOpeningHours(days),
                publicVisible,
              });
              toast.success("Location created");
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

function EditLocationDialog({
  location,
  onClose,
}: {
  location: Location | null;
  onClose: () => void;
}) {
  const updateLocation = useUpdateLocation();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [publicVisible, setPublicVisible] = useState(true);
  const [active, setActive] = useState(true);
  const [days, setDays] = useState(defaultDayHours());

  useEffect(() => {
    if (!location) return;
    setName(location.name);
    setTimezone(location.timezone);
    setPublicVisible(location.publicVisible);
    setActive(location.active);
    setDays(hoursFromLocation(location));
  }, [location]);

  return (
    <Dialog open={Boolean(location)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit location</DialogTitle>
          <DialogDescription>Update hours, visibility and status.</DialogDescription>
        </DialogHeader>
        {location ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-loc-name">Location name</Label>
              <Input id="edit-loc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Opening hours</Label>
              <OpeningHoursEditor days={days} onChange={setDays} />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Visible on booking page</p>
              </div>
              <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive locations are hidden from scheduling
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={updateLocation.isPending || !location}
            onClick={async () => {
              if (!location || !name.trim()) return toast.error("Give the location a name");
              try {
                await updateLocation.mutateAsync({
                  locationId: location.id,
                  version: location.version,
                  body: {
                    name: name.trim(),
                    timezone,
                    openingHours: toOpeningHours(days),
                    publicVisible,
                    active,
                  },
                });
                toast.success("Location updated");
                onClose();
              } catch {
                /* toasted by hook; 409 triggers refetch */
              }
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
