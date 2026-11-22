/**
 * 속도·필압 이방성 갈필(Dry-Brush Split) +
 * 7밴드 Kubelka-Munk 이원 과립화(Dual-Pigment Granulation) +
 * 8~16채널 가상 붓모 픽업(Dirty Bristle Pickup) 교차 스트로크 상태 모델.
 *
 * - 기존 `studio-webgpu-km7-spectral-core` 7밴드 분광 물리 코어를 재사용한다.
 * - 100% 클린룸 결정적 계산, `any` 0건, 브라우저 로컬 ₩0.
 */

import {
  KM7_REFLECTANCE_FLOOR,
  km7KsFromReflectance,
  km7LinearRgbToSpectrum7,
  km7LinearToSrgb,
  km7ReflectanceFromKs,
  km7Spectrum7ToLinearRgb,
  km7SrgbToLinear,
  mixKm7SpectralSrgb,
  type Km7Rgb01,
  type Km7Spectrum7,
} from "../../render/studio-webgpu-km7-spectral-core";

export const MIN_BRISTLE_STRAND_COUNT = 8 as const;
export const MAX_BRISTLE_STRAND_COUNT = 16 as const;

export interface AnisotropicDryBrushInput {
  /** 스트로크 속도 (px/ms, 0..8). */
  readonly strokeSpeed: number;
  /** 필압 [0..1]. */
  readonly pressure: number;
  /** 현재 남은 물감 충전량 [0..1]. */
  readonly paintReserve: number;
  /** 스트로크 진행 각도(라디안). */
  readonly strokeAngleRad: number;
  /** 가상 붓모 스트랜드 개수 (8..16, 기본 12). */
  readonly bristleCount?: number;
  /** 현재 위치의 종이 높이 [0..1]. */
  readonly paperHeight: number;
  /** 현재 위치의 종이 결 단위 방향 X. */
  readonly paperGrainDirX: number;
  /** 현재 위치의 종이 결 단위 방향 Y. */
  readonly paperGrainDirY: number;
  /** 스탬프 내 진행 축 정규화 좌표 [-1..1]. */
  readonly stampCoordU: number;
  /** 스탬프 내 횡방향 정규화 좌표 [-1..1]. */
  readonly stampCoordV: number;
  /** 결정적 입자 산란 시드. */
  readonly seed?: number;
}

export interface AnisotropicDryBrushResult {
  /** 갈필 적용 최종 붓모 스트랜드 마스크 [0..1]. */
  readonly strandMask: number;
  /** 고속·고갈에 따른 갈필 갈라짐 강도 [0..1]. */
  readonly splitSeverity: number;
  /** 현재 횡좌표가 속한 스트랜드 인덱스 [0..bristleCount-1]. */
  readonly strandIndex: number;
  /** 종이 결 주축 방향 입자 산란 오프셋 X (px 단위 기준). */
  readonly scatterOffsetX: number;
  /** 종이 결 주축 방향 입자 산란 오프셋 Y (px 단위 기준). */
  readonly scatterOffsetY: number;
  /** 종이 결 주축/직교축 분산 비 (저속 강필압에서 > 1.8). */
  readonly anisotropyRatio: number;
  /** 저속 강필압 산란 가중치 [0..1]. */
  readonly slowHeavyFactor: number;
}

export interface GranulatingPigmentSpec {
  readonly id: string;
  readonly label: string;
  /** 0..1 sRGB 기준색. */
  readonly srgb: Km7Rgb01;
  /** 안료 입자 비중 (1.2 가벼운 유기염료 ~ 4.8 무거운 광물안료). */
  readonly specificGravity: number;
  /** 종이 골짜기 응집·침강 친화도(flocculation) [0..1]. */
  readonly flocculation: number;
  /** 7밴드 KM 착색력(tinting strength, 기본 1). */
  readonly tintingStrength?: number;
}

export interface DualPigmentGranulationPair {
  readonly id: string;
  readonly label: string;
  readonly heavyPigment: GranulatingPigmentSpec;
  readonly lightPigment: GranulatingPigmentSpec;
}

