/**
 * Wave 81 — 2D 러프 투시 스케치 소실점 보정 및 3D 파라메트릭 씬 자동 리프터.
 *
 * - 1·2·3점 투시 구성선을 방향별 광선 다발로 분류하고 결정적 RANSAC 합의 + Huber IRLS 교점 최적화로 소실점을 추정한다.
 * - 직교 소실점 제약(`dot(vpX - pp, vpZ - pp) = -f^2`)으로 초점거리와 카메라 자세(yaw/pitch/roll)를 복원한다.
 * - 복원된 카메라 광선을 바닥 평면(`Y = 0`)에 역투영해 미터 단위(`1.0 = 1m`, 오른손 Y-Up glTF 규약)
 *   수밀 건축 공간과 바닥 접지·적층 불변식을 만족하는 파라메트릭 소품 씬을 생성한다.
 */

export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }

export type PerspectiveAxisHint = "auto" | "x" | "y" | "z";
export type PerspectiveType = "1-point" | "2-point" | "3-point";
export type SceneArchetype = "interior-room" | "corridor-hallway" | "urban-street-alley";
export type FocalLengthSource =
  | "orthogonality-xz" | "orthogonality-xy" | "orthogonality-zy"
  | "orthogonality-3pt-mean" | "fallback-default-fov";

export type SketchStrokeSemanticRole =
  | "floor-grid" | "wall-boundary" | "ceiling-line" | "window" | "door"
  | "desk" | "chair" | "cabinet" | "shelf" | "tabletop-prop"
  | "building" | "streetlamp" | "road-edge" | "guide";

export type ArchitecturalPlaneRole =
  | "floor" | "ceiling" | "wall-back" | "wall-left" | "wall-right"
  | "facade-left" | "facade-right" | "road-surface";

export type ParametricPropCategory =
  | "desk" | "chair" | "cabinet" | "shelf" | "window"
  | "door" | "tabletop-prop" | "building" | "streetlamp";

export interface RoughPerspectiveStroke2d {
  readonly id: string; readonly start: Vec2; readonly end: Vec2;
  readonly axisHint?: PerspectiveAxisHint; readonly role?: SketchStrokeSemanticRole;
  readonly groupId?: string; readonly label?: string;
  readonly confidence?: number; readonly parentGroupId?: string;
}

export interface CameraBasis3d { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3; }

export interface CalibratedCameraState {
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly principalPointPx: Vec2; readonly focalLengthPx: number; readonly focalLengthMm: number;
  readonly horizontalFovDeg: number; readonly verticalFovDeg: number;
  readonly positionMeters: Vec3; readonly eyeHeightMeters: number;
  readonly yawDeg: number; readonly pitchDeg: number; readonly rollDeg: number;
  readonly horizonYPx: number; readonly horizonSlope: number;
  readonly perspectiveType: PerspectiveType;
  readonly vanishingPoints: { readonly vpX: Vec2 | null; readonly vpZ: Vec2 | null; readonly vpY: Vec2 | null };
  readonly basis: CameraBasis3d;
}

export interface VanishingPointSolveDiagnostics {
  readonly inlierCounts: { readonly x: number; readonly y: number; readonly z: number };
  readonly medianAngularErrorDeg: number; readonly medianOrthogonalDistancePx: number;
  readonly focalLengthSource: FocalLengthSource; readonly converged: boolean;
  readonly clusterAssignments: Readonly<Record<string, "x" | "y" | "z" | "unassigned">>;
}

export interface CameraCalibrationOptions {
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly principalPointPx?: Vec2; readonly defaultFocalLengthMm?: number;
  readonly eyeHeightMeters?: number; readonly ransacInlierThresholdPx?: number;
  readonly irlsIterations?: number;
}

export interface CameraCalibrationResult {
  readonly camera: CalibratedCameraState;
  readonly diagnostics: VanishingPointSolveDiagnostics;
}

export interface ArchitecturalPlane3d {
  readonly id: string; readonly role: ArchitecturalPlaneRole;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3]; readonly normal: Vec3;
  readonly widthMeters: number; readonly heightMeters: number; readonly isSolidOccluder: boolean;
}

export interface ParametricBoxProp3d {
  readonly id: string; readonly label: string; readonly category: ParametricPropCategory;
  readonly centerMeters: Vec3; readonly sizeMeters: Vec3; readonly yawDeg: number;
  readonly minYMeters: number; readonly maxYMeters: number;
  readonly groundedOn: "floor" | "parent-prop" | "wall-embedded";
  readonly parentPropId: string | null; readonly volumeCubicMeters: number;
  readonly isSolidOccluder: boolean; readonly sourceStrokeIds: readonly string[];
}

export interface ParametricScene3d {
  readonly sceneId: string; readonly archetype: SceneArchetype;
  readonly units: "meters"; readonly coordinateSystem: "right-handed-y-up-gltf";
  readonly calibratedCamera: CalibratedCameraState;
  readonly calibrationDiagnostics: VanishingPointSolveDiagnostics;
  readonly enclosureBoundsMeters: {
    readonly minX: number; readonly maxX: number; readonly minY: number;
    readonly maxY: number; readonly minZ: number; readonly maxZ: number;
  };
  readonly enclosurePlanes: readonly ArchitecturalPlane3d[];
  readonly props: readonly ParametricBoxProp3d[];
  readonly groundingAudit: {
    readonly allStandingPropsFloorSeated: boolean; readonly allStackedPropsFlush: boolean;
    readonly maxGroundingErrorMeters: number; readonly floatingPropIds: readonly string[];
  };
}

