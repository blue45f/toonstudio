/**
 * Wave-69: 웹툰 1컷 -> 60fps 모션툰·숏폼 2.5D 시차 카메라 코레오그래퍼.
 *
 * See-Through로 분리된 다층 웹툰 컷(배경·중경·캐릭터·전경 이펙트·말풍선)과
 * 광학 깊이(`depthZ`, 미터 단위) 메타데이터를 받아 9:16·16:9·1:1 60fps 숏폼
 * 카메라 워킹(`dolly-in | ken-burns-pan | dramatic-rack-focus | whip-reveal | breath-idle`)을
 * 해석적으로 평가한다. 모든 전면 채움(Full-Bleed) 레이어의 회전·이동·스케일 경계를
 * 네 모서리 역투영 부등식으로 검사해 검은 여백(Black Border) 노출 0px을 보장한다.
 */

/** 60fps 모션툰 숏폼 출력 화면비 프리셋. */
export type ShortformAspectPreset = "9:16" | "16:9" | "1:1";

/** 숏폼 플랫폼 UI 오버레이를 피하기 위한 안전 타이틀 여백(px). */
export interface SafeTitleInsetPx {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/** 숏폼 출력 뷰포트 규격. */
export interface ShortformViewportSpec {
  readonly aspectPreset: ShortformAspectPreset;
  readonly fps: number;
  readonly heightPx: number;
  readonly safeTitleInsetPx: SafeTitleInsetPx;
  readonly widthPx: number;
}

/** 대표 숏폼 화면비별 60fps 표준 출력 규격. */
export const SHORTFORM_VIEWPORT_PRESETS: Readonly<
  Record<ShortformAspectPreset, ShortformViewportSpec>
> = {
  "9:16": {
    aspectPreset: "9:16",
    fps: 60,
    heightPx: 1920,
    safeTitleInsetPx: { bottom: 380, left: 64, right: 140, top: 220 },
    widthPx: 1080,
  },
  "16:9": {
    aspectPreset: "16:9",
    fps: 60,
    heightPx: 1080,
    safeTitleInsetPx: { bottom: 120, left: 96, right: 96, top: 72 },
    widthPx: 1920,
  },
  "1:1": {
    aspectPreset: "1:1",
    fps: 60,
    heightPx: 1080,
    safeTitleInsetPx: { bottom: 140, left: 72, right: 72, top: 80 },
    widthPx: 1080,
  },
};

/** See-Through로 분리된 웹툰 컷 레이어 역할. */
export type Parallax25dLayerRole =
  | "backdrop"
  | "character"
  | "foreground-fx"
  | "midground"
  | "speech-balloon";

/** 역할별 기본 광학 깊이(카메라로부터의 거리, 미터 단위). 값이 작을수록 근경이다. */
export const DEFAULT_LAYER_DEPTH_Z_METERS: Readonly<Record<Parallax25dLayerRole, number>> = {
  backdrop: 14.0,
  character: 2.5,
  "foreground-fx": 1.2,
  midground: 5.5,
  "speech-balloon": 1.9,
};

/** 5종 60fps 모션툰 카메라 연출 모드. */
export type CameraChoreographyMode =
  | "breath-idle"
  | "dolly-in"
  | "dramatic-rack-focus"
  | "ken-burns-pan"
  | "whip-reveal";

/** 정규화 초점 앵커 (`-1..+1`, `(0, 0)`은 화면 중앙). */
export interface CameraFocusAnchor {
  readonly x: number;
  readonly y: number;
}

/** See-Through 분리 2.5D 웹툰 레이어 입력 명세. */
export interface Parallax25dLayerSpec {
  /** 카메라로부터의 광학 깊이(m). 작을수록 카메라에 가까워 시차 변위가 크다. */
  readonly depthZ: number;
  /** 화면 전체를 채워 검은 여백이 노출되면 안 되는 레이어 여부(기본: backdrop/midground=true). */
  readonly fullBleed?: boolean;
  readonly id: string;
  /** 말풍선 등 뷰포트 프레임 고정 여부(기본: speech-balloon=true). */
  readonly lockToViewportFrame?: boolean;
  readonly name: string;
  /** See-Through 인페인팅으로 확보된 상하좌우 확장 스커트 여백(px). */
  readonly overscanMarginPx?: number;
  readonly role: Parallax25dLayerRole;
  /** 레이어 원본 높이(px). 생략 시 컷 원본 높이를 따른다. */
  readonly sourceHeightPx?: number;
  /** 레이어 원본 너비(px). 생략 시 컷 원본 너비를 따른다. */
  readonly sourceWidthPx?: number;
  /** 화가 순서 보조 정렬 키(낮을수록 뒤쪽). */
  readonly zOrder?: number;
}

/** 얇은 렌즈 피사계 심도(DoF) 착란원 계산 파라미터. */
export interface CameraOptics25dSpec {
  readonly apertureFStop: number;
  readonly focalLengthMm: number;
  readonly maxBlurRadiusPx: number;
  readonly sensorHeightMm: number;
}

/** 기본 2.5D 모션툰 카메라 광학 파라미터. */
export const DEFAULT_CAMERA_OPTICS_25D: CameraOptics25dSpec = {
  apertureFStop: 2.8,
  focalLengthMm: 50,
  maxBlurRadiusPx: 18,
  sensorHeightMm: 24,
};

/** 단일 컷에 적용할 카메라 코레오그래피 계획. */
export interface CameraChoreographyPlan {
  /** 호흡·부유 주기 횟수 (`breath-idle` 기본 1.0 사이클). */
  readonly breathCycles?: number;
  /** 카메라 전진 거리(m, `dolly-in` 기본 0.35m). */
  readonly dollyDepthMeters?: number;
  readonly durationMs: number;
  readonly endAnchor?: CameraFocusAnchor;
  /** 최종 포커스 평면 깊이(m, 기본 character 2.5m). */
  readonly endFocusDepthZ?: number;
  /** 0..1 카메라 연출 강도(기본 0.8). */
  readonly intensity?: number;
  readonly mode: CameraChoreographyMode;
  readonly optics?: Partial<CameraOptics25dSpec>;
  /** 기준 평면(character)에서의 최대 팬 변위 비율(뷰포트 단축 기준, 기본 0.08). */
  readonly panAmplitudeRatio?: number;
  /** 최대 롤 회전 각도(도, 기본 whip-reveal 2.8도, 기타 0.8도). */
  readonly rollAmplitudeDeg?: number;
  readonly startAnchor?: CameraFocusAnchor;
  /** 시작 포커스 평면 깊이(m, `dramatic-rack-focus` 기본 1.2m). */
  readonly startFocusDepthZ?: number;
  /** 추가 광학 줌 배율(1.0 = 기본). */
  readonly zoomEndFactor?: number;
  readonly zoomStartFactor?: number;
}

/** 특정 시점 `t`에서의 가상 카메라 포즈. */
export interface CameraPoseAtFrame {
  readonly camXNorm: number;
  readonly camYNorm: number;
  readonly camZDeltaMeters: number;
  readonly focusDistanceMeters: number;
  readonly focalZoom: number;
  readonly motionBlurVectorPx: { readonly x: number; readonly y: number };
  readonly normalizedTime: number;
  readonly reducedMotionClamped: boolean;
  readonly rollDeg: number;
}

/** 레이어별 프레임 변환 행렬 파라미터 및 안전 지표. */
export interface LayerParallaxFrameTransform {
  readonly blackBorderSafe: boolean;
  readonly depthZ: number;
  readonly dofBlurRadiusPx: number;
  readonly effectiveDepthZ: number;
  readonly exposedBlackMarginPx: number;
  readonly fullBleed: boolean;
  readonly layerId: string;
  readonly lockedToViewportFrame: boolean;
  readonly motionBlurVectorPx: { readonly x: number; readonly y: number };
  readonly opacity: number;
  readonly overscanScaleBoost: number;
  readonly parallaxGain: number;
  readonly role: Parallax25dLayerRole;
  readonly rotationDeg: number;
  readonly scale: number;
  readonly translateXPx: number;
  readonly translateYPx: number;
}

/** 오버스캔 크롭 안전 경계 해석 결과. */
export interface OverscanCropSafetyReport {
  readonly maxExposedBlackMarginPx: number;
  readonly maxRequiredOverscanScale: number;
  readonly minAvailableCornerMarginPx: number;
  readonly perLayerRequiredScale: Readonly<Record<string, number>>;
  readonly zeroBlackBorderGuaranteed: boolean;
}

/** `evaluateParallax25dFrameTransforms` 입력 명세. */
export interface EvaluateParallax25dFrameInput {
  readonly aspectPreset: ShortformAspectPreset;
  readonly cutHeightPx: number;
  readonly cutWidthPx: number;
  /** `true`(기본)면 전면 채움 레이어의 검은 여백 노출이 정확히 0px이 되도록 오버스캔 스케일을 보정한다. */
  readonly enforceZeroBlackBorder?: boolean;
  readonly layers: readonly Parallax25dLayerSpec[];
  readonly plan: CameraChoreographyPlan;
  /** `true`면 전정기관 보호를 위해 카메라 이동·롤·모션블러를 0으로 억제한다. */
  readonly prefersReducedMotion?: boolean;
  /** 기준 평면 깊이(m). 생략 시 character 레이어 깊이 또는 2.5m를 사용한다. */
  readonly referenceDepthZ?: number;
  /** 평가 시점(ms). `normalizedTime`과 함께 주면 `timeMs`가 우선한다. */
  readonly timeMs?: number;
  /** 정규화 평가 진행률 (`0..1`). */
  readonly normalizedTime?: number;
}

/** 단일 프레임 2.5D 시차 평가 전체 결과. */
export interface Parallax25dFrameEvaluation {
  readonly cameraPose: CameraPoseAtFrame;
  /** 화가 순서(원경 -> 근경 -> 말풍선)로 정렬된 레이어별 변환 파라미터. */
  readonly layerTransforms: readonly LayerParallaxFrameTransform[];
  readonly overscanReport: OverscanCropSafetyReport;
  readonly viewport: ShortformViewportSpec;
  readonly zeroBlackBorderGuaranteed: boolean;
}

const MIN_SAFE_DEPTH_Z_M = 0.35;
const OVERSCAN_SAFETY_EPSILON = 1e-5;
const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutQuint(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 5);
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 화면비 프리셋에 해당하는 60fps 숏폼 출력 뷰포트 규격을 반환한다. */
export function resolveShortformViewport(preset: ShortformAspectPreset): ShortformViewportSpec {
  return SHORTFORM_VIEWPORT_PRESETS[preset];
}

/** 얇은 렌즈 공식 기반 레이어 착란원(DoF 블러) 반경(px)을 계산한다. */
export function computeLayerDofBlurRadiusPx(
  layerDepthZ: number,
  focusDistanceMeters: number,
  viewportHeightPx: number,
  opticsInput?: Partial<CameraOptics25dSpec>,
): number {
  const optics: CameraOptics25dSpec = {
    apertureFStop: Math.max(1.0, opticsInput?.apertureFStop ?? DEFAULT_CAMERA_OPTICS_25D.apertureFStop),
    focalLengthMm: Math.max(12, opticsInput?.focalLengthMm ?? DEFAULT_CAMERA_OPTICS_25D.focalLengthMm),
    maxBlurRadiusPx: Math.max(0, opticsInput?.maxBlurRadiusPx ?? DEFAULT_CAMERA_OPTICS_25D.maxBlurRadiusPx),
    sensorHeightMm: Math.max(8, opticsInput?.sensorHeightMm ?? DEFAULT_CAMERA_OPTICS_25D.sensorHeightMm),
  };
  const z = Math.max(MIN_SAFE_DEPTH_Z_M, layerDepthZ);
  const fDist = Math.max(MIN_SAFE_DEPTH_Z_M, focusDistanceMeters);
  const focalM = optics.focalLengthMm / 1000;
  const focusDenom = Math.max(0.05, fDist - focalM);
  const cocMeters =
    ((focalM * focalM) / (optics.apertureFStop * focusDenom)) * (Math.abs(z - fDist) / z);
  const cocMm = cocMeters * 1000;
  const radiusPx = 0.5 * (cocMm / optics.sensorHeightMm) * Math.max(1, viewportHeightPx);
  return clamp(radiusPx, 0, optics.maxBlurRadiusPx);
}

/**
 * 주어진 카메라 코레오그래피 계획의 시점 `normalizedTime (0..1)`에서
 * 카메라 위치·돌리 깊이·롤·포커스 거리·모션블러 벡터를 해석적으로 계산한다.
 */
export function sampleCameraChoreographyPose(
  plan: CameraChoreographyPlan,
  normalizedTime: number,
  options: { readonly prefersReducedMotion?: boolean } = {},
): CameraPoseAtFrame {
  const t = clamp(normalizedTime, 0, 1);
  const reduced = Boolean(options.prefersReducedMotion);
  const intensity = clamp(plan.intensity ?? 0.8, 0, 1.5);
  const startAnchor: CameraFocusAnchor = plan.startAnchor ?? { x: -0.35, y: 0.12 };
  const endAnchor: CameraFocusAnchor = plan.endAnchor ?? { x: 0.28, y: -0.1 };
  const startFocusZ = Math.max(
    MIN_SAFE_DEPTH_Z_M,
    plan.startFocusDepthZ ?? (plan.mode === "dramatic-rack-focus" ? 1.2 : 2.5),
  );
  const endFocusZ = Math.max(MIN_SAFE_DEPTH_Z_M, plan.endFocusDepthZ ?? 2.5);
  const zoomStart = clamp(plan.zoomStartFactor ?? 1.0, 0.85, 2.2);
  const zoomEnd = clamp(
    plan.zoomEndFactor ?? (plan.mode === "dolly-in" ? 1.12 : plan.mode === "ken-burns-pan" ? 1.08 : 1.04),
    0.85,
    2.5,
  );

  if (reduced) {
    const focusDistanceMeters =
      plan.mode === "dramatic-rack-focus" ? lerp(startFocusZ, endFocusZ, smoothstep(t)) : endFocusZ;
    return {
      camXNorm: 0,
      camYNorm: 0,
      camZDeltaMeters: 0,
      focalZoom: 1.0,
      focusDistanceMeters,
      motionBlurVectorPx: { x: 0, y: 0 },
      normalizedTime: t,
      reducedMotionClamped: true,
      rollDeg: 0,
    };
  }

  let camXNorm: number;
  let camYNorm: number;
  let camZDeltaMeters: number;
  let focalZoom: number;
  let focusDistanceMeters: number;
  let rollDeg: number;
  let blurX = 0;
  let blurY = 0;

  if (plan.mode === "dolly-in") {
    const e = easeInOutCubic(t);
    const maxDolly = clamp(plan.dollyDepthMeters ?? 0.35, 0, 0.85) * intensity;
    camZDeltaMeters = maxDolly * e;
    camXNorm = lerp(startAnchor.x * 0.25, endAnchor.x * 0.25, e) * intensity;
    camYNorm = lerp(startAnchor.y * 0.25, endAnchor.y * 0.25, e) * intensity;
    focalZoom = lerp(zoomStart, zoomEnd, e);
    focusDistanceMeters = Math.max(MIN_SAFE_DEPTH_Z_M, endFocusZ - camZDeltaMeters * 0.35);
    rollDeg = (plan.rollAmplitudeDeg ?? 0.45) * intensity * Math.sin(Math.PI * t);
  } else if (plan.mode === "ken-burns-pan") {
    const e = smoothstep(t);
    camXNorm = lerp(startAnchor.x, endAnchor.x, e) * intensity;
    camYNorm = lerp(startAnchor.y, endAnchor.y, e) * intensity;
    camZDeltaMeters = clamp(plan.dollyDepthMeters ?? 0.14, 0, 0.5) * intensity * e;
    focalZoom = lerp(zoomStart, zoomEnd, e);
    focusDistanceMeters = endFocusZ;
    rollDeg = (plan.rollAmplitudeDeg ?? 0.5) * intensity * (e - 0.5);
  } else if (plan.mode === "dramatic-rack-focus") {
    const e = easeInOutCubic(t);
    const arc = Math.sin(Math.PI * t);
    camXNorm = lerp(-0.22, 0.22, e) * intensity;
    camYNorm = 0.06 * arc * intensity;
    camZDeltaMeters = clamp(plan.dollyDepthMeters ?? 0.16, 0, 0.5) * intensity * e;
    focalZoom = lerp(1.0, 1.06, e);
    focusDistanceMeters = lerp(startFocusZ, endFocusZ, e);
    rollDeg = (plan.rollAmplitudeDeg ?? 0.6) * intensity * arc;
  } else if (plan.mode === "whip-reveal") {
    const e = easeOutQuint(t);
    // 5차 감속 곡선의 해석적 미분 `5*(1-t)^4`에 비례하는 휩 모션블러를 산출한다.
    const velocity = 5 * Math.pow(1 - t, 4);
    const dirX = endAnchor.x - startAnchor.x;
    const dirY = endAnchor.y - startAnchor.y;
    const normLen = Math.hypot(dirX, dirY);
    const unitX = normLen > 1e-4 ? dirX / normLen : 1;
    const unitY = normLen > 1e-4 ? dirY / normLen : 0;
    camXNorm = lerp(startAnchor.x * 1.15, endAnchor.x * 0.2, e) * intensity;
    camYNorm = lerp(startAnchor.y * 0.85, endAnchor.y * 0.2, e) * intensity;
    camZDeltaMeters = clamp(plan.dollyDepthMeters ?? 0.22, 0, 0.6) * intensity * e;
    focalZoom = lerp(1.02, 1.08, e);
    focusDistanceMeters = endFocusZ;
    const maxRoll = plan.rollAmplitudeDeg ?? 2.6;
    rollDeg = maxRoll * intensity * Math.pow(1 - t, 2.5);
    const blurMagPx = 28 * intensity * Math.min(1.0, velocity / 3.0);
    blurX = unitX * blurMagPx;
    blurY = unitY * blurMagPx;
  } else {
    // breath-idle: 리사주 곡선 기반 자연스러운 호흡 부유
    const cycles = Math.max(0.5, plan.breathCycles ?? 1.0);
    const phase = 2 * Math.PI * cycles * t;
    camXNorm = 0.16 * intensity * Math.sin(phase);
    camYNorm = 0.22 * intensity * Math.sin(phase * 0.5) * Math.cos(phase * 0.5);
    camZDeltaMeters = 0.05 * intensity * (0.5 - 0.5 * Math.cos(phase));
    focalZoom = 1.0 + 0.015 * intensity * (0.5 - 0.5 * Math.cos(phase));
    focusDistanceMeters = endFocusZ;
    rollDeg = (plan.rollAmplitudeDeg ?? 0.35) * intensity * Math.sin(phase);
  }

  return {
    camXNorm,
    camYNorm,
    camZDeltaMeters,
    focalZoom,
    focusDistanceMeters,
    motionBlurVectorPx: { x: blurX, y: blurY },
    normalizedTime: t,
    reducedMotionClamped: false,
    rollDeg,
  };
}

/**
 * 뷰포트 네 모서리를 레이어 로컬 좌표계로 역투영해 검은 여백 노출 폭(px)과
 * 네 모서리 중 최소 잔여 안전 여유(px), 0px 보장을 위한 최소 필요 스케일을 계산한다.
 */
export function measureLayerBlackBorderExposurePx(
  transform: {
    readonly rotationDeg: number;
    readonly scale: number;
    readonly translateXPx: number;
    readonly translateYPx: number;
  },
  layerWidthPx: number,
  layerHeightPx: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  overscanMarginPx = 0,
): {
  readonly exposedBlackMarginPx: number;
  readonly minCornerSafetyMarginPx: number;
  readonly minRequiredScale: number;
} {
  const safeOverscan = Math.max(0, overscanMarginPx);
  const effW = Math.max(1, layerWidthPx + 2 * safeOverscan);
  const effH = Math.max(1, layerHeightPx + 2 * safeOverscan);
  const halfW = viewportWidthPx * 0.5;
  const halfH = viewportHeightPx * 0.5;
  const rad = transform.rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const scale = Math.max(1e-6, transform.scale);

  let maxAbsU = 0;
  let maxAbsV = 0;

  const cornersX = [-halfW, halfW, halfW, -halfW];
  const cornersY = [-halfH, -halfH, halfH, halfH];
  for (let i = 0; i < 4; i += 1) {
    const qx = cornersX[i] - transform.translateXPx;
    const qy = cornersY[i] - transform.translateYPx;
    const u = Math.abs(qx * cos + qy * sin);
    const v = Math.abs(-qx * sin + qy * cos);
    if (u > maxAbsU) maxAbsU = u;
    if (v > maxAbsV) maxAbsV = v;
  }

  const coveredHalfW = effW * 0.5 * scale;
  const coveredHalfH = effH * 0.5 * scale;
  const marginX = coveredHalfW - maxAbsU;
  const marginY = coveredHalfH - maxAbsV;
  const minCornerSafetyMarginPx = Math.min(marginX, marginY);
  const rawExposure = Math.max(0, -minCornerSafetyMarginPx);
  const exposedBlackMarginPx = rawExposure < 1e-6 ? 0 : rawExposure;
  const minRequiredScale = Math.max((2 * maxAbsU) / effW, (2 * maxAbsV) / effH);

  return {
    exposedBlackMarginPx,
    minCornerSafetyMarginPx,
    minRequiredScale,
  };
}

function isLayerFullBleed(layer: Parallax25dLayerSpec): boolean {
  if (layer.fullBleed !== undefined) return layer.fullBleed;
  return layer.role === "backdrop" || layer.role === "midground";
}

function isLayerLockedToFrame(layer: Parallax25dLayerSpec): boolean {
  if (layer.lockToViewportFrame !== undefined) return layer.lockToViewportFrame;
  return layer.role === "speech-balloon";
}

function resolveReferenceDepthZ(
  layers: readonly Parallax25dLayerSpec[],
  explicitReference?: number,
): number {
  if (explicitReference !== undefined && Number.isFinite(explicitReference)) {
    return Math.max(MIN_SAFE_DEPTH_Z_M, explicitReference);
  }
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (layer && layer.role === "character" && Number.isFinite(layer.depthZ)) {
      return Math.max(MIN_SAFE_DEPTH_Z_M, layer.depthZ);
    }
  }
  return DEFAULT_LAYER_DEPTH_Z_METERS.character;
}

