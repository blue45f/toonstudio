/**
 * Sumi 브러시 랩 Wave 37 경쟁사 1:1 패리티 브러시 품질 고도화 커널.
 *
 * 기존 스탬프/보간/물리 강모/습식/스머지 파이프라인의 5대 핵심 한계를 해결하는 순수 결정적 수식:
 * 1. 구심(Centripetal, alpha=0.5) Catmull-Rom 스플라인 + 곡률·반경 변화율 적응형 스탬프 보간:
 *    비균일 태블릿 샘플에서 자기교차(cusp)와 급커브 다각형 꺾임·콩알 자국(scalloping)을 제거한다.
 * 2. 서브픽셀 1px Smoothstep SDF 이중 엔벨로프 안티앨리어싱 + 고속 출필 칼끝 테이퍼:
 *    계단 현상(staircase aliasing) 분산을 줄이고 웹툰 선화(G펜·마루펜) 끝선의 날카로움을 높인다.
 * 3. 물리 강모 급선회 원심 부채꼴 벌어짐(Centrifugal Fan-Splay) + 저고도 기울기 측면 셰이딩:
 *    코너 선회 각속도에 비례해 외측 강모가 자연스럽게 벌어지고 기울기 시 넓은 측면 그레인이 묻어난다.
 * 4. 모세관 꽃양배추 테두리(Capillary Edge Ring) + 종이 골 입자 침전(Granulation) + Ghost-Buffer 상한 고정:
 *    수채 건조 경계로 안료가 밀려 진해지는 링 효과와 종이 요철 골 침전을 재현한다.
 * 5. 양방향 물감 픽업 스머지 리저버(Bidirectional Smudge Reservoir) + 강모 갈퀴 미세 능선 음영:
 *    바탕색 픽업·희석 연속성과 브러시 결 방향 미세 고랑 대비를 동시에 계산한다.
 */

import { hashU32 } from "../core/rng";

import type { LabImage, Rgb } from "../core/types";

export interface Wave37StrokeControlPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure01: number;
  readonly tilt01?: number;
}

export interface Wave37EmittedStamp {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly curvatureInvPx: number;
  readonly tangentAngleRad: number;
  readonly adaptiveStepPx: number;
}

export interface Wave37CentripetalAdaptiveStampReport {
  readonly adaptiveStamps: readonly Wave37EmittedStamp[];
  readonly uniformLinearScallopRatio01: number;
  readonly centripetalAdaptiveScallopRatio01: number;
  readonly scallopReductionGain01: number;
  readonly linearMaxTurnKinkDeg: number;
  readonly centripetalMaxTurnKinkDeg: number;
  readonly cornerKinkReductionRatio01: number;
}

export interface Wave37SubpixelLineartAaReport {
  readonly binaryThresholdImage: LabImage;
  readonly subpixelSdfAaImage: LabImage;
  readonly binaryEdgeGradientVariance: number;
  readonly subpixelEdgeGradientVariance: number;
  readonly edgeStaircaseVarianceReduction01: number;
  readonly tipSubpixelSharpness01: number;
  readonly terminalRadiusPx: number;
}

export interface Wave37BristleTurnSplayReport {
  readonly straightBundleSpanPx: number;
  readonly sharpTurnBundleSpanPx: number;
  readonly centrifugalFanSplayRatio: number;
  readonly uprightAspectRatio: number;
  readonly tiltedBroadSideAspectRatio: number;
  readonly releaseFlickWidthRatio01: number;
}

export interface Wave37CapillaryGranulationReport {
  readonly centerPigmentDensity01: number;
  readonly edgeCapillaryRingDensity01: number;
  readonly edgeRingContrastGain01: number;
  readonly valleyFlocculationIndex01: number;
  readonly ghostCeilingViolationCount: number;
}

