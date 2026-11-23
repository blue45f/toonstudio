/**
 * Offline GLB inspection, pre-parse budget accounting, asset admission,
 * and capture request/result conversion for Studio BG3D Babylon capture.
 */

import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
  STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  STUDIO_BG3D_NORMAL_COORDINATE_SPACE,
  STUDIO_BG3D_NORMAL_PACKING,
  STUDIO_BG3D_NORMAL_PROFILE,
  STUDIO_BG3D_STABLE_ID_PROFILE,
  type StudioBg3dArtifactCaptureResultV2,
} from "./studio-bg3d-artifact-capture-v2";
import {
  captureError,
  isPlainRecord,
  recordArray,
  safeAdd,
  safeMultiply,
  safeNonNegativeCount,
  type GlbBudgetFootprint,
  type RequestedCapture,
  type StudioBg3dBabylonCaptureAsset,
  type StudioBg3dBabylonCaptureFrame,
  type StudioBg3dBabylonCapturePlan,
} from "./studio-bg3d-babylon-artifact-types";
import { type StudioBg3dBabylonSpecialistExecutionContext } from "./studio-bg3d-babylon-specialist-runtime";
import {
  preflightStudioBg3dBabylonTextures,
  StudioBg3dBabylonTexturePreflightError,
  type StudioBg3dBabylonTexturePlan,
} from "./studio-bg3d-babylon-texture-preflight";
import { parseStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type {
  StudioBg3dRuntimeAdapterJob,
  StudioBg3dSpecialistResult,
} from "./studio-bg3d-runtime-adapter";
import type {
  StudioBg3dModelNode,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const MAX_GLB_JSON_BYTES = 4 * 1024 * 1024;

const UNSUPPORTED_DECODER_EXTENSIONS = new Set([
  "EXT_meshopt_compression",
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
]);
const BUDGET_STABLE_CAPTURE_EXTENSIONS = new Set([
  "KHR_lights_punctual",
  "KHR_materials_clearcoat",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
]);

const GLTF_COMPONENT_BYTES: Readonly<Record<number, number>> = Object.freeze({
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
});

const GLTF_TYPE_COMPONENTS: Readonly<Record<string, number>> = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
});

