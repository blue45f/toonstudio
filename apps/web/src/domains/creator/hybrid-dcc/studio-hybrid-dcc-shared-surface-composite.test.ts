import { describe, expect, it } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { evaluateStudioMeshModifierStack } from "../studio-mesh-modifier-stack";

import { deriveStudioHybridDccViewportSnapshot, type StudioHybridDccViewportAssetSnapshot } from "./StudioHybridDccViewportCore";
import { createStudioHybridDccDefaultToonMaterial, type StudioHybridDccToonMaterial } from "./materials/studio-hybrid-dcc-toon-material";
import { mapStudioHybridDccRayFaceIndex } from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset, hybridDccSetAssetToonMaterial } from "./studio-hybrid-dcc-document";
import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

type MaterialBindings = Readonly<Record<string, StudioHybridDccToonMaterial>>;
interface GlbPrimitive {
  readonly indices: number; readonly attributes: Readonly<Record<string, number>>;
  readonly extras: { readonly toonSpectrum: {
    readonly outputSourceVertexIds: readonly number[]; readonly sourceFaceIdsByTriangle: readonly number[]; readonly sourceMaterialSlot?: number;
  } };
}
interface GlbJson {
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly type: string; readonly componentType: number }[];
  readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[];
  readonly meshes: readonly { readonly primitives: readonly GlbPrimitive[] }[];
}
interface Corner { readonly position: readonly number[]; readonly normal: readonly number[]; readonly uv?: readonly number[] }
interface Triangle { readonly key: string; readonly faceId: number; readonly vertexIds: readonly number[]; readonly slot: number; readonly corners: readonly Corner[] }
const MESH_ID = "surface";

