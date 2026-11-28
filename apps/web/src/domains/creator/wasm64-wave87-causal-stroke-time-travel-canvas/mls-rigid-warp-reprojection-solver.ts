/**
 * Wave 87: 2D Moving Least Squares(MLS Rigid / Similarity) 강체 변형장 및
 * 인과 서브그래프 결정적 자동 재투영 솔버
 *
 * Schaefer, McPhail & Warren (SIGGRAPH 2006)의 2D Rigid/Similarity MLS 변형장을
 * 본-케이지(Bone-Cage)와 다단계 인과 DAG에 통합해,
 * 과거 러프 골격 수정 시 선화·셀 채색·그림자·수채 번짐·말풍선 꼬리가
 * 젤리 왜곡 없이 강체 수준으로 자동 재투영되도록 보장한다.
 */

import {
  extractNodeGeometryPoints,
  sealUpdatedCausalNode,
  updateSpeechBalloonTailForBone,
} from "./causal-stroke-dependency-graph";
import type {
  CausalCanvasNode,
  CausalNodeKind,
  CausalStrokeDependencyGraph,
  CubicHandlePair,
  HistoricalEditContext,
  Point2D,
  RoughSkeletonBoneNode,
  TimeTravelRevision,
} from "./causal-stroke-dependency-graph";

export type MlsWarpMode = "rigid" | "similarity";

export interface MlsWarpOptions {
  readonly mode?: MlsWarpMode;
  readonly alpha?: number;
  readonly epsilon?: number;
  readonly snapEpsilonSq?: number;
}

export interface ControlPointCorrespondence {
  readonly original: readonly Point2D[];
  readonly edited: readonly Point2D[];
}

export interface NodeReprojectionAudit {
  readonly nodeId: string;
  readonly kind: CausalNodeKind;
  readonly label: string;
  readonly recomputed: boolean;
  readonly pointCount: number;
  readonly meanDisplacementPx: number;
  readonly maxDisplacementPx: number;
  readonly lengthDriftRatio: number;
  readonly areaDriftRatio: number;
  readonly meanRotationDeltaDeg: number;
  readonly balloonTextRotationDeg: number | null;
}

export interface ReprojectionFidelityReport {
  readonly editedNodeId: string;
  readonly sourceRevision: number;
  readonly targetRevision: number;
  readonly solverMode: MlsWarpMode;
  readonly recomputedNodeIds: readonly string[];
  readonly untouchedNodeIds: readonly string[];
  readonly recomputedNodeCount: number;
  readonly untouchedNodeCount: number;
  readonly elapsedMs: number;
  readonly maxLengthDriftRatio: number;
  readonly maxAreaDriftRatio: number;
  readonly averageDisplacementPx: number;
  readonly integrityPassed: boolean;
  readonly perNodeAudit: readonly NodeReprojectionAudit[];
}

export interface HistoricalReprojectionRequest {
  readonly nodeId: string;
  readonly label: string;
  readonly timestampMs: number;
  readonly sourceRevision?: number;
  readonly mode?: MlsWarpMode;
  readonly alpha?: number;
  readonly maxControlPointsPerParent?: number;
  readonly mutate: (currentNode: CausalCanvasNode) => CausalCanvasNode;
}

export interface HistoricalReprojectionOutput {
  readonly revision: TimeTravelRevision;
  readonly report: ReprojectionFidelityReport;
  readonly beforeNodes: ReadonlyMap<string, CausalCanvasNode>;
  readonly afterNodes: ReadonlyMap<string, CausalCanvasNode>;
}

const DEFAULT_ALPHA = 1.0;
const DEFAULT_EPSILON = 1e-10;
const DEFAULT_SNAP_EPSILON_SQ = 1e-12;
const DEFAULT_MAX_CONTROL_POINTS_PER_PARENT = 24;
const EPS_NUMERIC = 1e-12;

