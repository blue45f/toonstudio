/**
 * Kajiya-Kay / Marschner 이방성 머리카락 엔젤링 하이라이트 생성기,
 * Rayleigh-Mie 물리 대기 산란 공기원근법 깊이 합성기,
 * 가역 정수 Haar 웨이블릿 + LOCO-I(MED) 점진적 무손실 컷 코덱 통합 모듈.
 *
 * - 단일 가이드 접선 곡선과 광원 벡터만으로 1차(R)·2차(TRT) 큐티클 이동 정반사 로브 및
 *   가닥 방향 미세 차폐를 1ms 미만으로 계산해 셀/소프트 애니메 엔젤링을 생성한다.
 * - 파장 의존 레일리(λ^-4) + 미(Henyey-Greenstein) 산란·소산을 미터 단위 깊이에 적용해
 *   평면 배경 레이어에 극장판 공기원근법 깊이감을 자동으로 입힌다.
 */

import type { Point2D, RgbaColor } from "./planar-dcel-arrangement";

export {
  computeCutFnv1a32,
  decodeProgressiveCutLossless,
  decodeProgressiveCutPreview,
  encodeProgressiveCutLossless,
  forwardHaar2DInt,
  inverseHaar2DInt,
  predictLocoIMed,
  type IntegerHaar2DSubbands,
  type ProgressiveCutDecodeResult,
  type ProgressiveCutEncodedPacket,
  type ProgressiveCutEncodeOptions,
} from "./lossless-haar-med-progressive-codec";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type HairShadingStyle = "cel" | "soft";

export interface KajiyaHairHighlightInput {
  readonly guidePoints: readonly Point2D[];
  readonly lightDirection: Vec3;
  readonly viewDirection?: Vec3;
  readonly shadingStyle?: HairShadingStyle;
  readonly swatchWidth?: number;
  readonly swatchHeight?: number;
  readonly bandHalfWidthPx?: number;
  readonly cuticleTiltDeg?: number;
  readonly primarySpecularPower?: number;
  readonly secondarySpecularPower?: number;
  readonly strandCount?: number;
  readonly baseHairColor?: RgbaColor;
  readonly primaryHighlightColor?: RgbaColor;
  readonly secondaryHighlightColor?: RgbaColor;
}

export interface KajiyaHairHighlightResult {
  readonly width: number;
  readonly height: number;
  readonly shadingStyle: HairShadingStyle;
  readonly rgba: Uint8Array;
  readonly primaryLobeIntensity: Float32Array;
  readonly secondaryLobeIntensity: Float32Array;
  readonly microShadowFactor: Float32Array;
  readonly angelRingRibbon: readonly Point2D[];
  readonly peakPrimaryU: number;
  readonly peakSecondaryU: number;
  readonly elapsedMs: number;
}

export interface AerialAtmosphereOptions {
  readonly sunDirection: Vec3;
  readonly viewDirection?: Vec3;
  readonly turbidity?: number;
  readonly rayleighScale?: number;
  readonly mieAnisotropyG?: number;
  readonly sunIntensity?: number;
  readonly sunTintLinearRgb?: readonly [number, number, number];
  readonly distanceScale?: number;
}

export interface AerialScatteringSample {
  readonly depthMeters: number;
  readonly betaRayleigh: readonly [number, number, number];
  readonly betaMieExtinction: readonly [number, number, number];
  readonly transmittance: readonly [number, number, number];
  readonly inScatterLinearRgb: readonly [number, number, number];
}

export interface AerialDepthBufferReport {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly meanTransmittanceBlue: number;
  readonly meanTransmittanceRed: number;
  readonly maxInScatterLuminance: number;
  readonly elapsedMs: number;
}

export interface AerialPerspectiveLayerInput {
  readonly layerId: string;
  readonly depthMeters: number;
  readonly opacity?: number;
  readonly rgba: Uint8Array;
}

export interface AerialLayerComposeReport {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly layerTransmittances: readonly {
    readonly layerId: string;
    readonly depthMeters: number;
    readonly transmittanceRgb: readonly [number, number, number];
    readonly inScatterRgb: readonly [number, number, number];
  }[];
  readonly elapsedMs: number;
}

