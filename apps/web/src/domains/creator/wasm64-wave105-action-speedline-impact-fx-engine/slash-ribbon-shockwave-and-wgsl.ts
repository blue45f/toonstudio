/**
 * Wave 105 — 검기 궤적 초승달 리본, 충격파·파열 균열, 잔상 고스트 합성기 및 WGSL 재수출.
 *
 * - 2차/3차 베지어 곡선 기반 속도 변조 검기 궤적(`outerArc`, `innerArc`, `closedPolygon`, `trailingStreakLines`)
 * - 방사형 충격파 링, 파열 균열 폴리라인, 지수 감쇠 잔상 고스트 합성
 * - `prefersReducedMotion: true` 접근성 안전 모드(`animatedShimmerRate === 0`, 플래시 대비 상한 제한)
 * - WebGPU WGSL 셰이더 생성·검증기(`buildActionImpactFxWgsl`, `validateActionImpactFxWgsl`) 재수출
 */

import {
  clampFinite,
  createSeededRng,
  type Vec2,
} from "./speedline-keepout-geometry";

export {
  buildActionImpactFxWgsl,
  validateActionImpactFxWgsl,
  type ActionFxWgslBindingDescriptor,
  type ActionFxWgslValidationReport,
  type ActionImpactFxWgslArtifact,
} from "./action-fx-wgsl-shader";

export type SlashVelocityProfile = "crescent-arc" | "whip-snap" | "heavy-cleave";

export interface SlashBezierCurveSpec {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3?: Vec2;
}

export interface SwordSlashSpec {
  readonly id?: string;
  readonly curve: SlashBezierCurveSpec;
  readonly peakWidthPx: number;
  readonly entryTipWidthPx?: number;
  readonly exitTipWidthPx?: number;
  readonly velocityProfile?: SlashVelocityProfile;
  readonly wakeStreakCount?: number;
  readonly impactPoint?: Vec2;
  readonly shockwaveRingCount?: number;
  readonly shockwaveBaseRadiusPx?: number;
  readonly crackRayCount?: number;
  readonly afterimageCount?: number;
  readonly flashContrastIntensity?: number;
  readonly animatedShimmerRateHz?: number;
  readonly seed?: number;
}

export interface SlashImpactFxOptions {
  readonly sampleCount?: number;
  readonly prefersReducedMotion?: boolean;
  readonly maxReducedMotionFlashContrast?: number;
}

export interface TrailingWakeStreak {
  readonly id: string;
  readonly attachU: number;
  readonly points: readonly Vec2[];
  readonly tangent: Vec2;
  readonly dotAlignment: number;
  readonly widthPx: number;
  readonly opacity: number;
}

export interface ShockwaveRing {
  readonly index: number;
  readonly center: Vec2;
  readonly radiusPx: number;
  readonly strokeWidthPx: number;
  readonly opacity: number;
  readonly points: readonly Vec2[];
}

export interface FractureCrackPolyline {
  readonly id: string;
  readonly angleRad: number;
  readonly points: readonly Vec2[];
  readonly branchPoints: readonly (readonly Vec2[])[];
  readonly strokeWidthPx: number;
}

export interface AfterimageMotionGhost {
  readonly ghostIndex: number;
  readonly lagFactor: number;
  readonly opacity: number;
  readonly offset: Vec2;
  readonly closedPolygon: readonly Vec2[];
}

export interface ImpactMotionSafetyState {
  readonly prefersReducedMotion: boolean;
  readonly animatedShimmerRate: number;
  readonly effectiveFlashContrast: number;
  readonly staticGraphicLayout: boolean;
  readonly afterimageRenderMode: "motion-trail" | "static-echo";
}

export interface SwordSlashMetrics {
  readonly arcLengthPx: number;
  readonly entryWidthPx: number;
  readonly peakBellyWidthPx: number;
  readonly peakU: number;
  readonly exitWidthPx: number;
  readonly meanWakeTangentAlignment: number;
  readonly polygonVertexCount: number;
}