/** 100% 클린룸 물리 파라미터 기반 대표 이원 과립화(Super-Granulation) 안료 조합. */
export const DUAL_GRANULATION_PIGMENT_PRESETS: Readonly<Record<string, DualPigmentGranulationPair>> = Object.freeze({
  "mineral-dusk": Object.freeze({
    id: "mineral-dusk",
    label: "광물 황혼 (무거운 군청 + 가벼운 적갈)",
    heavyPigment: Object.freeze({
      id: "heavy-cobalt-mineral",
      label: "고비중 청색 광물",
      srgb: Object.freeze({ r: 0.14, g: 0.24, b: 0.68 }),
      specificGravity: 4.1,
      flocculation: 0.92,
      tintingStrength: 1.15,
    }),
    lightPigment: Object.freeze({
      id: "light-sienna-dye",
      label: "저비중 적갈 유기안료",
      srgb: Object.freeze({ r: 0.78, g: 0.34, b: 0.18 }),
      specificGravity: 1.35,
      flocculation: 0.22,
      tintingStrength: 0.95,
    }),
  }),
  "deep-forest": Object.freeze({
    id: "deep-forest",
    label: "깊은 숲 (무거운 철흑 + 가벼운 청록)",
    heavyPigment: Object.freeze({
      id: "heavy-iron-oxide-black",
      label: "고비중 산화철 흑색",
      srgb: Object.freeze({ r: 0.16, g: 0.15, b: 0.17 }),
      specificGravity: 4.6,
      flocculation: 0.95,
      tintingStrength: 1.25,
    }),
    lightPigment: Object.freeze({
      id: "light-viridian-teal",
      label: "저비중 청록 안료",
      srgb: Object.freeze({ r: 0.12, g: 0.66, b: 0.56 }),
      specificGravity: 1.45,
      flocculation: 0.25,
      tintingStrength: 1.0,
    }),
  }),
});

export interface DualPigmentGranulationInput {
  readonly heavyPigment: GranulatingPigmentSpec;
  readonly lightPigment: GranulatingPigmentSpec;
  /** 종이 높이 [0..1] (0 = 깊은 골짜기, 1 = 산봉우리). */
  readonly paperHeight: number;
  /** 젖음 가장자리 근접도 [0..1] (0 = 내부, 1 = 가장자리). */
  readonly radialEdge01: number;
  /** 습윤도 [0..1]. */
  readonly wetness: number;
  /** 과립화 분리 강도 [0..1] (기본 0.85). */
  readonly granulationStrength?: number;
  /** 초기 혼합 중 무거운 안료 기본 비율 [0..1] (기본 0.5). */
  readonly baseHeavyRatio?: number;
}

export interface DualPigmentGranulationResult {
  readonly srgb: Km7Rgb01;
  readonly spectrum7: Km7Spectrum7;
  /** 최종 픽셀 내 무거운 안료 분광 비중 [0..1]. */
  readonly heavyShare: number;
  /** 최종 픽셀 내 가벼운 안료 분광 비중 [0..1]. */
  readonly lightShare: number;
  /** 두 안료의 공간 분리 강도(|heavyShare - baseHeavyRatio| × 2). */
  readonly separationIndex: number;
}

export interface BristleStrandState {
  readonly index: number;
  /** 붓 폭 내 정규화 횡좌표 [-1..1]. */
  readonly offsetV: number;
  /** 스트랜드 강성 [0.6..1.0]. */
  readonly stiffness: number;
  /** 남은 물감 충전량 [0..1]. */
  paintLoad: number;
  /** 스트랜드가 현재 머금고 있는 0..1 sRGB 색. */
  reservoirSrgb: Km7Rgb01;
  /** 캔버스 타색 오염도 [0..1]. */
  dirtyLevel: number;
  /** 스트랜드 습윤도 [0..1]. */
  wetness: number;
}

export interface MultiChannelBristleBank {
  readonly strandCount: number;
  readonly basePaintSrgb: Km7Rgb01;
  readonly strands: readonly BristleStrandState[];
  stepCount: number;
}

