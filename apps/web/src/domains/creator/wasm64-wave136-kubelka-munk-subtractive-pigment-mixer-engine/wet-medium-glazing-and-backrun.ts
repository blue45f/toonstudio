/**
 * Wave 136 — 수채·과슈·알코올 마카 다층 글레이징(유한 두께 Kubelka-Munk) 및
 * 모세관 종이 번짐 엣지 다크닝(Coffee-Ring Backrun) 보존형 2D 시뮬레이터.
 */

import {
  clampFinite,
  formatOklchCss,
  getStudioPigmentPreset,
  ksToReflectance,
  linearRgbToOklch,
  linearRgbToSrgb,
  reflectanceToKs,
  SPECTRAL_BAND_COUNT,
  spectralReflectanceToLinearRgb,
  spectralReflectanceToOklch,
  spectralReflectanceToSrgb,
  spectralReflectanceToXyz,
  toTuple10,
  xyzToLinearRgb,
  type OklchColor,
  type RgbTuple,
  type SpectralTuple10,
  type StudioPigmentId,
} from "./kubelka-munk-spectral-pigments";

export type WetMediumPresetId =
  | "watercolor-transparent"
  | "gouache-opaque"
  | "alcohol-marker-blend";

export type PaperSubstrateId = "cotton-cold-press" | "hot-press-bright" | "charcoal-dark-test";

export interface WetMediumPreset {
  readonly id: WetMediumPresetId;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly scatteringScale: number;
  readonly binderBodyScattering: number;
  readonly baseCoatThickness: number;
  readonly capillaryRimStrength: number;
  readonly solventDiffusionRate: number;
  readonly solventRewetFeather: number;
  readonly paperGrainCoupling: number;
}

export interface PaperSubstrateSpec {
  readonly id: PaperSubstrateId;
  readonly nameKo: string;
  readonly reflectance: SpectralTuple10;
  readonly roughness: number;
  readonly sizingAbsorption: number;
}

export interface KubelkaMunkLayerResult {
  readonly reflectance: SpectralTuple10;
  readonly linearRgb: RgbTuple;
  readonly srgb: RgbTuple;
  readonly oklch: OklchColor;
  readonly oklchCss: string;
  readonly hidingPower: number;
  readonly opticalThickness: number;
}

export interface GlazingCoatSpec {
  readonly pigmentId: StudioPigmentId;
  readonly mediumPreset: WetMediumPresetId;
  readonly thicknessScale?: number;
  readonly dilution?: number;
}

export interface GlazingCoatSample {
  readonly coatIndex: number;
  readonly pigmentId: StudioPigmentId;
  readonly mediumPreset: WetMediumPresetId;
  readonly cumulativeThickness: number;
  readonly reflectance: SpectralTuple10;
  readonly srgb: RgbTuple;
  readonly oklch: OklchColor;
  readonly oklchCss: string;
  readonly hidingPower: number;
  readonly lightnessDropFromSubstrate: number;
}

export interface MultiLayerGlazingResult {
  readonly substrateId: PaperSubstrateId;
  readonly substrateNameKo: string;
  readonly substrateOklch: OklchColor;
  readonly substrateOklchCss: string;
  readonly coats: readonly GlazingCoatSample[];
  readonly finalReflectance: SpectralTuple10;
  readonly finalOklch: OklchColor;
  readonly finalOklchCss: string;
  readonly finalHidingPower: number;
  readonly lightnessMonotonicDecreasing: boolean;
}

export interface EdgeDarkeningSimulationOptions {
  readonly width?: number;
  readonly height?: number;
  readonly pigmentId?: StudioPigmentId;
  readonly mediumPreset?: WetMediumPresetId;
  readonly substrateId?: PaperSubstrateId;
  readonly steps?: number;
  readonly strokeRadiusNorm?: number;
  readonly initialConcentration?: number;
  readonly coatThickness?: number;
  readonly seed?: number;
}