/** 2D 점 `point`를 기준점 `pivot` 주위로 `angleDeg`도 회전하고 평행 이동한다. */
export function rotateAndTranslatePoint2D(
  point: Point2D,
  pivot: Point2D,
  angleDeg: number,
  translation: Point2D = { x: 0, y: 0 },
): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin + translation.x,
    y: pivot.y + dx * sin + dy * cos + translation.y,
  };
}

/** 러프 골격 본 노드를 관절 기준점(`p0` 기본)으로 회전·이동·길이 조정한 새 노드를 생성한다. */
export function transformRoughSkeletonBone(
  bone: RoughSkeletonBoneNode,
  params: {
    readonly angleDeg: number;
    readonly translation?: Point2D;
    readonly pivot?: Point2D;
    readonly scaleLength?: number;
  },
): RoughSkeletonBoneNode {
  const pivot = params.pivot ?? bone.payload.p0;
  const translation = params.translation ?? { x: 0, y: 0 };
  const scaleLength = params.scaleLength ?? 1;
  const rotatedP0 = rotateAndTranslatePoint2D(bone.payload.p0, pivot, params.angleDeg, translation);
  const rawP1 = rotateAndTranslatePoint2D(bone.payload.p1, pivot, params.angleDeg, translation);
  const rescale = (pt: Point2D): Point2D =>
    Math.abs(scaleLength - 1) > 1e-9
      ? {
          x: rotatedP0.x + (pt.x - rotatedP0.x) * scaleLength,
          y: rotatedP0.y + (pt.y - rotatedP0.y) * scaleLength,
        }
      : pt;
  const nextHandles = bone.payload.controlHandles
    ? bone.payload.controlHandles.map((h) =>
        rescale(rotateAndTranslatePoint2D(h, pivot, params.angleDeg, translation)),
      )
    : undefined;

  return sealUpdatedCausalNode({
    ...bone,
    payload: {
      ...bone.payload,
      p0: rotatedP0,
      p1: rescale(rawP1),
      ...(nextHandles ? { controlHandles: nextHandles } : {}),
    },
  }) as RoughSkeletonBoneNode;
}

/**
 * 2D Moving Least Squares (Rigid / Similarity) 단일 점 변형 솔버.
 * - 항등 보존: `original === edited`이면 전역 오차 `< 1e-6`
 * - 제어점 보간: 모든 제어 핸들 `p_i`에서 `|warp(p_i) - q_i| < 1e-3`
 * - 국소 강체성: 순수 회전+이동 변환 하에서 길이·각도를 정확히 보존
 */
