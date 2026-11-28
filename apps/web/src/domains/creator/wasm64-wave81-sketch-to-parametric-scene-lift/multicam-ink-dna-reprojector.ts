/**
 * Wave 81 — 다각도 가상 카메라 재투영, 해석적 은선 제거(HLR), 작가 선화(Ink DNA) 일관성 엔진.
 *
 * - 3D 파라메트릭 씬의 월드 좌표와 미터 치수를 100% 불변으로 보존하며 임의의 카메라 회전·돌리·렌즈 변화를 적용한다.
 * - 볼록 OBB 앞/뒷면 법선 판별과 해석적 광선-OBB 슬랩 교차 + 이분 탐색 경계 정밀화로 은선을 제거(HLR)한다.
 * - 엣지 역할 계층, 원근 깊이 감쇠(`1/depth`), 결정적 수작업 펜 떨림·테이퍼(Artist Ink DNA)와 소실점 가이드를 생성한다.
 */

import {
  buildCameraBasis,
  projectDirectionToVanishingPoint,
  projectWorldPointToScreen,
  type ArchitecturalPlane3d,
  type CalibratedCameraState,
  type ParametricBoxProp3d,
  type ParametricScene3d,
  type PerspectiveType,
  type Vec2,
  type Vec3,
} from "./perspective-vanishing-point-lifter";

export type InkEdgeRole = "silhouette-outer" | "structural-corner" | "prop-detail" | "surface-texture";

export interface CameraRigDelta {
  readonly deltaYawDeg?: number;
  readonly deltaPitchDeg?: number;
  readonly deltaRollDeg?: number;
  readonly dollyMeters?: number;
  readonly truckMeters?: number;
  readonly pedestalMeters?: number;
  readonly focalLengthMm?: number;
}

export interface ArtistInkDnaConfig {
  readonly profileName?: string;
  readonly baseWidthPx: number;
  readonly silhouetteBoost: number;
  readonly structuralWeightMultiplier?: number;
  readonly detailWeightMultiplier?: number;
  readonly textureWeightMultiplier?: number;
  readonly depthAttenuationStrength?: number;
  readonly referenceDepthMeters?: number;
  readonly wobbleAmplitudePx: number;
  readonly wobbleFrequency?: number;
  readonly taperRatio: number;
  readonly minStrokeWidthPx?: number;
  readonly maxStrokeWidthPx?: number;
  readonly deterministicSeed?: number;
}

export interface ResolvedArtistInkDnaConfig {
  readonly profileName: string;
  readonly baseWidthPx: number;
  readonly silhouetteBoost: number;
  readonly structuralWeightMultiplier: number;
  readonly detailWeightMultiplier: number;
  readonly textureWeightMultiplier: number;
  readonly depthAttenuationStrength: number;
  readonly referenceDepthMeters: number;
  readonly wobbleAmplitudePx: number;
  readonly wobbleFrequency: number;
  readonly taperRatio: number;
  readonly minStrokeWidthPx: number;
  readonly maxStrokeWidthPx: number;
  readonly deterministicSeed: number;
}

export interface ProjectedInkSegment2d {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly sourceEntityKind: "enclosure" | "prop";
  readonly edgeRole: InkEdgeRole;
  readonly startPx: Vec2;
  readonly endPx: Vec2;
  readonly polylinePx: readonly Vec2[];
  readonly strokeWidthPx: number;
  readonly startTipWidthPx: number;
  readonly endTipWidthPx: number;
  readonly meanDepthMeters: number;
  readonly visibilityRatio: number;
  readonly worldStartMeters: Vec3;
  readonly worldEndMeters: Vec3;
}

export interface PerspectiveConvergenceRay2d {
  readonly axis: "x" | "y" | "z";
  readonly startPx: Vec2;
  readonly endPx: Vec2;
}

export interface PerspectiveGuideOverlay {
  readonly horizonLine: { readonly startPx: Vec2; readonly endPx: Vec2; readonly yAtCenterPx: number };
  readonly vanishingPoints: { readonly vpX: Vec2 | null; readonly vpZ: Vec2 | null; readonly vpY: Vec2 | null };
  readonly convergenceRays: readonly PerspectiveConvergenceRay2d[];
}

export interface WorldPropAnchorSnapshot {
  readonly id: string;
  readonly label: string;
  readonly category: ParametricBoxProp3d["category"];
  readonly centerMeters: Vec3;
  readonly sizeMeters: Vec3;
  readonly yawDeg: number;
  readonly minYMeters: number;
  readonly maxYMeters: number;
  readonly projectedCenterPx: Vec2 | null;
  readonly depthMeters: number | null;
  readonly inFrustum: boolean;
}