export interface RadialBackrunSample {
  readonly radiusNorm: number;
  readonly meanConcentration: number;
  readonly meanLightness: number;
  readonly sampleCount: number;
}

export interface WatercolorEdgeDarkeningResult {
  readonly width: number;
  readonly height: number;
  readonly pigmentId: StudioPigmentId;
  readonly mediumPreset: WetMediumPresetId;
  readonly substrateId: PaperSubstrateId;
  readonly steps: number;
  readonly initialPigmentField: Float32Array;
  readonly finalPigmentField: Float32Array;
  readonly tileLightnessField: Float32Array;
  readonly tileChromaField: Float32Array;
  readonly tileHueField: Float32Array;
  readonly wetMask: Uint8Array;
  readonly edgeRingMask: Uint8Array;
  readonly interiorMask: Uint8Array;
  readonly wetCellCount: number;
  readonly edgeRingCellCount: number;
  readonly interiorCellCount: number;
  readonly initialTotalMass: number;
  readonly finalTotalMass: number;
  readonly massConservationAbsError: number;
  readonly massConservationRelativeError: number;
  readonly interiorMeanConcentration: number;
  readonly edgeMeanConcentration: number;
  readonly edgeToInteriorRatio: number;
  readonly peakConcentration: number;
  readonly minWetConcentration: number;
  readonly edgeDarkerThanInterior: boolean;
  readonly interiorMeanLightness: number;
  readonly edgeMeanLightness: number;
  readonly radialProfile: readonly RadialBackrunSample[];
  readonly nonFiniteCount: number;
}

export const WET_MEDIUM_PRESETS: Readonly<Record<WetMediumPresetId, WetMediumPreset>> = {
  "watercolor-transparent": {
    id: "watercolor-transparent",
    nameKo: "투명 수채 글레이징",
    descriptionKo: "낮은 산란으로 종이 백색 광택을 살리며 겹칠수록 명도가 깊어지고 테두리에 모세관 안료 띠가 형성됩니다.",
    scatteringScale: 0.08,
    binderBodyScattering: 0.0,
    baseCoatThickness: 0.42,
    capillaryRimStrength: 0.48,
    solventDiffusionRate: 0.045,
    solventRewetFeather: 0.0,
    paperGrainCoupling: 0.32,
  },
  "gouache-opaque": {
    id: "gouache-opaque",
    nameKo: "불투명 과슈 커버",
    descriptionKo: "높은 산란 계수와 불투명 체질 바인더로 어두운 바탕 위에도 1~3회 도포만으로 고유 색상을 덮어씁니다.",
    scatteringScale: 2.8,
    binderBodyScattering: 0.65,
    baseCoatThickness: 1.45,
    capillaryRimStrength: 0.02,
    solventDiffusionRate: 0.015,
    solventRewetFeather: 0.0,
    paperGrainCoupling: 0.08,
  },
  "alcohol-marker-blend": {
    id: "alcohol-marker-blend",
    nameKo: "알코올 마카 블렌드",
    descriptionKo: "낮은 산란 염료가 알코올 용제로 재용해되어 엣지 다크닝 없이 경계가 부드럽게 스며들고 적층 시 채도가 깊어집니다.",
    scatteringScale: 0.03,
    binderBodyScattering: 0.0,
    baseCoatThickness: 0.48,
    capillaryRimStrength: 0.04,
    solventDiffusionRate: 0.14,
    solventRewetFeather: 0.28,
    paperGrainCoupling: 0.05,
  },
};

export const WET_MEDIUM_PRESET_IDS: readonly WetMediumPresetId[] = [
  "watercolor-transparent",
  "gouache-opaque",
  "alcohol-marker-blend",
];

