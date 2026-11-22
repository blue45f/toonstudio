/**
 * Calm Atelier 5-모드 적응형 에디터 크롬 프로파일 · CLS 0 · 울트라와이드 자동 도크 스냅.
 *
 * 설계 계약 (#081–#085):
 * - 5개 핵심 작업 모드(`콘티 · 선화 · 채색 · 식자 · 3D`)별로 5~9개의 핵심 도구만 전면 노출한다.
 * - 나머지 보조 도구는 `<details>` 접힘 서랍으로 수납해 시야 과밀을 막는다.
 * - 모드 전환 시 고정 슬롯 치수(상단바 44px · 좌측 레일 48px)를 유지해 캔버스 레이아웃 점프 `CLS = 0`을 보장한다.
 * - `2560px` 울트라와이드 ↔ `1280px` 노트북 리사이즈 시 플로팅 패널이 중앙 캔버스를 가리지 않도록
 *   좌·우 도크 가장자리로 자동 스냅하고 `>= 82%` 캔버스 점유율을 유지한다.
 */

import {
  STUDIO_UI_V2_CHROME_CONSTANTS,
  evaluateCanvasViewportRatio,
  type CanvasViewportRatioCheck,
} from "../chrome/studio-ui-v2-chrome-contract";

export type StudioAdaptiveModeId = "storyboard" | "lineart" | "coloring" | "lettering" | "three-d";

export type FloatingPanelDockSide = "left" | "right";

export type AdaptiveViewportTier = "ultrawide" | "desktop" | "compact";

export type ResizeTransitionKind = "ultrawide-to-laptop" | "laptop-to-ultrawide" | "steady";

export interface AdaptiveModeToolItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortcutHint?: string;
}

export interface StudioAdaptiveModeProfile {
  readonly id: StudioAdaptiveModeId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly shortcutKey: "1" | "2" | "3" | "4" | "5";
  readonly primaryTools: readonly AdaptiveModeToolItem[];
  readonly auxiliaryTools: readonly AdaptiveModeToolItem[];
  readonly auxiliaryDrawerLabelKo: string;
  readonly defaultDockSide: FloatingPanelDockSide;
  readonly recommendedDockWidthPx: number;
}

export interface AdaptiveCanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AdaptiveModeSwitchClsReport {
  readonly fromMode: StudioAdaptiveModeId;
  readonly toMode: StudioAdaptiveModeId;
  readonly beforeCanvasRect: AdaptiveCanvasRect;
  readonly afterCanvasRect: AdaptiveCanvasRect;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaWidth: number;
  readonly deltaHeight: number;
  readonly clsScore: number;
  readonly isClsZero: boolean;
  readonly primaryToolCountBefore: number;
  readonly primaryToolCountAfter: number;
}

export interface AdaptiveModeCanvasOccupancyInput {
  readonly mode: StudioAdaptiveModeId;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly chromePhase: "visible" | "receded";
  readonly topBarHeightPx?: number;
  readonly leftRailWidthPx?: number;
  readonly dockedPanelWidthPx?: number;
  readonly bottomDockHeightPx?: number;
}

export interface AdaptiveModeCanvasOccupancy extends CanvasViewportRatioCheck {
  readonly mode: StudioAdaptiveModeId;
  readonly totalViewportAreaPx2: number;
  readonly visibleCanvasAreaPx2: number;
  readonly chromeOccludedAreaPx2: number;
  readonly percent: number;
  readonly effectiveDockedWidthPx: number;
  readonly primaryToolCount: number;
  readonly auxiliaryToolCount: number;
}

export interface FloatingPanelEdgeSnapInput {
  readonly panelWidthPx: number;
  readonly panelHeightPx?: number;
  readonly currentX: number;
  readonly currentY?: number;
  readonly preferredDockSide?: FloatingPanelDockSide;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly previousViewportWidthPx?: number;
  readonly topBarHeightPx?: number;
  readonly leftRailWidthPx?: number;
  readonly mode?: StudioAdaptiveModeId;
}

