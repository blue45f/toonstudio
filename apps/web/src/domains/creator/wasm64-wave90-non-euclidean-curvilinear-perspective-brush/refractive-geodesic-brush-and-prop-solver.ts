/**
 * Wave 90 — 실시간 곡면 굴절 브러시 및 3D 프롭 곡면 보정 솔버.
 *
 * - 평면 교차 및 측지선 소실점 스냅(`free | x | y | z | auto-dominant`)
 * - 야코비안 특잇값 기반 타원형 브러시 닙 단축·이방성·투명도 변조
 * - 3D 건축물·아치 출입구·열주·액션 집중선 터널의 곡면 변환, 후면 컬링, 깊이 정렬
 * - WebGPU WGSL 셰이더 생성/검증기는 `curvilinear-wgsl-shader-kernel`에서 재노출
 */

import {
  addVec3,
  buildCurvilinearCameraBasis,
  clampNumber,
  computeCurvilinearJacobian,
  dotVec3,
  lengthVec3,
  lerpVec3,
  normalizeVec3,
  projectWorld3DToCurvilinear2D,
  sampleWorldSegmentAsGeodesic,
  scaleVec3,
  subVec3,
  unprojectCurvilinear2DToRay3D,
  type CurvilinearCameraConfig,
  type CurvilinearHemisphere,
  type Vec2,
  type Vec3,
} from "./curvilinear-projection-field";
import {
  buildCurvilinearPropGeometry,
  type CurvilinearBentEdgeCurve,
  type CurvilinearBentPropResult,
  type CurvilinearPropSpec,
} from "./curvilinear-prop-geometry";

export {
  buildCurvilinearRefractionWgsl,
  validateCurvilinearWgsl,
  type CurvilinearWgslShaderArtifact,
  type WgslBindingDescriptor,
  type WgslValidationReport,
} from "./curvilinear-wgsl-shader-kernel";

export {
  buildCurvilinearPropGeometry,
  type ActionSpeedlineTunnelPropSpec,
  type ArchDoorwayPropSpec,
  type BentCurveRole,
  type BoxBuildingPropSpec,
  type BuiltPropGeometry,
  type CurvilinearBentEdgeCurve,
  type CurvilinearBentPropResult,
  type CurvilinearPropPresetKind,
  type CurvilinearPropSpec,
  type PillarRowPropSpec,
  type RawPropEdge,
  type RawPropFace,
} from "./curvilinear-prop-geometry";

export type CurvilinearDrawingPlaneKind =
  | "floor"
  | "ceiling"
  | "left-wall"
  | "right-wall"
  | "front-wall"
  | "custom-plane";

export interface CurvilinearDrawingPlane {
  readonly kind: CurvilinearDrawingPlaneKind;
  readonly offsetDistance: number;
  readonly normal?: Vec3;
  readonly anchorPoint?: Vec3;
}

export interface ResolvedPlane3D {
  readonly normal: Vec3;
  readonly anchor: Vec3;
}

export interface StylusSampleInput {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs: number;
}

export type GeodesicSnapAxis = "free" | "x" | "y" | "z" | "auto-dominant";
export type ResolvedSnapAxis = "free" | "x" | "y" | "z";

export interface RefractiveBrushOptions {
  readonly baseBrushWidthPx: number;
  readonly baseOpacity?: number;
  readonly snapAxis?: GeodesicSnapAxis;
  readonly snapStrength?: number;
  readonly smoothingPasses?: number;
  readonly resampleSpacingPx?: number;
  readonly referenceDistanceM?: number;
  readonly minNibWidthPx?: number;
  readonly maxNibWidthPx?: number;
  readonly maxPlaneIntersectionDistM?: number;
}

export interface BrushNibEllipse {
  readonly widthPx: number;
  readonly minorWidthPx: number;
  readonly nibAngleRad: number;
  readonly opacityScale: number;
}

export interface RefractedBrushStamp {
  readonly x: number;
  readonly y: number;
  readonly worldPoint: Vec3;
  readonly depth: number;
  readonly hemisphere: CurvilinearHemisphere;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly nib: BrushNibEllipse;
  readonly foreshorteningRatio: number;
  readonly anisotropyRatio: number;
  readonly planeHit: boolean;
}

