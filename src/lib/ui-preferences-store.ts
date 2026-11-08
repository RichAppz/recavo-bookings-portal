import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import {
  UI_PREFERENCES_KEY,
  parseUiPreferences,
  samePreferences,
  withPreference,
  type UiPreferences,
} from "@/lib/ui-preferences";

const SAVE_DELAY_MS = 600;

function readLocal(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_KEY);
    return raw ? parseUiPreferences(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeLocal(prefs: UiPreferences) {
  try {
    localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the server copy still carries the choice.
  }
}

/**
 * The signed-in person's console layout choices. Starts from the local copy so
 * the first client paint already has the right menu, then adopts the API's
 * document (which may have been changed on another device) and writes changes
 * back after a short pause so a burst of toggles is one PUT. Every write sends
 * the whole document, so the last device to save wins.
 */
export function useUiPreferences(): {
  preferences: UiPreferences;
  /** Known on the client once the local copy has been read (the server render has none). */
  ready: boolean;
  update: (patch: UiPreferences) => void;
} {
  const [preferences, setPreferences] = useState<UiPreferences>({});
  const [ready, setReady] = useState(false);
  const latest = useRef<UiPreferences>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Edits made before the GET answers must not be overwritten by it.
  const dirty = useRef(false);

  useEffect(() => {
    const local = readLocal();
    latest.current = local;
    setPreferences(local);
    setReady(true);
    let cancelled = false;
    api
      .get<{ preferences: unknown }>("/api/v1/me/ui-preferences")
      .then((res) => {
        if (cancelled || dirty.current) return;
        const remote = parseUiPreferences(res.data.preferences);
        if (samePreferences(remote, latest.current)) return;
        latest.current = remote;
        setPreferences(remote);
        writeLocal(remote);
      })
      .catch(() => {
        // Offline or an older API: the local copy stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: UiPreferences) => {
    const next = withPreference(latest.current, patch);
    if (samePreferences(next, latest.current)) return;
    latest.current = next;
    dirty.current = true;
    setPreferences(next);
    writeLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void api.put("/api/v1/me/ui-preferences", { preferences: latest.current }).catch(() => {
        // Best effort: the local copy keeps the choice on this device.
      });
    }, SAVE_DELAY_MS);
  }, []);

  // Flush a pending save when the shell unmounts (sign-out, navigation away).
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void api.put("/api/v1/me/ui-preferences", { preferences: latest.current }).catch(() => {});
      }
    },
    [],
  );

  return { preferences, ready, update };
}
