/**
 * Wave 68 — Semi-Lagrangian 안료 이류 + 4채널 Kubelka-Munk 감산 광학 합성 + 젖은 광택 RGBA 컴포지터.
 *
 * - `advectPigmentSemiLagrangian`: 속도장 역추적(Semi-Lagrangian) + 발산 야코비안 보정 + 질량 보존 이류
 * - `evaluateKubelkaMunkPigmentRgb`: 특이점 없는 `tanh/cosh` 2-플럭스 Kubelka-Munk 비선형 감산 혼색
 * - `compositeShallowWaterFieldToRgba`: 유동+고착 안료 광학 합성 + 측면 광원 임파스토 음영·젖은 광택
 * - `measureFluidPigmentMassConservation` · `measureFluidPigmentCenterOfMass` · `measureCoffeeRingBackrunMetrics`
 */

import {
  FLUID_PIGMENT_CHANNELS,
  FLUID_WET_EPSILON,
  type ShallowWaterPaintField,
} from "./shallow-water-fluid-solver";

export type LinearRgbTuple = readonly [number, number, number];

export interface PigmentOpticalProfile {
  readonly id: string;
  readonly nameKo: string;
  /** 파장별 흡수 계수 K (R, G, B) */
  readonly absorptionK: LinearRgbTuple;
  /** 파장별 산란 계수 S (R, G, B) */
  readonly scatteringS: LinearRgbTuple;
}

export type PigmentOpticalPalette = readonly [
  PigmentOpticalProfile,
  PigmentOpticalProfile,
  PigmentOpticalProfile,
  PigmentOpticalProfile,
];

/** 4채널 물리 안료 광학 프로파일 기본 팔레트 (블루+옐로우 → 선명한 녹색) */
export const DEFAULT_PIGMENT_OPTICS: PigmentOpticalPalette = [
  { id: "phthalo-blue", nameKo: "프탈로 블루", absorptionK: [2.65, 0.34, 0.06], scatteringS: [0.06, 0.24, 0.56] },
  { id: "hansa-yellow", nameKo: "한사 옐로우", absorptionK: [0.05, 0.09, 2.85], scatteringS: [0.56, 0.52, 0.06] },
  { id: "quinacridone-magenta", nameKo: "퀴나크리돈 마젠타", absorptionK: [0.12, 2.55, 0.42], scatteringS: [0.48, 0.08, 0.34] },
  { id: "burnt-umber-carbon", nameKo: "번트 엄버 카본", absorptionK: [2.1, 2.35, 2.65], scatteringS: [0.12, 0.1, 0.08] },
];

/** 냉압 면 수채화지 기본 선형 반사율 */
export const DEFAULT_PAPER_REFLECTANCE: LinearRgbTuple = [0.97, 0.955, 0.92];

export interface SemiLagrangianAdvectionOptions {
  readonly compensateDivergence?: boolean;
  readonly conserveMass?: boolean;
  readonly maxPigmentDensity?: number;
}

export interface SemiLagrangianAdvectionResult {
  readonly advectedCells: number;
  readonly preTotalMobilePigment: number;
  readonly postTotalMobilePigment: number;
  readonly relativeMassDrift: number;
}

export interface WetMediaCompositeOptions {
  readonly palette?: PigmentOpticalPalette;
  readonly paperReflectance?: LinearRgbTuple;
  readonly lightDirX?: number;
  readonly lightDirY?: number;
  readonly lightDirZ?: number;
  readonly wetSpecularStrength?: number;
  readonly impastoShadingStrength?: number;
  readonly paperGrainVisibility?: number;
  readonly reliefNormalScale?: number;
  readonly opticalThicknessScale?: number;
}

export interface WetMediaCompositeResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly meanWetSpecular: number;
  readonly peakWetSpecular: number;
  readonly activeWetPixels: number;
  readonly meanLuminance: number;
}

export interface FluidPigmentMassConservationReport {
  readonly mobileMassByChannel: readonly [number, number, number, number];
  readonly depositedMassByChannel: readonly [number, number, number, number];
  readonly totalMassByChannel: readonly [number, number, number, number];
  readonly referenceMassByChannel: readonly [number, number, number, number];
  readonly totalMobileMass: number;
  readonly totalDepositedMass: number;
  readonly totalMass: number;
  readonly referenceTotalMass: number;
  readonly absoluteError: number;
  readonly relativeErrorRatio: number;
  readonly relativeErrorPercent: number;
  readonly withinTwoPercentBudget: boolean;
}

