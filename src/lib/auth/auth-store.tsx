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
import {
  api,
  setAccessToken,
  setAuthRetryHandler,
  setMfaHandler,
  queryKeys,
  ApiError,
  toastApiError,
} from "@/lib/api";
import type { User, UserProfileUpdate } from "@/lib/api/types";
import { mfaStepFor, verifiedTotp } from "@/lib/auth/mfa";
import { clearPendingProfile, readPendingProfile } from "@/lib/auth/pending-profile";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { NATIVE_AUTH_REDIRECT, isNativeApp, runNativeOAuth } from "@/lib/native";
import { toast } from "sonner";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

/**
 * How a Google sign-in attempt ended.
 * - `redirecting`: web — the page is navigating to Google; nothing more to do.
 * - `signed-in`: native — the session was established; auth state follows.
 * - `cancelled`: native — the user closed the sign-in sheet; reset the UI.
 */
export type GoogleSignInOutcome = "redirecting" | "signed-in" | "cancelled";

export type MfaMode = "challenge" | "enroll";

export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  accessToken: string | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (redirectTo?: string) => Promise<GoogleSignInOutcome>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
    emailRedirectTo?: string,
  ) => Promise<{ session: Session | null }>;
  /** Redeems the confirmation code from a sign-up email, signing the person in. */
  confirmSignUp: (email: string, code: string) => Promise<void>;
  /** Re-sends the sign-up confirmation code. */
  resendSignUpCode: (email: string) => Promise<void>;
  /** Emails a six-digit code. Creates the account if the address is new. */
  sendEmailCode: (email: string) => Promise<void>;
  /** Redeems the code from {@link sendEmailCode}, signing the person in. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /**
   * True from the moment a password-reset link signs the person in until they save
   * a new password (or sign out). While set, the app routes them to /reset.
   */
  passwordRecovery: boolean;
  /** Finish (or abandon) a password reset started from an email link. */
  clearPasswordRecovery: () => void;
  /**
   * Change (or, for OAuth-only accounts, set) the signed-in user's password.
   * When `currentPassword` is given it is verified first so a borrowed session
   * can't silently take over the account. Accounts with 2FA enrolled are stepped
   * up to AAL2 before the change, as Supabase requires.
   */
  updatePassword: (input: { currentPassword?: string; newPassword: string }) => Promise<void>;
  /** PATCH /api/v1/me — update name, phone, locale or timezone on the account profile. */
  updateProfile: (body: UserProfileUpdate) => Promise<User>;
  /**
   * Raise the session to AAL2: no-op if already there, challenge a verified
   * factor, or enrol TOTP then verify. Returns false if the person cancels.
   */
  ensureAal2: () => Promise<boolean>;
  /** Remove the verified TOTP factor. Challenges first if the session is AAL1. */
  unenrollMfa: () => Promise<boolean>;
  refreshMfaStatus: () => Promise<void>;
  /** Enrol a TOTP factor and expose the QR/secret without opening the challenge dialog. */
  startTotpEnrollment: () => Promise<boolean>;
  /** Complete a pending MFA challenge or enrolment; returns true on success. */
  verifyMfa: (code: string) => Promise<boolean>;
  mfaRequired: boolean;
  mfaMode: MfaMode;
  mfaEnrollment: MfaEnrollment | null;
  mfaEnrolled: boolean;
  /** True after the first listFactors (or sign-out) so gates do not flash. */
  mfaStatusReady: boolean;
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
  if (hash.includes("access_token=")) return true;
  return new URLSearchParams(window.location.search).has("code");
}

/**
 * When an emailed link can't be redeemed — expired, already used, or opened in a
 * different browser than the one that requested it — Supabase sends the person
 * back with the reason in the URL fragment instead of a session. Left alone that
 * reads as "the link did nothing"; pulled out here it can be said plainly.
 */
function takeAuthCallbackError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes("error")) return null;
  const params = new URLSearchParams(hash);
  const code = params.get("error_code");
  const description = params.get("error_description");
  if (!code && !description && !params.get("error")) return null;
  // Clear the fragment so a reload doesn't repeat the message.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (code === "otp_expired") {
    return "That link has expired. Request a new one and open it within an hour.";
  }
  return description?.replace(/\+/g, " ") ?? "That link couldn't be used. Please request a new one.";
}

