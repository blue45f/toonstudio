/**
 * Wave 50: 맥락 반응형 다이내믹 캔버스 워크플로 오케스트레이터.
 *
 * - 현재 레이어 역할(`rough | lineart | flat | shade | lettering`)과 펜 궤적 기하(폐곡선 원형률,
 *   사각 충실도, 교차점 스침, 폐영역 내부 더블탭, 장시간 홀드, 직선성)로 자동 도구 전환·비침투 액션 제안을 산출한다.
 * - 연속 확신도 히스테리시스, 최소 전환 쿨다운, 수동 잠금(`manualLock`), Sacred 82% 뷰포트 예산을 강제한다.
 */

export const SACRED_MIN_CANVAS_VIEWPORT_RATIO = 0.82 as const;
export const MAX_CONTEXT_BAR_HEIGHT_PX = 44 as const;
export const MAX_TOP_LEVEL_MENU_COUNT = 7 as const;
export const MAX_FLOATING_SUGGESTION_CHIP_RATIO = 0.015 as const;

export const DEFAULT_MIN_SUGGESTION_CONFIDENCE = 0.72 as const;
export const DEFAULT_REQUIRED_CONSECUTIVE_HITS = 2 as const;
export const DEFAULT_SWITCH_COOLDOWN_MS = 450 as const;
export const DEFAULT_LONG_HOLD_MS = 340 as const;

export type CanvasLayerRole = "rough" | "lineart" | "flat" | "shade" | "lettering";
export type StudioToolId = "rough_pencil" | "ink_pen" | "intersection_eraser" | "gap_closing_fill" | "straight_ruler" | "balloon_tool" | "cut_frame_knife" | "shading_brush" | "text_editor";
export type ContextReactiveSuggestionKind = "balloon_candidate" | "intersection_erase" | "gap_closing_fill" | "straight_ruler" | "cut_frame";
export type ReactiveDeliveryMode = "auto_tool_switch" | "non_intrusive_suggestion";
export type ContextReactiveDecision = "auto_switched" | "suggested_non_intrusive" | "warming_hysteresis" | "blocked_manual_lock" | "blocked_cooldown" | "blocked_viewport_budget" | "keep_current_tool";

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
  readonly pressure?: number;
}

export interface StrokeGeometryMetrics {
  readonly pointCount: number;
  readonly pathLengthPx: number;
  readonly chordLengthPx: number;
  readonly boundingWidthPx: number;
  readonly boundingHeightPx: number;
  readonly closureGapPx: number;
  readonly isClosedLoop: boolean;
  readonly enclosedAreaPx2: number;
  readonly circularity: number;
  readonly rectangularity: number;
  readonly straightness: number;
  readonly cornerCount: number;
  readonly holdDurationMs: number;
}

export interface ViewportBudgetInput {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly contextBarHeightPx: number;
  readonly sideChromeWidthPx?: number;
  readonly floatingChipWidthPx?: number;
  readonly floatingChipHeightPx?: number;
  readonly visibleMenuCount: number;
}

export interface ViewportBudgetAudit {
  readonly usableCanvasRatio: number;
  readonly floatingChipRatio: number;
  readonly passesSacred82Budget: boolean;
  readonly violationsKo: readonly string[];
}

export interface ContextReactiveSuggestion {
  readonly kind: ContextReactiveSuggestionKind;
  readonly targetTool: StudioToolId;
  readonly deliveryMode: ReactiveDeliveryMode;
  readonly confidence: number;
  readonly labelKo: string;
  readonly detailKo: string;
  readonly recommendedGapClosePx?: number;
}

export interface ToolSwitchHysteresisState {
  readonly pendingKind: ContextReactiveSuggestionKind | null;
  readonly consecutiveCount: number;
  readonly lastSwitchTimestampMs: number | null;
  readonly activeSuggestionKind: ContextReactiveSuggestionKind | null;
  readonly lastCommittedTool: StudioToolId;
}

export interface ToolSwitchHysteresisConfig {
  readonly minConfidence?: number;
  readonly requiredConsecutiveHits?: number;
  readonly cooldownMs?: number;
  readonly longHoldThresholdMs?: number;
}