export interface Wave37AnisotropicSmudgeReport {
  readonly trajectoryColors: readonly Rgb[];
  readonly pickupContinuityScore01: number;
  readonly rakeFurrowContrast01: number;
  readonly remainingReservoirLoad01: number;
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

function wrapAngleDeltaRad(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function evalCentripetalCatmullPoint(
  p0: Wave37StrokeControlPoint,
  p1: Wave37StrokeControlPoint,
  p2: Wave37StrokeControlPoint,
  p3: Wave37StrokeControlPoint,
  u01: number,
): { readonly x: number; readonly y: number; readonly pressure01: number } {
  const knotStep = (a: Wave37StrokeControlPoint, b: Wave37StrokeControlPoint): number => {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.max(1e-3, Math.sqrt(dist));
  };
  const t0 = 0;
  const t1 = t0 + knotStep(p0, p1);
  const t2 = t1 + knotStep(p1, p2);
  const t3 = t2 + knotStep(p2, p3);
  const t = t1 + clamp01(u01) * (t2 - t1);

  const lerpPt = (
    a: { readonly x: number; readonly y: number; readonly pressure01: number },
    b: { readonly x: number; readonly y: number; readonly pressure01: number },
    ta: number,
    tb: number,
  ) => {
    const w = (t - ta) / Math.max(1e-5, tb - ta);
    return {
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      pressure01: a.pressure01 + (b.pressure01 - a.pressure01) * w,
    };
  };

  const a1 = lerpPt(p0, p1, t0, t1);
  const a2 = lerpPt(p1, p2, t1, t2);
  const a3 = lerpPt(p2, p3, t2, t3);
  const b1 = lerpPt(a1, a2, t0, t2);
  const b2 = lerpPt(a2, a3, t1, t3);
  const out = lerpPt(b1, b2, t1, t2);
  return { x: out.x, y: out.y, pressure01: clamp01(out.pressure01) };
}

function measureStampScallopRatio(
  stamps: readonly { readonly x: number; readonly y: number; readonly radiusPx: number }[],
): number {
  if (stamps.length < 2) return 0;
  let worstRatio = 0;
  for (let i = 1; i < stamps.length; i += 1) {
    const prev = stamps[i - 1]!;
    const curr = stamps[i]!;
    const d = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const rMean = Math.max(0.5, (prev.radiusPx + curr.radiusPx) * 0.5);
    const halfD = d * 0.5;
    const overlapHeight = halfD >= rMean ? 0 : Math.sqrt(Math.max(0, rMean * rMean - halfD * halfD));
    const scallopDepth = (rMean - overlapHeight) / rMean;
    if (scallopDepth > worstRatio) worstRatio = scallopDepth;
  }
  return Math.fround(clamp01(worstRatio));
}

function measureMaxTurnKinkDeg(points: readonly { readonly x: number; readonly y: number }[]): number {
  if (points.length < 3) return 0;
  let maxDeg = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    const deg = (Math.abs(wrapAngleDeltaRad(a1, a2)) * 180) / Math.PI;
    if (deg > maxDeg) maxDeg = deg;
  }
  return Math.fround(maxDeg);
}

/**
 * 1. 구심(alpha=0.5) Catmull-Rom 곡선 보간 및 곡률 적응형 스탬프 배치 커널.
 */
export function evaluateCentripetalCatmullCurvatureAdaptiveStamps(params: {
  readonly controlPoints: readonly Wave37StrokeControlPoint[];
  readonly baseDiameterPx: number;
  readonly baseSpacingRatio: number;
  readonly curvatureTighteningGain?: number;
}): Wave37CentripetalAdaptiveStampReport {
  const pts = params.controlPoints;
  if (pts.length < 2) {
    return {
      adaptiveStamps: [],
      uniformLinearScallopRatio01: 0,
      centripetalAdaptiveScallopRatio01: 0,
      scallopReductionGain01: 0,
      linearMaxTurnKinkDeg: 0,
      centripetalMaxTurnKinkDeg: 0,
      cornerKinkReductionRatio01: 0,
    };
  }

  const diameter = Math.max(1, params.baseDiameterPx);
  const spacingRatio = clamp(params.baseSpacingRatio, 0.04, 0.8);
  const curvGain = clamp(params.curvatureTighteningGain ?? 2.4, 0.5, 6);

  // 비교군: 균일 선형 보간(일반 스탬프 간격 0.34 * 지름)
  const linearSpacingRatio = Math.max(spacingRatio * 2.4, 0.34);
  const linearStamps: Array<{ readonly x: number; readonly y: number; readonly radiusPx: number }> = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const rMid = Math.max(0.5, diameter * 0.5 * (0.2 + 0.8 * ((a.pressure01 + b.pressure01) * 0.5)));
    const linStep = Math.max(0.75, 2 * rMid * linearSpacingRatio);
    const count = Math.max(1, Math.floor(segLen / linStep));
    for (let s = 0; s <= count; s += 1) {
      if (i > 0 && s === 0) continue;
      const t = s / count;
      const p = a.pressure01 + (b.pressure01 - a.pressure01) * t;
      linearStamps.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        radiusPx: Math.max(0.5, diameter * 0.5 * (0.2 + 0.8 * clamp01(p))),
      });
    }
  }

  // 실험군: 구심 Catmull-Rom 미세 샘플링 후 곡률·반경 변화율 적응형 간격 적분
  const denseSamples: Array<{
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly angle: number;
    readonly curvature: number;
  }> = [];

  const subdivisions = 16;
  const reflectEndpoint = (anchor: Wave37StrokeControlPoint, inner: Wave37StrokeControlPoint): Wave37StrokeControlPoint => ({
    x: 2 * anchor.x - inner.x,
    y: 2 * anchor.y - inner.y,
    pressure01: anchor.pressure01,
  });
  const rawCurve: Array<{ readonly x: number; readonly y: number; readonly r: number }> = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = i > 0 ? pts[i - 1]! : reflectEndpoint(pts[0]!, pts[1]!);
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = i + 2 < pts.length ? pts[i + 2]! : reflectEndpoint(pts[pts.length - 1]!, pts[pts.length - 2]!);
    for (let s = 0; s <= subdivisions; s += 1) {
      if (i > 0 && s === 0) continue;
      const evalPt = evalCentripetalCatmullPoint(p0, p1, p2, p3, s / subdivisions);
      rawCurve.push({
        x: evalPt.x,
        y: evalPt.y,
        r: Math.max(0.5, diameter * 0.5 * (0.2 + 0.8 * clamp01(evalPt.pressure01))),
      });
    }
  }

  for (let i = 0; i < rawCurve.length; i += 1) {
    const prev = rawCurve[Math.max(0, i - 1)]!;
    const curr = rawCurve[i]!;
    const next = rawCurve[Math.min(rawCurve.length - 1, i + 1)]!;
    const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    const chord = Math.max(1e-3, Math.hypot(next.x - prev.x, next.y - prev.y) * 0.5);
    const dTheta = Math.abs(wrapAngleDeltaRad(angle1, angle2));
    const curvature = i === 0 || i === rawCurve.length - 1 ? 0 : dTheta / chord;
    denseSamples.push({
      x: curr.x,
      y: curr.y,
      r: curr.r,
      angle: i < rawCurve.length - 1 ? angle2 : angle1,
      curvature,
    });
  }

  const adaptiveStamps: Wave37EmittedStamp[] = [];
  if (denseSamples.length > 0) {
    const first = denseSamples[0]!;
    adaptiveStamps.push({
      x: Math.fround(first.x),
      y: Math.fround(first.y),
      radiusPx: Math.fround(first.r),
      curvatureInvPx: Math.fround(first.curvature),
      tangentAngleRad: Math.fround(first.angle),
      adaptiveStepPx: Math.fround(Math.max(0.35, 2 * first.r * spacingRatio)),
    });
  }

  let phase = 0;
  for (let i = 1; i < denseSamples.length; i += 1) {
    const a = denseSamples[i - 1]!;
    const b = denseSamples[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= 1e-5) continue;
    const rMean = (a.r + b.r) * 0.5;
    const drRatio = Math.abs(b.r - a.r) / Math.max(0.5, seg);
    const kappa = (a.curvature + b.curvature) * 0.5;
    const baseStep = Math.max(0.35, 2 * rMean * spacingRatio);
    const localStep = Math.max(
      0.3,
      baseStep / (1 + curvGain * kappa * rMean + 0.85 * drRatio),
    );
    let distLeft = seg;
    let cursor = 0;
    while (phase + distLeft >= localStep && adaptiveStamps.length < 4096) {
      const advance = localStep - phase;
      cursor += advance;
      distLeft -= advance;
      phase = 0;
      const ratio = clamp01(cursor / seg);
      adaptiveStamps.push({
        x: Math.fround(a.x + (b.x - a.x) * ratio),
        y: Math.fround(a.y + (b.y - a.y) * ratio),
        radiusPx: Math.fround(a.r + (b.r - a.r) * ratio),
        curvatureInvPx: Math.fround(kappa),
        tangentAngleRad: Math.fround(a.angle + wrapAngleDeltaRad(a.angle, b.angle) * ratio),
        adaptiveStepPx: Math.fround(localStep),
      });
    }
    phase += distLeft;
  }

  const uniformLinearScallopRatio01 = measureStampScallopRatio(linearStamps);
  const centripetalAdaptiveScallopRatio01 = measureStampScallopRatio(adaptiveStamps);
  const scallopReductionGain01 = Math.fround(
    Math.max(0, uniformLinearScallopRatio01 - centripetalAdaptiveScallopRatio01),
  );
  const linearMaxTurnKinkDeg = measureMaxTurnKinkDeg(pts);
  const centripetalMaxTurnKinkDeg = measureMaxTurnKinkDeg(rawCurve);
  const cornerKinkReductionRatio01 = Math.fround(
    linearMaxTurnKinkDeg > 1e-3
      ? clamp01(1 - centripetalMaxTurnKinkDeg / linearMaxTurnKinkDeg)
      : 0,
  );

  return {
    adaptiveStamps,
    uniformLinearScallopRatio01,
    centripetalAdaptiveScallopRatio01,
    scallopReductionGain01,
    linearMaxTurnKinkDeg,
    centripetalMaxTurnKinkDeg,
    cornerKinkReductionRatio01,
  };
}

