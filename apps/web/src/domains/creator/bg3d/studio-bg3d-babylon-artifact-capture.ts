/**
 * Babylon implementation of the renderer-neutral Studio BG3D capture boundary.
 *
 * This module is reachable only from `studio-bg3d-babylon-specialist-entry.ts`, which is itself
 * loaded by one explicit dynamic import. Keep every Babylon import inside that static closure.
 */

import { Constants } from "@babylonjs/core/Engines/constants";
import {
  ImportMeshAsync,
  RegisterSceneLoaderPlugin,
  type ISceneLoaderAsyncResult,
} from "@babylonjs/core/Loading/sceneLoader";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Meshes/instancedMesh";
import { GetEnvironmentBRDFTexture } from "@babylonjs/core/Misc/brdfTextureTools";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { registerBuiltInGLTFExtensions } from "@babylonjs/loaders/glTF/2.0/Extensions/dynamic";
import { RegisterGLTF2Loader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.pure";
import {
  GLTFFileLoader,
  GLTFLoaderAnimationStartMode,
} from "@babylonjs/loaders/glTF/glTFFileLoader.pure";

import {
  collectStudioBg3dBabylonSceneResourceDelta,
  disposeStudioBg3dBabylonImportDelta,
  loaderOwnedGltfPointers,
  snapshotStudioBg3dBabylonSceneResources,
} from "./studio-bg3d-babylon-artifact-descriptors";
import {
  createCapturePlan,
  metricsResult,
  resolveCaptureRequest,
  toArtifactResult,
  validateFrame,
} from "./studio-bg3d-babylon-artifact-glb-budget";
import {
  assertStudioBg3dBabylonPostParseReceipt,
  measureStudioBg3dBabylonPostParseReceipt,
  textureMipReceipt,
} from "./studio-bg3d-babylon-artifact-post-parse";
import {
  captureStudioBg3dBabylonNormalsWithDeadline,
  captureStudioBg3dBabylonStableIdsWithDeadline,
  populateScene,
  setupLightingAndShadows,
  setupScenePresentation,
} from "./studio-bg3d-babylon-artifact-scene-builder";
import {
  FLOAT_TOLERANCE,
  StudioBg3dBabylonCaptureError,
  captureError,
  throwIfAborted,
  withAbortAndDeadline,
  type RunStudioBg3dBabylonBoundedImportInput,
  type StudioBg3dBabylonBoundedImportResult,
  type StudioBg3dBabylonCaptureFrame,
  type StudioBg3dBabylonCapturePlan,
  type StudioBg3dBabylonCaptureRenderer,
  type StudioBg3dBabylonReadbackStage,
  type StudioBg3dBabylonSerializedReadbackOptions,
  type StudioBg3dBabylonSerializedReadbackResult,
} from "./studio-bg3d-babylon-artifact-types";
import { createStudioBg3dBabylonCaptureCamera } from "./studio-bg3d-babylon-camera-projection";
import {
  StudioBg3dBabylonSpecialistError,
  type StudioBg3dBabylonSpecialistExecutionContext,
  type StudioBg3dBabylonSpecialistExecutor,
} from "./studio-bg3d-babylon-specialist-runtime";

import type { StudioBg3dSpecialistResult } from "./studio-bg3d-runtime-adapter";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { Scene } from "@babylonjs/core/scene";

export {
  StudioBg3dBabylonCaptureError,
  type GlbBudgetFootprint,
  type RunStudioBg3dBabylonBoundedImportInput,
  type StudioBg3dBabylonBoundedImportResult,
  type StudioBg3dBabylonCaptureErrorCode,
  type StudioBg3dBabylonCaptureFrame,
  type StudioBg3dBabylonCapturePlan,
  type StudioBg3dBabylonCaptureRenderer,
  type StudioBg3dBabylonMeshImporter,
  type StudioBg3dBabylonPostParseReceipt,
  type StudioBg3dBabylonReadbackStage,
  type StudioBg3dBabylonSerializedReadbackOptions,
  type StudioBg3dBabylonSerializedReadbackResult,
  type StudioBg3dBabylonStableIdFrame,
} from "./studio-bg3d-babylon-artifact-types";

/**
 * Registration is intentionally explicit. The specialist accepts only GLB and never installs the
 * OBJ/STL/SPLAT loaders or Babylon's catch-all loader bundle.
 */
RegisterSceneLoaderPlugin(new GLTFFileLoader({
  animationStartMode: GLTFLoaderAnimationStartMode.NONE,
  compileMaterials: true,
  compileShadowGenerators: false,
}));
RegisterGLTF2Loader();
registerBuiltInGLTFExtensions();

function readbackStageError(
  stage: StudioBg3dBabylonReadbackStage,
  error: unknown,
): StudioBg3dBabylonCaptureError {
  return new StudioBg3dBabylonCaptureError(
    error instanceof StudioBg3dBabylonCaptureError
      ? error.code
      : "capture-failed",
    error,
    stage,
  );
}

/**
 * Babylon WebGPU readbacks share one device queue. Keep mappings strictly serial and retain a
 * lease on renderer-owned resources until every operation settles.
 */
export async function runStudioBg3dBabylonSerializedReadbacks<TBeauty, TDepth>(
  options: StudioBg3dBabylonSerializedReadbackOptions<TBeauty, TDepth>,
): Promise<StudioBg3dBabylonSerializedReadbackResult<TBeauty, TDepth>> {
  const pending = new Set<Promise<void>>();

  const runStage = async <T>(
    stage: StudioBg3dBabylonReadbackStage,
    start: () => Promise<T>,
  ): Promise<T> => {
    try {
      throwIfAborted(options.signal);
      const operation = start();
      const drained = operation.then(
        () => undefined,
        () => undefined,
      );
      pending.add(drained);
      void drained.then(() => pending.delete(drained));
      return await withAbortAndDeadline(
        operation,
        options.signal,
        options.deadlineMs,
      );
    } catch (error) {
      throw readbackStageError(stage, error);
    }
  };

  try {
    const beauty = options.beauty
      ? await runStage("beauty", options.beauty)
      : undefined;
    const depth = options.depth
      ? await runStage("depth", options.depth)
      : undefined;
    return {
      ...(beauty === undefined ? {} : { beauty }),
      ...(depth === undefined ? {} : { depth }),
    };
  } finally {
    const inFlight = [...pending];
    if (inFlight.length === 0) {
      options.release();
    } else {
      void Promise.all(inFlight).then(() => {
        try {
          options.release();
        } catch {
          // Best-effort late cleanup.
        }
      });
    }
  }
}

/**
 * Imports one verified GLB into an isolated Babylon scene with post-parse budget auditing.
 */
export async function runStudioBg3dBabylonBoundedImport(
  input: RunStudioBg3dBabylonBoundedImportInput,
): Promise<StudioBg3dBabylonBoundedImportResult> {
  throwIfAborted(input.signal);
  if (typeof input.scene.getClassName === "function") {
    GetEnvironmentBRDFTexture(input.scene);
  }
  const previous = snapshotStudioBg3dBabylonSceneResources(input.scene);
  const disposed = new Set<object>();
  let cleanupLateResult = false;
  const importMesh = input.importMesh ?? ImportMeshAsync;
  const operation = Promise.resolve().then(() =>
    importMesh(input.bytes, input.scene, {
      meshNames: null,
      name: input.name,
      pluginExtension: ".glb",
      rootUrl: "",
    }),
  );
  const observed = operation.then(
    (imported) => {
      if (cleanupLateResult) {
        disposeStudioBg3dBabylonImportDelta(
          input.scene,
          previous,
          imported,
          disposed,
        );
      }
      return imported;
    },
    (error: unknown) => {
      if (cleanupLateResult) {
        disposeStudioBg3dBabylonImportDelta(
          input.scene,
          previous,
          null,
          disposed,
        );
      }
      throw error;
    },
  );

  let imported: ISceneLoaderAsyncResult | null = null;
  try {
    imported = await withAbortAndDeadline(observed, input.signal);
    throwIfAborted(input.signal);
    const resources = collectStudioBg3dBabylonSceneResourceDelta(
      input.scene,
      previous,
      imported,
      true,
    );
    const receipt = measureStudioBg3dBabylonPostParseReceipt(
      resources,
      imported,
      input.preflight,
    );
    for (const material of resources.materials) {
      const pointers = loaderOwnedGltfPointers(material);
      const bindings = input.texturePlan?.bindings.filter((binding) =>
        pointers.includes(binding.pointer.split("/").slice(0, 3).join("/")),
      ) ?? [];
      for (const binding of bindings) {
        const albedo = (material as PBRMaterial).albedoTexture;
        if (!albedo || !resources.textures.has(albedo)
          || !loaderOwnedGltfPointers(albedo).includes(binding.pointer)) {
          throw captureError("resource-budget-exceeded");
        }
      }
    }
    if (resources.textures.size > 0) {
      const plan = input.texturePlan;
      if (!plan || receipt.textureBytes > plan.textureBytes) throw captureError("resource-budget-exceeded");
      const uses = new Map<string, number>();
      for (const texture of resources.textures) {
        const pointers = loaderOwnedGltfPointers(texture);
        const candidates = plan.bindings.filter((binding) => pointers.includes(binding.pointer));
        if (candidates.length !== 1) throw captureError("resource-budget-exceeded");
        const binding = candidates[0]!;
        const size = texture.getSize();
        const internal = texture.getInternalTexture();
        const mip = textureMipReceipt(texture);
        const instances = (uses.get(binding.pointer) ?? 0) + 1;
        uses.set(binding.pointer, instances);
        if (size.width !== binding.width || size.height !== binding.height
          || mip.mipLevels !== binding.mipLevels || instances > binding.maxInstances
          || texture.isCube || internal?.is3D || (internal?.depth ?? 0) > 1) {
          throw captureError("resource-budget-exceeded");
        }
      }
    }
    assertStudioBg3dBabylonPostParseReceipt(
      receipt,
      input.preflight,
      input.budgets,
    );
    throwIfAborted(input.signal);
    return Object.freeze({ imported, receipt });
  } catch (error) {
    cleanupLateResult = true;
    disposeStudioBg3dBabylonImportDelta(
      input.scene,
      previous,
      imported,
      disposed,
    );
    throw error;
  }
}

function rgbaRowsTopDown(
  source: ArrayBufferView,
  width: number,
  height: number,
  flipY: boolean,
  swapRedBlue: boolean,
  unpremultiplyAlpha: boolean,
): Uint8Array {
  if (!(source instanceof Uint8Array) || source.byteLength !== width * height * 4) {
    throw captureError("capture-failed");
  }
  const output = new Uint8Array(source.byteLength);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      let red = source[sourceOffset + (swapRedBlue ? 2 : 0)];
      const green = source[sourceOffset + 1];
      let blue = source[sourceOffset + (swapRedBlue ? 0 : 2)];
      const alpha = source[sourceOffset + 3];
      if (unpremultiplyAlpha) {
        if (alpha === 0) {
          red = 0;
          blue = 0;
          output[targetOffset + 1] = 0;
        } else if (alpha < 255) {
          red = Math.min(255, Math.round((red * 255) / alpha));
          blue = Math.min(255, Math.round((blue * 255) / alpha));
          output[targetOffset + 1] = Math.min(255, Math.round((green * 255) / alpha));
        } else {
          output[targetOffset + 1] = green;
        }
      } else {
        output[targetOffset + 1] = green;
      }
      output[targetOffset] = red;
      output[targetOffset + 2] = blue;
      output[targetOffset + 3] = alpha;
    }
  }
  return output;
}

