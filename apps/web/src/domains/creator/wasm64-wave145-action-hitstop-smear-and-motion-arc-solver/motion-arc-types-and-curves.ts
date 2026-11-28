/**
 * Wave 145 — 액션 모션 호(Motion Arc)·스미어 팬·잔상 타입 정의 및 2차·3차 베지어/3점 원호 기하 프리미티브.
 */

export interface ActionPoint2D {
  readonly x: number;
  readonly y: number;
}

export type ActionCurveKind = "quadratic-bezier" | "cubic-bezier" | "circular-arc";

export type ActionWeaponProfile =
  | "blade-slash"
  | "heavy-fist"
  | "roundhouse-kick"
  | "spear-thrust";

export type SquashStretchPhaseMode =
  | "anticipation-squash"
  | "snap-stretch"
  | "impact-squash"
  | "neutral";

export interface ActionMotionArcInput {
  readonly curveKind: ActionCurveKind;
  readonly start: ActionPoint2D;
  readonly control1: ActionPoint2D;
  readonly control2?: ActionPoint2D;
  readonly end: ActionPoint2D;
  readonly sampleCount?: number;
  readonly durationSec?: number;
  readonly weaponWidthPx?: number;
  readonly weaponProfile?: ActionWeaponProfile;
  readonly peakVelocityBias?: number;
  readonly maxStretchRatio?: number;
}

export interface SquashStretchInput {
  readonly speedPxPerSec: number;
  readonly referenceSpeedPxPerSec: number;
  readonly maxStretchRatio?: number;
  readonly impactCompression?: number;
  readonly phaseMode?: SquashStretchPhaseMode;
}

export interface SquashStretchResult {
  readonly scaleParallel: number;
  readonly scalePerp: number;
  readonly areaProduct: number;
  readonly areaConservationError: number;
  readonly clamped: boolean;
  readonly phaseMode: SquashStretchPhaseMode;
}

export interface MotionArcSample {
  readonly index: number;
  readonly u: number;
  readonly arcLengthPx: number;
  readonly timeSec: number;
  readonly position: ActionPoint2D;
  readonly tangent: ActionPoint2D;
  readonly normal: ActionPoint2D;
  readonly signedCurvature: number;
  readonly speedPxPerSec: number;
  readonly angularSpeedRadPerSec: number;
  readonly normalizedSpeed: number;
  readonly squashStretch: SquashStretchResult;
}

export interface ActionMotionArcResult {
  readonly curveKind: ActionCurveKind;
  readonly resolvedCurveKind: ActionCurveKind;
  readonly weaponProfile: ActionWeaponProfile;
  readonly weaponWidthPx: number;
  readonly totalArcLengthPx: number;
  readonly durationSec: number;
  readonly peakSpeedPxPerSec: number;
  readonly peakAngularSpeedRadPerSec: number;
  readonly peakSampleIndex: number;
  readonly impactPoint: ActionPoint2D;
  readonly impactDirection: ActionPoint2D;
  readonly impactNormal: ActionPoint2D;
  readonly samples: readonly MotionArcSample[];
  readonly arcLengthMonotonic: boolean;
  readonly maxAreaConservationError: number;
}

export interface SmearFanOptions {
  readonly focalU?: number;
  readonly baseSweepFraction?: number;
  readonly speedBoostGain?: number;
  readonly outerWidthMultiplier?: number;
  readonly innerWidthMultiplier?: number;
  readonly subdivisions?: number;
}

export interface SmearFanPolygonResult {
  readonly polygon: readonly ActionPoint2D[];
  readonly outerEdge: readonly ActionPoint2D[];
  readonly innerEdge: readonly ActionPoint2D[];
  readonly uStart: number;
  readonly uEnd: number;
  readonly sweepLengthPx: number;
  readonly angularSweepRad: number;
  readonly peakWidthPx: number;
  readonly areaPx2: number;
  readonly centroid: ActionPoint2D;
  readonly speedCouplingFactor: number;
  readonly isPositiveArea: boolean;
}

export interface AfterimageGhostOptions {
  readonly ghostCount?: number;
  readonly focalU?: number;
  readonly trailArcFraction?: number;
  readonly initialAlpha?: number;
  readonly alphaDecayRate?: number;
  readonly timeStepScale?: number;
}

export interface AfterimageGhost {
  readonly ghostIndex: number;
  readonly timeOffsetMs: number;
  readonly u: number;
  readonly position: ActionPoint2D;
  readonly tangent: ActionPoint2D;
  readonly normal: ActionPoint2D;
  readonly speedPxPerSec: number;
  readonly alpha: number;
  readonly squashStretch: SquashStretchResult;
  readonly tintPhase: "lead-hot" | "mid-trail" | "deep-echo";
  readonly oklchTint: string;
}

export interface AfterimageGhostSetResult {
  readonly ghosts: readonly AfterimageGhost[];
  readonly alphaMonotonicallyDecreasing: boolean;
  readonly maxAlpha: number;
  readonly minAlpha: number;
  readonly totalTrailSpanMs: number;
}

export interface RawCurveSample {
  readonly position: ActionPoint2D;
  readonly d1: ActionPoint2D;
  readonly d2: ActionPoint2D;
}

export interface CircularArcGeometry {
  readonly center: ActionPoint2D;
  readonly radius: number;
  readonly startAngle: number;
  readonly sweepAngle: number;
}

export const MOTION_ARC_EPSILON = 1e-6;

