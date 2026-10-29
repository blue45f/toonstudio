import { createStudioBg3dCaptureEnvironmentIntent } from "./studio-bg3d-capture-environment-intent";
import { resolveStudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";

import type { StudioBg3dDeviceProfile } from "./studio-bg3d-device-quality";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

/** 동결한 일반 캡처 문서의 의도다. 실제 Scene 상태에서 기대값을 역추론하지 않는다. */
export function createStudioBg3dCaptureDocumentEnvironmentFingerprint(
  document: Pick<StudioBg3dSceneDocument, "lighting" | "background">,
  profile: StudioBg3dDeviceProfile,
): string {
  return createStudioBg3dCaptureEnvironmentIntent({
    settings: resolveStudioBg3dEnvironmentSettings(document.lighting),
    fileTier: profile === "mobile" ? "1k" : "2k",
    skyPresetId: document.background.skyPresetId,
    panoramaRotationDegrees: document.background.panoramaRotation,
    immersiveAr: false,
  }).fingerprint;
}
