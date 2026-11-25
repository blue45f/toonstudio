/**
 * Wave 59D — 태블릿·모바일(360px~1024px) 한 손 엄지존 도달 호 & 좌우 미러 크롬 레이아웃 엔진.
 *
 * - 5종 실전 뷰포트 프리셋(`iphone-compact-375`, `galaxy-narrow-360`, `galaxy-fold-inner-712`,
 *   `ipad-mini-744`, `ipad-pro-1024`)과 실제 노치·다이나믹 아일랜드·펀치홀·폴드 힌지·홈 인디케이터 Safe-Area 규격
 * - 오른손잡이(좌측 수직 브러시 2-슬라이더 + 우측 하단 38% 엄지 아크 핵심 5버튼) vs 왼손잡이 완전 수평 미러링
 * - 반높이 바텀 시트(44% 높이, 44px 드래그 핸들, `overscroll-behavior: contain`) 및 몰입 모드별
 *   캔버스 실가용 면적(%), 엄지 편안 구간 적중률(%), 44×44px 터치 타깃 준수율, Safe-Area 충돌, 가로 오버플로우 검증
 * - OKLCH 전용(바이올렛 270~320° 및 원시 hex/rgb/hsl 0%) 및 JSON 반응형 레이아웃 규격 직렬화
 */

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const MIN_TOUCH_TARGET_PX = 44;
export const TOP_CONTEXT_BAR_HEIGHT_PX = 44;
export const THUMB_ARC_LOWER_RATIO = 0.38;
export const HALF_SHEET_HEIGHT_RATIO = 0.44;
export const EXPANDED_SHEET_HEIGHT_RATIO = 0.64;
export const SHEET_DRAG_HANDLE_HEIGHT_PX = 44;
export const SHEET_OVERSCROLL_BEHAVIOR = "contain" as const;
export const CANVAS_USABLE_AREA_TARGET_PCT = 82;

export type MobileViewportPresetId =
  | "iphone-compact-375"
  | "galaxy-narrow-360"
  | "galaxy-fold-inner-712"
  | "ipad-mini-744"
  | "ipad-pro-1024";
export type DeviceFormFactor = "phone-compact" | "phone-narrow" | "foldable-inner" | "tablet-compact" | "tablet-pro";
export type HardwareCutoutKind = "dynamic-island" | "punch-hole" | "fold-hinge" | "bezel-camera";
export type Handedness = "right" | "left";
export type HorizontalEdge = "left" | "right";
export type BottomSheetState = "closed" | "half" | "expanded";
export type ReachZoneTier = "easy" | "stretch" | "hard";
export type ThumbArcActionId = "undo" | "brush-eraser" | "eyedropper" | "lasso-select" | "tool-sheet";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number }
export interface Point2D { readonly x: number; readonly y: number }
export interface LayoutRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface SafeAreaInsets { readonly topPx: number; readonly bottomPx: number; readonly leftPx: number; readonly rightPx: number }
export interface HomeIndicatorSpec { readonly widthPx: number; readonly heightPx: number; readonly bottomOffsetPx: number }
export interface HardwareCutoutSpec {
  readonly kind: HardwareCutoutKind; readonly widthPx: number; readonly heightPx: number;
  readonly topOffsetPx: number; readonly centerXRatio: number; readonly labelKo: string; readonly labelEn: string;
}
export interface MobileViewportPreset {
  readonly id: MobileViewportPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string; readonly formFactor: DeviceFormFactor;
  readonly widthPx: number; readonly heightPx: number; readonly screenDiagonalInches: number;
  readonly safeAreaInsets: SafeAreaInsets; readonly hardwareCutout: HardwareCutoutSpec;
  readonly homeIndicator: HomeIndicatorSpec; readonly hasFoldHinge: boolean; readonly buttonSizePx: number;
  readonly easyRadiusPx: number; readonly stretchRadiusPx: number; readonly arcRadiusPx: number;
  readonly palmRestZoneDepthPx: number; readonly recommendedGripKo: string; readonly recommendedGripEn: string;
}
export interface ThumbArcActionMeta {
  readonly id: ThumbArcActionId; readonly labelKo: string; readonly labelEn: string;
  readonly shortGlyph: string; readonly arcAngleDeg: number;
}
export interface ErgonomicControlRect {
  readonly id: string; readonly kind: "top-bar-action" | "thumb-arc-button" | "sheet-drag-handle" | "immersive-restore";
  readonly labelKo: string; readonly labelEn: string; readonly shortGlyph: string;
  readonly rect: LayoutRect; readonly center: Point2D; readonly distanceFromDominantPivotPx: number;
  readonly reachZone: ReachZoneTier; readonly meetsTouchTarget44: boolean; readonly inLower38Band: boolean; readonly visible: boolean;
}
export interface ErgonomicSliderSpec {
  readonly id: "brush-size" | "brush-opacity"; readonly labelKo: string; readonly labelEn: string;
  readonly unit: "px" | "%"; readonly min: number; readonly max: number; readonly value: number;
  readonly normalized01: number; readonly side: HorizontalEdge; readonly rect: LayoutRect; readonly center: Point2D;
  readonly distanceFromSupportPivotPx: number; readonly meetsTouchTarget44: boolean; readonly visible: boolean;
}
export interface BottomSheetLayout {
  readonly requestedState: BottomSheetState; readonly effectiveState: BottomSheetState; readonly visible: boolean;
  readonly heightRatio: number; readonly heightPx: number; readonly rect: LayoutRect;
  readonly dragHandleHeightPx: number; readonly dragHandleRect: LayoutRect;
  readonly overscrollBehavior: typeof SHEET_OVERSCROLL_BEHAVIOR; readonly contentTopPx: number; readonly contentBottomPx: number;
}
export interface PalmGuardEvaluation {
  readonly drawingHandSide: Handedness; readonly sliderEdge: HorizontalEdge; readonly rect: LayoutRect;
  readonly slidersOppositeToDrawingHand: boolean; readonly sliderPalmClearancePx: number;
  readonly arcToPalmClearancePx: number; readonly foldHingeClearancePx: number | null; readonly palmRejectionScorePct: number;
}
export interface ThumbZoneErgonomicMetrics {
  readonly canvasUsableAreaPct: number; readonly canvasGrossViewportPct: number; readonly canvasUsableAreaPx2: number;
  readonly safeViewportAreaPx2: number; readonly totalViewportAreaPx2: number; readonly appChromeAreaPx2: number;
  readonly meetsCanvas82Gate: boolean; readonly easyReachHitRatePct: number; readonly allControlsEasyReachPct: number;
  readonly touchTarget44CompliancePct: number; readonly minTouchTargetPx: number; readonly safeAreaCollisionCount: number;
  readonly controlOverlapCount: number; readonly horizontalOverflowPx: number; readonly lower38CompliancePct: number;
  readonly visibleInteractiveCount: number;
}
export interface ThumbZoneErgonomicsInput {
  readonly viewportId?: MobileViewportPresetId; readonly handedness?: Handedness; readonly bottomSheetState?: BottomSheetState;
  readonly immersiveMode?: boolean; readonly brushSizePx?: number; readonly brushOpacityPct?: number;
}
export interface ThumbZoneErgonomicsResult {
  readonly viewport: MobileViewportPreset; readonly handedness: Handedness; readonly bottomSheetState: BottomSheetState;
  readonly immersiveMode: boolean; readonly brushSizePx: number; readonly brushOpacityPct: number;
  readonly sliderSide: HorizontalEdge; readonly thumbArcSide: HorizontalEdge; readonly safeBounds: LayoutRect;
  readonly thumbArcBandTopPx: number; readonly thumbPivot: Point2D; readonly supportPivot: Point2D;
  readonly reachZones: { readonly easyRadiusPx: number; readonly stretchRadiusPx: number; readonly hardOuterRadiusPx: number };
  readonly topBar: { readonly visible: boolean; readonly rect: LayoutRect; readonly buttons: readonly ErgonomicControlRect[] };
  readonly verticalSliders: {
    readonly visible: boolean; readonly side: HorizontalEdge;
    readonly sizeSlider: ErgonomicSliderSpec; readonly opacitySlider: ErgonomicSliderSpec;
  };
  readonly thumbArcButtons: readonly ErgonomicControlRect[]; readonly immersiveRestoreButton: ErgonomicControlRect;
  readonly bottomSheet: BottomSheetLayout; readonly palmGuard: PalmGuardEvaluation;
  readonly metrics: ThumbZoneErgonomicMetrics; readonly cssVariables: Readonly<Record<string, string>>;
}
export interface HandednessMirrorParityReport {
  readonly viewportId: MobileViewportPresetId; readonly bottomSheetState: BottomSheetState; readonly immersiveMode: boolean;
  readonly exactHorizontalMirror: boolean; readonly maxMirrorDriftPx: number; readonly canvasAreaDeltaPct: number;
  readonly easyReachDeltaPct: number; readonly touchComplianceDeltaPct: number;
  readonly safeAreaCollisionsBothZero: boolean; readonly horizontalOverflowBothZero: boolean;
}

