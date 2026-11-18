import type { CSSProperties } from "react";

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipPlacement = Readonly<{
  left: number;
  top: number;
  arrowOffset: number;
  side: TooltipSide;
}>;
type Rect = Readonly<Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">>;
type Viewport = Readonly<{ left: number; top: number; width: number; height: number }>;

const VIEWPORT_PADDING = 10;
const GAP = 10;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

/** 세로 도구막대의 도움말은 옆으로 배치해 다음 도구의 실제 클릭 영역을 보존한다. */
export function resolveTooltipPlacement({
  anchor, popup, viewport, controlledPopup = null, preferredSide,
}: {
  anchor: Rect;
  popup: Readonly<{ width: number; height: number }>;
  viewport: Viewport;
  controlledPopup?: Rect | null;
  preferredSide?: "left" | "right";
}): TooltipPlacement {
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  const width = popup.width > 0 ? popup.width : 160;
  const height = popup.height > 0 ? popup.height : 36;
  if (preferredSide) {
    const leftObstacle = Math.min(anchor.left, controlledPopup?.left ?? anchor.left);
    const rightObstacle = Math.max(anchor.right, controlledPopup?.right ?? anchor.right);
    const room = {
      left: leftObstacle - viewport.left - VIEWPORT_PADDING,
      right: right - VIEWPORT_PADDING - rightObstacle,
    };
    const opposite = preferredSide === "right" ? "left" : "right";
    const side = room[preferredSide] >= width + GAP ? preferredSide
      : room[opposite] >= width + GAP ? opposite : null;
    if (side) {
      const top = clamp(anchor.top + anchor.height / 2 - height / 2,
        viewport.top + VIEWPORT_PADDING, bottom - height - VIEWPORT_PADDING);
      return {
        left: side === "right" ? rightObstacle + GAP : leftObstacle - width - GAP,
        top, side,
        arrowOffset: clamp(anchor.top + anchor.height / 2 - top, 14, Math.max(14, height - 14)),
      };
    }
  }

  // 측면 공간이 없는 좁은 화면과 일반 컨트롤은 기존 위·아래/열린 팝업 회피 계약을 유지한다.
  const topObstacle = Math.min(anchor.top, controlledPopup?.top ?? anchor.top);
  const bottomObstacle = Math.max(anchor.bottom, controlledPopup?.bottom ?? anchor.bottom);
  const spaceAbove = topObstacle - viewport.top - VIEWPORT_PADDING;
  const spaceBelow = bottom - VIEWPORT_PADDING - bottomObstacle;
  const popupCoversBelow = Boolean(controlledPopup && controlledPopup.bottom > anchor.bottom);
  const side = popupCoversBelow
    ? spaceAbove >= height + GAP ? "top" : "bottom"
    : spaceBelow >= height + GAP || spaceBelow >= spaceAbove ? "bottom" : "top";
  const left = clamp(anchor.left + anchor.width / 2 - width / 2,
    viewport.left + VIEWPORT_PADDING, right - width - VIEWPORT_PADDING);
  const top = clamp(side === "bottom" ? bottomObstacle + GAP : topObstacle - height - GAP,
    viewport.top + VIEWPORT_PADDING, bottom - height - VIEWPORT_PADDING);
  return { left, top, side,
    arrowOffset: clamp(anchor.left + anchor.width / 2 - left, 14, Math.max(14, width - 14)) };
}

/** 기존 위·아래 CSS를 바꾸지 않고 측면 화살표와 진입/퇴장 방향만 함께 맞춘다. */
export function tooltipSideStyle(side: TooltipSide): CSSProperties | undefined {
  if (side !== "left" && side !== "right") return undefined;
  return {
    "--app-tooltip-enter-x": side === "right" ? "-5px" : "5px",
    "--app-tooltip-enter-y": "0px",
    "--app-tooltip-exit-x": side === "right" ? "-3px" : "3px",
    "--app-tooltip-exit-y": "0px",
    transformOrigin: side === "right" ? "left center" : "right center",
  } as CSSProperties;
}

export function tooltipArrowStyle(placement: TooltipPlacement): CSSProperties | undefined {
  if (placement.side !== "left" && placement.side !== "right") return undefined;
  const onRight = placement.side === "right";
  return {
    top: placement.arrowOffset - 5, left: onRight ? -5 : "auto", right: onRight ? "auto" : -5,
    borderTopWidth: onRight ? 1 : 0, borderLeftWidth: onRight ? 1 : 0,
    borderRightWidth: onRight ? 0 : 1, borderBottomWidth: onRight ? 0 : 1,
  };
}
