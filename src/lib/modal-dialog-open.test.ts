import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modalDialogOpen } from "./modal-dialog-open.ts";

const dialog = (insidePopper: boolean) => ({
  closest: (selector: string) =>
    selector === "[data-radix-popper-content-wrapper]" && insidePopper ? {} : null,
});
const page = (...nodes: ReturnType<typeof dialog>[]) => ({
  querySelectorAll: (selector: string) =>
    selector === '[role="dialog"][data-state="open"]' ? nodes : [],
});

describe("modalDialogOpen — only a page-covering dialog counts", () => {
  it("is false on a plain page, even with a Select or dropdown list open", () => {
    assert.equal(modalDialogOpen(page()), false);
  });

  it("is true while a modal, drawer or sheet is open", () => {
    assert.equal(modalDialogOpen(page(dialog(false))), true);
  });

  it("ignores a popover, which is a dialog anchored inside a popper", () => {
    assert.equal(modalDialogOpen(page(dialog(true))), false);
  });

  it("is true when a popover is open over a modal", () => {
    assert.equal(modalDialogOpen(page(dialog(true), dialog(false))), true);
  });
});
