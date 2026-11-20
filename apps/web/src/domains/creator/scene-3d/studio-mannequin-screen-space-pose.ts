/**
 * Poseit · Monster Mash 클린룸 — Screen-Space 직접 관절 회전 드래그 + 2D 실루엣 3D 팽창(Inflated Mesh) 소품 브리지.
 *
 * - 기즈모 축을 고를 필요 없이 화면 평면에서 관절을 바로 끌어 회전하는 Screen-Space 드래그 솔버
 * - 뼈대·웨이트 페인팅 없이 닫힌 2D 실루엣 폴리곤을 즉시 수밀 3D 볼륨 메시로 부풀리고(Inflate),
 *   2D 핀 드래그로 마스코트·소품 형태를 비파괴 변형하는 Zero-Rigging 엔진
 */

import {
  IDENTITY_QUAT,
  multiplyQuat,
  normalizeQuat,
  quatFromAxisAngle,
  type QuatTuple,
  type Vec3Tuple,
} from "../vrm/studio-analytical-twist-swing-ik";

export type Vec2Tuple = readonly [number, number];

export type ScreenSpaceDragMode = "view-plane-swing" | "arcball-trackball" | "axial-twist";

export interface ScreenSpaceCameraBasis {
  readonly forward: Vec3Tuple;
  readonly right: Vec3Tuple;
  readonly up: Vec3Tuple;
}

export interface ScreenSpaceJointDragInput {
  readonly mode: ScreenSpaceDragMode;
  readonly jointScreenPx: Vec2Tuple;
  readonly pointerStartPx: Vec2Tuple;
  readonly pointerCurrentPx: Vec2Tuple;
  readonly currentRotation: QuatTuple;
  readonly camera: ScreenSpaceCameraBasis;
  /** `axial-twist` 모드에서 회전 기준이 되는 본 길이 방향 단위 벡터. */
  readonly boneAxisWorld?: Vec3Tuple;
  /** 트랙볼 가상 구 반경(px). */
  readonly trackballRadiusPx?: number;
  readonly sensitivity?: number;
}

export interface ScreenSpaceJointDragResult {
  readonly deltaRotation: QuatTuple;
  readonly nextRotation: QuatTuple;
  readonly angleDeltaRad: number;
  readonly axisWorld: Vec3Tuple;
}

export interface InflatedSilhouetteOptions {
  /** 내부 2D 샘플 격자 해상도 (예: 12~24). */
  readonly gridResolution?: number;
  /** 최대 부풀림 두께 배율 (`0.3`~`1.5`, 기본 `0.85`). */
  readonly inflationScale?: number;
  /** 2D 좌표를 3D 미터 단위로 변환할 스케일. */
  readonly meterScale?: number;
}

export interface InflatedSilhouetteMesh {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly maxHalfThicknessM: number;
  readonly isClosedWatertight: boolean;
}

export interface SilhouettePinDeformHandle {
  readonly rest2d: Vec2Tuple;
  readonly target2d: Vec2Tuple;
  readonly radiusM: number;
}

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (l <= EPS) return fallback;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Poseit 스타일 Screen-Space 관절 직접 드래그 회전을 계산한다.
 */
