/**
 * 태블릿·디지타이저 7대 하드웨어 통합 엔진:
 * ① 호버 3D 틸트·트위스트 윤곽 프리뷰(computeHoverNibPreview),
 * ② 360° 배럴 롤 & 사이드버튼/스퀴즈 Spring-Loaded 임시 도구(stepSpringLoadedStylusTool),
 * ③ 펜 뒷면 지우개(buttons===32) & 2/3/4손가락 멀티터치 제스처 라우터(routeMultitouchGesture),
 * ④ 펜 전용 그리기 팜 리젝션 게이트(evaluatePalmRejectionGate),
 * ⑤ 240Hz getCoalescedEvents() + getPredictedEvents() 1프레임 예측 보간기(extractAndPredictStylusSamples),
 * ⑥ 판 태블릿 1:1 종횡비 잠금(Force Proportions) 좌표 매퍼(mapDigitizerForceProportions),
 * ⑦ 브러시별 독립 필압 커브 맵(evaluatePerBrushPressureCurve) & 햅틱 디텐트 트리거(triggerStylusHapticDetent).
 * 순수 결정론 연산 전용 (브라우저 스토리지·원시 색상 코드 비의존).
 */

export type StylusPointerKind = "pen" | "touch" | "mouse";
export type StylusNibShape = "round" | "chisel-calligraphy" | "flat-bristle" | "g-pen" | "airbrush";
export type StylusBaseTool = "brush" | "g-pen" | "pencil" | "watercolor" | "oil" | "fill";
export type StylusTemporaryTool = "eyedropper" | "eraser" | "radial-palette" | "pan-hand" | "zoom" | "lasso";
export type StylusActiveTool = StylusBaseTool | StylusTemporaryTool;
export type StylusSideTrigger = "side-primary" | "side-secondary" | "barrel-squeeze" | "double-tap";
export type StylusHapticDetentKind =
  | "angle-snap" | "squeeze-palette" | "tool-switch" | "slider-detent" | "palm-reject-subtle" | "boundary-clamp";
export interface Point2D { readonly x: number; readonly y: number; }

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const REAR_ERASER_BUTTON_MASK = 32;
const REAR_ERASER_BUTTON_INDEX = 5;

const finite = (v: number | undefined, fb: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fb);
const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const roundTo = (v: number, digits = 3): number => { const f = 10 ** digits; return Math.round(finite(v, 0) * f) / f; };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function normalizeAngleDeg(angleDeg: number): number {
  const w = finite(angleDeg, 0) % 360;
  return w < 0 ? w + 360 : w;
}
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = normalizeAngleDeg(toDeg) - normalizeAngleDeg(fromDeg);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// ① 펜 호버(Hover) 3D 틸트·회전(twist) 윤곽 프리뷰 기하
export interface HoverNibPreviewInput {
  readonly x: number; readonly y: number; readonly tiltX: number; readonly tiltY: number; readonly twist: number;
  readonly pressure?: number; readonly isHovering?: boolean; readonly hoverAltitudeMm?: number; readonly hoverHeightMaxMm?: number;
  readonly altitudeAngleRad?: number; readonly azimuthAngleRad?: number; readonly nibShape?: StylusNibShape;
  readonly baseDiameterPx?: number; readonly aspectRatio?: number; readonly baseAngleDeg?: number;
  readonly tiltElongationStrength?: number; readonly barrelRollEnabled?: boolean; readonly outlineSegments?: number;
}
export interface HoverNibPreviewResult {
  readonly center: Point2D; readonly isHovering: boolean;
  readonly altitudeDeg: number; readonly azimuthDeg: number; readonly tiltMagnitudeDeg: number;
  readonly barrelRotationDeg: number; readonly effectiveRotationDeg: number;
  readonly majorRadiusPx: number; readonly minorRadiusPx: number;
  readonly hoverRatio01: number; readonly previewOpacity: number;
  readonly outlinePoints: readonly Point2D[]; readonly outlinePathD: string;
  readonly barrelAxisLine: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly shadowEllipse: { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly rotationDeg: number; readonly opacity: number };
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
}

const NIB_SHAPE_SPECS: Record<StylusNibShape, { readonly aspect: number; readonly tiltStretch: number; readonly anisotropic: boolean }> = {
  round: { aspect: 1.0, tiltStretch: 0.45, anisotropic: false },
  "chisel-calligraphy": { aspect: 0.28, tiltStretch: 0.85, anisotropic: true },
  "flat-bristle": { aspect: 0.36, tiltStretch: 1.05, anisotropic: true },
  "g-pen": { aspect: 0.58, tiltStretch: 0.65, anisotropic: true },
  airbrush: { aspect: 1.0, tiltStretch: 1.25, anisotropic: false },
};

