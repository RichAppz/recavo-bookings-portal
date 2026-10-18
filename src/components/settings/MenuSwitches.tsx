import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  GroupedBlock,
  PlanGatedRow,
  SwitchRow,
  useSavedTick,
} from "@/components/settings/primitives";
import { Button } from "@/components/ui/button";
import {
  useLinkedRecordDefinition,
  useSubscription,
  useUpdateConfiguration,
} from "@/lib/api/hooks";
import { NAV_FEATURES, hiddenNavFrom, type NavFeature } from "@/lib/nav-features";
import { PERMISSIONS, canManageSaasBilling } from "@/lib/permissions";
import { useSoloPlan } from "@/lib/sole";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Settings → Business details → Menu. One switch per optional sidebar item; off
 * removes it from the menu for everyone in the business, saved straight away.
 * Staff is a plan matter as well: on Solo the seat is the owner's own, so the
 * row is plan-gated with "See plans" instead of a switch.
 */
export function MenuSwitches() {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const subscription = useSubscription();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const solo = useSoloPlan();
  const records = useLinkedRecordDefinition();
  const hasRecords = Boolean(records.data?.definition);
  const isCarDetailing = tenant.business?.industryTemplateKey === "car_detailing";
  const canBuy = canManageSaasBilling({
    can: tenant.can,
    roleKeys: tenant.roleKeys,
    blocked: !subscription.data?.subscription,
  });

  const saved = hiddenNavFrom(tenant.configuration);
  const savedKey = [...saved].sort().join(",");
  const [hidden, setHidden] = useState<Set<NavFeature>>(() => new Set(saved));
  const [justSaved, setJustSaved] = useState<NavFeature | null>(null);
  const [tick, flash] = useSavedTick();

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
      setJustSaved(key);
      flash();
    } catch {
      setHidden(new Set(saved)); // useUpdateConfiguration already toasted the error
    }
  };

  return (
    <div className="grid gap-3">
      <GroupedBlock as="ul">
        {rows.map((f) => {
          const locked = f.key === "staff" && solo;
          if (locked) {
            return (
              <li key={f.key} className="p-2">
                <PlanGatedRow
                  title={f.label}
                  hint="Solo seats one person — you. Upgrade to add a team."
                  lock="Business plan"
                  priceLine="Up to 5 team members on Business · 15 on Growth"
                  canBuy={canBuy}
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/settings/$page" params={{ page: "plan" }}>
                        See plans
                      </Link>
                    </Button>
                  }
                  className="border-0 px-2 py-1"
                />
              </li>
            );
          }
          return (
            <SwitchRow
              key={f.key}
              as="li"
              id={`menu-${f.key}`}
              label={f.label}
              hint={f.hint}
              checked={!hidden.has(f.key)}
              saved={tick && justSaved === f.key}
              disabled={!canEdit || update.isPending}
              onCheckedChange={(checked) => void toggle(f.key, checked)}
            />
          );
        })}
      </GroupedBlock>
    </div>
  );
}
