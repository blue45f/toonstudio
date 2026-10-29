import { createHash } from "node:crypto";

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioBg3dGlbMetrics } from "../../../bg3d/studio-bg3d-glb-validation";
import type { StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { VIRTUAL_THREE_THEME_MODEL_IDS as MODEL_IDS } from "./virtual-three-theme-models";
import { VIRTUAL_THREE_THEMES } from "./virtual-three-theme-catalog";
import { loadVirtualThreeThemeModelSource, type VirtualThreeVerifiedThemeModelSource } from "./virtual-three-theme-model-source";
import { prepareVirtualThreeThemeModels } from "./virtual-three-theme-model-stage";
import { virtualThreeThemeModelDisplaySize } from "./virtual-three-theme-placement";
import type { VirtualThreeAssetRecipeTheme, VirtualThreeLayoutRole, VirtualThreeLayoutRoleKind } from "./virtual-three-theme-types";

vi.mock("./virtual-three-theme-model-source", () => ({ loadVirtualThreeThemeModelSource: vi.fn() }));

const realParse = GLTFLoader.prototype.parseAsync;
const loadSource = vi.mocked(loadVirtualThreeThemeModelSource);
const manifest: StudioVirtualSpaceWorldManifest = {
  id: "model-stage-fixture", version: 1, width: 1_600, height: 1_200,
  backgroundAssetKey: "fixture", backgroundUrl: "/fixture.webp",
  rooms: [{ id: "room", x: 0, y: 0, width: 1_600, height: 1_200, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [{ x: 100, y: 100, width: 800, height: 800 }],
  interactions: [], portals: [], spawns: [], npcs: [],
};

interface BoxSpec {
  readonly size: readonly [number, number, number];
  readonly position?: readonly [number, number, number];
  readonly includeUv?: boolean;
}
/** 네트워크 URI 없는 실제 GLB다. Three의 실제 정점·법선·인덱스를 BIN에 보존한다. */
function inlineGlb(boxes: readonly BoxSpec[] = [{ size: [1, 2, 1] }]): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[] = [];
  const meshes: { primitives: { attributes: { POSITION: number; NORMAL: number; TEXCOORD_0?: number }; indices: number; material: number }[] }[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array, target: number) => {
    const index = views.length;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    chunks.push(bytes); offset += bytes.byteLength;
    return index;
  };
  for (const box of boxes) {
    const geometry = new THREE.BoxGeometry(...box.size);
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    const positionData = new Float32Array(positions.count * 3), normalData = new Float32Array(normals.count * 3);
    for (let index = 0; index < positions.count; index += 1) {
      positionData.set([positions.getX(index), positions.getY(index), positions.getZ(index)], index * 3);
      normalData.set([normals.getX(index), normals.getY(index), normals.getZ(index)], index * 3);
    }
    const sourceIndices = geometry.index;
    if (!sourceIndices) throw new Error("실제 box geometry에 인덱스가 없습니다.");
    const indices = new Uint16Array(sourceIndices.count);
    for (let index = 0; index < indices.length; index += 1) indices[index] = sourceIndices.getX(index);
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: push(new Uint8Array(positionData.buffer), 34962), componentType: 5126, count: positions.count, type: "VEC3",
      min: box.size.map((value) => -value / 2), max: box.size.map((value) => value / 2) });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: push(new Uint8Array(normalData.buffer), 34962), componentType: 5126, count: normals.count, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: push(new Uint8Array(indices.buffer), 34963), componentType: 5123, count: indices.length, type: "SCALAR" });
    const attributes: { POSITION: number; NORMAL: number; TEXCOORD_0?: number } = { POSITION: positionAccessor, NORMAL: normalAccessor };
    if (box.includeUv) {
      const uv = geometry.getAttribute("uv");
      if (!uv) throw new Error("합성 box geometry에 UV가 없습니다.");
      const uvData = new Float32Array(uv.count * 2);
      for (let index = 0; index < uv.count; index += 1) uvData.set([uv.getX(index), uv.getY(index)], index * 2);
      attributes.TEXCOORD_0 = accessors.length;
      accessors.push({ bufferView: push(new Uint8Array(uvData.buffer), 34962), componentType: 5126, count: uv.count, type: "VEC2" });
    }
    meshes.push({ primitives: [{ attributes, indices: indexAccessor, material: 0 }] });
    geometry.dispose();
  }
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: boxes.map((_, index) => index) }],
    nodes: boxes.map((box, index) => ({ mesh: index, translation: box.position ?? [0, 0, 0] })),
    meshes, materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.4, 0.6, 0.8, 1], roughnessFactor: 0.7, metallicFactor: 0 } }],
    accessors, bufferViews: views, buffers: [{ byteLength: offset }],
  }));
  const padded = Math.ceil(json.byteLength / 4) * 4;
  const result = new ArrayBuffer(28 + padded + offset), view = new DataView(result), bytes = new Uint8Array(result);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + padded); bytes.set(json, 20);
  view.setUint32(20 + padded, offset, true); view.setUint32(24 + padded, 0x004e4942, true);
  let cursor = 28 + padded;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  return result;
}

