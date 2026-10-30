/** UV 편집은 원본 면 코너를 바꾸고 기존 geometry command로 한 번만 커밋한다. */
import {
  faceNormalStudioEditableMesh,
  hashStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  decodeStudioMeshUvLayer,
  deriveStudioMeshUvIslands,
  hashStudioMeshUvLayer,
  hashStudioMeshUvTopology,
  type StudioMeshUvCorner,
  type StudioMeshUvIsland,
  type StudioMeshUvLayer,
} from "../mesh-uv/studio-mesh-uv-authority";

import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

export type StudioHybridDccUvMode = "box" | "planar-xy" | "planar-xz" | "planar-yz";
export interface StudioHybridDccUvPoint { readonly x: number; readonly y: number }
export interface StudioHybridDccUvSelection {
  readonly documentId: string;
  readonly assetId: string;
  readonly sourceHash: string;
  readonly sourceRevision: number;
  readonly uvHash: string;
  readonly islandIds: readonly number[];
  readonly cornerIds: readonly number[];
}
export type StudioHybridDccUvTransform =
  | { readonly kind: "translate"; readonly value: StudioHybridDccUvPoint }
  | { readonly kind: "scale"; readonly value: StudioHybridDccUvPoint }
  | { readonly kind: "rotate"; readonly angleRad: number };
export interface StudioHybridDccUvEditorIsland extends StudioMeshUvIsland {
  readonly polygons: readonly { readonly faceId: number; readonly corners: readonly StudioMeshUvCorner[] }[];
  readonly bounds: { readonly minU: number; readonly minV: number; readonly maxU: number; readonly maxV: number };
}
export interface StudioHybridDccUvEditorModel extends Omit<StudioHybridDccUvSelection, "islandIds" | "cornerIds"> {
  readonly topologyHash: string;
  readonly corners: readonly StudioMeshUvCorner[];
  readonly islands: readonly StudioHybridDccUvEditorIsland[];
}

function source(workspace: StudioHybridDccWorkspace) {
  const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  if (!assetId || !record) throw new Error("UV를 편집할 오브젝트를 먼저 선택하세요.");
  const admitted = validateStudioEditableMeshSerializableAuthority(record.mesh);
  if (!admitted.ok || record.meshHash !== hashStudioEditableMesh(record.mesh)) {
    throw new Error("UV 원본 메시의 정본 결합을 확인할 수 없습니다.");
  }
  return { assetId, record, mesh: record.mesh };
}

function finiteFloat32(value: number): number {
  const result = Math.fround(value);
  if (!Number.isFinite(result)) throw new Error("유한 Float32 범위의 UV 값을 입력하세요.");
  return result === 0 ? 0 : result;
}

/** 박스 투영은 면 법선별 여섯 패치이며 공유 3D 정점도 면마다 UV가 다를 수 있다. */
export function unwrapStudioMeshCornerUvs(mesh: StudioEditableMesh, mode: StudioHybridDccUvMode = "box"): StudioMeshUvLayer {
  const admitted = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!admitted.ok) throw new Error(admitted.detail);
  if (!["box", "planar-xy", "planar-xz", "planar-yz"].includes(mode) || mesh.faces.length === 0) {
    throw new Error("UV 투영 방식 또는 원본 면을 확인하세요.");
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const { position: p } of mesh.vertices) {
    [p.x, p.y, p.z].forEach((value, axis) => {
      minimum[axis] = Math.min(minimum[axis]!, value);
      maximum[axis] = Math.max(maximum[axis]!, value);
    });
  }
  const faceProjection = mesh.faces.map((face) => {
    if (mode !== "box") return { axes: mode === "planar-xy" ? [0, 1] : mode === "planar-xz" ? [0, 2] : [1, 2], patch: 0, flip: false };
    const normal = faceNormalStudioEditableMesh(mesh, face.id);
    const values = [normal.x, normal.y, normal.z];
    const axis = Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)
      ? 0 : Math.abs(normal.y) >= Math.abs(normal.z) ? 1 : 2;
    const positive = values[axis]! >= 0;
    return { axes: axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1], patch: axis * 2 + (positive ? 0 : 1), flip: !positive };
  });
  const corners = mesh.halfEdges.map((edge) => {
    const point = mesh.vertices[mesh.halfEdges[edge.prev]!.vertex]!.position;
    const values = [point.x, point.y, point.z];
    const projection = faceProjection[edge.face]!;
    const uAxis = projection.axes[0]!; const vAxis = projection.axes[1]!;
    const projected = (axis: number) => (values[axis]! - minimum[axis]!) / (maximum[axis]! - minimum[axis]! || 1);
    let u = projected(uAxis); let v = projected(vAxis);
    if (projection.flip) u = 1 - u;
    if (mode === "box") {
      u = (projection.patch % 3 + 0.05 + 0.9 * u) / 3;
      v = (Math.floor(projection.patch / 3) + 0.05 + 0.9 * v) / 2;
    }
    return { halfEdgeId: edge.id, u: finiteFloat32(u), v: finiteFloat32(v) };
  });
  return decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh);
}

