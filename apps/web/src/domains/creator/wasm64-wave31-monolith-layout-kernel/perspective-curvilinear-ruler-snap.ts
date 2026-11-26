/**
 * Wasm64 Wave 31: 정밀 만화 원근·곡선·방사 대칭 자 스냅 다양체 (`perspective-curvilinear-ruler-snap`).
 *
 * - 4종 자 다양체 지원:
 *   1. `parallel`: 임의 각도 평행선(단일 기준선 또는 등간격 격자 평행선) 직교 투영
 *   2. `vanishing-radial`: 소실점 방사 집중선·투시선 직교 투영(외적 공선성 오차 `< 1e-12`)
 *   3. `concentric-ellipse`: 회전 타원 다양체에 대한 Eberly 라그랑주 승수 + 안전 뉴턴-이분법 정밀 직교 수선발 투영
 *   4. `radial-symmetry` (`N = 2..12`): 회전(`C_N`)·교대 거울·만화경(`D_N`) 획 복제 및 선택적 대칭축 스냅
 * - 히스테리시스(`snapEngagePx` 진입 임계값 < `snapReleasePx` 이탈 임계값)를 두어
 *   작가가 의도적으로 획을 자 밖으로 꺾어 뺄 때 경계 떨림(채터링) 없이 매끄럽게 분리된다.
 * - 캘리그라피 펜촉(G펜·납작펜) 회전 제어를 위한 단위 접선 벡터와 정확한 접선 각도(`tangentAngleRad`)를 함께 산출한다.
 */

export const MIN_SYMMETRY_ORDER = 2 as const;
export const MAX_SYMMETRY_ORDER = 12 as const;
export const DEFAULT_SNAP_ENGAGE_PX = 12 as const;
export const DEFAULT_SNAP_RELEASE_PX = 24 as const;

export type ComicRulerKind =
  | "parallel"
  | "vanishing-radial"
  | "concentric-ellipse"
  | "radial-symmetry";

export type RadialSymmetryReplicationMode = "rotational" | "alternating-mirror" | "dihedral";

export interface RulerPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface ParallelRulerSpec {
  readonly kind: "parallel";
  readonly origin: RulerPoint2D;
  readonly angleRad: number;
  /** 양수 지정 시 `origin`을 기준으로 수선 방향 등간격 평행 보조선 중 가장 가까운 선에 잠근다. */
  readonly lineSpacingPx?: number;
}

export interface VanishingRadialRulerSpec {
  readonly kind: "vanishing-radial";
  readonly vanishingPoint: RulerPoint2D;
  /** 고정 기준 방사선이 있을 때 지정하며, 생략 시 획 진입 시점의 소실점 광선 각도를 잠근다. */
  readonly referenceRayAngleRad?: number;
  readonly guideRayAnglesRad?: readonly number[];
}

export interface ConcentricEllipseRulerSpec {
  readonly kind: "concentric-ellipse";
  readonly center: RulerPoint2D;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationRad?: number;
  /** 참이면 획 진입 시점의 동심 배율을 잠가 임의 반지름의 동심 타원을 그린다. 기본값 `false`. */
  readonly lockConcentricScaleOnEngage?: boolean;
}

export interface RadialSymmetryRulerSpec {
  readonly kind: "radial-symmetry";
  readonly center: RulerPoint2D;
  /** `2..12` 정수로 정규화된다. */
  readonly symmetryOrder: number;
  readonly baseAxisAngleRad?: number;
  readonly symmetryMode?: RadialSymmetryReplicationMode;
  /** 참이면 대칭축 보조선 근처에서 대칭축 위로 직교 스냅도 함께 수행한다. 기본값 `false`. */
  readonly snapToAxisRays?: boolean;
}

export type ComicRulerSpec =
  | ParallelRulerSpec
  | VanishingRadialRulerSpec
  | ConcentricEllipseRulerSpec
  | RadialSymmetryRulerSpec;

