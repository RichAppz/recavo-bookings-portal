import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import {
  DEFAULT_PAYMENT_HEX,
  HEX_COLOUR,
  PAYMENT_COLOUR_KEYS,
  paymentColoursFrom,
  readableTextOn,
  type PaymentColourKey,
  type PaymentColours,
} from "@/lib/payment-colours";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const ROWS: { key: PaymentColourKey; label: string; hint: string; sample: string }[] = [
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
];

/** Text-box values: "" means "use the default". */
type FormState = Record<PaymentColourKey, string>;

function fromColours(colours: PaymentColours): FormState {
  return {
    paid: colours.paid ?? "",
    partial: colours.partial ?? "",
    unpaid: colours.unpaid ?? "",
  };
}

/**
 * Calendar bar colours per payment state. Saves on its own (not with the rest of
 * the Configuration page) so a colour tweak never drags terminology or tax along.
 * Empty = platform default, which keeps following light/dark mode.
 */
export function CalendarColoursSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const saved = paymentColoursFrom(tenant.configuration);
  const [form, setForm] = useState<FormState>(() => fromColours(saved));
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);

  useEffect(() => {
    setForm(fromColours(saved));
    // Only re-seed when the saved values change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.paid, saved.partial, saved.unpaid]);

  const valid = (v: string) => v === "" || HEX_COLOUR.test(v);
  const allValid = PAYMENT_COLOUR_KEYS.every((k) => valid(form[k]));
  const dirty = PAYMENT_COLOUR_KEYS.some((k) => (form[k].toLowerCase() || null) !== saved[k]);
  const anyCustom = PAYMENT_COLOUR_KEYS.some((k) => form[k] !== "");

  const effective = (key: PaymentColourKey) =>
    valid(form[key]) && form[key] ? form[key].toLowerCase() : DEFAULT_PAYMENT_HEX[key];

  const save = async (next: FormState) => {
    try {
      await update.mutateAsync({
        calendar: {
          paymentColours: {
            paid: next.paid.trim().toLowerCase() || null,
            partial: next.partial.trim().toLowerCase() || null,
            unpaid: next.unpaid.trim().toLowerCase() || null,
          },
        },
      });
      toast.success("Calendar colours saved");
    } catch {
      // useUpdateConfiguration already toasts the API error.
    }
  };

  return (
    <SectionCard
      title="Calendar colours"
      description="Booking bars on the calendar are coloured by payment status. Pick your own, or leave blank for the defaults."
      className={className}
    >
      <div className="grid gap-4">
        {ROWS.map(({ key, label, hint, sample }) => {
          const bg = effective(key);
          const isDefault = form[key] === "";
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
                  <Label htmlFor={`payment-colour-${key}`} className="text-xs">
                    Hex colour
                  </Label>
                  <Input
                    id={`payment-colour-${key}`}
                    value={form[key]}
                    placeholder={`${DEFAULT_PAYMENT_HEX[key]} (default)`}
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
              <div
                className="flex items-center gap-1.5 overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-tight"
                style={{ backgroundColor: bg, color: readableTextOn(bg) }}
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
                  const cleared: FormState = { paid: "", partial: "", unpaid: "" };
                  setForm(cleared);
                  void save(cleared);
                }}
              >
                Reset all to defaults
              </Button>
            ) : null}
            <p className={cn("text-xs text-muted-foreground", !dirty && "hidden")}>
              Unsaved changes
            </p>
          </div>
        </Can>
      </div>
    </SectionCard>
  );
}