/** 마지막 임시 UV 배열은 읽지 않는다. 현재 선택 자산의 정본 UV만 화면 모델로 만든다. */
export function deriveStudioHybridDccUvEditorModel(workspace: StudioHybridDccWorkspace): StudioHybridDccUvEditorModel | null {
  if (!workspace.activeAssetId || !workspace.session.state.geometry.records[workspace.activeAssetId]?.mesh.uvLayer) return null;
  const { assetId, record, mesh } = source(workspace);
  const layer = mesh.uvLayer!;
  const islands = deriveStudioMeshUvIslands(mesh).map((island) => {
    const polygons = island.faceIds.map((faceId) => {
      const face = mesh.faces[faceId]!;
      const corners: StudioMeshUvCorner[] = [];
      let id = face.he;
      do { corners.push(layer.corners[id]!); id = mesh.halfEdges[id]!.next; } while (id !== face.he);
      return { faceId: face.id, corners };
    });
    let minU = Infinity; let minV = Infinity; let maxU = -Infinity; let maxV = -Infinity;
    for (const id of island.cornerIds) {
      const { u, v } = layer.corners[id]!;
      minU = Math.min(minU, u); minV = Math.min(minV, v); maxU = Math.max(maxU, u); maxV = Math.max(maxV, v);
    }
    return { ...island, polygons, bounds: { minU, minV, maxU, maxV } };
  });
  return {
    documentId: workspace.session.state.documentId, assetId, sourceHash: record.meshHash,
    sourceRevision: record.revision, uvHash: hashStudioMeshUvLayer(layer), topologyHash: layer.topologyHash,
    corners: layer.corners, islands,
  };
}

export function createStudioHybridDccUvSelection(workspace: StudioHybridDccWorkspace, islandIds: readonly number[], cornerIds: readonly number[] = []): StudioHybridDccUvSelection {
  const model = deriveStudioHybridDccUvEditorModel(workspace);
  if (!model) throw new Error("먼저 선택한 오브젝트의 UV를 펼치세요.");
  if (!Array.isArray(islandIds) || islandIds.length > model.islands.length) throw new Error("UV 아일랜드 선택 예산을 넘었습니다.");
  if (!Array.isArray(cornerIds) || cornerIds.length > model.corners.length) throw new Error("UV 코너 선택 예산을 넘었습니다.");
  const selectedCorners = [...new Set(cornerIds)].sort((a, b) => a - b);
  if (selectedCorners.some((id) => !Number.isSafeInteger(id) || model.corners[id]?.halfEdgeId !== id)) throw new Error("현재 UV에 없는 코너를 선택할 수 없습니다.");
  const ids = [...new Set(islandIds)].sort((a, b) => a - b);
  const admitted = new Set(model.islands.map(({ id }) => id));
  if (ids.some((id) => !Number.isSafeInteger(id) || !admitted.has(id))) throw new Error("현재 UV에 없는 아일랜드를 선택할 수 없습니다.");
  return {
    documentId: model.documentId, assetId: model.assetId, sourceHash: model.sourceHash,
    sourceRevision: model.sourceRevision, uvHash: model.uvHash, islandIds: ids, cornerIds: selectedCorners,
  };
}

