/**
 * Staging-only malware scan stub (RECA-524). RECAVO's API fail-closes uploads until
 * a scanner at MALWARE_SCAN_URL returns a verdict; production uses a real scanner,
 * but staging has none — this worker answers "clean" so uploaded files become
 * usable. Never point production at this.
 */
export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("recavo staging scan stub", { status: 200 });
    }
    return Response.json({ status: "clean" });
  },
};
