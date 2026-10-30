/** 면 코너 UV의 정본 계약. 아일랜드는 이 데이터에서 파생하며 저장하지 않는다. */
import { createSha256Portable } from "../studio-sha256";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

export interface StudioMeshUvCorner {
  /** half-edge의 origin(prev.vertex)에 대응한다. */
  readonly halfEdgeId: number;
  readonly u: number;
  readonly v: number;
}

export interface StudioMeshUvLayer {
  readonly revision: 1;
  readonly topologyHash: string;
  readonly corners: readonly StudioMeshUvCorner[];
}

const encoder = new TextEncoder();
const MAX_CORNERS = 500_000;

/** 좌표·crease·재질·smooth는 제외하고 코너 ID와 연결만 결합한다. */
export function hashStudioMeshUvTopology(mesh: StudioEditableMesh): string {
  const hash = createSha256Portable();
  hash.update(encoder.encode(`toonstudio.mesh-uv-topology.v1|${mesh.revision}|${mesh.nextVertexId}|${mesh.nextHalfEdgeId}|${mesh.nextFaceId}|`));
  for (const vertex of mesh.vertices) hash.update(encoder.encode(`v${vertex.id}:${vertex.he}|`));
  for (const edge of mesh.halfEdges) {
    hash.update(encoder.encode(`h${edge.id}:${edge.vertex}:${edge.face}:${edge.next}:${edge.prev}:${edge.twin}|`));
  }
  for (const face of mesh.faces) hash.update(encoder.encode(`f${face.id}:${face.he}|`));
  return `uv-topology:sha256:${hash.finalizeHex()}`;
}

export function hashStudioMeshUvLayer(layer: StudioMeshUvLayer): string {
  const hash = createSha256Portable();
  hash.update(encoder.encode(`toonstudio.mesh-uv.v1|${layer.topologyHash}|${layer.corners.length}|`));
  for (const corner of layer.corners) {
    hash.update(encoder.encode(`${corner.halfEdgeId}:${corner.u === 0 ? 0 : corner.u}:${corner.v === 0 ? 0 : corner.v}|`));
  }
  return `uv:sha256:${hash.finalizeHex()}`;
}

function recordWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => {
    if (typeof key !== "string" || !keys.includes(key)) return false;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property?.enumerable === true && Object.hasOwn(property, "value");
  });
}

function uvScalar(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}

/** 입력 배열의 길이부터 검사한 뒤 코너를 복사한다. UV collapse와 음수 타일도 유효하다. */
export function decodeStudioMeshUvLayer(value: unknown, mesh: StudioEditableMesh): StudioMeshUvLayer {
  if (!recordWithKeys(value, ["revision", "topologyHash", "corners"])
    || value.revision !== 1 || typeof value.topologyHash !== "string"
    || value.topologyHash !== hashStudioMeshUvTopology(mesh)
    || !Array.isArray(value.corners) || value.corners.length !== mesh.halfEdges.length
    || value.corners.length > MAX_CORNERS) {
    throw new Error("UV 레이어의 버전·위상 결합·코너 수가 올바르지 않습니다.");
  }
  const corners: StudioMeshUvCorner[] = [];
  for (let index = 0; index < value.corners.length; index += 1) {
    const corner: unknown = value.corners[index];
    if (!recordWithKeys(corner, ["halfEdgeId", "u", "v"])
      || corner.halfEdgeId !== mesh.halfEdges[index]?.id
      || !uvScalar(corner.u) || !uvScalar(corner.v)) {
      throw new Error(`UV 코너 ${index}의 ID 또는 유한 Float32 좌표가 올바르지 않습니다.`);
    }
    corners.push({ halfEdgeId: index, u: corner.u === 0 ? 0 : corner.u, v: corner.v === 0 ? 0 : corner.v });
  }
  return { revision: 1, topologyHash: value.topologyHash, corners };
}

export function validateStudioMeshUvLayer(mesh: StudioEditableMesh): string | null {
  if (mesh.uvLayer === undefined) return null;
  try {
    decodeStudioMeshUvLayer(mesh.uvLayer, mesh);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "UV 레이어를 확인할 수 없습니다.";
  }
}

/** 무UV 스냅샷에는 새 키를 추가하지 않아 기존 직렬화 바이트를 유지한다. */
export function snapshotStudioMeshUvLayer(mesh: StudioEditableMesh): { readonly uvLayer?: StudioMeshUvLayer } {
  return mesh.uvLayer === undefined ? {} : { uvLayer: decodeStudioMeshUvLayer(mesh.uvLayer, mesh) };
}

export interface StudioMeshUvIsland {
  readonly id: number;
  readonly faceIds: readonly number[];
  readonly cornerIds: readonly number[];
}

/** 공유 변 양끝의 UV가 방향을 맞춰 정확히 같을 때만 두 면이 같은 아일랜드다. */
export function deriveStudioMeshUvIslands(
  mesh: StudioEditableMesh,
  options: { readonly connectTolerance?: number } = {},
): readonly StudioMeshUvIsland[] {
  const tolerance = options.connectTolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.0001) {
    throw new Error("UV 연결 허용 오차는 0 이상 0.0001 이하의 유한 값이어야 합니다.");
  }
  const layer = mesh.uvLayer;
  if (!layer) return [];
  const invalid = validateStudioMeshUvLayer(mesh);
  if (invalid) throw new Error(invalid);
  const parent = mesh.faces.map(({ id }) => id);
  function find(id: number): number {
    let root = id;
    while (parent[root] !== root) root = parent[root]!;
    while (id !== root) { const next = parent[id]!; parent[id] = root; id = next; }
    return root;
  }
  function equal(a: number, b: number): boolean {
    const left = layer!.corners[a]!;
    const right = layer!.corners[b]!;
    return Math.abs(left.u - right.u) <= tolerance && Math.abs(left.v - right.v) <= tolerance;
  }
  for (const edge of mesh.halfEdges) {
    if (edge.twin < 0 || edge.id > edge.twin) continue;
    const twin = mesh.halfEdges[edge.twin]!;
    if (equal(edge.id, twin.next) && equal(edge.next, twin.id)) {
      const a = find(edge.face); const b = find(twin.face);
      parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, { id: number; faceIds: number[]; cornerIds: number[] }>();
  for (const face of mesh.faces) {
    const id = find(face.id);
    const island = groups.get(id) ?? { id, faceIds: [], cornerIds: [] };
    island.faceIds.push(face.id);
    groups.set(id, island);
  }
  for (const edge of mesh.halfEdges) groups.get(find(edge.face))!.cornerIds.push(edge.id);
  return [...groups.values()].sort((a, b) => a.id - b.id);
}
