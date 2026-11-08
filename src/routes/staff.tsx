import { createFileRoute, redirect } from "@tanstack/react-router";

/** Staff and Settings › Team are one page now; old links and bookmarks land on Team. */
export const Route = createFileRoute("/staff")({
  beforeLoad: () => {
    throw redirect({ to: "/team", search: {}, replace: true });
  },
});
