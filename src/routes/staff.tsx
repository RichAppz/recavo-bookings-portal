import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  useCreateStaff,
  useInviteStaff,
  useLocationsList,
  useRemoveStaffTimeOff,
  useServices,
  useStaffList,
  useUpdateStaff,
} from "@/lib/api/hooks";
import type { Staff } from "@/lib/api/types";
import { formatInTz, minutesToTime, timeToMinutes, ukDate } from "@/lib/format";
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

// API `dayOfWeek` is 1 (Monday) .. 7 (Sunday) — see openapi.json Staff.workingRules.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function minutesLabel(mins: number) {
  return minutesToTime(mins);
}

function StaffPage() {
  const staff = useStaffList();
  const services = useServices();
  const locations = useLocationsList();
  const removeTimeOff = useRemoveStaffTimeOff();
  const [selected, setSelected] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickAction>(null);
  const [inviting, setInviting] = useState(false);
  const [staffDialog, setStaffDialog] = useState<"create" | Staff | null>(null);

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
            <Button variant="outline" onClick={() => setInviting(true)}>
              Invite by email
            </Button>
            <Button onClick={() => setStaffDialog("create")}>
              <Plus className="size-4" /> Add staff
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
        <EmptyState
          title="Couldn't load staff"
          description={
            staff.error instanceof ApiError
              ? staff.error.detail || staff.error.title
              : "Please try again shortly."
          }
          action={<Button onClick={() => staff.refetch()}>Try again</Button>}
        />
      ) : list.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add your first team member to start assigning bookings."
          action={<Button onClick={() => setStaffDialog("create")}>Add staff</Button>}
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
                    <span className="relative shrink-0">
                      <PersonAvatar name={m.displayName} size={40} />
                      {m.calendarColour ? (
                        <span
                          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background"
                          style={{ backgroundColor: m.calendarColour }}
                        />
                      ) : null}
                    </span>
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
                  <Button variant="outline" size="sm" onClick={() => setStaffDialog(member)}>
                    <Pencil className="size-4" /> Edit profile
                  </Button>
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
                      const dayOfWeek = i + 1; // API: 1 = Monday .. 7 = Sunday
                      const rules = member.workingRules.filter((r) => r.dayOfWeek === dayOfWeek);
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

              <SectionCard
                title="Time off and blocks"
                description="Half-open [start, end) periods — the end instant itself is bookable again"
                bodyClassName="p-0"
              >
                <ul className="divide-y">
                  {member.timeOff.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{b.reason ?? "Blocked"}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatInTz(b.start, b.originatingTimezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        – {formatInTz(b.end, b.originatingTimezone, { timeStyle: "short" })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        disabled={removeTimeOff.isPending}
                        onClick={() =>
                          removeTimeOff.mutate(
                            { staffId: member.id, timeOffId: b.id, version: member.version },
                            { onSuccess: () => toast.success("Time off removed") },
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
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
      <StaffDialog
        open={staffDialog !== null}
        staff={staffDialog === "create" ? null : staffDialog}
        onClose={() => setStaffDialog(null)}
      />
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

type WorkingRuleRow = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  locationId: string | null;
};

function toWorkingRuleRows(staff: Staff | null): WorkingRuleRow[] {
  if (!staff) return [];
  return staff.workingRules.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    locationId: r.locationId,
  }));
}

function StaffDialog({
  open,
  staff,
  onClose,
}: {
  open: boolean;
  staff: Staff | null;
  onClose: () => void;
}) {
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const services = useServices();
  const locations = useLocationsList();

  const [displayName, setDisplayName] = useState(staff?.displayName ?? "");
  const [title, setTitle] = useState(staff?.title ?? "");
  const [bio, setBio] = useState(staff?.bio ?? "");
  const [calendarColour, setCalendarColour] = useState(staff?.calendarColour ?? "#6366f1");
  const [bookingVisible, setBookingVisible] = useState(staff?.bookingVisible ?? true);
  const [status, setStatus] = useState<"active" | "invited" | "suspended">(
    staff?.status ?? "active",
  );
  const [eligibleServiceIds, setEligibleServiceIds] = useState<string[]>(
    staff?.eligibleServiceIds ?? [],
  );
  const [locationIds, setLocationIds] = useState<string[]>(staff?.locationIds ?? []);
  const [workingRules, setWorkingRules] = useState<WorkingRuleRow[]>(() =>
    toWorkingRuleRows(staff),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submitting = createStaff.isPending || updateStaff.isPending;

  const resetFrom = (s: Staff | null) => {
    setDisplayName(s?.displayName ?? "");
    setTitle(s?.title ?? "");
    setBio(s?.bio ?? "");
    setCalendarColour(s?.calendarColour ?? "#6366f1");
    setBookingVisible(s?.bookingVisible ?? true);
    setStatus(s?.status ?? "active");
    setEligibleServiceIds(s?.eligibleServiceIds ?? []);
    setLocationIds(s?.locationIds ?? []);
    setWorkingRules(toWorkingRuleRows(s));
    setFieldErrors({});
  };

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const addWorkingRule = () =>
    setWorkingRules((rows) => [
      ...rows,
      {
        dayOfWeek: 1,
        startMinute: timeToMinutes("09:00"),
        endMinute: timeToMinutes("17:00"),
        locationId: null,
      },
    ]);

  const updateWorkingRule = (index: number, patch: Partial<WorkingRuleRow>) =>
    setWorkingRules((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const removeWorkingRule = (index: number) =>
    setWorkingRules((rows) => rows.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast.error("Give the staff member a name");
      throw new Error("validation");
    }

    const body: Record<string, unknown> = {
      displayName: displayName.trim(),
      title: title.trim() || null,
      bio: bio.trim() || null,
      calendarColour: calendarColour || null,
      bookingVisible,
      eligibleServiceIds,
      locationIds,
      workingRules,
    };

    setFieldErrors({});
    try {
      if (staff) {
        await updateStaff.mutateAsync({
          staffId: staff.id,
          version: staff.version,
          body: { ...body, status },
        });
        toast.success("Staff profile updated");
      } else {
        await createStaff.mutateAsync(body);
        toast.success("Staff profile created");
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
        else resetFrom(staff);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{staff ? "Edit staff profile" : "Add staff"}</DialogTitle>
          <DialogDescription>
            Working hours, services delivered and locations used across booking and availability.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="st-name">Name</Label>
              <Input
                id="st-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jordan Ellis"
                aria-invalid={Boolean(fieldErrors.displayName)}
              />
              {fieldErrors.displayName ? (
                <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="st-title">Title</Label>
              <Input
                id="st-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Personal Trainer"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-bio">Bio</Label>
            <Textarea id="st-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="st-colour">Calendar colour</Label>
              <div className="flex items-center gap-2">
                <input
                  id="st-colour"
                  type="color"
                  value={calendarColour || "#6366f1"}
                  onChange={(e) => setCalendarColour(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-input"
                />
                <Input
                  value={calendarColour}
                  onChange={(e) => setCalendarColour(e.target.value)}
                  placeholder="#6366f1"
                />
              </div>
            </div>
            {staff ? (
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Visible for booking</p>
                  <p className="text-xs text-muted-foreground">Clients can select this trainer</p>
                </div>
                <Switch checked={bookingVisible} onCheckedChange={setBookingVisible} />
              </div>
            )}
          </div>
          {staff ? (
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Visible for booking</p>
                <p className="text-xs text-muted-foreground">Clients can select this trainer</p>
              </div>
              <Switch checked={bookingVisible} onCheckedChange={setBookingVisible} />
            </div>
          ) : null}
          {fieldErrors.status ? (
            <p className="text-xs text-destructive">{fieldErrors.status}</p>
          ) : null}

          <div className="grid gap-2 border-t pt-4">
            <Label>Services delivered</Label>
            {(services.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No services created yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(services.data ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={eligibleServiceIds.includes(s.id)}
                      onCheckedChange={() => setEligibleServiceIds((ids) => toggleId(ids, s.id))}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to allow any service.
            </p>
          </div>

          <div className="grid gap-2 border-t pt-4">
            <Label>Locations</Label>
            {(locations.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No locations created yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(locations.data ?? []).map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={locationIds.includes(l.id)}
                      onCheckedChange={() => setLocationIds((ids) => toggleId(ids, l.id))}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to make this trainer available everywhere.
            </p>
          </div>

          <div className="grid gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Working hours</Label>
              <Button type="button" variant="outline" size="sm" onClick={addWorkingRule}>
                <Plus className="size-3.5" /> Add hours
              </Button>
            </div>
            {workingRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recurring working hours set.</p>
            ) : (
              <div className="space-y-2">
                {workingRules.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">Day</Label>
                      <Select
                        value={String(r.dayOfWeek)}
                        onValueChange={(v) => updateWorkingRule(i, { dayOfWeek: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((day, di) => (
                            <SelectItem key={day} value={String(di + 1)}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input
                        type="time"
                        value={minutesToTime(r.startMinute)}
                        onChange={(e) =>
                          updateWorkingRule(i, { startMinute: timeToMinutes(e.target.value) })
                        }
                      />
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input
                        type="time"
                        value={minutesToTime(r.endMinute)}
                        onChange={(e) =>
                          updateWorkingRule(i, { endMinute: timeToMinutes(e.target.value) })
                        }
                      />
                    </div>
                    <div className="grid min-w-40 flex-1 gap-1">
                      <Label className="text-xs text-muted-foreground">Location</Label>
                      <Select
                        value={r.locationId ?? "any"}
                        onValueChange={(v) =>
                          updateWorkingRule(i, { locationId: v === "any" ? null : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any location</SelectItem>
                          {(locations.data ?? []).map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeWorkingRule(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
            {submitting ? "Saving…" : staff ? "Save changes" : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
