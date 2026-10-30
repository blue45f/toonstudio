import { describe, expect, it } from "vitest";
import { createStudioBg3dCaptureEnvironmentIntent } from "./studio-bg3d-capture-environment-intent";
import type { StudioBg3dCaptureEnvironmentIntentInput } from "./studio-bg3d-capture-environment-intent";

const input: StudioBg3dCaptureEnvironmentIntentInput = { settings: { source: "hdri", assetId: "combination-room",
  intensity: 2.25, rotationDegrees: 137, useAsBackground: false }, fileTier: "2k", skyPresetId: "clear_day",
  panoramaRotationDegrees: 75, immersiveAr: false };
describe("캡처 환경의 불변 요청", () => {
  it("입력 객체와 키 순서가 달라도 같은 정본 요청은 같은 fingerprint다", () => {
    const mutable = { ...input, settings: { ...input.settings } };
    const frozen = createStudioBg3dCaptureEnvironmentIntent(mutable);
    expect(frozen.fingerprint).toBe(createStudioBg3dCaptureEnvironmentIntent({ ...input, settings: {
      useAsBackground: false, rotationDegrees: 137, intensity: 2.25, assetId: "combination-room", source: "hdri" } }).fingerprint);
    mutable.settings.intensity = 3;
    expect(frozen.settings.intensity).toBe(2.25); expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.settings)).toBe(true); expect(frozen.environment).toBe("hdri"); expect(frozen.background).toBe("panorama");
  });
  it.each(["asset", "tier", "intensity", "rotation", "background", "preset", "panorama", "ar"] as const)("%s 요청 변경은 다른 fingerprint다", (change) => {
    const changed = { ...input, settings: { ...input.settings } };
    if (change === "asset") changed.settings.assetId = "konigsallee";
    if (change === "tier") changed.fileTier = "1k";
    if (change === "intensity") changed.settings.intensity = 0;
    if (change === "rotation") changed.settings.rotationDegrees = 138;
    if (change === "background") changed.settings.useAsBackground = true;
    if (change === "preset") changed.skyPresetId = "night";
    if (change === "panorama") changed.panoramaRotationDegrees = 76;
    if (change === "ar") changed.immersiveAr = true;
    expect(createStudioBg3dCaptureEnvironmentIntent(changed).fingerprint).not.toBe(createStudioBg3dCaptureEnvironmentIntent(input).fingerprint);
  });
  it("회전의 기존 정규화만 사용하고 0 intensity를 임의 none으로 바꾸지 않는다", () => {
    const zero = createStudioBg3dCaptureEnvironmentIntent({ ...input, settings: { ...input.settings, intensity: 0 } });
    expect(zero.environment).toBe("hdri");
    expect(createStudioBg3dCaptureEnvironmentIntent({ ...input, settings: { ...input.settings, rotationDegrees: 497 }, panoramaRotationDegrees: 435 }).fingerprint)
      .toBe(createStudioBg3dCaptureEnvironmentIntent(input).fingerprint);
    const ar = createStudioBg3dCaptureEnvironmentIntent({ ...input, immersiveAr: true });
    expect(ar.environment).toBe("none"); expect(ar.background).toBe("none");
  });
  it("정본 카탈로그의 티어별 로컬 URL을 fingerprint에 보존하고 AR에서는 요청하지 않는다", () => {
    const desktop = createStudioBg3dCaptureEnvironmentIntent(input);
    const mobile = createStudioBg3dCaptureEnvironmentIntent({ ...input, fileTier: "1k" });
    expect(desktop.hdriUrl).toBe("/assets/3d/hdri/combination_room_2k.hdr");
    expect(mobile.hdriUrl).toBe("/assets/3d/hdri/combination_room_1k.hdr");
    expect(desktop.fingerprint).toContain(desktop.hdriUrl);
    expect(mobile.fingerprint).toContain(mobile.hdriUrl);
    expect(createStudioBg3dCaptureEnvironmentIntent({ ...input, immersiveAr: true }).hdriUrl).toBeNull();
  });
  it.each([NaN, Infinity, -1, 4.001])("잘못된 intensity %s를 낮추거나 fallback하지 않는다", (intensity) => {
    expect(() => createStudioBg3dCaptureEnvironmentIntent({ ...input, settings: { ...input.settings, intensity } })).toThrow(TypeError);
  });
});
