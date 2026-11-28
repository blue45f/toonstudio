/**
 * Wave 90 — 비유클리드 4/5/6점 곡면 투시 투영장·역투영·야코비안·소실점·측지선 그리드 엔진.
 *
 * 지원하는 투영 모델:
 * - `4pt-cylindrical`: 수직 파노라마·고층 낙하 구도용 횡축 사인 곡면 투시 (좌/우/천정/천저 소실점)
 * - `5pt-fisheye-equidistant`: 등거리 방위 어안 투영 (r = f * theta)
 * - `5pt-fisheye-equisolid`: 등면적 방위 어안 투영 (r = 2f * sin(theta / 2))
 * - `5pt-fisheye-stereographic`: 등각 방위 어안 투영 (r = 2f * tan(theta / 2))
 * - `5pt-panini`: 수직선을 완전한 직선으로 유지하면서 수평선만 곡면으로 휘는 파니니 초광각 투영
 * - `6pt-spherical-dual`: 전·후면 이중 반구 360° 6점 구면 투시 (전/후/좌/우/천정/천저 소실점)
 */

import {
  addVec3,
  buildCurvilinearCameraBasis,
  cameraVectorToWorldSpace,
  clampNumber,
  computeProjectionParams,
  crossVec3,
  lengthVec3,
  lerpVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  worldVectorToCameraSpace,
  type CanonicalVanishingPointId,
  type CurvilinearCameraConfig,
  type CurvilinearGeodesicPolyline,
  type CurvilinearGuideArc,
  type CurvilinearGuideGrid,
  type CurvilinearHemisphere,
  type CurvilinearHemisphereBound,
  type CurvilinearJacobianResult,
  type CurvilinearPolylineSegment,
  type CurvilinearProjectionResult,
  type CurvilinearUnprojectRay,
  type CurvilinearVanishingPoint,
  type InternalProjectionParams,
  type Vec2,
  type Vec3,
} from "./curvilinear-math-types";

export {
  addVec3,
  buildCurvilinearCameraBasis,
  cameraVectorToWorldSpace,
  clampNumber,
  computeProjectionParams,
  crossVec3,
  dotVec3,
  lengthVec3,
  lerpVec3,
  normalizeVec3,
  scaleVec3,
  subVec3,
  worldVectorToCameraSpace,
  type CanonicalVanishingPointId,
  type CurvilinearCameraBasis,
  type CurvilinearCameraConfig,
  type CurvilinearGeodesicPolyline,
  type CurvilinearGuideArc,
  type CurvilinearGuideGrid,
  type CurvilinearHemisphere,
  type CurvilinearHemisphereBound,
  type CurvilinearJacobianResult,
  type CurvilinearPolylineSegment,
  type CurvilinearProjectionMode,
  type CurvilinearProjectionResult,
  type CurvilinearUnprojectRay,
  type CurvilinearVanishingPoint,
  type GuideArcKind,
  type InternalProjectionParams,
  type Vec2,
  type Vec3,
} from "./curvilinear-math-types";

const EPS = 1e-9;

const CANONICAL_VP_SPECS: ReadonlyArray<{
  readonly id: CanonicalVanishingPointId;
  readonly labelKo: string;
  readonly worldDirection: Vec3;
}> = [
  { id: "front", labelKo: "전면 VP", worldDirection: { x: 0, y: 0, z: 1 } },
  { id: "back", labelKo: "후면 VP", worldDirection: { x: 0, y: 0, z: -1 } },
  { id: "left", labelKo: "좌측 VP", worldDirection: { x: -1, y: 0, z: 0 } },
  { id: "right", labelKo: "우측 VP", worldDirection: { x: 1, y: 0, z: 0 } },
  { id: "zenith", labelKo: "천정 VP", worldDirection: { x: 0, y: 1, z: 0 } },
  { id: "nadir", labelKo: "천저 VP", worldDirection: { x: 0, y: -1, z: 0 } },
];

interface DirectionProjectionInternal {
  readonly x: number;
  readonly y: number;
  readonly thetaRad: number;
  readonly visible: boolean;
  readonly hemisphere: CurvilinearHemisphere;
  readonly angularScale: number;
  readonly infiniteOnAxis: boolean;
}

function isInsideViewport(x: number, y: number, w: number, h: number): boolean {
  return x >= -1e-4 && x <= w + 1e-4 && y >= -1e-4 && y <= h + 1e-4;
}