export interface SketchToSceneLiftInput {
  readonly strokes: readonly RoughPerspectiveStroke2d[];
  readonly archetype: SceneArchetype;
  readonly cameraOptions: CameraCalibrationOptions;
  readonly sceneId?: string;
  readonly roomDimensionsOverrideMeters?: { readonly width?: number; readonly depth?: number; readonly height?: number };
}

interface NormalizedLine2d {
  readonly stroke: RoughPerspectiveStroke2d;
  readonly a: number; readonly b: number; readonly c: number;
  readonly dirX: number; readonly dirY: number;
  readonly midX: number; readonly midY: number;
  readonly lengthPx: number; readonly angleRad: number; readonly weight: number;
}

interface PropDimensionPrior { readonly def: Vec3; readonly min: Vec3; readonly max: Vec3; readonly labelKo: string; }

const FULL_FRAME_SENSOR_WIDTH_MM = 36;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-8;

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const PROP_CATEGORY_PRIORS: Readonly<Record<ParametricPropCategory, PropDimensionPrior>> = {
  desk: { def: v3(1.4, 0.75, 0.75), min: v3(0.75, 0.68, 0.48), max: v3(2.6, 0.86, 1.2), labelKo: "책상" },
  chair: { def: v3(0.56, 0.88, 0.56), min: v3(0.38, 0.72, 0.38), max: v3(0.85, 1.15, 0.85), labelKo: "의자" },
  cabinet: { def: v3(0.95, 1.65, 0.52), min: v3(0.45, 0.85, 0.32), max: v3(2.2, 2.4, 0.95), labelKo: "캐비닛" },
  shelf: { def: v3(1.1, 1.9, 0.38), min: v3(0.5, 1.1, 0.25), max: v3(2.8, 2.5, 0.7), labelKo: "선반장" },
  window: { def: v3(1.5, 1.25, 0.14), min: v3(0.6, 0.65, 0.12), max: v3(3.6, 2.1, 0.28), labelKo: "창문" },
  door: { def: v3(0.92, 2.12, 0.14), min: v3(0.72, 1.95, 0.12), max: v3(1.8, 2.4, 0.32), labelKo: "출입문" },
  "tabletop-prop": { def: v3(0.32, 0.26, 0.24), min: v3(0.12, 0.12, 0.12), max: v3(0.85, 0.68, 0.65), labelKo: "탁상 소품" },
  building: { def: v3(3.4, 7.2, 4.5), min: v3(1.8, 3.4, 2.0), max: v3(12.0, 18.0, 14.0), labelKo: "건물 매스" },
  streetlamp: { def: v3(0.28, 4.2, 0.28), min: v3(0.14, 2.8, 0.14), max: v3(0.7, 6.5, 0.7), labelKo: "가로등" },
};

const PROP_ROLE_SET: ReadonlySet<SketchStrokeSemanticRole> = new Set([
  "desk", "chair", "cabinet", "shelf", "window", "door", "tabletop-prop", "building", "streetlamp",
]);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const isFiniteVec2 = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len <= EPSILON ? { x: 0, y: 0, z: -1 } : { x: v.x / len, y: v.y / len, z: v.z / len };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) * 0.5;
}

/** 오른손 Y-Up glTF 규약 카메라 기저 벡터를 계산한다 (`+yaw`: 오른쪽, `+pitch`: 위, `+roll`: 시계). */
export function buildCameraBasis(yawDeg: number, pitchDeg: number, rollDeg: number): CameraBasis3d {
  const [yaw, pitch, roll] = [yawDeg * DEG_TO_RAD, pitchDeg * DEG_TO_RAD, rollDeg * DEG_TO_RAD];
  const [cosY, sinY, cosP, sinP, cosR, sinR] = [
    Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll),
  ];
  const [f0, r0] = [v3(sinY, 0, -cosY), v3(cosY, 0, sinY)];
  const forward = normalize3(v3(f0.x * cosP, sinP, f0.z * cosP));
  const u1 = normalize3(v3(-f0.x * sinP, cosP, -f0.z * sinP));
  const right = normalize3(v3(r0.x * cosR + u1.x * sinR, r0.y * cosR + u1.y * sinR, r0.z * cosR + u1.z * sinR));
  const up = normalize3(v3(-r0.x * sinR + u1.x * cosR, -r0.y * sinR + u1.y * cosR, -r0.z * sinR + u1.z * cosR));
  return { right, up, forward };
}

/** 월드 방향 벡터의 2D 소실점 투영 좌표를 반환한다(무한원점은 `null`). */
export function projectDirectionToVanishingPoint(
  direction: Vec3, camera: Pick<CalibratedCameraState, "basis" | "focalLengthPx" | "principalPointPx">,
): Vec2 | null {
  const d = normalize3(direction);
  const cz = dot3(d, camera.basis.forward);
  if (Math.abs(cz) < 1e-4) return null;
  return {
    x: camera.principalPointPx.x + camera.focalLengthPx * (dot3(d, camera.basis.right) / cz),
    y: camera.principalPointPx.y - camera.focalLengthPx * (dot3(d, camera.basis.up) / cz),
  };
}

/** 월드 3D 좌표를 스크린 좌표(px)와 카메라 깊이(m)로 투영한다. */
export function projectWorldPointToScreen(
  worldPoint: Vec3, camera: CalibratedCameraState,
): { readonly screenPx: Vec2; readonly depthMeters: number; readonly camX: number; readonly camY: number } | null {
  const rel = sub3(worldPoint, camera.positionMeters);
  const [camX, camY, depthMeters] = [dot3(rel, camera.basis.right), dot3(rel, camera.basis.up), dot3(rel, camera.basis.forward)];
  if (depthMeters <= 1e-4) return null;
  return {
    screenPx: {
      x: camera.principalPointPx.x + camera.focalLengthPx * (camX / depthMeters),
      y: camera.principalPointPx.y - camera.focalLengthPx * (camY / depthMeters),
    },
    depthMeters, camX, camY,
  };
}

