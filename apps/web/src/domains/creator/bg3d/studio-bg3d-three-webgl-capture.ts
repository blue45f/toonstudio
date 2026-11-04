import { assertStudioBg3dTiledSceneAdmission } from "./studio-bg3d-tiled-scene-admission";
import { createStudioBg3dTiledCameraSession } from "./studio-bg3d-tiled-session";
import { beginStudioMToonRasterScope } from "../mesh-materials/studio-mtoon-raster-scope";
/** Three/WebGL implementation of the renderer-neutral Studio 3D capture contract. */

import * as THREE from "three";

import {
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
  STUDIO_BG3D_CAPTURE_SIX_PASS_PROFILE_V1,
  assertStudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import { captureStudioBg3dThreeNormals } from "./studio-bg3d-three-normal-capture";
import { hideStudioBg3dCaptureExcludedObjects, hideStudioBg3dDepthExcludedObjects } from "./studio-bg3d-capture-exclusion";
import { captureStudioBg3dThreeDepth } from "./studio-bg3d-lt-three-depth";
import { normalizeStudioBg3dRgbaReadback } from "./studio-bg3d-readback-normalize";
import { createStudioBg3dThreeSixPassSceneGuard } from "./studio-bg3d-three-six-pass-scene-current";
import { snapshotStudioBg3dCaptureCamera } from "./studio-bg3d-tile-camera";
import { createStudioBg3dStraightAlphaOutputPass } from "./studio-bg3d-straight-alpha-output-pass";
import { assertStudioBg3dThreeSixPassScene, captureStudioBg3dThreeSixPassPlanes,
  linearizeStudioBg3dSixPassDepth } from "./studio-bg3d-three-six-pass-capture";

import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCapturedRaster,
  StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";

export {
  registerStudioBg3dCaptureExcludedObject,
  registerStudioBg3dDepthExcludedObject,
} from "./studio-bg3d-capture-exclusion";
export {
  acquireStudioBg3dCaptureAdapterAfterViewTransition,
  captureStudioBg3dRaster,
  getStudioBg3dCaptureSourceSize,
} from "./studio-bg3d-capture-adapter";

export interface CreateStudioBg3dThreeWebglCaptureAdapterInput {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

/**
 * Captures the same display-color result as the canvas without requiring
 * `preserveDrawingBuffer`. The first target holds Three's linear scene pass; OutputPass then
 * applies the renderer's active tone mapping and output color-space conversion into an RGBA8
 * target suitable for readback. Keeping these passes separate is important: WebGLRenderer skips
 * material tone mapping when a normal render target is active.
 *
 * Submission happens before the first await. The live R3F state is consequently restored while
 * the GPU fence is pending, just like the depth adapter, and the temporary targets stay alive
 * until the asynchronous readback settles.
 */
async function captureStudioBg3dThreeWebglColor(input: {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly request: StudioBg3dCaptureRequest;
}): Promise<Uint8ClampedArray> {
  const { renderer, scene, camera, request } = input;
  const previousTarget = renderer.getRenderTarget();
  const previousActiveCubeFace = renderer.getActiveCubeFace();
  const previousActiveMipmapLevel = renderer.getActiveMipmapLevel();
  const previousClearColor = renderer.getClearColor(new THREE.Color());
  const previousClearAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;
  const previousXrEnabled = renderer.xr.enabled;
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const capturedSceneBackground = scene.background;
  const capturedSceneBackgroundRotation = scene.backgroundRotation.clone();
  const suppressSceneBackground = request.background.alpha === 0;
  const sceneTarget = new THREE.WebGLRenderTarget(request.width, request.height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: renderer.extensions?.has("EXT_color_buffer_float")
      ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  // This is an intermediate working-color buffer. The straight-alpha output pass unpremultiplies
  // linear RGB before owning the one explicit tone-map/sRGB transfer.
  sceneTarget.texture.colorSpace = THREE.NoColorSpace;
  const outputTarget = new THREE.WebGLRenderTarget(request.width, request.height, {
    depthBuffer: false,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  outputTarget.texture.colorSpace = THREE.NoColorSpace;
  const outputPass = createStudioBg3dStraightAlphaOutputPass();
  const packed = new Uint8Array(request.width * request.height * 4);

  try {
    let readback: Promise<THREE.TypedArray> | undefined;
    let failed = false;
    let failure: unknown;
    try {
      try {
        renderer.xr.enabled = false;
        renderer.autoClear = true;
        renderer.setClearColor(request.background.color, request.background.alpha);
        renderer.setRenderTarget(sceneTarget);
        renderer.clear(true, true, true);
        // Pin the background reference and yaw sampled at transaction entry. R3F effects or input
        // drafts that commit around this call cannot make the raster disagree with its document.
        scene.background = suppressSceneBackground ? null : capturedSceneBackground;
        scene.backgroundRotation.copy(capturedSceneBackgroundRotation);
        renderer.render(scene, camera);

        // Rendering to a normal WebGLRenderTarget deliberately bypasses Three's final canvas output
        // transform. The output pass first restores straight linear RGB, then recreates tone mapping
        // and output color space before RGBA8 readback so transparency and viewport color both agree.
        outputPass.render(renderer, outputTarget, sceneTarget, 0, false);
        readback = renderer.readRenderTargetPixelsAsync(
          outputTarget,
          0,
          0,
          request.width,
          request.height,
          packed,
        );
      } finally {
        // `readRenderTargetPixelsAsync` has already submitted its copy/fence work. Never leave a
        // live R3F frame pointed at a temporary capture target while the Promise waits for the GPU.
        renderer.setRenderTarget(previousTarget, previousActiveCubeFace, previousActiveMipmapLevel);
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        renderer.autoClear = previousAutoClear;
        renderer.xr.enabled = previousXrEnabled;
        renderer.setViewport(previousViewport);
        renderer.setScissor(previousScissor);
        renderer.setScissorTest(previousScissorTest);
        scene.background = capturedSceneBackground;
        scene.backgroundRotation.copy(capturedSceneBackgroundRotation);
      }
    } catch (error) {
      failed = true;
      failure = error;
    }
    const settled = await Promise.allSettled(readback ? [readback] : []);
    if (failed) throw failure;
    if (settled[0]?.status === "rejected") throw settled[0].reason;
    return normalizeStudioBg3dRgbaReadback({
      width: request.width,
      height: request.height,
      rgba: packed,
      // WebGL framebuffer readback starts at its bottom row; the capture contract is top-down.
      flipY: true,
    });
  } finally {
    // OutputPass owns a module-shared fullscreen geometry, so dispose only its per-capture
    // material. Its public dispose() would also dispose that shared geometry.
    outputPass.material.dispose();
    sceneTarget.dispose();
    outputTarget.dispose();
  }
}

export function createStudioBg3dThreeWebglCaptureAdapter(
  input: CreateStudioBg3dThreeWebglCaptureAdapterInput
): StudioBg3dCaptureAdapter {
  const { renderer, scene, camera } = input;
  const isWebglRenderer =
    (renderer as THREE.WebGLRenderer & { readonly isWebGLRenderer?: boolean } | null)
      ?.isWebGLRenderer === true;
  if (!isWebglRenderer || !scene?.isScene || !camera?.isCamera) {
    throw new TypeError("Three WebGL capture requires a renderer, scene, and camera.");
  }

  async function capture(request: StudioBg3dCaptureRequest, captureCamera = camera): Promise<StudioBg3dCapturedRaster> {
    assertStudioBg3dCaptureRequest(request);
    if (request.includeSixPass) {
      if (renderer.capabilities?.reversedDepthBuffer || renderer.capabilities?.logarithmicDepthBuffer) {
        throw new Error("6패스 LT는 역방향·로그 깊이 렌더러를 지원하지 않습니다.");
      }
      const frozenCamera = snapshotStudioBg3dCaptureCamera(captureCamera);
      const withCaptureScene = <Value>(submitSync: () => Value): Value => {
        const restoreExcluded = hideStudioBg3dCaptureExcludedObjects(scene);
        const restoreDepthExcluded = hideStudioBg3dDepthExcludedObjects(scene);
        try { return submitSync(); }
        finally { restoreDepthExcluded(); restoreExcluded(); }
      };
      const assertCurrent = withCaptureScene(() => {
        assertStudioBg3dThreeSixPassScene(scene);
        return createStudioBg3dThreeSixPassSceneGuard(scene, renderer);
      });
      const submit = async <Value>(submitSync: () => Promise<Value>): Promise<Value> => {
        // 각 패스가 동기 draw/copy를 제출한 뒤 즉시 helper·재질·렌더 상태를 복원한다.
        let pending: Promise<Value> | undefined;
        let failure: { readonly error: unknown } | undefined;
        try { withCaptureScene(() => { assertCurrent(); pending = submitSync(); }); }
        catch (error) { failure = { error }; }
        // 상태 복원 자체가 실패해도 이미 제출한 fence를 먼저 배수한다.
        const results = await Promise.allSettled(pending ? [pending] : []);
        if (failure) throw failure.error;
        const result = results[0];
        if (result?.status === "rejected") throw result.reason;
        if (result?.status !== "fulfilled") throw new Error("6패스 LT GPU 제출이 완료되지 않았습니다.");
        withCaptureScene(assertCurrent);
        return result.value;
      };
      // 한 패스의 fence와 임시 target 정리가 끝나야 다음 패스를 할당한다.
      const rgba = await submit(() => captureStudioBg3dThreeWebglColor({ renderer, scene, camera: frozenCamera, request }));
      const depth = await submit(() => captureStudioBg3dThreeDepth({ renderer, scene, camera: frozenCamera,
        width: request.width, height: request.height }));
      const normalRgba = request.includeNormals ? await submit(() => captureStudioBg3dThreeNormals({ renderer, scene,
        camera: frozenCamera, width: request.width, height: request.height })) : undefined;
      const sixPass = await withCaptureScene(() => captureStudioBg3dThreeSixPassPlanes({ renderer, scene,
        camera: frozenCamera, request, submit,
        captureColor: (passRequest) => captureStudioBg3dThreeWebglColor({ renderer, scene,
          camera: frozenCamera, request: passRequest }) }));
      return { width: request.width, height: request.height, rgba, depth,
        ...(normalRgba ? { normalRgba } : {}), ...sixPass, ...linearizeStudioBg3dSixPassDepth(depth, frozenCamera) };
    }
    const restoreCaptureExcludedObjects = hideStudioBg3dCaptureExcludedObjects(scene);
    let colorReadback: Promise<Uint8ClampedArray>;
    let depthReadback: Promise<Float32Array> | undefined;
    let normalReadback: Promise<Uint8ClampedArray> | undefined;
    try {
      colorReadback = captureStudioBg3dThreeWebglColor({ camera: captureCamera, renderer, request, scene });
      if (request.includeDepth) {
        depthReadback = captureStudioBg3dThreeDepth({
          renderer,
          scene,
          camera: captureCamera,
          width: request.width,
          height: request.height,
        });
      }
      if (request.includeNormals) {
        normalReadback = captureStudioBg3dThreeNormals({ renderer, scene, camera: captureCamera,
          width: request.width, height: request.height });
      }
    } finally {
      // All GPU passes submit their readback work before their first await and restore renderer
      // state themselves. Keep viewport-only objects hidden through both submissions, then restore
      // their exact original visibility while the GPU fence(s) are pending.
      restoreCaptureExcludedObjects();
    }
    // Drain every submitted copy before propagating failure; never abandon a GPU fence.
    const results = await Promise.allSettled([colorReadback!, depthReadback, normalReadback]);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    const rgba = results[0].status === "fulfilled" ? results[0].value : undefined;
    const depth = results[1].status === "fulfilled" ? results[1].value : undefined;
    const normalRgba = results[2].status === "fulfilled" ? results[2].value : undefined;
    if (!rgba) throw new Error("Missing WebGL color capture.");
    return {
      width: request.width,
      height: request.height,
      rgba,
      ...(depth ? { depth } : {}),
      ...(normalRgba ? { normalRgba } : {}),
    };
  }

  return Object.freeze({
    backend: "three-webgl" as const,
    engineId: "three" as const,
    engineVersion: String(THREE.REVISION).toLowerCase(),
    implementationRevision: renderer.extensions?.has("EXT_color_buffer_float")
      ? "studio-three-webgl-capture-adapter-v7-hdr-six-pass-sequential"
      : "studio-three-webgl-capture-adapter-v7-ldr-six-pass-sequential",
    normalProfile: STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
    ...(!renderer.capabilities?.reversedDepthBuffer && !renderer.capabilities?.logarithmicDepthBuffer
      ? { sixPassProfile: STUDIO_BG3D_CAPTURE_SIX_PASS_PROFILE_V1 } as const : {}),
    graphicsApi: "webgl2" as const,
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({
      width: renderer.domElement.width,
      height: renderer.domElement.height,
    }),
    async capture(request: StudioBg3dCaptureRequest) {
      const scope = beginStudioMToonRasterScope(scene, "webgl", { registrationPolicy: "registered-only", prepareScene: () => hideStudioBg3dCaptureExcludedObjects(scene) });
      try { return await scope.submit({ fullHeight: request.height, height: request.height }, () => capture(request)); }
      finally { scope.dispose(); }
    },
    createTiledCapture: () => {
      if (renderer.capabilities?.reversedDepthBuffer) throw new Error("Reversed-depth tiled capture is not supported.");
      assertStudioBg3dTiledSceneAdmission(scene, "webgl");
      return createStudioBg3dTiledCameraSession(camera, capture, THREE.WebGLCoordinateSystem,
        beginStudioMToonRasterScope(scene, "webgl", { assertSceneCurrent: () => assertStudioBg3dTiledSceneAdmission(scene, "webgl"), prepareScene: () => hideStudioBg3dCaptureExcludedObjects(scene) }));
    },
  });
}
