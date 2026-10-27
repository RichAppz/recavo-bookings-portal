const OPEN_DIALOG = '[role="dialog"][data-state="open"]';
const POPPER_WRAPPER = "[data-radix-popper-content-wrapper]";

interface LayerNode {
  closest(selector: string): unknown;
}

interface LayerRoot {
  querySelectorAll(selector: string): ArrayLike<LayerNode>;
}

/**
 * Whether a fixed, page-covering dialog (modal, drawer, bottom sheet) is open.
 *
 * Popovers also render `role="dialog"`, but inside a floating popper wrapper and
 * anchored to the page; they, like an open Select or dropdown list, must not count,
 * or anything that scrolls the window home "for the dialog" yanks the page out
 * from under the list the user is about to tap.
 */
export function modalDialogOpen(root: LayerRoot): boolean {
  return Array.from(root.querySelectorAll(OPEN_DIALOG)).some(
    (node) => !node.closest(POPPER_WRAPPER),
  );
}
