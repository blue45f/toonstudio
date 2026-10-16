/**
 * 참 바 팝오버(참 고르기·메뉴)의 위치 계획(순수 함수).
 *
 * 참 바는 좁은 세로 레일일 수도, 가로 띠일 수도, 떠 있는 창일 수도 있다. 그래서 팝오버는 바 안에 두지 않고
 * 포털로 띄운 뒤 눌린 버튼 곁에 놓는다: 오른쪽 → 왼쪽 → (좁은 화면이면) 아래 시트 순서로 화면 안에 맞춘다.
 */

export interface StudioCharmRectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface StudioCharmPopoverPlan {
  readonly placement: "right" | "left" | "sheet";
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
}

export const STUDIO_CHARM_POPOVER_MARGIN = 8;
const SHEET_BREAKPOINT = 640;
const DEFAULT_WIDTH = 336;
const MAX_HEIGHT = 560;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function planStudioCharmPopover(
  trigger: StudioCharmRectLike,
  viewport: { readonly width: number; readonly height: number },
  options: { readonly width?: number; readonly gap?: number } = {},
): StudioCharmPopoverPlan {
  const margin = STUDIO_CHARM_POPOVER_MARGIN;
  const gap = options.gap ?? 6;
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const maxHeight = Math.max(160, Math.min(MAX_HEIGHT, viewportHeight - margin * 2));

  if (viewportWidth < SHEET_BREAKPOINT) {
    const sheetHeight = Math.min(maxHeight, Math.round(viewportHeight * 0.72));
    return {
      placement: "sheet",
      left: margin,
      top: Math.max(margin, viewportHeight - margin - sheetHeight),
      width: Math.max(1, viewportWidth - margin * 2),
      maxHeight: sheetHeight,
    };
  }

  const width = Math.min(options.width ?? DEFAULT_WIDTH, viewportWidth - margin * 2);
  const top = clamp(trigger.top, margin, viewportHeight - margin - maxHeight);
  const rightLeft = trigger.right + gap;
  if (rightLeft + width <= viewportWidth - margin) {
    return { placement: "right", left: rightLeft, top, width, maxHeight };
  }
  const leftLeft = trigger.left - gap - width;
  return {
    placement: "left",
    left: clamp(leftLeft, margin, viewportWidth - margin - width),
    top,
    width,
    maxHeight,
  };
}