export function solveMlsRigidWarpPoint(
  point: Point2D,
  originalControlPoints: readonly Point2D[],
  editedControlPoints: readonly Point2D[],
  options: MlsWarpOptions = {},
): Point2D {
  const count = Math.min(originalControlPoints.length, editedControlPoints.length);
  if (count === 0) return { x: point.x, y: point.y };
  if (count === 1) {
    const p0 = originalControlPoints[0];
    const q0 = editedControlPoints[0];
    return p0 && q0 ? { x: point.x + (q0.x - p0.x), y: point.y + (q0.y - p0.y) } : { ...point };
  }

  const mode: MlsWarpMode = options.mode ?? "rigid";
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const snapEpsilonSq = options.snapEpsilonSq ?? DEFAULT_SNAP_EPSILON_SQ;

  const weights = new Float64Array(count);
  let weightSum = 0;
  let pStarX = 0;
  let pStarY = 0;
  let qStarX = 0;
  let qStarY = 0;

  for (let i = 0; i < count; i += 1) {
    const p = originalControlPoints[i];
    const q = editedControlPoints[i];
    if (!p || !q) continue;
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= snapEpsilonSq) return { x: q.x, y: q.y };
    const w = 1 / (alpha === 1 ? distSq + epsilon : Math.pow(distSq, alpha) + epsilon);
    weights[i] = w;
    weightSum += w;
    pStarX += w * p.x;
    pStarY += w * p.y;
    qStarX += w * q.x;
    qStarY += w * q.y;
  }

  if (weightSum <= EPS_NUMERIC || !Number.isFinite(weightSum)) return { x: point.x, y: point.y };
  pStarX /= weightSum;
  pStarY /= weightSum;
  qStarX /= weightSum;
  qStarY /= weightSum;

  let muSimilarity = 0;
  let dotSum = 0;
  let crossSum = 0;
  for (let i = 0; i < count; i += 1) {
    const p = originalControlPoints[i];
    const q = editedControlPoints[i];
    const w = weights[i] ?? 0;
    if (!p || !q || w <= 0) continue;
    const pHatX = p.x - pStarX;
    const pHatY = p.y - pStarY;
    const qHatX = q.x - qStarX;
    const qHatY = q.y - qStarY;
    muSimilarity += w * (pHatX * pHatX + pHatY * pHatY);
    dotSum += w * (pHatX * qHatX + pHatY * qHatY);
    crossSum += w * (pHatX * qHatY - pHatY * qHatX);
  }

  const dvx = point.x - pStarX;
  const dvy = point.y - pStarY;
  if (muSimilarity <= EPS_NUMERIC) return { x: qStarX + dvx, y: qStarY + dvy };

  let a: number;
  let b: number;
  if (mode === "similarity") {
    a = dotSum / muSimilarity;
    b = crossSum / muSimilarity;
  } else {
    const muRigid = Math.hypot(dotSum, crossSum);
    if (muRigid <= EPS_NUMERIC) return { x: qStarX + dvx, y: qStarY + dvy };
    a = dotSum / muRigid;
    b = crossSum / muRigid;
  }

  const outX = qStarX + (a * dvx - b * dvy);
  const outY = qStarY + (b * dvx + a * dvy);
  return Number.isFinite(outX) && Number.isFinite(outY) ? { x: outX, y: outY } : { ...point };
}

/** 다수 정점에 동일한 MLS 변형장을 일괄 적용한다. */
export function solveMlsRigidWarpPoints(
  points: readonly Point2D[],
  originalControlPoints: readonly Point2D[],
  editedControlPoints: readonly Point2D[],
  options: MlsWarpOptions = {},
): readonly Point2D[] {
  return points.map((pt) =>
    solveMlsRigidWarpPoint(pt, originalControlPoints, editedControlPoints, options),
  );
}

/** 골격 본 `(boneStart, boneEnd)`을 따라 균등 분할 제어 핸들을 샘플링한다. */
export function sampleBoneCageControls(
  boneStart: Point2D,
  boneEnd: Point2D,
  sampleCount = 5,
): readonly Point2D[] {
  const n = Math.max(2, Math.floor(sampleCount));
  const points: Point2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    points.push({
      x: boneStart.x + (boneEnd.x - boneStart.x) * t,
      y: boneStart.y + (boneEnd.y - boneStart.y) * t,
    });
  }
  return points;
}

function subsampleUniformPair(
  before: readonly Point2D[],
  after: readonly Point2D[],
  maxPoints: number,
): ControlPointCorrespondence {
  const count = Math.min(before.length, after.length);
  if (count <= maxPoints) {
    return { original: before.slice(0, count), edited: after.slice(0, count) };
  }
  const original: Point2D[] = [];
  const edited: Point2D[] = [];
  const step = (count - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.min(count - 1, Math.round(i * step));
    const p = before[idx];
    const q = after[idx];
    if (p && q) {
      original.push(p);
      edited.push(q);
    }
  }
  return { original, edited };
}

