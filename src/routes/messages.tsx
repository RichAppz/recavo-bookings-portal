import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, PersonAvatar, SectionCard } from "@/components/ui-bits";
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
import { Can, useTenant } from "@/lib/tenant/tenant-context";
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

function MessagesPage() {
  const tenant = useTenant();
  const conversations = useConversations();
  const customers = useCustomers();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);

  const canReply = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);

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
          <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
            <Button variant="outline" onClick={() => setAnnounce(true)}>
              <Megaphone className="size-4" /> Send announcement
            </Button>
          </Can>
        }
      />

      <Can
        permission={PERMISSIONS.CUSTOMER_READ}
        fallback={
          <EmptyState
            title="Messages are restricted"
            description="Ask a business owner or administrator to grant you client access."
          />
        }
      >
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
                        m.senderType === "staff" || m.senderType === "system"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-secondary"
                      } ${m.id.startsWith("optimistic-") ? "opacity-60" : ""}`}
                    >
                      {m.isAnnouncement ? (
                        <p className="mb-1 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                          Announcement
                        </p>
                      ) : null}
                      <p>{m.body}</p>
                      <p className="mt-1 text-[11px] opacity-70">
                        {formatInTz(m.createdAt, "Europe/London", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {m.senderType === "staff" && m.readByCustomerAt ? " · Seen" : ""}
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
                    placeholder={canReply ? "Write a message…" : "You can't send messages"}
                    disabled={!canReply}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim() && canReply) {
                        void sendMessage.mutateAsync(draft);
                        setDraft("");
                      }
                    }}
                  />
                  <Button
                    disabled={!canReply || sendMessage.isPending || !draft.trim()}
                    onClick={async () => {
                      if (!draft.trim()) return;
                      const body = draft;
                      setDraft("");
                      try {
                        await sendMessage.mutateAsync(body);
                        toast.success("Message sent");
                      } catch {
                        setDraft(body);
                      }
                    }}
                  >
                    <Send className="size-4" /> Send
                  </Button>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </Can>

      <AnnouncementDialog open={announce} onClose={() => setAnnounce(false)} />
    </>
  );
}

function AnnouncementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const customers = useCustomers();
  const createAnnouncement = useCreateAnnouncement();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");

  const reset = () => {
    setSelectedIds(new Set());
    setBody("");
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allIds = (customers.data?.items ?? []).map((c) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send announcement</DialogTitle>
          <DialogDescription>
            One message is posted into each selected client's own conversation — clients never see
            who else received it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Recipients ({selectedIds.size})</label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  setSelectedIds(allSelected ? new Set() : new Set(allIds))
                }
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border">
              {(customers.data?.items ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No clients yet.</p>
              ) : (
                <ul className="divide-y">
                  {(customers.data?.items ?? []).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary/50">
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                        />
                        {customerDisplayName(c)}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="announce-body">
              Message
            </label>
            <Textarea
              id="announce-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Studio closed on Bank Holiday Monday — Saturday classes run as normal."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createAnnouncement.isPending || selectedIds.size === 0 || !body.trim()}
            onClick={async () => {
              if (selectedIds.size === 0) {
                toast.error("Choose at least one client");
                return;
              }
              if (!body.trim()) {
                toast.error("Write an announcement first");
                return;
              }
              const result = await createAnnouncement.mutateAsync({
                customerIds: [...selectedIds],
                body,
              });
              toast.success(`Announcement sent to ${result.recipients} client(s)`);
              onClose();
              reset();
            }}
          >
            {createAnnouncement.isPending ? "Sending…" : "Send announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
