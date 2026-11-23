/**
 * Scene graph construction, material overrides, lighting/shadows, and deadline-bounded
 * normal / stable-ID capture passes for Studio BG3D Babylon capture.
 */

import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import {
  modelMaterialDescriptor,
  primitiveMaterialDescriptor,
  stableObjectDescriptor,
} from "./studio-bg3d-babylon-artifact-descriptors";
import {
  MAX_CAPTURE_WAIT_MS,
  captureError,
  throwIfAborted,
  type RunStudioBg3dBabylonBoundedImportInput,
  type StudioBg3dBabylonBoundedImportResult,
  type StudioBg3dBabylonCapturePlan,
  type StudioBg3dBabylonStableIdFrame,
} from "./studio-bg3d-babylon-artifact-types";
import {
  captureStudioBg3dBabylonNormals,
  StudioBg3dBabylonNormalCaptureError,
} from "./studio-bg3d-babylon-normal-capture";
import { type StudioBg3dBabylonSpecialistExecutionContext } from "./studio-bg3d-babylon-specialist-runtime";
import {
  captureStudioBg3dBabylonStableIds,
  StudioBg3dBabylonStableIdCaptureError,
  type StudioBg3dBabylonStableIdRenderable,
} from "./studio-bg3d-babylon-stable-id-capture";

import type {
  StudioBg3dMaterialOverride,
  StudioBg3dPrimitiveKind,
  StudioBg3dSceneDocument,
  StudioBg3dSceneNode,
} from "./studio-bg3d-scene-document";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

const MODEL_AUTO_FIT_SIZE = 2;

function quaternionFromEulerXyz(rotation: readonly [number, number, number]): Quaternion {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return new Quaternion(
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  );
}

function createFlatRing(name: string, scene: Scene): Mesh {
  const segments = 32;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (const radius of [0.2, 0.5]) {
      positions.push(cosine * radius, sine * radius, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5 + cosine * radius, 0.5 + sine * radius);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const inner = segment * 2;
    const outer = inner + 1;
    indices.push(inner, outer, inner + 2, outer, outer + 2, inner + 2);
  }
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  return mesh;
}

function createPrimitiveMesh(
  kind: StudioBg3dPrimitiveKind,
  name: string,
  scene: Scene,
): Mesh {
  switch (kind) {
    case "box":
      return MeshBuilder.CreateBox(name, { size: 1 }, scene);
    case "cylinder":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 0.6,
        height: 1,
        tessellation: 16,
      }, scene);
    case "plane":
      return MeshBuilder.CreatePlane(name, { size: 1 }, scene);
    case "sphere":
      return MeshBuilder.CreateSphere(name, { diameter: 1, segments: 24 }, scene);
    case "hemisphere":
      return MeshBuilder.CreateSphere(name, {
        diameter: 1,
        segments: 24,
        slice: 0.5,
      }, scene);
    case "cone":
      return MeshBuilder.CreateCylinder(name, {
        diameterTop: 0,
        diameterBottom: 0.8,
        height: 1,
        tessellation: 24,
      }, scene);
    case "pyramid":
      return MeshBuilder.CreateCylinder(name, {
        diameterTop: 0,
        diameterBottom: 1,
        height: 1,
        tessellation: 4,
      }, scene);
    case "triangularPrism":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 1,
        height: 1,
        tessellation: 3,
      }, scene);
    case "hexPrism":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 1,
        height: 1,
        tessellation: 6,
      }, scene);
    case "torus":
      return MeshBuilder.CreateTorus(name, {
        diameter: 0.8,
        thickness: 0.3,
        tessellation: 24,
      }, scene);
    case "tube":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 0.8,
        height: 1,
        tessellation: 24,
        cap: Mesh.NO_CAP,
      }, scene);
    case "ring":
      return createFlatRing(name, scene);
    case "capsule":
      return MeshBuilder.CreateCapsule(name, {
        radius: 0.3,
        height: 1.3,
        tessellation: 16,
        capSubdivisions: 8,
      }, scene);
  }
}

function applyNodeTransform(root: TransformNode, node: StudioBg3dSceneNode): void {
  root.position.copyFromFloats(...node.transform.position);
  root.rotationQuaternion = quaternionFromEulerXyz(node.transform.rotation);
  root.scaling.copyFromFloats(...node.transform.scale);
  root.setEnabled(node.visible);
}