function projectUnitDirectionInCameraSpace(
  u: Vec3,
  camera: CurvilinearCameraConfig,
  params: InternalProjectionParams,
  forcedHemisphere?: CurvilinearHemisphere,
): DirectionProjectionInternal {
  const rhoXY = Math.hypot(u.x, u.y);
  const thetaRad = Math.atan2(rhoXY, u.z);
  const hemisphere: CurvilinearHemisphere =
    forcedHemisphere !== undefined ? forcedHemisphere : u.z >= 0 ? "front" : "back";
  const w = Math.max(16, camera.viewportWidth);
  const h = Math.max(16, camera.viewportHeight);

  if (camera.mode === "6pt-spherical-dual") {
    const isFront = hemisphere === "front";
    const diskCx = isFront ? params.dualFrontCx : params.dualBackCx;
    const thetaH = Math.atan2(rhoXY, Math.max(isFront ? u.z : -u.z, -1));
    const r = params.focalPx * thetaH;
    const dirX = rhoXY > EPS ? (isFront ? u.x : -u.x) / rhoXY : 0;
    const dirY = rhoXY > EPS ? u.y / rhoXY : 0;
    const x = diskCx + r * dirX;
    const y = params.cy - r * dirY;
    const angularScale = thetaH < 1e-5 ? 1 : Math.sqrt(thetaH / Math.max(Math.sin(thetaH), 1e-5));
    const inHemi = isFront ? u.z >= -1e-6 : u.z <= 1e-6;
    return {
      x,
      y,
      thetaRad,
      visible: inHemi && thetaH <= Math.PI * 0.5 + 1e-5 && isInsideViewport(x, y, w, h),
      hemisphere,
      angularScale,
      infiniteOnAxis: false,
    };
  }

  if (camera.mode === "4pt-cylindrical") {
    const rYZ = Math.hypot(u.y, u.z);
    const alpha = Math.atan2(u.x, rYZ);
    const beta = rYZ > EPS ? Math.atan2(u.y, u.z) : 0;
    const x = params.cx + params.focalPx * alpha;
    const y = params.cy - params.focalPx * beta * Math.cos(alpha);
    const maxBeta = Math.min(params.halfFovRad, Math.PI * 0.5 + 1e-5);
    const visible =
      u.z >= -1e-6 &&
      Math.abs(alpha) <= Math.min(params.halfFovRad, Math.PI * 0.5) + 1e-5 &&
      Math.abs(beta) <= maxBeta + 1e-5 &&
      isInsideViewport(x, y, w, h);
    return { x, y, thetaRad, visible, hemisphere, angularScale: 1, infiniteOnAxis: false };
  }

  if (camera.mode === "5pt-panini") {
    const rXZ = Math.hypot(u.x, u.z);
    if (rXZ <= 1e-7) {
      return {
        x: params.cx,
        y: params.cy - (u.y >= 0 ? 1 : -1) * h * 8,
        thetaRad,
        visible: false,
        hemisphere,
        angularScale: 1,
        infiniteOnAxis: true,
      };
    }
    const sinL = u.x / rXZ;
    const cosL = u.z / rXZ;
    const denom = params.paniniD + cosL;
    if (denom <= 1e-5) {
      return {
        x: params.cx + Math.sign(sinL || 1) * w * 8,
        y: params.cy - Math.sign(u.y) * h * 8,
        thetaRad,
        visible: false,
        hemisphere,
        angularScale: 1,
        infiniteOnAxis: true,
      };
    }
    const s = (params.paniniD + 1) / denom;
    const x = params.cx + params.focalPx * s * sinL;
    const y = params.cy - params.focalPx * s * (u.y / rXZ);
    const visible =
      Math.abs(Math.atan2(u.x, u.z)) <= params.halfFovRad + 1e-5 && isInsideViewport(x, y, w, h);
    return {
      x,
      y,
      thetaRad,
      visible,
      hemisphere,
      angularScale: Math.max(0.05, s * rXZ),
      infiniteOnAxis: false,
    };
  }

  // 5점 방위 어안 투영군: equidistant / equisolid / stereographic
  const dirX = rhoXY > EPS ? u.x / rhoXY : 0;
  const dirY = rhoXY > EPS ? u.y / rhoXY : 0;
  let r: number;
  let angularScale: number;
  let domainValid: boolean;

  if (camera.mode === "5pt-fisheye-equidistant") {
    r = params.focalPx * thetaRad;
    angularScale = thetaRad < 1e-5 ? 1 : Math.sqrt(thetaRad / Math.max(Math.sin(thetaRad), 1e-5));
    domainValid = thetaRad <= Math.PI - 1e-5;
  } else if (camera.mode === "5pt-fisheye-equisolid") {
    r = 2 * params.focalPx * Math.sin(thetaRad * 0.5);
    angularScale = 1;
    domainValid = thetaRad <= Math.PI - 1e-5;
  } else {
    if (thetaRad >= Math.PI - 1e-4) {
      return {
        x: params.cx,
        y: params.cy,
        thetaRad,
        visible: false,
        hemisphere,
        angularScale: 1,
        infiniteOnAxis: true,
      };
    }
    const cosHalf = Math.cos(thetaRad * 0.5);
    r = 2 * params.focalPx * Math.tan(thetaRad * 0.5);
    angularScale = 1 / Math.max(cosHalf * cosHalf, 1e-4);
    domainValid = true;
  }

  const x = params.cx + r * dirX;
  const y = params.cy - r * dirY;
  const visible = domainValid && thetaRad <= params.halfFovRad + 1e-5 && isInsideViewport(x, y, w, h);
  return { x, y, thetaRad, visible, hemisphere, angularScale, infiniteOnAxis: false };
}

