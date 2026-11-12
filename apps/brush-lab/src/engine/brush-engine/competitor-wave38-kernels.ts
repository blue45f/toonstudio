/**
 * Sumi 브러시 랩 Wave 38 심화 경쟁사 패리티 R&D 커널.
 *
 * Wave 37(구심 Catmull 적응 스탬프·서브픽셀 SDF AA·원심 강모·모세관 커피링·양방향 스머지)에 이어
 * 상용 페인팅 툴의 고급 물리·기하 표현 4종을 결정적 순수 함수(외부/DOM/Node 의존 0)로 검증한다:
 * 1. 듀얼 브러시 실루엣 내부 불리언 각인(Dual-Brush Silhouette-Bounded Boolean Carve):
 *    주 브러시 외곽선 밖으로의 번짐(spill) 0%를 보장하면서 내부에 건식 분필·목탄 기공을 곱하기/선형감산/번으로 각인한다.
 * 2. 스타일러스 배럴 트위스트(0~360°) + 고도·방위각 3D 치즐 닙 투영(3D Chisel Nib Projection):
 *    펜 축 회전에 따라 칼날 세필(edge)에서 광폭 리본(broad)까지 불연속 점프 없이 연속 투영한다.
 * 3. 딥펜(G펜·마루펜) 체류 잉크 고임 & 고필압 펜촉 갈라짐(Velocity Dwell Pooling & Nib Tine Split):
 *    저속 코너 체류 시 모세관 잉크 고임과 고필압 시 좌우 금속 펜촉 레일 분리를 동시에 모델링한다.
 * 4. 이방성 종이 섬유 수채 번짐 & 다중 분자량 색분리 후광(Anisotropic Fiber Feather & Chroma Halo):
 *    종이 섬유 결 방향으로 저분자 염료가 먼저 확산되고 고밀도 광물 안료가 중심에 남는 자연 색분리를 Ghost 천장 안에서 계산한다.
 */

import { hashU32 } from "../core/rng";

import type { LabImage, Rgb } from "../core/types";

export type Wave38DualCombineMode = "multiply" | "linear-height-subtract" | "color-burn";

export interface Wave38DualBrushMaskReport {
  readonly primaryOnlyImage: LabImage;
  readonly dualCarvedImage: LabImage;
  readonly outsideSilhouetteLeakage01: number;
  readonly internalGrainStdDevPrimary: number;
  readonly internalGrainStdDevDual: number;
  readonly internalGrainContrastGain01: number;
  readonly silhouettePreservationRatio01: number;
}

export interface Wave38BarrelTwistNibSample {
  readonly twistDeg: number;
  readonly projectedMajorPx: number;
  readonly projectedMinorPx: number;
  readonly projectedAngleRad: number;
  readonly effectiveStrokeWidthPx: number;
}

export interface Wave38BarrelTwistNibReport {
  readonly sweepSamples: readonly Wave38BarrelTwistNibSample[];
  readonly minEdgeStrokeWidthPx: number;
  readonly maxBroadStrokeWidthPx: number;
  readonly broadToEdgeWidthRatio: number;
  readonly wraparoundWidthDeltaPx: number;
}

export interface Wave38DipPenNibSplitReport {
  readonly dwellCornerPoolGain01: number;
  readonly highPressureTineSplitSpanPx: number;
  readonly twinRailPeakOverCenterGain01: number;
  readonly crossSectionProfile01: readonly number[];
}

export interface Wave38FiberFeatherChromaReport {
  readonly alongFiberSpreadRadiusPx: number;
  readonly crossFiberSpreadRadiusPx: number;
  readonly fiberAnisotropyAspectRatio: number;
  readonly coreRgb01: Rgb;
  readonly featherHaloRgb01: Rgb;
  readonly chromaHaloSeparation01: number;
  readonly ghostCeilingViolationCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = Math.max(1e-6, edge1 - edge0);
  const t = clamp01((x - edge0) / denom);
  return Math.fround(t * t * (3 - 2 * t));
}

