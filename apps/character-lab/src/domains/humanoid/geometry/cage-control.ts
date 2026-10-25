import type { Vec3 } from "../../../shared/math";

const DEG_TO_RAD = Math.PI / 180;
const SHAPER_VERTEX_KEY_TOLERANCE = 100000;
const FNV1A_OFFSET_BASIS = -2128831035;
const FNV1A_PRIME = 16777619;

export type ShaperMirrorSide = "center" | "left" | "right";

export interface ShaperControlPointMirrorDescriptor {
  readonly index: number;
  readonly mirrorSide: ShaperMirrorSide;
  readonly mirrorIndex: number | null;
  readonly samePositionIndices: readonly number[];
}

export interface SymmetricControlPointPositionEdit {
  readonly index: number;
  readonly position: Vec3;
}

export interface SymmetricControlPointPowerEdit {
  readonly index: number;
  readonly power: number;
}

export interface ApplySymmetricControlPointEditOptions {
  readonly positions: Float32Array;
  readonly powers: Float32Array;
  readonly descriptors: readonly ShaperControlPointMirrorDescriptor[];
  readonly selectedIndices: ReadonlySet<number>;
  readonly positionEdits?: readonly SymmetricControlPointPositionEdit[];
  readonly powerEdits?: readonly SymmetricControlPointPowerEdit[];
  readonly symmetryEnabled?: boolean;
  readonly lockCenterX?: boolean;
}

export interface CageMorphTransitionInput {
  readonly startPositions: Float32Array;
  readonly endPositions: Float32Array;
  readonly startPowers: Float32Array;
  readonly endPowers: Float32Array;
  readonly startEyeballPivotLeft?: Vec3;
  readonly endEyeballPivotLeft?: Vec3;
  readonly startEyeballPivotRight?: Vec3;
  readonly endEyeballPivotRight?: Vec3;
  readonly elapsedSec: number;
  /** SHAPER MeshData::meshChangeAniDuration 기본값 0.2초 */
  readonly durationSec?: number;
}

export interface CageMorphTransitionFrame {
  readonly alpha: number;
  readonly completed: boolean;
  readonly positions: Float32Array;
  readonly powers: Float32Array;
  readonly eyeballPivotLeft: Vec3;
  readonly eyeballPivotRight: Vec3;
}

