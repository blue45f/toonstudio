/**
 * Scene resource delta tracking, exactly-once disposal, glTF pointer inspection,
 * and stable-ID descriptors for Studio BG3D Babylon artifact capture.
 */

import {
  StudioBg3dBabylonCaptureError,
  captureError,
  isPlainRecord,
  recordArray,
  safeNonNegativeCount,
  type StudioBg3dBabylonCaptureAsset,
} from "./studio-bg3d-babylon-artifact-types";

import type { StudioBg3dStableIdDescriptor } from "./studio-bg3d-babylon-stable-id-packing";
import type {
  StudioBg3dModelNode,
  StudioBg3dSceneNode,
} from "./studio-bg3d-scene-document";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Light } from "@babylonjs/core/Lights/light";
import type { ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { IParticleSystem } from "@babylonjs/core/Particles/IParticleSystem";
import type { Scene } from "@babylonjs/core/scene";
import type { ISpriteManager } from "@babylonjs/core/Sprites/spriteManager";

const GLTF_PRIMITIVE_POINTER_PATTERN =
  /^\/meshes\/(0|[1-9]\d*)\/primitives\/(0|[1-9]\d*)$/;
const GLTF_MATERIAL_POINTER_PATTERN = /^\/materials\/(0|[1-9]\d*)$/;
const STABLE_ID_LEGEND_LABEL_MAX_LENGTH = 160;

export interface StudioBg3dBabylonSceneResourceSnapshot {
  readonly animationGroups: ReadonlySet<AnimationGroup>;
  readonly cameras: ReadonlySet<Camera>;
  readonly geometries: ReadonlySet<Geometry>;
  readonly lights: ReadonlySet<Light>;
  readonly materials: ReadonlySet<Material>;
  readonly meshes: ReadonlySet<AbstractMesh>;
  readonly morphTargetManagers: ReadonlySet<MorphTargetManager>;
  readonly multiMaterials: ReadonlySet<MultiMaterial>;
  readonly particleSystems: ReadonlySet<IParticleSystem>;
  readonly skeletons: ReadonlySet<Skeleton>;
  readonly spriteManagers: ReadonlySet<ISpriteManager>;
  readonly textures: ReadonlySet<BaseTexture>;
  readonly transformNodes: ReadonlySet<TransformNode>;
}

export interface StudioBg3dBabylonSceneResourceDelta {
  readonly animationGroups: Set<AnimationGroup>;
  readonly cameras: Set<Camera>;
  readonly geometries: Set<Geometry>;
  readonly lights: Set<Light>;
  readonly materials: Set<Material>;
  readonly meshes: Set<AbstractMesh>;
  readonly morphTargetManagers: Set<MorphTargetManager>;
  readonly multiMaterials: Set<MultiMaterial>;
  readonly particleSystems: Set<IParticleSystem>;
  readonly skeletons: Set<Skeleton>;
  readonly spriteManagers: Set<ISpriteManager>;
  readonly textures: Set<BaseTexture>;
  readonly transformNodes: Set<TransformNode>;
}

export function sceneArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

export function snapshotStudioBg3dBabylonSceneResources(
  scene: Scene,
): StudioBg3dBabylonSceneResourceSnapshot {
  return {
    animationGroups: new Set(sceneArray(scene.animationGroups)),
    cameras: new Set(sceneArray(scene.cameras)),
    geometries: new Set(sceneArray(scene.geometries)),
    lights: new Set(sceneArray(scene.lights)),
    materials: new Set(sceneArray(scene.materials)),
    meshes: new Set(sceneArray(scene.meshes)),
    morphTargetManagers: new Set(sceneArray(scene.morphTargetManagers)),
    multiMaterials: new Set(sceneArray(scene.multiMaterials)),
    particleSystems: new Set(sceneArray(scene.particleSystems)),
    skeletons: new Set(sceneArray(scene.skeletons)),
    spriteManagers: new Set(sceneArray(scene.spriteManagers)),
    textures: new Set(sceneArray(scene.textures)),
    transformNodes: new Set(sceneArray(scene.transformNodes)),
  };
}

function setDelta<T>(
  current: readonly T[] | null | undefined,
  previous: ReadonlySet<T>,
): Set<T> {
  const result = new Set<T>();
  for (const resource of sceneArray(current)) {
    if (!previous.has(resource)) result.add(resource);
  }
  return result;
}

function addImportedResources(
  resources: StudioBg3dBabylonSceneResourceDelta,
  previous: StudioBg3dBabylonSceneResourceSnapshot,
  imported: ISceneLoaderAsyncResult | null,
): void {
  if (!imported) return;
  for (const resource of sceneArray(imported.meshes)) {
    if (!previous.meshes.has(resource)) resources.meshes.add(resource);
  }
  for (const resource of sceneArray(imported.transformNodes)) {
    if (!previous.transformNodes.has(resource)) resources.transformNodes.add(resource);
  }
  for (const resource of sceneArray(imported.geometries)) {
    if (!previous.geometries.has(resource)) resources.geometries.add(resource);
  }
  for (const resource of sceneArray(imported.animationGroups)) {
    if (!previous.animationGroups.has(resource)) resources.animationGroups.add(resource);
  }
  for (const resource of sceneArray(imported.skeletons)) {
    if (!previous.skeletons.has(resource)) resources.skeletons.add(resource);
  }
  for (const resource of sceneArray(imported.lights)) {
    if (!previous.lights.has(resource)) resources.lights.add(resource);
  }
  for (const resource of sceneArray(imported.particleSystems)) {
    if (!previous.particleSystems.has(resource)) resources.particleSystems.add(resource);
  }
  for (const resource of sceneArray(imported.spriteManagers)) {
    if (!previous.spriteManagers.has(resource)) resources.spriteManagers.add(resource);
  }
}

function materialClassName(material: Material): string {
  try {
    return material.getClassName();
  } catch {
    return "";
  }
}

export function collectStudioBg3dBabylonSceneResourceDelta(
  scene: Scene,
  previous: StudioBg3dBabylonSceneResourceSnapshot,
  imported: ISceneLoaderAsyncResult | null = null,
  strictTextureEnumeration = false,
): StudioBg3dBabylonSceneResourceDelta {
  const resources: StudioBg3dBabylonSceneResourceDelta = {
    animationGroups: setDelta(scene.animationGroups, previous.animationGroups),
    cameras: setDelta(scene.cameras, previous.cameras),
    geometries: setDelta(scene.geometries, previous.geometries),
    lights: setDelta(scene.lights, previous.lights),
    materials: setDelta(scene.materials, previous.materials),
    meshes: setDelta(scene.meshes, previous.meshes),
    morphTargetManagers: setDelta(
      scene.morphTargetManagers,
      previous.morphTargetManagers,
    ),
    multiMaterials: setDelta(scene.multiMaterials, previous.multiMaterials),
    particleSystems: setDelta(scene.particleSystems, previous.particleSystems),
    skeletons: setDelta(scene.skeletons, previous.skeletons),
    spriteManagers: setDelta(scene.spriteManagers, previous.spriteManagers),
    textures: setDelta(scene.textures, previous.textures),
    transformNodes: setDelta(scene.transformNodes, previous.transformNodes),
  };
  addImportedResources(resources, previous, imported);

  for (const mesh of resources.meshes) {
    const material = mesh.material;
    if (!material) continue;
    if (
      !previous.multiMaterials.has(material as MultiMaterial) &&
      materialClassName(material) === "MultiMaterial"
    ) {
      resources.multiMaterials.add(material as MultiMaterial);
    } else if (!previous.materials.has(material)) {
      resources.materials.add(material);
    }
    try {
      for (const texture of material.getActiveTextures()) {
        if (!previous.textures.has(texture)) resources.textures.add(texture);
      }
    } catch {
      if (strictTextureEnumeration) {
        throw captureError("resource-budget-exceeded");
      }
    }
    const geometry = mesh.geometry;
    if (geometry && !previous.geometries.has(geometry)) resources.geometries.add(geometry);
    const skeleton = mesh.skeleton;
    if (skeleton && !previous.skeletons.has(skeleton)) resources.skeletons.add(skeleton);
    const morphTargetManager = mesh.morphTargetManager;
    if (
      morphTargetManager &&
      !previous.morphTargetManagers.has(morphTargetManager)
    ) {
      resources.morphTargetManagers.add(morphTargetManager);
    }
  }
  return resources;
}

function safeDisposeBabylonResource(
  resource: unknown,
  disposed: Set<object>,
  args: readonly unknown[] = [],
): void {
  if (
    (typeof resource !== "object" && typeof resource !== "function") ||
    resource === null ||
    disposed.has(resource)
  ) {
    return;
  }
  disposed.add(resource);
  try {
    const dispose = Reflect.get(resource, "dispose");
    if (typeof dispose === "function") Reflect.apply(dispose, resource, args);
  } catch {
    // A hostile or already-lost GPU resource must not stop disposal of the remaining import delta.
  }
}

export function disposeStudioBg3dBabylonImportDelta(
  scene: Scene,
  previous: StudioBg3dBabylonSceneResourceSnapshot,
  imported: ISceneLoaderAsyncResult | null,
  disposed: Set<object>,
): void {
  const resources = collectStudioBg3dBabylonSceneResourceDelta(scene, previous, imported);
  for (const resource of resources.animationGroups) {
    safeDisposeBabylonResource(resource, disposed);
  }
  for (const resource of resources.particleSystems) {
    safeDisposeBabylonResource(resource, disposed, [false, false, false]);
  }
  for (const resource of resources.spriteManagers) {
    safeDisposeBabylonResource(resource, disposed);
  }
  for (const resource of resources.geometries) {
    safeDisposeBabylonResource(resource, disposed);
  }
  for (const resource of resources.meshes) {
    safeDisposeBabylonResource(resource, disposed, [true, false]);
  }
  for (const resource of resources.transformNodes) {
    safeDisposeBabylonResource(resource, disposed, [true, false]);
  }
  for (const resource of resources.lights) {
    safeDisposeBabylonResource(resource, disposed, [true, false]);
  }
  for (const resource of resources.cameras) {
    safeDisposeBabylonResource(resource, disposed, [true, false]);
  }
  for (const resource of resources.skeletons) {
    safeDisposeBabylonResource(resource, disposed);
  }
  for (const resource of resources.morphTargetManagers) {
    safeDisposeBabylonResource(resource, disposed);
  }
  for (const resource of resources.multiMaterials) {
    safeDisposeBabylonResource(resource, disposed, [false, false, false]);
  }
  for (const resource of resources.materials) {
    safeDisposeBabylonResource(resource, disposed, [false, false, true]);
  }
  for (const resource of resources.textures) {
    safeDisposeBabylonResource(resource, disposed);
  }
}

export function loaderOwnedGltfPointers(resource: unknown): readonly string[] {
  if (
    (typeof resource !== "object" && typeof resource !== "function") ||
    resource === null
  ) {
    return [];
  }
  try {
    const internalMetadata = Reflect.get(resource, "_internalMetadata");
    if (!isPlainRecord(internalMetadata)) return [];
    const gltf = internalMetadata.gltf;
    if (!isPlainRecord(gltf) || !Array.isArray(gltf.pointers)) return [];
    if (!gltf.pointers.every((pointer) => typeof pointer === "string")) {
      throw captureError("resource-budget-exceeded");
    }
    return gltf.pointers;
  } catch (error) {
    if (error instanceof StudioBg3dBabylonCaptureError) throw error;
    throw captureError("resource-budget-exceeded", error);
  }
}

function boundedStableIdLabel(
  base: string,
  suffix: string,
  fallback: string,
): string {
  const normalizedBase = base
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const normalizedSuffix = suffix
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const safeBase = normalizedBase || fallback;
  const separator = normalizedSuffix ? " · " : "";
  const reservedLength = separator.length + normalizedSuffix.length;
  const maximumBaseLength = Math.max(
    1,
    STABLE_ID_LEGEND_LABEL_MAX_LENGTH - reservedLength,
  );
  let boundedBase = "";
  for (const character of safeBase) {
    if (boundedBase.length + character.length > maximumBaseLength) break;
    boundedBase += character;
  }
  const result = `${boundedBase || fallback}${separator}${normalizedSuffix}`;
  if (result.length <= STABLE_ID_LEGEND_LABEL_MAX_LENGTH) return result;
  let bounded = "";
  for (const character of result) {
    if (bounded.length + character.length > STABLE_ID_LEGEND_LABEL_MAX_LENGTH) break;
    bounded += character;
  }
  return bounded || fallback;
}

export function stableObjectDescriptor(
  node: StudioBg3dSceneNode,
): StudioBg3dStableIdDescriptor {
  return {
    stableId: `obj/${node.id}`,
    label: boundedStableIdLabel(node.name, "", "3D object"),
  };
}

export function primitiveMaterialDescriptor(
  node: StudioBg3dSceneNode,
): StudioBg3dStableIdDescriptor {
  return {
    stableId: `mat/${node.id}/primitive`,
    label: boundedStableIdLabel(node.name, "기본 재질", "3D material"),
  };
}

function uniqueGltfIndexPointer(
  resource: unknown,
  pattern: RegExp,
): readonly number[] | null {
  const matches = new Map<string, readonly number[]>();
  for (const pointer of loaderOwnedGltfPointers(resource)) {
    const match = pattern.exec(pointer);
    if (!match) continue;
    const indices = match.slice(1).map(Number);
    if (indices.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw captureError("unsupported-artifact");
    }
    matches.set(pointer, Object.freeze(indices));
  }
  if (matches.size !== 1) return null;
  return matches.values().next().value ?? null;
}

export function modelMaterialDescriptor(
  asset: StudioBg3dBabylonCaptureAsset,
  mesh: AbstractMesh,
  node: StudioBg3dModelNode,
): StudioBg3dStableIdDescriptor {
  const indices = uniqueGltfIndexPointer(mesh, GLTF_PRIMITIVE_POINTER_PATTERN);
  if (!indices || indices.length !== 2) {
    throw captureError("unsupported-artifact");
  }
  const [meshIndex, primitiveIndex] = indices;
  const gltfMeshes = recordArray(asset.glbJson.meshes);
  const sourceMesh = gltfMeshes[meshIndex!];
  const primitive = sourceMesh
    ? recordArray(sourceMesh.primitives)[primitiveIndex!]
    : undefined;
  if (!primitive) throw captureError("unsupported-artifact");

  const materials = recordArray(asset.glbJson.materials);
  const materialIndex = primitive.material === undefined
    ? null
    : safeNonNegativeCount(primitive.material);
  if (materialIndex !== null && materialIndex >= materials.length) {
    throw captureError("unsupported-artifact");
  }

  const runtimeMaterialIndex = mesh.material
    ? uniqueGltfIndexPointer(mesh.material, GLTF_MATERIAL_POINTER_PATTERN)
    : null;
  if (
    runtimeMaterialIndex &&
    (
      runtimeMaterialIndex.length !== 1 ||
      materialIndex === null ||
      runtimeMaterialIndex[0] !== materialIndex
    )
  ) {
    throw captureError("unsupported-artifact");
  }

  return materialIndex === null
    ? {
      stableId: `mat/${node.id}/gltf-default`,
      label: boundedStableIdLabel(node.name, "기본 재질", "3D material"),
    }
    : {
      stableId: `mat/${node.id}/gltf-material/${materialIndex}`,
      label: boundedStableIdLabel(
        node.name,
        `재질 ${materialIndex + 1}`,
        "3D material",
      ),
    };
}
