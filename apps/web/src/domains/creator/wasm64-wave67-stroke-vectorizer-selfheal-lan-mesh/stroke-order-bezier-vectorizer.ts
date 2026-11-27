/**
 * Wave 67: 래스터 선화 획 순서 복원 벡터화 엔진.
 *
 * Zhang-Suen 세선화 -> 정밀 유클리드 거리 변환(EDT) 기반 필압 반경 추정 ->
 * 교차점 슈퍼노드 축약 및 접선 연속성(Tangent Continuity) 페어링 ->
 * 인간 필기 순서 정렬 및 Philip Schneider 3차 베지에 피팅을 통합 제공한다.
 */

import {
  clampNumber,
  computeEuclideanDistanceTransform,
  evaluateCubicBezier,
  fitCubicBezierSchneider,
  vecDot,
  vecNormalize,
  zhangSuenThinning,
  type CubicBezierSegment,
  type Vec2,
} from "./stroke-vectorizer-geometry";

export {
  computeEuclideanDistanceTransform,
  evaluateCubicBezier,
  fitCubicBezierSchneider,
  zhangSuenThinning,
  type CubicBezierSegment,
  type Vec2,
};

export interface RasterLineartMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Float32Array;
  readonly isNormalized?: boolean;
}

export type StrokeReadingDirection = "top-left-to-bottom-right" | "top-right-to-bottom-left";

export interface StrokeVectorizerOptions {
  readonly threshold?: number;
  readonly minStrokeLengthPx?: number;
  readonly spurPruneLengthPx?: number;
  readonly maxBezierErrorPx?: number;
  readonly junctionTangentWindow?: number;
  readonly junctionContinuationMinCos?: number;
  readonly readingDirection?: StrokeReadingDirection;
  readonly referenceMaxRadiusPx?: number;
}

export interface CenterlineSample {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly pressure: number;
  readonly arcLengthPx: number;
}

export interface VectorizedStroke {
  readonly strokeOrder: number;
  readonly strokeId: string;
  readonly isClosed: boolean;
  readonly totalLengthPx: number;
  readonly meanRadiusPx: number;
  readonly minRadiusPx: number;
  readonly maxRadiusPx: number;
  readonly startPoint: Vec2;
  readonly endPoint: Vec2;
  readonly samples: readonly CenterlineSample[];
  readonly segments: readonly CubicBezierSegment[];
  readonly maxFitErrorPx: number;
  readonly passedThroughJunctions: number;
}

export interface VectorizationResult {
  readonly width: number;
  readonly height: number;
  readonly foregroundPixelCount: number;
  readonly skeletonPixelCount: number;
  readonly junctionCount: number;
  readonly strokes: readonly VectorizedStroke[];
  readonly totalBezierSegments: number;
  readonly meanFitErrorPx: number;
  readonly maxFitErrorPx: number;
  readonly distanceTransform: Float32Array;
  readonly skeletonMask: Uint8Array;
}

interface InternalPoint {
  x: number;
  y: number;
  radiusPx: number;
  nearJunction: boolean;
}

interface RawBranch {
  readonly id: number;
  readonly startNode: number;
  readonly endNode: number;
  readonly pixels: readonly number[];
  readonly lengthPx: number;
}

interface SuperBranch {
  readonly id: number;
  readonly startSuper: number;
  readonly endSuper: number;
  readonly pixels: readonly number[];
  readonly lengthPx: number;
}

function binarizeMask(mask: RasterLineartMask, threshold?: number): { binary: Uint8Array; count: number } {
  const total = mask.width * mask.height;
  const binary = new Uint8Array(total);
  if (total === 0 || mask.data.length === 0) return { binary, count: 0 };

  let resolvedThreshold = threshold;
  if (resolvedThreshold === undefined) {
    if (mask.isNormalized || mask.data instanceof Float32Array) {
      resolvedThreshold = 0.5;
    } else {
      let maxVal = 0;
      for (let i = 0; i < Math.min(total, mask.data.length); i += 1) {
        if (mask.data[i] > maxVal) maxVal = mask.data[i];
      }
      resolvedThreshold = maxVal <= 1 ? 0.5 : 128;
    }
  }

  let count = 0;
  const limit = Math.min(total, mask.data.length);
  for (let i = 0; i < limit; i += 1) {
    if (mask.data[i] >= resolvedThreshold) {
      binary[i] = 1;
      count += 1;
    }
  }
  return { binary, count };
}

