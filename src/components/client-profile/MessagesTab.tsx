import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useTeamMemberName } from "@/components/client-profile/Notes";
import { ProfileCard } from "@/components/client-profile/parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConversations,
  useCustomerNotifications,
  useMessages,
  useOpenConversation,
  useSendMessage,
} from "@/lib/api/hooks";
import type { ConversationMessage } from "@/lib/api/types";
import { buildTimeline, dayLabel, notificationText, unreadFromClient } from "@/lib/client-profile";
import { isoDateInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The client's existing conversation, without creating one just by viewing the profile. */
export function useExistingConversationId(customerId: string): string | null {
  const conversations = useConversations();
  return (
    (conversations.data?.conversations ?? []).find((c) => c.customerId === customerId)?.id ?? null
  );
}

export function useUnreadFromClient(customerId: string): number {
  const id = useExistingConversationId(customerId);
  const messages = useMessages(id ?? undefined);
  return unreadFromClient(messages.data?.messages ?? []);
}

const time = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));

export function MessagesTab({
  customerId,
  firstName,
  timezone,
  disabled,
  focusKey,
  isPhone,
}: {
  customerId: string;
  firstName: string;
  timezone: string;
  disabled?: boolean;
  /** Changes each time the header's Message is pressed, to focus the reply box. */
  focusKey: number;
  isPhone: boolean;
}) {
  const existingId = useExistingConversationId(customerId);
  const openConversation = useOpenConversation();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const conversationId = existingId ?? openedId;
  const conversations = useConversations();

  useEffect(() => {
    if (conversations.isLoading || existingId || openedId || disabled) return;
    openConversation.mutate({ customerId }, { onSuccess: (conv) => setOpenedId(conv.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, conversations.isLoading, existingId, disabled]);

  const messages = useMessages(conversationId ?? undefined);
  const notifications = useCustomerNotifications(customerId);
  const sendMessage = useSendMessage(conversationId ?? undefined);
  const memberName = useTeamMemberName();
  const [reply, setReply] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusKey > 0) replyRef.current?.focus();
  }, [focusKey]);

  const items = useMemo(
    () => buildTimeline(messages.data?.messages ?? [], notifications.data ?? []),
    [messages.data, notifications.data],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const now = new Date();
  const send = async () => {
    const body = reply.trim();
    if (!body || !conversationId) return;
    await sendMessage.mutateAsync(body);
    setReply("");
    toast.success("Message sent");
  };

  const sender = (m: ConversationMessage) =>
    m.senderType === "customer" ? firstName : memberName(m.senderId);

  let lastDay = "";
  return (
    <ProfileCard
      title="Conversation"
      note="Messages, plus reminders and updates we sent"
      className={cn(isPhone && "flex min-h-[70vh] flex-col")}
      bodyClassName={cn(isPhone && "flex min-h-0 flex-1 flex-col")}
    >
      <div
        className={cn(
          "grid gap-2.5 border-t px-4 py-4",
          isPhone ? "min-h-0 flex-1 overflow-y-auto" : "max-h-[60vh] overflow-y-auto",
        )}
        aria-live="polite"
      >
        {!conversationId && !notifications.data ? (
          <p className="text-sm text-muted-foreground">Opening conversation…</p>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold">No messages yet</p>
            <p className="text-sm text-muted-foreground">Say hello to start the conversation.</p>
          </div>
        ) : (
          items.map((item) => {
            const day = isoDateInTz(item.at, timezone);
            const separator =
              day !== lastDay ? (
                <p className="py-1 text-center text-xs font-bold text-muted-foreground">
                  {dayLabel(item.at, now, timezone)}
                </p>
              ) : null;
            lastDay = day;
            if (item.kind === "system" || item.message.senderType === "system") {
              const text =
                item.kind === "system" ? notificationText(item.notification) : item.message.body;
              return (
                <Fragment
                  key={item.kind === "system" ? `n-${item.notification.id}` : item.message.id}
                >
                  {separator}
                  <p className="mx-auto flex max-w-[85%] items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-center text-xs text-muted-foreground">
                    <Bell className="size-3 shrink-0" />
                    <span>
                      {text} · {time(item.at, timezone)}
                    </span>
                  </p>
                </Fragment>
              );
            }
            const m = item.message;
            const staff = m.senderType === "staff";
            const who = sender(m);
            const unread = !staff && !m.readByStaffAt;
            return (
              <Fragment key={m.id}>
                {separator}
                <div
                  className={cn(
                    "flex max-w-[70%] flex-col",
                    staff ? "items-end self-end" : "items-start",
                  )}
                  aria-label={`${who ?? (staff ? "Your team" : firstName)}, ${time(m.createdAt, timezone)}: ${m.body}`}
                >
                  <p
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                      staff
                        ? "rounded-br-[4px] bg-primary text-primary-foreground"
                        : "rounded-bl-[4px] border bg-secondary/40",
                    )}
                  >
                    {m.body}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {time(m.createdAt, timezone)}
                    {staff && who ? ` · ${who}` : ""}
                    {unread ? (
                      <span className="font-semibold text-warning-foreground"> · unread</span>
                    ) : null}
                  </p>
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <form
        className={cn("grid gap-2 border-t px-4 py-3", isPhone && "sticky bottom-0 bg-card")}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          ref={replyRef}
          rows={isPhone ? 2 : 3}
          value={reply}
          disabled={disabled || !conversationId}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (!isPhone && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a reply…"
          aria-label={`Reply to ${firstName}`}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isPhone ? null : "Enter to send · Shift+Enter for a new line"}
          </p>
          <Button
            type="submit"
            disabled={disabled || !conversationId || sendMessage.isPending || !reply.trim()}
          >
            {sendMessage.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </ProfileCard>
  );
}
