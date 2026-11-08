import { useEffect, useMemo } from "react";
import {
  useClientStatsBookings,
  useFollowUps,
  useLinkedRecordDefinition,
  useLinkedRecordsInfinite,
} from "@/lib/api/hooks";
import type { LinkedRecordWithOwner } from "@/lib/api/types";
import {
  dueByRecord,
  duplicateGroups,
  EMPTY_VEHICLE_STATS,
  registrationOf,
  vehicleStatsById,
  vehicleTitle,
  type VehicleDue,
  type VehicleField,
  type VehicleStats,
} from "@/lib/vehicles";

/** Enough for a big detailing shop; beyond this the page says the list is partial. */
const MAX_PAGES = 30;

type Drainable = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  data?: { pages: unknown[] };
  fetchNextPage: () => Promise<unknown>;
};

/** Keeps fetching an infinite query's pages until it's exhausted (or capped). */
function useDrain(q: Drainable) {
  const pages = q.data?.pages.length ?? 0;
  useEffect(() => {
    if (q.hasNextPage && !q.isFetchingNextPage && !q.isError && pages < MAX_PAGES) {
      void q.fetchNextPage();
    }
  }, [q, pages]);
  return {
    done: !q.hasNextPage || pages >= MAX_PAGES,
    capped: q.hasNextPage && pages >= MAX_PAGES,
  };
}

export type VehicleRow = LinkedRecordWithOwner & {
  ownerName: string;
  stats: VehicleStats;
  due: VehicleDue | null;
  /** Distinct owners sharing this registration (1 when it's unique). */
  duplicateOwners: number;
};

export const ownerNameOf = (owner: LinkedRecordWithOwner["owner"]) =>
  owner ? [owner.firstName, owner.lastName ?? ""].join(" ").trim() : "";

/** The schema's active fields in display order. */
export function useVehicleFields() {
  const definition = useLinkedRecordDefinition();
  const fields = useMemo(
    () =>
      ((definition.data?.fields ?? []) as unknown as VehicleField[])
        .filter((f) => (f.status ?? "active") === "active")
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [definition.data],
  );
  return { definition, fields };
}

/** Plate and "Make Model" for every record by id, for lists that only carry a record id. */
export function useVehicleLookup({ enabled = true }: { enabled?: boolean } = {}) {
  const { definition, fields } = useVehicleFields();
  const hasRecords = Boolean(definition.data?.definition);
  const active = useLinkedRecordsInfinite({
    status: "active",
    limit: 100,
    enabled: enabled && hasRecords,
  });
  const archived = useLinkedRecordsInfinite({
    status: "archived",
    limit: 100,
    enabled: enabled && hasRecords,
  });
  useDrain(active);
  useDrain(archived);
  return useMemo(() => {
    const map = new Map<string, { plate: string | null; title: string }>();
    for (const r of [...active.items, ...archived.items]) {
      const record = r?.record;
      if (!record?.id) continue;
      map.set(record.id, {
        plate: registrationOf(record.values, fields),
        title: vehicleTitle({ ...record, displayLabel: record.displayLabel ?? "" }, fields),
      });
    }
    return map;
  }, [active.items, archived.items, fields]);
}

/**
 * Every record (active and archived) with the figures the list shows. The API has
 * no per-vehicle stats, so jobs, last job and next booking come from the shared
 * booking history (same cache as the Clients page) and "due" from open follow-ups.
 */
export function useVehiclesData({ enabled = true }: { enabled?: boolean } = {}) {
  const { definition, fields } = useVehicleFields();
  const active = useLinkedRecordsInfinite({ status: "active", limit: 100, enabled });
  const archived = useLinkedRecordsInfinite({ status: "archived", limit: 100, enabled });
  const followUps = useFollowUps({ status: ["scheduled", "sent"], enabled });
  const bookings = useClientStatsBookings(enabled);

  const activeDrain = useDrain(active);
  const archivedDrain = useDrain(archived);
  useDrain(followUps);

  const records = useMemo(
    () => [...active.items, ...archived.items],
    [active.items, archived.items],
  );

  const rows = useMemo<VehicleRow[]>(() => {
    const stats = vehicleStatsById(bookings.data?.bookings ?? [], Date.now());
    const due = dueByRecord(followUps.items);
    const owners = new Map<string, number>();
    for (const g of duplicateGroups(records, fields)) {
      for (const r of g.rows) owners.set(r.record.id, g.owners);
    }
    return records.map((r) => ({
      ...r,
      ownerName: ownerNameOf(r.owner),
      stats: stats.get(r.record.id) ?? EMPTY_VEHICLE_STATS,
      due: r.record.status === "active" ? (due.get(r.record.id) ?? null) : null,
      duplicateOwners: owners.get(r.record.id) ?? 1,
    }));
  }, [records, bookings.data, followUps.items, fields]);

  return {
    definition,
    fields,
    rows,
    records,
    isLoading: active.isLoading || definition.isLoading,
    isError: active.isError,
    refetch: () => {
      void active.refetch();
      void archived.refetch();
    },
    /** Still paging in records; counts and duplicates may change. */
    loadingMore: !activeDrain.done || !archivedDrain.done,
    /** Booking stats are missing or cut short, so jobs and dates may be low. */
    statsIncomplete:
      activeDrain.capped ||
      archivedDrain.capped ||
      (bookings.data ? !bookings.data.complete : false),
    statsLoading: bookings.isLoading,
  };
}
