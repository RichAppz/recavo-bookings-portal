import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteSavedReply,
  useSavedReplies,
  useSaveSavedReply,
  type SavedReply,
} from "@/lib/api/messages";

const MAX_TITLE = 80;
const MAX_BODY = 2000;

type Draft = { id?: string; title: string; body: string };

/** Add, edit and delete the business's saved replies. */
export function SavedRepliesManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const replies = useSavedReplies();
  const save = useSaveSavedReply();
  const remove = useDeleteSavedReply();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (r?: SavedReply) => {
    setError(null);
    setDraft(r ? { id: r.id, title: r.title, body: r.body } : { title: "", body: "" });
  };

  const submit = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) {
      setError(!title ? "Give it a short name" : "Write the reply");
      return;
    }
    await save.mutateAsync({ ...(draft.id ? { id: draft.id } : {}), title, body });
    toast.success(draft.id ? "Saved reply updated" : "Saved reply added");
    setDraft(null);
  };

  const list = replies.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setDraft(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[20px] font-extrabold">Saved replies</DialogTitle>
          <DialogDescription>
            Answers you send often. Pick one from Saved replies under the message box.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="saved-reply-title">Name</Label>
              <Input
                id="saved-reply-title"
                autoFocus
                maxLength={MAX_TITLE}
                value={draft.title}
                placeholder="e.g. Running late"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="saved-reply-body">Reply</Label>
              <Textarea
                id="saved-reply-body"
                rows={5}
                maxLength={MAX_BODY}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {draft.id ? "Save changes" : "Add reply"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-3">
            {replies.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.length === 0 ? (
              <p className="rounded-xl bg-secondary px-4 py-5 text-center text-sm text-muted-foreground">
                No saved replies yet.
              </p>
            ) : (
              <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-xl border">
                {list.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{r.title}</p>
                      <p className="line-clamp-2 text-[13px] text-muted-foreground">{r.body}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9"
                      aria-label={`Edit ${r.title}`}
                      onClick={() => startEdit(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-destructive hover:text-destructive"
                      aria-label={`Delete ${r.title}`}
                      disabled={remove.isPending}
                      onClick={async () => {
                        await remove.mutateAsync(r.id);
                        toast.success("Saved reply deleted");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Button variant="outline" onClick={() => startEdit()}>
                <Plus className="size-4" /> Add saved reply
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
