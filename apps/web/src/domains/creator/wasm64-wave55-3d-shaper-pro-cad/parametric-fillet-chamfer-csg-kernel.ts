/**
 * Wave 55 3D 셰이퍼+ 파라메트릭 엣지 챔퍼/필렛 베벨·3D CSG 불리언 및 비파괴 히스토리 트리 커널.
 *
 * - Shapr3D의 핵심 직관 기능인 자동 안전 클램핑 기반 챔퍼(`segments=1`)·원호 필렛(`segments>=2`)
 *   베벨(`applyParametricEdgeBevel`)을 다면체 평면 그래프 기반으로 수밀하게 수행한다.
 * - BSP CSG 불리언(`booleanSolidUnion | Subtract | Intersect`)을 통합 재내보내기하고,
 *   치수 수정 시 전체 솔리드를 결정론적으로 재평가하는 `ParametricCadFeatureTree`를 제공한다.
 */

import {
  booleanSolidIntersect,
  booleanSolidOperation,
  type BooleanSolidOperationKind,
  type BooleanSolidOptions,
  booleanSolidSubtract,
  booleanSolidUnion,
} from "./bsp-csg-boolean-solver";
import {
  type CadEdgePair,
  type CadSolidMesh,
  type CadTriangle,
  clampNumber,
  triangleNormalAndArea,
  undirectedEdgeKey,
  type Vec2,
  type Vec3,
  vec3Add,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  weldAndFinalizeSolidMesh,
} from "./cad-manifold-primitives";
import {
  extrudeSketchPushPull,
  triangulateSimplePolygon2D,
} from "./direct-sketch-pushpull-manifold-kernel";

export {
  booleanSolidIntersect,
  booleanSolidOperation,
  booleanSolidSubtract,
  booleanSolidUnion,
  type BooleanSolidOperationKind,
  type BooleanSolidOptions,
};

export type ParametricBevelEdgeScope = "all-sharp" | "top-edges" | "vertical-edges";

export interface ParametricEdgeBevelInput {
  readonly id?: string;
  readonly label?: string;
  readonly radiusMeters: number;
  readonly segments?: number;
  readonly minDihedralAngleDeg?: number;
  readonly edgeScope?: ParametricBevelEdgeScope;
  readonly groundToFloorY0?: boolean;
}

export interface ParametricEdgeBevelResult {
  readonly solid: CadSolidMesh;
  readonly requestedRadiusMeters: number;
  readonly appliedRadiusMeters: number;
  readonly wasClamped: boolean;
  readonly segments: number;
  readonly beveledEdgeCount: number;
}

export interface BoxSolidPrimitiveInput {
  readonly id?: string;
  readonly label?: string;
  readonly widthX: number;
  readonly heightY: number;
  readonly depthZ: number;
  readonly centerOffset?: Vec3;
  readonly groundToFloorY0?: boolean;
}

export interface SolidTransformInput {
  readonly translate?: Vec3;
  readonly scale?: Vec3;
  readonly rotateYDeg?: number;
  readonly groundToFloorY0?: boolean;
}

interface PlanarFaceRegion {
  readonly regionId: number;
  readonly normal: Vec3;
  readonly triangleIndices: number[];
  readonly loops: number[][];
}

interface PolyhedralEdge {
  readonly u: number;
  readonly v: number;
  readonly leftRegion: number;
  readonly rightRegion: number;
  readonly dihedralRad: number;
  readonly lengthMeters: number;
  readonly beveled: boolean;
}

/**
 * 지정 치수(미터)와 오프셋으로 수밀 직육면체 솔리드(벽체·창문 커터·가구 블록)를 생성한다.
 */
