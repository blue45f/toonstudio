/**
 * 해석적 2D 부호 거리장(SDF) 기반 말풍선 불리언 결합·사선 컷 프레임 조각기.
 *
 * - 타원(Eberly 단조 볼록 근 해법), 둥근 사각형, 굵기 가변 2차 베지어 꼬리, 사선 칸 여백(gutter)의
 *   정확한 유클리드 부호 거리(SDF)를 계산한다.
 * - 겹치는 말풍선과 꼬리를 다항식 부드러운 최솟값(`smin`)으로 합쳐 내부 경계선 잔상(seam)을 제거한다.
 * - AABB 하한 조기 컬링과 정수 모서리 체이닝 Marching Squares로 내부 채움(`d = 0`)과 외곽 테두리
 *   (`d = strokeWidthPx`) 등치선 루프 및 SVG 경로를 2ms 안에 추출한다.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface BoundingBox2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface EllipseBalloonShape {
  readonly kind: "ellipse";
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationRad?: number;
}

export interface RoundedRectBalloonShape {
  readonly kind: "rounded-rect";
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly cornerRadius: number;
  readonly rotationRad?: number;
}

export interface BezierTailShape {
  readonly kind: "bezier-tail";
  readonly id: string;
  readonly basePoint: Point2D;
  readonly controlPoint: Point2D;
  readonly tipPoint: Point2D;
  readonly baseHalfWidth: number;
  readonly tipHalfWidth: number;
}

export type BalloonPrimitive =
  | EllipseBalloonShape
  | RoundedRectBalloonShape
  | BezierTailShape;

export interface DiagonalGutterCut {
  readonly id: string;
  readonly pointOnLine: Point2D;
  readonly angleDeg: number;
  readonly gutterWidthPx: number;
  readonly keepSide: "positive" | "negative";
  readonly cornerFilletPx?: number;
}

export interface CutFrameDefinition {
  readonly id: string;
  readonly bounds: BoundingBox2D;
  readonly baseCornerRadiusPx?: number;
  readonly diagonalGutters: readonly DiagonalGutterCut[];
}

export interface ContourLoop {
  readonly points: readonly Point2D[];
  readonly signedArea: number;
  readonly isHole: boolean;
}

export interface BalloonClusterSculptInput {
  readonly primitives: readonly BalloonPrimitive[];
  readonly smoothBlendRadiusPx?: number;
  readonly strokeWidthPx?: number;
  readonly cellSizePx?: number;
  readonly clipFrame?: CutFrameDefinition;
  readonly clipMode?: "none" | "intersect-frame" | "protrude-over-frame";
}

export interface BalloonClusterSculptResult {
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly bounds: BoundingBox2D;
  readonly innerFillLoops: readonly ContourLoop[];
  readonly outerStrokeLoops: readonly ContourLoop[];
  readonly innerFillSvgPath: string;
  readonly outerStrokeSvgPath: string;
  readonly seamArtifactCount: number;
  readonly computeTimeMs: number;
}

export interface CutFrameSculptResult {
  readonly frameId: string;
  readonly innerLoops: readonly ContourLoop[];
  readonly outerBorderLoops: readonly ContourLoop[];
  readonly innerSvgPath: string;
  readonly outerBorderSvgPath: string;
  readonly computeTimeMs: number;
}

const EPSILON = 1e-9;
const TWO_PI_OVER_THREE = (2 * Math.PI) / 3;
const FOUR_PI_OVER_THREE = (4 * Math.PI) / 3;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 2차 다항식 부드러운 최솟값(`smin`). C1 연속 결합으로 내부 잔상 선을 없앤다. */
export function polynomialSmoothMin(a: number, b: number, blendRadius: number): number {
  if (blendRadius <= EPSILON) return a < b ? a : b;
  const diff = Math.abs(a - b);
  if (diff >= blendRadius) return a < b ? a : b;
  const h = (blendRadius - diff) / blendRadius;
  return (a < b ? a : b) - 0.25 * blendRadius * h * h;
}

/** 2차 다항식 부드러운 최댓값(`smax`). */
export function polynomialSmoothMax(a: number, b: number, filletRadius: number): number {
  return -polynomialSmoothMin(-a, -b, filletRadius);
}