/** 스크린 2D 좌표를 수평 평면(`Y = planeYMeters`, 기본 바닥 `0`) 위의 월드 3D 좌표로 역투영한다. */
export function unprojectScreenPointToFloorPlane(
  screenPx: Vec2, camera: CalibratedCameraState, planeYMeters = 0, maxDistanceMeters = 45,
): Vec3 | null {
  const [rx, ry, rz] = [screenPx.x - camera.principalPointPx.x, -(screenPx.y - camera.principalPointPx.y), camera.focalLengthPx];
  const dirWorld = normalize3(v3(
    camera.basis.right.x * rx + camera.basis.up.x * ry + camera.basis.forward.x * rz,
    camera.basis.right.y * rx + camera.basis.up.y * ry + camera.basis.forward.y * rz,
    camera.basis.right.z * rx + camera.basis.up.z * ry + camera.basis.forward.z * rz,
  ));
  if (Math.abs(dirWorld.y) < 1e-4) return null;
  const t = (planeYMeters - camera.positionMeters.y) / dirWorld.y;
  if (t <= 0.2 || t > maxDistanceMeters) return null;
  return v3(camera.positionMeters.x + dirWorld.x * t, planeYMeters, camera.positionMeters.z + dirWorld.z * t);
}

function toNormalizedLines(strokes: readonly RoughPerspectiveStroke2d[]): NormalizedLine2d[] {
  const lines: NormalizedLine2d[] = [];
  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i];
    if (!stroke || !isFiniteVec2(stroke.start) || !isFiniteVec2(stroke.end)) continue;
    const dx = stroke.end.x - stroke.start.x;
    const dy = stroke.end.y - stroke.start.y;
    const lengthPx = Math.hypot(dx, dy);
    if (lengthPx < 1e-2) continue;
    const dirX = dx / lengthPx;
    const dirY = dy / lengthPx;
    const a = -dirY;
    const b = dirX;
    const c = -(a * stroke.start.x + b * stroke.start.y);
    let angleRad = Math.atan2(dy, dx);
    if (angleRad < 0) angleRad += Math.PI;
    if (angleRad >= Math.PI) angleRad -= Math.PI;
    lines.push({
      stroke, a, b, c, dirX, dirY,
      midX: (stroke.start.x + stroke.end.x) * 0.5,
      midY: (stroke.start.y + stroke.end.y) * 0.5,
      lengthPx, angleRad,
      weight: clamp(stroke.confidence ?? 1, 0.05, 1) * Math.sqrt(lengthPx),
    });
  }
  return lines;
}

function intersectLines(l1: NormalizedLine2d, l2: NormalizedLine2d): Vec2 | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-5) return null;
  const x = (l1.b * l2.c - l2.b * l1.c) / det;
  const y = (l2.a * l1.c - l1.a * l2.c) / det;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function endpointDeviationPx(line: NormalizedLine2d, vp: Vec2): number {
  const vx = line.midX - vp.x;
  const vy = line.midY - vp.y;
  const dist = Math.hypot(vx, vy);
  if (dist <= 1e-5) return 0;
  return line.lengthPx * 0.5 * Math.abs(line.dirX * (vy / dist) - line.dirY * (vx / dist));
}

function angularErrorDeg(line: NormalizedLine2d, vp: Vec2): number {
  const vx = line.midX - vp.x;
  const vy = line.midY - vp.y;
  const dist = Math.hypot(vx, vy);
  if (dist <= 1e-5) return 0;
  return Math.asin(clamp(Math.abs(line.dirX * (vy / dist) - line.dirY * (vx / dist)), 0, 1)) * RAD_TO_DEG;
}

