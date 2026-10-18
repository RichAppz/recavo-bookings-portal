import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  GroupedBlock,
  SettingsEmptyState,
  SettingsPage,
  SwitchRow,
} from "@/components/settings/primitives";
import { PersonAvatar } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditEvents, useMemberships } from "@/lib/api/hooks";
import type { AuditEvent } from "@/lib/api/types";
import { userDisplayName } from "@/lib/api/types";
import { formatInTz } from "@/lib/format";
import {
  auditActionGroup,
  auditActionLabel,
  auditActorLabel,
  auditTargetLabel,
} from "@/lib/settings-labels";
import { useTenant } from "@/lib/tenant/tenant-context";

const PAGE_SIZE = 25;

type DateRange = "any" | "today" | "7d" | "30d";

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  any: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function rangeStart(range: DateRange, now: Date): number | null {
  if (range === "any") return null;
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

function dayHeading(iso: string, tz: string): string {
  const today = dayKey(new Date().toISOString(), tz);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), tz);
  const key = dayKey(iso, tz);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return formatInTz(iso, tz, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Settings → Activity log (spec §5): the audit trail as people would read it.
 * Search, person / type / date filters and a "Show system activity" switch that
 * is off by default so routine jobs do not bury what the team did. Everything
 * filters the events the API already returned; nothing is dropped from the data.
 */
export function ActivityPage() {
  const events = useAuditEvents();
  const memberships = useMemberships();
  const tz = useTenant().business?.defaultTimezone ?? "Europe/London";

  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("anyone");
  const [group, setGroup] = useState("all");
  const [range, setRange] = useState<DateRange>("any");
  const [showSystem, setShowSystem] = useState(false);
  const [page, setPage] = useState(0);

  // Audit rows carry the actor's user id; the team list turns it into a name.
  const nameFor = useMemo(() => {
    // Depending on the module, the actor is recorded by user, membership or staff id.
    const byId = new Map<string, string>();
    for (const m of memberships.data ?? []) {
      const name = userDisplayName(m.user, "Team member");
      byId.set(m.userId, name);
      byId.set(m.id, name);
      if (m.staffId) byId.set(m.staffId, name);
    }
    return (event: AuditEvent): string => {
      if (event.actorType === "system") return "System";
      return byId.get(event.actorId) ?? auditActorLabel(event.actorType);
    };
  }, [memberships.data]);

  const all = useMemo(() => events.data ?? [], [events.data]);
  const systemCount = all.filter((e) => e.actorType === "system").length;

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of all) {
      if (e.actorType === "system") continue;
      if (!seen.has(e.actorId)) seen.set(e.actorId, nameFor(e));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all, nameFor]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const e of all) set.add(auditActionGroup(e.action));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = rangeStart(range, new Date());
    return all.filter((e) => {
      if (!showSystem && e.actorType === "system") return false;
      if (person !== "anyone" && e.actorId !== person) return false;
      if (group !== "all" && auditActionGroup(e.action) !== group) return false;
      if (since !== null && new Date(e.occurredAt).getTime() < since) return false;
      if (q) {
        const hay = [
          auditActionLabel(e.action),
          auditActionGroup(e.action),
          auditTargetLabel(e.targetType),
          nameFor(e),
          e.action,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, query, person, group, range, showSystem, nameFor]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const hiddenSystem = showSystem ? 0 : systemCount;

  const byDay: { key: string; heading: string; rows: AuditEvent[] }[] = [];
  for (const e of slice) {
    const key = dayKey(e.occurredAt, tz);
    const last = byDay[byDay.length - 1];
    if (last && last.key === key) last.rows.push(e);
    else byDay.push({ key, heading: dayHeading(e.occurredAt, tz), rows: [e] });
  }

  const resetPage = () => setPage(0);

  return (
    <SettingsPage title="Activity log" description="Who did what in your business, newest first.">
      <div className="grid gap-4 pt-1">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search activity"
              aria-label="Search activity"
              className="pl-9"
            />
          </div>
          <Select
            value={person}
            onValueChange={(v) => {
              setPerson(v);
              resetPage();
            }}
          >
            <SelectTrigger aria-label="Person" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anyone">Anyone</SelectItem>
              {people.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={group}
            onValueChange={(v) => {
              setGroup(v);
              resetPage();
            }}
          >
            <SelectTrigger aria-label="Type" className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={range}
            onValueChange={(v) => {
              setRange(v as DateRange);
              resetPage();
            }}
          >
            <SelectTrigger aria-label="Date range" className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {DATE_RANGE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <GroupedBlock>
          <SwitchRow
            id="activity-show-system"
            label="Show system activity"
            hint="Automatic jobs like retention runs and file scans."
            checked={showSystem}
            onCheckedChange={(v) => {
              setShowSystem(v);
              resetPage();
            }}
          />
        </GroupedBlock>

        {events.isLoading ? (
          <TableGhost />
        ) : events.isError ? (
          <p className="text-sm text-destructive">
            Couldn't load the activity log. Please try again shortly.
          </p>
        ) : filtered.length === 0 ? (
          <SettingsEmptyState
            title={all.length === 0 ? "Nothing here yet" : "Nothing matches"}
            description={
              all.length === 0
                ? "Actions your team takes will show up here."
                : hiddenSystem > 0 && all.length === systemCount
                  ? "Only system activity so far. Turn on Show system activity to see it."
                  : "Try a different search or clear a filter."
            }
          />
        ) : (
          <div className="grid gap-5">
            {byDay.map((day) => (
              <section key={day.key} aria-label={day.heading}>
                <h3 className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                  {day.heading}
                </h3>
                <GroupedBlock as="ul">
                  {day.rows.map((e) => {
                    const who = nameFor(e);
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <PersonAvatar name={who} size={32} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {auditActionLabel(e.action)}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {who}
                            {e.targetType ? ` · ${auditTargetLabel(e.targetType)}` : ""}
                          </p>
                        </div>
                        <time
                          dateTime={e.occurredAt}
                          className="shrink-0 text-xs text-muted-foreground tabular-nums"
                        >
                          {formatInTz(e.occurredAt, tz, { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </li>
                    );
                  })}
                </GroupedBlock>
              </section>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" role="status">
              Showing {start + 1} to {Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
              {hiddenSystem > 0
                ? ` · ${hiddenSystem} system ${hiddenSystem === 1 ? "event" : "events"} hidden`
                : ""}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safePage + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsPage>
  );
}