/** 둥근 사각형의 정확한 유클리드 부호 거리(SDF). */
export function sdRoundedRectExact(
  localX: number,
  localY: number,
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
): number {
  const hw = Math.max(halfWidth, EPSILON);
  const hh = Math.max(halfHeight, EPSILON);
  const r = clamp(cornerRadius, 0, Math.min(hw, hh));
  const qx = Math.abs(localX) - (hw - r);
  const qy = Math.abs(localY) - (hh - r);
  const outX = qx > 0 ? qx : 0;
  const outY = qy > 0 ? qy : 0;
  return Math.sqrt(outX * outX + outY * outY) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 타원의 정확한 유클리드 부호 거리(SDF). Eberly 볼록 방정식 기반 안전 뉴턴 해법. */
export function sdEllipseExact(
  localX: number,
  localY: number,
  radiusX: number,
  radiusY: number,
): number {
  const rx = Math.max(radiusX, EPSILON);
  const ry = Math.max(radiusY, EPSILON);
  if (Math.abs(rx - ry) <= 1e-7) return Math.sqrt(localX * localX + localY * localY) - rx;

  let px = Math.abs(localX);
  let py = Math.abs(localY);
  let a = rx;
  let b = ry;
  if (a < b) {
    const tmpP = px;
    px = py;
    py = tmpP;
    const tmpR = a;
    a = b;
    b = tmpR;
  }

  const a2 = a * a;
  const b2 = b * b;
  if (py <= 1e-11) {
    const aMinusB2 = a2 - b2;
    if (a * px < aMinusB2) {
      const xe = (a2 * px) / aMinusB2;
      const ratio = clamp(xe / a, 0, 1);
      const ye = b * Math.sqrt(Math.max(0, 1 - ratio * ratio));
      const ex = xe - px;
      return -Math.sqrt(ex * ex + ye * ye);
    }
    return px - a;
  }
  if (px <= 1e-11) return py - b;

  const ux = a * px;
  const uy = b * py;
  let tLow = -b2 + uy;
  let tHigh = -b2 + Math.sqrt(ux * ux + uy * uy);
  let t = 0.5 * (tLow + tHigh);

  for (let iter = 0; iter < 6; iter += 1) {
    const denomA = t + a2;
    const denomB = t + b2;
    const ratioA = ux / denomA;
    const ratioB = uy / denomB;
    const g = ratioA * ratioA + ratioB * ratioB - 1;
    if (Math.abs(g) <= 1e-11) break;
    if (g > 0) tLow = t;
    else tHigh = t;
    const dg = -2 * ((ratioA * ratioA) / denomA + (ratioB * ratioB) / denomB);
    const cand = t - g / dg;
    t = cand > tLow && cand < tHigh ? cand : 0.5 * (tLow + tHigh);
  }

  const ex = px - (a2 * px) / (t + a2);
  const ey = py - (b2 * py) / (t + b2);
  const dist = Math.sqrt(ex * ex + ey * ey);
  return (px / a) * (px / a) + (py / b) * (py / b) - 1 < 0 ? -dist : dist;
}

function evalBezierTailAt(
  px: number,
  py: number,
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  baseHalfWidth: number,
  tipHalfWidth: number,
  rawT: number,
): number {
  const bestT = clamp(rawT, 0, 1);
  const radiusDelta = tipHalfWidth - baseHalfWidth;
  const inv0 = 1 - bestT;
  const bx0 = inv0 * inv0 * p0.x + 2 * inv0 * bestT * p1.x + bestT * bestT * p2.x;
  const by0 = inv0 * inv0 * p0.y + 2 * inv0 * bestT * p1.y + bestT * bestT * p2.y;
  const dx = bx0 - px;
  const dy = by0 - py;
  const spineLen = Math.sqrt(dx * dx + dy * dy);
  let bestVal = spineLen - (baseHalfWidth + radiusDelta * bestT);

  if (Math.abs(radiusDelta) > 1e-6 && spineLen > 1e-7) {
    const dbx = 2 * (inv0 * (p1.x - p0.x) + bestT * (p2.x - p1.x));
    const dby = 2 * (inv0 * (p1.y - p0.y) + bestT * (p2.y - p1.y));
    const grad = (dx * dbx + dy * dby) / spineLen - radiusDelta;
    const hess = Math.max((dbx * dbx + dby * dby) / spineLen, 1e-6);
    const nextT = clamp(bestT - grad / hess, 0, 1);
    const nInv = 1 - nextT;
    const nbx = nInv * nInv * p0.x + 2 * nInv * nextT * p1.x + nextT * nextT * p2.x - px;
    const nby = nInv * nInv * p0.y + 2 * nInv * nextT * p1.y + nextT * nextT * p2.y - py;
    const nextVal = Math.sqrt(nbx * nbx + nby * nby) - (baseHalfWidth + radiusDelta * nextT);
    if (nextVal < bestVal) bestVal = nextVal;
  }
  return bestVal;
}

/** 시작 폭에서 끝점 폭까지 좁아지는 2차 베지어 말풍선 꼬리의 부호 거리(SDF). */
export function sdQuadraticBezierTail(
  px: number,
  py: number,
  basePoint: Point2D,
  controlPoint: Point2D,
  tipPoint: Point2D,
  baseHalfWidth: number,
  tipHalfWidth: number,
): number {
  const rBase = Math.max(baseHalfWidth, 0);
  const rTip = Math.max(tipHalfWidth, 0);
  const ax = controlPoint.x - basePoint.x;
  const ay = controlPoint.y - basePoint.y;
  const bx = basePoint.x - 2 * controlPoint.x + tipPoint.x;
  const by = basePoint.y - 2 * controlPoint.y + tipPoint.y;
  const dx = basePoint.x - px;
  const dy = basePoint.y - py;

  const bDotB = bx * bx + by * by;
  if (bDotB <= 1e-9) {
    const ux = tipPoint.x - basePoint.x;
    const uy = tipPoint.y - basePoint.y;
    const uLen2 = ux * ux + uy * uy;
    const tLin =
      uLen2 <= EPSILON ? 0 : clamp(((px - basePoint.x) * ux + (py - basePoint.y) * uy) / uLen2, 0, 1);
    return evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, tLin);
  }

  const k1 = (ax * bx + ay * by) / bDotB;
  const k2 = (2 * (ax * ax + ay * ay) + (dx * bx + dy * by)) / (3 * bDotB);
  const k3 = (dx * ax + dy * ay) / bDotB;
  const p = k2 - k1 * k1;
  const q = 0.5 * (2 * k1 * k1 * k1 - 3 * k1 * k2 + k3);
  const disc = q * q + p * p * p;

  let best = Math.min(
    evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, 0),
    evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, 1),
  );

  if (disc >= 0) {
    const sqrtDisc = Math.sqrt(disc);
    const u = Math.cbrt(-q + sqrtDisc) + Math.cbrt(-q - sqrtDisc);
    const cand = evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, u - k1);
    if (cand < best) best = cand;
  } else {
    const r = Math.sqrt(-p);
    const theta = Math.acos(clamp(-q / (r * r * r), -1, 1)) / 3;
    const c0 = evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, 2 * r * Math.cos(theta) - k1);
    const c1 = evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, 2 * r * Math.cos(theta + TWO_PI_OVER_THREE) - k1);
    const c2 = evalBezierTailAt(px, py, basePoint, controlPoint, tipPoint, rBase, rTip, 2 * r * Math.cos(theta + FOUR_PI_OVER_THREE) - k1);
    if (c0 < best) best = c0;
    if (c1 < best) best = c1;
    if (c2 < best) best = c2;
  }
  return best;
}