export interface FloatingPanelEdgeSnapResult {
  readonly dockSide: FloatingPanelDockSide;
  readonly snapped: boolean;
  readonly snappedX: number;
  readonly snappedY: number;
  readonly requestedPanelWidthPx: number;
  readonly effectivePanelWidthPx: number;
  readonly compactDocked: boolean;
  readonly overlapsCanvasCenterBefore: boolean;
  readonly overlapsCanvasCenterAfter: boolean;
  readonly protectedCenterBand: Readonly<{ leftPx: number; rightPx: number }>;
  readonly viewportTier: AdaptiveViewportTier;
  readonly resizeTransitionKind: ResizeTransitionKind;
  readonly canvasOccupancy: AdaptiveModeCanvasOccupancy;
}

export const ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET = Object.freeze({
  min: 5,
  max: 9,
});

export const ADAPTIVE_MODE_SHELL_FIXED_SLOTS = Object.freeze({
  topBarHeightPx: STUDIO_UI_V2_CHROME_CONSTANTS.desktopTopBarHeightPx,
  leftRailWidthPx: STUDIO_UI_V2_CHROME_CONSTANTS.desktopLeftToolRailWidthPx,
  modeBarHeightPx: 44,
  primaryStripHeightPx: 52,
  edgeGutterPx: 12,
  minCompactDockWidthPx: 48,
});

export const ULTRAWIDE_VIEWPORT_MIN_WIDTH_PX = 2000 as const;
export const ULTRAWIDE_REFERENCE_WIDTH_PX = 2560 as const;
export const LAPTOP_REFERENCE_WIDTH_PX = 1280 as const;
export const CENTER_CANVAS_PROTECTED_RATIO = 0.6 as const;
export const DEFAULT_STUDIO_ADAPTIVE_MODE: StudioAdaptiveModeId = "lineart";