export interface CreateBristleBankOptions {
  /** 가상 붓모 스트랜드 수 (8..16 범위로 정규화). */
  readonly strandCount?: number;
  /** 붓에 최초 충전한 원색 (sRGB 0..1). */
  readonly initialPaintSrgb: Km7Rgb01;
  /** 최초 물감 충전량 [0..1] (기본 0.92). */
  readonly initialLoad?: number;
  /** 최초 습윤도 [0..1] (기본 0.65). */
  readonly initialWetness?: number;
}

export interface BristleCrossStrokeStepInput {
  /** 스트랜드별 캔버스 젖은 색 (배열 길이가 strandCount보다 짧으면 순환/끝값 클램프). */
  readonly canvasSrgbPerStrand: readonly Km7Rgb01[];
  /** 스트랜드별 캔버스 습윤도 [0..1]. */
  readonly canvasWetnessPerStrand: readonly number[];
  /** 스트랜드별 종이 높이 [0..1] (선택, 기본 0.5). */
  readonly paperHeightPerStrand?: readonly number[];
  /** 필압 [0..1]. */
  readonly pressure: number;
  /** 스트로크 속도 (px/ms). */
  readonly speed: number;
  /** 캔버스 젖은 색 픽업 계수 [0..1] (기본 0.45). */
  readonly pickupRate?: number;
  /** 캔버스로 방출·소모 계수 [0..1] (기본 0.14). */
  readonly releaseRate?: number;
  /** Oklab 채도 보존 계수 [0..1] (기본 0.35). */
  readonly chromaPreserve?: number;
}

export interface BristleStrandDepositSample {
  readonly strandIndex: number;
  readonly offsetV: number;
  readonly depositSrgb: Km7Rgb01;
  readonly depositOpacity: number;
  readonly remainingLoad: number;
  readonly dirtyLevel: number;
}

export interface BristleBankStepResult {
  readonly deposits: readonly BristleStrandDepositSample[];
  readonly meanPaintLoad: number;
  readonly meanDirtyLevel: number;
  /** 스트랜드 간 sRGB 색 분산(교차 스트로크 멀티톤 지표). */
  readonly strandColorVariance: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function hash1dSigned(seed: number, k: number): number {
  let h = (Math.imul(k | 0, 1597334677) + Math.imul(seed | 0, 3812015801)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = h ^ (h >>> 13);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * 고속 스트로크 갈필(Dry-Brush Split) 마스크 + 저속 강필압 종이 결 방향 이방성 입자 산란을 계산한다.
 */
export function evaluateAnisotropicDryBrushStamp(
  input: AnisotropicDryBrushInput,
): AnisotropicDryBrushResult {
  const speed = clamp(input.strokeSpeed, 0, 12);
  const pressure = clamp01(input.pressure);
  const reserve = clamp01(input.paintReserve);
  const paperH = clamp01(input.paperHeight);
  const bristleCount = Math.max(
    MIN_BRISTLE_STRAND_COUNT,
    Math.min(MAX_BRISTLE_STRAND_COUNT, Math.round(input.bristleCount ?? 12)),
  );
  const u = clamp(input.stampCoordU, -1, 1);
  const v = clamp(input.stampCoordV, -1, 1);
  const seed = Math.trunc(input.seed ?? 20261122);

  // 1) 고속·물감 고갈 갈필 분열 강도
  const speedStress = clamp01((speed - 0.35) / 2.5);
  const depletion = 1 - reserve;
  const splitSeverity = clamp01(speedStress * 0.62 + depletion * 0.68 - pressure * 0.32);

  // 횡좌표 v ∈ [-1..1]을 bristleCount개의 개별 붓모 셀로 분할
  const vNorm = (v + 1) * 0.5;
  const scaled = vNorm * bristleCount;
  const strandIndex = Math.max(0, Math.min(bristleCount - 1, Math.floor(scaled)));
  const cellFrac = scaled - strandIndex; // [0..1]
  const distFromCenter = Math.abs(cellFrac - 0.5) * 2; // 0 = 붓모 중심, 1 = 붓모 사이 틈

  // 스트랜드별 고유 미세 길이·물감 편차
  const strandJitter = 0.5 + 0.5 * hash1dSigned(seed ^ 0x411, strandIndex * 31 + Math.round((u + 1) * 8));
  const radialFade = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u * 0.55 + v * v * 0.45)));

