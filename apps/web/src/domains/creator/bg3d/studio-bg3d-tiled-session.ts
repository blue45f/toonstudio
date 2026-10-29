import {
  assertStudioBg3dRasterWindow,
  STUDIO_BG3D_TILE_PROFILE,
} from "./studio-bg3d-tile-plan";
import {
  applyStudioBg3dTileProjection,
  snapshotStudioBg3dCaptureCamera,
} from "./studio-bg3d-tile-camera";
import type * as THREE from "three";
import type {
  StudioBg3dCaptureRequest,
  StudioBg3dCapturedRaster,
} from "./studio-bg3d-capture-adapter";
import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";
import type { StudioMToonRasterScope } from "../mesh-materials/studio-mtoon-raster-scope";

export interface StudioBg3dTiledCaptureSession {
  readonly profile: typeof STUDIO_BG3D_TILE_PROFILE;
  capture(
    request: StudioBg3dCaptureRequest,
    window: StudioBg3dRasterWindow,
  ): Promise<StudioBg3dCapturedRaster>;
  dispose(): void;
}
export function createStudioBg3dTiledCameraSession(
  camera: THREE.Camera,
  execute: (
    request: StudioBg3dCaptureRequest,
    camera: THREE.Camera,
  ) => Promise<StudioBg3dCapturedRaster>,
  coordinateSystem?: THREE.Camera["coordinateSystem"],
  materialScope?: StudioMToonRasterScope,
): StudioBg3dTiledCaptureSession {
  let frozen: THREE.Camera, tileCamera: THREE.Camera;
  try {
    frozen = snapshotStudioBg3dCaptureCamera(camera, coordinateSystem);
    tileCamera = snapshotStudioBg3dCaptureCamera(frozen);
  } catch (error) { materialScope?.dispose(); throw error; }
  let closed = false;
  let busy = false;
  return Object.freeze({
    profile: STUDIO_BG3D_TILE_PROFILE,
    async capture(
      request: StudioBg3dCaptureRequest,
      window: StudioBg3dRasterWindow,
    ) {
      if (closed || busy)
        throw new Error(
          "Tiled capture session is closed or already capturing.",
        );
      busy = true;
      try {
        assertStudioBg3dRasterWindow(window);
        if (request.width !== window.width || request.height !== window.height)
          throw new RangeError("Tile raster does not match the declared window.");
        applyStudioBg3dTileProjection(tileCamera, frozen.projectionMatrix, window);
        // execute는 첫 await 전에 모든 draw/copy를 제출한다. 폭·culling은 기다리기 전에 복원한다.
        const pending = materialScope ? materialScope.submit(window, () => execute(request, tileCamera)) : execute(request, tileCamera);
        const result = await pending;
        if (closed)
          throw new Error(
            "Tiled capture session closed before readback completed.",
          );
        return result;
      } catch (error) {
        closed = true;
        throw error;
      } finally {
        busy = false;
        if (closed) materialScope?.dispose();
      }
    },
    dispose() {
      closed = true;
      if (!busy) materialScope?.dispose();
    },
  });
}
