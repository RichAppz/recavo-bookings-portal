import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { PushConfig, PushDevice } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import {
  browserPushCapable,
  currentPushPermission,
  currentPushPlatform,
  dismissPushPrompt,
  fetchPushConfig,
  isPushPromptDismissed,
  PUSH_CHANGED_EVENT,
  PushPermissionDeniedError,
  readPushChoice,
  readStoredPushDevice,
  registerPushDevice,
  unregisterPushDevice,
  writePushChoice,
  type PushPermission,
} from "./push-client";
import { pushAvailable, shouldOfferPushPrompt, type PushChoice } from "./push-support";

export const PUSH_CONFIG_KEY = ["push", "config"] as const;
export const PUSH_DEVICES_KEY = ["me", "push-devices"] as const;

export function usePushConfig(enabled = true) {
  return useQuery<PushConfig>({
    queryKey: PUSH_CONFIG_KEY,
    queryFn: fetchPushConfig,
    enabled: enabled && typeof window !== "undefined",
    staleTime: 60 * 60 * 1000,
  });
}

/** Every device the signed-in person has registered, for the settings list. */
export function useMyPushDevices(enabled = true) {
  const { status } = useAuth();
  return useQuery<PushDevice[]>({
    queryKey: PUSH_DEVICES_KEY,
    queryFn: async () => {
      const res = await api.get<{ devices: PushDevice[] }>("/api/v1/me/push-devices");
      return res.data.devices;
    },
    enabled: enabled && status === "authenticated",
  });
}

export type PushState = {
  /** The API can send to this platform and this browser/app can receive. */
  available: boolean;
  /** This device is registered and the person has push on. */
  enabled: boolean;
  /** What the OS currently allows; `denied` needs fixing in device settings. */
  permission: PushPermission;
  /** The person's last choice on this device. */
  choice: PushChoice;
  platform: ReturnType<typeof currentPushPlatform>;
  /** Why the switch is unavailable, in words the settings card can show. */
  unavailableReason: "loading" | "not-configured" | "browser" | null;
  busy: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  /** Whether the bell should nudge; `dismissPrompt` waves it off for good. */
  offerPrompt: boolean;
  dismissPrompt: () => void;
};

/**
 * One hook behind the push switch everywhere it appears (Settings → Notifications,
 * the client account profile, the bell nudge). All state is per device: the API
 * knows about the registration, localStorage remembers the person's choice.
 */
export function usePush(): PushState {
  const qc = useQueryClient();
  const { status } = useAuth();
  const config = usePushConfig(status === "authenticated");
  const [platform] = useState(() =>
    typeof window === "undefined" ? ("web" as const) : currentPushPlatform(),
  );
  const [browserCapable] = useState(() => browserPushCapable());
  const [permission, setPermission] = useState<PushPermission>("default");
  const [choice, setChoice] = useState<PushChoice>(() => readPushChoice());
  const [registered, setRegistered] = useState(() => readStoredPushDevice() !== null);
  const [dismissed, setDismissed] = useState(() => isPushPromptDismissed());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void currentPushPermission().then((p) => {
      if (!cancelled) setPermission(p);
    });
    // PushBootstrap re-registers on launch and sign-out revokes: pick both up.
    const changed = () => {
      setRegistered(readStoredPushDevice() !== null);
      setChoice(readPushChoice());
    };
    window.addEventListener(PUSH_CHANGED_EVENT, changed);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_CHANGED_EVENT, changed);
    };
  }, []);

  const available = pushAvailable(
    platform,
    config.data,
    platform === "web" ? browserCapable : true,
  );
  const unavailableReason: PushState["unavailableReason"] = available
    ? null
    : config.isPending
      ? "loading"
      : platform === "web" && !browserCapable
        ? "browser"
        : "not-configured";

  const enable = useCallback(async () => {
    if (!config.data) return false;
    setBusy(true);
    setError(null);
    try {
      await registerPushDevice(config.data, { prompt: true });
      writePushChoice("on");
      setChoice("on");
      setRegistered(true);
      setPermission("granted");
      void qc.invalidateQueries({ queryKey: PUSH_DEVICES_KEY });
      return true;
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        setPermission("denied");
        setError(err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Could not turn on notifications.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, [config.data, qc]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unregisterPushDevice();
      writePushChoice("off");
      setChoice("off");
      setRegistered(false);
      void qc.invalidateQueries({ queryKey: PUSH_DEVICES_KEY });
    } finally {
      setBusy(false);
    }
  }, [qc]);

  const dismissPrompt = useCallback(() => {
    dismissPushPrompt();
    setDismissed(true);
  }, []);

  return {
    available,
    enabled: choice === "on" && registered && permission !== "denied",
    permission,
    choice,
    platform,
    unavailableReason,
    busy,
    error,
    enable,
    disable,
    offerPrompt:
      status === "authenticated" &&
      shouldOfferPushPrompt({ available, choice, dismissed, permission }),
    dismissPrompt,
  };
}