  // splitSeverity가 높을수록 스트랜드 폭이 가늘어지고 사이 틈이 0으로 갈라진다
  const activeHalfWidth = clamp(1 - splitSeverity * (0.68 + 0.22 * (1 - strandJitter)), 0.14, 1);
  const strandCore = distFromCenter >= activeHalfWidth ? 0 : 1 - distFromCenter / activeHalfWidth;

  // 갈필 상태에서는 종이 산봉우리(paperH가 높음)에만 안료가 걸리고 골짜기에서 끊어짐
  const ridgeThreshold = splitSeverity * (0.66 - 0.25 * pressure);
  const toothCatch =
    ridgeThreshold <= 0.01
      ? 1
      : clamp01((paperH - ridgeThreshold) / Math.max(0.12, 1 - ridgeThreshold));

  // 저속·풍부한 물감에서는 스트랜드 사이가 융합(coalesce)되어 매끄러운 면을 만든다
  const coalesce = (1 - splitSeverity) * (0.45 + 0.55 * reserve);
  const rawMask = radialFade * (coalesce + (1 - coalesce) * strandCore) * (0.2 + 0.8 * toothCatch);
  const strandMask = clamp01(rawMask * (0.15 + 0.85 * reserve) * (0.25 + 0.75 * pressure));

  // 2) 저속 강필압 종이 결 방향 이방성 입자 산란
  const slowHeavyFactor = clamp01((1 - speed / 1.4) * pressure);
  const gLen = Math.hypot(input.paperGrainDirX, input.paperGrainDirY) || 1;
  const gx = input.paperGrainDirX / gLen;
  const gy = input.paperGrainDirY / gLen;
  const perpX = -gy;
  const perpY = gx;

  const strokeDirX = Math.cos(input.strokeAngleRad);
  const strokeDirY = Math.sin(input.strokeAngleRad);
  const alignment = Math.abs(gx * strokeDirX + gy * strokeDirY);

  const baseScatter = 0.35 + 1.45 * (1 - paperH * 0.5);
  const sigmaAlong = baseScatter * (1 + 2.1 * slowHeavyFactor * (0.45 + 0.55 * alignment));
  const sigmaCross = baseScatter * (0.34 + 0.32 * (1 - slowHeavyFactor));
  const anisotropyRatio = sigmaAlong / Math.max(1e-5, sigmaCross);

  const key = strandIndex * 97 + Math.round((u + 1) * 100) * 13 + Math.round((v + 1) * 100);
  const rAlong = hash1dSigned(seed ^ 0x707, key);
  const rCross = hash1dSigned(seed ^ 0x809, key + 17);

  const scatterOffsetX = gx * (rAlong * sigmaAlong) + perpX * (rCross * sigmaCross);
  const scatterOffsetY = gy * (rAlong * sigmaAlong) + perpY * (rCross * sigmaCross);

  return {
    strandMask,
    splitSeverity,
    strandIndex,
    scatterOffsetX,
    scatterOffsetY,
    anisotropyRatio,
    slowHeavyFactor,
  };
}

/**
 * 붓 폭 단면(-1..1)을 샘플링해 갈필 갈라짐 간극 비율(gapFraction)을 진단한다.
 */
export function measureDryBrushSplitGapFraction(
  input: Omit<AnisotropicDryBrushInput, "stampCoordU" | "stampCoordV">,
  sampleCount = 64,
): { readonly gapFraction: number; readonly meanMask: number; readonly splitSeverity: number } {
  const n = Math.max(16, Math.trunc(sampleCount));
  let gapCount = 0;
  let sumMask = 0;
  let splitSeverity = 0;
  for (let i = 0; i < n; i += 1) {
    const v = -0.9 + (1.8 * i) / (n - 1);
    const res = evaluateAnisotropicDryBrushStamp({
      ...input,
      stampCoordU: 0,
      stampCoordV: v,
    });
    splitSeverity = res.splitSeverity;
    sumMask += res.strandMask;
    if (res.strandMask < 0.08) gapCount += 1;
  }
  return {
    gapFraction: gapCount / n,
    meanMask: sumMask / n,
    splitSeverity,
  };
}

