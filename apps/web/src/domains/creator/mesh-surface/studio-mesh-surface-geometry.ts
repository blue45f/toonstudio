/** 법선 합산과 정점 dedup의 계산·정렬 순서를 기존 GLB와 동일하게 유지한다. */
import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";
import { surfaceIssue as issue,surfacePass as pass,surfaceStop as stop,type StudioMeshSurfaceResult as InternalResult,type StudioMeshSurfaceValidated as ValidatedMesh,type StudioMeshSurfaceGeometry as BuiltGeometry } from "./studio-mesh-surface-contracts";
import { minimumNumber,normalized,newellNormal } from "./studio-mesh-surface-triangulation";

interface MutableVec3 {x:number;y:number;z:number}
type SmoothGroups = { readonly groupByCorner: ReadonlyMap<string, number>; readonly normalByGroup: ReadonlyMap<string, StudioMeshVec3> };
/** 편집 표시는 기존 half-edge twin DSU를 사용한다. 다중 edge의 새 보간 규칙을 만들지 않는다. */
function buildEditableSmoothGroups(mesh: ValidatedMesh): InternalResult<SmoothGroups> {
  const source = mesh.sourceMesh, parent = Int32Array.from(source.halfEdges, ({ id }) => id), rank = new Uint8Array(parent.length);
  const root = (id: number): number => {
    let found = id;
    while (parent[found] !== found) { const next = parent[found]; if (next === undefined) throw new Error("편집 표시의 음영 코너 ID가 잘못됐습니다."); found = next; }
    while (id !== found) { const next = parent[id]; if (next === undefined) throw new Error("편집 표시의 음영 연결이 잘못됐습니다."); parent[id] = found; id = next; }
    return found;
  };
  const join = (first: number, second: number) => {
    let a = root(first), b = root(second); if (a === b) return;
    if ((rank[a] ?? 0) < (rank[b] ?? 0)) [a, b] = [b, a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a] = (rank[a] ?? 0) + 1;
  };
  for (const edge of source.halfEdges) {
    const twin = edge.twin < 0 ? undefined : source.halfEdges[edge.twin];
    if (!twin || twin.id < edge.id || !source.faces[edge.face]?.smooth || !source.faces[twin.face]?.smooth) continue;
    join(edge.id, twin.next); join(edge.next, twin.id);
  }
  const sums = new Map<number, MutableVec3>(), groupByCorner = new Map<string, number>();
  for (const face of mesh.faces) {
    if (!face.face.smooth) continue;
    for (const [index, id] of face.halfEdgeIds.entries()) {
      const vertex = face.vertexIds[index]; if (vertex === undefined) throw new Error("편집 표시의 원본 음영 정점이 없습니다.");
      const group = root(id), sum = sums.get(group) ?? { x: 0, y: 0, z: 0 };
      sum.x += face.rawNormal.x; sum.y += face.rawNormal.y; sum.z += face.rawNormal.z;
      sums.set(group, sum); groupByCorner.set(`${vertex}:${face.face.id}`, group);
    }
  }
  const normalizedByGroup = new Map<number, StudioMeshVec3>();
  for (const [id, sum] of sums) {
    const length = Math.hypot(sum.x, sum.y, sum.z);
    if (!Number.isFinite(length) || length <= 1e-12) return stop(issue("error", "normal-unresolved", "편집 표시의 smooth 법선을 안정적으로 계산하지 못했습니다."));
    normalizedByGroup.set(id, { x: sum.x / length, y: sum.y / length, z: sum.z / length });
  }
  const normalByGroup = new Map<string, StudioMeshVec3>();
  for (const face of mesh.faces) for (const vertex of face.vertexIds) {
    const group = groupByCorner.get(`${vertex}:${face.face.id}`), normal = group === undefined ? undefined : normalizedByGroup.get(group);
    if (normal && group !== undefined) normalByGroup.set(`${vertex}:${group}`, normal);
  }
  return pass({ groupByCorner, normalByGroup });
}
function buildSmoothGroups(mesh: ValidatedMesh): InternalResult<{
  readonly groupByCorner: ReadonlyMap<string, number>;
  readonly normalByGroup: ReadonlyMap<string, StudioMeshVec3>;
}> {
  if (mesh.topologyPolicy === "editable" && mesh.hasEditableTopologyExceptions) return buildEditableSmoothGroups(mesh);
  const smoothFacesByVertex = new Map<number, Set<number>>();
  for (const face of mesh.faces) {
    if (!face.face.smooth) continue;
    for (const vertexId of face.triangulationVertexIds) {
      const faces = smoothFacesByVertex.get(vertexId) ?? new Set<number>();
      faces.add(face.face.id);
      smoothFacesByVertex.set(vertexId, faces);
    }
  }
  const neighbors = new Map<string, Set<number>>();
  for (const edge of mesh.edgeUses) {
    const faceIds = [...new Set(edge.halfEdges.map((halfEdge) => halfEdge.face).filter((id) => id >= 0))];
    if (faceIds.length !== 2) continue;
    const first = mesh.faceById.get(faceIds[0]!)!;
    const second = mesh.faceById.get(faceIds[1]!)!;
    if (!first.smooth || !second.smooth) continue;
    for (const vertexId of [edge.a, edge.b]) {
      const firstKey = `${vertexId}:${first.id}`;
      const secondKey = `${vertexId}:${second.id}`;
      const firstSet = neighbors.get(firstKey) ?? new Set<number>();
      const secondSet = neighbors.get(secondKey) ?? new Set<number>();
      firstSet.add(second.id);
      secondSet.add(first.id);
      neighbors.set(firstKey, firstSet);
      neighbors.set(secondKey, secondSet);
    }
  }

  const faceDataById = new Map(mesh.faces.map((entry) => [entry.face.id, entry] as const));
  const groupByCorner = new Map<string, number>();
  const normalByGroup = new Map<string, StudioMeshVec3>();
  for (const [vertexId, faceSet] of [...smoothFacesByVertex.entries()].sort(([a], [b]) => a - b)) {
    const remaining = new Set(faceSet);
    while (remaining.size > 0) {
      const seed = minimumNumber(remaining);
      const component: number[] = [];
      const queue = [seed];
      remaining.delete(seed);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        for (const adjacent of [...(neighbors.get(`${vertexId}:${current}`) ?? [])].sort((a, b) => a - b)) {
          if (remaining.delete(adjacent)) queue.push(adjacent);
        }
      }
      component.sort((a, b) => a - b);
      const groupId = component[0]!;
      const sum: MutableVec3 = { x: 0, y: 0, z: 0 };
      for (const faceId of component) {
        const normal = faceDataById.get(faceId)!.rawNormal;
        sum.x += normal.x;
        sum.y += normal.y;
        sum.z += normal.z;
        groupByCorner.set(`${vertexId}:${faceId}`, groupId);
      }
      const normal = normalized(sum);
      if (!normal) {
        return stop(issue("error", "normal-unresolved", `Smooth normal cancels at vertex ${vertexId}`, { vertexIds: [vertexId], faceIds: component }));
      }
      normalByGroup.set(`${vertexId}:${groupId}`, normal);
    }
  }
  return pass({ groupByCorner, normalByGroup });
}

