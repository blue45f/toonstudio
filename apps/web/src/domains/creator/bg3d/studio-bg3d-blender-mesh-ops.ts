/**
 * studio-bg3d-blender-mesh-ops.ts
 *
 * Blender 계열 고급 3D 모델링 연산기 4종 (실제 Three.js BufferGeometry 버텍스·인덱스 레벨 실구현):
 * - applyMicroBevelChamfer (모서리 미세 베벨)
 * - applySymmetricMirrorGeometry (축 대칭 미러)
 * - subdivideGeometrySmooth (Catmull-Clark / Loop 세분화)
 * - applyBooleanMeshOperation (CSG 복셀 기반 불리언 차집합·합집합·교집합)
 */

import * as THREE from "three";

import {
  buildBufferGeometryFromIndexedMesh,
  isPointInsideWeldedMesh,
  triangulatePolygon2DEarClip,
  weldBufferGeometryVertices,
} from "./studio-bg3d-geometry-manifold-utils";
import {
  add3,
  buildPlaneBasis,
  cross3,
  dot3,
  quantKey3,
  round4,
  scale3,
  sliceGeometryWithSectionPlane,
  sub3,
  triangleNormal,
  wrapModelingResult,
  type BooleanOperationKind,
  type ModelingAxis,
  type ModelingOperationResult,
  type SectionPlaneSliceResult,
  type SubdivisionScheme,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./studio-bg3d-sketchup-mesh-ops";

// ── 5. Blender 모서리 미세 베벨 ──────────────────────────────────────────────

/**
 * Blender 모서리 미세 베벨(Micro-Bevel Chamfer):
 * 동일 평면 삼각형을 다각형 면으로 묶어 각 면을 안쪽으로 오프셋한 뒤,
 * 모서리 베벨 스트립(1~3세그먼트)과 꼭짓점 코너 캡을 연결해 닫힌 2-매니폴드 솔리드를 생성한다.
 */
export function applyMicroBevelChamfer(
  geometry: THREE.BufferGeometry,
  bevelWidthM: number,
  segments = 1,
  options: { readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  const width = Math.max(0.004, Number.isFinite(bevelWidthM) ? bevelWidthM : 0.04);
  const segCount = Math.max(1, Math.min(3, Math.round(segments)));
  const welded = weldBufferGeometryVertices(geometry);
  const triCount = welded.triangles.length;
  const triNormals = welded.triangles.map(([a, b, c]) =>
    triangleNormal(welded.vertices[a]!, welded.vertices[b]!, welded.vertices[c]!),
  );

  // 공유 엣지 기반 동일 평면 삼각형 클러스터링 -> 다각형 면 추출
  const edgeToTris = new Map<string, number[]>();
  welded.triangles.forEach(([a, b, c], tIdx) => {
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = u < v ? `${u}:${v}` : `${v}:${u}`;
      const list = edgeToTris.get(k) ?? [];
      list.push(tIdx);
      edgeToTris.set(k, list);
    }
  });

  const visited = new Uint8Array(triCount);
  const faces: Array<{ readonly normal: Vec3Tuple; readonly loop: number[] }> = [];

  for (let t = 0; t < triCount; t += 1) {
    if (visited[t]) continue;
    const refN = triNormals[t]!;
    const cluster: number[] = [];
    const queue = [t];
    visited[t] = 1;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      cluster.push(cur);
      const [a, b, c] = welded.triangles[cur]!;
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const neighbors = edgeToTris.get(u < v ? `${u}:${v}` : `${v}:${u}`) ?? [];
        for (const nb of neighbors) {
          if (!visited[nb] && dot3(refN, triNormals[nb]!) > 0.998) {
            visited[nb] = 1;
            queue.push(nb);
          }
        }
      }
    }

    const halfSet = new Set<string>();
    const halfList: Array<readonly [number, number]> = [];
    for (const cIdx of cluster) {
      const [a, b, c] = welded.triangles[cIdx]!;
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        halfSet.add(`${u}->${v}`);
        halfList.push([u, v]);
      }
    }
    const nextMap = new Map<number, number>();
    for (const [u, v] of halfList) {
      if (!halfSet.has(`${v}->${u}`)) nextMap.set(u, v);
    }
    const start = nextMap.keys().next().value as number | undefined;
    if (start === undefined) continue;
    const loop: number[] = [start];
    let curV = start;
    for (let guard = 0; guard < nextMap.size + 1; guard += 1) {
      const nxt = nextMap.get(curV);
      if (nxt === undefined || nxt === start) break;
      loop.push(nxt);
      curV = nxt;
    }
    if (loop.length >= 3) faces.push({ normal: refN, loop });
  }

  const outVerts: Vec3Tuple[] = [];
  const outTris: Array<readonly [number, number, number]> = [];
  const insetIdxByFaceVert = new Map<string, number>();

  // 1) 각 다각형 면의 인셋 꼭짓점 계산 및 면 삼각분할
  faces.forEach((face, fIdx) => {
    const nLen = face.loop.length;
    const insetLoopIds: number[] = [];
    for (let i = 0; i < nLen; i += 1) {
      const prevId = face.loop[(i - 1 + nLen) % nLen]!;
      const currId = face.loop[i]!;
      const nextId = face.loop[(i + 1) % nLen]!;
      const pPrev = welded.vertices[prevId]!;
      const pCurr = welded.vertices[currId]!;
      const pNext = welded.vertices[nextId]!;

      const vPrev = sub3(pPrev, pCurr);
      const vNext = sub3(pNext, pCurr);
      const lenPrev = Math.hypot(vPrev[0], vPrev[1], vPrev[2]) || 1;
      const lenNext = Math.hypot(vNext[0], vNext[1], vNext[2]) || 1;
      const ePrev = scale3(vPrev, 1 / lenPrev);
      const eNext = scale3(vNext, 1 / lenNext);
      const sinTheta = Math.max(0.25, Math.hypot(...cross3(ePrev, eNext)));
      const d = Math.min(width / sinTheta, lenPrev * 0.34, lenNext * 0.34);

      const insetPt = add3(pCurr, add3(scale3(ePrev, d), scale3(eNext, d)));
      const outId = outVerts.length;
      outVerts.push(insetPt);
      insetIdxByFaceVert.set(`${fIdx}:${currId}`, outId);
      insetLoopIds.push(outId);
    }

    const { u: bu, v: bv } = buildPlaneBasis(face.normal);
    const origin = outVerts[insetLoopIds[0]!]!;
    const pts2D: Vec2Tuple[] = insetLoopIds.map((id) => {
      const rel = sub3(outVerts[id]!, origin);
      return [dot3(rel, bu), dot3(rel, bv)] as const;
    });
    for (const [a, b, c] of triangulatePolygon2DEarClip(pts2D)) {
      outTris.push([insetLoopIds[a]!, insetLoopIds[b]!, insetLoopIds[c]!]);
    }
  });

  // 2) 모서리 베벨 스트립 (다중 세그먼트 베지어 라운드) + 꼭짓점 코너 링 수집
  const halfEdgeOwner = new Map<string, number>();
  faces.forEach((face, fIdx) => {
    for (let i = 0; i < face.loop.length; i += 1) {
      halfEdgeOwner.set(`${face.loop[i]}->${face.loop[(i + 1) % face.loop.length]}`, fIdx);
    }
  });

  const processedEdges = new Set<string>();
  const cornerStepsByVert = new Map<number, Map<number, readonly number[]>>();

  const recordCornerChain = (origVert: number, chainFromRightToLeft: readonly number[]): void => {
    let map = cornerStepsByVert.get(origVert);
    if (!map) {
      map = new Map();
      cornerStepsByVert.set(origVert, map);
    }
    map.set(chainFromRightToLeft[0]!, chainFromRightToLeft);
  };

  for (const [edgeKey, fLeft] of halfEdgeOwner.entries()) {
    const [uStr, vStr] = edgeKey.split("->");
    const u = Number(uStr);
    const v = Number(vStr);
    const undir = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (processedEdges.has(undir)) continue;
    const fRight = halfEdgeOwner.get(`${v}->${u}`);
    if (fRight === undefined) continue;
    processedEdges.add(undir);

    const pLu = insetIdxByFaceVert.get(`${fLeft}:${u}`)!;
    const pLv = insetIdxByFaceVert.get(`${fLeft}:${v}`)!;
    const pRu = insetIdxByFaceVert.get(`${fRight}:${u}`)!;
    const pRv = insetIdxByFaceVert.get(`${fRight}:${v}`)!;
    const ctrlU = welded.vertices[u]!;
    const ctrlV = welded.vertices[v]!;

    const chainU: number[] = [pLu];
    const chainV: number[] = [pLv];
    for (let s = 1; s < segCount; s += 1) {
      const t = s / segCount;
      const mt = 1 - t;
      const a0 = outVerts[pLu]!;
      const b0 = outVerts[pRu]!;
      const midU: Vec3Tuple = [
        mt * mt * a0[0] + 2 * mt * t * ctrlU[0] + t * t * b0[0],
        mt * mt * a0[1] + 2 * mt * t * ctrlU[1] + t * t * b0[1],
        mt * mt * a0[2] + 2 * mt * t * ctrlU[2] + t * t * b0[2],
      ];
      chainU.push(outVerts.length);
      outVerts.push(midU);

      const a1 = outVerts[pLv]!;
      const b1 = outVerts[pRv]!;
      const midV: Vec3Tuple = [
        mt * mt * a1[0] + 2 * mt * t * ctrlV[0] + t * t * b1[0],
        mt * mt * a1[1] + 2 * mt * t * ctrlV[1] + t * t * b1[1],
        mt * mt * a1[2] + 2 * mt * t * ctrlV[2] + t * t * b1[2],
      ];
      chainV.push(outVerts.length);
      outVerts.push(midV);
    }
    chainU.push(pRu);
    chainV.push(pRv);

    for (let s = 0; s < segCount; s += 1) {
      const uA = chainU[s]!;
      const vA = chainV[s]!;
      const uB = chainU[s + 1]!;
      const vB = chainV[s + 1]!;
      // 좌면 엣지(uA->vA)를 역방향(vA->uA)으로 짝짓는다.
      outTris.push([vA, uA, uB], [vA, uB, vB]);
    }

    // 꼭짓점 u의 코너 링은 pRu -> ... -> pLu, 꼭짓점 v의 코너 링은 pLv -> ... -> pRv 순서로 반전 짝짓기
    recordCornerChain(u, [...chainU].reverse());
    recordCornerChain(v, [...chainV]);
  }

  // 3) 꼭짓점 코너 캡 봉합
  for (const [, stepMap] of cornerStepsByVert.entries()) {
    const firstKey = stepMap.keys().next().value as number | undefined;
    if (firstKey === undefined) continue;
    const ring: number[] = [];
    let curr = firstKey;
    const seen = new Set<number>();
    while (!seen.has(curr)) {
      seen.add(curr);
      const chain = stepMap.get(curr);
      if (!chain || chain.length < 2) break;
      for (let i = 0; i < chain.length - 1; i += 1) ring.push(chain[i]!);
      curr = chain[chain.length - 1]!;
    }
    if (ring.length === 3) {
      outTris.push([ring[0]!, ring[1]!, ring[2]!]);
    } else if (ring.length > 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const idx of ring) {
        cx += outVerts[idx]![0];
        cy += outVerts[idx]![1];
        cz += outVerts[idx]![2];
      }
      const centerIdx = outVerts.length;
      outVerts.push([cx / ring.length, cy / ring.length, cz / ring.length]);
      for (let i = 0; i < ring.length; i += 1) {
        outTris.push([centerIdx, ring[i]!, ring[(i + 1) % ring.length]!]);
      }
    }
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(outVerts, outTris, { computeSmoothNormals: false });
  return wrapModelingResult(
    "micro-bevel",
    "모서리 다듬기",
    outGeo,
    `미세 베벨 ${round4(width * 1000)}mm · ${segCount}세그먼트 적용 완료`,
    options.groundAtY0 ?? true,
  );
}