/**
 * 7밴드 Kubelka-Munk 분광 계수별 입자 비중 차이를 이용한 이원 안료 과립화(Dual-Pigment Granulation).
 * - 무거운 안료(높은 specificGravity + flocculation)는 종이 골짜기(paperHeight 낮음)에 침강한다.
 * - 가벼운 안료(낮은 specificGravity)는 모세관 흐름을 타고 젖음 가장자리(radialEdge01 높음)로 확산한다.
 */
export function evaluateDualPigmentGranulationKm7(
  input: DualPigmentGranulationInput,
): DualPigmentGranulationResult {
  const paperH = clamp01(input.paperHeight);
  const edge = clamp01(input.radialEdge01);
  const wetness = clamp01(input.wetness);
  const strength = clamp01(input.granulationStrength ?? 0.85);
  const baseHeavyRatio = clamp01(input.baseHeavyRatio ?? 0.5);

  const sgHeavy = Math.max(0.5, input.heavyPigment.specificGravity);
  const sgLight = Math.max(0.5, input.lightPigment.specificGravity);
  const densityContrast = clamp01((sgHeavy - sgLight) / 3.0);

  const valley = 1 - paperH;
  const flocH = clamp01(input.heavyPigment.flocculation);
  const flocL = clamp01(input.lightPigment.flocculation);
  const drive = strength * wetness * densityContrast;

  // 골짜기에서 무거운 안료 농축, 가장자리/산등성이에서 가벼운 안료 확산
  const heavySpatial = Math.max(
    0.04,
    1 + drive * (2.35 * valley * valley * (0.4 + 0.6 * flocH) - 0.85 * edge * edge),
  );
  const lightSpatial = Math.max(
    0.04,
    1 + drive * (2.15 * edge * edge * (1.05 - 0.5 * flocL) + 0.65 * paperH - 0.45 * valley),
  );

  const tsH = clamp(input.heavyPigment.tintingStrength ?? 1, 0.1, 6);
  const tsL = clamp(input.lightPigment.tintingStrength ?? 1, 0.1, 6);
  const rawHeavy = baseHeavyRatio * heavySpatial * tsH;
  const rawLight = (1 - baseHeavyRatio) * lightSpatial * tsL;
  const totalWeight = Math.max(1e-6, rawHeavy + rawLight);
  const heavyShare = rawHeavy / totalWeight;
  const lightShare = rawLight / totalWeight;

  // 7밴드 Kubelka-Munk K/S 공간에서 직접 이원 분광 합성
  const linH: Km7Rgb01 = {
    r: km7SrgbToLinear(input.heavyPigment.srgb.r),
    g: km7SrgbToLinear(input.heavyPigment.srgb.g),
    b: km7SrgbToLinear(input.heavyPigment.srgb.b),
  };
  const linL: Km7Rgb01 = {
    r: km7SrgbToLinear(input.lightPigment.srgb.r),
    g: km7SrgbToLinear(input.lightPigment.srgb.g),
    b: km7SrgbToLinear(input.lightPigment.srgb.b),
  };
  const specH = km7LinearRgbToSpectrum7(linH);
  const specL = km7LinearRgbToSpectrum7(linL);

  const cH = heavyShare * specH.lum;
  const cL = lightShare * specL.lum;
  const invC = 1 / Math.max(1e-7, cH + cL);

  const blendBand = (rh: number, rl: number, bandIdx: number): number => {
    // 장파장/단파장 미세 산란 차이를 반영하되 순수 단색 보존(heavyShare=0 또는 1일 때 0 편향)
    const ksH = km7KsFromReflectance(rh);
    const ksL = km7KsFromReflectance(rl);
    const bandShift = 1 + 0.04 * (bandIdx - 3) * densityContrast * heavyShare * lightShare;
    const ks = ((ksH * cH + ksL * cL) * invC) * bandShift;
    return clamp(km7ReflectanceFromKs(ks), KM7_REFLECTANCE_FLOOR, 1);
  };

  const spectrum7: Km7Spectrum7 = {
    b0: blendBand(specH.b0, specL.b0, 0),
    b1: blendBand(specH.b1, specL.b1, 1),
    b2: blendBand(specH.b2, specL.b2, 2),
    b3: blendBand(specH.b3, specL.b3, 3),
    b4: blendBand(specH.b4, specL.b4, 4),
    b5: blendBand(specH.b5, specL.b5, 5),
    b6: blendBand(specH.b6, specL.b6, 6),
    lum: (specH.lum * cH + specL.lum * cL) * invC,
  };

  const outLin = km7Spectrum7ToLinearRgb(spectrum7);
  const srgb: Km7Rgb01 = {
    r: km7LinearToSrgb(outLin.r),
    g: km7LinearToSrgb(outLin.g),
    b: km7LinearToSrgb(outLin.b),
  };

  return {
    srgb,
    spectrum7,
    heavyShare,
    lightShare,
    separationIndex: clamp01(Math.abs(heavyShare - baseHeavyRatio) * 2),
  };
}