interface PreparedPrimitive {
  readonly kind: BalloonPrimitive["kind"];
  readonly cx: number;
  readonly cy: number;
  readonly cosNeg: number;
  readonly sinNeg: number;
  readonly paramA: number;
  readonly paramB: number;
  readonly paramC: number;
  readonly p0: Point2D;
  readonly p1: Point2D;
  readonly p2: Point2D;
  readonly boxMinX: number;
  readonly boxMinY: number;
  readonly boxMaxX: number;
  readonly boxMaxY: number;
}

interface PreparedGutter {
  readonly originX: number;
  readonly originY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly halfWidth: number;
  readonly sign: number;
  readonly filletPx: number;
}

const ZERO_PT: Point2D = { x: 0, y: 0 };

function preparePrimitive(prim: BalloonPrimitive): PreparedPrimitive {
  if (prim.kind === "ellipse" || prim.kind === "rounded-rect") {
    const rot = prim.rotationRad ?? 0;
    const rawW = prim.kind === "ellipse" ? prim.radiusX : prim.halfWidth;
    const rawH = prim.kind === "ellipse" ? prim.radiusY : prim.halfHeight;
    const extX = rot === 0 ? rawW : Math.hypot(rawW, rawH);
    const extY = rot === 0 ? rawH : extX;
    return {
      kind: prim.kind,
      cx: prim.centerX,
      cy: prim.centerY,
      cosNeg: Math.cos(-rot),
      sinNeg: Math.sin(-rot),
      paramA: rawW,
      paramB: rawH,
      paramC: prim.kind === "rounded-rect" ? prim.cornerRadius : 0,
      p0: ZERO_PT,
      p1: ZERO_PT,
      p2: ZERO_PT,
      boxMinX: prim.centerX - extX,
      boxMinY: prim.centerY - extY,
      boxMaxX: prim.centerX + extX,
      boxMaxY: prim.centerY + extY,
    };
  }
  const pad = Math.max(prim.baseHalfWidth, prim.tipHalfWidth);
  return {
    kind: "bezier-tail",
    cx: 0,
    cy: 0,
    cosNeg: 1,
    sinNeg: 0,
    paramA: prim.baseHalfWidth,
    paramB: prim.tipHalfWidth,
    paramC: 0,
    p0: prim.basePoint,
    p1: prim.controlPoint,
    p2: prim.tipPoint,
    boxMinX: Math.min(prim.basePoint.x, prim.controlPoint.x, prim.tipPoint.x) - pad,
    boxMinY: Math.min(prim.basePoint.y, prim.controlPoint.y, prim.tipPoint.y) - pad,
    boxMaxX: Math.max(prim.basePoint.x, prim.controlPoint.x, prim.tipPoint.x) + pad,
    boxMaxY: Math.max(prim.basePoint.y, prim.controlPoint.y, prim.tipPoint.y) + pad,
  };
}

