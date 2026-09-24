import { useMutation } from "@tanstack/react-query";

import { api } from "./client";
import { toastApiError } from "./errors";
import { useBusinessId } from "./hooks";
import type { SupportRequest, SupportRequestCategory } from "./types";

export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: SupportRequestCategory; label: string }> = [
  { value: "question", label: "Question" },
  { value: "bug", label: "Something isn't working" },
  { value: "billing", label: "Billing" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

export type CreateSupportRequestInput = {
  category: SupportRequestCategory;
  subject: string;
  body: string;
};

/**
 * Raise a support request for the current business. It lands in the RECAVO
 * internal console; nothing is emailed. Not idempotent-keyed on purpose: a
 * double submit is rate-limited server-side and is harmless to triage.
 */
export function useCreateSupportRequest() {
  const businessId = useBusinessId();
  return useMutation<SupportRequest, Error, CreateSupportRequestInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ request: SupportRequest }>(
        `/api/v1/businesses/${businessId}/support-requests`,
        input,
      );
      return res.data.request;
    },
    onError: (err) => toastApiError(err, "Couldn't send your message"),
  });
}
