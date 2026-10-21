import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DeleteLinkedRecordDialog,
  TransferLinkedRecordDialog,
} from "@/components/LinkedRecordDialogs";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import type { VehicleRow } from "@/components/vehicles/use-vehicles-data";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { queryKeys } from "@/lib/api";
import { usePatchLinkedRecord } from "@/lib/api/hooks";
import type { LinkedRecord } from "@/lib/api/types";
import { formatInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { type DuplicateGroup, type VehicleField, vehicleTitle } from "@/lib/vehicles";

/**
 * Review for registrations that sit on more than one active record (spec §2.4).
 * There's no merge endpoint yet, so each copy can be opened, transferred, archived
 * or deleted, and a group that really is two different vehicles can be dismissed.
 */
export function DuplicatesDialog({
  open,
  onOpenChange,
  groups,
  fields,
  onNotSame,
  onOpenVehicle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: DuplicateGroup<VehicleRow>[];
  fields: readonly VehicleField[];
  onNotSame: (key: string) => void;
  onOpenVehicle: (id: string) => void;
}) {
  const tenant = useTenant();
  const term = tenant.terminology.linkedRecord || "Vehicle";
  const lower = term.toLowerCase();
  const timeZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);
  const patch = usePatchLinkedRecord(undefined);
  const qc = useQueryClient();
  const [transferring, setTransferring] = useState<LinkedRecord | null>(null);
  const [deleting, setDeleting] = useState<LinkedRecord | null>(null);

  const archive = async (r: LinkedRecord) => {
    await patch.mutateAsync({ recordId: r.id, version: r.version, body: { status: "archived" } });
    void qc.invalidateQueries({
      queryKey: queryKeys.customerLinkedRecords(tenant.businessId, r.customerId),
    });
    toast.success(`${term} archived`);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (o || (!transferring && !deleting)) onOpenChange(o);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
          <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
            <SheetTitle className="text-[22px] font-extrabold tracking-tight">
              Registrations on more than one client
            </SheetTitle>
            <SheetDescription>
              Usually a {lower} changed hands, or it was added twice. Transfer or archive the copy
              that's out of date, or mark them as different {lower}s.
            </SheetDescription>
          </SheetHeader>
          <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-5">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing left to review.</p>
            ) : (
              groups.map((g) => (
                <section key={g.key} className="rounded-2xl border">
                  <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
                    <NumberPlate registration={g.registration} size="small" />
                    <button
                      type="button"
                      onClick={() => onNotSame(g.key)}
                      className="cursor-pointer text-[13px] font-bold text-foreground/70 hover:text-foreground"
                    >
                      Not the same {lower}
                    </button>
                  </header>
                  <ul>
                    {g.rows.map((row) => (
                      <li key={row.record.id} className="grid gap-2 border-t px-4 py-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenVehicle(row.record.id)}
                            className="block max-w-full cursor-pointer truncate text-left text-sm font-bold hover:underline"
                          >
                            {vehicleTitle(row.record, fields)}
                          </button>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.owner ? (
                              <Link
                                to="/clients/$clientId"
                                params={{ clientId: row.owner.id }}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {row.ownerName}
                              </Link>
                            ) : (
                              "Unknown client"
                            )}
                            {" · added "}
                            {formatInTz(row.record.createdAt, timeZone, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {` · ${row.stats.jobs} ${row.stats.jobs === 1 ? "job" : "jobs"}`}
                          </p>
                        </div>
                        {canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTransferring(row.record)}
                            >
                              Transfer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={patch.isPending}
                              onClick={() => void archive(row.record)}
                            >
                              Archive
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(row.record)}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TransferLinkedRecordDialog
        record={transferring}
        sourceCustomerId={transferring?.customerId ?? ""}
        term={term}
        onOpenChange={(o) => {
          if (!o) setTransferring(null);
        }}
      />
      <DeleteLinkedRecordDialog
        record={deleting}
        term={term}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      />
    </>
  );
}
