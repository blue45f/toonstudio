/**
 * 단일 추론(Inference) 파이프라인 — 순수 모듈.
 *
 * 입력: 커서(점 또는 레이) + 색인된 후보 소스(객체 점·모서리·면, 가이드선, 벽선) + 축 잠금 + 직전 기준점.
 * 출력: 우선순위가 정해진 단일 결과(종류·점·유도선·표시 문구)와 상위 후보 목록.
 *
 * 우선순위(작을수록 우선): 점(끝점·교차점·중간점·중심) → 선 위 → 정렬(축·기준점 연장·평행·수직)
 * → 면 위 → 격자 → 자유. 같은 구간에서는 화면 거리(px)가 가까운 후보, 그다음 종류 순번, 그다음 ID.
 * 쿼리 비용은 색인의 셀·스캔 상한과 아래 후보 상한으로 묶인다(`StudioBg3dInferenceStats`로 증명).
 */

import {
  STUDIO_BG3D_INFERENCE_AXES,
  STUDIO_BG3D_INFERENCE_BUDGET,
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  STUDIO_BG3D_INFERENCE_THRESHOLD_PX,
  STUDIO_BG3D_INFERENCE_UP_AXIS,
  describeStudioBg3dInferenceAxis,
  studioBg3dInferenceAxisVector,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import {
  addScaled,
  closestPointsBetweenSegments,
  distance,
  dot,
  intersectLineWithPlane,
  isFiniteVec3,
  isWithinWorldBounds,
  normalize,
  scale,
  sub,
  vec3,
} from "./studio-bg3d-inference-math";
import { createStudioBg3dInferenceProbe } from "./studio-bg3d-inference-probe";
import { intersectStudioBg3dInferenceRayVolume } from "./studio-bg3d-inference-ray";

import type {
  StudioBg3dInferenceAxis,
  StudioBg3dInferenceKind,
} from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceProbe } from "./studio-bg3d-inference-probe";
import type { StudioBg3dInferenceRayVolumeHit } from "./studio-bg3d-inference-ray";
import type {
  StudioBg3dInferenceEdgeFeature,
  StudioBg3dInferencePointFeature,
  StudioBg3dInferenceVolumeFeature,
} from "./studio-bg3d-inference-sources";
import type {
  StudioBg3dInferenceAppliedConstraint,
  StudioBg3dInferenceCandidateSummary,
  StudioBg3dInferenceGuide,
  StudioBg3dInferenceHold,
  StudioBg3dInferenceOutcome,
  StudioBg3dInferencePointerKind,
  StudioBg3dInferenceQuery,
  StudioBg3dInferenceReferenceDirection,
  StudioBg3dInferenceResult,
} from "./studio-bg3d-inference-types";

type V3 = StudioBg3dInferenceVec3;

const POINTER_SCALE: Readonly<Record<StudioBg3dInferencePointerKind, number>> = Object.freeze({
  mouse: 1,
  pen: 1.4,
  touch: STUDIO_BG3D_INFERENCE_THRESHOLD_PX.touchScale,
  keyboard: 1,
});

/** 기준점에서 이 px보다 가까운 곳에서는 방향 추론을 하지 않는다(고무줄이 너무 짧다). */
const MIN_RUBBER_BAND_PX = 4;
const EDGE_ENDPOINT_EPSILON = 1e-6;
const LOCK_LINE_TOUCH_TOLERANCE = 1e-3;
const PLANE_MEMBERSHIP_TOLERANCE = 1e-3;
const OCCLUSION_MIN_SLACK = 0.05;
const MAX_RANKED = 12;

interface Candidate {
  readonly id: string;
  readonly kind: StudioBg3dInferenceKind;
  readonly point: V3;
  readonly distancePx: number;
  readonly sourceIds: readonly string[];
  readonly tag: string | null;
  readonly detail: string | null;
  readonly axis: StudioBg3dInferenceAxis | null;
  readonly direction: V3 | null;
  readonly normal: V3 | null;
  readonly edgeId: string | null;
  readonly alignmentOrigin: V3 | null;
  readonly relation: { readonly id: string; readonly label: string } | null;
  readonly guides: readonly StudioBg3dInferenceGuide[];
  readonly constraint: StudioBg3dInferenceAppliedConstraint;
  readonly projected: boolean;
  readonly approximate: boolean;
}

interface Counters {
  pointsConsidered: number;
  edgesConsidered: number;
  volumesConsidered: number;
  intersectionPairs: number;
  evaluated: number;
}

interface Context {
  readonly query: StudioBg3dInferenceQuery;
  readonly probe: StudioBg3dInferenceProbe;
  readonly pointPx: number;
  readonly edgePx: number;
  readonly alignPx: number;
  readonly counters: Counters;
  /** 이 깊이보다 뒤에 있는 특징은 가려진 것으로 본다. */
  readonly occlusionLimit: number | null;
}

interface RawFeatures {
  readonly points: readonly StudioBg3dInferencePointFeature[];
  readonly edges: readonly StudioBg3dInferenceEdgeFeature[];
  readonly volumes: readonly StudioBg3dInferenceVolumeFeature[];
}

const NO_CONSTRAINT: StudioBg3dInferenceAppliedConstraint = Object.freeze({ kind: "none" });

function failureOutcome(
  reason: "invalid-cursor" | "invalid-scale" | "invalid-reference" | "no-target",
  message: string,
): StudioBg3dInferenceOutcome {
  return Object.freeze({ ok: false, reason, message });
}

