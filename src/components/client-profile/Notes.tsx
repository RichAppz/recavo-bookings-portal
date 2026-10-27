import { useMemo, useState } from "react";
import { toast } from "sonner";
import { rowClass } from "@/components/client-profile/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAddCustomerNote, useMemberships } from "@/lib/api/hooks";
import { userDisplayName, type CustomerNote } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { cn } from "@/lib/utils";

/** "You", a teammate's name, or null when the author isn't on the team list. */
export function useTeamMemberName() {
  const memberships = useMemberships();
  const { user } = useAuth();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const m of memberships.data ?? []) {
      const name = m.user ? userDisplayName(m.user, "") : "";
      if (!name) continue;
      names.set(m.userId, name);
      names.set(m.id, name);
    }
    return (actorId: string | null | undefined): string | null => {
      if (!actorId) return null;
      if (user?.id && actorId === user.id) return "You";
      return names.get(actorId) ?? null;
    };
  }, [memberships.data, user?.id]);
}

const noteTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  })
    .format(new Date(iso))
    .replace(/ at /, ", ");

export function NoteQuickAdd({ customerId, disabled }: { customerId: string; disabled?: boolean }) {
  const addNote = useAddCustomerNote(customerId);
  const [note, setNote] = useState("");
  const save = async () => {
    if (!note.trim()) {
      toast.error("Write a note first");
      return;
    }
    await addNote.mutateAsync(note.trim());
    setNote("");
    toast.success("Note added");
  };
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        value={note}
        disabled={disabled}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note: preferences, history, anything the team should know"
        aria-label="Add a note"
        className="h-10"
      />
      <Button
        type="submit"
        variant="outline"
        className="h-10"
        disabled={disabled || addNote.isPending}
      >
        {addNote.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function NotesList({
  notes,
  timezone,
  limit,
  emptyText = "No notes yet.",
}: {
  notes: readonly CustomerNote[];
  timezone: string;
  limit?: number;
  emptyText?: string;
}) {
  const authorName = useTeamMemberName();
  const sorted = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (shown.length === 0) {
    return <p className={cn(rowClass, "text-sm text-muted-foreground")}>{emptyText}</p>;
  }
  return (
    <ul>
      {shown.map((n) => (
        <li key={n.id} className={rowClass}>
          <p className="text-sm whitespace-pre-wrap">{n.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[authorName(n.authorActorId), noteTime(n.createdAt, timezone)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
