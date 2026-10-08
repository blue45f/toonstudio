import { describe, expect, it } from "vitest";
import {
  StudioVirtualAdaptiveQualityController,
  studioVirtualAutomaticQualityTier,
  studioVirtualQualityProfile,
} from "./studio-virtual-space-quality";

describe("Virtual Studio adaptive quality", () => {
  it("selects accessible and mobile-safe defaults without hiding explicit choices", () => {
    expect(studioVirtualAutomaticQualityTier({ viewportWidth: 390, reducedMotion: true })).toBe("accessibility");
    expect(studioVirtualAutomaticQualityTier({ viewportWidth: 390, reducedMotion: false, deviceMemory: 4, hardwareConcurrency: 6 })).toBe("balanced");
    expect(studioVirtualQualityProfile("ultra", { viewportWidth: 390, reducedMotion: false }).tier).toBe("ultra");
  });

  it("keeps the accessibility tier pinned when adaptive sampling is disabled for reduced motion", () => {
    const controller = new StudioVirtualAdaptiveQualityController("accessibility");
    let sample = controller.sample(8, false);
    for (let index = 0; index < 2_000; index += 1) sample = controller.sample(8, false);
    expect(sample.tier).toBe("accessibility");
    expect(sample.changed).toBe(false);
  });

  it("degrades only after sustained slow frames and recovers slowly", () => {
    const controller = new StudioVirtualAdaptiveQualityController("high");
    let sample = controller.sample(60, true);
    for (let index = 0; index < 70; index += 1) sample = controller.sample(60, true);
    expect(sample.tier).toBe("balanced");
    expect(sample.changed || sample.tier === "balanced").toBe(true);
    for (let index = 0; index < 700; index += 1) sample = controller.sample(10, true);
    expect(["balanced", "high", "ultra"]).toContain(sample.tier);
  });
});

describe("Virtual Studio render resolution caps", () => {
  const strong = { viewportWidth: 1440, reducedMotion: false, deviceMemory: 8, hardwareConcurrency: 8 } as const;

  it("고해상도 데스크톱(high)은 2배 화면을 원본 해상도로 그린다", () => {
    expect(studioVirtualAutomaticQualityTier(strong)).toBe("high");
    expect(studioVirtualQualityProfile("auto", strong).dprCap).toBe(2);
  });

  it("해상도 상한은 기기 등급이 낮을수록 낮아진다", () => {
    const caps = (["ultra", "high", "balanced", "battery", "accessibility"] as const).map((tier) => studioVirtualQualityProfile(tier, strong).dprCap);
    expect(caps).toEqual([2, 2, 1.5, 1.15, 1]);
  });

  it("모션 줄이기는 움직임 효과만 줄이고 해상도는 기기 성능에 맞춰 선명하게 유지한다", () => {
    const profile = studioVirtualQualityProfile("auto", { ...strong, reducedMotion: true });
    expect(profile.tier).toBe("accessibility");
    expect(profile.dprCap).toBe(2);
    expect(profile).toMatchObject({ particleRatio: 0, dynamicLights: false, weather: false, ambientActors: false, maxAnimatedDecorations: 0 });
    // 사용자가 고른 프리셋보다 접근성이 우선하는 것은 그대로다.
    expect(studioVirtualQualityProfile("ultra", { ...strong, reducedMotion: true }).tier).toBe("accessibility");
  });

  it("모션 줄이기라도 약한 기기와 휴대폰은 해상도 상한을 낮게 둔다", () => {
    expect(studioVirtualQualityProfile("auto", { viewportWidth: 1440, reducedMotion: true, deviceMemory: 2, hardwareConcurrency: 4 }).dprCap).toBe(1.15);
    expect(studioVirtualQualityProfile("auto", { viewportWidth: 390, reducedMotion: true, deviceMemory: 4, hardwareConcurrency: 6 }).dprCap).toBe(1.5);
  });

  it("같은 입력은 같은 프로필 객체를 돌려준다(캔버스가 불필요하게 갱신하지 않는다)", () => {
    const first = studioVirtualQualityProfile("auto", { ...strong, reducedMotion: true });
    expect(studioVirtualQualityProfile("high", { ...strong, reducedMotion: true })).toBe(first);
  });
});
