import { useMemo } from "react";
import { useLocationsList, useStaffList, useSubscription } from "@/lib/api/hooks";
import type { Location, Staff } from "@/lib/api/types";

/**
 * True when the plan seats one staff member (Solo). The owner *is* the team, so
 * team-management UI — the Staff menu item, the team list, invites — is noise;
 * their own availability is still edited on `/staff`, reached from setup and
 * the dashboard rather than the menu. Unknown plan (still loading, no
 * subscription yet) is treated as a team so nothing is hidden by mistake.
 */
export function useSoloPlan(): boolean {
  const subscription = useSubscription();
  const plan = subscription.data?.plan;
  if (!plan) return false;
  // The view carries the stored plan row: a versioned code (`solo_v1`) and the
  // seat limit under `staff.active` (older seeds: `staff`).
  const seats = plan.limits?.["staff.active"] ?? plan.limits?.["staff"];
  return /^solo(_|$)/.test(plan.code) || seats === 1;
}

/**
 * One-person, one-place businesses should never be asked to choose the only
 * option. These hooks name the sole active staff member / location (or null when
 * there are several, none, or the list hasn't loaded), so every form and filter
 * applies the same rule: fill it in silently and drop the control.
 */
export function useSoleStaff(): Staff | null {
  const staff = useStaffList();
  return useMemo(() => {
    if (!staff.isSuccess) return null;
    const active = (staff.data ?? []).filter((s) => s.status === "active");
    return active.length === 1 ? active[0]! : null;
  }, [staff.isSuccess, staff.data]);
}

export function useSoleLocation(): Location | null {
  const locations = useLocationsList();
  return useMemo(() => {
    if (!locations.isSuccess) return null;
    const list = locations.data ?? [];
    return list.length === 1 ? list[0]! : null;
  }, [locations.isSuccess, locations.data]);
}