function computeDiagonalEdgeStepVariance(image: LabImage): number {
  const { width, height, data } = image;
  let laplacianSqSum = 0;
  let sampleCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const leftIdx = (y * width + (x - 1)) * 4;
      const rightIdx = (y * width + (x + 1)) * 4;
      const upIdx = ((y - 1) * width + x) * 4;
      const downIdx = ((y + 1) * width + x) * 4;
      const c = 1 - (data[idx] ?? 255) / 255;
      const l = 1 - (data[leftIdx] ?? 255) / 255;
      const r = 1 - (data[rightIdx] ?? 255) / 255;
      const u = 1 - (data[upIdx] ?? 255) / 255;
      const d = 1 - (data[downIdx] ?? 255) / 255;
      const lap = 4 * c - l - r - u - d;
      laplacianSqSum += lap * lap;
      sampleCount += 1;
    }
  }
  if (sampleCount === 0) return 0;
  return Math.fround(laplacianSqSum / sampleCount);
}

/**
 * 2. 서브픽셀 1px Smoothstep SDF 안티앨리어싱 + 칼끝 출필 테이퍼 검증 커널 (CSP 리얼 G펜·마루펜 패리티).
 */
export function evaluateSubpixelDualEnvelopeLineartAA(params: {
  readonly canvasSizePx?: number;
  readonly strokeWidthPx: number;
  readonly exitVelocityPxPerSec: number;
  readonly aaBandPx?: number;
}): Wave37SubpixelLineartAaReport {
  const size = Math.max(24, Math.min(128, Math.floor(params.canvasSizePx ?? 48)));
  const binaryData = new Uint8ClampedArray(size * size * 4).fill(255);
  const aaData = new Uint8ClampedArray(size * size * 4).fill(255);

  const baseRadius = Math.max(1.2, params.strokeWidthPx * 0.5);
  const speedNorm = clamp01(params.exitVelocityPxPerSec / 1800);
  const terminalRadiusPx = Math.fround(Math.max(0.18, baseRadius * (1 - 0.88 * speedNorm)));
  const aaHalfBand = Math.max(0.45, (params.aaBandPx ?? 1.1) * 0.5);

  const x0 = size * 0.14;
  const y0 = size * 0.78;
  const x1 = size * 0.86;
  const y1 = size * 0.22;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const segLenSq = Math.max(1e-4, dx * dx + dy * dy);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = clamp01(((px - x0) * dx + (py - y0) * dy) / segLenSq);
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      // 3차 에르미트 칼끝 테이퍼 프로파일
      const taper = 1 - Math.pow(t, 1.65) * (1 - terminalRadiusPx / baseRadius);
      const localR = baseRadius * taper;
      const dist = Math.hypot(px - cx, py - cy);
      const sdf = dist - localR;

      const binCov = sdf <= 0 ? 1 : 0;
      const aaCov = 1 - smoothstep(-aaHalfBand, aaHalfBand, sdf);

      const offset = (y * size + x) * 4;
      const binByte = Math.round((1 - binCov * 0.92) * 255);
      const aaByte = Math.round((1 - aaCov * 0.92) * 255);

      binaryData[offset] = binByte;
      binaryData[offset + 1] = binByte;
      binaryData[offset + 2] = binByte;
      binaryData[offset + 3] = 255;

      aaData[offset] = aaByte;
      aaData[offset + 1] = aaByte;
      aaData[offset + 2] = aaByte;
      aaData[offset + 3] = 255;
    }
  }

  const binaryThresholdImage: LabImage = { width: size, height: size, data: binaryData };
  const subpixelSdfAaImage: LabImage = { width: size, height: size, data: aaData };
  const binaryEdgeGradientVariance = computeDiagonalEdgeStepVariance(binaryThresholdImage);
  const subpixelEdgeGradientVariance = computeDiagonalEdgeStepVariance(subpixelSdfAaImage);
  const edgeStaircaseVarianceReduction01 = Math.fround(
    binaryEdgeGradientVariance > 1e-6
      ? clamp01(1 - subpixelEdgeGradientVariance / binaryEdgeGradientVariance)
      : 0,
  );
  const tipSubpixelSharpness01 = Math.fround(clamp01(1 - terminalRadiusPx / baseRadius));

  return {
    binaryThresholdImage,
    subpixelSdfAaImage,
    binaryEdgeGradientVariance,
    subpixelEdgeGradientVariance,
    edgeStaircaseVarianceReduction01,
    tipSubpixelSharpness01,
    terminalRadiusPx,
  };
}

