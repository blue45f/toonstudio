import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../studio-hybrid-dcc-glb-export";
import { transformStudioHybridDccPoint } from "../studio-hybrid-dcc-object-transform";
import { unwrapStudioMeshCornerUvs } from "../studio-hybrid-dcc-uv-edit";

import { decodeStudioNativeGlb } from "./studio-hybrid-dcc-native-glb";
import * as scanBudget from "./studio-hybrid-dcc-native-glb-budget";
import type { StudioNativeImportDecoded } from "./studio-hybrid-dcc-native-import-contracts";

interface TestDocument extends Record<string, unknown> {
  asset: { version: string }; buffers: Array<Record<string, unknown>>; bufferViews: Array<Record<string, unknown>>;
  accessors: Array<Record<string, unknown>>; nodes: Array<Record<string, unknown>>; meshes: Array<{ primitives: Array<Record<string, unknown>> }>;
  materials: Array<Record<string, unknown>>; scenes: Array<{ nodes: number[] }>; scene: number;
}
function at<T>(values: readonly T[], index: number): T { const value = values[index]; if (value === undefined) throw new Error("fixture 항목이 없습니다."); return value; }
function fixture(): { root: TestDocument; bin: Uint8Array } {
  const bin = new Uint8Array(92); const view = new DataView(bin.buffer);
  [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(index * 4, value, true));
  [0.1, 0.2, 0.9, 0.25, 1.25, -0.5, -0.25, 1.5].forEach((value, index) => view.setFloat32(48 + index * 4, value, true));
  [0, 1, 2, 0, 2, 3].forEach((value, index) => view.setUint16(80 + index * 2, value, true));
  return { bin, root: { asset: { version: "2.0" }, buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 32 }, { buffer: 0, byteOffset: 80, byteLength: 12 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 4, type: "VEC2" }, { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" }],
    nodes: [{ name: "비대칭 UV 모델", mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 1 }] }], materials: [{}, {}], scenes: [{ nodes: [0] }], scene: 0 } };
}
function glb(root: TestDocument, bin: Uint8Array): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(root)); const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4; const result = new Uint8Array(28 + jsonLength + binLength);
  const view = new DataView(result.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true); result.fill(32, 20, 20 + jsonLength); result.set(encoded, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true); result.set(bin, 28 + jsonLength); return result;
}
function success(bytes: Uint8Array, format: "glb" | "gltf" | "vrm" = "glb"): StudioNativeImportDecoded {
  const result = decodeStudioNativeGlb(bytes, format); if (!result.ok) throw new Error(JSON.stringify(result.issues)); return result.value;
}
function failure(root: TestDocument, bin: Uint8Array, expected?: string): void {
  const result = decodeStudioNativeGlb(glb(root, bin)); expect(result.ok).toBe(false);
  if (result.ok) throw new Error("실패 fixture가 통과했습니다.");
  if (expected) expect(result.issues.some(({ code }) => code === expected)).toBe(true);
}

