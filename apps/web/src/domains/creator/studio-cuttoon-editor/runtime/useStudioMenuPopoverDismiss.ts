import { useEffect, type RefObject } from "react";

interface StudioMenuPopoverDismissOptions {
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly fallbackLauncher?: () => HTMLElement | null;
  readonly panelSelector: string;
  readonly onDismiss: () => void;
}

/** Menubar popovers share dismissal while their lazy panels may mount or change in a portal. */
export function useStudioMenuPopoverDismiss({
  open, triggerRef, fallbackLauncher, panelSelector, onDismiss,
}: StudioMenuPopoverDismissOptions): void {
  useEffect(() => {
    if (!open) return;
    const ownerDocument = triggerRef.current?.ownerDocument
      ?? fallbackLauncher?.()?.ownerDocument
      ?? (typeof document !== "undefined" ? document : undefined);
    if (!ownerDocument) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || triggerRef.current?.contains(target)) return;
      if ((target as Element).closest?.(panelSelector)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const modal = (event.target as Element | null)?.closest?.('[aria-modal="true"]');
      if (modal && !modal.matches(panelSelector)) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      const launcher = triggerRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? fallbackLauncher?.();
      launcher?.focus({ preventScroll: true });
    };

    // Bubble after controls can consume Escape, before the editor's window shortcuts run.
    ownerDocument.addEventListener("keydown", onKeyDown);
    ownerDocument.addEventListener("pointerdown", onPointerDown);
    return () => {
      ownerDocument.removeEventListener("keydown", onKeyDown);
      ownerDocument.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, triggerRef, fallbackLauncher, panelSelector, onDismiss]);
}
