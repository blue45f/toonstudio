/**
 * 컷 카메라 파라미터(`fovDeg`, `pitchDeg`, `yawDeg`, `rollDeg`, `cameraDistanceM`, 지평선 Y)를
 * 4×4 뷰·투영 행렬(열 우선 column-major)로 계산해 3D 등신대 랜드마크와 단축 원근 타원(흉곽·골반 링)을
 * 2D 캔버스 좌표로 투영하고 깊이 정렬(`depthOrder`)을 산출한다.
 */

import type {
  BodyProportionRegion,
  CanonCrossSectionRing3D,
  CanonLandmarkId,
  CharacterProportionCanon,
  CrossSectionRingId,
  Vec2,
  Vec3,
} from "./character-proportion-canon-extractor";

export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface CutCameraParams {
  /** 수직 시야각(도, 12~120) */
  readonly fovDeg: number;
  /** 카메라 고도각(도, 양수 = 하이앵글 부감, 음수 = 로우앵글 앙각) */
  readonly pitchDeg: number;
  /** 수평 회전각(도, 0 = 정면, 양수 = 우측 3/4 시점) */
  readonly yawDeg: number;
  /** 더치 앵글 기울기(도) */
  readonly rollDeg: number;
  /** 카메라와 주시점 간 거리(m) */
  readonly cameraDistanceM: number;
  /** 지평선 Y 비율(0.0=상단 ~ 1.0=하단). 생략 시 pitch/fov 기반 자연 지평선 적용 */
  readonly horizonYNormalized?: number;
  /** 카메라 주시점 높이 비율(0=발바닥 ~ 1=정수리, 기본 0.54) */
  readonly targetHeightRatio?: number;
  readonly nearPlaneM?: number;
  readonly farPlaneM?: number;
}

export interface CanvasViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ProjectedLandmark2D {
  readonly id: CanonLandmarkId;
  readonly labelKo: string;
  readonly region: BodyProportionRegion;
  readonly worldMeters: Vec3;
  readonly canvas: Vec2;
  readonly ndc: Vec3;
  /** 카메라 전방 축 기준 깊이(m, 작을수록 카메라에 가까움) */
  readonly cameraDepthM: number;
  readonly depthRank: number;
  readonly inFrontOfCamera: boolean;
  readonly withinViewport: boolean;
}

export interface ProjectedRingSample2D {
  readonly angleDeg: number;
  readonly canvas: Vec2;
  readonly cameraDepthM: number;
  readonly isFrontArc: boolean;
}

export interface ProjectedCrossSectionEllipse2D {
  readonly id: CrossSectionRingId;
  readonly labelKo: string;
  readonly centerCanvas: Vec2;
  readonly cameraDepthM: number;
  readonly depthRank: number;
  readonly semiMajorPx: number;
  readonly semiMinorPx: number;
  /** 단축 비율(semiMinor / semiMajor, 0=수평선, 1=정원) */
  readonly foreshorteningRatio: number;
  readonly tiltAngleDeg: number;
  readonly visibleFace: "top" | "bottom" | "edge";
  readonly points: readonly ProjectedRingSample2D[];
  readonly frontArcPoints: readonly Vec2[];
  readonly backArcPoints: readonly Vec2[];
}

export interface ProjectedDepthOrderItem {
  readonly kind: "landmark" | "ring";
  readonly id: string;
  readonly labelKo: string;
  readonly cameraDepthM: number;
  readonly depthRank: number;
}

export interface ProjectedHorizonLine {
  readonly normalizedY: number;
  readonly canvasY: number;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly isWithinCanvas: boolean;
  readonly principalShiftY: number;
}

export interface PerspectiveProjectionMetrics {
  readonly headScreenHeightPx: number;
  readonly shoulderScreenWidthPx: number;
  readonly torsoScreenHeightPx: number;
  readonly pelvisScreenWidthPx: number;
  readonly lowerBodyScreenHeightPx: number;
  readonly totalScreenHeightPx: number;
  readonly apparentHeadCount: number;
  readonly headShareRatio: number;
  readonly lowerBodyShareRatio: number;
  readonly headToLowerBodyRatio: number;
  readonly angleClassification: "high-angle" | "eye-level" | "low-angle";
}