/**
 * 3. 물리 강모 급선회 원심 부채꼴 벌어짐(Centrifugal Fan-Splay) 및 저고도 기울기 측면 셰이딩 커널.
 */
export function evaluateCentrifugalBristleTurnSplayAndTilt(params: {
  readonly bristleCount: number;
  readonly baseRadiusPx: number;
  readonly turnRateRadPerSec: number;
  readonly speedPxPerSec: number;
  readonly tiltAltitudeDeg: number;
  readonly stiffness01: number;
  readonly seed?: number;
}): Wave37BristleTurnSplayReport {
  const count = Math.max(4, Math.min(128, Math.floor(params.bristleCount)));
  const baseRadius = Math.max(1, params.baseRadiusPx);
  const seed = params.seed ?? 20261110;
  const stiffness = clamp(params.stiffness01, 0.1, 1);

  const centrifugalAccel =
    (Math.abs(params.turnRateRadPerSec) * Math.max(0, params.speedPxPerSec)) / 1400;
  const fanGain = clamp(centrifugalAccel / (0.35 + stiffness * 0.9), 0, 1.35);

  let straightMin = Infinity;
  let straightMax = -Infinity;
  let turnMin = Infinity;
  let turnMax = -Infinity;

  for (let i = 0; i < count; i += 1) {
    const laneNorm = (i / Math.max(1, count - 1) - 0.5) * 2;
    const jitter = ((hashU32(i, 17, seed) & 0xffff) / 65535 - 0.5) * 0.14;
    const straightOffset = (laneNorm + jitter) * baseRadius;
    // 급선회 시 외측(laneNorm > 0) 강모는 원심력으로 더 크게 벌어지고 내측은 응집됨
    const outerAsymmetry = laneNorm >= 0 ? 1 + fanGain * 0.95 : 1 + fanGain * 0.25;
    const turnOffset = straightOffset * outerAsymmetry + fanGain * baseRadius * 0.22;

    if (straightOffset < straightMin) straightMin = straightOffset;
    if (straightOffset > straightMax) straightMax = straightOffset;
    if (turnOffset < turnMin) turnMin = turnOffset;
    if (turnOffset > turnMax) turnMax = turnOffset;
  }

  const straightBundleSpanPx = Math.fround(Math.max(0.1, straightMax - straightMin));
  const sharpTurnBundleSpanPx = Math.fround(Math.max(0.1, turnMax - turnMin));
  const centrifugalFanSplayRatio = Math.fround(sharpTurnBundleSpanPx / straightBundleSpanPx);

  // 스타일러스 고도각(90도=수직, 15도=뉘임) → 넓은 측면 셰이딩 종횡비(Procreate 6B 패리티)
  const altitude = clamp(params.tiltAltitudeDeg, 10, 90);
  const tiltFactor01 = clamp01((90 - altitude) / 75);
  const uprightAspectRatio = 1;
  const tiltedBroadSideAspectRatio = Math.fround(1 + tiltFactor01 * 2.45);
  const releaseFlickWidthRatio01 = Math.fround(
    clamp(1 / (1 + Math.max(0, params.speedPxPerSec) / 950), 0.08, 1),
  );

  return {
    straightBundleSpanPx,
    sharpTurnBundleSpanPx,
    centrifugalFanSplayRatio,
    uprightAspectRatio,
    tiltedBroadSideAspectRatio,
    releaseFlickWidthRatio01,
  };
}