export interface SwordSlashImpactFxResult {
  readonly id: string;
  readonly seed: number;
  readonly curveDegree: 2 | 3;
  readonly velocityProfile: SlashVelocityProfile;
  readonly spinePoints: readonly Vec2[];
  readonly spineTangents: readonly Vec2[];
  readonly widthProfilePx: readonly number[];
  readonly outerArc: readonly Vec2[];
  readonly innerArc: readonly Vec2[];
  readonly closedPolygon: readonly Vec2[];
  readonly trailingStreakLines: readonly TrailingWakeStreak[];
  readonly impactPoint: Vec2;
  readonly shockwaveRings: readonly ShockwaveRing[];
  readonly fractureCracks: readonly FractureCrackPolyline[];
  readonly afterimageGhosts: readonly AfterimageMotionGhost[];
  readonly motionSafety: ImpactMotionSafetyState;
  readonly metrics: SwordSlashMetrics;
}

function sanitizeVec2(v: Vec2, fallback: Vec2): Vec2 {
  return {
    x: clampFinite(v.x, -1e6, 1e6, fallback.x),
    y: clampFinite(v.y, -1e6, 1e6, fallback.y),
  };
}

function normalizeVec2(v: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (!Number.isFinite(len) || len <= 1e-9) return fallback;
  return { x: v.x / len, y: v.y / len };
}

