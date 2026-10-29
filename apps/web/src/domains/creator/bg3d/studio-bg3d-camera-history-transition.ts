import type { BgViewportApi } from "./studio-bg3d-camera-application";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

export interface StudioBg3dPendingCameraTarget {
  current: StudioBg3dCameraSettings | null;
}

/** 새 복원·투영 전환 의도가 없을 때만 내려가는 뷰포트의 실제 시점을 다음 마운트에 넘긴다. */
export function rememberStudioBg3dCameraBeforeViewportRemount(
  previousViewport: Pick<BgViewportApi, "readView"> | null,
  pendingTarget: StudioBg3dPendingCameraTarget,
): void {
  if (previousViewport && pendingTarget.current === null) pendingTarget.current = previousViewport.readView();
}

/**
 * A controlled range already owns the canonical value that produced its preview. On pointer/key
 * release R3F may still expose the previous frame, so the latest gesture value must win without
 * even consulting stale renderer state. Live readback remains the fallback for legacy callers.
 */
export function resolveStudioBg3dCameraGestureCommitView(
  latestGestureView: StudioBg3dCameraSettings | null,
  viewport: Pick<BgViewportApi, "readView"> | null,
  fallbackView: StudioBg3dCameraSettings,
): StudioBg3dCameraSettings {
  return latestGestureView ?? viewport?.readView() ?? fallbackView;
}

/**
 * Applies a history camera synchronously when the mounted projection matches. A perspective ↔
 * orthographic state change replaces the R3F camera, so the old controller must fail closed and
 * hand the complete immutable composition to the replacement controller instead.
 */
export function applyOrDeferStudioBg3dHistoryCamera(
  viewport: Pick<BgViewportApi, "applyView"> | null,
  pendingTarget: StudioBg3dPendingCameraTarget,
  camera: StudioBg3dCameraSettings,
): "applied" | "deferred" {
  if (viewport?.applyView(camera) === true) {
    pendingTarget.current = null;
    return "applied";
  }
  pendingTarget.current = camera;
  return "deferred";
}
