/**
 * 창작 부하 적응형 미니멀 UI 및 브러시 응답 최적화 컨트롤러 (Wave 70).
 *
 * 의료·생체·뇌파 진단을 일절 수행하지 않으며(`isMedicalOrBiometric: false`),
 * 오직 스튜디오 내 관찰 가능한 인터랙션 텔레메트리(획 빈도, Undo 버스트, 도구 전환,
 * 포인터 미세 떨림, 뷰포트 확대율, 유휴 시간)만으로 작업 집중 국면을 판정한다.
 *
 * 불변식:
 * 1. 캔버스 뷰포트 점유율 `>= 0.82` (82% 이상) 상시 유지
 * 2. 핵심 노출 컨트롤 수 `5..9`개 예산 엄수
 * 3. 모든 인터랙션 컨트롤 터치/펜 타깃 `>= 44x44px` 보장
 */

export type CreatorFocusRegime =
  | "deep-inking"
  | "exploratory-sketch"
  | "color-blocking"
  | "high-friction-correction"
  | "idle-review";

export type StudioToolFamily =
  | "ink-pen"
  | "pencil-sketch"
  | "fill-bucket"
  | "flat-brush"
  | "eraser"
  | "select-transform"
  | "pan-review";

export type AuxiliaryPanelId =
  | "layer-dock"
  | "color-palette"
  | "brush-inspector"
  | "navigator-preview"
  | "history-strip"
  | "reference-board";

export type PanelDisplayMode = "expanded" | "collapsed-rail" | "hidden";

export interface CreatorInteractionTelemetry {
  /** 비의료 창작 텔레메트리 전용 범위 표식. */
  readonly telemetryScope: "creator-interaction-only";
  /** 의료·생체 신호 미사용 불변 계약. */
  readonly isMedicalOrBiometric: false;
  /** 관측 창 길이(초). */
  readonly windowSeconds: number;
  /** 분당 획 수. */
  readonly strokeRatePerMin: number;
  /** 평균 획 지속 시간(ms). */
  readonly meanStrokeDurationMs: number;
  /** 관측 창 내 연속/누적 되돌리기(Undo) 버스트 횟수. */
  readonly undoBurstCount: number;
  /** 분당 도구 전환 횟수. */
  readonly toolSwitchRatePerMin: number;
  /** 스무딩 기준 경로 대비 포인터 미세 떨림 편차(px). */
  readonly pointerJitterPx: number;
  /** 현재 캔버스 확대 배율(0.1 ~ 32.0). */
  readonly viewportZoom: number;
  /** 마지막 포인터/키 입력 이후 유휴 시간(ms). */
  readonly idleDurationMs: number;
  readonly activeToolFamily: StudioToolFamily;
}

export interface StudioViewportContext {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly reducedMotionPreferred?: boolean;
  /** 작가가 명시적으로 고정한 보조 패널(캔버스 82% 불변식이 허용하는 한 우선 유지). */
  readonly manualPinnedPanels?: readonly AuxiliaryPanelId[];
}

export interface AdaptiveFocusOptions {
  /** 직전 상태가 주어지면 경계 진동을 막기 위한 히스테리시스를 적용한다. */
  readonly previousDecision?: AdaptiveStudioFocusDecision;
}

export interface AuxiliaryPanelState {
  readonly panelId: AuxiliaryPanelId;
  readonly labelKo: string;
  readonly mode: PanelDisplayMode;
  readonly occupiedWidthPx: number;
  readonly occupiedHeightPx: number;
  readonly pinnedByArtist: boolean;
}

export interface AdaptiveUiControlSpec {
  readonly controlId: string;
  readonly labelKo: string;
  readonly hitWidthPx: number;
  readonly hitHeightPx: number;
  readonly primary: boolean;
}