export const RAYLEIGH_WAVELENGTHS_NM: readonly [number, number, number] = [680, 550, 440];

const DEFAULT_HAIR_BASE: RgbaColor = { r: 42, g: 36, b: 58, a: 255 };
const DEFAULT_HAIR_PRIMARY: RgbaColor = { r: 255, g: 250, b: 244, a: 255 };
const DEFAULT_HAIR_SECONDARY: RgbaColor = { r: 192, g: 148, b: 236, a: 255 };

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len <= 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

function srgbByteToLinear(byteVal: number): number {
  const s = clamp(byteVal / 255, 0, 1);
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgbByte(linearVal: number): number {
  const mapped = clamp(linearVal, 0, 1);
  const s = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * Math.pow(mapped, 1 / 2.4) - 0.055;
  return Math.round(clamp(s, 0, 1) * 255);
}

function resampleGuideCurve(
  guidePoints: readonly Point2D[],
  sampleCount: number,
): {
  readonly centersX: Float32Array;
  readonly centersY: Float32Array;
  readonly tanX: Float32Array;
  readonly tanY: Float32Array;
} {
  if (guidePoints.length < 2) {
    throw new RangeError("가이드 접선 곡선은 최소 2개 이상의 정점이 필요하다");
  }
  const cumLen = new Float64Array(guidePoints.length);
  let total = 0;
  for (let i = 1; i < guidePoints.length; i += 1) {
    const dx = guidePoints[i]!.x - guidePoints[i - 1]!.x;
    const dy = guidePoints[i]!.y - guidePoints[i - 1]!.y;
    total += Math.sqrt(dx * dx + dy * dy);
    cumLen[i] = total;
  }
  const safeTotal = Math.max(1e-6, total);
  const centersX = new Float32Array(sampleCount);
  const centersY = new Float32Array(sampleCount);
  const tanX = new Float32Array(sampleCount);
  const tanY = new Float32Array(sampleCount);

  let segIdx = 0;
  for (let s = 0; s < sampleCount; s += 1) {
    const targetDist = (s / Math.max(1, sampleCount - 1)) * safeTotal;
    while (segIdx + 2 < guidePoints.length && cumLen[segIdx + 1]! < targetDist) {
      segIdx += 1;
    }
    const a = guidePoints[segIdx]!;
    const b = guidePoints[segIdx + 1]!;
    const segStart = cumLen[segIdx]!;
    const segSpan = Math.max(1e-6, cumLen[segIdx + 1]! - segStart);
    const alpha = clamp((targetDist - segStart) / segSpan, 0, 1);
    centersX[s] = a.x + (b.x - a.x) * alpha;
    centersY[s] = a.y + (b.y - a.y) * alpha;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dLen = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
    tanX[s] = dx / dLen;
    tanY[s] = dy / dLen;
  }
  return { centersX, centersY, tanX, tanY };
}

/**
 * 아티스트 가이드 접선 곡선 1개와 광원 벡터로부터 Kajiya-Kay + Marschner 큐티클 틸트 이동
 * 1차·2차 정반사 로브와 가닥 방향 미세 차폐를 1ms 미만으로 합성한다.
 */
export function generateKajiyaMarschnerHairHighlight(
  input: KajiyaHairHighlightInput,
): KajiyaHairHighlightResult {
  const t0 = nowMs();
  const width = Math.max(4, Math.floor(input.swatchWidth ?? 64));
  const height = Math.max(4, Math.floor(input.swatchHeight ?? 96));
  const shadingStyle = input.shadingStyle ?? "cel";
  const bandHalfWidthPx = Math.max(1, input.bandHalfWidthPx ?? 28);
  const cuticleTiltRad = ((input.cuticleTiltDeg ?? -7.5) * Math.PI) / 180;
  const primaryPower = Math.max(4, input.primarySpecularPower ?? 72);
  const secondaryPower = Math.max(2, input.secondarySpecularPower ?? 26);
  const strandCount = Math.max(1, input.strandCount ?? 14);

  const baseColor = input.baseHairColor ?? DEFAULT_HAIR_BASE;
  const primaryColor = input.primaryHighlightColor ?? DEFAULT_HAIR_PRIMARY;
  const secondaryColor = input.secondaryHighlightColor ?? DEFAULT_HAIR_SECONDARY;

  const L = normalizeVec3(input.lightDirection);
  const V = normalizeVec3(input.viewDirection ?? { x: 0, y: 0, z: 1 });
  const H = normalizeVec3({ x: L.x + V.x, y: L.y + V.y, z: L.z + V.z });

  const { centersX, centersY, tanX, tanY } = resampleGuideCurve(input.guidePoints, height);
  const shiftPrimary = Math.tan(cuticleTiltRad);
  const shiftSecondaryBase = Math.tan(-1.5 * cuticleTiltRad);

  const cellCount = width * height;
  const rgba = new Uint8Array(cellCount * 4);
  const primaryLobeIntensity = new Float32Array(cellCount);
  const secondaryLobeIntensity = new Float32Array(cellCount);
  const microShadowFactor = new Float32Array(cellCount);

  const bestRowPerCol = new Int32Array(width);
  const bestValPerCol = new Float32Array(width).fill(-1);
  let rowSumPrimary = 0;
  let weightSumPrimary = 0;
  let rowSumSecondary = 0;
  let weightSumSecondary = 0;

  for (let y = 0; y < height; y += 1) {
    const u = y / Math.max(1, height - 1);
    const tx2 = tanX[y]!;
    const ty2 = tanY[y]!;
    const bx2 = -ty2;
    const by2 = tx2;

    const domeAngle = (u - 0.45) * 1.15;
    const cosDome = Math.cos(domeAngle);
    const sinDome = Math.sin(domeAngle);
    const t0x = tx2 * cosDome;
    const t0y = ty2 * cosDome;
    const t0z = -sinDome;

    const lateralGrazing = Math.abs(L.x * bx2 + L.y * by2);

    for (let x = 0; x < width; x += 1) {
      const vNorm = (x / Math.max(1, width - 1)) * 2 - 1;
      const idx = y * width + x;

      const nsRawX = -tx2 * sinDome + bx2 * 0.32 * vNorm;
      const nsRawY = -ty2 * sinDome + by2 * 0.32 * vNorm;
      const nsRawZ = cosDome * Math.sqrt(Math.max(0.15, 1 - 0.25 * vNorm * vNorm));
      const invNs = 1 / Math.max(1e-6, Math.sqrt(nsRawX * nsRawX + nsRawY * nsRawY + nsRawZ * nsRawZ));
      const nx = nsRawX * invNs;
      const ny = nsRawY * invNs;
      const nz = nsRawZ * invNs;

      const strandPhase = vNorm * Math.PI * strandCount;
      const ridge = 0.5 + 0.5 * Math.cos(strandPhase);
      const microShadow = clamp(1 - lateralGrazing * (1 - ridge) * 0.72, 0.18, 1);
      microShadowFactor[idx] = microShadow;

      // 1차 R 로브: 큐티클 경사(+α)만큼 이동한 유효 접선과의 Kajiya-Kay sin(T_1, H)
      const t1RawX = t0x + shiftPrimary * nx;
      const t1RawY = t0y + shiftPrimary * ny;
      const t1RawZ = t0z + shiftPrimary * nz;
      const invT1 = 1 / Math.max(1e-6, Math.sqrt(t1RawX * t1RawX + t1RawY * t1RawY + t1RawZ * t1RawZ));
      const dotTH1 = clamp(dot3(t1RawX * invT1, t1RawY * invT1, t1RawZ * invT1, H.x, H.y, H.z), -1, 1);
      const sinTH1 = Math.sqrt(Math.max(0, 1 - dotTH1 * dotTH1));

      // 2차 TRT 로브: 반대 방향(-1.5α) 이동 및 가닥별 미세 어긋남 변조
      const shiftSec = shiftSecondaryBase + 0.045 * Math.sin(strandPhase);
      const t2RawX = t0x + shiftSec * nx;
      const t2RawY = t0y + shiftSec * ny;
      const t2RawZ = t0z + shiftSec * nz;
      const invT2 = 1 / Math.max(1e-6, Math.sqrt(t2RawX * t2RawX + t2RawY * t2RawY + t2RawZ * t2RawZ));
      const dotTH2 = clamp(dot3(t2RawX * invT2, t2RawY * invT2, t2RawZ * invT2, H.x, H.y, H.z), -1, 1);
      const sinTH2 = Math.sqrt(Math.max(0, 1 - dotTH2 * dotTH2));

      const dirAtten = clamp((dot3(nx, ny, nz, L.x, L.y, L.z) + 0.38) / 1.38, 0, 1);
      const rawPrimary = dirAtten * Math.pow(sinTH1, primaryPower) * microShadow;
      const rawSecondary = dirAtten * Math.pow(sinTH2, secondaryPower) * (0.7 + 0.3 * ridge) * microShadow;

      const pFinal = shadingStyle === "cel" ? smoothstep(0.46, 0.62, rawPrimary) : clamp(rawPrimary, 0, 1);
      const sFinal = shadingStyle === "cel" ? smoothstep(0.38, 0.55, rawSecondary) * 0.65 : clamp(rawSecondary * 0.65, 0, 1);

      primaryLobeIntensity[idx] = pFinal;
      secondaryLobeIntensity[idx] = sFinal;

      rowSumPrimary += u * rawPrimary;
      weightSumPrimary += rawPrimary;
      rowSumSecondary += u * rawSecondary;
      weightSumSecondary += rawSecondary;

      if (rawPrimary > bestValPerCol[x]!) {
        bestValPerCol[x] = rawPrimary;
        bestRowPerCol[x] = y;
      }

      const shadeBase = 0.68 + 0.32 * dirAtten * microShadow;
      const rMix = clamp(
        baseColor.r * shadeBase * (1 - sFinal) + secondaryColor.r * sFinal + primaryColor.r * pFinal,
        0,
        255,
      );
      const gMix = clamp(
        baseColor.g * shadeBase * (1 - sFinal) + secondaryColor.g * sFinal + primaryColor.g * pFinal,
        0,
        255,
      );
      const bMix = clamp(
        baseColor.b * shadeBase * (1 - sFinal) + secondaryColor.b * sFinal + primaryColor.b * pFinal,
        0,
        255,
      );

      const off = idx * 4;
      rgba[off] = Math.round(rMix);
      rgba[off + 1] = Math.round(gMix);
      rgba[off + 2] = Math.round(bMix);
      rgba[off + 3] = baseColor.a;
    }
  }

  const angelRingRibbon: Point2D[] = [];
  for (let x = 0; x < width; x += 1) {
    const vNorm = (x / Math.max(1, width - 1)) * 2 - 1;
    const py = bestRowPerCol[x]!;
    const bx2 = -tanY[py]!;
    const by2 = tanX[py]!;
    angelRingRibbon.push({
      x: centersX[py]! + bx2 * vNorm * bandHalfWidthPx,
      y: centersY[py]! + by2 * vNorm * bandHalfWidthPx,
    });
  }

  return {
    width,
    height,
    shadingStyle,
    rgba,
    primaryLobeIntensity,
    secondaryLobeIntensity,
    microShadowFactor,
    angelRingRibbon,
    peakPrimaryU: weightSumPrimary > 1e-9 ? rowSumPrimary / weightSumPrimary : 0.5,
    peakSecondaryU: weightSumSecondary > 1e-9 ? rowSumSecondary / weightSumSecondary : 0.5,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}

/**
 * 파장 의존 레일리 산란(λ^-4) 계수(m^-1)를 계산한다.
 * 청색(440nm)이 적색(680nm)보다 (680/440)^4 ≈ 5.707배 강하게 산란된다.
 */
export function computeRayleighCoefficients(
  rayleighScale = 1,
): readonly [number, number, number] {
  const baseGreen550 = 1.35e-5 * Math.max(0, rayleighScale);
  const kR = baseGreen550 * Math.pow(550 / RAYLEIGH_WAVELENGTHS_NM[0], 4);
  const kG = baseGreen550;
  const kB = baseGreen550 * Math.pow(550 / RAYLEIGH_WAVELENGTHS_NM[2], 4);
  return [kR, kG, kB];
}

/**
 * 단일 물리 거리(m)에 대한 레일리·미 산란 투과율(Transmittance)과 유입 대기광(In-Scattering)을 계산한다.
 */
export function computeRayleighMieAtmosphereSample(
  depthMeters: number,
  options: AerialAtmosphereOptions,
): AerialScatteringSample {
  const d = Math.max(0, depthMeters) * Math.max(0, options.distanceScale ?? 1);
  const turbidity = Math.max(1, options.turbidity ?? 2.2);
  const g = clamp(options.mieAnisotropyG ?? 0.76, 0, 0.95);
  const sunIntensity = Math.max(0, options.sunIntensity ?? 14.0);
  const sunTint = options.sunTintLinearRgb ?? [1.0, 0.98, 0.95];

  const sunDir = normalizeVec3(options.sunDirection);
  const viewDir = normalizeVec3(options.viewDirection ?? { x: 0, y: 0, z: -1 });
  const cosTheta = clamp(dot3(viewDir.x, viewDir.y, viewDir.z, sunDir.x, sunDir.y, sunDir.z), -1, 1);

  const betaR = computeRayleighCoefficients(options.rayleighScale ?? 1);
  const mieDensity = (turbidity - 1) * 2.2e-5;
  const betaMieS: readonly [number, number, number] = [
    mieDensity * 0.96,
    mieDensity * 1.0,
    mieDensity * 1.05,
  ];
  const betaMieE: readonly [number, number, number] = [
    betaMieS[0] / 0.9,
    betaMieS[1] / 0.9,
    betaMieS[2] / 0.9,
  ];

  const phaseR = (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
  const hgDenom = Math.pow(1 + g * g - 2 * g * cosTheta, 1.5);
  const phaseM = (1 / (4 * Math.PI)) * ((1 - g * g) / Math.max(1e-6, hgDenom));

  const transmittance: [number, number, number] = [1, 1, 1];
  const inScatter: [number, number, number] = [0, 0, 0];

  for (let c = 0; c < 3; c += 1) {
    const bExt = betaR[c]! + betaMieE[c]!;
    const fEx = bExt > 0 ? Math.exp(-bExt * d) : 1;
    transmittance[c] = fEx;
    if (bExt > 1e-12 && d > 0) {
      const angular = betaR[c]! * phaseR + betaMieS[c]! * phaseM;
      const rawSkyEquilibrium = sunIntensity * sunTint[c]! * (angular / bExt);
      const skyHorizonLinear = 1 - Math.exp(-rawSkyEquilibrium);
      inScatter[c] = skyHorizonLinear * (1 - fEx);
    }
  }

  return {
    depthMeters: Math.max(0, depthMeters),
    betaRayleigh: betaR,
    betaMieExtinction: betaMieE,
    transmittance,
    inScatterLinearRgb: inScatter,
  };
}

/**
 * 픽셀별 미터 깊이 버퍼를 바탕으로 배경 RGBA 이미지에 물리 공기원근법(소산 + 유입 산란광)을 적용한다.
 */
export function applyAerialPerspectiveDepthBuffer(
  rgba: Uint8Array,
  depthMetersBuffer: Float32Array,
  width: number,
  height: number,
  options: AerialAtmosphereOptions,
): AerialDepthBufferReport {
  const t0 = nowMs();
  const pixelCount = width * height;
  if (rgba.byteLength !== pixelCount * 4 || depthMetersBuffer.length !== pixelCount) {
    throw new RangeError("RGBA 및 깊이 버퍼 길이가 해상도와 일치하지 않는다");
  }

  const outRgba = new Uint8Array(pixelCount * 4);
  let sumTransRed = 0;
  let sumTransBlue = 0;
  let maxInScatterLum = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const sample = computeRayleighMieAtmosphereSample(depthMetersBuffer[i]!, options);
    sumTransRed += sample.transmittance[0];
    sumTransBlue += sample.transmittance[2];
    const inLum =
      0.2126 * sample.inScatterLinearRgb[0] +
      0.7152 * sample.inScatterLinearRgb[1] +
      0.0722 * sample.inScatterLinearRgb[2];
    if (inLum > maxInScatterLum) maxInScatterLum = inLum;

    const off = i * 4;
    const linR = srgbByteToLinear(rgba[off]!) * sample.transmittance[0] + sample.inScatterLinearRgb[0];
    const linG = srgbByteToLinear(rgba[off + 1]!) * sample.transmittance[1] + sample.inScatterLinearRgb[1];
    const linB = srgbByteToLinear(rgba[off + 2]!) * sample.transmittance[2] + sample.inScatterLinearRgb[2];

    outRgba[off] = linearToSrgbByte(linR);
    outRgba[off + 1] = linearToSrgbByte(linG);
    outRgba[off + 2] = linearToSrgbByte(linB);
    outRgba[off + 3] = rgba[off + 3]!;
  }

  return {
    width,
    height,
    rgba: outRgba,
    meanTransmittanceBlue: pixelCount > 0 ? sumTransBlue / pixelCount : 1,
    meanTransmittanceRed: pixelCount > 0 ? sumTransRed / pixelCount : 1,
    maxInScatterLuminance: maxInScatterLum,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}

/**
 * 깊이(m)가 부여된 다중 평면 레이어들을 원경에서 근경 순서로 정렬해 물리 대기원근법과 함께 합성한다.
 */
export function composeAerialPerspectiveLayers(
  layers: readonly AerialPerspectiveLayerInput[],
  width: number,
  height: number,
  options: AerialAtmosphereOptions,
): AerialLayerComposeReport {
  const t0 = nowMs();
  const pixelCount = width * height;
  const sorted = [...layers].sort((a, b) => b.depthMeters - a.depthMeters);
  const accumLinear = new Float32Array(pixelCount * 4);
  const layerTransmittances: {
    readonly layerId: string;
    readonly depthMeters: number;
    readonly transmittanceRgb: readonly [number, number, number];
    readonly inScatterRgb: readonly [number, number, number];
  }[] = [];

  // 배경 하늘 기본 대기색(무한 원경 25km 기준 유입광)으로 캔버스를 초기화한다.
  const skySample = computeRayleighMieAtmosphereSample(25000, options);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    accumLinear[off] = skySample.inScatterLinearRgb[0];
    accumLinear[off + 1] = skySample.inScatterLinearRgb[1];
    accumLinear[off + 2] = skySample.inScatterLinearRgb[2];
    accumLinear[off + 3] = 1;
  }

  for (const layer of sorted) {
    if (layer.rgba.byteLength !== pixelCount * 4) {
      throw new RangeError(`레이어 ${layer.layerId} 버퍼 크기 불일치`);
    }
    const sample = computeRayleighMieAtmosphereSample(layer.depthMeters, options);
    layerTransmittances.push({
      layerId: layer.layerId,
      depthMeters: layer.depthMeters,
      transmittanceRgb: sample.transmittance,
      inScatterRgb: sample.inScatterLinearRgb,
    });
    const layerOpacity = clamp(layer.opacity ?? 1, 0, 1);

    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      const srcA = (layer.rgba[off + 3]! / 255) * layerOpacity;
      if (srcA <= 0) continue;
      const aerR = srgbByteToLinear(layer.rgba[off]!) * sample.transmittance[0] + sample.inScatterLinearRgb[0];
      const aerG = srgbByteToLinear(layer.rgba[off + 1]!) * sample.transmittance[1] + sample.inScatterLinearRgb[1];
      const aerB = srgbByteToLinear(layer.rgba[off + 2]!) * sample.transmittance[2] + sample.inScatterLinearRgb[2];
      const invA = 1 - srcA;
      accumLinear[off] = aerR * srcA + accumLinear[off]! * invA;
      accumLinear[off + 1] = aerG * srcA + accumLinear[off + 1]! * invA;
      accumLinear[off + 2] = aerB * srcA + accumLinear[off + 2]! * invA;
      accumLinear[off + 3] = srcA + accumLinear[off + 3]! * invA;
    }
  }

  const outRgba = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    outRgba[off] = linearToSrgbByte(accumLinear[off]!);
    outRgba[off + 1] = linearToSrgbByte(accumLinear[off + 1]!);
    outRgba[off + 2] = linearToSrgbByte(accumLinear[off + 2]!);
    outRgba[off + 3] = Math.round(clamp(accumLinear[off + 3]!, 0, 1) * 255);
  }

  return {
    width,
    height,
    rgba: outRgba,
    layerTransmittances,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}
