/**
 * Wave 135 — 사영 등분할(창문·기둥·계단·바닥 격자) 및 실시간 투시 자 브러시 스냅 커널.
 *
 * - 원근 사변형(TL·TR·BR·BL)에 대해 Normalized DLT 3×3 Homography와 교차비 불변량 검증,
 *   X-대각선 중심 일치성, 소실점 수렴성을 계산한다.
 * - 3D 핀홀 카메라 리깅 기반 원근 계단(트레드+라이저) 폴리곤 생성과 원근 축소 단조성·
 *   코선 교차비 불변량을 검증한다.
 * - 브러시 스트로크를 가장 가까운 투시 광선(VP1·VP2·VP3)에 `< 1e-6°` 잔차로 스냅한다.
 */

import {
  applyHomography,
  computeCollinearCrossRatio2D,
  computeCrossRatio1D,
  computeHomographyNormalizedDlt,
  intersectLinesHomogeneous,
  invertHomography3x3,
  isConvexNonDegenerateQuad,
  polygonAreaQuad,
  type PerspectiveQuad2D,
} from "./homography-and-cross-ratio";
import { projectWorldPointToCanvas } from "./perspective-camera-and-vp-solver";
import {
  angleBetweenUndirectedUnitVectorsDeg,
  clampFinitePerspective,
  computeSegmentToVpAngleErrorDeg,
  homogeneousToVanishingPoint,
  type Matrix3x3,
  type PerspectiveAxisId,
  type ThreePointPerspectiveRig,
  type VanishingPoint2D,
  type Vec2D,
  type Vec3D,
} from "./perspective-types-and-math";

export {
  applyHomography,
  computeCollinearCrossRatio2D,
  computeCrossRatio1D,
  computeHomographyNormalizedDlt,
  invertHomography3x3,
  isConvexNonDegenerateQuad,
  type PerspectiveQuad2D,
};

export interface LineSegment2D {
  readonly start: Vec2D;
  readonly end: Vec2D;
}

export interface SubdividePerspectiveQuadOptions {
  readonly cols: number;
  readonly rows: number;
  /** 각 셀 내부 창틀·기둥 여백 비율 (0..0.42). 지정 시 `insetQuad`를 함께 생성한다. */
  readonly mullionRatioU?: number;
  readonly mullionRatioV?: number;
  readonly colWeights?: readonly number[];
  readonly rowWeights?: readonly number[];
}

export interface SubdividedPerspectiveCell {
  readonly row: number;
  readonly col: number;
  readonly quad: PerspectiveQuad2D;
  readonly insetQuad: PerspectiveQuad2D | null;
  readonly center: Vec2D;
  readonly areaPx2: number;
  readonly topEdgeLengthPx: number;
  readonly leftEdgeLengthPx: number;
}

export interface ProjectiveSubdivisionVerification {
  readonly maxCrossRatioError: number;
  readonly maxHomographyRoundTripErrorPx: number;
  readonly maxVpConvergenceErrorDeg: number;
  readonly xDiagonalAgreementPx: number;
  readonly isProjectivelyValid: boolean;
}

export interface SubdividedPerspectiveQuadResult {
  readonly quad: PerspectiveQuad2D;
  readonly cols: number;
  readonly rows: number;
  readonly homography: Matrix3x3;
  readonly inverseHomography: Matrix3x3;
  readonly vanishingPointU: VanishingPoint2D;
  readonly vanishingPointV: VanishingPoint2D;
  readonly xDiagonalCenter: Vec2D;
  readonly gridVertices: readonly (readonly Vec2D[])[];
  readonly horizontalLines: readonly LineSegment2D[];
  readonly verticalLines: readonly LineSegment2D[];
  readonly cells: readonly SubdividedPerspectiveCell[];
  readonly verification: ProjectiveSubdivisionVerification;
}

export type StaircaseDirectionAxis = "+Z" | "-Z" | "+X" | "-X";

export interface BuildPerspectiveStaircaseInput {
  readonly rig: ThreePointPerspectiveRig;
  readonly originWorld: Vec3D;
  readonly stepCount: number;
  readonly stairWidthM: number;
  readonly treadDepthM: number;
  readonly riserHeightM: number;
  readonly directionAxis?: StaircaseDirectionAxis;
}

export interface PerspectiveStairStep2D {
  readonly stepIndex: number;
  readonly riserQuad: PerspectiveQuad2D;
  readonly treadQuad: PerspectiveQuad2D;
  readonly frontWidthPx: number;
  readonly riserHeightPx: number;
  readonly treadDepthPx: number;
  readonly averageDepthCam: number;
}