export interface RefractedBrushStrokeResult {
  readonly stamps: readonly RefractedBrushStamp[];
  readonly resolvedSnapAxis: ResolvedSnapAxis;
  readonly meanSnapResidualPx: number;
  readonly maxSnapResidualPx: number;
  readonly totalArcLengthPx: number;
  readonly maxBendDeviationPx: number;
  readonly planeHitRate: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly minForeshorteningRatio: number;
  readonly maxForeshorteningRatio: number;
}

const AXIS_VECTORS: Record<"x" | "y" | "z", Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

/**
 * 평면 프리셋과 카메라 눈 위치를 기준으로 3D 해석 평면(법선 + 기준점)을 결정한다.
 */
export function resolveDrawingPlane3D(
  plane: CurvilinearDrawingPlane,
  camera: CurvilinearCameraConfig,
): ResolvedPlane3D {
  const eye = camera.eyePosition;
  const dist = Math.max(0.1, Math.abs(plane.offsetDistance));
  let normal: Vec3;
  let defaultAnchor: Vec3;

  switch (plane.kind) {
    case "floor":
      normal = { x: 0, y: 1, z: 0 };
      defaultAnchor = { x: eye.x, y: eye.y - dist, z: eye.z };
      break;
    case "ceiling":
      normal = { x: 0, y: -1, z: 0 };
      defaultAnchor = { x: eye.x, y: eye.y + dist, z: eye.z };
      break;
    case "left-wall":
      normal = { x: 1, y: 0, z: 0 };
      defaultAnchor = { x: eye.x - dist, y: eye.y, z: eye.z };
      break;
    case "right-wall":
      normal = { x: -1, y: 0, z: 0 };
      defaultAnchor = { x: eye.x + dist, y: eye.y, z: eye.z };
      break;
    case "front-wall":
      normal = { x: 0, y: 0, z: -1 };
      defaultAnchor = { x: eye.x, y: eye.y, z: eye.z + dist };
      break;
    case "custom-plane": {
      const customNormal = normalizeVec3(plane.normal ?? { x: 0, y: 1, z: 0 });
      normal = customNormal;
      defaultAnchor = addVec3(eye, scaleVec3(customNormal, -plane.offsetDistance));
      break;
    }
  }
  return { normal, anchor: plane.anchorPoint ?? defaultAnchor };
}

function intersectRayWithPlane3D(
  origin: Vec3,
  direction: Vec3,
  resolvedPlane: ResolvedPlane3D,
  maxDistance: number,
  fallbackDistance: number,
): { readonly hit: boolean; readonly point: Vec3 } {
  const denom = dotVec3(direction, resolvedPlane.normal);
  if (Math.abs(denom) > 1e-5) {
    const t = dotVec3(subVec3(resolvedPlane.anchor, origin), resolvedPlane.normal) / denom;
    if (t > 0.05 && t <= maxDistance) {
      return { hit: true, point: addVec3(origin, scaleVec3(direction, t)) };
    }
  }
  return { hit: false, point: addVec3(origin, scaleVec3(direction, fallbackDistance)) };
}

function chooseDominantSnapAxis(points3D: readonly Vec3[], planeNormal: Vec3): ResolvedSnapAxis {
  if (points3D.length < 2) return "free";
  const first = points3D[0];
  const last = points3D[points3D.length - 1];
  if (!first || !last) return "free";
  const netDelta = subVec3(last, first);
  if (lengthVec3(netDelta) <= 1e-5) return "free";

  const unitDelta = normalizeVec3(netDelta);
  let bestAxis: "x" | "y" | "z" = "z";
  let bestScore = -1;
  for (const axis of ["x", "y", "z"] as const) {
    const axisVec = AXIS_VECTORS[axis];
    if (Math.abs(dotVec3(axisVec, planeNormal)) > 0.9) continue;
    const score = Math.abs(dotVec3(unitDelta, axisVec));
    if (score > bestScore) {
      bestScore = score;
      bestAxis = axis;
    }
  }
  return bestScore >= 0 ? bestAxis : "free";
}

function smooth3DPolylinePreservingEnds(points: readonly Vec3[], passes: number): readonly Vec3[] {
  if (passes <= 0 || points.length <= 2) return points;
  let current = points.slice();
  const count = Math.min(4, Math.max(0, Math.round(passes)));
  for (let pass = 0; pass < count; pass += 1) {
    const next = current.slice();
    for (let i = 1; i < current.length - 1; i += 1) {
      const prev = current[i - 1];
      const mid = current[i];
      const after = current[i + 1];
      if (!prev || !mid || !after) continue;
      next[i] = {
        x: prev.x * 0.25 + mid.x * 0.5 + after.x * 0.25,
        y: prev.y * 0.25 + mid.y * 0.5 + after.y * 0.25,
        z: prev.z * 0.25 + mid.z * 0.5 + after.z * 0.25,
      };
    }
    current = next;
  }
  return current;
}