export const PAPER_SUBSTRATES: Readonly<Record<PaperSubstrateId, PaperSubstrateSpec>> = {
  "cotton-cold-press": {
    id: "cotton-cold-press",
    nameKo: "코튼 중목 수채지 (300gsm)",
    reflectance: [0.89, 0.92, 0.935, 0.945, 0.955, 0.96, 0.962, 0.96, 0.955, 0.948],
    roughness: 0.52,
    sizingAbsorption: 0.44,
  },
  "hot-press-bright": {
    id: "hot-press-bright",
    nameKo: "세목 고백색 브리스톨지",
    reflectance: [0.95, 0.965, 0.97, 0.972, 0.974, 0.974, 0.972, 0.97, 0.968, 0.965],
    roughness: 0.14,
    sizingAbsorption: 0.28,
  },
  "charcoal-dark-test": {
    id: "charcoal-dark-test",
    nameKo: "암흑 차콜 은폐 검증지",
    reflectance: [0.05, 0.052, 0.054, 0.055, 0.056, 0.056, 0.058, 0.06, 0.062, 0.064],
    roughness: 0.36,
    sizingAbsorption: 0.5,
  },
};

export function getWetMediumPreset(id: WetMediumPresetId): WetMediumPreset {
  return WET_MEDIUM_PRESETS[id];
}

export function getPaperSubstrate(id: PaperSubstrateId): PaperSubstrateSpec {
  return PAPER_SUBSTRATES[id];
}

/**
 * 단일 파장 유한 두께 Kubelka-Munk 층방정식.
 * 지수 오버플로와 투명 극한(S→0: Beer-Lambert), 무흡수 극한(K→0: 순백 산란)을 모두 안정 처리한다.
 */
export function evaluateKubelkaMunkBandOverSubstrate(
  absorptionK: number,
  scatteringS: number,
  thicknessX: number,
  substrateReflectance: number,
): number {
  const k = Math.max(0, Number.isFinite(absorptionK) ? absorptionK : 0);
  const s = Math.max(0, Number.isFinite(scatteringS) ? scatteringS : 0);
  const x = Math.max(0, Number.isFinite(thicknessX) ? thicknessX : 0);
  const rg = clampFinite(substrateReflectance, 0, 1);

  if (x <= 1e-12 || (k <= 1e-12 && s <= 1e-12)) return rg;
  if (s <= 1e-8) return clampFinite(rg * Math.exp(-2 * k * x), 0, 1);
  if (k <= 1e-8) {
    const sx = s * x;
    return clampFinite((rg + (1 - rg) * sx) / (1 + (1 - rg) * sx), 0, 1);
  }

  const rInf = ksToReflectance(k / s);
  const decay = Math.exp(-2 * Math.sqrt(k * k + 2 * k * s) * x);
  const oneMinusRgRinf = 1 - rg * rInf;
  const rInfMinusRg = rInf - rg;
  const num = rInf * oneMinusRgRinf - rInfMinusRg * decay;
  const den = oneMinusRgRinf - rInf * rInfMinusRg * decay;
  return Math.abs(den) < 1e-12 ? clampFinite(rInf, 0, 1) : clampFinite(num / den, 0, 1);
}