/**
 * 8~16개 가상 붓모 스트랜드가 개별 색·충전량·오염도를 보유하는 다채널 붓모 뱅크를 생성한다.
 */
export function createMultiChannelBristleBank(
  options: CreateBristleBankOptions,
): MultiChannelBristleBank {
  const strandCount = Math.max(
    MIN_BRISTLE_STRAND_COUNT,
    Math.min(MAX_BRISTLE_STRAND_COUNT, Math.round(options.strandCount ?? 12)),
  );
  const baseColor: Km7Rgb01 = {
    r: clamp01(options.initialPaintSrgb.r),
    g: clamp01(options.initialPaintSrgb.g),
    b: clamp01(options.initialPaintSrgb.b),
  };
  const initLoad = clamp01(options.initialLoad ?? 0.92);
  const initWet = clamp01(options.initialWetness ?? 0.65);

  const strands: BristleStrandState[] = [];
  for (let i = 0; i < strandCount; i += 1) {
    const offsetV = strandCount > 1 ? -1 + (2 * i) / (strandCount - 1) : 0;
    const stiffness = clamp(1 - Math.abs(offsetV) * 0.34, 0.62, 1);
    strands.push({
      index: i,
      offsetV,
      stiffness,
      paintLoad: initLoad,
      reservoirSrgb: { ...baseColor },
      dirtyLevel: 0,
      wetness: initWet,
    });
  }

  return {
    strandCount,
    basePaintSrgb: baseColor,
    strands,
    stepCount: 0,
  };
}

/**
 * 교차 스트로크 1스텝: 각 붓모 스트랜드가 캔버스 젖은 색을 개별적으로 머금고(dirty bristle pickup)
 * 다음 구역으로 이동하며 서서히 방출·7밴드 KM 감산 혼색한다.
 */