export function computeHoverNibPreview(input: HoverNibPreviewInput): HoverNibPreviewResult {
  const cx = finite(input.x, 0); const cy = finite(input.y, 0);
  const tiltX = clamp(finite(input.tiltX, 0), -85, 85); const tiltY = clamp(finite(input.tiltY, 0), -85, 85);
  const pressure = clamp(finite(input.pressure, 0), 0, 1);
  const isHovering = input.isHovering ?? pressure <= 0.001;
  const maxHoverMm = Math.max(1, finite(input.hoverHeightMaxMm, 14));
  const hoverAltitudeMm = isHovering ? clamp(finite(input.hoverAltitudeMm, 6), 0, maxHoverMm) : 0;
  const hoverRatio01 = clamp(hoverAltitudeMm / maxHoverMm, 0, 1);

  let altitudeRad: number; let azimuthRad: number;
  if (tiltX === 0 && tiltY === 0 && typeof input.altitudeAngleRad === "number" && Number.isFinite(input.altitudeAngleRad)) {
    altitudeRad = clamp(input.altitudeAngleRad, 0.05, Math.PI / 2);
    azimuthRad = normalizeAngleDeg(finite(input.azimuthAngleRad, 0) * RAD_TO_DEG) * DEG_TO_RAD;
  } else {
    const tanX = Math.tan(tiltX * DEG_TO_RAD); const tanY = Math.tan(tiltY * DEG_TO_RAD);
    const radial = Math.hypot(tanX, tanY);
    altitudeRad = radial < 1e-7 ? Math.PI / 2 : Math.atan(1 / radial);
    azimuthRad = radial < 1e-7 ? 0 : normalizeAngleDeg(Math.atan2(tanY, tanX) * RAD_TO_DEG) * DEG_TO_RAD;
  }

  const altitudeDeg = roundTo(altitudeRad * RAD_TO_DEG, 2);
  const azimuthDeg = roundTo(azimuthRad * RAD_TO_DEG, 2);
  const tiltMagnitudeDeg = roundTo(clamp(90 - altitudeDeg, 0, 89), 2);
  const tiltRatio01 = tiltMagnitudeDeg / 90;
  const shapeSpec = NIB_SHAPE_SPECS[input.nibShape ?? "flat-bristle"];
  const baseRadius = Math.max(1, finite(input.baseDiameterPx, 24) * 0.5);
  const aspectRatio = clamp(finite(input.aspectRatio, shapeSpec.aspect), 0.12, 1.0);
  const tiltStrength = clamp(finite(input.tiltElongationStrength, 0.8), 0, 1.5);
  const barrelRotationDeg = (input.barrelRollEnabled ?? true) ? roundTo(normalizeAngleDeg(input.twist), 2) : 0;
  const scale = (isHovering ? 1 + hoverRatio01 * 0.14 : 1) * (isHovering ? 1 : 0.65 + pressure * 0.55);
  const majorRadiusPx = roundTo(baseRadius * scale * (1 + tiltRatio01 * shapeSpec.tiltStretch * tiltStrength), 2);
  const minorRadiusPx = roundTo(Math.max(1, baseRadius * aspectRatio * scale * (1 + tiltRatio01 * 0.12)), 2);

  const effectiveRotationDeg = roundTo(normalizeAngleDeg(finite(input.baseAngleDeg, 0) + (shapeSpec.anisotropic ? barrelRotationDeg : azimuthDeg)), 2);
  const cosR = Math.cos(effectiveRotationDeg * DEG_TO_RAD); const sinR = Math.sin(effectiveRotationDeg * DEG_TO_RAD);
  const segments = Math.round(clamp(finite(input.outlineSegments, 24), 8, 64));

  const outlinePoints: Point2D[] = [];
  let minX = Number.POSITIVE_INFINITY; let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const lx = Math.cos(theta) * majorRadiusPx; const ly = Math.sin(theta) * minorRadiusPx;
    const px = roundTo(cx + lx * cosR - ly * sinR, 2); const py = roundTo(cy + lx * sinR + ly * cosR, 2);
    outlinePoints.push({ x: px, y: py });
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const outlinePathD = `${outlinePoints.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ")} Z`;
  const barrelProjLen = roundTo((baseRadius * 1.45 + hoverAltitudeMm * 1.6) * Math.cos(altitudeRad), 2);
  const shadowDist = roundTo(hoverAltitudeMm * 1.25 * Math.cos(altitudeRad), 2);
  return {
    center: { x: roundTo(cx, 2), y: roundTo(cy, 2) }, isHovering, altitudeDeg, azimuthDeg, tiltMagnitudeDeg,
    barrelRotationDeg, effectiveRotationDeg, majorRadiusPx, minorRadiusPx,
    hoverRatio01: roundTo(hoverRatio01, 3), previewOpacity: roundTo(clamp(1 - hoverRatio01 * 0.55, 0.35, 1), 3),
    outlinePoints, outlinePathD,
    barrelAxisLine: { x1: roundTo(cx, 2), y1: roundTo(cy, 2), x2: roundTo(cx + Math.cos(azimuthRad) * barrelProjLen, 2), y2: roundTo(cy + Math.sin(azimuthRad) * barrelProjLen, 2) },
    shadowEllipse: {
      cx: roundTo(cx + Math.cos(azimuthRad) * shadowDist, 2), cy: roundTo(cy + Math.sin(azimuthRad) * shadowDist, 2),
      rx: roundTo(majorRadiusPx * (1 + hoverRatio01 * 0.18), 2), ry: roundTo(minorRadiusPx * (1 + hoverRatio01 * 0.18), 2),
      rotationDeg: effectiveRotationDeg, opacity: roundTo(isHovering ? clamp(0.32 - hoverRatio01 * 0.18, 0.08, 0.32) : 0.12, 3),
    },
    bounds: { minX, minY, maxX, maxY },
  };
}

// ② 360° 배럴 롤 붓모 회전 & 사이드버튼/스퀴즈 Spring-Loaded 임시 도구 상태 머신
export interface BarrelRollBristleOrientation {
  readonly normalizedAngleDeg: number; readonly angleRad: number; readonly deltaDeg: number;
  readonly cumulativeRollDeg: number; readonly effectiveWidthRatio: number; readonly bristleSpreadDeg: number;
}
export function computeBarrelRollBristleOrientation(
  previousCumulativeDeg: number, nextTwistDeg: number,
  options?: { readonly enabled?: boolean; readonly deadzoneDeg?: number; readonly chiselAspect?: number },
): BarrelRollBristleOrientation {
  if (!(options?.enabled ?? true)) {
    return { normalizedAngleDeg: 0, angleRad: 0, deltaDeg: 0, cumulativeRollDeg: 0, effectiveWidthRatio: 1, bristleSpreadDeg: 0 };
  }
  const prevCum = finite(previousCumulativeDeg, 0);
  const rawDelta = shortestAngleDeltaDeg(normalizeAngleDeg(prevCum), nextTwistDeg);
  const deltaDeg = Math.abs(rawDelta) < clamp(finite(options?.deadzoneDeg, 0.5), 0, 15) ? 0 : rawDelta;
  const cumulativeRollDeg = roundTo(prevCum + deltaDeg, 2);
  const normalizedAngleDeg = roundTo(normalizeAngleDeg(cumulativeRollDeg), 2);
  const angleRad = roundTo(normalizedAngleDeg * DEG_TO_RAD, 4);
  const chiselAspect = clamp(finite(options?.chiselAspect, 0.3), 0.1, 1);
  return {
    normalizedAngleDeg, angleRad, deltaDeg: roundTo(deltaDeg, 2), cumulativeRollDeg,
    effectiveWidthRatio: roundTo(Math.hypot(Math.cos(angleRad), Math.sin(angleRad) * chiselAspect), 3),
    bristleSpreadDeg: roundTo(Math.abs(Math.sin(angleRad)) * 28, 2),
  };
}

export type StylusSideButtonBindings = Readonly<Record<StylusSideTrigger, StylusTemporaryTool>>;
export const DEFAULT_STYLUS_SIDE_BINDINGS: StylusSideButtonBindings = {
  "side-primary": "eyedropper", "side-secondary": "eraser", "barrel-squeeze": "radial-palette", "double-tap": "eraser",
};
export type SpringLoadedTransitionReason =
  | "initial" | "spring-engage" | "spring-revert" | "double-tap-toggle"
  | "rear-eraser-engage" | "rear-eraser-revert" | "base-tool-change" | "barrel-roll-update" | "cancel-revert" | "noop";
export interface SpringLoadedStylusState {
  readonly baseTool: StylusBaseTool; readonly activeTool: StylusActiveTool; readonly activeTrigger: StylusSideTrigger | null;
  readonly isSpringLoadedActive: boolean; readonly isRearEraserActive: boolean; readonly isRadialPaletteOpen: boolean;
  readonly pressedAtMs: number | null; readonly barrelRollDeg: number; readonly cumulativeRollDeg: number;
  readonly lastTransitionReason: SpringLoadedTransitionReason; readonly recommendedHaptic: StylusHapticDetentKind | null;
}
export type SpringLoadedStylusEvent =
  | { readonly type: "press"; readonly trigger: StylusSideTrigger; readonly timestampMs: number }
  | { readonly type: "release"; readonly trigger: StylusSideTrigger; readonly timestampMs: number }
  | { readonly type: "rear-eraser"; readonly pointerType: StylusPointerKind; readonly buttons: number; readonly button?: number }
  | { readonly type: "barrel-roll"; readonly twistDeg: number; readonly enabled?: boolean }
  | { readonly type: "set-base-tool"; readonly tool: StylusBaseTool }
  | { readonly type: "cancel" };

