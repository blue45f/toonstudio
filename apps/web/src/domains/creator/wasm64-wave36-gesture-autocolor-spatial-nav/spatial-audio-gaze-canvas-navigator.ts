/**
 * Wave 36: 몰입형 공간 음향 브러시 피드백 및 멀미 없는 시선·포커스 보조 캔버스 내비게이터.
 *
 * - `computeSpatialBrushAudioParams`: 캔버스 좌우·상하 정규화 좌표(`-1..1`), 펜 이동 속도, 필압,
 *   종이 결 거칠기를 스테레오 패닝·대역통과 필터·게인 파라미터로 매핑하며,
 *   `audioFeedbackEnabled === false`일 때 지연 시간 `0초`로 즉시 음소거한다.
 * - `planGazeAssistedCanvasViewport`: 중앙 데드존 필터링으로 미세 시선 떨림 드리프트를 차단하고,
 *   컷 읽기 앵커 사이를 오버슈트나 어지럼증(광류 속도 초과·줌 흔들림) 없이 부드럽게 스냅한다.
 *   `prefersReducedMotion`이 켜진 경우 연속 부유 이동을 끄고 앵커 간 즉시 점프만 수행한다.
 */

/** 작업 집중을 해치지 않는 공간 브러시 음향 최대 선형 게인 상한(`~ -9.4 dBFS`). */
export const MAX_SPATIAL_BRUSH_GAIN_LINEAR = 0.34 as const;

/** 브러시 대역통과 필터 최저 중심 주파수(`Hz`). */
export const MIN_BRUSH_BANDPASS_HZ = 280 as const;

/** 브러시 대역통과 필터 최고 중심 주파수(`Hz`). */
export const MAX_BRUSH_BANDPASS_HZ = 5_200 as const;

/** 전정기관 어지럼증을 예방하기 위한 화면 픽셀 기준 기본 최대 패닝 속도(`px/s`). */
export const DEFAULT_MAX_VESTIBULAR_PAN_SPEED_PX_PER_SEC = 850 as const;

/** 스쳐 지나가는 안구 도약(Saccade)에 카메라가 휘둘리지 않도록 요구하는 최소 응시 시간(`ms`). */
export const DEFAULT_MIN_ANCHOR_DWELL_MS = 110 as const;

export interface SpatialBrushAudioInput {
  readonly audioFeedbackEnabled: boolean;
  /** 캔버스 가로 정규화 위치(`-1` 왼쪽 끝 .. `0` 중앙 .. `+1` 오른쪽 끝). */
  readonly normalizedX: number;
  /** 캔버스 세로 정규화 위치(`-1` 아래쪽 .. `0` 중앙 .. `+1` 위쪽). */
  readonly normalizedY: number;
  /** 스타일러스 이동 속도(`px/s`, `>= 0`). */
  readonly speedPxPerSec: number;
  /** 스타일러스 필압(`0..1`). */
  readonly pressure: number;
  /** 원고 종이 결 거칠기(`0`=매끄러운 셀 필름 .. `1`=거친 황목 수채화지). */
  readonly paperGrainRoughness: number;
  /** 스테레오 좌우 폭 배율(`0..1`, 기본 `1`). */
  readonly stereoWidthScale?: number;
}

export interface SpatialBrushAudioParams {
  readonly muted: boolean;
  readonly isSilentStroke: boolean;
  /** WebAudio `StereoPannerNode.pan` 값 (`-1..1`). */
  readonly stereoPan: number;
  /** WebAudio `BiquadFilterNode` (`type = "bandpass"`) 중심 주파수 (`Hz`). */
  readonly bandpassFrequencyHz: number;
  /** 대역통과 필터 공진 예리도 `Q` (거친 종이일수록 넓은 대역 마찰음을 내도록 낮아짐). */
  readonly bandpassQ: number;
  /** 세로 위치(`normalizedY`)를 반영하는 고역 쉘프 미세 보정치 (`-4.5..+4.5 dB`). */
  readonly verticalShelfGainDb: number;
  /** WebAudio `GainNode.gain` 목표 선형 진폭 (`0..0.34`). */
  readonly gainLinear: number;
  /** 파라미터 보간 시정수(`초`). 음소거 시에는 즉시 차단을 위해 `0`. */
  readonly smoothingTimeConstantSec: number;
}

export interface CanvasViewportState {
  readonly centerX: number;
  readonly centerY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoom: number;
}

export interface GazeFocusSample {
  readonly canvasX: number;
  readonly canvasY: number;
  /** 현재 관심 지점 근처에 머문 응시 시간(`ms`). */
  readonly dwellMs?: number;
}

export interface PanelReadingAnchor {
  readonly anchorId: string;
  readonly labelKo?: string;
  readonly centerX: number;
  readonly centerY: number;
  /** 캔버스 좌표계 기준 앵커 포획 반지름(미지정 시 뷰포트 단변 기반으로 자동 산출). */
  readonly snapRadiusCanvas?: number;
  readonly readingOrderIndex?: number;
}

