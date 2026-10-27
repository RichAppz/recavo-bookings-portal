import { Input } from "@/components/ui/input";

/** A decimal amount field with the currency symbol inside it. */
export function MoneyInput({
  id,
  symbol,
  value,
  onChange,
  placeholder,
  invalid,
  ariaLabel,
  ariaDescribedBy,
}: {
  id?: string;
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {symbol}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: `${Math.max(1.75, 0.75 + symbol.length * 0.6)}rem` }}
      />
    </div>
  );
}