export function workspaceUnwrapUvActive(workspace: StudioHybridDccWorkspace, mode: StudioHybridDccUvMode = "box"): StudioHybridDccWorkspace {
  const { assetId, mesh } = source(workspace);
  const uvLayer = unwrapStudioMeshCornerUvs(mesh, mode);
  if (mesh.uvLayer && hashStudioMeshUvLayer(mesh.uvLayer) === hashStudioMeshUvLayer(uvLayer)) return workspace;
  return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, assetId, { ...mesh, uvLayer }));
}

/** 동기·불변 명령이므로 미리보기 복사본은 외부 저널·파일에 쓰지 않는다. */
export function workspaceTransformUvIslands(workspace: StudioHybridDccWorkspace, selection: StudioHybridDccUvSelection, request: StudioHybridDccUvTransform): { readonly workspace: StudioHybridDccWorkspace; readonly selection: StudioHybridDccUvSelection } {
  const model = deriveStudioHybridDccUvEditorModel(workspace);
  if (!model || !selection || selection.documentId !== model.documentId || selection.assetId !== model.assetId
    || selection.sourceHash !== model.sourceHash || selection.sourceRevision !== model.sourceRevision || selection.uvHash !== model.uvHash) {
    throw new Error("UV 선택이 현재 문서·오브젝트·편집 버전과 다릅니다. 다시 선택하세요.");
  }
  const admitted = createStudioHybridDccUvSelection(workspace, selection.islandIds, selection.cornerIds);
  if (admitted.islandIds.length === 0 && admitted.cornerIds.length === 0) throw new Error("변환할 UV 아일랜드를 먼저 선택하세요.");
  if (!request || !["translate", "rotate", "scale"].includes(request.kind)) throw new Error("UV 변환 종류가 올바르지 않습니다.");
  if (request.kind === "rotate") {
    if (!Number.isFinite(request.angleRad)) throw new Error("유한한 UV 회전 각도를 입력하세요.");
  } else if (!request.value || !Number.isFinite(request.value.x) || !Number.isFinite(request.value.y)) {
    throw new Error("유한한 UV 변환 값을 입력하세요.");
  }
  const selectedIds = new Set(admitted.islandIds);
  const islands = model.islands.filter(({ id }) => selectedIds.has(id));
  const corners = new Set([...admitted.cornerIds, ...islands.flatMap(({ cornerIds }) => cornerIds)]);
  const selectedFaces = new Set(islands.flatMap(({ faceIds }) => faceIds));
  let px = 0; let py = 0;
  for (const corner of model.corners) {
    if (corners.has(corner.halfEdgeId)) { px += corner.u / corners.size; py += corner.v / corners.size; }
  }
  const { assetId, mesh } = source(workspace);
  const transformed = model.corners.map((corner) => {
    if (!corners.has(corner.halfEdgeId)) return corner;
    let u = corner.u; let v = corner.v;
    if (request.kind === "translate") { u += request.value.x; v += request.value.y; }
    else if (request.kind === "scale") { u = px + (u - px) * request.value.x; v = py + (v - py) * request.value.y; }
    else {
      const x = u - px; const y = v - py; const c = Math.cos(request.angleRad); const s = Math.sin(request.angleRad);
      u = px + x * c - y * s; v = py + x * s + y * c;
    }
    return { ...corner, u: finiteFloat32(u), v: finiteFloat32(v) };
  });
  const uvLayer = decodeStudioMeshUvLayer({ revision: 1, topologyHash: model.topologyHash, corners: transformed }, mesh);
  if (hashStudioMeshUvLayer(uvLayer) === model.uvHash) return { workspace, selection: admitted };
  const next = synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, assetId, { ...mesh, uvLayer }));
  // 좌표가 붙어 연결이 합쳐지면 선택된 면을 포함하는 새 아일랜드로 다시 결합한다.
  const rebound = deriveStudioMeshUvIslands(next.session.state.geometry.records[assetId]!.mesh)
    .filter(({ faceIds }) => faceIds.some((id) => selectedFaces.has(id))).map(({ id }) => id);
  return { workspace: next, selection: createStudioHybridDccUvSelection(next, rebound, admitted.cornerIds) };
}
