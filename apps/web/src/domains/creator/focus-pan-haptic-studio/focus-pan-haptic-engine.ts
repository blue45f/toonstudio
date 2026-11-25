/**
 * Wave 49F — 집중 몰입 세션 · 포커스 자동 패닝 & 펜촉 햅틱 프로파일러 엔진.
 *
 * - 비의료·비진단·100% 로컬 캔버스 입력 패턴 전용 작업 리듬 코치 (evaluateWorkRhythmSession)
 * - 200~600% 확대 작화 외곽 데드존 기반 감쇠 자동 패닝 추종기 (computeFocusAutoPanDelta)
 * - 4종 펜촉(켄트지 G펜 · 한지 먹붓 · 마커지 알코올 마커 · 황목지 4B 연필) 햅틱·마찰음 프로파일러
 * - 비파괴 프리셋 적용/원복 상태 머신 및 프로파일 JSON 내보내기 (exportFocusHapticProfileJson)
 * - 탈-바이올렛 OKLCH 전용(270~320도 0%), 원시 hex/rgb/hsl·스토리지·BigInt 0건
 */

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const LOCAL_NON_MEDICAL_NOTICE_KO = "로컬 입력 패턴 전용 · 의료 진단 아님";
export const LOCAL_NON_MEDICAL_NOTICE_EN = "Local Input Pattern Only · Not Medical Advice";

export const FOCUS_PAN_MIN_DAMPING = 0.12;
export const FOCUS_PAN_MAX_DAMPING = 0.45;
export const FOCUS_PAN_DEFAULT_DAMPING = 0.24;
export const FOCUS_PAN_MIN_DEADZONE = 0.08;
export const FOCUS_PAN_MAX_DEADZONE = 0.3;
export const FOCUS_PAN_DEFAULT_DEADZONE = 0.18;
export const FOCUS_PAN_MIN_ZOOM = 200;
export const FOCUS_PAN_MAX_ZOOM = 600;
export const FOCUS_PAN_DEFAULT_MAX_STEP_PX = 42;

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number }

export type WorkRhythmState = "flow" | "steady" | "drift-check";
export type WorkRhythmPresetId = "deep-ink-flow" | "steady-storyboard" | "long-detail-drift";

export interface WorkRhythmInput {
  readonly continuousMinutes: number; readonly undoPerMinute: number;
  readonly strokeCadencePerMin: number; readonly zoomLevel: number;
}

export interface WorkRhythmPresetMeta {
  readonly id: WorkRhythmPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string; readonly input: WorkRhythmInput;
}

export interface WorkRhythmEnvironmentAdjustment {
  readonly uiChromeOpacity: number; readonly ambienceGainDb: number;
  readonly wristStretchReminderMinutes: number | null; readonly dimPeripheralChrome: boolean;
  readonly suggestionsKo: readonly string[]; readonly suggestionsEn: readonly string[];
}

export interface WorkRhythmEvaluation {
  readonly state: WorkRhythmState; readonly labelKo: string; readonly labelEn: string;
  readonly accentOklch: OklchColor; readonly rhythmStabilityScore: number; readonly inputLoadIndex: number;
  readonly clampedInput: WorkRhythmInput; readonly observedSignalsKo: readonly string[];
  readonly observedSignalsEn: readonly string[]; readonly adjustment: WorkRhythmEnvironmentAdjustment;
  readonly processingScope: "local-input-only"; readonly nonMedicalNoticeKo: string; readonly nonMedicalNoticeEn: string;
}

export type FocusAutoPanEdge = "left" | "right" | "top" | "bottom";
export type FocusAutoPanReason =
  | "active-edge-pan" | "reduced-motion-guard" | "disabled" | "below-zoom-threshold" | "inside-safe-zone";

export interface FocusAutoPanConfig {
  readonly enabled: boolean; readonly edgeDeadzoneRatio: number; readonly damping: number;
  readonly minZoomPercent: number; readonly maxZoomPercent: number; readonly maxPanStepPx: number;
  readonly prefersReducedMotion: boolean;
}

export interface FocusAutoPanSample {
  readonly cursorNormX: number; readonly cursorNormY: number; readonly velocityX: number; readonly velocityY: number;
  readonly zoomLevel: number; readonly viewportWidth?: number; readonly viewportHeight?: number;
  readonly previousDeltaX?: number; readonly previousDeltaY?: number;
}

export interface FocusAutoPanResult {
  readonly active: boolean; readonly reason: FocusAutoPanReason;
  readonly panDeltaX: number; readonly panDeltaY: number; readonly magnitudePx: number;
  readonly edgePenetrationX: number; readonly edgePenetrationY: number;
  readonly effectiveDamping: number; readonly effectiveDeadzoneRatio: number;
  readonly triggeredEdges: readonly FocusAutoPanEdge[];
}

export interface FocusAutoPanTrajectoryPoint {
  readonly frame: number; readonly deltaX: number; readonly deltaY: number;
  readonly cumulativeX: number; readonly cumulativeY: number;
}

export type FocusCursorPresetId = "safe-center" | "right-bottom-edge" | "left-top-edge" | "right-edge-fast";
export interface FocusCursorPreset {
  readonly id: FocusCursorPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly cursorNormX: number; readonly cursorNormY: number; readonly velocityX: number; readonly velocityY: number;
}

export type NibHapticProfileId = "kent-gpen" | "hanji-brush" | "marker-smooth" | "coldpress-pencil";
export interface NibHapticProfileSpec {
  readonly id: NibHapticProfileId; readonly nameKo: string; readonly nameEn: string;
  readonly paperKo: string; readonly paperEn: string; readonly nibKo: string; readonly nibEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly accentOklch: OklchColor;
  readonly baseVibrationHz: number; readonly maxVibrationHz: number; readonly paperRoughness: number;
  readonly tipCompliance: number; readonly bandpassBaseHz: number; readonly bandpassMaxHz: number;
  readonly bandpassQ: number; readonly harmonicRatio: number; readonly basePulseCadenceMs: readonly number[];
}