/**
 * 3D 월드 좌표를 현재 곡면 투시 카메라의 2D 화면 좌표로 투영한다.
 */
export function projectWorld3DToCurvilinear2D(
  point3D: Vec3,
  camera: CurvilinearCameraConfig,
): CurvilinearProjectionResult {
  const basis = buildCurvilinearCameraBasis(camera);
  const params = computeProjectionParams(camera);
  const deltaWorld = subVec3(point3D, camera.eyePosition);
  const dist = lengthVec3(deltaWorld);

  if (dist <= EPS) {
    return {
      x: camera.mode === "6pt-spherical-dual" ? params.dualFrontCx : params.cx,
      y: params.cy,
      depth: 0,
      thetaRad: 0,
      visible: false,
      hemisphere: "front",
      foreshorteningScale: 1,
    };
  }

  const camVec = worldVectorToCameraSpace(deltaWorld, basis);
  const u: Vec3 = { x: camVec.x / dist, y: camVec.y / dist, z: camVec.z / dist };
  const proj = projectUnitDirectionInCameraSpace(u, camera, params);
  return {
    x: proj.x,
    y: proj.y,
    depth: dist,
    thetaRad: proj.thetaRad,
    visible: proj.visible,
    hemisphere: proj.hemisphere,
    foreshorteningScale: proj.angularScale / Math.max(dist, 1e-4),
  };
}

/**
 * 2D 곡면 투시 화면 좌표를 정규화된 3D 월드 광선으로 역투영한다.
 * 모든 6개 모드에서 순방향 투영과 왕복 오차 < 1e-4 rad를 보장한다.
 */
