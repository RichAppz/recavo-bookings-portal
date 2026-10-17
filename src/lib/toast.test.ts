import assert from "node:assert/strict";
import { test } from "node:test";

import { isToastInteraction, keepOpenForToast } from "./toast.ts";

/** Enough of an Element for `closest`: `inToast` says whether a toast host contains it. */
const el = (inToast: boolean) =>
  ({
    closest: (selector: string) => (selector === "[data-sonner-toaster]" && inToast ? {} : null),
  }) as unknown as EventTarget;

const outsideEvent = (target: unknown, original?: unknown) => {
  let prevented = false;
  return {
    event: {
      target: target as EventTarget | null,
      detail: original ? { originalEvent: { target: original } as unknown as Event } : undefined,
      preventDefault: () => {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
};

test("recognises a toast's × or body as a toast interaction", () => {
  assert.equal(isToastInteraction(el(true)), true);
  assert.equal(isToastInteraction(el(false)), false);
  assert.equal(isToastInteraction(null), false);
  assert.equal(isToastInteraction(undefined), false);
  assert.equal(isToastInteraction({} as EventTarget), false);
});

test("a tap on a toast does not count as clicking outside the dialog", () => {
  const onToast = outsideEvent(el(true));
  keepOpenForToast(onToast.event);
  assert.equal(onToast.prevented(), true);

  // Radix sometimes surfaces the DOM target only on the original event.
  const viaOriginal = outsideEvent(el(false), el(true));
  keepOpenForToast(viaOriginal.event);
  assert.equal(viaOriginal.prevented(), true);
});

test("a tap on the backdrop still dismisses", () => {
  const backdrop = outsideEvent(el(false));
  keepOpenForToast(backdrop.event);
  assert.equal(backdrop.prevented(), false);
});
