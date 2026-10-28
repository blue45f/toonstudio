import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioCommandJournal } from "../studio-command-journal";

import { applyStudioSculptStroke, createStudioSculptMask, voxelRemeshStudioMesh, type StudioSculptBrushKind } from "./studio-hybrid-sculpt-kernel";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube, workspaceRedo, workspaceSculptActive, workspaceUndo, workspaceVoxelRemeshActive, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

const BRUSHES: readonly StudioSculptBrushKind[] = ["grab", "smooth", "inflate", "clay", "crease", "flatten", "scrape", "snakeHook"];
const stroke = { center: { x: 0.1, y: 0.2, z: 0.3 }, radius: 2, strength: 0.08, direction: { x: 0.25, y: 1, z: -0.5 } };

function withUv(mesh = createStudioUnitCubeMesh()): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id * id / 8 - 3, v: id * id * id / 16 + 0.25 })) }, mesh) };
}

function workspaceMesh(workspace: StudioHybridDccWorkspace): StudioEditableMesh {
  const record = workspace.session.state.geometry.records.cube;
  if (!record) throw new Error("큐브가 없습니다."); return record.mesh;
}

interface UvGlb {
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: { readonly TEXCOORD_0: number } }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly count: number; readonly componentType: number; readonly type: string }[];
  readonly bufferViews: readonly { readonly byteOffset: number; readonly byteLength: number }[];
}

function glbUvPairs(bytes: Uint8Array): readonly (readonly [number, number])[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as UvGlb;
  const pairs: Array<readonly [number, number]> = [];
  for (const primitive of json.meshes[0]?.primitives ?? []) {
    const accessor = json.accessors[primitive.attributes.TEXCOORD_0];
    const buffer = accessor ? json.bufferViews[accessor.bufferView] : undefined;
    if (!accessor || !buffer) throw new Error("GLB UV accessor가 없습니다.");
    expect(accessor).toMatchObject({ componentType: 5126, type: "VEC2" });
    expect(buffer.byteLength).toBe(accessor.count * 8);
    const offset = 20 + jsonLength + 8 + buffer.byteOffset;
    for (let index = 0; index < accessor.count; index += 1) pairs.push([view.getFloat32(offset + index * 8, true), view.getFloat32(offset + index * 8 + 4, true)]);
  }
  return pairs;
}