function applyMaterialOverride(
  material: Material,
  override: StudioBg3dMaterialOverride,
): void {
  const target = Color3.FromHexString(override.color);
  const emissive = Color3.FromHexString(override.emissiveColor);
  if (material instanceof PBRMaterial) {
    if (override.colorMode === "replace") {
      material.albedoColor = Color3.Lerp(
        material.albedoColor,
        target,
        override.colorStrength,
      );
    } else if (override.colorMode === "multiply") {
      const multiplied = material.albedoColor.multiply(target);
      material.albedoColor = Color3.Lerp(
        material.albedoColor,
        multiplied,
        override.colorStrength,
      );
    }
    if (override.roughness !== null) material.roughness = override.roughness;
    if (override.metalness !== null) material.metallic = override.metalness;
    material.emissiveColor = emissive;
    if (override.emissiveIntensity !== null) {
      material.emissiveIntensity = override.emissiveIntensity;
    }
  } else if (material instanceof StandardMaterial) {
    if (override.colorMode === "replace") {
      material.diffuseColor = Color3.Lerp(
        material.diffuseColor,
        target,
        override.colorStrength,
      );
    } else if (override.colorMode === "multiply") {
      const multiplied = material.diffuseColor.multiply(target);
      material.diffuseColor = Color3.Lerp(
        material.diffuseColor,
        multiplied,
        override.colorStrength,
      );
    }
    material.emissiveColor = emissive.scale(override.emissiveIntensity ?? 1);
  }
  material.alpha *= override.opacityMultiplier;
  material.wireframe = override.wireframe;
  material.backFaceCulling = !override.doubleSided;
}

function createNodeRoots(
  document: StudioBg3dSceneDocument,
  scene: Scene,
): ReadonlyMap<string, TransformNode> {
  const roots = new Map<string, TransformNode>();
  for (const node of document.nodes) {
    const root = new TransformNode(`studio-node:${node.id}`, scene);
    applyNodeTransform(root, node);
    roots.set(node.id, root);
  }
  for (const node of document.nodes) {
    if (!node.parentId) continue;
    const root = roots.get(node.id);
    const parent = roots.get(node.parentId);
    if (!root || !parent) throw captureError("invalid-snapshot");
    root.parent = parent;
  }
  return roots;
}

function meshBounds(meshes: readonly AbstractMesh[]): {
  readonly maximum: Vector3;
  readonly minimum: Vector3;
} | null {
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  let found = false;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() < 1) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(bounds.minimumWorld);
    maximum.maximizeInPlace(bounds.maximumWorld);
    found = true;
  }
  return found ? { minimum, maximum } : null;
}

function modelAutoFitScale(meshes: readonly AbstractMesh[]): number {
  const bounds = meshBounds(meshes);
  if (!bounds) return 1;
  const size = bounds.maximum.subtract(bounds.minimum);
  const maximumDimension = Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
  return Number.isFinite(maximumDimension) && maximumDimension > 0
    ? MODEL_AUTO_FIT_SIZE / maximumDimension
    : 1;
}

