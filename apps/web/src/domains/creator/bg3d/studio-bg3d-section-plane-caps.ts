/**
 * SketchUp Section Planes · ACON ABLER 클린룸 — 다중 단면 절단 평면(SectionPlane) 및
 * 솔리드 메쉬 단면 캡(Solid Section Cap · 해칭/단색) 생성 엔진.
 *
 * - 절단 평면 `dot(p - origin, normal) >= 0` 측만 남기고 교차 삼각형을 정확히 클리핑
 * - 잘린 솔리드 벽·기둥·가구의 빈 단면을 닫힌 2D 루프로 연결·삼각화해 Solid Section Cap 생성
 * - 건축 단면도용 45°/사용자 각도 해칭 선분 자동 생성 및 그림자 보존 벽면 컷어웨이와 병행 연동
 */

import type { Bg3dWallCutawayEvaluation } from "./studio-bg3d-wall-cutaway-runtime";

export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];

export type SectionCapStyle = "solid-fill" | "architectural-hatch" | "toon-ink-cut";

export interface Bg3dSectionPlane {
  readonly id: string;
  readonly labelKo: string;
  readonly enabled: boolean;
  readonly originWorldM: Vec3Tuple;
  /** 보존(남길) 반공간 방향의 단위 법선. */
  readonly keepNormalWorld: Vec3Tuple;
  readonly capStyle: SectionCapStyle;
  readonly capColorToken: string;
  readonly hatchSpacingM: number;
  readonly hatchAngleDeg: number;
}

export interface SectionableSolidMesh {
  readonly positions: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}

export interface SectionCapHatchLine {
  readonly startWorld: Vec3Tuple;
  readonly endWorld: Vec3Tuple;
}

export interface ClippedSectionMeshResult {
  readonly planeId: string;
  readonly keptPositions: Float32Array;
  readonly keptIndices: Uint32Array;
  readonly keptTriangleCount: number;
  readonly capPositions: Float32Array;
  readonly capNormals: Float32Array;
  readonly capIndices: Uint32Array;
  readonly capTriangleCount: number;
  readonly capAreaM2: number;
  readonly capContourLoops: readonly (readonly Vec3Tuple[])[];
  readonly hatchLines: readonly SectionCapHatchLine[];
}

export interface CombinedCutawayAndSectionState {
  readonly activeSectionPlanes: readonly Bg3dSectionPlane[];
  readonly shadowPreservingWallRoles: readonly string[];
  readonly effectiveRenderStrategy: "cutaway-plus-section-caps" | "section-caps-only" | "cutaway-only" | "none";
}

const EPS = 1e-7;

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple = [0, 1, 0]): Vec3Tuple {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len <= EPS) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function buildPlaneBasis(normal: Vec3Tuple): {
  readonly n: Vec3Tuple;
  readonly u: Vec3Tuple;
  readonly v: Vec3Tuple;
} {
  const n = normalize3(normal, [0, 1, 0]);
  const ref: Vec3Tuple = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3(cross3(ref, n), [1, 0, 0]);
  const v = normalize3(cross3(n, u), [0, 0, 1]);
  return { n, u, v };
}

function projectToPlane2D(
  p: Vec3Tuple,
  origin: Vec3Tuple,
  u: Vec3Tuple,
  v: Vec3Tuple,
): Vec2Tuple {
  const rel = sub3(p, origin);
  return [dot3(rel, u), dot3(rel, v)];
}

function unprojectFromPlane2D(
  uv: Vec2Tuple,
  origin: Vec3Tuple,
  u: Vec3Tuple,
  v: Vec3Tuple,
): Vec3Tuple {
  return [
    origin[0] + u[0] * uv[0] + v[0] * uv[1],
    origin[1] + u[1] * uv[0] + v[1] * uv[1],
    origin[2] + u[2] * uv[0] + v[2] * uv[1],
  ];
}

