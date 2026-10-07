import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined;
  return { url, anonKey, projectRef };
}

/**
 * supabase-js names its localStorage session entry after the first label of the
 * URL's hostname, so moving the URL to a custom domain (`auth.recavo.app`) would
 * silently rename the key and sign every device out. When the project ref is
 * given, keep the key the project URL would have produced.
 */
function storageKeyFor(projectRef: string | undefined): string | undefined {
  return projectRef ? `sb-${projectRef}-auth-token` : undefined;
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, anonKey, projectRef } = getSupabaseEnv();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  const storageKey = storageKeyFor(projectRef);
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(storageKey ? { storageKey } : {}),
    },
  });
  return client;
}