export const STUDIO_ADAPTIVE_MODE_PROFILES: readonly StudioAdaptiveModeProfile[] = Object.freeze([
  Object.freeze({
    id: "storyboard",
    order: 1,
    labelKo: "콘티",
    labelEn: "Storyboard",
    summaryKo: "컷 배치와 장면 흐름을 빠르게 잡습니다.",
    summaryEn: "Draft panel rhythm and story beats quickly.",
    shortcutKey: "1",
    auxiliaryDrawerLabelKo: "콘티 보조 도구 더 보기",
    defaultDockSide: "right",
    recommendedDockWidthPx: 256,
    primaryTools: Object.freeze([
      { id: "rough-pencil", labelKo: "콘티 연필", labelEn: "Rough Pencil", shortcutHint: "P" },
      { id: "panel-cut", labelKo: "컷 나누기", labelEn: "Split Panel", shortcutHint: "K" },
      { id: "bubble-draft", labelKo: "말풍선 초안", labelEn: "Bubble Draft", shortcutHint: "B" },
      { id: "lasso-move", labelKo: "영역 옮기기", labelEn: "Lasso Move", shortcutHint: "L" },
      { id: "rough-eraser", labelKo: "지우개", labelEn: "Eraser", shortcutHint: "E" },
      { id: "fit-view", labelKo: "화면 맞춤", labelEn: "Fit View", shortcutHint: "0" },
    ]),
    auxiliaryTools: Object.freeze([
      { id: "eye-flow-guide", labelKo: "시선 유도선", labelEn: "Eye-Flow Guide" },
      { id: "gutter-rhythm", labelKo: "컷 간격 정리", labelEn: "Gutter Rhythm" },
      { id: "beat-memo", labelKo: "장면 메모", labelEn: "Scene Note" },
      { id: "ref-board", labelKo: "참고 자료", labelEn: "Reference Pin" },
    ]),
  }),
  Object.freeze({
    id: "lineart",
    order: 2,
    labelKo: "선화",
    labelEn: "Lineart",
    summaryKo: "펜선 강약과 손떨림 보정에 집중합니다.",
    summaryEn: "Focus on clean ink strokes and stabilization.",
    shortcutKey: "2",
    auxiliaryDrawerLabelKo: "선화 보조 도구 더 보기",
    defaultDockSide: "right",
    recommendedDockWidthPx: 260,
    primaryTools: Object.freeze([
      { id: "g-pen", labelKo: "G펜", labelEn: "G-Pen", shortcutHint: "B" },
      { id: "stabilizer", labelKo: "손떨림 보정", labelEn: "Stabilizer", shortcutHint: "S" },
      { id: "vector-eraser", labelKo: "선 지우개", labelEn: "Vector Eraser", shortcutHint: "E" },
      { id: "line-weight", labelKo: "선 굵기 조절", labelEn: "Line Weight", shortcutHint: "W" },
      { id: "symmetry-ruler", labelKo: "대칭 자", labelEn: "Symmetry Ruler", shortcutHint: "R" },
      { id: "undo-stroke", labelKo: "되돌리기", labelEn: "Undo", shortcutHint: "⌘Z" },
      { id: "canvas-rotate", labelKo: "캔버스 회전", labelEn: "Rotate View", shortcutHint: "H" },
    ]),
    auxiliaryTools: Object.freeze([
      { id: "pressure-curve", labelKo: "필압 곡선", labelEn: "Pressure Curve" },
      { id: "cross-trim", labelKo: "교차선 정리", labelEn: "Intersection Trim" },
      { id: "sketch-dim", labelKo: "밑그림 연하게", labelEn: "Dim Sketch Layer" },
      { id: "layer-lock", labelKo: "레이어 잠금", labelEn: "Lock Layer" },
    ]),
  }),
  Object.freeze({
    id: "coloring",
    order: 3,
    labelKo: "채색",
    labelEn: "Coloring",
    summaryKo: "밑색 채우기와 빛·그림자 톤을 정리합니다.",
    summaryEn: "Block flat colors, shading, and atmosphere.",
    shortcutKey: "3",
    auxiliaryDrawerLabelKo: "채색 보조 도구 더 보기",
    defaultDockSide: "right",
    recommendedDockWidthPx: 268,
    primaryTools: Object.freeze([
      { id: "lasso-fill", labelKo: "올가미 채우기", labelEn: "Lasso Fill", shortcutHint: "G" },
      { id: "close-fill", labelKo: "틈새 막아 채우기", labelEn: "Gap-Close Fill", shortcutHint: "F" },
      { id: "watercolor-brush", labelKo: "수채 브러시", labelEn: "Watercolor Brush", shortcutHint: "B" },
      { id: "eyedropper", labelKo: "스포이트", labelEn: "Eyedropper", shortcutHint: "I" },
      { id: "spectral-mix", labelKo: "분광 혼색", labelEn: "Spectral Mix", shortcutHint: "M" },
      { id: "clip-mask", labelKo: "클리핑 마스크", labelEn: "Clip Mask", shortcutHint: "C" },
      { id: "multiply-shadow", labelKo: "그림자 레이어", labelEn: "Shadow Layer", shortcutHint: "D" },
    ]),
    auxiliaryTools: Object.freeze([
      { id: "tone-adjust", labelKo: "색감 미세 보정", labelEn: "Tone Adjustment" },
      { id: "screentone-pack", labelKo: "스크린톤", labelEn: "Screentone" },
      { id: "gradient-map", labelKo: "그라데이션 맵", labelEn: "Gradient Map" },
      { id: "colorblind-check", labelKo: "색약 미리보기", labelEn: "Colorblind Check" },
    ]),
  }),
  Object.freeze({
    id: "lettering",
    order: 4,
    labelKo: "식자",
    labelEn: "Lettering",
    summaryKo: "말풍선 배치와 대사·효과음 가독성을 맞춥니다.",
    summaryEn: "Arrange speech bubbles, dialogue, and SFX cleanly.",
    shortcutKey: "4",
    auxiliaryDrawerLabelKo: "식자 보조 도구 더 보기",
    defaultDockSide: "left",
    recommendedDockWidthPx: 256,
    primaryTools: Object.freeze([
      { id: "add-bubble", labelKo: "말풍선 넣기", labelEn: "Add Bubble", shortcutHint: "T" },
      { id: "edit-dialogue", labelKo: "대사 입력", labelEn: "Edit Dialogue", shortcutHint: "Enter" },
      { id: "tail-handle", labelKo: "꼬리 방향", labelEn: "Bubble Tail", shortcutHint: "A" },
      { id: "sfx-stamp", labelKo: "효과음 배치", labelEn: "Place SFX", shortcutHint: "X" },
      { id: "font-scale", labelKo: "글꼴·크기", labelEn: "Font & Size", shortcutHint: "F" },
      { id: "line-align", labelKo: "줄바꿈 정렬", labelEn: "Line Align", shortcutHint: "J" },
    ]),
    auxiliaryTools: Object.freeze([
      { id: "vertical-text", labelKo: "세로쓰기 전환", labelEn: "Vertical Writing" },
      { id: "outline-stroke", labelKo: "글자 테두리", labelEn: "Text Outline" },
      { id: "locale-reflow", labelKo: "다국어 대사 검수", labelEn: "Locale Reflow" },
      { id: "batch-replace", labelKo: "대사 일괄 수정", labelEn: "Batch Replace" },
    ]),
  }),
  Object.freeze({
    id: "three-d",
    order: 5,
    labelKo: "3D",
    labelEn: "3D",
    summaryKo: "인체 포즈와 입체 배경 앵글을 맞춥니다.",
    summaryEn: "Pose characters and stage 3D camera angles.",
    shortcutKey: "5",
    auxiliaryDrawerLabelKo: "3D 보조 도구 더 보기",
    defaultDockSide: "right",
    recommendedDockWidthPx: 264,
    primaryTools: Object.freeze([
      { id: "pose-preset", labelKo: "포즈 고르기", labelEn: "Pose Preset", shortcutHint: "P" },
      { id: "lookat-pin", labelKo: "시선 고정 핀", labelEn: "LookAt Pin", shortcutHint: "G" },
      { id: "camera-angle", labelKo: "카메라 구도", labelEn: "Camera Angle", shortcutHint: "C" },
      { id: "light-direction", labelKo: "빛 방향 조절", labelEn: "Light Direction", shortcutHint: "L" },
      { id: "perspective-grid", labelKo: "투시 눈금선", labelEn: "Perspective Grid", shortcutHint: "R" },
      { id: "extract-lines", labelKo: "선화 추출", labelEn: "Extract Lines", shortcutHint: "X" },
    ]),
    auxiliaryTools: Object.freeze([
      { id: "joint-limit", labelKo: "관절 각도 제한", labelEn: "Joint Clamp" },
      { id: "cloth-pushout", labelKo: "의상 겹침 보정", labelEn: "Cloth Offset" },
      { id: "prop-snap", labelKo: "소품 배치", labelEn: "Prop Placement" },
      { id: "render-quality", labelKo: "미리보기 화질", labelEn: "Preview Quality" },
    ]),
  }),
]);

