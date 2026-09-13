import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerticalPicker } from "@/components/VerticalPicker";
import { VERTICALS, type VerticalKey } from "@/lib/verticals";

/**
 * The fields every business starts with: which trade it is, its legal name and
 * an optional trading name. Shared by first-run onboarding and the "Add a
 * business" dialog so the two never drift apart.
 */
export function BusinessDetailsFields({
  vertical,
  onVerticalChange,
  legalName,
  onLegalNameChange,
  tradingName,
  onTradingNameChange,
  disabled,
  idPrefix = "",
}: {
  vertical: VerticalKey;
  onVerticalChange: (v: VerticalKey) => void;
  legalName: string;
  onLegalNameChange: (v: string) => void;
  tradingName: string;
  onTradingNameChange: (v: string) => void;
  disabled?: boolean;
  /** Keeps input ids unique when the fields render inside another page's form. */
  idPrefix?: string;
}) {
  const legalNameId = `${idPrefix}legalName`;
  const tradingNameId = `${idPrefix}tradingName`;
  return (
    <>
      <div className="flex flex-col gap-4">
        <Label>What do you do?</Label>
        <VerticalPicker value={vertical} onChange={onVerticalChange} disabled={disabled} />
        <p className="text-xs text-muted-foreground">
          Sets your labels and defaults — automotive adds a Vehicle record to each client
          automatically.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={legalNameId}>{VERTICALS[vertical].businessLabel}</Label>
        <Input
          id={legalNameId}
          required
          value={legalName}
          onChange={(e) => onLegalNameChange(e.target.value)}
          placeholder={VERTICALS[vertical].businessPlaceholder}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={tradingNameId}>Trading name (optional)</Label>
        <Input
          id={tradingNameId}
          value={tradingName}
          onChange={(e) => onTradingNameChange(e.target.value)}
          placeholder="Peak PT"
        />
      </div>
    </>
  );
}
