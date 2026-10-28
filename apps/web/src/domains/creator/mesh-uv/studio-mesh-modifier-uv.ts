/** 모디파이어가 실제로 생성한 삼각형과 원본 코너의 대응만 사용한다. */
import { createStudioEditableMeshFromPolygons, STUDIO_EDITABLE_MESH_LIMITS } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology, validateStudioMeshUvLayer } from "./studio-mesh-uv-authority";
import { applyStudioModifierSurfaceAttributes, type StudioModifierTriangleSurface } from "../mesh-surface/studio-mesh-modifier-surface";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioMeshModifier } from "../mesh-modifiers/studio-mesh-modifier-types";

export interface StudioModifierUv { readonly u: number; readonly v: number }
export type StudioModifierPoint3 = [number, number, number];

/** 원본 face.he fan과 soup 인덱스를 대조해 공유 3D 정점의 서로 다른 UV를 보존한다. */
export function studioModifierTriangleUvs(mesh: StudioEditableMesh, indices: Uint32Array): readonly StudioModifierUv[] | undefined {
  if (mesh.uvLayer === undefined) return undefined;
  const invalid = validateStudioMeshUvLayer(mesh);
  if (invalid) throw new Error(invalid);
  const values: StudioModifierUv[] = [];
  const vertexIndex = new Map(mesh.vertices.map(({ id }, index) => [id, index]));
  for (const face of mesh.faces) {
    const loop: number[] = [];
    let id = face.he;
    do {
      loop.push(id);
      const edge = mesh.halfEdges[id];
      if (!edge || loop.length > mesh.halfEdges.length) throw new Error("UV 원본 면의 순환이 올바르지 않습니다.");
      id = edge.next;
    } while (id !== face.he);
    for (let corner = 1; corner + 1 < loop.length; corner += 1) {
      for (const sourceId of [loop[0], loop[corner], loop[corner + 1]]) {
        const edge = sourceId === undefined ? undefined : mesh.halfEdges[sourceId];
        const uv = sourceId === undefined ? undefined : mesh.uvLayer.corners[sourceId];
        const origin = edge ? mesh.halfEdges[edge.prev]?.vertex : undefined;
        if (!uv || origin === undefined || vertexIndex.get(origin) !== indices[values.length]) {
          throw new Error("UV 원본 코너와 모디파이어 삼각형 인덱스가 일치하지 않습니다.");
        }
        values.push(uv);
      }
    }
  }
  if (values.length !== indices.length) throw new Error("UV 원본 삼각형의 코너 수가 일치하지 않습니다.");
  return values;
}

/** 생성 인덱스 순서의 UV를 새 halfedge-origin에 결합한다. 위치 검색은 사용하지 않는다. */
export function studioModifierSoupToMesh(positions: Float32Array, indices: Uint32Array, uvs?: readonly StudioModifierUv[], surfaces?: readonly StudioModifierTriangleSurface[]): StudioEditableMesh {
  const vertices = [];
  for (let index = 0; index < positions.length; index += 3) {
    vertices.push({ x: positions[index]!, y: positions[index + 1]!, z: positions[index + 2]! });
  }
  const faces: number[][] = [];
  for (let index = 0; index < indices.length; index += 3) faces.push([indices[index]!, indices[index + 1]!, indices[index + 2]!]);
  const created = createStudioEditableMeshFromPolygons(vertices, faces);
  const mesh = surfaces ? applyStudioModifierSurfaceAttributes(created, indices, surfaces) : created;
  if (uvs === undefined) return mesh;
  if (uvs.length !== indices.length || mesh.halfEdges.length !== uvs.length) throw new Error("생성된 삼각형과 UV 코너 수가 다릅니다.");
  const corners = mesh.halfEdges.map((edge, index) => {
    if (mesh.halfEdges[edge.prev]?.vertex !== indices[index]) throw new Error("생성된 UV 코너의 위상 대응이 다릅니다.");
    const uv = uvs[index];
    if (!uv) throw new Error("생성된 UV 코너가 없습니다.");
    return { halfEdgeId: edge.id, u: Math.fround(uv.u), v: Math.fround(uv.v) };
  });
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh) };
}

export function repeatStudioModifierUvs(uvs: readonly StudioModifierUv[] | undefined, count: number): readonly StudioModifierUv[] | undefined {
  if (!uvs) return undefined;
  const values: StudioModifierUv[] = [];
  for (let instance = 0; instance < count; instance += 1) for (const uv of uvs) values.push(uv);
  return values;
}

