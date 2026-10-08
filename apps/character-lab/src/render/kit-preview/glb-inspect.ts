/**
 * GLB 정적 검사(순수): glTF JSON과 BIN만 읽어 메시·프리미티브·속성·morph 이름·스킨 관절·재질·이미지·확장을 요약하고
 * 일반 경고(누락 속성·접선 없음·금지 확장·잘못된 스킨 등)를 모은다. 키트 전용 규칙(스켈레톤 68관절·역할·morph 커버리지)은
 * `kit-checks.ts`가 이 요약을 받아 판정한다. 렌더·Babylon과 무관하다.
 */
import { parseMorphTargetName } from "../../contracts";

import { accessorFitsBin, accessorLayout, arrayField, asNumber, asString, dataViewOf, isJsonObject, objectAt, readAccessorValue } from "./glb-io";
import { makeWarning } from "./warnings";

import type { GlbDocument, JsonObject, JsonValue } from "./glb-io";
import type { PreviewWarning } from "./warnings";

/** 앱 로더(Babylon 외부 디코더 없음)가 열 수 없어 키트에서 금지된 glTF 확장 */
export const FORBIDDEN_GLTF_EXTENSIONS: readonly string[] = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "EXT_texture_webp"];

/** 메시당 morph 타깃 상한(계약 3.7: Babylon 텍스처 모드 층 한계보다 작게) */
export const MORPH_TARGET_BUDGET = 96;

const SAMPLE_VERTICES = 2000;

export interface GlbPrimitiveSummary {
  readonly index: number;
  readonly mode: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly material: string | null;
  readonly attributes: readonly string[];
  readonly morphTargets: number;
  readonly hasUv: boolean;
  readonly hasNormal: boolean;
  readonly hasTangent: boolean;
  readonly hasColor0: boolean;
  readonly hasColor1: boolean;
  readonly hasJoints: boolean;
  readonly hasWeights: boolean;
}

export interface GlbMeshNodeSummary {
  readonly node: string;
  readonly nodeIndex: number;
  readonly mesh: string;
  readonly parent: string | null;
  readonly skinned: boolean;
  readonly skinIndex: number | null;
  readonly vertices: number;
  readonly triangles: number;
  readonly primitives: readonly GlbPrimitiveSummary[];
  readonly morphTargetNames: readonly string[];
  /** 노드 자신의 TRS가 항등인지 */
  readonly ownTransformIdentity: boolean;
  /** 노드와 모든 조상의 TRS가 항등인지(스킨 메시는 Armature까지 항등이어야 한다) */
  readonly chainTransformIdentity: boolean;
}

export interface GlbSkinSummary {
  readonly index: number;
  readonly name: string | null;
  readonly jointCount: number;
  /** skin.joints 순서의 노드 이름 */
  readonly joints: readonly string[];
  readonly hasInverseBindMatrices: boolean;
}

export interface GlbMaterialSummary {
  readonly index: number;
  readonly name: string;
  readonly baseColorFactor: readonly [number, number, number, number] | null;
  readonly doubleSided: boolean;
  readonly alphaMode: string;
  /** 슬롯 이름 → 이미지 인덱스(baseColor·normal·metallicRoughness·occlusion·emissive) */
  readonly textures: Readonly<Record<string, number>>;
  readonly extensions: readonly string[];
  readonly usedByNodes: readonly string[];
}

export interface GlbImageSummary {
  readonly index: number;
  readonly name: string | null;
  readonly mimeType: string | null;
  readonly bytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly hasAlpha: boolean | null;
  readonly external: boolean;
}

export interface GlbSummary {
  readonly label: string;
  readonly bytes: number;
  readonly generator: string | null;
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly nodeCount: number;
  readonly meshNodes: readonly GlbMeshNodeSummary[];
  readonly skins: readonly GlbSkinSummary[];
  readonly materials: readonly GlbMaterialSummary[];
  readonly images: readonly GlbImageSummary[];
  readonly totals: { readonly meshNodes: number; readonly vertices: number; readonly triangles: number; readonly morphTargetNames: number };
  /** 모든 메시의 morph 이름 합집합(등장 순서) */
  readonly morphTargetNames: readonly string[];
  readonly warnings: readonly PreviewWarning[];
}

