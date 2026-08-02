import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuickActionDialogs, type QuickAction } from "@/components/QuickActions";
import { EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from "@/components/ui-bits";
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
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useCreatePackage, usePackages, useServices } from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format";
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
      {
        property: "og:description",
        content: "Credit packages, expiries and the full credit ledger.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PackagesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function PackagesPage() {
  const packages = usePackages();
  const services = useServices();
  const [creating, setCreating] = useState(false);
  const [quick, setQuick] = useState<QuickAction>(null);

  const activePackages = (packages.data ?? []).filter((p) => p.active).length;

  return (
    <>
      <PageHeader
        title="Packages and credits"
        description="Prepaid blocks of sessions, plus every credit movement across your clients."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuick("package")}>
              Sell package
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New package
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Package types" value={String((packages.data ?? []).length)} />
        <StatCard label="Available to buy" value={String(activePackages)} />
        <StatCard
          label="Total credits per sale"
          value={String((packages.data ?? []).reduce((s, p) => s + p.creditsIssued, 0))}
          hint="across all package types"
        />
      </div>

      <SectionCard title="Package types" bodyClassName="p-0">
        {packages.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading packages…</p>
        ) : packages.isError ? (
          <div className="p-6">
            <EmptyState title="Couldn't load packages" description="Please try again shortly." />
          </div>
        ) : (packages.data ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No packages yet"
              description="Create a package to let clients buy credits up front."
              action={<Button onClick={() => setCreating(true)}>New package</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Package",
                    "Price",
                    "Credits",
                    "Validity",
                    "Eligible services",
                    "Available",
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(packages.data ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(p.priceMinor, p.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p.creditsIssued}</td>
                    <td className="px-4 py-3">
                      {p.validity.amount} {p.validity.kind.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.eligibleServiceIds.length === 0
                        ? "All services"
                        : p.eligibleServiceIds
                            .map((id) => services.data?.find((s) => s.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.active ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Client credit balances and ledgers"
        description="Open a client profile to view or adjust their balances"
      >
        <Link to="/clients" className="text-sm text-primary hover:underline">
          Go to clients →
        </Link>
      </SectionCard>

      <NewPackageDialog open={creating} onClose={() => setCreating(false)} />
      <QuickActionDialogs action={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function NewPackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createPackage = useCreatePackage();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("180");
  const [credits, setCredits] = useState("4");
  const [validityMonths, setValidityMonths] = useState("1");
  const [active, setActive] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New package</DialogTitle>
          <DialogDescription>
            Bundle sessions into prepaid credits with an expiry window.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Package name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Monthly 1-to-1 Package"
            />
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
              <Label htmlFor="p-validity">Valid for (months)</Label>
              <Input
                id="p-validity"
                value={validityMonths}
                onChange={(e) => setValidityMonths(e.target.value)}
              />
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={createPackage.isPending}
            onClick={async () => {
              if (!name.trim()) return toast.error("Give the package a name");
              await createPackage.mutateAsync({
                name,
                priceMinor: Math.round((Number(price) || 0) * 100),
                currency: "GBP",
                creditsIssued: Number(credits) || 1,
                validity: { kind: "calendar_months", amount: Number(validityMonths) || 1 },
                salesAvailable: active,
              });
              toast.success("Package created");
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