export interface FluidPigmentCenterOfMassReport {
  readonly x: number;
  readonly y: number;
  readonly totalMass: number;
  readonly radiusOfGyration: number;
}

export interface CoffeeRingBackrunReport {
  readonly centerMeanDensity: number;
  readonly rimMeanDensity: number;
  readonly rimToCenterRatio: number;
  readonly peakRimDensity: number;
  readonly centerSampleCount: number;
  readonly rimSampleCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3.0 - 2.0 * t);
}

function linearToSrgbChannel(linear: number): number {
  const v = clamp(linear, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}

function readCellTotalPigment(
  field: ShallowWaterPaintField,
  cellIdx: number,
  channel?: 0 | 1 | 2 | 3,
): number {
  const base = cellIdx * FLUID_PIGMENT_CHANNELS;
  if (channel !== undefined) {
    return (field.mobilePigment[base + channel] ?? 0) + (field.depositedPigment[base + channel] ?? 0);
  }
  let sum = 0;
  for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
    sum += (field.mobilePigment[base + c] ?? 0) + (field.depositedPigment[base + c] ?? 0);
  }
  return sum;
}

function sampleBilinearPigment(
  source: Float32Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  channel: number,
): number {
  const cx = clamp(sx, 0, width - 1);
  const cy = clamp(sy, 0, height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const v00 = source[(y0 * width + x0) * FLUID_PIGMENT_CHANNELS + channel] ?? 0;
  const v10 = source[(y0 * width + x1) * FLUID_PIGMENT_CHANNELS + channel] ?? 0;
  const v01 = source[(y1 * width + x0) * FLUID_PIGMENT_CHANNELS + channel] ?? 0;
  const v11 = source[(y1 * width + x1) * FLUID_PIGMENT_CHANNELS + channel] ?? 0;
  return v00 + (v10 - v00) * fx + (v01 + (v11 - v01) * fx - (v00 + (v10 - v00) * fx)) * fy;
}

/**
 * Semi-Lagrangian 역추적 방식으로 4채널 유동 안료(`mobilePigment`)를 이류시킨다.
 * WebGPU 핑퐁 컴퓨트 셰이더(`PIGMENT_ADVECTION_DRYING_WGSL`)와 1:1 대응되는 참조 구현이다.
 */
export function advectPigmentSemiLagrangian(
  field: ShallowWaterPaintField,
  dtSec: number,
  options: SemiLagrangianAdvectionOptions = {},
): SemiLagrangianAdvectionResult {
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    let total = 0;
    for (let i = 0; i < field.mobilePigment.length; i += 1) total += field.mobilePigment[i] ?? 0;
    return { advectedCells: 0, preTotalMobilePigment: total, postTotalMobilePigment: total, relativeMassDrift: 0 };
  }

  const compensateDivergence = options.compensateDivergence ?? true;
  const conserveMass = options.conserveMass ?? true;
  const maxDensity = Math.max(1, options.maxPigmentDensity ?? 64);
  const { width, height, waterHeight, velocityX, velocityY, mobilePigment, scratchMobilePigment } = field;

  const preTotals = [0, 0, 0, 0];
  const postTotals = [0, 0, 0, 0];
  for (let i = 0; i < field.cellCount; i += 1) {
    const base = i * FLUID_PIGMENT_CHANNELS;
    for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
      preTotals[c] = (preTotals[c] ?? 0) + (mobilePigment[base + c] ?? 0);
    }
  }

  let advectedCells = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowUp = (y > 0 ? y - 1 : 0) * width;
    const rowDn = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const base = idx * FLUID_PIGMENT_CHANNELS;
      if ((waterHeight[idx] ?? 0) <= FLUID_WET_EPSILON) {
        for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
          const val = mobilePigment[base + c] ?? 0;
          scratchMobilePigment[base + c] = val;
          postTotals[c] = (postTotals[c] ?? 0) + val;
        }
        continue;
      }

      const sx = x - (velocityX[idx] ?? 0) * dtSec;
      const sy = y - (velocityY[idx] ?? 0) * dtSec;
      let jacobian = 1.0;
      if (compensateDivergence) {
        const xLt = x > 0 ? x - 1 : 0;
        const xRt = x < width - 1 ? x + 1 : width - 1;
        const divU =
          0.5 * ((velocityX[row + xRt] ?? 0) - (velocityX[row + xLt] ?? 0)) +
          0.5 * ((velocityY[rowDn + x] ?? 0) - (velocityY[rowUp + x] ?? 0));
        jacobian = clamp(1.0 / Math.max(0.35, 1.0 + dtSec * divU), 0.45, 2.2);
      }

      for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
        const val = clamp(sampleBilinearPigment(mobilePigment, width, height, sx, sy, c) * jacobian, 0, maxDensity);
        scratchMobilePigment[base + c] = val;
        postTotals[c] = (postTotals[c] ?? 0) + val;
      }
      advectedCells += 1;
    }
  }

  if (conserveMass) {
    for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
      const pre = preTotals[c] ?? 0;
      const post = postTotals[c] ?? 0;
      if (pre > 1e-8 && post > 1e-8 && Math.abs(pre / post - 1.0) > 1e-6) {
        const ratio = pre / post;
        let corrected = 0;
        for (let i = 0; i < field.cellCount; i += 1) {
          const pos = i * FLUID_PIGMENT_CHANNELS + c;
          const v = (scratchMobilePigment[pos] ?? 0) * ratio;
          scratchMobilePigment[pos] = v;
          corrected += v;
        }
        postTotals[c] = corrected;
      }
    }
  }

  mobilePigment.set(scratchMobilePigment);
  const preTotal = (preTotals[0] ?? 0) + (preTotals[1] ?? 0) + (preTotals[2] ?? 0) + (preTotals[3] ?? 0);
  const postTotal = (postTotals[0] ?? 0) + (postTotals[1] ?? 0) + (postTotals[2] ?? 0) + (postTotals[3] ?? 0);
  return {
    advectedCells,
    preTotalMobilePigment: preTotal,
    postTotalMobilePigment: postTotal,
    relativeMassDrift: preTotal > 1e-8 ? Math.abs(postTotal - preTotal) / preTotal : 0,
  };
}