/**
 * A password-reset link lands the person in the app already signed in (Supabase
 * exchanges the token for a session) and announces it with a PASSWORD_RECOVERY event.
 * That event is easy to lose — Supabase may bounce to the Site URL rather than /reset,
 * and a reload replays nothing — so the fact is kept in sessionStorage until a new
 * password is saved, and the root layout steers the person to /reset while it's set.
 */
const RECOVERY_KEY = "recavo.auth.passwordRecovery";

function readRecoveryFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(RECOVERY_KEY) === "1") return true;
  } catch {
    // Storage unavailable — fall through to the URL check.
  }
  return window.location.hash.includes("type=recovery");
}

function writeRecoveryFlag(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(RECOVERY_KEY, "1");
    else window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Storage unavailable — in-memory state still drives the UI for this page load.
  }
}

/** Namespaced debug logging for tracing the auth bootstrap (dev only). */
function authLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug("[auth]", ...args);
}

async function discardUnverifiedTotpFactors(): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const ids = new Set<string>();
  for (const factor of data?.totp ?? []) {
    if (factor.status !== "verified") ids.add(factor.id);
  }
  for (const factor of data?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") ids.add(factor.id);
  }
  await Promise.all([...ids].map((factorId) => supabase.auth.mfa.unenroll({ factorId })));
}

