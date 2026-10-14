import { describe, expect, it } from "vitest";

import {
  snapStudioHdDisplayScale,
  studioHdBackdropImageSet,
  studioHdSpriteCssFilter,
  studioHdSpriteProfile,
  resolveStudioHdSpriteTier,
} from "./studio-virtual-space-hd-sprite-pipeline";

describe("studio-virtual-space-hd-sprite-pipeline", () => {
  it("픽셀 아트는 항상 SD+NEAREST를 강제한다", () => {
    expect(
      studioHdSpriteProfile({ dpr: 3, viewportWidth: 1920, pixelated: true, reducedMotion: false, effectLevel: "high" }),
    ).toMatchObject({ tier: "sd", sampling: "nearest", useMipmap: false, minScale: 1 });
    expect(resolveStudioHdSpriteTier({ dpr: 3, viewportWidth: 1920, pixelated: true, reducedMotion: false, effectLevel: "high" })).toBe("sd");
  });

  it("고해상도 데스크톱은 ultra, 일반은 hd, 저사양은 sd를 고른다", () => {
    expect(
      resolveStudioHdSpriteTier({ dpr: 2, viewportWidth: 1440, pixelated: false, reducedMotion: false, effectLevel: "high", deviceMemoryGb: 16 }),
    ).toBe("ultra");
    expect(
      resolveStudioHdSpriteTier({ dpr: 1.5, viewportWidth: 900, pixelated: false, reducedMotion: false, effectLevel: "medium" }),
    ).toBe("hd");
    expect(
      resolveStudioHdSpriteTier({ dpr: 1, viewportWidth: 360, pixelated: false, reducedMotion: false, effectLevel: "medium" }),
    ).toBe("sd");
  });

  it("low 이펙트는 그림자·광원 값을 낮춘다", () => {
    const profile = studioHdSpriteProfile({ dpr: 2, viewportWidth: 1440, pixelated: false, reducedMotion: false, effectLevel: "low" });
    expect(profile.shadowBlurPx).toBeLessThanOrEqual(6);
    expect(profile.lightModulation).toBeLessThanOrEqual(0.45);
  });

  it("스케일 스냅은 픽셀 정수배, HD는 0.25 스냅이다", () => {
    expect(snapStudioHdDisplayScale(1.6, true)).toBe(2);
    expect(snapStudioHdDisplayScale(0.62, false)).toBeCloseTo(0.5);
    expect(snapStudioHdDisplayScale(Number.NaN, false)).toBe(1);
    expect(snapStudioHdDisplayScale(9, false)).toBe(4);
    expect(snapStudioHdDisplayScale(9, true)).toBe(4);
  });

  it("모션 감소 시 ultra로 올리지 않고 hd에 머문다", () => {
    expect(
      resolveStudioHdSpriteTier({ dpr: 3, viewportWidth: 1600, pixelated: false, reducedMotion: true, effectLevel: "high", deviceMemoryGb: 16 }),
    ).toBe("hd");
  });

  it("비정상 입력은 안전한 기본값으로 떨어진다", () => {
    expect(
      resolveStudioHdSpriteTier({ dpr: Number.NaN, viewportWidth: Number.NaN, pixelated: false, reducedMotion: false, effectLevel: "medium" }),
    ).toBe("sd");
    expect(studioHdBackdropImageSet("")).toBe("none");
    expect(studioHdBackdropImageSet('/x".webp', "/y.webp")).toBe("none");
    expect(studioHdBackdropImageSet("/a.webp", '/evil".webp')).toBe('url("/a.webp")');
  });

  it("CSS 필터와 배경 image-set을 만든다", () => {
    const ultra = studioHdSpriteProfile({ dpr: 3, viewportWidth: 1600, pixelated: false, reducedMotion: false, effectLevel: "high", deviceMemoryGb: 16 });
    expect(studioHdSpriteCssFilter(ultra, false)).toContain("contrast");
    expect(studioHdBackdropImageSet("/a.webp")).toBe('url("/a.webp")');
    expect(studioHdBackdropImageSet("/a.webp", "/a-2x.webp")).toContain("2x");
  });
});