export function createInitialSpringLoadedStylusState(baseTool: StylusBaseTool = "g-pen"): SpringLoadedStylusState {
  return {
    baseTool, activeTool: baseTool, activeTrigger: null, isSpringLoadedActive: false, isRearEraserActive: false,
    isRadialPaletteOpen: false, pressedAtMs: null, barrelRollDeg: 0, cumulativeRollDeg: 0, lastTransitionReason: "initial", recommendedHaptic: null,
  };
}

export function detectStylusRearEraser(input: { readonly pointerType: StylusPointerKind; readonly buttons: number; readonly button?: number }): boolean {
  if (input.pointerType !== "pen") return false;
  return (Math.trunc(finite(input.buttons, 0)) & REAR_ERASER_BUTTON_MASK) === REAR_ERASER_BUTTON_MASK || input.button === REAR_ERASER_BUTTON_INDEX;
}

export function stepSpringLoadedStylusTool(
  state: SpringLoadedStylusState, event: SpringLoadedStylusEvent,
  bindings: StylusSideButtonBindings = DEFAULT_STYLUS_SIDE_BINDINGS,
): SpringLoadedStylusState {
  if (event.type === "barrel-roll") {
    const roll = computeBarrelRollBristleOrientation(state.cumulativeRollDeg, event.twistDeg, { enabled: event.enabled ?? true });
    return { ...state, barrelRollDeg: roll.normalizedAngleDeg, cumulativeRollDeg: roll.cumulativeRollDeg, lastTransitionReason: "barrel-roll-update", recommendedHaptic: null };
  }
  if (event.type === "set-base-tool") {
    const keepOverride = state.isSpringLoadedActive || state.isRearEraserActive;
    return { ...state, baseTool: event.tool, activeTool: keepOverride ? state.activeTool : event.tool, lastTransitionReason: "base-tool-change", recommendedHaptic: null };
  }
  if (event.type === "cancel") {
    if (!state.isSpringLoadedActive && !state.isRearEraserActive && state.activeTool === state.baseTool) return { ...state, lastTransitionReason: "noop", recommendedHaptic: null };
    return { ...state, activeTool: state.baseTool, activeTrigger: null, isSpringLoadedActive: false, isRearEraserActive: false, isRadialPaletteOpen: false, pressedAtMs: null, lastTransitionReason: "cancel-revert", recommendedHaptic: null };
  }
  if (event.type === "rear-eraser") {
    const rearActive = detectStylusRearEraser(event);
    if (rearActive && !state.isRearEraserActive) return { ...state, activeTool: "eraser", isRearEraserActive: true, isRadialPaletteOpen: false, lastTransitionReason: "rear-eraser-engage", recommendedHaptic: "tool-switch" };
    if (!rearActive && state.isRearEraserActive) {
      const restored: StylusActiveTool = state.isSpringLoadedActive && state.activeTrigger ? bindings[state.activeTrigger] : state.baseTool;
      return { ...state, activeTool: restored, isRearEraserActive: false, isRadialPaletteOpen: restored === "radial-palette", lastTransitionReason: "rear-eraser-revert", recommendedHaptic: "tool-switch" };
    }
    return { ...state, lastTransitionReason: "noop", recommendedHaptic: null };
  }
  if (event.type === "press") {
    if (state.isRearEraserActive) return { ...state, lastTransitionReason: "noop", recommendedHaptic: null };
    const mappedTool = bindings[event.trigger];
    if (event.trigger === "double-tap") {
      const revert = state.activeTool === mappedTool && !state.isSpringLoadedActive;
      const nextTool: StylusActiveTool = revert ? state.baseTool : mappedTool;
      return { ...state, activeTool: nextTool, activeTrigger: revert ? null : "double-tap", isSpringLoadedActive: false, isRadialPaletteOpen: nextTool === "radial-palette", pressedAtMs: finite(event.timestampMs, 0), lastTransitionReason: "double-tap-toggle", recommendedHaptic: "tool-switch" };
    }
    return { ...state, activeTool: mappedTool, activeTrigger: event.trigger, isSpringLoadedActive: true, isRadialPaletteOpen: mappedTool === "radial-palette", pressedAtMs: finite(event.timestampMs, 0), lastTransitionReason: "spring-engage", recommendedHaptic: mappedTool === "radial-palette" ? "squeeze-palette" : "tool-switch" };
  }
  if (event.trigger === "double-tap" || !state.isSpringLoadedActive || state.activeTrigger !== event.trigger) return { ...state, lastTransitionReason: "noop", recommendedHaptic: null };
  return { ...state, activeTool: state.isRearEraserActive ? "eraser" : state.baseTool, activeTrigger: null, isSpringLoadedActive: false, isRadialPaletteOpen: false, pressedAtMs: null, lastTransitionReason: "spring-revert", recommendedHaptic: "tool-switch" };
}

// ③ 2/3/4손가락 멀티터치 제스처 라우터 & ④ 펜 전용 팜 리젝션 게이트
export interface TouchContactPoint { readonly id: number; readonly x: number; readonly y: number; readonly widthPx?: number; readonly heightPx?: number; }
export interface MultitouchGestureInput {
  readonly contacts: readonly TouchContactPoint[]; readonly durationMs: number; readonly maxTravelPx: number;
  readonly swipeDeltaX?: number; readonly swipeDeltaY?: number; readonly scaleDelta?: number;
  readonly rotationDeltaDeg?: number; readonly totalCanvasRotationDeg?: number;
  readonly horizontalScrubReversals?: number; readonly maxPalmContactPx?: number; readonly penActiveInProximity?: boolean;
}
export type MultitouchGestureAction =
  | "undo" | "redo" | "cut-copy-paste-menu" | "clear-layer"
  | "toggle-fullscreen-canvas" | "canvas-pinch-rotate-pan" | "ignored-palm-or-proximity" | "none";
export interface MultitouchGestureRouteResult {
  readonly action: MultitouchGestureAction; readonly validFingerCount: number; readonly rejectedPalmContacts: number;
  readonly snappedRotationDeg: number | null; readonly recommendedHaptic: StylusHapticDetentKind | null;
  readonly labelKo: string; readonly labelEn: string;
}

