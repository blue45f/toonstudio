/**
 * Wave 60: 종이 미세 3D 섬유 높이장·Stick-Slip 마찰력 및 모세관 잉크 번짐/건필 스킵 커널.
 *
 * - 켄트지·만화 원고지·수채화 중목·수채화 황목·전통 한지 5종의 다중 옥타브 3D 섬유 요철 높이장
 *   (`samplePaperFiberHeightField`)을 결정론적으로 생성한다.
 * - 정지 마찰에서 운동 마찰로 넘어가는 Coulomb-Stribeck 모델과 국소 경사 저항을 결합해
 *   실시간 마찰력·마찰 전력·건필 튐(Dry-Brush Tooth Skip)을 `evaluatePaperMicroContact`로 연산한다.
 * - Washburn 모세관 법칙에 기반해 속도·필압·슬릿 개방폭·종이 흡수율/사이징·잉크 점도에 따른
 *   잉크 모세관 번짐(`capillaryBleedRadiusMm`), 섬유 이방성 번짐, 계곡 고임(`valleyPoolingIndex`)을
 *   `computeCapillaryInkTransfer`로 계산한다.
 */

export type PaperSubstrateId =
  | "kent-smooth"
  | "comic-manuscript"
  | "watercolor-cold-press"
  | "watercolor-rough"
  | "hanji-mulberry";

export type FrictionRegime =
  | "static-stick"
  | "stribeck-transition"
  | "kinetic-glide"
  | "hover-no-contact";

export type InkMediumKind =
  | "liquid-ink"
  | "watercolor"
  | "graphite-dry"
  | "alcohol-marker";

export interface PaperSubstrateSpec {
  readonly id: PaperSubstrateId;
  readonly labelKo: string;
  readonly reliefAmplitudeUm: number;
  readonly dominantSpatialFreqPerMm: number;
  readonly fiberAnisotropy: number;
  readonly fiberOrientationDeg: number;
  readonly muStatic: number;
  readonly muKinetic: number;
  readonly stribeckVelocityMmPerSec: number;
  readonly viscousDragCoeff: number;
  readonly capillaryAbsorbency: number;
  readonly sizingBarrier: number;
  readonly meanPoreRadiusUm: number;
  readonly toothSkipSusceptibility: number;
  readonly abrasivenessFactor: number;
}

export interface PaperFiberReliefSample {
  readonly paperId: PaperSubstrateId;
  readonly xMm: number;
  readonly yMm: number;
  readonly heightNormalized: number;
  readonly heightUm: number;
  readonly gradientXUmPerMm: number;
  readonly gradientYUmPerMm: number;
  readonly surfaceNormal: { readonly x: number; readonly y: number; readonly z: number };
  readonly localValleyDepthUm: number;
}

export interface PaperMicroContactInput {
  readonly paperId: PaperSubstrateId;
  readonly xMm: number;
  readonly yMm: number;
  readonly velocityXMmPerSec: number;
  readonly velocityYMmPerSec: number;
  readonly pressure: number;
  readonly normalForceN?: number;
  readonly nibContactRadiusMm?: number;
  readonly nibWearRoughness?: number;
  readonly surfaceMoisture?: number;
  readonly seed?: number;
}

export interface PaperMicroContactResult {
  readonly paperId: PaperSubstrateId;
  readonly relief: PaperFiberReliefSample;
  readonly speedMmPerSec: number;
  readonly normalForceN: number;
  readonly effectiveFrictionCoefficient: number;
  readonly frictionForceN: number;
  readonly frictionPowerMw: number;
  readonly frictionRegime: FrictionRegime;
  readonly stickSlipIntensity: number;
  readonly contactCoverageRatio: number;
  readonly toothSkipRatio: number;
  readonly dominantFiberImpactHz: number;
  readonly directionalSlopeGrade: number;
}

export interface CapillaryInkTransferInput {
  readonly contact: PaperMicroContactResult;
  readonly pressure: number;
  readonly tineSplitMm?: number;
  readonly strokeWidthMm?: number;
  readonly mediumKind?: InkMediumKind;
  readonly inkViscosityMpaS?: number;
  readonly inkLoad?: number;
  readonly ambientHumidity?: number;
}

