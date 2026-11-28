/**
 * Wave 90 — 비유클리드 곡면 투시 공통 타입, 3D 벡터 연산, 직교 카메라 기저 및 투영 파라미터.
 */

export type CurvilinearProjectionMode =
  | "4pt-cylindrical"
  | "5pt-fisheye-equidistant"
  | "5pt-fisheye-equisolid"
  | "5pt-fisheye-stereographic"
  | "5pt-panini"
  | "6pt-spherical-dual";

export type CurvilinearHemisphere = "front" | "back";

export type CanonicalVanishingPointId =
  | "front"
  | "back"
  | "left"
  | "right"
  | "zenith"
  | "nadir";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CurvilinearCameraConfig {
  readonly mode: CurvilinearProjectionMode;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** 수평·방위 시야각(도). 범위: 60~360 (모드별 물리 한계에 맞춰 내부 클램프). */
  readonly fovDegrees: number;
  /** Y축 회전(라디안). 양수일수록 시선이 우측(+X)으로 회전한다. */
  readonly yawRad: number;
  /** X축 회전(라디안). 양수일수록 시선이 위(+Y)로 들린다. */
  readonly pitchRad: number;
  /** Z축 회전(라디안). 화면 평면 롤 회전. */
  readonly rollRad: number;
  /** 5pt-panini 압축 계수(0=직선 투시, 1=표준 파니니). */
  readonly paniniCompression: number;
  readonly eyePosition: Vec3;
}

export interface CurvilinearCameraBasis {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
}

export interface CurvilinearProjectionResult {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly thetaRad: number;
  readonly visible: boolean;
  readonly hemisphere: CurvilinearHemisphere;
  readonly foreshorteningScale: number;
}

export interface CurvilinearUnprojectRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly valid: boolean;
  readonly hemisphere: CurvilinearHemisphere;
}

export interface CurvilinearJacobianResult {
  readonly sigmaMax: number;
  readonly sigmaMin: number;
  readonly anisotropyRatio: number;
  readonly principalAngleRad: number;
  readonly areaScale: number;
}

export interface CurvilinearVanishingPoint {
  readonly id: CanonicalVanishingPointId;
  readonly labelKo: string;
  readonly worldDirection: Vec3;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly hemisphere: CurvilinearHemisphere;
  readonly infiniteOnAxis: boolean;
}

export interface CurvilinearPolylineSegment {
  readonly points: readonly Vec2[];
  readonly hemisphere: CurvilinearHemisphere;
  readonly lengthPx: number;
  readonly maxBendDeviationPx: number;
}

export interface CurvilinearGeodesicPolyline {
  readonly segments: readonly CurvilinearPolylineSegment[];
  readonly totalLengthPx: number;
  readonly maxBendDeviationPx: number;
  readonly seamSplitCount: number;
}

export type GuideArcKind = "horizon" | "meridian" | "parallel" | "depth-ray" | "rim";

export interface CurvilinearGuideArc {
  readonly id: string;
  readonly kind: GuideArcKind;
  readonly segments: readonly CurvilinearPolylineSegment[];
}

export interface CurvilinearHemisphereBound {
  readonly hemisphere: CurvilinearHemisphere;
  readonly cx: number;
  readonly cy: number;
  readonly radiusPx: number;
}

export interface CurvilinearGuideGrid {
  readonly mode: CurvilinearProjectionMode;
  readonly vanishingPoints: readonly CurvilinearVanishingPoint[];
  readonly horizonSegments: readonly CurvilinearPolylineSegment[];
  readonly guideArcs: readonly CurvilinearGuideArc[];
  readonly hemisphereBounds: readonly CurvilinearHemisphereBound[];
}

export interface InternalProjectionParams {
  readonly cx: number;
  readonly cy: number;
  readonly refRadiusPx: number;
  readonly focalPx: number;
  readonly halfFovRad: number;
  readonly paniniD: number;
  readonly dualFrontCx: number;
  readonly dualBackCx: number;
  readonly dualDiskRadiusPx: number;
}

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthVec3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = lengthVec3(v);
  if (len <= EPS) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * 요(Y) -> 피치(X) -> 롤(Z) 순서로 직교 정규 카메라 기저를 계산한다.
 */