const GESTURE_LABELS: Record<MultitouchGestureAction, readonly [string, string]> = {
  undo: ["2손가락 탭 · 실행 취소", "2-Finger Tap · Undo"],
  redo: ["3손가락 탭 · 다시 실행", "3-Finger Tap · Redo"],
  "cut-copy-paste-menu": ["3손가락 아래 스와이프 · 복사/붙여넣기", "3-Finger Swipe Down · Copy/Paste"],
  "clear-layer": ["3손가락 좌우 문지르기 · 레이어 비우기", "3-Finger Scrub · Clear Layer"],
  "toggle-fullscreen-canvas": ["4손가락 탭 · 전체화면 캔버스", "4-Finger Tap · Fullscreen Canvas"],
  "canvas-pinch-rotate-pan": ["2손가락 줌·회전·팬 변환", "2-Finger Pinch / Rotate / Pan"],
  "ignored-palm-or-proximity": ["팜 리젝션으로 터치 차단", "Touch Blocked by Palm Rejection"],
  none: ["대기 중", "Idle"],
};
const gestureResult = (
  action: MultitouchGestureAction, validFingerCount: number, rejectedPalmContacts: number,
  snappedRotationDeg: number | null = null, recommendedHaptic: StylusHapticDetentKind | null = null,
): MultitouchGestureRouteResult => ({
  action, validFingerCount, rejectedPalmContacts, snappedRotationDeg, recommendedHaptic,
  labelKo: GESTURE_LABELS[action][0], labelEn: GESTURE_LABELS[action][1],
});

export function routeMultitouchGesture(input: MultitouchGestureInput): MultitouchGestureRouteResult {
  const palmLimit = Math.max(18, finite(input.maxPalmContactPx, 36));
  let validFingers = 0;
  let rejectedPalms = 0;
  for (const c of input.contacts) {
    if (Math.max(finite(c.widthPx, 10), finite(c.heightPx, 10)) > palmLimit) rejectedPalms += 1;
    else validFingers += 1;
  }
  if (input.penActiveInProximity || (rejectedPalms > 0 && validFingers < 2)) return gestureResult("ignored-palm-or-proximity", validFingers, rejectedPalms);
  const isTap = Math.max(0, finite(input.durationMs, 0)) <= 280 && Math.max(0, finite(input.maxTravelPx, 0)) <= 20;
  const swipeY = finite(input.swipeDeltaY, 0);
  const swipeX = finite(input.swipeDeltaX, 0);

  if (validFingers === 2) {
    if (isTap) return gestureResult("undo", 2, rejectedPalms, null, "tool-switch");
    if (Math.abs(finite(input.scaleDelta, 1) - 1) > 0.015 || Math.abs(finite(input.rotationDeltaDeg, 0)) > 1 || finite(input.maxTravelPx, 0) > 6) {
      const totalRot = normalizeAngleDeg(finite(input.totalCanvasRotationDeg, 0));
      const nearest90 = Math.round(totalRot / 90) * 90;
      const snapped = Math.abs(shortestAngleDeltaDeg(totalRot, nearest90)) <= 3.5 ? normalizeAngleDeg(nearest90) : null;
      return gestureResult("canvas-pinch-rotate-pan", 2, rejectedPalms, snapped, snapped !== null ? "angle-snap" : null);
    }
  }
  if (validFingers === 3) {
    if (Math.trunc(finite(input.horizontalScrubReversals, 0)) >= 3 && Math.abs(swipeX) >= 35) return gestureResult("clear-layer", 3, rejectedPalms, null, "tool-switch");
    if (swipeY >= 52 && Math.abs(swipeY) > Math.abs(swipeX) * 1.4) return gestureResult("cut-copy-paste-menu", 3, rejectedPalms, null, "squeeze-palette");
    if (isTap) return gestureResult("redo", 3, rejectedPalms, null, "tool-switch");
  }
  if (validFingers === 4 && isTap) return gestureResult("toggle-fullscreen-canvas", 4, rejectedPalms, null, "tool-switch");
  return gestureResult("none", validFingers, rejectedPalms);
}

export interface PalmRejectionConfig {
  readonly stylusOnlyDrawLock: boolean; readonly allowMultitouchNavigation: boolean;
  readonly penHoverGuardWindowMs: number; readonly maxTouchMajorAxisPx: number; readonly dominantHand: "right" | "left";
}
export const DEFAULT_PALM_REJECTION_CONFIG: PalmRejectionConfig = {
  stylusOnlyDrawLock: true, allowMultitouchNavigation: true, penHoverGuardWindowMs: 320, maxTouchMajorAxisPx: 36, dominantHand: "right",
};
export interface PalmRejectionTrackerState {
  readonly lastPenSeenAtMs: number | null; readonly lastPenX: number | null; readonly lastPenY: number | null;
  readonly isPenInProximity: boolean; readonly rejectedPalmEvents: number;
}
export const createInitialPalmRejectionState = (): PalmRejectionTrackerState => (
  { lastPenSeenAtMs: null, lastPenX: null, lastPenY: null, isPenInProximity: false, rejectedPalmEvents: 0 }
);
export interface PalmRejectionInput {
  readonly pointerType: StylusPointerKind; readonly timestampMs: number; readonly x: number; readonly y: number;
  readonly widthPx?: number; readonly heightPx?: number; readonly buttons?: number; readonly button?: number;
  readonly isHovering?: boolean; readonly isPointerLeave?: boolean; readonly activeTouchCount?: number;
}
export type PalmRejectionOutcome = "allow-draw" | "allow-eraser" | "allow-gesture" | "reject-palm";
export type PalmRejectionReason =
  | "pen-rear-eraser" | "pen-primary-input" | "mouse-input" | "palm-large-contact-area"
  | "palm-pen-proximity-lock" | "palm-dominant-hand-rest-zone" | "stylus-only-draw-locked"
  | "multitouch-navigation-allowed" | "touch-draw-allowed";
export interface PalmRejectionDecision {
  readonly outcome: PalmRejectionOutcome; readonly allowStrokeInk: boolean; readonly allowViewportGesture: boolean;
  readonly reason: PalmRejectionReason; readonly confidence01: number; readonly nextState: PalmRejectionTrackerState;
}
const rejectPalm = (reason: PalmRejectionReason, confidence01: number, state: PalmRejectionTrackerState): PalmRejectionDecision => ({
  outcome: "reject-palm", allowStrokeInk: false, allowViewportGesture: false, reason, confidence01,
  nextState: { ...state, rejectedPalmEvents: state.rejectedPalmEvents + 1 },
});

