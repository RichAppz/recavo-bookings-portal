import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Link2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSmsCredits } from "@/lib/api/hooks";
import { useSavedReplies, useSendConversationMessage } from "@/lib/api/messages";
import type { Customer } from "@/lib/api/types";
import {
  LOW_CREDITS,
  MAX_SMS_SEGMENTS,
  clientReach,
  creditsLabel,
  defaultReplyChannel,
  defaultSubject,
  quickReplies,
  unansweredText,
  smsSegments,
  staffSmsText,
  type MessageLike,
  type ReplyChannel,
} from "@/lib/messages";
import { cn } from "@/lib/utils";
import { SmallChip } from "./parts";

/** Puts `text` where the caret is (or replaces the selection) and keeps focus there. */
function insertAtCaret(
  el: HTMLTextAreaElement | null,
  current: string,
  text: string,
  set: (v: string) => void,
) {
  if (!el) {
    set(current ? `${current} ${text}` : text);
    return;
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const before = current.slice(0, start);
  const pad = before && !/\s$/.test(before) ? " " : "";
  const next = `${before}${pad}${text}${current.slice(end)}`;
  set(next);
  requestAnimationFrame(() => {
    el.focus();
    const at = before.length + pad.length + text.length;
    el.setSelectionRange(at, at);
  });
}

export function ReplyBox({
  conversationId,
  customer,
  messages,
  businessName,
  bookingLink,
  phone,
  focusToken,
  onManageSavedReplies,
  insertRequest,
}: {
  conversationId: string;
  customer: Customer | undefined;
  messages: MessageLike[];
  businessName: string;
  bookingLink: string | null;
  phone: boolean;
  focusToken: number;
  onManageSavedReplies: () => void;
  /** Text another part of the page wants dropped into the box (e.g. "Send booking link"). */
  insertRequest: { text: string; nonce: number } | null;
}) {
  const send = useSendConversationMessage(conversationId);
  const credits = useSmsCredits();
  const savedReplies = useSavedReplies();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const reach = customer
    ? clientReach(customer)
    : { sms: false, email: false, smsWhyNot: null, emailWhyNot: null };

  const balance = credits.data?.balance ?? 0;
  const unlimited = credits.data?.unlimited ?? false;
  const noCredits = !unlimited && credits.data !== undefined && balance <= 0;
  const smsOk = reach.sms && !noCredits;
  const smsWhyNot = !reach.sms ? reach.smsWhyNot : noCredits ? "No credits left" : null;

  const [channel, setChannel] = useState<ReplyChannel | null>(null);
  const autoChannel = defaultReplyChannel(
    messages,
    { sms: smsOk, email: reach.email },
    customer?.contactPreferences?.preferredChannel,
  );
  const effective: ReplyChannel | null =
    channel === "sms" && smsOk ? "sms" : channel === "email" && reach.email ? "email" : autoChannel;

  useEffect(() => {
    if (focusToken > 0) textRef.current?.focus();
  }, [focusToken]);

  const lastInsert = useRef(0);
  useEffect(() => {
    if (!insertRequest || insertRequest.nonce === lastInsert.current) return;
    lastInsert.current = insertRequest.nonce;
    insertAtCaret(textRef.current, draft, insertRequest.text, setDraft);
    // Only the request should trigger this, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest]);

  // Grow with the text: 56px (44 on phone) up to 160px.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, Math.max(phone ? 44 : 56, el.scrollHeight))}px`;
  }, [draft, phone]);

  const suggestions = useMemo(() => quickReplies(unansweredText(messages)), [messages]);

  const segments = smsSegments(staffSmsText(businessName, draft || " ")).segments;
  const tooLongForText = effective === "sms" && segments > MAX_SMS_SEGMENTS;
  const shortOfCredits = effective === "sms" && !unlimited && segments > balance;
  const subjectValue = subject ?? defaultSubject(messages, businessName);
  const channelToSend = effective ?? "in_app";
  const canSend =
    draft.trim().length > 0 &&
    !send.isPending &&
    !tooLongForText &&
    !shortOfCredits &&
    (channelToSend !== "email" || subjectValue.trim().length > 0);

  const submit = async () => {
    if (!canSend) return;
    const body = draft.trim();
    setDraft("");
    try {
      await send.mutateAsync({
        body,
        channel: channelToSend,
        ...(channelToSend === "email" ? { subject: subjectValue.trim() } : {}),
      });
      setSubject(null);
    } catch {
      setDraft(body);
    }
  };

  const cost = (() => {
    if (effective === "email") return { tone: "muted" as const, text: "Free" };
    if (effective !== "sms") {
      return {
        tone: "muted" as const,
        text: "No mobile or email on file: this shows in their client account only",
      };
    }
    if (unlimited)
      return { tone: "muted" as const, text: `${creditsLabel(segments)} · included in your plan` };
    if (tooLongForText)
      return {
        tone: "error" as const,
        text: `Too long for a text (${MAX_SMS_SEGMENTS} texts at most)`,
      };
    if (shortOfCredits)
      return {
        tone: "amber" as const,
        text: `${creditsLabel(segments)} · only ${balance} left`,
        buy: true,
      };
    return {
      tone: balance < LOW_CREDITS ? ("amber" as const) : ("muted" as const),
      text: `${creditsLabel(segments)} · ${balance} left`,
      buy: balance < LOW_CREDITS,
    };
  })();

  return (
    <div className="border-t bg-panel px-[18px] pt-3 pb-3.5">
      <div
        className={cn("mb-2.5 flex gap-1.5", "no-scrollbar -mx-[18px] overflow-x-auto px-[18px]")}
      >
        {suggestions.map((s) => (
          <SmallChip key={s} onClick={() => setDraft(s)}>
            {s}
          </SmallChip>
        ))}
        {bookingLink ? (
          <SmallChip onClick={() => insertAtCaret(textRef.current, draft, bookingLink, setDraft)}>
            <Link2 className="size-3.5" /> Send booking link
          </SmallChip>
        ) : null}
        <SavedRepliesMenu
          replies={savedReplies.data ?? []}
          onPick={(body) => insertAtCaret(textRef.current, draft, body, setDraft)}
          onManage={onManageSavedReplies}
        />
      </div>

      {effective === "email" ? (
        <label className="mb-2 flex items-center gap-2 border-b pb-2 text-[13px]">
          <span className="text-muted-foreground">Subject</span>
          <input
            value={subjectValue}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none md:text-[13px]"
          />
        </label>
      ) : null}

      <label htmlFor={`${noteId}-field`} className="sr-only">
        Message
      </label>
      <textarea
        id={`${noteId}-field`}
        ref={textRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (phone || e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          void submit();
        }}
        aria-describedby={noteId}
        placeholder="Write a message…"
        maxLength={2000}
        rows={1}
        className={cn(
          "block w-full resize-none bg-transparent text-base leading-5 outline-none md:text-[14px] placeholder:text-muted-foreground",
          phone ? "min-h-11" : "min-h-14",
        )}
      />

      <div className="mt-2 flex items-center gap-3">
        <ChannelSwitch
          value={effective}
          onChange={setChannel}
          sms={{ ok: smsOk, why: smsWhyNot }}
          email={{ ok: reach.email, why: reach.emailWhyNot }}
        />
        <p
          id={noteId}
          aria-live="polite"
          className={cn(
            "min-w-0 flex-1 truncate text-[12px]",
            cost.tone === "amber"
              ? "font-semibold text-[#8a5300] dark:text-[#f3b878]"
              : cost.tone === "error"
                ? "font-semibold text-destructive"
                : "text-muted-foreground",
          )}
        >
          {noCredits && reach.sms && effective !== "sms" ? (
            <>
              No credits left ·{" "}
              <Link to="/billing/sms-credits" className="underline">
                Buy credits
              </Link>
            </>
          ) : (
            <>
              {cost.text}
              {"buy" in cost && cost.buy ? (
                <>
                  {" · "}
                  <Link to="/billing/sms-credits" className="underline">
                    Buy credits
                  </Link>
                </>
              ) : null}
            </>
          )}
        </p>
        <Button className="h-[34px]" disabled={!canSend} onClick={() => void submit()}>
          <Send className="size-4" /> Send
        </Button>
      </div>
    </div>
  );
}

function ChannelSwitch({
  value,
  onChange,
  sms,
  email,
}: {
  value: ReplyChannel | null;
  onChange: (c: ReplyChannel) => void;
  sms: { ok: boolean; why: string | null };
  email: { ok: boolean; why: string | null };
}) {
  const options: { value: ReplyChannel; label: string; ok: boolean; why: string | null }[] = [
    { value: "sms", label: "Text", ...sms },
    { value: "email", label: "Email", ...email },
  ];
  return (
    <div role="radiogroup" aria-label="Send by" className="flex rounded-full bg-secondary p-0.5">
      {options.map((o) => {
        const checked = value === o.value;
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={!o.ok}
            onClick={() => o.ok && onChange(o.value)}
            className={cn(
              "h-7 rounded-full px-3 text-[12.5px] font-bold transition-colors",
              checked ? "bg-panel text-foreground shadow-sm" : "text-foreground/65",
              o.ok ? "cursor-pointer hover:text-foreground" : "cursor-not-allowed opacity-45",
            )}
          >
            {o.label}
          </button>
        );
        return o.ok || !o.why ? (
          button
        ) : (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>{o.why}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SavedRepliesMenu({
  replies,
  onPick,
  onManage,
}: {
  replies: { id: string; title: string; body: string }[];
  onPick: (body: string) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = replies.filter((r) =>
    `${r.title} ${r.body}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SmallChip aria-haspopup="dialog">
          Saved replies <ChevronDown className="size-3.5" />
        </SmallChip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved replies"
            aria-label="Search saved replies"
            className="h-8 w-full rounded-md bg-secondary px-2.5 text-base outline-none md:text-[13px]"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-muted-foreground">
              {replies.length === 0 ? "No saved replies yet" : "No matches"}
            </li>
          ) : (
            shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r.body);
                    setOpen(false);
                  }}
                  className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-secondary"
                >
                  <span className="block text-[13px] font-bold">{r.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{r.body}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onManage();
          }}
          className="block w-full cursor-pointer border-t px-3 py-2 text-left text-[13px] font-semibold hover:bg-secondary"
        >
          Manage saved replies
        </button>
      </PopoverContent>
    </Popover>
  );
}
