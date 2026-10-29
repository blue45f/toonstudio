/** 선택 컴포넌트의 원본 정점만 변환하고, 문서·선택을 한 번에 새 권위 상태로 돌려준다. */
import {
  hashStudioEditableMesh,
  STUDIO_EDITABLE_MESH_LIMITS,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE } from "../studio-geometry-authority";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
  type StudioHybridDccSelectionResult,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { validateStudioHybridDccComponentRenderAdmission } from "./studio-hybrid-dcc-component-render-admission";
import {
  createStudioHybridDccIdentityTransform,
  normalizeStudioHybridDccObjectTransform,
  transformStudioHybridDccPoint,
} from "./studio-hybrid-dcc-object-transform";
import {
  synchronizeWorkspaceGeometryAuthority,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

export interface StudioHybridDccComponentTransform {
  readonly kind: "translate" | "rotate" | "scale";
  /** 이동은 로컬 거리, 회전은 intrinsic XYZ 라디안, 크기는 각 축의 배율이다. */
  readonly value: StudioMeshVec3;
}

export interface StudioHybridDccComponentTransformResult {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
}

function selectedValue<T>(result: StudioHybridDccSelectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`선택한 컴포넌트를 확인할 수 없습니다: ${result.diagnostics.map(({ code }) => code).join(" · ")}`);
  }
  return result.value;
}

function selectedVertices(
  mesh: StudioEditableMesh,
  selection: StudioHybridDccComponentSelection,
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const elementId of selection.elementIds) {
    if (selection.mode === "vertex") {
      ids.add(elementId);
    } else if (selection.mode === "edge") {
      const edge = mesh.halfEdges[elementId]!;
      ids.add(edge.vertex);
      ids.add(mesh.halfEdges[edge.prev]!.vertex);
    } else {
      const start = mesh.faces[elementId]!.he;
      let current = start;
      do {
        const edge = mesh.halfEdges[current]!;
        ids.add(edge.vertex);
        current = edge.next;
      } while (current !== start);
    }
  }
  return ids;
}

/** 토폴로지는 그대로여도 좌표 이동으로 변이나 면이 붕괴할 수 있으므로 커밋 전에 검사한다. */
function validateGeometry(mesh: StudioEditableMesh): void {
  for (const vertex of mesh.vertices) {
    for (const coordinate of [vertex.position.x, vertex.position.y, vertex.position.z]) {
      if (!Number.isFinite(coordinate)
        || Math.abs(coordinate) > STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE) {
        throw new Error("변환 결과가 편집 좌표의 유한 범위를 벗어났습니다.");
      }
    }
  }
  for (const face of mesh.faces) {
    let current = face.he;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    do {
      const edge = mesh.halfEdges[current]!;
      const a = mesh.vertices[edge.vertex]!.position;
      const b = mesh.vertices[mesh.halfEdges[edge.next]!.vertex]!.position;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= 1e-12) {
        throw new Error("변환으로 모서리의 길이가 0이 되어 적용할 수 없습니다.");
      }
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
      current = edge.next;
    } while (current !== face.he);
    if (Math.hypot(nx, ny, nz) / 2 <= STUDIO_EDITABLE_MESH_LIMITS.areaEpsilon) {
      throw new Error("변환으로 면의 넓이가 0이 되어 적용할 수 없습니다.");
    }
  }
}

/**
 * 입력과 외부 저장소를 바꾸지 않는 동기 명령이다. 미리보기는 반환 복사본만 뷰포트에 투영하고,
 * 적용할 때 최신 workspace/selection으로 다시 호출한다. 문서 커밋은 독립 저널을 생성한다.
 */
export function workspaceTransformComponents(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
  request: StudioHybridDccComponentTransform,
): StudioHybridDccComponentTransformResult {
  if (selection.mode === "object" || selection.elementIds.length === 0) {
    throw new Error("변환할 정점·모서리·면을 먼저 선택하세요.");
  }
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("선택한 오브젝트의 원본 메시가 없습니다.");
  const admitted = validateStudioEditableMeshSerializableAuthority(source.mesh);
  if (!admitted.ok) throw new Error(`원본 메시를 편집할 수 없습니다: ${admitted.detail}`);
  selectedValue(validateStudioHybridDccComponentSelection(selection, source));
  if (!request || !["translate", "rotate", "scale"].includes(request.kind) || !request.value) {
    throw new Error("컴포넌트 변환 종류와 세 축의 값이 필요합니다.");
  }
  const components = [request.value.x, request.value.y, request.value.z] as const;
  let transform = createStudioHybridDccIdentityTransform();
  try {
    transform = normalizeStudioHybridDccObjectTransform({
      ...transform,
      ...(request.kind === "translate" ? { position: components }
        : request.kind === "rotate" ? { rotationEulerRad: components } : { scale: components }),
    });
  } catch {
    throw new Error("유한한 변환 값을 입력하세요. 크기 배율은 0에 가까울 수 없고 편집 범위를 넘을 수 없습니다.");
  }
  if (components.every((value) => value === (request.kind === "scale" ? 1 : 0))) {
    validateGeometry(source.mesh);
    return { workspace, selection };
  }

  const ids = selectedVertices(source.mesh, selection);
  const pivot = { x: 0, y: 0, z: 0 };
  // 정점의 정규 ID 순서로 더해 같은 집합의 중심이 선택 모드·면 순서에 의존하지 않게 한다.
  for (const vertex of source.mesh.vertices) {
    if (!ids.has(vertex.id)) continue;
    const point = vertex.position;
    pivot.x += point.x / ids.size;
    pivot.y += point.y / ids.size;
    pivot.z += point.z / ids.size;
  }
  const mesh: StudioEditableMesh = {
    ...source.mesh,
    vertices: source.mesh.vertices.map((vertex) => {
      if (!ids.has(vertex.id)) return vertex;
      const point = vertex.position;
      if (request.kind === "translate") {
        return { ...vertex, position: {
          x: point.x + request.value.x, y: point.y + request.value.y, z: point.z + request.value.z,
        } };
      }
      const transformed = transformStudioHybridDccPoint(
        [point.x - pivot.x, point.y - pivot.y, point.z - pivot.z], transform,
      );
      return { ...vertex, position: {
        x: transformed[0] + pivot.x, y: transformed[1] + pivot.y, z: transformed[2] + pivot.z,
      } };
    }),
  };
  validateGeometry(mesh);
  validateStudioHybridDccComponentRenderAdmission(source.mesh, mesh);
  const sourceHash = hashStudioEditableMesh(mesh);
  if (sourceHash === source.sourceHash) return { workspace, selection };
  const rebound = selectedValue(mutateStudioHybridDccComponentSelection(
    createStudioHybridDccComponentSelection(), {
      mode: selection.mode,
      operation: "replace",
      ids: selection.elementIds,
      activeId: selection.activeElementId,
      source: { ...source, mesh, sourceHash, meshRevision: source.meshRevision + 1 },
    },
  ));
  const session = hybridDccCommitGeometry(workspace.session, source.assetId, mesh);
  return {
    workspace: synchronizeWorkspaceGeometryAuthority(workspace, session),
    selection: rebound,
  };
}
