import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import {
  EmptyState,
  PageHeader,
  PersonAvatar,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useInviteStaff, useLocationsList, useServices, useStaffList } from "@/lib/api/hooks";
import { formatInTz, ukDate } from "@/lib/format";
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
      {
        property: "og:description",
        content: "Manage trainers, availability patterns and permissions.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <StaffPage />
      </AppShell>
    </RequireAuth>
  ),
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function minutesLabel(mins: number) {
  return `${Math.floor(mins / 60)}`.padStart(2, "0") + ":" + `${mins % 60}`.padStart(2, "0");
}

function StaffPage() {
  const staff = useStaffList();
  const services = useServices();
  const locations = useLocationsList();
  const [selected, setSelected] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickAction>(null);
  const [inviting, setInviting] = useState(false);

  const list = staff.data ?? [];
  const selectedId = selected ?? list[0]?.id ?? null;
  const member = list.find((m) => m.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who works where, what they deliver and when they're available."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuick("block")}>
              <CalendarOff className="size-4" /> Block time
            </Button>
            <Button onClick={() => setInviting(true)}>
              <Plus className="size-4" /> Invite staff
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Team members" value={String(list.length)} />
        <StatCard label="Active" value={String(list.filter((s) => s.status === "active").length)} />
        <StatCard
          label="Pending invitations"
          value={String(list.filter((s) => s.status === "invited").length)}
        />
      </div>

      {staff.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : staff.isError ? (
        <EmptyState title="Couldn't load staff" description="Please try again shortly." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Invite your first team member to start assigning bookings."
          action={<Button onClick={() => setInviting(true)}>Invite staff</Button>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <SectionCard title="Team" bodyClassName="p-0">
            <ul className="divide-y">
              {list.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelected(m.id)}
                    className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                      m.id === selectedId ? "bg-primary-soft" : "hover:bg-secondary/60"
                    }`}
                  >
                    <PersonAvatar name={m.displayName} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.title ?? "Team member"}
                      </span>
                    </span>
                    {m.status !== "active" ? <StatusBadge status={m.status} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          {member ? (
            <div className="space-y-5">
              <SectionCard>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <PersonAvatar name={member.displayName} size={64} />
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold">{member.displayName}</h2>
                    <p className="text-sm text-muted-foreground">{member.title ?? "Team member"}</p>
                  </div>
                  <StatusBadge status={member.status} />
                </div>
                {member.bio ? (
                  <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{member.bio}</p>
                ) : null}
              </SectionCard>

              <div className="grid gap-5 md:grid-cols-2">
                <SectionCard title="Services delivered">
                  {member.eligibleServiceIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No services assigned yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {member.eligibleServiceIds.map((id) => {
                        const svc = services.data?.find((s) => s.id === id);
                        return (
                          <li
                            key={id}
                            className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                          >
                            <span>{svc?.name ?? id}</span>
                            {svc ? (
                              <span className="text-xs text-muted-foreground">
                                {svc.durationMinutes} min
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard title="Locations">
                  {member.locationIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Available at all locations.</p>
                  ) : (
                    <ul className="space-y-2">
                      {member.locationIds.map((id) => {
                        const loc = locations.data?.find((l) => l.id === id);
                        return (
                          <li key={id} className="rounded-xl border px-3 py-2 text-sm">
                            <p className="font-medium">{loc?.name ?? id}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <SectionCard
                title="Weekly availability"
                description="Recurring working pattern used by the booking page"
              >
                {member.workingRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No working hours configured yet.</p>
                ) : (
                  <ul className="divide-y">
                    {DAYS.map((day, i) => {
                      const rules = member.workingRules.filter((r) => r.dayOfWeek === i);
                      return (
                        <li key={day} className="flex items-center justify-between py-3">
                          <span className="w-16 text-sm font-medium">{day}</span>
                          <span className="flex-1 text-sm text-muted-foreground">
                            {rules.length === 0
                              ? "Unavailable"
                              : rules
                                  .map(
                                    (r) =>
                                      `${minutesLabel(r.startMinute)} – ${minutesLabel(r.endMinute)}`,
                                  )
                                  .join(", ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Time off and blocks" bodyClassName="p-0">
                <ul className="divide-y">
                  {member.timeOff.map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span>{b.reason ?? "Blocked"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatInTz(b.start, b.originatingTimezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        – {formatInTz(b.end, b.originatingTimezone, { timeStyle: "short" })}
                      </span>
                    </li>
                  ))}
                  {member.timeOff.length === 0 ? (
                    <li className="px-5 py-6 text-center text-sm text-muted-foreground">
                      No time off booked.
                    </li>
                  ) : null}
                </ul>
              </SectionCard>
            </div>
          ) : null}
        </div>
      )}

      <InviteStaffDialog open={inviting} onClose={() => setInviting(false)} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function InviteStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invite = useInviteStaff();
  const [email, setEmail] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>
            Send an invitation to join your team as a staff member.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.trainer@example.co.uk"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invite.isPending}
            onClick={async () => {
              if (!email.trim()) return toast.error("Enter an email address");
              await invite.mutateAsync({ email, roleKeys: ["staff"] });
              toast.success("Invitation sent");
              setEmail("");
              onClose();
            }}
          >
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