export interface ProjectedPerspectiveRigResult {
  readonly camera: CutCameraParams;
  readonly viewport: CanvasViewportSize;
  readonly cameraPositionMeters: Vec3;
  readonly targetPositionMeters: Vec3;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
  readonly horizonLine: ProjectedHorizonLine;
  readonly landmarks: readonly ProjectedLandmark2D[];
  readonly landmarkMap: Readonly<Record<CanonLandmarkId, ProjectedLandmark2D>>;
  readonly crossSectionEllipses: readonly ProjectedCrossSectionEllipse2D[];
  readonly ellipseMap: Readonly<Record<CrossSectionRingId, ProjectedCrossSectionEllipse2D>>;
  /** 카메라에 가까운 순서(오름차순 cameraDepthM)의 전체 깊이 정렬 목록 */
  readonly depthOrder: readonly ProjectedDepthOrderItem[];
  readonly metrics: PerspectiveProjectionMetrics;
}

const DEFAULT_RING_SEGMENTS = 24;
const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const roundTo = (v: number, d = 4): number => Math.round(v * 10 ** d) / 10 ** d;
const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const dist2D = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len < 1e-9 ? { x: 0, y: 0, z: 1 } : { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** 열 우선(column-major) 4×4 행렬 곱셈 `A * B` */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

/** 3D 점과 열 우선 4×4 행렬을 곱해 클립 공간 `(x, y, z, w)`을 반환한다. */
export function transformPointByMat4(
  m: Mat4,
  p: Vec3,
): { readonly x: number; readonly y: number; readonly z: number; readonly w: number } {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    w: m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15],
  };
}

function validateCameraAndViewport(camera: CutCameraParams, viewport: CanvasViewportSize): void {
  if (!Number.isFinite(camera.fovDeg) || camera.fovDeg < 12 || camera.fovDeg > 120) {
    throw new RangeError(`카메라 수직 시야각(fovDeg=${camera.fovDeg})은 12~120° 범위여야 합니다.`);
  }
  if (!Number.isFinite(camera.pitchDeg) || camera.pitchDeg < -85 || camera.pitchDeg > 85) {
    throw new RangeError(`카메라 고도각(pitchDeg=${camera.pitchDeg})은 -85~+85° 범위여야 합니다.`);
  }
  if (!Number.isFinite(camera.yawDeg) || !Number.isFinite(camera.rollDeg)) {
    throw new RangeError("카메라 yawDeg/rollDeg는 유한한 숫자여야 합니다.");
  }
  if (!Number.isFinite(camera.cameraDistanceM) || camera.cameraDistanceM <= 0.4) {
    throw new RangeError("카메라 거리(cameraDistanceM)는 0.4m보다 커야 합니다.");
  }
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("캔버스 뷰포트 너비와 높이는 0보다 커야 합니다.");
  }
}