export interface HlrVisibilityStats {
  readonly totalCandidateEdges: number;
  readonly visibleEdgeCount: number;
  readonly partiallyOccludedEdgeCount: number;
  readonly fullyOccludedEdgeCount: number;
  readonly frustumCulledEdgeCount: number;
  readonly occludedEdgeCount: number;
}

export interface ReprojectionOptions {
  readonly nearPlaneMeters?: number;
  readonly hlrSamplesPerEdge?: number;
  readonly includeSurfaceTextureGrid?: boolean;
  readonly includePropDetails?: boolean;
}

export interface ReprojectedSceneResult {
  readonly sceneId: string;
  readonly camera: CalibratedCameraState;
  readonly inkDna: ResolvedArtistInkDnaConfig;
  readonly visibleSegments: readonly ProjectedInkSegment2d[];
  readonly perspectiveGuides: PerspectiveGuideOverlay;
  readonly propAnchors: readonly WorldPropAnchorSnapshot[];
  readonly hlrStats: HlrVisibilityStats;
  readonly zeroDriftVerified: boolean;
}

export interface OrientedBoxWorldGeometry {
  readonly prop: ParametricBoxProp3d;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
  readonly faceNormals: readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
  readonly faceCenters: readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
  readonly cosYaw: number;
  readonly sinYaw: number;
  readonly halfExtents: Vec3;
}

interface CandidateEdge3d {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly sourceEntityKind: "enclosure" | "prop";
  readonly edgeRole: InkEdgeRole;
  readonly start: Vec3;
  readonly end: Vec3;
}

interface PlaneOccluder {
  readonly id: string;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly normal: Vec3;
}

const FULL_FRAME_SENSOR_WIDTH_MM = 36;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-8;

const BOX_EDGE_FACE_PAIRS: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 0, 5], [1, 2, 2, 5], [2, 3, 1, 5], [3, 0, 3, 5],
  [4, 5, 0, 4], [5, 6, 2, 4], [6, 7, 1, 4], [7, 4, 3, 4],
  [0, 4, 0, 3], [1, 5, 0, 2], [2, 6, 1, 2], [3, 7, 1, 3],
];

const BOX_FACE_CORNER_INDICES: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0],
];

const LOCAL_FACE_NORMALS: readonly Vec3[] = [
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});

function hashStringDeterministic(text: string, seed: number): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/** 작가 선화(Ink DNA) 설정의 누락된 필드를 안전한 기본값으로 정규화한다. */
export function resolveArtistInkDnaConfig(config: ArtistInkDnaConfig): ResolvedArtistInkDnaConfig {
  return {
    profileName: config.profileName ?? "standard-gpen-ink",
    baseWidthPx: clamp(config.baseWidthPx, 0.4, 8.0),
    silhouetteBoost: clamp(config.silhouetteBoost, 1.05, 3.2),
    structuralWeightMultiplier: clamp(config.structuralWeightMultiplier ?? 1.22, 0.7, 2.2),
    detailWeightMultiplier: clamp(config.detailWeightMultiplier ?? 0.82, 0.4, 1.6),
    textureWeightMultiplier: clamp(config.textureWeightMultiplier ?? 0.54, 0.25, 1.2),
    depthAttenuationStrength: clamp(config.depthAttenuationStrength ?? 0.65, 0, 1),
    referenceDepthMeters: clamp(config.referenceDepthMeters ?? 3.6, 0.8, 20.0),
    wobbleAmplitudePx: clamp(config.wobbleAmplitudePx, 0, 4.0),
    wobbleFrequency: clamp(config.wobbleFrequency ?? 2.4, 0.5, 10.0),
    taperRatio: clamp(config.taperRatio, 0, 0.92),
    minStrokeWidthPx: clamp(config.minStrokeWidthPx ?? 0.42, 0.15, 2.5),
    maxStrokeWidthPx: clamp(config.maxStrokeWidthPx ?? 6.8, 1.5, 16.0),
    deterministicSeed: Math.trunc(config.deterministicSeed ?? 8102026),
  };
}