export function unprojectCurvilinear2DToRay3D(
  point2D: Vec2,
  camera: CurvilinearCameraConfig,
): CurvilinearUnprojectRay {
  const basis = buildCurvilinearCameraBasis(camera);
  const params = computeProjectionParams(camera);
  const origin = camera.eyePosition;
  const invalidRay: CurvilinearUnprojectRay = {
    origin,
    direction: basis.forward,
    valid: false,
    hemisphere: "front",
  };

  if (!Number.isFinite(point2D.x) || !Number.isFinite(point2D.y)) return invalidRay;

  let camDir: Vec3;
  let hemisphere: CurvilinearHemisphere;

  if (camera.mode === "6pt-spherical-dual") {
    const dfx = point2D.x - params.dualFrontCx;
    const dfy = params.cy - point2D.y;
    const rFront = Math.hypot(dfx, dfy);
    const dbx = point2D.x - params.dualBackCx;
    const dby = params.cy - point2D.y;
    const rBack = Math.hypot(dbx, dby);

    if (rFront <= params.dualDiskRadiusPx + 1e-5) {
      hemisphere = "front";
      const rClamped = Math.min(rFront, params.dualDiskRadiusPx);
      const thetaH = rClamped / params.focalPx;
      camDir =
        rClamped <= EPS
          ? { x: 0, y: 0, z: 1 }
          : { x: (dfx / rFront) * Math.sin(thetaH), y: (dfy / rFront) * Math.sin(thetaH), z: Math.cos(thetaH) };
    } else if (rBack <= params.dualDiskRadiusPx + 1e-5) {
      hemisphere = "back";
      const rClamped = Math.min(rBack, params.dualDiskRadiusPx);
      const thetaH = rClamped / params.focalPx;
      camDir =
        rClamped <= EPS
          ? { x: 0, y: 0, z: -1 }
          : { x: -(dbx / rBack) * Math.sin(thetaH), y: (dby / rBack) * Math.sin(thetaH), z: -Math.cos(thetaH) };
    } else {
      return invalidRay;
    }
  } else if (camera.mode === "4pt-cylindrical") {
    const alpha = (point2D.x - params.cx) / params.focalPx;
    const py = params.cy - point2D.y;
    if (Math.abs(alpha) > Math.PI * 0.5 + 1e-5) return invalidRay;
    const clampedAlpha = clampNumber(alpha, -Math.PI * 0.5, Math.PI * 0.5);
    const cosAlpha = Math.cos(clampedAlpha);
    if (cosAlpha <= 1e-6) {
      if (Math.abs(py) > 1e-2) return invalidRay;
      camDir = { x: Math.sign(clampedAlpha) || 1, y: 0, z: 0 };
    } else {
      const beta = py / (params.focalPx * cosAlpha);
      if (Math.abs(beta) > Math.PI - 1e-5) return invalidRay;
      camDir = {
        x: Math.sin(clampedAlpha),
        y: cosAlpha * Math.sin(beta),
        z: cosAlpha * Math.cos(beta),
      };
    }
    hemisphere = camDir.z >= 0 ? "front" : "back";
  } else if (camera.mode === "5pt-panini") {
    const pxNorm = (point2D.x - params.cx) / params.focalPx;
    const pyNorm = (params.cy - point2D.y) / params.focalPx;
    const d = params.paniniD;
    const k = pxNorm / (d + 1);
    const k2 = k * k;
    const disc = 1 + k2 * (1 - d * d);
    if (disc < 0) return invalidRay;
    const cosL = (-k2 * d + Math.sqrt(disc)) / (1 + k2);
    const denom = d + cosL;
    if (denom <= 1e-6) return invalidRay;
    const sinL = k * denom;
    const hCyl = pyNorm / ((d + 1) / denom);
    const invNorm = 1 / Math.hypot(1, hCyl);
    camDir = { x: sinL * invNorm, y: hCyl * invNorm, z: cosL * invNorm };
    hemisphere = camDir.z >= 0 ? "front" : "back";
  } else {
    const px = point2D.x - params.cx;
    const py = params.cy - point2D.y;
    const r = Math.hypot(px, py);
    let theta: number;

    if (camera.mode === "5pt-fisheye-equidistant") {
      theta = r / params.focalPx;
      if (theta > Math.PI - 1e-5) return invalidRay;
    } else if (camera.mode === "5pt-fisheye-equisolid") {
      const ratio = r / (2 * params.focalPx);
      if (ratio > 1 + 1e-6) return invalidRay;
      theta = 2 * Math.asin(clampNumber(ratio, 0, 1));
    } else {
      theta = 2 * Math.atan(r / (2 * params.focalPx));
    }

    camDir =
      r <= EPS
        ? { x: 0, y: 0, z: 1 }
        : { x: (px / r) * Math.sin(theta), y: (py / r) * Math.sin(theta), z: Math.cos(theta) };
    hemisphere = camDir.z >= 0 ? "front" : "back";
  }

  return {
    origin,
    direction: normalizeVec3(cameraVectorToWorldSpace(camDir, basis)),
    valid: true,
    hemisphere,
  };
}

/**
 * 3D 점 위치에서의 국소 2×2 투영 야코비안을 계산하고 특잇값 분해(SVD)를 반환한다.
 */
