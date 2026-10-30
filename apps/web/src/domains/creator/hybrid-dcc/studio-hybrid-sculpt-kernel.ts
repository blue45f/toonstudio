/**
 * Hybrid DCC sculpt / voxel-lite kernel (SCP-001–005, 008 subset).
 *
 * ## 한계
 * - 프로덕션 multires / dynamesh / face-set GPU 스컬프 코어(`studio-sculpt-*`)가 아니다.
 * - inflate/clay/crease의 방향만 기존 정점 법선 코어를 재사용한다. brush 계수·mask 의미는 유지한다.
 * - 변경 dab의 UV 삼각 remap·triangle 정본 전환은 현행 그대로이며 polygon 위상을 보존하지 않는다.
 * - voxel remesh는 격자 스냅 근사(상세 손실 있음).
 */

import {
  createStudioEditableMeshFromPolygons,
  studioEditableMeshToTriangleSoup,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { remapStudioMeshUvTriangleSoup } from "../mesh-uv/studio-mesh-uv-triangle-remap";
import { recomputeSculptNormals } from "../studio-sculpt-mesh";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender, type StudioMeshSurfaceRenderProjection } from "../mesh-surface/studio-mesh-surface-render";

export const STUDIO_SCULPT_KERNEL_REVISION = 2 as const;

export type StudioSculptBrushKind =
  | "grab"
  | "smooth"
  | "inflate"
  | "clay"
  | "crease"
  | "flatten"
  | "scrape"
  | "snakeHook";

export interface StudioSculptStroke {
  readonly kind: StudioSculptBrushKind;
  readonly center: StudioMeshVec3;
  readonly radius: number;
  readonly strength: number;
  readonly direction?: StudioMeshVec3;
}

export type StudioSculptResult =
  | { readonly ok: true; readonly mesh: StudioEditableMesh }
  | { readonly ok: false; readonly detail: string };

function falloff(dist: number, radius: number): number {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return t * t * (3 - 2 * t);
}

function soupToMesh(positions: Float32Array, indices: Uint32Array): StudioEditableMesh {
  const verts: StudioMeshVec3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    verts.push({ x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! });
  }
  const faces: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    faces.push([indices[i]!, indices[i + 1]!, indices[i + 2]!]);
  }
  return createStudioEditableMeshFromPolygons(verts, faces);
}

/** 각 row는 기존 triangle 순서와 triangle 안의 j 순서·중복 기여를 그대로 가진다. */
function smoothAdjacency(indices: Uint32Array, vertexCount: number) {
  const offsets = new Uint32Array(vertexCount + 1);
  let neighbors = new Uint32Array(0);
  let cursor = new Uint32Array(0);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      if (a === undefined || b === undefined || c === undefined) throw new Error("Smooth 원본 삼각형의 코너가 누락됐습니다.");
      const triangle = [a, b, c];
      for (const [corner, vertex] of triangle.entries()) {
        // 이전 includes(i)는 한 triangle을 한 번만 방문했다. 반복 target도 중복 방문하지 않는다.
        if (triangle.indexOf(vertex) !== corner) continue;
        for (const neighbor of triangle) {
          if (neighbor === vertex) continue;
          if (pass === 0) offsets[vertex + 1] = (offsets[vertex + 1] ?? 0) + 1;
          else {
            const write = cursor[vertex];
            if (write === undefined) throw new Error("Smooth 원본 정점의 이웃 범위를 찾지 못했습니다.");
            neighbors[write] = neighbor;
            cursor[vertex] = write + 1;
          }
        }
      }
    }
    if (pass === 0) {
      for (let vertex = 0; vertex < vertexCount; vertex += 1) offsets[vertex + 1] = (offsets[vertex + 1] ?? 0) + (offsets[vertex] ?? 0);
      neighbors = new Uint32Array(offsets[vertexCount] ?? 0);
      cursor = offsets.slice(0, vertexCount);
    }
  }
  return { offsets, neighbors };
}