export function evaluatePalmRejectionGate(
  input: PalmRejectionInput, state: PalmRejectionTrackerState, config: PalmRejectionConfig = DEFAULT_PALM_REJECTION_CONFIG,
): PalmRejectionDecision {
  const ts = finite(input.timestampMs, 0);
  const x = finite(input.x, 0);
  const y = finite(input.y, 0);
  if (input.pointerType === "pen") {
    const isRear = detectStylusRearEraser({ pointerType: "pen", buttons: finite(input.buttons, 0), button: input.button });
    const nextState: PalmRejectionTrackerState = { ...state, lastPenSeenAtMs: ts, lastPenX: x, lastPenY: y, isPenInProximity: !input.isPointerLeave };
    return { outcome: isRear ? "allow-eraser" : "allow-draw", allowStrokeInk: !input.isHovering && !input.isPointerLeave, allowViewportGesture: false, reason: isRear ? "pen-rear-eraser" : "pen-primary-input", confidence01: 1, nextState };
  }
  if (input.pointerType === "mouse") return { outcome: "allow-draw", allowStrokeInk: true, allowViewportGesture: false, reason: "mouse-input", confidence01: 1, nextState: state };
  const majorAxis = Math.max(finite(input.widthPx, 10), finite(input.heightPx, 10));
  if (majorAxis > Math.max(18, config.maxTouchMajorAxisPx)) return rejectPalm("palm-large-contact-area", roundTo(clamp(majorAxis / (config.maxTouchMajorAxisPx * 1.4), 0.75, 1), 3), state);
  const msSincePen = state.lastPenSeenAtMs === null ? Number.POSITIVE_INFINITY : Math.max(0, ts - state.lastPenSeenAtMs);
  if (state.isPenInProximity || msSincePen <= Math.max(0, config.penHoverGuardWindowMs)) return rejectPalm("palm-pen-proximity-lock", 0.96, state);
  if (Math.max(1, Math.trunc(finite(input.activeTouchCount, 1))) >= 2 && config.allowMultitouchNavigation) {
    return { outcome: "allow-gesture", allowStrokeInk: false, allowViewportGesture: true, reason: "multitouch-navigation-allowed", confidence01: 0.94, nextState: state };
  }
  if (state.lastPenX !== null && state.lastPenY !== null && msSincePen <= 1500) {
    const dx = x - state.lastPenX;
    const dy = y - state.lastPenY;
    if (dy >= 18 && (config.dominantHand === "right" ? dx >= 14 : dx <= -14) && Math.hypot(dx, dy) <= 220) {
      return rejectPalm("palm-dominant-hand-rest-zone", 0.88, state);
    }
  }
  if (config.stylusOnlyDrawLock) return rejectPalm("stylus-only-draw-locked", 1, state);
  return { outcome: "allow-draw", allowStrokeInk: true, allowViewportGesture: false, reason: "touch-draw-allowed", confidence01: 0.9, nextState: state };
}

// ⑤ 240Hz getCoalescedEvents() + getPredictedEvents() 1프레임 예측 보간기
export interface StylusRawSampleLike {
  readonly x?: number; readonly y?: number; readonly clientX?: number; readonly clientY?: number;
  readonly timeStamp?: number; readonly pressure?: number; readonly tiltX?: number; readonly tiltY?: number;
  readonly twist?: number; readonly pointerType?: StylusPointerKind; readonly buttons?: number;
}
export interface StylusPointerEventLike extends StylusRawSampleLike {
  readonly getCoalescedEvents?: () => readonly StylusRawSampleLike[];
  readonly getPredictedEvents?: () => readonly StylusRawSampleLike[];
}
export interface NormalizedStylusSample {
  readonly x: number; readonly y: number; readonly timestampMs: number; readonly pressure: number;
  readonly tiltX: number; readonly tiltY: number; readonly twist: number;
  readonly isPredicted: boolean; readonly isResampled: boolean;
}
export interface StylusResamplePredictOptions {
  readonly targetHz?: number; readonly enablePrediction?: boolean; readonly frameHorizonMs?: number;
  readonly maxPredictedSamples?: number; readonly maxPredictionDistancePx?: number; readonly cornerDampingThresholdDeg?: number;
}
export interface StylusExtractionPredictionResult {
  readonly committedSamples: readonly NormalizedStylusSample[]; readonly predictedSamples: readonly NormalizedStylusSample[];
  readonly usedNativeCoalesced: boolean; readonly usedNativePredicted: boolean;
  readonly effectiveInputHz: number; readonly estimatedLatencySavedMs: number; readonly cornerDampingFactor01: number;
}

const normalizeSample = (raw: StylusRawSampleLike, fallbackTs: number, isPredicted: boolean): NormalizedStylusSample => ({
  x: roundTo(finite(raw.x, finite(raw.clientX, 0)), 3), y: roundTo(finite(raw.y, finite(raw.clientY, 0)), 3),
  timestampMs: roundTo(finite(raw.timeStamp, fallbackTs), 3), pressure: roundTo(clamp(finite(raw.pressure, 0.5), 0, 1), 4),
  tiltX: roundTo(clamp(finite(raw.tiltX, 0), -85, 85), 2), tiltY: roundTo(clamp(finite(raw.tiltY, 0), -85, 85), 2),
  twist: roundTo(normalizeAngleDeg(finite(raw.twist, 0)), 2), isPredicted, isResampled: false,
});

function computeCornerDamping(tail: readonly NormalizedStylusSample[], thresholdDeg: number): number {
  if (tail.length < 3) return 1;
  const [a, b, c] = tail.slice(-3);
  const v1x = b.x - a.x; const v1y = b.y - a.y; const v2x = c.x - b.x; const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y); const m2 = Math.hypot(v2x, v2y);
  if (m1 < 0.25 || m2 < 0.25) return 1;
  const turnDeg = Math.acos(clamp((v1x * v2x + v1y * v2y) / (m1 * m2), -1, 1)) * RAD_TO_DEG;
  return turnDeg <= thresholdDeg ? 1 : roundTo(clamp(1 - (turnDeg - thresholdDeg) / Math.max(15, 135 - thresholdDeg), 0.1, 1), 3);
}

function clampPredictedOffset(anchor: Point2D, dx: number, dy: number, damping: number, maxDist: number): Point2D {
  const sdx = dx * damping; const sdy = dy * damping;
  const dist = Math.hypot(sdx, sdy);
  const scale = dist > maxDist ? maxDist / dist : 1;
  return { x: roundTo(anchor.x + sdx * scale, 3), y: roundTo(anchor.y + sdy * scale, 3) };
}