export interface AdaptiveBrushResponseProfile {
  /** 손떨림 보정 강도 [0.05..0.92]. */
  readonly stabilizationStrength: number;
  /** 1-Euro 필터 최소 컷오프 주파수(Hz). 낮을수록 미세 떨림 억제 강함. */
  readonly oneEuroMinCutoffHz: number;
  /** 1-Euro 필터 속도 감응 계수 beta. 높을수록 빠른 획 지연 감소. */
  readonly oneEuroBeta: number;
  /** 포인터 예측 리드타임(ms). `reducedMotionPreferred` 또는 검토 국면에서는 0ms. */
  readonly predictionLeadTimeMs: number;
  /** 이동 평균 보조 샘플 창 크기 [1..12]. */
  readonly smoothingWindowSamples: number;
}

export interface AdaptiveStudioFocusDecision {
  readonly telemetryScope: "creator-interaction-only";
  readonly isMedicalOrBiometric: false;
  readonly regime: CreatorFocusRegime;
  readonly regimeLabelKo: string;
  readonly regimeConfidence: number;
  readonly hysteresisHeld: boolean;
  readonly workloadIndex: number;
  readonly undoToStrokeRatio: number;
  readonly topContextBarHeightPx: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly canvasViewportRatio: number;
  readonly auxiliaryPanels: readonly AuxiliaryPanelState[];
  readonly visibleCoreControls: readonly AdaptiveUiControlSpec[];
  readonly overflowControlCount: number;
  readonly brushResponse: AdaptiveBrushResponseProfile;
  readonly calmGuidanceKo: string;
}

export const MIN_CANVAS_VIEWPORT_RATIO = 0.82;
export const TOP_CONTEXT_BAR_HEIGHT_PX = 44;
export const MIN_CORE_VISIBLE_CONTROLS = 5;
export const MAX_CORE_VISIBLE_CONTROLS = 9;
export const MIN_TOUCH_TARGET_PX = 44;

interface PanelGeometrySpec {
  readonly panelId: AuxiliaryPanelId;
  readonly labelKo: string;
  readonly side: "left" | "right" | "bottom";
  readonly expandedSizePx: number;
  readonly collapsedRailSizePx: number;
}

const PANEL_SPECS: readonly PanelGeometrySpec[] = [
  {
    panelId: "layer-dock",
    labelKo: "레이어",
    side: "right",
    expandedSizePx: 148,
    collapsedRailSizePx: 44,
  },
  {
    panelId: "color-palette",
    labelKo: "색상 팔레트",
    side: "left",
    expandedSizePx: 136,
    collapsedRailSizePx: 44,
  },
  {
    panelId: "brush-inspector",
    labelKo: "브러시 세부",
    side: "left",
    expandedSizePx: 144,
    collapsedRailSizePx: 44,
  },
  {
    panelId: "navigator-preview",
    labelKo: "전체 미리보기",
    side: "right",
    expandedSizePx: 132,
    collapsedRailSizePx: 44,
  },
  {
    panelId: "history-strip",
    labelKo: "작업 기록",
    side: "bottom",
    expandedSizePx: 52,
    collapsedRailSizePx: 0,
  },
  {
    panelId: "reference-board",
    labelKo: "참고 시트",
    side: "right",
    expandedSizePx: 144,
    collapsedRailSizePx: 44,
  },
];

const REGIME_LABELS_KO: Readonly<Record<CreatorFocusRegime, string>> = {
  "deep-inking": "정밀 선화 집중",
  "exploratory-sketch": "러프 스케치 탐색",
  "color-blocking": "채색·밑색 블록",
  "high-friction-correction": "반복 수정 안정화",
  "idle-review": "전체 검토 대기",
};

const REGIME_GUIDANCE_KO: Readonly<Record<CreatorFocusRegime, string>> = {
  "deep-inking": "선화 작업에 맞춰 보조 패널을 접고 손떨림 보정을 안정화했습니다.",
  "exploratory-sketch": "빠른 스케치 반응성을 높이고 캔버스 여백을 넓혔습니다.",
  "color-blocking": "밑색과 레이어 전환을 유지하면서 캔버스 시야를 확보했습니다.",
  "high-friction-correction": "되돌리기와 흔들림이 늘어 보정 강도를 높이고 불필요한 패널을 줄였습니다.",
  "idle-review": "전체 컷 흐름과 레이어를 살펴볼 수 있도록 검토 구성을 열었습니다.",
};