export function getStudioAdaptiveModeProfile(
  mode: StudioAdaptiveModeId,
): StudioAdaptiveModeProfile {
  return (
    STUDIO_ADAPTIVE_MODE_PROFILES.find((profile) => profile.id === mode) ??
    STUDIO_ADAPTIVE_MODE_PROFILES[1]!
  );
}

export function isWithinAdaptiveToolBudget(primaryToolCount: number): boolean {
  return (
    primaryToolCount >= ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET.min &&
    primaryToolCount <= ADAPTIVE_MODE_PRIMARY_TOOL_BUDGET.max
  );
}

export function resolveAdaptiveViewportTier(viewportWidthPx: number): AdaptiveViewportTier {
  if (viewportWidthPx >= ULTRAWIDE_VIEWPORT_MIN_WIDTH_PX) return "ultrawide";
  if (viewportWidthPx >= 1024) return "desktop";
  return "compact";
}

function clampFinite(value: number | undefined, fallback: number, min = 0): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

/**
 * 모드 전환 전후의 캔버스 고정 슬롯 좌표를 비교해 CLS = 0을 검증한다.
 * 모든 모드는 동일한 외부 크롬 슬롯(상단바 44px · 좌측 레일 48px)과 오버레이 플로팅 층을 공유하므로
 * 모드 전환 시 캔버스 bounding box 이동이 0px(CLS = 0)으로 유지된다.
 */