function readGlbJson(bytes: Uint8Array): Record<string, unknown> {
  if (
    bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES ||
    bytes.byteOffset !== 0 ||
    bytes.buffer.byteLength !== bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  const view = new DataView(bytes.buffer);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  const jsonByteLength = view.getUint32(GLB_HEADER_BYTES, true);
  const chunkType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (
    chunkType !== GLB_JSON_CHUNK ||
    jsonByteLength < 2 ||
    jsonByteLength > MAX_GLB_JSON_BYTES ||
    GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonByteLength > bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  let decoded: unknown;
  try {
    const decodedJson = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes.subarray(
        GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES,
        GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonByteLength,
      ));
    let jsonEnd = decodedJson.length;
    while (jsonEnd > 0 && decodedJson.charCodeAt(jsonEnd - 1) === 0) jsonEnd -= 1;
    const json = decodedJson.slice(0, jsonEnd).trimEnd();
    decoded = JSON.parse(json) as unknown;
  } catch (error) {
    throw captureError("unsafe-glb", error);
  }
  if (!isPlainRecord(decoded)) throw captureError("unsafe-glb");
  return decoded;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function containsNestedUri(value: unknown): boolean {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    visited += 1;
    if (visited > 200_000) throw captureError("resource-budget-exceeded");
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isPlainRecord(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (key === "uri") return true;
      if (typeof nested === "object" && nested !== null) pending.push(nested);
    }
  }
  return false;
}

function assertOfflineCoreGlb(bytes: Uint8Array): Record<string, unknown> {
  const root = readGlbJson(bytes);
  const extensions = new Set([
    ...stringArray(root.extensionsUsed),
    ...stringArray(root.extensionsRequired),
  ]);
  if ([...extensions].some((extension) => UNSUPPORTED_DECODER_EXTENSIONS.has(extension))) {
    throw captureError("unsupported-scene-feature");
  }
  if ([...extensions].some((extension) => !BUDGET_STABLE_CAPTURE_EXTENSIONS.has(extension))) {
    throw captureError("unsupported-scene-feature");
  }
  if (containsNestedUri(root)) {
    throw captureError("unsafe-glb");
  }
  return root;
}

function accessorAt(
  accessors: readonly Record<string, unknown>[],
  index: unknown,
): Record<string, unknown> | null {
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0
    ? accessors[index] ?? null
    : null;
}

function accessorElementCount(
  accessors: readonly Record<string, unknown>[],
  index: unknown,
): number {
  const accessor = accessorAt(accessors, index);
  return accessor ? safeNonNegativeCount(accessor.count) : 0;
}

function gltfPrimitiveMode(primitive: Record<string, unknown>): number {
  const mode = primitive.mode === undefined ? 4 : safeNonNegativeCount(primitive.mode);
  if (mode > 6) throw captureError("unsafe-glb");
  return mode;
}

function primitiveTriangleCount(
  primitive: Record<string, unknown>,
  accessors: readonly Record<string, unknown>[],
): number {
  const attributes = isPlainRecord(primitive.attributes) ? primitive.attributes : {};
  const elementCount = "indices" in primitive
    ? accessorElementCount(accessors, primitive.indices)
    : accessorElementCount(accessors, attributes.POSITION);
  const mode = gltfPrimitiveMode(primitive);
  if (mode === 4) return Math.floor(elementCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, elementCount - 2);
  return 0;
}

function glbBudgetFootprint(root: Record<string, unknown>): GlbBudgetFootprint {
  const accessors = recordArray(root.accessors);
  const materials = recordArray(root.materials);
  const meshes = recordArray(root.meshes);
  const nodes = recordArray(root.nodes);
  let accessorElements = 0;
  let decodedGeometryBytes = 0;
  for (const accessor of accessors) {
    const count = safeNonNegativeCount(accessor.count);
    const componentBytes = typeof accessor.componentType === "number"
      ? GLTF_COMPONENT_BYTES[accessor.componentType]
      : undefined;
    const typeComponents = typeof accessor.type === "string"
      ? GLTF_TYPE_COMPONENTS[accessor.type]
      : undefined;
    if (!componentBytes || !typeComponents) throw captureError("unsafe-glb");
    accessorElements = safeAdd(accessorElements, count);
    decodedGeometryBytes = safeAdd(
      decodedGeometryBytes,
      safeMultiply(count, safeMultiply(componentBytes, typeComponents)),
    );
  }

  let triangles = 0;
  let drawCalls = 0;
  let morphTargets = 0;
  const materialSlots = new Set<string>();
  const meshDrawCalls: number[] = [];
  const meshMorphTargets: number[] = [];
  const meshTriangles: number[] = [];
  for (const mesh of meshes) {
    let currentDrawCalls = 0;
    let currentMorphTargets = 0;
    let currentTriangles = 0;
    for (const primitive of recordArray(mesh.primitives)) {
      const mode = gltfPrimitiveMode(primitive);
      const materialIndex = primitive.material === undefined
        ? "default"
        : safeNonNegativeCount(primitive.material);
      if (typeof materialIndex === "number" && materialIndex >= materials.length) {
        throw captureError("unsafe-glb");
      }
      materialSlots.add(`${materialIndex}:${mode}`);
      currentTriangles = safeAdd(
        currentTriangles,
        primitiveTriangleCount(primitive, accessors),
      );
      currentDrawCalls = safeAdd(currentDrawCalls, 1);
      currentMorphTargets = safeAdd(
        currentMorphTargets,
        recordArray(primitive.targets).length,
      );
    }
    meshTriangles.push(currentTriangles);
    meshDrawCalls.push(currentDrawCalls);
    meshMorphTargets.push(currentMorphTargets);
    triangles = safeAdd(triangles, currentTriangles);
    drawCalls = safeAdd(drawCalls, currentDrawCalls);
    morphTargets = safeAdd(morphTargets, currentMorphTargets);
  }

  let referencedTriangles = 0;
  let referencedDrawCalls = 0;
  let referencedMorphTargets = 0;
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const meshIndex = safeNonNegativeCount(node.mesh);
    if (meshIndex >= meshes.length) throw captureError("unsafe-glb");
    referencedTriangles = safeAdd(referencedTriangles, meshTriangles[meshIndex] ?? 0);
    referencedDrawCalls = safeAdd(referencedDrawCalls, meshDrawCalls[meshIndex] ?? 0);
    referencedMorphTargets = safeAdd(
      referencedMorphTargets,
      meshMorphTargets[meshIndex] ?? 0,
    );
  }
  triangles = Math.max(triangles, referencedTriangles);
  drawCalls = Math.max(drawCalls, referencedDrawCalls);
  morphTargets = Math.max(morphTargets, referencedMorphTargets);

  let animationChannels = 0;
  let animationKeyframes = 0;
  let animationValues = 0;
  const animations = recordArray(root.animations);
  for (const animation of animations) {
    const samplers = recordArray(animation.samplers);
    animationChannels = safeAdd(animationChannels, recordArray(animation.channels).length);
    for (const sampler of samplers) {
      animationKeyframes = safeAdd(
        animationKeyframes,
        accessorElementCount(accessors, sampler.input),
      );
      const output = accessorAt(accessors, sampler.output);
      if (!output) continue;
      const outputCount = safeNonNegativeCount(output.count);
      const components = typeof output.type === "string"
        ? GLTF_TYPE_COMPONENTS[output.type]
        : undefined;
      if (!components) throw captureError("unsafe-glb");
      animationValues = safeAdd(animationValues, safeMultiply(outputCount, components));
    }
  }

  let joints = 0;
  const skins = recordArray(root.skins);
  for (const skin of skins) {
    if (!Array.isArray(skin.joints)) throw captureError("unsafe-glb");
    joints = safeAdd(joints, skin.joints.length);
  }
  const punctualLights = isPlainRecord(root.extensions) &&
    isPlainRecord(root.extensions.KHR_lights_punctual)
    ? recordArray(root.extensions.KHR_lights_punctual.lights).length
    : 0;

  return Object.freeze({
    accessorElements,
    animationChannels,
    animationKeyframes,
    animationValues,
    animations: animations.length,
    decodedGeometryBytes,
    drawCalls,
    joints,
    lights: punctualLights,
    materialSlots: materialSlots.size,
    materials: materials.length,
    morphTargets,
    nodes: nodes.length,
    skins: skins.length,
    textures: recordArray(root.textures).length,
    triangles,
  });
}