function buildSkeletonAdjacency(skeleton: Uint8Array, width: number, height: number): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  const get = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && skeleton[y * width + x] !== 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      if (skeleton[id] === 0) continue;
      const list: number[] = [];
      const n = get(x, y - 1);
      const e = get(x + 1, y);
      const s = get(x, y + 1);
      const w = get(x - 1, y);
      if (n) list.push(id - width);
      if (e) list.push(id + 1);
      if (s) list.push(id + width);
      if (w) list.push(id - 1);
      if (!n && !e && get(x + 1, y - 1)) list.push(id - width + 1);
      if (!e && !s && get(x + 1, y + 1)) list.push(id + width + 1);
      if (!s && !w && get(x - 1, y + 1)) list.push(id + width - 1);
      if (!w && !n && get(x - 1, y - 1)) list.push(id - width - 1);
      adj.set(id, list);
    }
  }
  return adj;
}

function pixelArcLength(pixels: readonly number[], width: number): number {
  let len = 0;
  for (let i = 1; i < pixels.length; i += 1) {
    const dx = (pixels[i] % width) - (pixels[i - 1] % width);
    const dy = Math.floor(pixels[i] / width) - Math.floor(pixels[i - 1] / width);
    len += Math.hypot(dx, dy);
  }
  return len;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function extractBranchesAndLoops(
  adj: Map<number, number[]>,
  width: number,
): { branches: RawBranch[]; closedLoops: number[][] } {
  const visitedEdges = new Set<string>();
  const branches: RawBranch[] = [];
  const closedLoops: number[][] = [];
  let nextBranchId = 0;

  for (const [start, nbrs] of adj.entries()) {
    if (nbrs.length === 2) continue;
    for (const next of nbrs) {
      const ek = edgeKey(start, next);
      if (visitedEdges.has(ek)) continue;
      visitedEdges.add(ek);

      const pixels: number[] = [start, next];
      let prev = start;
      let curr = next;
      while (true) {
        const currNbrs = adj.get(curr) ?? [];
        if (currNbrs.length !== 2) break;
        const step = currNbrs[0] === prev ? currNbrs[1] : currNbrs[0];
        const stepKey = edgeKey(curr, step);
        if (visitedEdges.has(stepKey)) break;
        visitedEdges.add(stepKey);
        pixels.push(step);
        prev = curr;
        curr = step;
      }
      branches.push({
        id: nextBranchId,
        startNode: start,
        endNode: curr,
        pixels,
        lengthPx: pixelArcLength(pixels, width),
      });
      nextBranchId += 1;
    }
  }

  for (const [node, nbrs] of adj.entries()) {
    if (nbrs.length !== 2) continue;
    const ek = edgeKey(node, nbrs[0]);
    if (visitedEdges.has(ek)) continue;
    const loop: number[] = [node];
    let prev = node;
    let curr = nbrs[0];
    visitedEdges.add(ek);
    while (curr !== node) {
      loop.push(curr);
      const currNbrs = adj.get(curr) ?? [];
      const next = currNbrs[0] === prev ? currNbrs[1] : currNbrs[0];
      if (next === undefined) break;
      const stepKey = edgeKey(curr, next);
      if (visitedEdges.has(stepKey)) {
        if (next === node) loop.push(node);
        break;
      }
      visitedEdges.add(stepKey);
      prev = curr;
      curr = next;
    }
    if (loop.length >= 4) {
      if (loop[loop.length - 1] !== loop[0]) loop.push(loop[0]);
      closedLoops.push(loop);
    }
  }
  return { branches, closedLoops };
}

function pruneSpurs(
  adj: Map<number, number[]>,
  edt: Float32Array,
  width: number,
  spurPruneLengthPx: number,
): void {
  let pruned = true;
  while (pruned) {
    pruned = false;
    const { branches } = extractBranchesAndLoops(adj, width);
    const branchDeg = new Map<number, number>();
    for (const [node, nbrs] of adj.entries()) {
      if (nbrs.length >= 3) branchDeg.set(node, nbrs.length);
    }
    for (const branch of branches) {
      const startDeg = (adj.get(branch.startNode) ?? []).length;
      const endDeg = (adj.get(branch.endNode) ?? []).length;
      const startIsLeaf = startDeg === 1 && endDeg >= 3;
      const endIsLeaf = endDeg === 1 && startDeg >= 3;
      if (!startIsLeaf && !endIsLeaf) continue;

      const jNode = startIsLeaf ? branch.endNode : branch.startNode;
      if ((branchDeg.get(jNode) ?? 0) <= 2) continue;
      const threshold = Math.max(spurPruneLengthPx, Math.max(0.5, edt[jNode] - 0.5) * 1.35);
      if (branch.lengthPx > threshold) continue;

      const jIdx = startIsLeaf ? branch.pixels.length - 1 : 0;
      const adjAtJ = startIsLeaf ? branch.pixels[branch.pixels.length - 2] : branch.pixels[1];
      for (let i = 0; i < branch.pixels.length; i += 1) {
        if (i !== jIdx) adj.delete(branch.pixels[i]);
      }
      const jNbrs = adj.get(jNode);
      if (jNbrs) {
        const filtered = jNbrs.filter((n) => n !== adjAtJ);
        adj.set(jNode, filtered);
        branchDeg.set(jNode, filtered.length);
      }
      pruned = true;
    }
  }
}

function estimateOutgoingTangent(
  pixels: readonly number[],
  fromStart: boolean,
  width: number,
  skipCount: number,
  windowSize: number,
): Vec2 {
  const n = pixels.length;
  if (n < 2) return { x: 1, y: 0 };
  const getPt = (idx: number): Vec2 => {
    const p = fromStart ? pixels[idx] : pixels[n - 1 - idx];
    return { x: p % width, y: Math.floor(p / width) };
  };
  const anchorIdx = Math.min(skipCount, Math.max(0, Math.floor((n - 2) * 0.4)));
  const anchor = getPt(anchorIdx);
  const farEnd = Math.min(n - 1, anchorIdx + Math.max(2, windowSize));
  let sumX = 0;
  let sumY = 0;
  for (let i = anchorIdx + 1; i <= farEnd; i += 1) {
    const pt = getPt(i);
    const weight = i - anchorIdx;
    sumX += (pt.x - anchor.x) * weight;
    sumY += (pt.y - anchor.y) * weight;
  }
  if (Math.hypot(sumX, sumY) <= 1e-6) {
    const p0 = getPt(0);
    const p1 = getPt(Math.min(n - 1, Math.max(1, farEnd)));
    return vecNormalize(p1.x - p0.x, p1.y - p0.y);
  }
  return vecNormalize(sumX, sumY);
}

function estimateBranchRadius(pixels: readonly number[], edt: Float32Array): number {
  if (pixels.length === 0) return 0.5;
  const start = Math.floor(pixels.length * 0.2);
  const end = Math.max(start + 1, Math.ceil(pixels.length * 0.8));
  const values: number[] = [];
  for (let i = start; i < end; i += 1) values.push(Math.max(0.5, edt[pixels[i]] - 0.5));
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0.5;
}

function decomposeSkeletonByTangentContinuity(
  adj: Map<number, number[]>,
  edt: Float32Array,
  width: number,
  tangentWindow: number,
  minContinuationCos: number,
): { strokes: InternalPoint[][]; closedLoops: InternalPoint[][]; junctionCount: number } {
  const { branches, closedLoops: rawLoops } = extractBranchesAndLoops(adj, width);
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let curr = x;
    while (parent.has(curr) && parent.get(curr) !== curr) curr = parent.get(curr) ?? curr;
    parent.set(x, curr);
    return curr;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const isBranchNode = (node: number): boolean => (adj.get(node) ?? []).length >= 3;
  for (const b of branches) {
    if (!isBranchNode(b.startNode) || !isBranchNode(b.endNode)) continue;
    const rMax = Math.max(Math.max(0.5, edt[b.startNode] - 0.5), Math.max(0.5, edt[b.endNode] - 0.5));
    if (b.lengthPx <= Math.max(5, rMax * 2.5)) union(b.startNode, b.endNode);
  }

  const superMembers = new Map<number, number[]>();
  const addMember = (node: number): void => {
    const root = find(node);
    const list = superMembers.get(root) ?? [];
    if (!list.includes(node)) list.push(node);
    superMembers.set(root, list);
  };
  for (const b of branches) {
    addMember(b.startNode);
    addMember(b.endNode);
  }

  const superCentroid = new Map<number, Vec2>();
  const superRadius = new Map<number, number>();
  const superIsJunction = new Map<number, boolean>();
  for (const [root, members] of superMembers.entries()) {
    let sx = 0;
    let sy = 0;
    let maxR = 0.5;
    let hasJunction = false;
    for (const m of members) {
      sx += m % width;
      sy += Math.floor(m / width);
      maxR = Math.max(maxR, Math.max(0.5, edt[m] - 0.5));
      if (isBranchNode(m)) hasJunction = true;
    }
    superCentroid.set(root, { x: sx / members.length, y: sy / members.length });
    superRadius.set(root, maxR);
    superIsJunction.set(root, hasJunction);
  }

  const superBranches: SuperBranch[] = [];
  const incidentMap = new Map<number, { branchId: number; atStart: boolean }[]>();
  const closedLoops: InternalPoint[][] = rawLoops.map((loop) =>
    loop.map((p) => ({
      x: p % width,
      y: Math.floor(p / width),
      radiusPx: Math.max(0.5, edt[p] - 0.5),
      nearJunction: false,
    })),
  );

  for (const b of branches) {
    const sRoot = find(b.startNode);
    const eRoot = find(b.endNode);
    if (sRoot === eRoot) {
      if (b.lengthPx > Math.max(6, (superRadius.get(sRoot) ?? 1) * 3)) {
        closedLoops.push(
          b.pixels.map((p) => ({
            x: p % width,
            y: Math.floor(p / width),
            radiusPx: Math.max(0.5, edt[p] - 0.5),
            nearJunction: false,
          })),
        );
      }
      continue;
    }
    const sbId = superBranches.length;
    superBranches.push({ id: sbId, startSuper: sRoot, endSuper: eRoot, pixels: b.pixels, lengthPx: b.lengthPx });
    const listS = incidentMap.get(sRoot) ?? [];
    listS.push({ branchId: sbId, atStart: true });
    incidentMap.set(sRoot, listS);
    const listE = incidentMap.get(eRoot) ?? [];
    listE.push({ branchId: sbId, atStart: false });
    incidentMap.set(eRoot, listE);
  }

  const portPair = new Map<string, { branchId: number; atStart: boolean; junctionRoot: number }>();
  let junctionCount = 0;
  for (const [root, incidents] of incidentMap.entries()) {
    if (incidents.length < 3 && !superIsJunction.get(root)) continue;
    if (incidents.length >= 3) junctionCount += 1;
    if (incidents.length < 2) continue;

    const skip = Math.max(1, Math.round((superRadius.get(root) ?? 1) * 0.75));
    const tangents = incidents.map((inc) =>
      estimateOutgoingTangent(superBranches[inc.branchId].pixels, inc.atStart, width, skip, tangentWindow),
    );
    const radii = incidents.map((inc) => estimateBranchRadius(superBranches[inc.branchId].pixels, edt));
    const candidates: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < incidents.length; i += 1) {
      for (let j = i + 1; j < incidents.length; j += 1) {
        const alignment = -vecDot(tangents[i], tangents[j]);
        if (alignment < minContinuationCos) continue;
        const rPenalty = (0.12 * Math.abs(radii[i] - radii[j])) / Math.max(radii[i], radii[j], 0.5);
        candidates.push({ i, j, score: alignment - rPenalty });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const used = new Set<number>();
    for (const c of candidates) {
      if (used.has(c.i) || used.has(c.j)) continue;
      used.add(c.i);
      used.add(c.j);
      const a = incidents[c.i];
      const b = incidents[c.j];
      portPair.set(`${a.branchId}:${a.atStart ? 0 : 1}`, { branchId: b.branchId, atStart: b.atStart, junctionRoot: root });
      portPair.set(`${b.branchId}:${b.atStart ? 0 : 1}`, { branchId: a.branchId, atStart: a.atStart, junctionRoot: root });
    }
  }

  const visitedBranches = new Set<number>();
  const strokes: InternalPoint[][] = [];
  const traceChain = (startBranchId: number, enterAtStart: boolean): InternalPoint[] => {
    const pts: InternalPoint[] = [];
    let currId = startBranchId;
    let forward = enterAtStart;
    while (!visitedBranches.has(currId)) {
      visitedBranches.add(currId);
      const branch = superBranches[currId];
      const sR = superRadius.get(branch.startSuper) ?? 1;
      const eR = superRadius.get(branch.endSuper) ?? 1;
      const sJ = superIsJunction.get(branch.startSuper) === true;
      const eJ = superIsJunction.get(branch.endSuper) === true;
      const sPos = superCentroid.get(branch.startSuper);
      const ePos = superCentroid.get(branch.endSuper);
      const n = branch.pixels.length;
      for (let k = pts.length > 0 ? 1 : 0; k < n; k += 1) {
        const p = forward ? branch.pixels[k] : branch.pixels[n - 1 - k];
        const x = p % width;
        const y = Math.floor(p / width);
        const nearS = sJ && sPos !== undefined && Math.hypot(x - sPos.x, y - sPos.y) <= sR * 1.65;
        const nearE = eJ && ePos !== undefined && Math.hypot(x - ePos.x, y - ePos.y) <= eR * 1.65;
        pts.push({ x, y, radiusPx: Math.max(0.5, edt[p] - 0.5), nearJunction: nearS || nearE });
      }
      const nextLink = portPair.get(`${currId}:${forward ? 1 : 0}`);
      if (!nextLink || visitedBranches.has(nextLink.branchId)) break;
      const centroid = superCentroid.get(nextLink.junctionRoot);
      if (centroid && pts.length > 0) {
        const last = pts[pts.length - 1];
        if (Math.hypot(centroid.x - last.x, centroid.y - last.y) > 0.25) {
          pts.push({ x: centroid.x, y: centroid.y, radiusPx: last.radiusPx, nearJunction: true });
        }
      }
      currId = nextLink.branchId;
      forward = nextLink.atStart;
    }
    return pts;
  };

  for (let i = 0; i < superBranches.length; i += 1) {
    if (visitedBranches.has(i)) continue;
    if (!portPair.has(`${i}:0`)) strokes.push(traceChain(i, true));
    else if (!portPair.has(`${i}:1`)) strokes.push(traceChain(i, false));
  }
  for (let i = 0; i < superBranches.length; i += 1) {
    if (visitedBranches.has(i)) continue;
    const loopPts = traceChain(i, true);
    if (loopPts.length >= 4 && Math.hypot(loopPts[0].x - loopPts[loopPts.length - 1].x, loopPts[0].y - loopPts[loopPts.length - 1].y) <= 4) {
      loopPts.push({ ...loopPts[0] });
      closedLoops.push(loopPts);
    } else if (loopPts.length >= 2) {
      strokes.push(loopPts);
    }
  }
  return { strokes, closedLoops, junctionCount };
}

function smoothJunctionRadii(points: InternalPoint[]): number {
  const n = points.length;
  let junctionPassages = 0;
  let i = 0;
  while (i < n) {
    if (!points[i].nearJunction) {
      i += 1;
      continue;
    }
    const runStart = i;
    while (i < n && points[i].nearJunction) i += 1;
    const runEnd = i - 1;
    if (runStart > 0 && runEnd < n - 1) junctionPassages += 1;
    const leftR = runStart > 0 ? points[runStart - 1].radiusPx : undefined;
    const rightR = runEnd < n - 1 ? points[runEnd + 1].radiusPx : undefined;
    for (let k = runStart; k <= runEnd; k += 1) {
      if (leftR !== undefined && rightR !== undefined) {
        const t = (k - runStart + 1) / (runEnd - runStart + 2);
        points[k].radiusPx = Math.min(points[k].radiusPx, leftR * (1 - t) + rightR * t);
      } else if (leftR !== undefined) {
        points[k].radiusPx = Math.min(points[k].radiusPx, leftR);
      } else if (rightR !== undefined) {
        points[k].radiusPx = Math.min(points[k].radiusPx, rightR);
      }
    }
  }
  return junctionPassages;
}

function orientStrokeHumanDirection(
  points: InternalPoint[],
  readingDirection: StrokeReadingDirection,
  width: number,
): InternalPoint[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const firstX = readingDirection === "top-left-to-bottom-right" ? first.x : width - first.x;
  const lastX = readingDirection === "top-left-to-bottom-right" ? last.x : width - last.x;
  const shouldReverse =
    Math.abs(last.y - first.y) > Math.abs(last.x - first.x) * 0.75
      ? last.y < first.y
      : lastX + last.y * 0.35 < firstX + first.y * 0.35;
  return shouldReverse ? [...points].reverse() : points;
}

function deduplicatePoints(points: InternalPoint[]): InternalPoint[] {
  if (points.length <= 2) return points;
  const out: InternalPoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) > 1e-4) out.push(points[i]);
  }
  return out;
}