export interface RulerHysteresisOptions {
  readonly snapEngagePx?: number;
  readonly snapReleasePx?: number;
}

export interface RulerSnapSessionState {
  readonly isSnapped: boolean;
  readonly lockedLineAnchor: RulerPoint2D | null;
  readonly lockedRayAngleRad: number | null;
  readonly lockedConcentricScale: number | null;
  readonly lastSnappedPoint: RulerPoint2D | null;
  readonly lastRawPoint: RulerPoint2D | null;
}

export interface ReplicatedStrokeSample {
  readonly sectorIndex: number;
  readonly isMirrored: boolean;
  readonly point: RulerPoint2D;
  readonly tangentAngleRad: number;
  readonly tangentVector: RulerPoint2D;
  readonly radiusPx: number;
  readonly polarAngleRad: number;
}

export interface OrthogonalProjectionSample {
  readonly footPoint: RulerPoint2D;
  readonly orthogonalDistancePx: number;
  readonly unitTangent: RulerPoint2D;
  readonly tangentAngleRad: number;
  /** `|((point - footPoint) / max(1, dist)) · unitTangent|` — 직교 수선발이면 `0`에 수렴한다. */
  readonly orthogonalityResidual: number;
}

export interface RulerSnapStepResult {
  readonly rulerKind: ComicRulerKind;
  readonly rawPoint: RulerPoint2D;
  readonly projectedFootPoint: RulerPoint2D;
  readonly outputPoint: RulerPoint2D;
  readonly orthogonalDistancePx: number;
  readonly orthogonalityResidual: number;
  readonly isSnapped: boolean;
  readonly didEngage: boolean;
  readonly didBreakAway: boolean;
  readonly tangentVector: RulerPoint2D;
  readonly tangentAngleRad: number;
  readonly replicatedSamples: readonly ReplicatedStrokeSample[];
  readonly nextState: RulerSnapSessionState;
}

const TWO_PI = Math.PI * 2;

function normalizeAngleSignedPi(angleRad: number): number {
  if (!Number.isFinite(angleRad)) return 0;
  let wrapped = angleRad % TWO_PI;
  if (wrapped <= -Math.PI) wrapped += TWO_PI;
  if (wrapped > Math.PI) wrapped -= TWO_PI;
  return wrapped;
}

function clampSymmetryOrder(order: number): number {
  if (!Number.isFinite(order)) return MIN_SYMMETRY_ORDER;
  return Math.min(MAX_SYMMETRY_ORDER, Math.max(MIN_SYMMETRY_ORDER, Math.round(order)));
}

function computeOrthogonalityResidual(
  point: RulerPoint2D,
  foot: RulerPoint2D,
  unitTangent: RulerPoint2D,
): number {
  const errX = point.x - foot.x;
  const errY = point.y - foot.y;
  const dist = Math.hypot(errX, errY);
  if (dist < 1e-12) return 0;
  return Math.abs((errX * unitTangent.x + errY * unitTangent.y) / dist);
}

/** 새 필압 획 시작 시 사용하는 초기 히스테리시스 세션 상태를 생성한다. */
export function createInitialRulerSnapState(): RulerSnapSessionState {
  return {
    isSnapped: false,
    lockedLineAnchor: null,
    lockedRayAngleRad: null,
    lockedConcentricScale: null,
    lastSnappedPoint: null,
    lastRawPoint: null,
  };
}

/** 임의 직선(`lineOrigin`, `lineAngleRad`) 위로 점을 정밀 직교 투영하고 단위 접선을 반환한다. */
export function projectOrthogonalOntoLine(
  point: RulerPoint2D,
  lineOrigin: RulerPoint2D,
  lineAngleRad: number,
): OrthogonalProjectionSample {
  const ux = Math.cos(lineAngleRad);
  const uy = Math.sin(lineAngleRad);
  const projScalar = (point.x - lineOrigin.x) * ux + (point.y - lineOrigin.y) * uy;
  const footPoint: RulerPoint2D = {
    x: lineOrigin.x + projScalar * ux,
    y: lineOrigin.y + projScalar * uy,
  };
  const orthogonalDistancePx = Math.hypot(point.x - footPoint.x, point.y - footPoint.y);
  const unitTangent: RulerPoint2D = { x: ux, y: uy };

  return {
    footPoint,
    orthogonalDistancePx,
    unitTangent,
    tangentAngleRad: normalizeAngleSignedPi(Math.atan2(uy, ux)),
    orthogonalityResidual: computeOrthogonalityResidual(point, footPoint, unitTangent),
  };
}

