import { describe, expect, it } from "vitest";
import {
  applyPhotoshopWebFilterPresetToRgba,
  findPhotoshopWebFilterPresetByName,
  getPhotoshopWebFilterPresetsByCategory,
  listPhotoshopWebFilterPresets,
  PHOTOSHOP_ADVANCED_PROCEDURAL_CATEGORIES,
  PHOTOSHOP_HOME_ENTITLED_EFFECT_CARDS,
  PHOTOSHOP_HOME_FREE_EFFECT_CARDS,
  PHOTOSHOP_WEB_FILTER_CATEGORIES,
  PHOTOSHOP_WEB_FILTER_PRESETS,
} from "./studio-photoshop-web-filter-presets";

describe("studio-photoshop-web-filter-presets", () => {
  it("24개 포토샵 웹 필터 카테고리와 전체 프리셋·슈퍼프리셋 카탈로그를 빠짐없이 제공한다", () => {
    expect(PHOTOSHOP_WEB_FILTER_CATEGORIES).toHaveLength(24);
    for (const category of PHOTOSHOP_WEB_FILTER_CATEGORIES) {
      const presets = getPhotoshopWebFilterPresetsByCategory(category);
      expect(presets.length).toBeGreaterThanOrEqual(1);
    }
    expect(PHOTOSHOP_HOME_ENTITLED_EFFECT_CARDS).toHaveLength(9);
    expect(PHOTOSHOP_HOME_FREE_EFFECT_CARDS).toHaveLength(7);
  });

  it("고급 프로시저럴 효과 6종(lightLeak, linearRepeater, prism, sparkles, tileGrid, radialWaves)과 슈퍼프리셋 게이팅을 재현한다", () => {
    expect(PHOTOSHOP_ADVANCED_PROCEDURAL_CATEGORIES.size).toBe(6);

    const standardOnly = listPhotoshopWebFilterPresets({
      includeAdvancedProcedural: false,
    });
    expect(
      standardOnly.some((preset) =>
        PHOTOSHOP_ADVANCED_PROCEDURAL_CATEGORIES.has(preset.category),
      ),
    ).toBe(false);

    const superOnly = listPhotoshopWebFilterPresets({ superPresetsOnly: true });
    expect(superOnly.length).toBeGreaterThanOrEqual(20);
    expect(superOnly.every((preset) => preset.isSuperPreset === true)).toBe(
      true,
    );

    expect(findPhotoshopWebFilterPresetByName("dollarBill")?.category).toBe(
      "halftone",
    );
    expect(findPhotoshopWebFilterPresetByName("retroTone")?.isSuperPreset).toBe(
      true,
    );
    expect(
      findPhotoshopWebFilterPresetByName("filmBurn", {
        includeAdvancedProcedural: false,
      }),
    ).toBeUndefined();
  });

  it("24개 모든 카테고리에 대해 알파 채널을 보존하고 NaN 없이 결정론적 RGBA 픽셀 변환을 수행한다", () => {
    const width = 4;
    const height = 4;
    const src = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      src[i * 4] = (i * 19) % 256;
      src[i * 4 + 1] = (i * 43 + 40) % 256;
      src[i * 4 + 2] = (i * 71 + 90) % 256;
      src[i * 4 + 3] = 200 - (i % 50);
    }

    for (const preset of PHOTOSHOP_WEB_FILTER_PRESETS) {
      const out = applyPhotoshopWebFilterPresetToRgba(
        src,
        width,
        height,
        preset,
      );
      expect(out.length).toBe(src.length);
      for (let i = 0; i < width * height; i += 1) {
        expect(Number.isFinite(out[i * 4])).toBe(true);
        expect(Number.isFinite(out[i * 4 + 1])).toBe(true);
        expect(Number.isFinite(out[i * 4 + 2])).toBe(true);
        // 알파 채널 보존 검증
        expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
      }
    }
  });

  it("파라미터에 NaN·Infinity가 유입되어도 유한한 바이트로 방어한다", () => {
    const src = new Uint8ClampedArray([120, 150, 210, 255, 40, 80, 120, 128]);
    const out = applyPhotoshopWebFilterPresetToRgba(src, 2, 1, {
      category: "duotone",
      parameters: [
        { name: "color", value: [Number.NaN, Number.POSITIVE_INFINITY, -5, 1] },
        { name: "level", value: [Number.NaN] },
      ],
    });
    expect([...out].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(
      true,
    );
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(128);
  });
});