export interface ScreenProjectedControlPoint {
  readonly index: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly active?: boolean;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * SHAPER NormalSolver.VertexKey (0x06000689 / 0x0600068b) 역공학 내재화:
 * 정점 좌표를 `Math.round(coord * 100000)`으로 양자화한 뒤 32-bit FNV-1a 해시를 계산한다.
 */
export function computeShaperVertexKeyHash(
  x: number,
  y: number,
  z: number,
  tolerance = SHAPER_VERTEX_KEY_TOLERANCE,
): number {
  const qx = Math.round(x * tolerance) | 0;
  const qy = Math.round(y * tolerance) | 0;
  const qz = Math.round(z * tolerance) | 0;
  let hash = FNV1A_OFFSET_BASIS | 0;
  hash = Math.imul(hash ^ qx, FNV1A_PRIME);
  hash = Math.imul(hash ^ qy, FNV1A_PRIME);
  hash = Math.imul(hash ^ qz, FNV1A_PRIME);
  return hash | 0;
}

/**
 * SHAPER NormalSolver::RecalculateNormals (0x06000274) 역공학 내재화:
 * - 정점 좌표를 10^-5 격자(`Math.round(coord * 100000)`)로 공간 버킷화하여 UV/하드엣지 분할 정점을 묶는다.
 * - 각 삼각형 코너 엔트리 `e1`에 대해 동일 정점(`e1.vertexIndex === e2.vertexIndex`)이거나
 *   면 법선 내적 `dot(n1, n2) >= cos(creaseAngleDeg)`인 모든 코너 엔트리 `e2`의 면 법선을 누적 후 정규화한다.
 */
export function recalculateCreaseNormals(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngleDeg = 60,
  tolerance = SHAPER_VERTEX_KEY_TOLERANCE,
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const triCount = Math.floor(indices.length / 3);
  const normals = new Float32Array(vertexCount * 3);
  if (vertexCount === 0 || triCount === 0) {
    return normals;
  }

  const clampedAngle = Math.max(0, Math.min(180, creaseAngleDeg));
  const cosineThreshold = Math.cos(clampedAngle * DEG_TO_RAD);

  const faceNormals = new Float32Array(triCount * 3);
  interface CornerEntry {
    readonly triIndex: number;
    readonly vertexIndex: number;
  }
  const spatialBuckets = new Map<string, CornerEntry[]>();

  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const p0x = positions[i0 * 3];
    const p0y = positions[i0 * 3 + 1];
    const p0z = positions[i0 * 3 + 2];

    const e1x = positions[i1 * 3] - p0x;
    const e1y = positions[i1 * 3 + 1] - p0y;
    const e1z = positions[i1 * 3 + 2] - p0z;

    const e2x = positions[i2 * 3] - p0x;
    const e2y = positions[i2 * 3 + 1] - p0y;
    const e2z = positions[i2 * 3 + 2] - p0z;

    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(cx, cy, cz);
    if (len > 1e-12) {
      faceNormals[t * 3] = cx / len;
      faceNormals[t * 3 + 1] = cy / len;
      faceNormals[t * 3 + 2] = cz / len;
    }

    const triVerts = [i0, i1, i2];
    for (const vIdx of triVerts) {
      const qx = Math.round(positions[vIdx * 3] * tolerance);
      const qy = Math.round(positions[vIdx * 3 + 1] * tolerance);
      const qz = Math.round(positions[vIdx * 3 + 2] * tolerance);
      const key = `${qx}:${qy}:${qz}`;
      const bucket = spatialBuckets.get(key);
      const entry: CornerEntry = { triIndex: t, vertexIndex: vIdx };
      if (bucket !== undefined) {
        bucket.push(entry);
      } else {
        spatialBuckets.set(key, [entry]);
      }
    }
  }

  for (const bucket of spatialBuckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      const lhs = bucket[i];
      const n1x = faceNormals[lhs.triIndex * 3];
      const n1y = faceNormals[lhs.triIndex * 3 + 1];
      const n1z = faceNormals[lhs.triIndex * 3 + 2];

      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;

      for (let j = 0; j < bucket.length; j += 1) {
        const rhs = bucket[j];
        if (lhs.vertexIndex === rhs.vertexIndex) {
          sumX += faceNormals[rhs.triIndex * 3];
          sumY += faceNormals[rhs.triIndex * 3 + 1];
          sumZ += faceNormals[rhs.triIndex * 3 + 2];
        } else {
          const n2x = faceNormals[rhs.triIndex * 3];
          const n2y = faceNormals[rhs.triIndex * 3 + 1];
          const n2z = faceNormals[rhs.triIndex * 3 + 2];
          const dot = n1x * n2x + n1y * n2y + n1z * n2z;
          if (dot >= cosineThreshold - 1e-6) {
            sumX += n2x;
            sumY += n2y;
            sumZ += n2z;
          }
        }
      }

      const len = Math.hypot(sumX, sumY, sumZ);
      const outBase = lhs.vertexIndex * 3;
      if (len > 1e-12) {
        normals[outBase] = sumX / len;
        normals[outBase + 1] = sumY / len;
        normals[outBase + 2] = sumZ / len;
      }
    }
  }

  return normals;
}

/**
 * SHAPER MeshData::FindMirrorPositionControlPoints (0x06000260) 및
 * FindSamePositionVertices (0x06000264) 역공학 내재화:
 * 각 케이지 제어점의 좌우 대칭 분류(`center` | `left` | `right`),
 * 동일 위치 중복 정점(`samePositionIndices`), 그리고 반전 위치 `(-x, y, z)`에 대응하는
 * 대칭 제어점(`mirrorIndex`)을 매칭한다.
 */