function estimatePencilVanishingPoint(
  lines: readonly NormalizedLine2d[],
  inlierThresholdPx: number,
  irlsIterations: number,
  maxFiniteRadiusPx: number,
  principalPoint: Vec2,
): { readonly vp: Vec2 | null; readonly inliers: readonly NormalizedLine2d[] } {
  if (lines.length < 2) return { vp: null, inliers: [] };
  const ordered = lines.slice().sort((u, v) => v.weight - u.weight);
  const pool = ordered.slice(0, Math.min(ordered.length, 48));

  let bestVp: Vec2 | null = null;
  let bestScore = -1;
  for (let i = 0; i < pool.length; i += 1) {
    const li = pool[i]!;
    for (let j = i + 1; j < pool.length; j += 1) {
      const pt = intersectLines(li, pool[j]!);
      if (!pt || Math.hypot(pt.x - principalPoint.x, pt.y - principalPoint.y) > maxFiniteRadiusPx) continue;
      let score = 0;
      for (let k = 0; k < ordered.length; k += 1) {
        const lk = ordered[k]!;
        const dev = endpointDeviationPx(lk, pt);
        if (dev <= inlierThresholdPx && angularErrorDeg(lk, pt) <= 4.5) {
          score += lk.weight * (1 - Math.min(dev / Math.max(inlierThresholdPx, 1e-3), 1) * 0.5);
        }
      }
      if (score > bestScore) { bestScore = score; bestVp = pt; }
    }
  }
  if (!bestVp) return { vp: null, inliers: [] };

  const consensus = ordered.filter(
    (l) => endpointDeviationPx(l, bestVp) <= inlierThresholdPx * 1.4 && angularErrorDeg(l, bestVp) <= 5.5,
  );
  const workingSet = consensus.length >= 2 ? consensus : ordered;
  let currentVp = bestVp;
  const huberScale = Math.max(inlierThresholdPx * 0.75, 1.0);

  for (let iter = 0; iter < Math.max(1, irlsIterations); iter += 1) {
    let a00 = 0; let a01 = 0; let a11 = 0; let b0 = 0; let b1 = 0;
    for (let i = 0; i < workingSet.length; i += 1) {
      const l = workingSet[i]!;
      const residual = Math.abs(l.a * currentVp.x + l.b * currentVp.y + l.c);
      const w = l.weight * (residual <= huberScale ? 1 : huberScale / Math.max(residual, EPSILON));
      a00 += w * l.a * l.a; a01 += w * l.a * l.b; a11 += w * l.b * l.b;
      b0 -= w * l.a * l.c; b1 -= w * l.b * l.c;
    }
    const det = a00 * a11 - a01 * a01;
    if (Math.abs(det) < 1e-7) break;
    const nextX = (a11 * b0 - a01 * b1) / det;
    const nextY = (a00 * b1 - a01 * b0) / det;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) break;
    if (Math.hypot(nextX - principalPoint.x, nextY - principalPoint.y) > maxFiniteRadiusPx) {
      return { vp: null, inliers: [] };
    }
    const delta = Math.hypot(nextX - currentVp.x, nextY - currentVp.y);
    currentVp = { x: nextX, y: nextY };
    if (delta < 1e-4) break;
  }

  const finalInliers = ordered.filter(
    (l) => endpointDeviationPx(l, currentVp) <= inlierThresholdPx * 1.6 && angularErrorDeg(l, currentVp) <= 6.0,
  );
  return { vp: currentVp, inliers: finalInliers.length >= 2 ? finalInliers : workingSet };
}

function classifyStrokesIntoAxisPencils(
  lines: readonly NormalizedLine2d[],
  inlierThresholdPx: number,
  irlsIterations: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  principalPoint: Vec2,
): {
  readonly xLines: NormalizedLine2d[];
  readonly yLines: NormalizedLine2d[];
  readonly zLines: NormalizedLine2d[];
  readonly assignments: Record<string, "x" | "y" | "z" | "unassigned">;
} {
  const xLines: NormalizedLine2d[] = [];
  const yLines: NormalizedLine2d[] = [];
  const zLines: NormalizedLine2d[] = [];
  const autoNonVertical: NormalizedLine2d[] = [];
  const assignments: Record<string, "x" | "y" | "z" | "unassigned"> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const hint = line.stroke.axisHint ?? "auto";
    if (hint === "x") { xLines.push(line); assignments[line.stroke.id] = "x"; }
    else if (hint === "y") { yLines.push(line); assignments[line.stroke.id] = "y"; }
    else if (hint === "z") { zLines.push(line); assignments[line.stroke.id] = "z"; }
    else if (Math.abs(line.angleRad - Math.PI * 0.5) <= 20 * DEG_TO_RAD) {
      yLines.push(line); assignments[line.stroke.id] = "y";
    } else {
      autoNonVertical.push(line); assignments[line.stroke.id] = "unassigned";
    }
  }
  if (autoNonVertical.length === 0) return { xLines, yLines, zLines, assignments };

  const maxFiniteRadius = Math.max(viewportWidthPx, viewportHeightPx) * 28;
  const nearHorizontal: NormalizedLine2d[] = [];
  const converging: NormalizedLine2d[] = [];
  for (let i = 0; i < autoNonVertical.length; i += 1) {
    const l = autoNonVertical[i]!;
    if (Math.min(l.angleRad, Math.PI - l.angleRad) <= 3.5 * DEG_TO_RAD) nearHorizontal.push(l);
    else converging.push(l);
  }

  const primary = converging.length >= 2 ? converging : autoNonVertical;
  const first = estimatePencilVanishingPoint(primary, inlierThresholdPx, irlsIterations, maxFiniteRadius, principalPoint);
  if (!first.vp) {
    for (const l of nearHorizontal) { xLines.push(l); assignments[l.stroke.id] = "x"; }
    return { xLines, yLines, zLines, assignments };
  }

  const firstIds = new Set(first.inliers.map((l) => l.stroke.id));
  const remaining = autoNonVertical.filter((l) => !firstIds.has(l.stroke.id));
  const second = estimatePencilVanishingPoint(remaining, inlierThresholdPx, irlsIterations, maxFiniteRadius, principalPoint);
  const distinctSecond =
    second.vp !== null && second.inliers.length >= 2 &&
    Math.hypot(second.vp.x - first.vp.x, second.vp.y - first.vp.y) > viewportWidthPx * 0.16;

  if (distinctSecond && second.vp) {
    const zVp = first.vp.x <= second.vp.x ? first.vp : second.vp;
    const xVp = first.vp.x <= second.vp.x ? second.vp : first.vp;
    for (const l of autoNonVertical) {
      if (endpointDeviationPx(l, zVp) <= endpointDeviationPx(l, xVp)) {
        zLines.push(l); assignments[l.stroke.id] = "z";
      } else {
        xLines.push(l); assignments[l.stroke.id] = "x";
      }
    }
  } else {
    for (const l of autoNonVertical) {
      const horiz = Math.min(l.angleRad, Math.PI - l.angleRad) <= 3.5 * DEG_TO_RAD;
      if (horiz && endpointDeviationPx(l, first.vp) > inlierThresholdPx * 0.8) {
        xLines.push(l); assignments[l.stroke.id] = "x";
      } else {
        zLines.push(l); assignments[l.stroke.id] = "z";
      }
    }
  }
  return { xLines, yLines, zLines, assignments };
}