function verifiedSource(id: string, bytes = inlineGlb()): VirtualThreeVerifiedThemeModelSource {
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const jsonBytes = new DataView(bytes).getUint32(12, true), binBytes = bytes.byteLength - 28 - jsonBytes;
  const document: { nodes: unknown[]; meshes: unknown[]; accessors: { count: number }[] } = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonBytes)));
  const metrics: StudioBg3dGlbMetrics = {
    byteSize: bytes.byteLength, jsonByteSize: jsonBytes, binByteSize: binBytes,
    nodes: document.nodes.length, meshes: document.meshes.length, meshPrimitives: document.meshes.length,
    drawCalls: document.meshes.length, triangles: 12 * document.meshes.length, materials: 1,
    textures: 0, images: 0, imageBytes: 0, estimatedDecodedImageBytes: 0, maxImageDimension: 0,
    undeterminedImageDimensions: 0, lights: 0, animations: 0, animationChannels: 0,
    animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0,
    accessorElements: document.accessors.reduce((sum, accessor) => sum + accessor.count, 0), estimatedDecodedGeometryBytes: binBytes,
  };
  // 합성 단위 fixture이며 실제 generated 권리 승인이나 registry 등록을 가장하지 않는다.
  return {
    ref: { source: "generated", id, provenanceId: id, url: `/fixture/${id}.glb`, sha256: hash, byteLength: bytes.byteLength },
    blob: new Blob([bytes], { type: "model/gltf-binary" }), contentHash: `sha256:${hash}`,
    byteLength: bytes.byteLength, metrics, rights: null, assertCurrent: vi.fn(),
  };
}
function role(id: string, kind: VirtualThreeLayoutRoleKind, modelAssetId: string, count = 1): VirtualThreeLayoutRole {
  return { id, kind, modelAssetId, count, intent: { ko: "단위 검증", en: "Unit fixture" } };
}
function recipe(roles: readonly VirtualThreeLayoutRole[], extraSourceIds: readonly string[] = []): VirtualThreeAssetRecipeTheme {
  const base = VIRTUAL_THREE_THEMES.find((theme) => theme.kind === "asset-recipe");
  if (!base || base.kind !== "asset-recipe") throw new Error("기존 3D recipe가 없습니다.");
  return { ...base, modelAssetIds: [...new Set([...roles.map((item) => item.modelAssetId), ...extraSourceIds])], layoutRoles: roles };
}
function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let mesh: THREE.Mesh | undefined;
  root.traverse((node) => { if (!mesh && node instanceof THREE.Mesh) mesh = node; });
  if (!mesh) throw new Error("실제 GLB mesh가 없습니다.");
  return mesh;
}
function watchModel(gltf: GLTF) {
  const mesh = firstMesh(gltf.scene);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material) throw new Error("모델 material이 없습니다.");
  return { mesh, geometry: vi.spyOn(mesh.geometry, "dispose"), material: vi.spyOn(material, "dispose") };
}
function vertexPositions(geometry: THREE.BufferGeometry): number[] {
  const positions = geometry.getAttribute("position");
  return Array.from({ length: positions.count }, (_, index) => [positions.getX(index), positions.getY(index), positions.getZ(index)]).flat();
}

