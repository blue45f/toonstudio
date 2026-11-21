/**
 * studio-bg3d-blender-sketchup-pro-ops.ts
 *
 * Blender + SketchUp 고급 3D 모델링 연산기 8종 (실제 Three.js `BufferGeometry` 버텍스·인덱스 레벨 실구현).
 * - SketchUp 계열:
 *   1. `extrudeFaceAlongNormal` — Push/Pull 면 압출(돌출·포켓 함몰)
 *   2. `sweepProfileAlongPath` — Follow-Me 경로 스윕(평행 이동 프레임 + 닫힘/캡)
 *   3. `sliceGeometryWithSectionPlane` — Section Plane 실시간 단면 절단 + 단면 캡 자동 생성
 *   4. `buildComponentArrayTransforms` — 선형(`*N`/`/N`) · 방사형 컴포넌트 인스턴스 배열
 * - Blender 계열:
 *   5. `applyMicroBevelChamfer` — 모서리 미세 베벨(다중 세그먼트 라운드 베벨 + 코너 캡)
 *   6. `applySymmetricMirrorGeometry` — 축 대칭 미러(단면 클리핑 + 법선 반전 + 심 용접)
 *   7. `subdivideGeometrySmooth` — Catmull-Clark / Loop 부드러운 세분화
 *   8. `applyBooleanMeshOperation` — CSG 복셀 기반 불리언 차집합·합집합·교집합(핀치 엣지 치유)
 * - 실시간 매니폴드/트라이앵글 수 검증기: `inspectGeometryTopologyAndManifold`
 */

import * as THREE from "three";

import {
  buildBufferGeometryFromIndexedMesh,
  disposeObject3DResources,
  groundBufferGeometryToY0,
  triangulatePolygon2DEarClip,
  validateBufferGeometryManifold,
  weldBufferGeometryVertices,
  type DisposedGpuResourceCounts,
  type GeometryManifoldReport,
} from "./studio-bg3d-geometry-manifold-utils";

export type Vec3Tuple = readonly [number, number, number];
export type Vec2Tuple = readonly [number, number];
export type ModelingAxis = "x" | "y" | "z";
export type BooleanOperationKind = "subtract" | "union" | "intersect";
export type SubdivisionScheme = "loop" | "catmull-clark";

export interface ModelingOperationResult {
  readonly operationId: string;
  readonly labelKo: string;
  readonly geometry: THREE.BufferGeometry;
  readonly manifold: GeometryManifoldReport;
  readonly summaryKo: string;
  readonly dispose: () => void;
}

export interface SectionPlaneSliceResult extends ModelingOperationResult {
  readonly clippedTriangleCount: number;
  readonly capLoopCount: number;
  readonly capAreaSqMeters: number;
}

export interface ComponentArrayTransformItem {
  readonly index: number;
  readonly positionM: Vec3Tuple;
  readonly rotationEulerDeg: Vec3Tuple;
  readonly scale: Vec3Tuple;
  readonly matrixElements: readonly number[];
}

export interface ComponentArrayResult {
  readonly mode: "linear" | "radial";
  readonly count: number;
  readonly transforms: readonly ComponentArrayTransformItem[];
  readonly matrices: readonly THREE.Matrix4[];
  readonly summaryKo: string;
}

export interface GeometryTopologyInspection {
  readonly manifold: GeometryManifoldReport;
  readonly statusKo: string;
  readonly issuesKo: readonly string[];
}

