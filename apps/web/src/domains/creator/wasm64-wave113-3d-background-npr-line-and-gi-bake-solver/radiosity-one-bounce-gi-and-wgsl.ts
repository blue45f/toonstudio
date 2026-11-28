/**
 * Wave 113 — 1-바운스 패치 형태계수(Form-Factor) 색번짐 라디오시티 GI 솔버,
 * 2D 캐릭터 깊이 평면 뒤 명암 완화·안개 조화기 및 WebGPU WGSL 재내보내기.
 */

import {
  clamp,
  dot3,
  length3,
  normalize3,
  sanitizeRgb,
  sub3,
  type RgbLinear,
  type Vec3,
} from "./background-presets-and-math";
import type {
  ProjectedMesh3dResult,
  ProjectedTriangle2d,
} from "./npr-mesh-edge-and-hlr-extractor";

export {
  buildBackgroundNprGiWgsl,
  validateBackgroundNprGiWgsl,
  type BackgroundNprGiWgslArtifact,
  type BackgroundNprGiWgslOptions,
  type BackgroundNprGiWgslValidation,
  type WgslBindingDescriptor,
} from "./background-npr-gi-wgsl";

export interface GiBakeOptions {
  /** 태양을 향하는 단위 방향 벡터(기본값: 오후 창가 사광). */
  readonly sunDirection?: Vec3;
  readonly sunColorRgb?: RgbLinear;
  readonly sunIntensity?: number;
  readonly skyZenithRgb?: RgbLinear;
  readonly skyGroundRgb?: RgbLinear;
  readonly skyIntensity?: number;
  /** 1-바운스 간접광 증폭 계수(에너지 보존을 위해 최대 `0.95`로 제한). */
  readonly bounceStrength?: number;
  /** 수신 패치당 형태계수 합 상한(엄격하게 `< 1.0`, 기본 `0.86`). */
  readonly maxReceiverFormFactorSum?: number;
  /** 송신 패치당 면적 가중 방출 합 상한(상반성 에너지 보존, 기본 `0.88`). */
  readonly maxSenderOutgoingFormFactorSum?: number;
}

export interface BakedGiPatch {
  readonly triIndex: number;
  readonly sourceFaceIndex: number;
  readonly materialId: string;
  readonly surfaceTag: string;
  readonly areaSqMeters: number;
  readonly meanDepthMeters: number;
  readonly isFrontFacing: boolean;
  readonly albedoRgb: RgbLinear;
  readonly directIrradianceRgb: RgbLinear;
  readonly directRadianceRgb: RgbLinear;
  readonly bounceIrradianceRgb: RgbLinear;
  readonly bounceRadianceRgb: RgbLinear;
  readonly totalRadianceRgb: RgbLinear;
  readonly formFactorSum: number;
  /** 1-바운스 반사광의 적색-청색 색온도 이동량(`bounceRadianceR - bounceRadianceB`). */
  readonly chromaticWarmthShift: number;
}

export interface GiEnergyConservationAudit {
  readonly totalDirectFlux: number;
  readonly totalBounceFlux: number;
  /** `totalBounceFlux / totalDirectFlux` (에너지 보존 법칙상 반드시 `< 1.0`). */
  readonly totalBounceRatio: number;
  readonly maxReceiverFormFactorSum: number;
  readonly maxSenderOutgoingFormFactorSum: number;
  readonly energyConserved: boolean;
  readonly dominantBounceRgb: RgbLinear;
}

export interface BackgroundGiBakeResult {
  readonly meshId: string;
  readonly labelKo: string;
  readonly patches: readonly BakedGiPatch[];
  readonly energyAudit: GiEnergyConservationAudit;
  readonly optionsUsed: Required<GiBakeOptions>;
}