function sortLayersPainterOrder(
  layers: readonly Parallax25dLayerSpec[],
): readonly Parallax25dLayerSpec[] {
  return layers.slice().sort((a, b) => {
    // 말풍선은 항상 최상위 오버레이로 배치해 가독성을 유지한다.
    const aBalloon = a.role === "speech-balloon" ? 1 : 0;
    const bBalloon = b.role === "speech-balloon" ? 1 : 0;
    if (aBalloon !== bBalloon) return aBalloon - bBalloon;
    // 원경(큰 depthZ) -> 근경(작은 depthZ) 순으로 그린다.
    if (Math.abs(b.depthZ - a.depthZ) > 1e-6) return b.depthZ - a.depthZ;
    return (a.zOrder ?? 0) - (b.zOrder ?? 0);
  });
}

/**
 * 컷 전체 재생 구간 `[0, 1]`을 균일 표본화하여 전면 채움 레이어별
 * 최악 모서리 오버스캔 필요 스케일과 0px 검은 여백 보장 리포트를 산출한다.
 */
export function computeOverscanSafeCropEnvelope(
  cutSize: { readonly heightPx: number; readonly widthPx: number },
  viewport: ShortformViewportSpec,
  layers: readonly Parallax25dLayerSpec[],
  plan: CameraChoreographyPlan,
  options: {
    readonly prefersReducedMotion?: boolean;
    readonly referenceDepthZ?: number;
    readonly sampleSteps?: number;
  } = {},
): OverscanCropSafetyReport {
  const steps = Math.max(4, Math.min(120, Math.round(options.sampleSteps ?? 24)));
  const perLayerRequiredScale: Record<string, number> = {};
  let maxRequiredOverscanScale = 1.0;
  let maxExposedBlackMarginPx = 0;
  let minAvailableCornerMarginPx = Number.POSITIVE_INFINITY;

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (layer) perLayerRequiredScale[layer.id] = 1.0;
  }

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const evaluation = evaluateParallax25dFrameTransforms({
      aspectPreset: viewport.aspectPreset,
      cutHeightPx: cutSize.heightPx,
      cutWidthPx: cutSize.widthPx,
      enforceZeroBlackBorder: true,
      layers,
      normalizedTime: t,
      plan,
      prefersReducedMotion: options.prefersReducedMotion,
      referenceDepthZ: options.referenceDepthZ,
    });
    for (let i = 0; i < evaluation.layerTransforms.length; i += 1) {
      const tr = evaluation.layerTransforms[i];
      if (!tr || !tr.fullBleed) continue;
      const prev = perLayerRequiredScale[tr.layerId] ?? 1.0;
      if (tr.scale > prev) perLayerRequiredScale[tr.layerId] = tr.scale;
      if (tr.scale > maxRequiredOverscanScale) maxRequiredOverscanScale = tr.scale;
      if (tr.exposedBlackMarginPx > maxExposedBlackMarginPx) {
        maxExposedBlackMarginPx = tr.exposedBlackMarginPx;
      }
      const layer = layers.find((item) => item.id === tr.layerId);
      const layerW = Math.max(1, layer?.sourceWidthPx ?? cutSize.widthPx);
      const layerH = Math.max(1, layer?.sourceHeightPx ?? cutSize.heightPx);
      const check = measureLayerBlackBorderExposurePx(
        tr,
        layerW,
        layerH,
        viewport.widthPx,
        viewport.heightPx,
        layer?.overscanMarginPx ?? 0,
      );
      if (check.minCornerSafetyMarginPx < minAvailableCornerMarginPx) {
        minAvailableCornerMarginPx = check.minCornerSafetyMarginPx;
      }
    }
  }

  if (!Number.isFinite(minAvailableCornerMarginPx)) {
    minAvailableCornerMarginPx = 0;
  }

  return {
    maxExposedBlackMarginPx,
    maxRequiredOverscanScale,
    minAvailableCornerMarginPx,
    perLayerRequiredScale,
    zeroBlackBorderGuaranteed: maxExposedBlackMarginPx === 0,
  };
}