/** 0~360° 정규화 후 바이올렛 슬롭 구간(270~320°) 여부를 판정한다. */
export function isVioletSlopHue(hue: number): boolean {
  if (!Number.isFinite(hue)) return false;
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_SLOP_MIN_HUE && normalized <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 구간(270~320°) 휴 값을 코발트(248°) 또는 로즈(340°)로 보정한다. */
export function sanitizeNonVioletHue(hue: number): number {
  if (!Number.isFinite(hue)) return 70;
  const normalized = ((hue % 360) + 360) % 360;
  if (!isVioletSlopHue(normalized)) return Math.round(normalized * 100) / 100;
  return normalized < 295 ? 248 : 340;
}

/** OKLCH 색상을 안전 클램핑·비바이올렛 보정 후 CSS 문자열로 직렬화한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = Math.round(clamp(color.l, 0, 1) * 1000) / 1000;
  const c = Math.round(clamp(color.c, 0, 0.37) * 1000) / 1000;
  const h = sanitizeNonVioletHue(color.h);
  if (typeof alpha === "number" && Number.isFinite(alpha)) {
    return `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export const THUMBZONE_SVG_PALETTE = {
  chassisBg: { l: 0.16, c: 0.011, h: 68 }, chassisStroke: { l: 0.39, c: 0.014, h: 66 },
  screenBg: { l: 0.2, c: 0.01, h: 70 }, canvasPaper: { l: 0.945, c: 0.01, h: 86 },
  canvasGrid: { l: 0.84, c: 0.014, h: 82 }, safeAreaTint: { l: 0.56, c: 0.06, h: 226 },
  hardwareCutout: { l: 0.115, c: 0.008, h: 68 }, foldHingeTint: { l: 0.76, c: 0.11, h: 78 },
  easyZone: { l: 0.72, c: 0.14, h: 152 }, stretchZone: { l: 0.78, c: 0.13, h: 78 },
  hardZone: { l: 0.66, c: 0.145, h: 28 }, palmGuard: { l: 0.6, c: 0.085, h: 230 },
  chromeBg: { l: 0.185, c: 0.01, h: 68 }, chromeBorder: { l: 0.45, c: 0.014, h: 66 },
  sliderTrack: { l: 0.245, c: 0.011, h: 68 }, sliderSizeFill: { l: 0.72, c: 0.175, h: 42 },
  sliderOpacityFill: { l: 0.74, c: 0.11, h: 224 }, buttonBg: { l: 0.22, c: 0.011, h: 68 },
  buttonActiveBg: { l: 0.72, c: 0.175, h: 42 }, buttonText: { l: 0.95, c: 0.008, h: 86 },
  buttonActiveText: { l: 0.18, c: 0.014, h: 64 }, sheetBg: { l: 0.175, c: 0.01, h: 68 },
  sheetHandle: { l: 0.7, c: 0.012, h: 78 }, strokeInk: { l: 0.25, c: 0.02, h: 236 },
  hudText: { l: 0.94, c: 0.008, h: 86 }, hudMuted: { l: 0.72, c: 0.012, h: 78 },
} as const satisfies Readonly<Record<string, OklchColor>>;

/** 5종 실전 모바일·태블릿 뷰포트 프리셋 (실제 Safe-Area·하드웨어 컷아웃 규격 포함). */
export const MOBILE_STUDIO_VIEWPORTS: readonly MobileViewportPreset[] = [
  {
    id: "iphone-compact-375", nameKo: "아이폰 컴팩트 375", nameEn: "iPhone Compact 375",
    shortLabelKo: "iPhone 375", shortLabelEn: "iPhone 375", formFactor: "phone-compact",
    widthPx: 375, heightPx: 812, screenDiagonalInches: 6.1, hasFoldHinge: false, buttonSizePx: 44,
    safeAreaInsets: { topPx: 47, bottomPx: 34, leftPx: 0, rightPx: 0 },
    hardwareCutout: { kind: "dynamic-island", widthPx: 126, heightPx: 34, topOffsetPx: 10, centerXRatio: 0.5, labelKo: "다이나믹 아일랜드 (47px)", labelEn: "Dynamic Island (47px)" },
    homeIndicator: { widthPx: 134, heightPx: 5, bottomOffsetPx: 8 },
    easyRadiusPx: 232, stretchRadiusPx: 350, arcRadiusPx: 190, palmRestZoneDepthPx: 68,
    recommendedGripKo: "한 손 엄지 아크 · 좌측 2-슬라이더로 펜 이동 없이 굵기 조절",
    recommendedGripEn: "One-hand thumb arc with opposite-edge dual sliders",
  },
  {
    id: "galaxy-narrow-360", nameKo: "갤럭시 협폭 360", nameEn: "Galaxy Narrow 360",
    shortLabelKo: "Galaxy 360", shortLabelEn: "Galaxy 360", formFactor: "phone-narrow",
    widthPx: 360, heightPx: 800, screenDiagonalInches: 6.2, hasFoldHinge: false, buttonSizePx: 44,
    safeAreaInsets: { topPx: 32, bottomPx: 24, leftPx: 0, rightPx: 0 },
    hardwareCutout: { kind: "punch-hole", widthPx: 16, heightPx: 16, topOffsetPx: 9, centerXRatio: 0.5, labelKo: "중앙 펀치홀 (32px)", labelEn: "Center Punch-Hole (32px)" },
    homeIndicator: { widthPx: 108, heightPx: 4, bottomOffsetPx: 8 },
    easyRadiusPx: 224, stretchRadiusPx: 338, arcRadiusPx: 186, palmRestZoneDepthPx: 64,
    recommendedGripKo: "최소 360px 폭 기준 44px 5버튼 무겹침·가로 오버플로우 0px",
    recommendedGripEn: "Narrow 360px zero-overflow 44px thumb sweep",
  },
  {
    id: "galaxy-fold-inner-712", nameKo: "갤럭시 폴드 내부 712", nameEn: "Galaxy Fold Inner 712",
    shortLabelKo: "Fold 712", shortLabelEn: "Fold 712", formFactor: "foldable-inner",
    widthPx: 712, heightPx: 840, screenDiagonalInches: 7.6, hasFoldHinge: true, buttonSizePx: 46,
    safeAreaInsets: { topPx: 28, bottomPx: 24, leftPx: 0, rightPx: 0 },
    hardwareCutout: { kind: "fold-hinge", widthPx: 14, heightPx: 840, topOffsetPx: 0, centerXRatio: 0.5, labelKo: "중앙 폴드 힌지 회피선", labelEn: "Center Fold Hinge Seam" },
    homeIndicator: { widthPx: 148, heightPx: 4, bottomOffsetPx: 8 },
    easyRadiusPx: 256, stretchRadiusPx: 384, arcRadiusPx: 204, palmRestZoneDepthPx: 88,
    recommendedGripKo: "중앙 접힘선 양측 분리 배치 · 우세 절반면 엄지 아크 고정",
    recommendedGripEn: "Split-half ergonomics clear of center fold crease",
  },
  {
    id: "ipad-mini-744", nameKo: "아이패드 미니 744", nameEn: "iPad mini 744",
    shortLabelKo: "iPad mini", shortLabelEn: "iPad mini", formFactor: "tablet-compact",
    widthPx: 744, heightPx: 1133, screenDiagonalInches: 8.3, hasFoldHinge: false, buttonSizePx: 48,
    safeAreaInsets: { topPx: 24, bottomPx: 20, leftPx: 0, rightPx: 0 },
    hardwareCutout: { kind: "bezel-camera", widthPx: 10, heightPx: 10, topOffsetPx: 7, centerXRatio: 0.5, labelKo: "상단 베젤 상태바 (24px)", labelEn: "Top Bezel Status Bar (24px)" },
    homeIndicator: { widthPx: 210, heightPx: 5, bottomOffsetPx: 8 },
    easyRadiusPx: 274, stretchRadiusPx: 416, arcRadiusPx: 214, palmRestZoneDepthPx: 102,
    recommendedGripKo: "스케치북 세로 그립 · 비우세손 엄지 슬라이더 + 펜슬 팜 리젝션",
    recommendedGripEn: "Portrait sketchbook grip with non-dominant slider rail",
  },
  {
    id: "ipad-pro-1024", nameKo: "아이패드 프로 1024", nameEn: "iPad Pro 1024",
    shortLabelKo: "iPad Pro", shortLabelEn: "iPad Pro", formFactor: "tablet-pro",
    widthPx: 1024, heightPx: 1366, screenDiagonalInches: 12.9, hasFoldHinge: false, buttonSizePx: 48,
    safeAreaInsets: { topPx: 24, bottomPx: 20, leftPx: 0, rightPx: 0 },
    hardwareCutout: { kind: "bezel-camera", widthPx: 12, heightPx: 12, topOffsetPx: 6, centerXRatio: 0.5, labelKo: "프로 베젤 상태바 (24px)", labelEn: "Pro Bezel Status Bar (24px)" },
    homeIndicator: { widthPx: 270, heightPx: 5, bottomOffsetPx: 8 },
    easyRadiusPx: 296, stretchRadiusPx: 452, arcRadiusPx: 224, palmRestZoneDepthPx: 118,
    recommendedGripKo: "대형 드래프팅 캔버스 · 모서리 엄지 아크와 넓은 손바닥 보호 구역",
    recommendedGripEn: "Large drafting canvas with corner arc & wide palm guard",
  },
];

/** 하단 38% 엄지 도달 호 핵심 5버튼 정의. */
export const THUMB_ARC_ACTIONS: readonly ThumbArcActionMeta[] = [
  { id: "undo", labelKo: "되돌리기", labelEn: "Undo", shortGlyph: "↶", arcAngleDeg: 4 },
  { id: "brush-eraser", labelKo: "브러시·지우개", labelEn: "Brush / Eraser", shortGlyph: "✎", arcAngleDeg: 24 },
  { id: "eyedropper", labelKo: "스포이드", labelEn: "Eyedropper", shortGlyph: "◎", arcAngleDeg: 44 },
  { id: "lasso-select", labelKo: "올가미 선택", labelEn: "Lasso Select", shortGlyph: "◌", arcAngleDeg: 64 },
  { id: "tool-sheet", labelKo: "도구 시트", labelEn: "Tool Sheet", shortGlyph: "▤", arcAngleDeg: 84 },
];

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const round1 = (value: number): number => Math.round(value * 10) / 10;
const rectCenter = (rect: LayoutRect): Point2D => ({ x: round1(rect.x + rect.width / 2), y: round1(rect.y + rect.height / 2) });
const distance2D = (a: Point2D, b: Point2D): number => round1(Math.hypot(a.x - b.x, a.y - b.y));
const mirrorRectX = (rect: LayoutRect, viewportWidthPx: number): LayoutRect => ({
  x: viewportWidthPx - (rect.x + rect.width), y: rect.y, width: rect.width, height: rect.height,
});
const classifyReachZone = (distPx: number, easyRadiusPx: number, stretchRadiusPx: number): ReachZoneTier =>
  distPx <= easyRadiusPx ? "easy" : distPx <= stretchRadiusPx ? "stretch" : "hard";

/** 두 축정렬 사각형(AABB)의 실질 중첩 여부를 판정한다. */
export function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 뷰포트 ID로 프리셋을 조회하며 미지정 시 iPhone 375로 안전 폴백한다. */
export function getMobileViewportPreset(id?: MobileViewportPresetId): MobileViewportPreset {
  return MOBILE_STUDIO_VIEWPORTS.find((vp) => vp.id === id) ?? MOBILE_STUDIO_VIEWPORTS[0];
}

/** 가시 인터랙션 컨트롤이 4면 Safe-Area 금지 영역을 침범한 건수를 실측한다. */
export function countSafeAreaCollisions(rects: readonly LayoutRect[], viewport: MobileViewportPreset): number {
  const safeLeft = viewport.safeAreaInsets.leftPx;
  const safeRight = viewport.widthPx - viewport.safeAreaInsets.rightPx;
  const safeTop = viewport.safeAreaInsets.topPx;
  const safeBottom = viewport.heightPx - viewport.safeAreaInsets.bottomPx;
  let collisions = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.x < safeLeft || r.x + r.width > safeRight || r.y < safeTop || r.y + r.height > safeBottom) {
      collisions += 1;
    }
  }
  return collisions;
}