export interface CharacterDepthHarmonizeOptions {
  /** 2D 캐릭터가 배치되는 카메라 깊이 평면(m). 이 평면 뒤의 배경만 완화한다. */
  readonly characterDepthMeters?: number;
  /** 2D 캐릭터 주조 명도 기준(OKLCH L, 기본 `0.56`). */
  readonly characterKeyLightness?: number;
  /** 대기 원근 안개 색(미지정 시 장면 지배 반사광이 살짝 섞인 스튜디오 공기색). */
  readonly mistColorRgb?: RgbLinear;
  /** 캐릭터 뒤 배경 명암 완화 강도(`0..0.85`, 기본 `0.46`). */
  readonly contrastSoftenStrength?: number;
  /** 캐릭터 뒤 대기 안개 리프트 강도(`0..0.85`, 기본 `0.38`). */
  readonly mistStrength?: number;
  /** 캐릭터 뒤 채도 억제 강도(`0..0.80`, 기본 `0.32`). */
  readonly chromaDesaturateStrength?: number;
  /** 캐릭터 평면 뒤 전환 거리(m, 기본 `1.2`). */
  readonly transitionBandMeters?: number;
}

export interface HarmonizedGiPatch extends BakedGiPatch {
  /** 캐릭터 깊이 평면 뒤 위치 비율(`0` = 캐릭터 앞 전경, `1` = 원경). */
  readonly behindCharacterFactor: number;
  readonly harmonizedRgb: RgbLinear;
  readonly rawLightness: number;
  readonly harmonizedLightness: number;
}

export interface HarmonizedBackgroundGiResult {
  readonly meshId: string;
  readonly labelKo: string;
  readonly patches: readonly HarmonizedGiPatch[];
  readonly energyAudit: GiEnergyConservationAudit;
  readonly characterDepthMeters: number;
  readonly behindPatchCount: number;
  readonly foregroundPreservedCount: number;
  readonly rawBehindContrast: number;
  readonly harmonizedBehindContrast: number;
  readonly rawSeparationScore: number;
  readonly characterSeparationScore: number;
  readonly mistColorUsedRgb: RgbLinear;
  readonly optionsUsed: Required<CharacterDepthHarmonizeOptions>;
}

const DEFAULT_GI_OPTIONS: Required<GiBakeOptions> = {
  sunDirection: [-0.42, 0.79, 0.44],
  sunColorRgb: [1.0, 0.93, 0.82],
  sunIntensity: 1.38,
  skyZenithRgb: [0.54, 0.67, 0.88],
  skyGroundRgb: [0.42, 0.34, 0.26],
  skyIntensity: 0.42,
  bounceStrength: 0.86,
  maxReceiverFormFactorSum: 0.86,
  maxSenderOutgoingFormFactorSum: 0.88,
};

function luminanceLinear(rgb: RgbLinear): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

function softToneMapRgb(rgb: RgbLinear): RgbLinear {
  const map = (v: number): number => {
    const safe = Number.isFinite(v) && v > 0 ? v : 0;
    return clamp(safe / (1 + safe * 0.45), 0, 1);
  };
  return [map(rgb[0]), map(rgb[1]), map(rgb[2])];
}

function perceptualLightness(rgb: RgbLinear): number {
  return Math.cbrt(clamp(luminanceLinear(rgb), 0, 1));
}

function resolveGiOptions(options?: GiBakeOptions): Required<GiBakeOptions> {
  return {
    sunDirection: normalize3(options?.sunDirection ?? DEFAULT_GI_OPTIONS.sunDirection, [0, 1, 0]),
    sunColorRgb: sanitizeRgb(options?.sunColorRgb ?? DEFAULT_GI_OPTIONS.sunColorRgb, 1.0),
    sunIntensity: clamp(options?.sunIntensity ?? DEFAULT_GI_OPTIONS.sunIntensity, 0, 6),
    skyZenithRgb: sanitizeRgb(options?.skyZenithRgb ?? DEFAULT_GI_OPTIONS.skyZenithRgb, 1.0),
    skyGroundRgb: sanitizeRgb(options?.skyGroundRgb ?? DEFAULT_GI_OPTIONS.skyGroundRgb, 1.0),
    skyIntensity: clamp(options?.skyIntensity ?? DEFAULT_GI_OPTIONS.skyIntensity, 0, 3),
    bounceStrength: clamp(options?.bounceStrength ?? DEFAULT_GI_OPTIONS.bounceStrength, 0, 0.95),
    maxReceiverFormFactorSum: clamp(
      options?.maxReceiverFormFactorSum ?? DEFAULT_GI_OPTIONS.maxReceiverFormFactorSum,
      0.05,
      0.92,
    ),
    maxSenderOutgoingFormFactorSum: clamp(
      options?.maxSenderOutgoingFormFactorSum ?? DEFAULT_GI_OPTIONS.maxSenderOutgoingFormFactorSum,
      0.05,
      0.92,
    ),
  };
}

