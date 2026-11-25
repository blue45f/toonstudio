export interface StudioColorViewport { width: number; height: number; left?: number; top?: number }
export interface StudioColorAnchor { left: number; right: number; top: number; bottom: number }

/** Pure visual-viewport geometry shared by pointer and keyboard layouts. */
export function resolveStudioColorSurfacePosition(anchor: StudioColorAnchor, viewport: StudioColorViewport, naturalHeight = 560) {
  const margin = 8;
  const x = viewport.left ?? 0;
  const y = viewport.top ?? 0;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const sheet = width <= 640;
  const desktop = !sheet && width >= 1024;
  // 데스크톱 상단 44px 바·좌측 48px 도구 레일과 팝오버가 겹치지 않도록 안전 여백을 확보한다.
  const topFloor = desktop && height >= 600 ? y + 52 : y + margin;
  const available = Math.max(1, height - (topFloor - y) - margin);
  const panelWidth = Math.max(1, Math.min(sheet ? width - margin * 2 : 352, width - margin * 2));
  const above = Math.max(1, anchor.top - topFloor - 6);
  const below = Math.max(1, y + height - anchor.bottom - margin - 6);
  const down = below >= Math.min(naturalHeight, 320) || below >= above;
  const maxHeight = sheet ? Math.min(640, available, Math.max(1, height * 0.88))
    : Math.min(640, available, down ? below : above);
  const measured = sheet ? maxHeight : Math.min(maxHeight, Math.max(1, naturalHeight));
  const fromLeftRail = desktop && anchor.left < x + 56 && anchor.right + 6 + panelWidth <= x + width - margin;
  const preferredLeft = fromLeftRail ? Math.max(x + 56, anchor.right + 6) : anchor.left;
  const left = sheet ? x + margin : Math.max(x + margin, Math.min(preferredLeft, x + width - panelWidth - margin));
  const top = sheet ? y + height - margin - measured
    : Math.max(topFloor, Math.min(down ? anchor.bottom + 6 : anchor.top - 6 - measured, y + height - margin - measured));
  return { left, top, width: panelWidth, maxHeight, sheet, compact: height < 440 };
}
