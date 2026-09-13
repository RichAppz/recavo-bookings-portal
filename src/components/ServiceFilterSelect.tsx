import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogueService } from "@/lib/api/types";
import { categoryFilterValue, groupByCategory, hasCategories } from "@/lib/service-categories";
import { cn } from "@/lib/utils";

/**
 * "Which service?" filter for staff lists. When the catalogue uses categories the
 * options are grouped under them, and each category offers an "All <category>"
 * choice so every polishing job can be seen at once. Values are "all", a service
 * id, or a whole-category token — see `matchesServiceFilter`.
 */
export function ServiceFilterSelect({
  services,
  value,
  onValueChange,
  className,
}: {
  services: readonly CatalogueService[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const grouped = hasCategories(services);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Service" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All services</SelectItem>
        {grouped
          ? groupByCategory(services).map((group) => (
              <SelectGroup key={group.category ?? "__none"}>
                <SelectLabel>{group.category ?? "Other"}</SelectLabel>
                {group.category ? (
                  <SelectItem value={categoryFilterValue(group.category)}>
                    All {group.category.toLowerCase()}
                  </SelectItem>
                ) : null}
                {group.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The same filter as `ServiceFilterSelect`, as radio items for use inside a
 * `DropdownMenu` (the calendar's ⋯ menu). Same values, same grouping; a nested
 * `Select` cannot live inside a Radix menu, so the options are menu items
 * instead. Pass `colourFor` to prefix each service with its swatch.
 */
export function ServiceFilterMenuItems({
  services,
  value,
  onValueChange,
  colourFor,
}: {
  services: readonly CatalogueService[];
  value: string;
  onValueChange: (value: string) => void;
  colourFor?: (service: CatalogueService) => string;
}) {
  const grouped = hasCategories(services);
  const serviceItem = (s: CatalogueService) => (
    <DropdownMenuRadioItem key={s.id} value={s.id} className={cn(grouped && "ml-3")}>
      {colourFor ? (
        <span
          aria-hidden
          className="mr-2 inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: colourFor(s) }}
        />
      ) : null}
      <span className="truncate">{s.name}</span>
    </DropdownMenuRadioItem>
  );
  return (
    <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
      <DropdownMenuRadioItem value="all">All services</DropdownMenuRadioItem>
      {grouped
        ? groupByCategory(services).map((group) => (
            <div key={group.category ?? "__none"}>
              <DropdownMenuLabel className="pt-2 pb-0.5 text-[11px] font-medium text-muted-foreground">
                {group.category ?? "Other"}
              </DropdownMenuLabel>
              {group.category ? (
                <DropdownMenuRadioItem value={categoryFilterValue(group.category)} className="ml-3">
                  All {group.category.toLowerCase()}
                </DropdownMenuRadioItem>
              ) : null}
              {group.items.map(serviceItem)}
            </div>
          ))
        : services.map(serviceItem)}
    </DropdownMenuRadioGroup>
  );
}
