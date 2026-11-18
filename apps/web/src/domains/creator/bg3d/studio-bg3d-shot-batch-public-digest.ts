import { computeStudioBg3dShotBatchRenderDigest } from "./studio-bg3d-shot-batch-plan";

import type { StudioBg3dShotBatchPublicRenderPlan } from "./studio-bg3d-shot-batch";

/** 공개 명세에서 렌더 조건을 재구성해 복구 계획과 ZIP이 같은 결과를 가리키는지 검사한다. */
export async function verifyStudioBg3dShotBatchPublicRenderDigest(
  plan: StudioBg3dShotBatchPublicRenderPlan,
): Promise<boolean> {
  const digest = await computeStudioBg3dShotBatchRenderDigest({
    sourceDigest: plan.sourceDigest,
    captureOwner: {
      backend: plan.implementation.backend,
      engineId: plan.implementation.engineId,
      engineRevision: plan.implementation.engineRevision,
      implementationRevision: plan.implementation.adapterImplementationRevision,
      graphicsApi: plan.implementation.graphicsApi,
      profileId: plan.captureProfile.profileId,
      sourceWidth: plan.captureProfile.sourceWidth,
      sourceHeight: plan.captureProfile.sourceHeight,
      maxPixels: plan.captureProfile.maxPixels,
      maxEdge: plan.captureProfile.maxEdge,
      deviceProfile: plan.captureProfile.deviceProfile,
      textureScale: plan.captureProfile.textureScale,
      lodBias: plan.captureProfile.lodBias,
      ltPipelineId: plan.captureProfile.ltPipelineId,
      pngEncodingId: plan.captureProfile.pngEncodingId,
      psdEncodingId: plan.artifactProfiles.psdProfileId,
      ...(plan.captureProfile.exportAspectRatio === undefined ? {} : { exportAspectRatio: plan.captureProfile.exportAspectRatio }),
    },
    shots: plan.shots.map((shot) => ({
      shotId: shot.shotId,
      shotName: shot.shotName,
      shotIndex: shot.shotIndex,
      capture: {
        width: shot.capture.width,
        height: shot.capture.height,
        requestedHeight: shot.capture.requestedHeight,
        wasReduced: shot.capture.wasReduced,
        includeDepth: shot.capture.includeDepth,
        shadows: shot.capture.shadows,
        shadowMapSize: shot.capture.shadowMapSize,
        background: {
          color: shot.capture.background.color,
          alpha: shot.capture.background.alpha,
        },
      },
      files: shot.files.map((file) => ({
        key: `${file.shotId}:${file.pass}`,
        shotId: file.shotId,
        shotName: file.shotName,
        shotIndex: file.shotIndex,
        pass: file.pass,
        path: file.path,
      })),
    })),
    passes: [...plan.passes],
    exportHeight: plan.exportHeight,
    includeLayeredPsd: plan.artifactRequests.layeredPsd,
    includeContactSheet: plan.artifactRequests.contactSheet,
  });
  return digest !== null && digest === plan.renderDigest;
}