function signedArea2D(loop: readonly Vec2Tuple[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function pointInTri2D(p: Vec2Tuple, a: Vec2Tuple, b: Vec2Tuple, c: Vec2Tuple): boolean {
  const cross = (o: Vec2Tuple, x: Vec2Tuple, y: Vec2Tuple) => (x[0] - o[0]) * (y[1] - o[1]) - (x[1] - o[1]) * (y[0] - o[0]);
  const c1 = cross(a, b, p);
  const c2 = cross(b, c, p);
  const c3 = cross(c, a, p);
  return c1 >= -EPS && c2 >= -EPS && c3 >= -EPS;
}

/** 단순 2D 다각형 이어 클리핑(Ear Clipping) 삼각화 — 비볼록 L자·ㄷ자 건축 벽 단면도 정확히 메운다. */
function triangulateSimplePolygon2D(rawLoop: readonly Vec2Tuple[]): readonly [number, number, number][] {
  if (rawLoop.length < 3) return [];
  const ccw = signedArea2D(rawLoop) >= 0;
  const remaining = rawLoop.map((_, idx) => idx);
  if (!ccw) remaining.reverse();

  const triangles: [number, number, number][] = [];
  let guard = remaining.length * remaining.length;

  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const len = remaining.length;
    for (let i = 0; i < len; i += 1) {
      const iPrev = remaining[(i + len - 1) % len];
      const iCurr = remaining[i];
      const iNext = remaining[(i + 1) % len];
      const a = rawLoop[iPrev];
      const b = rawLoop[iCurr];
      const c = rawLoop[iNext];

      const crossVal = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (crossVal <= EPS) continue;

      let containsOther = false;
      for (let j = 0; j < len; j += 1) {
        const cand = remaining[j];
        if (cand === iPrev || cand === iCurr || cand === iNext) continue;
        if (pointInTri2D(rawLoop[cand], a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      triangles.push([iPrev, iCurr, iNext]);
      remaining.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0], remaining[1], remaining[2]]);
  }
  return triangles;
}

/** 잘린 평면 위 무순서 세그먼트들을 닫힌 2D 윤곽 루프로 연결한다. */
function chainSegmentsIntoLoops(
  segments: readonly (readonly [Vec2Tuple, Vec2Tuple])[],
  weldToleranceM = 1e-3,
): Vec2Tuple[][] {
  const remaining = segments.filter(
    ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) > weldToleranceM * 0.25,
  );
  const loops: Vec2Tuple[][] = [];
  const tolSq = weldToleranceM * weldToleranceM;
  const distSq = (a: Vec2Tuple, b: Vec2Tuple) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

  while (remaining.length > 0) {
    const first = remaining.shift()!;
    const chain: Vec2Tuple[] = [first[0], first[1]];
    let progressed = true;
    while (progressed) {
      progressed = false;
      const tail = chain[chain.length - 1];
      for (let i = 0; i < remaining.length; i += 1) {
        const [s0, s1] = remaining[i];
        if (distSq(tail, s0) <= tolSq) {
          chain.push(s1);
          remaining.splice(i, 1);
          progressed = true;
          break;
        }
        if (distSq(tail, s1) <= tolSq) {
          chain.push(s0);
          remaining.splice(i, 1);
          progressed = true;
          break;
        }
      }
    }
    if (chain.length >= 4 && distSq(chain[0], chain[chain.length - 1]) <= tolSq * 4) {
      chain.pop();
    }
    if (chain.length >= 3) {
      loops.push(chain);
    }
  }
  return loops;
}

function generateHatchLinesForLoops2D(
  loops: readonly (readonly Vec2Tuple[])[],
  spacingM: number,
  angleDeg: number,
): { readonly a: Vec2Tuple; readonly b: Vec2Tuple }[] {
  const safeSpacing = Math.max(0.01, spacingM);
  const rad = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const perpX = -dirY;
  const perpY = dirX;

  let minPerp = Number.POSITIVE_INFINITY;
  let maxPerp = Number.NEGATIVE_INFINITY;
  for (const loop of loops) {
    for (const p of loop) {
      const proj = p[0] * perpX + p[1] * perpY;
      if (proj < minPerp) minPerp = proj;
      if (proj > maxPerp) maxPerp = proj;
    }
  }
  if (!Number.isFinite(minPerp) || !Number.isFinite(maxPerp)) return [];

  const result: { readonly a: Vec2Tuple; readonly b: Vec2Tuple }[] = [];
  for (let offset = minPerp + safeSpacing * 0.5; offset < maxPerp; offset += safeSpacing) {
    const alongHits: number[] = [];
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i += 1) {
        const p0 = loop[i];
        const p1 = loop[(i + 1) % loop.length];
        const d0 = p0[0] * perpX + p0[1] * perpY - offset;
        const d1 = p1[0] * perpX + p1[1] * perpY - offset;
        if ((d0 < 0 && d1 >= 0) || (d1 < 0 && d0 >= 0)) {
          const t = -d0 / (d1 - d0);
          const ix = p0[0] + (p1[0] - p0[0]) * t;
          const iy = p0[1] + (p1[1] - p0[1]) * t;
          alongHits.push(ix * dirX + iy * dirY);
        }
      }
    }
    alongHits.sort((x, y) => x - y);
    for (let k = 0; k + 1 < alongHits.length; k += 2) {
      const s0 = alongHits[k];
      const s1 = alongHits[k + 1];
      if (s1 - s0 > 1e-4) {
        result.push({
          a: [perpX * offset + dirX * s0, perpY * offset + dirY * s0],
          b: [perpX * offset + dirX * s1, perpY * offset + dirY * s1],
        });
      }
    }
  }
  return result;
}

