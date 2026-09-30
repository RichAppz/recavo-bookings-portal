import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/content/guides";
import { guidesFor, searchGuides, type Guide } from "@/lib/guides";
import { useGuideCopy, useGuideVertical } from "@/lib/use-guides";
import type { VerticalKey } from "@/lib/verticals";
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
import type { SupportRequest, SupportRequestCategory } from "@/lib/api/types";

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

/** Guides worth offering before someone writes in, when the subject hasn't said much yet. */
const GUIDES_BY_CATEGORY: Partial<Record<SupportRequestCategory, string[]>> = {
  question: ["add-a-booking", "reschedule-a-booking", "record-a-payment"],
  billing: ["choose-your-plan", "connect-stripe", "sms-credits"],
  bug: ["working-offline"],
};

/**
 * Up to three guides that might answer the request: matched on the subject once
 * it says something, otherwise the usual suspects for the chosen category.
 */
function suggestedGuides(
  category: SupportRequestCategory,
  subject: string,
  vertical: VerticalKey,
): Guide[] {
  const pool = guidesFor(GUIDES, vertical);
  const words = subject
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length > 0) {
    // Any word may match: "deposit refund" should still find the deposit guide.
    const seen = new Set<string>();
    const hits: Guide[] = [];
    for (const w of words) {
      for (const g of searchGuides(pool, vertical, w)) {
        if (!seen.has(g.slug)) {
          seen.add(g.slug);
          hits.push(g);
        }
      }
    }
    if (hits.length > 0) return hits.slice(0, 3);
  }
  return (GUIDES_BY_CATEGORY[category] ?? [])
    .map((slug) => pool.find((g) => g.slug === slug))
    .filter((g): g is Guide => g !== undefined)
    .slice(0, 3);
}

/**
 * "New request" on the Support page. Posts to the business's support-requests
 * endpoint so the message shows up as a ticket in the RECAVO internal console,
 * tagged with who raised it and which business they were working in. Replies come
 * back as a thread on /support/$id and by email.
 */
export function ContactSupportDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new request after a successful send (the page opens the thread). */
  onCreated?: (request: SupportRequest) => void;
}) {
  const [category, setCategory] = useState<SupportRequestCategory>("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useCreateSupportRequest();
  const { vertical } = useGuideVertical();
  const t = useGuideCopy(vertical);
  const suggestions = suggestedGuides(category, subject, vertical);

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
            Tell us what you need. We'll reply here and by email. We can see which business you're
            writing from, so there's no need to include that.
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
                onSuccess: (request) => {
                  toast.success("Message sent", {
                    description: "We've got it. You'll see our reply here and by email.",
                  });
                  close();
                  onCreated?.(request);
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
          {suggestions.length > 0 ? (
            <div className="rounded-lg border bg-secondary/40 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <BookOpen className="size-3.5" /> This might answer it
              </p>
              <ul className="mt-1.5 space-y-1">
                {suggestions.map((g) => (
                  <li key={g.slug}>
                    <Link
                      to="/support/guides/$slug"
                      params={{ slug: g.slug }}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {t(g.title)} <ArrowUpRight className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
