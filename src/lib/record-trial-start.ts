import { api } from "@/lib/api/client";
import { normaliseTrialEmail } from "@/lib/trial-start";

const recorded = new Set<string>();

/**
 * Tell the API this address started a trial. Safe to call again for the same
 * address in one page load; a failed request can be retried later.
 */
export async function recordWebsiteTrialStart(rawEmail: string): Promise<void> {
  const email = normaliseTrialEmail(rawEmail);
  if (!email || recorded.has(email)) return;
  recorded.add(email);
  try {
    await api.post("/api/v1/trial-starts", { email }, { public: true });
  } catch {
    recorded.delete(email);
  }
}