export function computeCurvilinearJacobian(
  point3D: Vec3,
  camera: CurvilinearCameraConfig,
): CurvilinearJacobianResult {
  const basis = buildCurvilinearCameraBasis(camera);
  const params = computeProjectionParams(camera);
  const deltaWorld = subVec3(point3D, camera.eyePosition);
  const dist = Math.max(lengthVec3(deltaWorld), 1e-4);

  const uCam = normalizeVec3(worldVectorToCameraSpace(deltaWorld, basis));
  const hemisphere: CurvilinearHemisphere = uCam.z >= 0 ? "front" : "back";
  const refAxis: Vec3 = Math.abs(uCam.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const t1 = normalizeVec3(crossVec3(refAxis, uCam));
  const t2 = normalizeVec3(crossVec3(uCam, t1));

  const dAngle = 1e-4;
  const inv2h = 1 / (2 * dist * dAngle);
  const forcedHemi = camera.mode === "6pt-spherical-dual" ? hemisphere : undefined;

  const p1p = projectUnitDirectionInCameraSpace(normalizeVec3(addVec3(uCam, scaleVec3(t1, dAngle))), camera, params, forcedHemi);
  const p1m = projectUnitDirectionInCameraSpace(normalizeVec3(subVec3(uCam, scaleVec3(t1, dAngle))), camera, params, forcedHemi);
  const p2p = projectUnitDirectionInCameraSpace(normalizeVec3(addVec3(uCam, scaleVec3(t2, dAngle))), camera, params, forcedHemi);
  const p2m = projectUnitDirectionInCameraSpace(normalizeVec3(subVec3(uCam, scaleVec3(t2, dAngle))), camera, params, forcedHemi);

  const j00 = (p1p.x - p1m.x) * inv2h;
  const j10 = (p1p.y - p1m.y) * inv2h;
  const j01 = (p2p.x - p2m.x) * inv2h;
  const j11 = (p2p.y - p2m.y) * inv2h;

  const a = j00 * j00 + j01 * j01;
  const b = j00 * j10 + j01 * j11;
  const c = j10 * j10 + j11 * j11;
  const trace = a + c;
  const halfDiff = Math.hypot(a - c, 2 * b) * 0.5;

  const sigmaMax = Math.sqrt(Math.max(1e-12, trace * 0.5 + halfDiff));
  const sigmaMin = Math.sqrt(Math.max(1e-12, trace * 0.5 - halfDiff));
  return {
    sigmaMax,
    sigmaMin,
    anisotropyRatio: sigmaMax / Math.max(sigmaMin, 1e-9),
    principalAngleRad: 0.5 * Math.atan2(2 * b, a - c),
    areaScale: sigmaMax * sigmaMin,
  };
}

/**
 * 4/5/6점 정규 소실점(전면·후면·좌·우·천정·천저)의 정확한 2D 좌표와 가시성을 계산한다.
 */
export function computeCurvilinearVanishingPoints(
  camera: CurvilinearCameraConfig,
): readonly CurvilinearVanishingPoint[] {
  const basis = buildCurvilinearCameraBasis(camera);
  const params = computeProjectionParams(camera);
  return CANONICAL_VP_SPECS.map((spec) => {
    const camDir = normalizeVec3(worldVectorToCameraSpace(spec.worldDirection, basis));
    const proj = projectUnitDirectionInCameraSpace(camDir, camera, params);
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      worldDirection: spec.worldDirection,
      x: proj.x,
      y: proj.y,
      visible: proj.visible,
      hemisphere: proj.hemisphere,
      infiniteOnAxis: proj.infiniteOnAxis,
    };
  });
}

function pointToChordDistancePx(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / len;
}

function finalizeSegment(
  points: readonly Vec2[],
  hemisphere: CurvilinearHemisphere,
): CurvilinearPolylineSegment {
  let lengthPx = 0;
  let maxBend = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev && curr) lengthPx += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  if (first && last && points.length >= 3) {
    for (let i = 1; i < points.length - 1; i += 1) {
      const pt = points[i];
      if (pt) {
        const dev = pointToChordDistancePx(pt, first, last);
        if (dev > maxBend) maxBend = dev;
      }
    }
  }
  return { points, hemisphere, lengthPx, maxBendDeviationPx: maxBend };
}

interface SampledGeodesicNode {
  readonly t: number;
  readonly pt: Vec2;
  readonly visible: boolean;
  readonly hemisphere: CurvilinearHemisphere;
}

