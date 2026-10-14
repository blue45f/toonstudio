/**
 * Studio Brush Texture Combine v1 — 브러시 "텍스처"의 결합 수학 (순수·결정적).
 *
 * 배경. 현재 브러시 그레인(`studio-brush-material-dynamics`)은 패턴 값을 알파 **곱셈 배수**로만
 * 바꾼다 — 결합 방식이 사실상 multiply 하나로 고정이다. 실제 회화 도구들의 텍스처 섹션은
 * 패턴을 높이 필드로 보고 눌러 찍는 방식(height)부터 빼기·닷지·번·하드믹스까지 결합 모드를
 * 고르게 하고, dab마다 깊이가 흔들리는 것(depth jitter)이 질감의 생동감을 만든다.
 * 이 모듈은 그 결합 수학만을 소유한다: 패턴 값 조회(레지스트리·종이·절차 패턴)와 dab 기하는
 * 기존 모듈이 맡고, 여기서는 (coverage, patternValue, depth) → coverage 변환만 계산한다.
 *
 * 계약.
 * - 순수·결정적: Math.random/Date.now/DOM 없음. dab별 깊이 흔들림은 (strokeSeed, dabIndex)의
 *   무상태 해시라 라이브 프리픽스와 배치 계획이 바이트 동일하다(건식 커널과 같은 규율).
 * - 불변식: coverage 0인 곳에는 어떤 모드도 잉크를 만들지 않는다(v<=0 → 0). 결과는 항상 0..1.
 * - 항등 보존: 텍스처를 끄는 것은 호출하지 않는 것으로 표현한다. depth 0은 모드별 수학 그대로
 *   적용되며(특히 height는 깊이 0에서 닿는 높이가 0), "끄기"와 혼동하지 않는다.
 * - 레벨 조정(brightness/contrast/invert)은 결합 전에 패턴 값에 한 번 적용한다.
 *   brightness ±1은 패턴을 ±(150/255)만큼 이동시키고, 양의 contrast는 중간 회색 기준으로
 *   1/(1−c)배로 가파르게, 음의 contrast는 (1+c/2)배로 눕힌 뒤 이동을 적용한다 — 실측 기반
 *   곡선을 우리 상수로 재표현한 것이다.
 * - 깊이 컨트롤(depthControl, 선택): dab 깊이의 흔들림 소스를 해시 지터만이 아니라 필압·틸트 등
 *   입력 컨트롤로도 걸 수 있다. 설계 확정본은 marathon work의
 *   texture-depth-control-connection-design/DESIGN.md. 요지: 컨트롤 응답은 다이내믹스 매핑과
 *   같은 규율(invert 후 power 곡선)로 0..1 응답을 만들고, 깊이 배율은
 *   `max(minimumDepth, 지터배율 × 컨트롤배율)` — minimumDepth가 지터·컨트롤 공통의 단일 하한이다.
 *   컨트롤이 없거나 샘플이 없거나 소스가 비활성이면 컨트롤 배율은 정확히 1(중립)이라,
 *   기존 해시 지터 경로의 산식은 연산 순서까지 그대로 유지된다(레거시 획 재현 불변).
 */

export const STUDIO_BRUSH_TEXTURE_COMBINE_VERSION_V1 = 1 as const;

/** Height 모드에서 깊이·커버리지가 닿는 높이 배율 — 낮은 깊이에서는 골에만 잉크가 닿는다. */
export const STUDIO_BRUSH_TEXTURE_HEIGHT_REACH_V1 = 12;

export const STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1 = Object.freeze([
  "multiply",
  "subtract",
  "darken",
  "overlay",
  "color-dodge",
  "color-burn",
  "linear-burn",
  "hard-mix",
  "height",
  "linear-height",
] as const);

export type StudioBrushTextureCombineModeV1 =
  (typeof STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1)[number];

const COMBINE_MODE_SET_V1: ReadonlySet<string> = new Set(STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1);

