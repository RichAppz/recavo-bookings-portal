/**
 * Payments page data: every payment however it arrived, bookings still owed, manual
 * refunds, and the dispute actions. Kept out of `hooks.ts`; same conventions. Every
 * write refreshes the whole `payments` key, so the list, figures and panel agree.
 */
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, createIdempotentMutationFn, queryKeys, toastApiError } from "@/lib/api";
import { useBusinessId } from "@/lib/api/hooks";
import type { Payment } from "@/lib/api/types";
import type { ActivityRefund, ActivityResult, OwedRow, PaymentMethod } from "@/lib/payments-page";

export function usePaymentsActivity(range: { from: Date; to: Date }) {
  const businessId = useBusinessId();
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  return useQuery({
    queryKey: queryKeys.paymentsActivity(businessId, from, to),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await api.get<ActivityResult>(
        `/api/v1/businesses/${businessId}/payments/activity`,
        { query: { from, to } },
      );
      return res.data;
    },
  });
}

export function usePaymentsOwed() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.paymentsOwed(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ owed: OwedRow[] }>(
        `/api/v1/businesses/${businessId}/payments/owed`,
      );
      return res.data.owed;
    },
  });
}

function useRefreshPayments() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["biz", businessId, "payments"] });
    void qc.invalidateQueries({ queryKey: ["biz", businessId, "bookings"] });
  };
}

/** Records that cash, bank transfer, card machine or other money was given back. */
export function useRecordManualRefund() {
  const businessId = useBusinessId();
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      ActivityRefund,
      {
        settlementId: string;
        amountMinor?: number;
        method?: Exclude<PaymentMethod, "card_online">;
        reasonCode: string;
        note?: string | null;
      }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ refund: ActivityRefund }>(
        `/api/v1/businesses/${businessId}/payments/manual-refunds`,
        vars,
        { idempotencyKey },
      );
      return res.data.refund;
    }),
    onSuccess: refresh,
  });
}

/** Card refund through Stripe, with the staff note. Errors stay with the caller. */
export function useCardRefund() {
  const businessId = useBusinessId();
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: createIdempotentMutationFn<
      unknown,
      { paymentId: string; amountMinor?: number; reasonCode: string; note?: string | null }
    >(async (vars, idempotencyKey) => {
      const res = await api.post<{ refund: unknown }>(
        `/api/v1/businesses/${businessId}/refunds`,
        vars,
        { idempotencyKey },
      );
      return res.data.refund;
    }),
    onSuccess: refresh,
  });
}

export function useAcceptDispute() {
  const businessId = useBusinessId();
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await api.post<{ payment: Payment }>(
        `/api/v1/businesses/${businessId}/payments/${paymentId}/dispute/accept`,
        {},
      );
      return res.data.payment;
    },
    onSuccess: refresh,
    onError: (err) => toastApiError(err),
  });
}

/** Stages the booking's details as evidence in Stripe; the caller then opens Stripe. */
export function useSendDisputeEvidence() {
  const businessId = useBusinessId();
  const refresh = useRefreshPayments();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await api.post<{ payment: Payment }>(
        `/api/v1/businesses/${businessId}/payments/${paymentId}/dispute/evidence`,
        {},
      );
      return res.data.payment;
    },
    onSuccess: refresh,
  });
}

export { useRefreshPayments };
