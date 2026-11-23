/**
 * Post-parse Babylon resource receipt measurement and budget envelope assertions.
 */

import { Material } from "@babylonjs/core/Materials/material";

import {
  loaderOwnedGltfPointers,
  sceneArray,
  type StudioBg3dBabylonSceneResourceDelta,
} from "./studio-bg3d-babylon-artifact-descriptors";
import {
  captureError,
  safeAdd,
  safeMultiply,
  type GlbBudgetFootprint,
  type StudioBg3dBabylonPostParseReceipt,
} from "./studio-bg3d-babylon-artifact-types";

import type { StudioBg3dSceneBudgets } from "./studio-bg3d-scene-document";
import type { ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

const MAX_POST_PARSE_DECODE_AMPLIFICATION = 4;
const MAX_BABYLON_VERTEX_KINDS = 64;
const MAX_BABYLON_TEXTURE_MIP_LEVELS = 32;
const GLTF_NODE_POINTER_PATTERN = /^\/nodes\/(0|[1-9]\d*)$/;

function safePostParseCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw captureError("resource-budget-exceeded");
  }
  return value;
}

function numericDataFootprint(value: unknown): {
  readonly byteLength: number;
  readonly length: number;
} {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const length = Reflect.get(value, "length");
    return {
      byteLength: safePostParseCount(value.byteLength),
      length: safePostParseCount(length),
    };
  }
  if (Array.isArray(value)) {
    return {
      byteLength: safeMultiply(value.length, Float64Array.BYTES_PER_ELEMENT),
      length: safePostParseCount(value.length),
    };
  }
  throw captureError("resource-budget-exceeded");
}

function animationComponentCount(dataType: number): number {
  switch (dataType) {
    case 0:
      return 1;
    case 1:
    case 4:
      return 3;
    case 2:
    case 7:
      return 4;
    case 3:
      return 16;
    case 5:
    case 6:
      return 2;
    default:
      throw captureError("resource-budget-exceeded");
  }
}

function logicalGltfNodeCount(
  resources: StudioBg3dBabylonSceneResourceDelta,
  preflight: GlbBudgetFootprint,
): number {
  const nodeIndices = new Set<number>();
  for (const resource of [...resources.meshes, ...resources.transformNodes]) {
    for (const pointer of loaderOwnedGltfPointers(resource)) {
      const match = GLTF_NODE_POINTER_PATTERN.exec(pointer);
      if (!match) continue;
      const index = Number(match[1]);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= preflight.nodes
      ) {
        throw captureError("resource-budget-exceeded");
      }
      nodeIndices.add(index);
    }
  }
  if (preflight.nodes > 0 && nodeIndices.size < 1) {
    throw captureError("resource-budget-exceeded");
  }
  return nodeIndices.size;
}

function triangleCountForBabylonDrawMode(
  elementCount: number,
  drawMode: number,
): number {
  switch (drawMode) {
    case Material.PointListDrawMode:
    case Material.LineListDrawMode:
    case Material.LineLoopDrawMode:
    case Material.LineStripDrawMode:
      return 0;
    case Material.TriangleFillMode:
      return Math.floor(elementCount / 3);
    case Material.TriangleStripDrawMode:
    case Material.TriangleFanDrawMode:
      return Math.max(0, elementCount - 2);
    default:
      throw captureError("resource-budget-exceeded");
  }
}