// ── 6. Blender 축 대칭 미러 ──────────────────────────────────────────────────

/**
 * Blender 축 대칭 미러(Mirror Modifier):
 * 선택적 미러 평면 클리핑 후 지정 축(`x` | `y` | `z`) 기준 반사 정점과
 * 반전 와인딩 삼각형을 생성하고 경계 심 정점을 용접해 매니폴드 대칭 솔리드를 만든다.
 */
export function applySymmetricMirrorGeometry(
  geometry: THREE.BufferGeometry,
  axis: ModelingAxis = "x",
  options: { readonly pivot?: number; readonly clipAcrossPlane?: boolean; readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  const pivot = Number.isFinite(options.pivot) ? (options.pivot as number) : 0;
  const axisIdx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  let sourceGeo = geometry;
  let tempSliced: SectionPlaneSliceResult | null = null;

  try {
    if (options.clipAcrossPlane ?? true) {
      const planeNormal: Vec3Tuple = axis === "x" ? [-1, 0, 0] : axis === "y" ? [0, -1, 0] : [0, 0, -1];
      // kept side: dot(planeNormal, p) + pivot <= 0 => coord >= pivot
      tempSliced = sliceGeometryWithSectionPlane(
        geometry,
        { normal: planeNormal, constant: pivot },
        { generateCap: false, groundAtY0: false },
      );
      if (tempSliced.manifold.triangleCount > 0) {
        sourceGeo = tempSliced.geometry;
      }
    }

    const welded = weldBufferGeometryVertices(sourceGeo);
    const outVerts: Vec3Tuple[] = [];
    const vertMap = new Map<string, number>();
    const addVert = (p: Vec3Tuple): number => {
      const key = quantKey3(p, 1e3);
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;
      const idx = outVerts.length;
      vertMap.set(key, idx);
      outVerts.push(p);
      return idx;
    };

    const outTris: Array<readonly [number, number, number]> = [];
    const mirrorPoint = (p: Vec3Tuple): Vec3Tuple => {
      const copy: [number, number, number] = [p[0], p[1], p[2]];
      copy[axisIdx] = 2 * pivot - copy[axisIdx];
      return copy;
    };

    for (const [a, b, c] of welded.triangles) {
      const va = welded.vertices[a]!;
      const vb = welded.vertices[b]!;
      const vc = welded.vertices[c]!;
      // 원본 절반
      outTris.push([addVert(va), addVert(vb), addVert(vc)]);
      // 미러 절반 (법선 외향 유지를 위해 b↔c 와인딩 반전)
      const ma = addVert(mirrorPoint(va));
      const mb = addVert(mirrorPoint(vb));
      const mc = addVert(mirrorPoint(vc));
      outTris.push([ma, mc, mb]);
    }

    const outGeo = buildBufferGeometryFromIndexedMesh(outVerts, outTris, { computeSmoothNormals: false });
    return wrapModelingResult(
      "symmetric-mirror",
      "좌우 대칭",
      outGeo,
      `${axis.toUpperCase()}축 대칭 미러(피벗 ${round4(pivot)}m) 완료`,
      options.groundAtY0 ?? true,
    );
  } finally {
    tempSliced?.dispose();
  }
}

// ── 7. Blender Catmull-Clark / Loop 세분화 ───────────────────────────────────

function runSingleLoopSubdivisionPass(
  vertices: readonly Vec3Tuple[],
  triangles: readonly (readonly [number, number, number])[],
): { readonly vertices: Vec3Tuple[]; readonly triangles: Array<readonly [number, number, number]> } {
  const edgeOpposites = new Map<string, number[]>();
  const neighbors = vertices.map(() => new Set<number>());

  for (const [a, b, c] of triangles) {
    neighbors[a]!.add(b);
    neighbors[a]!.add(c);
    neighbors[b]!.add(a);
    neighbors[b]!.add(c);
    neighbors[c]!.add(a);
    neighbors[c]!.add(b);
    for (const [u, v, opp] of [[a, b, c], [b, c, a], [c, a, b]] as const) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const list = edgeOpposites.get(key) ?? [];
      list.push(opp);
      edgeOpposites.set(key, list);
    }
  }

  // 기존 정점 위치 갱신 (Charles Loop 가중치)
  const nextVerts: Vec3Tuple[] = vertices.map((v, idx) => {
    const ring = neighbors[idx]!;
    const n = ring.size;
    if (n === 0) return v;
    const beta =
      n === 3
        ? 3 / 16
        : (1 / n) * (5 / 8 - Math.pow(3 / 8 + 0.25 * Math.cos((2 * Math.PI) / n), 2));
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const nb of ring) {
      sx += vertices[nb]![0];
      sy += vertices[nb]![1];
      sz += vertices[nb]![2];
    }
    const selfW = 1 - n * beta;
    return [selfW * v[0] + beta * sx, selfW * v[1] + beta * sy, selfW * v[2] + beta * sz];
  });

  // 엣지 중점 생성
  const edgeMidIdx = new Map<string, number>();
  const getEdgeMid = (u: number, v: number): number => {
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    const existing = edgeMidIdx.get(key);
    if (existing !== undefined) return existing;
    const opps = edgeOpposites.get(key) ?? [];
    const vu = vertices[u]!;
    const vv = vertices[v]!;
    let mid: Vec3Tuple;
    if (opps.length === 2) {
      const w0 = vertices[opps[0]!]!;
      const w1 = vertices[opps[1]!]!;
      mid = [
        0.375 * (vu[0] + vv[0]) + 0.125 * (w0[0] + w1[0]),
        0.375 * (vu[1] + vv[1]) + 0.125 * (w0[1] + w1[1]),
        0.375 * (vu[2] + vv[2]) + 0.125 * (w0[2] + w1[2]),
      ];
    } else {
      mid = [0.5 * (vu[0] + vv[0]), 0.5 * (vu[1] + vv[1]), 0.5 * (vu[2] + vv[2])];
    }
    const idx = nextVerts.length;
    nextVerts.push(mid);
    edgeMidIdx.set(key, idx);
    return idx;
  };

  const nextTris: Array<readonly [number, number, number]> = [];
  for (const [a, b, c] of triangles) {
    const ab = getEdgeMid(a, b);
    const bc = getEdgeMid(b, c);
    const ca = getEdgeMid(c, a);
    nextTris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return { vertices: nextVerts, triangles: nextTris };
}