function solveCanonicalFirstQuadrantEllipse(
  majorA: number,
  minorB: number,
  u: number,
  v: number,
): { readonly x: number; readonly y: number } {
  if (v > 1e-13) {
    if (u > 1e-13) {
      const zU = majorA * u;
      const zV = minorB * v;
      const majorA2 = majorA * majorA;
      const minorB2 = minorB * minorB;

      let lo = -minorB2 + zV;
      let hi = -minorB2 + Math.hypot(zU, zV);
      let t = 0.5 * (lo + hi);

      for (let iter = 0; iter < 64; iter += 1) {
        const denomU = t + majorA2;
        const denomV = t + minorB2;
        const rU = zU / denomU;
        const rV = zV / denomV;
        const f = rU * rU + rV * rV - 1;
        if (Math.abs(f) < 1e-14 || hi - lo < 1e-14 * Math.max(1, Math.abs(t))) break;
        if (f > 0) lo = t;
        else hi = t;
        const df = -2 * ((rU * rU) / denomU + (rV * rV) / denomV);
        const newtonNext = df < -1e-30 ? t - f / df : 0.5 * (lo + hi);
        t = newtonNext > lo && newtonNext < hi ? newtonNext : 0.5 * (lo + hi);
      }

      return { x: (majorA2 * u) / (t + majorA2), y: (minorB2 * v) / (t + minorB2) };
    }
    return { x: 0, y: minorB };
  }

  const c2 = majorA * majorA - minorB * minorB;
  if (c2 > 1e-13 && majorA * u < c2) {
    const x = (majorA * majorA * u) / c2;
    const ratio = Math.min(1, x / majorA);
    return { x, y: minorB * Math.sqrt(Math.max(0, 1 - ratio * ratio)) };
  }
  return { x: majorA, y: 0 };
}

/**
 * 회전 타원(`center`, `radiusX`, `radiusY`, `rotationRad`) 위로 점을 정밀 직교 투영한다.
 * 단순 극각 근사가 아닌 라그랑주 승수 방정식의 유일 근을 풀어 높은 이심률에서도 수선 직교성을 보장한다.
 */
export function projectOrthogonalOntoEllipse(
  point: RulerPoint2D,
  ellipse: {
    readonly center: RulerPoint2D;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly rotationRad?: number;
  },
): OrthogonalProjectionSample {
  const a = Math.max(1e-6, Math.abs(ellipse.radiusX));
  const b = Math.max(1e-6, Math.abs(ellipse.radiusY));
  const rot = ellipse.rotationRad ?? 0;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  const dx = point.x - ellipse.center.x;
  const dy = point.y - ellipse.center.y;
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  const signX = localX >= 0 ? 1 : -1;
  const signY = localY >= 0 ? 1 : -1;

  const q1 =
    a >= b
      ? solveCanonicalFirstQuadrantEllipse(a, b, Math.abs(localX), Math.abs(localY))
      : solveCanonicalFirstQuadrantEllipse(b, a, Math.abs(localY), Math.abs(localX));
  const footLocalX = signX * (a >= b ? q1.x : q1.y);
  const footLocalY = signY * (a >= b ? q1.y : q1.x);

  const paramTheta = Math.atan2(footLocalY / b, footLocalX / a);
  const rawTanX = -a * Math.sin(paramTheta);
  const rawTanY = b * Math.cos(paramTheta);
  const tanLen = Math.max(1e-12, Math.hypot(rawTanX, rawTanY));
  const unitLocalTanX = rawTanX / tanLen;
  const unitLocalTanY = rawTanY / tanLen;

  const footPoint: RulerPoint2D = {
    x: ellipse.center.x + footLocalX * cosR - footLocalY * sinR,
    y: ellipse.center.y + footLocalX * sinR + footLocalY * cosR,
  };
  const unitTangent: RulerPoint2D = {
    x: unitLocalTanX * cosR - unitLocalTanY * sinR,
    y: unitLocalTanX * sinR + unitLocalTanY * cosR,
  };

  return {
    footPoint,
    orthogonalDistancePx: Math.hypot(point.x - footPoint.x, point.y - footPoint.y),
    unitTangent,
    tangentAngleRad: normalizeAngleSignedPi(Math.atan2(unitTangent.y, unitTangent.x)),
    orthogonalityResidual: computeOrthogonalityResidual(point, footPoint, unitTangent),
  };
}