/** 기준 보정 카메라에 회전·돌리·렌즈 초점거리 변화를 적용한 새 카메라 상태를 생성한다. */
export function applyCameraRigDelta(
  baseCamera: CalibratedCameraState,
  delta: CameraRigDelta,
): CalibratedCameraState {
  const yawDeg = baseCamera.yawDeg + (delta.deltaYawDeg ?? 0);
  const pitchDeg = clamp(baseCamera.pitchDeg + (delta.deltaPitchDeg ?? 0), -72, 72);
  const rollDeg = clamp(baseCamera.rollDeg + (delta.deltaRollDeg ?? 0), -45, 45);
  const basis = buildCameraBasis(yawDeg, pitchDeg, rollDeg);

  const focalLengthMm = clamp(delta.focalLengthMm ?? baseCamera.focalLengthMm, 14, 180);
  const focalLengthPx = (focalLengthMm / FULL_FRAME_SENSOR_WIDTH_MM) * baseCamera.viewportWidthPx;
  const horizontalFovDeg = 2 * Math.atan(baseCamera.viewportWidthPx / (2 * focalLengthPx)) * RAD_TO_DEG;
  const verticalFovDeg = 2 * Math.atan(baseCamera.viewportHeightPx / (2 * focalLengthPx)) * RAD_TO_DEG;

  const dolly = delta.dollyMeters ?? 0;
  const truck = delta.truckMeters ?? 0;
  const pedestal = delta.pedestalMeters ?? 0;
  const positionMeters: Vec3 = {
    x: baseCamera.positionMeters.x + basis.forward.x * dolly + basis.right.x * truck,
    y: clamp(baseCamera.positionMeters.y + pedestal, 0.35, 15.0),
    z: baseCamera.positionMeters.z + basis.forward.z * dolly + basis.right.z * truck,
  };

  const rollRad = rollDeg * DEG_TO_RAD;
  const pitchRad = pitchDeg * DEG_TO_RAD;
  const horizonSlope = Math.tan(rollRad);
  const horizonYPx = baseCamera.principalPointPx.y + (focalLengthPx * Math.tan(pitchRad)) / Math.cos(rollRad);

  const partial = { basis, focalLengthPx, principalPointPx: baseCamera.principalPointPx };
  const maxFinite = Math.max(baseCamera.viewportWidthPx, baseCamera.viewportHeightPx) * 28;
  const boundedVp = (vp: Vec2 | null): Vec2 | null =>
    vp && Math.hypot(vp.x - baseCamera.principalPointPx.x, vp.y - baseCamera.principalPointPx.y) <= maxFinite ? vp : null;

  const vpX = boundedVp(projectDirectionToVanishingPoint({ x: 1, y: 0, z: 0 }, partial));
  const vpZ = boundedVp(projectDirectionToVanishingPoint({ x: 0, y: 0, z: -1 }, partial));
  const vpY = boundedVp(projectDirectionToVanishingPoint({ x: 0, y: 1, z: 0 }, partial));
  const perspectiveType: PerspectiveType = vpX && vpZ && vpY ? "3-point" : vpX && vpZ ? "2-point" : "1-point";

  return {
    viewportWidthPx: baseCamera.viewportWidthPx,
    viewportHeightPx: baseCamera.viewportHeightPx,
    principalPointPx: baseCamera.principalPointPx,
    focalLengthPx, focalLengthMm, horizontalFovDeg, verticalFovDeg,
    positionMeters, eyeHeightMeters: positionMeters.y,
    yawDeg, pitchDeg, rollDeg, horizonYPx, horizonSlope, perspectiveType,
    vanishingPoints: { vpX, vpZ, vpY }, basis,
  };
}

/** 파라메트릭 박스 소품의 월드 공간 8꼭짓점, 6면 외향 법선, 면 중심을 계산한다. */
export function computeBoxWorldGeometry(prop: ParametricBoxProp3d): OrientedBoxWorldGeometry {
  const yawRad = prop.yawDeg * DEG_TO_RAD;
  const cosYaw = Math.cos(yawRad);
  const sinYaw = Math.sin(yawRad);
  const [hx, hy, hz] = [prop.sizeMeters.x * 0.5, prop.sizeMeters.y * 0.5, prop.sizeMeters.z * 0.5];

  const toWorld = (lx: number, ly: number, lz: number): Vec3 => ({
    x: prop.centerMeters.x + lx * cosYaw + lz * sinYaw,
    y: prop.centerMeters.y + ly,
    z: prop.centerMeters.z - lx * sinYaw + lz * cosYaw,
  });

  const corners: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3] = [
    toWorld(-hx, -hy, hz), toWorld(hx, -hy, hz), toWorld(hx, -hy, -hz), toWorld(-hx, -hy, -hz),
    toWorld(-hx, hy, hz), toWorld(hx, hy, hz), toWorld(hx, hy, -hz), toWorld(-hx, hy, -hz),
  ];

  const faceNormals = LOCAL_FACE_NORMALS.map((n) => ({
    x: n.x * cosYaw + n.z * sinYaw, y: n.y, z: -n.x * sinYaw + n.z * cosYaw,
  })) as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];

  const faceCenters = BOX_FACE_CORNER_INDICES.map(([i0, i1, i2, i3]) => {
    const [c0, c1, c2, c3] = [corners[i0]!, corners[i1]!, corners[i2]!, corners[i3]!];
    return {
      x: (c0.x + c1.x + c2.x + c3.x) * 0.25,
      y: (c0.y + c1.y + c2.y + c3.y) * 0.25,
      z: (c0.z + c1.z + c2.z + c3.z) * 0.25,
    };
  }) as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];

  return { prop, corners, faceNormals, faceCenters, cosYaw, sinYaw, halfExtents: { x: hx, y: hy, z: hz } };
}