describe("순수 GLB·embedded glTF 원본 메시 decoder", () => {
  it("실제 내보낸 UV cube GLB를 phantom report 대신 편집 가능한 삼각형·코너 UV로 복원한다", () => {
    const plain = createStudioUnitCubeMesh(); const mesh = { ...plain, uvLayer: unwrapStudioMeshCornerUvs(plain) };
    const exported = exportStudioHybridDccMeshGlb({ assetId: "cube", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
    if (!exported.ok) throw new Error(JSON.stringify(exported.report));
    const value = success(exported.bytes); expect(value.assets).toHaveLength(1);
    const asset = at(value.assets, 0); expect(asset.mesh.vertices).toHaveLength(24); expect(asset.mesh.faces).toHaveLength(12);
    expect(asset.mesh.uvLayer?.corners).toHaveLength(36); expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
    expect(value.issues.some(({ code }) => code === "NORMALS_REGENERATED")).toBe(true);
  });

  it("비대칭·범위 밖 UV의 V를 1-v로 바꾸며 materialSlot과 vertex index를 유지한다", () => {
    const { root, bin } = fixture(); const value = success(glb(root, bin)); const mesh = at(value.assets, 0).mesh;
    expect(mesh.vertices).toHaveLength(4); expect(mesh.faces).toHaveLength(2);
    expect(mesh.faces.map(({ materialSlot }) => materialSlot)).toEqual([1, 1]);
    const uv = mesh.uvLayer?.corners;
    expect(uv?.map(({ u, v }) => [u, v])).toEqual([0, 1, 2, 0, 2, 3].map((index) => {
      const view = new DataView(bin.buffer); return [view.getFloat32(48 + index * 8, true), Math.fround(1 - view.getFloat32(52 + index * 8, true))];
    }));
    expect(value.issues.some(({ code }) => code === "MATERIALS_NOT_IMPORTED")).toBe(true);
  });

  it("재질별 primitive가 공유 accessor의 실제 참조 index만 compact하고 UV도 원본 index를 따른다", () => {
    const { root, bin } = fixture(); at(root.accessors, 2).count = 3;
    root.accessors.push({ bufferView: 2, byteOffset: 6, componentType: 5123, count: 3, type: "SCALAR" });
    at(root.meshes, 0).primitives.push({ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 3, material: 0 });
    const assets = success(glb(root, bin)).assets; expect(assets).toHaveLength(2);
    expect(assets.map(({ mesh }) => mesh.vertices.length)).toEqual([3, 3]);
    expect(at(assets, 1).mesh.vertices.map(({ position }) => position)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }]);
    expect(at(assets, 1).mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual([[Math.fround(0.1), Math.fround(0.8)], [1.25, 1.5], [-0.25, -0.5]]);
    expect(at(assets, 1).mesh.faces[0]?.materialSlot).toBe(0);
  });

  it("같은 위치를 가진 서로 다른 source index는 compact 과정에서도 합치지 않는다", () => {
    const { root, bin } = fixture(); const view = new DataView(bin.buffer);
    [1, 0, 0].forEach((value, index) => view.setFloat32(36 + index * 4, value, true));
    const mesh = at(success(glb(root, bin)).assets, 0).mesh;
    expect(mesh.vertices).toHaveLength(4); expect(mesh.vertices[1]?.position).toEqual(mesh.vertices[3]?.position);
    expect(mesh.uvLayer?.corners[1]?.u).toBe(Math.fround(0.9)); expect(mesh.uvLayer?.corners[5]?.u).toBe(-0.25);
  });

  it("배포된 Sendagaya VRM의 67 primitive를 실제 참조 V22967/C93633의 정본 메시로 읽는다", () => {
    const bytes = readFileSync("apps/web/public/vrm/Sendagaya_Shino.vrm");
    const value = success(bytes, "vrm"); expect(value.assets).toHaveLength(67);
    expect(value.assets.reduce((sum, { mesh }) => sum + mesh.vertices.length, 0)).toBe(22967);
    expect(value.assets.reduce((sum, { mesh }) => sum + mesh.halfEdges.length, 0)).toBe(93633);
    expect(value.assets.every(({ mesh }) => mesh.uvLayer?.corners.length === mesh.halfEdges.length && validateStudioEditableMeshSerializableAuthority(mesh).ok)).toBe(true);
  });

  it("활성 장면의 전체 계층·복수 primitive·mesh instance를 각각 보존하며 TRS는 bake하지 않는다", () => {
    const { root, bin } = fixture(); const primitive = at(at(root.meshes, 0).primitives, 0);
    at(root.meshes, 0).primitives.push({ ...primitive });
    root.nodes = [{ children: [1, 2], translation: [10, 0, 0], rotation: [Math.sin(Math.PI / 6), 0, 0, Math.cos(Math.PI / 6)] },
      { mesh: 0, translation: [1, 2, 3], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, { mesh: 0, translation: [-2, 0, 0], scale: [-1, 2, 3] }, { mesh: 0 }];
    root.scenes = [{ nodes: [0] }, { nodes: [3] }];
    const value = success(glb(root, bin)); expect(value.assets).toHaveLength(4);
    expect(value.assets.map(({ sourceNodeIndex, sourcePrimitiveIndex }) => [sourceNodeIndex, sourcePrimitiveIndex])).toEqual([[1, 0], [1, 1], [2, 0], [2, 1]]);
    expect(value.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["NODE_HIERARCHY_FLATTENED", "PRIMITIVES_SPLIT", "INSTANCES_MADE_UNIQUE"]));
    for (const asset of value.assets) expect(asset.mesh.vertices.map(({ position }) => position)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }]);
    const point = transformStudioHybridDccPoint([1, 0, 0], at(value.assets, 0).initialTransform);
    expect(point[0]).toBeCloseTo(11); expect(point[1]).toBeCloseTo(3 * 0.5 - 3 * Math.sqrt(3) / 2); expect(point[2]).toBeCloseTo(3 * Math.sqrt(3) / 2 + 3 * 0.5);
    expect(value.issues.some(({ code }) => code.endsWith("BAKED"))).toBe(false);
  });

  it("계층 nonuniform scale과 회전이 만든 전단은 world 위치에 bake하고 경고·identity를 반환한다", () => {
    const { root, bin } = fixture(); root.nodes = [{ scale: [2, 1, 1], children: [1] }, { mesh: 0, rotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] }];
    const value = success(glb(root, bin)); const asset = at(value.assets, 0);
    expect(value.issues.some(({ code }) => code === "SHEAR_BAKED")).toBe(true);
    expect(asset.initialTransform).toEqual({ revision: 1, position: [0, 0, 0], rotationEulerRad: [0, 0, 0], scale: [1, 1, 1] });
    expect(asset.mesh.vertices[1]?.position.x).toBeCloseTo(Math.SQRT2); expect(asset.mesh.vertices[1]?.position.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("reflection과 shear를 함께 bake할 때 winding과 corner UV도 함께 반전한다", () => {
    const { root, bin } = fixture(); root.nodes = [{ scale: [-2, 1, 1], children: [1] }, { mesh: 0, rotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] }];
    const value = success(glb(root, bin)); const asset = at(value.assets, 0);
    expect(value.issues.some(({ code }) => code === "SHEAR_BAKED")).toBe(true);
    expect(asset.initialTransform.scale).toEqual([1, 1, 1]);
    expect(asset.mesh.halfEdges.slice(0, 3).map(({ prev }) => asset.mesh.halfEdges[prev]?.vertex)).toEqual([0, 2, 1]);
    const uv = at(asset.mesh.uvLayer?.corners ?? [], 1); expect(uv.u).toBe(1.25); expect(uv.v).toBe(1.5);
    const a = at(asset.mesh.vertices, 0).position, b = at(asset.mesh.vertices, 2).position, c = at(asset.mesh.vertices, 1).position;
    expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeGreaterThan(0);
  });

  it.each(["singular", "collinear"] as const)("%s로 실제 면적이 사라진 입력을 성공 asset로 만들지 않는다", (kind) => {
    const { root, bin } = fixture();
    if (kind === "singular") at(root.nodes, 0).scale = [0, 0, 0];
    else { const view = new DataView(bin.buffer); for (let index = 0; index < 4; index += 1) view.setFloat32(index * 12 + 4, 0, true); }
    const result = decodeStudioNativeGlb(glb(root, bin)); expect(result.ok).toBe(false);
    if (result.ok) throw new Error("0면적 mesh가 성공했습니다.");
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["DEGENERATE_TRIANGLES_SKIPPED", "NO_EDITABLE_GEOMETRY"]));
  });

  it("embedded glTF와 nonzero Uint8Array byteOffset의 GLB도 순수하게 읽는다", () => {
    const { root, bin } = fixture(); at(root.buffers, 0).uri = `data:application/octet-stream;base64,${Buffer.from(bin).toString("base64")}`;
    expect(success(new TextEncoder().encode(JSON.stringify(root)), "gltf").assets).toHaveLength(1);
    delete at(root.buffers, 0).uri;
    const binary = glb(root, bin); const wrapped = new Uint8Array(binary.length + 11); wrapped.set(binary, 5);
    expect(success(wrapped.subarray(5, 5 + binary.length)).assets).toHaveLength(1);
    expect(success(binary, "vrm").format).toBe("vrm");
  });

  it("sparse Float32 position과 normalized ushort UV를 실제 값으로 복원한다", () => {
    const { root, bin } = fixture(); const expanded = new Uint8Array(144); expanded.set(bin); expanded.set([0, 1, 2, 3], 92); expanded.set(bin.slice(0, 48), 96);
    at(root.buffers, 0).byteLength = expanded.length;
    root.bufferViews.push({ buffer: 0, byteOffset: 92, byteLength: 4 }, { buffer: 0, byteOffset: 96, byteLength: 48 });
    delete at(root.accessors, 0).bufferView; at(root.accessors, 0).sparse = { count: 4, indices: { bufferView: 3, componentType: 5121 }, values: { bufferView: 4 } };
    at(root.accessors, 1).componentType = 5123; at(root.accessors, 1).normalized = true; at(root.bufferViews, 1).byteLength = 16;
    const view = new DataView(expanded.buffer); [0, 65535, 65535, 32768, 0, 0, 32768, 65535].forEach((n, i) => view.setUint16(48 + i * 2, n, true));
    const mesh = at(success(glb(root, expanded)).assets, 0).mesh;
    expect(mesh.vertices[2]?.position).toEqual({ x: 1, y: 1, z: 0 });
    expect(mesh.uvLayer?.corners[0]).toMatchObject({ u: 0, v: 0 });
    expect(mesh.uvLayer?.corners[1]).toMatchObject({ u: 1, v: Math.fround(1 - 32768 / 65535) });
  });

  it("500001개 선언 sparse accessor도 전체 검증 예산 안이면 실제 참조 V3/C3으로 compact한다", () => {
    const { root } = fixture(); const bin = new Uint8Array(60); const view = new DataView(bin.buffer);
    [0, 1, 500000].forEach((value, index) => { view.setUint32(index * 4, value, true); view.setUint32(48 + index * 4, value, true); });
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => view.setFloat32(12 + index * 4, value, true));
    root.buffers = [{ byteLength: 60, uri: `data:application/octet-stream;base64,${Buffer.from(bin).toString("base64")}` }];
    root.bufferViews = [{ buffer: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 36 }, { buffer: 0, byteOffset: 48, byteLength: 12 }];
    root.accessors = [{ componentType: 5126, type: "VEC3", count: 500001, sparse: { count: 3, indices: { bufferView: 0, componentType: 5125 }, values: { bufferView: 1 } } },
      { bufferView: 2, componentType: 5125, type: "SCALAR", count: 3 }];
    root.meshes = [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }];
    const bytes = new TextEncoder().encode(JSON.stringify(root)); expect(bytes.length).toBeLessThan(1024);
    const mesh = at(success(bytes, "gltf").assets, 0).mesh;
    expect(mesh.vertices.map(({ position }) => position)).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]);
    expect(mesh.halfEdges).toHaveLength(3); expect(mesh.faces).toHaveLength(1);
    at(root.accessors, 0).count = 5_333_334;
    const rejected = decodeStudioNativeGlb(new TextEncoder().encode(JSON.stringify(root)), "gltf");
    expect(rejected.ok).toBe(false); expect(rejected.ok ? [] : rejected.issues.map(({ code }) => code)).toContain("ACCESSOR_BUDGET");
  });

  it.each([true, false])("출력 없는 반복 instance도 index·triangle 순회 전에 누적 작업을 차감한다: repeatedIndex=%s", (repeatedIndex) => {
    const { root } = fixture(); const bin = new Uint8Array(636); const view = new DataView(bin.buffer);
    for (let index = 0; index < 300; index += 1) view.setUint16(36 + index * 2, repeatedIndex ? 0 : index % 3, true);
    root.buffers = [{ byteLength: bin.length }]; root.bufferViews = [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 600 }];
    root.accessors = [{ bufferView: 0, componentType: 5126, type: "VEC3", count: 3 }, { bufferView: 1, componentType: 5123, type: "SCALAR", count: 300 }];
    root.meshes = [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }];
    root.nodes = Array.from({ length: 20 }, () => ({ mesh: 0 })); root.scenes = [{ nodes: root.nodes.map((_, index) => index) }];
    const admit = scanBudget.admitNativeGlbPrimitiveScanWork;
    const budgetSpy = vi.spyOn(scanBudget, "admitNativeGlbPrimitiveScanWork").mockImplementation((previous, indices, mode) => admit(previous, indices, mode, 1500));
    const reads = vi.spyOn(DataView.prototype, "getUint16");
    try {
      const result = decodeStudioNativeGlb(glb(root, bin));
      expect(result.ok).toBe(false); expect(result.ok ? [] : result.issues.map(({ code }) => code)).toContain("PRIMITIVE_SCAN_BUDGET");
      expect(budgetSpy).toHaveBeenCalledTimes(2); expect(reads).toHaveBeenCalledTimes(600);
    } finally { reads.mockRestore(); budgetSpy.mockRestore(); }
  });

  it("bufferView와 sparse가 없는 accessor의 zero UV를 지원하며 byteOffset 필드는 거부한다", () => {
    const { root, bin } = fixture(); delete at(root.accessors, 1).bufferView;
    const mesh = at(success(glb(root, bin)).assets, 0).mesh;
    expect(mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual(Array.from({ length: 6 }, () => [0, 1]));
    at(root.accessors, 1).byteOffset = 0; failure(root, bin, "INVALID_ACCESSOR_RANGE");
  });

  it("원본 Float32 UV의 양수 높이가 1-v·Float32 확정에서 새로 사라지면 정형 오류로 거부한다", () => {
    const { root, bin } = fixture(); const view = new DataView(bin.buffer);
    at(root.accessors, 2).count = 3;
    [0, 0, 1, 0, 0, 1e-10].forEach((value, index) => view.setFloat32(48 + index * 4, value, true));
    failure(root, bin, "UV_PRECISION_LOSS");
    // 처음부터 접힌 UV는 유효한 authoring 입력이며 새로 접힌 경우와 구분한다.
    [0, 0, 1, 0, 0, 0].forEach((value, index) => view.setFloat32(48 + index * 4, value, true));
    expect(at(success(glb(root, bin)).assets, 0).mesh.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual([[0, 1], [1, 1], [0, 1]]);
  });

  it("정점 attribute의 4-byte 정렬은 view 절대위치가 아닌 accessor 상대 offset에 적용한다", () => {
    const { root, bin } = fixture(); const uvBytes = new Uint8Array(22); const view = new DataView(uvBytes.buffer);
    for (let index = 0; index < 8; index += 1) view.setUint16(6 + index * 2, index % 2 ? 65535 : 0, true);
    root.buffers.push({ byteLength: 22, uri: `data:application/octet-stream;base64,${Buffer.from(uvBytes).toString("base64")}` });
    root.bufferViews[1] = { buffer: 1, byteOffset: 6, byteLength: 16 };
    at(root.accessors, 1).componentType = 5123; at(root.accessors, 1).normalized = true;
    expect(at(success(glb(root, bin)).assets, 0).mesh.uvLayer?.corners[0]).toMatchObject({ u: 0, v: 0 });
    root.bufferViews[1] = { buffer: 1, byteOffset: 2, byteLength: 20 }; at(root.accessors, 1).byteOffset = 2;
    failure(root, bin, "INVALID_ALIGNMENT");
  });

  it.each([["MAT2", 5121, 14], ["MAT3", 5121, 23], ["MAT3", 5123, 46]] as const)("마지막 column padding이 생략된 %s/%i accessor를 검증한다", (type, componentType, length) => {
    const { root, bin } = fixture(); const next = new Uint8Array(92 + length); next.set(bin);
    at(root.buffers, 0).byteLength = next.length; root.bufferViews.push({ buffer: 0, byteOffset: 92, byteLength: length });
    root.accessors.push({ bufferView: 3, componentType, count: 2, type });
    expect(success(glb(root, next)).assets).toHaveLength(1);
    at(root.bufferViews, 3).byteLength = length - 1; failure(root, next, "INVALID_ACCESSOR_RANGE");
  });

  it.each([[5121, 255], [5123, 65535]] as const)("%i indices의 예약 최대값은 정점 범위 안이어도 거부한다", (componentType, maximum) => {
    const { root, bin } = fixture(); const count = maximum + 1;
    delete at(root.accessors, 0).bufferView; at(root.accessors, 0).count = count;
    delete at(root.accessors, 1).bufferView; at(root.accessors, 1).count = count;
    at(root.accessors, 2).componentType = componentType; at(root.accessors, 2).count = 3;
    const view = new DataView(bin.buffer);
    if (componentType === 5121) bin.set([0, 1, maximum], 80);
    else [0, 1, maximum].forEach((value, index) => view.setUint16(80 + index * 2, value, true));
    failure(root, bin, "INDEX_RANGE");
  });

  it.each([5, 6])("primitive mode %i를 실제 삼각형과 올바른 winding으로 변환한다", (mode) => {
    const { root, bin } = fixture(); const primitive = at(at(root.meshes, 0).primitives, 0); primitive.mode = mode; delete primitive.indices;
    const mesh = at(success(glb(root, bin)).assets, 0).mesh;
    expect(mesh.faces).toHaveLength(2);
    const origins = mesh.halfEdges.map(({ prev }) => mesh.halfEdges[prev]?.vertex);
    expect(origins).toEqual(mode === 5 ? [0, 1, 2, 2, 1, 3] : [0, 1, 2, 0, 2, 3]);
  });

  it("외부 image URI·추가 attribute·rig·animation은 값을 노출하거나 fetch하지 않고 명시한다", () => {
    const { root, bin } = fixture(); root.images = [{ uri: "https://example.invalid/image?token=DO_NOT_ECHO" }]; root.skins = [{}]; root.animations = [{}];
    const primitive = at(at(root.meshes, 0).primitives, 0); primitive.attributes = { POSITION: 0, TEXCOORD_0: 1, NORMAL: 0, _CUSTOM: 0 };
    const value = success(glb(root, bin));
    expect(value.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["IMAGES_NOT_IMPORTED", "RIG_NOT_IMPORTED", "ANIMATION_NOT_IMPORTED", "NORMALS_REGENERATED", "ATTRIBUTE_DROPPED"]));
    expect(JSON.stringify(value.issues)).not.toContain("DO_NOT_ECHO");
  });

  it("점·선은 명시적으로 제외하며 triangle이 하나도 없으면 성공으로 보지 않는다", () => {
    const { root, bin } = fixture(); at(at(root.meshes, 0).primitives, 0).mode = 1;
    const result = decodeStudioNativeGlb(glb(root, bin)); expect(result.ok).toBe(false);
    if (result.ok) throw new Error("점·선만 있는 모델이 성공했습니다.");
    expect(result.issues.map(({ code }) => code)).toEqual(["MATERIALS_NOT_IMPORTED", "PRIMITIVE_MODE_SKIPPED", "NO_EDITABLE_GEOMETRY"]);
  });
});

