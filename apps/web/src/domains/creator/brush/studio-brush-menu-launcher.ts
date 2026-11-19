const BRUSH_MENU_LAUNCHERS = [
  '[data-studio-brush-catalog-launcher="true"]',
  '[data-studio-core-draw-control="brush"]',
  '[data-studio-main-menu-trigger="brush"]',
  '[data-studio-mobile-tool="brush"]',
  '[data-studio-brush-manager-launcher="true"]',
] as const;

/** 현재 원고에서 카탈로그를 닫고 키보드 포커스를 돌려줄 수 있는 버튼을 찾는다. */
export function findStudioBrushMenuLauncher(root: HTMLElement | null): HTMLButtonElement | null {
  if (!root) return null;
  for (const selector of BRUSH_MENU_LAUNCHERS) {
    for (const button of root.querySelectorAll<HTMLButtonElement>(selector)) {
      if (button.disabled || button.closest('[inert], [hidden], [aria-hidden="true"]')) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && getComputedStyle(button).visibility === "visible") return button;
    }
  }
  return null;
}