function intersectRayOrientedBox(rayOrigin: Vec3, rayUnitDir: Vec3, box: OrientedBoxWorldGeometry): number | null {
  const rel = sub3(rayOrigin, box.prop.centerMeters);
  const ox = rel.x * box.cosYaw - rel.z * box.sinYaw;
  const oz = rel.x * box.sinYaw + rel.z * box.cosYaw;
  const dx = rayUnitDir.x * box.cosYaw - rayUnitDir.z * box.sinYaw;
  const dz = rayUnitDir.x * box.sinYaw + rayUnitDir.z * box.cosYaw;

  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  const slab = (o: number, d: number, half: number): boolean => {
    if (Math.abs(d) < EPSILON) return o >= -half && o <= half;
    let t0 = (-half - o) / d;
    let t1 = (half - o) / d;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    return tMin <= tMax;
  };
  if (!slab(ox, dx, box.halfExtents.x) || !slab(rel.y, rayUnitDir.y, box.halfExtents.y) || !slab(oz, dz, box.halfExtents.z)) {
    return null;
  }
  return tMax <= 0 ? null : tMin > 0 ? tMin : tMax;
}

function intersectRayTriangle(origin: Vec3, dir: Vec3, v0: Vec3, v1: Vec3, v2: Vec3): number | null {
  const e1 = sub3(v1, v0);
  const e2 = sub3(v2, v0);
  const p = cross3(dir, e2);
  const det = dot3(e1, p);
  if (Math.abs(det) < EPSILON) return null;
  const invDet = 1 / det;
  const tVec = sub3(origin, v0);
  const u = dot3(tVec, p) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return null;
  const q = cross3(tVec, e1);
  const v = dot3(dir, q) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return null;
  const t = dot3(e2, q) * invDet;
  return t > 0 ? t : null;
}

function isWorldPointOccluded(
  point: Vec3,
  sourceEntityId: string,
  cameraPos: Vec3,
  solidBoxes: readonly OrientedBoxWorldGeometry[],
  solidPlanes: readonly PlaneOccluder[],
): boolean {
  const toPt = sub3(point, cameraPos);
  const distToPt = Math.hypot(toPt.x, toPt.y, toPt.z);
  if (distToPt <= 0.05) return false;
  const unitDir: Vec3 = { x: toPt.x / distToPt, y: toPt.y / distToPt, z: toPt.z / distToPt };
  const maxDist = distToPt - 2.5e-3;

  for (const box of solidBoxes) {
    if (box.prop.id === sourceEntityId) continue;
    const tHit = intersectRayOrientedBox(cameraPos, unitDir, box);
    if (tHit !== null && tHit > 0.05 && tHit < maxDist) return true;
  }
  for (const plane of solidPlanes) {
    if (plane.id === sourceEntityId) continue;
    const [c0, c1, c2, c3] = plane.corners;
    const tHit = intersectRayTriangle(cameraPos, unitDir, c0, c1, c2) ?? intersectRayTriangle(cameraPos, unitDir, c0, c2, c3);
    if (tHit !== null && tHit > 0.05 && tHit < maxDist) return true;
  }
  return false;
}