export interface NibStrokeInput {
  readonly pressure: number; readonly speedPxPerSec: number; readonly tiltDeg?: number;
}

export interface NibHapticOptions {
  readonly masterIntensity?: number; readonly audioFrictionEnabled?: boolean; readonly prefersReducedMotion?: boolean;
}

export interface NibFrequencyCurvePoint {
  readonly pressureNorm: number; readonly vibrationHz: number; readonly audioBandpassHz: number;
}

export interface NibHapticSynthesis {
  readonly profileId: NibHapticProfileId; readonly vibrationFrequencyHz: number; readonly amplitude: number;
  readonly vibratePatternMs: readonly number[]; readonly totalPulseDurationMs: number;
  readonly audioBandpassHz: number; readonly audioBandpassQ: number; readonly audioFrictionGain: number;
  readonly waveformSamples: readonly number[]; readonly frequencyCurvePoints: readonly NibFrequencyCurvePoint[];
  readonly suppressedByReducedMotion: boolean;
}

export type FocusHapticSessionStatus = "baseline" | "previewing" | "applied" | "tweaked" | "reverted";
export type FocusHapticHistoryAction = "preview" | "tweak" | "apply" | "revert";

export interface FocusHapticPresetConfig {
  readonly nibProfileId: NibHapticProfileId; readonly hapticIntensity: number;
  readonly audioFrictionEnabled: boolean; readonly autoPanEnabled: boolean;
  readonly edgeDeadzoneRatio: number; readonly panDamping: number;
  readonly minPanZoomPercent: number; readonly maxPanZoomPercent: number;
  readonly prefersReducedMotion: boolean; readonly workRhythmCoachingEnabled: boolean;
}

export interface FocusHapticHistoryEntry {
  readonly revision: number; readonly action: FocusHapticHistoryAction;
  readonly nibProfileId: NibHapticProfileId; readonly note: string;
}

export interface FocusHapticSessionState {
  readonly status: FocusHapticSessionStatus; readonly baselineConfig: FocusHapticPresetConfig;
  readonly appliedConfig: FocusHapticPresetConfig; readonly workingConfig: FocusHapticPresetConfig;
  readonly activeNibId: NibHapticProfileId; readonly canRevert: boolean;
  readonly revision: number; readonly history: readonly FocusHapticHistoryEntry[];
}

