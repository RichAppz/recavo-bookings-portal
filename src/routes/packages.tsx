import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemo } from "@/lib/demo-store";
import { gbp, ukDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "Packages and credits — RECAVO" },
      {
        name: "description",
        content:
          "Sell session packages, track credit balances and follow every credit movement in the ledger.",
      },
      { property: "og:title", content: "RECAVO Packages" },
      { property: "og:description", content: "Credit packages, expiries and the full credit ledger." },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
  const demo = useDemo();
  const [creating, setCreating] = useState(false);
  const [quick, setQuick] = useState<QuickAction>(null);

  const activeCredits = demo.clientPackages
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.remaining, 0);
  const packageRevenue = demo.packageDefs.reduce((s, p) => s + p.revenue, 0);

  return (
    <AppShell>
      <PageHeader
        title="Packages and credits"
        description="Prepaid blocks of sessions, plus every credit movement across your clients."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuick("package")}>Sell package</Button>
            <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New package</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Packages sold" value={String(demo.packageDefs.reduce((s, p) => s + p.sold, 0))} change={9.1} />
        <StatCard label="Package revenue" value={gbp(packageRevenue)} change={11.8} />
        <StatCard label="Outstanding credits" value={String(activeCredits)} hint="unredeemed sessions" />
        <StatCard
          label="Expiring this month"
          value={String(demo.clientPackages.filter((p) => p.status === "active").length)}
          hint="active packages"
        />
      </div>

      <SectionCard title="Package types" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr>
                {["Package", "Price", "Credits", "Validity", "Eligible services", "Sold", "Revenue", "Active"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {demo.packageDefs.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 tabular-nums">{gbp(p.price)}</td>
                  <td className="px-4 py-3 tabular-nums">{p.credits}</td>
                  <td className="px-4 py-3">{p.validity}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.eligibleServices.map((id) => demo.serviceById(id).name).join(", ")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.sold}</td>
                  <td className="px-4 py-3 tabular-nums">{gbp(p.revenue)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.active ? "active" : "inactive"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Client credit balances" description="Live balances across active packages" bodyClassName="p-0">
          <ul className="divide-y">
            {demo.clients.slice(0, 8).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {demo.clientPackages
                      .filter((p) => p.clientId === c.id && p.status === "active")
                      .map((p) => `${demo.packageById(p.packageId)?.name} · expires ${ukDate(p.expires)}`)
                      .join(" · ") || "No active package"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary tabular-nums">
                  {demo.creditsFor(c.id)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Credit ledger" description="Purchases, redemptions, returns and expiries" bodyClassName="p-0">
          <ul className="divide-y">
            {demo.ledger.slice().reverse().slice(0, 10).map((l) => (
              <li key={l.id} className="flex items-center gap-4 px-5 py-3">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    l.change > 0 ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {l.change > 0 ? `+${l.change}` : l.change}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{demo.clientById(l.clientId)?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                </div>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{ukDate(l.date)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <NewPackageDialog open={creating} onClose={() => setCreating(false)} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </AppShell>
  );
}

function NewPackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = useDemo();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("180");
  const [credits, setCredits] = useState("4");
  const [validity, setValidity] = useState("1 month");
  const [active, setActive] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New package</DialogTitle>
          <DialogDescription>Bundle sessions into prepaid credits with an expiry window.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Package name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly 1-to-1 Package" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="p-price">Price (£)</Label>
              <Input id="p-price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-credits">Credits</Label>
              <Input id="p-credits" value={credits} onChange={(e) => setCredits(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-validity">Validity</Label>
              <Input id="p-validity" value={validity} onChange={(e) => setValidity(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Available to buy</p>
              <p className="text-xs text-muted-foreground">Show on the public booking page</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!name.trim()) return toast.error("Give the package a name");
              demo.addPackage({
                id: `p${Math.random().toString(36).slice(2, 6)}`,
                name,
                price: Number(price) || 0,
                credits: Number(credits) || 1,
                validity,
                eligibleServices: ["sv1"],
                sold: 0,
                revenue: 0,
                active,
              });
              onClose();
            }}
          >
            Create package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
