/** 실제 chord 결과·문서 명령·viewport projection을 사용하며 WebGL은 실행하지 않는다. */
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import { selectStudioHybridDccComponentFaceOverlayIndices } from "./studio-hybrid-dcc-component-face-overlay";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { deriveStudioHybridDccViewportSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceComponentSelectionSource,
} from "./studio-hybrid-dcc-workspace";

function need<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("실제 선택 표시 회귀의 입력이 없습니다.");
  return value;
}
function fixture(options: { readonly uv?: boolean; readonly crease?: boolean } = {}) {
  let workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("face-overlay"), "cube");
  const original = need(workspaceComponentSelectionSource(workspace));
  if (options.uv || options.crease) {
    const first = need(original.mesh.halfEdges[0]);
    const attributed = { ...original.mesh,
      vertices: original.mesh.vertices.map((vertex) => options.crease && vertex.id === 0 ? { ...vertex, crease: 0.375 } : vertex),
      halfEdges: original.mesh.halfEdges.map((edge) => options.crease && (edge.id === first.id || edge.id === first.twin)
        ? { ...edge, crease: 0.625 } : edge),
    };
    const loops = need(readStudioMeshFaceLoops(attributed));
    const mesh = !options.uv ? attributed : { ...attributed, uvLayer: decodeStudioMeshUvLayer({ revision: 1,
      topologyHash: hashStudioMeshUvTopology(attributed), corners: loops.flatMap((loop) => {
        const axes = (["x", "y", "z"] as const).filter((axis) => new Set(loop.vertexIds.map((id) => need(attributed.vertices[id]).position[axis])).size > 1);
        const u = need(axes[0]), v = need(axes[1]);
        return loop.vertexIds.map((id, index) => ({ halfEdgeId: need(loop.halfEdgeIds[index]),
          u: need(attributed.vertices[id]).position[u] + 0.5, v: need(attributed.vertices[id]).position[v] + 0.5 }));
      }).sort((left, right) => left.halfEdgeId - right.halfEdgeId) }, attributed) };
    workspace = synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, "cube", mesh));
  }
  const source = need(workspaceComponentSelectionSource(workspace)), loops = need(readStudioMeshFaceLoops(source.mesh));
  const face = need(loops.find((loop) => loop.vertexIds.every((id) => need(source.mesh.vertices[id]).position.z === 0.5)));
  const originalSnapshot = serializeStudioEditableMesh(source.mesh);
  const outcome = splitStudioEditableFaceBoundaryChordWithUv({ mesh: source.mesh, meshHash: source.sourceHash, meshRevision: source.meshRevision }, {
    sourceMeshHash: source.sourceHash, sourceMeshRevision: source.meshRevision, faceId: face.id,
    start: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[0]), t: 0.25 },
    end: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[2]), t: 0.75 },
  });
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.messageKo}`);
  const committed = synchronizeWorkspaceGeometryAuthority(workspace,
    hybridDccCommitGeometry(workspace.session, "cube", outcome.mesh));
  const snapshot = deriveStudioHybridDccViewportSnapshot(committed, "face", true);
  expect(snapshot.errors).toEqual([]);
  expect(serializeStudioEditableMesh(source.mesh)).toEqual(originalSnapshot);
  const asset = need(snapshot.assets.find(({ assetId }) => assetId === "cube"));
  expect(asset.renderSource).toBe("authority-edit-cage");
  return { asset, selected: outcome.selectionFaceIds, committed };
}
function trianglePositions(asset: ReturnType<typeof fixture>["asset"], indices: Uint32Array) {
  return Array.from(indices, (id) => [need(asset.positions[id * 3]), need(asset.positions[id * 3 + 1]), need(asset.positions[id * 3 + 2])]);
}
function area(positions: readonly (readonly number[])[]): number {
  let total = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const a = need(positions[index]), b = need(positions[index + 1]), c = need(positions[index + 2]);
    const point = (value: readonly number[]) => new Vector3(need(value[0]), need(value[1]), need(value[2]));
    total += point(b).sub(point(a)).cross(point(c).sub(point(a))).length() / 2;
  }
  return total;
}
function expectFrontCoverage(f: ReturnType<typeof fixture>) {
  const indices = need(selectStudioHybridDccComponentFaceOverlayIndices(f.asset, f.selected));
  expect(indices).toHaveLength(12);
  const positions = trianglePositions(f.asset, indices);
  expect(positions.every((point) => point[2] === 0.5)).toBe(true);
  expect(area(positions)).toBe(1);
  const geometry = new BufferGeometry().setAttribute("position", new BufferAttribute(f.asset.positions, 3))
    .setIndex(new BufferAttribute(indices, 1));
  const material = new MeshBasicMaterial({ side: DoubleSide }), overlay = new Mesh(geometry, material);
  try {
    overlay.updateMatrixWorld(true);
    for (const x of [-0.4, 0.1]) {
      const ray = new Raycaster(new Vector3(x, 0, 2), new Vector3(0, 0, -1));
      expect(ray.intersectObject(overlay, false).length).toBeGreaterThan(0);
    }
  } finally { geometry.dispose(); material.dispose(); }
}

describe("면 선택 overlay의 실제 surface triangle 대응", () => {
  it("기본 무UV·crease 0 cube의 실제 chord 뒤 두 child 전체와 +Z 면만 표시한다", () => {
    const f = fixture(), inspection = inspectStudioMeshSurfaceForInteractiveProjection(f.asset.mesh);
    if (!inspection.ok) throw new Error(inspection.message);
    expect(f.selected).toEqual([1, 6]);
    expect(f.asset.mesh.uvLayer).toBeUndefined();
    expect(f.asset.mesh.vertices.every(({ crease }) => crease === 0)).toBe(true);
    expect(f.asset.mesh.halfEdges.every(({ crease }) => crease === 0)).toBe(true);
    expect(readStudioMeshFaceLoops(f.asset.mesh)?.map(({ vertexIds }) => vertexIds.length)).toEqual([4, 4, 5, 5, 4, 4, 4]);
    expect(inspection.value.plan.triangles).toHaveLength(14);
    expectFrontCoverage(f);
  });

  it("collinear 생략 면보다 뒤의 face 4를 선택해도 실제 -X 면만 표시한다", () => {
    const f = fixture(), indices = need(selectStudioHybridDccComponentFaceOverlayIndices(f.asset, [4]));
    expect(indices).toHaveLength(6);
    const positions = trianglePositions(f.asset, indices);
    expect(positions.every((point) => point[0] === -0.5)).toBe(true);
    expect(area(positions)).toBe(1);
  });

  it.each([
    { name: "UV", uv: true, crease: false }, { name: "nonzero crease", uv: false, crease: true },
    { name: "UV와 nonzero crease", uv: true, crease: true },
  ])("$name로 collinear 코너를 보존하는 실제 표시도 같은 child를 선택하고 원본을 변경하지 않는다", (options) => {
    const f = fixture(options), before = serializeStudioEditableMesh(f.asset.mesh);
    const positions = f.asset.positions.slice(), indices = f.asset.indices.slice();
    const inspection = inspectStudioMeshSurfaceForInteractiveProjection(f.asset.mesh);
    if (!inspection.ok) throw new Error(inspection.message);
    expect(inspection.value.plan.triangles).toHaveLength(16);
    expectFrontCoverage(f);
    expect(serializeStudioEditableMesh(f.asset.mesh)).toEqual(before);
    expect(f.asset.positions).toEqual(positions); expect(f.asset.indices).toEqual(indices);
  });

  it("실제 triangle 총수가 부족하거나 더 많으면 부분 overlay를 반환하지 않는다", () => {
    const f = fixture();
    expect(selectStudioHybridDccComponentFaceOverlayIndices({ ...f.asset, indices: f.asset.indices.slice(0, -3) }, f.selected)).toBeNull();
    expect(selectStudioHybridDccComponentFaceOverlayIndices({ ...f.asset, indices: Uint32Array.from([...f.asset.indices, 0, 1, 2]) }, f.selected)).toBeNull();
  });

  it("선택 면 누락이나 선택 triangle의 위치 index 범위 오류를 원자적으로 거부한다", () => {
    const f = fixture(), inspection = inspectStudioMeshSurfaceForInteractiveProjection(f.asset.mesh);
    if (!inspection.ok) throw new Error(inspection.message);
    for (const selected of [[], [999], [1, 999], [-1], [0.5]]) expect(selectStudioHybridDccComponentFaceOverlayIndices(f.asset, selected)).toBeNull();
    const triangle = inspection.value.plan.triangles.findIndex(({ faceId }) => faceId === 6);
    expect(triangle).toBeGreaterThanOrEqual(0);
    const invalid = f.asset.indices.slice(); invalid[triangle * 3] = f.asset.positions.length / 3;
    expect(selectStudioHybridDccComponentFaceOverlayIndices({ ...f.asset, indices: invalid }, [1, 6])).toBeNull();
    expect(selectStudioHybridDccComponentFaceOverlayIndices({ ...f.asset, positions: f.asset.positions.slice(0, -1) }, f.selected)).toBeNull();
    const invalidPosition = f.asset.positions.slice(), first = need(f.asset.indices[triangle * 3]);
    invalidPosition[first * 3] = NaN;
    expect(selectStudioHybridDccComponentFaceOverlayIndices({ ...f.asset, positions: invalidPosition }, [1, 6])).toBeNull();
  });
});