describe("UV를 보존하는 기존 Sculpt stroke", () => {
  it("무UV의 8 brush 결과 해시는 기존 기준선과 정확히 같다", () => {
    const mesh = createStudioUnitCubeMesh();
    const hashes = Object.fromEntries(BRUSHES.map((kind) => {
      const result = applyStudioSculptStroke(mesh, { ...stroke, kind });
      if (!result.ok) throw new Error(result.detail);
      expect(result.mesh.uvLayer).toBeUndefined();
      return [kind, hashStudioEditableMesh(result.mesh)];
    }));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "clay": "mesh:sha256:58d77d10c278c18b1bd50c76fd290e0e868aac8ade145792d152ce847c795b57",
        "crease": "mesh:sha256:19abf9934f265a3e2d1549cfad47c34a8d347d946a8fe7eb66900bce489761fa",
        "flatten": "mesh:sha256:52cc56faf45c3a7e8d01cebb051d6300ceab8ace80f4e66433d3fad8b4c24973",
        "grab": "mesh:sha256:ef780b69a11a312eda7ba2065f85036cafead64abf9d3ccb66804b6176868e56",
        "inflate": "mesh:sha256:893acf683c2d11d48f4ae9330aec8a3ae34fc0d239331ac9220e6e016d45984d",
        "scrape": "mesh:sha256:7b2c838550cb73cccbb05f82a10b2b31e838487c806cef8872f2d5f1f3c61354",
        "smooth": "mesh:sha256:3a1a2ced659fafb3403d4fb47a152ad79cb0076b7c87dadb828f907032fc84d3",
        "snakeHook": "mesh:sha256:ef780b69a11a312eda7ba2065f85036cafead64abf9d3ccb66804b6176868e56",
      }
    `);
  });

  it.each(BRUSHES)("%s은 기존 위치 계산과 비선형 seam UV의 원본 corner fan을 함께 보존한다", (kind) => {
    const plain = createStudioUnitCubeMesh(); const source = withUv(plain); const before = serializeStudioEditableMesh(source);
    const legacy = applyStudioSculptStroke(plain, { ...stroke, kind });
    const result = applyStudioSculptStroke(source, { ...stroke, kind });
    if (!legacy.ok || !result.ok) throw new Error(!legacy.ok ? legacy.detail : !result.ok ? result.detail : "Sculpt 실패");
    expect(result.mesh.vertices.map(({ position }) => position)).toEqual(legacy.mesh.vertices.map(({ position }) => position));
    expect(result.mesh.halfEdges.map(({ vertex, face, next, prev, twin }) => [vertex, face, next, prev, twin])).toEqual(legacy.mesh.halfEdges.map(({ vertex, face, next, prev, twin }) => [vertex, face, next, prev, twin]));
    const sourceIds = source.faces.flatMap(({ he }) => [he, he + 1, he + 2, he, he + 2, he + 3]);
    expect(result.mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual(sourceIds.map((id) => {
      const corner = source.uvLayer?.corners[id]; if (!corner) throw new Error("UV가 없습니다."); return [corner.u, corner.v];
    }));
    expect(result.mesh.faces.every(({ smooth }) => smooth === false)).toBe(true);
    expect(deriveStudioMeshUvIslands(result.mesh)).toHaveLength(6);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it.each(BRUSHES)("%s mask는 무UV와 같은 정점에 적용되며 잠긴 정점의 위치와 UV를 바꾸지 않는다", (kind) => {
    const source = withUv(); const mask = createStudioSculptMask(source.vertices.length, 1); mask[0] = 0; mask[3] = 0;
    const { uvLayer: _uv, ...plain } = source;
    const legacy = applyStudioSculptStroke(plain, { ...stroke, kind }, mask);
    const result = applyStudioSculptStroke(source, { ...stroke, kind }, mask);
    if (!result.ok || !legacy.ok) throw new Error("mask Sculpt에 실패했습니다.");
    expect(result.mesh.vertices.map(({ position }) => position)).toEqual(legacy.mesh.vertices.map(({ position }) => position));
    expect(result.mesh.vertices[0]?.position).toEqual(source.vertices[0]?.position);
    expect(result.mesh.vertices[3]?.position).toEqual(source.vertices[3]?.position);
    expect(result.mesh.uvLayer?.corners).toHaveLength(36);
  });

  it("우회 연결로 같은 island인 내부 seam도 각 twin 양끝의 UV 연결 여부를 그대로 유지한다", () => {
    const plain = createStudioUnitCubeMesh();
    const source = { ...plain, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(plain),
      corners: plain.halfEdges.map((edge) => {
        const origin = plain.halfEdges[edge.prev]?.vertex;
        if (origin === undefined) throw new Error("원본 origin이 없습니다.");
        return { halfEdgeId: edge.id, u: origin / 8 + (edge.id === 0 ? 1 : 0), v: origin * origin / 16 };
      }) }, plain) };
    function connected(mesh: StudioEditableMesh, id: number): boolean {
      const edge = mesh.halfEdges[id]; const twin = edge ? mesh.halfEdges[edge.twin] : undefined;
      if (!edge || !twin || !mesh.uvLayer) throw new Error("대조할 UV twin이 없습니다.");
      const a = mesh.uvLayer.corners[id]; const b = mesh.uvLayer.corners[twin.next];
      const c = mesh.uvLayer.corners[edge.next]; const d = mesh.uvLayer.corners[twin.id];
      if (!a || !b || !c || !d) throw new Error("대조할 UV endpoint가 없습니다.");
      return a.u === b.u && a.v === b.v && c.u === d.u && c.v === d.v;
    }
    expect(deriveStudioMeshUvIslands(source)).toHaveLength(1);
    expect(source.halfEdges.some((edge) => !connected(source, edge.id))).toBe(true);
    const result = applyStudioSculptStroke(source, { ...stroke, kind: "grab" });
    if (!result.ok) throw new Error(result.detail);
    const boundary = new Map<number, number>();
    for (const face of source.faces) {
      const offset = face.id * 6;
      [0, 1, 4, 5].forEach((target, index) => boundary.set(face.he + index, offset + target));
      expect(connected(result.mesh, offset + 2)).toBe(true);
      expect(connected(result.mesh, offset + 3)).toBe(true);
    }
    for (const edge of source.halfEdges) {
      const target = boundary.get(edge.id); const twin = boundary.get(edge.twin);
      if (target === undefined || twin === undefined) throw new Error("경계 코너 대응이 없습니다.");
      expect(result.mesh.halfEdges[target]?.twin).toBe(twin);
      expect(connected(result.mesh, target)).toBe(connected(source, edge.id));
    }
    expect(deriveStudioMeshUvIslands(result.mesh)).toHaveLength(1);
  });

  it("잘못된 UV·비유한 결과는 Result 실패이며 입력 메시를 바꾸지 않고 voxel은 UV를 채택하지 않는다", () => {
    const source = withUv(); const before = serializeStudioEditableMesh(source);
    const invalid = { ...source, uvLayer: { revision: 1 as const, topologyHash: "stale", corners: [] } };
    expect(applyStudioSculptStroke(invalid, { ...stroke, kind: "grab" })).toMatchObject({ ok: false, detail: expect.stringContaining("UV 원본") });
    expect(applyStudioSculptStroke(source, { ...stroke, kind: "grab", direction: { x: NaN, y: 1, z: 0 } }).ok).toBe(false);
    const voxel = voxelRemeshStudioMesh(source, 0.1);
    if (voxel.ok) expect(voxel.mesh.uvLayer).toBeUndefined();
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it("Sculpt 한 번의 UV 포함 commit·undo/redo·작업파일·실제 GLB가 같은 코너 데이터를 유지한다", () => {
    const initial = workspaceAddUnitCube(createStudioHybridDccWorkspace("sculpt-uv-workspace"), "cube");
    const source = synchronizeWorkspaceGeometryAuthority(initial, hybridDccCommitGeometry(initial.session, "cube", withUv(workspaceMesh(initial))));
    const before = serializeStudioEditableMesh(workspaceMesh(source));
    const journal = serializeStudioCommandJournal(source.session.journal);
    const next = workspaceSculptActive(source, { ...stroke, kind: "grab" });
    const mesh = workspaceMesh(next); const hash = hashStudioEditableMesh(mesh);
    expect(next.session.state.commandCount).toBe(source.session.state.commandCount + 1);
    expect(next.session.undoStack.length).toBe(source.session.undoStack.length + 1);
    expect(next.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(hash);
    expect(JSON.stringify(next.session.journal.records)).toContain(hash);
    const undone = workspaceUndo(next);
    expect(serializeStudioEditableMesh(workspaceMesh(undone))).toEqual(before);
    const redone = workspaceRedo(undone);
    expect(hashStudioEditableMesh(workspaceMesh(redone))).toBe(hash);
    const opened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(redone), { documentId: "sculpt-uv-reopened" });
    expect(serializeStudioEditableMesh(workspaceMesh(opened))).toEqual(serializeStudioEditableMesh(mesh));
    expect(serializeStudioEditableMesh(workspaceMesh(workspaceUndo(opened)))).toEqual(before);
    const exported = exportStudioHybridDccMeshGlb({ assetId: "cube", mesh: workspaceMesh(opened), sourceHash: hash, sourceRevision: 1 });
    if (!exported.ok) throw new Error(JSON.stringify(exported.report));
    const expected = new Set(mesh.uvLayer?.corners.map(({ u, v }) => `${u}|${Math.fround(1 - v)}`));
    const actual = glbUvPairs(exported.bytes);
    expect(actual.length).toBe(36);
    expect(new Set(actual.map(([u, v]) => `${u}|${v}`))).toEqual(expected);
    expect(serializeStudioEditableMesh(workspaceMesh(source))).toEqual(before);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
  });

  it("실패한 Sculpt와 UV 미지원 voxel은 문서·원본 journal·undo/redo를 그대로 유지한다", () => {
    const initial = workspaceAddUnitCube(createStudioHybridDccWorkspace("sculpt-uv-failure"), "cube");
    const source = synchronizeWorkspaceGeometryAuthority(initial, hybridDccCommitGeometry(initial.session, "cube", withUv(workspaceMesh(initial))));
    const state = source.session.state; const undo = source.session.undoStack; const redo = source.session.redoStack;
    const journal = serializeStudioCommandJournal(source.session.journal);
    expect(() => workspaceSculptActive(source, { ...stroke, kind: "grab", direction: { x: NaN, y: 1, z: 0 } })).toThrow();
    expect(() => workspaceVoxelRemeshActive(source, 0.1)).toThrow(/현재 UV를 보존할 수 없어 취소/u);
    expect(source.session.state).toBe(state); expect(source.session.undoStack).toBe(undo); expect(source.session.redoStack).toBe(redo);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
  });
});