export interface PerspectiveStaircaseResult {
  readonly stepCount: number;
  readonly directionAxis: StaircaseDirectionAxis;
  readonly steps: readonly PerspectiveStairStep2D[];
  readonly leftNosingPoints: readonly Vec2D[];
  readonly rightNosingPoints: readonly Vec2D[];
  readonly isForeshorteningMonotonic: boolean;
  readonly maxVpConvergenceErrorDeg: number;
  readonly maxNosingCrossRatioError: number;
}

export interface BrushStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestampMs?: number;
}

export interface SnapStrokeToPerspectiveRulerOptions {
  readonly lockAxis?: PerspectiveAxisId | "auto";
  readonly snapStrength?: number;
  readonly anchorMode?: "first-point" | "midpoint";
}

export interface SnappedPerspectiveStrokeResult {
  readonly lockedAxis: PerspectiveAxisId;
  readonly vanishingPoint: VanishingPoint2D;
  readonly anchorPoint: Vec2D;
  readonly rayDirection: Vec2D;
  readonly snapStrength: number;
  readonly snappedPoints: readonly BrushStrokePoint[];
  readonly originalAngleDeviationDeg: number;
  readonly maxSnapAngleResidualDeg: number;
  readonly meanCorrectionDistancePx: number;
  readonly maxCorrectionDistancePx: number;
}

const CROSS_RATIO_ERROR_LIMIT = 1e-6;

function buildNormalizedStops(count: number, weights?: readonly number[]): readonly number[] {
  if (weights && weights.length === count) {
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      const w = weights[i];
      if (!Number.isFinite(w) || w <= 0) {
        throw new Error("분할 가중치는 모두 양의 유한수여야 합니다.");
      }
      total += w;
    }
    const stops: number[] = [0];
    let acc = 0;
    for (let i = 0; i < count; i += 1) {
      acc += weights[i];
      stops.push(i === count - 1 ? 1 : acc / total);
    }
    return stops;
  }
  return Array.from({ length: count + 1 }, (_, i) => i / count);
}

/**
 * 원근 사변형(Quad: TL, TR, BR, BL)을 Normalized DLT 3×3 Homography로
 * `cols × rows` 무오차 원근 등분할하고 교차비·X-대각선·소실점 수렴성을 검증한다.
 */