beforeEach(() => {
  loadSource.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("이 단위 검증에서 실제 네트워크는 허용하지 않습니다."); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("검증된 private GLB 바이트를 사용하는 테마 stage", () => {
  it("원본 지면 꽃의 낮은 높이가 6m 폭으로 확대되지 않고 수평 0.45m로 배치되며 geometry를 보존한다", async () => {
    // Flower_1_1의 SHA 고정 원본 accessor/node TRS 경계(2026-10-30 읽기 대조)를 재현한다.
    // 이 GLB는 합성 치수 fixture이며 원본 메시나 이미지 본문 검증으로 보고하지 않는다.
    const originalSize: [number, number, number] = [0.3581961989402771, 0.025806039106100798, 0.3581961542367935];
    const bytes = inlineGlb([{ size: originalSize }]), source = verifiedSource(MODEL_IDS.parkFlower, bytes);
    const scene = new THREE.Scene(), original = await realParse.call(new GLTFLoader(), bytes, "");
    const sourceMesh = firstMesh(original.scene), vertices = vertexPositions(sourceMesh.geometry);
    const indices = Array.from(sourceMesh.geometry.index?.array ?? []);
    loadSource.mockResolvedValue(source);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(original);
    const footprint = { x: 100, y: 100, width: 64, height: 64 };
    expect(originalSize[0] * 0.45 / originalSize[1] * 32).toBeGreaterThan(footprint.width);
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest: { ...manifest, colliders: [footprint] },
      theme: recipe([role("ground-flower", "botanical", MODEL_IDS.parkFlower)]), signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      const root = scene.children[0];
      if (!root) throw new Error("지면 꽃이 설치되지 않았습니다.");
      const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), mesh = firstMesh(root);
      expect(Math.max(size.x, size.z)).toBeCloseTo(0.45);
      expect(size.y / size.x).toBeCloseTo(originalSize[1] / originalSize[0]);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.min.x * 32).toBeGreaterThanOrEqual(footprint.x);
      expect(bounds.max.x * 32).toBeLessThanOrEqual(footprint.x + footprint.width);
      expect(bounds.min.z * 32).toBeGreaterThanOrEqual(footprint.y);
      expect(bounds.max.z * 32).toBeLessThanOrEqual(footprint.y + footprint.height);
      expect(mesh.geometry).toBe(sourceMesh.geometry); expect(mesh.material).toBe(sourceMesh.material);
      expect(vertexPositions(sourceMesh.geometry)).toEqual(vertices);
      expect(Array.from(sourceMesh.geometry.index?.array ?? [])).toEqual(indices);
      expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(new Uint8Array(bytes));
      expect(original.scene.scale.toArray()).toEqual([1, 1, 1]);
    } finally { stage.dispose(); }
  });

  it("지정 선반판은 높이 1.85m로 폭 53m가 되지 않고 수평 1.85m로 배치하며 합성 GLB의 vertex·index·UV·material을 보존한다", async () => {
    // 실제 경계만 재현한 합성 box다. 구매 원본 메시·재질·텍스처 검증을 대신하지 않는다.
    const originalSize: [number, number, number] = [3.006350517, 0.104744673, 0.537821293];
    const bytes = inlineGlb([{ size: originalSize, includeUv: true }]), source = verifiedSource(MODEL_IDS.dungeonShelf, bytes);
    const original = await realParse.call(new GLTFLoader(), bytes, ""), scene = new THREE.Scene();
    const sourceMesh = firstMesh(original.scene), vertices = vertexPositions(sourceMesh.geometry);
    const index = sourceMesh.geometry.index, uv = sourceMesh.geometry.getAttribute("uv"), material = sourceMesh.material;
    if (!index || !uv || Array.isArray(material)) throw new Error("선반판 합성 GLB의 index·UV·단일 material이 없습니다.");
    const indices = Array.from(index.array), uvValues = Array.from({ length: uv.count }, (_, vertex) => [uv.getX(vertex), uv.getY(vertex)]).flat();
    const materialValues = material.toJSON(), footprint = { x: 100, y: 100, width: 100, height: 100 };
    expect(originalSize[0] * 1.85 / originalSize[1]).toBeCloseTo(53.098, 3);
    expect(originalSize[0] * 1.85 / originalSize[1] * 32).toBeGreaterThan(footprint.width);
    loadSource.mockResolvedValue(source);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(original);
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest: { ...manifest, colliders: [footprint] },
      theme: recipe([role("flat-shelf", "storage", MODEL_IDS.dungeonShelf)]), signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      const root = scene.children[0];
      if (!root) throw new Error("선반판이 설치되지 않았습니다.");
      const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), mesh = firstMesh(root);
      expect(Math.max(size.x, size.z)).toBeCloseTo(1.85);
      expect(size.y / size.x).toBeCloseTo(originalSize[1] / originalSize[0]);
      expect(size.z / size.x).toBeCloseTo(originalSize[2] / originalSize[0]);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.min.x * 32).toBeGreaterThanOrEqual(footprint.x);
      expect(bounds.max.x * 32).toBeLessThanOrEqual(footprint.x + footprint.width);
      expect(bounds.min.z * 32).toBeGreaterThanOrEqual(footprint.y);
      expect(bounds.max.z * 32).toBeLessThanOrEqual(footprint.y + footprint.height);
      expect(mesh.geometry).toBe(sourceMesh.geometry); expect(mesh.material).toBe(material);
      expect(vertexPositions(sourceMesh.geometry)).toEqual(vertices);
      expect(mesh.geometry.index).toBe(index);
      expect(Array.from(index.array)).toEqual(indices);
      expect(mesh.geometry.getAttribute("uv")).toBe(uv);
      expect(Array.from({ length: uv.count }, (_, vertex) => [uv.getX(vertex), uv.getY(vertex)]).flat()).toEqual(uvValues);
      expect(material.toJSON()).toEqual(materialValues);
      expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(new Uint8Array(bytes));
      expect(sourceMesh.scale.toArray()).toEqual([1, 1, 1]);
      expect(original.scene.scale.toArray()).toEqual([1, 1, 1]);
      expect(original.scene.position.toArray()).toEqual([0, 0, 0]);
    } finally { stage.dispose(); }
  });

  it("다른 storage는 높이 1.85m를 유지하고 지정 선반판도 storage 이외 역할로는 수평 예외를 적용하지 않는다", async () => {
    const id = MODEL_IDS.dungeonShelf + "-other", source = verifiedSource(id, inlineGlb([{ size: [1, 2, 1] }]));
    expect(virtualThreeThemeModelDisplaySize("storage", id)).toEqual({ axis: "height", meters: 1.85 });
    expect(virtualThreeThemeModelDisplaySize("accent", MODEL_IDS.dungeonShelf)).toEqual({ axis: "height", meters: 1.5 });
    loadSource.mockResolvedValue(source);
    const scene = new THREE.Scene();
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("other-storage", "storage", id)]),
      signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      const root = scene.children[0];
      if (!root) throw new Error("다른 storage 모델이 설치되지 않았습니다.");
      const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
      expect(size.y).toBeCloseTo(1.85);
      expect(size.x / size.y).toBeCloseTo(0.5); expect(size.z / size.y).toBeCloseTo(0.5);
      expect(bounds.min.y).toBeCloseTo(0);
    } finally { stage.dispose(); }
  });

  it("지정 차량은 높이 1.5m와 비율을 보존한 yaw 90도로 차고 여백 안에 배치하며 원본 GLB를 바꾸지 않는다", async () => {
    // 실제 차량에서 관측한 정규화 경계와 같은 비율의 합성 GLB다. 구매 원본 렌더 검증을 대신하지 않는다.
    const originalSize: [number, number, number] = [1.664459045722763, 1.5, 3.2884031405284064];
    const bytes = inlineGlb([{ size: originalSize, includeUv: true }]), source = verifiedSource(MODEL_IDS.car, bytes);
    const original = await realParse.call(new GLTFLoader(), bytes, ""), scene = new THREE.Scene();
    const sourceMesh = firstMesh(original.scene), vertices = vertexPositions(sourceMesh.geometry);
    const index = sourceMesh.geometry.index, uv = sourceMesh.geometry.getAttribute("uv"), material = sourceMesh.material;
    if (!index || !uv || Array.isArray(material)) throw new Error("차량 합성 GLB의 index·UV·단일 material이 없습니다.");
    const indices = Array.from(index.array), uvValues = Array.from({ length: uv.count }, (_, vertex) => [uv.getX(vertex), uv.getY(vertex)]).flat();
    const materialValues = material.toJSON(), footprint = { x: 624, y: 48, width: 720, height: 96 };
    // 회전 전 깊이는 105px여서 양쪽 12px 여백을 둔 72px 영역에 들어갈 수 없다.
    expect(originalSize[2] / originalSize[1] * 1.5 * 32).toBeGreaterThan(footprint.height - 24);
    loadSource.mockResolvedValue(source);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(original);
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest: { ...manifest, colliders: [footprint] },
      theme: recipe([role("garage-vehicle", "focal-object", MODEL_IDS.car)]), signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      expect(scene.children).toHaveLength(1);
      const root = scene.children[0], normalization = root?.children[0];
      if (!root || !normalization) throw new Error("차량의 표시 부모가 설치되지 않았습니다.");
      const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), mesh = firstMesh(root);
      expect(normalization.rotation.y).toBeCloseTo(Math.PI / 2);
      expect(size.y).toBeCloseTo(1.5);
      expect(size.x / size.y).toBeCloseTo(originalSize[2] / originalSize[1]);
      expect(size.z / size.y).toBeCloseTo(originalSize[0] / originalSize[1]);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.min.x * 32).toBeCloseTo(636);
      expect(bounds.min.z * 32).toBeCloseTo(60);
      expect(bounds.min.x * 32).toBeGreaterThanOrEqual(footprint.x + 12 - 1e-6);
      expect(bounds.max.x * 32).toBeLessThanOrEqual(footprint.x + footprint.width - 12 + 1e-6);
      expect(bounds.min.z * 32).toBeGreaterThanOrEqual(footprint.y + 12 - 1e-6);
      expect(bounds.max.z * 32).toBeLessThanOrEqual(footprint.y + footprint.height - 12 + 1e-6);
      expect(mesh.geometry).toBe(sourceMesh.geometry); expect(mesh.material).toBe(material);
      expect(vertexPositions(sourceMesh.geometry)).toEqual(vertices);
      expect(mesh.geometry.index).toBe(index); expect(Array.from(index.array)).toEqual(indices);
      expect(mesh.geometry.getAttribute("uv")).toBe(uv);
      expect(Array.from({ length: uv.count }, (_, vertex) => [uv.getX(vertex), uv.getY(vertex)]).flat()).toEqual(uvValues);
      expect(material.toJSON()).toEqual(materialValues);
      expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(new Uint8Array(bytes));
      expect(original.scene.position.toArray()).toEqual([0, 0, 0]);
      expect(original.scene.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
      expect(original.scene.scale.toArray()).toEqual([1, 1, 1]);
      expect(sourceMesh.position.toArray()).toEqual([0, 0, 0]);
      expect(sourceMesh.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
      expect(sourceMesh.scale.toArray()).toEqual([1, 1, 1]);
    } finally { stage.dispose(); }
  });

  it.each([
    { modelAssetId: MODEL_IDS.car, kind: "accent" },
    { modelAssetId: MODEL_IDS.car + "-other", kind: "focal-object" },
  ] as const)("차량 외 모델 또는 차량의 다른 역할은 원래 방향을 유지한다: $modelAssetId/$kind", async ({ modelAssetId, kind }) => {
    const originalSize: [number, number, number] = [1.664459045722763, 1.5, 3.2884031405284064];
    const bytes = inlineGlb([{ size: originalSize }]), source = verifiedSource(modelAssetId, bytes), scene = new THREE.Scene();
    loadSource.mockResolvedValue(source);
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("unrotated", kind, modelAssetId)]),
      signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      const root = scene.children[0], normalization = root?.children[0];
      if (!root || !normalization) throw new Error("원래 방향의 모델이 설치되지 않았습니다.");
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      expect(normalization.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
      expect(size.y).toBeCloseTo(1.5);
      expect(size.x / size.y).toBeCloseTo(originalSize[0] / originalSize[1]);
      expect(size.z / size.y).toBeCloseTo(originalSize[2] / originalSize[1]);
    } finally { stage.dispose(); }
  });

  it("수직 나무는 기존 높이 2.2m와 원본 비율을 유지한다", async () => {
    const originalSize: [number, number, number] = [1.444748193025589, 2.6980645621669228, 0.8963496088981628];
    const source = verifiedSource(MODEL_IDS.parkTree, inlineGlb([{ size: originalSize }])), scene = new THREE.Scene();
    loadSource.mockResolvedValue(source);
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("tree", "botanical", MODEL_IDS.parkTree)]),
      signal: new AbortController().signal, onProgress: vi.fn() });
    try {
      const root = scene.children[0];
      if (!root) throw new Error("나무가 설치되지 않았습니다.");
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      expect(size.y).toBeCloseTo(2.2);
      expect(size.x / size.y).toBeCloseTo(originalSize[0] / originalSize[1]);
      expect(size.z / size.y).toBeCloseTo(originalSize[2] / originalSize[1]);
    } finally { stage.dispose(); }
  });

  it("시작 전에 취소된 요청은 검증 source·parser·네트워크를 전혀 열지 않는다", async () => {
    const abort = new AbortController(); abort.abort();
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");
    await expect(prepareVirtualThreeThemeModels({ scene: new THREE.Scene(), manifest, theme: recipe([role("cancelled", "accent", "cancelled")]), signal: abort.signal, onProgress: vi.fn() })).rejects.toMatchObject({ name: "AbortError" });
    expect(loadSource).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("차원을 알 수 없는 이미지는 예산 callback·Blob 복사·GLTF parse 전에 거부한다", async () => {
    const base = verifiedSource("unknown-image");
    const source = { ...base, metrics: { ...base.metrics, images: 1, textures: 1, imageBytes: 128, undeterminedImageDimensions: 1 } };
    loadSource.mockResolvedValue(source);
    const onBeforeDecode = vi.fn(), onProgress = vi.fn();
    const copy = vi.spyOn(source.blob, "arrayBuffer"), parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");
    const clone = vi.spyOn(THREE.Object3D.prototype, "clone"), scene = new THREE.Scene(), add = vi.spyOn(scene, "add");
    await expect(prepareVirtualThreeThemeModels({
      scene, manifest, theme: recipe([role("unknown-image", "accent", "unknown-image")]),
      signal: new AbortController().signal, onProgress, onBeforeDecode,
    })).rejects.toThrow("decode 크기를 확인할 수 없습니다");
    expect(loadSource).toHaveBeenCalledTimes(1); expect(onBeforeDecode).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });

  it("decode 예산 거부는 parse·clone·설치 전에 끝내고 이전 scene의 외부 자원을 보존한다", async () => {
    const source = verifiedSource("budgeted"), scene = new THREE.Scene();
    const texture = new THREE.Texture(), geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ map: texture }), existing = new THREE.Mesh(geometry, material);
    existing.position.set(2, 3, 4); scene.add(existing);
    const geometryDispose = vi.spyOn(geometry, "dispose"), materialDispose = vi.spyOn(material, "dispose"), textureDispose = vi.spyOn(texture, "dispose");
    const copy = vi.spyOn(source.blob, "arrayBuffer"), parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");
    const clone = vi.spyOn(THREE.Object3D.prototype, "clone"), add = vi.spyOn(scene, "add"), onProgress = vi.fn();
    const budgetError = new Error("scene memory budget exceeded");
    const onBeforeDecode = vi.fn(() => { throw budgetError; });
    loadSource.mockResolvedValue(source);
    await expect(prepareVirtualThreeThemeModels({
      scene, manifest, theme: recipe([role("budgeted", "accent", "budgeted")]),
      signal: new AbortController().signal, onProgress, onBeforeDecode,
    })).rejects.toBe(budgetError);
    expect(onBeforeDecode).toHaveBeenCalledExactlyOnceWith([{
      id: "budgeted", blobBytes: source.byteLength, bufferCopyBytes: source.byteLength,
      decodedGeometryBytes: source.metrics.estimatedDecodedGeometryBytes,
      decodedImageBytes: source.metrics.estimatedDecodedImageBytes, pendingDecode: true,
    }]);
    expect(copy).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(scene.children).toEqual([existing]); expect(existing.parent).toBe(scene);
    expect(existing.position.toArray()).toEqual([2, 3, 4]); expect(existing.visible).toBe(true);
    expect(existing.geometry).toBe(geometry); expect(existing.material).toBe(material); expect(material.map).toBe(texture);
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
    geometry.dispose(); material.dispose(); texture.dispose();
  });

  it("두 번째 decode 예산에는 먼저 parse한 source의 GPU 준비 예약도 계속 포함한다", async () => {
    const first = verifiedSource("first-pending"), second = verifiedSource("second-pending");
    loadSource.mockImplementation(async (id) => id === "first-pending" ? first : second);
    const scene = new THREE.Scene(), parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");
    const onBeforeDecode = vi.fn((sources: readonly { readonly id: string; readonly pendingDecode?: boolean; readonly decodedGeometryBytes: number }[]) => {
      if (sources.length !== 2) return;
      expect(parse).toHaveBeenCalledTimes(1);
      expect(scene.children).toHaveLength(0);
      expect(sources.map((source) => [source.id, source.pendingDecode])).toEqual([
        ["first-pending", true], ["second-pending", true],
      ]);
      expect(sources[0]?.decodedGeometryBytes).toBe(first.metrics.estimatedDecodedGeometryBytes);
      expect(sources[0]?.decodedGeometryBytes).toBeGreaterThan(0);
    });
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([
      role("first", "accent", "first-pending"), role("second", "accent", "second-pending"),
    ]), signal: new AbortController().signal, onBeforeDecode, onProgress: vi.fn() });
    expect(onBeforeDecode).toHaveBeenCalledTimes(2); expect(parse).toHaveBeenCalledTimes(2);
    expect(scene.children).toHaveLength(2); stage.dispose();
  });

  it("URL 재다운로드 대신 검증 Blob 본문을 실제 GLTFLoader로 파싱하고 원본 geometry를 보존한다", async () => {
    const source = verifiedSource("fixture-box"), scene = new THREE.Scene(), progress = vi.fn();
    loadSource.mockResolvedValue(source);
    const parsedModels: GLTF[] = [];
    const originalVertices: number[][] = [];
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async function (this: GLTFLoader, bytes, path) {
      expect(bytes).toBeInstanceOf(ArrayBuffer);
      expect(path).toBe("");
      if (!(bytes instanceof ArrayBuffer)) throw new Error("Blob 바이트가 아닙니다.");
      expect(new Uint8Array(bytes)).toEqual(new Uint8Array(await source.blob.arrayBuffer()));
      const parsed = await realParse.call(this, bytes, path);
      parsedModels.push(parsed);
      originalVertices.push(vertexPositions(firstMesh(parsed.scene).geometry));
      return parsed;
    });
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("boxes", "storage", "fixture-box", 2)]), signal: new AbortController().signal, onProgress: progress });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(1, 1);
    expect(stage.sourceInputs).toEqual([{ id: "fixture-box", blobBytes: source.byteLength, bufferCopyBytes: source.byteLength,
      decodedGeometryBytes: source.metrics.estimatedDecodedGeometryBytes, decodedImageBytes: 0 }]);
    const parsed = parsedModels[0];
    if (!parsed) throw new Error("원본 GLB가 파싱되지 않았습니다.");
    const sourceMesh = firstMesh(parsed.scene), clones = scene.children.map(firstMesh);
    expect(clones).toHaveLength(2);
    for (const mesh of clones) {
      expect(mesh.geometry).toBe(sourceMesh.geometry);
      expect(mesh.material).toBe(sourceMesh.material);
      expect(mesh.castShadow).toBe(true); expect(mesh.receiveShadow).toBe(true);
      expect(new THREE.Box3().setFromObject(mesh.parent ?? mesh).getSize(new THREE.Vector3()).y).toBeCloseTo(1.85);
    }
    expect(sourceMesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(parsed.scene.scale.toArray()).toEqual([1, 1, 1]);
    expect(parsed.scene.position.toArray()).toEqual([0, 0, 0]);
    expect(vertexPositions(sourceMesh.geometry)).toEqual(originalVertices[0]);
    const receipts = watchModel(parsed);
    stage.dispose(); stage.dispose();
    expect(receipts.geometry).toHaveBeenCalledTimes(1); expect(receipts.material).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("parse 중 취소돼도 늦은 실제 GLTF의 geometry·material을 해제하고 scene에 설치하지 않는다", async () => {
    const source = verifiedSource("late"), parsed = await realParse.call(new GLTFLoader(), await source.blob.arrayBuffer(), "");
    const receipts = watchModel(parsed), scene = new THREE.Scene(), abort = new AbortController();
    loadSource.mockResolvedValue(source);
    let complete: (value: GLTF) => void = () => { throw new Error("parse 대기가 시작되지 않았습니다."); };
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const task = prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("late", "accent", "late")]), signal: abort.signal, onProgress: vi.fn() });
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    abort.abort(); complete(parsed);
    await rejected;
    expect(scene.children).toHaveLength(0);
    expect(receipts.geometry).toHaveBeenCalledTimes(1); expect(receipts.material).toHaveBeenCalledTimes(1);
    expect(source.assertCurrent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("공유 clone은 원본 geometry·material·texture와 개별 skeleton 수명을 구분하고 내장 모션을 유지한다", async () => {
    const base = verifiedSource("animated"), parsed = await realParse.call(new GLTFLoader(), await base.blob.arrayBuffer(), "");
    const original = firstMesh(parsed.scene), geometry = original.geometry;
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const positionCount = geometry.getAttribute("position").count;
    const weights = new Float32Array(positionCount * 4);
    for (let vertex = 0; vertex < positionCount; vertex += 1) weights[vertex * 4] = 1;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(positionCount * 4), 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const skinned = new THREE.SkinnedMesh(geometry, material), bone = new THREE.Bone();
    bone.name = "fixture-bone";
    skinned.add(bone); skinned.bind(new THREE.Skeleton([bone]));
    // 이 검증만 parser 결과를 제어해 실제 Three skin·animation 소유권을 독립 검증한다.
    original.removeFromParent();
    for (const oldMaterial of Array.isArray(original.material) ? original.material : [original.material]) oldMaterial.dispose();
    parsed.scene.add(skinned);
    const track = new THREE.NumberKeyframeTrack("fixture-bone.rotation[z]", [0, 1], [0, 0.2]);
    parsed.animations.push(new THREE.AnimationClip("idle", 1, [track]));
    const originalValues = Array.from(track.values), sourceSkeleton = vi.spyOn(skinned.skeleton, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose"), materialDispose = vi.spyOn(material, "dispose");
    if (!material.map) throw new Error("소유권 검증 texture가 없습니다.");
    const textureDispose = vi.spyOn(material.map, "dispose");
    loadSource.mockResolvedValue({ ...base, metrics: { ...base.metrics, skins: 1, joints: 1, animations: 1, animationChannels: 1, animationKeyframes: 2, animationValues: 2 } });
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(parsed);
    const scene = new THREE.Scene();
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("actors", "focal-object", "animated", 2)]), signal: new AbortController().signal, onProgress: vi.fn() });
    const clones: THREE.SkinnedMesh[] = [];
    scene.traverse((node) => { if (node instanceof THREE.SkinnedMesh) clones.push(node); });
    expect(clones).toHaveLength(2);
    const skeletonReceipts = clones.map((clone) => {
      expect(clone.geometry).toBe(geometry); expect(clone.material).toBe(material);
      expect(clone.skeleton).not.toBe(skinned.skeleton);
      clone.skeleton.computeBoneTexture();
      const texture = clone.skeleton.boneTexture;
      if (!texture) throw new Error("clone bone texture가 없습니다.");
      return { skeleton: vi.spyOn(clone.skeleton, "dispose"), texture: vi.spyOn(texture, "dispose") };
    });
    expect(new Set(clones.map((clone) => clone.skeleton)).size).toBe(2);
    stage.update(10);
    for (const clone of clones) expect(clone.skeleton.bones[0]?.rotation.z).toBeCloseTo(0.02);
    expect(bone.rotation.z).toBe(0); expect(Array.from(track.values)).toEqual(originalValues);
    expect(geometryDispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
    stage.dispose(); stage.dispose();
    for (const receipt of skeletonReceipts) {
      expect(receipt.skeleton).toHaveBeenCalledTimes(1); expect(receipt.texture).toHaveBeenCalledTimes(1);
    }
    expect(sourceSkeleton).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1); expect(scene.children).toHaveLength(0);
  });

  it("parse를 기다리는 동안 source-current가 철회되면 이미 읽은 모델도 폐기한다", async () => {
    const base = verifiedSource("revoked"), current = vi.fn(() => { throw new Error("source revoked"); });
    const source = { ...base, assertCurrent: current }, scene = new THREE.Scene();
    const parsed = await realParse.call(new GLTFLoader(), await source.blob.arrayBuffer(), ""), receipts = watchModel(parsed);
    loadSource.mockResolvedValue(source);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(parsed);
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("revoked", "accent", "revoked")]), signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow("source revoked");
    expect(current).toHaveBeenCalledTimes(1);
    expect(receipts.geometry).toHaveBeenCalledTimes(1); expect(scene.children).toHaveLength(0);
  });

  it("다음 source 실패 시 먼저 파싱한 원본도 해제하며 실패를 성공한 빈 theme로 바꾸지 않는다", async () => {
    const source = verifiedSource("first"), parsed = await realParse.call(new GLTFLoader(), await source.blob.arrayBuffer(), "");
    const receipts = watchModel(parsed), scene = new THREE.Scene();
    loadSource.mockResolvedValueOnce(source).mockRejectedValueOnce(new Error("second source failed"));
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(parsed);
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("first", "accent", "first")], ["second"]), signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow("second source failed");
    expect(receipts.geometry).toHaveBeenCalledTimes(1); expect(receipts.material).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("parser 실패 전달은 모델 오류로 한 번 보고하고 기존 scene 노드를 보존한다", async () => {
    loadSource.mockResolvedValue(verifiedSource("broken"));
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockRejectedValue(new Error("invalid GLB parser result"));
    const scene = new THREE.Scene(), existing = new THREE.Group(), onAssetError = vi.fn();
    scene.add(existing);
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("broken", "accent", "broken")]), signal: new AbortController().signal, onProgress: vi.fn(), onAssetError })).rejects.toThrow("invalid GLB parser result");
    expect(onAssetError.mock.calls).toEqual([["broken", "model"]]);
    expect(parse).toHaveBeenCalledTimes(1); expect(loadSource).toHaveBeenCalledTimes(1);
    expect(scene.children).toEqual([existing]); expect(fetch).not.toHaveBeenCalled();
  });

  it("일부 clone 배치 후 다음 모델이 맞지 않으면 준비한 clone과 모든 원본을 함께 해제한다", async () => {
    const small = verifiedSource("small"), huge = verifiedSource("huge", inlineGlb([{ size: [1_000, 1, 1_000] }]));
    const smallParsed = await realParse.call(new GLTFLoader(), await small.blob.arrayBuffer(), "");
    const hugeParsed = await realParse.call(new GLTFLoader(), await huge.blob.arrayBuffer(), "");
    const smallReceipt = watchModel(smallParsed), hugeReceipt = watchModel(hugeParsed);
    loadSource.mockImplementation(async (id) => id === "small" ? small : huge);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValueOnce(smallParsed).mockResolvedValueOnce(hugeParsed);
    const scene = new THREE.Scene(), existing = new THREE.Group(); scene.add(existing);
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([
      role("small", "accent", "small"), role("huge", "accent", "huge"),
    ]), signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow("배치 공간이 부족");
    expect(scene.children).toEqual([existing]);
    for (const receipt of [smallReceipt, hugeReceipt]) {
      expect(receipt.geometry).toHaveBeenCalledTimes(1); expect(receipt.material).toHaveBeenCalledTimes(1);
    }
  });

  it("commit 직전 권리/current 재검사를 제공하고 해제·취소 후 설치를 허용하지 않는다", async () => {
    let revoked = false;
    const source = { ...verifiedSource("current"), assertCurrent: vi.fn(() => { if (revoked) throw new Error("source changed"); }) };
    loadSource.mockResolvedValue(source);
    const stage = await prepareVirtualThreeThemeModels({ scene: new THREE.Scene(), manifest, theme: recipe([role("current", "accent", "current")]), signal: new AbortController().signal, onProgress: vi.fn() });
    stage.assertCurrent();
    revoked = true;
    expect(() => stage.assertCurrent()).toThrow("source changed");
    stage.dispose();
    expect(() => stage.assertCurrent()).toThrow("이미 해제된");
  });
});