export const STUDIO_BRUSH_TEXTURE_LIMITS_V1 = Object.freeze({
  depth: { min: 0, max: 1 },
  depthJitter: { min: 0, max: 1 },
  minimumDepth: { min: 0, max: 1 },
  brightness: { min: -1, max: 1 },
  contrast: { min: -1, max: 1 },
  depthControlStrength: { min: 0, max: 1 },
  /** 다이내믹스 매핑·테이퍼 곡선과 같은 거듭제곱 곡선 범위. */
  depthControlCurve: { min: 0.05, max: 8 },
});

/**
 * 깊이 컨트롤 소스 — `studio-brush-dynamics-types`의 StudioBrushDynamicsSource와 문자열 값을
 * 의도적으로 일치시킨다(결합 모듈은 다이내믹스에 의존하지 않으므로 값만 맞춘다).
 * "tilt"는 "tilt-magnitude"의 별칭으로, 다이내믹스 sourceValue와 같은 해석이다.
 */
export const STUDIO_BRUSH_TEXTURE_DEPTH_CONTROL_SOURCES_V1 = Object.freeze([
  "pressure",
  "tangential-pressure",
  "speed",
  "tilt",
  "tilt-magnitude",
  "tilt-azimuth",
  "twist",
  "direction",
] as const);

export type StudioBrushTextureDepthControlSourceV1 =
  (typeof STUDIO_BRUSH_TEXTURE_DEPTH_CONTROL_SOURCES_V1)[number];

const DEPTH_CONTROL_SOURCE_SET_V1: ReadonlySet<string> = new Set(
  STUDIO_BRUSH_TEXTURE_DEPTH_CONTROL_SOURCES_V1,
);

export interface StudioBrushTextureDepthControlSettingsV1 {
  /** 컨트롤 소스. 누락/무효면 컨트롤 전체가 무효(null)로 떨어진다(fail-soft). */
  source?: StudioBrushTextureDepthControlSourceV1 | string | null;
  /** 0..1 컨트롤 세기. 1이면 응답 0에서 깊이 배율이 0까지 내려간다(하한은 minimumDepth). */
  strength?: number;
  /** 거듭제곱 곡선 지수(0.05..8). 응답 = (반전 적용된 소스값)^curve. 기본 1(선형). */
  curve?: number;
  /** 소스값을 먼저 뒤집는다(예: speed — 빠를수록 옅게). 엄격 boolean만 인정. */
  invert?: boolean;
}

export interface NormalizedStudioBrushTextureDepthControlV1 {
  readonly source: StudioBrushTextureDepthControlSourceV1;
  readonly strength: number;
  readonly curve: number;
  readonly invert: boolean;
}

/**
 * 깊이 컨트롤 샘플 — 호출자가 다이내믹스 정규화 샘플에서 채우는 0..1 값들.
 * 필드명은 NormalizedStudioBrushDynamicsSample와 맞췄고, 각도 계열은
 * `studioBrushTextureDepthControlSampleFromDynamicsV1`가 0..1로 환산해 넣는다.
 * 필드가 없거나 유한수가 아니면 그 소스는 비활성(중립)으로 취급한다.
 */
export interface StudioBrushTextureDepthControlSampleV1 {
  pressure?: number;
  tangentialPressureNormalized?: number;
  speedNormalized?: number;
  tiltMagnitude?: number;
  tiltAzimuthNormalized?: number;
  twistNormalized?: number;
  directionNormalized?: number;
  /** 틸트 방위각 소스의 활성 조건(다이내믹스 sourceValue와 동일: 틸트가 있을 때만). */
  hasTilt?: boolean;
  /** 방향 소스의 활성 조건(다이내믹스 sourceValue와 동일: 방향이 확정됐을 때만). */
  hasDirection?: boolean;
}

