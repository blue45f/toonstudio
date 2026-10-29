/** Engine adapter for a resource-safe Three.js depth pass used by the pure LT raster stage. */

import * as THREE from "three";

import { beginStudioMToonGeometryScope, type StudioMToonGeometryScope } from "../mesh-materials/studio-mtoon-geometry-scope";
import { createStudioMToonWebGlGeometryPass } from "../mesh-materials/studio-mtoon-webgl-geometry-pass";
import { hideStudioBg3dDepthExcludedObjects } from "./studio-bg3d-capture-exclusion";
import {
  decodeStudioBg3dThreeRgbaDepth,
  STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
} from "./studio-bg3d-lt-render";

export interface CaptureStudioBg3dThreeDepthInput {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly width: number;
  readonly height: number;
}

function assertCaptureDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("3D LT depth dimensions must be positive safe integers.");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
    throw new RangeError("3D LT depth capture exceeds the raster pixel budget.");
  }
}

/**
 * Renders visible geometry with Three's canonical RGBADepthPacking and returns top-down normalized
 * depth. Renderer target, clear state, XR state, scene override material, and allocations are
 * restored/disposed even when rendering or readback fails.
 */
export async function captureStudioBg3dThreeDepth(
  input: CaptureStudioBg3dThreeDepthInput
): Promise<Float32Array> {
  const { renderer, scene, camera, width, height } = input;
  assertCaptureDimensions(width, height);
  if (!renderer || !scene?.isScene || !camera?.isCamera) {
    throw new TypeError("3D LT depth capture requires a Three renderer, scene, and camera.");
  }

  const previousTarget = renderer.getRenderTarget();
  const previousCubeFace = renderer.getActiveCubeFace();
  const previousMipmapLevel = renderer.getActiveMipmapLevel();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const previousOverrideMaterial = scene.overrideMaterial;
  const previousSceneBackground = scene.background;
  const previousSceneBackgroundRotation = scene.backgroundRotation.clone();
  const previousClearColor = renderer.getClearColor(new THREE.Color());
  const previousClearAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;
  const previousXrEnabled = renderer.xr.enabled;
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    blending: THREE.NoBlending,
  });
  depthMaterial.toneMapped = false;
  const packed = new Uint8Array(width * height * 4);
  const restoreDepthExcludedObjects = hideStudioBg3dDepthExcludedObjects(scene);
  let geometryScope: StudioMToonGeometryScope | undefined;

  try {
    let readback: Promise<THREE.TypedArray> | undefined;
    let failed = false;
    let failure: unknown;
    try {
      try {
        renderer.xr.enabled = false;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear(true, true, true);
        // Equirectangular scene backgrounds are color-only environment decoration. Pin a null
        // background immediately before submission so no full-frame fake depth surface is packed.
        scene.background = null;
        geometryScope = beginStudioMToonGeometryScope({ scene, backend: "webgl", fallbackMaterial: depthMaterial,
          createBodyPass: (source) => createStudioMToonWebGlGeometryPass(source, "depth") });
        geometryScope.submit(() => {
          renderer.render(scene, camera);
          // draw/copy가 끝나면 본체·outline slot과 renderer를 첫 await 전에 복원한다.
          readback = renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, packed);
        });
      } finally {
        try {
          scene.overrideMaterial = previousOverrideMaterial;
          scene.background = previousSceneBackground;
          scene.backgroundRotation.copy(previousSceneBackgroundRotation);
          renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
          renderer.setClearColor(previousClearColor, previousClearAlpha);
          renderer.autoClear = previousAutoClear;
          renderer.xr.enabled = previousXrEnabled;
          renderer.setViewport(previousViewport);
          renderer.setScissor(previousScissor);
          renderer.setScissorTest(previousScissorTest);
        } finally {
          // The GPU submission already owns the draw. Restore beauty-only objects immediately so a
          // live R3F frame cannot visibly lose its contact shadows while the readback fence settles.
          restoreDepthExcludedObjects();
        }
      }
    } catch (error) {
      failed = true;
      failure = error;
    }
    // Even a synchronous restore failure must drain any already-submitted GPU copy.
    const settled = await Promise.allSettled(readback ? [readback] : []);
    if (failed) throw failure;
    if (settled[0]?.status === "rejected") throw settled[0].reason;
    return decodeStudioBg3dThreeRgbaDepth({ width, height, rgba: packed, flipY: true });
  } finally {
    try { geometryScope?.dispose(); }
    finally { try { depthMaterial.dispose(); } finally { target.dispose(); } }
  }
}