/** Depth RTTs are bottom-up on both WebGL2 and WebGPU, unlike the WebGPU swapchain. */
export function readStudioBg3dBabylonDepthTopDown(
  source: ArrayBufferView,
  width: number,
  height: number,
): Float32Array {
  const pixels = width * height;
  if (
    !(source instanceof Float32Array) ||
    (source.length !== pixels && source.length !== pixels * 4)
  ) {
    throw captureError("capture-failed");
  }
  const channels = source.length === pixels ? 1 : 4;
  const output = new Float32Array(pixels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const sample = source[(sourceY * width + x) * channels];
      if (
        typeof sample !== "number" ||
        !Number.isFinite(sample) ||
        sample < -FLOAT_TOLERANCE ||
        sample > 1 + FLOAT_TOLERANCE
      ) {
        throw captureError("capture-failed");
      }
      output[y * width + x] = Math.min(1, Math.max(0, sample));
    }
  }
  return output;
}

function webGpuReadbackUsesBgra(
  engine: AbstractEngine,
  backend: StudioBg3dBabylonCapturePlan["backend"],
): boolean {
  const inspected = engine as AbstractEngine & {
    readonly _colorFormat?: unknown;
    readonly isWebGPU?: unknown;
    readonly webGLVersion?: unknown;
  };
  if (backend === "webgl2") {
    if (inspected.isWebGPU === true || inspected.webGLVersion !== 2) {
      throw captureError("renderer-unavailable");
    }
    return false;
  }
  if (inspected.isWebGPU !== true || typeof inspected._colorFormat !== "string") {
    throw captureError("renderer-unavailable");
  }
  if (inspected._colorFormat.startsWith("bgra8")) return true;
  if (inspected._colorFormat.startsWith("rgba8")) return false;
  throw captureError("renderer-unavailable");
}