function measureMaxChordDeviation2D(points: readonly Vec2[]): number {
  if (points.length < 3) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  let maxDev = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const dev =
      len <= 1e-6
        ? Math.hypot(pt.x - start.x, pt.y - start.y)
        : Math.abs(dy * pt.x - dx * pt.y + end.x * start.y - end.y * start.x) / len;
    if (dev > maxDev) maxDev = dev;
  }
  return maxDev;
}

/**
 * 스타일러스 2D 획을 곡면 투시 3D 평면으로 역투영·스냅·재투영하고,
 * 야코비안 단축률에 맞춰 타원형 브러시 닙 크기·회전각·투명도를 실시간 변조한다.
 */
export function refractBrushStrokeInCurvilinearSpace(
  samples: readonly StylusSampleInput[],
  camera: CurvilinearCameraConfig,
  plane: CurvilinearDrawingPlane,
  options: RefractiveBrushOptions,
): RefractedBrushStrokeResult {
  if (samples.length === 0) {
    return {
      stamps: [],
      resolvedSnapAxis: "free",
      meanSnapResidualPx: 0,
      maxSnapResidualPx: 0,
      totalArcLengthPx: 0,
      maxBendDeviationPx: 0,
      planeHitRate: 0,
      minWidthPx: 0,
      maxWidthPx: 0,
      minForeshorteningRatio: 1,
      maxForeshorteningRatio: 1,
    };
  }

  const baseBrushWidthPx = Math.max(0.5, options.baseBrushWidthPx);
  const baseOpacity = clampNumber(options.baseOpacity ?? 1, 0.05, 1);
  const requestedAxis: GeodesicSnapAxis = options.snapAxis ?? "free";
  const snapStrength = clampNumber(options.snapStrength ?? (requestedAxis === "free" ? 0 : 1), 0, 1);
  const smoothingPasses = clampNumber(options.smoothingPasses ?? 1, 0, 4);
  const resampleSpacingPx = Math.max(1, options.resampleSpacingPx ?? 6);
  const referenceDistanceM = Math.max(0.5, options.referenceDistanceM ?? 4);
  const minNibWidthPx = Math.max(0.25, options.minNibWidthPx ?? 0.5);
  const maxNibWidthPx = Math.max(minNibWidthPx, options.maxNibWidthPx ?? baseBrushWidthPx * 2.5);
  const maxPlaneDist = Math.max(5, options.maxPlaneIntersectionDistM ?? 200);

  const resolvedPlane = resolveDrawingPlane3D(plane, camera);
  let hitCount = 0;
  const rawSamples = samples.map((sample) => {
    const ray = unprojectCurvilinear2DToRay3D({ x: sample.x, y: sample.y }, camera);
    const hitInfo = intersectRayWithPlane3D(ray.origin, ray.direction, resolvedPlane, maxPlaneDist, referenceDistanceM);
    if (hitInfo.hit) hitCount += 1;
    return {
      orig2D: { x: sample.x, y: sample.y },
      world3D: hitInfo.point,
      pressure: clampNumber(sample.pressure, 0.05, 1),
      tiltX: clampNumber(sample.tiltX ?? 0, -1, 1),
      tiltY: clampNumber(sample.tiltY ?? 0, -1, 1),
      timestampMs: sample.timestampMs,
      planeHit: hitInfo.hit,
    };
  });

  const rawPoints3D = rawSamples.map((s) => s.world3D);
  const resolvedSnapAxis: ResolvedSnapAxis =
    requestedAxis === "auto-dominant"
      ? chooseDominantSnapAxis(rawPoints3D, resolvedPlane.normal)
      : requestedAxis;

  let snapped3D = rawPoints3D;
  if (resolvedSnapAxis !== "free" && snapStrength > 0 && rawPoints3D[0]) {
    const anchor3D = rawPoints3D[0];
    const axisVec = AXIS_VECTORS[resolvedSnapAxis];
    snapped3D = rawPoints3D.map((pt) => {
      const onLine = addVec3(anchor3D, scaleVec3(axisVec, dotVec3(subVec3(pt, anchor3D), axisVec)));
      return lerpVec3(pt, onLine, snapStrength);
    });
  }

  const smoothed3D = smooth3DPolylinePreservingEnds(snapped3D, smoothingPasses);
  let residualSum = 0;
  let maxSnapResidualPx = 0;
  const controlProjected: Vec2[] = [];

  for (let i = 0; i < smoothed3D.length; i += 1) {
    const p3 = smoothed3D[i];
    const raw = rawSamples[i];
    if (!p3 || !raw) continue;
    const proj = projectWorld3DToCurvilinear2D(p3, camera);
    controlProjected.push({ x: proj.x, y: proj.y });
    const residual = Math.hypot(proj.x - raw.orig2D.x, proj.y - raw.orig2D.y);
    residualSum += residual;
    if (residual > maxSnapResidualPx) maxSnapResidualPx = residual;
  }

  const basis = buildCurvilinearCameraBasis(camera);
  const refJac = computeCurvilinearJacobian(
    addVec3(camera.eyePosition, scaleVec3(basis.forward, referenceDistanceM)),
    camera,
  );
  const refSigmaMax = Math.max(refJac.sigmaMax, 1e-6);
  const refSigmaMin = Math.max(refJac.sigmaMin, 1e-6);

  const stamps: RefractedBrushStamp[] = [];
  const stampPoints2D: Vec2[] = [];

  const emitStamp = (
    worldPoint: Vec3,
    pressure: number,
    tiltX: number,
    tiltY: number,
    timestampMs: number,
    planeHit: boolean,
  ): void => {
    const proj = projectWorld3DToCurvilinear2D(worldPoint, camera);
    const jac = computeCurvilinearJacobian(worldPoint, camera);
    const majorRatio = clampNumber(jac.sigmaMax / refSigmaMax, 0.06, 2.5);
    const minorRatio = clampNumber(jac.sigmaMin / refSigmaMin, 0.06, 2.5);
    const pressureCurve = 0.2 + 0.8 * clampNumber(pressure, 0.05, 1);
    const tiltFactor = 1 + 0.3 * Math.min(1, Math.hypot(tiltX, tiltY));

    const widthPx = clampNumber(baseBrushWidthPx * pressureCurve * majorRatio * tiltFactor, minNibWidthPx, maxNibWidthPx);
    const minorWidthPx = clampNumber(baseBrushWidthPx * pressureCurve * minorRatio, minNibWidthPx * 0.5, widthPx);
    const opacityScale = clampNumber(
      baseOpacity * (0.45 + 0.55 * pressure) * clampNumber(Math.pow(minorRatio, 0.3), 0.35, 1),
      0.05,
      1,
    );

    stamps.push({
      x: proj.x,
      y: proj.y,
      worldPoint,
      depth: proj.depth,
      hemisphere: proj.hemisphere,
      pressure,
      timestampMs,
      nib: { widthPx, minorWidthPx, nibAngleRad: jac.principalAngleRad, opacityScale },
      foreshorteningRatio: Math.sqrt(majorRatio * minorRatio),
      anisotropyRatio: jac.anisotropyRatio,
      planeHit,
    });
    stampPoints2D.push({ x: proj.x, y: proj.y });
  };

  if (rawSamples[0] && smoothed3D[0]) {
    emitStamp(
      smoothed3D[0],
      rawSamples[0].pressure,
      rawSamples[0].tiltX,
      rawSamples[0].tiltY,
      rawSamples[0].timestampMs,
      rawSamples[0].planeHit,
    );
  }

  for (let i = 1; i < smoothed3D.length; i += 1) {
    const pA = smoothed3D[i - 1];
    const pB = smoothed3D[i];
    const rA = rawSamples[i - 1];
    const rB = rawSamples[i];
    const cA = controlProjected[i - 1];
    const cB = controlProjected[i];
    if (!pA || !pB || !rA || !rB || !cA || !cB) continue;

    const steps = Math.max(1, Math.min(64, Math.ceil(Math.hypot(cB.x - cA.x, cB.y - cA.y) / resampleSpacingPx)));
    for (let s = 1; s <= steps; s += 1) {
      const u = s / steps;
      emitStamp(
        lerpVec3(pA, pB, u),
        rA.pressure + (rB.pressure - rA.pressure) * u,
        rA.tiltX + (rB.tiltX - rA.tiltX) * u,
        rA.tiltY + (rB.tiltY - rA.tiltY) * u,
        rA.timestampMs + (rB.timestampMs - rA.timestampMs) * u,
        rA.planeHit && rB.planeHit,
      );
    }
  }

  let totalArcLengthPx = 0;
  let minWidthPx = Number.POSITIVE_INFINITY;
  let maxWidthPx = 0;
  let minForeshorteningRatio = Number.POSITIVE_INFINITY;
  let maxForeshorteningRatio = 0;

  for (let i = 0; i < stamps.length; i += 1) {
    const st = stamps[i];
    if (!st) continue;
    if (st.nib.widthPx < minWidthPx) minWidthPx = st.nib.widthPx;
    if (st.nib.widthPx > maxWidthPx) maxWidthPx = st.nib.widthPx;
    if (st.foreshorteningRatio < minForeshorteningRatio) minForeshorteningRatio = st.foreshorteningRatio;
    if (st.foreshorteningRatio > maxForeshorteningRatio) maxForeshorteningRatio = st.foreshorteningRatio;
    const prev = i > 0 ? stamps[i - 1] : undefined;
    if (prev && prev.hemisphere === st.hemisphere) {
      totalArcLengthPx += Math.hypot(st.x - prev.x, st.y - prev.y);
    }
  }

  return {
    stamps,
    resolvedSnapAxis,
    meanSnapResidualPx: residualSum / Math.max(1, smoothed3D.length),
    maxSnapResidualPx,
    totalArcLengthPx,
    maxBendDeviationPx: measureMaxChordDeviation2D(stampPoints2D),
    planeHitRate: hitCount / Math.max(1, rawSamples.length),
    minWidthPx: Number.isFinite(minWidthPx) ? minWidthPx : 0,
    maxWidthPx,
    minForeshorteningRatio: Number.isFinite(minForeshorteningRatio) ? minForeshorteningRatio : 1,
    maxForeshorteningRatio,
  };
}

