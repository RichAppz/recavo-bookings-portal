import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddressFormState } from "@/lib/customers/address-form";
import { cn } from "@/lib/utils";

export function CustomerAddressFields({
  value,
  onChange,
  disabled,
  idPrefix,
  className,
}: {
  value: AddressFormState;
  onChange: (next: AddressFormState) => void;
  disabled?: boolean;
  idPrefix: string;
  /**
   * Placement in the parent grid belongs to the caller. A `col-span-2` baked in
   * here forced a single-column parent (the Add client dialog) to grow an
   * implicit second column, dragging the Email field up beside the names.
   */
  className?: string;
}) {
  const set = (key: keyof AddressFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <fieldset className={cn("grid gap-3", className)}>
      <legend className="mb-1 text-sm font-medium">Address</legend>
      <p className="text-xs text-muted-foreground">Optional. Handy for mobile jobs.</p>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-line1`} className="sr-only">
          Address line 1
        </Label>
        <Input
          id={`${idPrefix}-line1`}
          value={value.line1}
          disabled={disabled}
          onChange={set("line1")}
          placeholder="Address line 1"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-line2`} className="sr-only">
          Address line 2
        </Label>
        <Input
          id={`${idPrefix}-line2`}
          value={value.line2}
          disabled={disabled}
          onChange={set("line2")}
          placeholder="Address line 2"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-city`} className="sr-only">
            Town or city
          </Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            disabled={disabled}
            onChange={set("city")}
            placeholder="Town / city"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-region`} className="sr-only">
            County or region
          </Label>
          <Input
            id={`${idPrefix}-region`}
            value={value.region}
            disabled={disabled}
            onChange={set("region")}
            placeholder="County / region"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-postcode`} className="sr-only">
            Postcode
          </Label>
          <Input
            id={`${idPrefix}-postcode`}
            value={value.postcode}
            disabled={disabled}
            onChange={set("postcode")}
            placeholder="Postcode"
            autoComplete="off"
            className="uppercase"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-country`} className="sr-only">
            Country
          </Label>
          <Input
            id={`${idPrefix}-country`}
            value={value.country}
            disabled={disabled}
            onChange={set("country")}
            placeholder="Country"
            autoComplete="off"
          />
        </div>
      </div>
    </fieldset>
  );
}