/** 단일 파장 대역의 특이점 없는 Kubelka-Munk 2-플럭스 반사율을 계산한다. */
export function evaluateKubelkaMunkChannelReflectance(
  absorptionK: number,
  scatteringS: number,
  substrateReflectance: number,
): number {
  const k = Math.max(0, Number.isFinite(absorptionK) ? absorptionK : 0);
  const s = Math.max(0, Number.isFinite(scatteringS) ? scatteringS : 0);
  const rg = clamp(Number.isFinite(substrateReflectance) ? substrateReflectance : 0.95, 0, 1);
  if (k <= 1e-7 && s <= 1e-7) return rg;

  const gamma = Math.sqrt(Math.max(0, k * (k + 2.0 * s)));
  const cg = Math.min(gamma, 24.0);
  const tanhG = Math.tanh(cg);
  const invCoshG = cg > 18.0 ? 0.0 : 1.0 / Math.cosh(cg);
  const denom = Math.max(1e-7, (k + s) * tanhG + gamma);
  const rLayer = (s * tanhG) / denom;
  const tLayer = (gamma * invCoshG) / denom;
  return clamp(rLayer + (tLayer * tLayer * rg) / Math.max(1e-5, 1.0 - rLayer * rg), 0, 1);
}

/** 최대 4종 안료 농도장(`c0..c3`)을 Kubelka-Munk 비선형 감산 광학으로 합성해 선형·sRGB를 반환한다. */
export function evaluateKubelkaMunkPigmentRgb(
  pigmentAmounts: readonly [number, number, number, number],
  palette: PigmentOpticalPalette = DEFAULT_PIGMENT_OPTICS,
  paperReflectance: LinearRgbTuple = DEFAULT_PAPER_REFLECTANCE,
  opticalThicknessScale: number = 1.0,
): { readonly linearRgb: LinearRgbTuple; readonly srgb: LinearRgbTuple } {
  const scale = Math.max(0, Number.isFinite(opticalThicknessScale) ? opticalThicknessScale : 1.0);
  let kr = 0; let kg = 0; let kb = 0;
  let sr = 0; let sg = 0; let sb = 0;
  for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
    const raw = pigmentAmounts[c] ?? 0;
    const amt = Math.max(0, Number.isFinite(raw) ? raw : 0) * scale;
    const prof = palette[c];
    if (amt <= 0 || !prof) continue;
    kr += amt * prof.absorptionK[0]; kg += amt * prof.absorptionK[1]; kb += amt * prof.absorptionK[2];
    sr += amt * prof.scatteringS[0]; sg += amt * prof.scatteringS[1]; sb += amt * prof.scatteringS[2];
  }
  const lr = evaluateKubelkaMunkChannelReflectance(kr, sr, paperReflectance[0]);
  const lg = evaluateKubelkaMunkChannelReflectance(kg, sg, paperReflectance[1]);
  const lb = evaluateKubelkaMunkChannelReflectance(kb, sb, paperReflectance[2]);
  return {
    linearRgb: [lr, lg, lb],
    srgb: [linearToSrgbChannel(lr), linearToSrgbChannel(lg), linearToSrgbChannel(lb)],
  };
}

