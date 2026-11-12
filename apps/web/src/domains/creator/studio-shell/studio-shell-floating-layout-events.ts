export const STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT =
  "toonspectrum:studio-shell-floating-layout-open";

export function requestStudioShellFloatingLayoutManagerOpen(trigger?: HTMLElement): void {
  if (typeof window === "undefined") return;
  if (trigger && !trigger.isConnected) return;
  window.dispatchEvent(trigger ? new CustomEvent(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT, { detail: { trigger } }) : new Event(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT));
}