export function stepBristleBankCrossStroke(
  bank: MultiChannelBristleBank,
  input: BristleCrossStrokeStepInput,
): BristleBankStepResult {
  const pressure = clamp01(input.pressure);
  const speed = clamp(input.speed, 0, 10);
  const pickupBase = clamp01(input.pickupRate ?? 0.45);
  const releaseBase = clamp01(input.releaseRate ?? 0.14);
  const chromaPreserve = clamp01(input.chromaPreserve ?? 0.35);
  const speedDamp = clamp(1 - speed * 0.08, 0.35, 1);

  const deposits: BristleStrandDepositSample[] = [];
  let sumLoad = 0;
  let sumDirty = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < bank.strandCount; i += 1) {
    const strand = bank.strands[i];
    if (!strand) continue;

    const cIdx = Math.min(i, Math.max(0, input.canvasSrgbPerStrand.length - 1));
    const canvasColor = input.canvasSrgbPerStrand[cIdx] ?? bank.basePaintSrgb;
    const wIdx = Math.min(i, Math.max(0, input.canvasWetnessPerStrand.length - 1));
    const canvasWet = clamp01(input.canvasWetnessPerStrand[wIdx] ?? 0);
    const paperH = clamp01(input.paperHeightPerStrand?.[i] ?? 0.5);

    // 1) 캔버스가 젖어 있는 지점을 지날 때 해당 스트랜드만 개별 픽업 (dirty pickup)
    const effPickup = clamp01(
      pickupBase * canvasWet * (0.35 + 0.65 * pressure) * strand.stiffness * speedDamp,
    );
    if (effPickup > 1e-4) {
      strand.reservoirSrgb = mixKm7SpectralSrgb(strand.reservoirSrgb, canvasColor, effPickup, {
        chromaPreserve,
      });
      const colorDiff =
        (Math.abs(canvasColor.r - bank.basePaintSrgb.r) +
          Math.abs(canvasColor.g - bank.basePaintSrgb.g) +
          Math.abs(canvasColor.b - bank.basePaintSrgb.b)) /
        3;
      strand.dirtyLevel = clamp01(strand.dirtyLevel + effPickup * Math.max(0.25, colorDiff));
      // 젖은 캔버스에서 물감과 수분을 일부 보충
      strand.paintLoad = clamp01(strand.paintLoad + effPickup * 0.22);
      strand.wetness = clamp01(strand.wetness * 0.85 + canvasWet * 0.15);
    }

    // 2) 현재 스트랜드의 저수조 색을 캔버스에 방출(release)
    const depositSrgb: Km7Rgb01 = { ...strand.reservoirSrgb };
    const toothFactor = 0.65 + 0.35 * paperH;
    const depositOpacity = clamp01(
      strand.paintLoad * (0.25 + 0.75 * pressure) * strand.stiffness * toothFactor,
    );

    const consumed = releaseBase * (0.3 + 0.7 * pressure) * (0.8 + 0.4 * (1 - paperH));
    strand.paintLoad = clamp01(strand.paintLoad - consumed);

    // 방출과 함께 머금었던 오염 색이 서서히 빠지며 붓 본래 색 쪽으로 조금씩 복원
    if (effPickup <= 1e-4 && strand.dirtyLevel > 0) {
      const cleanse = clamp01(releaseBase * 0.45 * pressure);
      strand.dirtyLevel = clamp01(strand.dirtyLevel * (1 - cleanse));
      strand.reservoirSrgb = mixKm7SpectralSrgb(strand.reservoirSrgb, bank.basePaintSrgb, cleanse * 0.35, {
        chromaPreserve,
      });
    }

    sumLoad += strand.paintLoad;
    sumDirty += strand.dirtyLevel;
    sumR += depositSrgb.r;
    sumG += depositSrgb.g;
    sumB += depositSrgb.b;

    deposits.push({
      strandIndex: strand.index,
      offsetV: strand.offsetV,
      depositSrgb,
      depositOpacity,
      remainingLoad: strand.paintLoad,
      dirtyLevel: strand.dirtyLevel,
    });
  }

  bank.stepCount += 1;
  const n = Math.max(1, deposits.length);
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  let varAcc = 0;
  for (let i = 0; i < deposits.length; i += 1) {
    const c = deposits[i]?.depositSrgb;
    if (!c) continue;
    const dr = c.r - meanR;
    const dg = c.g - meanG;
    const db = c.b - meanB;
    varAcc += (dr * dr + dg * dg + db * db) / 3;
  }

  return {
    deposits,
    meanPaintLoad: sumLoad / n,
    meanDirtyLevel: sumDirty / n,
    strandColorVariance: varAcc / n,
  };
}

/** 붓을 팔레트에 다시 찍어 전체 스트랜드의 충전량과 색을 새로 채운다. */
export function reloadBristleBank(
  bank: MultiChannelBristleBank,
  freshPaintSrgb: Km7Rgb01,
  loadAmount = 0.95,
): void {
  const color: Km7Rgb01 = {
    r: clamp01(freshPaintSrgb.r),
    g: clamp01(freshPaintSrgb.g),
    b: clamp01(freshPaintSrgb.b),
  };
  const load = clamp01(loadAmount);
  for (const strand of bank.strands) {
    strand.reservoirSrgb = { ...color };
    strand.paintLoad = load;
    strand.dirtyLevel = 0;
  }
}