/**
 * 래스터 선화 마스크를 인간 필기 순서 기반의 편집 가능한 3차 베지에 벡터 스트로크 시퀀스로 복원한다.
 */
export function vectorizeRasterLineartInStrokeOrder(
  mask: RasterLineartMask,
  options: StrokeVectorizerOptions = {},
): VectorizationResult {
  const width = Math.max(0, Math.floor(mask.width));
  const height = Math.max(0, Math.floor(mask.height));
  const minStrokeLengthPx = options.minStrokeLengthPx ?? 3;
  const spurPruneLengthPx = options.spurPruneLengthPx ?? 4;
  const maxBezierErrorPx = options.maxBezierErrorPx ?? 1.2;
  const tangentWindow = options.junctionTangentWindow ?? 6;
  const minContinuationCos = options.junctionContinuationMinCos ?? 0.5;
  const readingDirection = options.readingDirection ?? "top-left-to-bottom-right";

  if (width === 0 || height === 0) {
    return {
      width,
      height,
      foregroundPixelCount: 0,
      skeletonPixelCount: 0,
      junctionCount: 0,
      strokes: [],
      totalBezierSegments: 0,
      meanFitErrorPx: 0,
      maxFitErrorPx: 0,
      distanceTransform: new Float32Array(0),
      skeletonMask: new Uint8Array(0),
    };
  }

  const { binary, count: foregroundPixelCount } = binarizeMask(mask, options.threshold);
  const distanceTransform = computeEuclideanDistanceTransform(binary, width, height);
  const skeletonMask = zhangSuenThinning(binary, width, height);
  let skeletonPixelCount = 0;
  for (let i = 0; i < skeletonMask.length; i += 1) if (skeletonMask[i] !== 0) skeletonPixelCount += 1;

  const adj = buildSkeletonAdjacency(skeletonMask, width, height);
  pruneSpurs(adj, distanceTransform, width, spurPruneLengthPx);
  const { strokes: rawOpen, closedLoops, junctionCount } = decomposeSkeletonByTangentContinuity(
    adj,
    distanceTransform,
    width,
    tangentWindow,
    minContinuationCos,
  );

  interface DraftStroke {
    readonly isClosed: boolean;
    readonly points: InternalPoint[];
    readonly totalLengthPx: number;
    readonly passedThroughJunctions: number;
  }

  const drafts: DraftStroke[] = [];
  const collectDraft = (pts: InternalPoint[], isClosed: boolean): void => {
    const clean = deduplicatePoints(isClosed ? pts : orientStrokeHumanDirection(pts, readingDirection, width));
    if (clean.length < 2) return;
    const passedThroughJunctions = smoothJunctionRadii(clean);
    let len = 0;
    for (let i = 1; i < clean.length; i += 1) {
      len += Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
    }
    if (len >= minStrokeLengthPx) drafts.push({ isClosed, points: clean, totalLengthPx: len, passedThroughJunctions });
  };
  for (const s of rawOpen) collectDraft(s, false);
  for (const loop of closedLoops) collectDraft(loop, true);

  const sortScore = (draft: DraftStroke): number => {
    const p = draft.points[0];
    const xCoord = readingDirection === "top-left-to-bottom-right" ? p.x : width - p.x;
    return p.y * 1.15 + xCoord * 0.65;
  };
  drafts.sort((a, b) => sortScore(a) - sortScore(b));

  let globalMaxRadius = options.referenceMaxRadiusPx ?? 1;
  if (options.referenceMaxRadiusPx === undefined) {
    for (const d of drafts) {
      for (const pt of d.points) if (pt.radiusPx > globalMaxRadius) globalMaxRadius = pt.radiusPx;
    }
  }

  const strokes: VectorizedStroke[] = [];
  let totalBezierSegments = 0;
  let sumError = 0;
  let globalMaxFitError = 0;

  for (let sIdx = 0; sIdx < drafts.length; sIdx += 1) {
    const draft = drafts[sIdx];
    const samples: CenterlineSample[] = [];
    const vecPoints: Vec2[] = [];
    const radii: number[] = [];
    const pressures: number[] = [];
    let arc = 0;
    let sumR = 0;
    let minR = Number.POSITIVE_INFINITY;
    let maxR = 0;

    for (let i = 0; i < draft.points.length; i += 1) {
      const pt = draft.points[i];
      if (i > 0) arc += Math.hypot(pt.x - draft.points[i - 1].x, pt.y - draft.points[i - 1].y);
      const pressure = clampNumber(pt.radiusPx / Math.max(globalMaxRadius, 0.5), 0.05, 1);
      samples.push({ x: pt.x, y: pt.y, radiusPx: pt.radiusPx, pressure, arcLengthPx: arc });
      vecPoints.push({ x: pt.x, y: pt.y });
      radii.push(pt.radiusPx);
      pressures.push(pressure);
      sumR += pt.radiusPx;
      if (pt.radiusPx < minR) minR = pt.radiusPx;
      if (pt.radiusPx > maxR) maxR = pt.radiusPx;
    }

    const segments = fitCubicBezierSchneider(vecPoints, maxBezierErrorPx, radii, pressures);
    let strokeMaxErr = 0;
    for (const seg of segments) {
      if (seg.maxFitErrorPx > strokeMaxErr) strokeMaxErr = seg.maxFitErrorPx;
      sumError += seg.maxFitErrorPx;
    }
    if (strokeMaxErr > globalMaxFitError) globalMaxFitError = strokeMaxErr;
    totalBezierSegments += segments.length;

    strokes.push({
      strokeOrder: sIdx,
      strokeId: `stroke-${String(sIdx + 1).padStart(3, "0")}`,
      isClosed: draft.isClosed,
      totalLengthPx: draft.totalLengthPx,
      meanRadiusPx: sumR / samples.length,
      minRadiusPx: minR,
      maxRadiusPx: maxR,
      startPoint: vecPoints[0],
      endPoint: vecPoints[vecPoints.length - 1],
      samples,
      segments,
      maxFitErrorPx: strokeMaxErr,
      passedThroughJunctions: draft.passedThroughJunctions,
    });
  }

  return {
    width,
    height,
    foregroundPixelCount,
    skeletonPixelCount,
    junctionCount,
    strokes,
    totalBezierSegments,
    meanFitErrorPx: totalBezierSegments > 0 ? sumError / totalBezierSegments : 0,
    maxFitErrorPx: globalMaxFitError,
    distanceTransform,
    skeletonMask,
  };
}
