const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-case and trim. Null when it is not a single email address. */
export function normaliseTrialEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (!EMAIL.test(email)) return null;
  return email;
}