export async function populateScene(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
  scene: Scene,
  runBoundedImport: (
    input: RunStudioBg3dBabylonBoundedImportInput,
  ) => Promise<StudioBg3dBabylonBoundedImportResult>,
): Promise<{
  readonly materialIdRenderables: readonly StudioBg3dBabylonStableIdRenderable[];
  readonly meshes: readonly AbstractMesh[];
  readonly objectIdRenderables: readonly StudioBg3dBabylonStableIdRenderable[];
  readonly shadowCasters: readonly AbstractMesh[];
}> {
  const rootById = createNodeRoots(plan.document, scene);
  const assetByAttachmentId = new Map(
    plan.assets.map((asset) => [asset.attachmentId, asset]),
  );
  const renderMeshes: AbstractMesh[] = [];
  const objectIdRenderables: StudioBg3dBabylonStableIdRenderable[] = [];
  const materialIdRenderables: StudioBg3dBabylonStableIdRenderable[] = [];
  const shadowCasters: AbstractMesh[] = [];

  for (const node of plan.document.nodes) {
    throwIfAborted(context.signal);
    const root = rootById.get(node.id);
    if (!root) throw captureError("invalid-snapshot");
    if (node.kind === "primitive") {
      const mesh = createPrimitiveMesh(node.primitiveKind, `studio-primitive:${node.id}`, scene);
      mesh.parent = root;
      const material = new StandardMaterial(`studio-primitive-material:${node.id}`, scene);
      material.diffuseColor = Color3.FromHexString(node.color);
      mesh.material = material;
      mesh.receiveShadows = node.receivesShadow;
      renderMeshes.push(mesh);
      if (plan.includeObjectId) {
        objectIdRenderables.push({
          descriptor: stableObjectDescriptor(node),
          mesh,
        });
      }
      if (plan.includeMaterialId) {
        materialIdRenderables.push({
          descriptor: primitiveMaterialDescriptor(node),
          mesh,
        });
      }
      if (node.castsShadow) shadowCasters.push(mesh);
      continue;
    }

    const asset = assetByAttachmentId.get(node.attachmentId);
    if (!asset) throw captureError("asset-mismatch");
    const { imported } = await runBoundedImport({
      bytes: asset.bytes,
      budgets: plan.document.budgets,
      name: `${asset.attachmentId}.glb`,
      preflight: asset.footprint,
      texturePlan: asset.texturePlan,
      scene,
      signal: context.signal,
    });
    throwIfAborted(context.signal);
    for (const group of imported.animationGroups) {
      group.stop();
      group.reset();
    }
    const importedNodes = new Set<Node>([
      ...imported.meshes,
      ...imported.transformNodes,
    ]);
    const contentRoot = new TransformNode(`studio-model-content:${node.id}`, scene);
    for (const importedNode of importedNodes) {
      if (!importedNode.parent || !importedNodes.has(importedNode.parent)) {
        importedNode.parent = contentRoot;
      }
    }
    contentRoot.scaling.setAll(modelAutoFitScale(imported.meshes));
    contentRoot.parent = root;
    const overriddenMaterials = new Set<Material>();
    for (const mesh of imported.meshes) {
      if (mesh.getTotalVertices() < 1) continue;
      mesh.receiveShadows = node.receivesShadow;
      if (
        mesh.material &&
        node.materialOverride &&
        !overriddenMaterials.has(mesh.material)
      ) {
        applyMaterialOverride(mesh.material, node.materialOverride);
        overriddenMaterials.add(mesh.material);
      }
      renderMeshes.push(mesh);
      if (plan.includeObjectId) {
        objectIdRenderables.push({
          descriptor: stableObjectDescriptor(node),
          mesh,
        });
      }
      if (plan.includeMaterialId) {
        materialIdRenderables.push({
          descriptor: modelMaterialDescriptor(asset, mesh, node),
          mesh,
        });
      }
      if (node.castsShadow) shadowCasters.push(mesh);
    }
  }
  return Object.freeze({
    materialIdRenderables: Object.freeze(materialIdRenderables),
    meshes: Object.freeze(renderMeshes),
    objectIdRenderables: Object.freeze(objectIdRenderables),
    shadowCasters: Object.freeze(shadowCasters),
  });
}

export function setupScenePresentation(
  document: StudioBg3dSceneDocument,
  scene: Scene,
): void {
  scene.useRightHandedSystem = true;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  const transparent =
    document.output.transparentBackground || document.background.mode === "transparent";
  const clearColor = document.background.mode === "color"
    ? document.background.color
    : document.background.skyPresetId === "blank"
      ? "#ffffff"
      : document.background.color;
  const parsedClearColor = transparent
    ? Color3.Black()
    : Color3.FromHexString(clearColor);
  scene.clearColor = new Color4(
    parsedClearColor.r,
    parsedClearColor.g,
    parsedClearColor.b,
    transparent ? 0 : 1,
  );

  const image = scene.imageProcessingConfiguration;
  image.exposure = document.render.exposure;
  image.toneMappingEnabled = document.render.toneMapping !== "none";
  image.toneMappingType = document.render.toneMapping === "aces"
    ? ImageProcessingConfiguration.TONEMAPPING_ACES
    : ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  image.applyByPostProcess = false;

  if (document.background.fogEnabled) {
    scene.fogMode = 3;
    scene.fogStart = document.background.fogNear ?? 10;
    scene.fogEnd = document.background.fogFar ?? 50;
    scene.fogColor = Color3.FromHexString(document.background.fogColor ?? clearColor);
  }
}

