// @vitest-environment jsdom

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { readStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";

import { handoffStudioHybridDccWorkspaceToBg3d, type StudioHybridDccBg3dPersistedAttachment, type StudioHybridDccBg3dPersistRequest } from "./studio-hybrid-dcc-bg3d-handoff";
import { createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES, validateStudioHybridDccFanPolygon, type StudioHybridDccPolygonPoint3 } from "./studio-hybrid-dcc-polygon-validation";
import { canonicalStudioHybridDccFaceLoop, triangulateStudioHybridDccRenderQuad } from "./studio-hybrid-dcc-render-face";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";

const quad: readonly StudioHybridDccPolygonPoint3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0.25], [0, 1, 0]];
const glbSchema = z.object({
  bufferViews: z.array(z.object({ byteOffset: z.number().optional(), byteLength: z.number() })),
  accessors: z.array(z.object({ bufferView: z.number(), byteOffset: z.number().optional(), count: z.number(), type: z.string(), componentType: z.number() })),
  meshes: z.array(z.object({
    extras: z.object({ toonSpectrum: z.object({ sourceFaceTopology: z.array(z.object({ faceId: z.number(), vertexIds: z.array(z.number()), halfEdgeIds: z.array(z.number()) })) }) }),
    primitives: z.array(z.object({
      attributes: z.object({ POSITION: z.number(), NORMAL: z.number() }), indices: z.number(),
      extras: z.object({ toonSpectrum: z.object({ outputSourceVertexIds: z.array(z.number()), sourceFaceIdsByTriangle: z.array(z.number()) }) }),
    })),
  })),
});

function parsed(bytes: Uint8Array) {
  const value = readStudioVrmExportGlb(bytes);
  const root = glbSchema.parse(value.json);
  const read = (index: number): number[] => {
    const accessor = root.accessors[index];
    if (!accessor) throw new Error("GLB accessor가 없습니다.");
    const buffer = root.bufferViews[accessor.bufferView];
    if (!buffer) throw new Error("GLB bufferView가 없습니다.");
    const view = new DataView(value.binary.buffer, value.binary.byteOffset, value.binary.byteLength);
    const offset = (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * (accessor.type === "VEC3" ? 3 : 1) }, (_, cursor) => (
      accessor.componentType === 5126 ? view.getFloat32(offset + cursor * 4, true) : view.getUint32(offset + cursor * 4, true)
    ));
  };
  const mesh = root.meshes[0];
  const primitive = mesh?.primitives[0];
  if (!mesh || !primitive) throw new Error("GLB 원본 면 provenance가 없습니다.");
  const positions = read(primitive.attributes.POSITION);
  const normals = read(primitive.attributes.NORMAL);
  const indices = read(primitive.indices);
  const ids = primitive.extras.toonSpectrum.outputSourceVertexIds;
  const triangles = Array.from({ length: indices.length / 3 }, (_, index) => {
    const output = indices.slice(index * 3, index * 3 + 3);
    return { faceId: primitive.extras.toonSpectrum.sourceFaceIdsByTriangle[index],
      vertexIds: output.map((vertex) => ids[vertex]),
      positions: output.map((vertex) => positions.slice(vertex * 3, vertex * 3 + 3)),
      normals: output.map((vertex) => normals.slice(vertex * 3, vertex * 3 + 3)) };
  });
  return { triangles, topology: mesh.extras.toonSpectrum.sourceFaceTopology };
}

function transformedCube(mode: "vertex" | "edge") {
  const before = workspaceAddUnitCube(createStudioHybridDccWorkspace(`nonplanar-${mode}`), "cube");
  const source = workspaceComponentSelectionSource(before);
  if (!source) throw new Error("원본 메시가 없습니다.");
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode, operation: "replace", ids: mode === "vertex" ? [0] : [0, 1], activeId: 0, source,
  });
  if (!selected.ok) throw new Error("컴포넌트 선택에 실패했습니다.");
  const result = workspaceTransformComponents(before, selected.value, {
    kind: "translate", value: mode === "vertex" ? { x: -0.1, y: -0.2, z: -0.3 } : { x: 0.05, y: -0.05, z: 0.05 },
  });
  return { before, workspace: result.workspace };
}

