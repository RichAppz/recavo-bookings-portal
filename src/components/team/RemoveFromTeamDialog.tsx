import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RadioList } from "@/components/team/parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBusinessId } from "@/lib/api/hooks";
import { describeApiError } from "@/lib/api/errors";
import type { Staff } from "@/lib/api/types";
import type { JobsChoice, JobsPreview } from "@/lib/api/team";
import { previewArchive, useArchivePerson } from "@/lib/api/team";
import { plural } from "@/lib/locations";
import { useTenant } from "@/lib/tenant/tenant-context";

type Choice = JobsChoice | "later";

/**
 * Archive a person: clients can't book them, their sign-in goes, pending invites are
 * cancelled and the seat is freed. Future jobs are moved, rebooked by the client, or
 * left until the owner sorts them in Bookings.
 */
export function RemoveFromTeamDialog({
  person,
  isOwner,
  onOpenChange,
  onRemoved,
  onSortFirst,
}: {
  person: Staff | null;
  isOwner: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: (staff: Staff) => void;
  onSortFirst: (staff: Staff) => void;
}) {
  const tenant = useTenant();
  const businessId = useBusinessId();
  const archive = useArchivePerson();
  const noun = tenant.terminology.booking.toLowerCase();
  const [preview, setPreview] = useState<JobsPreview | null>(null);
  const [choice, setChoice] = useState<Choice>("reassign");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setChoice("reassign");
    setError(null);
    if (!person || isOwner || !businessId) return;
    let live = true;
    previewArchive(businessId, person.id)
      .then((p) => live && setPreview(p))
      .catch(() => live && setPreview({ count: 0, bookings: [] }));
    return () => {
      live = false;
    };
  }, [person, isOwner, businessId]);

  if (!person) return null;
  const name = person.displayName;
  const count = preview?.count ?? 0;

  const submit = async () => {
    if (choice === "later") {
      onOpenChange(false);
      onSortFirst(person);
      return;
    }
    setError(null);
    try {
      const out = await archive.mutateAsync({
        staffId: person.id,
        ...(count > 0 ? { jobsInTheWay: choice } : {}),
      });
      toast.success(`${name} removed from the team`);
      if (out.unmoved.length > 0) {
        toast.warning(
          `${plural(out.unmoved.length, noun)} had nobody free and stayed with ${name}. Check them in Bookings.`,
          { duration: 12_000 },
        );
      }
      onOpenChange(false);
      onRemoved(out.staff);
    } catch (err) {
      setError(describeApiError(err, `Couldn't remove ${name}.`));
    }
  };

  const label =
    count === 0
      ? "Remove"
      : choice === "reassign"
        ? `Move ${plural(count, noun)} and remove`
        : choice === "ask_rebook"
          ? `Email ${plural(count, "client")} and remove`
          : `Open ${noun}s`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Remove {name} from the team?</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "The owner can't be removed. Transfer ownership in Settings first."
              : `Clients won't be able to book ${name} and ${name} won't be able to sign in. Past ${noun}s keep ${name}'s name. It frees a seat, and you can bring ${name} back any time from Archived.`}
          </DialogDescription>
        </DialogHeader>

        {isOwner ? null : preview === null ? (
          <p className="text-sm text-muted-foreground">Checking {name}'s diary…</p>
        ) : count > 0 ? (
          <div className="grid gap-3">
            <p className="rounded-xl bg-amber-500/12 px-3.5 py-3 text-sm font-semibold text-amber-900 dark:text-amber-200">
              {name} has {plural(count, noun)} booked from today.
            </p>
            <RadioList
              label="What should happen to them?"
              hideLabel
              value={choice}
              onChange={setChoice}
              options={[
                {
                  value: "reassign",
                  title: "Give them to someone else",
                  help: "We'll pick whoever is free at the same time. Any with nobody free are listed after.",
                },
                {
                  value: "ask_rebook",
                  title: "Ask the clients to pick a new time",
                  help: "We email them a link to rebook.",
                },
                {
                  value: "later",
                  title: "Not yet, I'll sort them first",
                  help: `Opens ${name}'s upcoming ${noun}s.`,
                },
              ]}
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {isOwner ? "OK" : "Cancel"}
          </Button>
          {isOwner ? null : (
            <Button
              variant={choice === "later" ? "default" : "destructive"}
              disabled={archive.isPending || preview === null}
              onClick={() => void submit()}
            >
              {archive.isPending ? "Removing…" : label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