/**
 * 3D 배경 투영 삼각형 패치들 사이에서 직접 태양/하늘 조도와
 * 에너지 보존 1-바운스 확산 라디오시티(Form-Factor 색번짐)를 계산한다.
 */
export function bakeBackgroundColorBleedGi(
  projection: ProjectedMesh3dResult,
  options?: GiBakeOptions,
): BackgroundGiBakeResult {
  const opts = resolveGiOptions(options);
  const tris: readonly ProjectedTriangle2d[] = projection.triangles;
  const n = tris.length;
  if (n === 0) {
    return {
      meshId: projection.meshId,
      labelKo: projection.labelKo,
      patches: [],
      energyAudit: {
        totalDirectFlux: 0,
        totalBounceFlux: 0,
        totalBounceRatio: 0,
        maxReceiverFormFactorSum: 0,
        maxSenderOutgoingFormFactorSum: 0,
        energyConserved: true,
        dominantBounceRgb: [0, 0, 0],
      },
      optionsUsed: opts,
    };
  }

  const albedos: RgbLinear[] = new Array<RgbLinear>(n);
  const directIrradiance: RgbLinear[] = new Array<RgbLinear>(n);
  const directRadiance: RgbLinear[] = new Array<RgbLinear>(n);

  for (let i = 0; i < n; i++) {
    const tri = tris[i];
    const albedo = sanitizeRgb(tri.albedoRgb, 0.96);
    albedos[i] = albedo;
    const ndotl = Math.max(0, dot3(tri.worldNormal, opts.sunDirection));
    const hemiT = clamp(0.5 + 0.5 * tri.worldNormal[1], 0, 1);
    const skyR = opts.skyGroundRgb[0] + (opts.skyZenithRgb[0] - opts.skyGroundRgb[0]) * hemiT;
    const skyG = opts.skyGroundRgb[1] + (opts.skyZenithRgb[1] - opts.skyGroundRgb[1]) * hemiT;
    const skyB = opts.skyGroundRgb[2] + (opts.skyZenithRgb[2] - opts.skyGroundRgb[2]) * hemiT;
    const eR = ndotl * opts.sunIntensity * opts.sunColorRgb[0] + opts.skyIntensity * skyR;
    const eG = ndotl * opts.sunIntensity * opts.sunColorRgb[1] + opts.skyIntensity * skyG;
    const eB = ndotl * opts.sunIntensity * opts.sunColorRgb[2] + opts.skyIntensity * skyB;
    directIrradiance[i] = [eR, eG, eB];
    directRadiance[i] = [albedo[0] * eR, albedo[1] * eG, albedo[2] * eB];
  }

  const formMatrix = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const ri = tris[i];
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const sj = tris[j];
      const delta = sub3(sj.worldCentroid, ri.worldCentroid);
      const dist = length3(delta);
      if (dist <= 1e-5) continue;
      const dirToSender: Vec3 = [delta[0] / dist, delta[1] / dist, delta[2] / dist];
      const cosI = dot3(ri.worldNormal, dirToSender);
      const cosJ = -dot3(sj.worldNormal, dirToSender);
      if (cosI <= 1e-4 || cosJ <= 1e-4) continue;
      const areaJ = Math.max(sj.areaSqMeters, 1e-5);
      const rawF = (cosI * cosJ * areaJ) / (Math.PI * dist * dist + areaJ);
      if (rawF > 0 && Number.isFinite(rawF)) {
        formMatrix[i * n + j] = rawF;
        rowSum += rawF;
      }
    }
    if (rowSum > opts.maxReceiverFormFactorSum) {
      const scale = opts.maxReceiverFormFactorSum / rowSum;
      for (let j = 0; j < n; j++) formMatrix[i * n + j] *= scale;
    }
  }

  // 상반성 송신 방출 합 정규화로 임의 메쉬에서의 에너지 보존(< 1.0) 보장
  const senderOutgoing = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const areaJ = Math.max(tris[j].areaSqMeters, 1e-5);
    let outSum = 0;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      const f = formMatrix[i * n + j];
      if (f > 0) outSum += (Math.max(tris[i].areaSqMeters, 1e-5) / areaJ) * f;
    }
    if (outSum > opts.maxSenderOutgoingFormFactorSum) {
      const scale = opts.maxSenderOutgoingFormFactorSum / outSum;
      for (let i = 0; i < n; i++) formMatrix[i * n + j] *= scale;
      outSum = opts.maxSenderOutgoingFormFactorSum;
    }
    senderOutgoing[j] = outSum;
  }

  let maxRecvSum = 0;
  let maxSendSum = 0;
  let totalDirectFlux = 0;
  let totalBounceFlux = 0;
  let weightedBounceR = 0;
  let weightedBounceG = 0;
  let weightedBounceB = 0;
  let totalWeightArea = 0;
  const patches: BakedGiPatch[] = new Array<BakedGiPatch>(n);

  for (let i = 0; i < n; i++) {
    const tri = tris[i];
    const albedo = albedos[i];
    let bIrrR = 0;
    let bIrrG = 0;
    let bIrrB = 0;
    let effFormSum = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const f = formMatrix[i * n + j];
      if (f <= 0) continue;
      effFormSum += f;
      const sr = directRadiance[j];
      bIrrR += f * sr[0];
      bIrrG += f * sr[1];
      bIrrB += f * sr[2];
    }

    bIrrR *= opts.bounceStrength;
    bIrrG *= opts.bounceStrength;
    bIrrB *= opts.bounceStrength;

    const bounceIrrRgb: RgbLinear = [bIrrR, bIrrG, bIrrB];
    const bounceRadRgb: RgbLinear = [albedo[0] * bIrrR, albedo[1] * bIrrG, albedo[2] * bIrrB];
    const dirRad = directRadiance[i];
    const totalRad: RgbLinear = [
      dirRad[0] + bounceRadRgb[0],
      dirRad[1] + bounceRadRgb[1],
      dirRad[2] + bounceRadRgb[2],
    ];

    if (effFormSum > maxRecvSum) maxRecvSum = effFormSum;
    if (senderOutgoing[i] > maxSendSum) maxSendSum = senderOutgoing[i];

    const area = Math.max(tri.areaSqMeters, 1e-5);
    totalDirectFlux += area * luminanceLinear(dirRad);
    totalBounceFlux += area * luminanceLinear(bounceRadRgb);
    weightedBounceR += area * bounceRadRgb[0];
    weightedBounceG += area * bounceRadRgb[1];
    weightedBounceB += area * bounceRadRgb[2];
    totalWeightArea += area;

    patches[i] = {
      triIndex: tri.triIndex,
      sourceFaceIndex: tri.sourceFaceIndex,
      materialId: tri.materialId,
      surfaceTag: tri.surfaceTag,
      areaSqMeters: Number(tri.areaSqMeters.toFixed(5)),
      meanDepthMeters: Number(tri.meanDepthMeters.toFixed(4)),
      isFrontFacing: tri.isFrontFacing,
      albedoRgb: albedo,
      directIrradianceRgb: directIrradiance[i],
      directRadianceRgb: dirRad,
      bounceIrradianceRgb: bounceIrrRgb,
      bounceRadianceRgb: bounceRadRgb,
      totalRadianceRgb: totalRad,
      formFactorSum: Number(effFormSum.toFixed(5)),
      chromaticWarmthShift: Number((bounceRadRgb[0] - bounceRadRgb[2]).toFixed(5)),
    };
  }

  const totalBounceRatio = totalDirectFlux > 1e-9 ? totalBounceFlux / totalDirectFlux : 0;
  const invArea = totalWeightArea > 1e-9 ? 1 / totalWeightArea : 0;

  return {
    meshId: projection.meshId,
    labelKo: projection.labelKo,
    patches,
    energyAudit: {
      totalDirectFlux: Number(totalDirectFlux.toFixed(5)),
      totalBounceFlux: Number(totalBounceFlux.toFixed(5)),
      totalBounceRatio: Number(totalBounceRatio.toFixed(5)),
      maxReceiverFormFactorSum: Number(maxRecvSum.toFixed(5)),
      maxSenderOutgoingFormFactorSum: Number(maxSendSum.toFixed(5)),
      energyConserved:
        Number.isFinite(totalBounceRatio) &&
        totalBounceRatio >= 0 &&
        totalBounceRatio < 1.0 &&
        maxRecvSum < 1.0 &&
        maxSendSum < 1.0,
      dominantBounceRgb: [
        Number((weightedBounceR * invArea).toFixed(5)),
        Number((weightedBounceG * invArea).toFixed(5)),
        Number((weightedBounceB * invArea).toFixed(5)),
      ],
    },
    optionsUsed: opts,
  };
}