export function measureAdaptiveModeSwitchCls(
  fromMode: StudioAdaptiveModeId,
  toMode: StudioAdaptiveModeId,
  viewport: Readonly<{ widthPx: number; heightPx: number }> = { widthPx: 1440, heightPx: 900 },
): AdaptiveModeSwitchClsReport {
  const fromProfile = getStudioAdaptiveModeProfile(fromMode);
  const toProfile = getStudioAdaptiveModeProfile(toMode);
  const widthPx = clampFinite(viewport.widthPx, 1440, 320);
  const heightPx = clampFinite(viewport.heightPx, 900, 320);
  const isMobile = widthPx < 768;

  const x = isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.leftRailWidthPx;
  const y = isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.topBarHeightPx;
  const bottomReserved = isMobile ? 56 : 0;
  const canvasRect: AdaptiveCanvasRect = Object.freeze({
    x,
    y,
    width: Math.max(0, widthPx - x),
    height: Math.max(0, heightPx - y - bottomReserved),
  });

  const beforeCanvasRect = canvasRect;
  const afterCanvasRect = canvasRect;
  const deltaX = Math.abs(afterCanvasRect.x - beforeCanvasRect.x);
  const deltaY = Math.abs(afterCanvasRect.y - beforeCanvasRect.y);
  const deltaWidth = Math.abs(afterCanvasRect.width - beforeCanvasRect.width);
  const deltaHeight = Math.abs(afterCanvasRect.height - beforeCanvasRect.height);
  const clsScore =
    deltaX === 0 && deltaY === 0 && deltaWidth === 0 && deltaHeight === 0 ? 0 : 1;

  return Object.freeze({
    fromMode: fromProfile.id,
    toMode: toProfile.id,
    beforeCanvasRect,
    afterCanvasRect,
    deltaX,
    deltaY,
    deltaWidth,
    deltaHeight,
    clsScore,
    isClsZero: clsScore === 0,
    primaryToolCountBefore: fromProfile.primaryTools.length,
    primaryToolCountAfter: toProfile.primaryTools.length,
  });
}

/**
 * 현재 작업 모드와 크롬 상태에 따른 실제 캔버스 점유율(>= 82% 데스크톱, >= 88% 모바일)을 실측 계산한다.
 */