describe("할당 전 glTF 범위·형식·리소스 경계", () => {
  it.each([
    ["짧은 bufferView", (root: TestDocument) => { at(root.bufferViews, 0).byteLength = 11; }],
    ["accessor 상대 범위", (root: TestDocument) => { at(root.accessors, 0).byteOffset = 4; }],
    ["절대 범위", (root: TestDocument) => { at(root.bufferViews, 0).byteOffset = 88; }],
    ["정렬", (root: TestDocument) => { at(root.bufferViews, 0).byteOffset = 1; }],
    ["짧은 stride", (root: TestDocument) => { at(root.bufferViews, 0).byteStride = 4; }],
    ["과대 count", (root: TestDocument) => { at(root.accessors, 0).count = Number.MAX_SAFE_INTEGER; }],
    ["잘못된 type", (root: TestDocument) => { at(root.accessors, 0).type = "constructor"; }],
    ["normalized float", (root: TestDocument) => { at(root.accessors, 0).normalized = true; }],
    ["index normalized", (root: TestDocument) => { at(root.accessors, 2).normalized = true; }],
    ["attribute 개수", (root: TestDocument) => { at(root.accessors, 1).count = 3; }],
    ["cycle", (root: TestDocument) => { at(root.nodes, 0).children = [0]; }],
    ["중복 root", (root: TestDocument) => { at(root.scenes, 0).nodes = [0, 0]; }],
    ["matrix와 TRS 중복", (root: TestDocument) => { at(root.nodes, 0).matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; at(root.nodes, 0).scale = [1, 1, 1]; }],
    ["필수 Draco 압축", (root: TestDocument) => { root.extensionsUsed = ["KHR_draco_mesh_compression"]; root.extensionsRequired = ["KHR_draco_mesh_compression"]; }],
    ["필수 Meshopt 압축", (root: TestDocument) => { root.extensionsUsed = ["EXT_meshopt_compression"]; root.extensionsRequired = ["EXT_meshopt_compression"]; }],
    ["외부 buffer", (root: TestDocument) => { at(root.buffers, 0).uri = "https://example.invalid/buffer?token=DO_NOT_ECHO"; }],
  ] as const)("%s를 거부한다", (_name, mutate) => {
    const { root, bin } = fixture(); mutate(root); failure(root, bin);
    const result = decodeStudioNativeGlb(glb(root, bin)); expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO");
  });

  it("NaN·범위 밖 index·중복 sparse index는 정형 오류로 거부한다", () => {
    const { root, bin } = fixture(); new DataView(bin.buffer).setFloat32(0, NaN, true); failure(root, bin, "NONFINITE_ACCESSOR");
    new DataView(bin.buffer).setFloat32(0, 0, true); new DataView(bin.buffer).setUint16(80, 99, true); failure(root, bin, "INDEX_RANGE");
    new DataView(bin.buffer).setUint16(80, 0, true);
    at(root.accessors, 0).sparse = { count: 2, indices: { bufferView: 2, componentType: 5121 }, values: { bufferView: 0 } };
    failure(root, bin, "INVALID_SPARSE");
  });

  it("잘린 GLB·length 모순·JSON 파싱 오류는 원문 조각 없이 실패한다", () => {
    const { root, bin } = fixture(); const bytes = glb(root, bin);
    expect(decodeStudioNativeGlb(bytes.slice(0, -1)).ok).toBe(false);
    new DataView(bytes.buffer).setUint32(12, 0xffffffff, true); expect(decodeStudioNativeGlb(bytes).ok).toBe(false);
    const result = decodeStudioNativeGlb(new TextEncoder().encode('{"secret":"DO_NOT_ECHO", BROKEN'), "gltf");
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO");
  });
});