function buildCameraMatrices(camera: CutCameraParams, viewport: CanvasViewportSize, target: Vec3) {
  const pitchRad = degToRad(camera.pitchDeg);
  const yawRad = degToRad(camera.yawDeg);
  const rollRad = degToRad(camera.rollDeg);
  const horizDist = camera.cameraDistanceM * Math.cos(pitchRad);

  const eye: Vec3 = {
    x: target.x + horizDist * Math.sin(yawRad),
    y: target.y + camera.cameraDistanceM * Math.sin(pitchRad),
    z: target.z + horizDist * Math.cos(yawRad),
  };

  const zAxis = normalizeVec3(subVec3(eye, target));
  const worldUp: Vec3 = Math.abs(zAxis.y) > 0.995 ? { x: -Math.sin(yawRad), y: 0, z: -Math.cos(yawRad) } : { x: 0, y: 1, z: 0 };
  const rightBase = normalizeVec3(crossVec3(worldUp, zAxis));
  const upBase = crossVec3(zAxis, rightBase);

  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);
  const right: Vec3 = {
    x: rightBase.x * cosR + upBase.x * sinR,
    y: rightBase.y * cosR + upBase.y * sinR,
    z: rightBase.z * cosR + upBase.z * sinR,
  };
  const up: Vec3 = {
    x: -rightBase.x * sinR + upBase.x * cosR,
    y: -rightBase.y * sinR + upBase.y * cosR,
    z: -rightBase.z * sinR + upBase.z * cosR,
  };

  const viewMatrix: Mat4 = [
    right.x, up.x, zAxis.x, 0,
    right.y, up.y, zAxis.y, 0,
    right.z, up.z, zAxis.z, 0,
    -dotVec3(right, eye), -dotVec3(up, eye), -dotVec3(zAxis, eye), 1,
  ];

  const focal = 1 / Math.tan(degToRad(camera.fovDeg) * 0.5);
  const aspect = viewport.width / viewport.height;
  const near = camera.nearPlaneM ?? 0.05;
  const far = camera.farPlaneM ?? 100.0;
  const naturalHorizonNdcY = Math.tan(pitchRad) * focal;
  const desiredHorizonNdcY = camera.horizonYNormalized !== undefined ? 1 - 2 * camera.horizonYNormalized : naturalHorizonNdcY;
  const principalShiftY = desiredHorizonNdcY - naturalHorizonNdcY;

  const projectionMatrix: Mat4 = [
    focal / aspect, 0, 0, 0,
    0, focal, 0, 0,
    0, -principalShiftY, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ];

  const viewProjectionMatrix = multiplyMat4(projectionMatrix, viewMatrix);
  const horizonNormalizedY = (1 - desiredHorizonNdcY) * 0.5;
  const horizonCanvasY = horizonNormalizedY * viewport.height;
  const tiltDy = Math.tan(rollRad) * viewport.width * 0.5;

  const horizonLine: ProjectedHorizonLine = {
    normalizedY: roundTo(horizonNormalizedY, 4),
    canvasY: roundTo(horizonCanvasY, 3),
    start: { x: 0, y: roundTo(horizonCanvasY - tiltDy, 3) },
    end: { x: viewport.width, y: roundTo(horizonCanvasY + tiltDy, 3) },
    isWithinCanvas: horizonCanvasY >= 0 && horizonCanvasY <= viewport.height,
    principalShiftY: roundTo(principalShiftY, 5),
  };
  return { eye, viewMatrix, projectionMatrix, viewProjectionMatrix, horizonLine };
}

function projectWorldPoint(viewMatrix: Mat4, vpMatrix: Mat4, viewport: CanvasViewportSize, worldPoint: Vec3) {
  const cameraDepthM = -transformPointByMat4(viewMatrix, worldPoint).z;
  const clip = transformPointByMat4(vpMatrix, worldPoint);
  const safeW = Math.abs(clip.w) < 1e-6 ? 1e-6 : clip.w;
  const ndcX = clip.x / safeW;
  const ndcY = clip.y / safeW;
  const ndcZ = clip.z / safeW;
  const canvasX = (ndcX * 0.5 + 0.5) * viewport.width;
  const canvasY = (0.5 - ndcY * 0.5) * viewport.height;
  const inFrontOfCamera = cameraDepthM > 0.05;
  return {
    canvas: { x: roundTo(canvasX, 3), y: roundTo(canvasY, 3) },
    ndc: { x: roundTo(ndcX, 5), y: roundTo(ndcY, 5), z: roundTo(ndcZ, 5) },
    cameraDepthM: roundTo(cameraDepthM, 5),
    inFrontOfCamera,
    withinViewport: inFrontOfCamera && canvasX >= 0 && canvasX <= viewport.width && canvasY >= 0 && canvasY <= viewport.height,
  };
}