const CORE_CONTROL_CATALOG: Readonly<Record<string, AdaptiveUiControlSpec>> = {
  brush: { controlId: "brush", labelKo: "펜", hitWidthPx: 44, hitHeightPx: 44, primary: true },
  eraser: { controlId: "eraser", labelKo: "지우개", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  undo: { controlId: "undo", labelKo: "되돌리기", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  redo: { controlId: "redo", labelKo: "다시 실행", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  color: { controlId: "color", labelKo: "색상", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  layers: { controlId: "layers", labelKo: "레이어", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  stabilizer: { controlId: "stabilizer", labelKo: "보정", hitWidthPx: 48, hitHeightPx: 44, primary: false },
  fitView: { controlId: "fitView", labelKo: "화면 맞춤", hitWidthPx: 48, hitHeightPx: 44, primary: false },
  togglePanels: { controlId: "togglePanels", labelKo: "패널", hitWidthPx: 44, hitHeightPx: 44, primary: false },
  fill: { controlId: "fill", labelKo: "채우기", hitWidthPx: 44, hitHeightPx: 44, primary: true },
};

const TOTAL_STUDIO_MENU_ACTIONS = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} 값은 0 이상의 유한 실수여야 합니다.`);
  }
}

function validateInputs(
  telemetry: CreatorInteractionTelemetry,
  viewport: StudioViewportContext,
): void {
  if (telemetry.telemetryScope !== "creator-interaction-only" || telemetry.isMedicalOrBiometric !== false) {
    throw new Error(
      "이 컨트롤러는 비의료 창작 인터랙션 텔레메트리만 허용합니다(isMedicalOrBiometric: false 필수).",
    );
  }
  if (!Number.isFinite(telemetry.windowSeconds) || telemetry.windowSeconds <= 0) {
    throw new Error("telemetry.windowSeconds는 0보다 큰 유한 실수여야 합니다.");
  }
  assertFiniteNonNegative(telemetry.strokeRatePerMin, "telemetry.strokeRatePerMin");
  assertFiniteNonNegative(telemetry.meanStrokeDurationMs, "telemetry.meanStrokeDurationMs");
  assertFiniteNonNegative(telemetry.undoBurstCount, "telemetry.undoBurstCount");
  assertFiniteNonNegative(telemetry.toolSwitchRatePerMin, "telemetry.toolSwitchRatePerMin");
  assertFiniteNonNegative(telemetry.pointerJitterPx, "telemetry.pointerJitterPx");
  assertFiniteNonNegative(telemetry.idleDurationMs, "telemetry.idleDurationMs");
  if (!Number.isFinite(telemetry.viewportZoom) || telemetry.viewportZoom < 0.1 || telemetry.viewportZoom > 64) {
    throw new Error("telemetry.viewportZoom은 0.1..64 범위여야 합니다.");
  }
  if (!Number.isFinite(viewport.viewportWidthPx) || viewport.viewportWidthPx < 320) {
    throw new Error("viewport.viewportWidthPx는 320px 이상이어야 합니다.");
  }
  if (!Number.isFinite(viewport.viewportHeightPx) || viewport.viewportHeightPx < 320) {
    throw new Error("viewport.viewportHeightPx는 320px 이상이어야 합니다.");
  }
}

function scoreFocusRegimes(
  t: CreatorInteractionTelemetry,
  undoToStrokeRatio: number,
): Record<CreatorFocusRegime, number> {
  const idleScore =
    (t.idleDurationMs >= 8000 ? 0.85 : clamp(t.idleDurationMs / 10000, 0, 0.45)) +
    (t.activeToolFamily === "pan-review" ? 0.35 : 0) +
    (t.strokeRatePerMin <= 2 ? 0.2 : 0);

  const highFrictionScore =
    (t.undoBurstCount >= 5 ? 0.65 : clamp(t.undoBurstCount / 8, 0, 0.45)) +
    (undoToStrokeRatio >= 0.45 ? 0.45 : clamp(undoToStrokeRatio, 0, 0.35)) +
    (t.pointerJitterPx >= 2.6 ? 0.45 : clamp(t.pointerJitterPx / 6, 0, 0.25)) +
    (t.toolSwitchRatePerMin >= 14 ? 0.25 : 0) +
    (t.activeToolFamily === "eraser" && t.undoBurstCount >= 3 ? 0.25 : 0);

  const deepInkingScore =
    (t.activeToolFamily === "ink-pen" ? 0.55 : 0) +
    (t.viewportZoom >= 1.6 ? 0.38 : clamp((t.viewportZoom - 1) * 0.3, 0, 0.2)) +
    (t.meanStrokeDurationMs >= 320 && t.strokeRatePerMin >= 4 ? 0.22 : 0) +
    (t.toolSwitchRatePerMin <= 5 ? 0.18 : 0) -
    (undoToStrokeRatio >= 0.45 ? 0.35 : 0);

  const exploratorySketchScore =
    (t.activeToolFamily === "pencil-sketch" ? 0.55 : 0) +
    (t.strokeRatePerMin >= 22 ? 0.35 : clamp(t.strokeRatePerMin / 60, 0, 0.25)) +
    (t.viewportZoom >= 0.5 && t.viewportZoom <= 1.65 ? 0.22 : 0) +
    (t.meanStrokeDurationMs > 0 && t.meanStrokeDurationMs <= 360 ? 0.18 : 0);

  const colorBlockingScore =
    (t.activeToolFamily === "fill-bucket" || t.activeToolFamily === "flat-brush" ? 0.68 : 0) +
    (t.toolSwitchRatePerMin >= 4 && t.toolSwitchRatePerMin <= 14 ? 0.18 : 0) +
    (t.viewportZoom >= 0.6 && t.viewportZoom <= 2.2 ? 0.14 : 0);

  return {
    "deep-inking": Math.max(0, deepInkingScore),
    "exploratory-sketch": Math.max(0, exploratorySketchScore),
    "color-blocking": Math.max(0, colorBlockingScore),
    "high-friction-correction": Math.max(0, highFrictionScore),
    "idle-review": Math.max(0, idleScore),
  };
}

function pickInitialPanelModes(
  regime: CreatorFocusRegime,
  pinnedSet: ReadonlySet<AuxiliaryPanelId>,
): Map<AuxiliaryPanelId, PanelDisplayMode> {
  const desired = new Map<AuxiliaryPanelId, PanelDisplayMode>();
  for (const spec of PANEL_SPECS) {
    desired.set(spec.panelId, "hidden");
  }

  switch (regime) {
    case "deep-inking":
      desired.set("layer-dock", "collapsed-rail");
      desired.set("brush-inspector", "hidden");
      desired.set("color-palette", "hidden");
      break;
    case "exploratory-sketch":
      desired.set("layer-dock", "collapsed-rail");
      desired.set("reference-board", "collapsed-rail");
      break;
    case "color-blocking":
      desired.set("color-palette", "expanded");
      desired.set("layer-dock", "collapsed-rail");
      break;
    case "high-friction-correction":
      desired.set("layer-dock", "hidden");
      desired.set("brush-inspector", "collapsed-rail");
      break;
    case "idle-review":
      desired.set("layer-dock", "expanded");
      desired.set("navigator-preview", "collapsed-rail");
      desired.set("history-strip", "expanded");
      break;
  }

  pinnedSet.forEach((panelId) => {
    if (desired.has(panelId)) {
      desired.set(panelId, "expanded");
    }
  });

  return desired;
}

function measureCanvasGeometry(
  viewportWidthPx: number,
  viewportHeightPx: number,
  modes: ReadonlyMap<AuxiliaryPanelId, PanelDisplayMode>,
  pinnedSet: ReadonlySet<AuxiliaryPanelId>,
): {
  canvasWidthPx: number;
  canvasHeightPx: number;
  canvasViewportRatio: number;
  panels: AuxiliaryPanelState[];
} {
  let leftWidth = 0;
  let rightWidth = 0;
  let bottomHeight = 0;
  const panels: AuxiliaryPanelState[] = [];

  for (const spec of PANEL_SPECS) {
    const mode = modes.get(spec.panelId) ?? "hidden";
    const size =
      mode === "expanded"
        ? spec.expandedSizePx
        : mode === "collapsed-rail"
          ? spec.collapsedRailSizePx
          : 0;
    let occupiedWidthPx = 0;
    let occupiedHeightPx = 0;
    if (spec.side === "left") {
      occupiedWidthPx = size;
      leftWidth = Math.max(leftWidth, size);
    } else if (spec.side === "right") {
      occupiedWidthPx = size;
      rightWidth = Math.max(rightWidth, size);
    } else {
      occupiedHeightPx = size;
      bottomHeight += size;
    }
    panels.push({
      panelId: spec.panelId,
      labelKo: spec.labelKo,
      mode,
      occupiedWidthPx,
      occupiedHeightPx,
      pinnedByArtist: pinnedSet.has(spec.panelId),
    });
  }

  const canvasWidthPx = Math.max(0, viewportWidthPx - leftWidth - rightWidth);
  const canvasHeightPx = Math.max(0, viewportHeightPx - TOP_CONTEXT_BAR_HEIGHT_PX - bottomHeight);
  const totalArea = viewportWidthPx * viewportHeightPx;
  const canvasViewportRatio = totalArea > 0 ? (canvasWidthPx * canvasHeightPx) / totalArea : 0;

  return { canvasWidthPx, canvasHeightPx, canvasViewportRatio, panels };
}

function enforceCanvasViewportBudget(
  viewportWidthPx: number,
  viewportHeightPx: number,
  modes: Map<AuxiliaryPanelId, PanelDisplayMode>,
  pinnedSet: ReadonlySet<AuxiliaryPanelId>,
): {
  canvasWidthPx: number;
  canvasHeightPx: number;
  canvasViewportRatio: number;
  panels: AuxiliaryPanelState[];
} {
  // 비고정 패널을 우선 축소·숨김하고, 그래도 82% 미만이면 고정 패널까지 단계적으로 접어 불변식을 지킨다.
  const collapseOrder: AuxiliaryPanelId[] = [
    "reference-board",
    "history-strip",
    "navigator-preview",
    "brush-inspector",
    "color-palette",
    "layer-dock",
  ];
  const orderedUnpinned = collapseOrder.filter((id) => !pinnedSet.has(id));
  const orderedPinned = collapseOrder.filter((id) => pinnedSet.has(id));
  const fullOrder = [...orderedUnpinned, ...orderedPinned];

  let geometry = measureCanvasGeometry(viewportWidthPx, viewportHeightPx, modes, pinnedSet);
  if (geometry.canvasViewportRatio >= MIN_CANVAS_VIEWPORT_RATIO) return geometry;

  // 1단계: expanded -> collapsed-rail (bottom 패널은 바로 hidden)
  for (const panelId of fullOrder) {
    if (geometry.canvasViewportRatio >= MIN_CANVAS_VIEWPORT_RATIO) return geometry;
    if (modes.get(panelId) === "expanded") {
      const spec = PANEL_SPECS.find((s) => s.panelId === panelId);
      modes.set(panelId, spec && spec.collapsedRailSizePx > 0 ? "collapsed-rail" : "hidden");
      geometry = measureCanvasGeometry(viewportWidthPx, viewportHeightPx, modes, pinnedSet);
    }
  }

  // 2단계: collapsed-rail -> hidden
  for (const panelId of fullOrder) {
    if (geometry.canvasViewportRatio >= MIN_CANVAS_VIEWPORT_RATIO) return geometry;
    if (modes.get(panelId) !== "hidden") {
      modes.set(panelId, "hidden");
      geometry = measureCanvasGeometry(viewportWidthPx, viewportHeightPx, modes, pinnedSet);
    }
  }

  return geometry;
}

function selectCoreControls(
  regime: CreatorFocusRegime,
  viewportWidthPx: number,
): readonly AdaptiveUiControlSpec[] {
  let ids: string[];
  switch (regime) {
    case "deep-inking":
      ids = ["brush", "eraser", "undo", "redo", "stabilizer", "layers"];
      break;
    case "exploratory-sketch":
      ids = ["brush", "eraser", "undo", "redo", "fitView", "layers", "togglePanels"];
      break;
    case "color-blocking":
      ids = ["fill", "brush", "color", "layers", "undo", "redo", "togglePanels"];
      break;
    case "high-friction-correction":
      ids = ["brush", "eraser", "undo", "redo", "stabilizer"];
      break;
    case "idle-review":
      ids = ["fitView", "layers", "undo", "redo", "brush", "color", "togglePanels"];
      break;
  }

  // 좁은 화면(예: 360px 모바일)에서도 5..9개 예산과 44px 터치 타깃을 동시에 지킨다.
  const maxFittingByWidth = Math.max(
    MIN_CORE_VISIBLE_CONTROLS,
    Math.min(MAX_CORE_VISIBLE_CONTROLS, Math.floor((viewportWidthPx - 24) / MIN_TOUCH_TARGET_PX)),
  );
  const clampedIds = ids.slice(0, maxFittingByWidth);
  while (clampedIds.length < MIN_CORE_VISIBLE_CONTROLS) {
    clampedIds.push("togglePanels");
  }

  return clampedIds
    .map((id) => CORE_CONTROL_CATALOG[id])
    .filter((item): item is AdaptiveUiControlSpec => item !== undefined);
}

function computeBrushResponse(
  regime: CreatorFocusRegime,
  telemetry: CreatorInteractionTelemetry,
  reducedMotionPreferred: boolean,
): AdaptiveBrushResponseProfile {
  const jitterFactor = clamp(telemetry.pointerJitterPx / 4.0, 0, 1);
  const zoomBoost = clamp((telemetry.viewportZoom - 1.0) * 0.06, 0, 0.14);

  let baseStabilization: number;
  let baseLeadMs: number;
  switch (regime) {
    case "deep-inking":
      baseStabilization = 0.48 + jitterFactor * 0.28 + zoomBoost;
      baseLeadMs = 8.5 - jitterFactor * 3.5;
      break;
    case "exploratory-sketch":
      baseStabilization = 0.18 + jitterFactor * 0.22;
      baseLeadMs = 13.0 - jitterFactor * 3.0;
      break;
    case "color-blocking":
      baseStabilization = 0.14 + jitterFactor * 0.18;
      baseLeadMs = 5.5 - jitterFactor * 2.0;
      break;
    case "high-friction-correction":
      baseStabilization = 0.62 + jitterFactor * 0.26 + zoomBoost * 0.5;
      baseLeadMs = 3.0 - jitterFactor * 1.5;
      break;
    case "idle-review":
      baseStabilization = 0.15;
      baseLeadMs = 0;
      break;
  }

  const stabilizationStrength = Number(clamp(baseStabilization, 0.05, 0.92).toFixed(4));
  const predictionLeadTimeMs = reducedMotionPreferred
    ? 0
    : Number(clamp(baseLeadMs, 0, 18).toFixed(2));
  const oneEuroMinCutoffHz = Number((4.2 - stabilizationStrength * 3.4).toFixed(3));
  const oneEuroBeta = Number((0.06 - stabilizationStrength * 0.048).toFixed(4));
  const smoothingWindowSamples = Math.max(1, Math.min(12, Math.round(1 + stabilizationStrength * 10)));

  return {
    stabilizationStrength,
    oneEuroMinCutoffHz,
    oneEuroBeta,
    predictionLeadTimeMs,
    smoothingWindowSamples,
  };
}

/**
 * 창작 인터랙션 텔레메트리를 평가해 집중 국면, 미니멀 UI 레이아웃, 브러시 보정 프로파일을 산출한다.
 */
export function evaluateAdaptiveStudioFocusState(
  telemetry: CreatorInteractionTelemetry,
  viewport: StudioViewportContext,
  options: AdaptiveFocusOptions = {},
): AdaptiveStudioFocusDecision {
  validateInputs(telemetry, viewport);

  const strokesInWindow = (telemetry.strokeRatePerMin * telemetry.windowSeconds) / 60;
  const undoToStrokeRatio = Number(
    clamp(telemetry.undoBurstCount / Math.max(1, strokesInWindow), 0, 4).toFixed(4),
  );

  const scores = scoreFocusRegimes(telemetry, undoToStrokeRatio);
  const regimes: CreatorFocusRegime[] = [
    "high-friction-correction",
    "idle-review",
    "deep-inking",
    "color-blocking",
    "exploratory-sketch",
  ];

  let topRegime: CreatorFocusRegime = "exploratory-sketch";
  let topScore = -1;
  let totalScore = 0;
  for (const r of regimes) {
    const s = scores[r];
    totalScore += s;
    if (s > topScore) {
      topScore = s;
      topRegime = r;
    }
  }

  let selectedRegime = topRegime;
  let hysteresisHeld = false;
  const prev = options.previousDecision;
  if (prev && prev.regime !== topRegime) {
    const prevScore = scores[prev.regime];
    const emergencyOverride =
      topRegime === "idle-review" ||
      (topRegime === "high-friction-correction" && telemetry.undoBurstCount >= 6);
    if (!emergencyOverride && topScore - prevScore < 0.14) {
      selectedRegime = prev.regime;
      hysteresisHeld = true;
    }
  }

  const regimeConfidence = Number(
    clamp(totalScore > 0 ? scores[selectedRegime] / totalScore : 0.5, 0, 1).toFixed(4),
  );
  const workloadIndex = Number(
    clamp(
      0.32 * clamp(telemetry.strokeRatePerMin / 45, 0, 1) +
        0.3 * clamp(undoToStrokeRatio / 0.8, 0, 1) +
        0.22 * clamp(telemetry.pointerJitterPx / 4.0, 0, 1) +
        0.16 * clamp(telemetry.toolSwitchRatePerMin / 18, 0, 1),
      0,
      1,
    ).toFixed(4),
  );

  const pinnedSet = new Set<AuxiliaryPanelId>(viewport.manualPinnedPanels ?? []);
  const panelModes = pickInitialPanelModes(selectedRegime, pinnedSet);
  const geometry = enforceCanvasViewportBudget(
    viewport.viewportWidthPx,
    viewport.viewportHeightPx,
    panelModes,
    pinnedSet,
  );

  const visibleCoreControls = selectCoreControls(selectedRegime, viewport.viewportWidthPx);
  const brushResponse = computeBrushResponse(
    selectedRegime,
    telemetry,
    viewport.reducedMotionPreferred ?? false,
  );

  return {
    telemetryScope: "creator-interaction-only",
    isMedicalOrBiometric: false,
    regime: selectedRegime,
    regimeLabelKo: REGIME_LABELS_KO[selectedRegime],
    regimeConfidence,
    hysteresisHeld,
    workloadIndex,
    undoToStrokeRatio,
    topContextBarHeightPx: TOP_CONTEXT_BAR_HEIGHT_PX,
    canvasWidthPx: geometry.canvasWidthPx,
    canvasHeightPx: geometry.canvasHeightPx,
    canvasViewportRatio: Number(geometry.canvasViewportRatio.toFixed(4)),
    auxiliaryPanels: geometry.panels,
    visibleCoreControls,
    overflowControlCount: Math.max(0, TOTAL_STUDIO_MENU_ACTIONS - visibleCoreControls.length),
    brushResponse,
    calmGuidanceKo: REGIME_GUIDANCE_KO[selectedRegime],
  };
}
