/**
 * 텍스처 브러시 GPU 단계: dab 필압을 256칸 단조 LUT 로 바꿔 크기·불투명도·흐름에 반영하고, 종이 결을
 * 이빨 문턱(건식 peak-catch, Chu & Tai 계열의 "높이가 문턱을 넘는 곳에만 침착, 문턱은 필압이 셀수록 내려감")으로
 * 평가한다. 계산은 셰이더 안에서 하고, 이 모듈은 그 입력(정규화된 응답·uniform 배치)과 WGSL 조각,
 * 셰이더 산술의 TS 재현을 함께 둔다.
 *
 * 기본값(응답 없음)은 LUT 항등·이빨 끔이다. 이때 셰이더는 크기·알파에 정확히 1.0 을 곱하고 결 변조는 기존 식
 * `mix(1, grain, depth)` 를 select 로 그대로 고르므로 계산이 기존과 같다(인스턴스 버퍼 배치도 바뀌지 않는다).
 *
 * 침착 수학은 CPU 권위(`resolveStudioPaperDepositScaleForHeightV1` 의 peak-catch)와 같은 식이고 매체 프리셋 값을
 * 그대로 가져올 수 있다(`studioWebGpuPaperToothForMedium`). 높이는 계획의 결(절차 노이즈·R8 에셋)을 쓰므로
 * CPU 문서 렌더러의 종이 타일과 같은 픽셀을 내지는 않는다. 실기기 GPU 픽셀은 검증하지 않았다.
 */
import {
  isStudioPaperMediumV1,
  STUDIO_PAPER_MEDIA_INTERACTION_V1,
} from "../brush/studio-paper-media-profile-v1";
import {
  normalizeStudioStylusPressureProfile,
  studioStylusPressureProfileMap,
} from "../brush/studio-stylus-pressure-profile";
import { studioPressureCurveMap } from "../studio-pressure-curve-graph";

import {
  fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics,
  type StudioEngineWebGpuTexturedBrushPlan,
} from "./studio-engine-webgpu-textured-brush-plan";
import {
  STUDIO_WEBGPU_PRESSURE_LUT_SIZE,
  STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS,
  STUDIO_WEBGPU_PRESSURE_TOOTH_VERSION,
  type StudioWebGpuPaperTooth,
  type StudioWebGpuPressureToothResponse,
} from "./studio-webgpu-pressure-tooth-contract";

const f32 = Math.fround;
const LAST = STUDIO_WEBGPU_PRESSURE_LUT_SIZE - 1;
/** 비율 분모의 하한과 비율 상한. gain=1·필압≈0 처럼 분모가 사라지는 병적 입력만 막는다. */
const RATIO_FLOOR = 1 / 64;
const RATIO_CEILING = 64;
/** 알파 상한(최종 알파 ≤ 1)을 계산할 때 0 나눗셈을 막는 하한. */
const ALPHA_FLOOR = 1 / 65536;
const MAX_TOOTH_PRESSURE_CURVE = 8;
const MAX_TOOTH_FEATHER = 0.5;

export interface StudioWebGpuPressureToothInput {
  readonly pressureLut?: readonly number[] | null;
  readonly sizeGain?: number;
  readonly opacityGain?: number;
  readonly flowGain?: number;
  readonly tooth?: StudioWebGpuPaperTooth | null;
}

function unitNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label}은 0~1 사이의 유한한 수여야 합니다(받은 값: ${String(value)}).`);
  }
  return f32(value);
}

/**
 * 매핑 함수를 필압 i/255 에서 표본화해 LUT 를 만든다. 값은 0~1 로 자르고 앞 칸보다 작아지지 않게 누적 최댓값을
 * 취해 단조 비감소를 보장한 뒤 f32 로 반올림한다. NaN·무한대를 돌려주는 함수는 거부한다.
 */
export function buildStudioWebGpuPressureLut(map: (pressure: number) => number): readonly number[] {
  const lut: number[] = [];
  let previous = 0;
  for (let index = 0; index <= LAST; index += 1) {
    const raw = map(index / LAST);
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new RangeError(`필압 매핑이 ${index}번째 칸에서 유한한 수를 돌려주지 않았습니다.`);
    }
    previous = f32(Math.min(1, Math.max(previous, raw)));
    lut.push(previous);
  }
  return Object.freeze(lut);
}

/** 기기 필압 프로필(데드존·포화·단조 점)로 LUT 를 만든다. 비활성 프로필은 항등이다. */
export function studioWebGpuPressureLutFromStylusProfile(profile: unknown): readonly number[] {
  const normalized = normalizeStudioStylusPressureProfile(profile);
  return buildStudioWebGpuPressureLut((pressure) => studioStylusPressureProfileMap(pressure, normalized));
}

/** 필압 곡선 그래프의 거듭제곱 곡선(지수 0.35~2.5)으로 LUT 를 만든다. 지수 1 은 항등이다. */
export function studioWebGpuPressureLutFromCurveExponent(exponent: number): readonly number[] {
  return buildStudioWebGpuPressureLut((pressure) => studioPressureCurveMap(pressure, exponent));
}

export function isStudioWebGpuPressureLutIdentity(lut: readonly number[]): boolean {
  return lut.length === STUDIO_WEBGPU_PRESSURE_LUT_SIZE && lut.every((value, index) => value === f32(index / LAST));
}

/** 건식 매체(peak-catch)의 CPU 침착 프리셋을 GPU 이빨 문턱으로 옮긴다. 다른 모드·알 수 없는 매체는 null. */
export function studioWebGpuPaperToothForMedium(medium: unknown): StudioWebGpuPaperTooth | null {
  if (!isStudioPaperMediumV1(medium)) return null;
  const profile = STUDIO_PAPER_MEDIA_INTERACTION_V1[medium];
  if (profile.mode !== "peak-catch") return null;
  return Object.freeze({
    thresholdLight: profile.contactThresholdLight,
    thresholdHeavy: profile.contactThresholdHeavy,
    feather: profile.contactFeather,
    pressureCurve: profile.pressureCurve,
  });
}

function normalizeTooth(value: unknown): StudioWebGpuPaperTooth | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new TypeError("종이 이빨 문턱 설정이 올바르지 않습니다.");
  const tooth = value as Partial<StudioWebGpuPaperTooth>;
  const thresholdLight = unitNumber(tooth.thresholdLight, "가벼운 필압 문턱");
  const thresholdHeavy = unitNumber(tooth.thresholdHeavy, "강한 필압 문턱");
  if (thresholdHeavy > thresholdLight) {
    throw new RangeError("강한 필압 문턱은 가벼운 필압 문턱보다 클 수 없습니다(문턱은 필압이 오르면 내려간다).");
  }
  const feather = tooth.feather;
  if (typeof feather !== "number" || !Number.isFinite(feather) || feather <= 0 || feather > MAX_TOOTH_FEATHER) {
    throw new RangeError(`이빨 문턱 페더는 0 초과 ${MAX_TOOTH_FEATHER} 이하여야 합니다(받은 값: ${String(feather)}).`);
  }
  const curve = tooth.pressureCurve;
  if (typeof curve !== "number" || !Number.isFinite(curve) || curve <= 0 || curve > MAX_TOOTH_PRESSURE_CURVE) {
    throw new RangeError(`이빨 문턱 필압 감마는 0 초과 ${MAX_TOOTH_PRESSURE_CURVE} 이하여야 합니다(받은 값: ${String(curve)}).`);
  }
  return Object.freeze({ thresholdLight, thresholdHeavy, feather: f32(feather), pressureCurve: f32(curve) });
}

function normalizeLut(value: unknown): readonly number[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== STUDIO_WEBGPU_PRESSURE_LUT_SIZE) {
    throw new TypeError(`필압 LUT 는 길이 ${STUDIO_WEBGPU_PRESSURE_LUT_SIZE}의 숫자 배열이어야 합니다.`);
  }
  const lut: number[] = [];
  value.forEach((item: unknown, index) => {
    const entry = unitNumber(item, `필압 LUT ${index}번째 칸`);
    if (index > 0 && entry < lut[index - 1]) throw new RangeError(`필압 LUT 는 단조 비감소여야 합니다(${index}번째 칸).`);
    lut.push(entry);
  });
  return isStudioWebGpuPressureLutIdentity(lut) ? null : Object.freeze(lut);
}

/**
 * 입력을 검증·정규화한 응답. 항등 LUT 는 null 이 되고(그때 gain 은 의미가 없어 0 으로 둔다), LUT 와 이빨이 모두
 * 꺼져 있으면 null 을 돌려준다(계획에 싣지 않는다 — 기본 경로와 같은 픽셀·같은 지문).
 */
export function createStudioWebGpuPressureToothResponse(
  input: StudioWebGpuPressureToothInput,
): StudioWebGpuPressureToothResponse | null {
  if (typeof input !== "object" || input === null) throw new TypeError("필압·이빨 설정이 올바르지 않습니다.");
  const pressureLut = normalizeLut(input.pressureLut);
  const tooth = normalizeTooth(input.tooth);
  const sizeGain = unitNumber(input.sizeGain ?? 0, "크기 필압 비중");
  const opacityGain = unitNumber(input.opacityGain ?? 0, "불투명도 필압 비중");
  const flowGain = unitNumber(input.flowGain ?? 0, "흐름 필압 비중");
  if (pressureLut === null && tooth === null) return null;
  return Object.freeze({
    kind: "studio-webgpu-pressure-tooth-response",
    version: STUDIO_WEBGPU_PRESSURE_TOOTH_VERSION,
    pressureLut,
    sizeGain: pressureLut === null ? 0 : sizeGain,
    opacityGain: pressureLut === null ? 0 : opacityGain,
    flowGain: pressureLut === null ? 0 : flowGain,
    tooth,
  });
}

/** 계획에 실린 값이 이 모듈이 만든 정규형 그대로인지(지문이 픽셀 의미를 정확히 대변하는지) 확인한다. */
export function isCanonicalStudioWebGpuPressureToothResponse(value: unknown): value is StudioWebGpuPressureToothResponse {
  try {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<StudioWebGpuPressureToothResponse>;
    if (candidate.kind !== "studio-webgpu-pressure-tooth-response" || candidate.version !== STUDIO_WEBGPU_PRESSURE_TOOTH_VERSION) {
      return false;
    }
    const normalized = createStudioWebGpuPressureToothResponse(candidate);
    return normalized !== null && JSON.stringify(normalized) === JSON.stringify(value);
  } catch {
    return false;
  }
}

/**
 * uniform 배치(268 float):
 *  [0] LUT 사용(0/1), [1..3] 크기·불투명도·흐름 비중,
 *  [4] 이빨 사용(0/1), [5] 가벼운 필압 문턱, [6] 강한 필압 문턱, [7] 페더,
 *  [8] 이빨 필압 감마, [9..11] 0, [12..267] LUT(꺼져 있으면 항등).
 * 꺼진 이빨에도 셰이더의 select 반대편이 정의된 값을 계산하도록 무해한 값(1, 0, 0.5, 1)을 둔다.
 */
export function packStudioWebGpuPressureToothUniform(
  response: StudioWebGpuPressureToothResponse | null | undefined,
  out: Float32Array = new Float32Array(STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS),
): Float32Array {
  if (out.length < STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS) throw new RangeError("uniform 버퍼가 너무 작습니다.");
  out.fill(0, 0, 12);
  const lut = response?.pressureLut ?? null;
  const tooth = response?.tooth ?? null;
  out[0] = lut === null ? 0 : 1;
  out[1] = response?.sizeGain ?? 0;
  out[2] = response?.opacityGain ?? 0;
  out[3] = response?.flowGain ?? 0;
  out[4] = tooth === null ? 0 : 1;
  out[5] = tooth?.thresholdLight ?? 1;
  out[6] = tooth?.thresholdHeavy ?? 0;
  out[7] = tooth?.feather ?? MAX_TOOTH_FEATHER;
  out[8] = tooth?.pressureCurve ?? 1;
  for (let index = 0; index <= LAST; index += 1) out[12 + index] = lut === null ? index / LAST : lut[index];
  return out;
}

/**
 * 계획에 응답을 싣고(또는 null 로 뗀 뒤) 계획에 지문이 있었다면 다시 계산한다. 응답은 정규형이어야 한다.
 * 런타임은 정규형이 아닌 응답을 실은 계획을 invalid-frame 으로 거부한다.
 */
export function withStudioWebGpuPressureTooth(
  plan: StudioEngineWebGpuTexturedBrushPlan,
  response: StudioWebGpuPressureToothResponse | null,
): StudioEngineWebGpuTexturedBrushPlan {
  if (response !== null && !isCanonicalStudioWebGpuPressureToothResponse(response)) {
    throw new TypeError("정규화된 필압·이빨 응답만 계획에 실을 수 있습니다.");
  }
  const next: StudioEngineWebGpuTexturedBrushPlan = {
    ...plan,
    gpuPressureTooth: response ?? undefined,
    semanticFingerprint: undefined,
  };
  if (plan.semanticFingerprint === undefined) return next;
  const recomputed = fingerprintStudioEngineWebGpuTexturedBrushPlanSemantics(next);
  if (!recomputed) throw new RangeError("계획 지문을 다시 계산하지 못했습니다.");
  return { ...next, semanticFingerprint: recomputed };
}

/** 텍스처 브러시 셰이더에 들어가는 WGSL 조각(uniform 구조체·바인딩·함수 4개). 산술은 아래 TS 재현과 같다. */
export function buildStudioWebGpuPressureToothWgsl(options: Readonly<{ group?: number; binding?: number }> = {}): string {
  const group = options.group ?? 0;
  const binding = options.binding ?? 5;
  if (![group, binding].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000)) {
    throw new RangeError("WGSL 바인딩 번호가 올바르지 않습니다.");
  }
  return `