function valueNoise2D(x: number, y: number, scalePx: number, seed: number): number {
  const s = Math.max(1.2, scalePx);
  const gx = x / s;
  const gy = y / s;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const corner = (cx: number, cy: number): number =>
    (hashU32(cx, cy, seed) & 0xffff) / 65535;

  const n00 = corner(ix, iy);
  const n10 = corner(ix + 1, iy);
  const n01 = corner(ix, iy + 1);
  const n11 = corner(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/**
 * 1. 듀얼 브러시 실루엣 보존 불리언 각인 커널 (Photoshop/Procreate/CSP Dual Brush 패리티).
 */
export function evaluateDualBrushBooleanMasking(params: {
  readonly canvasSizePx?: number;
  readonly primaryRadiusPx: number;
  readonly secondaryGrainScalePx: number;
  readonly carveDepth01: number;
  readonly combineMode: Wave38DualCombineMode;
  readonly seed?: number;
}): Wave38DualBrushMaskReport {
  const size = Math.max(24, Math.min(128, Math.floor(params.canvasSizePx ?? 48)));
  const radius = Math.max(3, Math.min(size * 0.44, params.primaryRadiusPx));
  const scale = clamp(params.secondaryGrainScalePx, 1.8, 24);
  const depth = clamp01(params.carveDepth01);
  const seed = params.seed ?? 20261112;

  const primaryData = new Uint8ClampedArray(size * size * 4).fill(255);
  const dualData = new Uint8ClampedArray(size * size * 4).fill(255);

  const cx = size * 0.5;
  const cy = size * 0.5;
  let outsideLeakSum = 0;
  let outsidePixelCount = 0;
  let silhouetteCoveredPrimary = 0;
  let silhouetteCoveredDual = 0;
  const interiorPrimaryVals: number[] = [];
  const interiorDualVals: number[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dist = Math.hypot(px - cx, py - cy);
      const sdf = dist - radius;
      const primaryAlpha = 1 - smoothstep(-0.85, 0.85, sdf);

      // 2옥타브 다공성 분필·목탄 보조 스탬프 필드
      const coarse = valueNoise2D(px, py, scale, seed);
      const fine = valueNoise2D(px + 13.7, py - 7.3, scale * 0.48, seed ^ 0x5f3759df);
      const secondaryMask = clamp01(coarse * 0.65 + fine * 0.35);

      let dualAlpha: number;
      if (primaryAlpha <= 0) {
        dualAlpha = 0;
      } else if (params.combineMode === "multiply") {
        dualAlpha = primaryAlpha * (1 - depth + depth * secondaryMask);
      } else if (params.combineMode === "linear-height-subtract") {
        dualAlpha = clamp01(primaryAlpha - (1 - secondaryMask) * depth * 0.85) * (primaryAlpha > 0 ? 1 : 0);
      } else {
        const denom = Math.max(0.08, secondaryMask + (1 - depth));
        dualAlpha = primaryAlpha * clamp01(1 - (1 - primaryAlpha) / denom * 0.45) * (1 - depth * 0.5 * (1 - secondaryMask));
      }
      // 주 실루엣 상한 절대 보호 (외곽 번짐 0 보장)
      dualAlpha = Math.min(primaryAlpha, clamp01(dualAlpha));

      if (sdf > 0.85) {
        outsideLeakSum += dualAlpha;
        outsidePixelCount += 1;
      }
      if (primaryAlpha > 0.05) silhouetteCoveredPrimary += 1;
      if (dualAlpha > 0.05) silhouetteCoveredDual += 1;
      if (dist <= radius * 0.78) {
        interiorPrimaryVals.push(primaryAlpha);
        interiorDualVals.push(dualAlpha);
      }

      const off = (y * size + x) * 4;
      const pByte = Math.round((1 - primaryAlpha * 0.92) * 255);
      const dByte = Math.round((1 - dualAlpha * 0.92) * 255);
      primaryData[off] = pByte;
      primaryData[off + 1] = pByte;
      primaryData[off + 2] = pByte;
      primaryData[off + 3] = 255;

      dualData[off] = dByte;
      dualData[off + 1] = dByte;
      dualData[off + 2] = dByte;
      dualData[off + 3] = 255;
    }
  }

  const stdDev = (arr: readonly number[]): number => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, v) => a + (v - mean) * (v - mean), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const internalGrainStdDevPrimary = Math.fround(stdDev(interiorPrimaryVals));
  const internalGrainStdDevDual = Math.fround(stdDev(interiorDualVals));
  const internalGrainContrastGain01 = Math.fround(
    Math.max(0, internalGrainStdDevDual - internalGrainStdDevPrimary),
  );
  const outsideSilhouetteLeakage01 = Math.fround(
    outsidePixelCount > 0 ? outsideLeakSum / outsidePixelCount : 0,
  );
  const silhouettePreservationRatio01 = Math.fround(
    silhouetteCoveredPrimary > 0 ? clamp01(silhouetteCoveredDual / silhouetteCoveredPrimary) : 1,
  );

  return {
    primaryOnlyImage: { width: size, height: size, data: primaryData },
    dualCarvedImage: { width: size, height: size, data: dualData },
    outsideSilhouetteLeakage01,
    internalGrainStdDevPrimary,
    internalGrainStdDevDual,
    internalGrainContrastGain01,
    silhouettePreservationRatio01,
  };
}