async function beginTotpEnrollment(): Promise<MfaEnrollment | null> {
  const supabase = getSupabase();
  const enrollOnce = () => supabase.auth.mfa.enroll({ factorType: "totp" });
  let enrolled = await enrollOnce();
  if (enrolled.error || !enrolled.data?.totp) {
    await discardUnverifiedTotpFactors();
    enrolled = await enrollOnce();
  }
  if (enrolled.error || !enrolled.data?.totp) {
    toast.error("Couldn't start two-factor enrolment", {
      description: enrolled.error?.message ?? "Please try again shortly.",
    });
    return null;
  }
  return {
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  };
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
  const [mfaMode, setMfaMode] = useState<MfaMode>("challenge");
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaStatusReady, setMfaStatusReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState<boolean>(() => readRecoveryFlag());
  const clearPasswordRecovery = useCallback(() => {
    writeRecoveryFlag(false);
    setPasswordRecovery(false);
  }, []);
  const mfaResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const mfaEnrollmentRef = useRef<MfaEnrollment | null>(null);
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

  const adoptEnrollment = useCallback((next: MfaEnrollment | null) => {
    mfaEnrollmentRef.current = next;
    setMfaEnrollment(next);
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setMfaEnrolled(false);
      setMfaStatusReady(true);
      return;
    }
    try {
      const { data } = await getSupabase().auth.mfa.listFactors();
      setMfaEnrolled(Boolean(verifiedTotp(data)));
    } catch (err) {
      authLog("refreshMfaStatus failed", err);
    } finally {
      setMfaStatusReady(true);
    }
  }, []);

  const startTotpEnrollment = useCallback(async () => {
    const enrollment = await beginTotpEnrollment();
    if (!enrollment) return false;
    adoptEnrollment(enrollment);
    setMfaMode("enroll");
    return true;
  }, [adoptEnrollment]);

  // Challenge-only: used at sign-in for people who already enrolled. Never enrols.
  const challengeMfa = useCallback(async () => {
    adoptEnrollment(null);
    setMfaMode("challenge");
    setMfaRequired(true);
    return await new Promise<boolean>((resolve) => {
      mfaResolveRef.current = resolve;
    });
  }, [adoptEnrollment]);

  // 403 MFA_REQUIRED interceptor. Challenge an existing factor; do not enrol.
  const stepUpIfEnrolled = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const step = mfaStepFor(aal, factors);
      if (step === "proceed") return true;
      if (step === "enroll") return false;
      return challengeMfa();
    } catch (err) {
      authLog("stepUpIfEnrolled failed", err);
      return false;
    }
  }, [challengeMfa]);

  const ensureAal2 = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const step = mfaStepFor(aal, factors);
      authLog("ensureAal2", { step, aal });
      if (step === "proceed") return true;

      if (step === "enroll") {
        const enrollment = await beginTotpEnrollment();
        if (!enrollment) return false;
        adoptEnrollment(enrollment);
        setMfaMode("enroll");
      } else {
        adoptEnrollment(null);
        setMfaMode("challenge");
      }

      return await new Promise<boolean>((resolve) => {
        mfaResolveRef.current = resolve;
        setMfaRequired(true);
      });
    } catch (err) {
      authLog("ensureAal2 failed", err);
      toast.error("Couldn't check two-factor status", {
        description: "Please try again shortly.",
      });
      return false;
    }
  }, [adoptEnrollment]);

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
        setMfaEnrolled(false);
        setMfaStatusReady(true);
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
        // A refreshed token can arrive moments after focus refetches already
        // failed with 401 (waking from sleep: the stale token goes out before
        // supabase-js refreshes it). Errored queries are never refetched
        // automatically, which is how the full-screen "Couldn't load your
        // businesses" card gets stuck — retry them now the token is good.
        void queryClient.invalidateQueries({
          predicate: (q) => q.state.status === "error",
          refetchType: "active",
        });
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

        // Apply the name collected at registration once we have an API session.
        // Prefer the local stash; fall back to the sign-up user_metadata, which
        // survives confirming the email on a different device or browser.
        const pending = readPendingProfile();
        const metadataName =
          typeof next.user?.user_metadata?.full_name === "string"
            ? next.user.user_metadata.full_name.trim()
            : "";
        const pendingName = pending?.name.trim() || metadataName;
        if (!me.name && pendingName) {
          try {
            const res = await api.patch<{ user: User }>("/api/v1/me", { name: pendingName });
            me = res.data.user;
            clearPendingProfile();
            authLog("applied pending profile from registration");
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
        void refreshMfaStatus();
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      } catch (err) {
        loadedForUserIdRef.current = null;
        if (err instanceof ApiError && err.isUnauthenticated) {
          // The API rejected the token — treat as signed out.
          authLog("bootstrap: /me returned 401 → unauthenticated");
          setAccessToken(null);
          setUser(null);
          setMfaEnrolled(false);
          setMfaStatusReady(true);
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
        setMfaEnrolled(false);
        setMfaStatusReady(true);
        setStatus("unauthenticated");
        toastApiError(err, "Couldn't reach the API — please try again once it's back.");
      } finally {
        inFlightUserIdRef.current = null;
      }
    },
    [queryClient, challengeMfa, refreshMfaStatus],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    const supabase = getSupabase();
    let mounted = true;

    const callbackError = takeAuthCallbackError();
    if (callbackError) {
      authLog("auth callback returned an error", callbackError);
      toast.error("Sign-in link didn't work", { description: callbackError, duration: 10_000 });
    }

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
      if (event === "SIGNED_OUT") {
        awaitingOauthCallbackRef.current = false;
        writeRecoveryFlag(false);
        setPasswordRecovery(false);
      }
      if (event === "PASSWORD_RECOVERY") {
        writeRecoveryFlag(true);
        setPasswordRecovery(true);
      }
      void applySession(next);
    });

    return () => {
      mounted = false;
      if (graceTimer) clearTimeout(graceTimer);
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  // MFA interceptor: privileged actions return 403 MFA_REQUIRED only when a
  // factor is already enrolled. Challenge that factor, then retry. Never enrol
  // here — TOTP is optional and lives in account settings, not on checkout.
  useEffect(() => {
    setMfaHandler(() => stepUpIfEnrolled());
    return () => setMfaHandler(null);
  }, [stepUpIfEnrolled]);

  // Shared in-flight refresh: when a stale token goes out after wake-from-sleep,
  // every focus refetch 401s at once, and they should all wait on ONE refresh
  // rather than each triggering their own.
  const authRefreshRef = useRef<Promise<boolean> | null>(null);
  const refreshAfter401 = useCallback((staleToken: string): Promise<boolean> => {
    if (!isSupabaseConfigured()) return Promise.resolve(false);
    if (!authRefreshRef.current) {
      authRefreshRef.current = (async () => {
        try {
          const supabase = getSupabase();
          // The visibility handler or another tab may have refreshed already —
          // getSession() also refreshes itself when the stored token is expired.
          const { data } = await supabase.auth.getSession();
          let next = data.session;
          if (!next || next.access_token === staleToken) {
            const { data: refreshed, error } = await supabase.auth.refreshSession();
            if (error) {
              authLog("refreshAfter401: refresh failed", error);
              return false;
            }
            next = refreshed.session;
          }
          if (!next?.access_token || next.access_token === staleToken) return false;
          setAccessToken(next.access_token);
          setSession(next);
          authLog("refreshAfter401: replaced stale token");
          return true;
        } catch (err) {
          authLog("refreshAfter401 failed", err);
          return false;
        } finally {
          authRefreshRef.current = null;
        }
      })();
    }
    return authRefreshRef.current;
  }, []);

  // 401 interceptor: refresh the session once and let the API client replay the
  // request, instead of stranding the user on an error screen a reload fixes.
  useEffect(() => {
    setAuthRetryHandler((staleToken) => refreshAfter401(staleToken));
    return () => setAuthRetryHandler(null);
  }, [refreshAfter401]);

  const verifyMfa = useCallback(
    async (code: string) => {
      const supabase = getSupabase();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factorId = mfaEnrollmentRef.current?.factorId ?? verifiedTotp(factors)?.id;
      if (!factorId) {
        toast.error("No TOTP factor enrolled", {
          description: "Enrol 2FA in account settings first.",
        });
        mfaResolveRef.current?.(false);
        mfaResolveRef.current = null;
        adoptEnrollment(null);
        setMfaRequired(false);
        return false;
      }

      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        toast.error("Unable to start 2FA challenge");
        mfaResolveRef.current?.(false);
        mfaResolveRef.current = null;
        adoptEnrollment(null);
        setMfaRequired(false);
        return false;
      }

      const verified = await supabase.auth.mfa.verify({
        factorId,
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
      setMfaEnrolled(true);
      adoptEnrollment(null);
      mfaResolveRef.current?.(true);
      mfaResolveRef.current = null;
      setMfaRequired(false);
      return true;
    },
    [adoptEnrollment],
  );

  const clearMfa = useCallback(() => {
    const pending = mfaEnrollmentRef.current;
    mfaResolveRef.current?.(false);
    mfaResolveRef.current = null;
    adoptEnrollment(null);
    setMfaRequired(false);
    if (pending) {
      void getSupabase()
        .auth.mfa.unenroll({ factorId: pending.factorId })
        .catch((err) => authLog("discard cancelled enrolment failed", err));
    }
  }, [adoptEnrollment]);

  const unenrollMfa = useCallback(async () => {
    const ok = await ensureAal2();
    if (!ok) return false;
    const supabase = getSupabase();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = verifiedTotp(factors);
    if (!totp) {
      setMfaEnrolled(false);
      return true;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
    if (error) {
      toast.error("Couldn't remove two-factor authentication", {
        description: error.message,
      });
      return false;
    }
    const { data } = await supabase.auth.getSession();
    setAccessToken(data.session?.access_token ?? null);
    setSession(data.session);
    setMfaEnrolled(false);
    toast.success("Two-factor authentication removed");
    return true;
  }, [ensureAal2]);

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

  const signInWithGoogle = useCallback(
    async (redirectTo?: string): Promise<GoogleSignInOutcome> => {
      const supabase = getSupabase();
      // Without this Google silently reuses whichever account is already
      // signed in to the browser, so there is no way to pick a different one.
      const queryParams = { prompt: "select_account" };

      if (isNativeApp()) {
        // Inside the Capacitor shell the WebView must not navigate to Google:
        // Capacitor hands off-host navigations to Safari, where the session would
        // land and never reach the app. Run the OAuth page in the in-app browser
        // sheet instead, with Supabase redirecting to the app's URL scheme, and
        // install whatever comes back here (tokens for the implicit flow, or a
        // PKCE code — whose verifier lives in this WebView).
        authLog("signInWithGoogle: opening OAuth in native browser sheet");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true, queryParams },
        });
        if (error) throw error;
        if (!data.url) throw new Error("Google sign-in did not return an authorisation URL");

        const result = await runNativeOAuth(data.url);
        if ("cancelled" in result) {
          authLog("signInWithGoogle: browser sheet dismissed before completing");
          return "cancelled";
        }
        if ("error" in result) throw new Error(result.error);

        if ("tokens" in result) {
          authLog("signInWithGoogle: installing session from callback tokens");
          const { error: sessionError } = await supabase.auth.setSession(result.tokens);
          if (sessionError) throw sessionError;
        } else {
          authLog("signInWithGoogle: exchanging code for session");
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.code);
          if (exchangeError) throw exchangeError;
        }
        // The session surfaces through onAuthStateChange → applySession.
        return "signed-in";
      }

      authLog("signInWithGoogle: starting OAuth redirect");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            redirectTo ?? (typeof window !== "undefined" ? window.location.origin : undefined),
          queryParams,
        },
      });
      if (error) throw error;
      return "redirecting";
    },
    [],
  );

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        ...(Object.keys(options).length > 0 ? { options } : {}),
      });
      if (error) throw error;
      // When email confirmation is required, Supabase returns no session here;
      // the caller uses this to route into the code-entry step.
      return { session: data.session };
    },
    [],
  );

  /**
   * Confirm a sign-up by its emailed code. Uses `type: 'signup'` to match the
   * "Confirm signup" template's token — distinct from the passwordless email
   * OTP used by {@link verifyEmailCode}.
   */
  const confirmSignUp = useCallback(async (email: string, code: string) => {
    authLog("confirmSignUp: verifyOtp(signup)");
    const supabase = getSupabase();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    if (error) {
      authLog("confirmSignUp error", error);
      throw error;
    }
  }, []);

  const resendSignUpCode = useCallback(async (email: string) => {
    authLog("resendSignUpCode: resend(signup)");
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      authLog("resendSignUpCode error", error);
      throw error;
    }
  }, []);

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
    setMfaEnrolled(false);
    setMfaStatusReady(true);
    setStatus("unauthenticated");
    writeRecoveryFlag(false);
    setPasswordRecovery(false);
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

  const updatePassword = useCallback(
    async ({ currentPassword, newPassword }: { currentPassword?: string; newPassword: string }) => {
      const supabase = getSupabase();
      const email = session?.user.email;
      if (currentPassword !== undefined) {
        if (!email) throw new Error("Your account has no email address to verify against.");
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (error) {
          authLog("updatePassword: current password rejected", error);
          throw new Error("Your current password is incorrect.");
        }
      }
      // Supabase refuses password changes on an AAL1 session once a TOTP factor exists,
      // so challenge an enrolled factor — but never make someone *set up* 2FA just to
      // change (or recover) their password.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (mfaStepFor(aal, factors) === "challenge") {
        const ok = await challengeMfa();
        if (!ok) throw new Error("Two-factor verification is required to change your password.");
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        authLog("updatePassword error", error);
        throw error;
      }
      // A reset-from-email is finished once a new password is saved.
      writeRecoveryFlag(false);
      setPasswordRecovery(false);
    },
    [session, challengeMfa],
  );

  const updateProfile = useCallback(
    async (body: UserProfileUpdate) => {
      // PATCH returns the same envelope as GET, so the response can replace
      // session state outright rather than triggering a re-fetch.
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
      confirmSignUp,
      resendSignUpCode,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      resetPassword,
      passwordRecovery,
      clearPasswordRecovery,
      updatePassword,
      updateProfile,
      ensureAal2,
      unenrollMfa,
      refreshMfaStatus,
      startTotpEnrollment,
      verifyMfa,
      mfaRequired,
      mfaMode,
      mfaEnrollment,
      mfaEnrolled,
      mfaStatusReady,
      clearMfa,
    }),
    [
      status,
      session,
      user,
      signIn,
      signInWithGoogle,
      signUp,
      confirmSignUp,
      resendSignUpCode,
      sendEmailCode,
      verifyEmailCode,
      signOut,
      resetPassword,
      passwordRecovery,
      clearPasswordRecovery,
      updatePassword,
      updateProfile,
      ensureAal2,
      unenrollMfa,
      refreshMfaStatus,
      startTotpEnrollment,
      verifyMfa,
      mfaRequired,
      mfaMode,
      mfaEnrollment,
      mfaEnrolled,
      mfaStatusReady,
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
