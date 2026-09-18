import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppStoreConfig, useAppStoreReconcile, useBusinessId } from "@/lib/api/hooks";
import {
  configureIap,
  iapAvailable,
  loadIapProducts,
  purchaseIapProduct,
  restoreIapPurchases,
  type IapProduct,
} from "@/lib/iap";
import { queryKeys } from "@/lib/api/query-keys";
import { toastApiError } from "@/lib/api/errors";
import { billingSurface } from "@/lib/native";

/**
 * StoreKit products for the active business, priced by the App Store. Empty
 * (and never fetched) anywhere but the iOS app with In-App Purchase configured.
 * Configures the RevenueCat SDK for the business as a side effect so a purchase
 * can follow straight away.
 */
export function useIapProducts() {
  const store = billingSurface() === "store";
  const businessId = useBusinessId();
  const config = useAppStoreConfig(store);
  const appUserId = config.data?.appUserId;

  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    if (!store || !appUserId) return;
    let cancelled = false;
    setConfigured(false);
    void configureIap(appUserId)
      .then(() => {
        if (!cancelled) setConfigured(true);
      })
      .catch((err: unknown) => {
        console.warn("[iap] configure failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [store, appUserId]);

  const products = useQuery({
    queryKey: [...queryKeys.appStoreConfig(businessId), "products"],
    enabled: store && configured && Boolean(config.data),
    staleTime: 10 * 60_000,
    queryFn: () => loadIapProducts(config.data!),
  });

  return {
    /** True when this surface sells through the store at all. */
    store,
    config,
    products: products.data ?? [],
    isLoading: store && (config.isLoading || (configured && products.isLoading) || !configured),
    error: config.error ?? products.error,
    refetch: products.refetch,
    byProductId: (id: string) => (products.data ?? []).find((p) => p.productId === id),
    byKind: (kind: IapProduct["product"]["kind"]) =>
      (products.data ?? []).filter((p) => p.product.kind === kind),
  };
}

export type IapFlowState = "idle" | "purchasing" | "restoring" | "reconciling";

/**
 * Purchase / restore, then reconcile with the API so the console reflects the
 * receipt immediately. Toasts the outcome; the caller only needs `state` for
 * button labels.
 */
export function useIapPurchase() {
  const reconcile = useAppStoreReconcile();
  const [state, setState] = useState<IapFlowState>("idle");

  const settle = useCallback(
    async (successTitle: string) => {
      setState("reconciling");
      try {
        const result = await reconcile.mutateAsync();
        toast.success(successTitle);
        return result;
      } catch (err) {
        // Paid but not yet reflected: the webhook will land it. Say so plainly.
        toastApiError(
          err,
          "Your purchase went through but we couldn't confirm it yet. It will show within a few minutes — or tap Restore purchases.",
        );
        return null;
      } finally {
        setState("idle");
      }
    },
    [reconcile],
  );

  const purchase = useCallback(
    async (item: IapProduct, successTitle: string) => {
      if (!iapAvailable()) return null;
      setState("purchasing");
      const result = await purchaseIapProduct(item);
      if (result.status === "cancelled") {
        setState("idle");
        return null;
      }
      if (result.status === "error") {
        setState("idle");
        toast.error(result.message);
        return null;
      }
      return settle(successTitle);
    },
    [settle],
  );

  const restore = useCallback(async () => {
    if (!iapAvailable()) return null;
    setState("restoring");
    const result = await restoreIapPurchases();
    if (result.status === "error") {
      setState("idle");
      toast.error(result.message);
      return null;
    }
    return settle("Purchases restored");
  }, [settle]);

  return { state, busy: state !== "idle", purchase, restore };
}