export function extractAndPredictStylusSamples(
  event: StylusPointerEventLike, history: readonly NormalizedStylusSample[] = [], options: StylusResamplePredictOptions = {},
): StylusExtractionPredictionResult {
  const targetHz = clamp(finite(options.targetHz, 240), 60, 480); const stepMs = 1000 / targetHz;
  const frameHorizonMs = clamp(finite(options.frameHorizonMs, 8.33), 2, 20);
  const maxPredicted = Math.round(clamp(finite(options.maxPredictedSamples, 3), 1, 6));
  const maxPredDist = clamp(finite(options.maxPredictionDistancePx, 28), 4, 80);
  const rawCoalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  const usedNativeCoalesced = rawCoalesced.length > 0;
  const baseRaw = usedNativeCoalesced ? rawCoalesced : [event];
  const fallbackTs = finite(event.timeStamp, history.length > 0 ? history[history.length - 1].timestampMs + stepMs : 0);
  const sortedRaw = baseRaw.map((item, idx) => normalizeSample(item, fallbackTs + idx * 0.01, false)).sort((a, b) => a.timestampMs - b.timestampMs);

  const anchor = history.length > 0 ? history[history.length - 1] : null;
  const committedSamples: NormalizedStylusSample[] = [];
  let prev = anchor;
  for (const sample of sortedRaw) {
    if (prev && sample.timestampMs - prev.timestampMs > stepMs * 1.35) {
      const subs = Math.min(8, Math.ceil((sample.timestampMs - prev.timestampMs) / stepMs));
      const dTwist = shortestAngleDeltaDeg(prev.twist, sample.twist);
      for (let s = 1; s < subs; s += 1) {
        const t = s / subs;
        committedSamples.push({
          x: roundTo(lerp(prev.x, sample.x, t), 3), y: roundTo(lerp(prev.y, sample.y, t), 3),
          timestampMs: roundTo(lerp(prev.timestampMs, sample.timestampMs, t), 3), pressure: roundTo(lerp(prev.pressure, sample.pressure, t), 4),
          tiltX: roundTo(lerp(prev.tiltX, sample.tiltX, t), 2), tiltY: roundTo(lerp(prev.tiltY, sample.tiltY, t), 2),
          twist: roundTo(normalizeAngleDeg(prev.twist + dTwist * t), 2), isPredicted: false, isResampled: true,
        });
      }
    }
    committedSamples.push(sample); prev = sample;
  }

  const timeline = [...history.slice(-4), ...committedSamples];
  let effectiveInputHz = targetHz;
  if (sortedRaw.length >= 2) {
    const span = sortedRaw[sortedRaw.length - 1].timestampMs - sortedRaw[0].timestampMs;
    if (span > 0.1) effectiveInputHz = roundTo(clamp(((sortedRaw.length - 1) / span) * 1000, 30, 1000), 1);
  } else if (anchor && sortedRaw.length === 1 && sortedRaw[0].timestampMs - anchor.timestampMs > 0.1) {
    effectiveInputHz = roundTo(clamp(1000 / (sortedRaw[0].timestampMs - anchor.timestampMs), 30, 1000), 1);
  }
  const cornerDampingFactor01 = computeCornerDamping(timeline, clamp(finite(options.cornerDampingThresholdDeg, 45), 15, 120));
  const last = timeline[timeline.length - 1];
  const predictedSamples: NormalizedStylusSample[] = [];
  let usedNativePredicted = false;

  if ((options.enablePrediction ?? true) && last) {
    const nativePred = typeof event.getPredictedEvents === "function" ? event.getPredictedEvents() : [];
    if (nativePred.length > 0) {
      usedNativePredicted = true;
      for (const raw of nativePred.slice(0, maxPredicted)) {
        const pt = normalizeSample(raw, last.timestampMs + stepMs, true);
        const dt = pt.timestampMs - last.timestampMs;
        if (dt <= 0 || dt > frameHorizonMs * 1.5) continue;
        const pos = clampPredictedOffset(last, pt.x - last.x, pt.y - last.y, cornerDampingFactor01, maxPredDist);
        predictedSamples.push({ ...pt, x: pos.x, y: pos.y, isPredicted: true });
      }
    } else if (timeline.length >= 2) {
      const p1 = timeline[timeline.length - 2]; const dt1 = Math.max(0.5, last.timestampMs - p1.timestampMs);
      const vx = (last.x - p1.x) / dt1; const vy = (last.y - p1.y) / dt1;
      let ax = 0; let ay = 0;
      if (timeline.length >= 3) {
        const p0 = timeline[timeline.length - 3]; const dt0 = Math.max(0.5, p1.timestampMs - p0.timestampMs);
        ax = ((vx - (p1.x - p0.x) / dt0) / dt1) * 0.35; ay = ((vy - (p1.y - p0.y) / dt0) / dt1) * 0.35;
      }
      const subStep = frameHorizonMs / maxPredicted;
      for (let i = 1; i <= maxPredicted; i += 1) {
        const dt = subStep * i;
        const pos = clampPredictedOffset(last, vx * dt + 0.5 * ax * dt * dt, vy * dt + 0.5 * ay * dt * dt, cornerDampingFactor01, maxPredDist);
        predictedSamples.push({ ...last, x: pos.x, y: pos.y, timestampMs: roundTo(last.timestampMs + dt, 3), isPredicted: true, isResampled: false });
      }
    }
  }
  const estimatedLatencySavedMs = predictedSamples.length > 0 && last ? roundTo(predictedSamples[predictedSamples.length - 1].timestampMs - last.timestampMs, 2) : 0;
  return { committedSamples, predictedSamples, usedNativeCoalesced, usedNativePredicted, effectiveInputHz, estimatedLatencySavedMs, cornerDampingFactor01 };
}

// ⑥ 판 태블릿 1:1 종횡비 잠금(Force Proportions) 좌표 매퍼
export type DigitizerAreaAlignment = "center" | "top-left" | "top-center";
export type DigitizerOrientationDeg = 0 | 90 | 180 | 270;
export interface DigitizerTabletPreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly activeWidthMm: number; readonly activeHeightMm: number;
}
export const DIGITIZER_TABLET_PRESETS: readonly DigitizerTabletPreset[] = [
  { id: "wacom-intuos-pro-m", labelKo: "와콤 인튜어스 프로 M (224×148mm)", labelEn: "Wacom Intuos Pro M (224×148mm)", activeWidthMm: 224, activeHeightMm: 148 },
  { id: "wacom-intuos-pro-l", labelKo: "와콤 인튜어스 프로 L (311×216mm)", labelEn: "Wacom Intuos Pro L (311×216mm)", activeWidthMm: 311, activeHeightMm: 216 },
  { id: "huion-inspiroy-m", labelKo: "휴이온 인스피로이 M (266.7×166.7mm)", labelEn: "Huion Inspiroy M (266.7×166.7mm)", activeWidthMm: 266.7, activeHeightMm: 166.7 },
  { id: "xppen-deco-pro", labelKo: "XP-Pen 데코 프로 (279.4×157.5mm)", labelEn: "XP-Pen Deco Pro (279.4×157.5mm)", activeWidthMm: 279.4, activeHeightMm: 157.5 },
];
export interface DigitizerForceProportionsInput {
  readonly tabletWidthMm: number; readonly tabletHeightMm: number; readonly monitorWidthPx: number; readonly monitorHeightPx: number;
  readonly rawNormX?: number; readonly rawNormY?: number; readonly rawTabletXmm?: number; readonly rawTabletYmm?: number;
  readonly forceProportions: boolean; readonly alignment?: DigitizerAreaAlignment; readonly orientationDeg?: DigitizerOrientationDeg;
}
export interface DigitizerForceProportionsResult {
  readonly mappedX: number; readonly mappedY: number; readonly mappedNormX: number; readonly mappedNormY: number;
  readonly isInsideActiveZone: boolean; readonly pxPerMmX: number; readonly pxPerMmY: number;
  readonly aspectDistortionRatio: number; readonly circleRoundnessPct: number;
  readonly activeAreaMm: { readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number; readonly utilizationPct: number };
  readonly deadZoneMm: { readonly topMm: number; readonly bottomMm: number; readonly leftMm: number; readonly rightMm: number };
}