/**
 * 3D 직선 세그먼트를 곡면 투시 2D 측지선 폴리라인으로 적응형 분할한다.
 * 6점 이중 반구 모드에서 z=0 적도 이음새를 통과할 때는 자동으로 세그먼트를 분리한다.
 */
export function sampleWorldSegmentAsGeodesic(
  start3D: Vec3,
  end3D: Vec3,
  camera: CurvilinearCameraConfig,
  steps = 28,
): CurvilinearGeodesicPolyline {
  const basis = buildCurvilinearCameraBasis(camera);
  const baseSteps = Math.max(4, Math.min(256, Math.round(steps)));
  const startCam = worldVectorToCameraSpace(subVec3(start3D, camera.eyePosition), basis);
  const endCam = worldVectorToCameraSpace(subVec3(end3D, camera.eyePosition), basis);

  const paramSpans: Array<{ readonly t0: number; readonly t1: number }> = [];
  let seamSplitCount = 0;

  if (camera.mode === "6pt-spherical-dual" && startCam.z * endCam.z < -1e-9) {
    const tCross = startCam.z / (startCam.z - endCam.z);
    const margin = 1e-4;
    if (tCross > margin) paramSpans.push({ t0: 0, t1: tCross - margin });
    if (tCross < 1 - margin) paramSpans.push({ t0: tCross + margin, t1: 1 });
    seamSplitCount = 1;
  } else {
    paramSpans.push({ t0: 0, t1: 1 });
  }

  const maxJumpPx = Math.max(camera.viewportWidth, camera.viewportHeight) * 0.45;
  const segments: CurvilinearPolylineSegment[] = [];

  for (const span of paramSpans) {
    const sampled: SampledGeodesicNode[] = [];
    const evalNode = (t: number): SampledGeodesicNode => {
      const proj = projectWorld3DToCurvilinear2D(lerpVec3(start3D, end3D, t), camera);
      return { t, pt: { x: proj.x, y: proj.y }, visible: proj.visible, hemisphere: proj.hemisphere };
    };

    const subdivide = (a: SampledGeodesicNode, b: SampledGeodesicNode, depth: number): void => {
      if (depth >= 4) {
        sampled.push(b);
        return;
      }
      const mid = evalNode((a.t + b.t) * 0.5);
      const needsRefine =
        a.visible !== b.visible ||
        a.hemisphere !== b.hemisphere ||
        (a.visible && b.visible && mid.visible && pointToChordDistancePx(mid.pt, a.pt, b.pt) > 0.75);
      if (needsRefine) {
        subdivide(a, mid, depth + 1);
        subdivide(mid, b, depth + 1);
      } else {
        sampled.push(b);
      }
    };

    const spanSteps = Math.max(4, Math.ceil(baseSteps * (span.t1 - span.t0)));
    let prev = evalNode(span.t0);
    sampled.push(prev);
    for (let i = 1; i <= spanSteps; i += 1) {
      const next = evalNode(span.t0 + ((span.t1 - span.t0) * i) / spanSteps);
      subdivide(prev, next, 0);
      prev = next;
    }

    let currentRun: Vec2[] = [];
    let currentHemi: CurvilinearHemisphere = sampled[0]?.hemisphere ?? "front";
    const flushRun = (): void => {
      if (currentRun.length >= 2) segments.push(finalizeSegment(currentRun, currentHemi));
      currentRun = [];
    };

    for (const item of sampled) {
      if (!item.visible) {
        flushRun();
        continue;
      }
      const lastPt = currentRun[currentRun.length - 1];
      if (lastPt && (item.hemisphere !== currentHemi || Math.hypot(item.pt.x - lastPt.x, item.pt.y - lastPt.y) > maxJumpPx)) {
        flushRun();
        seamSplitCount += 1;
      }
      if (currentRun.length === 0) currentHemi = item.hemisphere;
      currentRun.push(item.pt);
    }
    flushRun();
  }

  let totalLengthPx = 0;
  let maxBendDeviationPx = 0;
  for (const seg of segments) {
    totalLengthPx += seg.lengthPx;
    if (seg.maxBendDeviationPx > maxBendDeviationPx) maxBendDeviationPx = seg.maxBendDeviationPx;
  }
  return { segments, totalLengthPx, maxBendDeviationPx, seamSplitCount };
}

/**
 * 4/5/6점 측지선 가이드 그리드(지평선·자오선·위선·반구 외곽선)를 생성한다.
 */
