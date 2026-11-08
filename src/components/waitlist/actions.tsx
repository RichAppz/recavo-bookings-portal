import { useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  RotateCcw,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WaitlistEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  useOpenClientConversation,
  usePutBackOnWaitlist,
  useRemoveFromWaitlist,
} from "@/components/waitlist/use-waitlist-actions";
import { customerName } from "@/lib/waitlist";

/**
 * The ··· on a row. Waiting: Edit, Call/Text/Email, View client, Remove. Booked: Open
 * booking, Put back. Removed: Put back. Without `canAct` only contact and View client.
 */
export function WaitlistMenu({
  entry,
  canAct,
  onEdit,
  onOpenBooking,
  onRemoved,
  triggerClassName,
}: {
  entry: WaitlistEntry;
  canAct: boolean;
  onEdit?: (entry: WaitlistEntry) => void;
  onOpenBooking?: (bookingId: string) => void;
  onRemoved?: (entry: WaitlistEntry) => void;
  triggerClassName?: string;
}) {
  const navigate = useNavigate();
  const { remove, isPending: removing } = useRemoveFromWaitlist();
  const { putBack, isPending: puttingBack } = usePutBackOnWaitlist();
  const conversation = useOpenClientConversation();
  const phone = entry.customer?.phone;
  const email = entry.customer?.email;
  const waiting = entry.status === "waiting";
  const busy = removing || puttingBack;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-8", triggerClassName)}
          aria-label={`More for ${customerName(entry)}`}
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {waiting && canAct && onEdit ? (
          <>
            <DropdownMenuItem onSelect={() => onEdit(entry)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {entry.status === "booked" && entry.bookingId && onOpenBooking ? (
          <DropdownMenuItem onSelect={() => onOpenBooking(entry.bookingId!)}>
            <CalendarCheck className="size-4" /> Open booking
          </DropdownMenuItem>
        ) : null}
        {waiting ? (
          <>
            {phone ? (
              <DropdownMenuItem asChild>
                <a href={`tel:${phone}`}>
                  <Phone className="size-4" /> Call
                </a>
              </DropdownMenuItem>
            ) : null}
            {phone ? (
              <DropdownMenuItem onSelect={() => conversation.openFor(entry.customerId)}>
                <MessageSquare className="size-4" /> Text
              </DropdownMenuItem>
            ) : null}
            {email ? (
              <DropdownMenuItem onSelect={() => conversation.openFor(entry.customerId)}>
                <Mail className="size-4" /> Email
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={() =>
            void navigate({ to: "/clients/$clientId", params: { clientId: entry.customerId } })
          }
        >
          <UserRound className="size-4" /> View client
        </DropdownMenuItem>
        {canAct ? (
          waiting ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() =>
                  void remove(entry).then((ok) => (ok ? onRemoved?.(entry) : undefined))
                }
              >
                <UserRoundX className="size-4" /> Remove from waitlist
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void putBack(entry)}>
                <RotateCcw className="size-4" /> Put back on the waitlist
              </DropdownMenuItem>
            </>
          )
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