export function textureMipReceipt(texture: BaseTexture): {
  readonly bytes: number;
  readonly maxDimension: number;
  readonly mipLevels: number;
} {
  const size = texture.getSize();
  const internal = texture.getInternalTexture();
  if (!internal) throw captureError("resource-budget-exceeded");
  let width = safePostParseCount(size.width);
  let height = safePostParseCount(size.height);
  let depth = safePostParseCount(internal.depth || 1);
  if (width < 1 || height < 1 || depth < 1) {
    throw captureError("resource-budget-exceeded");
  }
  const maxDimension = Math.max(width, height, depth);
  const computedMipLevels = internal.generateMipMaps
    ? Math.floor(Math.log2(maxDimension)) + 1
    : 1;
  const mipLevels = Math.max(computedMipLevels, internal.mipLevelCount > 0
    ? safePostParseCount(internal.mipLevelCount)
    : 1);
  if (mipLevels < 1 || mipLevels > MAX_BABYLON_TEXTURE_MIP_LEVELS) {
    throw captureError("resource-budget-exceeded");
  }

  const faces = texture.isCube ? 6 : 1;
  let texels = 0;
  for (let level = 0; level < mipLevels; level += 1) {
    texels = safeAdd(texels, safeMultiply(safeMultiply(width, height), depth));
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    if (internal.is3D) depth = Math.max(1, Math.floor(depth / 2));
  }
  return {
    bytes: safeMultiply(safeMultiply(texels, faces), 16),
    maxDimension,
    mipLevels,
  };
}

