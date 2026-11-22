/**
 * PBD 의상 드레이프용 의상 격자 메쉬 생성기(셔츠·망토·치마·자유 격자) 및
 * 그래프 컬러링 독립 배치·정점 법선 계산 모듈.
 */

export type ClothVec3 = readonly [number, number, number];
export type ClothGarmentPreset = "cape" | "shirt" | "skirt" | "grid";
export type ClothPinMode = "top-row" | "top-corners" | "left-edge" | "none";

export interface ClothDistanceConstraint {
  readonly p1: number;
  readonly p2: number;
  readonly restLength: number;
  readonly compliance: number;
  readonly kind: "structural" | "shear";
}

export interface ClothBendingConstraint {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly p4: number;
  readonly restAngle: number;
  readonly compliance: number;
}

export interface ClothSphereCollider {
  readonly id: string;
  readonly kind: "sphere";
  readonly center: ClothVec3;
  readonly radius: number;
  readonly friction?: number;
}

export interface ClothCapsuleCollider {
  readonly id: string;
  readonly kind: "capsule";
  readonly start: ClothVec3;
  readonly end: ClothVec3;
  readonly radius: number;
  readonly friction?: number;
}

export type ClothBodyCollider = ClothSphereCollider | ClothCapsuleCollider;

export interface ClothConstraintBatch {
  readonly offset: number;
  readonly count: number;
}

export interface ClothGarmentMeshOptions {
  readonly cols?: number;
  readonly rows?: number;
  readonly width?: number;
  readonly height?: number;
  readonly topRadius?: number;
  readonly bottomRadius?: number;
  readonly origin?: ClothVec3;
  readonly plane?: "xy" | "xz";
  readonly pinMode?: ClothPinMode;
  readonly pinnedIndices?: readonly number[];
  readonly particleMass?: number;
  readonly structuralCompliance?: number;
  readonly shearCompliance?: number;
  readonly bendingCompliance?: number;
}

