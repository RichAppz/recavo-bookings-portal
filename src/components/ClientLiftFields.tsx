import { CarFront } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientLiftDraft } from "@/lib/client-lift";

/**
 * "Client needs a lift" for the Add / Edit booking forms (automotive only). A compact
 * tick-box that, once on, reveals where to and an optional note. Sits below the
 * vehicle so the drop-off and the run home read as one thought; `min-w-0` throughout
 * keeps the sheet from growing sideways on a phone.
 */
export function ClientLiftFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ClientLiftDraft;
  onChange: (next: ClientLiftDraft) => void;
  /** Unique per form so the Add and Edit dialogs never share ids. */
  idPrefix: string;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={value.needed}
          onCheckedChange={(checked) => onChange({ ...value, needed: checked === true })}
          aria-label="Client needs a lift after dropping the car off"
        />
        <CarFront className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Client needs a lift
      </label>
      {value.needed ? (
        <div className="grid min-w-0 gap-2 pl-6">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-lift-destination`} className="text-xs">
              Where to
            </Label>
            <Input
              id={`${idPrefix}-lift-destination`}
              value={value.destination}
              onChange={(e) => onChange({ ...value, destination: e.target.value })}
              placeholder="Home — 12 Elm Rd, or Train station"
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-lift-notes`} className="text-xs">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${idPrefix}-lift-notes`}
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
              placeholder="Back at 5pm to collect"
              maxLength={500}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Shows on the booking and calendar. The client's confirmation says where you'll drop them
            once they've dropped the car off.
          </p>
        </div>
      ) : null}
    </div>
  );
}
