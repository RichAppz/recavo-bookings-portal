import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, PersonAvatar, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useConversations, useCustomers, useMessages, useSendMessage } from "@/lib/api/hooks";
import { customerDisplayName } from "@/lib/api/types";
import { formatInTz } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — RECAVO" },
      {
        name: "description",
        content:
          "Client inbox with conversation threads, quick replies and studio-wide announcements.",
      },
      { property: "og:title", content: "RECAVO Messages" },
      {
        property: "og:description",
        content: "Talk to clients without leaving your booking system.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <MessagesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function MessagesPage() {
  const conversations = useConversations();
  const customers = useCustomers();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);

  const sorted = [...(conversations.data?.conversations ?? [])].sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );
  const conversationId = selected ?? sorted[0]?.id ?? null;
  const conversation = sorted.find((c) => c.id === conversationId) ?? null;
  const messages = useMessages(conversationId ?? undefined);
  const sendMessage = useSendMessage(conversationId ?? undefined);

  const nameFor = (customerId: string) => {
    const c = customers.data?.items.find((x) => x.id === customerId);
    return c ? customerDisplayName(c) : "Client";
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every client conversation in one inbox."
        actions={
          <Button variant="outline" onClick={() => setAnnounce(true)}>
            <Megaphone className="size-4" /> Send announcement
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <SectionCard title="Inbox" bodyClassName="p-0">
          {conversations.isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading conversations…</p>
          ) : conversations.isError ? (
            <div className="p-5">
              <EmptyState title="Couldn't load messages" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No conversations yet"
                description="Message a client from their profile to start a thread."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {sorted.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                      c.id === conversationId ? "bg-primary-soft" : "hover:bg-secondary/60"
                    }`}
                  >
                    <PersonAvatar name={nameFor(c.customerId)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {nameFor(c.customerId)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {c.lastMessageAt
                            ? formatInTz(c.lastMessageAt, "Europe/London", { timeStyle: "short" })
                            : ""}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={conversation ? nameFor(conversation.customerId) : "Conversation"}
          className="min-h-[560px]"
          bodyClassName="flex flex-1 flex-col p-0"
        >
          {!conversation ? (
            <div className="flex-1 p-6">
              <EmptyState
                title="Select a conversation"
                description="Choose a client thread from the inbox."
              />
            </div>
          ) : (
            <>
              <ul className="flex-1 space-y-3 overflow-y-auto p-5">
                {(messages.data?.messages ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.senderType === "staff"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-secondary"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatInTz(m.createdAt, "Europe/London", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </li>
                ))}
                {(messages.data?.messages ?? []).length === 0 && !messages.isLoading ? (
                  <EmptyState
                    title="No messages yet"
                    description="Say hello to start the conversation."
                  />
                ) : null}
              </ul>
              <div className="flex gap-2 border-t p-4">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      void sendMessage.mutateAsync(draft);
                      setDraft("");
                    }
                  }}
                />
                <Button
                  disabled={sendMessage.isPending}
                  onClick={async () => {
                    if (!draft.trim()) return;
                    await sendMessage.mutateAsync(draft);
                    setDraft("");
                    toast.success("Message sent");
                  }}
                >
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <Dialog open={announce} onOpenChange={setAnnounce}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send announcement</DialogTitle>
            <DialogDescription>
              Bulk announcements aren't available from the console yet — reach clients individually
              from their profile.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            placeholder="Studio closed on Bank Holiday Monday — Saturday classes run as normal."
            disabled
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnnounce(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