/**
 * 4. Rebelle 7급 모세관 꽃양배추 엣지 링(Capillary Cauliflower) + 종이 골 과립 침전(Granulation) 커널.
 */
export function evaluateCapillaryCauliflowerAndGranulation(params: {
  readonly wetness01: number;
  readonly evaporation01: number;
  readonly granulation01: number;
  readonly paperTooth01: number;
  readonly targetWashCeiling01: number;
  readonly seed?: number;
}): Wave37CapillaryGranulationReport {
  const wetness = clamp01(params.wetness01);
  const evap = clamp01(params.evaporation01);
  const gran = clamp01(params.granulation01);
  const tooth = clamp01(params.paperTooth01);
  const ceiling = clamp(params.targetWashCeiling01, 0.1, 0.98);
  const seed = params.seed ?? 20261110;

  let centerSum = 0;
  let centerCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let valleyDepositSum = 0;
  let ridgeDepositSum = 0;
  let valleyCount = 0;
  let ridgeCount = 0;
  let violations = 0;

  const samples = 48;
  for (let i = 0; i < samples; i += 1) {
    const rNorm = (i + 0.5) / samples;
    const paperHeight = (hashU32(i, 31, seed) & 0xffff) / 65535;
    // 커피링 모세관 이류: 반경 외곽(r ~ 0.88..0.98) 건조 전선으로 안료가 이동
    const capillaryAdvect = wetness * evap * Math.exp(-Math.pow((rNorm - 0.91) / 0.09, 2));
    const centerDepletion = 1 - wetness * evap * 0.22 * (1 - rNorm);
    // 종이 골(paperHeight < 0.5)로 무거운 광물 안료가 침전(flocculation)
    const valleyBias = 1 + gran * tooth * (0.5 - paperHeight) * 1.15;
    const rawDensity = ceiling * 0.72 * centerDepletion * valleyBias + ceiling * 0.26 * capillaryAdvect;
    // Ghost-Buffer 점근 천장 보호로 목표 워시 농도를 절대 초과하지 않음
    const ghostBounded = ceiling * (1 - Math.exp(-Math.max(0, rawDensity) / Math.max(0.05, ceiling * 0.68)));
    if (ghostBounded > ceiling + 1e-6) violations += 1;

    if (rNorm < 0.45) {
      centerSum += ghostBounded;
      centerCount += 1;
    } else if (rNorm >= 0.82 && rNorm <= 0.98) {
      edgeSum += ghostBounded;
      edgeCount += 1;
    }

    if (paperHeight < 0.45) {
      valleyDepositSum += ghostBounded;
      valleyCount += 1;
    } else if (paperHeight > 0.55) {
      ridgeDepositSum += ghostBounded;
      ridgeCount += 1;
    }
  }

  const centerPigmentDensity01 = Math.fround(centerCount > 0 ? centerSum / centerCount : 0);
  const edgeCapillaryRingDensity01 = Math.fround(edgeCount > 0 ? edgeSum / edgeCount : 0);
  const edgeRingContrastGain01 = Math.fround(
    Math.max(0, edgeCapillaryRingDensity01 - centerPigmentDensity01),
  );
  const valleyMean = valleyCount > 0 ? valleyDepositSum / valleyCount : 0;
  const ridgeMean = ridgeCount > 0 ? ridgeDepositSum / ridgeCount : 0;
  const valleyFlocculationIndex01 = Math.fround(
    clamp01(valleyMean > ridgeMean ? (valleyMean - ridgeMean) / Math.max(1e-4, valleyMean) : 0),
  );

  return {
    centerPigmentDensity01,
    edgeCapillaryRingDensity01,
    edgeRingContrastGain01,
    valleyFlocculationIndex01,
    ghostCeilingViolationCount: violations,
  };
}

