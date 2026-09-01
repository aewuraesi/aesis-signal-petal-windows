/* Keeping the keyboard inside an open dialog.

   Every dialog in this app marks itself `aria-modal="true"`, which is a promise to a screen
   reader that the rest of the page is inert. Until this existed, that promise was false: Tab
   walked straight out of the dialog and into the page behind it, where the focus ring was
   invisible under the backdrop and Enter could fire something the writer could not see.

   This watches for a dialog appearing anywhere in the document rather than being wired into
   each one by hand. There are a dozen dialogs in `page.tsx`; wiring them individually would
   mean twelve chances to forget, and a thirteenth dialog added later would start out broken. */

import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/* getClientRects is the honest test for "can this be reached": it excludes the collapsed
   "+ Add more detail" fields, which stay mounted and hidden so a save cannot wipe them. */
const reachable = (dialog: Element) =>
  [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.getClientRects().length > 0);

const openDialog = () => {
  const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
};

/* Where the caret should land. `data-autofocus` is the deliberate choice — the safe button in
   a confirm, the search box in the palette. Otherwise the first real control, skipping the
   close button: someone opening a form wants to type, not to be poised over the exit. */
const initialFocus = (dialog: HTMLElement) => {
  const marked = dialog.querySelector<HTMLElement>("[data-autofocus]");
  if (marked) return marked;
  const items = reachable(dialog);
  return items.find(element => !element.classList.contains("close")) ?? items[0] ?? null;
};

export function useDialogFocus() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let returnTo: HTMLElement | null = null;

    const sync = () => {
      const dialog = openDialog();
      if (dialog === current) return;
      if (!dialog) {
        /* Focus goes back where it came from, but only if that element is still on the page —
           the button that opened the dialog may itself have been what the dialog removed. */
        if (returnTo?.isConnected) returnTo.focus();
        returnTo = null;
        current = null;
        return;
      }
      if (!current) returnTo = document.activeElement as HTMLElement | null;
      current = dialog;
      initialFocus(dialog)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = openDialog();
      if (!dialog) return;
      const items = reachable(dialog);
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement as HTMLElement);
      const last = items.length - 1;
      /* Focus that has escaped, or has not landed yet, is pulled back to whichever end of the
         dialog the writer was heading towards. */
      const next = event.shiftKey
        ? (index <= 0 ? items[last] : items[index - 1])
        : (index === -1 || index === last ? items[0] : items[index + 1]);
      event.preventDefault();
      next.focus();
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "hidden"] });
    document.addEventListener("keydown", onKeyDown, true);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