export function applyStudioSculptStroke(
  mesh: StudioEditableMesh,
  stroke: StudioSculptStroke,
  mask?: Float32Array | null,
): StudioSculptResult {
  if (!(stroke.radius > 0) || !Number.isFinite(stroke.strength)) {
    return { ok: false, detail: "invalid brush" };
  }
  if (mesh.uvLayer !== undefined) {
    const valid = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!valid.ok) return { ok: false, detail: `UV 원본 메시를 확인할 수 없습니다: ${valid.detail}` };
  }
  const surface = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!surface.ok) return { ok: false, detail: `Sculpt 원본 표면을 확인할 수 없습니다: ${surface.issue.detail}` };
  let soup: StudioMeshSurfaceRenderProjection;
  try { soup = projectStudioMeshSurfaceForRender(mesh, surface.value); }
  catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "Sculpt 원본 표면을 표시할 수 없습니다." }; }
  const positions = new Float32Array(soup.positions);
  const n = positions.length / 3;
  const cx = stroke.center.x;
  const cy = stroke.center.y;
  const cz = stroke.center.z;

  const usesVertexNormals = stroke.kind === "inflate" || stroke.kind === "clay" || stroke.kind === "crease";
  let vertexNormals: Float64Array | undefined;
  let nx = 0, ny = 1, nz = 0;
  if (usesVertexNormals) {
    // 큰 외적과 작은 독립 성분을 전역 좌표 축척 없이 보존한다.
    vertexNormals = new Float64Array(positions.length);
    // 위치는 private scratch이고 indices는 검증된 surface의 읽기 전용 입력이다.
    recomputeSculptNormals({
      positions, normals: vertexNormals, indices: soup.indices,
      vertexCount: n, triangleCount: soup.indices.length / 3,
    });
  } else {
    // 다른 브러시의 기존 plane/grab fallback 의미는 유지한다.
    nx = 0; ny = 0; nz = 0;
    for (let t = 0; t < soup.indices.length; t += 3) {
      const ia = soup.indices[t]!;
      const ib = soup.indices[t + 1]!;
      const ic = soup.indices[t + 2]!;
      const ax = positions[ia * 3]!;
      const ay = positions[ia * 3 + 1]!;
      const az = positions[ia * 3 + 2]!;
      const bx = positions[ib * 3]! - ax;
      const by = positions[ib * 3 + 1]! - ay;
      const bz = positions[ib * 3 + 2]! - az;
      const cxn = positions[ic * 3]! - ax;
      const cyn = positions[ic * 3 + 1]! - ay;
      const czn = positions[ic * 3 + 2]! - az;
      nx += by * czn - bz * cyn;
      ny += bz * cxn - bx * czn;
      nz += bx * cyn - by * cxn;
    }
    const length = Math.hypot(nx, ny, nz);
    if (length > 1e-6) {
      nx /= length; ny /= length; nz /= length;
    } else {
      nx = 0; ny = 1; nz = 0;
    }
  }

  const dir = stroke.direction ?? { x: nx, y: ny, z: nz };
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  let smoothNeighborhood: ReturnType<typeof smoothAdjacency> | undefined;

  for (let i = 0; i < n; i += 1) {
    const m = mask ? (mask[i] ?? 1) : 1;
    if (m <= 0) continue;
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const dist = Math.hypot(x - cx, y - cy, z - cz);
    const w = falloff(dist, stroke.radius) * stroke.strength * m;
    if (w === 0) continue;
    if (stroke.kind === "grab" || stroke.kind === "snakeHook") {
      positions[i * 3] = x + (dir.x / dl) * w;
      positions[i * 3 + 1] = y + (dir.y / dl) * w;
      positions[i * 3 + 2] = z + (dir.z / dl) * w;
    } else if (usesVertexNormals) {
      const normalX = vertexNormals?.[i * 3];
      const normalY = vertexNormals?.[i * 3 + 1];
      const normalZ = vertexNormals?.[i * 3 + 2];
      if (normalX === undefined || normalY === undefined || normalZ === undefined) {
        return { ok: false, detail: "조형 정점 법선의 원본 대응을 확인할 수 없습니다." };
      }
      const amount = stroke.kind === "clay" ? w * 0.5 : stroke.kind === "crease" ? -w * 0.5 : w;
      positions[i * 3] = x + normalX * amount;
      positions[i * 3 + 1] = y + normalY * amount;
      positions[i * 3 + 2] = z + normalZ * amount;
    } else if (stroke.kind === "flatten" || stroke.kind === "scrape") {
      // 가중 평균 평면 투영. scrape 는 방향 쪽으로 튀어나온 정점만 닦아내린다.
      // 평면 법선은 브러시 direction 을 따른다(닫힌 메시의 평균 법선은 0 으로 퇴화한다).
      const px = dir.x / dl;
      const py = dir.y / dl;
      const pz = dir.z / dl;
      const signed = (x - cx) * px + (y - cy) * py + (z - cz) * pz;
      const above = signed > 0;
      if (stroke.kind === "flatten" || above) {
        const step = stroke.kind === "scrape" ? Math.max(0, signed) * w : signed * w;
        positions[i * 3] = x - px * step;
        positions[i * 3 + 1] = y - py * step;
        positions[i * 3 + 2] = z - pz * step;
      }
    } else if (stroke.kind === "smooth") {
      // 첫 실제 smooth 영향에서만 구성한다. 좌표는 이전과 같이 현재 in-place 배열에서 읽는다.
      smoothNeighborhood ??= smoothAdjacency(soup.indices, n);
      let ax = 0;
      let ay = 0;
      let az = 0;
      let count = 0;
      const start = smoothNeighborhood.offsets[i] ?? 0;
      const end = smoothNeighborhood.offsets[i + 1] ?? start;
      for (let adjacent = start; adjacent < end; adjacent += 1) {
        const j = smoothNeighborhood.neighbors[adjacent];
        if (j === undefined) throw new Error("Smooth 원본 이웃 정점이 누락됐습니다.");
        ax += positions[j * 3]!;
        ay += positions[j * 3 + 1]!;
        az += positions[j * 3 + 2]!;
        count += 1;
      }
      if (count > 0) {
        ax /= count;
        ay /= count;
        az /= count;
        positions[i * 3] = x + (ax - x) * w;
        positions[i * 3 + 1] = y + (ay - y) * w;
        positions[i * 3 + 2] = z + (az - z) * w;
      }
    }
  }
  // 실제 위치가 바뀌지 않았다면 원본 polygon·UV 보간·법선과 stable ID도 그대로 둔다.
  if (positions.every((value, index) => value === soup.positions[index])) return { ok: true, mesh };
  try {
    const triangles = soupToMesh(positions, soup.indices);
    const result = remapStudioMeshUvTriangleSoup(mesh, triangles, soup.indices);
    const planned = planStudioMeshSurface(result, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!planned.ok) return { ok: false, detail: `Sculpt 결과 표면을 표시할 수 없습니다: ${planned.issue.detail}` };
    return { ok: true, mesh: result };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Sculpt UV 코너 대응을 확인할 수 없습니다." };
  }
}