export type GazeViewportTransitionMode =
  | "hold-deadzone"
  | "smooth-deadzone-lead"
  | "anchor-glide-snap"
  | "instant-discrete-snap";

export interface GazeViewportPlanInput {
  readonly viewport: CanvasViewportState;
  readonly focusTarget: GazeFocusSample;
  readonly panelAnchors?: readonly PanelReadingAnchor[];
  readonly currentSnappedAnchorId?: string | null;
  /** 프레임 간격(`ms`, 기본 `16.67`). 백그라운드 탭 복귀 급발진을 막기 위해 `1..100ms`로 제한된다. */
  readonly dtMs?: number;
  /** 뷰포트 짧은 변 대비 중앙 정지 데드존 반지름 비율(`0.08..0.45`, 기본 `0.2`). */
  readonly deadzoneViewportRatio?: number;
  /** 비앵커 시선 리드 추적 비율(`0..1`, 기본 `0.4`). */
  readonly leadStrength?: number;
  /** 전정기관 보호용 화면 기준 최대 이동 속도(`px/s`, 기본 `850`). */
  readonly maxPanSpeedScreenPxPerSec?: number;
  /** 패널 앵커 스냅 최소 응시 유지 시간(`ms`, 기본 `110`). */
  readonly minAnchorSnapDwellMs?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface GazeViewportPlanResult {
  readonly nextCenterX: number;
  readonly nextCenterY: number;
  /** 시선 패닝 중 전정기관 멀미를 유발하는 줌 울렁임을 막기 위해 입력 `zoom`을 그대로 유지한다. */
  readonly nextZoom: number;
  readonly panDeltaCanvasX: number;
  readonly panDeltaCanvasY: number;
  readonly screenStepPx: number;
  readonly inDeadzone: boolean;
  readonly snappedAnchorId: string | null;
  readonly snappedAnchorLabelKo: string | null;
  readonly transitionMode: GazeViewportTransitionMode;
  readonly transitionDurationMs: number;
  readonly vestibularSpeedClamped: boolean;
  readonly overshootPrevented: true;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * 스타일러스 위치·속도·필압·종이 거칠기로부터 스테레오 WebAudio 제어 파라미터를 계산한다.
 */
export function computeSpatialBrushAudioParams(
  input: SpatialBrushAudioInput,
): SpatialBrushAudioParams {
  const widthScale = clamp(input.stereoWidthScale ?? 1, 0, 1);
  const panX = clamp(input.normalizedX, -1, 1);
  const panY = clamp(input.normalizedY, -1, 1);
  const stereoPan = normalizeZero(clamp(panX * widthScale, -1, 1));
  const roughness = clamp(input.paperGrainRoughness, 0, 1);
  const speed = Math.max(0, Number.isFinite(input.speedPxPerSec) ? input.speedPxPerSec : 0);
  const pressure = clamp(input.pressure, 0, 1);

  const speedNorm = speed / (speed + 650);
  const baseFreqHz =
    MIN_BRUSH_BANDPASS_HZ +
    (MAX_BRUSH_BANDPASS_HZ - MIN_BRUSH_BANDPASS_HZ) *
      (0.78 * speedNorm + 0.22 * (1 - roughness * 0.45) * speedNorm);
  const verticalFreqShiftHz = panY * 140;
  const bandpassFrequencyHz = clamp(
    baseFreqHz + verticalFreqShiftHz,
    MIN_BRUSH_BANDPASS_HZ,
    MAX_BRUSH_BANDPASS_HZ,
  );

  // 매끄러운 셀 필름은 좁은 실크 공진(Q≈4.2), 거친 황목지는 넓은 섬유 마찰음(Q≈1.05)
  const bandpassQ = 4.2 - 3.15 * roughness;

  if (!input.audioFeedbackEnabled) {
    return {
      muted: true,
      isSilentStroke: true,
      stereoPan,
      bandpassFrequencyHz,
      bandpassQ,
      verticalShelfGainDb: 0,
      gainLinear: 0,
      smoothingTimeConstantSec: 0,
    };
  }

  if (speed <= 1e-3 || pressure <= 1e-4) {
    return {
      muted: false,
      isSilentStroke: true,
      stereoPan,
      bandpassFrequencyHz,
      bandpassQ,
      verticalShelfGainDb: normalizeZero(panY * 4.5),
      gainLinear: 0,
      smoothingTimeConstantSec: 0.012,
    };
  }

  const velocityEnvelope = Math.min(1, (speed / 900) ** 0.65);
  const pressureEnvelope = pressure ** 0.85;
  const grainCoupling = 0.38 + 0.62 * roughness;
  const rawGain =
    MAX_SPATIAL_BRUSH_GAIN_LINEAR *
    velocityEnvelope *
    pressureEnvelope *
    grainCoupling;

  return {
    muted: false,
    isSilentStroke: false,
    stereoPan,
    bandpassFrequencyHz,
    bandpassQ,
    verticalShelfGainDb: normalizeZero(panY * 4.5),
    gainLinear: clamp(rawGain, 0, MAX_SPATIAL_BRUSH_GAIN_LINEAR),
    smoothingTimeConstantSec: 0.016,
  };
}

function selectTargetPanelAnchor(
  focusTarget: GazeFocusSample,
  anchors: readonly PanelReadingAnchor[],
  currentSnappedAnchorId: string | null,
  defaultSnapRadiusCanvas: number,
  minAnchorSnapDwellMs: number,
): PanelReadingAnchor | null {
  if (anchors.length === 0) return null;

  const effectiveDwellMs =
    focusTarget.dwellMs !== undefined && Number.isFinite(focusTarget.dwellMs)
      ? Math.max(0, focusTarget.dwellMs)
      : minAnchorSnapDwellMs;

  let closestCandidate: PanelReadingAnchor | null = null;
  let closestDist = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
    const snapRadius = Math.max(
      12,
      anchor.snapRadiusCanvas ?? defaultSnapRadiusCanvas,
    );
    const dist = Math.hypot(
      focusTarget.canvasX - anchor.centerX,
      focusTarget.canvasY - anchor.centerY,
    );
    if (dist <= snapRadius && dist < closestDist) {
      closestCandidate = anchor;
      closestDist = dist;
    }
  }

  if (closestCandidate !== null && effectiveDwellMs >= minAnchorSnapDwellMs) {
    return closestCandidate;
  }

  // 이미 스냅된 앵커가 있으면 15% 반경 여유 히스테리시스 안에서는 흔들림 없이 유지
  if (currentSnappedAnchorId !== null) {
    const held = anchors.find((a) => a.anchorId === currentSnappedAnchorId) ?? null;
    if (held !== null) {
      const heldRadius =
        Math.max(12, held.snapRadiusCanvas ?? defaultSnapRadiusCanvas) * 1.15;
      const distFromHeld = Math.hypot(
        focusTarget.canvasX - held.centerX,
        focusTarget.canvasY - held.centerY,
      );
      if (distFromHeld <= heldRadius) {
        return held;
      }
    }
  }

  return null;
}

/**
 * 시선 또는 커서 선행 좌표를 받아 중앙 데드존 필터링과 컷 읽기 앵커 스냅이 적용된
 * 다음 프레임 뷰포트 중심을 계산한다.
 */
export function planGazeAssistedCanvasViewport(
  input: GazeViewportPlanInput,
): GazeViewportPlanResult {
  const safeZoom = clamp(input.viewport.zoom, 0.05, 32);
  const safeWidthPx = Math.max(64, input.viewport.widthPx);
  const safeHeightPx = Math.max(64, input.viewport.heightPx);
  const minViewportDimPx = Math.min(safeWidthPx, safeHeightPx);

  const dtSec = clamp(input.dtMs ?? 16.67, 1, 100) / 1_000;
  const deadzoneRatio = clamp(input.deadzoneViewportRatio ?? 0.2, 0.08, 0.45);
  const leadStrength = clamp(input.leadStrength ?? 0.4, 0, 1);
  const maxPanSpeedScreenPxPerSec = clamp(
    input.maxPanSpeedScreenPxPerSec ?? DEFAULT_MAX_VESTIBULAR_PAN_SPEED_PX_PER_SEC,
    80,
    3_200,
  );
  const minAnchorSnapDwellMs = Math.max(
    0,
    input.minAnchorSnapDwellMs ?? DEFAULT_MIN_ANCHOR_DWELL_MS,
  );
  const prefersReducedMotion = input.prefersReducedMotion ?? false;

  const deadzoneCanvasRadius = (minViewportDimPx * deadzoneRatio) / safeZoom;
  const defaultAnchorSnapRadiusCanvas = (minViewportDimPx * 0.28) / safeZoom;

  const matchedAnchor = selectTargetPanelAnchor(
    input.focusTarget,
    input.panelAnchors ?? [],
    input.currentSnappedAnchorId ?? null,
    defaultAnchorSnapRadiusCanvas,
    minAnchorSnapDwellMs,
  );

  // 1) 컷 읽기 앵커가 포획된 경우: 모션 축소 환경은 즉시 스냅, 일반 환경은 무오버슈트 감쇠 이동
  if (matchedAnchor !== null) {
    const remX = matchedAnchor.centerX - input.viewport.centerX;
    const remY = matchedAnchor.centerY - input.viewport.centerY;
    const remDistCanvas = Math.hypot(remX, remY);

    if (prefersReducedMotion || remDistCanvas < 1e-4) {
      const stepScreenPx = remDistCanvas * safeZoom;
      return {
        nextCenterX: matchedAnchor.centerX,
        nextCenterY: matchedAnchor.centerY,
        nextZoom: safeZoom,
        panDeltaCanvasX: normalizeZero(remX),
        panDeltaCanvasY: normalizeZero(remY),
        screenStepPx: stepScreenPx,
        inDeadzone: remDistCanvas <= deadzoneCanvasRadius,
        snappedAnchorId: matchedAnchor.anchorId,
        snappedAnchorLabelKo: matchedAnchor.labelKo ?? null,
        transitionMode: prefersReducedMotion
          ? "instant-discrete-snap"
          : "anchor-glide-snap",
        transitionDurationMs: 0,
        vestibularSpeedClamped: false,
        overshootPrevented: true,
      };
    }

    const glideAlpha = 1 - Math.exp(-9.5 * dtSec);
    const desiredStepCanvas = remDistCanvas * glideAlpha;
    const maxStepCanvas = (maxPanSpeedScreenPxPerSec * dtSec) / safeZoom;
    const vestibularSpeedClamped = desiredStepCanvas > maxStepCanvas;
    const boundedStepCanvas = Math.min(remDistCanvas, desiredStepCanvas, maxStepCanvas);
    const ratio = boundedStepCanvas / remDistCanvas;

    const stepX = remX * ratio;
    const stepY = remY * ratio;

    return {
      nextCenterX: input.viewport.centerX + stepX,
      nextCenterY: input.viewport.centerY + stepY,
      nextZoom: safeZoom,
      panDeltaCanvasX: normalizeZero(stepX),
      panDeltaCanvasY: normalizeZero(stepY),
      screenStepPx: boundedStepCanvas * safeZoom,
      inDeadzone: false,
      snappedAnchorId: matchedAnchor.anchorId,
      snappedAnchorLabelKo: matchedAnchor.labelKo ?? null,
      transitionMode: "anchor-glide-snap",
      transitionDurationMs: 180,
      vestibularSpeedClamped,
      overshootPrevented: true,
    };
  }

  // 2) 자유 시선·커서 선행 추적: 중앙 데드존 내부이거나 모션 축소 켜짐 시 정지 유지
  const dxCanvas = input.focusTarget.canvasX - input.viewport.centerX;
  const dyCanvas = input.focusTarget.canvasY - input.viewport.centerY;
  const distCanvas = Math.hypot(dxCanvas, dyCanvas);
  const insideDeadzone = distCanvas <= deadzoneCanvasRadius;

  if (insideDeadzone || prefersReducedMotion || leadStrength <= 0) {
    return {
      nextCenterX: input.viewport.centerX,
      nextCenterY: input.viewport.centerY,
      nextZoom: safeZoom,
      panDeltaCanvasX: 0,
      panDeltaCanvasY: 0,
      screenStepPx: 0,
      inDeadzone: insideDeadzone,
      snappedAnchorId: null,
      snappedAnchorLabelKo: null,
      transitionMode: "hold-deadzone",
      transitionDurationMs: 0,
      vestibularSpeedClamped: false,
      overshootPrevented: true,
    };
  }

  // 데드존 바깥 변위만 매끄럽게 반영해 경계 통과 시 급격한 초기 속도 점프를 제거
  const excessCanvas = distCanvas - deadzoneCanvasRadius;
  const targetLeadCanvas = excessCanvas * leadStrength;
  const smoothAlpha = 1 - Math.exp(-7.5 * dtSec);
  const desiredStepCanvas = targetLeadCanvas * smoothAlpha;
  const maxStepCanvas = (maxPanSpeedScreenPxPerSec * dtSec) / safeZoom;

  const vestibularSpeedClamped = desiredStepCanvas > maxStepCanvas;
  const actualStepCanvas = Math.min(
    targetLeadCanvas,
    desiredStepCanvas,
    maxStepCanvas,
  );

  const unitX = dxCanvas / distCanvas;
  const unitY = dyCanvas / distCanvas;
  const stepX = unitX * actualStepCanvas;
  const stepY = unitY * actualStepCanvas;

  return {
    nextCenterX: input.viewport.centerX + stepX,
    nextCenterY: input.viewport.centerY + stepY,
    nextZoom: safeZoom,
    panDeltaCanvasX: normalizeZero(stepX),
    panDeltaCanvasY: normalizeZero(stepY),
    screenStepPx: actualStepCanvas * safeZoom,
    inDeadzone: false,
    snappedAnchorId: null,
    snappedAnchorLabelKo: null,
    transitionMode: "smooth-deadzone-lead",
    transitionDurationMs: 120,
    vestibularSpeedClamped,
    overshootPrevented: true,
  };
}