/**
 * 얕은 물방정식 유체 필드를 Kubelka-Munk 감산 광학 + 측면 광원 젖은 광택(Wet Specular Sheen) +
 * 임파스토 요철 음영으로 합성해 RGBA8 버퍼를 생성한다.
 */
export function compositeShallowWaterFieldToRgba(
  field: ShallowWaterPaintField,
  options: WetMediaCompositeOptions = {},
): WetMediaCompositeResult {
  const { width, height, waterHeight, impastoRelief, paperGrain, mobilePigment, depositedPigment } = field;
  const palette = options.palette ?? DEFAULT_PIGMENT_OPTICS;
  const paperRef = options.paperReflectance ?? DEFAULT_PAPER_REFLECTANCE;
  const wetSpecStr = clamp(options.wetSpecularStrength ?? 0.72, 0, 2.5);
  const impastoStr = clamp(options.impastoShadingStrength ?? 0.38, 0, 1.5);
  const grainVis = clamp(options.paperGrainVisibility ?? 0.14, 0, 0.5);
  const reliefScale = clamp(options.reliefNormalScale ?? 3.6, 0.1, 20.0);
  const optScale = clamp(options.opticalThicknessScale ?? 1.0, 0.05, 8.0);

  const rawLx = options.lightDirX ?? -0.62;
  const rawLy = options.lightDirY ?? -0.52;
  const rawLz = options.lightDirZ ?? 0.58;
  const lLen = Math.max(1e-6, Math.hypot(rawLx, rawLy, rawLz));
  const lx = rawLx / lLen; const ly = rawLy / lLen; const lz = rawLz / lLen;
  const hLen = Math.max(1e-6, Math.hypot(lx, ly, lz + 1.0));
  const hx = lx / hLen; const hy = ly / hLen; const hz = (lz + 1.0) / hLen;

  const rgba = new Uint8ClampedArray(width * height * 4);
  let sumWetSpecular = 0; let peakWetSpecular = 0; let activeWetPixels = 0; let sumLuminance = 0;

  const evalHeight = (idx: number): number => {
    const h = waterHeight[idx] ?? 0;
    return h * 0.9 + (impastoRelief[idx] ?? 0) * 1.15 + (paperGrain[idx] ?? 0.5) * 0.12 * (1.0 - clamp(h * 2.5, 0, 1));
  };

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowUp = (y > 0 ? y - 1 : 0) * width;
    const rowDn = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const xLt = x > 0 ? x - 1 : 0;
      const xRt = x < width - 1 ? x + 1 : width - 1;
      const base = idx * FLUID_PIGMENT_CHANNELS;

      const paperMod = 1.0 + ((paperGrain[idx] ?? 0.5) - 0.5) * grainVis;
      const km = evaluateKubelkaMunkPigmentRgb(
        [
          (mobilePigment[base] ?? 0) + (depositedPigment[base] ?? 0),
          (mobilePigment[base + 1] ?? 0) + (depositedPigment[base + 1] ?? 0),
          (mobilePigment[base + 2] ?? 0) + (depositedPigment[base + 2] ?? 0),
          (mobilePigment[base + 3] ?? 0) + (depositedPigment[base + 3] ?? 0),
        ],
        palette,
        [clamp(paperRef[0] * paperMod, 0, 1), clamp(paperRef[1] * paperMod, 0, 1), clamp(paperRef[2] * paperMod, 0, 1)],
        optScale,
      );

      const rawNx = -(evalHeight(row + xRt) - evalHeight(row + xLt)) * 0.5 * reliefScale;
      const rawNy = -(evalHeight(rowDn + x) - evalHeight(rowUp + x)) * 0.5 * reliefScale;
      const nLen = Math.max(1e-6, Math.hypot(rawNx, rawNy, 1.0));
      const nx = rawNx / nLen; const ny = rawNy / nLen; const nz = 1.0 / nLen;

      const nDotL = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
      const nDotH = clamp(nx * hx + ny * hy + nz * hz, 0, 1);
      const hWater = waterHeight[idx] ?? 0;
      const wetness = smoothstep(0.015, 0.24, hWater);
      const impMask = clamp((impastoRelief[idx] ?? 0) * 1.4, 0, 1);
      const reliefDiffuse = 1.0 + (nDotL - 0.58) * impastoStr * (0.25 + 0.75 * impMask);
      const fresnel = 0.025 + 0.975 * Math.pow(1.0 - clamp(nz, 0, 1), 5);
      const wetSpec = wetSpecStr * wetness * Math.pow(nDotH, 48.0) * (0.45 + 0.55 * fresnel);
      const satinOilSpec = impastoStr * 0.16 * impMask * (1.0 - wetness) * Math.pow(nDotH, 16.0);

      if (hWater > FLUID_WET_EPSILON) {
        activeWetPixels += 1;
        sumWetSpecular += wetSpec;
        if (wetSpec > peakWetSpecular) peakWetSpecular = wetSpec;
      }

      const linR = clamp(km.linearRgb[0] * reliefDiffuse + wetSpec + satinOilSpec, 0, 1);
      const linG = clamp(km.linearRgb[1] * reliefDiffuse + wetSpec + satinOilSpec, 0, 1);
      const linB = clamp(km.linearRgb[2] * reliefDiffuse + wetSpec + satinOilSpec, 0, 1);

      const px = idx * 4;
      rgba[px] = Math.round(linearToSrgbChannel(linR) * 255);
      rgba[px + 1] = Math.round(linearToSrgbChannel(linG) * 255);
      rgba[px + 2] = Math.round(linearToSrgbChannel(linB) * 255);
      rgba[px + 3] = 255;
      sumLuminance += 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
    }
  }

  return {
    width,
    height,
    rgba,
    meanWetSpecular: activeWetPixels > 0 ? sumWetSpecular / activeWetPixels : 0,
    peakWetSpecular,
    activeWetPixels,
    meanLuminance: field.cellCount > 0 ? sumLuminance / field.cellCount : 0,
  };
}