export interface ClothGarmentMeshData {
  readonly preset: ClothGarmentPreset;
  readonly cols: number;
  readonly rows: number;
  readonly particleCount: number;
  readonly positions: Float32Array;
  readonly invMasses: Float32Array;
  readonly indices: Uint32Array;
  readonly distanceConstraints: readonly ClothDistanceConstraint[];
  readonly bendingConstraints: readonly ClothBendingConstraint[];
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

/** 공유 엣지 `(p1, p2)`를 사이에 둔 두 삼각형 `(p1, p2, p3)`·`(p1, p4, p2)`의 이면각(라디안)을 계산한다. */
export function computeDihedralAngle(
  positions: Float32Array,
  p1: number,
  p2: number,
  p3: number,
  p4: number,
): number {
  const x1 = positions[p1 * 3] ?? 0;
  const y1 = positions[p1 * 3 + 1] ?? 0;
  const z1 = positions[p1 * 3 + 2] ?? 0;
  const e2x = (positions[p2 * 3] ?? 0) - x1;
  const e2y = (positions[p2 * 3 + 1] ?? 0) - y1;
  const e2z = (positions[p2 * 3 + 2] ?? 0) - z1;
  const e3x = (positions[p3 * 3] ?? 0) - x1;
  const e3y = (positions[p3 * 3 + 1] ?? 0) - y1;
  const e3z = (positions[p3 * 3 + 2] ?? 0) - z1;
  const e4x = (positions[p4 * 3] ?? 0) - x1;
  const e4y = (positions[p4 * 3 + 1] ?? 0) - y1;
  const e4z = (positions[p4 * 3 + 2] ?? 0) - z1;

  const c1x = e2y * e3z - e2z * e3y;
  const c1y = e2z * e3x - e2x * e3z;
  const c1z = e2x * e3y - e2y * e3x;
  const c2x = e4y * e2z - e4z * e2y;
  const c2y = e4z * e2x - e4x * e2z;
  const c2z = e4x * e2y - e4y * e2x;

  const len1 = Math.hypot(c1x, c1y, c1z);
  const len2 = Math.hypot(c2x, c2y, c2z);
  if (len1 <= 1e-8 || len2 <= 1e-8) return 0;
  const d = clamp((c1x * c2x + c1y * c2y + c1z * c2z) / (len1 * len2), -0.999999, 0.999999);
  return Math.acos(d);
}

/** 삼각형 인덱스 메쉬에서 내부 공유 엣지마다 4정점 이면각(dihedral) 굽힘 제약을 자동 추출한다. */
function buildBendingConstraintsFromTriangles(
  positions: Float32Array,
  indices: Uint32Array,
  bendingCompliance: number,
): readonly ClothBendingConstraint[] {
  const edgeToOpp = new Map<string, { readonly p1: number; readonly p2: number; readonly opp: number[] }>();
  const triCount = Math.floor(indices.length / 3);

  const registerEdge = (a: number, b: number, opp: number) => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const key = `${lo}:${hi}`;
    let entry = edgeToOpp.get(key);
    if (!entry) {
      entry = { p1: lo, p2: hi, opp: [] };
      edgeToOpp.set(key, entry);
    }
    if (entry.opp.length < 2) entry.opp.push(opp);
  };

  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3] ?? 0;
    const i1 = indices[t * 3 + 1] ?? 0;
    const i2 = indices[t * 3 + 2] ?? 0;
    registerEdge(i0, i1, i2);
    registerEdge(i1, i2, i0);
    registerEdge(i2, i0, i1);
  }

  const out: ClothBendingConstraint[] = [];
  for (const entry of edgeToOpp.values()) {
    if (entry.opp.length !== 2) continue;
    const p3 = entry.opp[0] ?? 0;
    const p4 = entry.opp[1] ?? 0;
    if (p3 === p4) continue;
    const restAngle = computeDihedralAngle(positions, entry.p1, entry.p2, p3, p4);
    out.push({
      p1: entry.p1,
      p2: entry.p2,
      p3,
      p4,
      restAngle,
      compliance: bendingCompliance,
    });
  }
  return out;
}