export interface CapillaryInkTransferResult {
  readonly paperId: PaperSubstrateId;
  readonly mediumKind: InkMediumKind;
  readonly dwellTimeMs: number;
  readonly inkFlowRateNlPerSec: number;
  readonly inkDepositionDensity: number;
  readonly capillaryBleedRadiusMm: number;
  readonly alongFiberBleedMm: number;
  readonly crossFiberBleedMm: number;
  readonly bleedAnisotropyRatio: number;
  readonly edgeCrispness: number;
  readonly dryBrushSkipFactor: number;
  readonly valleyPoolingIndex: number;
  readonly dryingTimeSec: number;
}

const DEG_TO_RAD = Math.PI / 180;
const MAX_NORMAL_FORCE_N = 4.2;

const PAPER_SUBSTRATE_SPECS: Readonly<Record<PaperSubstrateId, PaperSubstrateSpec>> = {
  "kent-smooth": {
    id: "kent-smooth",
    labelKo: "켄트지 (고평활 제도·펜화지)",
    reliefAmplitudeUm: 6.5,
    dominantSpatialFreqPerMm: 5.4,
    fiberAnisotropy: 0.08,
    fiberOrientationDeg: 0,
    muStatic: 0.27,
    muKinetic: 0.18,
    stribeckVelocityMmPerSec: 12,
    viscousDragCoeff: 0.00018,
    capillaryAbsorbency: 0.18,
    sizingBarrier: 0.9,
    meanPoreRadiusUm: 1.4,
    toothSkipSusceptibility: 0.12,
    abrasivenessFactor: 0.45,
  },
  "comic-manuscript": {
    id: "comic-manuscript",
    labelKo: "만화 원고지 135kg (잉크 번짐 억제)",
    reliefAmplitudeUm: 11.5,
    dominantSpatialFreqPerMm: 4.5,
    fiberAnisotropy: 0.12,
    fiberOrientationDeg: 90,
    muStatic: 0.34,
    muKinetic: 0.23,
    stribeckVelocityMmPerSec: 15,
    viscousDragCoeff: 0.00022,
    capillaryAbsorbency: 0.24,
    sizingBarrier: 0.93,
    meanPoreRadiusUm: 1.8,
    toothSkipSusceptibility: 0.2,
    abrasivenessFactor: 0.72,
  },
  "watercolor-cold-press": {
    id: "watercolor-cold-press",
    labelKo: "수채화 중목 (Cold Press 300g)",
    reliefAmplitudeUm: 40,
    dominantSpatialFreqPerMm: 2.3,
    fiberAnisotropy: 0.18,
    fiberOrientationDeg: 15,
    muStatic: 0.56,
    muKinetic: 0.41,
    stribeckVelocityMmPerSec: 21,
    viscousDragCoeff: 0.00032,
    capillaryAbsorbency: 0.64,
    sizingBarrier: 0.52,
    meanPoreRadiusUm: 6.5,
    toothSkipSusceptibility: 0.62,
    abrasivenessFactor: 1.55,
  },
  "watercolor-rough": {
    id: "watercolor-rough",
    labelKo: "수채화 황목 (Rough Press 300g)",
    reliefAmplitudeUm: 78,
    dominantSpatialFreqPerMm: 1.5,
    fiberAnisotropy: 0.22,
    fiberOrientationDeg: 20,
    muStatic: 0.76,
    muKinetic: 0.56,
    stribeckVelocityMmPerSec: 26,
    viscousDragCoeff: 0.00042,
    capillaryAbsorbency: 0.78,
    sizingBarrier: 0.4,
    meanPoreRadiusUm: 10.5,
    toothSkipSusceptibility: 0.92,
    abrasivenessFactor: 2.25,
  },
  "hanji-mulberry": {
    id: "hanji-mulberry",
    labelKo: "전통 한지 (닥나무 장섬유지)",
    reliefAmplitudeUm: 48,
    dominantSpatialFreqPerMm: 2.8,
    fiberAnisotropy: 0.72,
    fiberOrientationDeg: 12,
    muStatic: 0.64,
    muKinetic: 0.46,
    stribeckVelocityMmPerSec: 22,
    viscousDragCoeff: 0.00036,
    capillaryAbsorbency: 0.94,
    sizingBarrier: 0.14,
    meanPoreRadiusUm: 15.5,
    toothSkipSusceptibility: 0.54,
    abrasivenessFactor: 1.38,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function hashGrid2D(ix: number, iy: number, seed: number): number {
  let h =
    Math.imul(ix | 0, 374761393) +
    Math.imul(iy | 0, 668265263) +
    Math.imul(seed | 0, 2147483647);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smoothstepQuintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ux = smoothstepQuintic(x - ix);
  const uy = smoothstepQuintic(y - iy);
  const a = hashGrid2D(ix, iy, seed) + (hashGrid2D(ix + 1, iy, seed) - hashGrid2D(ix, iy, seed)) * ux;
  const b =
    hashGrid2D(ix, iy + 1, seed) + (hashGrid2D(ix + 1, iy + 1, seed) - hashGrid2D(ix, iy + 1, seed)) * ux;
  return a + (b - a) * uy;
}

/** 4옥타브 프로시저럴 종이 섬유 높이장 (`0..1`). */
function rawFiberHeightNormalized(
  spec: PaperSubstrateSpec,
  xMm: number,
  yMm: number,
  seed: number,
): number {
  const theta = spec.fiberOrientationDeg * DEG_TO_RAD;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const u = xMm * cosT + yMm * sinT;
  const v = -xMm * sinT + yMm * cosT;

  const stretchAlong = 1 - spec.fiberAnisotropy * 0.68;
  const stretchAcross = 1 + spec.fiberAnisotropy * 1.45;
  const f = spec.dominantSpatialFreqPerMm;

  const oct1 = valueNoise2D(u * f * 0.35, v * f * 0.35, seed + 11);
  const oct2 = valueNoise2D(u * f * stretchAlong, v * f * stretchAcross, seed + 29);
  const ridgeBase = valueNoise2D(u * f * 1.9 * stretchAlong, v * f * 2.6 * stretchAcross, seed + 53);
  const oct3FiberRidge = 1 - Math.abs(ridgeBase * 2 - 1);
  const oct4MicroGrit = valueNoise2D(xMm * f * 4.8, yMm * f * 4.8, seed + 97);

  return clamp(oct1 * 0.24 + oct2 * 0.38 + oct3FiberRidge * 0.26 + oct4MicroGrit * 0.12, 0, 1);
}

/** 등록된 종이 원지 프리셋 물리 사양을 반환한다. */
export function getPaperSubstrateSpec(paperId: PaperSubstrateId): PaperSubstrateSpec {
  return PAPER_SUBSTRATE_SPECS[paperId];
}

/** 등록된 전체 종이 원지 프리셋 식별자 목록을 반환한다. */
export function listPaperSubstrateIds(): readonly PaperSubstrateId[] {
  return [
    "kent-smooth",
    "comic-manuscript",
    "watercolor-cold-press",
    "watercolor-rough",
    "hanji-mulberry",
  ];
}

/** 지정 좌표 `(xMm, yMm)`에서 종이의 미세 3D 섬유 높이, 경사, 단위 표면 법선을 샘플링한다. */
export function samplePaperFiberHeightField(
  paperId: PaperSubstrateId,
  xMm: number,
  yMm: number,
  seed = 60,
): PaperFiberReliefSample {
  const spec = PAPER_SUBSTRATE_SPECS[paperId];
  const safeX = Number.isFinite(xMm) ? xMm : 0;
  const safeY = Number.isFinite(yMm) ? yMm : 0;
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 60;
  const epsMm = 0.04;

  const hCenter = rawFiberHeightNormalized(spec, safeX, safeY, safeSeed);
  const gradXUmPerMm =
    ((rawFiberHeightNormalized(spec, safeX + epsMm, safeY, safeSeed) -
      rawFiberHeightNormalized(spec, safeX - epsMm, safeY, safeSeed)) /
      (2 * epsMm)) *
    spec.reliefAmplitudeUm;
  const gradYUmPerMm =
    ((rawFiberHeightNormalized(spec, safeX, safeY + epsMm, safeSeed) -
      rawFiberHeightNormalized(spec, safeX, safeY - epsMm, safeSeed)) /
      (2 * epsMm)) *
    spec.reliefAmplitudeUm;

  const heightUm = hCenter * spec.reliefAmplitudeUm;
  const slopeX = gradXUmPerMm * 0.001;
  const slopeY = gradYUmPerMm * 0.001;
  const invNorm = 1 / Math.sqrt(slopeX * slopeX + slopeY * slopeY + 1);

  return {
    paperId,
    xMm: safeX,
    yMm: safeY,
    heightNormalized: hCenter,
    heightUm: normalizeZero(heightUm),
    gradientXUmPerMm: normalizeZero(gradXUmPerMm),
    gradientYUmPerMm: normalizeZero(gradYUmPerMm),
    surfaceNormal: {
      x: normalizeZero(-slopeX * invNorm),
      y: normalizeZero(-slopeY * invNorm),
      z: normalizeZero(invNorm),
    },
    localValleyDepthUm: normalizeZero(Math.max(0, spec.reliefAmplitudeUm - heightUm)),
  };
}

/** 펜촉과 종이 미세 3D 섬유 간의 실시간 Coulomb-Stribeck 마찰력 및 건필 튐을 계산한다. */
export function evaluatePaperMicroContact(
  input: PaperMicroContactInput,
): PaperMicroContactResult {
  const spec = PAPER_SUBSTRATE_SPECS[input.paperId];
  const pressure = clamp(input.pressure, 0, 1);
  const vx = Number.isFinite(input.velocityXMmPerSec) ? input.velocityXMmPerSec : 0;
  const vy = Number.isFinite(input.velocityYMmPerSec) ? input.velocityYMmPerSec : 0;
  const speedMmPerSec = Math.hypot(vx, vy);
  const nibRadiusMm = clamp(input.nibContactRadiusMm ?? 0.25, 0.04, 5.0);
  const nibWearRoughness = clamp(input.nibWearRoughness ?? 0, 0, 1);
  const surfaceMoisture = clamp(input.surfaceMoisture ?? 0.05, 0, 1);

  const relief = samplePaperFiberHeightField(input.paperId, input.xMm, input.yMm, input.seed ?? 60);
  const normalForceN =
    pressure <= 0
      ? 0
      : input.normalForceN !== undefined && Number.isFinite(input.normalForceN)
        ? Math.max(0, input.normalForceN)
        : Math.pow(pressure, 1.15) * MAX_NORMAL_FORCE_N;

  if (pressure <= 0 || normalForceN <= 0) {
    return {
      paperId: input.paperId,
      relief,
      speedMmPerSec: normalizeZero(speedMmPerSec),
      normalForceN: 0,
      effectiveFrictionCoefficient: 0,
      frictionForceN: 0,
      frictionPowerMw: 0,
      frictionRegime: "hover-no-contact",
      stickSlipIntensity: 0,
      contactCoverageRatio: 0,
      toothSkipRatio: 1,
      dominantFiberImpactHz: 0,
      directionalSlopeGrade: 0,
    };
  }

  // 1. Coulomb-Stribeck 마찰 곡선 + 진행 방향 국소 경사 저항
  const stribeckRatio = speedMmPerSec / Math.max(spec.stribeckVelocityMmPerSec, 1);
  const stribeckDecay = Math.exp(-Math.pow(stribeckRatio, 1.6));
  const baseMu =
    (spec.muKinetic +
      (spec.muStatic - spec.muKinetic) * stribeckDecay +
      spec.viscousDragCoeff * Math.min(speedMmPerSec, 800)) *
    (1 - 0.16 * surfaceMoisture) *
    (1 + 0.24 * nibWearRoughness);

  let directionalSlopeGrade = 0;
  if (speedMmPerSec > 1e-4) {
    const rawSlope =
      ((vx / speedMmPerSec) * relief.gradientXUmPerMm + (vy / speedMmPerSec) * relief.gradientYUmPerMm) * 0.001;
    directionalSlopeGrade = clamp((rawSlope / (1 + nibRadiusMm * 0.85)) * 1.8, -0.45, 0.45);
  }

  const effectiveFrictionCoefficient = clamp(
    baseMu + Math.max(0, directionalSlopeGrade) * 0.42 - Math.max(0, -directionalSlopeGrade) * 0.12,
    0.05,
    1.6,
  );
  const frictionForceN = normalForceN * effectiveFrictionCoefficient;
  const frictionPowerMw = frictionForceN * speedMmPerSec;

  // 2. 마찰 구간 판정 및 스틱-슬립 강도
  const frictionRegime: FrictionRegime =
    speedMmPerSec < spec.stribeckVelocityMmPerSec * 0.18
      ? "static-stick"
      : speedMmPerSec < spec.stribeckVelocityMmPerSec * 1.85
        ? "stribeck-transition"
        : "kinetic-glide";

  const muDrop = Math.max(0, spec.muStatic - spec.muKinetic);
  const transitionPeak =
    speedMmPerSec < 0.05
      ? 0.35
      : Math.exp(-Math.pow(Math.log(Math.max(stribeckRatio, 0.05)) + 0.35, 2) * 0.7);
  const reliefFactor = clamp(spec.reliefAmplitudeUm / 80, 0.08, 1);
  const stickSlipIntensity = clamp(
    (muDrop * 2.1 + 0.25 * nibWearRoughness) *
      (0.35 + 0.65 * transitionPeak) *
      (0.35 + 0.65 * reliefFactor) *
      (0.45 + 0.55 * pressure),
    0,
    1,
  );

  // 3. 건필 튐(Dry-Brush Tooth Skip): 깊은 요철 + 빠른 속도 + 낮은 필압에서 계곡 건너뜀
  const speedLift = clamp(Math.log1p(speedMmPerSec / 35) / Math.log1p(14), 0, 1);
  const pressureEmbedding = Math.pow(pressure, 0.72);
  const valleyPenalty = clamp((1 - relief.heightNormalized) * (spec.reliefAmplitudeUm / 75), 0, 1);
  const toothSkipRatio = clamp(
    spec.toothSkipSusceptibility *
      (0.22 + 0.78 * speedLift) *
      (1.06 - 0.86 * pressureEmbedding) *
      (0.55 + 0.45 * valleyPenalty),
    0,
    0.96,
  );

  return {
    paperId: input.paperId,
    relief,
    speedMmPerSec: normalizeZero(speedMmPerSec),
    normalForceN: normalizeZero(normalForceN),
    effectiveFrictionCoefficient: normalizeZero(effectiveFrictionCoefficient),
    frictionForceN: normalizeZero(frictionForceN),
    frictionPowerMw: normalizeZero(frictionPowerMw),
    frictionRegime,
    stickSlipIntensity: normalizeZero(stickSlipIntensity),
    contactCoverageRatio: normalizeZero(clamp(1 - toothSkipRatio, 0.04, 1)),
    toothSkipRatio: normalizeZero(toothSkipRatio),
    dominantFiberImpactHz: normalizeZero(speedMmPerSec * spec.dominantSpatialFreqPerMm),
    directionalSlopeGrade: normalizeZero(directionalSlopeGrade),
  };
}

/** 펜 속도·필압·종이 흡수율·잉크 점도에 따른 모세관 잉크 번짐과 건필 튐을 계산한다. */
export function computeCapillaryInkTransfer(
  input: CapillaryInkTransferInput,
): CapillaryInkTransferResult {
  const spec = PAPER_SUBSTRATE_SPECS[input.contact.paperId];
  const pressure = clamp(input.pressure, 0, 1);
  const mediumKind: InkMediumKind = input.mediumKind ?? "liquid-ink";
  const tineSplitMm = Math.max(0, Number.isFinite(input.tineSplitMm) ? input.tineSplitMm ?? 0 : 0);
  const strokeWidthMm = clamp(input.strokeWidthMm ?? 0.45, 0.05, 16);
  const defaultViscosity =
    mediumKind === "watercolor"
      ? 1.15
      : mediumKind === "alcohol-marker"
        ? 1.4
        : mediumKind === "graphite-dry"
          ? 120
          : 2.6;
  const inkViscosityMpaS = clamp(input.inkViscosityMpaS ?? defaultViscosity, 0.5, 200);
  const inkLoad = clamp(input.inkLoad ?? 0.85, 0, 1);
  const ambientHumidity = clamp(input.ambientHumidity ?? 0.45, 0, 1);

  if (pressure <= 0 || input.contact.frictionRegime === "hover-no-contact") {
    return {
      paperId: input.contact.paperId,
      mediumKind,
      dwellTimeMs: 0,
      inkFlowRateNlPerSec: 0,
      inkDepositionDensity: 0,
      capillaryBleedRadiusMm: 0,
      alongFiberBleedMm: 0,
      crossFiberBleedMm: 0,
      bleedAnisotropyRatio: 1,
      edgeCrispness: 1,
      dryBrushSkipFactor: 1,
      valleyPoolingIndex: 0,
      dryingTimeSec: 0,
    };
  }

  const effectiveSpeedMmPerSec = Math.max(input.contact.speedMmPerSec, 3.5);
  const dwellTimeSec = clamp((strokeWidthMm + tineSplitMm * 0.6) / effectiveSpeedMmPerSec, 0.0005, 0.85);
  const dwellTimeMs = dwellTimeSec * 1_000;
  const isDryMedium = mediumKind === "graphite-dry";

  const inkFlowRateNlPerSec = isDryMedium
    ? 0
    : clamp(
        (28 *
          Math.pow(pressure, 1.15) *
          (1 + tineSplitMm * 2.8) *
          inkLoad *
          (0.45 + 0.55 * spec.capillaryAbsorbency)) /
          Math.pow(inkViscosityMpaS / 2.2, 0.72),
        0,
        450,
      );

  const starvationBoost = Math.pow(1 - inkLoad, 1.35) * 0.55;
  const dryBrushSkipFactor = clamp(
    input.contact.toothSkipRatio * (1 + starvationBoost) +
      starvationBoost * (0.25 + 0.5 * spec.toothSkipSusceptibility),
    0,
    0.98,
  );

  const dwellSaturation = 1 - Math.exp(-dwellTimeMs / 18);
  const inkDepositionDensity = clamp(
    (1 - dryBrushSkipFactor * 0.78) *
      (0.25 + 0.75 * Math.pow(pressure, 0.65)) *
      (isDryMedium ? 0.85 : 0.35 + 0.65 * inkLoad) *
      (0.55 + 0.45 * dwellSaturation),
    0,
    1,
  );

  // Washburn 모세관 침투 법칙: L ~ sqrt((r_pore * absorbency * t_dwell) / viscosity)
  const humidityBoost = 1 + (ambientHumidity - 0.45) * 0.35;
  const sizingDamping = 1 - spec.sizingBarrier * 0.82;
  const mediumBleedMultiplier =
    mediumKind === "watercolor"
      ? 1.65
      : mediumKind === "alcohol-marker"
        ? 1.25
        : mediumKind === "graphite-dry"
          ? 0
          : 1.0;

  const washburnTerm = Math.sqrt(
    (spec.meanPoreRadiusUm *
      spec.capillaryAbsorbency *
      dwellTimeSec *
      (0.4 + 0.9 * pressure) *
      (1 + tineSplitMm * 0.95)) /
      Math.max(inkViscosityMpaS, 0.5),
  );
  const capillaryBleedRadiusMm = isDryMedium
    ? 0
    : clamp(0.58 * washburnTerm * sizingDamping * mediumBleedMultiplier * humidityBoost * inkLoad, 0, 6.5);

  const bleedAnisotropyRatio = isDryMedium ? 1 : 1 + spec.fiberAnisotropy * 1.35;
  const alongFiberBleedMm = capillaryBleedRadiusMm * Math.sqrt(bleedAnisotropyRatio);
  const crossFiberBleedMm = capillaryBleedRadiusMm / Math.sqrt(bleedAnisotropyRatio);
  const edgeCrispness = clamp(
    1 - clamp(capillaryBleedRadiusMm / 1.1, 0, 0.82) - dryBrushSkipFactor * 0.28,
    0.05,
    1,
  );

  const valleyRatio = clamp(input.contact.relief.localValleyDepthUm / 75, 0, 1);
  const poolingMediumGain =
    mediumKind === "watercolor"
      ? 1.0
      : mediumKind === "liquid-ink"
        ? 0.48
        : mediumKind === "alcohol-marker"
          ? 0.22
          : 0.08;
  const valleyPoolingIndex = clamp(
    valleyRatio * poolingMediumGain * inkLoad * (0.35 + 0.65 * dwellSaturation) * (1 - dryBrushSkipFactor * 0.5),
    0,
    1,
  );

  const dryingTimeSec = isDryMedium
    ? 0
    : clamp(
        (1.2 + inkFlowRateNlPerSec * 0.045 + capillaryBleedRadiusMm * 2.2) *
          (0.65 + 0.8 * ambientHumidity) *
          (mediumKind === "watercolor" ? 2.6 : mediumKind === "alcohol-marker" ? 0.42 : 1.0) *
          (1.25 - 0.55 * spec.capillaryAbsorbency),
        0.2,
        45,
      );

  return {
    paperId: input.contact.paperId,
    mediumKind,
    dwellTimeMs: normalizeZero(dwellTimeMs),
    inkFlowRateNlPerSec: normalizeZero(inkFlowRateNlPerSec),
    inkDepositionDensity: normalizeZero(inkDepositionDensity),
    capillaryBleedRadiusMm: normalizeZero(capillaryBleedRadiusMm),
    alongFiberBleedMm: normalizeZero(alongFiberBleedMm),
    crossFiberBleedMm: normalizeZero(crossFiberBleedMm),
    bleedAnisotropyRatio: normalizeZero(bleedAnisotropyRatio),
    edgeCrispness: normalizeZero(edgeCrispness),
    dryBrushSkipFactor: normalizeZero(dryBrushSkipFactor),
    valleyPoolingIndex: normalizeZero(valleyPoolingIndex),
    dryingTimeSec: normalizeZero(dryingTimeSec),
  };
}