/** 유체 시뮬레이션의 채널별·전체 안료 총질량(유동+고착)과 기준 질량 대비 보존 오차를 계측한다. */
export function measureFluidPigmentMassConservation(
  field: ShallowWaterPaintField,
  referenceMassByChannel: readonly [number, number, number, number],
): FluidPigmentMassConservationReport {
  const mobile: [number, number, number, number] = [0, 0, 0, 0];
  const deposited: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < field.cellCount; i += 1) {
    const base = i * FLUID_PIGMENT_CHANNELS;
    for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
      mobile[c] = (mobile[c] ?? 0) + (field.mobilePigment[base + c] ?? 0);
      deposited[c] = (deposited[c] ?? 0) + (field.depositedPigment[base + c] ?? 0);
    }
  }
  const totalByChannel: [number, number, number, number] = [
    mobile[0] + deposited[0], mobile[1] + deposited[1],
    mobile[2] + deposited[2], mobile[3] + deposited[3],
  ];
  const totalMobileMass = mobile[0] + mobile[1] + mobile[2] + mobile[3];
  const totalDepositedMass = deposited[0] + deposited[1] + deposited[2] + deposited[3];
  const totalMass = totalMobileMass + totalDepositedMass;
  const refTotal =
    referenceMassByChannel[0] + referenceMassByChannel[1] + referenceMassByChannel[2] + referenceMassByChannel[3];
  const absoluteError = Math.abs(totalMass - refTotal);
  const relativeErrorRatio = refTotal > 1e-8 ? absoluteError / refTotal : absoluteError;

  return {
    mobileMassByChannel: mobile,
    depositedMassByChannel: deposited,
    totalMassByChannel: totalByChannel,
    referenceMassByChannel: [
      referenceMassByChannel[0], referenceMassByChannel[1],
      referenceMassByChannel[2], referenceMassByChannel[3],
    ],
    totalMobileMass,
    totalDepositedMass,
    totalMass,
    referenceTotalMass: refTotal,
    absoluteError,
    relativeErrorRatio,
    relativeErrorPercent: relativeErrorRatio * 100,
    withinTwoPercentBudget: relativeErrorRatio < 0.02,
  };
}

