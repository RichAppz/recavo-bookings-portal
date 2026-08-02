import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ApiError } from "@/lib/api";
import {
  useCreateLocation,
  useCreateResource,
  useLocationsList,
  useResources,
  useServices,
  useStaffList,
  useUpdateLocation,
  useUpdateResource,
} from "@/lib/api/hooks";
import type { Location, Resource } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { minutesToTime, timeToMinutes } from "@/lib/format";
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

// API `dayOfWeek` is 1 (Monday) .. 7 (Sunday) — see openapi.json Location.openingHours.
const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LOCATION_TYPES = [
  { value: "physical", label: "Physical site" },
  { value: "mobile", label: "Mobile (trainer travels)" },
  { value: "customer_address", label: "Customer's address" },
  { value: "service_area", label: "Service area" },
] as const;

const RESOURCE_TYPES = ["room", "bay", "chair", "equipment"] as const;

function minutesLabel(mins: number) {
  return minutesToTime(mins);
}

function LocationsPage() {
  const tenant = useTenant();
  const staff = useStaffList();
  const services = useServices();
  // Same query key as `tenant.locations` — shares cache, adds isError/refetch.
  const locationsQuery = useLocationsList();
  const resources = useResources();
  const updateResource = useUpdateResource();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [addingResourceFor, setAddingResourceFor] = useState<Location | null>(null);

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
      ) : locationsQuery.isError ? (
        <EmptyState
          title="Couldn't load locations"
          description={
            locationsQuery.error instanceof ApiError
              ? locationsQuery.error.detail || locationsQuery.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => locationsQuery.refetch()}>Try again</Button>}
        />
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
            const resourceTypesNeeded = new Set(
              servicesHere.map((s) => s.requiredResourceType).filter(Boolean),
            );
            return (
              <SectionCard
                key={l.id}
                title={l.name}
                description={LOCATION_TYPES.find((t) => t.value === l.type)?.label ?? l.type}
                action={
                  <div className="flex items-center gap-2">
                    <StatusBadge status={l.active ? "active" : "inactive"} />
                    <Button variant="ghost" size="sm" onClick={() => setEditing(l)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                }
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
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Resources</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setAddingResourceFor(l)}
                      >
                        <Plus className="size-3" /> Add
                      </Button>
                    </div>
                    {resourcesHere.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">No resources yet</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {resourcesHere.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              {r.name}
                              <span className="text-muted-foreground">({r.type})</span>
                              {resourceTypesNeeded.has(r.type) ? null : (
                                <span
                                  className="text-muted-foreground"
                                  title="No assigned service currently requires this resource type"
                                >
                                  · unused
                                </span>
                              )}
                            </span>
                            <Switch
                              checked={r.active}
                              disabled={updateResource.isPending}
                              onCheckedChange={(v) =>
                                updateResource.mutate(
                                  { resourceId: r.id, active: v },
                                  {
                                    onSuccess: () =>
                                      toast.success(v ? "Resource activated" : "Resource paused"),
                                  },
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
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

      <LocationDialog
        open={creating || editing !== null}
        location={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <ResourceDialog
        open={addingResourceFor !== null}
        location={addingResourceFor}
        onClose={() => setAddingResourceFor(null)}
      />
    </>
  );
}

type OpeningHourRow = { dayOfWeek: number; openMinute: number; closeMinute: number };

function toOpeningHourRows(location: Location | null): OpeningHourRow[] {
  if (!location) return [];
  return location.openingHours.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    openMinute: h.openMinute,
    closeMinute: h.closeMinute,
  }));
}

