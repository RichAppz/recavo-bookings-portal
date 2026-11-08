import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The API validates against the runtime's zone table and rejects abbreviations
 * and UTC offsets, so offering the same table is the only way to guarantee the
 * value we send is one it will accept.
 */
export function supportedTimezones(): string[] {
  const withValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    return withValues.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Searchable time-zone picker. Falls back to a plain text box on runtimes without
 * `Intl.supportedValuesOf`. `allowUnset` adds a "Not set" choice (a person's own
 * profile); a business always has a zone, so it leaves that out.
 */
export function TimezoneCombobox({
  id,
  value,
  onChange,
  allowUnset = false,
  disabled,
  invalid,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  allowUnset?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(supportedTimezones, []);

  if (zones.length === 0) {
    return (
      <Input
        id={id}
        value={value}
        placeholder="Europe/London"
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || "Not set"}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            <CommandGroup>
              {allowUnset ? (
                <CommandItem
                  value="Not set"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value ? "opacity-0" : "opacity-100")} />
                  Not set
                </CommandItem>
              ) : null}
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === zone ? "opacity-100" : "opacity-0")}
                  />
                  {zone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