export interface ContextReactiveCanvasInput {
  readonly layerRole: CanvasLayerRole;
  readonly activeTool: StudioToolId;
  readonly strokePoints: readonly StrokePoint[];
  readonly nowMs: number;
  readonly intersectsExistingLinework?: boolean;
  readonly intersectionGrazeCount?: number;
  readonly isDoubleTapInsideClosedRegion?: boolean;
  readonly closedRegionGapPx?: number;
  readonly longHoldDurationMs?: number;
  readonly manualLock?: boolean;
  readonly viewportChrome?: ViewportBudgetInput;
}

export interface ContextReactiveEvaluationResult {
  readonly decision: ContextReactiveDecision;
  readonly autoSwitched: boolean;
  readonly nextTool: StudioToolId;
  readonly suggestion: ContextReactiveSuggestion | null;
  readonly pendingCandidate: ContextReactiveSuggestion | null;
  readonly geometry: StrokeGeometryMetrics;
  readonly viewportAudit: ViewportBudgetAudit | null;
  readonly nextState: ToolSwitchHysteresisState;
  readonly reasonKo: string;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const dist = (a: StrokePoint, b: StrokePoint): number => Math.hypot(b.x - a.x, b.y - a.y);

/** 펜 궤적 점열에서 폐곡선·원형률·사각 충실도·직선성·꺾임 각도·말단 홀드를 계산한다. */
export function analyzePenStrokeGeometry(
  points: readonly StrokePoint[],
  explicitHoldDurationMs = 0,
): StrokeGeometryMetrics {
  const first = points[0];
  if (!first || points.length < 2) {
    return {
      pointCount: points.length, pathLengthPx: 0, chordLengthPx: 0, boundingWidthPx: 0, boundingHeightPx: 0,
      closureGapPx: 0, isClosedLoop: false, enclosedAreaPx2: 0, circularity: 0, rectangularity: 0,
      straightness: 0, cornerCount: 0, holdDurationMs: Math.max(0, explicitHoldDurationMs),
    };
  }

  let minX = first.x, maxX = first.x, minY = first.y, maxY = first.y, pathLengthPx = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1], curr = points[i];
    if (!prev || !curr) continue;
    pathLengthPx += dist(prev, curr);
    minX = Math.min(minX, curr.x);
    maxX = Math.max(maxX, curr.x);
    minY = Math.min(minY, curr.y);
    maxY = Math.max(maxY, curr.y);
  }

  const last = points[points.length - 1] ?? first;
  const boundingWidthPx = Math.max(0, maxX - minX);
  const boundingHeightPx = Math.max(0, maxY - minY);
  const diagPx = Math.hypot(boundingWidthPx, boundingHeightPx);
  const chordLengthPx = dist(first, last);
  const isClosedLoop = points.length >= 6 && pathLengthPx >= 48 && diagPx >= 24 && chordLengthPx <= Math.max(24, diagPx * 0.28);

  let shoelace = 0;
  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i], next = points[(i + 1) % points.length];
    if (curr && next) shoelace += curr.x * next.y - next.x * curr.y;
  }

  const enclosedAreaPx2 = isClosedLoop ? Math.abs(shoelace) * 0.5 : 0;
  const closedPerimeterPx = pathLengthPx + chordLengthPx;
  const circularity = isClosedLoop && closedPerimeterPx > 0 ? clamp01((4 * Math.PI * enclosedAreaPx2) / (closedPerimeterPx * closedPerimeterPx)) : 0;
  const bboxArea = boundingWidthPx * boundingHeightPx;

  return {
    pointCount: points.length,
    pathLengthPx,
    chordLengthPx,
    boundingWidthPx,
    boundingHeightPx,
    closureGapPx: chordLengthPx,
    isClosedLoop,
    enclosedAreaPx2,
    circularity,
    rectangularity: isClosedLoop && bboxArea > 0 ? clamp01(enclosedAreaPx2 / bboxArea) : 0,
    straightness: computeStraightness(points, first, last, pathLengthPx, chordLengthPx),
    cornerCount: countSharpCorners(points),
    holdDurationMs: Math.max(measureTerminalHoldMs(points, last), Math.max(0, explicitHoldDurationMs)),
  };
}