function collectControlPairsForChild(
  childNode: CausalCanvasNode,
  beforeNodes: ReadonlyMap<string, CausalCanvasNode>,
  afterNodes: ReadonlyMap<string, CausalCanvasNode>,
  maxControlPointsPerParent: number,
): ControlPointCorrespondence {
  const original: Point2D[] = [];
  const edited: Point2D[] = [];
  const sampleOf = (node: CausalCanvasNode): readonly Point2D[] =>
    node.kind === "rough-skeleton-bone"
      ? node.payload.controlHandles && node.payload.controlHandles.length >= 2
        ? node.payload.controlHandles
        : sampleBoneCageControls(node.payload.p0, node.payload.p1, 5)
      : extractNodeGeometryPoints(node);

  for (const parentId of childNode.parentIds) {
    const beforeParent = beforeNodes.get(parentId);
    const afterParent = afterNodes.get(parentId);
    if (!beforeParent || !afterParent) continue;
    const sampled = subsampleUniformPair(
      sampleOf(beforeParent),
      sampleOf(afterParent),
      maxControlPointsPerParent,
    );
    for (let j = 0; j < sampled.original.length; j += 1) {
      const p = sampled.original[j];
      const q = sampled.edited[j];
      if (p && q) {
        original.push(p);
        edited.push(q);
      }
    }
  }
  return { original, edited };
}

function warpBezierHandles(
  handles: readonly CubicHandlePair[] | undefined,
  corr: ControlPointCorrespondence,
  options: MlsWarpOptions,
): readonly CubicHandlePair[] | undefined {
  return handles?.map((pair) => ({
    cp1: solveMlsRigidWarpPoint(pair.cp1, corr.original, corr.edited, options),
    cp2: solveMlsRigidWarpPoint(pair.cp2, corr.original, corr.edited, options),
  }));
}

/** 영향받는 인과 서브그래프 전체를 위상 순서대로 MLS 변형장으로 재투영한다. */
export function reprojectCausalSubgraph(
  context: HistoricalEditContext,
  options: MlsWarpOptions & { readonly maxControlPointsPerParent?: number } = {},
): ReadonlyMap<string, CausalCanvasNode> {
  const maxPerParent = options.maxControlPointsPerParent ?? DEFAULT_MAX_CONTROL_POINTS_PER_PARENT;
  const nextNodes = new Map<string, CausalCanvasNode>(context.beforeNodes);
  nextNodes.set(context.editedNodeId, context.afterEditedNode);

  for (const childId of context.downstreamOrder) {
    const child = nextNodes.get(childId);
    if (!child) continue;

    if (child.kind === "speech-balloon-tail") {
      const b0 = context.beforeNodes.get(child.payload.speakerBoneId);
      const b1 = nextNodes.get(child.payload.speakerBoneId);
      if (b0?.kind === "rough-skeleton-bone" && b1?.kind === "rough-skeleton-bone") {
        const len = Math.hypot(b0.payload.p1.x - b0.payload.p0.x, b0.payload.p1.y - b0.payload.p0.y);
        nextNodes.set(childId, updateSpeechBalloonTailForBone(child, b1, context.timestampMs, len));
        continue;
      }
    }

    const corr = collectControlPairsForChild(child, context.beforeNodes, nextNodes, maxPerParent);
    if (corr.original.length === 0) continue;

    switch (child.kind) {
      case "rough-skeleton-bone": {
        const nextHandles = child.payload.controlHandles
          ? solveMlsRigidWarpPoints(child.payload.controlHandles, corr.original, corr.edited, options)
          : undefined;
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              p0: solveMlsRigidWarpPoint(child.payload.p0, corr.original, corr.edited, options),
              p1: solveMlsRigidWarpPoint(child.payload.p1, corr.original, corr.edited, options),
              ...(nextHandles ? { controlHandles: nextHandles } : {}),
            },
          }),
        );
        break;
      }
      case "ink-lineart-stroke": {
        const nextBeziers = warpBezierHandles(child.payload.bezierControls, corr, options);
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              points: solveMlsRigidWarpPoints(child.payload.points, corr.original, corr.edited, options),
              ...(nextBeziers ? { bezierControls: nextBeziers } : {}),
            },
          }),
        );
        break;
      }
      case "cel-fill-region":
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              polygon: solveMlsRigidWarpPoints(child.payload.polygon, corr.original, corr.edited, options),
            },
          }),
        );
        break;
      case "shadow-highlight-pass":
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              polygon: solveMlsRigidWarpPoints(child.payload.polygon, corr.original, corr.edited, options),
            },
          }),
        );
        break;
      case "fluid-wash-effect":
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              bleedAnchors: solveMlsRigidWarpPoints(
                child.payload.bleedAnchors,
                corr.original,
                corr.edited,
                options,
              ),
            },
          }),
        );
        break;
      case "speech-balloon-tail": {
        const nextTip = solveMlsRigidWarpPoint(child.payload.tailTip, corr.original, corr.edited, options);
        const angle = Math.atan2(
          nextTip.y - child.payload.balloonCenter.y,
          nextTip.x - child.payload.balloonCenter.x,
        );
        const rx = Math.max(8, child.payload.balloonRadiusX);
        const ry = Math.max(8, child.payload.balloonRadiusY);
        nextNodes.set(
          childId,
          sealUpdatedCausalNode({
            ...child,
            updatedAtMs: context.timestampMs,
            payload: {
              ...child.payload,
              balloonTextRotationDeg: 0,
              tailTip: nextTip,
              tailBaseLeft: {
                x: child.payload.balloonCenter.x + rx * Math.cos(angle - 0.22),
                y: child.payload.balloonCenter.y + ry * Math.sin(angle - 0.22),
              },
              tailBaseRight: {
                x: child.payload.balloonCenter.x + rx * Math.cos(angle + 0.22),
                y: child.payload.balloonCenter.y + ry * Math.sin(angle + 0.22),
              },
            },
          }),
        );
        break;
      }
    }
  }
  return nextNodes;
}