function axisOfDirection(direction: V3): StudioBg3dInferenceAxis | null {
  for (const axis of STUDIO_BG3D_INFERENCE_AXES) {
    const unit = studioBg3dInferenceAxisVector(axis);
    if (Math.abs(Math.abs(dot(direction, unit)) - 1) < 1e-6) return axis;
  }
  return null;
}

function sourceLabel(query: StudioBg3dInferenceQuery, sourceId: string): string | null {
  return query.index.source.labels.get(sourceId) ?? null;
}

function compareCandidates(
  left: Candidate,
  right: Candidate,
  preferKinds: ReadonlySet<StudioBg3dInferenceKind> | null | undefined,
): number {
  const leftPreferred = preferKinds?.has(left.kind) ? 0 : 1;
  const rightPreferred = preferKinds?.has(right.kind) ? 0 : 1;
  if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
  const leftStyle = STUDIO_BG3D_INFERENCE_KIND_STYLE[left.kind];
  const rightStyle = STUDIO_BG3D_INFERENCE_KIND_STYLE[right.kind];
  if (leftStyle.tier !== rightStyle.tier) return leftStyle.tier - rightStyle.tier;
  if (left.distancePx !== right.distancePx) return left.distancePx - right.distancePx;
  if (leftStyle.rank !== rightStyle.rank) return leftStyle.rank - rightStyle.rank;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** 거리 순으로 최대 `limit`개만 남긴다. 입력 순서와 무관하게 결과가 같다. */
function keepNearest<T extends { readonly distancePx: number; readonly id: string }>(
  items: T[],
  limit: number,
): T[] {
  items.sort((left, right) =>
    left.distancePx - right.distancePx || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (items.length > limit) items.length = limit;
  return items;
}

function isOccluded(ctx: Context, point: V3, pixelsOfSlack: number): boolean {
  if (ctx.probe.mode !== "ray" || ctx.occlusionLimit === null) return false;
  const slack = Math.max(OCCLUSION_MIN_SLACK, pixelsOfSlack * ctx.probe.worldPerPixelAt(point));
  return ctx.probe.depthOf(point) > ctx.occlusionLimit + slack;
}

function kindAllowed(query: StudioBg3dInferenceQuery, kind: StudioBg3dInferenceKind): boolean {
  return !query.enabledKinds || query.enabledKinds.has(kind);
}

function baseCandidate(partial: Partial<Candidate> & Pick<Candidate, "id" | "kind" | "point" | "distancePx">): Candidate {
  return {
    sourceIds: [],
    tag: null,
    detail: null,
    axis: null,
    direction: null,
    normal: null,
    edgeId: null,
    alignmentOrigin: null,
    relation: null,
    guides: [],
    constraint: NO_CONSTRAINT,
    projected: false,
    approximate: false,
    ...partial,
  };
}

// ---------------------------------------------------------------------------------------------
// 점·모서리·교차
// ---------------------------------------------------------------------------------------------

function collectPointCandidates(ctx: Context, raw: readonly StudioBg3dInferencePointFeature[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const feature of raw) {
    if (ctx.query.excludeSourceIds?.has(feature.sourceId)) continue;
    if (!kindAllowed(ctx.query, feature.kind)) continue;
    ctx.counters.pointsConsidered += 1;
    const px = ctx.probe.distanceToPoint(feature.point) / ctx.probe.worldPerPixelAt(feature.point);
    if (px > ctx.pointPx) continue;
    if (isOccluded(ctx, feature.point, ctx.pointPx)) continue;
    candidates.push(baseCandidate({
      id: feature.id,
      kind: feature.kind,
      point: feature.point,
      distancePx: px,
      sourceIds: [feature.sourceId],
      tag: feature.tag,
      approximate: feature.approximate,
    }));
  }
  ctx.counters.evaluated += candidates.length;
  return keepNearest(candidates, STUDIO_BG3D_INFERENCE_BUDGET.maxPointCandidatesPerQuery);
}

interface EdgeHit {
  readonly edge: StudioBg3dInferenceEdgeFeature;
  readonly point: V3;
  readonly distancePx: number;
  readonly id: string;
}

function collectEdgeHits(ctx: Context, raw: readonly StudioBg3dInferenceEdgeFeature[]): EdgeHit[] {
  const hits: EdgeHit[] = [];
  const reach = Math.max(ctx.edgePx, ctx.pointPx);
  for (const edge of raw) {
    if (ctx.query.excludeSourceIds?.has(edge.sourceId)) continue;
    ctx.counters.edgesConsidered += 1;
    const closest = ctx.probe.closestOnSegment(edge.a, edge.b);
    const px = closest.distance / ctx.probe.worldPerPixelAt(closest.point);
    if (px > reach) continue;
    if (isOccluded(ctx, closest.point, reach)) continue;
    hits.push({ edge, point: closest.point, distancePx: px, id: edge.id });
  }
  ctx.counters.evaluated += hits.length;
  return keepNearest(hits, STUDIO_BG3D_INFERENCE_BUDGET.maxEdgeCandidatesPerQuery);
}

function edgeGuide(edge: StudioBg3dInferenceEdgeFeature, suffix: string): StudioBg3dInferenceGuide {
  return { id: `${edge.id}:${suffix}`, role: "edge", from: edge.a, to: edge.b, axis: null, dashed: false };
}

function edgeCandidate(hit: EdgeHit): Candidate {
  const direction = normalize(sub(hit.edge.b, hit.edge.a));
  return baseCandidate({
    id: hit.edge.id,
    kind: "on-edge",
    point: hit.point,
    distancePx: hit.distancePx,
    sourceIds: [hit.edge.sourceId],
    tag: hit.edge.tag,
    axis: direction ? axisOfDirection(direction) : null,
    direction,
    edgeId: hit.edge.id,
    guides: [edgeGuide(hit.edge, "edge")],
    approximate: hit.edge.approximate,
  });
}

/** 두 모서리가 서로의 안쪽에서 만나는 점. 끝점에서 만나는 경우는 끝점 후보가 맡으므로 제외한다. */
function interiorCrossing(first: StudioBg3dInferenceEdgeFeature, second: StudioBg3dInferenceEdgeFeature): V3 | null {
  const firstDirection = normalize(sub(first.b, first.a));
  const secondDirection = normalize(sub(second.b, second.a));
  if (!firstDirection || !secondDirection) return null;
  if (1 - Math.abs(dot(firstDirection, secondDirection)) < 1e-9) return null;
  const closest = closestPointsBetweenSegments(first.a, first.b, second.a, second.b);
  if (closest.distance > 1e-4) return null;
  const firstLength = distance(first.a, first.b);
  const secondLength = distance(second.a, second.b);
  if (
    closest.s * firstLength < EDGE_ENDPOINT_EPSILON
    || (1 - closest.s) * firstLength < EDGE_ENDPOINT_EPSILON
    || closest.t * secondLength < EDGE_ENDPOINT_EPSILON
    || (1 - closest.t) * secondLength < EDGE_ENDPOINT_EPSILON
  ) return null;
  return vec3(
    (closest.pointA[0] + closest.pointB[0]) / 2,
    (closest.pointA[1] + closest.pointB[1]) / 2,
    (closest.pointA[2] + closest.pointB[2]) / 2,
  );
}

function collectIntersections(ctx: Context, hits: readonly EdgeHit[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const first = hits[i];
    if (!first) continue;
    for (let j = i + 1; j < hits.length; j += 1) {
      const second = hits[j];
      if (!second) continue;
      if (ctx.counters.intersectionPairs >= STUDIO_BG3D_INFERENCE_BUDGET.maxIntersectionPairs) return candidates;
      ctx.counters.intersectionPairs += 1;
      const crossing = interiorCrossing(first.edge, second.edge);
      if (!crossing) continue;
      const px = ctx.probe.distanceToPoint(crossing) / ctx.probe.worldPerPixelAt(crossing);
      if (px > ctx.pointPx) continue;
      if (isOccluded(ctx, crossing, ctx.pointPx)) continue;
      candidates.push(baseCandidate({
        id: `${first.edge.id}×${second.edge.id}`,
        kind: "intersection",
        point: crossing,
        distancePx: px,
        sourceIds: first.edge.sourceId === second.edge.sourceId
          ? [first.edge.sourceId]
          : [first.edge.sourceId, second.edge.sourceId],
        guides: [edgeGuide(first.edge, "x"), edgeGuide(second.edge, "x")],
        approximate: first.edge.approximate || second.edge.approximate,
      }));
    }
  }
  ctx.counters.evaluated += candidates.length;
  return candidates;
}

// ---------------------------------------------------------------------------------------------
// 기준점 기반 정렬·평행·수직
// ---------------------------------------------------------------------------------------------

function alignmentCandidate(input: {
  readonly kind: "axis" | "from-point";
  readonly axis: StudioBg3dInferenceAxis;
  readonly origin: V3;
  readonly point: V3;
  readonly distancePx: number;
  readonly id: string;
}): Candidate {
  const unit = studioBg3dInferenceAxisVector(input.axis);
  const along = dot(sub(input.point, input.origin), unit);
  return baseCandidate({
    id: input.id,
    kind: input.kind,
    point: input.point,
    distancePx: input.distancePx,
    axis: input.axis,
    direction: along < 0 ? scale(unit, -1) : unit,
    alignmentOrigin: input.origin,
    guides: [{
      id: `${input.id}:line`,
      role: input.kind === "axis" ? "axis" : "from-point",
      from: input.origin,
      to: input.point,
      axis: input.axis,
      dashed: input.kind === "from-point",
    }],
  });
}

function collectAlignmentCandidates(ctx: Context, reference: V3): Candidate[] {
  const candidates: Candidate[] = [];
  const evaluateLines = (
    origin: V3,
    kind: "axis" | "from-point",
    idPrefix: string,
    skipAxes: ReadonlySet<StudioBg3dInferenceAxis>,
  ) => {
    if (!kindAllowed(ctx.query, kind)) return;
    for (const axis of STUDIO_BG3D_INFERENCE_AXES) {
      if (skipAxes.has(axis)) continue;
      ctx.counters.evaluated += 1;
      const closest = ctx.probe.closestOnLine(origin, studioBg3dInferenceAxisVector(axis));
      const worldPerPixel = ctx.probe.worldPerPixelAt(closest.point);
      const px = closest.distance / worldPerPixel;
      if (px > ctx.alignPx) continue;
      if (distance(closest.point, origin) / worldPerPixel < MIN_RUBBER_BAND_PX) continue;
      if (ctx.probe.mode === "ray" && ctx.probe.depthOf(closest.point) <= 0) continue;
      if (isOccluded(ctx, closest.point, ctx.alignPx)) continue;
      candidates.push(alignmentCandidate({
        kind,
        axis,
        origin,
        point: closest.point,
        distancePx: px,
        id: `${idPrefix}:${axis}`,
      }));
    }
  };
  evaluateLines(reference, "axis", "axis", new Set());
  const hovers = (ctx.query.hoverReferences ?? []).slice(0, STUDIO_BG3D_INFERENCE_BUDGET.maxReferencePoints);
  hovers.forEach((hover, index) => {
    if (!isFiniteVec3(hover) || distance(hover, reference) < 1e-6) return;
    // 기준점 축선과 겹치는 연장선은 중복이므로 건너뛴다.
    const skip = new Set<StudioBg3dInferenceAxis>();
    const offset = sub(hover, reference);
    for (const axis of STUDIO_BG3D_INFERENCE_AXES) {
      const unit = studioBg3dInferenceAxisVector(axis);
      if (distance(offset, scale(unit, dot(offset, unit))) < 1e-6) skip.add(axis);
    }
    evaluateLines(hover, "from-point", `from:${index}`, skip);
  });
  return candidates;
}

function relationGuides(
  ref: StudioBg3dInferenceReferenceDirection,
  reference: V3,
  point: V3,
): StudioBg3dInferenceGuide[] {
  const guides: StudioBg3dInferenceGuide[] = [
    { id: `${ref.id}:line`, role: "relation", from: reference, to: point, axis: null, dashed: false },
  ];
  if (ref.segment) {
    guides.push({
      id: `${ref.id}:ref`,
      role: "reference-edge",
      from: ref.segment.a,
      to: ref.segment.b,
      axis: null,
      dashed: true,
    });
  }
  return guides;
}

function collectRelationCandidates(ctx: Context, reference: V3): Candidate[] {
  const anchor = ctx.probe.anchor;
  if (!anchor) return [];
  const rubber = sub(anchor, reference);
  const worldPerPixel = ctx.probe.worldPerPixelAt(anchor);
  if (Math.hypot(rubber[0], rubber[1], rubber[2]) / worldPerPixel < MIN_RUBBER_BAND_PX) return [];
  const candidates: Candidate[] = [];
  const references = (ctx.query.referenceDirections ?? []).slice(0, STUDIO_BG3D_INFERENCE_BUDGET.maxReferenceDirections);
  for (const ref of references) {
    const direction = isFiniteVec3(ref.direction) ? normalize(ref.direction) : null;
    if (!direction) continue;
    ctx.counters.evaluated += 1;
    const along = dot(rubber, direction);
    const perpendicularVector = sub(rubber, scale(direction, along));
    const perpendicularLength = Math.hypot(perpendicularVector[0], perpendicularVector[1], perpendicularVector[2]);
    if (kindAllowed(ctx.query, "parallel")) {
      const px = perpendicularLength / worldPerPixel;
      if (px <= ctx.alignPx && Math.abs(along) / worldPerPixel >= MIN_RUBBER_BAND_PX) {
        const point = addScaled(reference, direction, along);
        candidates.push(baseCandidate({
          id: `rel:${ref.id}:parallel`,
          kind: "parallel",
          point,
          distancePx: px,
          detail: `${ref.label}에 평행`,
          axis: axisOfDirection(direction),
          direction: along < 0 ? scale(direction, -1) : direction,
          alignmentOrigin: reference,
          relation: { id: ref.id, label: ref.label },
          guides: relationGuides(ref, reference, point),
        }));
      }
    }
    if (kindAllowed(ctx.query, "perpendicular")) {
      const px = Math.abs(along) / worldPerPixel;
      if (px <= ctx.alignPx && perpendicularLength / worldPerPixel >= MIN_RUBBER_BAND_PX) {
        const point = addScaled(reference, perpendicularVector, 1);
        const perpendicularDirection = normalize(perpendicularVector);
        candidates.push(baseCandidate({
          id: `rel:${ref.id}:perpendicular`,
          kind: "perpendicular",
          point,
          distancePx: px,
          detail: `${ref.label}에 수직`,
          axis: perpendicularDirection ? axisOfDirection(perpendicularDirection) : null,
          direction: perpendicularDirection,
          alignmentOrigin: reference,
          relation: { id: ref.id, label: ref.label },
          guides: relationGuides(ref, reference, point),
        }));
      }
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------------------------
// 면
// ---------------------------------------------------------------------------------------------

interface RayVolumeHit extends StudioBg3dInferenceRayVolumeHit {
  readonly volume: StudioBg3dInferenceVolumeFeature;
}

function nearestRayVolumeHit(ctx: Context, volumes: readonly StudioBg3dInferenceVolumeFeature[]): RayVolumeHit | null {
  const ray = ctx.probe.ray;
  if (!ray) return null;
  let best: RayVolumeHit | null = null;
  for (const volume of volumes) {
    if (ctx.query.excludeSourceIds?.has(volume.sourceId)) continue;
    ctx.counters.volumesConsidered += 1;
    const hit = intersectStudioBg3dInferenceRayVolume(ray.origin, ray.direction, volume);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, volume };
  }
  return best;
}

function faceCandidate(input: {
  readonly id: string;
  readonly point: V3;
  readonly normal: V3 | null;
  readonly sourceId: string | null;
  readonly label: string | null;
}): Candidate {
  return baseCandidate({
    id: input.id,
    kind: "on-face",
    point: input.point,
    distancePx: 0,
    sourceIds: input.sourceId ? [input.sourceId] : [],
    tag: input.label,
    normal: input.normal,
  });
}

// ---------------------------------------------------------------------------------------------
// 잠금·유지(제약)
// ---------------------------------------------------------------------------------------------

interface ConstraintLine {
  readonly origin: V3;
  readonly direction: V3;
  readonly axis: StudioBg3dInferenceAxis | null;
  readonly baseKind: StudioBg3dInferenceKind;
  readonly constraint: StudioBg3dInferenceAppliedConstraint;
  readonly detail: string | null;
  readonly relation: { readonly id: string; readonly label: string } | null;
}

function resolveConstraintLine(
  query: StudioBg3dInferenceQuery,
  hold: StudioBg3dInferenceHold | null,
  reference: V3 | null,
): ConstraintLine | null {
  if (hold && hold.kind === "line") {
    const direction = normalize(hold.direction);
    if (!direction || !isFiniteVec3(hold.origin)) return null;
    return {
      origin: hold.origin,
      direction,
      axis: hold.axis ?? axisOfDirection(direction),
      baseKind: hold.from,
      constraint: { kind: "hold-line" },
      detail: null,
      relation: null,
    };
  }
  const lock = query.lock ?? { kind: "none" };
  if (!reference) return null;
  if (lock.kind === "axis") {
    return {
      origin: reference,
      direction: studioBg3dInferenceAxisVector(lock.axis),
      axis: lock.axis,
      baseKind: "axis",
      constraint: { kind: "axis", axis: lock.axis },
      detail: null,
      relation: null,
    };
  }
  if (lock.kind === "direction") {
    const direction = normalize(lock.direction);
    if (!direction) return null;
    return {
      origin: reference,
      direction,
      axis: axisOfDirection(direction),
      baseKind: lock.relation,
      constraint: { kind: "direction", relation: lock.relation },
      detail: `${lock.referenceLabel}에 ${lock.relation === "parallel" ? "평행" : "수직"}`,
      relation: { id: lock.referenceId, label: lock.referenceLabel },
    };
  }
  return null;
}

function collectLockedLineCandidates(ctx: Context, line: ConstraintLine, raw: RawFeatures): Candidate[] {
  const candidates: Candidate[] = [];
  const base = ctx.probe.closestOnLine(line.origin, line.direction);
  const lockGuide = (to: V3): StudioBg3dInferenceGuide => ({
    id: "lock:line",
    role: "lock",
    from: line.origin,
    to,
    axis: line.axis,
    dashed: false,
  });
  candidates.push(baseCandidate({
    id: "lock:base",
    kind: line.baseKind,
    point: base.point,
    distancePx: base.distance / ctx.probe.worldPerPixelAt(base.point),
    detail: line.detail,
    axis: line.axis,
    direction: line.direction,
    alignmentOrigin: line.origin,
    relation: line.relation,
    guides: [lockGuide(base.point)],
    constraint: line.constraint,
  }));
  ctx.counters.evaluated += 1;

  for (const feature of raw.points) {
    if (ctx.query.excludeSourceIds?.has(feature.sourceId)) continue;
    if (!kindAllowed(ctx.query, feature.kind)) continue;
    ctx.counters.pointsConsidered += 1;
    const px = ctx.probe.distanceToPoint(feature.point) / ctx.probe.worldPerPixelAt(feature.point);
    if (px > ctx.pointPx) continue;
    if (isOccluded(ctx, feature.point, ctx.pointPx)) continue;
    const along = dot(sub(feature.point, line.origin), line.direction);
    const projectedPoint = addScaled(line.origin, line.direction, along);
    const onLine = distance(projectedPoint, feature.point) < 1e-4;
    const point = onLine ? feature.point : projectedPoint;
    const guides: StudioBg3dInferenceGuide[] = [lockGuide(point)];
    if (!onLine) {
      guides.push({
        id: `${feature.id}:projection`,
        role: "projection",
        from: feature.point,
        to: projectedPoint,
        axis: null,
        dashed: true,
      });
    }
    candidates.push(baseCandidate({
      id: feature.id,
      kind: feature.kind,
      point,
      distancePx: px,
      sourceIds: [feature.sourceId],
      tag: feature.tag,
      axis: line.axis,
      direction: line.direction,
      alignmentOrigin: line.origin,
      guides,
      constraint: line.constraint,
      projected: !onLine,
      approximate: feature.approximate,
    }));
    ctx.counters.evaluated += 1;
  }

  if (kindAllowed(ctx.query, "intersection")) {
    const longA = addScaled(line.origin, line.direction, -20_000);
    const longB = addScaled(line.origin, line.direction, 20_000);
    for (const edge of raw.edges) {
      if (ctx.query.excludeSourceIds?.has(edge.sourceId)) continue;
      ctx.counters.edgesConsidered += 1;
      const edgeDirection = normalize(sub(edge.b, edge.a));
      if (!edgeDirection || 1 - Math.abs(dot(edgeDirection, line.direction)) < 1e-9) continue;
      const closest = closestPointsBetweenSegments(longA, longB, edge.a, edge.b);
      if (closest.distance > LOCK_LINE_TOUCH_TOLERANCE) continue;
      const crossing = closest.pointA;
      const px = ctx.probe.distanceToPoint(crossing) / ctx.probe.worldPerPixelAt(crossing);
      if (px > ctx.pointPx) continue;
      if (isOccluded(ctx, crossing, ctx.pointPx)) continue;
      candidates.push(baseCandidate({
        id: `lock×${edge.id}`,
        kind: "intersection",
        point: crossing,
        distancePx: px,
        sourceIds: [edge.sourceId],
        axis: line.axis,
        direction: line.direction,
        edgeId: edge.id,
        alignmentOrigin: line.origin,
        guides: [lockGuide(crossing), edgeGuide(edge, "x")],
        constraint: line.constraint,
        approximate: edge.approximate,
      }));
      ctx.counters.evaluated += 1;
    }
  }
  return candidates;
}

/** 커서가 평면 위에서 가리키는 점(레이는 평면 교점, 점 커서는 수직 투영). */
function resolveHeldPlaneBase(
  probe: StudioBg3dInferenceProbe,
  plane: Extract<StudioBg3dInferenceHold, { kind: "plane" }>,
): V3 | null {
  const normal = normalize(plane.normal);
  if (!normal || !isFiniteVec3(plane.point)) return null;
  let base: V3 | null = null;
  if (probe.ray) {
    const hit = intersectLineWithPlane(probe.ray.origin, probe.ray.direction, plane.point, normal);
    if (hit && hit.t > 0) base = hit.point;
  } else if (probe.anchor) {
    base = addScaled(probe.anchor, normal, -dot(sub(probe.anchor, plane.point), normal));
  }
  return base && isWithinWorldBounds(base) ? base : null;
}

function collectHeldPlaneCandidates(
  ctx: Context,
  plane: Extract<StudioBg3dInferenceHold, { kind: "plane" }>,
  base: V3,
  raw: RawFeatures,
): Candidate[] {
  const normal = normalize(plane.normal);
  if (!normal) return [];
  const worldPerPixel = ctx.probe.worldPerPixelAt(base);
  const candidates: Candidate[] = [
    baseCandidate({
      id: "hold:plane",
      kind: "on-face",
      point: base,
      distancePx: 0,
      sourceIds: plane.sourceId ? [plane.sourceId] : [],
      normal,
      constraint: { kind: "hold-plane" },
    }),
  ];
  ctx.counters.evaluated += 1;
  for (const feature of raw.points) {
    if (ctx.query.excludeSourceIds?.has(feature.sourceId)) continue;
    if (!kindAllowed(ctx.query, feature.kind)) continue;
    ctx.counters.pointsConsidered += 1;
    if (Math.abs(dot(sub(feature.point, plane.point), normal)) > PLANE_MEMBERSHIP_TOLERANCE) continue;
    const px = distance(feature.point, base) / worldPerPixel;
    if (px > ctx.pointPx) continue;
    candidates.push(baseCandidate({
      id: feature.id,
      kind: feature.kind,
      point: feature.point,
      distancePx: px,
      sourceIds: [feature.sourceId],
      tag: feature.tag,
      normal,
      constraint: { kind: "hold-plane" },
      approximate: feature.approximate,
    }));
    ctx.counters.evaluated += 1;
  }
  return candidates;
}

// ---------------------------------------------------------------------------------------------
// 결과 조립
// ---------------------------------------------------------------------------------------------

function describeCandidate(query: StudioBg3dInferenceQuery, candidate: Candidate): string | null {
  if (candidate.detail) return candidate.detail;
  if (candidate.kind === "intersection" && candidate.sourceIds.length === 2) {
    const [first, second] = candidate.sourceIds;
    if (first !== undefined && second !== undefined) {
      return `${sourceLabel(query, first) ?? first} × ${sourceLabel(query, second) ?? second}`;
    }
  }
  const firstSource = candidate.sourceIds[0];
  const name = firstSource === undefined ? null : sourceLabel(query, firstSource);
  const base = name ? (candidate.tag ? `${name} · ${candidate.tag}` : name) : candidate.tag;
  if (base && candidate.approximate) return `${base} (경계 상자 기준)`;
  return base;
}

function lockText(constraint: StudioBg3dInferenceAppliedConstraint): string {
  switch (constraint.kind) {
    case "axis":
      return ` · ${describeStudioBg3dInferenceAxis(constraint.axis)} 잠금`;
    case "direction":
      return ` · ${constraint.relation === "parallel" ? "평행" : "수직"} 잠금`;
    case "hold-line":
    case "hold-plane":
    case "hold-point":
      return " · 추론 유지";
    default:
      return "";
  }
}

/** 결과가 기준점의 다른 축 정렬선 위에 정확히 놓이면 그 축을 돌려준다(유도선을 함께 보여 주기 위함). */
function findCoincidentAxis(winner: Candidate, reference: V3 | null): StudioBg3dInferenceAxis | null {
  if (!reference || winner.constraint.kind !== "none") return null;
  if (
    winner.kind === "axis"
    || winner.kind === "parallel"
    || winner.kind === "perpendicular"
    || winner.kind === "from-point"
  ) return null;
  const offset = sub(winner.point, reference);
  for (const axis of STUDIO_BG3D_INFERENCE_AXES) {
    const unit = studioBg3dInferenceAxisVector(axis);
    const along = dot(offset, unit);
    if (Math.abs(along) > 1e-3 && distance(offset, scale(unit, along)) < 1e-4) return axis;
  }
  return null;
}

function buildResult(query: StudioBg3dInferenceQuery, winner: Candidate, reference: V3 | null): StudioBg3dInferenceResult {
  const label = studioBg3dInferenceKindLabel(winner.kind, winner.axis);
  const detail = describeCandidate(query, winner);
  const guides = [...winner.guides];
  const extraAxis = findCoincidentAxis(winner, reference);
  if (extraAxis && reference) {
    guides.push({
      id: `extra:axis:${extraAxis}`,
      role: "axis",
      from: reference,
      to: winner.point,
      axis: extraAxis,
      dashed: false,
    });
  }
  const extraText = extraAxis ? ` · ${studioBg3dInferenceKindLabel("axis", extraAxis)}` : "";
  const projectedText = winner.projected ? " · 잠금선에 투영" : "";
  return Object.freeze({
    kind: winner.kind,
    point: winner.point,
    label,
    detail,
    announcement: `${label}${detail ? ` — ${detail}` : ""}${extraText}${lockText(winner.constraint)}${projectedText}`,
    axis: winner.axis ?? extraAxis,
    direction: winner.direction,
    normal: winner.normal,
    sourceIds: winner.sourceIds,
    edgeId: winner.edgeId,
    alignmentOrigin: winner.alignmentOrigin,
    relation: winner.relation,
    guides: Object.freeze(guides),
    constraint: winner.constraint,
    projected: winner.projected,
    approximate: winner.approximate,
    distancePx: winner.kind === "free" ? null : winner.distancePx,
  });
}

function summarize(candidates: readonly Candidate[]): StudioBg3dInferenceCandidateSummary[] {
  return candidates.slice(0, MAX_RANKED).map((candidate) => ({
    kind: candidate.kind,
    point: candidate.point,
    distancePx: candidate.distancePx,
    sourceIds: candidate.sourceIds,
  }));
}

function collectGridCandidate(ctx: Context): Candidate | null {
  const grid = ctx.query.grid;
  const anchor = ctx.probe.anchor;
  if (!grid || !anchor || !kindAllowed(ctx.query, "grid") || !(grid.step > 0)) return null;
  const origin = grid.origin ?? vec3(0, 0, 0);
  const step = grid.step;
  const snapped = vec3(
    origin[0] + Math.round((anchor[0] - origin[0]) / step) * step,
    origin[1] + Math.round((anchor[1] - origin[1]) / step) * step,
    origin[2] + Math.round((anchor[2] - origin[2]) / step) * step,
  );
  const px = distance(anchor, snapped) / ctx.probe.worldPerPixelAt(anchor);
  if (px > ctx.pointPx) return null;
  ctx.counters.evaluated += 1;
  return baseCandidate({ id: "grid", kind: "grid", point: snapped, distancePx: px, tag: `${step}m`, detail: `${step}m 간격` });
}

/**
 * 한 번의 커서 샘플에 대한 추론 결과를 계산한다.
 * 같은 입력이면 항상 같은 결과를 돌려주며, 입력(색인 포함)을 변경하지 않는다.
 */
export function resolveStudioBg3dInference(query: StudioBg3dInferenceQuery): StudioBg3dInferenceOutcome {
  const probeResult = createStudioBg3dInferenceProbe(query.cursor);
  if (!probeResult.ok) {
    return failureOutcome(
      probeResult.reason,
      probeResult.reason === "invalid-cursor"
        ? "커서 위치가 올바르지 않아 추론을 건너뜁니다."
        : "화면 배율이 올바르지 않아 추론을 건너뜁니다.",
    );
  }
  const probe = probeResult.probe;
  const reference = query.referencePoint ?? null;
  if (reference !== null && (!isFiniteVec3(reference) || !isWithinWorldBounds(reference))) {
    return failureOutcome("invalid-reference", "기준점 좌표가 올바르지 않아 추론을 건너뜁니다.");
  }

  const pointerScale = POINTER_SCALE[query.pointer ?? "mouse"];
  const thresholds = query.thresholds ?? {};
  const pointPx = (thresholds.pointPx ?? STUDIO_BG3D_INFERENCE_THRESHOLD_PX.point) * pointerScale;
  const edgePx = (thresholds.edgePx ?? STUDIO_BG3D_INFERENCE_THRESHOLD_PX.edge) * pointerScale;
  const alignPx = (thresholds.alignPx ?? STUDIO_BG3D_INFERENCE_THRESHOLD_PX.align) * pointerScale;
  const counters: Counters = {
    pointsConsidered: 0,
    edgesConsidered: 0,
    volumesConsidered: 0,
    intersectionPairs: 0,
    evaluated: 0,
  };

  const widest = Math.max(pointPx, edgePx, alignPx);
  // 평면 유지 중에는 커서가 아니라 커서를 평면에 투영한 점 주변의 특징이 후보다.
  const hold = query.hold ?? null;
  const heldPlaneBase = hold && hold.kind === "plane" ? resolveHeldPlaneBase(probe, hold) : null;
  const querySegment = heldPlaneBase ? { a: heldPlaneBase, b: heldPlaneBase } : probe.querySegment;
  const raw = query.index.query({
    a: querySegment.a,
    b: querySegment.b,
    radius: widest * probe.worldPerPixelAt(querySegment.a),
    radiusEnd: widest * probe.worldPerPixelAt(querySegment.b),
  });

  // 레이 모드에서는 상자·평면 조각과의 정확한 첫 교점이 가림 판정의 기준이 된다.
  const baseContext: Context = { query, probe, pointPx, edgePx, alignPx, counters, occlusionLimit: probe.occlusionDepth };
  const rayVolumeHit = !query.cursor.surfaceHit && probe.mode === "ray" && kindAllowed(query, "on-face")
    ? nearestRayVolumeHit(baseContext, raw.volumes)
    : null;
  const occlusionLimit = rayVolumeHit
    ? Math.min(rayVolumeHit.t, probe.occlusionDepth ?? Infinity)
    : probe.occlusionDepth;
  const ctx: Context = { ...baseContext, occlusionLimit };

  const preferKinds = query.preferKinds ?? null;
  let candidates: Candidate[] = [];

  const heldPoint = hold && hold.kind === "point" && isFiniteVec3(hold.point) ? hold : null;
  const constraintLine = heldPoint ? null : resolveConstraintLine(query, hold, reference);
  const heldPlane = !constraintLine && hold && hold.kind === "plane" ? hold : null;

  if (heldPoint) {
    candidates.push(baseCandidate({
      id: "hold:point",
      kind: heldPoint.from,
      point: heldPoint.point,
      distancePx: 0,
      detail: "유지한 점",
      constraint: { kind: "hold-point" },
    }));
    counters.evaluated += 1;
  } else if (constraintLine) {
    candidates = collectLockedLineCandidates(ctx, constraintLine, raw);
  } else if (heldPlane && heldPlaneBase) {
    candidates = collectHeldPlaneCandidates(ctx, heldPlane, heldPlaneBase, raw);
  }

  if (candidates.length === 0) {
    const pointCandidates = collectPointCandidates(ctx, raw.points);
    const wantsEdges = kindAllowed(query, "on-edge") || kindAllowed(query, "intersection");
    const edgeHits = wantsEdges ? collectEdgeHits(ctx, raw.edges) : [];
    const edgeCandidates = kindAllowed(query, "on-edge")
      ? edgeHits.filter((hit) => hit.distancePx <= edgePx).map(edgeCandidate)
      : [];
    const intersectionCandidates = kindAllowed(query, "intersection") ? collectIntersections(ctx, edgeHits) : [];
    candidates.push(...pointCandidates, ...edgeCandidates, ...intersectionCandidates);

    if (reference) {
      candidates.push(...collectAlignmentCandidates(ctx, reference));
      candidates.push(...collectRelationCandidates(ctx, reference));
    }

    if (kindAllowed(query, "on-face")) {
      const surfaceHit = query.cursor.surfaceHit;
      if (surfaceHit && isFiniteVec3(surfaceHit.point)) {
        candidates.push(faceCandidate({
          id: `face:${surfaceHit.sourceId ?? "surface"}`,
          point: surfaceHit.point,
          normal: surfaceHit.normal && isFiniteVec3(surfaceHit.normal) ? normalize(surfaceHit.normal) : null,
          sourceId: surfaceHit.sourceId ?? null,
          label: surfaceHit.label ?? null,
        }));
        counters.evaluated += 1;
      } else if (rayVolumeHit && (probe.anchorKind !== "ground" || rayVolumeHit.t < (probe.occlusionDepth ?? Infinity))) {
        candidates.push(faceCandidate({
          id: `face:${rayVolumeHit.volume.id}`,
          point: rayVolumeHit.point,
          normal: rayVolumeHit.normal,
          sourceId: rayVolumeHit.volume.sourceId,
          label: "면",
        }));
        counters.evaluated += 1;
      } else if (probe.anchorKind === "ground" && probe.anchor) {
        candidates.push(faceCandidate({
          id: "face:ground",
          point: probe.anchor,
          normal: studioBg3dInferenceAxisVector(STUDIO_BG3D_INFERENCE_UP_AXIS),
          sourceId: null,
          label: "바닥",
        }));
        counters.evaluated += 1;
      }
    }

    const gridCandidate = collectGridCandidate(ctx);
    if (gridCandidate) candidates.push(gridCandidate);
  }

  if (query.enabledKinds) {
    const enabled = query.enabledKinds;
    candidates = candidates.filter((candidate) => enabled.has(candidate.kind));
  }
  candidates.sort((left, right) => compareCandidates(left, right, preferKinds));

  let winner = candidates[0] ?? null;
  if (!winner) {
    if (!probe.anchor) return failureOutcome("no-target", "커서 아래에 잡을 수 있는 위치가 없습니다.");
    winner = baseCandidate({ id: "free", kind: "free", point: probe.anchor, distancePx: 0 });
  }

  return Object.freeze({
    ok: true,
    result: buildResult(query, winner, reference),
    ranked: Object.freeze(summarize(candidates.length > 0 ? candidates : [winner])),
    stats: Object.freeze({
      evaluated: counters.evaluated,
      pointsConsidered: counters.pointsConsidered,
      edgesConsidered: counters.edgesConsidered,
      volumesConsidered: counters.volumesConsidered,
      intersectionPairs: counters.intersectionPairs,
      cellsVisited: raw.stats.cellsVisited,
      featuresScanned: raw.stats.featuresScanned,
      truncated: raw.stats.truncated,
    }),
  });
}

/**
 * 기준점에 닿아 있는 모서리의 방향 — 평행·수직 추론의 기본 기준이다.
 * 기준점이 바뀔 때 한 번만 계산해 `referenceDirections`로 넘기면 포인터 이동마다 다시 구하지 않는다.
 */
export function collectStudioBg3dInferenceIncidentDirections(
  index: StudioBg3dInferenceQuery["index"],
  referencePoint: V3,
  limit: number = STUDIO_BG3D_INFERENCE_BUDGET.maxReferenceDirections,
): StudioBg3dInferenceReferenceDirection[] {
  if (!isFiniteVec3(referencePoint) || !isWithinWorldBounds(referencePoint)) return [];
  const raw = index.query({ a: referencePoint, b: referencePoint, radius: 1e-3 });
  const directions: StudioBg3dInferenceReferenceDirection[] = [];
  const seen = new Set<string>();
  const keyOf = (direction: V3): string =>
    `${direction[0].toFixed(5)},${direction[1].toFixed(5)},${direction[2].toFixed(5)}`;
  for (const edge of raw.edges) {
    if (directions.length >= limit) break;
    const startsHere = distance(edge.a, referencePoint) < 1e-4;
    const endsHere = distance(edge.b, referencePoint) < 1e-4;
    if (!startsHere && !endsHere) continue;
    const direction = normalize(startsHere ? sub(edge.b, edge.a) : sub(edge.a, edge.b));
    if (!direction) continue;
    if (seen.has(keyOf(direction)) || seen.has(keyOf(scale(direction, -1)))) continue;
    seen.add(keyOf(direction));
    directions.push({
      id: edge.id,
      label: `${index.source.labels.get(edge.sourceId) ?? edge.sourceId} ${edge.tag}`,
      direction,
      segment: { a: edge.a, b: edge.b },
    });
  }
  return directions;
}