/** 모든 가시 레이아웃 사각형의 가로 오버플로우(px)를 실측한다. */
export function computeHorizontalOverflowPx(rects: readonly LayoutRect[], viewportWidthPx: number): number {
  let maxOverflow = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.x < 0) maxOverflow = Math.max(maxOverflow, -r.x);
    if (r.x + r.width > viewportWidthPx) maxOverflow = Math.max(maxOverflow, r.x + r.width - viewportWidthPx);
  }
  return round1(maxOverflow);
}

/** 가시 인터랙션 컨트롤 쌍 간 실제 중첩 건수를 전수 검사한다. */
export function countControlOverlaps(rects: readonly LayoutRect[]): number {
  let overlaps = 0;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j])) overlaps += 1;
    }
  }
  return overlaps;
}

function buildErgonomicControl(
  id: string,
  kind: ErgonomicControlRect["kind"],
  labelKo: string,
  labelEn: string,
  shortGlyph: string,
  rect: LayoutRect,
  thumbPivot: Point2D,
  viewport: MobileViewportPreset,
  thumbArcBandTopPx: number,
  visible: boolean,
): ErgonomicControlRect {
  const center = rectCenter(rect);
  const dist = distance2D(center, thumbPivot);
  return {
    id, kind, labelKo, labelEn, shortGlyph, rect, center,
    distanceFromDominantPivotPx: dist,
    reachZone: classifyReachZone(dist, viewport.easyRadiusPx, viewport.stretchRadiusPx),
    meetsTouchTarget44: rect.width >= MIN_TOUCH_TARGET_PX && rect.height >= MIN_TOUCH_TARGET_PX,
    inLower38Band: center.y >= thumbArcBandTopPx,
    visible,
  };
}

