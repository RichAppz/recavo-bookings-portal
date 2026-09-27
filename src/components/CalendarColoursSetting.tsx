import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import {
  PUBLIC_HOLIDAY_REGIONS,
  STOCK_EVENT_COLOUR,
  publicHolidayRegionFrom,
  type PublicHolidayRegion,
} from "@/lib/calendar-settings";
import {
  DEFAULT_PAYMENT_HEX,
  HEX_COLOUR,
  PAYMENT_COLOUR_KEYS,
  paymentColoursFrom,
  readableTextOn,
  type PaymentColourKey,
} from "@/lib/payment-colours";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/** Every colour the business can set: the three payment states plus events. */
type ColourKey = PaymentColourKey | "event";
const COLOUR_KEYS: ColourKey[] = [...PAYMENT_COLOUR_KEYS, "event"];
const DEFAULT_HEX: Record<ColourKey, string> = {
  ...DEFAULT_PAYMENT_HEX,
  event: STOCK_EVENT_COLOUR.toLowerCase(),
};

const ROWS: { key: ColourKey; label: string; hint: string; sample: string }[] = [
  {
    key: "paid",
    label: "Paid / nothing to collect",
    hint: "Settled, free, credit or cancelled — no money to chase.",
    sample: "10:00 Sam · Full valet",
  },
  {
    key: "partial",
    label: "Deposit / part paid",
    hint: "Something received, balance still due.",
    sample: "13:30 Priya · Interior detail",
  },
  {
    key: "unpaid",
    label: "Unpaid",
    hint: "Nothing received yet.",
    sample: "16:00 Jordan · Ceramic coat",
  },
  {
    key: "event",
    label: "Events",
    hint: "New events start in this colour; events left on the standard grey follow it too. Any event can still be given its own colour.",
    sample: "Day off",
  },
];

/** Text-box values: "" means "use the default". */
type FormState = Record<ColourKey, string>;

function fromSaved(tenantConfig: ReturnType<typeof useTenant>["configuration"]): FormState {
  const payment = paymentColoursFrom(tenantConfig);
  return {
    paid: payment.paid ?? "",
    partial: payment.partial ?? "",
    unpaid: payment.unpaid ?? "",
    event: tenantConfig?.calendar?.eventColour ?? "",
  };
}

const DESCRIPTION =
  "Booking bars on the calendar are coloured by payment status; events have a colour of their own. Pick yours, or leave blank for the defaults.";

/**
 * Calendar colours per payment state (and for events), plus which public
 * holidays to mark, as a Settings card. Saves on its own (not with the rest of
 * the Configuration page) so a colour tweak never drags terminology or tax
 * along. Empty = platform default, which keeps following light/dark mode.
 */
export function CalendarColoursSetting({ className }: { className?: string }) {
  return (
    <SectionCard title="Calendar colours" description={DESCRIPTION} className={className}>
      <CalendarColoursForm />
      <div className="mt-6 border-t pt-5">
        <PublicHolidaysSetting />
      </div>
    </SectionCard>
  );
}