export function mapDigitizerForceProportions(input: DigitizerForceProportionsInput): DigitizerForceProportionsResult {
  const orientation = input.orientationDeg ?? 0;
  const swapAxes = orientation === 90 || orientation === 270;
  const origW = Math.max(10, finite(input.tabletWidthMm, 224)); const origH = Math.max(10, finite(input.tabletHeightMm, 148));
  const tabletW = swapAxes ? origH : origW; const tabletH = swapAxes ? origW : origH;
  const monitorW = Math.max(100, finite(input.monitorWidthPx, 2560)); const monitorH = Math.max(100, finite(input.monitorHeightPx, 1440));
  const alignment: DigitizerAreaAlignment = input.alignment ?? "center";

  let rawXmm = typeof input.rawTabletXmm === "number" && Number.isFinite(input.rawTabletXmm) ? input.rawTabletXmm : clamp(finite(input.rawNormX, 0.5), 0, 1) * origW;
  let rawYmm = typeof input.rawTabletYmm === "number" && Number.isFinite(input.rawTabletYmm) ? input.rawTabletYmm : clamp(finite(input.rawNormY, 0.5), 0, 1) * origH;
  if (orientation === 180) { rawXmm = origW - rawXmm; rawYmm = origH - rawYmm; }
  else if (orientation === 90) { const nx = rawYmm; rawYmm = origW - rawXmm; rawXmm = nx; }
  else if (orientation === 270) { const nx = origH - rawYmm; rawYmm = rawXmm; rawXmm = nx; }

  let activeW = tabletW; let activeH = tabletH;
  if (input.forceProportions) {
    const targetAspect = monitorW / monitorH;
    if (targetAspect > tabletW / tabletH) activeH = tabletW / targetAspect;
    else activeW = tabletH * targetAspect;
  }
  const offsetX = alignment === "top-left" ? 0 : Math.max(0, tabletW - activeW) * 0.5;
  const offsetY = alignment === "center" ? Math.max(0, tabletH - activeH) * 0.5 : 0;
  const isInsideActiveZone = rawXmm >= offsetX - 1e-6 && rawXmm <= offsetX + activeW + 1e-6 && rawYmm >= offsetY - 1e-6 && rawYmm <= offsetY + activeH + 1e-6;
  const mappedNormX = clamp((rawXmm - offsetX) / activeW, 0, 1); const mappedNormY = clamp((rawYmm - offsetY) / activeH, 0, 1);
  const pxPerMmX = monitorW / activeW; const pxPerMmY = monitorH / activeH;
  const ratio = pxPerMmX / pxPerMmY;
  const aspectDistortionRatio = roundTo(ratio >= 1 ? ratio : 1 / ratio, 4);
  return {
    mappedX: roundTo(mappedNormX * monitorW, 2), mappedY: roundTo(mappedNormY * monitorH, 2),
    mappedNormX: roundTo(mappedNormX, 5), mappedNormY: roundTo(mappedNormY, 5),
    isInsideActiveZone, pxPerMmX: roundTo(pxPerMmX, 4), pxPerMmY: roundTo(pxPerMmY, 4),
    aspectDistortionRatio, circleRoundnessPct: roundTo((1 / aspectDistortionRatio) * 100, 1),
    activeAreaMm: { xMm: roundTo(offsetX, 2), yMm: roundTo(offsetY, 2), widthMm: roundTo(activeW, 2), heightMm: roundTo(activeH, 2), utilizationPct: roundTo(((activeW * activeH) / (tabletW * tabletH)) * 100, 1) },
    deadZoneMm: { topMm: roundTo(offsetY, 2), bottomMm: roundTo(Math.max(0, tabletH - offsetY - activeH), 2), leftMm: roundTo(offsetX, 2), rightMm: roundTo(Math.max(0, tabletW - offsetX - activeW), 2) },
  };
}

// ⑦ 브러시별 독립 필압 커브 맵 & 햅틱 디텐트 트리거
export interface BrushPressureCurveProfile {
  readonly brushId: string; readonly labelKo: string; readonly labelEn: string;
  readonly cp1x: number; readonly cp1y: number; readonly cp2x: number; readonly cp2y: number;
  readonly deadzoneMin: number; readonly saturationMax: number;
  readonly minOutput: number; readonly maxOutput: number; readonly sizeSensitivity: number; readonly opacitySensitivity: number;
}
export type PerBrushPressureCurveMap = Readonly<Record<string, BrushPressureCurveProfile>>;
export const DEFAULT_GLOBAL_PRESSURE_CURVE: BrushPressureCurveProfile = {
  brushId: "global", labelKo: "전역 표준 선형", labelEn: "Global Linear",
  cp1x: 0.33, cp1y: 0.33, cp2x: 0.67, cp2y: 0.67, deadzoneMin: 0.015, saturationMax: 0.98, minOutput: 0.04, maxOutput: 1.0, sizeSensitivity: 0.85, opacitySensitivity: 0.35,
};
export const DEFAULT_BRUSH_PRESSURE_CURVES: PerBrushPressureCurveMap = {
  "g-pen": { brushId: "g-pen", labelKo: "G펜 (강약 S-커브)", labelEn: "G-Pen (Snappy S-Curve)", cp1x: 0.42, cp1y: 0.16, cp2x: 0.58, cp2y: 0.88, deadzoneMin: 0.02, saturationMax: 0.92, minOutput: 0.05, maxOutput: 1.0, sizeSensitivity: 1.0, opacitySensitivity: 0.12 },
  "pencil-6b": { brushId: "pencil-6b", labelKo: "6B 연필 (소프트 음영)", labelEn: "6B Pencil (Soft Shade)", cp1x: 0.2, cp1y: 0.44, cp2x: 0.62, cp2y: 0.78, deadzoneMin: 0.01, saturationMax: 0.96, minOutput: 0.12, maxOutput: 0.96, sizeSensitivity: 0.55, opacitySensitivity: 0.92 },
  "watercolor-wet": { brushId: "watercolor-wet", labelKo: "습식 수채 (저필압 번짐)", labelEn: "Wet Watercolor (Light Bloom)", cp1x: 0.16, cp1y: 0.52, cp2x: 0.52, cp2y: 0.86, deadzoneMin: 0.01, saturationMax: 0.94, minOutput: 0.18, maxOutput: 1.0, sizeSensitivity: 0.72, opacitySensitivity: 0.82 },
  airbrush: { brushId: "airbrush", labelKo: "에어브러시 (완만 지수)", labelEn: "Airbrush (Gentle Exp)", cp1x: 0.58, cp1y: 0.12, cp2x: 0.82, cp2y: 0.56, deadzoneMin: 0.02, saturationMax: 0.99, minOutput: 0.02, maxOutput: 0.92, sizeSensitivity: 0.25, opacitySensitivity: 1.0 },
  "eraser-hard": { brushId: "eraser-hard", labelKo: "하드 지우개 (고감도 제거)", labelEn: "Hard Eraser (Fast Ramp)", cp1x: 0.12, cp1y: 0.68, cp2x: 0.35, cp2y: 0.96, deadzoneMin: 0.01, saturationMax: 0.78, minOutput: 0.35, maxOutput: 1.0, sizeSensitivity: 0.45, opacitySensitivity: 0.95 },
};

