import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, MessageSquare, Minus, Package, Plus, ShieldOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AddBookingModal } from "@/components/AddBookingModal";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PersonAvatar, SectionCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/lib/demo-store";
import { demoToday, gbp, parseIso, relativeDay, ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Client profile — RECAVO" },
      {
        name: "description",
        content:
          "Full client profile: upcoming bookings, package credits, ledger, payment history, notes and messages.",
      },
      { property: "og:title", content: "RECAVO client profile" },
      { property: "og:description", content: "Bookings, credits, payments and notes for a single client." },
    ],
  }),
  component: ClientProfile,
});

function ClientProfile() {
  const { clientId } = Route.useParams();
  const demo = useDemo();
  const [quick, setQuick] = useState<QuickAction>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");

  const client = demo.clientById(clientId);
  if (!client) {
    return (
      <AppShell>
        <EmptyState
          title="Client not found"
          description="This client may have been removed from the demo data."
          action={<Button asChild><Link to="/clients">Back to clients</Link></Button>}
        />
      </AppShell>
    );
  }

  const theirs = demo.bookings.filter((b) => b.clientIds.includes(client.id));
  const upcoming = theirs
    .filter((b) => parseIso(b.date) >= demoToday() && b.status !== "cancelled")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const packages = demo.clientPackages.filter((p) => p.clientId === client.id);
  const ledger = demo.ledger.filter((l) => l.clientId === client.id).slice().reverse();
  const payments = demo.payments.filter((p) => p.clientId === client.id);
  const conversation = demo.conversations.find((c) => c.clientId === client.id);

  return (
    <AppShell>
      <Link to="/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All clients
      </Link>

      <div className="surface-card flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
        <PersonAvatar name={client.name} src={client.avatar} size={72} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <StatusBadge status={client.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.email} · {client.phone} · Client since {ukDate(client.joined)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setQuick("message")}><MessageSquare className="size-4" /> Message</Button>
          <Button variant="outline" onClick={() => setQuick("package")}><Package className="size-4" /> Sell package</Button>
          <Button onClick={() => setBookingOpen(true)}><CalendarPlus className="size-4" /> Create booking</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total bookings", String(theirs.length)],
          ["Attendance rate", `${client.attendanceRate}%`],
          ["Lifetime spend", gbp(client.lifetimeSpend)],
          ["Credit balance", `${demo.creditsFor(client.id)} credits`],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="flex-wrap">
          <TabsTrigger value="upcoming">Upcoming bookings</TabsTrigger>
          <TabsTrigger value="packages">Packages and credits</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {upcoming.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No upcoming bookings"
                  description={`${client.name} has nothing in the diary. Create a booking to get them back in.`}
                  action={<Button onClick={() => setBookingOpen(true)}>Create booking</Button>}
                />
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="w-28">
                      <p className="text-sm font-semibold">{relativeDay(b.date)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{b.time}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{demo.serviceById(b.serviceId).name}</p>
                      <p className="text-xs text-muted-foreground">
                        {demo.staffById(b.staffId).name} · {demo.locationById(b.locationId).name}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => toast.success("Reschedule link sent to client")}>
                        Reschedule
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => demo.cancelBooking(b.id)}>
                        Cancel
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="packages" className="mt-4 space-y-6">
          <SectionCard
            title="Packages"
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => demo.adjustCredits(client.id, 1, "Manual credit added by Alex Morgan")}>
                  <Plus className="size-4" /> Add credit
                </Button>
                <Button variant="outline" size="sm" onClick={() => demo.adjustCredits(client.id, -1, "Manual credit removed by Alex Morgan")}>
                  <Minus className="size-4" /> Remove credit
                </Button>
              </div>
            }
            bodyClassName="p-0"
          >
            {packages.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No packages" description="Sell a package to add credits to this account." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs text-muted-foreground">
                    <tr>
                      {["Package", "Purchased", "Credits", "Remaining", "Expires", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium">{demo.packageById(p.packageId)?.name}</td>
                        <td className="px-4 py-3">{ukDate(p.purchased)}</td>
                        <td className="px-4 py-3 tabular-nums">{p.credits}</td>
                        <td className="px-4 py-3 tabular-nums">{p.remaining}</td>
                        <td className="px-4 py-3">{ukDate(p.expires)}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Credit ledger" description="Every balance change, in order">
            {ledger.length === 0 ? (
              <EmptyState title="No credit activity yet" />
            ) : (
              <ol className="space-y-4">
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-start gap-4">
                    <span
                      className={`mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        l.change > 0 ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {l.change > 0 ? `+${l.change}` : l.change}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{l.description}</p>
                      <p className="text-xs text-muted-foreground">{ukDate(l.date)} · balance {l.balance}</p>
                    </div>
                    <StatusBadge status={l.type === "used" ? "completed" : l.type === "expired" ? "expired" : "active"} />
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {payments.length === 0 ? (
              <div className="p-6"><EmptyState title="No payments recorded" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    {["Date", "Description", "Method", "Amount", "Status", "Stripe reference"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 whitespace-nowrap">{ukDate(p.date)}</td>
                      <td className="px-4 py-3">{p.description}</td>
                      <td className="px-4 py-3">{p.method}</td>
                      <td className="px-4 py-3 tabular-nums">{gbp(p.amount, { decimals: true })}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <SectionCard title="Internal notes" description="Only visible to your team">
            <div className="space-y-3">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a training note, injury update or preference…"
              />
              <Button
                onClick={() => {
                  if (!note.trim()) return toast.error("Write a note first");
                  demo.addNote(client.id, note);
                  setNote("");
                }}
              >
                Save note
              </Button>
            </div>
            <ul className="mt-6 space-y-4">
              {client.notes.map((n) => (
                <li key={n.id} className="rounded-xl border p-4">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{n.author} · {ukDate(n.date)}</p>
                </li>
              ))}
              {client.notes.length === 0 ? (
                <EmptyState title="No notes yet" description="Notes help the whole team coach consistently." />
              ) : null}
            </ul>
          </SectionCard>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <SectionCard title="Conversation">
            {conversation ? (
              <>
                <ul className="space-y-3">
                  {conversation.messages.map((m) => (
                    <li
                      key={m.id}
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.from === "business"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-secondary"
                      }`}
                    >
                      <p>{m.body}</p>
                      <p className="mt-1 text-[11px] opacity-70">{ukDate(m.date)} {m.time}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <Button
                    onClick={() => {
                      if (!reply.trim()) return;
                      demo.sendMessage(conversation.id, reply);
                      setReply("");
                      toast.success("Message sent");
                    }}
                  >
                    Send
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState title="No conversation yet" description="Start a thread from the message action." />
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <div>
        <Button variant="outline" onClick={() => demo.suspendClient(client.id)}>
          <ShieldOff className="size-4" />
          {client.status === "suspended" ? "Reactivate client" : "Suspend client"}
        </Button>
      </div>

      <AddBookingModal open={bookingOpen} onOpenChange={setBookingOpen} defaultClientId={client.id} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} clientId={client.id} />
    </AppShell>
  );
}