/** 10-밴드 스펙트럼 안료층을 지정한 기판(종이 또는 하위 도막) 위에 유한 두께로 적층한다. */
export function evaluateKubelkaMunkLayerOverSubstrate(
  absorptionK: SpectralTuple10,
  scatteringS: SpectralTuple10,
  thicknessX: number,
  substrateReflectance: SpectralTuple10,
): KubelkaMunkLayerResult {
  const safeThickness = Math.max(0, Number.isFinite(thicknessX) ? thicknessX : 0);
  const outRefl: number[] = [];
  let sumDiffFromSub = 0;
  let sumMaxSpan = 0;

  for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
    const kVal = Math.max(0, absorptionK[b]);
    const sVal = Math.max(0, scatteringS[b]);
    const rg = clampFinite(substrateReflectance[b], 0, 1);
    const rOut = evaluateKubelkaMunkBandOverSubstrate(kVal, sVal, safeThickness, rg);
    outRefl.push(rOut);
    const rInf = sVal > 1e-8 ? ksToReflectance(kVal / sVal) : 0;
    const totalGap = Math.abs(rInf - rg);
    if (totalGap > 1e-5) {
      sumDiffFromSub += Math.abs(rOut - rg);
      sumMaxSpan += totalGap;
    }
  }

  const reflectance = toTuple10(outRefl);
  const linearRgb = xyzToLinearRgb(spectralReflectanceToXyz(reflectance));
  const srgb = linearRgbToSrgb(linearRgb);
  const oklch = linearRgbToOklch(linearRgb);
  const hidingPower = sumMaxSpan > 1e-6 ? clampFinite(sumDiffFromSub / sumMaxSpan, 0, 1) : 1;
  return {
    reflectance,
    linearRgb,
    srgb,
    oklch,
    oklchCss: formatOklchCss(oklch),
    hidingPower,
    opticalThickness: safeThickness,
  };
}

/** 안료 프리셋과 매체 프리셋으로부터 유한 두께 KM 계산용 10-밴드 (K, S) 계수를 산출한다. */
export function buildMediumPigmentKs(
  pigmentId: StudioPigmentId,
  mediumPresetId: WetMediumPresetId,
  dilution = 1.0,
): { readonly absorptionK: SpectralTuple10; readonly scatteringS: SpectralTuple10 } {
  const pigment = getStudioPigmentPreset(pigmentId);
  const medium = WET_MEDIUM_PRESETS[mediumPresetId];
  const conc = clampFinite(dilution, 0.02, 2.0);
  const kArr: number[] = [];
  const sArr: number[] = [];

  for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
    const ksIntrinsic = reflectanceToKs(pigment.reflectance[b]);
    const sIntrinsic = Math.max(0.1, pigment.scatteringS[b]);
    const sEffective = (sIntrinsic * medium.scatteringScale + medium.binderBodyScattering) * conc;
    const kEffective =
      mediumPresetId === "gouache-opaque"
        ? ksIntrinsic * sEffective
        : ksIntrinsic * sIntrinsic * conc;
    kArr.push(kEffective);
    sArr.push(sEffective);
  }
  return { absorptionK: toTuple10(kArr), scatteringS: toTuple10(sArr) };
}

/** 종이 바탕 위에 여러 번 덧칠(글레이징)한 광학 적층 결과를 단계별로 추적한다. */
export function simulateMultiLayerGlazing(
  coats: readonly GlazingCoatSpec[],
  substrateId: PaperSubstrateId = "cotton-cold-press",
): MultiLayerGlazingResult {
  const substrate = PAPER_SUBSTRATES[substrateId];
  const substrateOklch = spectralReflectanceToOklch(substrate.reflectance);
  let currentReflectance: SpectralTuple10 = substrate.reflectance;
  let cumulativeThickness = 0;
  let prevLightness = substrateOklch.l;
  let lightnessMonotonicDecreasing = true;

  const samples: GlazingCoatSample[] = [];
  for (let i = 0; i < coats.length; i += 1) {
    const coat = coats[i];
    const medium = WET_MEDIUM_PRESETS[coat.mediumPreset];
    const thickness = medium.baseCoatThickness * clampFinite(coat.thicknessScale ?? 1.0, 0.05, 8.0);
    const { absorptionK, scatteringS } = buildMediumPigmentKs(
      coat.pigmentId,
      coat.mediumPreset,
      coat.dilution ?? 1.0,
    );
    const layer = evaluateKubelkaMunkLayerOverSubstrate(
      absorptionK,
      scatteringS,
      thickness,
      currentReflectance,
    );
    cumulativeThickness += thickness;
    if (layer.oklch.l > prevLightness + 1e-6) lightnessMonotonicDecreasing = false;
    prevLightness = layer.oklch.l;
    currentReflectance = layer.reflectance;
    samples.push({
      coatIndex: i + 1,
      pigmentId: coat.pigmentId,
      mediumPreset: coat.mediumPreset,
      cumulativeThickness,
      reflectance: layer.reflectance,
      srgb: layer.srgb,
      oklch: layer.oklch,
      oklchCss: layer.oklchCss,
      hidingPower: layer.hidingPower,
      lightnessDropFromSubstrate: substrateOklch.l - layer.oklch.l,
    });
  }

  const finalOklch = spectralReflectanceToOklch(currentReflectance);
  return {
    substrateId,
    substrateNameKo: substrate.nameKo,
    substrateOklch,
    substrateOklchCss: formatOklchCss(substrateOklch),
    coats: samples,
    finalReflectance: currentReflectance,
    finalOklch,
    finalOklchCss: formatOklchCss(finalOklch),
    finalHidingPower: samples.length > 0 ? samples[samples.length - 1].hidingPower : 0,
    lightnessMonotonicDecreasing,
  };
}

