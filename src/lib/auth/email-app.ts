/**
 * A link that opens the phone's mail app, for the "Check your email" step.
 *
 * iOS opens Mail from `message://`; Android has no single app, so an intent
 * for the email category lets the system offer whichever is installed. On a
 * desktop there is nothing reliable to open, so no link is offered.
 */
export function emailAppHref(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "message://";
  if (/Android/i.test(userAgent)) {
    return "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end";
  }
  return null;
}