export interface StudioBrushTextureSettingsV1 {
  /** 결합 모드. 누락/무효는 "multiply"(기존 그레인 동작과 동등). */
  mode?: StudioBrushTextureCombineModeV1 | string | null;
  /** 0..1 결합 깊이. */
  depth?: number;
  /** 0..1 dab별 깊이 흔들림 양. 0이면 획 전체가 같은 깊이. */
  depthJitter?: number;
  /** 0..1 흔들림 하한(깊이의 비율) — 흔들려도 이 비율 밑으로는 내려가지 않는다. */
  minimumDepth?: number;
  /** -1..1 패턴 명도 이동(±1 = ±150/255 레벨). */
  brightness?: number;
  /** -1..1 패턴 대비. 양수=가파르게(1에서 임계), 음수=눕히기. */
  contrast?: number;
  /** 패턴 값 반전. 레벨 조정의 마지막에 적용된다. */
  invert?: boolean;
  /**
   * 선택적 깊이 컨트롤 — dab 깊이 배율을 입력 컨트롤(필압 등)에도 건다.
   * absent/null이면 키 해석 자체를 하지 않아 기존 해시 지터 동작과 바이트 동일하다.
   */
  depthControl?: StudioBrushTextureDepthControlSettingsV1 | null;
}

export interface NormalizedStudioBrushTextureSettingsV1 {
  readonly mode: StudioBrushTextureCombineModeV1;
  readonly depth: number;
  readonly depthJitter: number;
  readonly minimumDepth: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly invert: boolean;
  /** 정규화된 깊이 컨트롤. 설정이 없거나 무효면 null(중립). */
  readonly depthControl: NormalizedStudioBrushTextureDepthControlV1 | null;
}

const DEFAULT_TEXTURE_V1: NormalizedStudioBrushTextureSettingsV1 = Object.freeze({
  mode: "multiply",
  depth: 1,
  depthJitter: 0,
  minimumDepth: 0,
  brightness: 0,
  contrast: 0,
  invert: false,
  depthControl: null,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return value <= minimum ? minimum : value >= maximum ? maximum : value;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampSetting(
  value: unknown,
  range: { readonly min: number; readonly max: number },
  fallback: number,
): number {
  return clamp(finiteOr(value, fallback), range.min, range.max);
}

/**
 * 깊이 컨트롤만 정규화한다. 레코드가 아니거나 소스가 무효면 컨트롤 전체를 null로 떨군다
 * (텍스처 본체는 유지 — 그레인 정규화의 "섹션만 탈락" 규율과 동일). strength 0인 컨트롤은
 * 정규화는 되지만 해석 단계에서 중립으로 취급된다.
 */
export function normalizeStudioBrushTextureDepthControlV1(
  input?: StudioBrushTextureDepthControlSettingsV1 | null,
): NormalizedStudioBrushTextureDepthControlV1 | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.source !== "string" || !DEPTH_CONTROL_SOURCE_SET_V1.has(input.source)) {
    return null;
  }
  return Object.freeze({
    source: input.source as StudioBrushTextureDepthControlSourceV1,
    strength: clampSetting(
      input.strength,
      STUDIO_BRUSH_TEXTURE_LIMITS_V1.depthControlStrength,
      1,
    ),
    curve: clampSetting(input.curve, STUDIO_BRUSH_TEXTURE_LIMITS_V1.depthControlCurve, 1),
    invert: input.invert === true,
  });
}

/**
 * 외부 입력(저장본·프리셋·UI)을 정규화한다. 무효 모드는 multiply로 떨어지고(fail-soft),
 * 숫자는 각 범위로 클램프, invert는 엄격 boolean만 인정한다.
 */