function buildRotatedReplica(
  sectorIndex: number,
  center: RulerPoint2D,
  relX: number,
  relY: number,
  radiusPx: number,
  basePolar: number,
  tangentAngleRad: number,
  rotAngle: number,
): ReplicatedStrokeSample {
  const cosK = Math.cos(rotAngle);
  const sinK = Math.sin(rotAngle);
  const rx = relX * cosK - relY * sinK;
  const ry = relX * sinK + relY * cosK;
  const tAngle = normalizeAngleSignedPi(tangentAngleRad + rotAngle);
  return {
    sectorIndex,
    isMirrored: false,
    point: { x: center.x + rx, y: center.y + ry },
    tangentAngleRad: tAngle,
    tangentVector: { x: Math.cos(tAngle), y: Math.sin(tAngle) },
    radiusPx,
    polarAngleRad: normalizeAngleSignedPi(basePolar + rotAngle),
  };
}

function buildMirroredReplica(
  sectorIndex: number,
  center: RulerPoint2D,
  relX: number,
  relY: number,
  radiusPx: number,
  tangentAngleRad: number,
  mirrorAxisRad: number,
): ReplicatedStrokeSample {
  const twoAxis = 2 * mirrorAxisRad;
  const cos2A = Math.cos(twoAxis);
  const sin2A = Math.sin(twoAxis);
  const mx = relX * cos2A + relY * sin2A;
  const my = relX * sin2A - relY * cos2A;
  const tAngle = normalizeAngleSignedPi(twoAxis - tangentAngleRad);
  return {
    sectorIndex,
    isMirrored: true,
    point: { x: center.x + mx, y: center.y + my },
    tangentAngleRad: tAngle,
    tangentVector: { x: Math.cos(tAngle), y: Math.sin(tAngle) },
    radiusPx,
    polarAngleRad: normalizeAngleSignedPi(Math.atan2(my, mx)),
  };
}

/**
 * 방사 대칭 자(`N = 2..12`) 설정에 따라 기준 점과 펜촉 접선 각도를 `N`중 회전·거울 복제한다.
 */
