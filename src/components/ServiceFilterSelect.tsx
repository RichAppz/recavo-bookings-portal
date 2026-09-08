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