export function subdividePerspectiveQuad(
  quad: PerspectiveQuad2D,
  options: SubdividePerspectiveQuadOptions,
): SubdividedPerspectiveQuadResult {
  if (!isConvexNonDegenerateQuad(quad)) {
    throw new Error("원근 등분할 대상 사변형은 비퇴화 볼록 사변형(TL·TR·BR·BL 순서)이어야 합니다.");
  }

  const cols = Math.round(clampFinitePerspective(options.cols, 1, 128, 4));
  const rows = Math.round(clampFinitePerspective(options.rows, 1, 128, 4));
  const mullionU =
    options.mullionRatioU !== undefined
      ? clampFinitePerspective(options.mullionRatioU, 0, 0.42, 0)
      : 0;
  const mullionV =
    options.mullionRatioV !== undefined
      ? clampFinitePerspective(options.mullionRatioV, 0, 0.42, 0)
      : 0;

  const unitCorners: readonly Vec2D[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const homography = computeHomographyNormalizedDlt(unitCorners, [
    quad.tl,
    quad.tr,
    quad.br,
    quad.bl,
  ]);
  const inverseHomography = invertHomography3x3(homography);

  const diagH = intersectLinesHomogeneous(quad.tl, quad.br, quad.tr, quad.bl);
  const xDiagonalCenter: Vec2D = { x: diagH[0] / diagH[2], y: diagH[1] / diagH[2] };
  const vpUH = intersectLinesHomogeneous(quad.tl, quad.tr, quad.bl, quad.br);
  const vpVH = intersectLinesHomogeneous(quad.tl, quad.bl, quad.tr, quad.br);
  const vanishingPointU = homogeneousToVanishingPoint("VP1", "X", vpUH, xDiagonalCenter);
  const vanishingPointV = homogeneousToVanishingPoint("VP3", "Y", vpVH, xDiagonalCenter);

  const uStops = buildNormalizedStops(cols, options.colWeights);
  const vStops = buildNormalizedStops(rows, options.rowWeights);

  const gridVertices: Vec2D[][] = [];
  let maxRoundTripErr = 0;
  for (let r = 0; r <= rows; r += 1) {
    const rowVerts: Vec2D[] = [];
    for (let c = 0; c <= cols; c += 1) {
      const uv: Vec2D = { x: uStops[c], y: vStops[r] };
      const mapped = applyHomography(homography, uv);
      const back = applyHomography(inverseHomography, mapped);
      const rtErr = Math.hypot(back.x - uv.x, back.y - uv.y);
      if (rtErr > maxRoundTripErr) maxRoundTripErr = rtErr;
      rowVerts.push(mapped);
    }
    gridVertices.push(rowVerts);
  }

  const horizontalLines: LineSegment2D[] = [];
  const verticalLines: LineSegment2D[] = [];
  let maxVpErrDeg = 0;

  for (let r = 0; r <= rows; r += 1) {
    const start = gridVertices[r][0];
    const end = gridVertices[r][cols];
    horizontalLines.push({ start, end });
    const err = computeSegmentToVpAngleErrorDeg(
      { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
      vanishingPointU.homogeneous,
    );
    if (err > maxVpErrDeg) maxVpErrDeg = err;
  }
  for (let c = 0; c <= cols; c += 1) {
    const start = gridVertices[0][c];
    const end = gridVertices[rows][c];
    verticalLines.push({ start, end });
    const err = computeSegmentToVpAngleErrorDeg(
      { x1: start.x, y1: start.y, x2: end.x, y2: end.y },
      vanishingPointV.homogeneous,
    );
    if (err > maxVpErrDeg) maxVpErrDeg = err;
  }

  let maxCrossRatioErr = 0;
  const checkLineCrossRatios = (params: readonly number[], pts: readonly Vec2D[]): void => {
    if (params.length >= 4) {
      for (let i = 0; i + 3 < params.length; i += 1) {
        const crRef = computeCrossRatio1D(params[i], params[i + 1], params[i + 2], params[i + 3]);
        const crProj = computeCollinearCrossRatio2D(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
        const err = Math.abs(crProj - crRef);
        if (err > maxCrossRatioErr) maxCrossRatioErr = err;
      }
      return;
    }
    const sampleT = [0, 0.25, 0.6, 1.0];
    const crRef = computeCrossRatio1D(sampleT[0], sampleT[1], sampleT[2], sampleT[3]);
    const samplePts = sampleT.map((t) => applyHomography(homography, { x: t, y: 0 }));
    const err = Math.abs(
      computeCollinearCrossRatio2D(samplePts[0], samplePts[1], samplePts[2], samplePts[3]) - crRef,
    );
    if (err > maxCrossRatioErr) maxCrossRatioErr = err;
  };

  checkLineCrossRatios(uStops, gridVertices[0]);
  checkLineCrossRatios(uStops, gridVertices[rows]);
  checkLineCrossRatios(
    vStops,
    gridVertices.map((row) => row[0]),
  );
  checkLineCrossRatios(
    vStops,
    gridVertices.map((row) => row[cols]),
  );

  const cells: SubdividedPerspectiveCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    const v0 = vStops[r];
    const dv = vStops[r + 1] - v0;
    for (let c = 0; c < cols; c += 1) {
      const u0 = uStops[c];
      const du = uStops[c + 1] - u0;
      const cellQuad: PerspectiveQuad2D = {
        tl: gridVertices[r][c],
        tr: gridVertices[r][c + 1],
        br: gridVertices[r + 1][c + 1],
        bl: gridVertices[r + 1][c],
      };
      const insetQuad: PerspectiveQuad2D | null =
        mullionU > 0 || mullionV > 0
          ? {
              tl: applyHomography(homography, { x: u0 + du * mullionU, y: v0 + dv * mullionV }),
              tr: applyHomography(homography, {
                x: u0 + du * (1 - mullionU),
                y: v0 + dv * mullionV,
              }),
              br: applyHomography(homography, {
                x: u0 + du * (1 - mullionU),
                y: v0 + dv * (1 - mullionV),
              }),
              bl: applyHomography(homography, {
                x: u0 + du * mullionU,
                y: v0 + dv * (1 - mullionV),
              }),
            }
          : null;
      cells.push({
        row: r,
        col: c,
        quad: cellQuad,
        insetQuad,
        center: applyHomography(homography, { x: u0 + du * 0.5, y: v0 + dv * 0.5 }),
        areaPx2: polygonAreaQuad(cellQuad),
        topEdgeLengthPx: Math.hypot(cellQuad.tr.x - cellQuad.tl.x, cellQuad.tr.y - cellQuad.tl.y),
        leftEdgeLengthPx: Math.hypot(cellQuad.bl.x - cellQuad.tl.x, cellQuad.bl.y - cellQuad.tl.y),
      });
    }
  }

  const hCenter = applyHomography(homography, { x: 0.5, y: 0.5 });
  const xDiagonalAgreementPx = Math.hypot(
    hCenter.x - xDiagonalCenter.x,
    hCenter.y - xDiagonalCenter.y,
  );
  const isProjectivelyValid =
    maxCrossRatioErr < CROSS_RATIO_ERROR_LIMIT &&
    maxVpErrDeg < 1e-3 &&
    maxRoundTripErr < 1e-6 &&
    xDiagonalAgreementPx < 1e-4;

  return {
    quad,
    cols,
    rows,
    homography,
    inverseHomography,
    vanishingPointU,
    vanishingPointV,
    xDiagonalCenter,
    gridVertices,
    horizontalLines,
    verticalLines,
    cells,
    verification: {
      maxCrossRatioError: maxCrossRatioErr,
      maxHomographyRoundTripErrorPx: maxRoundTripErr,
      maxVpConvergenceErrorDeg: maxVpErrDeg,
      xDiagonalAgreementPx,
      isProjectivelyValid,
    },
  };
}

/**
 * 3점 투시 카메라 리깅을 사용해 `stepCount`개의 3D 원근 계단(라이저+트레드) 폴리곤을 생성한다.
 */
export function buildPerspectiveStaircase(
  input: BuildPerspectiveStaircaseInput,
): PerspectiveStaircaseResult {
  const stepCount = Math.round(clampFinitePerspective(input.stepCount, 1, 64, 8));
  const width = clampFinitePerspective(input.stairWidthM, 0.2, 50, 1.8);
  const tread = clampFinitePerspective(input.treadDepthM, 0.08, 5, 0.32);
  const riser = clampFinitePerspective(input.riserHeightM, 0.05, 3, 0.18);
  const directionAxis: StaircaseDirectionAxis = input.directionAxis ?? "+Z";

  const stepDir: Vec3D =
    directionAxis === "+Z"
      ? { x: 0, y: 0, z: 1 }
      : directionAxis === "-Z"
        ? { x: 0, y: 0, z: -1 }
        : directionAxis === "+X"
          ? { x: 1, y: 0, z: 0 }
          : { x: -1, y: 0, z: 0 };
  const widthDir: Vec3D =
    directionAxis === "+Z" || directionAxis === "-Z"
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: 1 };

  const vpWidth =
    input.rig.vp1.worldAxis === (widthDir.x !== 0 ? "X" : "Z") ? input.rig.vp1 : input.rig.vp2;
  const vpDepth = vpWidth === input.rig.vp1 ? input.rig.vp2 : input.rig.vp1;
  const vpVert = input.rig.vp3;

  const project3 = (w: Vec3D): { readonly pt: Vec2D; readonly depth: number } => {
    const p = projectWorldPointToCanvas(input.rig, w);
    return { pt: { x: p.x, y: p.y }, depth: p.depthCam };
  };

  const steps: PerspectiveStairStep2D[] = [];
  const leftNosingPoints: Vec2D[] = [];
  const rightNosingPoints: Vec2D[] = [];
  let maxVpErrDeg = 0;

  const trackEdgeErr = (a: Vec2D, b: Vec2D, vp: VanishingPoint2D): void => {
    const err = computeSegmentToVpAngleErrorDeg(
      { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
      vp.homogeneous,
    );
    if (err > maxVpErrDeg) maxVpErrDeg = err;
  };

  for (let i = 0; i < stepCount; i += 1) {
    const bx = input.originWorld.x + stepDir.x * tread * i;
    const by = input.originWorld.y + riser * i;
    const bz = input.originWorld.z + stepDir.z * tread * i;
    const wx = widthDir.x * width;
    const wz = widthDir.z * width;

    const rBl = project3({ x: bx, y: by, z: bz });
    const rBr = project3({ x: bx + wx, y: by, z: bz + wz });
    const rTl = project3({ x: bx, y: by + riser, z: bz });
    const rTr = project3({ x: bx + wx, y: by + riser, z: bz + wz });
    const tTl = project3({ x: bx + stepDir.x * tread, y: by + riser, z: bz + stepDir.z * tread });
    const tTr = project3({
      x: bx + stepDir.x * tread + wx,
      y: by + riser,
      z: bz + stepDir.z * tread + wz,
    });

    const riserQuad: PerspectiveQuad2D = { tl: rTl.pt, tr: rTr.pt, br: rBr.pt, bl: rBl.pt };
    const treadQuad: PerspectiveQuad2D = { tl: tTl.pt, tr: tTr.pt, br: rTr.pt, bl: rTl.pt };

    trackEdgeErr(riserQuad.tl, riserQuad.bl, vpVert);
    trackEdgeErr(riserQuad.tr, riserQuad.br, vpVert);
    trackEdgeErr(riserQuad.tl, riserQuad.tr, vpWidth);
    trackEdgeErr(riserQuad.bl, riserQuad.br, vpWidth);
    trackEdgeErr(treadQuad.tl, treadQuad.tr, vpWidth);
    trackEdgeErr(treadQuad.bl, treadQuad.tl, vpDepth);
    trackEdgeErr(treadQuad.br, treadQuad.tr, vpDepth);

    leftNosingPoints.push(rTl.pt);
    rightNosingPoints.push(rTr.pt);
    steps.push({
      stepIndex: i,
      riserQuad,
      treadQuad,
      frontWidthPx: Math.hypot(rTr.pt.x - rTl.pt.x, rTr.pt.y - rTl.pt.y),
      riserHeightPx: Math.hypot(rTl.pt.x - rBl.pt.x, rTl.pt.y - rBl.pt.y),
      treadDepthPx: Math.hypot(tTl.pt.x - rTl.pt.x, tTl.pt.y - rTl.pt.y),
      averageDepthCam: (rBl.depth + rBr.depth + tTl.depth + tTr.depth) * 0.25,
    });
  }

  let monotonicShrinking = true;
  let monotonicGrowing = true;
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i].frontWidthPx >= steps[i - 1].frontWidthPx - 1e-9) monotonicShrinking = false;
    if (steps[i].frontWidthPx <= steps[i - 1].frontWidthPx + 1e-9) monotonicGrowing = false;
  }

  let maxNosingCrErr = 0;
  for (let i = 0; i + 3 < leftNosingPoints.length; i += 1) {
    const refCr = computeCrossRatio1D(i, i + 1, i + 2, i + 3);
    const leftCr = computeCollinearCrossRatio2D(
      leftNosingPoints[i],
      leftNosingPoints[i + 1],
      leftNosingPoints[i + 2],
      leftNosingPoints[i + 3],
    );
    const rightCr = computeCollinearCrossRatio2D(
      rightNosingPoints[i],
      rightNosingPoints[i + 1],
      rightNosingPoints[i + 2],
      rightNosingPoints[i + 3],
    );
    const err = Math.max(Math.abs(leftCr - refCr), Math.abs(rightCr - refCr));
    if (err > maxNosingCrErr) maxNosingCrErr = err;
  }

  return {
    stepCount,
    directionAxis,
    steps,
    leftNosingPoints,
    rightNosingPoints,
    isForeshorteningMonotonic: steps.length <= 1 || monotonicShrinking || monotonicGrowing,
    maxVpConvergenceErrorDeg: maxVpErrDeg,
    maxNosingCrossRatioError: maxNosingCrErr,
  };
}