function LocationDialog({
  open,
  location,
  onClose,
}: {
  open: boolean;
  location: Location | null;
  onClose: () => void;
}) {
  const tenant = useTenant();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const [name, setName] = useState(location?.name ?? "");
  const [type, setType] = useState<(typeof LOCATION_TYPES)[number]["value"]>(
    location?.type ?? "physical",
  );
  const [timezone, setTimezone] = useState(
    location?.timezone ?? tenant.business?.defaultTimezone ?? "Europe/London",
  );
  const [publicVisible, setPublicVisible] = useState(location?.publicVisible ?? true);
  const [active, setActive] = useState(location?.active ?? true);
  const [openingHours, setOpeningHours] = useState<OpeningHourRow[]>(() =>
    toOpeningHourRows(location),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = createLocation.isPending || updateLocation.isPending;

  const resetFrom = (l: Location | null) => {
    setName(l?.name ?? "");
    setType(l?.type ?? "physical");
    setTimezone(l?.timezone ?? tenant.business?.defaultTimezone ?? "Europe/London");
    setPublicVisible(l?.publicVisible ?? true);
    setActive(l?.active ?? true);
    setOpeningHours(toOpeningHourRows(l));
    setFieldErrors({});
  };

  const addRow = () =>
    setOpeningHours((rows) => [
      ...rows,
      { dayOfWeek: 1, openMinute: timeToMinutes("09:00"), closeMinute: timeToMinutes("17:00") },
    ]);
  const updateRow = (index: number, patch: Partial<OpeningHourRow>) =>
    setOpeningHours((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const removeRow = (index: number) =>
    setOpeningHours((rows) => rows.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Give the location a name");
      throw new Error("validation");
    }

    setFieldErrors({});
    try {
      if (location) {
        await updateLocation.mutateAsync({
          locationId: location.id,
          version: location.version,
          body: { name, timezone, openingHours, active, publicVisible },
        });
        toast.success("Location updated");
      } else {
        await createLocation.mutateAsync({ name, type, timezone, openingHours, publicVisible });
        toast.success("Location created");
      }
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(
            err.fieldErrors
              .filter((fe) => fe.field)
              .map((fe) => [fe.field, fe.message || fe.code || "Invalid"]),
          ),
        }));
      }
      throw err;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else resetFrom(location);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle>
          <DialogDescription>
            {location
              ? "Update opening hours, visibility and status."
              : "Create a new site your clients can book at."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="loc-name">Location name</Label>
              <Input
                id="loc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="City Centre Studio"
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name ? (
                <p className="text-xs text-destructive">{fieldErrors.name}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as typeof type)}
                disabled={Boolean(location)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {location ? (
                <p className="text-xs text-muted-foreground">
                  Type can't be changed after creation.
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="loc-tz">Timezone</Label>
            <Input
              id="loc-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/London"
              aria-invalid={Boolean(fieldErrors.timezone)}
            />
            {fieldErrors.timezone ? (
              <p className="text-xs text-destructive">{fieldErrors.timezone}</p>
            ) : null}
          </div>

          <div className="grid gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Opening hours</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="size-3.5" /> Add hours
              </Button>
            </div>
            {openingHours.length === 0 ? (
              <p className="text-xs text-muted-foreground">No opening hours set.</p>
            ) : (
              <div className="space-y-2">
                {openingHours.map((h, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">Day</Label>
                      <Select
                        value={String(h.dayOfWeek)}
                        onValueChange={(v) => updateRow(i, { dayOfWeek: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_NAMES.slice(1).map((day, di) => (
                            <SelectItem key={day} value={String(di + 1)}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">Opens</Label>
                      <Input
                        type="time"
                        value={minutesToTime(h.openMinute)}
                        onChange={(e) =>
                          updateRow(i, { openMinute: timeToMinutes(e.target.value) })
                        }
                      />
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">Closes</Label>
                      <Input
                        type="time"
                        value={minutesToTime(h.closeMinute)}
                        onChange={(e) =>
                          updateRow(i, { closeMinute: timeToMinutes(e.target.value) })
                        }
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Visible on booking page</p>
                <p className="text-xs text-muted-foreground">
                  Clients can choose this location when booking
                </p>
              </div>
              <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
            </div>
            {location ? (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Allow new bookings here</p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              try {
                await handleSubmit();
                onClose();
              } catch {
                // Errors are surfaced via toast/inline field messages above.
              }
            }}
          >
            {submitting ? "Saving…" : location ? "Save changes" : "Create location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourceDialog({
  open,
  location,
  onClose,
}: {
  open: boolean;
  location: Location | null;
  onClose: () => void;
}) {
  const services = useServices();
  const createResource = useCreateResource();
  const [name, setName] = useState("");
  const [type, setType] = useState<Resource["type"]>("room");

  const neededTypes = new Set(
    (services.data ?? [])
      .filter(
        (s) => location && (s.locationIds.length === 0 || s.locationIds.includes(location.id)),
      )
      .map((s) => s.requiredResourceType)
      .filter(Boolean),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setName("");
          setType("room");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add resource</DialogTitle>
          <DialogDescription>
            {location ? `A bookable room, bay, chair or equipment at ${location.name}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="res-name">Name</Label>
            <Input
              id="res-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Studio 1"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as Resource["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t} {neededTypes.has(t) ? "· required by a service here" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Type must match a service's "required resource type" for that service to be bookable
              against this resource.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createResource.isPending}
            onClick={async () => {
              if (!name.trim() || !location) return toast.error("Give the resource a name");
              await createResource.mutateAsync({ name, type, locationId: location.id });
              toast.success("Resource created");
              onClose();
            }}
          >
            Create resource
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
