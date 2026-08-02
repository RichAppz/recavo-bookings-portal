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
import { api, setAccessToken, setMfaHandler, queryKeys } from "@/lib/api";
import type { User } from "@/lib/api/types";
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
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Complete a pending MFA challenge; returns true on success. */
  verifyMfa: (code: string) => Promise<boolean>;
  mfaRequired: boolean;
  clearMfa: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<User> {
  const res = await api.get<{ user: User }>("/api/v1/me");
  return res.data.user;
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

  const applySession = useCallback(
    async (next: Session | null) => {
      setSession(next);
      const token = next?.access_token ?? null;
      setAccessToken(token);

      if (!next) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      try {
        const me = await fetchMe();
        setUser(me);
        setStatus("authenticated");
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      } catch {
        // Token present but /me failed — still treat as signed-in at Supabase layer.
        setUser(null);
        setStatus("authenticated");
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("unconfigured");
      return;
    }

    const supabase = getSupabase();
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  // MFA interceptor: privileged actions return 403 MFA_REQUIRED.
  useEffect(() => {
    setMfaHandler(async () => {
      setMfaRequired(true);
      return await new Promise<boolean>((resolve) => {
        mfaResolveRef.current = resolve;
      });
    });
    return () => setMfaHandler(null);
  }, []);

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
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async (redirectTo?: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo ?? (typeof window !== "undefined" ? window.location.origin : undefined),
      },
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    }
    setAccessToken(null);
    setSession(null);
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/reset` : undefined,
    });
    if (error) throw error;
  }, []);

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
      signOut,
      resetPassword,
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
      signOut,
      resetPassword,
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
