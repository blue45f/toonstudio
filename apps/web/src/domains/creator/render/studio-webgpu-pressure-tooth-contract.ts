/**
 * 텍스처 브러시 GPU 단계의 "필압 LUT + 종이 이빨 문턱" 계약(타입·배치 상수만).
 *
 * 텍스처 브러시 계획(`studio-engine-webgpu-textured-brush-plan.ts`)이 선택 필드로 이 값을 실을 수 있고,
 * 런타임이 uniform 으로 올려 셰이더가 dab 마다 평가한다. 계획 모듈과 구현 모듈이 서로를 실행 시점에
 * 가져오지 않도록 타입과 상수만 여기 둔다. 구현은 `studio-webgpu-pressure-tooth.ts` 에 있다.
 */

export const STUDIO_WEBGPU_PRESSURE_TOOTH_VERSION = 1 as const;
/** 필압 LUT 칸 수. 칸 i 는 필압 i/255 의 출력이다. */
export const STUDIO_WEBGPU_PRESSURE_LUT_SIZE = 256;
/** uniform 머리(vec4 3개) + LUT(vec4 64개) = 268 float = 1,072 바이트. */
export const STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS = 12 + STUDIO_WEBGPU_PRESSURE_LUT_SIZE;
export const STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_BYTES =
  STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/**
 * 종이 이빨 문턱(건식 peak-catch). 종이 높이(0..1)가 문턱보다 높은 곳에만 안료가 앉는다.
 * 문턱 = thresholdLight + (thresholdHeavy − thresholdLight) · 필압^pressureCurve — 필압이 셀수록 내려간다.
 * 침착 = smoothstep(문턱 − feather, 문턱 + feather, 높이).
 */
export interface StudioWebGpuPaperTooth {
  /** 필압 0 의 문턱(봉우리만 닿는 높이). 0..1. */
  readonly thresholdLight: number;
  /** 필압 1 의 문턱. 0..thresholdLight(필압이 오르면 문턱은 내려가기만 한다). */
  readonly thresholdHeavy: number;
  /** smoothstep 반폭. (0, 0.5]. */
  readonly feather: number;
  /** 문턱 보간에 거는 필압 감마. (0, 8]. */
  readonly pressureCurve: number;
}

/**
 * 계획에 싣는 정규화된 응답. `createStudioWebGpuPressureToothResponse` 만 만든다(동결된 순수 객체라
 * 계획 지문 JSON 에 그대로 들어간다).
 *
 * dab 의 필압 p 를 LUT 로 q = LUT(p) 로 바꾼 뒤, 채널마다 선형 필압 응답 r(x) = 1 − gain + gain·x 의
 * 비율 r(q)/r(p) 를 계획의 크기·불투명도·흐름에 곱한다. LUT 가 항등이면(q = p) 비율은 정확히 1 이다.
 */
export interface StudioWebGpuPressureToothResponse {
  readonly kind: "studio-webgpu-pressure-tooth-response";
  readonly version: typeof STUDIO_WEBGPU_PRESSURE_TOOTH_VERSION;
  /** 단조 비감소 256칸(0..1, f32 값). 항등 LUT 는 null 로 정규화한다(필압 단계 끔). */
  readonly pressureLut: readonly number[] | null;
  /** 크기가 필압을 따르는 정도 0..1. */
  readonly sizeGain: number;
  /** 불투명도가 필압을 따르는 정도 0..1. */
  readonly opacityGain: number;
  /** 흐름이 필압을 따르는 정도 0..1. */
  readonly flowGain: number;
  /** null 이면 종이 이빨 문턱을 쓰지 않는다(기존 결 변조 그대로). */
  readonly tooth: StudioWebGpuPaperTooth | null;
}