export function setupLightingAndShadows(
  document: StudioBg3dSceneDocument,
  scene: Scene,
  shadowCasters: readonly AbstractMesh[],
): void {
  const ambient = new HemisphericLight(
    "studio-ambient",
    Vector3.Up(),
    scene,
  );
  ambient.diffuse = Color3.FromHexString(document.lighting.ambientColor);
  ambient.groundColor = ambient.diffuse.clone();
  ambient.specular = Color3.Black();
  ambient.intensity = document.lighting.ambientIntensity;

  for (const [name, settings] of [
    ["key", document.lighting.key],
    ["fill", document.lighting.fill],
  ] as const) {
    const light = new DirectionalLight(
      `studio-${name}`,
      new Vector3(
        -settings.direction[0],
        -settings.direction[1],
        -settings.direction[2],
      ),
      scene,
    );
    light.diffuse = Color3.FromHexString(settings.color);
    light.intensity = settings.intensity;
    if (
      document.render.shadows &&
      settings.castsShadow &&
      shadowCasters.length > 0
    ) {
      const generator = new ShadowGenerator(
        Math.min(2048, document.quality.desktop.shadowMapSize),
        light,
        true,
      );
      generator.usePercentageCloserFiltering = true;
      generator.bias = 0.0005;
      generator.normalBias = 0.02;
      for (const mesh of shadowCasters) generator.addShadowCaster(mesh, false);
    }
  }
}

export async function captureStudioBg3dBabylonNormalsWithDeadline(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
  scene: Scene,
  meshes: readonly AbstractMesh[],
  depth: Float32Array,
): Promise<Uint8Array> {
  throwIfAborted(context.signal);
  const controller = new AbortController();
  let timedOut = false;
  const abortFromJob = () => controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAX_CAPTURE_WAIT_MS);
  context.signal.addEventListener("abort", abortFromJob, { once: true });
  try {
    return await captureStudioBg3dBabylonNormals({
      backend: plan.backend,
      depth,
      height: plan.height,
      meshes,
      scene,
      signal: controller.signal,
      width: plan.width,
    });
  } catch (error) {
    if (context.signal.aborted) throw captureError("aborted", error);
    if (timedOut) throw captureError("timeout", error);
    if (error instanceof StudioBg3dBabylonNormalCaptureError) {
      if (error.code === "aborted") throw captureError("aborted", error);
      if (error.code === "unsupported") {
        throw captureError("unsupported-artifact", error);
      }
      throw captureError("capture-failed", error);
    }
    throw captureError("capture-failed", error);
  } finally {
    clearTimeout(timeout);
    context.signal.removeEventListener("abort", abortFromJob);
  }
}

export async function captureStudioBg3dBabylonStableIdsWithDeadline(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
  scene: Scene,
  renderables: readonly StudioBg3dBabylonStableIdRenderable[],
): Promise<StudioBg3dBabylonStableIdFrame> {
  throwIfAborted(context.signal);
  const controller = new AbortController();
  let timedOut = false;
  const abortFromJob = () => controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAX_CAPTURE_WAIT_MS);
  context.signal.addEventListener("abort", abortFromJob, { once: true });
  try {
    return await captureStudioBg3dBabylonStableIds({
      backend: plan.backend,
      height: plan.height,
      renderables,
      scene,
      signal: controller.signal,
      width: plan.width,
    });
  } catch (error) {
    if (context.signal.aborted) throw captureError("aborted", error);
    if (timedOut) throw captureError("timeout", error);
    if (error instanceof StudioBg3dBabylonStableIdCaptureError) {
      if (error.code === "aborted") throw captureError("aborted", error);
      if (error.code === "unsupported") {
        throw captureError("unsupported-artifact", error);
      }
      throw captureError("capture-failed", error);
    }
    throw captureError("capture-failed", error);
  } finally {
    clearTimeout(timeout);
    context.signal.removeEventListener("abort", abortFromJob);
  }
}