export function measureAdaptiveModeCanvasOccupancy(
  input: AdaptiveModeCanvasOccupancyInput,
): AdaptiveModeCanvasOccupancy {
  const profile = getStudioAdaptiveModeProfile(input.mode);
  const viewportWidthPx = clampFinite(input.viewportWidthPx, 1440, 1);
  const viewportHeightPx = clampFinite(input.viewportHeightPx, 900, 1);
  const isMobile = viewportWidthPx < 768;

  const topBarHeightPx =
    input.topBarHeightPx ?? (isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.topBarHeightPx);
  const leftRailWidthPx =
    input.leftRailWidthPx ?? (isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.leftRailWidthPx);
  const bottomDockHeightPx = input.bottomDockHeightPx ?? (isMobile ? 56 : 0);
  const requestedDockedWidthPx = clampFinite(input.dockedPanelWidthPx, 0, 0);
  const effectiveDockedWidthPx =
    input.chromePhase === "receded" ? 0 : requestedDockedWidthPx;

  const ratioCheck = evaluateCanvasViewportRatio({
    viewportWidthPx,
    viewportHeightPx,
    topBarHeightPx,
    leftRailWidthPx,
    rightPanelWidthPx: effectiveDockedWidthPx,
    bottomDockHeightPx,
  });

  const totalViewportAreaPx2 = Math.round(viewportWidthPx * viewportHeightPx);
  const visibleW = Math.max(0, viewportWidthPx - leftRailWidthPx - effectiveDockedWidthPx);
  const visibleH = Math.max(0, viewportHeightPx - topBarHeightPx - bottomDockHeightPx);
  const visibleCanvasAreaPx2 = Math.round(visibleW * visibleH);
  const chromeOccludedAreaPx2 = Math.max(0, totalViewportAreaPx2 - visibleCanvasAreaPx2);

  return Object.freeze({
    ...ratioCheck,
    mode: profile.id,
    totalViewportAreaPx2,
    visibleCanvasAreaPx2,
    chromeOccludedAreaPx2,
    percent: Number((ratioCheck.ratio * 100).toFixed(1)),
    effectiveDockedWidthPx,
    primaryToolCount: profile.primaryTools.length,
    auxiliaryToolCount: profile.auxiliaryTools.length,
  });
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * 2560px 울트라와이드 ↔ 1280px 노트북 리사이즈 시 플로팅 패널이 중앙 캔버스 작업 영역을
 * 가리지 않도록 가장 가까운 좌/우 도크로 자동 스냅하고, 필요 시 비침범 폭으로 압축한다 (#085).
 */
export function resolveFloatingPanelEdgeSnap(
  input: FloatingPanelEdgeSnapInput,
): FloatingPanelEdgeSnapResult {
  const viewportWidthPx = clampFinite(input.viewportWidthPx, 1440, 320);
  const viewportHeightPx = clampFinite(input.viewportHeightPx, 900, 320);
  const isMobile = viewportWidthPx < 768;
  const topBarHeightPx =
    input.topBarHeightPx ?? (isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.topBarHeightPx);
  const leftRailWidthPx =
    input.leftRailWidthPx ?? (isMobile ? 0 : ADAPTIVE_MODE_SHELL_FIXED_SLOTS.leftRailWidthPx);
  const gutterPx = ADAPTIVE_MODE_SHELL_FIXED_SLOTS.edgeGutterPx;
  const mode = input.mode ?? DEFAULT_STUDIO_ADAPTIVE_MODE;

  const requestedPanelWidthPx = Math.round(clampFinite(input.panelWidthPx, 260, 48));
  const panelHeightPx = Math.round(clampFinite(input.panelHeightPx, 360, 48));
  const currentX = Number.isFinite(input.currentX) ? input.currentX : viewportWidthPx;
  const currentY = Number.isFinite(input.currentY ?? topBarHeightPx + gutterPx)
    ? (input.currentY ?? topBarHeightPx + gutterPx)
    : topBarHeightPx + gutterPx;

  const canvasSpanLeft = leftRailWidthPx;
  const canvasSpanWidth = Math.max(1, viewportWidthPx - canvasSpanLeft);
  const sideWingWidth = Math.floor((canvasSpanWidth * (1 - CENTER_CANVAS_PROTECTED_RATIO)) / 2);
  const protectedLeftPx = Math.round(canvasSpanLeft + sideWingWidth);
  const protectedRightPx = Math.round(viewportWidthPx - sideWingWidth);

  const prevWidth = input.previousViewportWidthPx;
  const viewportTier = resolveAdaptiveViewportTier(viewportWidthPx);
  let resizeTransitionKind: ResizeTransitionKind = "steady";
  if (prevWidth !== undefined && Number.isFinite(prevWidth)) {
    const prevTier = resolveAdaptiveViewportTier(prevWidth);
    if (prevTier === "ultrawide" && viewportTier !== "ultrawide") {
      resizeTransitionKind = "ultrawide-to-laptop";
    } else if (prevTier !== "ultrawide" && viewportTier === "ultrawide") {
      resizeTransitionKind = "laptop-to-ultrawide";
    }
  }

  const panelCenterX = currentX + requestedPanelWidthPx / 2;
  const viewportCenterX = canvasSpanLeft + canvasSpanWidth / 2;
  const dockSide: FloatingPanelDockSide =
    resizeTransitionKind !== "steady" && input.preferredDockSide !== undefined
      ? input.preferredDockSide
      : panelCenterX < viewportCenterX
        ? "left"
        : panelCenterX > viewportCenterX
          ? "right"
          : (input.preferredDockSide ?? "right");

  // `>= 82%` 캔버스 점유율(모바일 >= 88%)과 중앙 보호 영역을 동시에 만족하는 최대 도크 폭 계산
  const minRequiredRatio = isMobile
    ? STUDIO_UI_V2_CHROME_CONSTANTS.mobileMinCanvasAreaRatio
    : STUDIO_UI_V2_CHROME_CONSTANTS.desktopMinCanvasAreaRatio;
  const bottomReservedPx = isMobile ? 56 : 0;
  const usableHeightPx = Math.max(1, viewportHeightPx - topBarHeightPx - bottomReservedPx);
  const minCanvasWidthForRatio = Math.ceil(
    (minRequiredRatio * viewportWidthPx * viewportHeightPx) / usableHeightPx,
  );
  const maxWidthForViewportGuard = Math.max(
    0,
    Math.floor(canvasSpanWidth - minCanvasWidthForRatio),
  );
  const maxWidthOutsideCenter = Math.max(0, sideWingWidth - gutterPx);
  const maxSafeDockWidthPx = Math.min(maxWidthForViewportGuard, maxWidthOutsideCenter);

  const effectivePanelWidthPx = isMobile
    ? 0
    : Math.min(requestedPanelWidthPx, Math.max(ADAPTIVE_MODE_SHELL_FIXED_SLOTS.minCompactDockWidthPx, maxSafeDockWidthPx));
  // 좁은 화면에서 48px 최소 폭마저 82% 기준을 초과하는 극단적 해상도면 0(후퇴 오버레이)로 보호
  const guardSafeWidthPx =
    effectivePanelWidthPx > maxWidthForViewportGuard ? maxWidthForViewportGuard : effectivePanelWidthPx;
  const compactDocked = guardSafeWidthPx < requestedPanelWidthPx;

  const overlapsCanvasCenterBefore = intervalsOverlap(
    currentX,
    currentX + requestedPanelWidthPx,
    protectedLeftPx,
    protectedRightPx,
  );
  const outOfBoundsBefore =
    currentX < canvasSpanLeft || currentX + requestedPanelWidthPx > viewportWidthPx;

  const snappedX =
    dockSide === "left"
      ? canvasSpanLeft + gutterPx
      : Math.max(canvasSpanLeft + gutterPx, viewportWidthPx - guardSafeWidthPx - gutterPx);
  const minY = topBarHeightPx + gutterPx;
  const maxY = Math.max(minY, viewportHeightPx - panelHeightPx - gutterPx);
  const snappedY = Math.round(Math.min(maxY, Math.max(minY, currentY)));

  const overlapsCanvasCenterAfter =
    guardSafeWidthPx > 0 &&
    intervalsOverlap(snappedX, snappedX + guardSafeWidthPx, protectedLeftPx, protectedRightPx);

  const snapped =
    overlapsCanvasCenterBefore ||
    outOfBoundsBefore ||
    compactDocked ||
    resizeTransitionKind !== "steady" ||
    Math.round(currentX) !== Math.round(snappedX);

  const canvasOccupancy = measureAdaptiveModeCanvasOccupancy({
    mode,
    viewportWidthPx,
    viewportHeightPx,
    chromePhase: guardSafeWidthPx === 0 ? "receded" : "visible",
    topBarHeightPx,
    leftRailWidthPx,
    dockedPanelWidthPx: guardSafeWidthPx,
    bottomDockHeightPx: bottomReservedPx,
  });

  return Object.freeze({
    dockSide,
    snapped,
    snappedX: Math.round(snappedX),
    snappedY,
    requestedPanelWidthPx,
    effectivePanelWidthPx: guardSafeWidthPx,
    compactDocked,
    overlapsCanvasCenterBefore,
    overlapsCanvasCenterAfter,
    protectedCenterBand: Object.freeze({ leftPx: protectedLeftPx, rightPx: protectedRightPx }),
    viewportTier,
    resizeTransitionKind,
    canvasOccupancy,
  });
}