/**
 * 2. 스타일러스 배럴 트위스트(0~360°) + 고도·방위각 3D 납작/치즐 닙 투영 커널.
 */
export function evaluateBarrelTwistChiselNibProjection(params: {
  readonly nibWidthPx: number;
  readonly nibThicknessRatio01: number;
  readonly strokeDirectionRad: number;
  readonly tiltAltitudeDeg: number;
  readonly azimuthDeg: number;
  readonly sweepTwistAnglesDeg?: readonly number[];
}): Wave38BarrelTwistNibReport {
  const majorBase = Math.max(2, params.nibWidthPx * 0.5);
  const thicknessRatio = clamp(params.nibThicknessRatio01, 0.08, 0.65);
  const altitudeRad = (clamp(params.tiltAltitudeDeg, 12, 90) * Math.PI) / 180;
  const azimuthRad = (params.azimuthDeg * Math.PI) / 180;
  const tiltLaydown = Math.cos(altitudeRad);

  const angles = params.sweepTwistAnglesDeg ?? [0, 30, 60, 90, 135, 180, 270, 359, 1];

  const projectOne = (twistDeg: number): Wave38BarrelTwistNibSample => {
    const twistRad = ((twistDeg % 360) * Math.PI) / 180;
    const nibWorldAngle = twistRad + azimuthRad * 0.25;
    const projectedMajorPx = Math.fround(majorBase * (1 + tiltLaydown * 0.28));
    const projectedMinorPx = Math.fround(
      Math.max(0.25, majorBase * thicknessRatio * (1 + tiltLaydown * 0.65)),
    );
    // 진행 방향 법선에 투영된 실제 선폭: |major * sin(Δθ)|와 |minor * cos(Δθ)|의 타원 지지함수(support function)
    const relAngle = nibWorldAngle - params.strokeDirectionRad;
    const sinA = Math.sin(relAngle);
    const cosA = Math.cos(relAngle);
    const halfCrossWidth = Math.hypot(projectedMajorPx * sinA, projectedMinorPx * cosA);
    return {
      twistDeg,
      projectedMajorPx,
      projectedMinorPx,
      projectedAngleRad: Math.fround(nibWorldAngle),
      effectiveStrokeWidthPx: Math.fround(halfCrossWidth * 2),
    };
  };

  const sweepSamples = angles.map(projectOne);
  let minEdge = Infinity;
  let maxBroad = 0;
  for (let deg = 0; deg < 180; deg += 5) {
    const s = projectOne(deg);
    if (s.effectiveStrokeWidthPx < minEdge) minEdge = s.effectiveStrokeWidthPx;
    if (s.effectiveStrokeWidthPx > maxBroad) maxBroad = s.effectiveStrokeWidthPx;
  }

  const s359 = projectOne(359);
  const s001 = projectOne(1);
  const wraparoundWidthDeltaPx = Math.fround(
    Math.abs(s359.effectiveStrokeWidthPx - s001.effectiveStrokeWidthPx),
  );

  return {
    sweepSamples,
    minEdgeStrokeWidthPx: Math.fround(minEdge),
    maxBroadStrokeWidthPx: Math.fround(maxBroad),
    broadToEdgeWidthRatio: Math.fround(maxBroad / Math.max(0.2, minEdge)),
    wraparoundWidthDeltaPx,
  };
}

