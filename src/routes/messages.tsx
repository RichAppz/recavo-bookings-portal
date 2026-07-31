import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, PersonAvatar, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemo } from "@/lib/demo-store";
import { ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — RECAVO" },
      {
        name: "description",
        content: "Client inbox with conversation threads, quick replies and studio-wide announcements.",
      },
      { property: "og:title", content: "RECAVO Messages" },
      { property: "og:description", content: "Talk to clients without leaving your booking system." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const demo = useDemo();
  const [selected, setSelected] = useState(demo.conversations[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);

  const conversation = demo.conversations.find((c) => c.id === selected);

  return (
    <AppShell>
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
          <ul className="divide-y">
            {demo.conversations.map((c) => {
              const client = demo.clientById(c.clientId);
              const last = c.messages[c.messages.length - 1];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setSelected(c.id);
                      demo.markConversationRead(c.id);
                    }}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                      c.id === selected ? "bg-primary-soft" : "hover:bg-secondary/60"
                    }`}
                  >
                    <PersonAvatar name={client?.name ?? "Client"} src={client?.avatar} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.title ?? client?.name}</span>
                        <span className="text-[11px] text-muted-foreground">{last ? last.time : ""}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {last?.body}
                      </span>
                    </span>
                    {c.unread > 0 ? (
                      <span className="mt-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard
          title={conversation ? demo.clientById(conversation.clientId)?.name ?? "Conversation" : "Conversation"}
          description={conversation?.kind === "announcement" ? "Announcement thread" : "Direct message"}
          className="min-h-[560px]"
          bodyClassName="flex flex-1 flex-col p-0"
        >
          <ul className="flex-1 space-y-3 overflow-y-auto p-5">
            {conversation?.messages.map((m) => (
              <li
                key={m.id}
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.from === "business" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                <p>{m.body}</p>
                <p className="mt-1 text-[11px] opacity-70">{ukDate(m.date)} {m.time}</p>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t p-4">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && conversation) {
                  demo.sendMessage(conversation.id, draft);
                  setDraft("");
                }
              }}
            />
            <Button
              onClick={() => {
                if (!draft.trim() || !conversation) return;
                demo.sendMessage(conversation.id, draft);
                setDraft("");
                toast.success("Message sent");
              }}
            >
              <Send className="size-4" /> Send
            </Button>
          </div>
        </SectionCard>
      </div>

      <Dialog open={announce} onOpenChange={setAnnounce}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send announcement</DialogTitle>
            <DialogDescription>Message every active client at once.</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} placeholder="Studio closed on Bank Holiday Monday — Saturday classes run as normal." />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnnounce(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setAnnounce(false);
                toast.success(`Announcement sent to ${demo.clients.length} clients`);
              }}
            >
              Send to all clients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