/**
 * 2.5D 분리 레이어 집합에 대해 특정 프레임의 카메라 포즈, 핀홀 원근 시차 변위,
 * 얇은 렌즈 피사계 심도(DoF) 블러, 그리고 0px 검은 여백 오버스캔 보정을 계산한다.
 */
export function evaluateParallax25dFrameTransforms(
  input: EvaluateParallax25dFrameInput,
): Parallax25dFrameEvaluation {
  const viewport = resolveShortformViewport(input.aspectPreset);
  const cutWidthPx = Math.max(1, input.cutWidthPx);
  const cutHeightPx = Math.max(1, input.cutHeightPx);
  const enforceZeroBlackBorder = input.enforceZeroBlackBorder !== false;
  const reduced = Boolean(input.prefersReducedMotion);

  const safeDurationMs = Math.max(1, input.plan.durationMs);
  const normalizedTime =
    input.timeMs !== undefined
      ? clamp(input.timeMs / safeDurationMs, 0, 1)
      : clamp(input.normalizedTime ?? 0, 0, 1);

  const cameraPose = sampleCameraChoreographyPose(input.plan, normalizedTime, {
    prefersReducedMotion: reduced,
  });

  const referenceDepthZ = resolveReferenceDepthZ(input.layers, input.referenceDepthZ);
  const panRatio = clamp(input.plan.panAmplitudeRatio ?? 0.08, 0, 0.25);
  const shortSidePx = Math.min(viewport.widthPx, viewport.heightPx);
  const panAmplitudeXPx = shortSidePx * panRatio;
  const panAmplitudeYPx = shortSidePx * panRatio * 0.85;
  const refShiftXPx = -cameraPose.camXNorm * panAmplitudeXPx;
  const refShiftYPx = -cameraPose.camYNorm * panAmplitudeYPx;

  const sortedLayers = sortLayersPainterOrder(input.layers);
  const transforms: LayerParallaxFrameTransform[] = [];
  const perLayerRequiredScale: Record<string, number> = {};
  let maxExposedBlackMarginPx = 0;
  let maxRequiredOverscanScale = 1.0;
  let minAvailableCornerMarginPx = Number.POSITIVE_INFINITY;

  for (let i = 0; i < sortedLayers.length; i += 1) {
    const layer = sortedLayers[i];
    if (!layer) continue;
    const depthZ = Math.max(MIN_SAFE_DEPTH_Z_M, layer.depthZ);
    const locked = isLayerLockedToFrame(layer);
    const fullBleed = isLayerFullBleed(layer);
    const layerW = Math.max(1, layer.sourceWidthPx ?? cutWidthPx);
    const layerH = Math.max(1, layer.sourceHeightPx ?? cutHeightPx);
    const overscanMarginPx = Math.max(0, layer.overscanMarginPx ?? 0);
    const effW = layerW + 2 * overscanMarginPx;
    const effH = layerH + 2 * overscanMarginPx;

    // 컷 원본을 출력 뷰포트에 빈틈없이 덮는 기본 커버 스케일.
    const baseCoverScale = Math.max(viewport.widthPx / effW, viewport.heightPx / effH);

    const effectiveDepthZ = locked
      ? depthZ
      : Math.max(MIN_SAFE_DEPTH_Z_M, depthZ - cameraPose.camZDeltaMeters);
    const parallaxGain = locked ? 0 : referenceDepthZ / effectiveDepthZ;
    const dollyDepthScale = locked ? 1.0 : depthZ / effectiveDepthZ;

    const translateXPx = locked || reduced ? 0 : refShiftXPx * parallaxGain;
    const translateYPx = locked || reduced ? 0 : refShiftYPx * parallaxGain;
    const rotationDeg = locked || reduced ? 0 : cameraPose.rollDeg;
    const rawScale = locked ? 1.0 : baseCoverScale * cameraPose.focalZoom * dollyDepthScale;

    let finalScale = rawScale;
    let overscanScaleBoost = 1.0;

    let safetyCheck = measureLayerBlackBorderExposurePx(
      { rotationDeg, scale: finalScale, translateXPx, translateYPx },
      layerW,
      layerH,
      viewport.widthPx,
      viewport.heightPx,
      overscanMarginPx,
    );

    if (fullBleed && enforceZeroBlackBorder && safetyCheck.exposedBlackMarginPx > 0) {
      const guardedScale = safetyCheck.minRequiredScale * (1 + OVERSCAN_SAFETY_EPSILON);
      overscanScaleBoost = guardedScale / Math.max(1e-6, rawScale);
      finalScale = guardedScale;
      safetyCheck = measureLayerBlackBorderExposurePx(
        { rotationDeg, scale: finalScale, translateXPx, translateYPx },
        layerW,
        layerH,
        viewport.widthPx,
        viewport.heightPx,
        overscanMarginPx,
      );
    }

    const dofBlurRadiusPx = locked
      ? 0
      : computeLayerDofBlurRadiusPx(
          effectiveDepthZ,
          cameraPose.focusDistanceMeters,
          viewport.heightPx,
          input.plan.optics,
        );

    const motionBlurScale = locked || reduced ? 0 : clamp(parallaxGain, 0.15, 2.2);
    const motionBlurVectorPx = {
      x: cameraPose.motionBlurVectorPx.x * motionBlurScale,
      y: cameraPose.motionBlurVectorPx.y * motionBlurScale,
    };

    const exposedForLayer = fullBleed ? safetyCheck.exposedBlackMarginPx : 0;
    const blackBorderSafe = !fullBleed || exposedForLayer === 0;

    if (fullBleed) {
      perLayerRequiredScale[layer.id] = safetyCheck.minRequiredScale;
      if (safetyCheck.minRequiredScale > maxRequiredOverscanScale) {
        maxRequiredOverscanScale = safetyCheck.minRequiredScale;
      }
      if (exposedForLayer > maxExposedBlackMarginPx) {
        maxExposedBlackMarginPx = exposedForLayer;
      }
      if (safetyCheck.minCornerSafetyMarginPx < minAvailableCornerMarginPx) {
        minAvailableCornerMarginPx = safetyCheck.minCornerSafetyMarginPx;
      }
    }

    transforms.push({
      blackBorderSafe,
      depthZ,
      dofBlurRadiusPx,
      effectiveDepthZ,
      exposedBlackMarginPx: exposedForLayer,
      fullBleed,
      layerId: layer.id,
      lockedToViewportFrame: locked,
      motionBlurVectorPx,
      opacity: 1,
      overscanScaleBoost,
      parallaxGain,
      role: layer.role,
      rotationDeg,
      scale: finalScale,
      translateXPx,
      translateYPx,
    });
  }

  if (!Number.isFinite(minAvailableCornerMarginPx)) {
    minAvailableCornerMarginPx = 0;
  }

  const overscanReport: OverscanCropSafetyReport = {
    maxExposedBlackMarginPx,
    maxRequiredOverscanScale,
    minAvailableCornerMarginPx,
    perLayerRequiredScale,
    zeroBlackBorderGuaranteed: maxExposedBlackMarginPx === 0,
  };

  return {
    cameraPose,
    layerTransforms: transforms,
    overscanReport,
    viewport,
    zeroBlackBorderGuaranteed: overscanReport.zeroBlackBorderGuaranteed,
  };
}