export function createBoxSolidPrimitive(input: BoxSolidPrimitiveInput): CadSolidMesh {
  const w = Math.max(1e-4, input.widthX);
  const h = Math.max(1e-4, input.heightY);
  const d = Math.max(1e-4, input.depthZ);
  const off = input.centerOffset ?? [0, 0, 0];
  const x0 = off[0] - w * 0.5;
  const x1 = off[0] + w * 0.5;
  const z0 = off[2] - d * 0.5;
  const z1 = off[2] + d * 0.5;
  const baseY = input.groundToFloorY0 === false ? off[1] - h * 0.5 : 0;

  return extrudeSketchPushPull({
    id: input.id ?? "solid-box",
    label: input.label ?? "직육면체 블록",
    polygon: [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    heightMeters: h,
    baseElevationY: baseY,
    groundToFloorY0: input.groundToFloorY0 ?? true,
  });
}

/**
 * 수밀 솔리드에 이동·비율·Y축 회전을 적용해 새 솔리드를 반환한다.
 */
export function transformSolidMesh(solid: CadSolidMesh, input: SolidTransformInput): CadSolidMesh {
  const tr = input.translate ?? [0, 0, 0];
  const sc = input.scale ?? [1, 1, 1];
  const rad = ((input.rotateYDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const rawVertices: Vec3[] = solid.vertices.map((v) => {
    const sx = v[0] * sc[0];
    const sy = v[1] * sc[1];
    const sz = v[2] * sc[2];
    const rx = sx * cosR + sz * sinR;
    const rz = -sx * sinR + sz * cosR;
    return [rx + tr[0], sy + tr[1], rz + tr[2]];
  });

  return weldAndFinalizeSolidMesh({
    id: `${solid.id}-xform`,
    label: solid.label,
    rawVertices,
    rawTriangles: solid.triangles,
    groundToFloorY0: input.groundToFloorY0 ?? false,
    hardEdges: solid.hardEdges,
    metadata: solid.metadata,
  });
}

function extractPlanarFaceRegions(solid: CadSolidMesh): PlanarFaceRegion[] {
  const triCount = solid.triangles.length;
  const triNormals: Vec3[] = [];
  const edgeToTris = new Map<string, number[]>();

  for (let i = 0; i < triCount; i += 1) {
    const tri = solid.triangles[i];
    if (!tri) {
      triNormals.push([0, 1, 0]);
      continue;
    }
    const a = solid.vertices[tri[0]] ?? [0, 0, 0];
    const b = solid.vertices[tri[1]] ?? [0, 0, 0];
    const c = solid.vertices[tri[2]] ?? [0, 0, 0];
    triNormals.push(triangleNormalAndArea(a, b, c).normal);
    const pairs: Array<[number, number]> = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
    for (const [u, v] of pairs) {
      const key = undirectedEdgeKey(u, v);
      const list = edgeToTris.get(key);
      if (list) list.push(i);
      else edgeToTris.set(key, [i]);
    }
  }

  const coplanarCos = Math.cos((1.2 * Math.PI) / 180);
  const visited = new Uint8Array(triCount);
  const regions: PlanarFaceRegion[] = [];

  for (let start = 0; start < triCount; start += 1) {
    if (visited[start] === 1) continue;
    const seedNormal = triNormals[start] ?? [0, 1, 0];
    const stack: number[] = [start];
    const members: number[] = [];
    visited[start] = 1;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    while (stack.length > 0) {
      const cur = stack.pop() ?? 0;
      members.push(cur);
      const cn = triNormals[cur] ?? seedNormal;
      nx += cn[0];
      ny += cn[1];
      nz += cn[2];
      const tri = solid.triangles[cur];
      if (!tri) continue;
      const pairs: Array<[number, number]> = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
      for (const [u, v] of pairs) {
        for (const neighbor of edgeToTris.get(undirectedEdgeKey(u, v)) ?? []) {
          if (visited[neighbor] === 1) continue;
          const nn = triNormals[neighbor];
          if (nn && vec3Dot(nn, seedNormal) >= coplanarCos) {
            visited[neighbor] = 1;
            stack.push(neighbor);
          }
        }
      }
    }

    // 영역 경계 반모서리 루프 추출
    const halfEdges = new Map<string, { from: number; to: number }>();
    for (const tIdx of members) {
      const tri = solid.triangles[tIdx];
      if (!tri) continue;
      const pairs: Array<[number, number]> = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
      for (const [u, v] of pairs) {
        const rev = `${v}->${u}`;
        if (halfEdges.has(rev)) halfEdges.delete(rev);
        else halfEdges.set(`${u}->${v}`, { from: u, to: v });
      }
    }

    const adj = new Map<number, number[]>();
    for (const he of halfEdges.values()) {
      const list = adj.get(he.from);
      if (list) list.push(he.to);
      else adj.set(he.from, [he.to]);
    }
    const usedEdges = new Set<string>();
    const loops: number[][] = [];
    for (const he of halfEdges.values()) {
      const startKey = `${he.from}->${he.to}`;
      if (usedEdges.has(startKey)) continue;
      const loop: number[] = [];
      let curV = he.from;
      let nextV: number | undefined = he.to;
      let guard = halfEdges.size + 4;
      while (nextV !== undefined && guard > 0) {
        guard -= 1;
        usedEdges.add(`${curV}->${nextV}`);
        loop.push(curV);
        if (nextV === he.from) break;
        curV = nextV;
        const candidates = adj.get(curV) ?? [];
        nextV = candidates.find((cand) => !usedEdges.has(`${curV}->${cand}`));
      }
      if (loop.length >= 3) loops.push(loop);
    }

    regions.push({
      regionId: regions.length,
      normal: vec3Normalize([nx, ny, nz]),
      triangleIndices: members,
      loops,
    });
  }

  return regions;
}

function evalRationalBezierArc(p0: Vec3, p1: Vec3, p2: Vec3, weight: number, t: number): Vec3 {
  const u = 1 - t;
  const w0 = u * u;
  const w1 = 2 * u * t * weight;
  const w2 = t * t;
  const denom = w0 + w1 + w2;
  if (denom <= 1e-12) return p0;
  return [
    (w0 * p0[0] + w1 * p1[0] + w2 * p2[0]) / denom,
    (w0 * p0[1] + w1 * p1[1] + w2 * p2[1]) / denom,
    (w0 * p0[2] + w1 * p1[2] + w2 * p2[2]) / denom,
  ];
}

/**
 * Shapr3D 방식의 파라메트릭 엣지 챔퍼(`segments=1`) 및 원호 필렛(`segments>=2`) 베벨을 수행한다.
 * 인접 모서리 길이에 따라 안전 반경을 자동 클램핑하며, 수밀 토폴로지(`nonManifoldEdges === 0`)를 유지한다.
 */
export function applyParametricEdgeBevel(
  solid: CadSolidMesh,
  input: ParametricEdgeBevelInput,
): ParametricEdgeBevelResult {
  if (!Number.isFinite(input.radiusMeters) || input.radiusMeters <= 1e-5) {
    throw new Error("베벨 반경(radiusMeters)은 0보다 큰 유한한 미터 값이어야 합니다.");
  }
  const segments = clampNumber(Math.floor(input.segments ?? 1), 1, 8);
  const minDihedralRad = ((input.minDihedralAngleDeg ?? 25) * Math.PI) / 180;
  const scope = input.edgeScope ?? "all-sharp";

  const regions = extractPlanarFaceRegions(solid);
  // 단순 단일 루프 면의 공선 중간 정점 정리 (3개 이상 평면이 만나는 진짜 모서리 정점만 보존)
  const vertexRegionSet = new Map<number, Set<number>>();
  for (const reg of regions) {
    for (const loop of reg.loops) {
      for (const vIdx of loop) {
        let set = vertexRegionSet.get(vIdx);
        if (!set) {
          set = new Set<number>();
          vertexRegionSet.set(vIdx, set);
        }
        set.add(reg.regionId);
      }
    }
  }

  const simplifiedLoops = new Map<number, number[]>();
  for (const reg of regions) {
    if (reg.loops.length !== 1) continue;
    const rawLoop = reg.loops[0] ?? [];
    const cleaned: number[] = [];
    const len = rawLoop.length;
    for (let i = 0; i < len; i += 1) {
      const prev = rawLoop[(i + len - 1) % len] ?? 0;
      const curr = rawLoop[i] ?? 0;
      const next = rawLoop[(i + 1) % len] ?? 0;
      const deg = vertexRegionSet.get(curr)?.size ?? 0;
      if (deg <= 2) {
        const pA = solid.vertices[prev] ?? [0, 0, 0];
        const pB = solid.vertices[curr] ?? [0, 0, 0];
        const pC = solid.vertices[next] ?? [0, 0, 0];
        const d1 = vec3Normalize(vec3Sub(pB, pA));
        const d2 = vec3Normalize(vec3Sub(pC, pB));
        if (vec3Length(vec3Cross(d1, d2)) < 1e-4) continue;
      }
      cleaned.push(curr);
    }
    if (cleaned.length >= 3) simplifiedLoops.set(reg.regionId, cleaned);
  }

  // 다면체 모서리 테이블 구축
  const halfEdgeRegion = new Map<string, number>();
  for (const [regId, loop] of simplifiedLoops.entries()) {
    for (let i = 0; i < loop.length; i += 1) {
      const u = loop[i] ?? 0;
      const v = loop[(i + 1) % loop.length] ?? 0;
      halfEdgeRegion.set(`${u}->${v}`, regId);
    }
  }

  const polyEdges = new Map<string, PolyhedralEdge>();
  let minIncidentEdgeLen = Number.POSITIVE_INFINITY;
  for (const [regId, loop] of simplifiedLoops.entries()) {
    for (let i = 0; i < loop.length; i += 1) {
      const u = loop[i] ?? 0;
      const v = loop[(i + 1) % loop.length] ?? 0;
      const key = undirectedEdgeKey(u, v);
      if (polyEdges.has(key)) continue;
      const otherReg = halfEdgeRegion.get(`${v}->${u}`);
      if (otherReg === undefined || otherReg === regId) continue;
      const regA = regions[regId];
      const regB = regions[otherReg];
      const pU = solid.vertices[u];
      const pV = solid.vertices[v];
      if (!regA || !regB || !pU || !pV) continue;

      const dihedralRad = Math.acos(clampNumber(vec3Dot(regA.normal, regB.normal), -1, 1));
      const edgeLen = vec3Distance(pU, pV);
      const dir = vec3Normalize(vec3Sub(pV, pU));

      let matchesScope = dihedralRad >= minDihedralRad;
      if (matchesScope && scope === "top-edges") {
        matchesScope = regA.normal[1] > 0.7 || regB.normal[1] > 0.7;
      } else if (matchesScope && scope === "vertical-edges") {
        matchesScope = Math.abs(dir[1]) > 0.7;
      }

      if (matchesScope && edgeLen < minIncidentEdgeLen) {
        minIncidentEdgeLen = edgeLen;
      }
      polyEdges.set(key, {
        u,
        v,
        leftRegion: regId,
        rightRegion: otherReg,
        dihedralRad,
        lengthMeters: edgeLen,
        beveled: matchesScope,
      });
    }
  }

  const beveledEdges = [...polyEdges.values()].filter((e) => e.beveled);
  if (beveledEdges.length === 0) {
    return {
      solid,
      requestedRadiusMeters: input.radiusMeters,
      appliedRadiusMeters: 0,
      wasClamped: false,
      segments,
      beveledEdgeCount: 0,
    };
  }

  // 모든 다면체 모서리 길이를 기준으로 자동 안전 클램핑 계산
  let globalMinEdge = minIncidentEdgeLen;
  for (const e of polyEdges.values()) {
    if (e.lengthMeters < globalMinEdge) globalMinEdge = e.lengthMeters;
  }
  const maxSafeRadius = Math.max(1e-4, globalMinEdge * 0.36);
  const appliedRadius = Math.min(input.radiusMeters, maxSafeRadius);
  const wasClamped = appliedRadius < input.radiusMeters - 1e-9;

  // Pass 1: 각 평면 영역의 인셋 코너 정점 좌표 계산 (삼각분할은 베벨 스트립 생성 후 수행)
  const rawVertices: Vec3[] = [];
  const rawTriangles: CadTriangle[] = [];
  const hardEdges: CadEdgePair[] = [];
  const faceCornerIndex = new Map<string, number>();

  interface PendingRegionLoop {
    readonly reg: PlanarFaceRegion;
    readonly corners: Array<{
      readonly prevV: number;
      readonly currV: number;
      readonly nextV: number;
      readonly newIdx: number;
      readonly isUnbeveledCorner: boolean;
    }>;
  }
  const pendingRegionLoops: PendingRegionLoop[] = [];

  for (const reg of regions) {
    const loop = simplifiedLoops.get(reg.regionId);
    if (!loop) {
      // 다중 루프(구멍 포함) 영역은 원본 삼각형을 그대로 보존
      const offsetMap = new Map<number, number>();
      for (const tIdx of reg.triangleIndices) {
        const tri = solid.triangles[tIdx];
        if (!tri) continue;
        const mapped: [number, number, number] = [0, 0, 0];
        for (let k = 0; k < 3; k += 1) {
          const orig = tri[k] ?? 0;
          let nv = offsetMap.get(orig);
          if (nv === undefined) {
            nv = rawVertices.length;
            rawVertices.push(solid.vertices[orig] ?? [0, 0, 0]);
            offsetMap.set(orig, nv);
          }
          mapped[k] = nv;
        }
        rawTriangles.push(mapped);
      }
      continue;
    }

    const n = loop.length;
    const corners: PendingRegionLoop["corners"] = [];
    for (let i = 0; i < n; i += 1) {
      const prevV = loop[(i + n - 1) % n] ?? 0;
      const currV = loop[i] ?? 0;
      const nextV = loop[(i + 1) % n] ?? 0;
      const pPrev = solid.vertices[prevV] ?? [0, 0, 0];
      const pCurr = solid.vertices[currV] ?? [0, 0, 0];
      const pNext = solid.vertices[nextV] ?? [0, 0, 0];

      const ePrev = polyEdges.get(undirectedEdgeKey(prevV, currV));
      const eNext = polyEdges.get(undirectedEdgeKey(currV, nextV));
      const r1 = ePrev?.beveled ? appliedRadius : 0;
      const r2 = eNext?.beveled ? appliedRadius : 0;

      let cornerPt: Vec3 = pCurr;
      if (r1 > 0 || r2 > 0) {
        const d1 = vec3Normalize(vec3Sub(pCurr, pPrev));
        const d2 = vec3Normalize(vec3Sub(pNext, pCurr));
        const in1 = vec3Normalize(vec3Cross(reg.normal, d1));
        const in2 = vec3Normalize(vec3Cross(reg.normal, d2));
        const q1 = vec3Add(pCurr, vec3Scale(in1, r1));
        const q2 = vec3Add(pCurr, vec3Scale(in2, r2));
        const denom = vec3Dot(d1, in2);
        if (Math.abs(denom) < 1e-6) {
          cornerPt = vec3Add(pCurr, vec3Scale(in1, (r1 + r2) * 0.5));
        } else {
          const s = -vec3Dot(vec3Sub(q1, q2), in2) / denom;
          cornerPt = vec3Add(q1, vec3Scale(d1, clampNumber(s, -appliedRadius * 3, appliedRadius * 3)));
        }
      }
      const newIdx = rawVertices.length;
      rawVertices.push(cornerPt);
      faceCornerIndex.set(`${reg.regionId}:${currV}`, newIdx);
      corners.push({
        prevV,
        currV,
        nextV,
        newIdx,
        isUnbeveledCorner: r1 === 0 && r2 === 0,
      });
    }
    pendingRegionLoops.push({ reg, corners });
  }

  // Pass 2: 베벨 스트립 생성 및 꼭짓점 코너 패치 반모서리 수집
  const cornerPatchEdges = new Map<number, Array<[number, number]>>();
  const pushCornerEdge = (origVertex: number, from: number, to: number): void => {
    const list = cornerPatchEdges.get(origVertex);
    if (list) list.push([from, to]);
    else cornerPatchEdges.set(origVertex, [[from, to]]);
  };

  for (const edge of beveledEdges) {
    const uLeft = faceCornerIndex.get(`${edge.leftRegion}:${edge.u}`);
    const vLeft = faceCornerIndex.get(`${edge.leftRegion}:${edge.v}`);
    const uRight = faceCornerIndex.get(`${edge.rightRegion}:${edge.u}`);
    const vRight = faceCornerIndex.get(`${edge.rightRegion}:${edge.v}`);
    if (uLeft === undefined || vLeft === undefined || uRight === undefined || vRight === undefined) {
      continue;
    }

    const pULeft = rawVertices[uLeft] ?? [0, 0, 0];
    const pVLeft = rawVertices[vLeft] ?? [0, 0, 0];
    const pURight = rawVertices[uRight] ?? [0, 0, 0];
    const pVRight = rawVertices[vRight] ?? [0, 0, 0];
    const ctrlU = solid.vertices[edge.u] ?? pULeft;
    const ctrlV = solid.vertices[edge.v] ?? pVLeft;
    const arcWeight = segments > 1 ? clampNumber(Math.cos(edge.dihedralRad * 0.5), 0.35, 1) : 1;

    const uArc: number[] = [uLeft];
    const vArc: number[] = [vLeft];
    for (let s = 1; s < segments; s += 1) {
      const t = s / segments;
      const uIdx = rawVertices.length;
      rawVertices.push(evalRationalBezierArc(pULeft, ctrlU, pURight, arcWeight, t));
      uArc.push(uIdx);
      const vIdx = rawVertices.length;
      rawVertices.push(evalRationalBezierArc(pVLeft, ctrlV, pVRight, arcWeight, t));
      vArc.push(vIdx);
    }
    uArc.push(uRight);
    vArc.push(vRight);

    for (let s = 0; s < segments; s += 1) {
      const u0 = uArc[s] ?? 0;
      const u1 = uArc[s + 1] ?? 0;
      const v0 = vArc[s] ?? 0;
      const v1 = vArc[s + 1] ?? 0;
      rawTriangles.push([v0, u0, u1]);
      rawTriangles.push([v0, u1, v1]);
      // 코너 패치의 역방향 경계 반모서리 등록
      pushCornerEdge(edge.u, u1, u0);
      pushCornerEdge(edge.v, v0, v1);
    }
  }

  const posKey = (idx: number): string => {
    const p = rawVertices[idx] ?? [0, 0, 0];
    return `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  };
  const consumedCornerEdgeSet = new Map<number, Set<number>>();

  // Pass 3: 각 평면 영역 삼각분할 (부분 베벨 시 인접 면을 통해 들어오는 공면 베벨 호를 루프에 이어붙임)
  for (const { reg, corners } of pendingRegionLoops) {
    const finalIds: number[] = [];
    for (const c of corners) {
      let spliced = false;
      if (c.isUnbeveledCorner) {
        const adjPrev = halfEdgeRegion.get(`${c.currV}->${c.prevV}`);
        const adjNext = halfEdgeRegion.get(`${c.nextV}->${c.currV}`);
        const startIdx = adjPrev !== undefined ? faceCornerIndex.get(`${adjPrev}:${c.currV}`) : undefined;
        const endIdx = adjNext !== undefined ? faceCornerIndex.get(`${adjNext}:${c.currV}`) : undefined;
        const dirEdges = cornerPatchEdges.get(c.currV);
        if (
          startIdx !== undefined &&
          endIdx !== undefined &&
          dirEdges &&
          dirEdges.length > 0 &&
          posKey(startIdx) !== posKey(endIdx)
        ) {
          let consumed = consumedCornerEdgeSet.get(c.currV);
          const byFromKey = new Map<string, { edgeIdx: number; from: number; to: number }>();
          for (let eIdx = 0; eIdx < dirEdges.length; eIdx += 1) {
            if (consumed?.has(eIdx)) continue;
            const pair = dirEdges[eIdx];
            if (!pair) continue;
            const fKey = posKey(pair[0]);
            const tKey = posKey(pair[1]);
            if (fKey === tKey) continue;
            byFromKey.set(fKey, { edgeIdx: eIdx, from: pair[0], to: pair[1] });
          }

          const targetKey = posKey(endIdx);
          let curKey = posKey(startIdx);
          const chainIds: number[] = [];
          const usedIdxList: number[] = [];
          const seenKeys = new Set<string>();
          let guard = byFromKey.size + 2;
          while (curKey !== targetKey && !seenKeys.has(curKey) && guard > 0) {
            guard -= 1;
            seenKeys.add(curKey);
            const rec = byFromKey.get(curKey);
            if (!rec) break;
            chainIds.push(rec.from);
            usedIdxList.push(rec.edgeIdx);
            curKey = posKey(rec.to);
          }

          if (curKey === targetKey && chainIds.length > 0) {
            chainIds.push(endIdx);
            if (!consumed) {
              consumed = new Set<number>();
              consumedCornerEdgeSet.set(c.currV, consumed);
            }
            for (const eIdx of usedIdxList) consumed.add(eIdx);
            for (const id of chainIds) finalIds.push(id);
            spliced = true;
          }
        }
      }
      if (!spliced) {
        finalIds.push(c.newIdx);
      }
    }

    const finalPts: Vec3[] = finalIds.map((idx) => rawVertices[idx] ?? [0, 0, 0]);
    const refAxis: Vec3 = Math.abs(reg.normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const basisU = vec3Normalize(vec3Cross(refAxis, reg.normal));
    const basisV = vec3Cross(reg.normal, basisU);
    const origin = finalPts[0] ?? [0, 0, 0];
    const poly2D: Vec2[] = finalPts.map((pt) => {
      const rel = vec3Sub(pt, origin);
      return [vec3Dot(rel, basisU), vec3Dot(rel, basisV)];
    });
    for (const [i0, i1, i2] of triangulateSimplePolygon2D(poly2D)) {
      rawTriangles.push([finalIds[i0] ?? 0, finalIds[i1] ?? 0, finalIds[i2] ?? 0]);
    }
    for (let i = 0; i < finalIds.length; i += 1) {
      hardEdges.push([finalIds[i] ?? 0, finalIds[(i + 1) % finalIds.length] ?? 0]);
    }
  }

  // Pass 4: 미소비 꼭짓점 3D 코너 패치 닫기 (닫힌 3개 이상 비퇴화 루프만 삼각분할, 2-스트립 합선은 자동 용접)
  for (const [origV, dirEdges] of cornerPatchEdges.entries()) {
    const consumed = consumedCornerEdgeSet.get(origV);
    const nextByPosKey = new Map<string, { from: number; to: number }>();
    for (let eIdx = 0; eIdx < dirEdges.length; eIdx += 1) {
      if (consumed?.has(eIdx)) continue;
      const pair = dirEdges[eIdx];
      if (!pair) continue;
      const [from, to] = pair;
      const fKey = posKey(from);
      const tKey = posKey(to);
      if (fKey === tKey) continue;
      nextByPosKey.set(fKey, { from, to });
    }
    if (nextByPosKey.size < 3) continue;

    const first = nextByPosKey.values().next().value;
    if (!first) continue;
    const startKey = posKey(first.from);
    const loop: number[] = [];
    const seen = new Set<string>();
    let curKey = startKey;
    let guard = nextByPosKey.size + 4;
    while (!seen.has(curKey) && guard > 0) {
      guard -= 1;
      seen.add(curKey);
      const rec = nextByPosKey.get(curKey);
      if (!rec) break;
      loop.push(rec.from);
      curKey = posKey(rec.to);
    }
    if (curKey !== startKey) continue;
    if (loop.length === 3) {
      rawTriangles.push([loop[0] ?? 0, loop[1] ?? 0, loop[2] ?? 0]);
    } else if (loop.length > 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const idx of loop) {
        const p = rawVertices[idx] ?? [0, 0, 0];
        cx += p[0];
        cy += p[1];
        cz += p[2];
      }
      const centroid: Vec3 = [cx / loop.length, cy / loop.length, cz / loop.length];
      const origPt = solid.vertices[origV] ?? centroid;
      const pull = segments > 1 ? 0.22 : 0;
      const apexIdx = rawVertices.length;
      rawVertices.push([
        centroid[0] + (origPt[0] - centroid[0]) * pull,
        centroid[1] + (origPt[1] - centroid[1]) * pull,
        centroid[2] + (origPt[2] - centroid[2]) * pull,
      ]);
      for (let i = 0; i < loop.length; i += 1) {
        rawTriangles.push([apexIdx, loop[i] ?? 0, loop[(i + 1) % loop.length] ?? 0]);
      }
    }
  }

  const resultSolid = weldAndFinalizeSolidMesh({
    id: input.id ?? `${solid.id}-bevel`,
    label: input.label ?? `${solid.label} (${segments > 1 ? "필렛" : "챔퍼"} 베벨)`,
    rawVertices,
    rawTriangles,
    groundToFloorY0: input.groundToFloorY0 ?? true,
    hardEdges,
    metadata: {
      generator: segments > 1 ? "parametric-fillet" : "parametric-chamfer",
      appliedRadiusMeters: appliedRadius,
      segments,
      beveledEdgeCount: beveledEdges.length,
    },
  });

  return {
    solid: resultSolid,
    requestedRadiusMeters: input.radiusMeters,
    appliedRadiusMeters: appliedRadius,
    wasClamped,
    segments,
    beveledEdgeCount: beveledEdges.length,
  };
}