/**
 * 3. 딥펜(G펜·마루펜) 저속 코너 잉크 고임(Dwell Pooling) 및 고필압 펜촉 갈라짐(Tine Split) 커널.
 */
export function evaluateVelocityInkPoolingAndNibSplit(params: {
  readonly baseRadiusPx: number;
  readonly pressure01: number;
  readonly speedPxPerSec: number;
  readonly cornerTurnAngleDeg: number;
  readonly inkLoad01: number;
  readonly splitThresholdPressure01?: number;
}): Wave38DipPenNibSplitReport {
  const baseR = Math.max(1, params.baseRadiusPx);
  const pressure = clamp01(params.pressure01);
  const speed = Math.max(0, params.speedPxPerSec);
  const turnNorm = clamp01(Math.abs(params.cornerTurnAngleDeg) / 135);
  const inkLoad = clamp01(params.inkLoad01);
  const splitThreshold = clamp(params.splitThresholdPressure01 ?? 0.64, 0.3, 0.92);

  // 저속 체류 + 급회전 코너에서 모세관 잉크 고임 증가
  const slowFactor = Math.exp(-speed / 260);
  const dwellCornerPoolGain01 = Math.fround(
    clamp01(inkLoad * (0.14 * slowFactor + 0.18 * turnNorm * (0.4 + 0.6 * slowFactor))),
  );

  // 임계 필압 초과 시 금속 펜촉 두 갈래(tine) 벌어짐
  const splitOver = clamp01((pressure - splitThreshold) / Math.max(0.05, 1 - splitThreshold));
  const highPressureTineSplitSpanPx = Math.fround(baseR * splitOver * 0.76);

  // 횡단면 11구간(-1..+1) 농도 프로파일: 잉크 적재량이 낮고 고필압일수록 양쪽 레일 피크가 선명해짐
  const profile: number[] = [];
  const railPos = 0.58 * splitOver;
  const railSigma = Math.max(0.18, 0.36 - splitOver * 0.12);
  const bridgeFill = clamp01(inkLoad * 0.85 - splitOver * (1 - inkLoad) * 0.65);

  for (let i = 0; i < 11; i += 1) {
    const u = (i / 5) - 1;
    const leftRail = Math.exp(-Math.pow((u + railPos) / railSigma, 2));
    const rightRail = Math.exp(-Math.pow((u - railPos) / railSigma, 2));
    const centerBridge = bridgeFill * Math.exp(-Math.pow(u / 0.55, 2));
    const density = clamp01(Math.max(leftRail, rightRail) * (0.55 + 0.45 * pressure) + centerBridge * 0.35 + dwellCornerPoolGain01 * 0.25);
    profile.push(Math.fround(density));
  }

  const centerVal = profile[5] ?? 0;
  const leftPeak = Math.max(profile[2] ?? 0, profile[3] ?? 0);
  const rightPeak = Math.max(profile[7] ?? 0, profile[8] ?? 0);
  const twinRailPeakOverCenterGain01 = Math.fround(
    Math.max(0, (leftPeak + rightPeak) * 0.5 - centerVal),
  );

  return {
    dwellCornerPoolGain01,
    highPressureTineSplitSpanPx,
    twinRailPeakOverCenterGain01,
    crossSectionProfile01: profile,
  };
}

