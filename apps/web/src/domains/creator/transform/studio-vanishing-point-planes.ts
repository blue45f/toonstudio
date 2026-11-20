/**
 * Photoshop 3D 연결 소실점 평면 케이지(Vanishing Point Connected Planes) 순수 기하 엔진.
 *
 * - 볼록 4점 원근 평면의 8-DOF 호모그래피(H, H⁻¹) 부분 피벗 가우스 소거 해법
 * - 직교 90° 인접 벽·바닥·천장 평면 찢어내기(Edge Tear-off) 호모그래피 체인
 * - 평면 경계 코너 절곡(Corner-bending) 연속 UV 매핑 및 스트로크 이음 추적
 * - 야코비안 행렬식(√|det J|) 기반 원근 깊이 비례 브러시 크기 & 복제 도장 변환
 */

export interface VpPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 시계 방향 4꼭짓점 `[topLeft, topRight, bottomRight, bottomLeft]`. */
export type VpQuad = readonly [VpPoint2D, VpPoint2D, VpPoint2D, VpPoint2D];

export type VpEdgeSide = "top" | "right" | "bottom" | "left";

export type Homography3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface VanishingPointPlane {
  readonly planeId: string;
  readonly parentPlaneId: string | null;
  readonly attachedParentEdge: VpEdgeSide | null;
  readonly quad: VpQuad;
  /** 평면 월드 가로·세로 길이(정규화 기준 또는 cm/m 단위). */
  readonly widthWorld: number;
  readonly heightWorld: number;
  /** 인접 평면과의 절곡 각도(도, 기본 90° 직교). */
  readonly bendAngleDeg: number;
  /** 월드 평면 `(u, v) ∈ [0, widthWorld] × [0, heightWorld]` → 캔버스 `(x, y)` 호모그래피. */
  readonly homography: Homography3x3;
  /** 캔버스 `(x, y)` → 월드 평면 `(u, v)` 역호모그래피. */
  readonly inverseHomography: Homography3x3;
  /** 평면 U축(수평변) 소실점(평행 시 null). */
  readonly vanishingPointU: VpPoint2D | null;
  /** 평면 V축(수직변) 소실점(평행 시 null). */
  readonly vanishingPointV: VpPoint2D | null;
}

export interface VanishingPointCage {
  readonly cageId: string;
  readonly planes: ReadonlyMap<string, VanishingPointPlane>;
  readonly rootPlaneId: string;
  /** 카메라 주점(이미지 중심, 3D 직교 소실점 추정용). */
  readonly principalPoint: VpPoint2D;
}

function cross2(a: VpPoint2D, b: VpPoint2D, c: VpPoint2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 볼록·비퇴화 4각형인지 검증한다. */
export function isValidConvexVpQuad(quad: VpQuad): boolean {
  for (const pt of quad) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return false;
  }
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const c = cross2(quad[i]!, quad[(i + 1) % 4]!, quad[(i + 2) % 4]!);
    if (Math.abs(c) < 1e-4) return false;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/** 두 직선 (p1-p2), (p3-p4)의 교점(소실점)을 구한다. 평행에 가까우면 null. */
export function intersectLines2D(
  p1: VpPoint2D,
  p2: VpPoint2D,
  p3: VpPoint2D,
  p4: VpPoint2D,
): VpPoint2D | null {
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = a1 * p1.x + b1 * p1.y;

  const a2 = p4.y - p3.y;
  const b2 = p3.x - p4.x;
  const c2 = a2 * p3.x + b2 * p3.y;

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-5) return null;
  return {
    x: (b2 * c1 - b1 * c2) / det,
    y: (a1 * c2 - a2 * c1) / det,
  };
}