function getRayDirectionForVp(anchor: Vec2D, vp: VanishingPoint2D): Vec2D {
  if (!vp.isFinite) return vp.direction2d;
  const dx = vp.x - anchor.x;
  const dy = vp.y - anchor.y;
  const len = Math.hypot(dx, dy);
  return !Number.isFinite(len) || len < 1e-9 ? vp.direction2d : { x: dx / len, y: dy / len };
}

/**
 * 실시간 브러시 스트로크를 가장 가까운 3점 투시 소실점 광선(VP1·VP2·VP3)에
 * 스냅하는 투시 자(Perspective Ruler) 보정기.
 */
export function snapStrokeToPerspectiveRuler(
  points: readonly BrushStrokePoint[],
  rig: Pick<ThreePointPerspectiveRig, "vp1" | "vp2" | "vp3">,
  options: SnapStrokeToPerspectiveRulerOptions = {},
): SnappedPerspectiveStrokeResult {
  const snapStrength = clampFinitePerspective(options.snapStrength ?? 1, 0, 1, 1);
  const anchorMode = options.anchorMode ?? "first-point";
  const lockAxisOpt = options.lockAxis ?? "auto";
  const vps: readonly VanishingPoint2D[] = [rig.vp1, rig.vp2, rig.vp3];

  if (points.length === 0) {
    return {
      lockedAxis: lockAxisOpt === "auto" ? "VP1" : lockAxisOpt,
      vanishingPoint: rig.vp1,
      anchorPoint: { x: 0, y: 0 },
      rayDirection: rig.vp1.direction2d,
      snapStrength,
      snappedPoints: [],
      originalAngleDeviationDeg: 0,
      maxSnapAngleResidualDeg: 0,
      meanCorrectionDistancePx: 0,
      maxCorrectionDistancePx: 0,
    };
  }

  let anchorPoint: Vec2D;
  if (anchorMode === "midpoint") {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < points.length; i += 1) {
      sx += points[i].x;
      sy += points[i].y;
    }
    anchorPoint = { x: sx / points.length, y: sy / points.length };
  } else {
    anchorPoint = { x: points[0].x, y: points[0].y };
  }

  const first = points[0];
  const last = points[points.length - 1];
  let chordX = last.x - first.x;
  let chordY = last.y - first.y;
  let chordLen = Math.hypot(chordX, chordY);
  if (chordLen < 1e-6) {
    for (let i = 1; i < points.length; i += 1) {
      const dx = points[i].x - first.x;
      const dy = points[i].y - first.y;
      const d = Math.hypot(dx, dy);
      if (d > chordLen) {
        chordX = dx;
        chordY = dy;
        chordLen = d;
      }
    }
  }
  const strokeDir: Vec2D =
    chordLen > 1e-9 ? { x: chordX / chordLen, y: chordY / chordLen } : { x: 1, y: 0 };

  let chosenVp: VanishingPoint2D;
  let originalAngleDeviationDeg: number;
  if (lockAxisOpt !== "auto") {
    chosenVp = lockAxisOpt === "VP1" ? rig.vp1 : lockAxisOpt === "VP2" ? rig.vp2 : rig.vp3;
    const ray = getRayDirectionForVp(anchorPoint, chosenVp);
    originalAngleDeviationDeg =
      chordLen > 1e-9 ? angleBetweenUndirectedUnitVectorsDeg(strokeDir, ray) : 0;
  } else {
    let bestVp = rig.vp1;
    let bestAngle = Number.POSITIVE_INFINITY;
    for (let i = 0; i < vps.length; i += 1) {
      const ray = getRayDirectionForVp(anchorPoint, vps[i]);
      const angle = chordLen > 1e-9 ? angleBetweenUndirectedUnitVectorsDeg(strokeDir, ray) : 0;
      if (angle < bestAngle) {
        bestAngle = angle;
        bestVp = vps[i];
      }
    }
    chosenVp = bestVp;
    originalAngleDeviationDeg = Number.isFinite(bestAngle) ? bestAngle : 0;
  }

  const rayDir = getRayDirectionForVp(anchorPoint, chosenVp);
  const snappedPoints: BrushStrokePoint[] = [];
  let sumCorrection = 0;
  let maxCorrection = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const proj = (p.x - anchorPoint.x) * rayDir.x + (p.y - anchorPoint.y) * rayDir.y;
    const idealX = anchorPoint.x + proj * rayDir.x;
    const idealY = anchorPoint.y + proj * rayDir.y;
    const sx = p.x + (idealX - p.x) * snapStrength;
    const sy = p.y + (idealY - p.y) * snapStrength;
    const corr = Math.hypot(sx - p.x, sy - p.y);
    sumCorrection += corr;
    if (corr > maxCorrection) maxCorrection = corr;
    snappedPoints.push({
      x: sx,
      y: sy,
      ...(p.pressure !== undefined ? { pressure: p.pressure } : {}),
      ...(p.timestampMs !== undefined ? { timestampMs: p.timestampMs } : {}),
    });
  }

  let maxSnapAngleResidualDeg = 0;
  for (let i = 1; i < snappedPoints.length; i += 1) {
    const a = snappedPoints[i - 1];
    const b = snappedPoints[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
    const err = computeSegmentToVpAngleErrorDeg(
      { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
      chosenVp.homogeneous,
    );
    if (err > maxSnapAngleResidualDeg) maxSnapAngleResidualDeg = err;
  }

  return {
    lockedAxis: chosenVp.id,
    vanishingPoint: chosenVp,
    anchorPoint,
    rayDirection: rayDir,
    snapStrength,
    snappedPoints,
    originalAngleDeviationDeg,
    maxSnapAngleResidualDeg,
    meanCorrectionDistancePx: snappedPoints.length > 0 ? sumCorrection / snappedPoints.length : 0,
    maxCorrectionDistancePx: maxCorrection,
  };
}