export function normalizeStudioBrushTextureSettingsV1(
  input?: StudioBrushTextureSettingsV1 | null,
): NormalizedStudioBrushTextureSettingsV1 {
  const src = input && typeof input === "object" ? input : {};
  const mode =
    typeof src.mode === "string" && COMBINE_MODE_SET_V1.has(src.mode)
      ? (src.mode as StudioBrushTextureCombineModeV1)
      : DEFAULT_TEXTURE_V1.mode;
  return Object.freeze({
    depthControl: normalizeStudioBrushTextureDepthControlV1(src.depthControl),
    mode,
    depth: clampSetting(src.depth, STUDIO_BRUSH_TEXTURE_LIMITS_V1.depth, DEFAULT_TEXTURE_V1.depth),
    depthJitter: clampSetting(
      src.depthJitter,
      STUDIO_BRUSH_TEXTURE_LIMITS_V1.depthJitter,
      DEFAULT_TEXTURE_V1.depthJitter,
    ),
    minimumDepth: clampSetting(
      src.minimumDepth,
      STUDIO_BRUSH_TEXTURE_LIMITS_V1.minimumDepth,
      DEFAULT_TEXTURE_V1.minimumDepth,
    ),
    brightness: clampSetting(
      src.brightness,
      STUDIO_BRUSH_TEXTURE_LIMITS_V1.brightness,
      DEFAULT_TEXTURE_V1.brightness,
    ),
    contrast: clampSetting(
      src.contrast,
      STUDIO_BRUSH_TEXTURE_LIMITS_V1.contrast,
      DEFAULT_TEXTURE_V1.contrast,
    ),
    invert: src.invert === true,
  });
}

/** 텍스처가 실제로 잉크를 바꿀 수 있는 설정인가(깊이 0이면 height 외 모드는 항등에 수렴). */
export function studioBrushTextureIsActiveV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
): boolean {
  return settings.depth > 0;
}

/**
 * 레벨 조정·깊이 흔들림이 전혀 없는 순수 multiply인가. 이 경우 결합은 `1 − depth·(1 − pattern)`
 * 이라는 기존 그레인 산식과 동치이며, 배선 측은 부동소수점 연산 순서까지 같은 패스트패스로
 * 바이트 동일성을 보장할 수 있다.
 */
export function studioBrushTextureIsPlainMultiplyV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
): boolean {
  return settings.mode === "multiply"
    && settings.brightness === 0
    && settings.contrast === 0
    && settings.invert === false
    && settings.depthJitter === 0
    // 깊이 컨트롤이 걸린 설정은 샘플이 오면 깊이가 달라질 수 있어 순수 multiply가 아니다.
    // 컨트롤이 없던 레거시 설정은 depthControl이 null이라 판정이 기존과 동일하다.
    && settings.depthControl === null;
}

// ---------------------------------------------------------------------------
// 결정적 해시 — (strokeSeed, dabIndex) → 0..1. 건식 커널과 같은 무상태 규율.
// ---------------------------------------------------------------------------

