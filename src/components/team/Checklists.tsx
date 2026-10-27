import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateStaff } from "@/lib/api/hooks";
import type { CatalogueService, Location, Staff } from "@/lib/api/types";
import { firstName } from "@/lib/team";

/**
 * A checklist with "All (including new ones)" at the top. An empty list on the
 * person means "all", so ticking All clears the specific choices.
 */
function Checklist({
  open,
  onOpenChange,
  title,
  description,
  allLabel,
  items,
  selected,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  allLabel: string;
  items: { id: string; name: string }[];
  selected: string[];
  onSave: (ids: string[]) => Promise<void>;
  saving: boolean;
}) {
  const [all, setAll] = useState(selected.length === 0);
  const [ids, setIds] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setAll(selected.length === 0);
    setIds(selected.length === 0 ? items.map((i) => i.id) : selected);
    // Seed on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <label className="flex min-h-11 items-center gap-2.5 border-b pb-2 text-sm font-bold">
            <Checkbox checked={all} onCheckedChange={(on) => setAll(on === true)} />
            {allLabel}
          </label>
          {items.map((i) => (
            <label key={i.id} className="flex min-h-10 items-center gap-2.5 text-sm">
              <Checkbox
                disabled={all}
                checked={all || ids.includes(i.id)}
                onCheckedChange={(on) =>
                  setIds((list) => (on ? [...list, i.id] : list.filter((x) => x !== i.id)))
                }
              />
              {i.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || (!all && ids.length === 0)}
            onClick={() => void onSave(all ? [] : ids)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesChecklist({
  open,
  onOpenChange,
  person,
  services,
  serviceWord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Staff;
  services: CatalogueService[];
  serviceWord: string;
}) {
  const update = useUpdateStaff();
  const live = services.filter((s) => s.active && !s.archivedAt);
  return (
    <Checklist
      open={open}
      onOpenChange={onOpenChange}
      title={`${firstName(person.displayName)} does these ${serviceWord.toLowerCase()}s`}
      description={`Clients can only book ${firstName(person.displayName)} for the ones ticked.`}
      allLabel={`All ${serviceWord.toLowerCase()}s (including new ones)`}
      items={live.map((s) => ({ id: s.id, name: s.name }))}
      selected={person.eligibleServiceIds.filter((id) => live.some((s) => s.id === id))}
      saving={update.isPending}
      onSave={async (ids) => {
        try {
          await update.mutateAsync({
            staffId: person.id,
            version: person.version,
            body: { eligibleServiceIds: ids },
          });
          toast.success("Changes saved");
          onOpenChange(false);
        } catch {
          // useUpdateStaff toasts the API error.
        }
      }}
    />
  );
}

export function WorksAtChecklist({
  open,
  onOpenChange,
  person,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Staff;
  locations: Location[];
}) {
  const update = useUpdateStaff();
  return (
    <Checklist
      open={open}
      onOpenChange={onOpenChange}
      title={`Where ${firstName(person.displayName)} works`}
      description="Clients can book them at the locations ticked."
      allLabel="All locations (including new ones)"
      items={locations.map((l) => ({ id: l.id, name: l.name }))}
      selected={person.locationIds}
      saving={update.isPending}
      onSave={async (ids) => {
        try {
          await update.mutateAsync({
            staffId: person.id,
            version: person.version,
            body: { locationIds: ids },
          });
          toast.success("Changes saved");
          onOpenChange(false);
        } catch {
          // useUpdateStaff toasts the API error.
        }
      }}
    />
  );
}
