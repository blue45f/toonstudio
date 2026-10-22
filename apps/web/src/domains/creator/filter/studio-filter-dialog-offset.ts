export type StudioFilterDialogOffset = { x: number; y: number };

/**
 * Keeps the whole panel on screen — 적용 and 취소 included. Letting only the header stay reachable
 * would be enough to drag it back, but an artist who parks the panel low and then reaches for 적용
 * should not have to first discover that the button fell off the bottom edge. When the panel is
 * larger than the viewport it pins to the top-left margin instead, and its own scroll takes over.
 *
 * `current` is the offset that is applied to the element right now: `rect` has to have been measured
 * under exactly that translate, because the panel's resting position is recovered as `rect - current`.
 */
export function clampStudioFilterDialogOffset(
  offset: StudioFilterDialogOffset,
  current: StudioFilterDialogOffset,
  rect: { top: number; left: number; width: number; height: number },
  viewport: { width: number; height: number },
): StudioFilterDialogOffset {
  const margin = 12;
  const restingLeft = rect.left - current.x;
  const restingTop = rect.top - current.y;
  const minX = margin - restingLeft;
  const maxX = viewport.width - margin - rect.width - restingLeft;
  const minY = margin - restingTop;
  const maxY = viewport.height - margin - rect.height - restingTop;
  return {
    x: Math.min(Math.max(offset.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(offset.y, minY), Math.max(minY, maxY)),
  };
}

/**
 * 지금 화면에 실제로 적용된 translate. 보정은 getBoundingClientRect 와 같은 시점의 값으로 패널의 기본
 * 자리를 역산해야 한다. 모듈 변수는 React 가 새 위치를 반영하기 전에 먼저 갱신되므로(창 resize 와
 * ResizeObserver 알림이 한 프레임에 연달아 올 때) 낡은 사각형과 짝이 어긋나 기본 자리를 잘못 계산했고,
 * 패널이 뷰포트 밖으로 밀렸다. 가운데(0, 0)에서는 인라인 translate 가 아예 없다.
 */
export function readAppliedStudioFilterDialogOffset(node: HTMLElement): StudioFilterDialogOffset {
  const [x = "", y = ""] = node.style.translate.split(" ");
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}