// ---------------------------------------------------------------- 이미지 헤더

export interface ImageProbe {
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png" | "image/jpeg";
  /** 알파 채널이 있는지(PNG 색 유형 4·6, JPEG는 항상 false) */
  readonly hasAlpha: boolean;
}

/** PNG·JPEG 헤더에서 크기와 알파 여부를 읽는다. 다른 형식·손상 헤더는 null. */
export function probeImage(bytes: Uint8Array): ImageProbe | null {
  if (bytes.byteLength >= 26 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const colorType = bytes[25] ?? 0;
    return { width: view.getUint32(16), height: view.getUint32(20), mimeType: "image/png", hasAlpha: colorType === 4 || colorType === 6 };
  }
  if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
        const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
        return { width, height, mimeType: "image/jpeg", hasAlpha: false };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

// ---------------------------------------------------------------- 노드 트리

const IDENTITY_EPSILON = 1e-5;

function nodeTransformIdentity(node: JsonObject): boolean {
  const matrix = node.matrix;
  if (Array.isArray(matrix)) {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return matrix.length === 16 && matrix.every((value, index) => typeof value === "number" && Math.abs(value - (identity[index] ?? 0)) < IDENTITY_EPSILON);
  }
  const translation = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
  const rotation = Array.isArray(node.rotation) ? node.rotation : [0, 0, 0, 1];
  const scale = Array.isArray(node.scale) ? node.scale : [1, 1, 1];
  const near = (list: readonly JsonValue[], expected: readonly number[]): boolean => list.length === expected.length && list.every((value, index) => typeof value === "number" && Math.abs(value - (expected[index] ?? 0)) < IDENTITY_EPSILON);
  // 회전 q와 −q는 같은 회전이다.
  const rotationIdentity = near(rotation, [0, 0, 0, 1]) || near(rotation, [0, 0, 0, -1]);
  return near(translation, [0, 0, 0]) && rotationIdentity && near(scale, [1, 1, 1]);
}

export function nodeName(node: JsonObject, index: number): string {
  return asString(node.name) ?? `node${index}`;
}

/** 노드 인덱스 → 부모 노드 인덱스(루트는 −1) */
export function buildParentMap(json: JsonObject): Map<number, number> {
  const parents = new Map<number, number>();
  arrayField(json, "nodes").forEach((value, index) => {
    if (!isJsonObject(value)) return;
    for (const child of arrayField(value, "children")) {
      const childIndex = asNumber(child);
      if (childIndex !== null) parents.set(childIndex, index);
    }
  });
  return parents;
}

// ---------------------------------------------------------------- 프리미티브

function triangleCount(mode: number, indexCount: number): number {
  if (mode === 4) return Math.floor(indexCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, indexCount - 2);
  return 0;
}

function accessorCount(json: JsonObject, index: number | null): number {
  if (index === null) return 0;
  return asNumber(objectAt(arrayField(json, "accessors"), index)?.count) ?? 0;
}

function summarizePrimitive(json: JsonObject, primitive: JsonObject, index: number, materialNames: readonly string[]): GlbPrimitiveSummary {
  const attributes = isJsonObject(primitive.attributes) ? primitive.attributes : {};
  const names = Object.keys(attributes);
  const mode = asNumber(primitive.mode) ?? 4;
  const vertices = accessorCount(json, asNumber(attributes.POSITION));
  const indexAccessor = asNumber(primitive.indices);
  const drawCount = indexAccessor === null ? vertices : accessorCount(json, indexAccessor);
  const materialIndex = asNumber(primitive.material);
  return {
    index,
    mode,
    vertices,
    triangles: triangleCount(mode, drawCount),
    material: materialIndex === null ? null : (materialNames[materialIndex] ?? null),
    attributes: names,
    morphTargets: arrayField(primitive, "targets").length,
    hasUv: names.includes("TEXCOORD_0"),
    hasNormal: names.includes("NORMAL"),
    hasTangent: names.includes("TANGENT"),
    hasColor0: names.includes("COLOR_0"),
    hasColor1: names.includes("COLOR_1"),
    hasJoints: names.includes("JOINTS_0"),
    hasWeights: names.includes("WEIGHTS_0"),
  };
}

/** 정점을 균등 추출해 [0, count) 인덱스 목록을 돌려준다. */
export function sampleIndices(count: number, limit = SAMPLE_VERTICES): number[] {
  if (count <= limit) return Array.from({ length: count }, (_value, index) => index);
  const step = count / limit;
  return Array.from({ length: limit }, (_value, index) => Math.floor(index * step));
}

interface SkinningSample {
  readonly checked: number;
  readonly badWeightSum: number;
  readonly outOfRange: number;
  readonly maxInfluences: number;
}

function sampleSkinning(doc: GlbDocument, primitive: JsonObject, jointCount: number): SkinningSample | null {
  const attributes = isJsonObject(primitive.attributes) ? primitive.attributes : null;
  if (!attributes) return null;
  const jointsIndex = asNumber(attributes.JOINTS_0);
  const weightsIndex = asNumber(attributes.WEIGHTS_0);
  if (jointsIndex === null || weightsIndex === null) return null;
  const joints = accessorLayout(doc.json, jointsIndex);
  const weights = accessorLayout(doc.json, weightsIndex);
  if (!joints || !weights || !accessorFitsBin(joints, doc.bin.byteLength) || !accessorFitsBin(weights, doc.bin.byteLength)) return null;
  const view = dataViewOf(doc.bin);
  let badWeightSum = 0;
  let outOfRange = 0;
  let maxInfluences = 0;
  const sample = sampleIndices(Math.min(joints.count, weights.count));
  for (const vertex of sample) {
    let sum = 0;
    let influences = 0;
    for (let component = 0; component < 4; component += 1) {
      const weight = readAccessorValue(view, weights, vertex, component);
      const joint = readAccessorValue(view, joints, vertex, component);
      sum += weight;
      if (weight > 1e-6) {
        influences += 1;
        if (joint >= jointCount) outOfRange += 1;
      }
    }
    if (Math.abs(sum - 1) > 1e-3) badWeightSum += 1;
    maxInfluences = Math.max(maxInfluences, influences);
  }
  return { checked: sample.length, badWeightSum, outOfRange, maxInfluences };
}

function sampleColorGray(doc: GlbDocument, primitive: JsonObject): { readonly checked: number; readonly notGray: number } | null {
  const attributes = isJsonObject(primitive.attributes) ? primitive.attributes : null;
  const index = attributes ? asNumber(attributes.COLOR_0) : null;
  if (index === null) return null;
  const layout = accessorLayout(doc.json, index);
  if (!layout || layout.components < 3 || !accessorFitsBin(layout, doc.bin.byteLength)) return null;
  const view = dataViewOf(doc.bin);
  let notGray = 0;
  const sample = sampleIndices(layout.count);
  for (const vertex of sample) {
    const r = readAccessorValue(view, layout, vertex, 0);
    const g = readAccessorValue(view, layout, vertex, 1);
    const b = readAccessorValue(view, layout, vertex, 2);
    if (Math.abs(r - g) > 2 / 255 || Math.abs(g - b) > 2 / 255) notGray += 1;
  }
  return { checked: sample.length, notGray };
}

// ---------------------------------------------------------------- 재질·이미지

const TEXTURE_SLOTS: ReadonlyArray<{ readonly slot: string; readonly pick: (material: JsonObject) => JsonValue | undefined }> = [
  { slot: "baseColor", pick: (material) => (isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness.baseColorTexture : undefined) },
  { slot: "metallicRoughness", pick: (material) => (isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness.metallicRoughnessTexture : undefined) },
  { slot: "normal", pick: (material) => material.normalTexture },
  { slot: "occlusion", pick: (material) => material.occlusionTexture },
  { slot: "emissive", pick: (material) => material.emissiveTexture },
];

function textureImage(json: JsonObject, textureInfo: JsonValue | undefined): number | null {
  if (!isJsonObject(textureInfo)) return null;
  const textureIndex = asNumber(textureInfo.index);
  if (textureIndex === null) return null;
  const texture = objectAt(arrayField(json, "textures"), textureIndex);
  return texture ? asNumber(texture.source) : null;
}

function summarizeMaterial(json: JsonObject, material: JsonObject, index: number): Omit<GlbMaterialSummary, "usedByNodes"> {
  const pbr = isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : null;
  const factor = pbr && Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.length === 4 && pbr.baseColorFactor.every((value) => typeof value === "number") ? (pbr.baseColorFactor as [number, number, number, number]) : null;
  const textures: Record<string, number> = {};
  for (const { slot, pick } of TEXTURE_SLOTS) {
    const image = textureImage(json, pick(material));
    if (image !== null) textures[slot] = image;
  }
  return {
    index,
    name: asString(material.name) ?? `material${index}`,
    baseColorFactor: factor,
    doubleSided: material.doubleSided === true,
    alphaMode: asString(material.alphaMode) ?? "OPAQUE",
    textures,
    extensions: isJsonObject(material.extensions) ? Object.keys(material.extensions) : [],
  };
}

function summarizeImage(doc: GlbDocument, image: JsonObject, index: number): GlbImageSummary {
  const bufferView = asNumber(image.bufferView);
  const mimeType = asString(image.mimeType);
  const name = asString(image.name);
  if (bufferView === null) return { index, name, mimeType, bytes: null, width: null, height: null, hasAlpha: null, external: true };
  const view = objectAt(arrayField(doc.json, "bufferViews"), bufferView);
  const offset = view ? (asNumber(view.byteOffset) ?? 0) : 0;
  const length = view ? (asNumber(view.byteLength) ?? 0) : 0;
  if (!view || offset + length > doc.bin.byteLength) return { index, name, mimeType, bytes: length, width: null, height: null, hasAlpha: null, external: false };
  const probe = probeImage(doc.bin.subarray(offset, offset + length));
  return { index, name, mimeType: probe?.mimeType ?? mimeType, bytes: length, width: probe?.width ?? null, height: probe?.height ?? null, hasAlpha: probe?.hasAlpha ?? null, external: false };
}

// ---------------------------------------------------------------- 요약

export function inspectGlb(doc: GlbDocument, label: string, fileBytes: number): GlbSummary {
  const json = doc.json;
  const warnings: PreviewWarning[] = [];
  const warn = (code: string, message: string, severity: "info" | "warn" | "error" = "warn"): void => {
    warnings.push(makeWarning(label, code, message, severity));
  };

  const nodes = arrayField(json, "nodes");
  const parents = buildParentMap(json);
  const materialsJson = arrayField(json, "materials");
  const materialNames = materialsJson.map((value, index) => (isJsonObject(value) ? (asString(value.name) ?? `material${index}`) : `material${index}`));

  // 스킨
  const skins: GlbSkinSummary[] = arrayField(json, "skins").flatMap((value, index) => {
    if (!isJsonObject(value)) return [];
    const joints = arrayField(value, "joints").map((joint) => {
      const jointIndex = asNumber(joint);
      const node = jointIndex === null ? null : objectAt(nodes, jointIndex);
      return node && jointIndex !== null ? nodeName(node, jointIndex) : `joint?${String(joint)}`;
    });
    return [{ index, name: asString(value.name), jointCount: joints.length, joints, hasInverseBindMatrices: asNumber(value.inverseBindMatrices) !== null }];
  });

  const chainIdentity = (nodeIndex: number): boolean => {
    let cursor: number | undefined = nodeIndex;
    const visited = new Set<number>();
    while (cursor !== undefined && cursor >= 0 && !visited.has(cursor)) {
      visited.add(cursor);
      const node = objectAt(nodes, cursor);
      if (node && !nodeTransformIdentity(node)) return false;
      cursor = parents.get(cursor);
    }
    return true;
  };

  // 메시 노드
  const meshNodes: GlbMeshNodeSummary[] = [];
  const morphNameSet: string[] = [];
  const materialUsers = new Map<number, string[]>();
  const meshes = arrayField(json, "meshes");
  nodes.forEach((value, nodeIndex) => {
    if (!isJsonObject(value)) return;
    const meshIndex = asNumber(value.mesh);
    if (meshIndex === null) return;
    const mesh = objectAt(meshes, meshIndex);
    if (!mesh) {
      warn("glb-mesh-missing", `노드 '${nodeName(value, nodeIndex)}'가 존재하지 않는 메시 ${meshIndex}를 가리킵니다.`, "error");
      return;
    }
    const name = nodeName(value, nodeIndex);
    const primitiveSummaries = arrayField(mesh, "primitives").flatMap((primitive, primitiveIndex) => (isJsonObject(primitive) ? [summarizePrimitive(json, primitive, primitiveIndex, materialNames)] : []));
    const skinIndex = asNumber(value.skin);
    const targetCount = Math.max(0, ...primitiveSummaries.map((primitive) => primitive.morphTargets));
    const extras = isJsonObject(mesh.extras) ? mesh.extras : null;
    const rawNames = extras ? arrayField(extras, "targetNames").map((item) => asString(item)) : [];
    const morphTargetNames = Array.from({ length: targetCount }, (_value, index) => rawNames[index] ?? `morphTarget${index}`);
    if (targetCount > 0 && rawNames.length < targetCount) warn("glb-morph-unnamed", `메시 '${name}'의 morph 타깃 ${targetCount}개 중 ${targetCount - rawNames.length}개에 이름(extras.targetNames)이 없어 'morphTarget<번호>'로 취급됩니다.`);
    if (targetCount > MORPH_TARGET_BUDGET) warn("glb-morph-over-budget", `메시 '${name}'의 morph 타깃이 ${targetCount}개로 예산 ${MORPH_TARGET_BUDGET}개를 넘습니다(소프트웨어/모바일 렌더러에서 텍스처 층 한계).`);
    for (const morph of morphTargetNames) if (!morphNameSet.includes(morph)) morphNameSet.push(morph);
    const parentIndex = parents.get(nodeIndex);
    const parentNode = parentIndex === undefined ? null : objectAt(nodes, parentIndex);
    meshNodes.push({
      node: name,
      nodeIndex,
      mesh: asString(mesh.name) ?? `mesh${meshIndex}`,
      parent: parentNode && parentIndex !== undefined ? nodeName(parentNode, parentIndex) : null,
      skinned: skinIndex !== null,
      skinIndex,
      vertices: primitiveSummaries.reduce((sum, primitive) => sum + primitive.vertices, 0),
      triangles: primitiveSummaries.reduce((sum, primitive) => sum + primitive.triangles, 0),
      primitives: primitiveSummaries,
      morphTargetNames,
      ownTransformIdentity: nodeTransformIdentity(value),
      chainTransformIdentity: chainIdentity(nodeIndex),
    });
    for (const primitive of arrayField(mesh, "primitives")) {
      const materialIndex = isJsonObject(primitive) ? asNumber(primitive.material) : null;
      if (materialIndex === null) continue;
      const users = materialUsers.get(materialIndex) ?? [];
      if (!users.includes(name)) users.push(name);
      materialUsers.set(materialIndex, users);
    }

    // 프리미티브·스킨 검사
    arrayField(mesh, "primitives").forEach((primitive, primitiveIndex) => {
      if (!isJsonObject(primitive)) return;
      const summary = primitiveSummaries.find((entry) => entry.index === primitiveIndex);
      if (!summary) return;
      const where = `메시 '${name}'${primitiveSummaries.length > 1 ? ` 프리미티브 ${primitiveIndex}` : ""}`;
      if (summary.mode !== 4) warn("glb-primitive-mode", `${where}: 삼각형 목록(mode 4)이 아닙니다(mode ${summary.mode}). 앱은 삼각형 목록만 기대합니다.`);
      if (!summary.hasNormal) warn("glb-no-normals", `${where}: NORMAL이 없습니다(툰·PBR 음영이 평면으로 보입니다).`);
      if (!summary.hasUv) warn("glb-no-uv", `${where}: TEXCOORD_0(UV)이 없습니다. 텍스처가 샘플되지 않습니다.`);
      if (summary.hasColor1) warn("glb-color1", `${where}: COLOR_1이 있습니다. 앱 로더는 COLOR_0만 읽으므로 무시됩니다(키트에서 금지).`);
      const materialIndex = asNumber(primitive.material);
      const material = materialIndex === null ? null : objectAt(materialsJson, materialIndex);
      if (materialIndex === null) warn("glb-no-material", `${where}: 재질이 없습니다(기본 흰 재질로 그려지고 틴트가 적용되지 않습니다).`);
      if (material && !summary.hasTangent && isJsonObject(material.normalTexture)) warn("glb-no-tangent", `${where}: 노멀맵 재질인데 TANGENT가 없습니다(Babylon이 셰이더에서 접선을 유도하므로 이음매 음영이 달라질 수 있습니다).`, "info");
      if (summary.hasColor0) {
        const gray = sampleColorGray(doc, primitive);
        if (gray && gray.notGray > 0) warn("glb-color0-not-gray", `${where}: COLOR_0이 회색(R=G=B)이 아닙니다(표본 ${gray.checked}개 중 ${gray.notGray}개). 키트는 COLOR_0을 AO 곱으로만 쓰며 PBR은 알베도에 그대로 곱합니다.`);
      }
      if ((summary.hasJoints || summary.hasWeights) && skinIndex === null) warn("glb-weights-without-skin", `${where}: JOINTS_0/WEIGHTS_0이 있는데 노드에 skin이 없습니다. 스킨이 적용되지 않습니다.`, "error");
      if (skinIndex !== null && !(summary.hasJoints && summary.hasWeights)) warn("glb-skin-attributes-missing", `${where}: 노드는 skin을 쓰는데 JOINTS_0/WEIGHTS_0이 없습니다.`, "error");
      const attributesObject = isJsonObject(primitive.attributes) ? primitive.attributes : {};
      if (attributesObject.JOINTS_1 !== undefined) warn("glb-influences-over-4", `${where}: JOINTS_1이 있어 정점당 영향이 4개를 넘습니다(키트는 ≤ 4).`);
      if (skinIndex !== null) {
        const skin = skins.find((entry) => entry.index === skinIndex);
        const sample = skin ? sampleSkinning(doc, primitive, skin.jointCount) : null;
        if (sample && sample.badWeightSum > 0) warn("glb-weights-sum", `${where}: 가중치 합이 1이 아닌 정점이 표본 ${sample.checked}개 중 ${sample.badWeightSum}개입니다(계약: 1 ± 1e-3).`);
        if (sample && sample.outOfRange > 0) warn("glb-joint-index-out-of-range", `${where}: skin.joints 범위를 벗어난 JOINTS_0 인덱스가 있습니다(${sample.outOfRange}건).`, "error");
      }
    });
    if (skinIndex !== null && !skins.some((entry) => entry.index === skinIndex)) warn("glb-skin-missing", `노드 '${name}'가 존재하지 않는 skin ${skinIndex}를 가리킵니다.`, "error");
  });

  // morph 이름 어휘
  const outside = morphNameSet.filter((name) => parseMorphTargetName(name) === null);
  if (morphNameSet.length > 0 && outside.length > 0) {
    warn("glb-morph-outside-vocabulary", `morph 이름 ${morphNameSet.length}개 중 ${outside.length}개가 계약 어휘(param:<키>:± · facs:<유닛>) 밖입니다: ${outside.slice(0, 6).join(", ")}${outside.length > 6 ? " …" : ""}. 앱 슬라이더는 계약 이름만 구동합니다(--morph 옵션으로는 원본 이름도 쓸 수 있습니다).`, "info");
  }

  // 재질
  const materials: GlbMaterialSummary[] = materialsJson.flatMap((value, index) => (isJsonObject(value) ? [{ ...summarizeMaterial(json, value, index), usedByNodes: materialUsers.get(index) ?? [] }] : []));

  // 이미지
  const images: GlbImageSummary[] = arrayField(json, "images").flatMap((value, index) => (isJsonObject(value) ? [summarizeImage(doc, value, index)] : []));
  for (const image of images) {
    const imageLabel = `이미지 ${image.index}${image.name ? ` '${image.name}'` : ""}`;
    if (image.external) warn("glb-image-external", `${imageLabel}: 외부 파일(uri) 이미지입니다. 앱은 바이트만 받아 열므로 이미지를 GLB 안에 임베드해야 합니다.`, "error");
    else if (image.width === null) warn("glb-image-unreadable", `${imageLabel}: PNG/JPEG 헤더를 읽지 못했습니다(${image.mimeType ?? "형식 미상"}). 지원하지 않는 형식이거나 손상됐을 수 있습니다.`);
    else {
      if (!isPowerOfTwo(image.width) || !isPowerOfTwo(image.height ?? 0)) warn("glb-texture-npot", `${imageLabel}: 크기 ${image.width}×${image.height}가 2의 거듭제곱이 아닙니다(밉맵·샘플러 래핑이 제한됩니다).`);
      if (Math.max(image.width, image.height ?? 0) > 2048) warn("glb-texture-large", `${imageLabel}: 크기 ${image.width}×${image.height}가 2048을 넘습니다(키트 상한 2K).`);
      if (image.mimeType === "image/png" && image.hasAlpha === false) warn("glb-png-without-alpha", `${imageLabel}: 알파 없는 PNG입니다. 불투명 텍스처는 JPEG로 내보내야 용량 예산을 지킵니다.`, "info");
    }
  }

  // 확장
  const extensionsUsed = arrayField(json, "extensionsUsed").flatMap((value) => (typeof value === "string" ? [value] : []));
  const extensionsRequired = arrayField(json, "extensionsRequired").flatMap((value) => (typeof value === "string" ? [value] : []));
  for (const extension of new Set([...extensionsUsed, ...extensionsRequired])) {
    if (FORBIDDEN_GLTF_EXTENSIONS.includes(extension)) warn("kit-unsupported-extension", `금지된 glTF 확장 ${extension}을(를) 씁니다(외부 디코더가 필요해 앱 로더가 열지 못합니다).`, "error");
  }

  // 스킨 IBM
  for (const skin of skins) if (!skin.hasInverseBindMatrices && skin.jointCount > 0) warn("glb-no-ibm", `skin ${skin.index}에 inverseBindMatrices가 없습니다(항등 가정). 레스트 포즈 대조를 할 수 없습니다.`, "info");

  const asset = isJsonObject(json.asset) ? json.asset : null;
  return {
    label,
    bytes: fileBytes,
    generator: asset ? asString(asset.generator) : null,
    extensionsUsed,
    extensionsRequired,
    nodeCount: nodes.length,
    meshNodes,
    skins,
    materials,
    images,
    totals: {
      meshNodes: meshNodes.length,
      vertices: meshNodes.reduce((sum, mesh) => sum + mesh.vertices, 0),
      triangles: meshNodes.reduce((sum, mesh) => sum + mesh.triangles, 0),
      morphTargetNames: morphNameSet.length,
    },
    morphTargetNames: morphNameSet,
    warnings,
  };
}
