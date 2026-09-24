import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_CATEGORIES, useCreateSupportRequest } from "@/lib/api/support";
import type { SupportRequestCategory } from "@/lib/api/types";

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

/**
 * "Contact support" from the account menu. Posts to the business's support-requests
 * endpoint so the message shows up as a ticket in the RECAVO internal console,
 * tagged with who raised it and which business they were working in.
 */
export function ContactSupportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [category, setCategory] = useState<SupportRequestCategory>("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useCreateSupportRequest();

  const reset = () => {
    setCategory("question");
    setSubject("");
    setBody("");
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const valid =
    subject.trim().length > 0 &&
    subject.trim().length <= SUBJECT_MAX &&
    body.trim().length > 0 &&
    body.trim().length <= BODY_MAX;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!create.isPending) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact support</DialogTitle>
          <DialogDescription>
            Tell us what you need and we'll get back to you by email. We can see which business
            you're writing from, so there's no need to include that.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || create.isPending) return;
            create.mutate(
              { category, subject: subject.trim(), body: body.trim() },
              {
                onSuccess: () => {
                  toast.success("Message sent", {
                    description: "We've got it and will reply by email.",
                  });
                  close();
                },
              },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="support-category">What's it about?</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SupportRequestCategory)}
            >
              <SelectTrigger id="support-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              placeholder="A short summary"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-body">Message</Label>
            <Textarea
              id="support-body"
              rows={6}
              value={body}
              maxLength={BODY_MAX}
              placeholder="What happened, what you expected, and any booking or client it relates to."
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