function runSingleCatmullClarkPass(
  vertices: readonly Vec3Tuple[],
  triangles: readonly (readonly [number, number, number])[],
): { readonly vertices: Vec3Tuple[]; readonly triangles: Array<readonly [number, number, number]> } {
  const facePoints: Vec3Tuple[] = triangles.map(([a, b, c]) => {
    const va = vertices[a]!;
    const vb = vertices[b]!;
    const vc = vertices[c]!;
    return [(va[0] + vb[0] + vc[0]) / 3, (va[1] + vb[1] + vc[1]) / 3, (va[2] + vb[2] + vc[2]) / 3];
  });

  const edgeFaces = new Map<string, number[]>();
  const vertFaces = vertices.map(() => [] as number[]);
  const vertEdges = vertices.map(() => new Set<string>());

  triangles.forEach(([a, b, c], fIdx) => {
    vertFaces[a]!.push(fIdx);
    vertFaces[b]!.push(fIdx);
    vertFaces[c]!.push(fIdx);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = u < v ? `${u}:${v}` : `${v}:${u}`;
      const list = edgeFaces.get(k) ?? [];
      list.push(fIdx);
      edgeFaces.set(k, list);
      vertEdges[u]!.add(k);
      vertEdges[v]!.add(k);
    }
  });

  // Catmull-Clark 정점 갱신: (avgF + 2*avgR + (n-3)*P) / n
  const nextVerts: Vec3Tuple[] = vertices.map((p, vIdx) => {
    const fList = vertFaces[vIdx]!;
    const eSet = vertEdges[vIdx]!;
    const n = fList.length;
    if (n === 0 || eSet.size === 0) return p;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (const fIdx of fList) {
      fx += facePoints[fIdx]![0];
      fy += facePoints[fIdx]![1];
      fz += facePoints[fIdx]![2];
    }
    fx /= n;
    fy /= n;
    fz /= n;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    for (const eKey of eSet) {
      const [uStr, vStr] = eKey.split(":");
      const vu = vertices[Number(uStr)]!;
      const vv = vertices[Number(vStr)]!;
      rx += 0.5 * (vu[0] + vv[0]);
      ry += 0.5 * (vu[1] + vv[1]);
      rz += 0.5 * (vu[2] + vv[2]);
    }
    rx /= eSet.size;
    ry /= eSet.size;
    rz /= eSet.size;
    return [
      (fx + 2 * rx + (n - 3) * p[0]) / n,
      (fy + 2 * ry + (n - 3) * p[1]) / n,
      (fz + 2 * rz + (n - 3) * p[2]) / n,
    ];
  });

  const facePointStartIdx = nextVerts.length;
  for (const fp of facePoints) nextVerts.push(fp);

  const edgePointIdx = new Map<string, number>();
  for (const [k, fList] of edgeFaces.entries()) {
    const [uStr, vStr] = k.split(":");
    const vu = vertices[Number(uStr)]!;
    const vv = vertices[Number(vStr)]!;
    let ep: Vec3Tuple;
    if (fList.length === 2) {
      const f0 = facePoints[fList[0]!]!;
      const f1 = facePoints[fList[1]!]!;
      ep = [
        0.25 * (vu[0] + vv[0] + f0[0] + f1[0]),
        0.25 * (vu[1] + vv[1] + f0[1] + f1[1]),
        0.25 * (vu[2] + vv[2] + f0[2] + f1[2]),
      ];
    } else {
      ep = [0.5 * (vu[0] + vv[0]), 0.5 * (vu[1] + vv[1]), 0.5 * (vu[2] + vv[2])];
    }
    edgePointIdx.set(k, nextVerts.length);
    nextVerts.push(ep);
  }

  const getEp = (u: number, v: number): number => edgePointIdx.get(u < v ? `${u}:${v}` : `${v}:${u}`)!;
  const nextTris: Array<readonly [number, number, number]> = [];
  triangles.forEach(([a, b, c], fIdx) => {
    const fp = facePointStartIdx + fIdx;
    const eab = getEp(a, b);
    const ebc = getEp(b, c);
    const eca = getEp(c, a);
    // 3개 서브-쿼드를 6개 삼각형으로 분할 (내부/외부 하프엣지 완전 대칭)
    nextTris.push([a, eab, fp], [a, fp, eca]);
    nextTris.push([b, ebc, fp], [b, fp, eab]);
    nextTris.push([c, eca, fp], [c, fp, ebc]);
  });

  return { vertices: nextVerts, triangles: nextTris };
}

