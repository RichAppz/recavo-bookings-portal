import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Mail, Phone, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { PageHeader, PersonAvatar, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useDemo } from "@/lib/demo-store";
import { gbp, ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff — RECAVO" },
      {
        name: "description",
        content:
          "Trainer profiles, weekly availability, assigned services and locations, permissions and performance.",
      },
      { property: "og:title", content: "RECAVO Staff" },
      { property: "og:description", content: "Manage trainers, availability patterns and permissions." },
    ],
  }),
  component: StaffPage,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PATTERN: Record<string, string> = {
  Mon: "06:00 – 14:00",
  Tue: "06:00 – 14:00",
  Wed: "10:00 – 19:00",
  Thu: "06:00 – 14:00",
  Fri: "06:00 – 13:00",
  Sat: "08:00 – 12:00",
  Sun: "Unavailable",
};

function StaffPage() {
  const demo = useDemo();
  const [selected, setSelected] = useState(demo.staff[0].id);
  const [quick, setQuick] = useState<QuickAction>(null);
  const member = demo.staffById(selected);

  return (
    <AppShell>
      <PageHeader
        title="Staff"
        description="Who works where, what they deliver and when they're available."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuick("block")}>
              <CalendarOff className="size-4" /> Block time
            </Button>
            <Button onClick={() => toast.success("Invite sent to new team member")}>
              <Plus className="size-4" /> Invite staff
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Team members" value={String(demo.staff.length)} />
        <StatCard
          label="Sessions this week"
          value={String(demo.staff.reduce((s, m) => s + m.weeklyBookings, 0))}
          change={5.6}
        />
        <StatCard label="Team revenue" value={gbp(demo.staff.reduce((s, m) => s + m.revenue, 0))} change={8.3} />
        <StatCard
          label="Availability gaps"
          value={String(demo.staff.filter((s) => !s.availabilityComplete).length)}
          hint="profiles to complete"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <SectionCard title="Team" bodyClassName="p-0">
          <ul className="divide-y">
            {demo.staff.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setSelected(m.id)}
                  className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                    m.id === selected ? "bg-primary-soft" : "hover:bg-secondary/60"
                  }`}
                >
                  <PersonAvatar name={m.name} src={m.avatar} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.role}</span>
                  </span>
                  {!m.availabilityComplete ? <StatusBadge status="incomplete" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <PersonAvatar name={member.name} src={member.avatar} size={64} />
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{member.name}</h2>
                <p className="text-sm text-muted-foreground">{member.role} · {member.permission}</p>
                <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{member.email}</span>
                  <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{member.phone}</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{member.weeklyBookings}</p>
                  <p className="text-xs text-muted-foreground">sessions / week</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{gbp(member.revenue)}</p>
                  <p className="text-xs text-muted-foreground">revenue / month</p>
                </div>
              </div>
            </div>
            <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{member.bio}</p>
          </SectionCard>

          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard title="Services delivered">
              <ul className="space-y-2">
                {member.services.map((id) => (
                  <li key={id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                    <span>{demo.serviceById(id).name}</span>
                    <span className="text-xs text-muted-foreground">{demo.serviceById(id).duration} min</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Locations">
              <ul className="space-y-2">
                {member.locations.map((id) => (
                  <li key={id} className="rounded-xl border px-3 py-2 text-sm">
                    <p className="font-medium">{demo.locationById(id).name}</p>
                    <p className="text-xs text-muted-foreground">
                      {demo.locationById(id).address}, {demo.locationById(id).postcode}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <SectionCard
            title="Weekly availability"
            description="Recurring working pattern used by the booking page"
            action={<Button variant="outline" size="sm" onClick={() => toast.success("Availability saved")}>Save pattern</Button>}
          >
            <ul className="divide-y">
              {DAYS.map((day) => (
                <li key={day} className="flex items-center justify-between py-3">
                  <span className="w-16 text-sm font-medium">{day}</span>
                  <span className="flex-1 text-sm text-muted-foreground">{PATTERN[day]}</span>
                  <Switch
                    defaultChecked={PATTERN[day] !== "Unavailable"}
                    onCheckedChange={(v) => toast.success(`${day} ${v ? "enabled" : "disabled"} for ${member.name.split(" ")[0]}`)}
                  />
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Time off and blocks" bodyClassName="p-0">
            <ul className="divide-y">
              {demo.blockedTimes.filter((b) => b.staffId === member.id).map((b) => (
                <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{b.reason}</span>
                  <span className="text-xs text-muted-foreground">{ukDate(b.date)} · {b.time} · {b.duration} min</span>
                </li>
              ))}
              {demo.blockedTimes.filter((b) => b.staffId === member.id).length === 0 ? (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">No time off booked.</li>
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>

      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </AppShell>
  );
}
