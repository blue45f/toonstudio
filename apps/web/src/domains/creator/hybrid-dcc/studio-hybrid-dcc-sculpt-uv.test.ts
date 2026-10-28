import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { surfaceRegressionInputs, surfaceTestQuad } from "../mesh-surface/studio-mesh-surface-test-fixtures";

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

function projected(mesh: StudioEditableMesh) {
  const surface = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!surface.ok) throw new Error(surface.issue.detail);
  return projectStudioMeshSurfaceForRender(mesh, surface.value);
}
function uvAt(mesh: StudioEditableMesh, x: number, y: number) {
  const { positions, indices, cornerUvs } = projected(mesh);
  if (!cornerUvs) throw new Error("실제 표시 UV가 없습니다.");
  const hits: number[][] = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const points = [0, 1, 2].map((corner) => {
      const dense = indices[offset + corner]; if (dense === undefined) throw new Error("표시 index가 없습니다.");
      return [positions[dense * 3] ?? NaN, positions[dense * 3 + 1] ?? NaN];
    });
    const [a, b, c] = points; if (!a || !b || !c) throw new Error("표시 삼각형이 없습니다.");
    const ax = a[0] ?? NaN, ay = a[1] ?? NaN, bx = b[0] ?? NaN, by = b[1] ?? NaN, cx = c[0] ?? NaN, cy = c[1] ?? NaN;
    const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / determinant;
    const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / determinant;
    const weights = [wa, wb, 1 - wa - wb];
    if (weights.every((value) => value >= 0 && value <= 1)) hits.push([0, 1].map((axis) =>
      weights.reduce((sum, weight, corner) => sum + weight * (cornerUvs[(offset + corner) * 2 + axis] ?? NaN), 0)));
  }
  return hits;
}
function orientedUvTriangles(mesh: StudioEditableMesh) {
  const { indices, cornerUvs } = projected(mesh);
  if (!cornerUvs) throw new Error("표시 UV가 없습니다.");
  return Array.from({ length: indices.length / 3 }, (_, triangle) => {
    const corners = [0, 1, 2].map((corner) => ({ id: indices[triangle * 3 + corner] ?? -1,
      uv: [cornerUvs[(triangle * 3 + corner) * 2], cornerUvs[(triangle * 3 + corner) * 2 + 1]] }));
    const first = corners.reduce((index, corner, candidate) => corner.id < (corners[index]?.id ?? -1) ? candidate : index, 0);
    // 삼각형 face의 시작 코너가 회전해도 같은 방향·정점·UV 대응이어야 한다.
    return [0, 1, 2].map((offset) => corners[(first + offset) % 3]);
  });
}