function computeLightnessStats(values: readonly number[]): { readonly mean: number; readonly stdDev: number; readonly min: number } {
  if (values.length === 0) return { mean: 0.5, stdDev: 0, min: 0.5 };
  let sum = 0;
  let minVal = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (values[i] < minVal) minVal = values[i];
  }
  const mean = sum / values.length;
  let varSum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - mean;
    varSum += d * d;
  }
  return { mean, stdDev: Math.sqrt(varSum / values.length), min: Number.isFinite(minVal) ? minVal : mean };
}

function evaluateCharacterSeparationScore(
  behindLightnesses: readonly number[],
  behindRgbs: readonly RgbLinear[],
  characterKeyLightness: number,
): number {
  if (behindLightnesses.length === 0) return 0.85;
  const stats = computeLightnessStats(behindLightnesses);
  let chromaSum = 0;
  for (let i = 0; i < behindRgbs.length; i++) {
    const [r, g, b] = behindRgbs[i];
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
  }
  const avgChroma = chromaSum / behindRgbs.length;
  const inkClearance = clamp((stats.min - 0.16) / 0.42, 0, 1);
  const contrastCalmness = clamp(1 - stats.stdDev / 0.28, 0, 1);
  const chromaCalmness = clamp(1 - avgChroma / 0.65, 0, 1);
  const tonalLift = clamp(1 - Math.abs(stats.mean - Math.min(0.86, characterKeyLightness + 0.18)) / 0.45, 0, 1);

  return Number(clamp(0.34 * inkClearance + 0.34 * contrastCalmness + 0.18 * chromaCalmness + 0.14 * tonalLift, 0, 1).toFixed(4));
}