export function createStudioSculptMask(
  vertexCount: number,
  fill = 1,
): Float32Array {
  const m = new Float32Array(vertexCount);
  m.fill(Math.max(0, Math.min(1, fill)));
  return m;
}

export function invertStudioSculptMask(mask: Float32Array): Float32Array {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) out[i] = 1 - (mask[i] ?? 0);
  return out;
}

/** SCP-005 lite: voxel remesh by grid snap + unique points (detail loss). */
export function voxelRemeshStudioMesh(
  mesh: StudioEditableMesh,
  cellSize: number,
): StudioSculptResult {
  if (!(cellSize > 0)) return { ok: false, detail: "invalid cell" };
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / cellSize)}|${Math.round(y / cellSize)}|${Math.round(z / cellSize)}`;
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = (i: number) => {
    const x = soup.positions[i * 3]!;
    const y = soup.positions[i * 3 + 1]!;
    const z = soup.positions[i * 3 + 2]!;
    const k = key(x, y, z);
    let n = map.get(k);
    if (n !== undefined) return n;
    n = positions.length / 3;
    map.set(k, n);
    positions.push(
      Math.round(x / cellSize) * cellSize,
      Math.round(y / cellSize) * cellSize,
      Math.round(z / cellSize) * cellSize,
    );
    return n;
  };
  const indices: number[] = [];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const a = remap(soup.indices[t]!);
    const b = remap(soup.indices[t + 1]!);
    const c = remap(soup.indices[t + 2]!);
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }
  if (indices.length === 0) return { ok: false, detail: "remesh empty" };
  return {
    ok: true,
    mesh: soupToMesh(new Float32Array(positions), new Uint32Array(indices)),
  };
}

/** SCP-008 lite: vertex color paint (RGB 0–1 stored as separate array). */
export function polypaintStudioMesh(
  vertexCount: number,
  colors: Float32Array | null,
  centerIndex: number,
  radiusIndices: number,
  rgb: readonly [number, number, number],
): Float32Array {
  const out = colors ? new Float32Array(colors) : new Float32Array(vertexCount * 3);
  if (!colors) {
    for (let i = 0; i < vertexCount; i += 1) {
      out[i * 3] = 0.7;
      out[i * 3 + 1] = 0.7;
      out[i * 3 + 2] = 0.7;
    }
  }
  const r = Math.max(0, Math.trunc(radiusIndices));
  for (let i = Math.max(0, centerIndex - r); i <= Math.min(vertexCount - 1, centerIndex + r); i += 1) {
    out[i * 3] = rgb[0];
    out[i * 3 + 1] = rgb[1];
    out[i * 3 + 2] = rgb[2];
  }
  return out;
}
