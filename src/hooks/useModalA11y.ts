import { useEffect, useRef } from 'react';

/**
 * P5.3: dialog semantics helper for overlay modals.
 *
 * Attach the returned ref to the dialog panel element (the one rendered when
 * `isOpen`) and spread `role="dialog" aria-modal="true" tabIndex={-1}` on the
 * same element. While open the hook:
 *  - moves focus to the panel on open,
 *  - traps Tab within the panel (cycling first↔last interactive control),
 *  - restores focus to the previously-focused element on close/unmount.
 */
export function useModalA11y(isOpen: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const trapTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return;
      const FOCUSABLE =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const items = (
        Array.from(panel.querySelectorAll(FOCUSABLE)) as HTMLElement[]
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || active === panel)) {
        e.preventDefault();
        first.focus();
      }
    };

    if (panel) {
      panel.focus({ preventScroll: true });
      panel.addEventListener('keydown', trapTab);
    }

    return () => {
      if (panel) panel.removeEventListener('keydown', trapTab);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  return panelRef;
}
