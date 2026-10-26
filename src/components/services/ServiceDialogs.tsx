import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CatalogueService } from "@/lib/api/types";
import type { ServiceUsage } from "@/lib/api/catalogue";

/** "Archive {name}?" with the booking counts, the add-on warning and, after a refused delete, why. */
export function ArchiveServiceDialog({
  service,
  usage,
  offeredWith,
  afterDelete,
  pluralLower,
  pending,
  onCancel,
  onConfirm,
}: {
  service: CatalogueService | null;
  usage: ServiceUsage | undefined;
  /** Services that offer this one as an add-on. */
  offeredWith: CatalogueService[];
  afterDelete: boolean;
  pluralLower: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const upcoming = usage?.upcomingBookingCount ?? 0;
  const past = Math.max(0, (usage?.bookingCount ?? 0) - upcoming);
  return (
    <Dialog open={service !== null} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Archive {service?.name}?</DialogTitle>
          <DialogDescription>
            It stops taking bookings and moves to Archived.{" "}
            {usage
              ? `The ${past} past and ${upcoming} upcoming bookings keep their details. `
              : "Its bookings keep their details. "}
            You can restore it any time.
          </DialogDescription>
        </DialogHeader>
        {afterDelete ? (
          <div className="rounded-xl bg-secondary p-3 text-sm">
            <p className="font-bold">Why not delete?</p>
            <p className="mt-1 text-muted-foreground">
              It's been booked before, so deleting would lose that history. Delete is only for{" "}
              {pluralLower} nobody has booked.
            </p>
          </div>
        ) : null}
        {offeredWith.length > 0 ? (
          <p className="rounded-xl bg-[#fdf0dc] px-3 py-2 text-sm text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]">
            It's also offered as an add-on with {joinNames(offeredWith.map((s) => s.name))}. It
            won't be offered there while it's archived.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteServiceDialog({
  service,
  offeredWith,
  pending,
  onCancel,
  onConfirm,
}: {
  service: CatalogueService | null;
  offeredWith: CatalogueService[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={service !== null} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Delete {service?.name}?</DialogTitle>
          <DialogDescription>Nobody has booked it, so it'll be removed for good.</DialogDescription>
        </DialogHeader>
        {offeredWith.length > 0 ? (
          <p className="rounded-xl bg-[#fdf0dc] px-3 py-2 text-sm text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]">
            It's also offered as an add-on with {joinNames(offeredWith.map((s) => s.name))}. It'll
            be removed from there.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
