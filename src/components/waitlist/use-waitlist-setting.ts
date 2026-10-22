import { toast } from "sonner";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import type { BusinessConfiguration } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";

export function useWaitlistOnBookingPage() {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const enabled = tenant.configuration?.booking?.waitlistEnabled ?? true;
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const set = async (next: boolean) => {
    // The API merges booking fields, so the other booking settings stay as they are.
    await update.mutateAsync({
      booking: { waitlistEnabled: next } as NonNullable<BusinessConfiguration["booking"]>,
    });
    toast.success(
      next
        ? "Clients can join the waitlist from your booking page"
        : '"Join the waitlist" is off on your booking page',
    );
  };
  return { enabled, canEdit, set, pending: update.isPending };
}