/**
 * 3D 파라메트릭 프롭을 곡면 투시 2D 측지선 곡선 집합으로 변환하고,
 * 면 가시성 컬링 및 화가 알고리즘(원거리→근거리) 깊이 정렬을 수행한다.
 */
export function bend3DPropIntoCurvilinearCurves(
  prop: CurvilinearPropSpec,
  camera: CurvilinearCameraConfig,
): CurvilinearBentPropResult {
  const { faces, edges, label } = buildCurvilinearPropGeometry(prop);
  const curveSteps = Math.max(8, Math.min(96, Math.round(prop.curveSteps ?? 20)));
  const faceFrontFlags = faces.map((f) => dotVec3(f.outwardNormal, subVec3(camera.eyePosition, f.center)) >= -1e-4);

  let visibleFaceCount = 0;
  let culledBackFaceCount = 0;
  for (const isFront of faceFrontFlags) {
    if (isFront) visibleFaceCount += 1;
    else culledBackFaceCount += 1;
  }

  const bentCurves: CurvilinearBentEdgeCurve[] = [];
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = 0;
  let maxBendDeviationPx = 0;
  let bendSum = 0;

  for (const edge of edges) {
    const frontFacing = edge.faceIndices.length === 0 || edge.faceIndices.some((fi) => faceFrontFlags[fi] === true);
    const avgDepth = lengthVec3(subVec3(lerpVec3(edge.start, edge.end, 0.5), camera.eyePosition));
    const polyline = sampleWorldSegmentAsGeodesic(edge.start, edge.end, camera, curveSteps);
    if (polyline.segments.length === 0) continue;

    if (avgDepth < minDepth) minDepth = avgDepth;
    if (avgDepth > maxDepth) maxDepth = avgDepth;
    if (polyline.maxBendDeviationPx > maxBendDeviationPx) maxBendDeviationPx = polyline.maxBendDeviationPx;
    bendSum += polyline.maxBendDeviationPx;
    bentCurves.push({ edgeId: edge.id, role: edge.role, avgDepth, frontFacing, polyline });
  }

  bentCurves.sort((a, b) => b.avgDepth - a.avgDepth);
  return {
    propId: prop.id,
    kind: prop.kind,
    label,
    curves: bentCurves,
    culledBackFaceCount,
    visibleFaceCount,
    totalEdgeCount: edges.length,
    visibleEdgeCount: bentCurves.length,
    maxBendDeviationPx,
    meanBendDeviationPx: bentCurves.length > 0 ? bendSum / bentCurves.length : 0,
    depthRange: { minDepth: Number.isFinite(minDepth) ? minDepth : 0, maxDepth },
  };
}