export function upsertBrushPressureCurve(
  map: PerBrushPressureCurveMap, brushId: string, patch: Partial<Omit<BrushPressureCurveProfile, "brushId">>,
): PerBrushPressureCurveMap {
  const b = map[brushId] ?? { ...DEFAULT_GLOBAL_PRESSURE_CURVE, brushId };
  return {
    ...map,
    [brushId]: {
      ...b, ...patch, brushId,
      cp1x: clamp(finite(patch.cp1x, b.cp1x), 0.02, 0.98), cp1y: clamp(finite(patch.cp1y, b.cp1y), 0, 1),
      cp2x: clamp(finite(patch.cp2x, b.cp2x), 0.02, 0.98), cp2y: clamp(finite(patch.cp2y, b.cp2y), 0, 1),
      deadzoneMin: clamp(finite(patch.deadzoneMin, b.deadzoneMin), 0, 0.4), saturationMax: clamp(finite(patch.saturationMax, b.saturationMax), 0.5, 1),
      minOutput: clamp(finite(patch.minOutput, b.minOutput), 0, 0.9), maxOutput: clamp(finite(patch.maxOutput, b.maxOutput), 0.1, 1),
    },
  };
}

function solveMonotonicCubicBezierY(xTarget: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number): number {
  const x = clamp(xTarget, 0, 1);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0; let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const t = (lo + hi) * 0.5; const u = 1 - t;
    if (3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) * 0.5; const u = 1 - t;
  return clamp(3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t, 0, 1);
}

export interface PerBrushPressureEvaluation {
  readonly brushId: string; readonly rawPressure: number; readonly mappedPressure: number;
  readonly effectiveSizeMultiplier: number; readonly effectiveOpacityMultiplier: number;
  readonly usedFallbackGlobalCurve: boolean; readonly profile: BrushPressureCurveProfile; readonly curvePreview11: readonly Point2D[];
}
export function evaluatePerBrushPressureCurve(
  brushId: string, rawPressure: number, curveMap: PerBrushPressureCurveMap = DEFAULT_BRUSH_PRESSURE_CURVES,
  options?: { readonly perBrushEnabled?: boolean; readonly globalFallback?: BrushPressureCurveProfile },
): PerBrushPressureEvaluation {
  const specific = (options?.perBrushEnabled ?? true) ? curveMap[brushId] : undefined;
  const profile = specific ?? options?.globalFallback ?? DEFAULT_GLOBAL_PRESSURE_CURVE;
  const evalAt = (p: number): number => {
    const clean = clamp(finite(p, 0), 0, 1);
    if (clean <= profile.deadzoneMin) return 0;
    const norm = clamp((clean - profile.deadzoneMin) / Math.max(0.05, profile.saturationMax - profile.deadzoneMin), 0, 1);
    return roundTo(lerp(profile.minOutput, Math.max(profile.minOutput, profile.maxOutput), solveMonotonicCubicBezierY(norm, profile.cp1x, profile.cp1y, profile.cp2x, profile.cp2y)), 4);
  };
  const cleanRaw = roundTo(clamp(finite(rawPressure, 0), 0, 1), 4);
  const mappedPressure = evalAt(cleanRaw);
  return {
    brushId, rawPressure: cleanRaw, mappedPressure,
    effectiveSizeMultiplier: roundTo(lerp(1 - profile.sizeSensitivity, 1, mappedPressure), 4),
    effectiveOpacityMultiplier: roundTo(lerp(1 - profile.opacitySensitivity, 1, mappedPressure), 4),
    usedFallbackGlobalCurve: !specific, profile,
    curvePreview11: Array.from({ length: 11 }, (_, i) => ({ x: i / 10, y: evalAt(i / 10) })),
  };
}

export interface StylusHapticDetentOptions {
  readonly enabled?: boolean; readonly reducedMotion?: boolean; readonly intensity01?: number;
  readonly timestampMs?: number; readonly lastTriggeredAtMs?: number | null; readonly cooldownMs?: number;
  readonly vibrateFn?: (pattern: number | readonly number[]) => boolean;
}
export interface StylusHapticDetentResult {
  readonly kind: StylusHapticDetentKind; readonly triggered: boolean;
  readonly suppressedReason: "disabled" | "reduced-motion" | "cooldown" | "unsupported-backend" | null;
  readonly patternMs: readonly number[]; readonly intensity01: number;
  readonly backend: "custom-vibrate" | "navigator-vibrate" | "noop-unsupported"; readonly nextCooldownAtMs: number;
}
const HAPTIC_PATTERNS_MS: Record<StylusHapticDetentKind, readonly number[]> = {
  "angle-snap": [8], "squeeze-palette": [10, 18, 12], "tool-switch": [10],
  "slider-detent": [6], "palm-reject-subtle": [4], "boundary-clamp": [14],
};

export function triggerStylusHapticDetent(kind: StylusHapticDetentKind, options: StylusHapticDetentOptions = {}): StylusHapticDetentResult {
  const intensity01 = roundTo(clamp(finite(options.intensity01, 0.8), 0.1, 1), 2);
  const nowMs = finite(options.timestampMs, 0); const cooldownMs = Math.max(0, finite(options.cooldownMs, 35));
  const patternMs = HAPTIC_PATTERNS_MS[kind].map((ms, idx) => (idx % 2 === 0 ? Math.max(3, Math.round(ms * (0.55 + intensity01 * 0.45))) : ms));
  const make = (triggered: boolean, suppressedReason: StylusHapticDetentResult["suppressedReason"], backend: StylusHapticDetentResult["backend"], nextCooldownAtMs: number): StylusHapticDetentResult =>
    ({ kind, triggered, suppressedReason, patternMs, intensity01, backend, nextCooldownAtMs });

  if (!(options.enabled ?? true)) return make(false, "disabled", "noop-unsupported", nowMs);
  if (options.reducedMotion ?? false) return make(false, "reduced-motion", "noop-unsupported", nowMs);
  if (typeof options.lastTriggeredAtMs === "number" && Number.isFinite(options.lastTriggeredAtMs) && nowMs - options.lastTriggeredAtMs < cooldownMs) {
    return make(false, "cooldown", "noop-unsupported", options.lastTriggeredAtMs + cooldownMs);
  }
  if (typeof options.vibrateFn === "function") {
    const ok = Boolean(options.vibrateFn(patternMs));
    return make(ok, ok ? null : "unsupported-backend", "custom-vibrate", nowMs + cooldownMs);
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    const ok = Boolean(navigator.vibrate([...patternMs]));
    return make(ok, ok ? null : "unsupported-backend", "navigator-vibrate", nowMs + cooldownMs);
  }
  return make(false, "unsupported-backend", "noop-unsupported", nowMs + cooldownMs);
}