export function measureStudioBg3dBabylonPostParseReceipt(
  resources: StudioBg3dBabylonSceneResourceDelta,
  imported: ISceneLoaderAsyncResult,
  preflight: GlbBudgetFootprint,
): StudioBg3dBabylonPostParseReceipt {
  const runtimeNodes = safeAdd(resources.meshes.size, resources.transformNodes.size);
  const logicalNodes = logicalGltfNodeCount(resources, preflight);
  const hasSyntheticLoaderRoot = sceneArray(imported.meshes).some((mesh) => {
    try {
      return resources.meshes.has(mesh) && mesh.parent === null && mesh.getTotalVertices() === 0;
    } catch {
      return false;
    }
  });
  if (!hasSyntheticLoaderRoot || runtimeNodes < 1) {
    throw captureError("resource-budget-exceeded");
  }

  let accessorElements = 0;
  let decodedGeometryBytes = 0;
  let drawCalls = 0;
  let meshes = 0;
  let triangles = 0;
  const measuredBuffers = new Set<object>();
  const measuredData = new Set<object>();

  const addData = (value: unknown, components: number): void => {
    const footprint = numericDataFootprint(value);
    if (components < 1 || footprint.length % components !== 0) {
      throw captureError("resource-budget-exceeded");
    }
    if (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      !measuredData.has(value)
    ) {
      measuredData.add(value);
      decodedGeometryBytes = safeAdd(decodedGeometryBytes, footprint.byteLength);
    }
    accessorElements = safeAdd(accessorElements, footprint.length / components);
  };
  const addBufferOrData = (buffer: unknown, data: unknown, components: number): void => {
    if (
      (typeof buffer === "object" || typeof buffer === "function") &&
      buffer !== null
    ) {
      if (!measuredBuffers.has(buffer)) {
        measuredBuffers.add(buffer);
        const capacity = safePostParseCount(Reflect.get(buffer, "capacity"));
        if (capacity > 0) {
          decodedGeometryBytes = safeAdd(decodedGeometryBytes, capacity);
        } else {
          addData(data, components);
          return;
        }
      }
      const footprint = numericDataFootprint(data);
      if (components < 1 || footprint.length % components !== 0) {
        throw captureError("resource-budget-exceeded");
      }
      accessorElements = safeAdd(accessorElements, footprint.length / components);
      return;
    }
    addData(data, components);
  };

  for (const geometry of resources.geometries) {
    const kinds = geometry.getVerticesDataKinds();
    if (
      !Array.isArray(kinds) ||
      kinds.length > MAX_BABYLON_VERTEX_KINDS ||
      new Set(kinds).size !== kinds.length
    ) {
      throw captureError("resource-budget-exceeded");
    }
    const totalVertices = safePostParseCount(geometry.getTotalVertices());
    for (const kind of kinds) {
      const vertexBuffer = geometry.getVertexBuffer(kind);
      if (!vertexBuffer) throw captureError("resource-budget-exceeded");
      const components = safePostParseCount(vertexBuffer.getSize());
      const data = geometry.getVerticesData(kind);
      if (!data) throw captureError("resource-budget-exceeded");
      addBufferOrData(vertexBuffer.getBuffer(), data, components);
      if (numericDataFootprint(data).length / components !== totalVertices) {
        throw captureError("resource-budget-exceeded");
      }
    }
    const totalIndices = safePostParseCount(geometry.getTotalIndices());
    if (totalIndices > 0) {
      const indices = geometry.getIndices();
      if (!indices) throw captureError("resource-budget-exceeded");
      addBufferOrData(geometry.getIndexBuffer(), indices, 1);
      if (numericDataFootprint(indices).length !== totalIndices) {
        throw captureError("resource-budget-exceeded");
      }
    }
  }

  for (const mesh of resources.meshes) {
    const vertices = safePostParseCount(mesh.getTotalVertices());
    const indices = safePostParseCount(mesh.getTotalIndices());
    if (vertices < 1 && indices < 1) continue;
    meshes = safeAdd(meshes, 1);
    const subMeshes = sceneArray(mesh.subMeshes);
    drawCalls = safeAdd(drawCalls, Math.max(1, subMeshes.length));
    const drawMode = mesh.material?.fillMode;
    if (typeof drawMode !== "number" || !Number.isSafeInteger(drawMode)) {
      throw captureError("resource-budget-exceeded");
    }
    const elementCount = indices > 0 ? indices : vertices;
    triangles = safeAdd(
      triangles,
      triangleCountForBabylonDrawMode(elementCount, drawMode),
    );
  }

  let morphTargets = 0;
  for (const manager of resources.morphTargetManagers) {
    const targets = safePostParseCount(manager.numTargets);
    morphTargets = safeAdd(morphTargets, targets);
    for (let index = 0; index < targets; index += 1) {
      const target = manager.getTarget(index);
      if (!target) throw captureError("resource-budget-exceeded");
      for (const [value, components] of [
        [target.getPositions(), 3],
        [target.getNormals(), 3],
        [target.getTangents(), 3],
        [target.getUVs(), 2],
        [target.getUV2s(), 2],
        [target.getColors(), 4],
      ] as const) {
        if (value) addData(value, components);
      }
    }
  }

  let animations = 0;
  let animationChannels = 0;
  let animationKeyframes = 0;
  let animationValues = 0;
  for (const group of resources.animationGroups) {
    animations = safeAdd(animations, 1);
    const targetedAnimations = group.targetedAnimations;
    if (!Array.isArray(targetedAnimations)) {
      throw captureError("resource-budget-exceeded");
    }
    animationChannels = safeAdd(animationChannels, targetedAnimations.length);
    for (const targeted of targetedAnimations) {
      const keys = targeted.animation.getKeys();
      if (!Array.isArray(keys)) throw captureError("resource-budget-exceeded");
      animationKeyframes = safeAdd(animationKeyframes, keys.length);
      accessorElements = safeAdd(accessorElements, keys.length);
      decodedGeometryBytes = safeAdd(
        decodedGeometryBytes,
        safeMultiply(keys.length, Float64Array.BYTES_PER_ELEMENT),
      );
      const components = animationComponentCount(targeted.animation.dataType);
      let outputElements = 0;
      for (const key of keys) {
        const tangentElements =
          (key.inTangent === undefined ? 0 : 1) +
          (key.outTangent === undefined ? 0 : 1);
        outputElements = safeAdd(outputElements, 1 + tangentElements);
      }
      const scalarValues = safeMultiply(outputElements, components);
      animationValues = safeAdd(animationValues, scalarValues);
      accessorElements = safeAdd(accessorElements, outputElements);
      decodedGeometryBytes = safeAdd(
        decodedGeometryBytes,
        safeMultiply(scalarValues, Float64Array.BYTES_PER_ELEMENT),
      );
    }
  }

  let joints = 0;
  for (const skeleton of resources.skeletons) {
    if (!Array.isArray(skeleton.bones)) throw captureError("resource-budget-exceeded");
    joints = safeAdd(joints, skeleton.bones.length);
  }

  let textureBytes = 0;
  let textureMipLevels = 0;
  let maxTextureDimension = 0;
  for (const texture of resources.textures) {
    const receipt = textureMipReceipt(texture);
    textureBytes = safeAdd(textureBytes, receipt.bytes);
    textureMipLevels = safeAdd(textureMipLevels, receipt.mipLevels);
    maxTextureDimension = Math.max(maxTextureDimension, receipt.maxDimension);
  }

  return Object.freeze({
    accessorElements,
    animationChannels,
    animationKeyframes,
    animationValues,
    animations,
    cameras: resources.cameras.size,
    decodedGeometryBytes,
    drawCalls,
    geometries: resources.geometries.size,
    joints,
    lights: resources.lights.size,
    materials: resources.materials.size,
    meshes,
    morphTargets,
    nodes: logicalNodes,
    particleSystems: resources.particleSystems.size,
    runtimeNodes,
    skeletons: resources.skeletons.size,
    spriteManagers: resources.spriteManagers.size,
    textureBytes,
    textureMipLevels,
    textures: resources.textures.size,
    maxTextureDimension,
    triangles,
  });
}