function assertPreParseBudgets(
  document: StudioBg3dSceneDocument,
  assets: readonly StudioBg3dBabylonCaptureAsset[],
): void {
  const assetById = new Map(assets.map((asset) => [asset.attachmentId, asset]));
  const totals: Record<keyof GlbBudgetFootprint, number> = {
    accessorElements: 0,
    animationChannels: 0,
    animationKeyframes: 0,
    animationValues: 0,
    animations: 0,
    decodedGeometryBytes: 0,
    drawCalls: 0,
    joints: 0,
    lights: 0,
    materialSlots: 0,
    materials: 0,
    morphTargets: 0,
    nodes: 0,
    skins: 0,
    textures: 0,
    triangles: 0,
  };
  for (const node of document.nodes) {
    if (node.kind !== "model") continue;
    const asset = assetById.get(node.attachmentId);
    if (!asset) throw captureError("asset-mismatch");
    for (const key of Object.keys(totals) as (keyof GlbBudgetFootprint)[]) {
      totals[key] = safeAdd(totals[key], asset.footprint[key]);
    }
  }
  const complexity = document.budgets.complexity;
  const textures = document.budgets.textures;
  let textureBytes = 0;
  for (const node of document.nodes) {
    if (node.kind !== "model") continue;
    const plan = assetById.get(node.attachmentId)!.texturePlan;
    textureBytes = safeAdd(textureBytes, plan.textureBytes);
    if (plan.maxDimension > textures.maxDimension || textureBytes > textures.maxTotalBytes) {
      throw captureError("resource-budget-exceeded");
    }
    if (plan.textureInstances > 0 && node.materialOverride?.opacityMultiplier !== undefined
      && node.materialOverride.opacityMultiplier !== 1) {
      throw captureError("unsupported-scene-feature");
    }
  }
  if (
    totals.nodes > complexity.maxNodes ||
    totals.triangles > complexity.maxTriangles ||
    totals.drawCalls > complexity.maxDrawCalls ||
    Math.max(totals.materials, totals.materialSlots) > complexity.maxMaterials ||
    totals.lights > complexity.maxLights ||
    totals.animations > complexity.maxAnimations ||
    totals.animationChannels > complexity.maxAnimationChannels ||
    totals.animationKeyframes > complexity.maxAnimationKeyframes ||
    totals.animationValues > complexity.maxAnimationValues ||
    totals.skins > complexity.maxSkins ||
    totals.joints > complexity.maxJoints ||
    totals.morphTargets > complexity.maxMorphTargets ||
    totals.accessorElements > complexity.maxAccessorElements ||
    totals.decodedGeometryBytes > complexity.maxDecodedGeometryBytes ||
    totals.textures > textures.maxTextures
  ) {
    throw captureError("resource-budget-exceeded");
  }
}