/**
 * 4. 이방성 종이 섬유 수채 번짐 및 다중 안료 색분리 후광(Chromatic Halo Separation) 커널.
 */
export function evaluateAnisotropicFiberFeatherAndChromaSeparation(params: {
  readonly baseRadiusPx: number;
  readonly wetness01: number;
  readonly fiberAnisotropy01: number;
  readonly heavyPigmentRgb01: Rgb;
  readonly lightDyeRgb01: Rgb;
  readonly dyeMobilityBias01: number;
  readonly targetWashCeiling01: number;
}): Wave38FiberFeatherChromaReport {
  const r0 = Math.max(1.5, params.baseRadiusPx);
  const wet = clamp01(params.wetness01);
  const aniso = clamp01(params.fiberAnisotropy01);
  const mobility = clamp01(params.dyeMobilityBias01);
  const ceiling = clamp(params.targetWashCeiling01, 0.1, 0.98);

  const alongFiberSpreadRadiusPx = Math.fround(r0 * (1 + wet * (0.28 + 0.58 * aniso)));
  const crossFiberSpreadRadiusPx = Math.fround(r0 * (1 + wet * (0.22 * (1 - 0.55 * aniso))));
  const fiberAnisotropyAspectRatio = Math.fround(
    alongFiberSpreadRadiusPx / Math.max(0.5, crossFiberSpreadRadiusPx),
  );

  // 중심부는 무거운 광물 안료 비중이 높고, 섬유 번짐 외곽 후광은 이동성이 높은 염료 비중이 높음
  const coreHeavyWeight = clamp01(0.76 + 0.16 * (1 - mobility));
  const haloDyeWeight = clamp01(0.45 + 0.48 * mobility * wet);

  const mixRgb = (heavyW: number): Rgb => {
    const lw = 1 - heavyW;
    return {
      r: Math.fround(clamp01(params.heavyPigmentRgb01.r * heavyW + params.lightDyeRgb01.r * lw)),
      g: Math.fround(clamp01(params.heavyPigmentRgb01.g * heavyW + params.lightDyeRgb01.g * lw)),
      b: Math.fround(clamp01(params.heavyPigmentRgb01.b * heavyW + params.lightDyeRgb01.b * lw)),
    };
  };

  const coreRgb01 = mixRgb(coreHeavyWeight);
  const featherHaloRgb01 = mixRgb(1 - haloDyeWeight);
  const chromaHaloSeparation01 = Math.fround(
    Math.hypot(
      featherHaloRgb01.r - coreRgb01.r,
      featherHaloRgb01.g - coreRgb01.g,
      featherHaloRgb01.b - coreRgb01.b,
    ) / Math.sqrt(3),
  );

  // 방사형 24스텝 Ghost-Buffer 농도 상한 검증
  let violations = 0;
  for (let i = 0; i < 24; i += 1) {
    const u = i / 23;
    const rawAlpha = ceiling * (0.88 - 0.55 * u * u) * (0.65 + 0.35 * wet);
    const bounded = ceiling * (1 - Math.exp(-Math.max(0, rawAlpha) / Math.max(0.05, ceiling * 0.7)));
    if (bounded > ceiling + 1e-6) violations += 1;
  }

  return {
    alongFiberSpreadRadiusPx,
    crossFiberSpreadRadiusPx,
    fiberAnisotropyAspectRatio,
    coreRgb01,
    featherHaloRgb01,
    chromaHaloSeparation01,
    ghostCeilingViolationCount: violations,
  };
}