export function assertStudioBg3dBabylonPostParseReceipt(
  receipt: StudioBg3dBabylonPostParseReceipt,
  preflight: GlbBudgetFootprint,
  budgets: StudioBg3dSceneBudgets,
): void {
  const complexity = budgets.complexity;
  const textures = budgets.textures;
  if (
    receipt.nodes > complexity.maxNodes ||
    receipt.triangles > complexity.maxTriangles ||
    receipt.drawCalls > complexity.maxDrawCalls ||
    receipt.materials > complexity.maxMaterials ||
    receipt.lights > complexity.maxLights ||
    receipt.animations > complexity.maxAnimations ||
    receipt.animationChannels > complexity.maxAnimationChannels ||
    receipt.animationKeyframes > complexity.maxAnimationKeyframes ||
    receipt.animationValues > complexity.maxAnimationValues ||
    receipt.skeletons > complexity.maxSkins ||
    receipt.joints > complexity.maxJoints ||
    receipt.morphTargets > complexity.maxMorphTargets ||
    receipt.accessorElements > complexity.maxAccessorElements ||
    receipt.decodedGeometryBytes > complexity.maxDecodedGeometryBytes ||
    receipt.textures > textures.maxTextures ||
    receipt.textureBytes > textures.maxTotalBytes ||
    receipt.maxTextureDimension > textures.maxDimension
  ) {
    throw captureError("resource-budget-exceeded");
  }
  if (
    receipt.cameras > 0 ||
    receipt.particleSystems > 0 ||
    receipt.spriteManagers > 0
  ) {
    throw captureError("unsupported-scene-feature");
  }

  const runtimeNodeEnvelope = safeAdd(
    1,
    safeAdd(safeMultiply(preflight.nodes, 2), preflight.drawCalls),
  );
  const decodedByteEnvelope = safeMultiply(
    preflight.decodedGeometryBytes,
    MAX_POST_PARSE_DECODE_AMPLIFICATION,
  );
  if (
    receipt.runtimeNodes > runtimeNodeEnvelope ||
    receipt.nodes > preflight.nodes ||
    receipt.triangles > preflight.triangles ||
    receipt.drawCalls > preflight.drawCalls ||
    receipt.geometries > preflight.drawCalls ||
    receipt.materials > preflight.materialSlots ||
    receipt.lights > preflight.lights ||
    receipt.animations > preflight.animations ||
    receipt.animationChannels > preflight.animationChannels ||
    receipt.animationKeyframes > preflight.animationKeyframes ||
    receipt.animationValues > preflight.animationValues ||
    receipt.skeletons > preflight.skins ||
    receipt.joints > preflight.joints ||
    receipt.morphTargets > preflight.morphTargets ||
    receipt.accessorElements > preflight.accessorElements ||
    receipt.decodedGeometryBytes > decodedByteEnvelope ||
    receipt.textures > preflight.textures
  ) {
    throw captureError("resource-budget-exceeded");
  }
}
