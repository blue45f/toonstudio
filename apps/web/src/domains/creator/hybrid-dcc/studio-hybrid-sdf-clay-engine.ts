/**
 * Womp 3D · MagicaCSG 클린룸 — 실시간 SDF 구이 블렌드(Smooth-Min) 클레이 소품 조형 및
 * 수밀(Watertight) 듀얼 컨투어링(Surface Nets) 메시 추출 엔진.
 *
 * - 5종 기본 SDF 프리미티브: `sphere`, `capsule`, `rounded-box`, `torus`, `cylinder`
 * - 다항식 Smooth-Min 액체 구이 불리언(`smooth-union`, `smooth-subtract`, `smooth-intersect`)
 * - 3D 복셀 격자 위 Surface Nets 듀얼 컨투어링으로 경계 에지 0건·비다양체 0건의 수밀 삼각형 메시 추출
 */

export type Vec3Tuple = readonly [number, number, number];

export type SdfPrimitiveKind = "sphere" | "capsule" | "rounded-box" | "torus" | "cylinder";
export type SdfBooleanOp = "smooth-union" | "smooth-subtract" | "smooth-intersect";

export interface SdfClayPrimitiveNode {
  readonly id: string;
  readonly kind: SdfPrimitiveKind;
  readonly op: SdfBooleanOp;
  /** Womp 'Goop' 액체 블렌드 반경(m). `0`이면 날카로운 CSG. */
  readonly blendRadiusM: number;
  readonly position: Vec3Tuple;
  /**
   * 프리미티브별 크기 파라미터(m):
   * - `sphere`: `[radius, 0, 0]`
   * - `capsule`: `[radius, halfHeight, 0]` (Y축 정렬)
   * - `rounded-box`: `[halfX, halfY, halfZ]` + `cornerRadiusM`
   * - `torus`: `[majorRadius, tubeRadius, 0]` (XZ 평면)
   * - `cylinder`: `[radius, halfHeight, 0]` (Y축 정렬)
   */
  readonly size: Vec3Tuple;
  readonly cornerRadiusM?: number;
}

export interface SdfClayScene {
  readonly id: string;
  readonly boundsMin: Vec3Tuple;
  readonly boundsMax: Vec3Tuple;
  readonly primitives: readonly SdfClayPrimitiveNode[];
}