export function replicateSymmetricStrokePoint(
  point: RulerPoint2D,
  tangentAngleRad: number,
  ruler: Pick<
    RadialSymmetryRulerSpec,
    "center" | "symmetryOrder" | "baseAxisAngleRad" | "symmetryMode"
  >,
): readonly ReplicatedStrokeSample[] {
  const order = clampSymmetryOrder(ruler.symmetryOrder);
  const baseAxis = ruler.baseAxisAngleRad ?? 0;
  const mode = ruler.symmetryMode ?? "rotational";
  const stepAngle = TWO_PI / order;

  const relX = point.x - ruler.center.x;
  const relY = point.y - ruler.center.y;
  const radiusPx = Math.hypot(relX, relY);
  const basePolar = Math.atan2(relY, relX);
  const replicas: ReplicatedStrokeSample[] = [];

  if (mode === "rotational") {
    for (let k = 0; k < order; k += 1) {
      replicas.push(
        buildRotatedReplica(k, ruler.center, relX, relY, radiusPx, basePolar, tangentAngleRad, k * stepAngle),
      );
    }
    return replicas;
  }

  if (mode === "alternating-mirror") {
    for (let k = 0; k < order; k += 1) {
      replicas.push(
        k % 2 === 0
          ? buildRotatedReplica(k, ruler.center, relX, relY, radiusPx, basePolar, tangentAngleRad, k * stepAngle)
          : buildMirroredReplica(k, ruler.center, relX, relY, radiusPx, tangentAngleRad, baseAxis + (k * Math.PI) / order),
      );
    }
    return replicas;
  }

  for (let k = 0; k < order; k += 1) {
    replicas.push(
      buildRotatedReplica(k * 2, ruler.center, relX, relY, radiusPx, basePolar, tangentAngleRad, k * stepAngle),
      buildMirroredReplica(k * 2 + 1, ruler.center, relX, relY, radiusPx, tangentAngleRad, baseAxis + (k * Math.PI) / order),
    );
  }
  return replicas;
}