export function clampMotionScalar(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function sanitizeMotionPoint(pt: ActionPoint2D, fallback: ActionPoint2D): ActionPoint2D {
  return {
    x: Number.isFinite(pt.x) ? pt.x : fallback.x,
    y: Number.isFinite(pt.y) ? pt.y : fallback.y,
  };
}

export function normalizeMotionVec2(
  v: ActionPoint2D,
  fallback: ActionPoint2D = { x: 1, y: 0 },
): ActionPoint2D {
  const len = Math.hypot(v.x, v.y);
  if (!Number.isFinite(len) || len < MOTION_ARC_EPSILON) {
    return fallback;
  }
  return { x: v.x / len, y: v.y / len };
}

/** 3점(시작·경유·끝)을 지나는 외접원 원호를 계산한다. 공선 입력이면 null을 반환한다. */
export function solveCircularArcFromThreePoints(
  p0: ActionPoint2D,
  p1: ActionPoint2D,
  p2: ActionPoint2D,
): CircularArcGeometry | null {
  const ax = p0.x;
  const ay = p0.y;
  const bx = p1.x;
  const by = p1.y;
  const cx = p2.x;
  const cy = p2.y;

  const det = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-4) {
    return null;
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;

  const ux = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / det;
  const uy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / det;
  const radius = Math.hypot(ax - ux, ay - uy);

  if (!Number.isFinite(radius) || radius < 1 || radius > 1e5) {
    return null;
  }

  const startAngle = Math.atan2(ay - uy, ax - ux);
  const midAngle = Math.atan2(by - uy, bx - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);

  const tau = Math.PI * 2;
  const normDelta = (from: number, to: number): number => {
    let delta = (to - from) % tau;
    if (delta < 0) delta += tau;
    return delta;
  };

  const ccwMid = normDelta(startAngle, midAngle);
  const ccwEnd = normDelta(startAngle, endAngle);
  const sweepAngle = ccwMid <= ccwEnd ? ccwEnd : ccwEnd - tau;

  if (!Number.isFinite(sweepAngle) || Math.abs(sweepAngle) < 1e-4) {
    return null;
  }

  return {
    center: { x: ux, y: uy },
    radius,
    startAngle,
    sweepAngle,
  };
}

/** 2차·3차 베지어 또는 3점 원호의 위치·1차 도함수·2차 도함수를 해석적으로 평가한다. */
export function evaluateActionCurveRaw(
  kind: ActionCurveKind,
  p0: ActionPoint2D,
  p1: ActionPoint2D,
  p2: ActionPoint2D,
  p3: ActionPoint2D,
  circle: CircularArcGeometry | null,
  t: number,
): RawCurveSample {
  const u = clampMotionScalar(t, 0, 1);

  if (kind === "circular-arc" && circle !== null) {
    const theta = circle.startAngle + circle.sweepAngle * u;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const r = circle.radius;
    const w = circle.sweepAngle;
    return {
      position: {
        x: circle.center.x + r * cosT,
        y: circle.center.y + r * sinT,
      },
      d1: {
        x: -r * w * sinT,
        y: r * w * cosT,
      },
      d2: {
        x: -r * w * w * cosT,
        y: -r * w * w * sinT,
      },
    };
  }

  if (kind === "cubic-bezier") {
    const mt = 1 - u;
    const mt2 = mt * mt;
    const u2 = u * u;
    return {
      position: {
        x: mt2 * mt * p0.x + 3 * mt2 * u * p1.x + 3 * mt * u2 * p2.x + u2 * u * p3.x,
        y: mt2 * mt * p0.y + 3 * mt2 * u * p1.y + 3 * mt * u2 * p2.y + u2 * u * p3.y,
      },
      d1: {
        x:
          3 * mt2 * (p1.x - p0.x) +
          6 * mt * u * (p2.x - p1.x) +
          3 * u2 * (p3.x - p2.x),
        y:
          3 * mt2 * (p1.y - p0.y) +
          6 * mt * u * (p2.y - p1.y) +
          3 * u2 * (p3.y - p2.y),
      },
      d2: {
        x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * u * (p3.x - 2 * p2.x + p1.x),
        y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * u * (p3.y - 2 * p2.y + p1.y),
      },
    };
  }

  const mt = 1 - u;
  return {
    position: {
      x: mt * mt * p0.x + 2 * mt * u * p1.x + u * u * p3.x,
      y: mt * mt * p0.y + 2 * mt * u * p1.y + u * u * p3.y,
    },
    d1: {
      x: 2 * mt * (p1.x - p0.x) + 2 * u * (p3.x - p1.x),
      y: 2 * mt * (p1.y - p0.y) + 2 * u * (p3.y - p1.y),
    },
    d2: {
      x: 2 * (p3.x - 2 * p1.x + p0.x),
      y: 2 * (p3.y - 2 * p1.y + p0.y),
    },
  };
}

/** 디즈니 Slow-in → Snap → Follow-through 비대칭 가속 프로파일 가중치를 계산한다. */
export function evaluateDisneySpeedWeight(u: number, peakBias: number): number {
  const clampedU = clampMotionScalar(u, 0, 1);
  const delta = clampedU - peakBias;
  const sigma =
    delta < 0
      ? Math.max(0.14, peakBias * 0.42)
      : Math.max(0.14, (1 - peakBias) * 0.56);
  const snapPeak = Math.exp(-0.5 * (delta / sigma) * (delta / sigma));
  const anticipationDip = 0.18 + 0.14 * clampedU;
  return anticipationDip + 1.45 * snapPeak;
}
