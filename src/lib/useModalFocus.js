import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps focus inside an open dialog, and gives it back when the dialog closes.
 *
 * A dialog that only looks modal is not modal: aria-modal tells a screen reader the rest
 * of the page is inert, and then Tab walks straight out into it. Somebody reading by
 * keyboard opens the playbook and finds themselves in the contract behind it, with no
 * way of knowing they have left.
 *
 * @param {boolean} open
 * @param {Function} onClose  called on Escape
 * @returns ref to put on the dialog element
 */
export function useModalFocus(open, onClose) {
  const ref = useRef(null);
  const returnTo = useRef(null);

  // Held in a ref so the effect depends on `open` alone.
  //
  // Callers pass an inline arrow, so onClose is a new function on every render. As an
  // effect dependency that tears the trap down and sets it up again each time, and setting
  // it up focuses the first control: type one character into a dialog field, the parent
  // re-renders, and the caret jumps back to the top of the form on the next keystroke.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;

    const node = ref.current;
    // Focus the first thing worth landing on, or the dialog itself if it holds nothing.
    const first = node?.querySelector(FOCUSABLE);
    (first || node)?.focus?.();

    function onKey(event) {
      if (event.key === "Escape") { closeRef.current?.(); return; }
      if (event.key !== "Tab" || !node) return;

      const stops = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!stops.length) { event.preventDefault(); return; }
      const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
      if (document.activeElement === edge || !node.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Give focus back to whatever opened it, so the keyboard does not start over.
      if (returnTo.current?.isConnected) returnTo.current.focus?.();
    };
  }, [open]);

  return ref;
}
