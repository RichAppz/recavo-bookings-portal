import { useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useAssignCustomerTag,
  useCreateCustomerTag,
  useCustomerAssignedTags,
  useCustomerTagsCatalogue,
  useUnassignCustomerTag,
} from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

/** Pick a tag from the catalogue, or create one by typing its name. Saves straight away. */
export function TagPicker({
  customerId,
  trigger,
  align = "start",
}: {
  customerId: string;
  trigger: ReactNode;
  align?: "start" | "end";
}) {
  const catalogue = useCustomerTagsCatalogue({ status: "active" });
  const assigned = useCustomerAssignedTags(customerId);
  const assign = useAssignCustomerTag(customerId);
  const createTag = useCreateCustomerTag();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const assignedIds = useMemo(
    () => new Set((assigned.data ?? []).map((t) => t.id)),
    [assigned.data],
  );
  const available = (catalogue.data ?? []).filter((t) => !assignedIds.has(t.id));
  const typed = query.trim();
  const exists = (catalogue.data ?? []).some((t) => t.name.toLowerCase() === typed.toLowerCase());
  const busy = assign.isPending || createTag.isPending;

  const pick = async (tagId: string) => {
    await assign.mutateAsync(tagId);
    toast.success("Tag added");
    setQuery("");
    setOpen(false);
  };
  const create = async () => {
    const tag = await createTag.mutateAsync(typed);
    await assign.mutateAsync(tag.id);
    toast.success("Tag created and added");
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Find or create a tag" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{typed ? "No matching tag" : "No other tags yet"}</CommandEmpty>
            {available.length > 0 ? (
              <CommandGroup>
                {available.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.name}
                    disabled={busy}
                    onSelect={() => void pick(t.id)}
                  >
                    {t.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {typed && !exists ? (
              <CommandGroup>
                <CommandItem
                  value={`create ${typed}`}
                  disabled={busy}
                  onSelect={() => void create()}
                >
                  <Plus className="size-4" /> Create “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Assigned tags as chips; ✕ removes (with edit rights), the dashed "+ Tag" adds. */
export function TagChips({
  customerId,
  canEdit,
  emptyText,
}: {
  customerId: string;
  canEdit: boolean;
  emptyText?: string;
}) {
  const assigned = useCustomerAssignedTags(customerId);
  const unassign = useUnassignCustomerTag(customerId);
  const tags = assigned.data ?? [];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex h-[26px] items-center gap-1 rounded-full bg-secondary px-2.5 text-[12.5px] font-semibold text-secondary-foreground"
        >
          {t.name}
          {canEdit ? (
            <button
              type="button"
              disabled={unassign.isPending}
              className="-mr-1 cursor-pointer rounded-full p-0.5 hover:bg-background"
              aria-label={`Remove ${t.name}`}
              onClick={async () => {
                await unassign.mutateAsync(t.id);
                toast.success("Tag removed");
              }}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {tags.length === 0 && emptyText && !canEdit ? (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      ) : null}
      {canEdit ? (
        <TagPicker
          customerId={customerId}
          trigger={
            <button
              type="button"
              className={cn(
                "inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className="size-3" /> Tag
            </button>
          }
        />
      ) : null}
    </div>
  );
}