/** The same form in a dialog, reached from the legend under the calendar. */
export function CalendarColoursDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Calendar colours</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <CalendarColoursForm onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CalendarColoursForm({ onSaved }: { onSaved?: () => void }) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const saved = fromSaved(tenant.configuration);
  const [form, setForm] = useState<FormState>(saved);
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);

  useEffect(() => {
    setForm(fromSaved(tenant.configuration));
    // Only re-seed when the saved values change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.paid, saved.partial, saved.unpaid, saved.event]);

  const valid = (v: string) => v === "" || HEX_COLOUR.test(v);
  const allValid = COLOUR_KEYS.every((k) => valid(form[k]));
  const dirty = COLOUR_KEYS.some((k) => form[k].toLowerCase() !== saved[k].toLowerCase());
  const anyCustom = COLOUR_KEYS.some((k) => form[k] !== "");

  const effective = (key: ColourKey) =>
    valid(form[key]) && form[key] ? form[key].toLowerCase() : DEFAULT_HEX[key];

  const save = async (next: FormState) => {
    const hex = (v: string) => v.trim().toLowerCase() || null;
    try {
      await update.mutateAsync({
        calendar: {
          paymentColours: {
            paid: hex(next.paid),
            partial: hex(next.partial),
            unpaid: hex(next.unpaid),
          },
          eventColour: hex(next.event),
        },
      });
      toast.success("Calendar colours saved");
      onSaved?.();
    } catch {
      // useUpdateConfiguration already toasts the API error.
    }
  };

  return (
    <div className="grid gap-4">
      {ROWS.map(({ key, label, hint, sample }) => {
        const bg = effective(key);
        const isDefault = form[key] === "";
        const isEvent = key === "event";
        return (
          <div key={key} className="grid gap-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              {!isDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  disabled={!canEdit}
                  onClick={() => setForm((f) => ({ ...f, [key]: "" }))}
                >
                  <RotateCcw className="size-3" />
                  Default
                </Button>
              ) : null}
            </div>
            <div className="flex items-end gap-3">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`calendar-colour-${key}`} className="text-xs">
                  Hex colour
                </Label>
                <Input
                  id={`calendar-colour-${key}`}
                  value={form[key]}
                  placeholder={`${DEFAULT_HEX[key]} (default)`}
                  disabled={!canEdit}
                  aria-invalid={!valid(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
              <input
                type="color"
                aria-label={`Pick ${label} colour`}
                value={bg}
                disabled={!canEdit}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="size-10 shrink-0 cursor-pointer rounded-lg border bg-background p-1 disabled:cursor-not-allowed"
              />
            </div>
            {!valid(form[key]) ? (
              <p className="text-xs text-destructive">Must be a #rrggbb value.</p>
            ) : null}
            {/* Event chips are tinted and hatched on the calendar, so preview them
                that way rather than as a solid bar. */}
            <div
              className={cn(
                "flex items-center gap-1.5 overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-tight",
                isEvent && "border-l-[3px]",
              )}
              style={
                isEvent
                  ? {
                      borderLeftColor: bg,
                      backgroundColor: `${bg}1F`,
                      backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, ${bg}14 6px 8px)`,
                    }
                  : { backgroundColor: bg, color: readableTextOn(bg) }
              }
              aria-hidden
            >
              <span className="truncate font-semibold">{sample}</span>
            </div>
          </div>
        );
      })}

      <Can
        permission={PERMISSIONS.BUSINESS_UPDATE}
        fallback={<p className="text-xs text-muted-foreground">Requires business.update</p>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={update.isPending || !allValid || !dirty}
            onClick={() => void save(form)}
          >
            {update.isPending ? "Saving…" : "Save colours"}
          </Button>
          {anyCustom ? (
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => {
                const cleared: FormState = { paid: "", partial: "", unpaid: "", event: "" };
                setForm(cleared);
                void save(cleared);
              }}
            >
              Reset all to defaults
            </Button>
          ) : null}
          <p className={cn("text-xs text-muted-foreground", !dirty && "hidden")}>Unsaved changes</p>
        </div>
      </Can>
    </div>
  );
}

const NO_HOLIDAYS = "none";

/**
 * Which UK bank-holiday set the calendar marks. Saves straight away — it is one
 * choice, not a form. Used both in Settings and in the strip under the calendar.
 */
export function PublicHolidaysSelect({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const current = publicHolidayRegionFrom(tenant.configuration);

  const change = async (value: string) => {
    const region = value === NO_HOLIDAYS ? null : (value as PublicHolidayRegion);
    if (region === current) return;
    try {
      await update.mutateAsync({ calendar: { publicHolidays: region } });
      toast.success(
        region
          ? `Showing ${PUBLIC_HOLIDAY_REGIONS.find((r) => r.value === region)?.label} bank holidays`
          : "Bank holidays hidden",
      );
    } catch {
      // useUpdateConfiguration already toasts the API error.
    }
  };

  return (
    <Select
      value={current ?? NO_HOLIDAYS}
      onValueChange={(v) => void change(v)}
      disabled={!canEdit || update.isPending}
    >
      <SelectTrigger
        aria-label="Public holidays shown on the calendar"
        className={cn(size === "sm" && "h-7 w-auto gap-1 px-2 text-xs", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_HOLIDAYS}>No bank holidays</SelectItem>
        {PUBLIC_HOLIDAY_REGIONS.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PublicHolidaysSetting() {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium">Bank holidays</p>
        <p className="text-xs text-muted-foreground">
          Mark the public holidays for where you trade at the top of each day. They are a reminder
          only — bookings can still be taken on them. Dates come from gov.uk.
        </p>
      </div>
      <PublicHolidaysSelect className="w-full sm:w-64" />
    </div>
  );
}
