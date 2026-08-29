import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { api, setAccessToken, setMfaHandler, queryKeys, ApiError, toastApiError } from "@/lib/api";
import type { User } from "@/lib/api/types";
import { clearPendingProfile, readPendingProfile } from "@/lib/auth/pending-profile";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  accessToken: string | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
    emailRedirectTo?: string,
  ) => Promise<void>;
  /** Emails a six-digit code. Creates the account if the address is new. */
  sendEmailCode: (email: string) => Promise<void>;
  /** Redeems the code from {@link sendEmailCode}, signing the person in. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** PATCH /api/v1/me — update first/last name on the account profile. */
  updateProfile: (body: { firstName?: string | null; lastName?: string | null }) => Promise<User>;
  /** Complete a pending MFA challenge; returns true on success. */
  verifyMfa: (code: string) => Promise<boolean>;
  mfaRequired: boolean;
  clearMfa: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Cap the session bootstrap so a slow or unreachable API can't trap the app on
 * "Checking session…" forever. On timeout we fall through to /login. Generous
 * enough to cover a cold-starting API machine waking from auto-stop.
 */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30_000;

/**
 * How long to keep showing "Checking session…" while supabase-js exchanges an
 * OAuth callback for a session. Without this we can bounce to /login before the
 * exchange finishes, which discards the callback and loses the sign-in.
 */
const OAUTH_CALLBACK_GRACE_MS = 15_000;

/** True when the current URL is an OAuth / magic-link callback awaiting exchange. */
function hasPendingAuthCallback(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (hash.includes("access_token=") || hash.includes("error_description=")) return true;
  return new URLSearchParams(window.location.search).has("code");
}

/** Namespaced debug logging for tracing the auth bootstrap (dev only). */
function authLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug("[auth]", ...args);
}