function signedPolygonArea(points: readonly Point2D[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a && b) twice += a.x * b.y - b.x * a.y;
  }
  return twice * 0.5;
}

function measureNodeFidelity(
  beforeNode: CausalCanvasNode,
  afterNode: CausalCanvasNode,
  recomputed: boolean,
): NodeReprojectionAudit {
  const beforePts = extractNodeGeometryPoints(beforeNode);
  const afterPts = extractNodeGeometryPoints(afterNode);
  const count = Math.min(beforePts.length, afterPts.length);

  let dispSum = 0;
  let maxDisp = 0;
  for (let i = 0; i < count; i += 1) {
    const p = beforePts[i];
    const q = afterPts[i];
    if (!p || !q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    dispSum += d;
    if (d > maxDisp) maxDisp = d;
  }

  let maxLengthDrift = 0;
  let rotDeltaSum = 0;
  let rotEdgeCount = 0;
  const closed = beforeNode.kind === "cel-fill-region" || beforeNode.kind === "shadow-highlight-pass";
  const edgeLimit = closed ? count : Math.max(0, count - 1);

  if (beforeNode.kind !== "speech-balloon-tail") {
    for (let i = 0; i < edgeLimit; i += 1) {
      const p0 = beforePts[i];
      const p1 = beforePts[(i + 1) % count];
      const q0 = afterPts[i];
      const q1 = afterPts[(i + 1) % count];
      if (!p0 || !p1 || !q0 || !q1) continue;
      const vx = p1.x - p0.x;
      const vy = p1.y - p0.y;
      const wx = q1.x - q0.x;
      const wy = q1.y - q0.y;
      const lenBefore = Math.hypot(vx, vy);
      const lenAfter = Math.hypot(wx, wy);
      if (lenBefore > 1e-6) {
        const drift = Math.abs(lenAfter - lenBefore) / lenBefore;
        if (drift > maxLengthDrift) maxLengthDrift = drift;
        if (lenAfter > 1e-6) {
          rotDeltaSum += (Math.atan2(vx * wy - vy * wx, vx * wx + vy * wy) * 180) / Math.PI;
          rotEdgeCount += 1;
        }
      }
    }
  }

  let areaDriftRatio = 0;
  if (closed && count >= 3) {
    const areaBefore = Math.abs(signedPolygonArea(beforePts));
    if (areaBefore > 1e-6) {
      areaDriftRatio = Math.abs(Math.abs(signedPolygonArea(afterPts)) - areaBefore) / areaBefore;
    }
  }

  return {
    nodeId: afterNode.id,
    kind: afterNode.kind,
    label: afterNode.label,
    recomputed,
    pointCount: count,
    meanDisplacementPx: count > 0 ? dispSum / count : 0,
    maxDisplacementPx: maxDisp,
    lengthDriftRatio: maxLengthDrift,
    areaDriftRatio,
    meanRotationDeltaDeg: rotEdgeCount > 0 ? rotDeltaSum / rotEdgeCount : 0,
    balloonTextRotationDeg:
      afterNode.kind === "speech-balloon-tail" ? afterNode.payload.balloonTextRotationDeg : null,
  };
}

/** 과거 노드 편집을 MLS 변형장으로 증분 재투영하고 왜곡·보전 감사 리포트를 생성한다. */
export function reprojectDownstreamFromHistoricalEdit(
  graph: CausalStrokeDependencyGraph,
  request: HistoricalReprojectionRequest,
): HistoricalReprojectionOutput {
  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const solverMode: MlsWarpMode = request.mode ?? "rigid";
  if (request.sourceRevision !== undefined) graph.checkoutRevision(request.sourceRevision);
  const beforeNodes = graph.getNodeSnapshotMap();

  const editResult = graph.editHistoricalNodeAndReproject({
    nodeId: request.nodeId,
    label: request.label,
    timestampMs: request.timestampMs,
    sourceRevision: request.sourceRevision,
    mutate: request.mutate,
    reproject: (context) =>
      reprojectCausalSubgraph(context, {
        mode: solverMode,
        alpha: request.alpha,
        maxControlPointsPerParent: request.maxControlPointsPerParent,
      }),
  });

  const afterNodes = editResult.revision.nodes;
  const recomputedSet = new Set<string>([editResult.editedNodeId, ...editResult.affectedNodeIds]);
  const perNodeAudit: NodeReprojectionAudit[] = [];
  let maxLengthDriftRatio = 0;
  let maxAreaDriftRatio = 0;
  let dispSum = 0;
  let dispCount = 0;
  let integrityPassed = true;

  for (const id of graph.getTopologicalOrder()) {
    const beforeNode = beforeNodes.get(id);
    const afterNode = afterNodes.get(id);
    if (!beforeNode || !afterNode) continue;
    const recomputed = recomputedSet.has(id);
    const audit = measureNodeFidelity(beforeNode, afterNode, recomputed);
    perNodeAudit.push(audit);

    const invalid = extractNodeGeometryPoints(afterNode).some(
      (pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y),
    );
    if (invalid) integrityPassed = false;
    if (!recomputed && (audit.maxDisplacementPx > 0 || beforeNode.contentHash !== afterNode.contentHash)) {
      integrityPassed = false;
    }
    if (audit.balloonTextRotationDeg !== null && Math.abs(audit.balloonTextRotationDeg) > 1e-6) {
      integrityPassed = false;
    }
    if (recomputed) {
      dispSum += audit.meanDisplacementPx;
      dispCount += 1;
      if (audit.lengthDriftRatio > maxLengthDriftRatio) maxLengthDriftRatio = audit.lengthDriftRatio;
      if (audit.areaDriftRatio > maxAreaDriftRatio) maxAreaDriftRatio = audit.areaDriftRatio;
    }
  }

  const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    revision: editResult.revision,
    beforeNodes,
    afterNodes,
    report: {
      editedNodeId: editResult.editedNodeId,
      sourceRevision: editResult.sourceRevision,
      targetRevision: editResult.targetRevision,
      solverMode,
      recomputedNodeIds: editResult.affectedNodeIds,
      untouchedNodeIds: editResult.untouchedNodeIds,
      recomputedNodeCount: editResult.affectedNodeIds.length,
      untouchedNodeCount: editResult.untouchedNodeIds.length,
      elapsedMs: Math.max(0, endMs - startMs),
      maxLengthDriftRatio,
      maxAreaDriftRatio,
      averageDisplacementPx: dispCount > 0 ? dispSum / dispCount : 0,
      integrityPassed,
      perNodeAudit,
    },
  };
}