function computeStraightness(
  points: readonly StrokePoint[],
  first: StrokePoint,
  last: StrokePoint,
  pathLengthPx: number,
  chordLengthPx: number,
): number {
  if (pathLengthPx <= 0 || chordLengthPx <= 0) return 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  let maxPerp = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const area2 = Math.abs(dy * pt.x - dx * pt.y + last.x * first.y - last.y * first.x);
    maxPerp = Math.max(maxPerp, area2 / chordLengthPx);
  }
  return clamp01((chordLengthPx / pathLengthPx) * (1 - clamp01((maxPerp / chordLengthPx) * 4)));
}

function countSharpCorners(points: readonly StrokePoint[]): number {
  const simplified: StrokePoint[] = [];
  const first = points[0];
  if (!first) return 0;
  simplified.push(first);
  for (let i = 1; i < points.length; i += 1) {
    const pt = points[i];
    const prev = simplified[simplified.length - 1];
    if (pt && prev && (dist(prev, pt) >= 12 || i === points.length - 1)) simplified.push(pt);
  }
  let corners = 0;
  for (let i = 1; i < simplified.length - 1; i += 1) {
    const a = simplified[i - 1];
    const b = simplified[i];
    const c = simplified[i + 1];
    if (!a || !b || !c) continue;
    const len1 = Math.hypot(b.x - a.x, b.y - a.y);
    const len2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (len1 < 8 || len2 < 8) continue;
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if ((Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2)))) * 180) / Math.PI >= 55) corners += 1;
  }
  return corners;
}

function measureTerminalHoldMs(points: readonly StrokePoint[], last: StrokePoint): number {
  let holdStartMs = last.timeMs;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const pt = points[i];
    if (!pt || dist(pt, last) > 6) break;
    holdStartMs = pt.timeMs;
  }
  return Math.max(0, last.timeMs - holdStartMs);
}

/** Sacred 82% 캔버스 뷰포트 예산과 상단 바·메뉴·제안 칩 상한을 검증한다. */
export function validateSacredViewportBudget(input: ViewportBudgetInput): ViewportBudgetAudit {
  const totalArea = Math.max(1, input.viewportWidthPx * input.viewportHeightPx);
  const topBarArea = Math.max(0, input.contextBarHeightPx) * input.viewportWidthPx;
  const sideChromeArea =
    Math.max(0, input.sideChromeWidthPx ?? 0) * Math.max(0, input.viewportHeightPx - input.contextBarHeightPx);
  const chipArea =
    Math.max(0, input.floatingChipWidthPx ?? 168) * Math.max(0, input.floatingChipHeightPx ?? 36);

  const usableCanvasRatio = clamp01((totalArea - topBarArea - sideChromeArea - chipArea) / totalArea);
  const floatingChipRatio = clamp01(chipArea / totalArea);
  const violationsKo: string[] = [];

  if (usableCanvasRatio < SACRED_MIN_CANVAS_VIEWPORT_RATIO) {
    violationsKo.push(`캔버스 유효 비율(${(usableCanvasRatio * 100).toFixed(1)}%)이 최소 기준 82.0%보다 낮습니다.`);
  }
  if (input.contextBarHeightPx > MAX_CONTEXT_BAR_HEIGHT_PX) {
    violationsKo.push(`상단 컨텍스트 바 높이(${input.contextBarHeightPx}px)가 상한 ${MAX_CONTEXT_BAR_HEIGHT_PX}px을 초과했습니다.`);
  }
  if (input.visibleMenuCount > MAX_TOP_LEVEL_MENU_COUNT) {
    violationsKo.push(`표시 메뉴 수(${input.visibleMenuCount}개)가 상한 ${MAX_TOP_LEVEL_MENU_COUNT}개를 초과했습니다.`);
  }
  if (floatingChipRatio > MAX_FLOATING_SUGGESTION_CHIP_RATIO) {
    violationsKo.push(`제안 칩 면적 비율(${(floatingChipRatio * 100).toFixed(2)}%)이 비침투 상한 1.50%를 초과했습니다.`);
  }

  return { usableCanvasRatio, floatingChipRatio, passesSacred82Budget: violationsKo.length === 0, violationsKo };
}