function pickNearestGuideRayAngle(
  point: RulerPoint2D,
  origin: RulerPoint2D,
  rayAngles: readonly number[],
): number {
  let bestAngle = rayAngles[0] ?? 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const angle of rayAngles) {
    const dist = projectOrthogonalOntoLine(point, origin, angle).orthogonalDistancePx;
    if (dist < bestDist) {
      bestDist = dist;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

function orientTangentAlongStrokeMotion(
  baseTangent: RulerPoint2D,
  currentPoint: RulerPoint2D,
  prevPoint: RulerPoint2D | null,
): RulerPoint2D {
  if (prevPoint === null) return baseTangent;
  const vx = currentPoint.x - prevPoint.x;
  const vy = currentPoint.y - prevPoint.y;
  if (Math.hypot(vx, vy) < 1e-6) return baseTangent;
  return vx * baseTangent.x + vy * baseTangent.y < 0
    ? { x: -baseTangent.x, y: -baseTangent.y }
    : baseTangent;
}

function resolveGridLineAnchor(
  point: RulerPoint2D,
  origin: RulerPoint2D,
  angleRad: number,
  spacingPx: number,
): RulerPoint2D {
  const nx = -Math.sin(angleRad);
  const ny = Math.cos(angleRad);
  const signedOffset = (point.x - origin.x) * nx + (point.y - origin.y) * ny;
  const lineIndex = Math.round(signedOffset / spacingPx);
  return { x: origin.x + lineIndex * spacingPx * nx, y: origin.y + lineIndex * spacingPx * ny };
}

/**
 * 생 스타일러스 입력 점 1개를 활성 만화 자 다양체에 직교 투영하고,
 * 진입·이탈 히스테리시스(`snapEngagePx` / `snapReleasePx`)와 대칭 복제를 적용한다.
 */
export function snapStylusPointToRuler(
  rawPoint: RulerPoint2D,
  ruler: ComicRulerSpec,
  prevState: RulerSnapSessionState = createInitialRulerSnapState(),
  options?: RulerHysteresisOptions,
): RulerSnapStepResult {
  const snapEngagePx = Math.max(0, options?.snapEngagePx ?? DEFAULT_SNAP_ENGAGE_PX);
  const snapReleasePx = Math.max(snapEngagePx, options?.snapReleasePx ?? DEFAULT_SNAP_RELEASE_PX);
  const thresholdPx = prevState.isSnapped ? snapReleasePx : snapEngagePx;

  let nextLockedLineAnchor: RulerPoint2D | null = prevState.lockedLineAnchor;
  let nextLockedRayAngle: number | null = prevState.lockedRayAngleRad;
  let nextLockedScale: number | null = prevState.lockedConcentricScale;

  let proj: OrthogonalProjectionSample;
  let canSnap = true;

  switch (ruler.kind) {
    case "parallel": {
      let lineAnchor = prevState.lockedLineAnchor ?? ruler.origin;
      if (ruler.lineSpacingPx !== undefined && ruler.lineSpacingPx > 0) {
        const candidate = resolveGridLineAnchor(rawPoint, ruler.origin, ruler.angleRad, ruler.lineSpacingPx);
        if (prevState.lockedLineAnchor === null) {
          lineAnchor = candidate;
        } else if (!prevState.isSnapped) {
          const candDist = projectOrthogonalOntoLine(rawPoint, candidate, ruler.angleRad).orthogonalDistancePx;
          if (candDist <= snapEngagePx) lineAnchor = candidate;
        }
      }
      proj = projectOrthogonalOntoLine(rawPoint, lineAnchor, ruler.angleRad);
      nextLockedLineAnchor = lineAnchor;
      break;
    }

    case "vanishing-radial": {
      let rayAngle: number;
      if (ruler.referenceRayAngleRad !== undefined) {
        rayAngle = ruler.referenceRayAngleRad;
      } else if (ruler.guideRayAnglesRad !== undefined && ruler.guideRayAnglesRad.length > 0) {
        if (prevState.isSnapped && prevState.lockedRayAngleRad !== null) {
          rayAngle = prevState.lockedRayAngleRad;
        } else {
          const nearest = pickNearestGuideRayAngle(rawPoint, ruler.vanishingPoint, ruler.guideRayAnglesRad);
          const nearestDist = projectOrthogonalOntoLine(rawPoint, ruler.vanishingPoint, nearest).orthogonalDistancePx;
          rayAngle =
            prevState.lockedRayAngleRad !== null && nearestDist > snapEngagePx
              ? prevState.lockedRayAngleRad
              : nearest;
        }
      } else if (prevState.lockedRayAngleRad !== null) {
        rayAngle = prevState.lockedRayAngleRad;
      } else {
        const dx = rawPoint.x - ruler.vanishingPoint.x;
        const dy = rawPoint.y - ruler.vanishingPoint.y;
        rayAngle = Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dy, dx) : 0;
      }
      proj = projectOrthogonalOntoLine(rawPoint, ruler.vanishingPoint, rayAngle);
      nextLockedRayAngle = rayAngle;
      break;
    }

    case "concentric-ellipse": {
      let scale = 1;
      if (ruler.lockConcentricScaleOnEngage === true) {
        if (prevState.lockedConcentricScale !== null) {
          scale = prevState.lockedConcentricScale;
        } else {
          const rot = ruler.rotationRad ?? 0;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const dx = rawPoint.x - ruler.center.x;
          const dy = rawPoint.y - ruler.center.y;
          const lx = dx * cosR + dy * sinR;
          const ly = -dx * sinR + dy * cosR;
          scale = Math.max(1e-3, Math.hypot(lx / Math.max(1e-6, ruler.radiusX), ly / Math.max(1e-6, ruler.radiusY)));
        }
      }
      proj = projectOrthogonalOntoEllipse(rawPoint, {
        center: ruler.center,
        radiusX: ruler.radiusX * scale,
        radiusY: ruler.radiusY * scale,
        rotationRad: ruler.rotationRad,
      });
      nextLockedScale = scale;
      break;
    }

    case "radial-symmetry": {
      const order = clampSymmetryOrder(ruler.symmetryOrder);
      const baseAxis = ruler.baseAxisAngleRad ?? 0;
      if (ruler.snapToAxisRays === true) {
        let axisAngle: number;
        if (prevState.isSnapped && prevState.lockedRayAngleRad !== null) {
          axisAngle = prevState.lockedRayAngleRad;
        } else {
          const axes: number[] = [];
          for (let k = 0; k < order; k += 1) axes.push(baseAxis + (k * Math.PI) / order);
          axisAngle = pickNearestGuideRayAngle(rawPoint, ruler.center, axes);
        }
        proj = projectOrthogonalOntoLine(rawPoint, ruler.center, axisAngle);
        nextLockedRayAngle = axisAngle;
      } else {
        canSnap = false;
        let freeTan: RulerPoint2D = { x: 1, y: 0 };
        if (prevState.lastRawPoint !== null) {
          const vx = rawPoint.x - prevState.lastRawPoint.x;
          const vy = rawPoint.y - prevState.lastRawPoint.y;
          const vLen = Math.hypot(vx, vy);
          if (vLen > 1e-6) freeTan = { x: vx / vLen, y: vy / vLen };
        }
        proj = {
          footPoint: rawPoint,
          orthogonalDistancePx: 0,
          unitTangent: freeTan,
          tangentAngleRad: normalizeAngleSignedPi(Math.atan2(freeTan.y, freeTan.x)),
          orthogonalityResidual: 0,
        };
      }
      break;
    }
  }

  const isSnapped = canSnap && proj.orthogonalDistancePx <= thresholdPx;
  const didEngage = !prevState.isSnapped && isSnapped;
  const didBreakAway = prevState.isSnapped && !isSnapped;
  const outputPoint = isSnapped ? proj.footPoint : rawPoint;

  let tangentVector = proj.unitTangent;
  if (isSnapped) {
    tangentVector = orientTangentAlongStrokeMotion(proj.unitTangent, outputPoint, prevState.lastSnappedPoint);
  } else if (prevState.lastRawPoint !== null) {
    const vx = rawPoint.x - prevState.lastRawPoint.x;
    const vy = rawPoint.y - prevState.lastRawPoint.y;
    const vLen = Math.hypot(vx, vy);
    if (vLen > 1e-6) tangentVector = { x: vx / vLen, y: vy / vLen };
  }

  const tangentAngleRad = normalizeAngleSignedPi(Math.atan2(tangentVector.y, tangentVector.x));
  const replicatedSamples: readonly ReplicatedStrokeSample[] =
    ruler.kind === "radial-symmetry"
      ? replicateSymmetricStrokePoint(outputPoint, tangentAngleRad, ruler)
      : [
          {
            sectorIndex: 0,
            isMirrored: false,
            point: outputPoint,
            tangentAngleRad,
            tangentVector,
            radiusPx: 0,
            polarAngleRad: 0,
          },
        ];

  const retainLock = isSnapped || prevState.isSnapped || prevState.lockedRayAngleRad !== null || prevState.lockedLineAnchor !== null || prevState.lockedConcentricScale !== null;
  const nextState: RulerSnapSessionState = {
    isSnapped,
    lockedLineAnchor: retainLock ? nextLockedLineAnchor : null,
    lockedRayAngleRad: retainLock ? nextLockedRayAngle : null,
    lockedConcentricScale: retainLock ? nextLockedScale : null,
    lastSnappedPoint: isSnapped ? outputPoint : null,
    lastRawPoint: rawPoint,
  };

  return {
    rulerKind: ruler.kind,
    rawPoint,
    projectedFootPoint: proj.footPoint,
    outputPoint,
    orthogonalDistancePx: proj.orthogonalDistancePx,
    orthogonalityResidual: proj.orthogonalityResidual,
    isSnapped,
    didEngage,
    didBreakAway,
    tangentVector,
    tangentAngleRad,
    replicatedSamples,
    nextState,
  };
}

/** 연속 스타일러스 샘플 배열 전체를 히스테리시스 상태 전이와 함께 일괄 스냅 처리한다. */
export function snapStylusStrokePolyline(
  rawPoints: readonly RulerPoint2D[],
  ruler: ComicRulerSpec,
  options?: RulerHysteresisOptions,
): readonly RulerSnapStepResult[] {
  let state = createInitialRulerSnapState();
  const steps: RulerSnapStepResult[] = [];
  for (const pt of rawPoints) {
    const step = snapStylusPointToRuler(pt, ruler, state, options);
    steps.push(step);
    state = step.nextState;
  }
  return steps;
}