/** 2D 러프 투시 스케치 선분에서 소실점(1·2·3점), 지평선, 초점거리, 카메라 자세를 보정한다. */
export function solveCameraFromRoughPerspectiveStrokes(
  strokes: readonly RoughPerspectiveStroke2d[],
  options: CameraCalibrationOptions,
): CameraCalibrationResult {
  const viewportWidthPx = Math.max(64, options.viewportWidthPx);
  const viewportHeightPx = Math.max(64, options.viewportHeightPx);
  const principalPointPx = options.principalPointPx ?? { x: viewportWidthPx * 0.5, y: viewportHeightPx * 0.5 };
  const eyeHeightMeters = clamp(options.eyeHeightMeters ?? 1.55, 0.4, 12.0);
  const defaultFocalLengthMm = clamp(options.defaultFocalLengthMm ?? 35, 14, 150);
  const inlierThresholdPx = Math.max(1.0, options.ransacInlierThresholdPx ?? 6.0);
  const irlsIterations = Math.max(2, options.irlsIterations ?? 8);
  const maxFiniteRadius = Math.max(viewportWidthPx, viewportHeightPx) * 28;

  const lines = toNormalizedLines(strokes);
  const { xLines, yLines, zLines, assignments } = classifyStrokesIntoAxisPencils(
    lines, inlierThresholdPx, irlsIterations, viewportWidthPx, viewportHeightPx, principalPointPx,
  );
  const xFit = estimatePencilVanishingPoint(xLines, inlierThresholdPx, irlsIterations, maxFiniteRadius, principalPointPx);
  const zFit = estimatePencilVanishingPoint(zLines, inlierThresholdPx, irlsIterations, maxFiniteRadius, principalPointPx);
  const yFit = estimatePencilVanishingPoint(yLines, inlierThresholdPx, irlsIterations, maxFiniteRadius, principalPointPx);

  let vpX = xFit.vp;
  let vpZ = zFit.vp;
  const vpY = yFit.vp;
  if (!vpZ && vpX) { vpZ = vpX; vpX = null; }

  const perspectiveType: PerspectiveType = vpX && vpZ && vpY ? "3-point" : vpX && vpZ ? "2-point" : "1-point";

  const orthoDot = (a: Vec2, b: Vec2): number =>
    -((a.x - principalPointPx.x) * (b.x - principalPointPx.x) + (a.y - principalPointPx.y) * (b.y - principalPointPx.y));
  const orthoPairs: Array<{ readonly source: FocalLengthSource; readonly f2: number }> = [];
  if (vpX && vpZ) { const f2 = orthoDot(vpX, vpZ); if (f2 > 100) orthoPairs.push({ source: "orthogonality-xz", f2 }); }
  if (vpX && vpY) { const f2 = orthoDot(vpX, vpY); if (f2 > 100) orthoPairs.push({ source: "orthogonality-xy", f2 }); }
  if (vpZ && vpY) { const f2 = orthoDot(vpZ, vpY); if (f2 > 100) orthoPairs.push({ source: "orthogonality-zy", f2 }); }

  let focalLengthPx = (defaultFocalLengthMm / FULL_FRAME_SENSOR_WIDTH_MM) * viewportWidthPx;
  let focalLengthSource: FocalLengthSource = "fallback-default-fov";
  if (orthoPairs.length >= 2) {
    focalLengthPx = Math.sqrt(orthoPairs.reduce((acc, item) => acc + item.f2, 0) / orthoPairs.length);
    focalLengthSource = "orthogonality-3pt-mean";
  } else if (orthoPairs.length === 1 && orthoPairs[0]) {
    focalLengthPx = Math.sqrt(orthoPairs[0].f2);
    focalLengthSource = orthoPairs[0].source;
  }

  focalLengthPx = clamp(focalLengthPx, viewportWidthPx * 0.25, viewportWidthPx * 8.0);
  const focalLengthMm = (focalLengthPx / viewportWidthPx) * FULL_FRAME_SENSOR_WIDTH_MM;
  const horizontalFovDeg = 2 * Math.atan(viewportWidthPx / (2 * focalLengthPx)) * RAD_TO_DEG;
  const verticalFovDeg = 2 * Math.atan(viewportHeightPx / (2 * focalLengthPx)) * RAD_TO_DEG;

  let rollRad = 0;
  let horizonYPx = principalPointPx.y;
  if (vpX && vpZ) {
    let dx = vpZ.x - vpX.x;
    let dy = vpZ.y - vpX.y;
    if (dx < 0) { dx = -dx; dy = -dy; }
    if (Math.hypot(dx, dy) > 1e-4) rollRad = clamp(Math.atan2(dy, dx), -Math.PI * 0.42, Math.PI * 0.42);
    horizonYPx = vpX.y + Math.tan(rollRad) * (principalPointPx.x - vpX.x);
  } else if (vpZ) {
    if (vpY) {
      let cand = Math.atan2(vpY.y - principalPointPx.y, vpY.x - principalPointPx.x) - Math.PI * 0.5;
      while (cand > Math.PI * 0.5) cand -= Math.PI;
      while (cand < -Math.PI * 0.5) cand += Math.PI;
      rollRad = clamp(-cand, -Math.PI * 0.35, Math.PI * 0.35);
    }
    horizonYPx = vpZ.y + Math.tan(rollRad) * (principalPointPx.x - vpZ.x);
  }

  const horizonSlope = Math.tan(rollRad);
  const pitchRad = clamp(
    Math.atan(((horizonYPx - principalPointPx.y) * Math.cos(rollRad)) / focalLengthPx),
    -72 * DEG_TO_RAD,
    72 * DEG_TO_RAD,
  );

  let yawRad = 0;
  if (vpZ) {
    const vx = vpZ.x - principalPointPx.x;
    const vy = -(vpZ.y - principalPointPx.y);
    const x1 = vx * Math.cos(rollRad) - vy * Math.sin(rollRad);
    const y1 = vx * Math.sin(rollRad) + vy * Math.cos(rollRad);
    let cx0 = x1;
    let cz0 = focalLengthPx * Math.cos(pitchRad) - y1 * Math.sin(pitchRad);
    if (cz0 < 0) { cx0 = -cx0; cz0 = -cz0; }
    yawRad = Math.atan2(-cx0, cz0);
  }

  const [yawDeg, pitchDeg, rollDeg] = [yawRad * RAD_TO_DEG, pitchRad * RAD_TO_DEG, rollRad * RAD_TO_DEG];
  const basis = buildCameraBasis(yawDeg, pitchDeg, rollDeg);

  const angErrs: number[] = [];
  const devErrs: number[] = [];
  const collectResiduals = (vp: Vec2 | null, group: readonly NormalizedLine2d[]): void => {
    if (!vp) return;
    for (const l of group) { angErrs.push(angularErrorDeg(l, vp)); devErrs.push(endpointDeviationPx(l, vp)); }
  };
  collectResiduals(vpX, xFit.inliers);
  collectResiduals(vpZ, zFit.inliers);
  collectResiduals(vpY, yFit.inliers);

  return {
    camera: {
      viewportWidthPx, viewportHeightPx, principalPointPx, focalLengthPx, focalLengthMm,
      horizontalFovDeg, verticalFovDeg, positionMeters: v3(0, eyeHeightMeters, 0), eyeHeightMeters,
      yawDeg, pitchDeg, rollDeg, horizonYPx, horizonSlope, perspectiveType,
      vanishingPoints: { vpX, vpZ, vpY }, basis,
    },
    diagnostics: {
      inlierCounts: { x: xFit.inliers.length, y: yFit.inliers.length, z: zFit.inliers.length },
      medianAngularErrorDeg: median(angErrs),
      medianOrthogonalDistancePx: median(devErrs),
      focalLengthSource,
      converged: Boolean(vpZ),
      clusterAssignments: assignments,
    },
  };
}