async function renderStudioBg3dBabylonCapture(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
): Promise<StudioBg3dBabylonCaptureFrame> {
  const engine = context.engine as AbstractEngine;
  const scene = context.scene as Scene;
  if (
    typeof engine.setSize !== "function" ||
    (plan.includeBeauty && typeof engine.readPixels !== "function") ||
    typeof scene.render !== "function" ||
    typeof scene.whenReadyAsync !== "function"
  ) {
    throw captureError("renderer-unavailable");
  }
  const transparent =
    plan.document.output.transparentBackground ||
    plan.document.background.mode === "transparent";
  if (plan.includeBeauty && transparent && plan.backend === "webgpu") {
    throw captureError("unsupported-scene-feature");
  }
  const swapRedBlue = plan.includeBeauty && webGpuReadbackUsesBgra(engine, plan.backend);
  throwIfAborted(context.signal);
  engine.setHardwareScalingLevel(1);
  engine.setSize(plan.width, plan.height, true);
  if (
    engine.getRenderWidth(true) !== plan.width ||
    engine.getRenderHeight(true) !== plan.height
  ) {
    throw captureError("renderer-unavailable");
  }
  setupScenePresentation(plan.document, scene);
  const camera = createStudioBg3dBabylonCaptureCamera(plan.document.camera, plan.width, plan.height, scene);
  const populated = await populateScene(context, plan, scene, runStudioBg3dBabylonBoundedImport);
  setupLightingAndShadows(
    plan.document,
    scene,
    populated.shadowCasters,
  );

  const hasDepthGeometry = populated.meshes.some((mesh) =>
    mesh.getTotalVertices() > 0 && mesh.isEnabled() && mesh.isVisible,
  );
  const requiresDepth = plan.includeDepth || plan.includeNormal;
  let depthRenderer: DepthRenderer | null = null;
  let readbacksOwnDepthRenderer = false;
  let readbacksDrained = false;
  let depthRendererDisposeRequested = false;
  let depthRendererDisposed = false;
  const disposeDepthRendererIfReady = () => {
    if (
      depthRendererDisposed ||
      !depthRendererDisposeRequested ||
      !readbacksDrained
    ) {
      return;
    }
    depthRendererDisposed = true;
    depthRenderer?.dispose();
  };
  try {
    if (requiresDepth && hasDepthGeometry) {
      depthRenderer = scene.enableDepthRenderer(
        camera,
        false,
        true,
        Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        false,
      );
      if (depthRenderer.isPacked) throw captureError("renderer-unavailable");
      depthRenderer.clearColor = new Color4(1, 1, 1, 1);
      depthRenderer.forceDepthWriteTransparentMeshes = true;
      depthRenderer.useOnlyInActiveCamera = true;
      depthRenderer.getDepthMap().renderList = [...populated.meshes];
    }

    await withAbortAndDeadline(scene.whenReadyAsync(true), context.signal);
    throwIfAborted(context.signal);
    scene.render(true, true);
    scene.render(true, true);
    const flipY = plan.backend === "webgl2";
    const activeDepthRenderer = depthRenderer;
    readbacksOwnDepthRenderer = true;
    const readbacks = await runStudioBg3dBabylonSerializedReadbacks<
      Uint8Array,
      Float32Array
    >({
      ...(plan.includeBeauty
        ? {
          beauty: async () => rgbaRowsTopDown(
            await engine.readPixels(0, 0, plan.width, plan.height, true, true),
            plan.width,
            plan.height,
            flipY,
            swapRedBlue,
            transparent,
          ),
        }
        : {}),
      ...(activeDepthRenderer
        ? {
          depth: async () => readStudioBg3dBabylonDepthTopDown(
            await (
              activeDepthRenderer.getDepthMap().readPixels(
                0,
                0,
                null,
                true,
                false,
                0,
                0,
                plan.width,
                plan.height,
              ) ?? Promise.reject(captureError("renderer-unavailable"))
            ),
            plan.width,
            plan.height,
          ),
        }
        : {}),
      release: () => {
        readbacksDrained = true;
        disposeDepthRendererIfReady();
      },
      signal: context.signal,
    });
    const rgba = readbacks.beauty;
    const depth = readbacks.depth ?? (
      requiresDepth
        ? new Float32Array(plan.width * plan.height).fill(1)
        : undefined
    );
    const normal = plan.includeNormal && depth
      ? await captureStudioBg3dBabylonNormalsWithDeadline(
        context,
        plan,
        scene,
        populated.meshes,
        depth,
      )
      : undefined;
    const objectId = plan.includeObjectId
      ? await captureStudioBg3dBabylonStableIdsWithDeadline(
        context,
        plan,
        scene,
        populated.objectIdRenderables,
      )
      : undefined;
    const materialId = plan.includeMaterialId
      ? await captureStudioBg3dBabylonStableIdsWithDeadline(
        context,
        plan,
        scene,
        populated.materialIdRenderables,
      )
      : undefined;
    return {
      ...(rgba ? { rgba } : {}),
      ...(depth ? { depth } : {}),
      ...(materialId ? { materialId } : {}),
      ...(normal ? { normal } : {}),
      ...(objectId ? { objectId } : {}),
    };
  } catch (error) {
    if (
      error instanceof StudioBg3dBabylonCaptureError ||
      error instanceof StudioBg3dBabylonSpecialistError
    ) {
      throw error;
    }
    throw captureError("capture-failed", error);
  } finally {
    if (!readbacksOwnDepthRenderer) {
      depthRenderer?.dispose();
    } else {
      depthRendererDisposeRequested = true;
      disposeDepthRendererIfReady();
    }
  }
}

export function createStudioBg3dBabylonCaptureExecutor(
  render: StudioBg3dBabylonCaptureRenderer = renderStudioBg3dBabylonCapture,
): StudioBg3dBabylonSpecialistExecutor {
  return async (context): Promise<StudioBg3dSpecialistResult> => {
    throwIfAborted(context.signal);
    if (context.job.request.kind === "runtime-metrics") {
      return metricsResult(context);
    }
    const requested = resolveCaptureRequest(context.job);
    if (!requested) {
      throw new StudioBg3dBabylonSpecialistError("unsupported-request");
    }
    const plan = createCapturePlan(context, requested);
    const frame = validateFrame(await render(context, plan), requested);
    throwIfAborted(context.signal);
    if (requested.format === "artifact-v2") {
      return toArtifactResult(context.job, requested, frame);
    }
    if (!frame.rgba) throw captureError("capture-failed");
    return {
      kind: "capture",
      width: requested.width,
      height: requested.height,
      rgba: frame.rgba,
      ...(requested.includeDepth && frame.depth
        ? { depthFloat32: frame.depth }
        : {}),
    };
  };
}

export const executeStudioBg3dBabylonCapture =
  createStudioBg3dBabylonCaptureExecutor();
