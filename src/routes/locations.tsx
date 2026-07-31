import { createFileRoute } from "@tanstack/react-router";
import { Building2, Clock, MapPin, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-store";
import { gbp } from "@/lib/format";
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
  component: LocationsPage,
});

function LocationsPage() {
  const demo = useDemo();

  return (
    <AppShell>
      <PageHeader
        title="Locations"
        description="Every site you run, with its own hours, team and services."
        actions={
          <Button onClick={() => toast.success("Location draft created")}>
            <Plus className="size-4" /> Add location
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active locations" value={String(demo.locations.length)} icon={<Building2 className="size-4" />} />
        <StatCard
          label="Bookings this month"
          value={String(demo.locations.reduce((s, l) => s + l.monthlyBookings, 0))}
          change={7.4}
        />
        <StatCard label="Location revenue" value={gbp(demo.locations.reduce((s, l) => s + l.revenue, 0))} change={9.2} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {demo.locations.map((l) => (
          <SectionCard
            key={l.id}
            title={l.name}
            description={`${l.address}, ${l.city} ${l.postcode}`}
            action={<StatusBadge status={l.active ? "active" : "inactive"} />}
          >
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" /> {l.openingHours}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Bookings / month</p>
                <p className="text-xl font-semibold tabular-nums">{l.monthlyBookings}</p>
              </div>
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Revenue / month</p>
                <p className="text-xl font-semibold tabular-nums">{gbp(l.revenue)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Team</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {l.staff.map((id) => (
                    <span key={id} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {demo.staffById(id).name}
                    </span>
                  ))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Services offered</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {l.services.map((id) => (
                    <span key={id} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {demo.serviceById(id).name}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success(`${l.name} details saved`)}>
                Edit location
              </Button>
              <Button variant="ghost" size="sm" onClick={() => demo.setCurrentLocation(l.id)}>
                <MapPin className="size-4" /> View schedule
              </Button>
            </div>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
