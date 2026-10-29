import type { StudioBg3dSceneGlbExportHost } from "./studio-bg3d-scene-glb-source";
import { resolveStudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

/** 무거운 exporter·저장 권위를 열지 않고 현재 호스트의 준비 상태만 읽는다. */
export function isStudioBg3dSceneGlbExportAvailable(host: StudioBg3dSceneGlbExportHost): boolean {
  try { resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }); }
  catch { return false; }
  return host.open === true && host.modelRenderer != null && host.isMaterialBackendCurrent?.() !== false && Boolean(host.physicsRuntimeSourceRef && host.modalAssetSessionRef?.current
    && host.modelRootCacheRef && host.attachmentByStorageModelIdRef && host.storageModelIdByAttachmentIdRef && host.viewportApiRef?.current && host.deviceQuality)
    && !host.isRestoringScene && !host.isCapturing && !host.isBatchRenderingShots && !host.physicsInteractionLocked
    && !host.isUploadingModel && !host.hasPendingClone && !host.hasCloneFailure && !host.captureInFlightRef?.current
    && host.cameraLensInteractionLocked?.() !== true;
}