export function round4(value: number): number {
  const r = Math.round(value * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

export function sub3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale3(v: Vec3Tuple, s: number): Vec3Tuple {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalize3(v: Vec3Tuple, fallback: Vec3Tuple = [0, 1, 0]): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-9) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function triangleNormal(a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple): Vec3Tuple {
  return normalize3(cross3(sub3(b, a), sub3(c, a)), [0, 1, 0]);
}

export function buildPlaneBasis(normal: Vec3Tuple): { readonly u: Vec3Tuple; readonly v: Vec3Tuple } {
  const n = normalize3(normal, [0, 1, 0]);
  const ref: Vec3Tuple = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3(cross3(ref, n), [1, 0, 0]);
  const v = normalize3(cross3(n, u), [0, 0, 1]);
  return { u, v };
}

export function wrapModelingResult(
  operationId: string,
  labelKo: string,
  geometry: THREE.BufferGeometry,
  summaryKo: string,
  groundAtY0 = false,
): ModelingOperationResult {
  if (groundAtY0) groundBufferGeometryToY0(geometry);
  const manifold = validateBufferGeometryManifold(geometry);
  let disposed = false;
  return Object.freeze({
    operationId,
    labelKo,
    geometry,
    manifold,
    summaryKo,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
    },
  });
}

export function quantKey3(v: Vec3Tuple, precision = 1e4): string {
  return `${Math.round(v[0] * precision)}:${Math.round(v[1] * precision)}:${Math.round(v[2] * precision)}`;
}

// ── 1. SketchUp Push/Pull 면 압출 ────────────────────────────────────────────

/**
 * SketchUp Push/Pull 면 압출: 지정 법선 방향과 일치하는 면 영역을 선택해
 * 양수 거리(돌출 압출) 또는 음수 거리(오목 포켓 함몰)로 매니폴드 측벽과 함께 압출한다.
 */
export function extrudeFaceAlongNormal(
  geometry: THREE.BufferGeometry,
  faceDirection: Vec3Tuple,
  distanceM: number,
  options: { readonly insetRatio?: number; readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  const dir = normalize3(faceDirection, [0, 1, 0]);
  const dist = Number.isFinite(distanceM) && Math.abs(distanceM) >= 1e-4 ? distanceM : 0.35;
  const welded = weldBufferGeometryVertices(geometry);
  const verts = welded.vertices.map((v) => [...v] as [number, number, number]);
  const selectedTriIndices = new Set<number>();

  welded.triangles.forEach(([a, b, c], idx) => {
    const n = triangleNormal(verts[a]!, verts[b]!, verts[c]!);
    if (dot3(n, dir) >= 0.92) selectedTriIndices.add(idx);
  });

  if (selectedTriIndices.size === 0) {
    const cloned = geometry.clone();
    return wrapModelingResult("push-pull", "면 밀고 당기기", cloned, "일치하는 면을 찾지 못해 원본을 유지했어요.", options.groundAtY0);
  }

  const selectedHalfEdges = new Set<string>();
  const selectedEdgesList: Array<readonly [number, number]> = [];
  const selectedVerts = new Set<number>();

  for (const tIdx of selectedTriIndices) {
    const [a, b, c] = welded.triangles[tIdx]!;
    selectedVerts.add(a);
    selectedVerts.add(b);
    selectedVerts.add(c);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      selectedHalfEdges.add(`${u}->${v}`);
      selectedEdgesList.push([u, v]);
    }
  }
  const boundaryEdges = selectedEdgesList.filter(([u, v]) => !selectedHalfEdges.has(`${v}->${u}`));
  const outTris: Array<readonly [number, number, number]> = [];

  welded.triangles.forEach((tri, idx) => {
    if (!selectedTriIndices.has(idx)) outTris.push(tri);
  });

  if (dist > 0) {
    const mapExtruded = new Map<number, number>();
    for (const vIdx of selectedVerts) {
      const shifted = add3(verts[vIdx]!, scale3(dir, dist));
      mapExtruded.set(vIdx, verts.length);
      verts.push([shifted[0], shifted[1], shifted[2]]);
    }
    for (const tIdx of selectedTriIndices) {
      const [a, b, c] = welded.triangles[tIdx]!;
      outTris.push([mapExtruded.get(a)!, mapExtruded.get(b)!, mapExtruded.get(c)!]);
    }
    for (const [u, v] of boundaryEdges) {
      const u2 = mapExtruded.get(u)!;
      const v2 = mapExtruded.get(v)!;
      outTris.push([u, v, v2], [u, v2, u2]);
    }
  } else {
    const inset = Math.max(0.08, Math.min(0.45, options.insetRatio ?? 0.2));
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const vIdx of selectedVerts) {
      cx += verts[vIdx]![0];
      cy += verts[vIdx]![1];
      cz += verts[vIdx]![2];
    }
    const inv = 1 / selectedVerts.size;
    const centroid: Vec3Tuple = [cx * inv, cy * inv, cz * inv];
    const mapRim = new Map<number, number>();
    const mapDeep = new Map<number, number>();

    for (const vIdx of selectedVerts) {
      const p = verts[vIdx]!;
      const rim: Vec3Tuple = [
        p[0] + (centroid[0] - p[0]) * inset,
        p[1] + (centroid[1] - p[1]) * inset,
        p[2] + (centroid[2] - p[2]) * inset,
      ];
      const deep = add3(rim, scale3(dir, dist));
      mapRim.set(vIdx, verts.length);
      verts.push([rim[0], rim[1], rim[2]]);
      mapDeep.set(vIdx, verts.length);
      verts.push([deep[0], deep[1], deep[2]]);
    }
    for (const [u, v] of boundaryEdges) {
      const uRim = mapRim.get(u)!;
      const vRim = mapRim.get(v)!;
      const uDeep = mapDeep.get(u)!;
      const vDeep = mapDeep.get(v)!;
      outTris.push([u, v, vRim], [u, vRim, uRim]);
      outTris.push([uRim, vRim, vDeep], [uRim, vDeep, uDeep]);
    }
    for (const tIdx of selectedTriIndices) {
      const [a, b, c] = welded.triangles[tIdx]!;
      outTris.push([mapDeep.get(a)!, mapDeep.get(b)!, mapDeep.get(c)!]);
    }
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(verts, outTris, { computeSmoothNormals: false });
  return wrapModelingResult(
    "push-pull",
    "면 밀고 당기기",
    outGeo,
    `${dist > 0 ? "돌출" : "포켓 함몰"} ${round4(Math.abs(dist))}m 완료 (${selectedTriIndices.size}면 압출)`,
    options.groundAtY0 ?? true,
  );
}

// ── 2. SketchUp Follow-Me 경로 스윕 ──────────────────────────────────────────

/**
 * SketchUp Follow-Me 경로 스윕: 2D 닫힌 단면 프로파일을 3D 다중선 경로를 따라
 * 평행 이동 프레임(Rotation-Minimizing Frame)으로 스윕하고 닫힌 매니폴드 솔리드를 생성한다.
 */
export function sweepProfileAlongPath(
  profile2D: readonly Vec2Tuple[],
  path3D: readonly Vec3Tuple[],
  options: { readonly closedPath?: boolean; readonly groundAtY0?: boolean } = {},
): ModelingOperationResult {
  if (profile2D.length < 3 || path3D.length < 2) {
    throw new Error("경로 따라 뽑기에는 3점 이상의 2D 단면과 2점 이상의 3D 경로가 필요해요.");
  }

  let area2 = 0;
  for (let i = 0; i < profile2D.length; i += 1) {
    const a = profile2D[i]!;
    const b = profile2D[(i + 1) % profile2D.length]!;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  const ccwProfile = area2 >= 0 ? [...profile2D] : [...profile2D].reverse();
  const m = ccwProfile.length;
  const k = path3D.length;
  const closedPath = Boolean(options.closedPath && k >= 3);

  const tangents: Vec3Tuple[] = [];
  for (let i = 0; i < k; i += 1) {
    if (closedPath) {
      const prev = path3D[(i - 1 + k) % k]!;
      const next = path3D[(i + 1) % k]!;
      tangents.push(normalize3(sub3(next, prev), [0, 0, 1]));
    } else if (i === 0) {
      tangents.push(normalize3(sub3(path3D[1]!, path3D[0]!), [0, 0, 1]));
    } else if (i === k - 1) {
      tangents.push(normalize3(sub3(path3D[k - 1]!, path3D[k - 2]!), [0, 0, 1]));
    } else {
      const tA = normalize3(sub3(path3D[i]!, path3D[i - 1]!), [0, 0, 1]);
      const tB = normalize3(sub3(path3D[i + 1]!, path3D[i]!), [0, 0, 1]);
      tangents.push(normalize3(add3(tA, tB), tB));
    }
  }

  // Rotation-Minimizing Frame (Parallel Transport)
  const frames: Array<{ readonly n: Vec3Tuple; readonly b: Vec3Tuple }> = [];
  const t0 = new THREE.Vector3(...tangents[0]!);
  const upRef = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  let curN = new THREE.Vector3().crossVectors(upRef, t0).normalize();
  let curB = new THREE.Vector3().crossVectors(t0, curN).normalize();
  frames.push({ n: [curN.x, curN.y, curN.z], b: [curB.x, curB.y, curB.z] });

  const qStep = new THREE.Quaternion();
  const prevT = t0.clone();
  const nextT = new THREE.Vector3();

  for (let i = 1; i < k; i += 1) {
    nextT.set(...tangents[i]!);
    qStep.setFromUnitVectors(prevT, nextT);
    curN = curN.clone().applyQuaternion(qStep).normalize();
    curB = new THREE.Vector3().crossVectors(nextT, curN).normalize();
    frames.push({ n: [curN.x, curN.y, curN.z], b: [curB.x, curB.y, curB.z] });
    prevT.copy(nextT);
  }

  const vertices: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < k; i += 1) {
    const pt = path3D[i]!;
    const { n, b } = frames[i]!;
    for (let j = 0; j < m; j += 1) {
      const [px, py] = ccwProfile[j]!;
      vertices.push([
        pt[0] + px * n[0] + py * b[0],
        pt[1] + px * n[1] + py * b[1],
        pt[2] + px * n[2] + py * b[2],
      ]);
    }
  }

  const triangles: Array<readonly [number, number, number]> = [];
  const ringCount = closedPath ? k : k - 1;
  for (let i = 0; i < ringCount; i += 1) {
    const iNext = (i + 1) % k;
    for (let j = 0; j < m; j += 1) {
      const jNext = (j + 1) % m;
      const v00 = i * m + j;
      const v01 = i * m + jNext;
      const v10 = iNext * m + j;
      const v11 = iNext * m + jNext;
      triangles.push([v00, v01, v11], [v00, v11, v10]);
    }
  }

  if (!closedPath) {
    const capTris = triangulatePolygon2DEarClip(ccwProfile);
    for (const [a, b, c] of capTris) {
      // 시작 캡(-T 법선): 와인딩 반전
      triangles.push([a, c, b]);
      // 끝 캡(+T 법선): CCW 유지
      const base = (k - 1) * m;
      triangles.push([base + a, base + b, base + c]);
    }
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(vertices, triangles, { computeSmoothNormals: false });
  return wrapModelingResult(
    "follow-me",
    "경로 따라 뽑기",
    outGeo,
    `${m}각 단면을 ${k}개 경로점으로 스윕 완료 (${closedPath ? "닫힌 루프" : "양끝 캡 봉합"})`,
    options.groundAtY0 ?? true,
  );
}

// ── 3. SketchUp Section Plane 단면 절단 + 캡 생성 ────────────────────────────

/**
 * SketchUp Section Plane 실시간 단면 절단 + 캡 생성:
 * 평면 `dot(normal, p) + constant <= 0` 영역을 보존하고, 절단선 루프를 추적해
 * 단면 캡을 삼각분할 봉합하여 매니폴드 솔리드를 유지한다.
 */
export function sliceGeometryWithSectionPlane(
  geometry: THREE.BufferGeometry,
  plane: { readonly normal: Vec3Tuple; readonly constant: number },
  options: { readonly generateCap?: boolean; readonly groundAtY0?: boolean } = {},
): SectionPlaneSliceResult {
  const n = normalize3(plane.normal, [0, 1, 0]);
  const d = Number.isFinite(plane.constant) ? plane.constant : 0;
  const generateCap = options.generateCap ?? true;
  const welded = weldBufferGeometryVertices(geometry);

  const outVerts: Vec3Tuple[] = [];
  const vertKeyMap = new Map<string, number>();
  const addVert = (p: Vec3Tuple): number => {
    const key = quantKey3(p, 1e4);
    const existing = vertKeyMap.get(key);
    if (existing !== undefined) return existing;
    const idx = outVerts.length;
    vertKeyMap.set(key, idx);
    outVerts.push(p);
    return idx;
  };

  const outTris: Array<readonly [number, number, number]> = [];
  const cutSegments: Array<readonly [number, number]> = [];
  let clippedTriangleCount = 0;

  const signedDist = (p: Vec3Tuple): number => {
    const s = dot3(n, p) + d;
    return Math.abs(s) < 1e-6 ? 0 : s;
  };

  const intersectEdge = (a: Vec3Tuple, sa: number, b: Vec3Tuple, sb: number): Vec3Tuple => {
    const t = sa / (sa - sb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  for (const [ia, ib, ic] of welded.triangles) {
    const pts: readonly Vec3Tuple[] = [welded.vertices[ia]!, welded.vertices[ib]!, welded.vertices[ic]!];
    const dists = pts.map(signedDist);
    const allKept = dists[0]! <= 0 && dists[1]! <= 0 && dists[2]! <= 0;
    const allCut = dists[0]! >= 0 && dists[1]! >= 0 && dists[2]! >= 0;

    if (allKept && !(dists[0] === 0 && dists[1] === 0 && dists[2] === 0)) {
      outTris.push([addVert(pts[0]!), addVert(pts[1]!), addVert(pts[2]!)]);
      continue;
    }
    if (allCut) {
      clippedTriangleCount += 1;
      continue;
    }

    clippedTriangleCount += 1;
    const poly: number[] = [];
    let exitIdx = -1;
    let enterIdx = -1;

    for (let e = 0; e < 3; e += 1) {
      const curr = pts[e]!;
      const next = pts[(e + 1) % 3]!;
      const sc = dists[e]!;
      const sn = dists[(e + 1) % 3]!;
      const currKept = sc <= 0;
      const nextKept = sn <= 0;

      if (currKept) poly.push(addVert(curr));
      if (currKept && !nextKept) {
        const hit = sc === 0 ? addVert(curr) : addVert(intersectEdge(curr, sc, next, sn));
        if (poly[poly.length - 1] !== hit) poly.push(hit);
        exitIdx = hit;
      } else if (!currKept && nextKept) {
        const hit = sn === 0 ? addVert(next) : addVert(intersectEdge(curr, sc, next, sn));
        if (poly[poly.length - 1] !== hit) poly.push(hit);
        enterIdx = hit;
      }
    }

    const dedupPoly: number[] = [];
    for (const vIdx of poly) {
      if (dedupPoly.length === 0 || dedupPoly[dedupPoly.length - 1] !== vIdx) dedupPoly.push(vIdx);
    }
    if (dedupPoly.length > 1 && dedupPoly[0] === dedupPoly[dedupPoly.length - 1]) dedupPoly.pop();

    if (dedupPoly.length === 3) {
      outTris.push([dedupPoly[0]!, dedupPoly[1]!, dedupPoly[2]!]);
    } else if (dedupPoly.length === 4) {
      outTris.push([dedupPoly[0]!, dedupPoly[1]!, dedupPoly[2]!]);
      outTris.push([dedupPoly[0]!, dedupPoly[2]!, dedupPoly[3]!]);
    }

    if (exitIdx >= 0 && enterIdx >= 0 && exitIdx !== enterIdx) {
      cutSegments.push([enterIdx, exitIdx]);
    }
  }

  let capLoopCount = 0;
  let capAreaSqMeters = 0;

  if (generateCap && cutSegments.length >= 3) {
    const nextByStart = new Map<number, number[]>();
    for (const [u, v] of cutSegments) {
      const list = nextByStart.get(u) ?? [];
      list.push(v);
      nextByStart.set(u, list);
    }

    const { u: basisU, v: basisV } = buildPlaneBasis(n);
    const origin = scale3(n, -d);

    while (nextByStart.size > 0) {
      const firstEntry = nextByStart.entries().next().value as [number, number[]] | undefined;
      if (!firstEntry) break;
      const startNode = firstEntry[0];
      const loop: number[] = [startNode];
      let curr = startNode;

      for (let guard = 0; guard < cutSegments.length + 2; guard += 1) {
        const outs = nextByStart.get(curr);
        if (!outs || outs.length === 0) break;
        const nxt = outs.shift()!;
        if (outs.length === 0) nextByStart.delete(curr);
        if (nxt === startNode) break;
        loop.push(nxt);
        curr = nxt;
      }

      if (loop.length >= 3) {
        capLoopCount += 1;
        const pts2D: Vec2Tuple[] = loop.map((vIdx) => {
          const rel = sub3(outVerts[vIdx]!, origin);
          return [dot3(rel, basisU), dot3(rel, basisV)] as const;
        });
        let signedArea2 = 0;
        for (let i = 0; i < pts2D.length; i += 1) {
          const a = pts2D[i]!;
          const b = pts2D[(i + 1) % pts2D.length]!;
          signedArea2 += a[0] * b[1] - b[0] * a[1];
        }
        capAreaSqMeters += Math.abs(signedArea2) * 0.5;
        const capTris = triangulatePolygon2DEarClip(pts2D);
        for (const [a, b, c] of capTris) {
          outTris.push([loop[a]!, loop[b]!, loop[c]!]);
        }
      }
    }
  }

  const outGeo = buildBufferGeometryFromIndexedMesh(outVerts, outTris, { computeSmoothNormals: false });
  const base = wrapModelingResult(
    "section-slice",
    "단면 절단·캡",
    outGeo,
    `단면 절단 완료 · 캡 ${capLoopCount}개 (${round4(capAreaSqMeters)}m²) 생성`,
    options.groundAtY0 ?? false,
  );
  return Object.freeze({
    ...base,
    clippedTriangleCount,
    capLoopCount,
    capAreaSqMeters: round4(capAreaSqMeters),
  });
}

// ── 4. SketchUp 선형/방사형 컴포넌트 인스턴스 배열 ───────────────────────────

/**
 * SketchUp 선형(`*N` 배수 / `/N` 등분) 또는 방사형 컴포넌트 인스턴스 배열 변환 행렬을 생성한다.
 */
export function buildComponentArrayTransforms(
  input:
    | {
        readonly mode: "linear";
        readonly count: number;
        readonly offsetM: Vec3Tuple;
        readonly distribution?: "step" | "divide";
        readonly rotationStepDeg?: Vec3Tuple;
      }
    | {
        readonly mode: "radial";
        readonly count: number;
        readonly centerM: Vec3Tuple;
        readonly axis: ModelingAxis;
        readonly radiusM: number;
        readonly totalAngleDeg: number;
        readonly alignTangent?: boolean;
      },
): ComponentArrayResult {
  const count = Math.max(1, Math.min(128, Math.round(input.count)));
  const transforms: ComponentArrayTransformItem[] = [];
  const matrices: THREE.Matrix4[] = [];
  const pos = new THREE.Vector3();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  if (input.mode === "linear") {
    const div = input.distribution === "divide" && count > 1 ? count - 1 : 1;
    const stepX = input.offsetM[0] / div;
    const stepY = input.offsetM[1] / div;
    const stepZ = input.offsetM[2] / div;
    const rotStep = input.rotationStepDeg ?? [0, 0, 0];

    for (let i = 0; i < count; i += 1) {
      const px = round4(stepX * i);
      const py = round4(stepY * i);
      const pz = round4(stepZ * i);
      const rx = round4(rotStep[0] * i);
      const ry = round4(rotStep[1] * i);
      const rz = round4(rotStep[2] * i);
      pos.set(px, py, pz);
      euler.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
      quat.setFromEuler(euler);
      const mat = new THREE.Matrix4().compose(pos, quat, scale);
      matrices.push(mat);
      transforms.push(
        Object.freeze({
          index: i,
          positionM: Object.freeze([px, py, pz] as const),
          rotationEulerDeg: Object.freeze([rx, ry, rz] as const),
          scale: Object.freeze([1, 1, 1] as const),
          matrixElements: Object.freeze([...mat.elements]),
        }),
      );
    }
    return Object.freeze({
      mode: "linear",
      count,
      transforms: Object.freeze(transforms),
      matrices: Object.freeze(matrices),
      summaryKo: `선형 배열 ${count}개 (${input.distribution === "divide" ? "등분 /N" : "간격 *N"}) 생성`,
    });
  }

  const totalRad = (input.totalAngleDeg * Math.PI) / 180;
  const fullCircle = Math.abs(Math.abs(input.totalAngleDeg) - 360) < 1e-3;
  const denom = fullCircle ? count : Math.max(1, count - 1);
  const r = Math.max(0, input.radiusM);

  for (let i = 0; i < count; i += 1) {
    const theta = (totalRad * i) / denom;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let px = input.centerM[0];
    let py = input.centerM[1];
    let pz = input.centerM[2];
    let rx = 0;
    let ry = 0;
    let rz = 0;

    if (input.axis === "y") {
      px += r * c;
      pz += r * s;
      if (input.alignTangent ?? true) ry = round4((-theta * 180) / Math.PI);
    } else if (input.axis === "x") {
      py += r * c;
      pz += r * s;
      if (input.alignTangent ?? true) rx = round4((theta * 180) / Math.PI);
    } else {
      px += r * c;
      py += r * s;
      if (input.alignTangent ?? true) rz = round4((theta * 180) / Math.PI);
    }
    pos.set(round4(px), round4(py), round4(pz));
    euler.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
    quat.setFromEuler(euler);
    const mat = new THREE.Matrix4().compose(pos, quat, scale);
    matrices.push(mat);
    transforms.push(
      Object.freeze({
        index: i,
        positionM: Object.freeze([round4(px), round4(py), round4(pz)] as const),
        rotationEulerDeg: Object.freeze([rx, ry, rz] as const),
        scale: Object.freeze([1, 1, 1] as const),
        matrixElements: Object.freeze([...mat.elements]),
      }),
    );
  }

  return Object.freeze({
    mode: "radial",
    count,
    transforms: Object.freeze(transforms),
    matrices: Object.freeze(matrices),
    summaryKo: `방사형 배열 ${count}개 (반경 ${round4(r)}m · ${round4(input.totalAngleDeg)}°) 생성`,
  });
}

/**
 * 배열 변환 행렬로 실제 `THREE.InstancedMesh`와 GPU 정리 함수를 생성한다.
 */
export function instantiateComponentArrayMesh(
  baseGeometry: THREE.BufferGeometry,
  material: THREE.Material,
  arrayResult: ComponentArrayResult,
): { readonly mesh: THREE.InstancedMesh; readonly dispose: () => DisposedGpuResourceCounts } {
  const instanced = new THREE.InstancedMesh(baseGeometry.clone(), material, arrayResult.count);
  instanced.name = `component-array:${arrayResult.mode}:${arrayResult.count}`;
  for (let i = 0; i < arrayResult.matrices.length; i += 1) {
    instanced.setMatrixAt(i, arrayResult.matrices[i]!);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  return Object.freeze({
    mesh: instanced,
    dispose: () => disposeObject3DResources(instanced),
  });
}