describe("공유 surface의 UV를 보존하는 Sculpt stroke", () => {
  it.each([0, 1e-7])("높이 %s의 무강도·전체 mask stroke는 원본 polygon·법선·비선형 UV를 그대로 반환한다", (height) => {
    const source = surfaceTestQuad(height), before = serializeStudioEditableMesh(source), display = projected(source);
    for (const kind of BRUSHES) for (const locked of [false, true]) {
      const result = applyStudioSculptStroke(source, { ...stroke, kind, strength: locked ? stroke.strength : 0 },
        locked ? createStudioSculptMask(source.vertices.length, 0) : undefined);
      if (!result.ok) throw new Error(result.detail);
      expect(result.mesh).toBe(source); expect(projected(result.mesh)).toBe(display);
      expect(uvAt(result.mesh, .6, .3)).toEqual(uvAt(source, .6, .3));
    }
    expect(uvAt(source, .6, .3)[0]?.[0]).toBeCloseTo(1.2, 12);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it("실제로 움직인 planar quad도 기존 fan의 (0.9,.3)이 아닌 공유 삼각형의 (1.2,.3) 보간을 유지한다", () => {
    const source = surfaceTestQuad(), result = applyStudioSculptStroke(source, {
      kind: "grab", center: { x: .5, y: .5, z: 0 }, radius: 2, strength: .1, direction: { x: 0, y: 0, z: 1 },
    });
    if (!result.ok) throw new Error(result.detail);
    expect(result.mesh).not.toBe(source); expect(result.mesh.faces).toHaveLength(2);
    const before = projected(source), after = projected(result.mesh);
    expect(orientedUvTriangles(result.mesh)).toEqual(orientedUvTriangles(source));
    expect(after.positions.filter((_, index) => index % 3 !== 2)).toEqual(before.positions.filter((_, index) => index % 3 !== 2));
    expect(new Set(after.positions.filter((_, index) => index % 3 === 2)).size).toBe(1);
    const hits = uvAt(result.mesh, .6, .3); expect(hits).toHaveLength(1);
    expect(hits[0]?.[0]).toBeCloseTo(1.2, 12); expect(hits[0]?.[1]).toBeCloseTo(.3, 12);
    expect(after.cornerNormals).toEqual(before.cornerNormals);
  });

  it("실제로 움직인 오목 면도 같은 ear 삼각형을 사용해 역방향·겹침 fan을 만들지 않는다", () => {
    const input = surfaceRegressionInputs().find(({ assetId }) => assetId === "concave-uv"); if (!input) throw new Error("오목 입력이 없습니다.");
    const source = input.mesh, before = projected(source), result = applyStudioSculptStroke(source, { ...stroke, kind: "grab", direction: { x: 0, y: 0, z: 1 } });
    if (!result.ok) throw new Error(result.detail);
    const after = projected(result.mesh); expect(after.indices).toEqual(before.indices); expect(after.cornerUvs).toEqual(before.cornerUvs);
    const signedAreas = Array.from({ length: after.indices.length / 3 }, (_, triangle) => {
      const points = [0, 1, 2].map((corner) => { const dense = after.indices[triangle * 3 + corner] ?? -1; return [after.positions[dense * 3] ?? NaN, after.positions[dense * 3 + 1] ?? NaN]; });
      const [a, b, c] = points; if (!a || !b || !c) throw new Error("삼각형이 없습니다.");
      const ax = a[0] ?? NaN, ay = a[1] ?? NaN;
      return (((b[0] ?? NaN) - ax) * ((c[1] ?? NaN) - ay) - ((b[1] ?? NaN) - ay) * ((c[0] ?? NaN) - ax)) / 2;
    });
    expect(signedAreas).toEqual([1, .800000011920929, 1]); expect(signedAreas.every((area) => area > 0)).toBe(true);
  });

  it("무UV의 8 brush도 표시와 같은 삼각형을 입력으로 사용하며 원본을 바꾸지 않는다", () => {
    const mesh = createStudioUnitCubeMesh(), before = serializeStudioEditableMesh(mesh), surface = planStudioMeshSurface(mesh);
    if (!surface.ok) throw new Error(surface.issue.detail);
    const expected = projectStudioMeshSurfaceForRender(mesh, surface.value).indices;
    for (const kind of BRUSHES) {
      const result = applyStudioSculptStroke(mesh, { ...stroke, kind });
      if (!result.ok) throw new Error(result.detail);
      expect(result.mesh.uvLayer).toBeUndefined();
      const actual = result.mesh.faces.flatMap((face) => {
        const a = result.mesh.halfEdges[face.he], b = a && result.mesh.halfEdges[a.next], c = b && result.mesh.halfEdges[b.next];
        if (!a || !b || !c) throw new Error("결과 삼각형이 없습니다."); return [c.vertex, a.vertex, b.vertex];
      });
      expect(actual).toEqual(Array.from(expected));
    }
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("무UV Sculpt도 원본 슬롯과 경계 crease를 보존하며 UV 키를 만들지 않는다", () => {
    const base = createStudioUnitCubeMesh(), source = { ...base,
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: .25 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: .5 })),
      faces: base.faces.map((face) => ({ ...face, materialSlot: face.id + 7, smooth: false })) };
    const plan = planStudioMeshSurface(source, undefined, { allowCreaseMetadata: true }); if (!plan.ok) throw new Error(plan.issue.detail);
    const result = applyStudioSculptStroke(source, { ...stroke, kind: "grab" }); if (!result.ok) throw new Error(result.detail);
    expect(Object.hasOwn(result.mesh, "uvLayer")).toBe(false);
    expect(result.mesh.faces.map(({ materialSlot }) => materialSlot)).toEqual(plan.value.triangles.map(({ materialSlot }) => materialSlot));
    expect(result.mesh.vertices.every(({ crease }) => crease === .25)).toBe(true);
    const expected = plan.value.triangles.flatMap(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds.map((id, index) =>
      source.halfEdges[id]?.next === cornerHalfEdgeIds[(index + 1) % 3] ? .5 : 0));
    expect(result.mesh.halfEdges.map(({ crease }) => crease)).toEqual(expected);
  });

  it("무UV collinear crease 코너는 공통 표면이 보존한 원본 경계를 그대로 전달한다", () => {
    const base = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: .5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4]]);
    const source = { ...base, vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 1 ? .25 : 0 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: .5 })), faces: base.faces.map((face) => ({ ...face, smooth: false, materialSlot: 7 })) };
    const plan = planStudioMeshSurface(source, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!plan.ok) throw new Error(plan.issue.detail);
    expect(plan.value.triangles).toHaveLength(3); expect(plan.value.triangles.flatMap(({ vertexIds }) => [...vertexIds])).toContain(1);
    const result = applyStudioSculptStroke(source, { ...stroke, kind: "grab", direction: { x: 0, y: 0, z: 1 } });
    if (!result.ok) throw new Error(result.detail);
    const boundaries = new Map<number, number>();
    plan.value.triangles.forEach(({ cornerHalfEdgeIds }, triangle) => cornerHalfEdgeIds.forEach((id, corner) => {
      const target = triangle * 3 + corner;
      if (source.halfEdges[id]?.next === cornerHalfEdgeIds[(corner + 1) % 3]) boundaries.set(id, target);
      else expect(result.mesh.halfEdges[target]?.crease).toBe(0);
    }));
    expect(boundaries.size).toBe(source.halfEdges.length);
    for (const [original, target] of boundaries) expect(result.mesh.halfEdges[target]?.crease).toBe(source.halfEdges[original]?.crease);
    expect(result.mesh.vertices[1]?.crease).toBe(.25); expect(result.mesh.faces.every(({ materialSlot }) => materialSlot === 7)).toBe(true);
    expect(Object.hasOwn(result.mesh, "uvLayer")).toBe(false);
  });

  it("isolated·bowtie·세 면 공유 변의 편집 가능한 원본은 GLB 전용 제약으로 막지 않는다", () => {
    const positions = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }];
    const inputs = [createStudioEditableMeshFromPolygons(positions, [[0, 1, 2]]),
      createStudioEditableMeshFromPolygons(positions, [[0, 1, 2], [0, 3, 4]]),
      createStudioEditableMeshFromPolygons(positions, [[0, 1, 2], [1, 0, 3], [0, 1, 4]])];
    for (const source of inputs) {
      const before = serializeStudioEditableMesh(source), result = applyStudioSculptStroke(source, { ...stroke, kind: "grab", strength: 0 });
      if (!result.ok) throw new Error(result.detail); expect(result.mesh).toBe(source); expect(serializeStudioEditableMesh(source)).toEqual(before);
    }
  });

  it.each(BRUSHES)("%s은 UV 유무와 같은 위치 계산 및 공유 corner provenance를 보존한다", (kind) => {
    const plain = createStudioUnitCubeMesh(); const source = withUv(plain); const before = serializeStudioEditableMesh(source);
    const legacy = applyStudioSculptStroke(plain, { ...stroke, kind });
    const result = applyStudioSculptStroke(source, { ...stroke, kind });
    if (!legacy.ok || !result.ok) throw new Error(!legacy.ok ? legacy.detail : !result.ok ? result.detail : "Sculpt 실패");
    expect(result.mesh.vertices.map(({ position }) => position)).toEqual(legacy.mesh.vertices.map(({ position }) => position));
    expect(result.mesh.halfEdges.map(({ vertex, face, next, prev, twin }) => [vertex, face, next, prev, twin])).toEqual(legacy.mesh.halfEdges.map(({ vertex, face, next, prev, twin }) => [vertex, face, next, prev, twin]));
    const surface = planStudioMeshSurface(source); if (!surface.ok) throw new Error(surface.issue.detail);
    const sourceIds = surface.value.triangles.flatMap(({ cornerHalfEdgeIds }) => [...cornerHalfEdgeIds]);
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
    const surface = planStudioMeshSurface(source); if (!surface.ok) throw new Error(surface.issue.detail);
    for (const [index, triangle] of surface.value.triangles.entries()) {
      triangle.cornerHalfEdgeIds.forEach((id, corner) => {
        const target = index * 3 + corner;
        if (source.halfEdges[id]?.next === triangle.cornerHalfEdgeIds[(corner + 1) % 3]) boundary.set(id, target);
        else expect(connected(result.mesh, target)).toBe(true);
      });
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
    const collapsed = { kind: "flatten" as const, center: { x: 0, y: 0, z: 0 }, radius: 1e20, strength: 1, direction: { x: 1, y: 0, z: 0 } };
    expect(applyStudioSculptStroke(workspaceMesh(source), collapsed).ok).toBe(false);
    expect(() => workspaceSculptActive(source, collapsed)).toThrow(/결과 표면/u);
    expect(() => workspaceVoxelRemeshActive(source, 0.1)).toThrow(/현재 UV를 보존할 수 없어 취소/u);
    expect(source.session.state).toBe(state); expect(source.session.undoStack).toBe(undo); expect(source.session.redoStack).toBe(redo);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
  });
});