/** 셔츠·망토·치마·자유 격자 의상 메쉬 및 구조/전단/이면각 굽힘 제약을 생성한다. */
export function createClothGarmentMesh(
  preset: ClothGarmentPreset,
  options?: ClothGarmentMeshOptions,
): ClothGarmentMeshData {
  const wrapCylindrical = preset === "shirt" || preset === "skirt";
  const cols = Math.max(wrapCylindrical ? 6 : 2, Math.floor(options?.cols ?? (wrapCylindrical ? 14 : 9)));
  const rows = Math.max(2, Math.floor(options?.rows ?? 9));
  const width = Math.max(0.05, options?.width ?? (preset === "cape" ? 0.65 : 0.8));
  const height = Math.max(0.05, options?.height ?? (preset === "skirt" ? 0.52 : preset === "shirt" ? 0.56 : 0.9));
  const origin: ClothVec3 = options?.origin ?? (
    preset === "cape"
      ? [0, 1.45, -0.18]
      : preset === "shirt"
        ? [0, 1.44, 0]
        : preset === "skirt"
          ? [0, 0.96, 0]
          : [0, 1.4, 0]
  );
  const topRadius = Math.max(0.05, options?.topRadius ?? (preset === "shirt" ? 0.21 : 0.17));
  const bottomRadius = Math.max(0.05, options?.bottomRadius ?? (preset === "shirt" ? 0.23 : 0.34));
  const particleMass = Math.max(1e-4, options?.particleMass ?? 0.05);
  const baseInvMass = 1 / particleMass;
  const structuralCompliance = clamp(options?.structuralCompliance ?? 5e-5, 0, 100);
  const shearCompliance = clamp(options?.shearCompliance ?? 0.02, 0, 100);
  const bendingCompliance = clamp(options?.bendingCompliance ?? 12.0, 0, 5000);

  const particleCount = cols * rows;
  const positions = new Float32Array(particleCount * 3);
  const invMasses = new Float32Array(particleCount);
  const explicitPins = options?.pinnedIndices ? new Set(options.pinnedIndices) : null;
  const pinMode: ClothPinMode = options?.pinMode ?? "top-row";
  const plane = options?.plane ?? "xy";

  for (let r = 0; r < rows; r += 1) {
    const v = rows > 1 ? r / (rows - 1) : 0;
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      let x: number;
      let y: number;
      let z: number;

      if (wrapCylindrical) {
        const theta = (Math.PI * 2 * c) / cols;
        // 미세 주름 시드(좌굴 대칭 깨기)로 원통·원뿔 의상이 강체처럼 잠기지 않고 자연스러운 세로 주름을 형성
        const pleatRipple = (preset === "skirt" ? 0.012 : 0.006) * v * Math.sin(theta * 4 + r * 0.35);
        const radius = topRadius + (bottomRadius - topRadius) * v + pleatRipple;
        const xScale = preset === "shirt" ? 1.18 : 1.0;
        const zScale = preset === "shirt" ? 0.82 : 1.0;
        x = origin[0] + Math.cos(theta) * radius * xScale;
        y = origin[1] - v * height;
        z = origin[2] - Math.sin(theta) * radius * zScale;
      } else {
        const u = cols > 1 ? c / (cols - 1) - 0.5 : 0;
        const widthAtRow = preset === "cape" ? width * (0.65 + 0.55 * v) : width;
        if (plane === "xz") {
          x = origin[0] + u * widthAtRow;
          y = origin[1];
          z = origin[2] + v * height;
        } else {
          x = origin[0] + u * widthAtRow;
          y = origin[1] - v * height;
          z = origin[2];
        }
      }

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      let pinned = false;
      if (explicitPins) pinned = explicitPins.has(idx);
      else if (pinMode === "top-row") pinned = r === 0;
      else if (pinMode === "top-corners") pinned = r === 0 && (c === 0 || c === cols - 1);
      else if (pinMode === "left-edge") pinned = c === 0;
      invMasses[idx] = pinned ? 0 : baseInvMass;
    }
  }

  const indexList: number[] = [];
  const distanceConstraints: ClothDistanceConstraint[] = [];
  const seenEdges = new Set<string>();

  const pushDist = (p1: number, p2: number, compliance: number, kind: "structural" | "shear") => {
    if (p1 === p2) return;
    const lo = p1 < p2 ? p1 : p2;
    const hi = p1 < p2 ? p2 : p1;
    const key = `${lo}:${hi}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    const dx = (positions[p1 * 3] ?? 0) - (positions[p2 * 3] ?? 0);
    const dy = (positions[p1 * 3 + 1] ?? 0) - (positions[p2 * 3 + 1] ?? 0);
    const dz = (positions[p1 * 3 + 2] ?? 0) - (positions[p2 * 3 + 2] ?? 0);
    const restLength = Math.hypot(dx, dy, dz);
    if (restLength <= 1e-6) return;
    distanceConstraints.push({ p1: lo, p2: hi, restLength, compliance, kind });
  };

  const colSegs = wrapCylindrical ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < colSegs; c += 1) {
      const cNext = (c + 1) % cols;
      const tl = r * cols + c;
      const tr = r * cols + cNext;
      const bl = (r + 1) * cols + c;
      const br = (r + 1) * cols + cNext;

      if ((r + c) % 2 === 0) {
        indexList.push(tl, bl, br, tl, br, tr);
      } else {
        indexList.push(tl, bl, tr, tr, bl, br);
      }

      pushDist(tl, tr, structuralCompliance, "structural");
      pushDist(bl, br, structuralCompliance, "structural");
      pushDist(tl, bl, structuralCompliance, "structural");
      pushDist(tr, br, structuralCompliance, "structural");
      pushDist(tl, br, shearCompliance, "shear");
      pushDist(tr, bl, shearCompliance, "shear");
    }
  }

  const indices = new Uint32Array(indexList);
  const bendingConstraints = buildBendingConstraintsFromTriangles(positions, indices, bendingCompliance);

  return {
    preset,
    cols,
    rows,
    particleCount,
    positions,
    invMasses,
    indices,
    distanceConstraints,
    bendingConstraints,
  };
}

/** 제약 목록을 정점 비공유(vertex-disjoint) 배치로 결정적 탐욕 그래프 컬러링한다. */
export function colorConstraintBatches<T>(
  constraints: readonly T[],
  verticesOf: (constraint: T) => readonly number[],
): { readonly ordered: readonly T[]; readonly batches: readonly ClothConstraintBatch[] } {
  const colorBuckets: T[][] = [];
  const usedInColor: Set<number>[] = [];

  for (const constraint of constraints) {
    const verts = verticesOf(constraint);
    let assignedColor = -1;
    for (let c = 0; c < usedInColor.length; c += 1) {
      const usedSet = usedInColor[c];
      if (!usedSet) continue;
      let conflict = false;
      for (const v of verts) {
        if (usedSet.has(v)) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        assignedColor = c;
        break;
      }
    }
    if (assignedColor < 0) {
      assignedColor = colorBuckets.length;
      colorBuckets.push([]);
      usedInColor.push(new Set<number>());
    }
    colorBuckets[assignedColor]?.push(constraint);
    const set = usedInColor[assignedColor];
    if (set) {
      for (const v of verts) set.add(v);
    }
  }

  const ordered: T[] = [];
  const batches: ClothConstraintBatch[] = [];
  for (const bucket of colorBuckets) {
    batches.push({ offset: ordered.length, count: bucket.length });
    for (const item of bucket) ordered.push(item);
  }
  return { ordered, batches };
}

/** 현재 변형된 의상 메쉬의 면적 가중 정점 법선을 계산한다. */
export function computeClothVertexNormals(
  positions: Float32Array,
  indices: Uint32Array,
  particleCount: number,
): Float32Array {
  const normals = new Float32Array(particleCount * 3);
  const triCount = Math.floor(indices.length / 3);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3] ?? 0;
    const i1 = indices[t * 3 + 1] ?? 0;
    const i2 = indices[t * 3 + 2] ?? 0;
    const ax = positions[i0 * 3] ?? 0;
    const ay = positions[i0 * 3 + 1] ?? 0;
    const az = positions[i0 * 3 + 2] ?? 0;
    const e1x = (positions[i1 * 3] ?? 0) - ax;
    const e1y = (positions[i1 * 3 + 1] ?? 0) - ay;
    const e1z = (positions[i1 * 3 + 2] ?? 0) - az;
    const e2x = (positions[i2 * 3] ?? 0) - ax;
    const e2y = (positions[i2 * 3 + 1] ?? 0) - ay;
    const e2z = (positions[i2 * 3 + 2] ?? 0) - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    for (const vi of [i0, i1, i2]) {
      normals[vi * 3] = (normals[vi * 3] ?? 0) + nx;
      normals[vi * 3 + 1] = (normals[vi * 3 + 1] ?? 0) + ny;
      normals[vi * 3 + 2] = (normals[vi * 3 + 2] ?? 0) + nz;
    }
  }

  for (let v = 0; v < particleCount; v += 1) {
    const off = v * 3;
    const nx = normals[off] ?? 0;
    const ny = normals[off + 1] ?? 0;
    const nz = normals[off + 2] ?? 0;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      normals[off] = nx / len;
      normals[off + 1] = ny / len;
      normals[off + 2] = nz / len;
    } else {
      normals[off] = 0;
      normals[off + 1] = 1;
      normals[off + 2] = 0;
    }
  }
  return normals;
}
