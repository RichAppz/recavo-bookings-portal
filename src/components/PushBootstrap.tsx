import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-store";
import { isNativeAndroid } from "@/lib/native";
import {
  onPushOpened,
  onPushReceivedInForeground,
  syncPushRegistration,
} from "@/lib/push/push-client";
import { parsePushOpenHash, type PushOpenData } from "@/lib/push/push-support";
import { usePushConfig } from "@/lib/push/use-push";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Renders nothing. Keeps this device's push registration current and turns a tapped
 * notification into the right screen:
 *
 *  - on launch, re-registers the token when the person had push on (tokens rotate,
 *    and a device the API retired while we were away comes back);
 *  - a tap switches to the business the alert is about, opens its `link` and marks
 *    the matching bell row read;
 *  - in the Android app a push that arrives while the app is open is shown as a
 *    toast (iOS shows the system banner itself, see capacitor.config.ts).
 */
export function PushBootstrap() {
  const { status } = useAuth();
  const tenant = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const config = usePushConfig(status === "authenticated");

  const signedIn = status === "authenticated";
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !config.data) return;
    const key = JSON.stringify(config.data.platforms);
    if (syncedFor.current === key) return;
    syncedFor.current = key;
    void syncPushRegistration(config.data);
  }, [signedIn, config.data]);
  useEffect(() => {
    if (!signedIn) syncedFor.current = null;
  }, [signedIn]);

  // Latest tenant state without re-subscribing to the plugin on every render, and
  // a slot for a tap that arrived before memberships loaded (cold start).
  const tenantRef = useRef(tenant);
  tenantRef.current = tenant;
  const pending = useRef<PushOpenData | null>(null);

  const settle = useCallback(
    (data: PushOpenData) => {
      const t = tenantRef.current;
      if (!data.businessId) return;
      const mine = t.businesses.some((b) => b.id === data.businessId);
      if (!mine) return;
      if (data.businessId !== t.businessId) t.switchBusiness(data.businessId);
      if (data.notificationId) {
        void api
          .post(`/api/v1/businesses/${data.businessId}/notifications/${data.notificationId}/read`)
          .catch(() => undefined)
          .finally(() => {
            void qc.invalidateQueries({ queryKey: ["biz", data.businessId, "notifications"] });
          });
      }
    },
    [qc],
  );

  const open = useCallback(
    (data: PushOpenData) => {
      if (data.link) void navigate({ href: data.link });
      if (tenantRef.current.isLoading) pending.current = data;
      else settle(data);
    },
    [navigate, settle],
  );

  useEffect(() => {
    if (tenant.isLoading || !pending.current) return;
    const data = pending.current;
    pending.current = null;
    settle(data);
  }, [tenant.isLoading, settle]);

  useEffect(() => {
    const stopOpened = onPushOpened(open);
    // A web notification clicked with no tab open lands here with the rest of the
    // payload in the hash; the link itself is already the page we are on.
    const cold = parsePushOpenHash(window.location.hash);
    if (cold) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      open(cold);
    }
    const stopReceived = onPushReceivedInForeground((push) => {
      if (push.businessId) {
        void qc.invalidateQueries({ queryKey: ["biz", push.businessId, "notifications"] });
      }
      if (!isNativeAndroid()) return;
      toast(push.title, {
        description: push.body,
        action: push.link ? { label: "View", onClick: () => open(push) } : undefined,
      });
    });
    return () => {
      stopOpened();
      stopReceived();
    };
  }, [open, qc]);

  return null;
}