export function solveScreenSpaceJointDrag(
  input: ScreenSpaceJointDragInput,
): ScreenSpaceJointDragResult {
  const sensitivity = clamp(input.sensitivity ?? 1, 0.1, 4);
  const current = normalizeQuat(input.currentRotation);

  if (input.mode === "view-plane-swing") {
    const sx = input.pointerStartPx[0] - input.jointScreenPx[0];
    const sy = input.pointerStartPx[1] - input.jointScreenPx[1];
    const cx = input.pointerCurrentPx[0] - input.jointScreenPx[0];
    const cy = input.pointerCurrentPx[1] - input.jointScreenPx[1];

    if (Math.hypot(sx, sy) < 2 || Math.hypot(cx, cy) < 2) {
      return {
        deltaRotation: IDENTITY_QUAT,
        nextRotation: current,
        angleDeltaRad: 0,
        axisWorld: normalize3(input.camera.forward, [0, 0, -1]),
      };
    }

    const startAngle = Math.atan2(sy, sx);
    const currAngle = Math.atan2(cy, cx);
    // 화면 +Y는 아래쪽이므로 카메라 전방 축 기준 시계/반시계 방향 부호를 일치시킨다
    const angleDeltaRad = -wrapAngleRad(currAngle - startAngle) * sensitivity;
    const axisWorld = normalize3(input.camera.forward, [0, 0, -1]);
    const deltaRotation = quatFromAxisAngle(axisWorld, angleDeltaRad);
    return {
      deltaRotation,
      nextRotation: multiplyQuat(deltaRotation, current),
      angleDeltaRad,
      axisWorld,
    };
  }

  if (input.mode === "axial-twist") {
    const dx = input.pointerCurrentPx[0] - input.pointerStartPx[0];
    const radius = Math.max(24, input.trackballRadiusPx ?? 120);
    const angleDeltaRad = (dx / radius) * Math.PI * 0.75 * sensitivity;
    const axisWorld = normalize3(input.boneAxisWorld ?? [0, 1, 0], [0, 1, 0]);
    const deltaRotation = quatFromAxisAngle(axisWorld, angleDeltaRad);
    return {
      deltaRotation,
      nextRotation: multiplyQuat(deltaRotation, current),
      angleDeltaRad,
      axisWorld,
    };
  }

  // arcball-trackball: 화면 변위를 카메라 (up, right) 직교 축 회전으로 사상
  const radius = Math.max(30, input.trackballRadiusPx ?? 140);
  const dx = (input.pointerCurrentPx[0] - input.pointerStartPx[0]) / radius;
  const dy = (input.pointerCurrentPx[1] - input.pointerStartPx[1]) / radius;
  const dragLen = Math.hypot(dx, dy);
  if (dragLen <= 1e-4) {
    return {
      deltaRotation: IDENTITY_QUAT,
      nextRotation: current,
      angleDeltaRad: 0,
      axisWorld: normalize3(input.camera.up, [0, 1, 0]),
    };
  }

  // 화면 드래그 벡터를 카메라 평면에 투영 후 forward와 외적하여 트랙볼 회전축 획득
  const dragWorld: Vec3Tuple = [
    input.camera.right[0] * dx - input.camera.up[0] * dy,
    input.camera.right[1] * dx - input.camera.up[1] * dy,
    input.camera.right[2] * dx - input.camera.up[2] * dy,
  ];
  const axisWorld = normalize3(cross3(dragWorld, input.camera.forward), input.camera.up);
  const angleDeltaRad = dragLen * Math.PI * 0.5 * sensitivity;
  const deltaRotation = quatFromAxisAngle(axisWorld, angleDeltaRad);
  return {
    deltaRotation,
    nextRotation: multiplyQuat(deltaRotation, current),
    angleDeltaRad,
    axisWorld,
  };
}

