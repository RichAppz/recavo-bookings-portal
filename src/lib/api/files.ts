import { uploadFileViaIntent } from "@/lib/api/hooks";

export { uploadFileViaIntent };

/** Convenience helper for attaching a file to a customer record. */
export function uploadCustomerFile(businessId: string, customerId: string, file: File) {
  return uploadFileViaIntent(businessId, file, {
    ownerType: "customer",
    ownerId: customerId,
  });
}