export function generateCurvilinearGuideGrid(
  camera: CurvilinearCameraConfig,
  density = 6,
): CurvilinearGuideGrid {
  const clampedDensity = Math.max(2, Math.min(16, Math.round(density)));
  const vanishingPoints = computeCurvilinearVanishingPoints(camera);
  const params = computeProjectionParams(camera);
  const radiusM = 40;
  const eye = camera.eyePosition;
  const guideArcs: CurvilinearGuideArc[] = [];
  const maxJump = Math.max(camera.viewportWidth, camera.viewportHeight) * 0.35;

  const sampleArc = (evaluator: (t: number) => Vec3, samples: number): readonly CurvilinearPolylineSegment[] => {
    const runs: CurvilinearPolylineSegment[] = [];
    let current: Vec2[] = [];
    let currentHemi: CurvilinearHemisphere = "front";
    const flush = (): void => {
      if (current.length >= 2) runs.push(finalizeSegment(current, currentHemi));
      current = [];
    };
    for (let i = 0; i <= samples; i += 1) {
      const proj = projectWorld3DToCurvilinear2D(evaluator(i / samples), camera);
      if (!proj.visible) {
        flush();
        continue;
      }
      const prev = current[current.length - 1];
      if (prev && (proj.hemisphere !== currentHemi || Math.hypot(proj.x - prev.x, proj.y - prev.y) > maxJump)) {
        flush();
      }
      if (current.length === 0) currentHemi = proj.hemisphere;
      current.push({ x: proj.x, y: proj.y });
    }
    flush();
    return runs;
  };

  const horizonSegments = sampleArc((t) => {
    const az = -Math.PI + t * Math.PI * 2;
    return { x: eye.x + Math.sin(az) * radiusM, y: eye.y, z: eye.z + Math.cos(az) * radiusM };
  }, 96);
  guideArcs.push({ id: "horizon-equator", kind: "horizon", segments: horizonSegments });

  for (let i = 0; i < clampedDensity * 2; i += 1) {
    const az = -Math.PI + (i / (clampedDensity * 2)) * Math.PI * 2;
    const sinAz = Math.sin(az);
    const cosAz = Math.cos(az);
    const segments = sampleArc((t) => {
      const elev = -Math.PI * 0.495 + t * Math.PI * 0.99;
      const cosE = Math.cos(elev);
      return { x: eye.x + sinAz * cosE * radiusM, y: eye.y + Math.sin(elev) * radiusM, z: eye.z + cosAz * cosE * radiusM };
    }, 64);
    if (segments.length > 0) guideArcs.push({ id: `meridian-${i}`, kind: "meridian", segments });
  }

  const halfLevels = Math.max(1, Math.floor(clampedDensity / 2));
  for (let k = -halfLevels; k <= halfLevels; k += 1) {
    if (k === 0) continue;
    const elev = (k / (halfLevels + 1)) * (Math.PI * 0.44);
    const sinE = Math.sin(elev);
    const cosE = Math.cos(elev);
    const segments = sampleArc((t) => {
      const az = -Math.PI + t * Math.PI * 2;
      return { x: eye.x + Math.sin(az) * cosE * radiusM, y: eye.y + sinE * radiusM, z: eye.z + Math.cos(az) * cosE * radiusM };
    }, 72);
    if (segments.length > 0) guideArcs.push({ id: `parallel-${k}`, kind: "parallel", segments });
  }

  const hemisphereBounds: CurvilinearHemisphereBound[] = [];
  if (camera.mode === "6pt-spherical-dual") {
    hemisphereBounds.push(
      { hemisphere: "front", cx: params.dualFrontCx, cy: params.cy, radiusPx: params.dualDiskRadiusPx },
      { hemisphere: "back", cx: params.dualBackCx, cy: params.cy, radiusPx: params.dualDiskRadiusPx },
    );
  } else if (
    camera.mode === "5pt-fisheye-equidistant" ||
    camera.mode === "5pt-fisheye-equisolid" ||
    camera.mode === "5pt-fisheye-stereographic"
  ) {
    hemisphereBounds.push({ hemisphere: "front", cx: params.cx, cy: params.cy, radiusPx: params.refRadiusPx });
  }

  return { mode: camera.mode, vanishingPoints, horizonSegments, guideArcs, hemisphereBounds };
}