/** 히스테리시스 초기 상태를 생성한다. */
export function createInitialHysteresisState(initialTool: StudioToolId = "rough_pencil"): ToolSwitchHysteresisState {
  return { pendingKind: null, consecutiveCount: 0, lastSwitchTimestampMs: null, activeSuggestionKind: null, lastCommittedTool: initialTool };
}

function rankContextCandidates(
  input: ContextReactiveCanvasInput,
  geometry: StrokeGeometryMetrics,
  longHoldThresholdMs: number,
): ContextReactiveSuggestion | null {
  const candidates: ContextReactiveSuggestion[] = [];

  if (input.isDoubleTapInsideClosedRegion) {
    const gapPx = Math.max(0, input.closedRegionGapPx ?? 3);
    candidates.push({
      kind: "gap_closing_fill",
      targetTool: "gap_closing_fill",
      deliveryMode: "auto_tool_switch",
      confidence: clamp01(input.layerRole === "flat" || input.layerRole === "shade" ? 0.94 : 0.78),
      labelKo: "틈새 막힘 스마트 채색",
      detailKo: `닫힌 영역 안 더블탭을 감지해 틈새 ${gapPx}px 보정 채색 도구로 전환합니다.`,
      recommendedGapClosePx: gapPx,
    });
  }

  if (input.intersectsExistingLinework && input.layerRole === "lineart") {
    const grazeCount = Math.max(1, input.intersectionGrazeCount ?? 1);
    candidates.push({
      kind: "intersection_erase",
      targetTool: "intersection_eraser",
      deliveryMode: "auto_tool_switch",
      confidence: clamp01(0.78 + Math.min(0.14, grazeCount * 0.05) + (geometry.pathLengthPx <= 180 ? 0.08 : 0.02)),
      labelKo: "교차점 지우개 전환",
      detailKo: "선화 교차 삐침 스침을 감지해 교차점 지우개로 바로 전환합니다.",
    });
  }

  if (geometry.straightness >= 0.92 && geometry.pathLengthPx >= 40 && geometry.holdDurationMs >= longHoldThresholdMs) {
    const holdBonus = clamp01((geometry.holdDurationMs - longHoldThresholdMs) / 400) * 0.08;
    candidates.push({
      kind: "straight_ruler",
      targetTool: "straight_ruler",
      deliveryMode: "auto_tool_switch",
      confidence: clamp01(0.84 + (geometry.straightness - 0.92) * 1.2 + holdBonus),
      labelKo: "직선 자 스냅 켜기",
      detailKo: "직선 궤적 말단 홀드를 감지해 직선 자 보정을 켭니다.",
    });
  }

  if (geometry.isClosedLoop && (input.layerRole === "rough" || input.layerRole === "lettering") && geometry.circularity >= 0.65 && geometry.cornerCount <= 2) {
    candidates.push({
      kind: "balloon_candidate",
      targetTool: "balloon_tool",
      deliveryMode: "non_intrusive_suggestion",
      confidence: clamp01(0.62 + geometry.circularity * 0.28 + (input.layerRole === "rough" ? 0.1 : 0.08)),
      labelKo: "말풍선으로 바꾸기",
      detailKo: "러프 폐곡선의 둥근 형태를 감지해 비침투 말풍선 변환을 제안합니다.",
    });
  }

  if (geometry.isClosedLoop && (input.layerRole === "rough" || input.layerRole === "lineart") && geometry.rectangularity >= 0.72 && geometry.cornerCount >= 3 && geometry.cornerCount <= 5) {
    const holdBonus = geometry.holdDurationMs >= longHoldThresholdMs ? 0.08 : 0;
    candidates.push({
      kind: "cut_frame",
      targetTool: "cut_frame_knife",
      deliveryMode: "non_intrusive_suggestion",
      confidence: clamp01(0.66 + geometry.rectangularity * 0.22 + holdBonus),
      labelKo: "컷 프레임으로 확정",
      detailKo: "사각 폐곡선 윤곽을 감지해 컷 분할 프레임 생성을 제안합니다.",
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

/** 레이어 맥락과 펜 궤적을 평가해 자동 도구 전환 또는 비침투 액션 제안을 산출한다. */
export function evaluateContextReactiveWorkflow(
  input: ContextReactiveCanvasInput,
  previousState: ToolSwitchHysteresisState = createInitialHysteresisState(input.activeTool),
  config: ToolSwitchHysteresisConfig = {},
): ContextReactiveEvaluationResult {
  const minConfidence = config.minConfidence ?? DEFAULT_MIN_SUGGESTION_CONFIDENCE;
  const requiredHits = Math.max(1, config.requiredConsecutiveHits ?? DEFAULT_REQUIRED_CONSECUTIVE_HITS);
  const cooldownMs = Math.max(0, config.cooldownMs ?? DEFAULT_SWITCH_COOLDOWN_MS);
  const longHoldThresholdMs = Math.max(100, config.longHoldThresholdMs ?? DEFAULT_LONG_HOLD_MS);

  const geometry = analyzePenStrokeGeometry(input.strokePoints, input.longHoldDurationMs ?? 0);
  const viewportAudit = input.viewportChrome ? validateSacredViewportBudget(input.viewportChrome) : null;
  const resetPending: ToolSwitchHysteresisState = { ...previousState, pendingKind: null, consecutiveCount: 0 };

  const holdResult = (
    decision: ContextReactiveDecision,
    pendingCandidate: ContextReactiveSuggestion | null,
    nextState: ToolSwitchHysteresisState,
    reasonKo: string,
  ): ContextReactiveEvaluationResult => ({
    decision,
    autoSwitched: false,
    nextTool: input.activeTool,
    suggestion: null,
    pendingCandidate,
    geometry,
    viewportAudit,
    nextState,
    reasonKo,
  });

  if (input.manualLock) {
    return holdResult("blocked_manual_lock", null, resetPending, "수동 도구 잠금이 켜져 있어 맥락 자동 전환을 차단했습니다.");
  }

  const candidate = rankContextCandidates(input, geometry, longHoldThresholdMs);
  if (!candidate || candidate.confidence < minConfidence) {
    return holdResult("keep_current_tool", candidate, resetPending, "확신도가 기준에 못 미쳐 현재 도구를 유지합니다.");
  }

  if (viewportAudit && !viewportAudit.passesSacred82Budget) {
    return holdResult(
      "blocked_viewport_budget",
      candidate,
      resetPending,
      viewportAudit.violationsKo[0] ?? "82% 캔버스 뷰포트 예산을 지키기 위해 제안 표시를 보류했습니다.",
    );
  }

  const withinCooldown =
    previousState.lastSwitchTimestampMs !== null &&
    input.nowMs - previousState.lastSwitchTimestampMs < cooldownMs &&
    candidate.kind !== previousState.activeSuggestionKind;
  if (withinCooldown) {
    return holdResult(
      "blocked_cooldown",
      candidate,
      { ...previousState, pendingKind: candidate.kind, consecutiveCount: 1 },
      `전환 쿨다운(${cooldownMs}ms) 안이라 갑작스러운 도구 흔들림을 막았습니다.`,
    );
  }

  const nextCount = previousState.pendingKind === candidate.kind ? previousState.consecutiveCount + 1 : 1;
  if (nextCount < requiredHits) {
    return holdResult(
      "warming_hysteresis",
      candidate,
      { ...previousState, pendingKind: candidate.kind, consecutiveCount: nextCount },
      `오작동 방지를 위해 연속 확신도(${nextCount}/${requiredHits})를 확인 중입니다.`,
    );
  }

  const autoSwitched = candidate.deliveryMode === "auto_tool_switch";
  const nextTool = autoSwitched ? candidate.targetTool : input.activeTool;
  return {
    decision: autoSwitched ? "auto_switched" : "suggested_non_intrusive",
    autoSwitched,
    nextTool,
    suggestion: candidate,
    pendingCandidate: null,
    geometry,
    viewportAudit,
    nextState: {
      pendingKind: candidate.kind,
      consecutiveCount: nextCount,
      lastSwitchTimestampMs: input.nowMs,
      activeSuggestionKind: candidate.kind,
      lastCommittedTool: nextTool,
    },
    reasonKo: candidate.detailKo,
  };
}