/** 절단 위치와 UV를 같은 원본 변·같은 t로 보간한다. 무UV 좌표 산술은 기존과 동일하다. */
export function clipStudioModifierTriangle(
  triangle: readonly StudioModifierPoint3[], axis: number, sourceUvs?: readonly StudioModifierUv[],
): { readonly points: readonly StudioModifierPoint3[]; readonly uvs?: readonly StudioModifierUv[] } {
  const points: StudioModifierPoint3[] = [];
  const uvs: StudioModifierUv[] | undefined = sourceUvs ? [] : undefined;
  for (let index = 0; index < triangle.length; index += 1) {
    const current = triangle[index]!;
    const previousIndex = (index + triangle.length - 1) % triangle.length;
    const previous = triangle[previousIndex]!;
    const currentDistance = current[axis] ?? 0;
    const previousDistance = previous[axis] ?? 0;
    const currentInside = currentDistance >= 0;
    const previousInside = previousDistance >= 0;
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const t = denominator === 0 ? 0 : previousDistance / denominator;
      const intersection: StudioModifierPoint3 = [
        previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t,
        previous[2] + (current[2] - previous[2]) * t,
      ];
      intersection[axis] = 0;
      points.push(intersection);
      if (uvs && sourceUvs) {
        const a = sourceUvs[previousIndex]; const b = sourceUvs[index];
        if (!a || !b) throw new Error("대칭 절단의 원본 UV가 없습니다.");
        uvs.push({ u: Math.fround(a.u + (b.u - a.u) * t), v: Math.fround(a.v + (b.v - a.v) * t) });
      }
    }
    if (currentInside) {
      points.push([...current]);
      if (uvs && sourceUvs) {
        const uv = sourceUvs[index];
        if (!uv) throw new Error("대칭 절단의 원본 UV가 없습니다.");
        uvs.push(uv);
      }
    }
  }
  return { points, ...(uvs ? { uvs } : {}) };
}

/** shell은 같은 코너를 복제하고 back winding과 rim 경계의 실제 순서에 맞춘다. */
export function solidifyStudioModifierUvs(
  uvs: readonly StudioModifierUv[] | undefined, indices: Uint32Array,
  boundary: readonly { readonly a: number; readonly b: number }[],
): readonly StudioModifierUv[] | undefined {
  if (!uvs) return undefined;
  const values: StudioModifierUv[] = [];
  const edgeUvs = new Map<string, readonly [StudioModifierUv, StudioModifierUv]>();
  for (let index = 0; index < indices.length; index += 3) {
    const a = uvs[index]!; const b = uvs[index + 1]!; const c = uvs[index + 2]!;
    values.push(a, b, c, a, c, b);
    for (const [left, right] of [[0, 1], [1, 2], [2, 0]] as const) {
      edgeUvs.set(`${indices[index + left]}|${indices[index + right]}`, [uvs[index + left]!, uvs[index + right]!]);
    }
  }
  for (const edge of boundary) {
    const pair = edgeUvs.get(`${edge.a}|${edge.b}`);
    if (!pair) throw new Error("두께 rim의 원본 UV 경계를 확인할 수 없습니다.");
    const [a, b] = pair;
    values.push(a, a, b, a, b, b);
  }
  return values;
}

/** UV를 진단 없이 잃는 연산은 실행 전에 거부하고, 추가 코너 메모리도 같은 예산에 청구한다. */
export function studioModifierUvBudget(mesh: StudioEditableMesh, indexCount: number, modifier: StudioMeshModifier): { readonly bytes: number; readonly workUnits: number } | undefined {
  if (mesh.uvLayer === undefined) return undefined;
  const invalid = validateStudioMeshUvLayer(mesh);
  if (invalid) throw new Error(invalid);
  if ((modifier.kind === "bevel" && modifier.amount === 0)
    || (modifier.kind === "decimate" && Math.max(4, Math.floor(indexCount / 3 * modifier.ratio)) >= indexCount / 3)
    || (modifier.kind === "solidify" && modifier.thickness === 0)) return undefined;
  const copies = modifier.kind === "array" ? modifier.count : modifier.kind === "mirror" ? modifier.bisect ? 4 : 2
    : modifier.kind === "solidify" ? 4 : modifier.kind === "simple-deform" ? 1 : modifier.kind === "subdivision" ? 4 ** modifier.levels : null;
  if (copies === null) throw new Error(`${modifier.kind}: 이 변형의 정확한 UV 코너 전파는 아직 지원하지 않습니다. UV를 보존하려면 변형을 끄거나 먼저 적용한 뒤 UV를 펼치세요.`);
  const outputCorners = indexCount * copies;
  if (!Number.isSafeInteger(outputCorners) || outputCorners > STUDIO_EDITABLE_MESH_LIMITS.maxEdges) {
    throw new Error("UV 모디파이어 결과의 코너 수가 편집 예산을 넘었습니다.");
  }
  const topologyItems = mesh.vertices.length + mesh.halfEdges.length + mesh.faces.length;
  return { bytes: mesh.halfEdges.length * 64 + indexCount * 8 + outputCorners * 128,
    workUnits: topologyItems * 8 + indexCount * 6 + outputCorners * 12 };
}