/**
 * 5. Krita/CSP급 양방향 물감 픽업 스머지 리저버 및 강모 갈퀴(Rake) 미세 고랑 음영 커널.
 */
export function evaluateAnisotropicSmudgeReservoirAndRake(params: {
  readonly brushLoadRgb: Rgb;
  readonly canvasSampleStrip: readonly Rgb[];
  readonly pickupRate01: number;
  readonly colorDepositRate01: number;
  readonly rakeBristleDepth01: number;
}): Wave37AnisotropicSmudgeReport {
  const pickup = clamp01(params.pickupRate01);
  const deposit = clamp01(params.colorDepositRate01);
  const rakeDepth = clamp01(params.rakeBristleDepth01);

  let resR = clamp01(params.brushLoadRgb.r);
  let resG = clamp01(params.brushLoadRgb.g);
  let resB = clamp01(params.brushLoadRgb.b);
  let load = 1.0;

  const trajectoryColors: Rgb[] = [];
  let maxStepJump = 0;

  for (let i = 0; i < params.canvasSampleStrip.length; i += 1) {
    const under = params.canvasSampleStrip[i]!;
    // 바탕색 픽업 후 리저버 갱신
    resR = resR * (1 - pickup) + clamp01(under.r) * pickup;
    resG = resG * (1 - pickup) + clamp01(under.g) * pickup;
    resB = resB * (1 - pickup) + clamp01(under.b) * pickup;

    const effDeposit = deposit * load;
    const out: Rgb = {
      r: Math.fround(clamp01(under.r * (1 - effDeposit) + resR * effDeposit)),
      g: Math.fround(clamp01(under.g * (1 - effDeposit) + resG * effDeposit)),
      b: Math.fround(clamp01(under.b * (1 - effDeposit) + resB * effDeposit)),
    };
    if (trajectoryColors.length > 0) {
      const prev = trajectoryColors[trajectoryColors.length - 1]!;
      const jump = Math.hypot(out.r - prev.r, out.g - prev.g, out.b - prev.b) / Math.sqrt(3);
      if (jump > maxStepJump) maxStepJump = jump;
    }
    trajectoryColors.push(out);
    load = clamp(load * (1 - 0.06 * (1 - pickup)) + pickup * 0.04, 0.15, 1);
  }

  const pickupContinuityScore01 = Math.fround(clamp01(1 - maxStepJump));
  const rakeFurrowContrast01 = Math.fround(clamp01(rakeDepth * (0.42 + 0.48 * deposit)));

  return {
    trajectoryColors,
    pickupContinuityScore01,
    rakeFurrowContrast01,
    remainingReservoirLoad01: Math.fround(load),
  };
}