/**
 * 단일 단면 절단 평면으로 솔리드 메쉬를 클리핑하고 빈 내부를 막는 Solid Section Cap과 건축 해칭을 생성한다.
 */
export function clipMeshBySectionPlane(
  mesh: SectionableSolidMesh,
  plane: Bg3dSectionPlane,
): ClippedSectionMeshResult {
  const basis = buildPlaneBasis(plane.keepNormalWorld);
  const keptPos: number[] = [];
  const keptIdx: number[] = [];
  const cutSegments2D: [Vec2Tuple, Vec2Tuple][] = [];

  const emitKeptTriangle = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple) => {
    const base = keptPos.length / 3;
    keptPos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    keptIdx.push(base, base + 1, base + 2);
  };

  const pos = mesh.positions;
  const idx = mesh.indices;
  const readV = (vi: number): Vec3Tuple => [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]];

  for (let i = 0; i < idx.length; i += 3) {
    const verts: [Vec3Tuple, Vec3Tuple, Vec3Tuple] = [
      readV(idx[i]),
      readV(idx[i + 1]),
      readV(idx[i + 2]),
    ];
    if (!plane.enabled) {
      emitKeptTriangle(verts[0], verts[1], verts[2]);
      continue;
    }

    const dists = verts.map((v) => dot3(sub3(v, plane.originWorldM), basis.n));
    const inside: number[] = [];
    const outside: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      if (dists[k] >= -EPS) inside.push(k);
      else outside.push(k);
    }

    if (inside.length === 3) {
      emitKeptTriangle(verts[0], verts[1], verts[2]);
    } else if (inside.length === 1) {
      const i0 = inside[0];
      const o1 = outside[0];
      const o2 = outside[1];
      const t1 = dists[i0] / (dists[i0] - dists[o1]);
      const t2 = dists[i0] / (dists[i0] - dists[o2]);
      const p1 = lerp3(verts[i0], verts[o1], t1);
      const p2 = lerp3(verts[i0], verts[o2], t2);
      emitKeptTriangle(verts[i0], p1, p2);
      cutSegments2D.push([
        projectToPlane2D(p1, plane.originWorldM, basis.u, basis.v),
        projectToPlane2D(p2, plane.originWorldM, basis.u, basis.v),
      ]);
    } else if (inside.length === 2) {
      const i0 = inside[0];
      const i1 = inside[1];
      const o2 = outside[0];
      const t0 = dists[i0] / (dists[i0] - dists[o2]);
      const t1 = dists[i1] / (dists[i1] - dists[o2]);
      const p0 = lerp3(verts[i0], verts[o2], t0);
      const p1 = lerp3(verts[i1], verts[o2], t1);
      emitKeptTriangle(verts[i0], verts[i1], p1);
      emitKeptTriangle(verts[i0], p1, p0);
      cutSegments2D.push([
        projectToPlane2D(p0, plane.originWorldM, basis.u, basis.v),
        projectToPlane2D(p1, plane.originWorldM, basis.u, basis.v),
      ]);
    }
  }

  const loops2D = plane.enabled ? chainSegmentsIntoLoops(cutSegments2D) : [];
  const capPos: number[] = [];
  const capNorm: number[] = [];
  const capIdx: number[] = [];
  const capContourLoops: Vec3Tuple[][] = [];
  let capAreaM2 = 0;

  // 단면 캡 법선은 잘려나간 쪽(-keepNormal)을 향해 카메라를 마주본다
  const capN: Vec3Tuple = [-basis.n[0], -basis.n[1], -basis.n[2]];

  for (const loop2D of loops2D) {
    capAreaM2 += Math.abs(signedArea2D(loop2D));
    const baseVertex = capPos.length / 3;
    const loop3D = loop2D.map((uv) => unprojectFromPlane2D(uv, plane.originWorldM, basis.u, basis.v));
    capContourLoops.push(loop3D);
    for (const p3 of loop3D) {
      capPos.push(p3[0], p3[1], p3[2]);
      capNorm.push(capN[0], capN[1], capN[2]);
    }
    const tris = triangulateSimplePolygon2D(loop2D);
    for (const [a, b, c] of tris) {
      capIdx.push(baseVertex + a, baseVertex + b, baseVertex + c);
    }
  }

  const hatchLines: SectionCapHatchLine[] =
    plane.enabled && plane.capStyle === "architectural-hatch" && loops2D.length > 0
      ? generateHatchLinesForLoops2D(loops2D, plane.hatchSpacingM, plane.hatchAngleDeg).map((seg) => ({
        startWorld: unprojectFromPlane2D(seg.a, plane.originWorldM, basis.u, basis.v),
        endWorld: unprojectFromPlane2D(seg.b, plane.originWorldM, basis.u, basis.v),
      }))
      : [];

  return {
    planeId: plane.id,
    keptPositions: new Float32Array(keptPos),
    keptIndices: new Uint32Array(keptIdx),
    keptTriangleCount: keptIdx.length / 3,
    capPositions: new Float32Array(capPos),
    capNormals: new Float32Array(capNorm),
    capIndices: new Uint32Array(capIdx),
    capTriangleCount: capIdx.length / 3,
    capAreaM2,
    capContourLoops,
    hatchLines,
  };
}

/** 다중 단면 절단 평면과 그림자 보존 벽면 컷어웨이 상태를 함께 조율한다. */
export function coordinateSectionPlanesWithCutaway(
  planes: readonly Bg3dSectionPlane[],
  cutawayEvaluation: Bg3dWallCutawayEvaluation | null,
): CombinedCutawayAndSectionState {
  const activeSectionPlanes = planes.filter((p) => p.enabled);
  const shadowPreservingWallRoles = cutawayEvaluation
    ? cutawayEvaluation.hiddenWalls
    : [];

  let effectiveRenderStrategy: CombinedCutawayAndSectionState["effectiveRenderStrategy"] = "none";
  if (activeSectionPlanes.length > 0 && shadowPreservingWallRoles.length > 0) {
    effectiveRenderStrategy = "cutaway-plus-section-caps";
  } else if (activeSectionPlanes.length > 0) {
    effectiveRenderStrategy = "section-caps-only";
  } else if (shadowPreservingWallRoles.length > 0) {
    effectiveRenderStrategy = "cutaway-only";
  }

  return {
    activeSectionPlanes,
    shadowPreservingWallRoles,
    effectiveRenderStrategy,
  };
}