/** 인체공학 엄지 도달 거리·좌우 미러링·손바닥 오터치 회피·바텀 시트 크롬을 통합 계산한다. */
export function evaluateThumbZoneErgonomics(input?: ThumbZoneErgonomicsInput): ThumbZoneErgonomicsResult {
  const viewport = getMobileViewportPreset(input?.viewportId);
  const handedness: Handedness = input?.handedness === "left" ? "left" : "right";
  const requestedSheet: BottomSheetState =
    input?.bottomSheetState === "half" || input?.bottomSheetState === "expanded" ? input.bottomSheetState : "closed";
  const immersiveMode = Boolean(input?.immersiveMode);
  const brushSizePx = Math.round(clamp(input?.brushSizePx ?? 18, 1, 200));
  const brushOpacityPct = Math.round(clamp(input?.brushOpacityPct ?? 85, 5, 100));

  const sliderSide: HorizontalEdge = handedness === "right" ? "left" : "right";
  const thumbArcSide: HorizontalEdge = handedness;
  const edgeMarginPx = viewport.widthPx <= 375 ? 8 : 12;

  const safeLeft = viewport.safeAreaInsets.leftPx;
  const safeRight = viewport.widthPx - viewport.safeAreaInsets.rightPx;
  const safeTop = viewport.safeAreaInsets.topPx;
  const safeBottom = viewport.heightPx - viewport.safeAreaInsets.bottomPx;
  const safeWidth = safeRight - safeLeft;
  const safeHeight = safeBottom - safeTop;
  const safeBounds: LayoutRect = { x: safeLeft, y: safeTop, width: safeWidth, height: safeHeight };

  const thumbArcBandTopPx = Math.round(viewport.heightPx * (1 - THUMB_ARC_LOWER_RATIO));
  const pivotInsetX = Math.max(10, Math.round(viewport.widthPx * 0.035));
  const rightThumbPivot: Point2D = { x: safeRight - pivotInsetX, y: safeBottom - 22 };
  const thumbPivot: Point2D =
    handedness === "right" ? rightThumbPivot : { x: viewport.widthPx - rightThumbPivot.x, y: rightThumbPivot.y };

  // 상단 44px 단일 컨텍스트 바
  const topBarVisible = !immersiveMode;
  const topBarRect: LayoutRect = { x: safeLeft + edgeMarginPx, y: safeTop, width: safeWidth - edgeMarginPx * 2, height: TOP_CONTEXT_BAR_HEIGHT_PX };
  const topBarBottom = safeTop + TOP_CONTEXT_BAR_HEIGHT_PX;
  const leftTopBtnBase: LayoutRect = { x: topBarRect.x, y: topBarRect.y, width: MIN_TOUCH_TARGET_PX, height: MIN_TOUCH_TARGET_PX };
  const rightTopBtnBase: LayoutRect = { x: topBarRect.x + topBarRect.width - MIN_TOUCH_TARGET_PX, y: topBarRect.y, width: MIN_TOUCH_TARGET_PX, height: MIN_TOUCH_TARGET_PX };
  const topBarButtons: readonly ErgonomicControlRect[] = [
    buildErgonomicControl("top-back-home", "top-bar-action", "작품 목록", "Works", "←", handedness === "right" ? leftTopBtnBase : mirrorRectX(leftTopBtnBase, viewport.widthPx), thumbPivot, viewport, thumbArcBandTopPx, topBarVisible),
    buildErgonomicControl("top-export-share", "top-bar-action", "내보내기", "Export", "↗", handedness === "right" ? rightTopBtnBase : mirrorRectX(rightTopBtnBase, viewport.widthPx), thumbPivot, viewport, thumbArcBandTopPx, topBarVisible),
  ];

  // 반높이(44%) / 도구 확장(64%) 바텀 시트 (44px 드래그 핸들, overscroll-behavior: contain)
  const effectiveSheetState: BottomSheetState = immersiveMode ? "closed" : requestedSheet;
  const sheetVisible = effectiveSheetState !== "closed";
  const sheetHeightRatio = effectiveSheetState === "half" ? HALF_SHEET_HEIGHT_RATIO : effectiveSheetState === "expanded" ? EXPANDED_SHEET_HEIGHT_RATIO : 0;
  const sheetHeightPx = sheetVisible ? Math.round(viewport.heightPx * sheetHeightRatio) : 0;
  const sheetTopPx = viewport.heightPx - sheetHeightPx;
  const dragHandleWidth = Math.min(132, safeWidth - 32);
  const dragHandleRect: LayoutRect = sheetVisible
    ? { x: Math.round((viewport.widthPx - dragHandleWidth) / 2), y: sheetTopPx, width: dragHandleWidth, height: SHEET_DRAG_HANDLE_HEIGHT_PX }
    : { x: 0, y: viewport.heightPx, width: 0, height: 0 };

  const bottomSheet: BottomSheetLayout = {
    requestedState: requestedSheet, effectiveState: effectiveSheetState, visible: sheetVisible,
    heightRatio: sheetHeightRatio, heightPx: sheetHeightPx,
    rect: { x: safeLeft, y: sheetTopPx, width: safeWidth, height: sheetHeightPx },
    dragHandleHeightPx: SHEET_DRAG_HANDLE_HEIGHT_PX, dragHandleRect, overscrollBehavior: SHEET_OVERSCROLL_BEHAVIOR,
    contentTopPx: sheetVisible ? sheetTopPx + SHEET_DRAG_HANDLE_HEIGHT_PX : viewport.heightPx,
    contentBottomPx: safeBottom - 8 - viewport.buttonSizePx - 8,
  };

  // 비우세손 수직 2-슬라이더 (브러시 크기 + 불투명도, 좌우 완전 미러)
  const slidersVisible = !immersiveMode;
  const sliderMinY = topBarBottom + 12;
  const sliderMaxBottom = sheetVisible ? sheetTopPx - 12 : safeBottom - 16;
  const sliderAvailH = Math.max(96, sliderMaxBottom - sliderMinY);
  const sliderGap = sliderAvailH >= 240 ? 12 : 8;
  const sliderHeight = Math.max(MIN_TOUCH_TARGET_PX, Math.min(effectiveSheetState === "expanded" ? 116 : 136, Math.floor((sliderAvailH - sliderGap) / 2)));
  const sliderStackHeight = sliderHeight * 2 + sliderGap;
  const sliderStartY = sliderMinY + Math.round((sliderAvailH - sliderStackHeight) * (sheetVisible ? 0.5 : 0.44));

  const rightSizeRect: LayoutRect = { x: safeLeft + edgeMarginPx, y: sliderStartY, width: MIN_TOUCH_TARGET_PX, height: sliderHeight };
  const rightOpacityRect: LayoutRect = { x: safeLeft + edgeMarginPx, y: sliderStartY + sliderHeight + sliderGap, width: MIN_TOUCH_TARGET_PX, height: sliderHeight };
  const sizeSliderRect = handedness === "right" ? rightSizeRect : mirrorRectX(rightSizeRect, viewport.widthPx);
  const opacitySliderRect = handedness === "right" ? rightOpacityRect : mirrorRectX(rightOpacityRect, viewport.widthPx);

  const supportMidY = round1(sliderStartY + sliderStackHeight / 2);
  const rightSupportPivot: Point2D = { x: safeLeft + pivotInsetX, y: supportMidY };
  const supportPivot: Point2D = handedness === "right" ? rightSupportPivot : { x: viewport.widthPx - rightSupportPivot.x, y: supportMidY };

  const sizeSliderCenter = rectCenter(sizeSliderRect);
  const opacitySliderCenter = rectCenter(opacitySliderRect);
  const sizeSlider: ErgonomicSliderSpec = {
    id: "brush-size", labelKo: "브러시 크기", labelEn: "Brush Size", unit: "px", min: 1, max: 200,
    value: brushSizePx, normalized01: round1(((brushSizePx - 1) / 199) * 100) / 100, side: sliderSide,
    rect: sizeSliderRect, center: sizeSliderCenter, distanceFromSupportPivotPx: distance2D(sizeSliderCenter, supportPivot),
    meetsTouchTarget44: sizeSliderRect.width >= MIN_TOUCH_TARGET_PX && sizeSliderRect.height >= MIN_TOUCH_TARGET_PX, visible: slidersVisible,
  };
  const opacitySlider: ErgonomicSliderSpec = {
    id: "brush-opacity", labelKo: "불투명도", labelEn: "Opacity", unit: "%", min: 5, max: 100,
    value: brushOpacityPct, normalized01: round1(((brushOpacityPct - 5) / 95) * 100) / 100, side: sliderSide,
    rect: opacitySliderRect, center: opacitySliderCenter, distanceFromSupportPivotPx: distance2D(opacitySliderCenter, supportPivot),
    meetsTouchTarget44: opacitySliderRect.width >= MIN_TOUCH_TARGET_PX && opacitySliderRect.height >= MIN_TOUCH_TARGET_PX, visible: slidersVisible,
  };

  // 하단 38% 엄지 아크 핵심 5버튼 (닫힘: 원호 / 시트 열림: 우세손 하단 독 레일, 좌우 완전 미러)
  const btnSize = viewport.buttonSizePx;
  const halfBtn = Math.round(btnSize / 2);
  const railGap = viewport.widthPx <= 375 ? 6 : 8;
  const rightAnchorX = safeRight - edgeMarginPx;

  const thumbArcButtons: readonly ErgonomicControlRect[] = THUMB_ARC_ACTIONS.map((action, index) => {
    let rightHandRect: LayoutRect;
    if (!sheetVisible) {
      const rad = (action.arcAngleDeg * Math.PI) / 180;
      const cx = Math.round(rightThumbPivot.x - viewport.arcRadiusPx * Math.cos(rad));
      const cy = Math.round(rightThumbPivot.y - viewport.arcRadiusPx * Math.sin(rad));
      rightHandRect = { x: cx - halfBtn, y: cy - halfBtn, width: btnSize, height: btnSize };
    } else {
      const x = rightAnchorX - (THUMB_ARC_ACTIONS.length - index) * btnSize - (THUMB_ARC_ACTIONS.length - 1 - index) * railGap;
      rightHandRect = { x, y: safeBottom - 8 - btnSize, width: btnSize, height: btnSize };
    }
    const finalRect = handedness === "right" ? rightHandRect : mirrorRectX(rightHandRect, viewport.widthPx);
    return buildErgonomicControl(action.id, "thumb-arc-button", action.labelKo, action.labelEn, action.shortGlyph, finalRect, thumbPivot, viewport, thumbArcBandTopPx, !immersiveMode);
  });

  // 몰입 모드 모서리 복귀 버튼
  const rightRestoreRect: LayoutRect = { x: safeRight - edgeMarginPx - btnSize, y: safeBottom - 8 - btnSize, width: btnSize, height: btnSize };
  const immersiveRestoreButton = buildErgonomicControl(
    "immersive-restore", "immersive-restore", "도구 복귀", "Show Chrome", "⊞",
    handedness === "right" ? rightRestoreRect : mirrorRectX(rightRestoreRect, viewport.widthPx),
    thumbPivot, viewport, thumbArcBandTopPx, immersiveMode,
  );

  // 손바닥 오터치 보호 구역 및 폴드 힌지 여유 실측
  const palmW = viewport.palmRestZoneDepthPx;
  const palmH = Math.round(viewport.palmRestZoneDepthPx * 1.15);
  const rightPalmRect: LayoutRect = { x: safeRight - palmW, y: safeBottom - palmH, width: palmW, height: palmH };
  const palmRect = handedness === "right" ? rightPalmRect : mirrorRectX(rightPalmRect, viewport.widthPx);

  const slidersOpposite = sliderSide !== handedness;
  const sliderPalmClearancePx = Math.max(
    0,
    handedness === "right" ? palmRect.x - (sizeSliderRect.x + sizeSliderRect.width) : sizeSliderRect.x - (palmRect.x + palmRect.width),
  );
  let arcToPalmClearancePx = 0;
  if (!sheetVisible && !immersiveMode) {
    let minClear = Number.POSITIVE_INFINITY;
    for (const btn of thumbArcButtons) {
      const dx = Math.max(0, palmRect.x - (btn.rect.x + btn.rect.width), btn.rect.x - (palmRect.x + palmRect.width));
      const dy = Math.max(0, palmRect.y - (btn.rect.y + btn.rect.height), btn.rect.y - (palmRect.y + palmRect.height));
      minClear = Math.min(minClear, Math.hypot(dx, dy));
    }
    arcToPalmClearancePx = Number.isFinite(minClear) ? round1(minClear) : 0;
  }

  let foldHingeClearancePx: number | null = null;
  if (viewport.hasFoldHinge) {
    const hingeLeft = viewport.widthPx / 2 - viewport.hardwareCutout.widthPx / 2;
    const hingeRight = viewport.widthPx / 2 + viewport.hardwareCutout.widthPx / 2;
    const checkedRects = [
      ...(slidersVisible ? [sizeSliderRect, opacitySliderRect] : []),
      ...(immersiveMode ? [immersiveRestoreButton.rect] : thumbArcButtons.map((b) => b.rect)),
    ];
    let minGap = Number.POSITIVE_INFINITY;
    for (const r of checkedRects) {
      const gap = r.x + r.width <= hingeLeft ? hingeLeft - (r.x + r.width) : r.x >= hingeRight ? r.x - hingeRight : 0;
      minGap = Math.min(minGap, gap);
    }
    foldHingeClearancePx = Number.isFinite(minGap) ? round1(minGap) : 0;
  }

  const sliderOverlapsPalm = rectsOverlap(sizeSliderRect, palmRect) || rectsOverlap(opacitySliderRect, palmRect);
  const clearanceRatio = clamp(sliderPalmClearancePx / Math.max(180, viewport.widthPx * 0.55), 0, 1);
  const palmRejectionScorePct = round1(
    (slidersOpposite ? 45 : 0) + clearanceRatio * 25 + (sliderOverlapsPalm ? 0 : 20) + (foldHingeClearancePx === null || foldHingeClearancePx >= 24 ? 10 : 4),
  );
  const palmGuard: PalmGuardEvaluation = {
    drawingHandSide: handedness, sliderEdge: sliderSide, rect: palmRect, slidersOppositeToDrawingHand: slidersOpposite,
    sliderPalmClearancePx: round1(sliderPalmClearancePx), arcToPalmClearancePx, foldHingeClearancePx, palmRejectionScorePct,
  };

  // 가시 인터랙션 컨트롤 및 면적·충돌·오버플로우 실측
  const sheetDragControl = buildErgonomicControl("sheet-drag-handle", "sheet-drag-handle", "시트 드래그 핸들", "Sheet Drag Handle", "―", dragHandleRect, thumbPivot, viewport, thumbArcBandTopPx, sheetVisible);
  const visibleInteractiveRects: LayoutRect[] = [
    ...(topBarVisible ? topBarButtons.map((b) => b.rect) : []),
    ...(slidersVisible ? [sizeSliderRect, opacitySliderRect] : []),
    ...(immersiveMode ? [immersiveRestoreButton.rect] : thumbArcButtons.map((b) => b.rect)),
    ...(sheetVisible ? [dragHandleRect] : []),
  ];
  const allLayoutRects: LayoutRect[] = [
    ...visibleInteractiveRects,
    ...(topBarVisible ? [topBarRect] : []),
    ...(sheetVisible ? [bottomSheet.rect] : []),
  ];

  const safeAreaCollisionCount = countSafeAreaCollisions(visibleInteractiveRects, viewport);
  const controlOverlapCount = countControlOverlaps(visibleInteractiveRects);
  const horizontalOverflowPx = computeHorizontalOverflowPx(allLayoutRects, viewport.widthPx);

  let minTouchTargetPx = Number.POSITIVE_INFINITY;
  let touchPassCount = 0;
  for (const r of visibleInteractiveRects) {
    minTouchTargetPx = Math.min(minTouchTargetPx, Math.min(r.width, r.height));
    if (r.width >= MIN_TOUCH_TARGET_PX && r.height >= MIN_TOUCH_TARGET_PX) touchPassCount += 1;
  }
  const touchTarget44CompliancePct = visibleInteractiveRects.length > 0 ? round1((touchPassCount / visibleInteractiveRects.length) * 100) : 100;

  const primaryThumbControls = immersiveMode ? [immersiveRestoreButton] : thumbArcButtons;
  const primaryEasyCount = primaryThumbControls.filter((c) => c.reachZone === "easy").length;
  const easyReachHitRatePct = round1((primaryEasyCount / primaryThumbControls.length) * 100);
  const lower38CompliancePct = round1((primaryThumbControls.filter((c) => c.inLower38Band).length / primaryThumbControls.length) * 100);

  let allEasyCount = primaryEasyCount;
  let allTrackedCount = primaryThumbControls.length;
  if (slidersVisible) {
    allTrackedCount += 2;
    if (sizeSlider.distanceFromSupportPivotPx <= viewport.easyRadiusPx) allEasyCount += 1;
    if (opacitySlider.distanceFromSupportPivotPx <= viewport.easyRadiusPx) allEasyCount += 1;
  }
  if (topBarVisible) {
    allTrackedCount += topBarButtons.length;
    allEasyCount += topBarButtons.filter((b) => b.reachZone === "easy").length;
  }
  if (sheetVisible) {
    allTrackedCount += 1;
    if (sheetDragControl.reachZone === "easy") allEasyCount += 1;
  }

  // 캔버스 실가용 면적 (Safe-Area 내 비중복 크롬 합산)
  const totalViewportAreaPx2 = viewport.widthPx * viewport.heightPx;
  const safeViewportAreaPx2 = safeWidth * safeHeight;
  let appChromeAreaPx2 = 0;
  if (topBarVisible) appChromeAreaPx2 += topBarRect.width * topBarRect.height;
  if (slidersVisible) appChromeAreaPx2 += sizeSliderRect.width * sizeSliderRect.height + opacitySliderRect.width * opacitySliderRect.height;
  if (immersiveMode) {
    appChromeAreaPx2 += immersiveRestoreButton.rect.width * immersiveRestoreButton.rect.height;
  } else if (sheetVisible) {
    appChromeAreaPx2 += safeWidth * Math.max(0, safeBottom - sheetTopPx);
  } else {
    for (const b of thumbArcButtons) appChromeAreaPx2 += b.rect.width * b.rect.height;
  }

  const canvasUsableAreaPx2 = Math.max(0, safeViewportAreaPx2 - appChromeAreaPx2);
  const canvasUsableAreaPct = round1((canvasUsableAreaPx2 / safeViewportAreaPx2) * 100);
  const canvasGrossViewportPct = round1((canvasUsableAreaPx2 / totalViewportAreaPx2) * 100);

  const metrics: ThumbZoneErgonomicMetrics = {
    canvasUsableAreaPct, canvasGrossViewportPct, canvasUsableAreaPx2, safeViewportAreaPx2, totalViewportAreaPx2,
    appChromeAreaPx2, meetsCanvas82Gate: canvasUsableAreaPct >= CANVAS_USABLE_AREA_TARGET_PCT,
    easyReachHitRatePct, allControlsEasyReachPct: round1((allEasyCount / Math.max(1, allTrackedCount)) * 100),
    touchTarget44CompliancePct, minTouchTargetPx: Number.isFinite(minTouchTargetPx) ? minTouchTargetPx : MIN_TOUCH_TARGET_PX,
    safeAreaCollisionCount, controlOverlapCount, horizontalOverflowPx, lower38CompliancePct,
    visibleInteractiveCount: visibleInteractiveRects.length,
  };

  const cssVariables: Readonly<Record<string, string>> = {
    "--studio-viewport-width": `${viewport.widthPx}px`,
    "--studio-viewport-height": `${viewport.heightPx}px`,
    "--studio-safe-top": `${viewport.safeAreaInsets.topPx}px`,
    "--studio-safe-bottom": `${viewport.safeAreaInsets.bottomPx}px`,
    "--studio-thumb-arc-band": `${Math.round(THUMB_ARC_LOWER_RATIO * 100)}%`,
    "--studio-slider-side": sliderSide,
    "--studio-thumb-dock-side": thumbArcSide,
    "--studio-half-sheet-height": `${Math.round(HALF_SHEET_HEIGHT_RATIO * 100)}%`,
    "--studio-sheet-height": `${sheetHeightPx}px`,
    "--studio-sheet-drag-handle": `${SHEET_DRAG_HANDLE_HEIGHT_PX}px`,
    "--studio-sheet-overscroll": SHEET_OVERSCROLL_BEHAVIOR,
    "--studio-touch-target-min": `${MIN_TOUCH_TARGET_PX}px`,
  };

  return {
    viewport, handedness, bottomSheetState: requestedSheet, immersiveMode, brushSizePx, brushOpacityPct,
    sliderSide, thumbArcSide, safeBounds, thumbArcBandTopPx, thumbPivot, supportPivot,
    reachZones: { easyRadiusPx: viewport.easyRadiusPx, stretchRadiusPx: viewport.stretchRadiusPx, hardOuterRadiusPx: Math.round(Math.hypot(viewport.widthPx, viewport.heightPx)) },
    topBar: { visible: topBarVisible, rect: topBarRect, buttons: topBarButtons },
    verticalSliders: { visible: slidersVisible, side: sliderSide, sizeSlider, opacitySlider },
    thumbArcButtons, immersiveRestoreButton, bottomSheet, palmGuard, metrics, cssVariables,
  };
}