function clipSegmentToNearPlane(
  p0: Vec3, p1: Vec3, camera: CalibratedCameraState, nearPlaneMeters: number,
): readonly [Vec3, Vec3] | null {
  const d0 = dot3(sub3(p0, camera.positionMeters), camera.basis.forward);
  const d1 = dot3(sub3(p1, camera.positionMeters), camera.basis.forward);
  if (d0 < nearPlaneMeters && d1 < nearPlaneMeters) return null;
  if (d0 >= nearPlaneMeters && d1 >= nearPlaneMeters) return [p0, p1];
  const clipped = lerp3(p0, p1, clamp((nearPlaneMeters - d0) / (d1 - d0), 0, 1));
  return d0 < nearPlaneMeters ? [clipped, p1] : [p0, clipped];
}

function clipSegment2dToViewport(
  p0: Vec2, p1: Vec2, width: number, height: number,
): { readonly start: Vec2; readonly end: Vec2 } | null {
  let t0 = 0; let t1 = 1;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < EPSILON) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, p0.x) || !clip(dx, width - p0.x) || !clip(-dy, p0.y) || !clip(dy, height - p0.y) || t0 > t1) return null;
  return { start: { x: p0.x + t0 * dx, y: p0.y + t0 * dy }, end: { x: p0.x + t1 * dx, y: p0.y + t1 * dy } };
}

function computeInkStrokeWidthPx(role: InkEdgeRole, meanDepthMeters: number, inkDna: ResolvedArtistInkDnaConfig): number {
  const roleMul =
    role === "silhouette-outer" ? inkDna.silhouetteBoost
      : role === "structural-corner" ? inkDna.structuralWeightMultiplier
        : role === "prop-detail" ? inkDna.detailWeightMultiplier
          : inkDna.textureWeightMultiplier;
  const invDepth = clamp(inkDna.referenceDepthMeters / Math.max(meanDepthMeters, 0.55), 0.35, 1.85);
  const depthFactor = 1 + (invDepth - 1) * inkDna.depthAttenuationStrength;
  return clamp(inkDna.baseWidthPx * roleMul * depthFactor, inkDna.minStrokeWidthPx, inkDna.maxStrokeWidthPx);
}

function synthesizeWobbledPolyline(
  startPx: Vec2, endPx: Vec2, segmentId: string, inkDna: ResolvedArtistInkDnaConfig,
): Vec2[] {
  const dx = endPx.x - startPx.x;
  const dy = endPx.y - startPx.y;
  const len = Math.hypot(dx, dy);
  if (len < 4 || inkDna.wobbleAmplitudePx <= 1e-4) return [startPx, endPx];
  const [perpX, perpY] = [-dy / len, dx / len];
  const steps = Math.round(clamp(len / 22, 2, 14));
  const phase1 = hashStringDeterministic(`${segmentId}:p1`, inkDna.deterministicSeed) * Math.PI * 2;
  const phase2 = hashStringDeterministic(`${segmentId}:p2`, inkDna.deterministicSeed) * Math.PI * 2;

  const points: Vec2[] = [startPx];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const wave =
      0.68 * Math.sin(t * inkDna.wobbleFrequency * Math.PI * 2 + phase1) +
      0.32 * Math.sin(t * inkDna.wobbleFrequency * Math.PI * 4.3 + phase2);
    const offset = wave * Math.sin(Math.PI * t) * inkDna.wobbleAmplitudePx;
    points.push({ x: startPx.x + dx * t + perpX * offset, y: startPx.y + dy * t + perpY * offset });
  }
  points.push(endPx);
  return points;
}

const quantizeCornerKey = (v: Vec3): string => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;