function pointInPolygon2D(px: number, py: number, polygon: readonly Vec2Tuple[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = (yi > py) !== (yj > py)
      && px < ((xj - xi) * (py - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygonBoundary2D(px: number, py: number, polygon: readonly Vec2Tuple[]): number {
  let minDistSq = Number.POSITIVE_INFINITY;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    const t = lenSq > EPS ? clamp(((px - a[0]) * abx + (py - a[1]) * aby) / lenSq, 0, 1) : 0;
    const qx = a[0] + abx * t;
    const qy = a[1] + aby * t;
    const dx = px - qx;
    const dy = py - qy;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) minDistSq = dSq;
  }
  return Math.sqrt(minDistSq);
}

/**
 * Monster Mash 스타일 2D 닫힌 실루엣 폴리곤을 수밀 3D 팽창 소품 메시로 즉시 변환한다.
 * 중심으로부터 방사형 동심 링으로 리샘플링하여 앞/뒤(+Z/-Z) 반구를 매끄럽게 봉합한다.
 */
export function inflate2dSilhouetteTo3dMesh(
  silhouettePolygon: readonly Vec2Tuple[],
  options: InflatedSilhouetteOptions = {},
): InflatedSilhouetteMesh | null {
  if (silhouettePolygon.length < 3) return null;

  const meterScale = clamp(options.meterScale ?? 1, 0.01, 20);
  const inflationScale = clamp(options.inflationScale ?? 0.85, 0.15, 2.5);
  const radialRings = Math.max(3, Math.min(20, Math.floor((options.gridResolution ?? 12) / 2)));

  const poly: Vec2Tuple[] = silhouettePolygon.map((p) => [p[0] * meterScale, p[1] * meterScale]);
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;

  // 경계 각도별 링 정점 수 = 원본 실루엣 꼭짓점 수 (최소 16개로 세분화)
  const rimCount = Math.max(16, poly.length);
  const rimPoints: Vec2Tuple[] = [];
  for (let i = 0; i < rimCount; i += 1) {
    const f = (i / rimCount) * poly.length;
    const idx = Math.floor(f) % poly.length;
    const next = (idx + 1) % poly.length;
    const u = f - Math.floor(f);
    rimPoints.push([
      poly[idx][0] + (poly[next][0] - poly[idx][0]) * u,
      poly[idx][1] + (poly[next][1] - poly[idx][1]) * u,
    ]);
  }

  const centerDist = pointInPolygon2D(cx, cy, poly)
    ? distanceToPolygonBoundary2D(cx, cy, poly)
    : rimPoints.reduce((acc, p) => acc + Math.hypot(p[0] - cx, p[1] - cy), 0) / rimCount * 0.5;
  const maxD = Math.max(0.005, centerDist);

  // 정점 구성:
  // 0: 전면 중심, 1: 후면 중심
  // 2 .. 2 + (radialRings - 1) * rimCount - 1: 전면 내부 링
  // 다음 (radialRings - 1) * rimCount: 후면 내부 링
  // 마지막 rimCount: 공유 적도 경계 림(Z = 0)
  const innerRingCount = radialRings - 1;
  const frontInnerStart = 2;
  const backInnerStart = frontInnerStart + innerRingCount * rimCount;
  const rimStart = backInnerStart + innerRingCount * rimCount;
  const vertexCount = rimStart + rimCount;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const maxHalfThicknessM = maxD * inflationScale;

  // 전면/후면 중심점
  positions[0] = cx;
  positions[1] = cy;
  positions[2] = maxHalfThicknessM;
  normals[0] = 0;
  normals[1] = 0;
  normals[2] = 1;

  positions[3] = cx;
  positions[4] = cy;
  positions[5] = -maxHalfThicknessM;
  normals[3] = 0;
  normals[4] = 0;
  normals[5] = -1;

  for (let r = 0; r < innerRingCount; r += 1) {
    const frac = (r + 1) / radialRings; // (0, 1)
    for (let s = 0; s < rimCount; s += 1) {
      const px = cx + (rimPoints[s][0] - cx) * frac;
      const py = cy + (rimPoints[s][1] - cy) * frac;
      const d = Math.min(maxD, distanceToPolygonBoundary2D(px, py, poly));
      const domeRatio = Math.sqrt(Math.max(0, 1 - (1 - d / maxD) ** 2));
      const z = domeRatio * maxHalfThicknessM;

      const radDirX = rimPoints[s][0] - cx;
      const radDirY = rimPoints[s][1] - cy;
      const frontN = normalize3([radDirX * frac, radDirY * frac, Math.max(0.05, maxD * (1 - frac * 0.5))], [0, 0, 1]);
      const backN = normalize3([radDirX * frac, radDirY * frac, -Math.max(0.05, maxD * (1 - frac * 0.5))], [0, 0, -1]);

      const fIdx = (frontInnerStart + r * rimCount + s) * 3;
      positions[fIdx] = px;
      positions[fIdx + 1] = py;
      positions[fIdx + 2] = z;
      normals[fIdx] = frontN[0];
      normals[fIdx + 1] = frontN[1];
      normals[fIdx + 2] = frontN[2];

      const bIdx = (backInnerStart + r * rimCount + s) * 3;
      positions[bIdx] = px;
      positions[bIdx + 1] = py;
      positions[bIdx + 2] = -z;
      normals[bIdx] = backN[0];
      normals[bIdx + 1] = backN[1];
      normals[bIdx + 2] = backN[2];
    }
  }

  for (let s = 0; s < rimCount; s += 1) {
    const rx = rimPoints[s][0];
    const ry = rimPoints[s][1];
    const rimN = normalize3([rx - cx, ry - cy, 0], [1, 0, 0]);
    const idx = (rimStart + s) * 3;
    positions[idx] = rx;
    positions[idx + 1] = ry;
    positions[idx + 2] = 0;
    normals[idx] = rimN[0];
    normals[idx + 1] = rimN[1];
    normals[idx + 2] = rimN[2];
  }

  const indexList: number[] = [];
  // 전면/후면 중심 팬
  for (let s = 0; s < rimCount; s += 1) {
    const next = (s + 1) % rimCount;
    indexList.push(0, frontInnerStart + s, frontInnerStart + next);
    indexList.push(1, backInnerStart + next, backInnerStart + s);
  }

  // 내부 링 사이 + 마지막 링과 공유 림 봉합
  for (let r = 0; r < innerRingCount; r += 1) {
    const fRowA = frontInnerStart + r * rimCount;
    const fRowB = r === innerRingCount - 1 ? rimStart : frontInnerStart + (r + 1) * rimCount;
    const bRowA = backInnerStart + r * rimCount;
    const bRowB = r === innerRingCount - 1 ? rimStart : backInnerStart + (r + 1) * rimCount;

    for (let s = 0; s < rimCount; s += 1) {
      const next = (s + 1) % rimCount;
      // 전면 (+Z 외향)
      indexList.push(fRowA + s, fRowB + s, fRowB + next);
      indexList.push(fRowA + s, fRowB + next, fRowA + next);
      // 후면 (-Z 외향)
      indexList.push(bRowA + s, bRowB + next, bRowB + s);
      indexList.push(bRowA + s, bRowA + next, bRowB + next);
    }
  }

  const indices = new Uint32Array(indexList);
  return {
    vertexCount,
    triangleCount: Math.floor(indices.length / 3),
    positions,
    normals,
    indices,
    maxHalfThicknessM,
    isClosedWatertight: true,
  };
}

/**
 * Zero-Rigging 2D 핀 드래그 변형: 팽창 메시의 정점을 2D 제어 핀 변위로 부드럽게 워핑한다.
 */
export function deformInflatedMeshWith2dPins(
  mesh: InflatedSilhouetteMesh,
  pins: readonly SilhouettePinDeformHandle[],
): Float32Array {
  const out = new Float32Array(mesh.positions);
  if (pins.length === 0) return out;

  for (let i = 0; i < out.length; i += 3) {
    const vx = out[i];
    const vy = out[i + 1];
    let dxAccum = 0;
    let dyAccum = 0;
    let weightSum = 0;
    for (const pin of pins) {
      const dist = Math.hypot(vx - pin.rest2d[0], vy - pin.rest2d[1]);
      const r = Math.max(0.01, pin.radiusM);
      if (dist >= r) continue;
      const t = 1 - dist / r;
      const w = t * t * (3 - 2 * t);
      dxAccum += (pin.target2d[0] - pin.rest2d[0]) * w;
      dyAccum += (pin.target2d[1] - pin.rest2d[1]) * w;
      weightSum += w;
    }
    if (weightSum > 0) {
      const norm = Math.max(1, weightSum);
      out[i] = vx + dxAccum / norm;
      out[i + 1] = vy + dyAccum / norm;
    }
  }
  return out;
}