export function buildCurvilinearCameraBasis(
  camera: CurvilinearCameraConfig,
): CurvilinearCameraBasis {
  const cy = Math.cos(camera.yawRad);
  const sy = Math.sin(camera.yawRad);
  const cp = Math.cos(camera.pitchRad);
  const sp = Math.sin(camera.pitchRad);
  const cr = Math.cos(camera.rollRad);
  const sr = Math.sin(camera.rollRad);

  const r0: Vec3 = { x: cy, y: 0, z: -sy };
  const u0: Vec3 = { x: -sy * sp, y: cp, z: -cy * sp };
  const f0: Vec3 = { x: sy * cp, y: sp, z: cy * cp };

  return {
    right: { x: r0.x * cr + u0.x * sr, y: r0.y * cr + u0.y * sr, z: r0.z * cr + u0.z * sr },
    up: { x: -r0.x * sr + u0.x * cr, y: -r0.y * sr + u0.y * cr, z: -r0.z * sr + u0.z * cr },
    forward: f0,
  };
}

export function worldVectorToCameraSpace(worldVec: Vec3, basis: CurvilinearCameraBasis): Vec3 {
  return {
    x: dotVec3(worldVec, basis.right),
    y: dotVec3(worldVec, basis.up),
    z: dotVec3(worldVec, basis.forward),
  };
}

export function cameraVectorToWorldSpace(camVec: Vec3, basis: CurvilinearCameraBasis): Vec3 {
  return {
    x: basis.right.x * camVec.x + basis.up.x * camVec.y + basis.forward.x * camVec.z,
    y: basis.right.y * camVec.x + basis.up.y * camVec.y + basis.forward.y * camVec.z,
    z: basis.right.z * camVec.x + basis.up.z * camVec.y + basis.forward.z * camVec.z,
  };
}

export function computeProjectionParams(
  camera: CurvilinearCameraConfig,
): InternalProjectionParams {
  const w = Math.max(16, camera.viewportWidth);
  const h = Math.max(16, camera.viewportHeight);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const refRadiusPx = Math.min(w, h) * 0.48;
  const paniniD = clampNumber(camera.paniniCompression, 0, 1);

  const dualDiskRadiusPx = Math.min(w * 0.23, h * 0.46);
  const dualFrontCx = w * 0.25;
  const dualBackCx = w * 0.75;

  let clampedFovDeg = clampNumber(camera.fovDegrees, 60, 360);
  if (camera.mode === "5pt-fisheye-stereographic") {
    clampedFovDeg = clampNumber(clampedFovDeg, 60, 320);
  } else if (camera.mode === "5pt-panini") {
    const maxPaniniHalfRad = paniniD <= 1e-4 ? Math.PI * 0.47 : Math.acos(-paniniD) * 0.94;
    clampedFovDeg = clampNumber(clampedFovDeg, 60, Math.min(310, (maxPaniniHalfRad * 2) / DEG_TO_RAD));
  } else if (camera.mode === "4pt-cylindrical") {
    clampedFovDeg = clampNumber(clampedFovDeg, 60, 260);
  } else if (camera.mode !== "6pt-spherical-dual") {
    clampedFovDeg = clampNumber(clampedFovDeg, 60, 340);
  }

  const halfFovRad = clampedFovDeg * 0.5 * DEG_TO_RAD;
  let focalPx = refRadiusPx / Math.max(halfFovRad, 0.1);

  if (camera.mode === "5pt-fisheye-equisolid") {
    focalPx = refRadiusPx / Math.max(2 * Math.sin(halfFovRad * 0.5), 1e-4);
  } else if (camera.mode === "5pt-fisheye-stereographic") {
    focalPx = refRadiusPx / Math.max(2 * Math.tan(halfFovRad * 0.5), 1e-4);
  } else if (camera.mode === "5pt-panini") {
    const edgeSpan =
      ((paniniD + 1) * Math.sin(halfFovRad)) / Math.max(paniniD + Math.cos(halfFovRad), 1e-4);
    focalPx = (w * 0.48) / Math.max(edgeSpan, 1e-4);
  } else if (camera.mode === "4pt-cylindrical") {
    focalPx = refRadiusPx / Math.min(halfFovRad, Math.PI * 0.5);
  } else if (camera.mode === "6pt-spherical-dual") {
    focalPx = dualDiskRadiusPx / (Math.PI * 0.5);
  }

  return {
    cx,
    cy,
    refRadiusPx,
    focalPx,
    halfFovRad,
    paniniD,
    dualFrontCx,
    dualBackCx,
    dualDiskRadiusPx,
  };
}