struct StudioPressureToothUniform {
  pressure: vec4f,
  tooth: vec4f,
  tooth_curve: vec4f,
  lut: array<vec4f, 64>,
}

@group(${group}) @binding(${binding}) var<uniform> studio_pressure_tooth: StudioPressureToothUniform;

fn studio_pressure_lut(pressure: f32) -> f32 {
  let x = clamp(pressure, 0.0, 1.0) * 255.0;
  let i0 = min(u32(floor(x)), 254u);
  let i1 = i0 + 1u;
  let f = x - f32(i0);
  let a = studio_pressure_tooth.lut[i0 >> 2u][i0 & 3u];
  let b = studio_pressure_tooth.lut[i1 >> 2u][i1 & 3u];
  return mix(a, b, f);
}

fn studio_pressure_ratio(gain: f32, pressure: f32, mapped: f32) -> f32 {
  let base_response = 1.0 - gain + gain * pressure;
  let mapped_response = 1.0 - gain + gain * mapped;
  return select(
    clamp(mapped_response / max(base_response, ${RATIO_FLOOR}), 0.0, ${RATIO_CEILING}.0),
    1.0,
    mapped_response == base_response,
  );
}

// x: size ratio, y: alpha ratio, z: mapped pressure, w: paper tooth threshold.
fn studio_pressure_response(pressure: f32, alpha: f32) -> vec4f {
  let lut_enabled = studio_pressure_tooth.pressure.x > 0.5;
  let mapped = select(pressure, studio_pressure_lut(pressure), lut_enabled);
  let size_ratio = studio_pressure_ratio(studio_pressure_tooth.pressure.y, pressure, mapped);
  let opacity_ratio = studio_pressure_ratio(studio_pressure_tooth.pressure.z, pressure, mapped);
  let flow_ratio = studio_pressure_ratio(studio_pressure_tooth.pressure.w, pressure, mapped);
  let alpha_ratio = min(opacity_ratio * flow_ratio, 1.0 / max(alpha, ${ALPHA_FLOOR}));
  let contact = clamp(mapped, 0.0, 1.0);
  let flood = select(pow(contact, studio_pressure_tooth.tooth_curve.x), 0.0, contact <= 0.0);
  let light = studio_pressure_tooth.tooth.y;
  let threshold = light + (studio_pressure_tooth.tooth.z - light) * flood;
  return vec4f(select(1.0, size_ratio, lut_enabled), select(1.0, alpha_ratio, lut_enabled), mapped, threshold);
}