/** 부분 피벗 가우스 소거법으로 `8×8` 선형 시스템을 풀어 8-DOF 호모그래피를 구한다. */
export function solveHomography3x3(src: VpQuad, dst: VpQuad): Homography3x3 {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const sx = src[i]!.x;
    const sy = src[i]!.y;
    const dx = dst[i]!.x;
    const dy = dst[i]!.y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  for (let col = 0; col < 8; col += 1) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col]![col]!);
    for (let r = col + 1; r < 8; r += 1) {
      const val = Math.abs(A[r]![col]!);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error("퇴화 사각형이라 호모그래피 행렬을 계산할 수 없습니다.");
    }
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow]!, A[col]!];
      [b[col], b[pivotRow]] = [b[pivotRow]!, b[col]!];
    }
    const pivot = A[col]![col]!;
    for (let r = col + 1; r < 8; r += 1) {
      const factor = A[r]![col]! / pivot;
      for (let c = col; c < 8; c += 1) {
        A[r]![c] = A[r]![c]! - factor * A[col]![c]!;
      }
      b[r] = b[r]! - factor * b[col]!;
    }
  }

  const h = new Array<number>(8).fill(0);
  for (let r = 7; r >= 0; r -= 1) {
    let sum = b[r]!;
    for (let c = r + 1; c < 8; c += 1) {
      sum -= A[r]![c]! * h[c]!;
    }
    h[r] = sum / A[r]![r]!;
  }

  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography3x3(H: Homography3x3, pt: VpPoint2D): VpPoint2D {
  const w = H[6] * pt.x + H[7] * pt.y + H[8];
  const safeW = Math.abs(w) < 1e-9 ? (w < 0 ? -1e-9 : 1e-9) : w;
  return {
    x: (H[0] * pt.x + H[1] * pt.y + H[2]) / safeW,
    y: (H[3] * pt.x + H[4] * pt.y + H[5]) / safeW,
  };
}

function buildPlaneFromQuad(input: {
  readonly planeId: string;
  readonly parentPlaneId: string | null;
  readonly attachedParentEdge: VpEdgeSide | null;
  readonly quad: VpQuad;
  readonly widthWorld: number;
  readonly heightWorld: number;
  readonly bendAngleDeg: number;
}): VanishingPointPlane {
  if (!isValidConvexVpQuad(input.quad)) {
    throw new Error(`유효한 볼록 사각형이 아닙니다: ${input.planeId}`);
  }
  const w = Math.max(1e-3, input.widthWorld);
  const h = Math.max(1e-3, input.heightWorld);
  const worldQuad: VpQuad = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const homography = solveHomography3x3(worldQuad, input.quad);
  const inverseHomography = solveHomography3x3(input.quad, worldQuad);
  const vanishingPointU = intersectLines2D(input.quad[0], input.quad[1], input.quad[3], input.quad[2]);
  const vanishingPointV = intersectLines2D(input.quad[0], input.quad[3], input.quad[1], input.quad[2]);

  return {
    planeId: input.planeId,
    parentPlaneId: input.parentPlaneId,
    attachedParentEdge: input.attachedParentEdge,
    quad: input.quad,
    widthWorld: w,
    heightWorld: h,
    bendAngleDeg: input.bendAngleDeg,
    homography,
    inverseHomography,
    vanishingPointU,
    vanishingPointV,
  };
}

/** 첫 번째 기준 원근 평면으로 3D 소실점 평면 케이지를 생성한다. */
export function createVanishingPointCage(input: {
  readonly cageId: string;
  readonly rootPlaneId?: string;
  readonly quad: VpQuad;
  readonly widthWorld?: number;
  readonly heightWorld?: number;
  readonly principalPoint?: VpPoint2D;
}): VanishingPointCage {
  const rootPlaneId = input.rootPlaneId ?? "plane-root";
  const topLen = Math.hypot(input.quad[1].x - input.quad[0].x, input.quad[1].y - input.quad[0].y);
  const leftLen = Math.hypot(input.quad[3].x - input.quad[0].x, input.quad[3].y - input.quad[0].y);
  const cx = (input.quad[0].x + input.quad[1].x + input.quad[2].x + input.quad[3].x) * 0.25;
  const cy = (input.quad[0].y + input.quad[1].y + input.quad[2].y + input.quad[3].y) * 0.25;

  const root = buildPlaneFromQuad({
    planeId: rootPlaneId,
    parentPlaneId: null,
    attachedParentEdge: null,
    quad: input.quad,
    widthWorld: input.widthWorld ?? topLen,
    heightWorld: input.heightWorld ?? leftLen,
    bendAngleDeg: 0,
  });

  const planes = new Map<string, VanishingPointPlane>([[rootPlaneId, root]]);
  return {
    cageId: input.cageId,
    planes,
    rootPlaneId,
    principalPoint: input.principalPoint ?? { x: cx, y: cy },
  };
}