/** 전체(또는 지정 채널) 안료의 2D 무게중심 `(x, y)` 및 회전 반경(확산 반경)을 계측한다. */
export function measureFluidPigmentCenterOfMass(
  field: ShallowWaterPaintField,
  channel?: 0 | 1 | 2 | 3,
): FluidPigmentCenterOfMassReport {
  let sumMass = 0; let sumX = 0; let sumY = 0;
  for (let y = 0; y < field.height; y += 1) {
    const row = y * field.width;
    for (let x = 0; x < field.width; x += 1) {
      const m = readCellTotalPigment(field, row + x, channel);
      if (m <= 0) continue;
      sumMass += m; sumX += x * m; sumY += y * m;
    }
  }
  if (sumMass <= 1e-9) return { x: 0, y: 0, totalMass: 0, radiusOfGyration: 0 };
  const comX = sumX / sumMass;
  const comY = sumY / sumMass;
  let sumDistSq = 0;
  for (let y = 0; y < field.height; y += 1) {
    const row = y * field.width;
    for (let x = 0; x < field.width; x += 1) {
      const m = readCellTotalPigment(field, row + x, channel);
      if (m <= 0) continue;
      sumDistSq += ((x - comX) * (x - comX) + (y - comY) * (y - comY)) * m;
    }
  }
  return { x: comX, y: comY, totalMass: sumMass, radiusOfGyration: Math.sqrt(sumDistSq / sumMass) };
}

/** 중심부(`r <= 0.45R`) 대비 가장자리 고리(`0.75R <= r <= 1.35R`) 안료 농도로 백런(Coffee-Ring) 응집도를 계측한다. */
export function measureCoffeeRingBackrunMetrics(
  field: ShallowWaterPaintField,
  centerX: number,
  centerY: number,
  dropRadius: number,
  channel?: 0 | 1 | 2 | 3,
): CoffeeRingBackrunReport {
  const rInner = Math.max(0.5, dropRadius * 0.45);
  const rRimMin = Math.max(rInner, dropRadius * 0.75);
  const rRimMax = Math.max(rRimMin + 1.0, dropRadius * 1.35);
  let centerSum = 0; let centerCount = 0; let rimSum = 0; let rimCount = 0; let peakRimDensity = 0;

  for (let y = 0; y < field.height; y += 1) {
    const row = y * field.width;
    for (let x = 0; x < field.width; x += 1) {
      const dist = Math.hypot(x - centerX, y - centerY);
      const density = readCellTotalPigment(field, row + x, channel);
      if (dist <= rInner) {
        centerSum += density; centerCount += 1;
      } else if (dist >= rRimMin && dist <= rRimMax) {
        rimSum += density; rimCount += 1;
        if (density > peakRimDensity) peakRimDensity = density;
      }
    }
  }
  const centerMeanDensity = centerCount > 0 ? centerSum / centerCount : 0;
  const rimMeanDensity = rimCount > 0 ? rimSum / rimCount : 0;
  return {
    centerMeanDensity,
    rimMeanDensity,
    rimToCenterRatio: centerMeanDensity > 1e-8 ? rimMeanDensity / centerMeanDensity : rimMeanDensity > 0 ? 999 : 0,
    peakRimDensity,
    centerSampleCount: centerCount,
    rimSampleCount: rimCount,
  };
}