function buildEnclosurePlanes(
  archetype: SceneArchetype,
  b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
): ArchitecturalPlane3d[] {
  const [w, d, h] = [b.maxX - b.minX, b.maxZ - b.minZ, b.maxY - b.minY];
  const isAlley = archetype === "urban-street-alley";
  const floor: ArchitecturalPlane3d = {
    id: isAlley ? "plane-road-surface" : "plane-floor", role: isAlley ? "road-surface" : "floor",
    corners: [v3(b.minX, 0, b.maxZ), v3(b.maxX, 0, b.maxZ), v3(b.maxX, 0, b.minZ), v3(b.minX, 0, b.minZ)],
    normal: v3(0, 1, 0), widthMeters: w, heightMeters: d, isSolidOccluder: false,
  };
  const left: ArchitecturalPlane3d = {
    id: isAlley ? "plane-facade-left" : "plane-wall-left", role: isAlley ? "facade-left" : "wall-left",
    corners: [v3(b.minX, b.minY, b.maxZ), v3(b.minX, b.minY, b.minZ), v3(b.minX, b.maxY, b.minZ), v3(b.minX, b.maxY, b.maxZ)],
    normal: v3(1, 0, 0), widthMeters: d, heightMeters: h, isSolidOccluder: isAlley,
  };
  const right: ArchitecturalPlane3d = {
    id: isAlley ? "plane-facade-right" : "plane-wall-right", role: isAlley ? "facade-right" : "wall-right",
    corners: [v3(b.maxX, b.minY, b.minZ), v3(b.maxX, b.minY, b.maxZ), v3(b.maxX, b.maxY, b.maxZ), v3(b.maxX, b.maxY, b.minZ)],
    normal: v3(-1, 0, 0), widthMeters: d, heightMeters: h, isSolidOccluder: isAlley,
  };
  if (isAlley) return [floor, left, right];
  return [
    floor,
    { id: "plane-wall-back", role: "wall-back", corners: [v3(b.minX, b.minY, b.minZ), v3(b.maxX, b.minY, b.minZ), v3(b.maxX, b.maxY, b.minZ), v3(b.minX, b.maxY, b.minZ)], normal: v3(0, 0, 1), widthMeters: w, heightMeters: h, isSolidOccluder: true },
    left, right,
    { id: "plane-ceiling", role: "ceiling", corners: [v3(b.minX, b.maxY, b.minZ), v3(b.maxX, b.maxY, b.minZ), v3(b.maxX, b.maxY, b.maxZ), v3(b.minX, b.maxY, b.maxZ)], normal: v3(0, -1, 0), widthMeters: w, heightMeters: d, isSolidOccluder: false },
  ];
}

const isPropRole = (role: SketchStrokeSemanticRole | undefined): role is ParametricPropCategory =>
  role !== undefined && PROP_ROLE_SET.has(role);