export interface ExtractedWatertightSdfMesh {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly isWatertight: boolean;
}

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 다항식 Smooth-Min (`smin`): Womp 3D 액체 클레이 융합 연산. */
export function smoothMin(a: number, b: number, k: number): number {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function evaluateSdfPrimitive(
  node: SdfClayPrimitiveNode,
  px: number,
  py: number,
  pz: number,
): number {
  const x = px - node.position[0];
  const y = py - node.position[1];
  const z = pz - node.position[2];

  if (node.kind === "sphere") {
    return Math.sqrt(x * x + y * y + z * z) - Math.max(0.005, node.size[0]);
  }
  if (node.kind === "capsule") {
    const r = Math.max(0.005, node.size[0]);
    const h = Math.max(0, node.size[1]);
    const cy = clamp(y, -h, h);
    return Math.sqrt(x * x + (y - cy) * (y - cy) + z * z) - r;
  }
  if (node.kind === "rounded-box") {
    const r = Math.max(0, node.cornerRadiusM ?? 0.02);
    const bx = Math.max(0.005, node.size[0] - r);
    const by = Math.max(0.005, node.size[1] - r);
    const bz = Math.max(0.005, node.size[2] - r);
    const qx = Math.abs(x) - bx;
    const qy = Math.abs(y) - by;
    const qz = Math.abs(z) - bz;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  if (node.kind === "torus") {
    const majorR = Math.max(0.01, node.size[0]);
    const minorR = Math.max(0.004, node.size[1]);
    const qx = Math.sqrt(x * x + z * z) - majorR;
    return Math.sqrt(qx * qx + y * y) - minorR;
  }
  // cylinder
  const r = Math.max(0.005, node.size[0]);
  const h = Math.max(0.005, node.size[1]);
  const dx = Math.sqrt(x * x + z * z) - r;
  const dy = Math.abs(y) - h;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
}

/** SDF 클레이 씬의 부호 거리(`d < 0` 내부, `d > 0` 외부)를 평가한다. */
export function evaluateSdfScene(scene: SdfClayScene, px: number, py: number, pz: number): number {
  if (scene.primitives.length === 0) return 1e6;
  let d = evaluateSdfPrimitive(scene.primitives[0], px, py, pz);
  for (let i = 1; i < scene.primitives.length; i += 1) {
    const node = scene.primitives[i];
    const nd = evaluateSdfPrimitive(node, px, py, pz);
    const k = Math.max(0, node.blendRadiusM);
    if (node.op === "smooth-union") {
      d = smoothMin(d, nd, k);
    } else if (node.op === "smooth-subtract") {
      d = -smoothMin(-d, nd, k);
    } else {
      d = -smoothMin(-d, -nd, k);
    }
  }
  return d;
}

/** 중앙 차분 그래디언트로 정규화 표면 법선을 구한다. */
export function evaluateSdfNormal(
  scene: SdfClayScene,
  px: number,
  py: number,
  pz: number,
  h = 0.002,
): Vec3Tuple {
  const gx = evaluateSdfScene(scene, px + h, py, pz) - evaluateSdfScene(scene, px - h, py, pz);
  const gy = evaluateSdfScene(scene, px, py + h, pz) - evaluateSdfScene(scene, px, py - h, pz);
  const gz = evaluateSdfScene(scene, px, py, pz + h) - evaluateSdfScene(scene, px, py, pz - h);
  const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (len <= EPS) return [0, 1, 0];
  return [gx / len, gy / len, gz / len];
}

// 정육면체 12개 에지의 양 끝 코너(0..7, bit0=x, bit1=y, bit2=z)
const CUBE_EDGES: readonly (readonly [number, number])[] = Object.freeze([
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
]);

/**
 * Surface Nets 듀얼 컨투어링으로 SDF 등위면(`sdf = 0`)에서 수밀(watertight) 삼각형 메시를 추출한다.
 */
export function extractWatertightSdfMesh(
  scene: SdfClayScene,
  gridResolution = 18,
): ExtractedWatertightSdfMesh {
  const res = Math.max(6, Math.min(48, Math.floor(gridResolution)));
  const stride = res + 1;
  const minX = scene.boundsMin[0];
  const minY = scene.boundsMin[1];
  const minZ = scene.boundsMin[2];
  const stepX = (scene.boundsMax[0] - minX) / res;
  const stepY = (scene.boundsMax[1] - minY) / res;
  const stepZ = (scene.boundsMax[2] - minZ) / res;

  // 1) 격자 꼭짓점 SDF 스칼라 필드 샘플링
  const field = new Float32Array(stride * stride * stride);
  const fieldIdx = (x: number, y: number, z: number) => (z * stride + y) * stride + x;
  for (let z = 0; z <= res; z += 1) {
    const wz = minZ + z * stepZ;
    for (let y = 0; y <= res; y += 1) {
      const wy = minY + y * stepY;
      for (let x = 0; x <= res; x += 1) {
        const wx = minX + x * stepX;
        // 외곽 바운딩 경계는 강제 양수(+step)로 패딩해 수밀 폐합 보장
        const isBorder = x === 0 || x === res || y === 0 || y === res || z === 0 || z === res;
        const val = evaluateSdfScene(scene, wx, wy, wz);
        field[fieldIdx(x, y, z)] = isBorder ? Math.max(val, Math.min(stepX, stepY, stepZ) * 0.5) : val;
      }
    }
  }

  // 2) 부호가 바뀌는 셀마다 듀얼 버텍스 생성 + 1스텝 뉴턴 등위면 투영
  const cellVertexIndex = new Int32Array(res * res * res).fill(-1);
  const cellIdx = (x: number, y: number, z: number) => (z * res + y) * res + x;
  const vertPositions: number[] = [];
  const vertNormals: number[] = [];
  const cornerVals = new Float32Array(8);

  for (let z = 0; z < res; z += 1) {
    for (let y = 0; y < res; y += 1) {
      for (let x = 0; x < res; x += 1) {
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const cx = x + (c & 1);
          const cy = y + ((c >> 1) & 1);
          const cz = z + ((c >> 2) & 1);
          const v = field[fieldIdx(cx, cy, cz)];
          cornerVals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        let crossCount = 0;
        for (const [c0, c1] of CUBE_EDGES) {
          const v0 = cornerVals[c0];
          const v1 = cornerVals[c1];
          if ((v0 < 0) === (v1 < 0)) continue;
          const denom = v1 - v0;
          const t = Math.abs(denom) > EPS ? clamp(-v0 / denom, 0, 1) : 0.5;
          const x0 = x + (c0 & 1);
          const y0 = y + ((c0 >> 1) & 1);
          const z0 = z + ((c0 >> 2) & 1);
          const x1 = x + (c1 & 1);
          const y1 = y + ((c1 >> 1) & 1);
          const z1 = z + ((c1 >> 2) & 1);
          sumX += x0 + (x1 - x0) * t;
          sumY += y0 + (y1 - y0) * t;
          sumZ += z0 + (z1 - z0) * t;
          crossCount += 1;
        }
        if (crossCount === 0) continue;

        let vx = minX + (sumX / crossCount) * stepX;
        let vy = minY + (sumY / crossCount) * stepY;
        let vz = minZ + (sumZ / crossCount) * stepZ;

        // 1회 뉴턴 등위면 투영으로 표면 정밀도 향상
        const n = evaluateSdfNormal(scene, vx, vy, vz, Math.min(stepX, stepY, stepZ) * 0.25);
        const dAtV = evaluateSdfScene(scene, vx, vy, vz);
        const maxShift = Math.min(stepX, stepY, stepZ) * 0.45;
        const shift = clamp(dAtV, -maxShift, maxShift);
        vx -= n[0] * shift;
        vy -= n[1] * shift;
        vz -= n[2] * shift;

        const vIndex = vertPositions.length / 3;
        cellVertexIndex[cellIdx(x, y, z)] = vIndex;
        vertPositions.push(vx, vy, vz);
        vertNormals.push(n[0], n[1], n[2]);
      }
    }
  }

  // 3) 부호 교차 내부 격자 에지마다 인접 4셀을 연결해 일관된 외향 와인딩 쿼드(2삼각형) 방출
  const indexList: number[] = [];
  const emitQuad = (v0: number, v1: number, v2: number, v3: number, flip: boolean) => {
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return;
    if (flip) {
      indexList.push(v0, v2, v1, v0, v3, v2);
    } else {
      indexList.push(v0, v1, v2, v0, v2, v3);
    }
  };

  for (let z = 1; z < res; z += 1) {
    for (let y = 1; y < res; y += 1) {
      for (let x = 1; x < res; x += 1) {
        const v0 = field[fieldIdx(x, y, z)];
        const inside0 = v0 < 0;

        // +X 에지: (x,y,z) -> (x+1,y,z)
        if (x < res - 1) {
          const inside1 = field[fieldIdx(x + 1, y, z)] < 0;
          if (inside0 !== inside1) {
            emitQuad(
              cellVertexIndex[cellIdx(x, y - 1, z - 1)],
              cellVertexIndex[cellIdx(x, y, z - 1)],
              cellVertexIndex[cellIdx(x, y, z)],
              cellVertexIndex[cellIdx(x, y - 1, z)],
              !inside0,
            );
          }
        }
        // +Y 에지: (x,y,z) -> (x,y+1,z)
        if (y < res - 1) {
          const inside1 = field[fieldIdx(x, y + 1, z)] < 0;
          if (inside0 !== inside1) {
            emitQuad(
              cellVertexIndex[cellIdx(x - 1, y, z - 1)],
              cellVertexIndex[cellIdx(x - 1, y, z)],
              cellVertexIndex[cellIdx(x, y, z)],
              cellVertexIndex[cellIdx(x, y, z - 1)],
              !inside0,
            );
          }
        }
        // +Z 에지: (x,y,z) -> (x,y,z+1)
        if (z < res - 1) {
          const inside1 = field[fieldIdx(x, y, z + 1)] < 0;
          if (inside0 !== inside1) {
            emitQuad(
              cellVertexIndex[cellIdx(x - 1, y - 1, z)],
              cellVertexIndex[cellIdx(x, y - 1, z)],
              cellVertexIndex[cellIdx(x, y, z)],
              cellVertexIndex[cellIdx(x - 1, y, z)],
              !inside0,
            );
          }
        }
      }
    }
  }

  // 4) 에지 다양체(Manifold) 및 수밀성(Watertight) 자체 감사
  const edgeUseCounts = new Map<string, number>();
  for (let i = 0; i < indexList.length; i += 3) {
    const tri = [indexList[i], indexList[i + 1], indexList[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUseCounts.set(key, (edgeUseCounts.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeUseCounts.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    else if (count > 2) nonManifoldEdgeCount += 1;
  }

  return {
    vertexCount: vertPositions.length / 3,
    triangleCount: indexList.length / 3,
    positions: new Float32Array(vertPositions),
    normals: new Float32Array(vertNormals),
    indices: new Uint32Array(indexList),
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    isWatertight: indexList.length > 0 && boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0,
  };
}