/**
 * Blender Catmull-Clark / Loop 세분화: 매니폴드 곡면을 단계별(`1..3`)로 부드럽게 세분화한다.
 */
export function subdivideGeometrySmooth(
  geometry: THREE.BufferGeometry,
  iterations = 1,
  scheme: SubdivisionScheme = "loop",
  options: { readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  const passes = Math.max(1, Math.min(3, Math.round(iterations)));
  const welded = weldBufferGeometryVertices(geometry);
  let verts: readonly Vec3Tuple[] = welded.vertices;
  let tris: readonly (readonly [number, number, number])[] = welded.triangles;

  for (let i = 0; i < passes; i += 1) {
    const next = scheme === "catmull-clark"
      ? runSingleCatmullClarkPass(verts, tris)
      : runSingleLoopSubdivisionPass(verts, tris);
    verts = next.vertices;
    tris = next.triangles;
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(verts, tris, { computeSmoothNormals: true });
  return wrapModelingResult(
    "subdivide-smooth",
    "부드럽게 세분화",
    outGeo,
    `${scheme === "catmull-clark" ? "Catmull-Clark" : "Loop"} ${passes}단계 세분화 (${tris.length} 트라이앵글)`,
    options.groundAtY0 ?? true,
  );
}

// ── 8. CSG 복셀 기반 불리언 차집합·합집합·교집합 ────────────────────────────

/**
 * CSG 바운딩/복셀 기반 불리언 차집합(`subtract`) · 합집합(`union`) · 교집합(`intersect`):
 * 레이캐스트 내부 판정과 핀치 엣지 매니폴드 치유를 거쳐 0 비다양체 솔리드를 생성한다.
 */
export function applyBooleanMeshOperation(
  targetGeometry: THREE.BufferGeometry,
  cutterGeometry: THREE.BufferGeometry,
  operation: BooleanOperationKind,
  options: { readonly resolution?: number; readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  const res = Math.max(8, Math.min(22, Math.round(options.resolution ?? 14)));
  const meshA = weldBufferGeometryVertices(targetGeometry);
  const meshB = weldBufferGeometryVertices(cutterGeometry);

  targetGeometry.computeBoundingBox();
  cutterGeometry.computeBoundingBox();
  const box = new THREE.Box3();
  if (targetGeometry.boundingBox) box.union(targetGeometry.boundingBox);
  if (cutterGeometry.boundingBox) box.union(cutterGeometry.boundingBox);

  const size = box.getSize(new THREE.Vector3());
  const padX = Math.max(0.02, size.x / res);
  const padY = Math.max(0.02, size.y / res);
  const padZ = Math.max(0.02, size.z / res);
  const minX = box.min.x - padX;
  const minY = box.min.y - padY;
  const minZ = box.min.z - padZ;
  const stepX = (size.x + padX * 2) / res;
  const stepY = (size.y + padY * 2) / res;
  const stepZ = (size.z + padZ * 2) / res;

  const grid = new Uint8Array(res * res * res);
  const idxOf = (x: number, y: number, z: number): number => (z * res + y) * res + x;
  const at = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= res || y >= res || z >= res ? 0 : grid[idxOf(x, y, z)]!;

  for (let z = 0; z < res; z += 1) {
    const cz = minZ + (z + 0.5) * stepZ;
    for (let y = 0; y < res; y += 1) {
      const cy = minY + (y + 0.5) * stepY;
      for (let x = 0; x < res; x += 1) {
        const cx = minX + (x + 0.5) * stepX;
        const inA = isPointInsideWeldedMesh([cx, cy, cz], meshA);
        const inB = isPointInsideWeldedMesh([cx, cy, cz], meshB);
        const filled =
          operation === "union" ? inA || inB : operation === "subtract" ? inA && !inB : inA && inB;
        grid[idxOf(x, y, z)] = filled ? 1 : 0;
      }
    }
  }

  // 비다양체 핀치 엣지(체커보드 2x2 대각선 접촉) 치유 패스
  for (let pass = 0; pass < 4; pass += 1) {
    let healed = 0;
    for (let z = 0; z < res - 1; z += 1) {
      for (let y = 0; y < res - 1; y += 1) {
        for (let x = 0; x < res - 1; x += 1) {
          // XY 평면 핀치
          if (at(x, y, z) && at(x + 1, y + 1, z) && !at(x + 1, y, z) && !at(x, y + 1, z)) {
            grid[idxOf(x + 1, y, z)] = 1;
            healed += 1;
          } else if (!at(x, y, z) && !at(x + 1, y + 1, z) && at(x + 1, y, z) && at(x, y + 1, z)) {
            grid[idxOf(x, y, z)] = 1;
            healed += 1;
          }
          // XZ 평면 핀치
          if (at(x, y, z) && at(x + 1, y, z + 1) && !at(x + 1, y, z) && !at(x, y, z + 1)) {
            grid[idxOf(x + 1, y, z)] = 1;
            healed += 1;
          } else if (!at(x, y, z) && !at(x + 1, y, z + 1) && at(x + 1, y, z) && at(x, y, z + 1)) {
            grid[idxOf(x, y, z)] = 1;
            healed += 1;
          }
          // YZ 평면 핀치
          if (at(x, y, z) && at(x, y + 1, z + 1) && !at(x, y + 1, z) && !at(x, y, z + 1)) {
            grid[idxOf(x, y + 1, z)] = 1;
            healed += 1;
          } else if (!at(x, y, z) && !at(x, y + 1, z + 1) && at(x, y + 1, z) && at(x, y, z + 1)) {
            grid[idxOf(x, y, z)] = 1;
            healed += 1;
          }
        }
      }
    }
    if (healed === 0) break;
  }

  const outVerts: Vec3Tuple[] = [];
  const cornerMap = new Map<string, number>();
  const getCorner = (ix: number, iy: number, iz: number): number => {
    const key = `${ix}:${iy}:${iz}`;
    const existing = cornerMap.get(key);
    if (existing !== undefined) return existing;
    const id = outVerts.length;
    cornerMap.set(key, id);
    outVerts.push([minX + ix * stepX, minY + iy * stepY, minZ + iz * stepZ]);
    return id;
  };

  const outTris: Array<readonly [number, number, number]> = [];
  const pushQuad = (a: number, b: number, c: number, dIdx: number): void => {
    outTris.push([a, b, c], [a, c, dIdx]);
  };

  for (let z = 0; z < res; z += 1) {
    for (let y = 0; y < res; y += 1) {
      for (let x = 0; x < res; x += 1) {
        if (!at(x, y, z)) continue;
        if (!at(x + 1, y, z)) {
          pushQuad(getCorner(x + 1, y, z + 1), getCorner(x + 1, y, z), getCorner(x + 1, y + 1, z), getCorner(x + 1, y + 1, z + 1));
        }
        if (!at(x - 1, y, z)) {
          pushQuad(getCorner(x, y, z), getCorner(x, y, z + 1), getCorner(x, y + 1, z + 1), getCorner(x, y + 1, z));
        }
        if (!at(x, y + 1, z)) {
          pushQuad(getCorner(x, y + 1, z + 1), getCorner(x + 1, y + 1, z + 1), getCorner(x + 1, y + 1, z), getCorner(x, y + 1, z));
        }
        if (!at(x, y - 1, z)) {
          pushQuad(getCorner(x, y, z), getCorner(x + 1, y, z), getCorner(x + 1, y, z + 1), getCorner(x, y, z + 1));
        }
        if (!at(x, y, z + 1)) {
          pushQuad(getCorner(x, y, z + 1), getCorner(x + 1, y, z + 1), getCorner(x + 1, y + 1, z + 1), getCorner(x, y + 1, z + 1));
        }
        if (!at(x, y, z - 1)) {
          pushQuad(getCorner(x + 1, y, z), getCorner(x, y, z), getCorner(x, y + 1, z), getCorner(x + 1, y + 1, z));
        }
      }
    }
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(outVerts, outTris, { computeSmoothNormals: false });
  const opLabel = operation === "subtract" ? "차집합" : operation === "union" ? "합집합" : "교집합";
  return wrapModelingResult(
    `boolean-${operation}`,
    `불리언 ${opLabel}`,
    outGeo,
    `CSG 복셀 불리언 ${opLabel}(해상도 ${res}³) 완료`,
    options.groundAtY0 ?? true,
  );
}