/** 러프 2D 투시 스케치에서 미터 규격 바닥 접지 3D 파라메트릭 씬을 리프트한다. */
export function liftRoughSketchToParametricScene3d(input: SketchToSceneLiftInput): ParametricScene3d {
  const { camera, diagnostics } = solveCameraFromRoughPerspectiveStrokes(input.strokes, input.cameraOptions);
  const defaults =
    input.archetype === "corridor-hallway" ? { width: 2.6, depth: 12.0, height: 2.9 }
      : input.archetype === "urban-street-alley" ? { width: 6.0, depth: 18.0, height: 8.2 }
        : { width: 5.4, depth: 6.4, height: 2.85 };
  const override = input.roomDimensionsOverrideMeters;

  const floorSamples: Vec3[] = [];
  for (const stroke of input.strokes) {
    if (stroke.role && stroke.role !== "floor-grid" && stroke.role !== "wall-boundary" && stroke.role !== "road-edge") continue;
    const h0 = unprojectScreenPointToFloorPlane(stroke.start, camera, 0, 28);
    const h1 = unprojectScreenPointToFloorPlane(stroke.end, camera, 0, 28);
    if (h0) floorSamples.push(h0);
    if (h1) floorSamples.push(h1);
  }

  let halfWidth = (override?.width ?? defaults.width) * 0.5;
  let depthMeters = override?.depth ?? defaults.depth;
  const heightMeters = clamp(override?.height ?? defaults.height, 2.2, 24.0);
  if (!override?.width && floorSamples.length >= 2) {
    const maxAbsX = Math.max(...floorSamples.map((p) => Math.abs(p.x)));
    if (Number.isFinite(maxAbsX) && maxAbsX > 0.8) halfWidth = clamp(maxAbsX * 1.05, defaults.width * 0.35, input.archetype === "corridor-hallway" ? 2.4 : 8.5);
  }
  if (!override?.depth && floorSamples.length >= 2) {
    const farthestZ = Math.min(...floorSamples.map((p) => p.z));
    if (Number.isFinite(farthestZ) && farthestZ < -1.5) depthMeters = clamp(-farthestZ * 1.05, defaults.depth * 0.5, input.archetype === "interior-room" ? 12.0 : 28.0);
  }
  const bounds = { minX: -halfWidth, maxX: halfWidth, minY: 0, maxY: heightMeters, minZ: -depthMeters, maxZ: 0.6 };

  const propGroups = new Map<string, {
    readonly category: ParametricPropCategory; readonly label: string;
    readonly parentGroupId: string | null; readonly strokes: RoughPerspectiveStroke2d[];
  }>();
  for (const stroke of input.strokes) {
    if (!isPropRole(stroke.role)) continue;
    const key = stroke.groupId ?? `auto-${stroke.role}`;
    const existing = propGroups.get(key);
    if (existing) existing.strokes.push(stroke);
    else propGroups.set(key, { category: stroke.role, label: stroke.label ?? PROP_CATEGORY_PRIORS[stroke.role].labelKo, parentGroupId: stroke.parentGroupId ?? null, strokes: [stroke] });
  }

  const baseProps: ParametricBoxProp3d[] = [];
  const deferredStacked: Array<{ readonly id: string; readonly label: string; readonly parentGroupId: string | null; readonly strokes: readonly RoughPerspectiveStroke2d[] }> = [];

  for (const [groupId, group] of propGroups.entries()) {
    if (group.category === "tabletop-prop") {
      deferredStacked.push({ id: groupId, label: group.label, parentGroupId: group.parentGroupId, strokes: group.strokes });
      continue;
    }
    const prior = PROP_CATEGORY_PRIORS[group.category];
    const allPts: Vec2[] = [];
    for (const st of group.strokes) allPts.push(st.start, st.end);
    const [maxV, minV] = [Math.max(...allPts.map((p) => p.y)), Math.min(...allPts.map((p) => p.y))];
    const bottomPts = allPts.filter((p) => p.y >= maxV - Math.max(18, (maxV - minV) * 0.28));

    const floorHits: Vec3[] = [];
    for (const pt of bottomPts) {
      const hit = unprojectScreenPointToFloorPlane(pt, camera, 0, depthMeters * 1.15);
      if (hit) floorHits.push(hit);
    }
    if (floorHits.length === 0) {
      const anchorU = allPts.reduce((acc, p) => acc + p.x, 0) / Math.max(1, allPts.length);
      const fallback = unprojectScreenPointToFloorPlane({ x: anchorU, y: Math.max(camera.horizonYPx + 24, maxV) }, camera, 0, depthMeters * 0.9);
      floorHits.push(fallback ?? v3(0, 0, -clamp(depthMeters * 0.52, 1.8, 8.0)));
    }

    const [xs, zs] = [floorHits.map((p) => p.x), floorHits.map((p) => p.z)];
    let [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) * 0.5, (Math.min(...zs) + Math.max(...zs)) * 0.5];
    const [rawSpanX, rawSpanZ] = [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)];
    const sizeX = rawSpanX > 0.15 ? clamp(rawSpanX, prior.min.x, prior.max.x) : prior.def.x;
    const sizeZ = rawSpanZ > 0.15 ? clamp(rawSpanZ, prior.min.z, prior.max.z) : prior.def.z;
    const approxDepth = Math.max(1.0, dot3(sub3(v3(cx, 0, cz), camera.positionMeters), camera.basis.forward));
    const sizeY = clamp(maxV - minV > 12 ? ((maxV - minV) * approxDepth) / camera.focalLengthPx : prior.def.y, prior.min.y, prior.max.y);

    if (group.category === "window") {
      const [dBack, dLeft, dRight] = [Math.abs(cz - bounds.minZ), Math.abs(cx - bounds.minX), Math.abs(cx - bounds.maxX)];
      let [winX, winZ] = [sizeX, prior.def.z];
      if (dLeft <= dBack && dLeft <= dRight) {
        cx = bounds.minX + winZ * 0.5; winX = prior.def.z; winZ = clamp(Math.max(rawSpanZ, prior.def.x), prior.min.x, prior.max.x);
      } else if (dRight <= dBack && dRight < dLeft) {
        cx = bounds.maxX - winZ * 0.5; winX = prior.def.z; winZ = clamp(Math.max(rawSpanZ, prior.def.x), prior.min.x, prior.max.x);
      } else { cz = bounds.minZ + winZ * 0.5; }
      const sillY = clamp(0.95, 0.5, Math.max(0.5, heightMeters - sizeY - 0.15));
      baseProps.push({
        id: groupId, label: group.label, category: "window", centerMeters: v3(cx, sillY + sizeY * 0.5, cz),
        sizeMeters: v3(winX, sizeY, winZ), yawDeg: 0, minYMeters: sillY, maxYMeters: sillY + sizeY,
        groundedOn: "wall-embedded", parentPropId: null, volumeCubicMeters: winX * sizeY * winZ,
        isSolidOccluder: false, sourceStrokeIds: group.strokes.map((s) => s.id),
      });
      continue;
    }

    cx = clamp(cx, bounds.minX + sizeX * 0.5 + 0.02, bounds.maxX - sizeX * 0.5 - 0.02);
    cz = clamp(cz, bounds.minZ + sizeZ * 0.5 + 0.02, -Math.max(0.85, sizeZ * 0.5 + 0.35));
    baseProps.push({
      id: groupId, label: group.label, category: group.category, centerMeters: v3(cx, sizeY * 0.5, cz),
      sizeMeters: v3(sizeX, sizeY, sizeZ), yawDeg: 0, minYMeters: 0, maxYMeters: sizeY,
      groundedOn: "floor", parentPropId: null, volumeCubicMeters: sizeX * sizeY * sizeZ,
      isSolidOccluder: group.category !== "door", sourceStrokeIds: group.strokes.map((s) => s.id),
    });
  }

  const allProps: ParametricBoxProp3d[] = [...baseProps];
  for (const item of deferredStacked) {
    const { x: sx, y: sy, z: sz } = PROP_CATEGORY_PRIORS["tabletop-prop"].def;
    const parent =
      (item.parentGroupId ? baseProps.find((p) => p.id === item.parentGroupId) : undefined) ??
      baseProps.find((p) => p.category === "desk") ??
      baseProps.find((p) => p.category === "cabinet" || p.category === "shelf");
    const avgU = item.strokes.reduce((acc, s) => acc + (s.start.x + s.end.x) * 0.5, 0) / Math.max(1, item.strokes.length);
    const avgV = item.strokes.reduce((acc, s) => acc + (s.start.y + s.end.y) * 0.5, 0) / Math.max(1, item.strokes.length);
    const supportY = parent ? parent.maxYMeters : 0;
    const hit = unprojectScreenPointToFloorPlane({ x: avgU, y: avgV }, camera, supportY, depthMeters);
    let [cx, cz] = [hit ? hit.x : parent ? parent.centerMeters.x : 0, hit ? hit.z : parent ? parent.centerMeters.z : -3.0];
    if (parent) {
      const [mx, mz] = [Math.max(0, parent.sizeMeters.x * 0.5 - sx * 0.5), Math.max(0, parent.sizeMeters.z * 0.5 - sz * 0.5)];
      cx = clamp(cx, parent.centerMeters.x - mx, parent.centerMeters.x + mx);
      cz = clamp(cz, parent.centerMeters.z - mz, parent.centerMeters.z + mz);
    }
    allProps.push({
      id: item.id, label: item.label, category: "tabletop-prop", centerMeters: v3(cx, supportY + sy * 0.5, cz),
      sizeMeters: v3(sx, sy, sz), yawDeg: parent ? parent.yawDeg : 0, minYMeters: supportY, maxYMeters: supportY + sy,
      groundedOn: parent ? "parent-prop" : "floor", parentPropId: parent ? parent.id : null,
      volumeCubicMeters: sx * sy * sz, isSolidOccluder: true, sourceStrokeIds: item.strokes.map((s) => s.id),
    });
  }

  const floatingPropIds: string[] = [];
  let maxGroundingErrorMeters = 0;
  let [allStandingPropsFloorSeated, allStackedPropsFlush] = [true, true];
  for (const prop of allProps) {
    if (prop.groundedOn === "floor") {
      const err = Math.abs(prop.minYMeters);
      if (err > maxGroundingErrorMeters) maxGroundingErrorMeters = err;
      if (err > 1e-6) { allStandingPropsFloorSeated = false; floatingPropIds.push(prop.id); }
    } else if (prop.groundedOn === "parent-prop" && prop.parentPropId) {
      const parent = allProps.find((p) => p.id === prop.parentPropId);
      const err = parent ? Math.abs(prop.minYMeters - parent.maxYMeters) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(err) && err > maxGroundingErrorMeters) maxGroundingErrorMeters = err;
      if (err > 1e-6) { allStackedPropsFlush = false; floatingPropIds.push(prop.id); }
    }
  }

  return {
    sceneId: input.sceneId ?? `wave81-scene-${input.archetype}`,
    archetype: input.archetype, units: "meters", coordinateSystem: "right-handed-y-up-gltf",
    calibratedCamera: camera, calibrationDiagnostics: diagnostics, enclosureBoundsMeters: bounds,
    enclosurePlanes: buildEnclosurePlanes(input.archetype, bounds), props: allProps,
    groundingAudit: { allStandingPropsFloorSeated, allStackedPropsFlush, maxGroundingErrorMeters, floatingPropIds },
  };
}