function projectCrossSectionRing(
  ring: CanonCrossSectionRing3D,
  eye: Vec3,
  viewMatrix: Mat4,
  vpMatrix: Mat4,
  viewport: CanvasViewportSize,
  segments: number,
): Omit<ProjectedCrossSectionEllipse2D, "depthRank"> {
  const centerProj = projectWorldPoint(viewMatrix, vpMatrix, viewport, ring.centerMeters);
  const tiltRad = degToRad(ring.tiltXDeg);
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const normalDotEye = dotVec3({ x: 0, y: cosT, z: sinT }, normalizeVec3(subVec3(eye, ring.centerMeters)));
  const visibleFace: "top" | "bottom" | "edge" = normalDotEye > 0.08 ? "top" : normalDotEye < -0.08 ? "bottom" : "edge";

  const points: ProjectedRingSample2D[] = [];
  const frontArcPoints: Vec2[] = [];
  const backArcPoints: Vec2[] = [];
  let covXX = 0;
  let covYY = 0;
  let covXY = 0;

  for (let i = 0; i < segments; i += 1) {
    const angleDeg = (360 * i) / segments;
    const theta = degToRad(angleDeg);
    const localX = ring.radiusXMeters * Math.cos(theta);
    const localZ = ring.radiusZMeters * Math.sin(theta);
    const proj = projectWorldPoint(viewMatrix, vpMatrix, viewport, {
      x: ring.centerMeters.x + localX,
      y: ring.centerMeters.y - localZ * sinT,
      z: ring.centerMeters.z + localZ * cosT,
    });
    const isFrontArc = proj.cameraDepthM <= centerProj.cameraDepthM + 1e-4;
    points.push({ angleDeg: roundTo(angleDeg, 2), canvas: proj.canvas, cameraDepthM: proj.cameraDepthM, isFrontArc });
    (isFrontArc ? frontArcPoints : backArcPoints).push(proj.canvas);
    const dx = proj.canvas.x - centerProj.canvas.x;
    const dy = proj.canvas.y - centerProj.canvas.y;
    covXX += dx * dx;
    covYY += dy * dy;
    covXY += dx * dy;
  }

  const scaleCov = 2 / Math.max(points.length, 1);
  covXX *= scaleCov;
  covYY *= scaleCov;
  covXY *= scaleCov;
  const trace = covXX + covYY;
  const disc = Math.sqrt(Math.max(0, (covXX - covYY) ** 2 + 4 * covXY * covXY));
  const semiMajorPx = Math.sqrt(Math.max(0, (trace + disc) * 0.5));
  const semiMinorPx = Math.sqrt(Math.max(0, (trace - disc) * 0.5));

  return {
    id: ring.id, labelKo: ring.labelKo, centerCanvas: centerProj.canvas, cameraDepthM: centerProj.cameraDepthM,
    semiMajorPx: roundTo(semiMajorPx, 3), semiMinorPx: roundTo(semiMinorPx, 3),
    foreshorteningRatio: roundTo(semiMajorPx > 1e-4 ? semiMinorPx / semiMajorPx : 0, 4),
    tiltAngleDeg: roundTo((0.5 * Math.atan2(2 * covXY, covXX - covYY) * 180) / Math.PI, 2),
    visibleFace, points, frontArcPoints, backArcPoints,
  };
}