function withUv(mesh: StudioEditableMesh, values: readonly (readonly [number, number])[]): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map((edge) => {
    const origin = mesh.halfEdges[edge.prev]?.vertex, pair = origin === undefined ? undefined : values[origin];
    if (!pair) throw new Error("회귀 원본 UV 코너가 없습니다.");
    return { halfEdgeId: edge.id, u: Math.fround(pair[0]), v: Math.fround(pair[1]) };
  }) }, mesh) };
}
function quad(height = 0): StudioEditableMesh {
  const base = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: height }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]);
  return withUv({ ...base, faces: base.faces.map((face) => ({ ...face, smooth: false })) }, [[0, 0], [2, 0], [1, 1], [0, 1]]);
}
function collinear(uv: boolean): StudioEditableMesh {
  const base = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: .5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 3, y: 1, z: .25 },
  ], [[0, 1, 2, 3, 4], [5, 6, 7]]);
  const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: face.id === 1, materialSlot: face.id ? Number.MAX_SAFE_INTEGER : 7 })) };
  return uv ? withUv(mesh, [[0, 0], [2, .4], [1, 0], [1, 1], [0, 1], [-1, -.25], [2, -.25], [-1, 3]]) : mesh;
}
function workspace(mesh: StudioEditableMesh, bindings: MaterialBindings = {}): StudioHybridDccWorkspace {
  const empty = createStudioHybridDccWorkspace("shared-surface-composite");
  let session = hybridDccRegisterAsset(empty.session, MESH_ID, mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  });
  for (const [slot, material] of Object.entries(bindings)) session = hybridDccSetAssetToonMaterial(session, MESH_ID, [Number(slot)], material);
  return { ...synchronizeWorkspaceGeometryAuthority(empty, session), activeAssetId: MESH_ID };
}
function snapshot(workspace: StudioHybridDccWorkspace, mode: "object" | "face" = "face") {
  const result = deriveStudioHybridDccViewportSnapshot(workspace, mode);
  expect(result.errors).toEqual([]); expect(result.assets).toHaveLength(1);
  const asset = result.assets[0]; if (!asset) throw new Error("실제 표시 자산이 없습니다."); return { result, asset };
}
function glbTriangles(mesh: StudioEditableMesh, bindings: MaterialBindings = {}): readonly Triangle[] {
  const result = exportStudioHybridDccMeshGlb({ assetId: MESH_ID, mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1,
    ...(Object.keys(bindings).length ? { toonMaterials: bindings } : {}) });
  if (!result.ok) throw new Error(JSON.stringify(result.report.errors));
  const data = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength), length = data.getUint32(12, true);
  const json: GlbJson = JSON.parse(new TextDecoder().decode(result.bytes.subarray(20, 20 + length)));
  const read = (id: number) => {
    const accessor = json.accessors[id]; if (!accessor) throw new Error("실제 GLB accessor가 없습니다.");
    const buffer = json.bufferViews[accessor.bufferView]; if (!buffer) throw new Error("실제 GLB bufferView가 없습니다.");
    const components = accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1;
    const width = accessor.componentType === 5123 ? 2 : 4, stride = buffer.byteStride ?? components * width;
    const start = 28 + length + (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * components }, (_, index) => {
      const offset = start + Math.floor(index / components) * stride + (index % components) * width;
      return accessor.componentType === 5126 ? data.getFloat32(offset, true) : width === 2 ? data.getUint16(offset, true) : data.getUint32(offset, true);
    });
  };
  const triangles: Triangle[] = [];
  for (const primitive of json.meshes[0]?.primitives ?? []) {
    const indices = read(primitive.indices), positionId = primitive.attributes.POSITION, normalId = primitive.attributes.NORMAL;
    if (positionId === undefined || normalId === undefined) throw new Error("실제 GLB의 POSITION/NORMAL이 없습니다.");
    const positions = read(positionId), normals = read(normalId), uvId = primitive.attributes.TEXCOORD_0, uvs = uvId === undefined ? undefined : read(uvId);
    for (let start = 0; start < indices.length; start += 3) {
      const faceId = primitive.extras.toonSpectrum.sourceFaceIdsByTriangle[start / 3]; if (faceId === undefined) throw new Error("실제 GLB source face가 없습니다.");
      const outputs = indices.slice(start, start + 3), vertexIds = outputs.map((index) => {
        const id = primitive.extras.toonSpectrum.outputSourceVertexIds[index]; if (id === undefined) throw new Error("실제 GLB source vertex가 없습니다."); return id;
      });
      const face = mesh.faces.find(({ id }) => id === faceId); if (!face) throw new Error("실제 GLB 원본 면이 없습니다.");
      triangles.push({ key: `${faceId}:${vertexIds.join(":")}`, faceId, vertexIds, slot: primitive.extras.toonSpectrum.sourceMaterialSlot ?? face.materialSlot,
        corners: outputs.map((index) => ({ position: positions.slice(index * 3, index * 3 + 3), normal: normals.slice(index * 3, index * 3 + 3),
          ...(uvs ? { uv: [uvs[index * 2] ?? NaN, 1 - (uvs[index * 2 + 1] ?? NaN)] } : {}) })) });
    }
  }
  return triangles;
}
function compareActualBuffers(asset: StudioHybridDccViewportAssetSnapshot, mesh: StudioEditableMesh, bindings: MaterialBindings = {}, pick = true) {
  const glb = glbTriangles(mesh, bindings), byKey = new Map(glb.map((triangle) => [triangle.key, triangle]));
  const planned = planStudioMeshSurface(mesh); if (!planned.ok) throw new Error(planned.issue.detail);
  expect(asset.indices.length).toBe(planned.value.triangles.length * 3); expect(glb).toHaveLength(planned.value.triangles.length);
  const resource = createStudioHybridDccGeometryResource(asset);
  try {
    const geometry = resource.geometry, positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), uvs = geometry.getAttribute("uv");
    expect(geometry.index).toBeNull(); expect(positions.count).toBe(asset.indices.length); expect(normals.count).toBe(positions.count);
    for (const [index, triangle] of planned.value.triangles.entries()) {
      const exported = byKey.get(`${triangle.faceId}:${triangle.vertexIds.join(":")}`); if (!exported) throw new Error("GLB에 동일한 원본 삼각형이 없습니다.");
      if (pick) {
        const mapped = mapStudioHybridDccRayFaceIndex({ assetId: MESH_ID, mesh, meshRevision: asset.meshRevision, sourceHash: hashStudioEditableMesh(mesh) }, index);
        expect(mapped.ok).toBe(true); if (!mapped.ok) throw new Error("실제 faceIndex의 선택 대응이 없습니다.");
        expect(mapped.value.faceId).toBe(exported.faceId); expect(mapped.value.triangleVertexIds).toEqual(exported.vertexIds);
        expect(mapped.value.triangleCornerHalfEdgeIds).toEqual(triangle.cornerHalfEdgeIds);
      }
      if (asset.triangleMaterialSlots) expect(asset.triangleMaterialSlots[index]).toBe(exported.slot);
      else expect(exported.slot).toBe(0);
      for (let corner = 0; corner < 3; corner += 1) {
        const write = index * 3 + corner, expected = exported.corners[corner]; if (!expected) throw new Error("GLB의 코너가 없습니다.");
        expect([positions.getX(write), positions.getY(write), positions.getZ(write)]).toEqual(expected.position);
        expect([normals.getX(write), normals.getY(write), normals.getZ(write)]).toEqual(expected.normal);
        if (expected.uv) { expect(uvs).toBeDefined(); expect(uvs.getX(write)).toBeCloseTo(expected.uv[0] ?? NaN, 6); expect(uvs.getY(write)).toBeCloseTo(expected.uv[1] ?? NaN, 6); }
        else expect(uvs).toBeUndefined();
      }
    }
    return { materialSlots: resource.materialSlots, groups: geometry.groups.map((group) => ({ ...group })) };
  } finally { resource.dispose(); }
}
function sampleUv(positions: ArrayLike<number>, indices: ArrayLike<number>, uvs: ArrayLike<number>): readonly [number, number] {
  for (let start = 0; start < indices.length; start += 3) {
    const ids = [indices[start] ?? -1, indices[start + 1] ?? -1, indices[start + 2] ?? -1];
    const points = ids.map((id) => [positions[id * 3] ?? NaN, positions[id * 3 + 1] ?? NaN]); const [a, b, c] = points;
    if (!a || !b || !c) throw new Error("실제 Three 삼각형이 없습니다.");
    const ax = a[0] ?? NaN, ay = a[1] ?? NaN, bx = b[0] ?? NaN, by = b[1] ?? NaN, cx = c[0] ?? NaN, cy = c[1] ?? NaN;
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa = ((by - cy) * (.6 - cx) + (cx - bx) * (.3 - cy)) / denominator, wb = ((cy - ay) * (.6 - cx) + (ax - cx) * (.3 - cy)) / denominator;
    const weights = [wa, wb, 1 - wa - wb]; if (weights.some((weight) => weight < -1e-6)) continue;
    const value = (axis: number) => ids.reduce((sum, id, corner) => sum + (weights[corner] ?? NaN) * (uvs[id * 2 + axis] ?? NaN), 0);
    return [value(0), value(1)];
  }
  throw new Error("실제 Three geometry에 샘플 점이 없습니다.");
}