function hasUnsupportedRigState(node: StudioBg3dModelNode): boolean {
  const animation = node.animation;
  if (
    animation &&
    (
      animation.playing ||
      animation.timeSeconds !== 0 ||
      animation.timeScale !== 1 ||
      animation.weight !== 1 ||
      animation.loop !== "repeat" ||
      animation.clipIndex !== 0
    )
  ) {
    return true;
  }
  return Boolean(
    (node.pose?.enabled && node.pose.weight > 0 && node.pose.joints.length > 0) ||
    (node.morph?.enabled && node.morph.weight > 0 && node.morph.targets.length > 0) ||
    (
      node.constraints?.enabled &&
      (node.constraints.aims.length > 0 || node.constraints.twoBoneIks.length > 0)
    ),
  );
}

function assertSupportedDocument(document: StudioBg3dSceneDocument): void {
  if (
    document.camera.projection === "orthographic" ||
    (document.background.mode === "sky-preset" && document.background.skyPresetId !== "blank") ||
    document.nodes.some((node) => node.kind === "model" && hasUnsupportedRigState(node))
  ) {
    throw captureError("unsupported-scene-feature");
  }
}

function admitCaptureAssets(
  job: StudioBg3dRuntimeAdapterJob,
  document: StudioBg3dSceneDocument,
): readonly StudioBg3dBabylonCaptureAsset[] {
  if (job.snapshot.assets.length !== document.attachments.length) {
    throw captureError("asset-mismatch");
  }
  const attachmentById = new Map(document.attachments.map((attachment) => [
    attachment.id,
    attachment,
  ]));
  const admitted = new Map<string, StudioBg3dBabylonCaptureAsset>();
  for (const asset of job.snapshot.assets) {
    const attachment = attachmentById.get(asset.attachmentId);
    if (
      !attachment ||
      admitted.has(asset.attachmentId) ||
      asset.hash !== attachment.hash ||
      asset.byteSize !== attachment.byteSize
    ) {
      throw captureError("asset-mismatch");
    }
    const bytes = asset.readVerifiedBytes();
    if (
      !(bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
      bytes.byteLength !== asset.byteSize
    ) {
      throw captureError("asset-mismatch");
    }
    const ownedBytes = Uint8Array.from(bytes);
    const glbJson = assertOfflineCoreGlb(ownedBytes);
    let texturePlan: StudioBg3dBabylonTexturePlan;
    try {
      texturePlan = preflightStudioBg3dBabylonTextures(ownedBytes, glbJson);
    } catch (error) {
      if (error instanceof StudioBg3dBabylonTexturePreflightError) throw captureError(error.code, error);
      throw error;
    }
    const footprint = Object.freeze({ ...glbBudgetFootprint(glbJson), textures: texturePlan.textureInstances });
    admitted.set(asset.attachmentId, Object.freeze({
      attachmentId: asset.attachmentId,
      bytes: ownedBytes,
      footprint,
      glbJson,
      texturePlan,
    }));
  }
  if (
    admitted.size !== attachmentById.size ||
    document.nodes.some((node) =>
      node.kind === "model" && !admitted.has(node.attachmentId),
    )
  ) {
    throw captureError("asset-mismatch");
  }

  const repeatedModelBytes = document.nodes.reduce((total, node) => {
    if (node.kind !== "model") return total;
    return total + (attachmentById.get(node.attachmentId)?.byteSize ?? Number.POSITIVE_INFINITY);
  }, 0);
  if (
    !Number.isSafeInteger(repeatedModelBytes) ||
    repeatedModelBytes > document.budgets.complexity.maxModelBytes
  ) {
    throw captureError("resource-budget-exceeded");
  }
  return Object.freeze([...admitted.values()]);
}

export function resolveCaptureRequest(
  job: StudioBg3dRuntimeAdapterJob,
): RequestedCapture | null {
  const request = job.request;
  if (request.kind === "capture") {
    return {
      format: "capture",
      width: request.width,
      height: request.height,
      includeBeauty: true,
      includeDepth: true,
      includeMaterialId: false,
      includeNormal: false,
      includeObjectId: false,
    };
  }
  if (request.kind === "webtoon-fx-capture") {
    if (request.effects.length > 0) throw captureError("unsupported-scene-feature");
    return {
      format: "capture",
      width: request.width,
      height: request.height,
      includeBeauty: true,
      includeDepth: request.includeDepth,
      includeMaterialId: false,
      includeNormal: false,
      includeObjectId: false,
    };
  }
  if (request.kind !== "artifact-capture-v2") return null;
  const kinds = request.artifacts.map((artifact) => artifact.kind);
  if (
    kinds.some((kind) =>
      kind !== "beauty" &&
      kind !== "depth" &&
      kind !== "normal" &&
      kind !== "object-id" &&
      kind !== "material-id",
    )
  ) {
    throw captureError("unsupported-artifact");
  }
  return {
    format: "artifact-v2",
    width: request.width,
    height: request.height,
    includeBeauty: kinds.includes("beauty"),
    includeDepth: kinds.includes("depth"),
    includeMaterialId: kinds.includes("material-id"),
    includeNormal: kinds.includes("normal"),
    includeObjectId: kinds.includes("object-id"),
  };
}

export function validateFrame(
  frame: StudioBg3dBabylonCaptureFrame,
  request: RequestedCapture,
): StudioBg3dBabylonCaptureFrame {
  const pixels = request.width * request.height;
  if (
    !frame ||
    (request.includeBeauty && !(frame.rgba instanceof Uint8Array)) ||
    (frame.rgba !== undefined &&
      (!(frame.rgba instanceof Uint8Array) || frame.rgba.byteLength !== pixels * 4)) ||
    (request.includeDepth &&
      (!(frame.depth instanceof Float32Array) || frame.depth.length !== pixels)) ||
    (request.includeNormal &&
      (!(frame.normal instanceof Uint8Array) || frame.normal.length !== pixels * 2)) ||
    (request.includeObjectId &&
      (
        !(frame.objectId?.data instanceof Uint32Array) ||
        frame.objectId.data.length !== pixels ||
        !Array.isArray(frame.objectId.legend)
      )) ||
    (request.includeMaterialId &&
      (
        !(frame.materialId?.data instanceof Uint32Array) ||
        frame.materialId.data.length !== pixels ||
        !Array.isArray(frame.materialId.legend)
      )) ||
    frame.depth?.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw captureError("capture-failed");
  }
  return {
    ...(frame.rgba ? { rgba: Uint8Array.from(frame.rgba) } : {}),
    ...(frame.depth ? { depth: Float32Array.from(frame.depth) } : {}),
    ...(frame.materialId
      ? {
        materialId: {
          data: Uint32Array.from(frame.materialId.data),
          legend: Object.freeze(frame.materialId.legend.map((entry) =>
            Object.freeze({ ...entry }),
          )),
        },
      }
      : {}),
    ...(frame.normal ? { normal: Uint8Array.from(frame.normal) } : {}),
    ...(frame.objectId
      ? {
        objectId: {
          data: Uint32Array.from(frame.objectId.data),
          legend: Object.freeze(frame.objectId.legend.map((entry) =>
            Object.freeze({ ...entry }),
          )),
        },
      }
      : {}),
  };
}

export function toArtifactResult(
  job: StudioBg3dRuntimeAdapterJob,
  request: RequestedCapture,
  frame: StudioBg3dBabylonCaptureFrame,
): StudioBg3dArtifactCaptureResultV2 {
  if (job.request.kind !== "artifact-capture-v2") {
    throw captureError("capture-failed");
  }
  const artifacts = job.request.artifacts.map((artifact) => {
    if (artifact.kind === "beauty") {
      if (!frame.rgba) throw captureError("capture-failed");
      return Object.freeze({
        kind: "beauty" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
        data: Uint8Array.from(frame.rgba),
      });
    }
    if (artifact.kind === "depth") {
      if (!frame.depth) throw captureError("capture-failed");
      return Object.freeze({
        kind: "depth" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
        data: Float32Array.from(frame.depth),
      });
    }
    if (artifact.kind === "normal") {
      if (!frame.normal) throw captureError("capture-failed");
      return Object.freeze({
        kind: "normal" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_NORMAL_PROFILE,
        coordinateSpace: STUDIO_BG3D_NORMAL_COORDINATE_SPACE,
        packing: STUDIO_BG3D_NORMAL_PACKING,
        data: Uint8Array.from(frame.normal),
      });
    }
    if (artifact.kind === "object-id") {
      if (!frame.objectId) throw captureError("capture-failed");
      return Object.freeze({
        kind: "object-id" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_STABLE_ID_PROFILE,
        legend: Object.freeze(frame.objectId.legend.map((entry) =>
          Object.freeze({ ...entry }),
        )),
        data: Uint32Array.from(frame.objectId.data),
      });
    }
    if (artifact.kind === "material-id") {
      if (!frame.materialId) throw captureError("capture-failed");
      return Object.freeze({
        kind: "material-id" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_STABLE_ID_PROFILE,
        legend: Object.freeze(frame.materialId.legend.map((entry) =>
          Object.freeze({ ...entry }),
        )),
        data: Uint32Array.from(frame.materialId.data),
      });
    }
    throw captureError("unsupported-artifact");
  });
  return Object.freeze({
    kind: STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
    version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
    profile: STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
    width: request.width,
    height: request.height,
    artifacts: Object.freeze(artifacts),
  });
}

export function metricsResult(
  context: StudioBg3dBabylonSpecialistExecutionContext,
): StudioBg3dSpecialistResult {
  return {
    kind: "metrics",
    values: {
      backend: context.backend,
      engine: "babylon",
      epoch: context.epoch,
      initialized: true,
      capture: "beauty-depth-normal-stable-id-v2",
    },
  };
}

export function createCapturePlan(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  request: RequestedCapture,
): StudioBg3dBabylonCapturePlan {
  const document = parseStudioBg3dSceneDocument(context.job.snapshot.canonicalDocumentJson);
  if (!document) throw captureError("invalid-snapshot");
  assertSupportedDocument(document);
  const assets = admitCaptureAssets(context.job, document);
  assertPreParseBudgets(document, assets);
  return Object.freeze({
    assets,
    backend: context.backend,
    document,
    height: request.height,
    includeBeauty: request.includeBeauty,
    includeDepth: request.includeDepth,
    includeMaterialId: request.includeMaterialId,
    includeNormal: request.includeNormal,
    includeObjectId: request.includeObjectId,
    width: request.width,
  });
}