async function fetchMe(signal?: AbortSignal): Promise<User> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const res = await api.get<{ user: User }>("/api/v1/me", { signal });
    authLog("fetchMe ok", {
      ms: Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
      ),
    });
    return res.data.user;
  } catch (err) {
    authLog("fetchMe failed", {
      ms: Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
      ),
      err,
    });
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured() ? "loading" : "unconfigured",
  );
  const [mfaRequired, setMfaRequired] = useState(false);
  const mfaResolveRef = useRef<((ok: boolean) => void) | null>(null);
  // The Supabase user id we've already loaded a profile for. Supabase fires
  // multiple auth events (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, …) and we
  // also probe getSession() on mount; without this guard each one re-runs the
  // AAL check and re-fetches /me, hammering the API and stacking error toasts.
  const loadedForUserIdRef = useRef<string | null>(null);
  // User id whose bootstrap is currently in flight, to coalesce concurrent events.
  const inFlightUserIdRef = useRef<string | null>(null);
  // Set on mount when the URL carries an OAuth callback; cleared once a session
  // arrives or the grace period expires.
  const awaitingOauthCallbackRef = useRef(false);

  // Opens the MFA dialog and resolves once the user verifies (true) or cancels
  // (false). Shared by the proactive sign-in challenge and the API 403 handler.
  const challengeMfa = useCallback(async () => {
    setMfaRequired(true);
    return await new Promise<boolean>((resolve) => {
      mfaResolveRef.current = resolve;
    });
  }, []);

  const applySession = useCallback(
    async (next: Session | null) => {
      setSession(next);
      const token = next?.access_token ?? null;
      setAccessToken(token);

      if (!next) {
        // supabase-js can report "no session" before it has finished parsing an
        // OAuth callback out of the URL. Redirecting now would strip the hash
        // and abort the sign-in, so hold on "loading" until the grace expires.
        if (awaitingOauthCallbackRef.current) {
          authLog("applySession: no session yet, OAuth callback pending → stay loading");
          return;
        }
        authLog("applySession: no session → unauthenticated");
        loadedForUserIdRef.current = null;
        inFlightUserIdRef.current = null;
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      awaitingOauthCallbackRef.current = false;

      const userId = next.user?.id ?? null;
      authLog("applySession", { userId, hasToken: !!token, expiresAt: next.expires_at });

      // Token refresh or a duplicate auth event for a user we've already loaded:
      // adopt the new token but skip re-running MFA and re-fetching /me.
      if (userId && loadedForUserIdRef.current === userId) {
        authLog("applySession: already loaded this user → skip /me");
        setStatus("authenticated");
        return;
      }

      // A different account is taking over the tab: signing in over a live
      // session, or a session replaced in another tab. Only the sign-out button
      // emptied the cache before, so everything the previous user loaded was
      // still readable — and some of it decides where the app sends you.
      if (userId && loadedForUserIdRef.current && loadedForUserIdRef.current !== userId) {
        authLog("applySession: different user → clearing cached data");
        queryClient.clear();
      }

      // Coalesce concurrent bootstraps for the same user (getSession() racing the
      // INITIAL_SESSION/SIGNED_IN events) so /me is only fetched once.
      if (userId && inFlightUserIdRef.current === userId) {
        authLog("applySession: bootstrap already in flight → skip");
        return;
      }
      inFlightUserIdRef.current = userId;

      // Proactive 2FA: if the user has a verified factor but the session is
      // still aal1, challenge for their code now so 2FA happens at sign-in
      // rather than lazily on the first privileged API call.
      try {
        const supabase = getSupabase();
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        authLog("aal", aal);
        if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
          authLog("proactive MFA challenge required");
          const verified = await challengeMfa();
          if (!verified) {
            await supabase.auth.signOut();
            loadedForUserIdRef.current = null;
            inFlightUserIdRef.current = null;
            setAccessToken(null);
            setSession(null);
            setUser(null);
            setStatus("unauthenticated");
            return;
          }
          // Elevated to aal2 — pick up the refreshed token for the /me call.
          const { data: refreshed } = await supabase.auth.getSession();
          setSession(refreshed.session);
          setAccessToken(refreshed.session?.access_token ?? null);
        }
      } catch (aalErr) {
        // AAL lookup failed (e.g. offline) — fall back to reactive MFA on 403.
        authLog("aal lookup failed (ignored)", aalErr);
      }

      try {
        let me = await fetchMe(AbortSignal.timeout(SESSION_BOOTSTRAP_TIMEOUT_MS));

        // Apply name collected at registration once we have an API session.
        const pending = readPendingProfile();
        if (pending && (!me.firstName || !me.lastName)) {
          try {
            const body: { firstName?: string; lastName?: string } = {};
            if (!me.firstName && pending.firstName) body.firstName = pending.firstName;
            if (!me.lastName && pending.lastName) body.lastName = pending.lastName;
            if (Object.keys(body).length > 0) {
              const res = await api.patch<{ user: User }>("/api/v1/me", body);
              me = res.data.user;
              clearPendingProfile();
              authLog("applied pending profile from registration", body);
            } else {
              clearPendingProfile();
            }
          } catch (profileErr) {
            // Keep the stash so a later sign-in can retry.
            authLog("pending profile apply failed (will retry)", profileErr);
          }
        } else if (pending) {
          clearPendingProfile();
        }

        setUser(me);
        setStatus("authenticated");
        loadedForUserIdRef.current = userId;
        authLog("bootstrap complete → authenticated", { userId });
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      } catch (err) {
        loadedForUserIdRef.current = null;
        if (err instanceof ApiError && err.isUnauthenticated) {
          // The API rejected the token — treat as signed out.
          authLog("bootstrap: /me returned 401 → unauthenticated");
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
          return;
        }
        authLog("bootstrap: /me failed (network/timeout) → unauthenticated", err);
        // Network/timeout error (API unreachable, cold-starting or CORS): we
        // couldn't confirm the session, so don't hang on "Checking session…"
        // or pretend we're signed in. Send the user to /login with context;
        // the Supabase session is kept so a retry re-authenticates once the
        // API is reachable again.
        setUser(null);
        setStatus("unauthenticated");
        toastApiError(err, "Couldn't reach the API — please try again once it's back.");
      } finally {
        inFlightUserIdRef.current = null;
      }
    },
    [queryClient, challengeMfa],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    const supabase = getSupabase();
    let mounted = true;

    awaitingOauthCallbackRef.current = hasPendingAuthCallback();
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    if (awaitingOauthCallbackRef.current) {
      authLog("OAuth callback detected in URL — holding session bootstrap");
      graceTimer = setTimeout(() => {
        if (!mounted || !awaitingOauthCallbackRef.current) return;
        authLog("OAuth callback grace expired → unauthenticated");
        awaitingOauthCallbackRef.current = false;
        setStatus((current) => (current === "loading" ? "unauthenticated" : current));
      }, OAUTH_CALLBACK_GRACE_MS);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      authLog("getSession() resolved", {
        hasSession: !!data.session,
        userId: data.session?.user?.id,
      });
      void applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      authLog("onAuthStateChange", event, { userId: next?.user?.id });
      // An explicit sign-out must win over any pending callback grace.
      if (event === "SIGNED_OUT") awaitingOauthCallbackRef.current = false;
      void applySession(next);
    });

    return () => {
      mounted = false;
      if (graceTimer) clearTimeout(graceTimer);
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  // MFA interceptor: privileged actions return 403 MFA_REQUIRED.
  useEffect(() => {
    setMfaHandler(() => challengeMfa());
    return () => setMfaHandler(null);
  }, [challengeMfa]);

  const verifyMfa = useCallback(async (code: string) => {
    const supabase = getSupabase();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) {
      toast.error("No TOTP factor enrolled", {
        description: "Enrol 2FA in account settings first.",
      });
      mfaResolveRef.current?.(false);
      mfaResolveRef.current = null;
      setMfaRequired(false);
      return false;
    }

    const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (challenge.error || !challenge.data) {
      toast.error("Unable to start 2FA challenge");
      mfaResolveRef.current?.(false);
      mfaResolveRef.current = null;
      setMfaRequired(false);
      return false;
    }

    const verified = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.data.id,
      code,
    });

    if (verified.error) {
      toast.error("Invalid authentication code");
      return false;
    }

    // Refresh session so subsequent requests carry aal2.
    const { data } = await supabase.auth.getSession();
    setAccessToken(data.session?.access_token ?? null);
    setSession(data.session);
    mfaResolveRef.current?.(true);
    mfaResolveRef.current = null;
    setMfaRequired(false);
    return true;
  }, []);

  const clearMfa = useCallback(() => {
    mfaResolveRef.current?.(false);
    mfaResolveRef.current = null;
    setMfaRequired(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    authLog("signIn: signInWithPassword");
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      authLog("signIn error", error);
      throw error;
    }
    authLog("signIn: password accepted (awaiting auth-state event)");
  }, []);

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    authLog("signInWithGoogle: starting OAuth redirect");
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          redirectTo ?? (typeof window !== "undefined" ? window.location.origin : undefined),
        // Without this Google silently reuses whichever account is already
        // signed in to the browser, so there is no way to pick a different one.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }, []);

  /**
   * `emailRedirectTo` matters when the sign-up carries something the confirmation
   * has to come back to, such as a purchase claim token. Left unset, Supabase
   * sends the user to the project's site root and that context is lost.
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: Record<string, unknown>,
      emailRedirectTo?: string,
    ) => {
      const supabase = getSupabase();
      const options = {
        ...(metadata ? { data: metadata } : {}),
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        ...(Object.keys(options).length > 0 ? { options } : {}),
      });
      if (error) throw error;
    },
    [],
  );

  /**
   * Sign-in for customers, who arrive from a link, buy once, and come back
   * months later. A password would be a fifth thing to forget, and a forgotten
   * one is indistinguishable from having no account at all — they buy again as
   * a guest and end up with two records.
   *
   * `shouldCreateUser` is on because there is no separate sign-up: someone who
   * bought as a guest has purchases waiting under their address but no account,
   * and being told to register first is the wrong answer. Proving the address is
   * exactly what lets `POST /api/v1/portal/links` attach those purchases.
   */
  const sendEmailCode = useCallback(async (email: string) => {
    authLog("sendEmailCode: signInWithOtp");
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      authLog("sendEmailCode error", error);
      throw error;
    }
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    authLog("verifyEmailCode: verifyOtp");
    const supabase = getSupabase();
    // `type: 'email'` covers both halves of shouldCreateUser — a code sent to a
    // new address and one sent to an existing account verify the same way.
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      authLog("verifyEmailCode error", error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    // Drop local state before calling Supabase. A rejected sign-out (offline, or
    // a session the server already considers gone) must not strand the user in a
    // signed-in shell with no route back to /login.
    loadedForUserIdRef.current = null;
    inFlightUserIdRef.current = null;
    awaitingOauthCallbackRef.current = false;
    setAccessToken(null);
    setSession(null);
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();

    if (isSupabaseConfigured()) {
      try {
        await getSupabase().auth.signOut();
      } catch (err) {
        authLog("signOut: supabase sign-out failed (local session cleared)", err);
      }
    }
  }, [queryClient]);

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset` : undefined,
    });
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(
    async (body: { firstName?: string | null; lastName?: string | null }) => {
      const res = await api.patch<{ user: User }>("/api/v1/me", body);
      setUser(res.data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      return res.data.user;
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      supabaseUser: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      user,
      signIn,
      signInWithGoogle,
      signUp,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      resetPassword,
      updateProfile,
      verifyMfa,
      mfaRequired,
      clearMfa,
    }),
    [
      status,
      session,
      user,
      signIn,
      signInWithGoogle,
      signUp,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      resetPassword,
      updateProfile,
      verifyMfa,
      mfaRequired,
      clearMfa,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
