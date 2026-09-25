import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PersonAvatar, SectionCard, StatusBadge } from "@/components/ui-bits";
import { ApiError } from "@/lib/api";
import {
  useConfirmPackageRequest,
  useCustomer,
  useDeclinePackageRequest,
  usePackageRequests,
  type PackageRequest,
} from "@/lib/api/hooks";
import { customerDisplayName } from "@/lib/api/types";
import { relativeTimeAgo } from "@/lib/booking-reminders";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Packages clients asked for from the booking page because this business cannot take
 * card payments online. Each one waits here until staff confirm it — which issues the
 * credits, payment being arranged between them — or decline it with a note.
 *
 * `highlightId` comes from the `?request=` in the owner's email so the row they were
 * told about is the one they land on.
 */
export function PackageRequestsCard({
  highlightId,
  creditNoun,
}: {
  highlightId?: string | undefined;
  creditNoun: string;
}) {
  const pending = usePackageRequests("pending");
  const [resolving, setResolving] = useState<{
    request: PackageRequest;
    action: "confirm" | "decline";
  } | null>(null);

  useEffect(() => {
    if (!highlightId || !pending.data) return;
    document.getElementById(`package-request-${highlightId}`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [highlightId, pending.data]);

  const requests = pending.data ?? [];
  // Nothing to decide and no link pointed here: stay out of the way.
  if (!pending.isLoading && requests.length === 0 && !highlightId) return null;

  return (
    <SectionCard
      title="Package requests"
      description="Clients who asked for a package because you don't take card payments online yet. Confirm once you've agreed payment and the credits go on their account."
      bodyClassName="p-0"
    >
      {pending.isLoading ? (
        <div className="space-y-2 p-4 sm:p-5">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      ) : pending.isError ? (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm">
          <p className="text-muted-foreground">
            {pending.error instanceof ApiError
              ? pending.error.detail || pending.error.title
              : "Couldn't load requests."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void pending.refetch()}>
            Try again
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
          <Inbox className="size-5" />
          <p>Nothing waiting. That request has already been dealt with.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {requests.map((r) => (
            <PackageRequestRow
              key={r.id}
              request={r}
              highlighted={r.id === highlightId}
              creditNoun={creditNoun}
              onConfirm={() => setResolving({ request: r, action: "confirm" })}
              onDecline={() => setResolving({ request: r, action: "decline" })}
            />
          ))}
        </ul>
      )}
      {resolving ? (
        <ResolveDialog
          request={resolving.request}
          action={resolving.action}
          creditNoun={creditNoun}
          onClose={() => setResolving(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function PackageRequestRow({
  request,
  highlighted,
  creditNoun,
  onConfirm,
  onDecline,
}: {
  request: PackageRequest;
  highlighted: boolean;
  creditNoun: string;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const customer = useCustomer(request.customerId);
  const name = customer.data ? customerDisplayName(customer.data) : "…";
  const contact = [customer.data?.emailDisplay, customer.data?.phoneDisplay]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      id={`package-request-${request.id}`}
      className={cn(
        "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5",
        highlighted && "bg-primary-soft/40",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <PersonAvatar name={name} size={36} />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Link
              to="/clients/$clientId"
              params={{ clientId: request.customerId }}
              className="font-medium hover:underline"
            >
              {name}
            </Link>
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              {relativeTimeAgo(request.createdAt)}
            </span>
          </p>
          <p>
            <span className="font-medium">{request.packageName}</span>
            <span className="text-muted-foreground">
              {" "}
              · {request.creditsIssued} {creditNoun} ·{" "}
              {formatMoney(request.priceMinor, request.currency)}
            </span>
          </p>
          {contact ? <p className="text-xs text-muted-foreground">{contact}</p> : null}
          {request.notesCustomer ? (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm whitespace-pre-wrap">
              “{request.notesCustomer}”
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 sm:pt-1">
        <Button variant="outline" size="sm" onClick={onDecline}>
          Decline
        </Button>
        <Button size="sm" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </li>
  );
}

function ResolveDialog({
  request,
  action,
  creditNoun,
  onClose,
}: {
  request: PackageRequest;
  action: "confirm" | "decline";
  creditNoun: string;
  onClose: () => void;
}) {
  const confirm = useConfirmPackageRequest();
  const decline = useDeclinePackageRequest();
  const [note, setNote] = useState("");
  const busy = confirm.isPending || decline.isPending;
  const amount = formatMoney(request.priceMinor, request.currency);

  const submit = async () => {
    try {
      if (action === "confirm") {
        await confirm.mutateAsync({ requestId: request.id, note: note.trim() || null });
        toast.success("Package confirmed", {
          description: `${request.creditsIssued} ${creditNoun} added to their account. They've been sent their receipt.`,
        });
      } else {
        await decline.mutateAsync({ requestId: request.id, note: note.trim() || null });
        toast.success("Request declined", {
          description: note.trim()
            ? "They've been told, along with your note."
            : "They've been told.",
        });
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.detail || err.title : "Something went wrong. Try again.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === "confirm" ? "Confirm package request" : "Decline package request"}
          </DialogTitle>
          <DialogDescription>
            {action === "confirm"
              ? `This puts ${request.creditsIssued} ${creditNoun} from ${request.packageName} on their account straight away, and sends them a receipt. Only confirm once you've taken or agreed the ${amount}.`
              : `${request.packageName} won't be issued. They'll get an email saying so, with your note if you leave one.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="package-request-note">
            {action === "confirm"
              ? "Note for your records (optional)"
              : "Note to the client (optional)"}
          </Label>
          <Textarea
            id="package-request-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === "confirm"
                ? "e.g. Paid by bank transfer 25 Sep"
                : "e.g. Fully booked until January — get in touch then"
            }
            maxLength={2000}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action === "confirm" ? "default" : "destructive"}
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy
              ? action === "confirm"
                ? "Confirming…"
                : "Declining…"
              : action === "confirm"
                ? `Confirm and add ${creditNoun}`
                : "Decline request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
