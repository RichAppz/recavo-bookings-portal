import { useEffect, useState } from "react";
import { RELEASE_NOTES } from "@/content/release-notes";
import { LAST_SEEN_KEY, SEEN_EVENT, unseenReleases } from "@/lib/release-notes";

/** Releases newer than the last visit to What's new; 0 once the page has been opened. */
export function useUnseenReleases(): number {
  const read = () => {
    try {
      return unseenReleases(RELEASE_NOTES, window.localStorage.getItem(LAST_SEEN_KEY));
    } catch {
      return 0;
    }
  };
  // Start at 0 so the server render and first client paint agree; count after mount.
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    setUnseen(read());
    const refresh = () => setUnseen(read());
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return unseen;
}
