import { useMemo } from "react";
import { useLocationsList, useStaffList } from "@/lib/api/hooks";
import type { Location, Staff } from "@/lib/api/types";

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