describe("비평면 quad의 렌더 전용 fan 경계", () => {
  it("원본 순서의 두 삼각형을 만들고 canonical provenance 정렬과 구분한다", () => {
    const ids = [7, 11, 2, 5];
    expect(triangulateStudioHybridDccRenderQuad(ids, quad, 23)).toEqual([[7, 11, 2], [7, 2, 5]]);
    expect(canonicalStudioHybridDccFaceLoop(ids, [30, 31, 32, 33])).toEqual({ vertexIds: [2, 5, 7, 11], halfEdgeIds: [32, 33, 30, 31] });
    expect(ids).toEqual([7, 11, 2, 5]);
    expect(() => validateStudioHybridDccFanPolygon([...quad].reverse(), 23)).not.toThrow();
  });

  it("자기 교차·퇴화·비평면 n-gon·무한 좌표·과대 polygon은 계속 거부한다", () => {
    const invalid: readonly (readonly StudioHybridDccPolygonPoint3[])[] = [
      [[0, 0, 0], [1, 1, 0.25], [0, 1, 0], [1, 0, 0]],
      [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]],
      [[0, 0, 0], [1, 0, 0], [1, 1, 0.25], [0.5, 1.5, 0], [0, 1, 0]],
      [[0, 0, 0], [Number.POSITIVE_INFINITY, 0, 0], [1, 1, 0.25], [0, 1, 0]],
      [[0, 0, 0], [1, 0, 0], [1, 1, 0.25], [0, 1, Number.NaN]],
      Array.from({ length: STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES + 1 }, (_, index): StudioHybridDccPolygonPoint3 => [Math.cos(index), Math.sin(index), 0]),
    ];
    for (const points of invalid) expect(() => validateStudioHybridDccFanPolygon(points, 8)).toThrow();
    expect(() => triangulateStudioHybridDccRenderQuad([0, 1, 1, 3], quad, 8)).toThrow();
  });

  for (const mode of ["vertex", "edge"] as const) {
    it(`${mode} 이동 후 원본 ID·위상을 보존하고 실제 렌더 삼각형을 같은 source face로 매핑한다`, () => {
      const { before, workspace } = transformedCube(mode);
      const original = before.session.state.geometry.records.cube?.mesh;
      const record = workspace.session.state.geometry.records.cube;
      if (!original || !record) throw new Error("큐브 권위가 없습니다.");
      const hash = hashStudioEditableMesh(record.mesh);
      const snapshot = deriveStudioHybridDccViewportSnapshot(workspace, mode);
      expect(snapshot.errors).toEqual([]);
      const asset = snapshot.assets[0];
      const source = workspaceComponentSelectionSource(workspace);
      if (!asset || !source) throw new Error("실제 컴포넌트 렌더 결과가 없습니다.");
      expect(asset.mesh).toBe(record.mesh);
      expect(record.mesh.faces).toBe(original.faces);
      expect(record.mesh.halfEdges).toBe(original.halfEdges);
      expect(record.mesh.vertices.map(({ id }) => id)).toEqual(original.vertices.map(({ id }) => id));
      expect(record.mesh.faces).toHaveLength(6);
      expect(asset.triangleCount).toBe(12);
      for (let triangle = 0; triangle < asset.indices.length / 3; triangle += 1) {
        const mapped = mapStudioHybridDccRayFaceIndex(source, triangle);
        if (!mapped.ok) throw new Error("원본 면 ray mapping에 실패했습니다.");
        expect(mapped.value.triangleVertexIds).toEqual([...asset.indices.slice(triangle * 3, triangle * 3 + 3)]
          .map((index) => record.mesh.vertices[index]?.id));
        expect(record.mesh.faces.some(({ id }) => id === mapped.value.faceId)).toBe(true);
      }
      expect(hashStudioEditableMesh(record.mesh)).toBe(hash);
    });
  }

  it("정본 정렬과 다른 원본 fan 대각선도 GLB 좌표·flat normal·face provenance와 일치한다", () => {
    const sourceMesh = createStudioEditableMeshFromPolygons(quad.map(([x, y, z]) => ({ x, y, z })), [[1, 2, 3, 0]]);
    const mesh = { ...sourceMesh, faces: sourceMesh.faces.map((face) => ({ ...face, smooth: false })) };
    const empty = createStudioHybridDccWorkspace("rotated-warped-loop");
    const workspace = { ...empty, session: hybridDccRegisterAsset(empty.session, "quad", mesh, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    }), activeAssetId: "quad" };
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace, "face");
    expect(snapshot.errors).toEqual([]);
    const asset = snapshot.assets[0];
    if (!asset) throw new Error("비평면 quad 렌더 결과가 없습니다.");
    const exported = exportStudioHybridDccMeshGlb({ assetId: "quad", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(JSON.stringify(exported.report));
    const glb = parsed(exported.bytes);
    expect(glb.topology[0]?.vertexIds[0]).toBe(0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(asset.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(asset.indices, 1));
    const flat = geometry.toNonIndexed();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      flat.computeVertexNormals();
      const normals = flat.getAttribute("normal");
      const surface = new THREE.Mesh(flat, material);
      surface.updateMatrixWorld(true);
      const source = workspaceComponentSelectionSource(workspace);
      if (!source) throw new Error("Ray 선택 원본이 없습니다.");
      for (let triangle = 0; triangle < glb.triangles.length; triangle += 1) {
        const actual = glb.triangles[triangle];
        if (!actual) throw new Error("GLB 삼각형이 없습니다.");
        const vertices = [...asset.indices.slice(triangle * 3, triangle * 3 + 3)];
        expect(actual.vertexIds).toEqual(vertices.map((index) => mesh.vertices[index]?.id));
        expect(actual.faceId).toBe(mesh.faces[0]?.id);
        for (let corner = 0; corner < 3; corner += 1) {
          const normal = actual.normals[corner];
          const position = actual.positions[corner];
          const vertex = vertices[corner];
          if (!normal || !position || vertex === undefined) throw new Error("파생 정점이 없습니다.");
          expect(position).toEqual([...asset.positions.slice(vertex * 3, vertex * 3 + 3)]);
          for (let axis = 0; axis < 3; axis += 1) expect(normal[axis]).toBeCloseTo(normals.getComponent(triangle * 3 + corner, axis), 6);
        }
        const positions = flat.getAttribute("position");
        const center = new THREE.Vector3();
        for (let corner = 0; corner < 3; corner += 1) center.add(new THREE.Vector3().fromBufferAttribute(positions, triangle * 3 + corner));
        center.divideScalar(3);
        const direction = new THREE.Vector3().fromBufferAttribute(normals, triangle * 3);
        const hit = new THREE.Raycaster(center.clone().addScaledVector(direction, 2), direction.negate()).intersectObject(surface)[0];
        expect(hit?.faceIndex).toBe(triangle);
        if (typeof hit?.faceIndex !== "number") throw new Error("실제 표시 삼각형 ray hit가 없습니다.");
        const mapping = mapStudioHybridDccRayFaceIndex(source, hit.faceIndex);
        if (!mapping.ok) throw new Error("실제 ray hit의 source face가 없습니다.");
        expect(mapping.value.faceId).toBe(actual.faceId);
        expect(mapping.value.triangleVertexIds).toEqual(actual.vertexIds);
      }
    } finally { geometry.dispose(); flat.dispose(); material.dispose(); }
  });

  it("변형된 cube를 같은 source ID와 provenance로 실제 GLB handoff까지 전달한다", async () => {
    const { workspace } = transformedCube("vertex");
    const record = workspace.session.state.geometry.records.cube;
    if (!record) throw new Error("큐브 권위가 없습니다.");
    const beforeHash = hashStudioEditableMesh(record.mesh);
    const saved: StudioHybridDccBg3dPersistRequest[] = [];
    const result = await handoffStudioHybridDccWorkspaceToBg3d(workspace, { ports: {
      glbExportExecutionBackend: "direct",
      persistAttachments: async (requests) => {
        saved.push(...requests);
        return requests.map((request): StudioHybridDccBg3dPersistedAttachment => ({ assetId: request.assetId, attachment: {
          id: request.attachmentId, name: request.fileName, mime: "model/gltf-binary", byteSize: request.bytes.byteLength,
          hash: request.expectedSha256, rights: request.rights, source: "local-library",
          generic3dWorkflow: { version: 1, classification: "prop", sourceFormat: "glb" },
        } }));
      },
    } });
    expect(saved).toHaveLength(1);
    const bytes = saved[0]?.bytes;
    if (!bytes) throw new Error("내보낸 GLB가 없습니다.");
    const glb = parsed(bytes);
    expect(glb.triangles).toHaveLength(12);
    expect(glb.topology.map(({ faceId }) => faceId)).toEqual(record.mesh.faces.map(({ id }) => id));
    expect(glb.topology.every(({ vertexIds, halfEdgeIds }) => vertexIds.length === 4 && halfEdgeIds.length === 4)).toBe(true);
    const source = workspaceComponentSelectionSource(workspace);
    const asset = deriveStudioHybridDccViewportSnapshot(workspace, "vertex").assets[0];
    if (!source || !asset) throw new Error("컴포넌트 원본 렌더 결과가 없습니다.");
    const viewportByFace = new Map<number, number[][]>();
    for (let triangle = 0; triangle < asset.indices.length / 3; triangle += 1) {
      const mapping = mapStudioHybridDccRayFaceIndex(source, triangle);
      if (!mapping.ok) throw new Error("Handoff 원본 면 mapping이 없습니다.");
      if (!mapping.value.faceVertexIds.includes(0)) continue;
      const faceTriangles = viewportByFace.get(mapping.value.faceId) ?? [];
      faceTriangles.push([...mapping.value.triangleVertexIds]);
      viewportByFace.set(mapping.value.faceId, faceTriangles);
    }
    expect(viewportByFace.size).toBe(3);
    for (const [faceId, triangles] of viewportByFace) {
      expect(glb.triangles.filter((triangle) => triangle.faceId === faceId).map(({ vertexIds }) => vertexIds)).toEqual(triangles);
    }
    expect(result.deliveryEvidence.canonicalSceneVerified).toBe(true);
    expect(result.deliveryEvidence.modelPersistence.persistedAttachmentCount).toBe(1);
    expect(hashStudioEditableMesh(record.mesh)).toBe(beforeHash);
  });
});