export function buildStudioMeshSurfaceGeometry(mesh: ValidatedMesh, uvLayer?: StudioMeshUvLayer): InternalResult<BuiltGeometry> {
  const groups = buildSmoothGroups(mesh);
  if (!groups.ok) return groups;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const texcoords: number[] | undefined = uvLayer ? [] : undefined;
  const outputSourceVertexIds: number[] = [];
  const outputSourceNormalFaceIds: Array<number | null> = [];
  const triangleSourceFaceIds: number[] = [];
  const outputIndexByKey = new Map<string, number>();

  for (const faceData of mesh.faces) {
    const uvByVertex = uvLayer ? new Map(faceData.vertexIds.map((id, index) => [id,
      uvLayer.corners[faceData.halfEdgeIds[index] ?? -1]] as const)) : null;
    for (const triangle of faceData.triangles) {
      triangleSourceFaceIds.push(faceData.face.id);
      const flatNormal = faceData.warped && !faceData.face.smooth
        ? normalized(newellNormal(triangle.map((id) => mesh.vertexById.get(id)!.position))) : faceData.normal;
      if (!flatNormal) return stop(issue("error", "normal-unresolved", "Non-planar triangle normal is unstable"));
      for (const sourceVertexId of triangle) {
        const groupId = faceData.face.smooth
          ? groups.value.groupByCorner.get(`${sourceVertexId}:${faceData.face.id}`)
          : undefined;
        if (faceData.face.smooth && groupId === undefined) {
          return stop(issue("error", "normal-unresolved", `No smoothing group for vertex ${sourceVertexId}`, { vertexIds: [sourceVertexId], faceIds: [faceData.face.id] }));
        }
        const uv = uvByVertex?.get(sourceVertexId);
        if (uvLayer && !uv) return stop(issue("error", "uv-coordinate-invalid", "GLB 원본 면의 UV 코너를 찾지 못했습니다."));
        // Blender의 V-up 코너를 glTF 이미지 좌표로 바꾸며 타일 밖 좌표도 보존한다.
        const uvKey = uv ? `:uv:${uv.u}:${Math.fround(1 - uv.v)}` : "";
        const key = (faceData.face.smooth
          ? `smooth:${sourceVertexId}:${groupId}`
          : `flat:${faceData.face.id}:${faceData.warped ? `${triangle.join(",")}:` : ""}${sourceVertexId}`) + uvKey;
        let outputIndex = outputIndexByKey.get(key);
        if (outputIndex === undefined) {
          outputIndex = outputSourceVertexIds.length;
          if (outputIndex > 0xffff_ffff) {
            return stop(issue("error", "index-overflow", "Output requires indices wider than uint32"));
          }
          const position = mesh.vertexById.get(sourceVertexId)!.position;
          const normal = faceData.face.smooth
            ? groups.value.normalByGroup.get(`${sourceVertexId}:${groupId}`)!
            : flatNormal;
          positions.push(position.x, position.y, position.z);
          normals.push(normal.x, normal.y, normal.z);
          if (uv && texcoords) texcoords.push(uv.u, 1 - uv.v);
          outputSourceVertexIds.push(sourceVertexId);
          outputSourceNormalFaceIds.push(faceData.face.smooth ? null : faceData.face.id);
          outputIndexByKey.set(key, outputIndex);
        }
        indices.push(outputIndex);
      }
    }
  }
  if (indices.length === 0 || positions.length === 0) {
    return stop(issue("error", "empty-mesh", "Triangulation emitted no geometry"));
  }
  return pass({
    positions,
    normals,
    indices,
    ...(texcoords ? { texcoords } : {}),
    outputSourceVertexIds,
    outputSourceNormalFaceIds,
    triangleSourceFaceIds,
  });
}
