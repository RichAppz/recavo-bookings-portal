import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { RequireAuth } from "@/lib/auth/RequireAuth";

/*
 * `/settings` is the shell for every settings page (redesign spec §1): the index on
 * the left, the page on the right, one save bar. The search params are the old
 * `?tab=` links; `settings.index.tsx` turns them into `/settings/<page>` so nothing
 * anyone has bookmarked or been emailed stops working.
 */
const searchSchema = z.object({
  tab: z.string().optional(),
  /** RECA-512 — open AI policy assist when `1` / `true` (the URL parser hands `1` over as a number). */
  assist: z.union([z.literal("1"), z.literal("true"), z.literal(1), z.boolean()]).optional(),
  session_id: z.string().optional(),
  checkoutAttemptId: z.string().optional(),
});

export const Route = createFileRoute("/settings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Settings — RECAVO" },
      {
        name: "description",
        content: "Business profile, configuration, team access, policies and billing.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SettingsLayout>
          <Outlet />
        </SettingsLayout>
      </AppShell>
    </RequireAuth>
  ),
});