function collectSceneCandidateEdges(
  scene: ParametricScene3d,
  cameraPos: Vec3,
  boxGeometries: readonly OrientedBoxWorldGeometry[],
  includeSurfaceTextureGrid: boolean,
  includePropDetails: boolean,
): { readonly candidates: CandidateEdge3d[]; readonly backFaceCulledCount: number } {
  const candidates: CandidateEdge3d[] = [];
  const seenEdges = new Set<string>();
  let backFaceCulledCount = 0;

  for (const plane of scene.enclosurePlanes) {
    for (let e = 0; e < 4; e += 1) {
      const a = plane.corners[e]!;
      const b = plane.corners[(e + 1) % 4]!;
      const [ka, kb] = [quantizeCornerKey(a), quantizeCornerKey(b)];
      const pairKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seenEdges.has(pairKey)) continue;
      seenEdges.add(pairKey);
      candidates.push({
        id: `${plane.id}-edge-${e}`, sourceEntityId: plane.id, sourceEntityKind: "enclosure",
        edgeRole: "structural-corner", start: a, end: b,
      });
    }
    if (includeSurfaceTextureGrid && (plane.role === "floor" || plane.role === "road-surface")) {
      const b = scene.enclosureBoundsMeters;
      for (let s = 1; s < 3; s += 1) {
        const x = b.minX + ((b.maxX - b.minX) * s) / 3;
        const z = b.minZ + ((b.maxZ - b.minZ) * s) / 3;
        candidates.push(
          { id: `${plane.id}-grid-z-${s}`, sourceEntityId: plane.id, sourceEntityKind: "enclosure", edgeRole: "surface-texture", start: { x, y: 0, z: b.maxZ }, end: { x, y: 0, z: b.minZ } },
          { id: `${plane.id}-grid-x-${s}`, sourceEntityId: plane.id, sourceEntityKind: "enclosure", edgeRole: "surface-texture", start: { x: b.minX, y: 0, z }, end: { x: b.maxX, y: 0, z } },
        );
      }
    }
  }

  for (const geom of boxGeometries) {
    const faceVisible = geom.faceNormals.map((n, f) => dot3(n, sub3(cameraPos, geom.faceCenters[f]!)) > 1e-5);
    for (let e = 0; e < BOX_EDGE_FACE_PAIRS.length; e += 1) {
      const [i0, i1, fA, fB] = BOX_EDGE_FACE_PAIRS[e]!;
      const visA = faceVisible[fA] ?? false;
      const visB = faceVisible[fB] ?? false;
      if (!visA && !visB) { backFaceCulledCount += 1; continue; }
      candidates.push({
        id: `${geom.prop.id}-edge-${e}`, sourceEntityId: geom.prop.id, sourceEntityKind: "prop",
        edgeRole: visA !== visB ? "silhouette-outer" : "prop-detail",
        start: geom.corners[i0]!, end: geom.corners[i1]!,
      });
    }
    if (includePropDetails && faceVisible[0]) {
      const [f0, f1, f5, f4] = [geom.corners[0]!, geom.corners[1]!, geom.corners[5]!, geom.corners[4]!];
      if (geom.prop.category === "window") {
        candidates.push(
          { id: `${geom.prop.id}-mullion-v`, sourceEntityId: geom.prop.id, sourceEntityKind: "prop", edgeRole: "prop-detail", start: lerp3(f0, f1, 0.5), end: lerp3(f4, f5, 0.5) },
          { id: `${geom.prop.id}-mullion-h`, sourceEntityId: geom.prop.id, sourceEntityKind: "prop", edgeRole: "prop-detail", start: lerp3(f0, f4, 0.5), end: lerp3(f1, f5, 0.5) },
        );
      } else if (geom.prop.category === "shelf" || geom.prop.category === "cabinet") {
        candidates.push({
          id: `${geom.prop.id}-divider-mid`, sourceEntityId: geom.prop.id, sourceEntityKind: "prop",
          edgeRole: "prop-detail", start: lerp3(f0, f4, 0.5), end: lerp3(f1, f5, 0.5),
        });
      }
    }
  }
  return { candidates, backFaceCulledCount };
}

function buildPerspectiveGuideOverlay(camera: CalibratedCameraState): PerspectiveGuideOverlay {
  const [w, h] = [camera.viewportWidthPx, camera.viewportHeightPx];
  const yL = camera.horizonYPx + camera.horizonSlope * -camera.principalPointPx.x;
  const yR = camera.horizonYPx + camera.horizonSlope * (w - camera.principalPointPx.x);
  const clippedH = clipSegment2dToViewport({ x: 0, y: yL }, { x: w, y: yR }, w, h);
  const horizonLine = {
    startPx: clippedH ? clippedH.start : { x: 0, y: clamp(camera.horizonYPx, 0, h) },
    endPx: clippedH ? clippedH.end : { x: w, y: clamp(camera.horizonYPx, 0, h) },
    yAtCenterPx: camera.horizonYPx,
  };

  const convergenceRays: PerspectiveConvergenceRay2d[] = [];
  const targets: Vec2[] = [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: h }, { x: w, y: h }, { x: w * 0.5, y: h }, { x: w * 0.5, y: 0 },
  ];
  const addRays = (axis: "x" | "y" | "z", vp: Vec2 | null): void => {
    if (!vp) return;
    for (const target of targets) {
      if (Math.hypot(target.x - vp.x, target.y - vp.y) < 12) continue;
      const clipped = clipSegment2dToViewport(vp, target, w, h);
      if (clipped && Math.hypot(clipped.end.x - clipped.start.x, clipped.end.y - clipped.start.y) >= 20) {
        convergenceRays.push({ axis, startPx: clipped.start, endPx: clipped.end });
      }
    }
  };
  addRays("z", camera.vanishingPoints.vpZ);
  addRays("x", camera.vanishingPoints.vpX);
  addRays("y", camera.vanishingPoints.vpY);
  return { horizonLine, vanishingPoints: camera.vanishingPoints, convergenceRays };
}