/** 3D 캐릭터 캐논을 컷 카메라와 2D 캔버스 뷰포트에 4×4 행렬로 투영한다. */
export function projectCharacterRigToCanvas(
  canon: CharacterProportionCanon,
  camera: CutCameraParams,
  viewport: CanvasViewportSize,
  options: { readonly ringSegments?: number } = {},
): ProjectedPerspectiveRigResult {
  validateCameraAndViewport(camera, viewport);
  const segments = Math.max(12, Math.min(72, Math.round(options.ringSegments ?? DEFAULT_RING_SEGMENTS)));
  const target: Vec3 = { x: 0, y: canon.totalHeightMeters * (camera.targetHeightRatio ?? 0.54), z: 0 };
  const { eye, viewMatrix, projectionMatrix, viewProjectionMatrix, horizonLine } = buildCameraMatrices(camera, viewport, target);

  const rawLandmarks = canon.landmarks.map((lm) => ({
    id: lm.id, labelKo: lm.labelKo, region: lm.region, worldMeters: lm.positionMeters,
    ...projectWorldPoint(viewMatrix, viewProjectionMatrix, viewport, lm.positionMeters),
  }));
  const rawEllipses = canon.crossSectionRings.map((ring) =>
    projectCrossSectionRing(ring, eye, viewMatrix, viewProjectionMatrix, viewport, segments),
  );

  const depthOrder: ProjectedDepthOrderItem[] = [
    ...rawLandmarks.map((l) => ({ kind: "landmark" as const, id: l.id, labelKo: l.labelKo, cameraDepthM: l.cameraDepthM })),
    ...rawEllipses.map((e) => ({ kind: "ring" as const, id: e.id, labelKo: e.labelKo, cameraDepthM: e.cameraDepthM })),
  ]
    .sort((a, b) => a.cameraDepthM - b.cameraDepthM)
    .map((item, depthRank) => ({ ...item, depthRank }));

  const rankLookup = new Map(depthOrder.map((item) => [`${item.kind}:${item.id}`, item.depthRank]));
  const landmarks: ProjectedLandmark2D[] = rawLandmarks.map((l) => ({ ...l, depthRank: rankLookup.get(`landmark:${l.id}`) ?? 0 }));
  const landmarkMap = Object.fromEntries(landmarks.map((l) => [l.id, l])) as Readonly<Record<CanonLandmarkId, ProjectedLandmark2D>>;
  const crossSectionEllipses: ProjectedCrossSectionEllipse2D[] = rawEllipses.map((e) => ({ ...e, depthRank: rankLookup.get(`ring:${e.id}`) ?? 0 }));
  const ellipseMap = Object.fromEntries(crossSectionEllipses.map((e) => [e.id, e])) as Readonly<Record<CrossSectionRingId, ProjectedCrossSectionEllipse2D>>;

  const headPx = dist2D(landmarkMap.crown.canvas, landmarkMap.chin.canvas);
  const shoulderPx = dist2D(landmarkMap.shoulderLeft.canvas, landmarkMap.shoulderRight.canvas);
  const torsoPx = dist2D(landmarkMap.shoulderCenter.canvas, landmarkMap.pelvisCenter.canvas);
  const pelvisPx = dist2D(landmarkMap.pelvisLeft.canvas, landmarkMap.pelvisRight.canvas);
  const lowerPx = dist2D(landmarkMap.pelvisCenter.canvas, landmarkMap.footSole.canvas);
  const totalPx = dist2D(landmarkMap.crown.canvas, landmarkMap.footSole.canvas);

  return {
    camera, viewport,
    cameraPositionMeters: { x: roundTo(eye.x, 4), y: roundTo(eye.y, 4), z: roundTo(eye.z, 4) },
    targetPositionMeters: { x: roundTo(target.x, 4), y: roundTo(target.y, 4), z: roundTo(target.z, 4) },
    viewMatrix, projectionMatrix, viewProjectionMatrix, horizonLine,
    landmarks, landmarkMap, crossSectionEllipses, ellipseMap, depthOrder,
    metrics: {
      headScreenHeightPx: roundTo(headPx, 3),
      shoulderScreenWidthPx: roundTo(shoulderPx, 3),
      torsoScreenHeightPx: roundTo(torsoPx, 3),
      pelvisScreenWidthPx: roundTo(pelvisPx, 3),
      lowerBodyScreenHeightPx: roundTo(lowerPx, 3),
      totalScreenHeightPx: roundTo(totalPx, 3),
      apparentHeadCount: roundTo(totalPx / Math.max(headPx, 1e-4), 4),
      headShareRatio: roundTo(headPx / Math.max(totalPx, 1e-4), 4),
      lowerBodyShareRatio: roundTo(lowerPx / Math.max(totalPx, 1e-4), 4),
      headToLowerBodyRatio: roundTo(headPx / Math.max(lowerPx, 1e-4), 4),
      angleClassification: camera.pitchDeg >= 10 ? "high-angle" : camera.pitchDeg <= -10 ? "low-angle" : "eye-level",
    },
  };
}
