import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { RequireAuth } from "@/lib/auth/RequireAuth";

/**
 * The old per-studio account. Signed-in customers live on `/account` now.
 * This route still exists so bookmarks, emails and leftover links do not 404.
 */
const searchSchema = z.object({
  businessId: z.string().optional(),
  view: z.string().optional(),
});

export const Route = createFileRoute("/portal")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "My account — RECAVO" }],
  }),
  component: () => (
    <RequireAuth>
      <Navigate to="/account" replace />
    </RequireAuth>
  ),
});