describe("실제 viewport·Three buffer·GLB 공유 표면 회귀", () => {
  it("평면 quad의 비선형 UV는 실제 Three에서도 (.6,.3,0)→V-up(1.2,.3)이며 GLB와 같은 코너를 쓴다", () => {
    const mesh = quad(), before = serializeStudioEditableMesh(mesh), value = workspace(mesh), { asset } = snapshot(value);
    compareActualBuffers(asset, mesh);
    const resource = createStudioHybridDccGeometryResource(asset);
    try {
      const positions = resource.geometry.getAttribute("position"), uv = resource.geometry.getAttribute("uv");
      const sample = sampleUv(positions.array, Array.from({ length: positions.count }, (_, index) => index), uv.array);
      expect(sample[0]).toBeCloseTo(1.2, 6); expect(sample[1]).toBeCloseTo(.3, 6);
    } finally { resource.dispose(); }
    expect(serializeStudioEditableMesh(mesh)).toEqual(before); expect(value.session.state.geometry.records.surface?.mesh).toBe(mesh);
  });

  it.each([1e-7, .25])("height=%s의 shallow/warped flat 법선은 실제 Three와 GLB 코너마다 일치한다", (height) => {
    const mesh = quad(height), { asset } = snapshot(workspace(mesh)); compareActualBuffers(asset, mesh);
    expect(asset.normalMode).toBe("flat"); const normals = asset.cornerNormals; if (!normals) throw new Error("공유 코너 법선이 없습니다.");
    const first = Array.from(normals.slice(0, 3)), second = Array.from(normals.slice(9, 12));
    if (height === .25) expect(first).not.toEqual(second);
    else {
      const length = Math.hypot(-height, -height, 2); expect(first).toEqual([-height / length, -height / length, 2 / length].map(Math.fround));
      expect(second).toEqual(first);
    }
  });

  it.each([false, true])("UV=%s collinear·혼합 음영·큰 material slot은 원본과 실제 Array 캐시 stream에 보존된다", async (uv) => {
    const mesh = collinear(uv), original = serializeStudioEditableMesh(mesh), material = createStudioHybridDccDefaultToonMaterial();
    const bindings: MaterialBindings = { "7": material, [String(Number.MAX_SAFE_INTEGER)]: { ...material, baseColorSrgb: "#aa2255" } };
    const before = workspace(mesh, bindings), originalRecord = before.session.state.geometry.records.surface;
    if (!originalRecord) throw new Error("혼합 재질 원본이 없습니다.");
    const source = snapshot(before); expect(source.result.totalTriangles).toBe(uv ? 4 : 3); expect(source.asset.normalMode).toBe("split");
    const sourceGroups = compareActualBuffers(source.asset, mesh, bindings);
    expect(sourceGroups.materialSlots).toEqual([7, Number.MAX_SAFE_INTEGER]); expect(sourceGroups.groups).toHaveLength(2);
    const first = mapStudioHybridDccRayFaceIndex({ assetId: MESH_ID, mesh, meshRevision: originalRecord.revision, sourceHash: originalRecord.meshHash }, 0);
    expect(first.ok).toBe(true); if (!first.ok) throw new Error("원본 faceIndex가 없습니다.");
    expect(first.value.vertexCandidateIds).toContain(1); expect(first.value.triangleVertexIds.includes(1)).toBe(uv);
    const preview = await workspaceAddActiveModifier(before, "array"), record = preview.session.state.geometry.records.surface;
    if (!record?.renderCache?.surface) throw new Error("실제 평가 surface 캐시가 없습니다.");
    const modifier = record.modifierStack.modifiers[0]; if (modifier?.kind !== "array") throw new Error("실제 반복 배열 명령이 없습니다.");
    const evaluated = await evaluateStudioMeshModifierStack(record.modifierStack); if (!evaluated.ok) throw new Error(evaluated.detail);
    const cached = snapshot(preview, "object"); expect(cached.result.warnings).toEqual([]); expect(cached.asset.renderSource).toBe("modifier-cache");
    expect(modifier.count).toBe(3); expect(cached.asset.triangleCount).toBe(source.asset.triangleCount * modifier.count);
    expect(record.renderCache.surface.triangleMaterialSlots).toEqual(cached.asset.triangleMaterialSlots);
    expect(record.renderCache.derivedFromHash).toBe(hashStudioEditableMesh(evaluated.value.mesh));
    const cachedGroups = compareActualBuffers(cached.asset, evaluated.value.mesh, bindings, false);
    expect(cachedGroups.materialSlots).toEqual([7, Number.MAX_SAFE_INTEGER]); expect(cachedGroups.groups).toHaveLength(2 * modifier.count);
    const cage = snapshot(preview, "face"); expect(cage.asset.renderSource).toBe("authority-edit-cage"); expect(cage.asset.triangleCount).toBe(source.asset.triangleCount);
    compareActualBuffers(cage.asset, mesh, bindings);
    expect(record.mesh).toBe(mesh); expect(record.meshHash).toBe(originalRecord.meshHash); expect(serializeStudioEditableMesh(mesh)).toEqual(original);
  });

  it("surface 없는 legacy 캐시와 normal·UV·slot 해시 변조는 실제 원본 buffer로 fallback하고 정본을 바꾸지 않는다", async () => {
    const mesh = quad(), original = serializeStudioEditableMesh(mesh), before = workspace(mesh), source = snapshot(before).asset;
    const preview = await workspaceAddActiveModifier(before, "array"), record = preview.session.state.geometry.records.surface;
    const cache = record?.renderCache;
    if (!record || !cache?.surface?.cornerUvs) throw new Error("실제 UV·법선·슬롯 평가 캐시가 없습니다.");
    const hash = preview.session.state.stateHash, surface = cache.surface, { surface: removed, ...legacy } = cache;
    expect(removed).toBe(surface); expect(snapshot(preview, "object").asset.renderSource).toBe("modifier-cache");
    const normal = new Float32Array(surface.cornerNormals); normal.set([1, 0, 0]);
    const uv = new Float32Array(cache.surface.cornerUvs); uv[0] = (uv[0] ?? 0) + .125;
    const slots = new Float64Array(surface.triangleMaterialSlots); slots[0] = 17;
    const variants = [legacy, { ...cache, surface: { ...surface, cornerNormals: normal } },
      { ...cache, surface: { ...surface, cornerUvs: uv } }, { ...cache, surface: { ...surface, triangleMaterialSlots: slots } }];
    for (const renderCache of variants) {
      const value = { ...preview, session: { ...preview.session, state: { ...preview.session.state,
        geometry: { ...preview.session.state.geometry, records: { ...preview.session.state.geometry.records, [MESH_ID]: { ...record, renderCache } } },
      } } };
      const fallback = snapshot(value, "object"); expect(fallback.asset.renderSource).toBe("authority-cache-fallback"); expect(fallback.result.warnings).toHaveLength(1);
      expect(fallback.asset.positions).toEqual(source.positions); expect(fallback.asset.indices).toEqual(source.indices);
      expect(fallback.asset.cornerUvs).toEqual(source.cornerUvs); expect(fallback.asset.cornerNormals).toEqual(source.cornerNormals);
      compareActualBuffers(fallback.asset, mesh);
      expect(value.session.state.stateHash).toBe(hash); expect(value.session.state.geometry.records.surface?.mesh).toBe(mesh);
    }
    expect(serializeStudioEditableMesh(mesh)).toEqual(original); expect(preview.session.state.stateHash).toBe(hash);
  });
});
