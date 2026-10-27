import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOpenConversation, useWaitlistAction } from "@/lib/api/hooks";
import type { WaitlistEntry } from "@/lib/api/types";
import { customerName } from "@/lib/waitlist";

/** Remove straight away, with Undo on the toast for six seconds. */
export function useRemoveFromWaitlist() {
  const act = useWaitlistAction();
  const remove = async (entry: WaitlistEntry) => {
    const name = customerName(entry);
    try {
      await act.mutateAsync({ entryId: entry.id, action: "cancel" });
    } catch {
      return false;
    }
    toast.success(`${name} removed from the waitlist`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          act.mutate(
            { entryId: entry.id, action: "reopen" },
            { onSuccess: () => toast.success(`${name} is back on the waitlist`) },
          ),
      },
    });
    return true;
  };
  return { remove, isPending: act.isPending };
}

export function usePutBackOnWaitlist() {
  const act = useWaitlistAction();
  const putBack = async (entry: WaitlistEntry) => {
    try {
      await act.mutateAsync({ entryId: entry.id, action: "reopen" });
      toast.success(`${customerName(entry)} is back on the waitlist`);
      return true;
    } catch {
      return false;
    }
  };
  return { putBack, isPending: act.isPending };
}

/** Opens (or starts) the client's conversation in Messages. */
export function useOpenClientConversation() {
  const open = useOpenConversation();
  const navigate = useNavigate();
  return {
    openFor: (customerId: string) =>
      open.mutate(
        { customerId },
        { onSuccess: (c) => void navigate({ to: "/messages", search: { c: c.id } }) },
      ),
    isPending: open.isPending,
  };
}