/** 오른손잡이와 왼손잡이 레이아웃의 완전 수평 미러 대칭성과 지표 동등성을 검증한다. */
export function verifyHandednessMirrorParity(
  viewportId: MobileViewportPresetId,
  bottomSheetState: BottomSheetState = "closed",
  immersiveMode = false,
): HandednessMirrorParityReport {
  const right = evaluateThumbZoneErgonomics({ viewportId, handedness: "right", bottomSheetState, immersiveMode });
  const left = evaluateThumbZoneErgonomics({ viewportId, handedness: "left", bottomSheetState, immersiveMode });
  const w = right.viewport.widthPx;
  const pairs: readonly (readonly [LayoutRect, LayoutRect])[] = [
    [right.verticalSliders.sizeSlider.rect, left.verticalSliders.sizeSlider.rect],
    [right.verticalSliders.opacitySlider.rect, left.verticalSliders.opacitySlider.rect],
    [right.palmGuard.rect, left.palmGuard.rect],
    [right.immersiveRestoreButton.rect, left.immersiveRestoreButton.rect],
    ...right.thumbArcButtons.map((btn, idx) => [btn.rect, left.thumbArcButtons[idx].rect] as const),
  ];

  let maxDrift = Math.abs(right.thumbPivot.x + left.thumbPivot.x - w);
  for (const [rRect, lRect] of pairs) {
    maxDrift = Math.max(
      maxDrift,
      Math.abs(lRect.x + lRect.width - (w - rRect.x)),
      Math.abs(lRect.y - rRect.y),
      Math.abs(lRect.width - rRect.width),
      Math.abs(lRect.height - rRect.height),
    );
  }

  return {
    viewportId: right.viewport.id,
    bottomSheetState,
    immersiveMode,
    exactHorizontalMirror: maxDrift === 0,
    maxMirrorDriftPx: round1(maxDrift),
    canvasAreaDeltaPct: round1(Math.abs(right.metrics.canvasUsableAreaPct - left.metrics.canvasUsableAreaPct)),
    easyReachDeltaPct: round1(Math.abs(right.metrics.easyReachHitRatePct - left.metrics.easyReachHitRatePct)),
    touchComplianceDeltaPct: round1(Math.abs(right.metrics.touchTarget44CompliancePct - left.metrics.touchTarget44CompliancePct)),
    safeAreaCollisionsBothZero: right.metrics.safeAreaCollisionCount === 0 && left.metrics.safeAreaCollisionCount === 0,
    horizontalOverflowBothZero: right.metrics.horizontalOverflowPx === 0 && left.metrics.horizontalOverflowPx === 0,
  };
}

