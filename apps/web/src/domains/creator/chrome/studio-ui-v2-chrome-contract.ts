/**
 * UI/UX v2 에디터 크롬 계약 (AC-019 / PRODUCT.md §2 · DESIGN.md §1·§5).
 *
 * - 데스크톱 에디터: 단일 44px 컨텍스트 상단바 + 좌측 48px 도구 레일 + 캔버스 면적 >= 82%
 * - 모바일 에디터(<768px): 상단 고정 배너 0개 + 하단 Thumb-Arc 독 + 캔버스 면적 >= 88%
 * - 18개 메뉴 그룹 -> 7대 표준 메뉴 압축(파일·편집·캔버스/레이어·웹툰/식자·3D/모션·협업/AI·보기/도움말)
 */

export const STUDIO_UI_V2_CHROME_CONSTANTS = Object.freeze({
  desktopTopBarHeightPx: 44,
  desktopLeftToolRailWidthPx: 48,
  desktopMinCanvasAreaRatio: 0.82,
  mobileMinCanvasAreaRatio: 0.88,
  minTouchTargetPx: 44,
});

export type StandardMenuGroupId =
  | "file"
  | "edit"
  | "canvas-layer"
  | "webtoon-lettering"
  | "3d-motion"
  | "collab-ai"
  | "view-help";

export interface StandardMenuGroupSpec {
  readonly id: StandardMenuGroupId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly legacyGroupIds: readonly string[];
}

export const STUDIO_SEVEN_STANDARD_MENUS: readonly StandardMenuGroupSpec[] = Object.freeze([
  { id: "file", labelKo: "파일", labelEn: "File", legacyGroupIds: ["file", "import", "export", "publish"] },
  { id: "edit", labelKo: "편집", labelEn: "Edit", legacyGroupIds: ["edit", "selection", "transform"] },
  { id: "canvas-layer", labelKo: "캔버스/레이어", labelEn: "Canvas & Layers", legacyGroupIds: ["canvas", "layer", "filter", "color"] },
  { id: "webtoon-lettering", labelKo: "웹툰/식자", labelEn: "Webtoon & Lettering", legacyGroupIds: ["comic", "lettering", "speech-bubble"] },
  { id: "3d-motion", labelKo: "3D/모션", labelEn: "3D & Motion", legacyGroupIds: ["bg3d", "poser", "animation", "audio"] },
  { id: "collab-ai", labelKo: "협업/AI", labelEn: "Collab & AI", legacyGroupIds: ["collaboration", "ai-assistant"] },
  { id: "view-help", labelKo: "보기/도움말", labelEn: "View & Help", legacyGroupIds: ["view", "window", "help"] },
]);

export interface CanvasViewportRatioCheck {
  readonly ratio: number;
  readonly minRequired: number;
  readonly passed: boolean;
}

/**
 * 현재 뷰포트 크기와 열린 크롬 치수로부터 실제 캔버스 면적 비율을 계산해
 * UI/UX v2 시야 계약(데스크톱 >= 82%, 모바일 >= 88%) 준수 여부를 판정한다.
 */
export function evaluateCanvasViewportRatio(input: {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly topBarHeightPx: number;
  readonly leftRailWidthPx: number;
  readonly rightPanelWidthPx: number;
  readonly bottomDockHeightPx: number;
}): CanvasViewportRatioCheck {
  const totalArea = input.viewportWidthPx * input.viewportHeightPx;
  const isMobile = input.viewportWidthPx < 768;
  const minRequired = isMobile
    ? STUDIO_UI_V2_CHROME_CONSTANTS.mobileMinCanvasAreaRatio
    : STUDIO_UI_V2_CHROME_CONSTANTS.desktopMinCanvasAreaRatio;

  if (totalArea <= 0) {
    return { ratio: 0, minRequired, passed: false };
  }

  const canvasW = Math.max(0, input.viewportWidthPx - input.leftRailWidthPx - input.rightPanelWidthPx);
  const canvasH = Math.max(0, input.viewportHeightPx - input.topBarHeightPx - input.bottomDockHeightPx);
  const ratio = Number(((canvasW * canvasH) / totalArea).toFixed(4));
  return { ratio, minRequired, passed: ratio >= minRequired };
}
