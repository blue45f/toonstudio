import { describe, expect, it } from "vitest";

import {
  blendStudioBg3dWorldShaperSliders,
  buildStudioBg3dWebtoonWorldSpec,
  clampStudioBg3dWorldShaperSliders,
  instantiateStudioBg3dWebtoonWorld,
  STUDIO_BG3D_MOOD_IDS,
  STUDIO_BG3D_MOOD_PALETTES,
  STUDIO_BG3D_WEBTOON_UNIVERSE_IDS,
  STUDIO_BG3D_WEBTOON_UNIVERSES,
} from "./studio-bg3d-webtoon-world-shaper";

describe("studio-bg3d-webtoon-world-shaper", () => {
  it("8대 웹툰 세계관과 6종 시간대·장르 무드 팔레트를 완비하고 인체 비례 여유고를 보장한다", () => {
    expect(STUDIO_BG3D_WEBTOON_UNIVERSES).toHaveLength(8);
    expect(STUDIO_BG3D_WEBTOON_UNIVERSE_IDS).toHaveLength(8);
    expect(STUDIO_BG3D_MOOD_IDS).toHaveLength(6);

    for (const universeId of STUDIO_BG3D_WEBTOON_UNIVERSE_IDS) {
      let seq = 0;
      const built = instantiateStudioBg3dWebtoonWorld(
        { universeId },
        () => `node-${++seq}`,
      );
      expect(built.primitives.length).toBeGreaterThan(8);
      expect(built.varcoPropPrimitiveIds.length).toBeGreaterThanOrEqual(3);
      // 1.7m 성인 캐릭터 기준 최소 0.8m 이상의 천장 여유고 보장
      expect(built.boundsMeters.characterHeadClearanceMeters).toBeGreaterThanOrEqual(0.8);

      const varcoProps = built.primitives.filter((p) =>
        p.componentRef?.id.startsWith("varco3d:"),
      );
      expect(varcoProps.length).toBe(built.varcoPropPrimitiveIds.length);
      expect(varcoProps[0]?.componentRef?.name.length).toBeGreaterThan(2);
      expect(varcoProps[0]?.tags).toContain("varco3d");
      expect(varcoProps[0]?.tags).toContain(universeId);
    }
  });

  it("파라메트릭 슬라이더(폭·깊이·층고·창문 밀도·가구 밀도·중앙 통로 폭)와 연속 보간이 정확히 작동한다", () => {
    const compact = clampStudioBg3dWorldShaperSliders({
      widthScale: 0.7,
      depthScale: 0.7,
      ceilingScale: 0.8,
      windowDensity: 0,
      furnitureDensity: 0,
      aisleRatio: 0.2,
      propScale: 0.8,
    });
    const grand = clampStudioBg3dWorldShaperSliders({
      widthScale: 1.6,
      depthScale: 1.6,
      ceilingScale: 1.5,
      windowDensity: 1,
      furnitureDensity: 1,
      aisleRatio: 0.5,
      propScale: 1.3,
    });

    const mid = blendStudioBg3dWorldShaperSliders(compact, grand, 0.5);
    expect(mid.widthScale).toBeCloseTo(1.15, 3);
    expect(mid.windowDensity).toBeCloseTo(0.5, 3);
    expect(mid.aisleRatio).toBeCloseTo(0.35, 3);

    const compactSpec = buildStudioBg3dWebtoonWorldSpec("school-romance", compact, "noir-night");
    const grandSpec = buildStudioBg3dWebtoonWorldSpec("school-romance", grand, "sunset-romance");

    expect(grandSpec.width).toBeGreaterThan(compactSpec.width);
    expect(grandSpec.wallHeight).toBeGreaterThan(compactSpec.wallHeight);
    expect(compactSpec.openings.every((o) => o.type === "door")).toBe(true);
    expect(grandSpec.openings.some((o) => o.type === "window")).toBe(true);
    expect(compactSpec.furniture).toHaveLength(0);
    expect(grandSpec.furniture.length).toBeGreaterThan(0);
    expect(compactSpec.floorColor).toBe(STUDIO_BG3D_MOOD_PALETTES["noir-night"].floorColor);
    expect(grandSpec.floorColor).toBe(STUDIO_BG3D_MOOD_PALETTES["sunset-romance"].floorColor);
  });
});