function deterministicHash01(x: number, y: number, seed: number): number {
  let h = (
    Math.imul(x + 374761393, 668265263) ^
    Math.imul(y + 1274126177, 2246822519) ^
    Math.imul(seed + 1, 3266489917)
  ) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * 2D 붓질 타일(기본 32×32)에서 수분 증발·모세관 흐름으로 발생하는
 * 수채 테두리 안료 농축(Edge Darkening / Coffee-Ring Backrun)을 보존형 유한체적으로 시뮬레이션한다.
 */
export function simulateWatercolorEdgeDarkening(
  options?: EdgeDarkeningSimulationOptions,
): WatercolorEdgeDarkeningResult {
  const width = Math.max(12, Math.min(64, Math.floor(options?.width ?? 32)));
  const height = Math.max(12, Math.min(64, Math.floor(options?.height ?? 32)));
  const pigmentId: StudioPigmentId = options?.pigmentId ?? "ultramarine-blue";
  const mediumPresetId: WetMediumPresetId = options?.mediumPreset ?? "watercolor-transparent";
  const substrateId: PaperSubstrateId = options?.substrateId ?? "cotton-cold-press";
  const steps = Math.max(4, Math.min(120, Math.floor(options?.steps ?? 36)));
  const strokeRadiusNorm = clampFinite(options?.strokeRadiusNorm ?? 0.37, 0.18, 0.46);
  const initialConcentration = clampFinite(options?.initialConcentration ?? 1.0, 0.1, 2.5);
  const seed = Math.floor(options?.seed ?? 13601);

  const medium = WET_MEDIUM_PRESETS[mediumPresetId];
  const substrate = PAPER_SUBSTRATES[substrateId];
  const coatThickness = clampFinite(options?.coatThickness ?? medium.baseCoatThickness, 0.05, 4.0);
  const cellCount = width * height;

  const wetMask = new Uint8Array(cellCount);
  const edgeRingMask = new Uint8Array(cellCount);
  const interiorMask = new Uint8Array(cellCount);
  const radiusField = new Float32Array(cellCount);
  const grainField = new Float32Array(cellCount);
  const initialPigmentField = new Float32Array(cellCount);

  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxR = Math.min(width, height) * strokeRadiusNorm;

  let wetCellCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const grain = deterministicHash01(x, y, seed);
      grainField[idx] = grain;
      const dist = Math.hypot(x - cx, y - cy);
      const rNorm = dist / Math.max(1e-6, maxR * (0.97 + 0.06 * (grain - 0.5)));
      radiusField[idx] = rNorm;
      const safeInterior = x >= 1 && x <= width - 2 && y >= 1 && y <= height - 2;
      if (rNorm <= 1.0 && safeInterior) {
        wetMask[idx] = 1;
        initialPigmentField[idx] = initialConcentration;
        wetCellCount += 1;
      } else if (medium.solventRewetFeather > 0 && rNorm <= 1.18 && safeInterior) {
        wetMask[idx] = 1;
        wetCellCount += 1;
      }
    }
  }

  let edgeRingCellCount = 0;
  let interiorCellCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (wetMask[idx] === 0) continue;
      const touchesDry =
        wetMask[idx - 1] === 0 || wetMask[idx + 1] === 0 ||
        wetMask[idx - width] === 0 || wetMask[idx + width] === 0;
      if (touchesDry || radiusField[idx] >= 0.78) {
        edgeRingMask[idx] = 1;
        edgeRingCellCount += 1;
      } else if (radiusField[idx] <= 0.62) {
        interiorMask[idx] = 1;
        interiorCellCount += 1;
      }
    }
  }

  const conc = new Float64Array(cellCount);
  const delta = new Float64Array(cellCount);
  const potential = new Float64Array(cellCount);
  let initialTotalMass = 0;
  for (let i = 0; i < cellCount; i += 1) {
    conc[i] = initialPigmentField[i];
    initialTotalMass += initialPigmentField[i];
    const r = Math.min(1.2, radiusField[i]);
    potential[i] = r * r * (1 + medium.paperGrainCoupling * (grainField[i] - 0.5) * 0.35);
  }

  const advectGain = medium.capillaryRimStrength * 0.24;
  const diffGain = medium.solventDiffusionRate;
  const transferPair = (idxA: number, idxB: number): void => {
    if (wetMask[idxA] === 0 || wetMask[idxB] === 0) return;
    const potDiff = potential[idxB] - potential[idxA];
    const advFlux =
      potDiff > 0
        ? Math.min(0.22, advectGain * potDiff) * conc[idxA]
        : -Math.min(0.22, advectGain * -potDiff) * conc[idxB];
    const rawFlux = advFlux + diffGain * (conc[idxA] - conc[idxB]);
    const flux = Math.max(-0.22 * conc[idxB], Math.min(0.22 * conc[idxA], rawFlux));
    delta[idxA] -= flux;
    delta[idxB] += flux;
  };

  for (let s = 0; s < steps; s += 1) {
    delta.fill(0);
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width - 1; x += 1) transferPair(row + x, row + x + 1);
    }
    for (let y = 0; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) transferPair(row + x, row + width + x);
    }
    for (let i = 0; i < cellCount; i += 1) conc[i] += delta[i];
  }

  const finalPigmentField = new Float32Array(cellCount);
  const tileLightnessField = new Float32Array(cellCount);
  const tileChromaField = new Float32Array(cellCount);
  const tileHueField = new Float32Array(cellCount);
  const { absorptionK, scatteringS } = buildMediumPigmentKs(pigmentId, mediumPresetId, 1.0);
  const paperOklch = spectralReflectanceToOklch(substrate.reflectance);

  let finalTotalMass = 0;
  let interiorMassSum = 0;
  let edgeMassSum = 0;
  let interiorLightnessSum = 0;
  let edgeLightnessSum = 0;
  let peakConcentration = 0;
  let minWetConcentration = Number.POSITIVE_INFINITY;
  let nonFiniteCount = 0;

  const binCount = 8;
  const binConcSum = new Float64Array(binCount);
  const binLightSum = new Float64Array(binCount);
  const binSampleCount = new Uint32Array(binCount);

  for (let i = 0; i < cellCount; i += 1) {
    const cVal = conc[i];
    if (!Number.isFinite(cVal)) nonFiniteCount += 1;
    finalTotalMass += cVal;
    finalPigmentField[i] = cVal;
    const cellOklch =
      cVal > 1e-6
        ? evaluateKubelkaMunkLayerOverSubstrate(absorptionK, scatteringS, coatThickness * cVal, substrate.reflectance).oklch
        : paperOklch;
    tileLightnessField[i] = cellOklch.l;
    tileChromaField[i] = cellOklch.c;
    tileHueField[i] = cellOklch.h;

    if (wetMask[i] === 1) {
      if (cVal > peakConcentration) peakConcentration = cVal;
      if (cVal < minWetConcentration) minWetConcentration = cVal;
      if (interiorMask[i] === 1) {
        interiorMassSum += cVal;
        interiorLightnessSum += cellOklch.l;
      }
      if (edgeRingMask[i] === 1) {
        edgeMassSum += cVal;
        edgeLightnessSum += cellOklch.l;
      }
      const bin = Math.min(binCount - 1, Math.max(0, Math.floor(radiusField[i] * binCount)));
      binConcSum[bin] += cVal;
      binLightSum[bin] += cellOklch.l;
      binSampleCount[bin] += 1;
    }
  }

  const massConservationAbsError = Math.abs(finalTotalMass - initialTotalMass);
  const massConservationRelativeError =
    initialTotalMass > 1e-12 ? massConservationAbsError / initialTotalMass : 0;
  const interiorMeanConcentration = interiorCellCount > 0 ? interiorMassSum / interiorCellCount : 0;
  const edgeMeanConcentration = edgeRingCellCount > 0 ? edgeMassSum / edgeRingCellCount : 0;
  const edgeToInteriorRatio =
    interiorMeanConcentration > 1e-9 ? edgeMeanConcentration / interiorMeanConcentration : 1;
  const interiorMeanLightness =
    interiorCellCount > 0 ? interiorLightnessSum / interiorCellCount : paperOklch.l;
  const edgeMeanLightness =
    edgeRingCellCount > 0 ? edgeLightnessSum / edgeRingCellCount : paperOklch.l;

  const radialProfile: RadialBackrunSample[] = Array.from({ length: binCount }, (_, b) => ({
    radiusNorm: (b + 0.5) / binCount,
    meanConcentration: binSampleCount[b] > 0 ? binConcSum[b] / binSampleCount[b] : 0,
    meanLightness: binSampleCount[b] > 0 ? binLightSum[b] / binSampleCount[b] : paperOklch.l,
    sampleCount: binSampleCount[b],
  }));

  return {
    width, height, pigmentId, mediumPreset: mediumPresetId, substrateId, steps,
    initialPigmentField, finalPigmentField, tileLightnessField, tileChromaField, tileHueField,
    wetMask, edgeRingMask, interiorMask, wetCellCount, edgeRingCellCount, interiorCellCount,
    initialTotalMass, finalTotalMass, massConservationAbsError, massConservationRelativeError,
    interiorMeanConcentration, edgeMeanConcentration, edgeToInteriorRatio, peakConcentration,
    minWetConcentration: Number.isFinite(minWetConcentration) ? minWetConcentration : 0,
    edgeDarkerThanInterior: edgeMeanLightness < interiorMeanLightness - 0.005,
    interiorMeanLightness, edgeMeanLightness, radialProfile, nonFiniteCount,
  };
}

/** 3종 매체(수채·과슈·알코올 마카)에 대해 동일 안료 다층 글레이징 결과를 비교한다. */
export function compareMediumGlazingTriplet(
  pigmentId: StudioPigmentId,
  coatCount = 4,
  substrateId: PaperSubstrateId = "cotton-cold-press",
): Readonly<Record<WetMediumPresetId, MultiLayerGlazingResult>> {
  const safeCoats = Math.max(1, Math.min(8, Math.floor(coatCount)));
  const buildFor = (mediumPreset: WetMediumPresetId): MultiLayerGlazingResult =>
    simulateMultiLayerGlazing(
      Array.from({ length: safeCoats }, () => ({ pigmentId, mediumPreset })),
      substrateId,
    );
  return {
    "watercolor-transparent": buildFor("watercolor-transparent"),
    "gouache-opaque": buildFor("gouache-opaque"),
    "alcohol-marker-blend": buildFor("alcohol-marker-blend"),
  };
}

export { spectralReflectanceToLinearRgb, spectralReflectanceToSrgb };