export interface FocusHapticProfileExportPayload {
  readonly schema: "toonstudio.focus-pan-haptic-profile.v1";
  readonly processingScope: "local-input-only";
  readonly execution: {
    readonly sampleSource: "synthetic-manual-input"; readonly canvasMutationVerified: false;
    readonly hardwareExecutionVerified: false; readonly persistenceVerified: false;
  };
  readonly nonMedicalNoticeKo: string; readonly nonMedicalNoticeEn: string;
  readonly session: {
    readonly status: FocusHapticSessionStatus; readonly revision: number;
    readonly appliedConfig: FocusHapticPresetConfig; readonly workingConfig: FocusHapticPresetConfig;
  };
  readonly workRhythm: {
    readonly state: WorkRhythmState; readonly rhythmStabilityScore: number; readonly inputLoadIndex: number;
    readonly clampedInput: WorkRhythmInput; readonly adjustment: WorkRhythmEnvironmentAdjustment;
  };
  readonly focusAutoPan: FocusAutoPanResult;
  readonly nibHaptic: {
    readonly profileId: NibHapticProfileId; readonly vibrationFrequencyHz: number; readonly amplitude: number;
    readonly vibratePatternMs: readonly number[]; readonly audioBandpassHz: number;
    readonly audioBandpassQ: number; readonly audioFrictionGain: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round2(value: number): number { return Math.round(value * 100) / 100; }

/** 270~320도 바이올렛 휴 구간 여부 판정. */
export function isVioletSlopHue(hue: number): boolean {
  if (!Number.isFinite(hue)) return false;
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_SLOP_MIN_HUE && normalized <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 휴 구간(270~320도)을 비-바이올렛 안전 휴로 치환한다. */
export function sanitizeNonVioletHue(hue: number): number {
  if (!Number.isFinite(hue)) return 215;
  const normalized = ((hue % 360) + 360) % 360;
  if (!isVioletSlopHue(normalized)) return Math.round(normalized);
  return normalized <= 295 ? 248 : 340;
}

/** 탈-바이올렛 OKLCH CSS 문자열 포맷터(원시 hex/rgb/hsl 금지). */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clamp(color.l, 0, 1).toFixed(2);
  const c = clamp(color.c, 0, 0.4).toFixed(2);
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined
    ? `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`
    : `oklch(${l} ${c} ${h})`;
}

export const WORK_RHYTHM_PRESETS: readonly WorkRhythmPresetMeta[] = [
  {
    id: "deep-ink-flow",
    labelKo: "집중 선화 몰입",
    labelEn: "Deep Inking Flow",
    descriptionKo: "낮은 되돌리기 빈도와 일정한 펜 획 속도로 몰입 유지",
    descriptionEn: "Steady stroke rhythm with minimal undos during inking",
    input: { continuousMinutes: 26, undoPerMinute: 1.5, strokeCadencePerMin: 46, zoomLevel: 320 },
  },
  {
    id: "steady-storyboard",
    labelKo: "안정 콘티 작업",
    labelEn: "Steady Storyboard",
    descriptionKo: "적당한 탐색·수정과 180~250% 배율의 균형 잡힌 진행",
    descriptionEn: "Balanced exploration and layout cadence at mid zoom",
    input: { continuousMinutes: 32, undoPerMinute: 5, strokeCadencePerMin: 28, zoomLevel: 210 },
  },
  {
    id: "long-detail-drift",
    labelKo: "장기 확대 휴식 권장",
    labelEn: "Long Zoom Break Check",
    descriptionKo: "연속 60분 이상 고배율 수정이 누적된 리듬 점검 구간",
    descriptionEn: "Extended high-zoom editing with elevated undo churn",
    input: { continuousMinutes: 64, undoPerMinute: 11, strokeCadencePerMin: 22, zoomLevel: 480 },
  },
] as const;

export function getWorkRhythmPreset(id: WorkRhythmPresetId): WorkRhythmPresetMeta {
  return WORK_RHYTHM_PRESETS.find((preset) => preset.id === id) ?? WORK_RHYTHM_PRESETS[0];
}

const RHYTHM_ACCENT_BY_STATE: Readonly<Record<WorkRhythmState, OklchColor>> = {
  flow: { l: 0.56, c: 0.14, h: 155 },
  steady: { l: 0.55, c: 0.12, h: 220 },
  "drift-check": { l: 0.63, c: 0.16, h: 55 },
};

/**
 * 로컬 캔버스 입력 패턴(연속 작업 시간·분당 Undo·스트로크 리듬·확대율)만 분석해
 * 비의료·비진단 작업 리듬 상태와 비파괴 환경 조정안을 산출한다.
 */
export function evaluateWorkRhythmSession(input: WorkRhythmInput): WorkRhythmEvaluation {
  const clampedInput: WorkRhythmInput = {
    continuousMinutes: round1(clamp(input.continuousMinutes, 0, 240)),
    undoPerMinute: round1(clamp(input.undoPerMinute, 0, 40)),
    strokeCadencePerMin: Math.round(clamp(input.strokeCadencePerMin, 0, 160)),
    zoomLevel: Math.round(clamp(input.zoomLevel, 25, 800)),
  };

  const timeLoad = clamp((clampedInput.continuousMinutes - 20) / 65, 0, 1) * 48;
  const undoLoad = clamp(clampedInput.undoPerMinute / 13, 0, 1) * 34;
  const zoomLoad = clampedInput.zoomLevel >= 200 ? clamp((clampedInput.zoomLevel - 200) / 400, 0, 1) * 18 : 0;
  const inputLoadIndex = Math.round(clamp(timeLoad + undoLoad + zoomLoad, 0, 100));

  const cadenceBalance =
    clampedInput.strokeCadencePerMin >= 18 && clampedInput.strokeCadencePerMin <= 85
      ? 1
      : clampedInput.strokeCadencePerMin < 18
        ? clamp(clampedInput.strokeCadencePerMin / 18, 0.25, 1)
        : clamp(1 - (clampedInput.strokeCadencePerMin - 85) / 90, 0.35, 1);

  const undoStability = clamp(1 - clampedInput.undoPerMinute / 16, 0.1, 1);
  const enduranceFactor = clamp(1 - Math.max(0, clampedInput.continuousMinutes - 45) / 90, 0.25, 1);
  const rhythmStabilityScore = Math.round(
    clamp((cadenceBalance * 0.42 + undoStability * 0.36 + enduranceFactor * 0.22) * 100, 0, 100),
  );

  const isDriftCheck =
    clampedInput.continuousMinutes >= 55 ||
    clampedInput.undoPerMinute >= 9 ||
    inputLoadIndex >= 65 ||
    (clampedInput.continuousMinutes >= 45 && clampedInput.undoPerMinute >= 6 && clampedInput.zoomLevel >= 300);

  const isFlow =
    !isDriftCheck &&
    clampedInput.continuousMinutes >= 10 &&
    clampedInput.continuousMinutes < 55 &&
    clampedInput.undoPerMinute <= 3.5 &&
    clampedInput.strokeCadencePerMin >= 18 &&
    clampedInput.strokeCadencePerMin <= 90 &&
    inputLoadIndex <= 38;

  const state: WorkRhythmState = isDriftCheck ? "drift-check" : isFlow ? "flow" : "steady";
  const m = clampedInput.continuousMinutes;
  const u = clampedInput.undoPerMinute;
  const z = clampedInput.zoomLevel;

  const observedSignalsKo = [
    m >= 55 ? `연속 작업 ${m}분 경과` : m >= 10 ? `몰입 작업 구간 ${m}분 유지` : `초기 워밍업 구간 (${m}분)`,
    u >= 9 ? `분당 되돌리기 ${u}회 집중 발생` : u <= 3.5 ? `안정된 획 확정률 (Undo ${u}회/분)` : `보통 수정 리듬 (Undo ${u}회/분)`,
    z >= 300 ? `${z}% 고배율 정밀 묘사 중` : z >= 200 ? `${z}% 확대 자동 패닝 권장 구간` : `${z}% 전체 구도 확인 구간`,
  ];
  const observedSignalsEn = [
    m >= 55 ? `${m}m continuous canvas session` : m >= 10 ? `Active session window (${m}m)` : `Early warm-up window (${m}m)`,
    u >= 9 ? `High undo churn (${u}/min)` : u <= 3.5 ? `Clean stroke commit rate (${u} undo/min)` : `Moderate revision rhythm (${u} undo/min)`,
    z >= 300 ? `High-zoom detail work (${z}%)` : z >= 200 ? `Auto-pan zoom band (${z}%)` : `Wide framing zoom (${z}%)`,
  ];

  const scheduleSteadyBreak = m >= 35 ? 3 : null;
  const stateConfig: Record<WorkRhythmState, { labelKo: string; labelEn: string; adjustment: WorkRhythmEnvironmentAdjustment }> = {
    flow: {
      labelKo: "집중 몰입",
      labelEn: "Deep Flow",
      adjustment: {
        uiChromeOpacity: 0.58,
        ambienceGainDb: -6,
        wristStretchReminderMinutes: null,
        dimPeripheralChrome: true,
        suggestionsKo: [
          "주변 UI 크롬 투명도를 58%로 완화해 선화 몰입 유지",
          "배경 앰비언스 음량을 -6dB로 낮춰 작업 소음 간섭 축소",
          "비긴급 팝업과 리마인더를 현재 몰입 구간 동안 보류",
        ],
        suggestionsEn: [
          "Soften peripheral UI chrome opacity to 58% to keep focus on canvas",
          "Attenuate background ambience volume by -6 dB",
          "Defer non-urgent reminders until the flow interval completes",
        ],
      },
    },
    "drift-check": {
      labelKo: "손목·눈 휴식 권장",
      labelEn: "Wrist & Eye Break Suggested",
      adjustment: {
        uiChromeOpacity: 0.96,
        ambienceGainDb: -6,
        wristStretchReminderMinutes: 3,
        dimPeripheralChrome: false,
        suggestionsKo: [
          "3분 손목·눈 스트레칭 타이머 알림 권장 (비강제)",
          "배경 앰비언스 음량 -6dB 완화 및 현재 원고 임시 체크포인트 권장",
          "확대율을 잠시 100%로 내려 전체 컷 균형 확인 후 재개",
        ],
        suggestionsEn: [
          "Suggest an optional 3-minute wrist and eye stretch break",
          "Lower background ambience by -6 dB and save a local checkpoint",
          "Zoom back to 100% briefly to review whole-panel balance before resuming",
        ],
      },
    },
    steady: {
      labelKo: "안정 리듬",
      labelEn: "Steady Pace",
      adjustment: {
        uiChromeOpacity: 0.85,
        ambienceGainDb: -3,
        wristStretchReminderMinutes: scheduleSteadyBreak,
        dimPeripheralChrome: false,
        suggestionsKo: [
          "표준 스튜디오 UI 크롬 투명도(85%) 유지",
          "배경 앰비언스 음량 -3dB 균형 모드 유지",
          scheduleSteadyBreak !== null
            ? "연속 35분 경과 — 다음 컷 마무리 후 3분 손목 스트레칭 알림 예약"
            : "현재 로컬 입력 리듬이 안정적입니다 — 55분 도달 시 휴식 알림 안내",
        ],
        suggestionsEn: [
          "Keep standard studio chrome opacity (85%)",
          "Keep balanced background ambience at -3 dB",
          scheduleSteadyBreak !== null
            ? "35m elapsed — queue an optional 3-minute wrist stretch after this cut"
            : "Local input rhythm looks balanced — break cue arms at 55m",
        ],
      },
    },
  };

  return {
    state,
    ...stateConfig[state],
    accentOklch: RHYTHM_ACCENT_BY_STATE[state],
    rhythmStabilityScore,
    inputLoadIndex,
    clampedInput,
    observedSignalsKo,
    observedSignalsEn,
    processingScope: "local-input-only",
    nonMedicalNoticeKo: LOCAL_NON_MEDICAL_NOTICE_KO,
    nonMedicalNoticeEn: LOCAL_NON_MEDICAL_NOTICE_EN,
  };
}

export const DEFAULT_FOCUS_AUTO_PAN_CONFIG: FocusAutoPanConfig = {
  enabled: true,
  edgeDeadzoneRatio: FOCUS_PAN_DEFAULT_DEADZONE,
  damping: FOCUS_PAN_DEFAULT_DAMPING,
  minZoomPercent: FOCUS_PAN_MIN_ZOOM,
  maxZoomPercent: FOCUS_PAN_MAX_ZOOM,
  maxPanStepPx: FOCUS_PAN_DEFAULT_MAX_STEP_PX,
  prefersReducedMotion: false,
};

export const FOCUS_PAN_CURSOR_PRESETS: readonly FocusCursorPreset[] = [
  { id: "right-bottom-edge", labelKo: "우측 하단 진입", labelEn: "Bottom-Right Edge", cursorNormX: 0.91, cursorNormY: 0.88, velocityX: 16, velocityY: 11 },
  { id: "left-top-edge", labelKo: "좌측 상단 진입", labelEn: "Top-Left Edge", cursorNormX: 0.08, cursorNormY: 0.11, velocityX: -14, velocityY: -10 },
  { id: "right-edge-fast", labelKo: "우측 고속 횡선", labelEn: "Fast Right Sweep", cursorNormX: 0.95, cursorNormY: 0.5, velocityX: 28, velocityY: 2 },
  { id: "safe-center", labelKo: "중앙 안전 구역", labelEn: "Center Safe Zone", cursorNormX: 0.5, cursorNormY: 0.5, velocityX: 12, velocityY: 6 },
] as const;

/**
 * 200~600% 확대 작화 중 펜 커서가 뷰포트 외곽 데드존에 진입했을 때
 * 펜 이동 속도 벡터와 감쇠 계수(0.12~0.45)로 흔들림 없는 2D 자동 패닝 델타를 계산한다.
 */
export function computeFocusAutoPanDelta(
  sample: FocusAutoPanSample,
  config: FocusAutoPanConfig,
): FocusAutoPanResult {
  const effectiveDamping = round2(clamp(config.damping, FOCUS_PAN_MIN_DAMPING, FOCUS_PAN_MAX_DAMPING));
  const effectiveDeadzoneRatio = round2(clamp(config.edgeDeadzoneRatio, FOCUS_PAN_MIN_DEADZONE, FOCUS_PAN_MAX_DEADZONE));
  const minZoom = clamp(config.minZoomPercent, 150, 400);
  const maxZoom = clamp(config.maxZoomPercent, Math.max(minZoom + 50, FOCUS_PAN_MIN_ZOOM), 800);
  const maxStepPx = clamp(config.maxPanStepPx, 8, 96);

  const inactive = (reason: FocusAutoPanReason): FocusAutoPanResult => ({
    active: false, reason, panDeltaX: 0, panDeltaY: 0, magnitudePx: 0,
    edgePenetrationX: 0, edgePenetrationY: 0, effectiveDamping, effectiveDeadzoneRatio, triggeredEdges: [],
  });

  if (config.prefersReducedMotion) return inactive("reduced-motion-guard");
  if (!config.enabled) return inactive("disabled");
  if (!Number.isFinite(sample.zoomLevel) || sample.zoomLevel < minZoom) return inactive("below-zoom-threshold");

  const nx = clamp(sample.cursorNormX, 0, 1);
  const ny = clamp(sample.cursorNormY, 0, 1);
  const vx = clamp(sample.velocityX, -120, 120);
  const vy = clamp(sample.velocityY, -120, 120);
  const prevX = clamp(sample.previousDeltaX ?? 0, -maxStepPx, maxStepPx);
  const prevY = clamp(sample.previousDeltaY ?? 0, -maxStepPx, maxStepPx);

  const triggeredEdges: FocusAutoPanEdge[] = [];
  let signedPenX = 0;
  let signedPenY = 0;

  if (nx < effectiveDeadzoneRatio) {
    signedPenX = -(effectiveDeadzoneRatio - nx) / effectiveDeadzoneRatio;
    triggeredEdges.push("left");
  } else if (nx > 1 - effectiveDeadzoneRatio) {
    signedPenX = (nx - (1 - effectiveDeadzoneRatio)) / effectiveDeadzoneRatio;
    triggeredEdges.push("right");
  }

  if (ny < effectiveDeadzoneRatio) {
    signedPenY = -(effectiveDeadzoneRatio - ny) / effectiveDeadzoneRatio;
    triggeredEdges.push("top");
  } else if (ny > 1 - effectiveDeadzoneRatio) {
    signedPenY = (ny - (1 - effectiveDeadzoneRatio)) / effectiveDeadzoneRatio;
    triggeredEdges.push("bottom");
  }

  if (signedPenX === 0 && signedPenY === 0) return inactive("inside-safe-zone");

  const zoomNorm = clamp((sample.zoomLevel - minZoom) / Math.max(1, maxZoom - minZoom), 0, 1);
  const zoomScale = 0.72 + zoomNorm * 0.68;
  const vpScaleX = clamp((sample.viewportWidth ?? 1280) / 1280, 0.5, 2);
  const vpScaleY = clamp((sample.viewportHeight ?? 720) / 720, 0.5, 2);

  const axisDelta = (signedPen: number, vel: number, vpScale: number, prev: number): number => {
    if (signedPen === 0) return prev * (1 - effectiveDamping) * 0.5;
    const dir = Math.sign(signedPen);
    const edgeEase = dir * Math.pow(Math.abs(signedPen), 1.65) * 28 * vpScale;
    const outwardVel = Math.sign(vel) === dir ? vel * 0.55 : vel * 0.12;
    return prev + ((edgeEase + outwardVel) * zoomScale - prev) * effectiveDamping;
  };

  let rawDeltaX = axisDelta(signedPenX, vx, vpScaleX, prevX);
  let rawDeltaY = axisDelta(signedPenY, vy, vpScaleY, prevY);
  const rawMag = Math.hypot(rawDeltaX, rawDeltaY);
  if (rawMag > maxStepPx && rawMag > 0) {
    const ratio = maxStepPx / rawMag;
    rawDeltaX *= ratio;
    rawDeltaY *= ratio;
  }

  const panDeltaX = round2(rawDeltaX);
  const panDeltaY = round2(rawDeltaY);
  return {
    active: true,
    reason: "active-edge-pan",
    panDeltaX,
    panDeltaY,
    magnitudePx: round2(Math.hypot(panDeltaX, panDeltaY)),
    edgePenetrationX: round2(Math.abs(signedPenX)),
    edgePenetrationY: round2(Math.abs(signedPenY)),
    effectiveDamping,
    effectiveDeadzoneRatio,
    triggeredEdges,
  };
}

/** 다중 프레임 감쇠 패닝 궤적 시뮬레이션(SVG 추종 경로 프리뷰용). */
export function simulateFocusAutoPanTrajectory(
  sample: FocusAutoPanSample,
  config: FocusAutoPanConfig,
  steps = 6,
): readonly FocusAutoPanTrajectoryPoint[] {
  const count = Math.round(clamp(steps, 1, 16));
  const points: FocusAutoPanTrajectoryPoint[] = [];
  let prevX = sample.previousDeltaX ?? 0;
  let prevY = sample.previousDeltaY ?? 0;
  let cumX = 0;
  let cumY = 0;
  for (let frame = 1; frame <= count; frame += 1) {
    const res = computeFocusAutoPanDelta({ ...sample, previousDeltaX: prevX, previousDeltaY: prevY }, config);
    prevX = res.panDeltaX;
    prevY = res.panDeltaY;
    cumX = round2(cumX + res.panDeltaX);
    cumY = round2(cumY + res.panDeltaY);
    points.push({ frame, deltaX: res.panDeltaX, deltaY: res.panDeltaY, cumulativeX: cumX, cumulativeY: cumY });
  }
  return points;
}

export const NIB_HAPTIC_PROFILES: readonly NibHapticProfileSpec[] = [
  {
    id: "kent-gpen", nameKo: "켄트지 + 스틸 G펜", nameEn: "Kent Paper + Steel G-Pen",
    paperKo: "켄트지 (200g 평활)", paperEn: "Kent Paper (Smooth 200g)", nibKo: "스틸 G펜 촉", nibEn: "Steel G-Pen Nib",
    summaryKo: "날렵한 철펜 마찰음과 촘촘한 마이크로 틱 햅틱", summaryEn: "Crisp metallic scratch with tight micro-tick haptics",
    accentOklch: { l: 0.54, c: 0.13, h: 230 }, baseVibrationHz: 185, maxVibrationHz: 290,
    paperRoughness: 0.42, tipCompliance: 0.25, bandpassBaseHz: 2450, bandpassMaxHz: 4300,
    bandpassQ: 3.4, harmonicRatio: 0.55, basePulseCadenceMs: [10, 14, 10, 14, 8],
  },
  {
    id: "hanji-brush", nameKo: "한지 + 모필 먹붓", nameEn: "Hanji Paper + Sumi Brush",
    paperKo: "전통 한지 (장섬유)", paperEn: "Traditional Hanji Fiber", nibKo: "양모 먹붓", nibEn: "Natural Hair Sumi Brush",
    summaryKo: "부드러운 섬유 흡수감과 저주파 장진동 마찰 필터", summaryEn: "Silky fibrous glide with low-frequency damped rumble",
    accentOklch: { l: 0.55, c: 0.15, h: 34 }, baseVibrationHz: 72, maxVibrationHz: 132,
    paperRoughness: 0.68, tipCompliance: 0.88, bandpassBaseHz: 860, bandpassMaxHz: 1680,
    bandpassQ: 1.6, harmonicRatio: 0.22, basePulseCadenceMs: [24, 18, 16],
  },
  {
    id: "marker-smooth", nameKo: "마커지 + 알코올 마커", nameEn: "Marker Pad + Alcohol Marker",
    paperKo: "코팅 마커지", paperEn: "Coated Marker Pad", nibKo: "브러시·치즐 펠트 촉", nibEn: "Felt Brush/Chisel Tip",
    summaryKo: "매끄러운 저저항 활주감과 고속 필압 시 미세 마찰음", summaryEn: "Low-resistance felt glide with subtle high-speed whisper",
    accentOklch: { l: 0.54, c: 0.13, h: 175 }, baseVibrationHz: 118, maxVibrationHz: 198,
    paperRoughness: 0.18, tipCompliance: 0.52, bandpassBaseHz: 1520, bandpassMaxHz: 2850,
    bandpassQ: 4.1, harmonicRatio: 0.16, basePulseCadenceMs: [12, 26, 10],
  },
  {
    id: "coldpress-pencil", nameKo: "황목지 + 4B 연필", nameEn: "Cold-Press Paper + 4B Pencil",
    paperKo: "황목지 (거친 요철)", paperEn: "Cold-Press Textured Paper", nibKo: "4B 흑연심", nibEn: "4B Soft Graphite Core",
    summaryKo: "종이 요철이 살아있는 입자감 햅틱과 풍부한 흑연 마찰 대역", summaryEn: "Rich paper-tooth granular vibration and warm graphite hiss",
    accentOklch: { l: 0.57, c: 0.14, h: 72 }, baseVibrationHz: 142, maxVibrationHz: 248,
    paperRoughness: 0.86, tipCompliance: 0.44, bandpassBaseHz: 1920, bandpassMaxHz: 3520,
    bandpassQ: 2.2, harmonicRatio: 0.74, basePulseCadenceMs: [12, 10, 14, 10, 12, 10, 10],
  },
] as const;

export function getNibHapticProfile(id: NibHapticProfileId): NibHapticProfileSpec {
  return NIB_HAPTIC_PROFILES.find((profile) => profile.id === id) ?? NIB_HAPTIC_PROFILES[0];
}

/** 필압 구간(0.1~1.0)에 따른 마찰 대역통과 주파수 및 진동 주파수 곡선을 생성한다. */
export function buildNibFrequencyCurve(
  profileId: NibHapticProfileId,
  speedPxPerSec: number,
): readonly NibFrequencyCurvePoint[] {
  const spec = getNibHapticProfile(profileId);
  const speedNorm = clamp(speedPxPerSec / 1400, 0, 1);
  return Array.from({ length: 9 }, (_, idx) => {
    const p = round2((idx + 1) / 9);
    return {
      pressureNorm: p,
      vibrationHz: Math.round(spec.baseVibrationHz + (spec.maxVibrationHz - spec.baseVibrationHz) * (speedNorm * 0.62 + p * 0.38)),
      audioBandpassHz: Math.round(spec.bandpassBaseHz + (spec.bandpassMaxHz - spec.bandpassBaseHz) * (speedNorm * 0.55 + p * 0.45)),
    };
  });
}

/** 4종 펜촉 프로파일에 대해 필압·속도·기울기 기반 햅틱·진동 펄스·Web Audio 마찰 필터를 산출한다. */
export function synthesizeNibHapticResponse(
  profileId: NibHapticProfileId,
  stroke: NibStrokeInput,
  options?: NibHapticOptions,
): NibHapticSynthesis {
  const spec = getNibHapticProfile(profileId);
  const pressure = clamp(stroke.pressure, 0, 1);
  const speed = clamp(stroke.speedPxPerSec, 0, 1800);
  const tiltDeg = clamp(stroke.tiltDeg ?? 25, 0, 90);
  const masterIntensity = clamp(options?.masterIntensity ?? 0.85, 0, 1);
  const audioFrictionEnabled = options?.audioFrictionEnabled ?? true;
  const prefersReducedMotion = options?.prefersReducedMotion ?? false;

  const speedNorm = clamp(speed / 1400, 0, 1);
  const tiltGrainBoost = 1 + (tiltDeg / 90) * spec.paperRoughness * 0.25;
  const isEngaged = pressure > 0.01 && speed > 2 && masterIntensity > 0;

  const vibrationFrequencyHz = Math.round(
    spec.baseVibrationHz + (spec.maxVibrationHz - spec.baseVibrationHz) * (speedNorm * 0.62 + pressure * 0.38),
  );
  const rawAmp = isEngaged
    ? (0.16 + pressure * 0.52 + speedNorm * 0.22 + spec.paperRoughness * 0.18) * masterIntensity * tiltGrainBoost
    : 0;
  const amplitude = round2(clamp(rawAmp, 0, 1));

  const audioBandpassHz = Math.round(
    clamp(
      (spec.bandpassBaseHz + (spec.bandpassMaxHz - spec.bandpassBaseHz) * (speedNorm * 0.55 + pressure * 0.45)) *
        (1 - (tiltDeg / 90) * 0.12),
      300,
      6500,
    ),
  );
  const audioBandpassQ = round1(spec.bandpassQ);
  const audioFrictionGain =
    audioFrictionEnabled && isEngaged ? round2(clamp(amplitude * (0.2 + spec.paperRoughness * 0.22), 0, 0.45)) : 0;

  let vibratePatternMs: number[] = [];
  if (isEngaged && !prefersReducedMotion) {
    const pulseScale = 0.65 + amplitude * 0.7;
    const gapScale = clamp(1.22 - speedNorm * 0.45, 0.6, 1.25);
    const scaled = spec.basePulseCadenceMs.map((ms, idx) =>
      clamp(Math.round(ms * (idx % 2 === 0 ? pulseScale : gapScale)), idx % 2 === 0 ? 4 : 6, 45),
    );
    let total = 0;
    const capped: number[] = [];
    for (const ms of scaled) {
      if (total + ms > 180) break;
      capped.push(ms);
      total += ms;
    }
    if (capped.length > 1 && capped.length % 2 === 0) capped.pop();
    vibratePatternMs = capped;
  }

  const freqCycles = 1.4 + (vibrationFrequencyHz / 110) * 1.1;
  const waveformSamples = Array.from({ length: 28 }, (_, i) => {
    const t = i / 27;
    const primary = Math.sin(2 * Math.PI * freqCycles * t);
    const grain = Math.sin(2 * Math.PI * (freqCycles * 2.7 + spec.paperRoughness * 4) * t);
    const combined = (primary * (1 - spec.harmonicRatio * 0.45) + grain * spec.harmonicRatio * 0.45) * Math.sin(Math.PI * t) * amplitude;
    return round2(clamp(combined, -1, 1));
  });

  return {
    profileId: spec.id,
    vibrationFrequencyHz,
    amplitude,
    vibratePatternMs,
    totalPulseDurationMs: vibratePatternMs.reduce((acc, ms) => acc + ms, 0),
    audioBandpassHz,
    audioBandpassQ,
    audioFrictionGain,
    waveformSamples,
    frequencyCurvePoints: buildNibFrequencyCurve(spec.id, speed),
    suppressedByReducedMotion: prefersReducedMotion && isEngaged,
  };
}

export { triggerSafeNavigatorVibrate } from "./focus-haptic-device";

export const DEFAULT_FOCUS_HAPTIC_CONFIG: FocusHapticPresetConfig = {
  nibProfileId: "kent-gpen",
  hapticIntensity: 0.85,
  audioFrictionEnabled: true,
  autoPanEnabled: true,
  edgeDeadzoneRatio: FOCUS_PAN_DEFAULT_DEADZONE,
  panDamping: FOCUS_PAN_DEFAULT_DAMPING,
  minPanZoomPercent: FOCUS_PAN_MIN_ZOOM,
  maxPanZoomPercent: FOCUS_PAN_MAX_ZOOM,
  prefersReducedMotion: false,
  workRhythmCoachingEnabled: true,
};

function sanitizePresetConfig(base: FocusHapticPresetConfig, patch?: Partial<FocusHapticPresetConfig>): FocusHapticPresetConfig {
  const merged = { ...base, ...patch };
  const minZoom = Math.round(clamp(merged.minPanZoomPercent, 150, 400));
  return {
    nibProfileId: getNibHapticProfile(merged.nibProfileId).id,
    hapticIntensity: round2(clamp(merged.hapticIntensity, 0, 1)),
    audioFrictionEnabled: Boolean(merged.audioFrictionEnabled),
    autoPanEnabled: Boolean(merged.autoPanEnabled),
    edgeDeadzoneRatio: round2(clamp(merged.edgeDeadzoneRatio, FOCUS_PAN_MIN_DEADZONE, FOCUS_PAN_MAX_DEADZONE)),
    panDamping: round2(clamp(merged.panDamping, FOCUS_PAN_MIN_DAMPING, FOCUS_PAN_MAX_DAMPING)),
    minPanZoomPercent: minZoom,
    maxPanZoomPercent: Math.round(clamp(merged.maxPanZoomPercent, Math.max(minZoom + 50, FOCUS_PAN_MIN_ZOOM), 800)),
    prefersReducedMotion: Boolean(merged.prefersReducedMotion),
    workRhythmCoachingEnabled: Boolean(merged.workRhythmCoachingEnabled),
  };
}

function isSamePresetConfig(a: FocusHapticPresetConfig, b: FocusHapticPresetConfig): boolean {
  return (
    a.nibProfileId === b.nibProfileId && a.hapticIntensity === b.hapticIntensity &&
    a.audioFrictionEnabled === b.audioFrictionEnabled && a.autoPanEnabled === b.autoPanEnabled &&
    a.edgeDeadzoneRatio === b.edgeDeadzoneRatio && a.panDamping === b.panDamping &&
    a.minPanZoomPercent === b.minPanZoomPercent && a.maxPanZoomPercent === b.maxPanZoomPercent &&
    a.prefersReducedMotion === b.prefersReducedMotion && a.workRhythmCoachingEnabled === b.workRhythmCoachingEnabled
  );
}

function appendHistory(history: readonly FocusHapticHistoryEntry[], entry: FocusHapticHistoryEntry): readonly FocusHapticHistoryEntry[] {
  return [...history.slice(-11), entry];
}

/** 비파괴 집중·자동 패닝·펜촉 햅틱 세션을 초기화한다. */
export function createFocusHapticSession(initial?: Partial<FocusHapticPresetConfig>): FocusHapticSessionState {
  const baseline = sanitizePresetConfig(DEFAULT_FOCUS_HAPTIC_CONFIG, initial);
  return {
    status: "baseline", baselineConfig: baseline, appliedConfig: baseline, workingConfig: baseline,
    activeNibId: baseline.nibProfileId, canRevert: false, revision: 0, history: [],
  };
}

/** 원본 적용 값을 유지한 채 다른 펜촉 햅틱 프리셋을 비파괴 미리보기한다. */
export function previewNibHapticPreset(session: FocusHapticSessionState, nibProfileId: NibHapticProfileId): FocusHapticSessionState {
  const nextWorking = sanitizePresetConfig(session.workingConfig, { nibProfileId });
  const revision = session.revision + 1;
  return {
    ...session, status: "previewing", workingConfig: nextWorking, activeNibId: nextWorking.nibProfileId,
    canRevert: !isSamePresetConfig(nextWorking, session.baselineConfig) || !isSamePresetConfig(session.appliedConfig, session.baselineConfig),
    revision,
    history: appendHistory(session.history, { revision, action: "preview", nibProfileId: nextWorking.nibProfileId, note: `Preview nib ${nextWorking.nibProfileId}` }),
  };
}

/** 패닝 감쇠·데드존·햅틱 강도 등 작업 구성을 비파괴 미세 조정한다. */
export function tweakFocusHapticConfig(session: FocusHapticSessionState, patch: Partial<FocusHapticPresetConfig>): FocusHapticSessionState {
  const nextWorking = sanitizePresetConfig(session.workingConfig, patch);
  const revision = session.revision + 1;
  const changed = !isSamePresetConfig(nextWorking, session.baselineConfig) || !isSamePresetConfig(session.appliedConfig, session.baselineConfig);
  return {
    ...session, status: changed ? "tweaked" : "baseline", workingConfig: nextWorking, activeNibId: nextWorking.nibProfileId,
    canRevert: changed, revision,
    history: appendHistory(session.history, { revision, action: "tweak", nibProfileId: nextWorking.nibProfileId, note: "Tweaked focus/pan/haptic parameters" }),
  };
}

/** 현재 작업 구성을 비파괴 적용한다(원본 baseline은 원복용으로 보존). */
export function applyFocusHapticSession(session: FocusHapticSessionState, summaryNote?: string): FocusHapticSessionState {
  const nextApplied = sanitizePresetConfig(session.workingConfig);
  const revision = session.revision + 1;
  return {
    ...session, status: "applied", appliedConfig: nextApplied, workingConfig: nextApplied,
    activeNibId: nextApplied.nibProfileId, canRevert: true, revision,
    history: appendHistory(session.history, { revision, action: "apply", nibProfileId: nextApplied.nibProfileId, note: summaryNote ?? `Applied ${nextApplied.nibProfileId} profile` }),
  };
}

/** 1클릭으로 원본 baseline 구성으로 되돌린다. */
export function revertFocusHapticSession(session: FocusHapticSessionState): FocusHapticSessionState {
  const restored = sanitizePresetConfig(session.baselineConfig);
  const revision = session.revision + 1;
  return {
    ...session, status: "reverted", appliedConfig: restored, workingConfig: restored,
    activeNibId: restored.nibProfileId, canRevert: false, revision,
    history: appendHistory(session.history, { revision, action: "revert", nibProfileId: restored.nibProfileId, note: "Reverted to baseline profile" }),
  };
}

/** 집중 리듬·포커스 자동 패닝·펜촉 햅틱 구성을 JSON 문자열로 직렬화한다. */
export function exportFocusHapticProfileJson(
  session: FocusHapticSessionState,
  rhythm: WorkRhythmEvaluation,
  autoPan: FocusAutoPanResult,
  haptic: NibHapticSynthesis,
): string {
  if (haptic.profileId !== session.workingConfig.nibProfileId || haptic.vibratePatternMs.length > 8) {
    throw new RangeError("현재 예제 구성과 햅틱 파형이 일치해야 합니다. / Haptic profile does not match the example configuration.");
  }
  const payload: FocusHapticProfileExportPayload = {
    schema: "toonstudio.focus-pan-haptic-profile.v1",
    processingScope: "local-input-only",
    execution: { sampleSource: "synthetic-manual-input", canvasMutationVerified: false, hardwareExecutionVerified: false, persistenceVerified: false },
    nonMedicalNoticeKo: LOCAL_NON_MEDICAL_NOTICE_KO,
    nonMedicalNoticeEn: LOCAL_NON_MEDICAL_NOTICE_EN,
    session: { status: session.status, revision: session.revision, appliedConfig: session.appliedConfig, workingConfig: session.workingConfig },
    workRhythm: {
      state: rhythm.state, rhythmStabilityScore: rhythm.rhythmStabilityScore,
      inputLoadIndex: rhythm.inputLoadIndex, clampedInput: rhythm.clampedInput, adjustment: rhythm.adjustment,
    },
    focusAutoPan: autoPan,
    nibHaptic: {
      profileId: haptic.profileId, vibrationFrequencyHz: haptic.vibrationFrequencyHz, amplitude: haptic.amplitude,
      vibratePatternMs: haptic.vibratePatternMs, audioBandpassHz: haptic.audioBandpassHz,
      audioBandpassQ: haptic.audioBandpassQ, audioFrictionGain: haptic.audioFrictionGain,
    },
  };
  return JSON.stringify(payload, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("프로파일에 비유한 수치가 있습니다. / Non-finite profile values.");
    return value;
  }, 2);
}