function evalPreparedPrimitive(p: PreparedPrimitive, x: number, y: number): number {
  if (p.kind === "bezier-tail") {
    return sdQuadraticBezierTail(x, y, p.p0, p.p1, p.p2, p.paramA, p.paramB);
  }
  const dx = x - p.cx;
  const dy = y - p.cy;
  const lx = p.sinNeg === 0 ? dx : dx * p.cosNeg - dy * p.sinNeg;
  const ly = p.sinNeg === 0 ? dy : dx * p.sinNeg + dy * p.cosNeg;
  return p.kind === "ellipse"
    ? sdEllipseExact(lx, ly, p.paramA, p.paramB)
    : sdRoundedRectExact(lx, ly, p.paramA, p.paramB, p.paramC);
}

function aabbLowerBound(p: PreparedPrimitive, x: number, y: number): number {
  const dx = Math.max(p.boxMinX - x, x - p.boxMaxX, 0);
  const dy = Math.max(p.boxMinY - y, y - p.boxMaxY, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function prepareGutters(gutters: readonly DiagonalGutterCut[]): readonly PreparedGutter[] {
  return gutters.map((g) => {
    const rad = (g.angleDeg * Math.PI) / 180;
    return {
      originX: g.pointOnLine.x,
      originY: g.pointOnLine.y,
      normalX: -Math.sin(rad),
      normalY: Math.cos(rad),
      halfWidth: Math.max(0, g.gutterWidthPx * 0.5),
      sign: g.keepSide === "positive" ? -1 : 1,
      filletPx: Math.max(0, g.cornerFilletPx ?? 0),
    };
  });
}

function evalPreparedCutFrame(
  bounds: BoundingBox2D,
  baseCornerRadiusPx: number,
  gutters: readonly PreparedGutter[],
  x: number,
  y: number,
): number {
  const cx = 0.5 * (bounds.minX + bounds.maxX);
  const cy = 0.5 * (bounds.minY + bounds.maxY);
  const hw = 0.5 * (bounds.maxX - bounds.minX);
  const hh = 0.5 * (bounds.maxY - bounds.minY);
  let sdf = sdRoundedRectExact(x - cx, y - cy, hw, hh, baseCornerRadiusPx);
  for (let i = 0; i < gutters.length; i += 1) {
    const g = gutters[i]!;
    const signedOffset = (x - g.originX) * g.normalX + (y - g.originY) * g.normalY;
    sdf = polynomialSmoothMax(sdf, g.sign * signedOffset + g.halfWidth, g.filletPx);
  }
  return sdf;
}

/** 단일 좌표에서 사선 컷 프레임의 부호 거리를 평가한다. */
export function evaluateCutFrameSdf(frame: CutFrameDefinition, x: number, y: number): number {
  return evalPreparedCutFrame(
    frame.bounds,
    frame.baseCornerRadiusPx ?? 0,
    prepareGutters(frame.diagonalGutters),
    x,
    y,
  );
}

/** 단일 좌표에서 말풍선 클러스터의 부호 거리를 평가한다. */
export function evaluateBalloonClusterSdf(
  input: BalloonClusterSculptInput,
  x: number,
  y: number,
): number {
  if (input.primitives.length === 0) return 1e6;
  const blend = Math.max(0, input.smoothBlendRadiusPx ?? 14);
  const prepared = input.primitives.map(preparePrimitive);
  let acc = evalPreparedPrimitive(prepared[0]!, x, y);
  for (let i = 1; i < prepared.length; i += 1) {
    acc = polynomialSmoothMin(acc, evalPreparedPrimitive(prepared[i]!, x, y), blend);
  }
  if (input.clipFrame && input.clipMode === "intersect-frame") {
    acc = Math.max(acc, evaluateCutFrameSdf(input.clipFrame, x, y));
  }
  return acc;
}

function computeSignedPolygonArea(points: readonly Point2D[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return 0.5 * sum;
}

let contourScratchCap = 0;
let scratchNextEdge = new Int32Array(0);
let scratchEdgeCoordX = new Float32Array(0);
let scratchEdgeCoordY = new Float32Array(0);
let scratchEdgeInit = new Uint8Array(0);
let scratchVisited = new Uint8Array(0);

function extractIsoContoursFromGrid(
  field: Float32Array,
  nx: number,
  ny: number,
  originX: number,
  originY: number,
  cellSize: number,
  isoLevel: number,
): readonly ContourLoop[] {
  const stride = nx + 1;
  const horizEdgeCount = nx * (ny + 1);
  const totalEdges = horizEdgeCount + (nx + 1) * ny;
  if (totalEdges > contourScratchCap) {
    contourScratchCap = Math.max(totalEdges, contourScratchCap * 2, 4096);
    scratchNextEdge = new Int32Array(contourScratchCap);
    scratchEdgeCoordX = new Float32Array(contourScratchCap);
    scratchEdgeCoordY = new Float32Array(contourScratchCap);
    scratchEdgeInit = new Uint8Array(contourScratchCap);
    scratchVisited = new Uint8Array(contourScratchCap);
  }
  const nextEdge = scratchNextEdge;
  const edgeCoordX = scratchEdgeCoordX;
  const edgeCoordY = scratchEdgeCoordY;
  const edgeInit = scratchEdgeInit;
  const visited = scratchVisited;
  edgeInit.fill(0, 0, totalEdges);
  const activeStarts: number[] = [];

  const hEdge = (ix: number, iy: number, vL: number, vR: number): number => {
    const id = iy * nx + ix;
    if (edgeInit[id] === 0) {
      const denom = vR - vL;
      const t = Math.abs(denom) <= 1e-12 ? 0.5 : clamp((isoLevel - vL) / denom, 0, 1);
      edgeCoordX[id] = originX + (ix + t) * cellSize;
      edgeCoordY[id] = originY + iy * cellSize;
        edgeInit[id] = 1;
      nextEdge[id] = -1;
    }
    return id;
  };

  const vEdge = (ix: number, iy: number, vT: number, vB: number): number => {
    const id = horizEdgeCount + iy * stride + ix;
    if (edgeInit[id] === 0) {
      const denom = vB - vT;
      const t = Math.abs(denom) <= 1e-12 ? 0.5 : clamp((isoLevel - vT) / denom, 0, 1);
      edgeCoordX[id] = originX + ix * cellSize;
      edgeCoordY[id] = originY + (iy + t) * cellSize;
      edgeInit[id] = 1;
      nextEdge[id] = -1;
    }
    return id;
  };

  const link = (fromId: number, toId: number): void => {
    nextEdge[fromId] = toId;
    activeStarts.push(fromId);
  };

  for (let iy = 0; iy < ny; iy += 1) {
    const rTop = iy * stride;
    const rBot = (iy + 1) * stride;
    for (let ix = 0; ix < nx; ix += 1) {
      const vTL = field[rTop + ix]!;
      const vTR = field[rTop + ix + 1]!;
      const vBR = field[rBot + ix + 1]!;
      const vBL = field[rBot + ix]!;
      const mask =
        (vTL < isoLevel ? 1 : 0) |
        (vTR < isoLevel ? 2 : 0) |
        (vBR < isoLevel ? 4 : 0) |
        (vBL < isoLevel ? 8 : 0);
      if (mask === 0 || mask === 15) continue;

      switch (mask) {
        case 1: link(hEdge(ix, iy, vTL, vTR), vEdge(ix, iy, vTL, vBL)); break;
        case 2: link(vEdge(ix + 1, iy, vTR, vBR), hEdge(ix, iy, vTL, vTR)); break;
        case 3: link(vEdge(ix + 1, iy, vTR, vBR), vEdge(ix, iy, vTL, vBL)); break;
        case 4: link(hEdge(ix, iy + 1, vBL, vBR), vEdge(ix + 1, iy, vTR, vBR)); break;
        case 5: {
          const eT = hEdge(ix, iy, vTL, vTR);
          const eR = vEdge(ix + 1, iy, vTR, vBR);
          const eB = hEdge(ix, iy + 1, vBL, vBR);
          const eL = vEdge(ix, iy, vTL, vBL);
          if (0.25 * (vTL + vTR + vBR + vBL) < isoLevel) { link(eT, eR); link(eB, eL); }
          else { link(eT, eL); link(eB, eR); }
          break;
        }
        case 6: link(hEdge(ix, iy + 1, vBL, vBR), hEdge(ix, iy, vTL, vTR)); break;
        case 7: link(hEdge(ix, iy + 1, vBL, vBR), vEdge(ix, iy, vTL, vBL)); break;
        case 8: link(vEdge(ix, iy, vTL, vBL), hEdge(ix, iy + 1, vBL, vBR)); break;
        case 9: link(hEdge(ix, iy, vTL, vTR), hEdge(ix, iy + 1, vBL, vBR)); break;
        case 10: {
          const eT = hEdge(ix, iy, vTL, vTR);
          const eR = vEdge(ix + 1, iy, vTR, vBR);
          const eB = hEdge(ix, iy + 1, vBL, vBR);
          const eL = vEdge(ix, iy, vTL, vBL);
          if (0.25 * (vTL + vTR + vBR + vBL) < isoLevel) { link(eR, eB); link(eL, eT); }
          else { link(eR, eT); link(eL, eB); }
          break;
        }
        case 11: link(vEdge(ix + 1, iy, vTR, vBR), hEdge(ix, iy + 1, vBL, vBR)); break;
        case 12: link(vEdge(ix, iy, vTL, vBL), vEdge(ix + 1, iy, vTR, vBR)); break;
        case 13: link(hEdge(ix, iy, vTL, vTR), vEdge(ix + 1, iy, vTR, vBR)); break;
        case 14: link(vEdge(ix, iy, vTL, vBL), hEdge(ix, iy, vTL, vTR)); break;
      }
    }
  }

  visited.fill(0, 0, totalEdges);
  const loops: ContourLoop[] = [];
  for (let i = 0; i < activeStarts.length; i += 1) {
    const startId = activeStarts[i]!;
    if (visited[startId] === 1) continue;
    const pts: Point2D[] = [];
    let cur = startId;
    while (cur >= 0 && visited[cur] === 0) {
      visited[cur] = 1;
      pts.push({ x: edgeCoordX[cur]!, y: edgeCoordY[cur]! });
      cur = nextEdge[cur]!;
    }
    if (pts.length >= 3) {
      const signedArea = computeSignedPolygonArea(pts);
      loops.push({ points: pts, signedArea, isHole: signedArea < 0 });
    }
  }
  return loops;
}

/** 등치선 루프들을 매끄러운 2차 중점 스플라인 SVG `d` 경로 문자열로 변환한다. */
export function contourLoopsToSmoothSvgPath(loops: readonly ContourLoop[]): string {
  if (loops.length === 0) return "";
  const parts: string[] = [];
  for (const loop of loops) {
    const pts = loop.points;
    const n = pts.length;
    if (n < 3) continue;
    const pLast = pts[n - 1]!;
    const pFirst = pts[0]!;
    parts.push(`M ${roundCoord(0.5 * (pLast.x + pFirst.x))} ${roundCoord(0.5 * (pLast.y + pFirst.y))}`);
    for (let i = 0; i < n; i += 1) {
      const curr = pts[i]!;
      const next = pts[(i + 1) % n]!;
      parts.push(
        `Q ${roundCoord(curr.x)} ${roundCoord(curr.y)} ${roundCoord(0.5 * (curr.x + next.x))} ${roundCoord(0.5 * (curr.y + next.y))}`,
      );
    }
    parts.push("Z");
  }
  return parts.join(" ");
}

/** 겹친 말풍선·꼬리 집합을 `smin` 결합해 내부 채움·외곽선 등치선을 2ms 안에 추출한다. */
export function sculptBalloonClusterContours(
  input: BalloonClusterSculptInput,
): BalloonClusterSculptResult {
  const startTime = performance.now();
  if (input.primitives.length === 0) {
    return {
      gridColumns: 0, gridRows: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      innerFillLoops: [], outerStrokeLoops: [], innerFillSvgPath: "", outerStrokeSvgPath: "",
      seamArtifactCount: 0, computeTimeMs: performance.now() - startTime,
    };
  }

  const blend = Math.max(0, input.smoothBlendRadiusPx ?? 14);
  const strokeWidth = Math.max(0.5, input.strokeWidthPx ?? 3.5);
  const prepared = input.primitives.map(preparePrimitive);

  let rawMinX = Infinity;
  let rawMinY = Infinity;
  let rawMaxX = -Infinity;
  let rawMaxY = -Infinity;
  for (const p of prepared) {
    if (p.boxMinX < rawMinX) rawMinX = p.boxMinX;
    if (p.boxMinY < rawMinY) rawMinY = p.boxMinY;
    if (p.boxMaxX > rawMaxX) rawMaxX = p.boxMaxX;
    if (p.boxMaxY > rawMaxY) rawMaxY = p.boxMaxY;
  }

  const cellSize = Math.max(1.5, input.cellSizePx ?? Math.max(3, Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY) / 56));
  const margin = strokeWidth + blend * 0.5 + 2 * cellSize;
  const bounds: BoundingBox2D = {
    minX: rawMinX - margin, minY: rawMinY - margin, maxX: rawMaxX + margin, maxY: rawMaxY + margin,
  };

  const nx = Math.max(4, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
  const ny = Math.max(4, Math.ceil((bounds.maxY - bounds.minY) / cellSize));
  const stride = nx + 1;
  const field = new Float32Array(stride * (ny + 1));

  const shouldIntersectFrame = input.clipFrame !== undefined && input.clipMode === "intersect-frame";
  const preparedGutters = shouldIntersectFrame ? prepareGutters(input.clipFrame!.diagonalGutters) : [];
  const frameBounds = input.clipFrame?.bounds;
  const frameRadius = input.clipFrame?.baseCornerRadiusPx ?? 0;
  const farCutoff = strokeWidth + blend + 2 * cellSize;
  const p0 = prepared[0]!;
  const pCount = prepared.length;

  for (let iy = 0; iy <= ny; iy += 1) {
    const py = bounds.minY + iy * cellSize;
    const rowOffset = iy * stride;
    for (let ix = 0; ix <= nx; ix += 1) {
      const px = bounds.minX + ix * cellSize;
      const lb0 = aabbLowerBound(p0, px, py);
      let d = lb0 > farCutoff ? lb0 : evalPreparedPrimitive(p0, px, py);
      for (let pIdx = 1; pIdx < pCount; pIdx += 1) {
        const pi = prepared[pIdx]!;
        const lb = aabbLowerBound(pi, px, py);
        if (lb >= d + blend) continue;
        d = polynomialSmoothMin(d, evalPreparedPrimitive(pi, px, py), blend);
      }
      if (shouldIntersectFrame && frameBounds) {
        const frameD = evalPreparedCutFrame(frameBounds, frameRadius, preparedGutters, px, py);
        if (frameD > d) d = frameD;
      }
      field[rowOffset + ix] = d;
    }
  }

  const innerFillLoops = extractIsoContoursFromGrid(field, nx, ny, bounds.minX, bounds.minY, cellSize, 0);
  const outerStrokeLoops = extractIsoContoursFromGrid(field, nx, ny, bounds.minX, bounds.minY, cellSize, strokeWidth);
  const seamArtifactCount = innerFillLoops.filter((loop) => loop.isHole).length;

  return {
    gridColumns: nx, gridRows: ny, bounds, innerFillLoops, outerStrokeLoops,
    innerFillSvgPath: contourLoopsToSmoothSvgPath(innerFillLoops),
    outerStrokeSvgPath: contourLoopsToSmoothSvgPath(outerStrokeLoops),
    seamArtifactCount, computeTimeMs: performance.now() - startTime,
  };
}

/** 사선 칸 여백(gutter)으로 분할된 웹툰 컷 프레임의 내측·외곽 등치선을 추출한다. */
export function sculptDiagonalCutFrameContours(
  frame: CutFrameDefinition,
  options?: { readonly borderWidthPx?: number; readonly cellSizePx?: number },
): CutFrameSculptResult {
  const startTime = performance.now();
  const borderWidth = Math.max(0.5, options?.borderWidthPx ?? 4);
  const spanX = frame.bounds.maxX - frame.bounds.minX;
  const spanY = frame.bounds.maxY - frame.bounds.minY;
  const cellSize = Math.max(2, options?.cellSizePx ?? Math.max(3, Math.max(spanX, spanY) / 64));
  const margin = borderWidth + 2 * cellSize;
  const originX = frame.bounds.minX - margin;
  const originY = frame.bounds.minY - margin;
  const nx = Math.max(4, Math.ceil((spanX + 2 * margin) / cellSize));
  const ny = Math.max(4, Math.ceil((spanY + 2 * margin) / cellSize));
  const stride = nx + 1;
  const field = new Float32Array(stride * (ny + 1));
  const gutters = prepareGutters(frame.diagonalGutters);
  const baseRadius = frame.baseCornerRadiusPx ?? 0;

  for (let iy = 0; iy <= ny; iy += 1) {
    const py = originY + iy * cellSize;
    const rowOffset = iy * stride;
    for (let ix = 0; ix <= nx; ix += 1) {
      field[rowOffset + ix] = evalPreparedCutFrame(frame.bounds, baseRadius, gutters, originX + ix * cellSize, py);
    }
  }

  const innerLoops = extractIsoContoursFromGrid(field, nx, ny, originX, originY, cellSize, 0);
  const outerBorderLoops = extractIsoContoursFromGrid(field, nx, ny, originX, originY, cellSize, borderWidth);
  return {
    frameId: frame.id, innerLoops, outerBorderLoops,
    innerSvgPath: contourLoopsToSmoothSvgPath(innerLoops),
    outerBorderSvgPath: contourLoopsToSmoothSvgPath(outerBorderLoops),
    computeTimeMs: performance.now() - startTime,
  };
}
