/**
 * Magma 브러시 공용 PRNG 및 기본 설정 타입 — studio-magma-brush-engine.ts와
 * studio-magma-brush-presets.ts 간 순환 의존성 제거용 리프 모듈.
 */

export type MagmaPatternBlendMode =
  | "multiply"
  | "subtract"
  | "darken"
  | "overlay"
  | "color-dodge"
  | "color-burn"
  | "linear-burn"
  | "hard-mix"
  | "linear-height"
  | "height";

export interface AnisotropicSpreadConfig {
  /** 진행 방향에 수직인 법선 방향 분산 강도 (0..5, 크기 배율) */
  readonly normalSpread: number;
  /** 진행 방향과 나란한 접선 방향 분산 강도 (0..5, 크기 배율) */
  readonly tangentSpread: number;
  /** true이면 법선과 접선 분산을 독립 적용, false이면 normalSpread를 양축에 동일 적용 */
  readonly separateSpread: boolean;
  /** 스텝당 방출할 분산 입자 수 (1..16) */
  readonly count?: number;
}

export interface MagmaBrushDynamicsConfig {
  readonly sizePx: number;
  readonly minSizePressure: number;
  readonly maxSizePressure: number;
  readonly sizePressure: boolean;
  readonly minSizeTilt: number;
  readonly maxSizeTilt: number;
  readonly sizeTilt: boolean;
  readonly roundness: number;
  readonly minRoundness: number;
  readonly roundnessPressure: boolean;
  readonly roundnessTilt: boolean;
  readonly stretch: number;
  readonly minStretch: number;
  readonly stretchPressure: boolean;
  readonly stretchTilt: boolean;
  readonly hardness: number;
  readonly opacity: number;
  readonly flow: number;
  readonly spacingRatio: number;
  readonly angleDeg: number;
  readonly angleToDirection: boolean;
  readonly angleInitialDirection: boolean;
  readonly angleJitter: number;
  readonly pixelation: boolean;
  readonly spread: AnisotropicSpreadConfig;
  readonly dualSpread?: AnisotropicSpreadConfig;
  readonly colorPressure: boolean;
  readonly colorTilt: boolean;
  readonly foregroundBackgroundJitter: number;
  readonly hueJitter: number;
  readonly saturationJitter: number;
  readonly brightnessJitter: number;
  readonly patternBlendMode: MagmaPatternBlendMode;
  readonly patternEachStamp: boolean;
  readonly patternScale: number;
  readonly patternContrast: number;
  /** Magma 시그니처 Vine 브러시용: 한쪽 에지는 선명하고 반대쪽 에지는 부드러운 비대칭 경도 차 (0..1) */
  readonly asymmetricEdgeSoftness?: number;
}

/** 결정론적 SplitMix32 난수 생성기 (0..1 반환) */
export function createDeterministicPrng(seed: number): () => number {
  let state = (Math.trunc(seed) | 0) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 0x100000000;
  };
}