/**
 * 2D 캐릭터 깊이 평면(`characterDepthMeters`)을 기준으로 전경은 보존하고
 * 캐릭터 뒤 배경만 명암·채도 완화 및 대기 원근 안개 리프트를 적용해 2D 인물 분리도를 끌어올린다.
 */
export function harmonizeBackgroundFor2dCharacterDepth(
  giResult: BackgroundGiBakeResult,
  options?: CharacterDepthHarmonizeOptions,
): HarmonizedBackgroundGiResult {
  const dom = giResult.energyAudit.dominantBounceRgb;
  const domNorm = Math.max(dom[0], dom[1], dom[2], 1e-4);
  const defaultMist: RgbLinear = [
    clamp(0.86 + (dom[0] / domNorm) * 0.06, 0.72, 0.96),
    clamp(0.88 + (dom[1] / domNorm) * 0.05, 0.72, 0.96),
    clamp(0.90 + (dom[2] / domNorm) * 0.05, 0.72, 0.96),
  ];

  const opts: Required<CharacterDepthHarmonizeOptions> = {
    characterDepthMeters: clamp(options?.characterDepthMeters ?? 3.4, 0.3, 80),
    characterKeyLightness: clamp(options?.characterKeyLightness ?? 0.56, 0.25, 0.82),
    mistColorRgb: sanitizeRgb(options?.mistColorRgb ?? defaultMist, 0.98),
    contrastSoftenStrength: clamp(options?.contrastSoftenStrength ?? 0.46, 0, 0.85),
    mistStrength: clamp(options?.mistStrength ?? 0.38, 0, 0.85),
    chromaDesaturateStrength: clamp(options?.chromaDesaturateStrength ?? 0.32, 0, 0.8),
    transitionBandMeters: clamp(options?.transitionBandMeters ?? 1.2, 0.2, 12),
  };

  const rawMapped: RgbLinear[] = giResult.patches.map((p) => softToneMapRgb(p.totalRadianceRgb));
  let behindLumSum = 0;
  let behindFrontCount = 0;
  for (let i = 0; i < giResult.patches.length; i++) {
    const p = giResult.patches[i];
    if (p.isFrontFacing && p.meanDepthMeters > opts.characterDepthMeters) {
      behindLumSum += luminanceLinear(rawMapped[i]);
      behindFrontCount += 1;
    }
  }
  const pivotLum = behindFrontCount > 0 ? clamp(behindLumSum / behindFrontCount + 0.14, 0.48, 0.8) : 0.66;

  const harmonizedPatches: HarmonizedGiPatch[] = [];
  const rawBehindL: number[] = [];
  const rawBehindRgb: RgbLinear[] = [];
  const harmBehindL: number[] = [];
  const harmBehindRgb: RgbLinear[] = [];
  let behindPatchCount = 0;
  let foregroundPreservedCount = 0;

  for (let i = 0; i < giResult.patches.length; i++) {
    const patch = giResult.patches[i];
    const rawRgb = rawMapped[i];
    const rawL = perceptualLightness(rawRgb);
    const behindFactor = smoothstep(
      opts.characterDepthMeters - 0.12,
      opts.characterDepthMeters + opts.transitionBandMeters,
      patch.meanDepthMeters,
    );

    let outRgb: RgbLinear = rawRgb;
    if (behindFactor > 1e-5) {
      const soften = behindFactor * opts.contrastSoftenStrength;
      const desat = behindFactor * opts.chromaDesaturateStrength;
      const mist = behindFactor * opts.mistStrength;
      const lum = luminanceLinear(rawRgb);
      const dR = rawRgb[0] + (lum - rawRgb[0]) * desat;
      const dG = rawRgb[1] + (lum - rawRgb[1]) * desat;
      const dB = rawRgb[2] + (lum - rawRgb[2]) * desat;
      const cR = dR + (pivotLum - dR) * soften;
      const cG = dG + (pivotLum - dG) * soften;
      const cB = dB + (pivotLum - dB) * soften;
      outRgb = [
        clamp(cR + (opts.mistColorRgb[0] - cR) * mist, 0, 1),
        clamp(cG + (opts.mistColorRgb[1] - cG) * mist, 0, 1),
        clamp(cB + (opts.mistColorRgb[2] - cB) * mist, 0, 1),
      ];
      if (patch.isFrontFacing) behindPatchCount += 1;
    } else if (patch.isFrontFacing) {
      foregroundPreservedCount += 1;
    }

    const harmL = perceptualLightness(outRgb);
    if (patch.isFrontFacing && behindFactor > 0.05) {
      rawBehindL.push(rawL);
      rawBehindRgb.push(rawRgb);
      harmBehindL.push(harmL);
      harmBehindRgb.push(outRgb);
    }

    harmonizedPatches.push({
      ...patch,
      behindCharacterFactor: Number(behindFactor.toFixed(4)),
      harmonizedRgb: [Number(outRgb[0].toFixed(5)), Number(outRgb[1].toFixed(5)), Number(outRgb[2].toFixed(5))],
      rawLightness: Number(rawL.toFixed(4)),
      harmonizedLightness: Number(harmL.toFixed(4)),
    });
  }

  return {
    meshId: giResult.meshId,
    labelKo: giResult.labelKo,
    patches: harmonizedPatches,
    energyAudit: giResult.energyAudit,
    characterDepthMeters: opts.characterDepthMeters,
    behindPatchCount,
    foregroundPreservedCount,
    rawBehindContrast: Number(computeLightnessStats(rawBehindL).stdDev.toFixed(5)),
    harmonizedBehindContrast: Number(computeLightnessStats(harmBehindL).stdDev.toFixed(5)),
    rawSeparationScore: evaluateCharacterSeparationScore(rawBehindL, rawBehindRgb, opts.characterKeyLightness),
    characterSeparationScore: evaluateCharacterSeparationScore(harmBehindL, harmBehindRgb, opts.characterKeyLightness),
    mistColorUsedRgb: opts.mistColorRgb,
    optionsUsed: opts,
  };
}