function refineVisibilityBoundary(
  start3d: Vec3, end3d: Vec3, sVis: number, sOcc: number, sourceEntityId: string,
  cameraPos: Vec3, solidBoxes: readonly OrientedBoxWorldGeometry[], solidPlanes: readonly PlaneOccluder[],
): number {
  let lo = sVis; let hi = sOcc;
  for (let iter = 0; iter < 5; iter += 1) {
    const mid = (lo + hi) * 0.5;
    if (isWorldPointOccluded(lerp3(start3d, end3d, mid), sourceEntityId, cameraPos, solidBoxes, solidPlanes)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** 3D 파라메트릭 씬을 임의 카메라 각도로 재투영하고 HLR 가시성 컬링 및 작가 Ink DNA를 적용한다. */
export function reprojectParametricSceneWithInkDna(
  scene: ParametricScene3d,
  cameraDelta: CameraRigDelta,
  inkDnaConfig: ArtistInkDnaConfig,
  options: ReprojectionOptions = {},
): ReprojectedSceneResult {
  const inkDna = resolveArtistInkDnaConfig(inkDnaConfig);
  const camera = applyCameraRigDelta(scene.calibratedCamera, cameraDelta);
  const nearPlaneMeters = Math.max(0.08, options.nearPlaneMeters ?? 0.15);
  const hlrSamples = Math.round(clamp(options.hlrSamplesPerEdge ?? 24, 8, 64));

  const boxGeometries = scene.props.map(computeBoxWorldGeometry);
  const solidBoxes = boxGeometries.filter((g) => g.prop.isSolidOccluder);
  const solidPlanes: PlaneOccluder[] = scene.enclosurePlanes
    .filter((p) => p.isSolidOccluder)
    .map((p: ArchitecturalPlane3d) => ({ id: p.id, corners: p.corners, normal: p.normal }));

  const { candidates, backFaceCulledCount } = collectSceneCandidateEdges(
    scene, camera.positionMeters, boxGeometries,
    options.includeSurfaceTextureGrid ?? true, options.includePropDetails ?? true,
  );

  const visibleSegments: ProjectedInkSegment2d[] = [];
  let frustumCulledEdgeCount = 0;
  let fullyOccludedEdgeCount = backFaceCulledCount;
  let partiallyOccludedEdgeCount = 0;

  for (const edge of candidates) {
    const nearClipped = clipSegmentToNearPlane(edge.start, edge.end, camera, nearPlaneMeters);
    if (!nearClipped) { frustumCulledEdgeCount += 1; continue; }
    const [cStart, cEnd] = nearClipped;
    const pStart = projectWorldPointToScreen(cStart, camera);
    const pEnd = projectWorldPointToScreen(cEnd, camera);
    if (!pStart || !pEnd || !clipSegment2dToViewport(pStart.screenPx, pEnd.screenPx, camera.viewportWidthPx, camera.viewportHeightPx)) {
      frustumCulledEdgeCount += 1; continue;
    }

    const sampleVisible: boolean[] = [];
    const sampleParams: number[] = [];
    let visibleCount = 0;
    for (let k = 0; k < hlrSamples; k += 1) {
      const s = (k + 0.5) / hlrSamples;
      sampleParams.push(s);
      const vis = !isWorldPointOccluded(lerp3(cStart, cEnd, s), edge.sourceEntityId, camera.positionMeters, solidBoxes, solidPlanes);
      sampleVisible.push(vis);
      if (vis) visibleCount += 1;
    }
    if (visibleCount === 0) { fullyOccludedEdgeCount += 1; continue; }
    if (visibleCount < hlrSamples) partiallyOccludedEdgeCount += 1;

    const intervals: Array<readonly [number, number]> = [];
    let runStart = -1;
    for (let k = 0; k <= hlrSamples; k += 1) {
      const isVis = k < hlrSamples && (sampleVisible[k] ?? false);
      if (isVis && runStart === -1) runStart = k;
      else if (!isVis && runStart !== -1) {
        const runEnd = k - 1;
        const sBegin = runStart === 0 ? 0 : refineVisibilityBoundary(cStart, cEnd, sampleParams[runStart]!, sampleParams[runStart - 1]!, edge.sourceEntityId, camera.positionMeters, solidBoxes, solidPlanes);
        const sFinish = runEnd === hlrSamples - 1 ? 1 : refineVisibilityBoundary(cStart, cEnd, sampleParams[runEnd]!, sampleParams[runEnd + 1]!, edge.sourceEntityId, camera.positionMeters, solidBoxes, solidPlanes);
        if (sFinish - sBegin > 1e-3) intervals.push([sBegin, sFinish]);
        runStart = -1;
      }
    }

    for (let j = 0; j < intervals.length; j += 1) {
      const [s0, s1] = intervals[j]!;
      const subStart3d = lerp3(cStart, cEnd, s0);
      const subEnd3d = lerp3(cStart, cEnd, s1);
      const proj0 = projectWorldPointToScreen(subStart3d, camera);
      const proj1 = projectWorldPointToScreen(subEnd3d, camera);
      if (!proj0 || !proj1) continue;
      const clipped2d = clipSegment2dToViewport(proj0.screenPx, proj1.screenPx, camera.viewportWidthPx, camera.viewportHeightPx);
      if (!clipped2d || Math.hypot(clipped2d.end.x - clipped2d.start.x, clipped2d.end.y - clipped2d.start.y) < 1.2) continue;

      const meanDepthMeters = (proj0.depthMeters + proj1.depthMeters) * 0.5;
      const strokeWidthPx = computeInkStrokeWidthPx(edge.edgeRole, meanDepthMeters, inkDna);
      const tipWidth = Math.max(inkDna.minStrokeWidthPx * 0.65, strokeWidthPx * (1 - inkDna.taperRatio * 0.85));
      const segId = intervals.length === 1 ? edge.id : `${edge.id}-vis-${j}`;
      visibleSegments.push({
        id: segId, sourceEntityId: edge.sourceEntityId, sourceEntityKind: edge.sourceEntityKind, edgeRole: edge.edgeRole,
        startPx: clipped2d.start, endPx: clipped2d.end,
        polylinePx: synthesizeWobbledPolyline(clipped2d.start, clipped2d.end, segId, inkDna),
        strokeWidthPx, startTipWidthPx: tipWidth, endTipWidthPx: tipWidth,
        meanDepthMeters, visibilityRatio: clamp(s1 - s0, 0, 1), worldStartMeters: subStart3d, worldEndMeters: subEnd3d,
      });
    }
  }

  const propAnchors: WorldPropAnchorSnapshot[] = scene.props.map((prop) => {
    const projected = projectWorldPointToScreen(prop.centerMeters, camera);
    const inFrustum =
      projected !== null &&
      projected.screenPx.x >= 0 && projected.screenPx.x <= camera.viewportWidthPx &&
      projected.screenPx.y >= 0 && projected.screenPx.y <= camera.viewportHeightPx;
    return {
      id: prop.id, label: prop.label, category: prop.category,
      centerMeters: { ...prop.centerMeters }, sizeMeters: { ...prop.sizeMeters },
      yawDeg: prop.yawDeg, minYMeters: prop.minYMeters, maxYMeters: prop.maxYMeters,
      projectedCenterPx: projected ? projected.screenPx : null,
      depthMeters: projected ? projected.depthMeters : null, inFrustum,
    };
  });

  const zeroDriftVerified = propAnchors.every((a, idx) => {
    const src = scene.props[idx];
    return Boolean(src) &&
      a.centerMeters.x === src!.centerMeters.x && a.centerMeters.y === src!.centerMeters.y && a.centerMeters.z === src!.centerMeters.z &&
      a.sizeMeters.x === src!.sizeMeters.x && a.sizeMeters.y === src!.sizeMeters.y && a.sizeMeters.z === src!.sizeMeters.z &&
      a.yawDeg === src!.yawDeg && a.minYMeters === src!.minYMeters;
  });

  return {
    sceneId: scene.sceneId, camera, inkDna, visibleSegments,
    perspectiveGuides: buildPerspectiveGuideOverlay(camera), propAnchors,
    hlrStats: {
      totalCandidateEdges: candidates.length + backFaceCulledCount,
      visibleEdgeCount: visibleSegments.length,
      partiallyOccludedEdgeCount, fullyOccludedEdgeCount, frustumCulledEdgeCount,
      occludedEdgeCount: fullyOccludedEdgeCount + partiallyOccludedEdgeCount,
    },
    zeroDriftVerified,
  };
}