/**
 * 기준 평면의 직교 변(edge)에서 90°(또는 지정 각도) 인접 평면을 찢어내어(Tear-off)
 * 호모그래피 체인에 연결한다.
 */
export function tearOffOrthogonalPlane(
  cage: VanishingPointCage,
  options: {
    readonly parentPlaneId: string;
    readonly edge: VpEdgeSide;
    readonly newPlaneId: string;
    readonly depthWorld: number;
    readonly bendAngleDeg?: number;
    /** 새 평면의 외측 진행 방향 소실점(생략 시 카메라 주점·부모 변으로부터 직교 투시 추정). */
    readonly orthogonalVanishingPoint?: VpPoint2D | null;
  },
): VanishingPointCage {
  const parent = cage.planes.get(options.parentPlaneId);
  if (!parent) throw new Error(`부모 평면을 찾을 수 없습니다: ${options.parentPlaneId}`);
  const depth = Math.max(1e-3, options.depthWorld);
  const bendAngleDeg = options.bendAngleDeg ?? 90;

  const [p0, p1, p2, p3] = parent.quad;
  // 공유 힌지 변(a, b)과 부모 평면 안쪽 기준점(inA, inB)
  const edgeMap: Record<
    VpEdgeSide,
    { a: VpPoint2D; b: VpPoint2D; inA: VpPoint2D; inB: VpPoint2D; sharedWorldLen: number }
  > = {
    right: { a: p1, b: p2, inA: p0, inB: p3, sharedWorldLen: parent.heightWorld },
    left: { a: p0, b: p3, inA: p1, inB: p2, sharedWorldLen: parent.heightWorld },
    bottom: { a: p3, b: p2, inA: p0, inB: p1, sharedWorldLen: parent.widthWorld },
    top: { a: p0, b: p1, inA: p3, inB: p2, sharedWorldLen: parent.widthWorld },
  };
  const { a, b, inA, inB, sharedWorldLen } = edgeMap[options.edge];

  const hingeLenPx = Math.hypot(b.x - a.x, b.y - a.y);
  const pxPerWorld = hingeLenPx / Math.max(1e-3, sharedWorldLen);
  const extPx = depth * pxPerWorld;

  const projectOut = (corner: VpPoint2D, inner: VpPoint2D): VpPoint2D => {
    if (options.orthogonalVanishingPoint) {
      const vp = options.orthogonalVanishingPoint;
      const vx = vp.x - corner.x;
      const vy = vp.y - corner.y;
      const dist = Math.hypot(vx, vy);
      if (dist > 1e-4) {
        // 원근 단축을 반영한 소실점 방향 보간: t = extPx / (extPx + dist)
        const t = Math.min(0.82, extPx / (extPx + dist));
        return { x: corner.x + vx * t, y: corner.y + vy * t };
      }
    }
    // 소실점 미지정 시 부모 힌지 변의 바깥쪽 방향(각도 반영)으로 직교 투영
    const dx = corner.x - inner.x;
    const dy = corner.y - inner.y;
    const len = Math.max(1e-4, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const perspectiveTaper = Math.sin((bendAngleDeg * Math.PI) / 180) * 0.85 + 0.15;
    const towardPrincipalX = (cage.principalPoint.x - corner.x) * 0.08;
    const towardPrincipalY = (cage.principalPoint.y - corner.y) * 0.08;
    return {
      x: corner.x + ux * extPx * perspectiveTaper + towardPrincipalX,
      y: corner.y + uy * extPx * perspectiveTaper + towardPrincipalY,
    };
  };

  const outA = projectOut(a, inA);
  const outB = projectOut(b, inB);

  let nextQuad: VpQuad;
  let widthWorld = depth;
  let heightWorld = sharedWorldLen;
  if (options.edge === "right") {
    nextQuad = [a, outA, outB, b];
  } else if (options.edge === "left") {
    nextQuad = [outA, a, b, outB];
  } else if (options.edge === "bottom") {
    nextQuad = [a, b, outB, outA];
    widthWorld = sharedWorldLen;
    heightWorld = depth;
  } else {
    nextQuad = [outA, outB, b, a];
    widthWorld = sharedWorldLen;
    heightWorld = depth;
  }

  const nextPlane = buildPlaneFromQuad({
    planeId: options.newPlaneId,
    parentPlaneId: parent.planeId,
    attachedParentEdge: options.edge,
    quad: nextQuad,
    widthWorld,
    heightWorld,
    bendAngleDeg,
  });

  const nextPlanes = new Map(cage.planes);
  nextPlanes.set(nextPlane.planeId, nextPlane);
  return { ...cage, planes: nextPlanes };
}

/**
 * 평면 로컬 좌표 `(u, v)`에서의 원근 깊이 비례 스케일(캔버스 px / 월드 1단위)을
 * 호모그래피 야코비안 행렬식 `√|det J_H(u, v)|`로 정밀 계산한다.
 */
export function evaluatePerspectiveLocalScale(
  plane: VanishingPointPlane,
  u: number,
  v: number,
): number {
  const H = plane.homography;
  const xNum = H[0] * u + H[1] * v + H[2];
  const yNum = H[3] * u + H[4] * v + H[5];
  const w = H[6] * u + H[7] * v + H[8];
  const w2 = Math.max(1e-12, w * w);

  const dxdU = (H[0] * w - xNum * H[6]) / w2;
  const dxdV = (H[1] * w - xNum * H[7]) / w2;
  const dydU = (H[3] * w - yNum * H[6]) / w2;
  const dydV = (H[4] * w - yNum * H[7]) / w2;

  const det = Math.abs(dxdU * dydV - dxdV * dydU);
  return Math.sqrt(det);
}

/** 캔버스 좌표 `(x, y)`가 속하는 평면과 로컬 월드 UV, 원근 스케일을 찾는다. */
export function projectCanvasPointToCage(
  cage: VanishingPointCage,
  canvasPt: VpPoint2D,
): {
  readonly planeId: string;
  readonly u: number;
  readonly v: number;
  readonly localScale: number;
} | null {
  for (const plane of cage.planes.values()) {
    const local = applyHomography3x3(plane.inverseHomography, canvasPt);
    if (
      local.x >= -1e-4
      && local.x <= plane.widthWorld + 1e-4
      && local.y >= -1e-4
      && local.y <= plane.heightWorld + 1e-4
    ) {
      const u = Math.max(0, Math.min(plane.widthWorld, local.x));
      const v = Math.max(0, Math.min(plane.heightWorld, local.y));
      return {
        planeId: plane.planeId,
        u,
        v,
        localScale: evaluatePerspectiveLocalScale(plane, u, v),
      };
    }
  }
  return null;
}

/**
 * 평면 경계(90° 코너)를 넘어가는 월드 이동 벡터 `(du, dv)`를 인접 평면으로 자동 절곡(Corner-bend) 매핑한다.
 */
export function tracePointAcrossCageCorner(
  cage: VanishingPointCage,
  startPlaneId: string,
  startUv: VpPoint2D,
  deltaWorld: VpPoint2D,
): {
  readonly planeId: string;
  readonly uv: VpPoint2D;
  readonly canvasPoint: VpPoint2D;
  readonly crossedCorner: boolean;
  readonly localScale: number;
} {
  const current = cage.planes.get(startPlaneId);
  if (!current) throw new Error(`평면을 찾을 수 없습니다: ${startPlaneId}`);

  const rawU = startUv.x + deltaWorld.x;
  const rawV = startUv.y + deltaWorld.y;

  let exceededEdge: VpEdgeSide | null = null;
  let overshoot = 0;
  let alongPos = 0;

  if (rawU > current.widthWorld) {
    exceededEdge = "right";
    overshoot = rawU - current.widthWorld;
    alongPos = Math.max(0, Math.min(current.heightWorld, rawV));
  } else if (rawU < 0) {
    exceededEdge = "left";
    overshoot = -rawU;
    alongPos = Math.max(0, Math.min(current.heightWorld, rawV));
  } else if (rawV > current.heightWorld) {
    exceededEdge = "bottom";
    overshoot = rawV - current.heightWorld;
    alongPos = Math.max(0, Math.min(current.widthWorld, rawU));
  } else if (rawV < 0) {
    exceededEdge = "top";
    overshoot = -rawV;
    alongPos = Math.max(0, Math.min(current.widthWorld, rawU));
  }

  if (exceededEdge !== null) {
    // 자식 평면 중 해당 변에 연결된 인접 평면 탐색
    for (const candidate of cage.planes.values()) {
      if (candidate.parentPlaneId === current.planeId && candidate.attachedParentEdge === exceededEdge) {
        const nextUv: VpPoint2D =
          exceededEdge === "right"
            ? { x: Math.min(candidate.widthWorld, overshoot), y: Math.min(candidate.heightWorld, alongPos) }
            : exceededEdge === "left"
              ? { x: Math.max(0, candidate.widthWorld - overshoot), y: Math.min(candidate.heightWorld, alongPos) }
              : exceededEdge === "bottom"
                ? { x: Math.min(candidate.widthWorld, alongPos), y: Math.min(candidate.heightWorld, overshoot) }
                : { x: Math.min(candidate.widthWorld, alongPos), y: Math.max(0, candidate.heightWorld - overshoot) };
        return {
          planeId: candidate.planeId,
          uv: nextUv,
          canvasPoint: applyHomography3x3(candidate.homography, nextUv),
          crossedCorner: true,
          localScale: evaluatePerspectiveLocalScale(candidate, nextUv.x, nextUv.y),
        };
      }
    }
  }

  const clampedUv = {
    x: Math.max(0, Math.min(current.widthWorld, rawU)),
    y: Math.max(0, Math.min(current.heightWorld, rawV)),
  };
  return {
    planeId: current.planeId,
    uv: clampedUv,
    canvasPoint: applyHomography3x3(current.homography, clampedUv),
    crossedCorner: false,
    localScale: evaluatePerspectiveLocalScale(current, clampedUv.x, clampedUv.y),
  };
}

/**
 * 원근 보정 복제 도장(Perspective Clone Stamp):
 * 소스 평면의 기준점과 타깃 평면의 브러시 위치 사이 상대 오프셋을 월드 단위로 동기화하고
 * 두 위치의 원근 야코비안 스케일 비(`targetScale / sourceScale`)를 반환한다.
 */
export function computePerspectiveCloneSample(
  cage: VanishingPointCage,
  input: {
    readonly sourcePlaneId: string;
    readonly sourceOriginUv: VpPoint2D;
    readonly targetPlaneId: string;
    readonly targetOriginUv: VpPoint2D;
    readonly brushDeltaWorld: VpPoint2D;
    readonly baseBrushRadiusPx: number;
  },
): {
  readonly sourceCanvasPoint: VpPoint2D;
  readonly targetCanvasPoint: VpPoint2D;
  readonly scaleRatio: number;
  readonly perspectiveBrushRadiusPx: number;
  readonly crossedCorner: boolean;
} {
  const sourceSample = tracePointAcrossCageCorner(
    cage,
    input.sourcePlaneId,
    input.sourceOriginUv,
    input.brushDeltaWorld,
  );
  const targetSample = tracePointAcrossCageCorner(
    cage,
    input.targetPlaneId,
    input.targetOriginUv,
    input.brushDeltaWorld,
  );
  const scaleRatio = targetSample.localScale / Math.max(1e-5, sourceSample.localScale);
  return {
    sourceCanvasPoint: sourceSample.canvasPoint,
    targetCanvasPoint: targetSample.canvasPoint,
    scaleRatio,
    perspectiveBrushRadiusPx: Math.max(0.5, input.baseBrushRadiusPx * scaleRatio),
    crossedCorner: sourceSample.crossedCorner || targetSample.crossedCorner,
  };
}