function dabUnitHash(strokeSeed: number, dabIndex: number): number {
  let hash = Math.imul((strokeSeed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  hash ^= Math.imul((dabIndex | 0) + 0x27d4eb2d, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// 레벨 조정 — 패턴 원값 → 결합에 쓸 값
// ---------------------------------------------------------------------------

/**
 * 패턴 값에 brightness/contrast/invert를 적용한다.
 * brightness b: 값을 b·(150/255)만큼 이동. contrast c≥0: 이동 후 중간 회색 기준
 * 1/(1−c)배(c→1에서 임계). c<0: (1+c/2)배로 눕힌 뒤 이동 적용. invert는 마지막.
 */
export function resolveStudioBrushTextureLevelV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
  patternValue: number,
): number {
  const v = clamp01(finiteOr(patternValue, 0));
  const shift = settings.brightness * (150 / 255);
  const c = settings.contrast;
  const adjusted =
    c >= 0
      ? (v + shift - 0.5) / Math.max(1 - c, 1e-4) + 0.5
      : (v - 0.5) * (1 + c / 2) + 0.5 + shift;
  const clamped = clamp01(adjusted);
  return settings.invert ? 1 - clamped : clamped;
}

// ---------------------------------------------------------------------------
// dab별 깊이 — 획 안에서 텍스처가 눌리는 세기의 흔들림
// ---------------------------------------------------------------------------

/**
 * dab 하나의 실효 깊이(컨트롤 없음 — 기존 경로). jitter 0이면 설정 깊이 그대로(항등).
 * jitter>0이면 해시 u∈[0,1)에 대해 factor = 1 − jitter·(1−u) (u=1에서 온전, u=0에서 가장 약함),
 * 단 minimumDepth(깊이의 비율) 밑으로는 내려가지 않는다. 같은 (seed, index)는 항상 같은 값.
 * 컨트롤까지 해석하는 버전은 `resolveStudioBrushTextureControlledDabDepthV1`이며,
 * 이 함수는 그 함수의 샘플 없는 호출과 정확히 같다(기존 호출부·재현성 불변).
 */
export function resolveStudioBrushTextureDabDepthV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
  strokeSeed: number,
  dabIndex: number,
): number {
  const { depth, depthJitter, minimumDepth } = settings;
  if (depthJitter <= 0) return depth;
  const u = dabUnitHash(strokeSeed, dabIndex);
  const factor = Math.max(minimumDepth, 1 - depthJitter * (1 - u));
  return depth * clamp01(factor);
}

// ---------------------------------------------------------------------------
// 깊이 컨트롤 — 입력 컨트롤(필압·틸트 등) → 깊이 배율
// ---------------------------------------------------------------------------

/** 다이내믹스 정규화 샘플 중 깊이 컨트롤 어댑터가 읽는 부분(구조적 부분집합, import 없음). */
export interface StudioBrushDynamicsSampleForTextureDepthV1 {
  pressure?: number;
  tangentialPressureNormalized?: number;
  speedNormalized?: number;
  tiltMagnitude?: number;
  /** 도 단위 방위각(-180..180). */
  tiltAzimuth?: number;
  /** 도 단위 트위스트(0..359). */
  twist?: number;
  /** 도 단위 진행 방향. */
  direction?: number;
  hasTilt?: boolean;
  hasDirection?: boolean;
}

function normalizedAngle01(degrees: number): number {
  return (((degrees % 360) + 360) % 360) / 360;
}

function finiteSampleValue(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : null;
}

/**
 * 다이내믹스 정규화 샘플 → 깊이 컨트롤 샘플 어댑터. 각도 계열은 다이내믹스 sourceValue의
 * normalizedAngle과 같은 식으로 0..1에 환산한다. 배선 측은 정규화 샘플을 그대로 넘기면 된다.
 */
export function studioBrushTextureDepthControlSampleFromDynamicsV1(
  sample?: StudioBrushDynamicsSampleForTextureDepthV1 | null,
): StudioBrushTextureDepthControlSampleV1 {
  if (!sample || typeof sample !== "object") return {};
  const out: StudioBrushTextureDepthControlSampleV1 = {};
  const pressure = finiteSampleValue(sample.pressure);
  if (pressure !== null) out.pressure = pressure;
  const tangential = finiteSampleValue(sample.tangentialPressureNormalized);
  if (tangential !== null) out.tangentialPressureNormalized = tangential;
  const speed = finiteSampleValue(sample.speedNormalized);
  if (speed !== null) out.speedNormalized = speed;
  const tiltMagnitude = finiteSampleValue(sample.tiltMagnitude);
  if (tiltMagnitude !== null) out.tiltMagnitude = tiltMagnitude;
  if (typeof sample.tiltAzimuth === "number" && Number.isFinite(sample.tiltAzimuth)) {
    out.tiltAzimuthNormalized = normalizedAngle01(sample.tiltAzimuth);
  }
  if (typeof sample.twist === "number" && Number.isFinite(sample.twist)) {
    out.twistNormalized = clamp01(sample.twist / 360);
  }
  if (typeof sample.direction === "number" && Number.isFinite(sample.direction)) {
    out.directionNormalized = normalizedAngle01(sample.direction);
  }
  if (sample.hasTilt === true) out.hasTilt = true;
  if (sample.hasDirection === true) out.hasDirection = true;
  return out;
}

/**
 * 컨트롤 응답 0..1. 컨트롤이 없거나, 샘플이 없거나, 소스가 비활성(값 없음·각도 소스의
 * 활성 플래그 없음)이면 null(중립)을 돌려준다 — 호출자는 null을 배율 1로 취급한다.
 * 응답 곡선은 다이내믹스 매핑과 같은 규율: invert를 먼저 적용한 뒤 거듭제곱 곡선.
 * 소스별 의미·기본 곡선은 DESIGN.md §3 표가 확정본이다.
 */
export function resolveStudioBrushTextureDepthControlResponseV1(
  control: NormalizedStudioBrushTextureDepthControlV1 | null,
  sample?: StudioBrushTextureDepthControlSampleV1 | null,
): number | null {
  if (!control || control.strength <= 0 || !sample || typeof sample !== "object") return null;
  let raw: number | null;
  switch (control.source) {
    case "pressure":
      raw = finiteSampleValue(sample.pressure);
      break;
    case "tangential-pressure":
      raw = finiteSampleValue(sample.tangentialPressureNormalized);
      break;
    case "speed":
      raw = finiteSampleValue(sample.speedNormalized);
      break;
    case "tilt":
    case "tilt-magnitude":
      raw = finiteSampleValue(sample.tiltMagnitude);
      break;
    case "tilt-azimuth":
      raw = sample.hasTilt === true ? finiteSampleValue(sample.tiltAzimuthNormalized) : null;
      break;
    case "twist":
      raw = finiteSampleValue(sample.twistNormalized);
      break;
    case "direction":
      raw = sample.hasDirection === true ? finiteSampleValue(sample.directionNormalized) : null;
      break;
    default:
      raw = null;
      break;
  }
  if (raw === null) return null;
  const linear = control.invert ? 1 - raw : raw;
  return Math.pow(linear, control.curve);
}

/**
 * 컨트롤까지 포함한 dab 실효 깊이.
 * 배율 합성(확정): jitterFactor는 기존 해시 지터 배율(지터 0이면 1),
 * controlFactor = 1 − strength·(1 − 응답) (중립이면 정확히 1),
 * 실효 깊이 = depth · clamp01(max(minimumDepth, jitterFactor × controlFactor)).
 * 즉 minimumDepth는 지터와 컨트롤이 공통으로 공유하는 단일 하한이며, 어떤 소스 조합에서도
 * 실효 깊이는 depth·minimumDepth 밑으로 내려가지 않는다. 컨트롤이 중립이면 controlFactor가
 * 1이라 기존 해시 지터 산식과 연산 결과까지 동일하다.
 */
export function resolveStudioBrushTextureControlledDabDepthV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
  strokeSeed: number,
  dabIndex: number,
  sample?: StudioBrushTextureDepthControlSampleV1 | null,
): number {
  const response = resolveStudioBrushTextureDepthControlResponseV1(
    settings.depthControl,
    sample,
  );
  if (response === null) return resolveStudioBrushTextureDabDepthV1(settings, strokeSeed, dabIndex);
  const { depth, depthJitter, minimumDepth } = settings;
  const jitterFactor =
    depthJitter <= 0
      ? 1
      : Math.max(minimumDepth, 1 - depthJitter * (1 - dabUnitHash(strokeSeed, dabIndex)));
  const control = settings.depthControl as NormalizedStudioBrushTextureDepthControlV1;
  const controlFactor = 1 - control.strength * (1 - response);
  const factor = Math.max(minimumDepth, jitterFactor * controlFactor);
  return depth * clamp01(factor);
}

// ---------------------------------------------------------------------------
// 결합 — (coverage, patternValue, depth) → coverage
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 텍스처 결합 본체. v=coverage(0..1), t=레벨 조정된 패턴 값(0..1), d=실효 깊이(0..1).
 * 모든 모드는 v<=0에서 0을 돌려준다(빈 곳에 잉크를 만들지 않는다).
 *
 * - multiply: v·(1−d+d·t). t=1이면 항등, 어두운 패턴일수록 옅어진다(기존 그레인과 동등 경로).
 * - subtract: v−d·t. 밝은 패턴이 가장 많이 덜어낸다.
 * - darken: min(v, 1−d+d·t).
 * - overlay: v 기준 오버레이 블렌드를 깊이만큼 혼합.
 * - color-dodge / color-burn: 패턴을 중립색 쪽으로 깊이만큼 당긴 뒤 닷지/번.
 * - linear-burn: lerp(v, max(0, v+t−1), d).
 * - hard-mix: lerp(v, v+t>1 ? 1 : 0, d) — 포스터화된 거친 질감.
 * - height: 패턴을 높이로 보고 브러시가 `HEIGHT_REACH·d·v`까지 눌러 닿는 만큼만 남긴다.
 *   낮은 깊이에서는 어두운 골에만 잉크가 닿고, 깊이 약 17%부터 전면에 닿는다.
 *   깊이는 1/255 단위로 양자화한다(실측에서 드러나는 계단).
 * - linear-height: height와 같되 닿는 높이가 패턴 꼭대기보다 낮으면 패턴만큼 페이드한다.
 */
export function combineStudioBrushTextureCoverageV1(
  mode: StudioBrushTextureCombineModeV1,
  coverage: number,
  patternValue: number,
  depth: number,
): number {
  const v = finiteOr(coverage, 0);
  if (v <= 0) return 0;
  const t = clamp01(finiteOr(patternValue, 0));
  const d = clamp01(finiteOr(depth, 0));
  let result: number;
  switch (mode) {
    case "multiply":
      result = v * (1 - d + d * t);
      break;
    case "subtract":
      result = v - d * t;
      break;
    case "darken":
      result = Math.min(v, 1 - d + d * t);
      break;
    case "overlay": {
      const overlaid = v < 0.5 ? 2 * v * t : 1 - 2 * (1 - v) * (1 - t);
      result = lerp(v, overlaid, d);
      break;
    }
    case "color-dodge":
      result = lerp(v, Math.min(1, v / Math.max(1 - t, 1e-3)), d);
      break;
    case "color-burn":
      result = lerp(v, 1 - Math.min(1, (1 - v) / Math.max(t, 1e-3)), d);
      break;
    case "linear-burn":
      result = lerp(v, Math.max(0, v + t - 1), d);
      break;
    case "hard-mix":
      result = lerp(v, v + t > 1 ? 1 : 0, d);
      break;
    case "height": {
      const steppedDepth = Math.round(d * 255) / 255;
      result = STUDIO_BRUSH_TEXTURE_HEIGHT_REACH_V1 * steppedDepth * v - t;
      break;
    }
    case "linear-height": {
      const steppedDepth = Math.round(d * 255) / 255;
      const reach = STUDIO_BRUSH_TEXTURE_HEIGHT_REACH_V1 * steppedDepth * v;
      result = reach < 1 ? reach * (1 - t) : reach - t;
      break;
    }
    default:
      result = v * (1 - d + d * t);
      break;
  }
  return Number.isFinite(result) ? clamp01(result) : 0;
}

/**
 * 한 dab·한 텍셀의 전체 경로: 패턴 원값 → 레벨 조정 → dab 깊이 → 결합.
 * 패턴 조회(공간 샘플링)는 호출자가 맡는다 — 이 함수는 값만 받는다.
 * 선택 인자 depthControlSample을 주면 깊이에 입력 컨트롤이 걸리고, 생략하면 기존
 * 해시 지터 전용 경로와 정확히 같다(기존 호출부 시그니처·결과 불변).
 */
export function applyStudioBrushTextureV1(
  settings: NormalizedStudioBrushTextureSettingsV1,
  coverage: number,
  rawPatternValue: number,
  strokeSeed: number,
  dabIndex: number,
  depthControlSample?: StudioBrushTextureDepthControlSampleV1 | null,
): number {
  const levelled = resolveStudioBrushTextureLevelV1(settings, rawPatternValue);
  const depth =
    depthControlSample == null
      ? resolveStudioBrushTextureDabDepthV1(settings, strokeSeed, dabIndex)
      : resolveStudioBrushTextureControlledDabDepthV1(
          settings,
          strokeSeed,
          dabIndex,
          depthControlSample,
        );
  return combineStudioBrushTextureCoverageV1(settings.mode, coverage, levelled, depth);
}
