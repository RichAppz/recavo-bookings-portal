import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Megaphone, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, PersonAvatar, SectionCard } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Can } from "@/lib/tenant/tenant-context";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useConversations,
  useCreateAnnouncement,
  useCustomers,
  useMessages,
  useSendMessage,
} from "@/lib/api/hooks";
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

function messageBubbleClass(senderType: string) {
  if (senderType === "staff") return "ml-auto bg-primary text-primary-foreground";
  if (senderType === "system")
    return "mx-auto max-w-[90%] bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100";
  return "bg-secondary";
}

function readMarker(m: {
  senderType: string;
  readByCustomerAt?: string | null;
  readByStaffAt?: string | null;
}) {
  if (m.senderType === "staff" && m.readByCustomerAt) {
    return `Read by client · ${formatInTz(m.readByCustomerAt, "Europe/London", { timeStyle: "short" })}`;
  }
  if (m.senderType === "customer" && m.readByStaffAt) {
    return `Read by team · ${formatInTz(m.readByStaffAt, "Europe/London", { timeStyle: "short" })}`;
  }
  return null;
}

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

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    const saved = draft;
    setDraft("");
    try {
      await sendMessage.mutateAsync(text);
      toast.success("Message sent");
    } catch {
      setDraft(saved);
    }
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every client conversation in one inbox."
        actions={
          <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
            <Button variant="outline" onClick={() => setAnnounce(true)}>
              <Megaphone className="size-4" /> Send announcement
            </Button>
          </Can>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <SectionCard title="Inbox" bodyClassName="p-0">
          {conversations.isLoading ? (
            <TableGhost rows={6} />
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
                {(messages.data?.messages ?? []).map((m) => {
                  const marker = readMarker(m);
                  return (
                    <li
                      key={m.id}
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${messageBubbleClass(m.senderType)}`}
                    >
                      {m.senderType === "system" ? (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          System
                        </p>
                      ) : null}
                      {m.isAnnouncement ? (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          Announcement
                        </p>
                      ) : null}
                      <p>{m.body}</p>
                      <p className="mt-1 text-[11px] opacity-70">
                        {formatInTz(m.createdAt, "Europe/London", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      {marker ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                          <Check className="size-3" /> {marker}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
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
                    if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <Button disabled={sendMessage.isPending} onClick={() => void handleSend()}>
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <AnnouncementDialog open={announce} onClose={() => setAnnounce(false)} />
    </>
  );
}

function AnnouncementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const customers = useCustomers();
  const createAnnouncement = useCreateAnnouncement();
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const clientList = customers.data?.items ?? [];

  const toggleAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedIds(checked ? new Set(clientList.map((c) => c.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
    setSelectAll(next.size === clientList.length && clientList.length > 0);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setBody("");
          setSelectedIds(new Set());
          setSelectAll(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send announcement</DialogTitle>
          <DialogDescription>
            Broadcast a message to selected clients. Each recipient gets their own conversation
            thread.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Studio closed on Bank Holiday Monday — Saturday classes run as normal."
          />
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={selectAll} onCheckedChange={(v) => toggleAll(Boolean(v))} />
              Select all clients ({clientList.length})
            </label>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
              {customers.isLoading ? (
                <li>
                  <TableGhost rows={4} />
                </li>
              ) : clientList.length === 0 ? (
                <li className="text-sm text-muted-foreground">No clients yet</li>
              ) : (
                clientList.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={(v) => toggleOne(c.id, Boolean(v))}
                      />
                      {customerDisplayName(c)}
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createAnnouncement.isPending}
            onClick={async () => {
              if (!body.trim()) return toast.error("Write a message first");
              if (selectedIds.size === 0) return toast.error("Select at least one client");
              await createAnnouncement.mutateAsync({
                customerIds: [...selectedIds],
                body: body.trim(),
              });
              toast.success(`Announcement sent to ${selectedIds.size} client(s)`);
              setBody("");
              setSelectedIds(new Set());
              setSelectAll(false);
              onClose();
            }}
          >
            Send announcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