export function findMirrorControlPointPairs(
  positions: Float32Array,
  tolerance = 1e-4,
): readonly ShaperControlPointMirrorDescriptor[] {
  const count = Math.floor(positions.length / 3);
  const descriptors: ShaperControlPointMirrorDescriptor[] = [];

  for (let i = 0; i < count; i += 1) {
    const ix = positions[i * 3];
    const iy = positions[i * 3 + 1];
    const iz = positions[i * 3 + 2];

    const mirrorSide: ShaperMirrorSide =
      Math.abs(ix) <= tolerance ? "center" : ix < 0 ? "left" : "right";

    const samePositionIndices: number[] = [];
    let mirrorIndex: number | null = mirrorSide === "center" ? i : null;
    let bestMirrorDist = tolerance;

    for (let j = 0; j < count; j += 1) {
      const jx = positions[j * 3];
      const jy = positions[j * 3 + 1];
      const jz = positions[j * 3 + 2];

      if (Math.hypot(ix - jx, iy - jy, iz - jz) <= tolerance) {
        samePositionIndices.push(j);
      }

      if (i !== j) {
        const mirrorDist = Math.hypot(-ix - jx, iy - jy, iz - jz);
        if (mirrorDist <= bestMirrorDist) {
          bestMirrorDist = mirrorDist;
          mirrorIndex = j;
        }
      }
    }

    descriptors.push({
      index: i,
      mirrorSide,
      mirrorIndex,
      samePositionIndices,
    });
  }

  return descriptors;
}

function setVertexAndCoincidentPositions(
  positions: Float32Array,
  descriptor: ShaperControlPointMirrorDescriptor,
  x: number,
  y: number,
  z: number,
): void {
  for (const targetIdx of descriptor.samePositionIndices) {
    const base = targetIdx * 3;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;
  }
}

function setVertexAndCoincidentPowers(
  powers: Float32Array,
  descriptor: ShaperControlPointMirrorDescriptor,
  power: number,
): void {
  const clamped = clamp01(power);
  for (const targetIdx of descriptor.samePositionIndices) {
    powers[targetIdx] = clamped;
  }
}

/**
 * SHAPER MeshData::SetVerticesPosFromControlPoints (0x0600025a) 및
 * SetControlPointPower (0x0600025b) 역공학 내재화:
 * - 제어점의 위치 및 샤프니스 가중치(`power`)를 변경하고 `samePosVertices`에 동기화한다.
 * - `symmetryEnabled`가 켜져 있고 대칭짝(`mirrorIndex`)이 현재 다중 선택(`selectedIndices`)에
 *   포함되어 있지 않으면, 대칭짝 위치를 `(-x, y, z)`로, `power`를 동일 값으로 자동 미러링한다.
 */
export function applySymmetricControlPointEdit(options: ApplySymmetricControlPointEditOptions): void {
  const {
    positions,
    powers,
    descriptors,
    selectedIndices,
    positionEdits = [],
    powerEdits = [],
    symmetryEnabled = true,
    lockCenterX = true,
  } = options;

  for (const edit of positionEdits) {
    const desc = descriptors[edit.index];
    if (desc === undefined) continue;
    const nextX = lockCenterX && desc.mirrorSide === "center" ? 0 : edit.position[0];
    const nextY = edit.position[1];
    const nextZ = edit.position[2];

    setVertexAndCoincidentPositions(positions, desc, nextX, nextY, nextZ);

    if (
      symmetryEnabled &&
      desc.mirrorIndex !== null &&
      desc.mirrorIndex !== edit.index &&
      !selectedIndices.has(desc.mirrorIndex)
    ) {
      const mirrorDesc = descriptors[desc.mirrorIndex];
      if (mirrorDesc !== undefined) {
        setVertexAndCoincidentPositions(positions, mirrorDesc, -nextX, nextY, nextZ);
      }
    }
  }

  for (const edit of powerEdits) {
    const desc = descriptors[edit.index];
    if (desc === undefined) continue;
    setVertexAndCoincidentPowers(powers, desc, edit.power);

    if (
      symmetryEnabled &&
      desc.mirrorIndex !== null &&
      desc.mirrorIndex !== edit.index &&
      !selectedIndices.has(desc.mirrorIndex)
    ) {
      const mirrorDesc = descriptors[desc.mirrorIndex];
      if (mirrorDesc !== undefined) {
        setVertexAndCoincidentPowers(powers, mirrorDesc, edit.power);
      }
    }
  }
}

