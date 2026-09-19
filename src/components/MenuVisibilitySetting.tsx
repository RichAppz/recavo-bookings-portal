import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLinkedRecordDefinition, useUpdateConfiguration } from "@/lib/api/hooks";
import { NAV_FEATURES, hiddenNavFrom, type NavFeature } from "@/lib/nav-features";
import { PERMISSIONS } from "@/lib/permissions";
import { useSoloPlan } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Settings → Configuration → Menu. One switch per optional sidebar item; off
 * removes it from the menu for everyone in the business. Staff is a plan
 * matter as well: on Solo the seat is the owner's own, so the row stays off
 * and flipping it opens the upgrade prompt instead.
 */
export function MenuVisibilitySetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const solo = useSoloPlan();
  const records = useLinkedRecordDefinition();
  const hasRecords = Boolean(records.data?.definition);
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";

  const saved = hiddenNavFrom(tenant.configuration);
  const savedKey = [...saved].sort().join(",");
  const [hidden, setHidden] = useState<Set<NavFeature>>(() => new Set(saved));
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    setHidden(new Set(saved));
    // Re-seed only when the stored list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  // Rows for things this business doesn't have at all are noise.
  const rows = NAV_FEATURES.filter(
    (f) => (f.key !== "consumables" || isCarDetailing) && (f.key !== "records" || hasRecords),
  );

  const toggle = async (key: NavFeature, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(key);
    else next.add(key);
    setHidden(next);
    try {
      await update.mutateAsync({ navigation: { hidden: [...next] } });
    } catch {
      setHidden(new Set(saved)); // useUpdateConfiguration already toasted the error
    }
  };

  return (
    <SectionCard
      title="Menu"
      description="Switch off the parts of RECAVO you don't use. Hidden items leave the sidebar for everyone in the business; nothing is deleted and you can bring them back any time."
      className={className}
    >
      <ul className="divide-y">
        {rows.map((f) => {
          const locked = f.key === "staff" && solo;
          const on = locked ? false : !hidden.has(f.key);
          const id = `menu-${f.key}`;
          return (
            <li key={f.key} className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <label htmlFor={id} className="min-w-0 cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {f.label}
                  {locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> Business plan
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {locked ? "Solo seats one person — you. Upgrade to add a team." : f.hint}
                </span>
              </label>
              <Switch
                id={id}
                checked={on}
                disabled={!canEdit || (!locked && update.isPending)}
                aria-label={`Show ${f.label} in the menu`}
                className={cn(locked && "opacity-70")}
                onCheckedChange={(checked) => {
                  if (locked) {
                    setUpgradeOpen(true);
                    return;
                  }
                  void toggle(f.key, checked);
                }}
              />
            </li>
          );
        })}
      </ul>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Staff needs a bigger plan</DialogTitle>
            <DialogDescription>
              Your Solo plan has one seat, and that's you — your own hours and time off live under
              Your availability. Move to Business for up to 5 team members, or Growth for 15, and
              the Staff page comes back to the menu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Not now
            </Button>
            <Button asChild>
              <Link to="/billing" onClick={() => setUpgradeOpen(false)}>
                See plans
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
