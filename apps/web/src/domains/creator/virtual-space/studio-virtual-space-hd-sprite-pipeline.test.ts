import { describe, expect, it } from "vitest";

import { resolveStudioMicroExpressionSpec } from "./studio-virtual-space-actor-aura-runtime";
import {
  resolveStudioHdActivityAura,
  resolveStudioHdActorTint,
  resolveStudioHdGroundContactSpec,
  resolveStudioHdSpriteTier,
  snapStudioHdDisplayScale,
  studioHdBackdropImageSet,
  studioHdSpriteCssFilter,
  studioHdSpriteProfile,
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

  it("시간대·방향·상태·테마 색온도에 따라 자연스러운 환경광 하모니 틴트를 산출한다", () => {
    const dayTint = resolveStudioHdActorTint({ dayPhase: "day", facing: "down" });
    const nightTint = resolveStudioHdActorTint({ dayPhase: "night", facing: "down" });
    const backTint = resolveStudioHdActorTint({ dayPhase: "day", facing: "up" });
    const ghostTint = resolveStudioHdActorTint({ dayPhase: "day", ghost: true });
    const atelierTint = resolveStudioHdActorTint({ dayPhase: "day", spaceTheme: "webtoon-atelier", facing: "down" });
    const celestialTint = resolveStudioHdActorTint({ dayPhase: "day", spaceTheme: "celestial-observatory", facing: "down" });

    expect(dayTint).toBe(0xffffff);
    expect(nightTint).not.toBe(dayTint);
    expect(backTint).toBeLessThan(dayTint);
    expect(ghostTint).toBe(0xc8e6ff);
    expect(atelierTint).not.toBe(celestialTint);
  });

  it("보행 위상에 동기화된 이중 접지 그림자(Core AO + Penumbra) 스펙을 계산한다", () => {
    const contact = resolveStudioHdGroundContactSpec({
      distance: 0,
      stride: 108,
      moving: true,
      seated: false,
      ghost: false,
      reducedMotion: false,
      tier: "ultra",
    });
    const midAir = resolveStudioHdGroundContactSpec({
      distance: 27,
      stride: 108,
      moving: true,
      seated: false,
      ghost: false,
      reducedMotion: false,
      tier: "ultra",
    });
    const seated = resolveStudioHdGroundContactSpec({
      distance: 0,
      stride: 108,
      moving: false,
      seated: true,
      ghost: false,
      reducedMotion: false,
    });

    expect(contact.visible).toBe(true);
    expect(contact.coreAlpha).toBeGreaterThan(midAir.coreAlpha);
    expect(contact.penumbraAlpha).toBeGreaterThan(midAir.penumbraAlpha);
    expect(seated.visible).toBe(false);
  });

  it("집중·검토·회의 상태에만 공감각 바닥 오라를 켜고 일반 상태에서는 숨긴다", () => {
    const idleAura = resolveStudioHdActivityAura({
      activity: "available",
      userStatus: null,
      timeMs: 1000,
      reducedMotion: false,
    });
    const focusAura = resolveStudioHdActivityAura({
      activity: "focused",
      userStatus: "focusing",
      timeMs: 600,
      reducedMotion: false,
    });
    const reviewAura = resolveStudioHdActivityAura({
      activity: "reviewing",
      userStatus: null,
      timeMs: 600,
      reducedMotion: true,
    });

    expect(idleAura.visible).toBe(false);
    expect(focusAura.visible).toBe(true);
    expect(focusAura.kind).toBe("focus");
    expect(focusAura.colorHex).toBe(0x34d399);
    expect(reviewAura.visible).toBe(true);
    expect(reviewAura.kind).toBe("review");
    expect(reviewAura.colorHex).toBe(0xfbbf24);
  });

  it("캐릭터 작은 얼굴에 감정·활동·상태별 마이크로 표정(홍조·눈가 반짝임) 스펙을 산출한다", () => {
    const joy = resolveStudioMicroExpressionSpec({
      reaction: "wave",
      activity: "available",
      userStatus: null,
      moving: false,
      seated: false,
      ghost: false,
      reducedMotion: false,
      timeMs: 500,
    });
    const focus = resolveStudioMicroExpressionSpec({
      reaction: null,
      activity: "focused",
      userStatus: "focused",
      moving: false,
      seated: true,
      ghost: false,
      reducedMotion: false,
      timeMs: 500,
    });
    const away = resolveStudioMicroExpressionSpec({
      reaction: null,
      activity: "away",
      userStatus: "on-break",
      moving: false,
      seated: false,
      ghost: false,
      reducedMotion: false,
      timeMs: 500,
    });
    const ghost = resolveStudioMicroExpressionSpec({
      reaction: "wave",
      activity: "available",
      userStatus: null,
      moving: true,
      seated: false,
      ghost: true,
      reducedMotion: false,
      timeMs: 500,
    });

    expect(joy.visible).toBe(true);
    expect(joy.kind).toBe("joy-sparkle");
    expect(joy.cheekAlpha).toBeGreaterThan(0.35);
    expect(focus.kind).toBe("focus-glint");
    expect(away.kind).toBe("sleep-bubble");
    expect(ghost.visible).toBe(false);
  });
});