fn studio_paper_grain_factor(height: f32, depth: f32, threshold: f32) -> f32 {
  let legacy = mix(1.0, height, depth);
  let feather = studio_pressure_tooth.tooth.w;
  let deposit = smoothstep(threshold - feather, threshold + feather, height);
  return select(legacy, mix(1.0, deposit, depth), studio_pressure_tooth.tooth.x > 0.5);
}
`;
}

// ---------------------------------------------------------------------------
// TS 재현(shader mirror): 위 WGSL 과 같은 순서의 f32 연산. 입력은 packStudioWebGpuPressureToothUniform 결과다.
// ---------------------------------------------------------------------------

function mixF32(a: number, b: number, t: number): number {
  return f32(f32(a * f32(1 - t)) + f32(b * t));
}

function clampF32(value: number, minimum: number, maximum: number): number {
  return f32(Math.min(Math.max(value, minimum), maximum));
}

function mirrorLut(uniform: Float32Array, pressure: number): number {
  const x = f32(clampF32(f32(pressure), 0, 1) * 255);
  const i0 = Math.min(Math.floor(x), 254);
  const fraction = f32(x - i0);
  return mixF32(uniform[12 + i0], uniform[12 + i0 + 1], fraction);
}

function mirrorRatio(gain: number, pressure: number, mapped: number): number {
  const keep = f32(1 - gain);
  const baseResponse = f32(keep + f32(gain * pressure));
  const mappedResponse = f32(keep + f32(gain * mapped));
  if (mappedResponse === baseResponse) return 1;
  return clampF32(f32(mappedResponse / f32(Math.max(baseResponse, f32(RATIO_FLOOR)))), 0, RATIO_CEILING);
}

export interface StudioWebGpuPressureToothDabMirror {
  readonly sizeRatio: number;
  readonly alphaRatio: number;
  readonly mappedPressure: number;
  readonly toothThreshold: number;
}

/** `studio_pressure_response(pressure, alpha)` 재현(정점 단계, dab 마다 한 번). */
export function mirrorStudioWebGpuPressureResponse(
  uniform: Float32Array,
  pressure: number,
  alpha: number,
): StudioWebGpuPressureToothDabMirror {
  const p = f32(pressure);
  const lutEnabled = uniform[0] > 0.5;
  const mapped = lutEnabled ? mirrorLut(uniform, p) : p;
  const sizeRatio = mirrorRatio(uniform[1], p, mapped);
  const alphaRatio = f32(Math.min(f32(mirrorRatio(uniform[2], p, mapped) * mirrorRatio(uniform[3], p, mapped)),
    f32(1 / f32(Math.max(f32(alpha), f32(ALPHA_FLOOR))))));
  const contact = clampF32(mapped, 0, 1);
  const flood = contact <= 0 ? 0 : f32(Math.pow(contact, uniform[8]));
  const threshold = f32(uniform[5] + f32(f32(uniform[6] - uniform[5]) * flood));
  return {
    sizeRatio: lutEnabled ? sizeRatio : 1,
    alphaRatio: lutEnabled ? alphaRatio : 1,
    mappedPressure: mapped,
    toothThreshold: threshold,
  };
}

/** `studio_paper_grain_factor(height, depth, threshold)` 재현(조각 단계, 픽셀마다). */
export function mirrorStudioWebGpuPaperGrainFactor(
  uniform: Float32Array,
  height: number,
  depth: number,
  threshold: number,
): number {
  const h = f32(height);
  const d = f32(depth);
  const legacy = mixF32(1, h, d);
  if (!(uniform[4] > 0.5)) return legacy;
  const feather = uniform[7];
  const low = f32(f32(threshold) - feather);
  const high = f32(f32(threshold) + feather);
  const t = clampF32(f32(f32(h - low) / f32(high - low)), 0, 1);
  const deposit = f32(f32(t * t) * f32(3 - f32(2 * t)));
  return mixF32(1, deposit, d);
}