describe("실제 테이블 표면과 탁상 소품", () => {
  it("실제 상판 raycast 높이에 소품을 두고 소품끼리 겹치지 않는다", async () => {
    const table = verifiedSource("fixture-table", inlineGlb([{ size: [4, 1, 2] }]));
    const cup = verifiedSource("fixture-cup", inlineGlb([{ size: [1, 1, 1] }]));
    loadSource.mockImplementation(async (id) => id === "fixture-table" ? table : cup);
    const scene = new THREE.Scene();
    const stage = await prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([
      role("table", "workstation", "fixture-table"), role("cups", "tabletop", "fixture-cup", 2),
    ]), signal: new AbortController().signal, onProgress: vi.fn() });
    const tableRoot = scene.getObjectByName("theme-model-table-0");
    if (!tableRoot) throw new Error("실제 table root가 없습니다.");
    scene.updateMatrixWorld(true);
    const cupBounds: THREE.Box3[] = [];
    for (const index of [0, 1]) {
      const root = scene.getObjectByName(`theme-model-cups-${index}`);
      if (!root) throw new Error("탁상 소품이 없습니다.");
      const bounds = new THREE.Box3().setFromObject(root), center = bounds.getCenter(new THREE.Vector3());
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, bounds.max.y + 1, center.z), new THREE.Vector3(0, -1, 0));
      const surface = ray.intersectObject(tableRoot, true)[0];
      if (!surface?.face) throw new Error("실제 상판 위의 교차점이 없습니다.");
      expect(surface.face.normal.y).toBeGreaterThan(0.8);
      expect(bounds.min.y - surface.point.y).toBeCloseTo(0.012);
      for (const other of cupBounds) expect(bounds.intersectsBox(other)).toBe(false);
      cupBounds.push(bounds);
    }
    stage.dispose();
  });

  it("받칠 table이 없는 탁상 역할은 바닥으로 대체하지 않고 실패 후 모든 자원을 해제한다", async () => {
    const source = verifiedSource("cup"), parsed = await realParse.call(new GLTFLoader(), await source.blob.arrayBuffer(), "");
    const receipts = watchModel(parsed), scene = new THREE.Scene();
    loadSource.mockResolvedValue(source);
    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(parsed);
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([role("cup", "tabletop", "cup")]), signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow("안전한 표면");
    expect(receipts.geometry).toHaveBeenCalledTimes(1); expect(receipts.material).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("중심만 얇은 띠에 닿고 모서리는 공중인 소품을 상판에 놓았다고 승인하지 않는다", async () => {
    const stripTable = verifiedSource("strip-table", inlineGlb([
      { size: [3, 1, 0.002] },
      { size: [0.002, 1, 2], position: [-1.5, 0, 0] },
      { size: [0.002, 1, 2], position: [1.5, 0, 0] },
    ]));
    const cup = verifiedSource("cup", inlineGlb([{ size: [1, 1, 1] }]));
    loadSource.mockImplementation(async (id) => id === "strip-table" ? stripTable : cup);
    const scene = new THREE.Scene();
    await expect(prepareVirtualThreeThemeModels({ scene, manifest, theme: recipe([
      role("table", "workstation", "strip-table"), role("cup", "tabletop", "cup"),
    ]), signal: new AbortController().signal, onProgress: vi.fn() })).rejects.toThrow("안전한 표면");
    expect(scene.children).toHaveLength(0);
  });
});