function evalBezierPoint(curve: SlashBezierCurveSpec, u: number): Vec2 {
  const t = Math.max(0, Math.min(1, u));
  const mt = 1 - t;
  const p0 = sanitizeVec2(curve.p0, { x: 0, y: 0 });
  const p1 = sanitizeVec2(curve.p1, { x: 100, y: -60 });
  const p2 = sanitizeVec2(curve.p2, { x: 240, y: 0 });
  if (!curve.p3) {
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  }
  const p3 = sanitizeVec2(curve.p3, { x: 320, y: 40 });
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function evalBezierTangent(curve: SlashBezierCurveSpec, u: number): Vec2 {
  const t = Math.max(0, Math.min(1, u));
  const mt = 1 - t;
  const p0 = sanitizeVec2(curve.p0, { x: 0, y: 0 });
  const p1 = sanitizeVec2(curve.p1, { x: 100, y: -60 });
  const p2 = sanitizeVec2(curve.p2, { x: 240, y: 0 });
  if (!curve.p3) {
    return normalizeVec2({
      x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
    });
  }
  const p3 = sanitizeVec2(curve.p3, { x: 320, y: 40 });
  return normalizeVec2({
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  });
}

function evalVelocityEnvelope(u: number, profile: SlashVelocityProfile): number {
  const t = Math.max(0, Math.min(1, u));
  if (t <= 0 || t >= 1) return 0;
  let alpha = 1.55;
  let beta = 1.25;
  if (profile === "whip-snap") {
    alpha = 2.4;
    beta = 1.1;
  } else if (profile === "heavy-cleave") {
    alpha = 1.15;
    beta = 1.95;
  }
  const modeU = alpha / (alpha + beta);
  const peakVal = Math.pow(modeU, alpha) * Math.pow(1 - modeU, beta);
  if (peakVal <= 1e-12) return 0;
  return Math.max(0, Math.min(1, (Math.pow(t, alpha) * Math.pow(1 - t, beta)) / peakVal));
}

function determineOutwardNormalSign(curve: SlashBezierCurveSpec): number {
  const tStart = evalBezierTangent(curve, 0.15);
  const tMid = evalBezierTangent(curve, 0.5);
  const tEnd = evalBezierTangent(curve, 0.85);
  const cross = (tEnd.x - tStart.x) * (-tMid.y) + (tEnd.y - tStart.y) * tMid.x;
  return cross >= 0 ? -1 : 1;
}

function buildWakeStreaks(
  curve: SlashBezierCurveSpec,
  spinePoints: readonly Vec2[],
  spineTangents: readonly Vec2[],
  widthProfilePx: readonly number[],
  normalSign: number,
  streakCount: number,
  arcLengthPx: number,
  rng: () => number,
): TrailingWakeStreak[] {
  const safeCount = Math.max(0, Math.min(24, Math.round(streakCount)));
  const streaks: TrailingWakeStreak[] = [];
  if (safeCount === 0 || spinePoints.length < 3) return streaks;

  for (let i = 0; i < safeCount; i += 1) {
    const attachU = 0.22 + ((i + 0.35 + rng() * 0.3) / safeCount) * 0.64;
    const idx = Math.max(1, Math.min(spinePoints.length - 2, Math.round(attachU * (spinePoints.length - 1))));
    const basePt = spinePoints[idx];
    const tangent = spineTangents[idx];
    const normal = { x: -tangent.y * normalSign, y: tangent.x * normalSign };
    const localWidth = widthProfilePx[idx];
    const sideSign = i % 3 === 0 ? 1 : -1;
    const lateralOffset = (localWidth * (sideSign > 0 ? 0.58 : 0.42) + 3.5 + rng() * 9.5) * sideSign;
    const streakLen = Math.max(18, Math.min(arcLengthPx * 0.38, 28 + rng() * 44));

    const pStart: Vec2 = { x: basePt.x + normal.x * lateralOffset, y: basePt.y + normal.y * lateralOffset };
    const pMid: Vec2 = {
      x: pStart.x - tangent.x * (streakLen * 0.5) + normal.x * (sideSign * 1.1),
      y: pStart.y - tangent.y * (streakLen * 0.5) + normal.y * (sideSign * 1.1),
    };
    const nextTangent = evalBezierTangent(curve, Math.max(0.02, attachU - 0.04));
    const blendedDir = normalizeVec2(
      { x: tangent.x * 0.88 + nextTangent.x * 0.12, y: tangent.y * 0.88 + nextTangent.y * 0.12 },
      tangent,
    );
    const pEnd: Vec2 = { x: pStart.x - blendedDir.x * streakLen, y: pStart.y - blendedDir.y * streakLen };
    const chordDir = normalizeVec2({ x: pStart.x - pEnd.x, y: pStart.y - pEnd.y }, tangent);

    streaks.push({
      id: `wake-streak-${i}`,
      attachU,
      points: [pStart, pMid, pEnd],
      tangent,
      dotAlignment: Math.abs(chordDir.x * tangent.x + chordDir.y * tangent.y),
      widthPx: Math.max(1, Math.min(5.5, localWidth * 0.11 + rng() * 1.4)),
      opacity: clampFinite(0.42 + rng() * 0.45, 0.2, 0.92, 0.65),
    });
  }
  return streaks;
}

function buildShockwaveRings(
  impactPoint: Vec2,
  ringCount: number,
  baseRadiusPx: number,
  effectiveContrast: number,
  rng: () => number,
): ShockwaveRing[] {
  const safeCount = Math.max(0, Math.min(8, Math.round(ringCount)));
  const rings: ShockwaveRing[] = [];
  const segs = 28;
  for (let r = 0; r < safeCount; r += 1) {
    const radiusPx = baseRadiusPx * (1 + r * 0.72);
    const points: Vec2[] = [];
    for (let s = 0; s <= segs; s += 1) {
      const angle = (s / segs) * Math.PI * 2;
      const harmonic = 1 + 0.055 * Math.sin(angle * 5 + r * 1.1) + (rng() - 0.5) * 0.04;
      const rr = radiusPx * (s === segs ? 1 : harmonic);
      points.push({ x: impactPoint.x + Math.cos(angle) * rr, y: impactPoint.y + Math.sin(angle) * rr });
    }
    const baseOpacity = Math.max(0.18, (0.88 - r * 0.22) * (0.45 + 0.55 * effectiveContrast));
    rings.push({
      index: r,
      center: impactPoint,
      radiusPx,
      strokeWidthPx: Math.max(1.2, 4.4 - r * 1.15),
      opacity: clampFinite(baseOpacity, 0.15, 0.95, 0.6),
      points,
    });
  }
  return rings;
}

function buildFractureCracks(
  impactPoint: Vec2,
  rayCount: number,
  baseRadiusPx: number,
  rng: () => number,
): FractureCrackPolyline[] {
  const safeRays = Math.max(0, Math.min(28, Math.round(rayCount)));
  const cracks: FractureCrackPolyline[] = [];
  for (let i = 0; i < safeRays; i += 1) {
    const baseAngle = ((i + 0.25 + rng() * 0.5) / safeRays) * Math.PI * 2;
    const totalLen = baseRadiusPx * (0.95 + rng() * 1.35);
    const kinks = 4;
    const points: Vec2[] = [{ x: impactPoint.x, y: impactPoint.y }];
    const branchPoints: (readonly Vec2[])[] = [];
    let currAngle = baseAngle;
    let curr = { x: impactPoint.x, y: impactPoint.y };

    for (let k = 1; k <= kinks; k += 1) {
      currAngle += (rng() - 0.5) * 0.34;
      const stepLen = totalLen / kinks;
      const next = { x: curr.x + Math.cos(currAngle) * stepLen, y: curr.y + Math.sin(currAngle) * stepLen };
      points.push(next);
      if (k === 2 && rng() > 0.35) {
        const bAngle = currAngle + (rng() > 0.5 ? 0.52 : -0.52);
        const bLen = stepLen * (0.65 + rng() * 0.55);
        branchPoints.push([next, { x: next.x + Math.cos(bAngle) * bLen, y: next.y + Math.sin(bAngle) * bLen }]);
      }
      curr = next;
    }

    cracks.push({
      id: `fracture-crack-${i}`,
      angleRad: baseAngle,
      points,
      branchPoints,
      strokeWidthPx: clampFinite(1.4 + (1 - (i % 3) * 0.25) * 1.8, 0.9, 3.6, 2),
    });
  }
  return cracks;
}

function buildAfterimageGhosts(
  closedPolygon: readonly Vec2[],
  meanTangent: Vec2,
  afterimageCount: number,
  prefersReducedMotion: boolean,
): AfterimageMotionGhost[] {
  const safeCount = Math.max(0, Math.min(10, Math.round(afterimageCount)));
  const ghosts: AfterimageMotionGhost[] = [];
  const baseOpacity = prefersReducedMotion ? 0.36 : 0.62;
  const decayRate = prefersReducedMotion ? 0.72 : 0.56;
  const stepDistPx = prefersReducedMotion ? 11 : 15;

  for (let i = 0; i < safeCount; i += 1) {
    const lagFactor = (i + 1) / (safeCount + 1);
    const opacity = baseOpacity * Math.exp(-decayRate * (i + 1));
    const offset: Vec2 = {
      x: -meanTangent.x * stepDistPx * (i + 1),
      y: -meanTangent.y * stepDistPx * (i + 1),
    };
    ghosts.push({
      ghostIndex: i,
      lagFactor,
      opacity,
      offset,
      closedPolygon: closedPolygon.map((pt) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
    });
  }
  return ghosts;
}

/**
 * 2차/3차 베지어 곡선 기반 검기 궤적 리본, 충격파 링, 파열 균열, 잔상 고스트를 합성한다.
 */
export function synthesizeSwordSlashRibbonAndImpactFx(
  slashSpec: SwordSlashSpec,
  options: SlashImpactFxOptions = {},
): SwordSlashImpactFxResult {
  const seed = Number.isFinite(slashSpec.seed) ? Math.floor(slashSpec.seed as number) : 10502;
  const rng = createSeededRng(seed);
  const sampleCount = Math.max(12, Math.min(128, Math.round(options.sampleCount ?? 36)));
  const prefersReducedMotion = Boolean(options.prefersReducedMotion);
  const maxReducedContrast = clampFinite(options.maxReducedMotionFlashContrast ?? 0.35, 0.1, 0.5, 0.35);

  const requestedContrast = clampFinite(slashSpec.flashContrastIntensity ?? 0.9, 0.05, 1, 0.9);
  const requestedShimmer = clampFinite(slashSpec.animatedShimmerRateHz ?? 16, 0, 60, 16);
  const effectiveFlashContrast = prefersReducedMotion
    ? Math.min(requestedContrast, maxReducedContrast)
    : requestedContrast;
  const animatedShimmerRate = prefersReducedMotion ? 0 : requestedShimmer;

  const velocityProfile: SlashVelocityProfile = slashSpec.velocityProfile ?? "crescent-arc";
  const peakWidthPx = clampFinite(slashSpec.peakWidthPx, 4, 240, 42);
  const entryTipWidthPx = clampFinite(slashSpec.entryTipWidthPx ?? 1, 0, peakWidthPx * 0.25, 1);
  const exitTipWidthPx = clampFinite(slashSpec.exitTipWidthPx ?? 0.5, 0, peakWidthPx * 0.25, 0.5);
  const normalSign = determineOutwardNormalSign(slashSpec.curve);

  const spinePoints: Vec2[] = [];
  const spineTangents: Vec2[] = [];
  const widthProfilePx: number[] = [];
  const outerArc: Vec2[] = [];
  const innerArc: Vec2[] = [];

  let arcLengthPx = 0;
  let peakBellyWidthPx = 0;
  let peakU = 0.5;
  let sumTx = 0;
  let sumTy = 0;

  for (let i = 0; i <= sampleCount; i += 1) {
    const u = i / sampleCount;
    const pt = evalBezierPoint(slashSpec.curve, u);
    const tangent = evalBezierTangent(slashSpec.curve, u);
    const normal = { x: -tangent.y * normalSign, y: tangent.x * normalSign };
    const env = evalVelocityEnvelope(u, velocityProfile);
    const tipBaseline = entryTipWidthPx * (1 - u) + exitTipWidthPx * u;
    const widthPx = tipBaseline + (peakWidthPx - tipBaseline) * env;

    if (i > 0) arcLengthPx += Math.hypot(pt.x - spinePoints[i - 1].x, pt.y - spinePoints[i - 1].y);
    if (widthPx > peakBellyWidthPx) {
      peakBellyWidthPx = widthPx;
      peakU = u;
    }

    spinePoints.push(pt);
    spineTangents.push(tangent);
    widthProfilePx.push(widthPx);
    sumTx += tangent.x;
    sumTy += tangent.y;

    outerArc.push({ x: pt.x + normal.x * (widthPx * 0.64), y: pt.y + normal.y * (widthPx * 0.64) });
    innerArc.push({ x: pt.x - normal.x * (widthPx * 0.36), y: pt.y - normal.y * (widthPx * 0.36) });
  }

  const closedPolygon: Vec2[] = [...outerArc, ...innerArc.slice().reverse()];
  const meanTangent = normalizeVec2({ x: sumTx, y: sumTy }, { x: 1, y: 0 });
  const impactFallback = evalBezierPoint(slashSpec.curve, 0.78);
  const impactPoint = slashSpec.impactPoint ? sanitizeVec2(slashSpec.impactPoint, impactFallback) : impactFallback;

  const trailingStreakLines = buildWakeStreaks(
    slashSpec.curve,
    spinePoints,
    spineTangents,
    widthProfilePx,
    normalSign,
    slashSpec.wakeStreakCount ?? 6,
    arcLengthPx,
    rng,
  );
  const shockwaveBaseRadius = clampFinite(slashSpec.shockwaveBaseRadiusPx ?? 38, 8, 500, 38);
  const shockwaveRings = buildShockwaveRings(
    impactPoint,
    slashSpec.shockwaveRingCount ?? 3,
    shockwaveBaseRadius,
    effectiveFlashContrast,
    rng,
  );
  const fractureCracks = buildFractureCracks(
    impactPoint,
    slashSpec.crackRayCount ?? 10,
    shockwaveBaseRadius * 1.15,
    rng,
  );
  const afterimageGhosts = buildAfterimageGhosts(
    closedPolygon,
    meanTangent,
    slashSpec.afterimageCount ?? 4,
    prefersReducedMotion,
  );

  const meanWakeTangentAlignment =
    trailingStreakLines.length > 0
      ? trailingStreakLines.reduce((acc, s) => acc + s.dotAlignment, 0) / trailingStreakLines.length
      : 1;

  return {
    id: slashSpec.id ?? "sword-slash-fx-0",
    seed,
    curveDegree: slashSpec.curve.p3 ? 3 : 2,
    velocityProfile,
    spinePoints,
    spineTangents,
    widthProfilePx,
    outerArc,
    innerArc,
    closedPolygon,
    trailingStreakLines,
    impactPoint,
    shockwaveRings,
    fractureCracks,
    afterimageGhosts,
    motionSafety: {
      prefersReducedMotion,
      animatedShimmerRate,
      effectiveFlashContrast,
      staticGraphicLayout: prefersReducedMotion,
      afterimageRenderMode: prefersReducedMotion ? "static-echo" : "motion-trail",
    },
    metrics: {
      arcLengthPx,
      entryWidthPx: widthProfilePx[0] ?? 0,
      peakBellyWidthPx,
      peakU,
      exitWidthPx: widthProfilePx[widthProfilePx.length - 1] ?? 0,
      meanWakeTangentAlignment,
      polygonVertexCount: closedPolygon.length,
    },
  };
}