/** 모바일·태블릿 엄지존 반응형 레이아웃 규격을 결정론적 JSON으로 내보낸다. */
export function exportMobileThumbzoneSpecJson(result: ThumbZoneErgonomicsResult): string {
  const parity = verifyHandednessMirrorParity(result.viewport.id, result.bottomSheetState, result.immersiveMode);
  const payload = {
    schema: "toonstudio.mobile-thumbzone.v1",
    viewport: {
      id: result.viewport.id, nameKo: result.viewport.nameKo, nameEn: result.viewport.nameEn,
      formFactor: result.viewport.formFactor, widthPx: result.viewport.widthPx, heightPx: result.viewport.heightPx,
      safeAreaInsets: result.viewport.safeAreaInsets, hardwareCutout: result.viewport.hardwareCutout, hasFoldHinge: result.viewport.hasFoldHinge,
    },
    ergonomics: {
      handedness: result.handedness, sliderSide: result.sliderSide, thumbArcSide: result.thumbArcSide,
      immersiveMode: result.immersiveMode, thumbArcBandTopPx: result.thumbArcBandTopPx,
      thumbPivot: result.thumbPivot, reachZones: result.reachZones, palmGuard: result.palmGuard, mirrorParity: parity,
    },
    brushControls: {
      sizePx: result.brushSizePx, opacityPct: result.brushOpacityPct,
      sizeSliderRect: result.verticalSliders.sizeSlider.rect, opacitySliderRect: result.verticalSliders.opacitySlider.rect,
    },
    bottomSheet: {
      requestedState: result.bottomSheet.requestedState, effectiveState: result.bottomSheet.effectiveState,
      heightRatio: result.bottomSheet.heightRatio, heightPx: result.bottomSheet.heightPx,
      dragHandleHeightPx: result.bottomSheet.dragHandleHeightPx, overscrollBehavior: result.bottomSheet.overscrollBehavior,
    },
    thumbArcButtons: result.thumbArcButtons.map((btn) => ({
      id: btn.id, labelKo: btn.labelKo, labelEn: btn.labelEn, rect: btn.rect,
      reachZone: btn.reachZone, distanceFromDominantPivotPx: btn.distanceFromDominantPivotPx,
      meetsTouchTarget44: btn.meetsTouchTarget44, inLower38Band: btn.inLower38Band,
    })),
    metrics: result.metrics,
    cssVariables: result.cssVariables,
    colorPolicy: {
      space: "oklch",
      violetSlopRangeDeg: [VIOLET_SLOP_MIN_HUE, VIOLET_SLOP_MAX_HUE],
      easyZoneColor: formatOklch(THUMBZONE_SVG_PALETTE.easyZone),
      stretchZoneColor: formatOklch(THUMBZONE_SVG_PALETTE.stretchZone),
      hardZoneColor: formatOklch(THUMBZONE_SVG_PALETTE.hardZone),
    },
  };
  return JSON.stringify(payload, null, 2);
}
