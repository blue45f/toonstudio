import { describe, expect, it } from "vitest";

import { createStudioBg3dCaptureDocumentEnvironmentFingerprint } from "./studio-bg3d-capture-document-environment";
import { createStudioBg3dCaptureEnvironmentIntent } from "./studio-bg3d-capture-environment-intent";
import { resolveStudioBg3dEnvironmentSettings, STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS } from "./studio-bg3d-hdri-environment";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

describe("동결 캡처 문서의 환경 기대값", () => {
  it.each(["mobile", "desktop"] as const)("%s의 실제 HDRI tier와 canonical 설정으로 같은 producer 의도를 만든다", (profile) => {
    const document = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      lighting: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting,
        environment: { ...STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS, intensity: 1.75, rotationDegrees: 37 } },
      background: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background, panoramaRotation: 123 },
    };
    const before = JSON.stringify(document);
    const expected = createStudioBg3dCaptureEnvironmentIntent({
      settings: resolveStudioBg3dEnvironmentSettings(document.lighting),
      fileTier: profile === "mobile" ? "1k" : "2k",
      skyPresetId: document.background.skyPresetId,
      panoramaRotationDegrees: document.background.panoramaRotation,
      immersiveAr: false,
    });
    expect(createStudioBg3dCaptureDocumentEnvironmentFingerprint(document, profile)).toBe(expected.fingerprint);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("일반 PNG의 기대값은 AR 환경에서 역추론하지 않고 동결 문서에 고정한다", () => {
    const document = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
    const expected = createStudioBg3dCaptureDocumentEnvironmentFingerprint(document, "desktop");
    const ar = createStudioBg3dCaptureEnvironmentIntent({
      settings: resolveStudioBg3dEnvironmentSettings(document.lighting), fileTier: "2k",
      skyPresetId: document.background.skyPresetId,
      panoramaRotationDegrees: document.background.panoramaRotation, immersiveAr: true,
    });
    expect(expected).not.toBe(ar.fingerprint);
  });
});