/**
 * SHAPER MeshData::Update (0x06000272) 파츠 교체 모핑 애니메이션 역공학 내재화:
 * `meshChangeAniDuration`(기본 0.2초) 동안 시작/목표 케이지 정점 위치, 샤프니스 `power`,
 * 좌우 안구 피벗(`eyeballPivotL`, `eyeballPivotR`)을 선형 보간한다.
 */
export function interpolateCageMorphTransition(
  input: CageMorphTransitionInput,
): CageMorphTransitionFrame {
  const {
    startPositions,
    endPositions,
    startPowers,
    endPowers,
    startEyeballPivotLeft = [0, 0, 0],
    endEyeballPivotLeft = [0, 0, 0],
    startEyeballPivotRight = [0, 0, 0],
    endEyeballPivotRight = [0, 0, 0],
    elapsedSec,
    durationSec = 0.2,
  } = input;

  const alpha = durationSec <= 1e-6 ? 1 : clamp01(elapsedSec / durationSec);
  const completed = alpha >= 1;

  const posLength = Math.min(startPositions.length, endPositions.length);
  const positions = new Float32Array(posLength);
  for (let i = 0; i < posLength; i += 1) {
    positions[i] = startPositions[i] + (endPositions[i] - startPositions[i]) * alpha;
  }

  const powerLength = Math.min(startPowers.length, endPowers.length);
  const powers = new Float32Array(powerLength);
  for (let i = 0; i < powerLength; i += 1) {
    powers[i] = clamp01(startPowers[i] + (endPowers[i] - startPowers[i]) * alpha);
  }

  const eyeballPivotLeft: Vec3 = [
    startEyeballPivotLeft[0] + (endEyeballPivotLeft[0] - startEyeballPivotLeft[0]) * alpha,
    startEyeballPivotLeft[1] + (endEyeballPivotLeft[1] - startEyeballPivotLeft[1]) * alpha,
    startEyeballPivotLeft[2] + (endEyeballPivotLeft[2] - startEyeballPivotLeft[2]) * alpha,
  ];
  const eyeballPivotRight: Vec3 = [
    startEyeballPivotRight[0] + (endEyeballPivotRight[0] - startEyeballPivotRight[0]) * alpha,
    startEyeballPivotRight[1] + (endEyeballPivotRight[1] - startEyeballPivotRight[1]) * alpha,
    startEyeballPivotRight[2] + (endEyeballPivotRight[2] - startEyeballPivotRight[2]) * alpha,
  ];

  return {
    alpha,
    completed,
    positions,
    powers,
    eyeballPivotLeft,
    eyeballPivotRight,
  };
}

/**
 * SHAPER MeshData::SelectControlPointsByRect (0x0600025d) 역공학 내재화:
 * 드래그 사각형의 시작점과 끝점을 `[minX, maxX] x [minY, maxY]`로 정규화하고,
 * 활성화된 케이지 제어점 중 사각형 내부(`minX < x < maxX && minY < y < maxY`)에 투영된 제어점을 선택한다.
 */
export function selectControlPointsInScreenRect(options: {
  readonly points: readonly ScreenProjectedControlPoint[];
  readonly startScreenPos: readonly [number, number];
  readonly endScreenPos: readonly [number, number];
  readonly additiveSelection?: ReadonlySet<number>;
}): ReadonlySet<number> {
  const { points, startScreenPos, endScreenPos, additiveSelection } = options;
  const minX = Math.min(startScreenPos[0], endScreenPos[0]);
  const maxX = Math.max(startScreenPos[0], endScreenPos[0]);
  const minY = Math.min(startScreenPos[1], endScreenPos[1]);
  const maxY = Math.max(startScreenPos[1], endScreenPos[1]);

  const selected = new Set<number>(additiveSelection);
  for (const pt of points) {
    if (pt.active === false) continue;
    if (pt.screenX > minX && pt.screenX < maxX && pt.screenY > minY && pt.screenY < maxY) {
      selected.add(pt.index);
    }
  }
  return selected;
}
