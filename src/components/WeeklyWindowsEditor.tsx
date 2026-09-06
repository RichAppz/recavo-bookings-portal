import { Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ISO_WEEKDAY_LABELS,
  sameWindows,
  type AvailabilityWindow,
} from "@/lib/availability-windows";
import { minutesToTime, timeToMinutes } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";

const DEFAULT_START = timeToMinutes("09:00");
const DEFAULT_END = timeToMinutes("17:00");

/** The business's opening hours, offered as a one-click preset. */
export type BusinessHoursPreset = {
  /** Where the hours come from, e.g. the location name. */
  label: string;
  windows: AvailabilityWindow[];
};

export function WeeklyWindowsEditor({
  windows,
  onChange,
  error,
  businessHours,
}: {
  windows: AvailabilityWindow[];
  onChange: (windows: AvailabilityWindow[]) => void;
  error?: string;
  businessHours?: BusinessHoursPreset;
}) {
  // Copy follows the business's terminology: session/trainer for PT,
  // service/detailer for car detailing.
  const tenant = useTenant();
  const serviceLower =
    tenant.terminology.service
      .replace(/\s+type$/i, "")
      .trim()
      .toLowerCase() || "service";
  const staffLower = tenant.terminology.staff.trim().toLowerCase() || "staff member";

  const matchesBusinessHours =
    Boolean(businessHours) &&
    windows.length > 0 &&
    sameWindows(windows, businessHours?.windows ?? []);

  const addWindow = () => {
    onChange(
      [...windows, { dayOfWeek: 1, startMinute: DEFAULT_START, endMinute: DEFAULT_END }].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
      ),
    );
  };

  const updateWindow = (index: number, patch: Partial<AvailabilityWindow>) => {
    onChange(windows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeWindow = (index: number) => {
    onChange(windows.filter((_, i) => i !== index));
  };

  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>When this {serviceLower} is offered</Label>
        <div className="flex gap-2">
          {businessHours && businessHours.windows.length > 0 && !matchesBusinessHours ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...businessHours.windows])}
            >
              <Clock className="size-3.5" /> Use business hours
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={addWindow}>
            <Plus className="size-3.5" /> Add hours
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {matchesBusinessHours
          ? `Matches ${businessHours?.label}'s opening hours. Adjust below, or leave empty to offer whenever the ${staffLower} is available.`
          : `Leave empty to offer whenever the ${staffLower} is available.`}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {windows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No days listed. Clients can book any time the {staffLower} is free.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="grid grid-cols-[1fr_1fr_1fr_2.25rem] gap-2 border-b bg-secondary/40 px-2.5 py-1.5 text-xs text-muted-foreground">
            <span>Day</span>
            <span>From</span>
            <span>To</span>
            <span />
          </div>
          <div className="divide-y divide-border/70">
            {windows.map((row, i) => (
              <div
                key={`${row.dayOfWeek}-${row.startMinute}-${i}`}
                className="grid grid-cols-[1fr_1fr_1fr_2.25rem] items-center gap-2 px-2.5 py-2"
              >
                <Select
                  value={String(row.dayOfWeek)}
                  onValueChange={(v) => updateWindow(i, { dayOfWeek: Number(v) })}
                >
                  <SelectTrigger aria-label="Day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ISO_WEEKDAY_LABELS.map((day, di) => (
                      <SelectItem key={day} value={String(di + 1)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  aria-label="From"
                  value={minutesToTime(row.startMinute)}
                  onChange={(e) => updateWindow(i, { startMinute: timeToMinutes(e.target.value) })}
                />
                <Input
                  type="time"
                  aria-label="To"
                  value={minutesToTime(row.endMinute)}
                  onChange={(e) => updateWindow(i, { endMinute: timeToMinutes(e.target.value) })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeWindow(i)}
                  aria-label={`Remove ${ISO_WEEKDAY_LABELS[row.dayOfWeek - 1] ?? "day"}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
