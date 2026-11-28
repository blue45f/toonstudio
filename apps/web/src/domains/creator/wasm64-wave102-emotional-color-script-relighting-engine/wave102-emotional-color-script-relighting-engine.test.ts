import { describe, expect, it } from "vitest";
import {
  LIGHTING_MOOD_PRESETS,
  LIGHTING_MOOD_PRESET_IDS,
  buildColorScriptRelightingWgsl,
  compileEpisodeColorScriptArc,
  computeOklabDeltaE,
  computeWcagContrastRatio,
  escapeColorScriptXml,
  findMaxInGamutChroma,
  formatOklchCss,
  gamutMapOklch,
  getLightingMoodPreset,
  interpolateHueDeg,
  linearToSRgb,
  normalizeHueDeg,
  oklchToOklab,
  oklchToSRgb,
  relightCompactRgbaTile,
  relightFlatPaletteForMood,
  renderEpisodeColorScriptSvg,
  sRgbToLinear,
  sRgbToOklch,
  shortestHueDeltaDeg,
  summarizeColorScriptAuditKo,
  validateColorScriptWgsl,
  type EpisodeSceneInput,
  type FlatColorSwatch,
  type SrgbColor,
} from "./index";

const HERO_CHARACTER_AND_SCENE_SWATCHES: readonly FlatColorSwatch[] = [
  {
    swatchId: "skin-light",
    labelKo: "주인공 밝은 피부",
    role: "skin",
    srgb: { r: 238, g: 196, b: 170 },
  },
  {
    swatchId: "skin-deep",
    labelKo: "조연 깊은 갈색 피부",
    role: "skin",
    srgb: { r: 148, g: 96, b: 70 },
  },
  {
    swatchId: "hair-navy",
    labelKo: "남색 머리카락",
    role: "hair",
    srgb: { r: 48, g: 64, b: 108 },
  },
  {
    swatchId: "jacket-crimson",
    labelKo: "진홍색 재킷",
    role: "costume",
    srgb: { r: 196, g: 56, b: 68 },
  },
  {
    swatchId: "scarf-amber",
    labelKo: "황금 머플러",
    role: "prop",
    srgb: { r: 224, g: 168, b: 58 },
  },
  {
    swatchId: "bg-wall-warm",
    labelKo: "배경 벽돌 외벽",
    role: "background",
    srgb: { r: 214, g: 178, b: 152 },
  },
  {
    swatchId: "bg-sky-street",
    labelKo: "배경 거리",
    role: "background",
    srgb: { r: 132, g: 158, b: 186 },
  },
];

function buildFiveSceneEpisode(): readonly EpisodeSceneInput[] {
  return [
    {
      sceneId: "sc-01-morning",
      titleKo: "등굣길 햇살",
      emotionArc: "calm",
      moodPreset: "morning-daylight",
      baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      balloonTextSrgb: { r: 20, g: 26, b: 32 },
      balloonBgSrgb: { r: 250, g: 248, b: 243 },
    },
    {
      sceneId: "sc-02-tension",
      titleKo: "석양 속 추격",
      emotionArc: "rising-tension",
      moodPreset: "golden-sunset",
      baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      balloonTextSrgb: { r: 24, g: 20, b: 28 },
      balloonBgSrgb: { r: 248, g: 244, b: 236 },
    },
    {
      sceneId: "sc-03-climax",
      titleKo: "빗속 네온 대치",
      emotionArc: "climax",
      moodPreset: "neon-rain-midnight",
      baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      balloonTextSrgb: { r: 244, g: 248, b: 255 },
      balloonBgSrgb: { r: 22, g: 26, b: 42 },
    },
    {
      sceneId: "sc-04-flashback",
      titleKo: "오래된 약속의 기억",
      emotionArc: "flashback",
      moodPreset: "flashback-sepia-memory",
      baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      balloonTextSrgb: { r: 34, g: 26, b: 18 },
      balloonBgSrgb: { r: 246, g: 238, b: 222 },
    },
    {
      sceneId: "sc-05-relief",
      titleKo: "카페의 화해",
      emotionArc: "relief",
      moodPreset: "warm-cafe-interior",
      baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      balloonTextSrgb: { r: 26, g: 22, b: 18 },
      balloonBgSrgb: { r: 252, g: 248, b: 240 },
    },
  ];
}

describe("Wave 102 — OKLCH 색순응 변환 및 색역 매핑", () => {
  it("sRGB ↔ Linear RGB 변환이 경계값과 감마 구간을 정확히 왕복한다", () => {
    const samples: readonly SrgbColor[] = [
      { r: 0, g: 0, b: 0 },
      { r: 8, g: 12, b: 20 },
      { r: 128, g: 128, b: 128 },
      { r: 215, g: 164, b: 92 },
      { r: 255, g: 255, b: 255 },
    ];
    for (const s of samples) {
      const lin = sRgbToLinear(s);
      expect(lin.r).toBeGreaterThanOrEqual(0);
      expect(lin.r).toBeLessThanOrEqual(1);
      const back = linearToSRgb(lin);
      expect(back).toEqual(s);
    }
  });

  it("원색·피부색·무채색·중간톤에서 sRGB ↔ OKLCH 왕복 오차가 deltaE < 0.005이다", () => {
    const testColors: readonly SrgbColor[] = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
      { r: 244, g: 204, b: 180 },
      { r: 198, g: 146, b: 112 },
      { r: 118, g: 76, b: 56 },
      { r: 0, g: 0, b: 0 },
      { r: 127, g: 127, b: 127 },
      { r: 255, g: 255, b: 255 },
      { r: 64, g: 142, b: 132 },
      { r: 168, g: 82, b: 158 },
    ];
    for (const color of testColors) {
      const lch = sRgbToOklch(color);
      const roundTrip = oklchToSRgb(lch);
      const de = computeOklabDeltaE(color, roundTrip);
      expect(de).toBeLessThan(0.005);
      expect(Math.abs(roundTrip.r - color.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.g - color.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.b - color.b)).toBeLessThanOrEqual(1);
    }
  });

  it("색역 밖 초고채도 OKLCH 색상을 색상각 왜곡 없이 유효한 sRGB 정수로 매핑한다", () => {
    const outOfGamutHues = [25, 65, 145, 220, 305];
    for (const h of outOfGamutHues) {
      const mapped = gamutMapOklch({ l: 0.68, c: 0.45, h });
      expect(mapped.c).toBeGreaterThan(0.05);
      expect(mapped.c).toBeLessThan(0.45);
      expect(Math.abs(shortestHueDeltaDeg(h, mapped.h))).toBeLessThan(0.05);

      const srgb = oklchToSRgb({ l: 0.68, c: 0.45, h });
      expect(Number.isInteger(srgb.r)).toBe(true);
      expect(Number.isInteger(srgb.g)).toBe(true);
      expect(Number.isInteger(srgb.b)).toBe(true);
      expect(srgb.r).toBeGreaterThanOrEqual(0);
      expect(srgb.r).toBeLessThanOrEqual(255);
      expect(srgb.g).toBeGreaterThanOrEqual(0);
      expect(srgb.g).toBeLessThanOrEqual(255);
      expect(srgb.b).toBeGreaterThanOrEqual(0);
      expect(srgb.b).toBeLessThanOrEqual(255);

      const recovered = sRgbToOklch(srgb);
      expect(Math.abs(shortestHueDeltaDeg(h, recovered.h))).toBeLessThan(2.0);
    }
  });

  it("극단 명도(0/1)와 비유한 입력(NaN)을 안전하게 경계 sRGB로 정규화한다", () => {
    expect(oklchToSRgb({ l: 0, c: 0.3, h: 120 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(oklchToSRgb({ l: 1, c: 0.3, h: 120 })).toEqual({ r: 255, g: 255, b: 255 });
    const safeNan = oklchToSRgb({ l: Number.NaN, c: Number.NaN, h: Number.NaN });
    expect(Number.isFinite(safeNan.r)).toBe(true);
    expect(Number.isFinite(safeNan.g)).toBe(true);
    expect(Number.isFinite(safeNan.b)).toBe(true);
  });

  it("computeOklabDeltaE는 SrgbColor/OklchColor/OklabColor 입력에 일관된 대칭 거리를 반환한다", () => {
    const c1: SrgbColor = { r: 220, g: 120, b: 80 };
    const c2: SrgbColor = { r: 60, g: 110, b: 190 };
    const lch1 = sRgbToOklch(c1);
    const lab2 = oklchToOklab(sRgbToOklch(c2));

    const dSrgb = computeOklabDeltaE(c1, c2);
    const dMixed = computeOklabDeltaE(lch1, lab2);
    const dReverse = computeOklabDeltaE(c2, c1);

    expect(computeOklabDeltaE(c1, c1)).toBe(0);
    expect(Math.abs(dSrgb - dMixed)).toBeLessThan(1e-9);
    expect(Math.abs(dSrgb - dReverse)).toBeLessThan(1e-9);
    expect(dSrgb).toBeGreaterThan(0.2);
  });

  it("색상각 정규화·최단 각도차·최단 호 보간이 0°/360° 경계를 정확히 처리한다", () => {
    expect(normalizeHueDeg(-30)).toBe(330);
    expect(normalizeHueDeg(750)).toBe(30);
    expect(shortestHueDeltaDeg(350, 10)).toBeCloseTo(20, 6);
    expect(shortestHueDeltaDeg(10, 350)).toBeCloseTo(-20, 6);
    expect(interpolateHueDeg(350, 10, 0.5)).toBeCloseTo(0, 6);
  });

  it("formatOklchCss는 유효한 CSS oklch(...) 문자열을 생성하며 비유한 값도 안전 처리한다", () => {
    const opaque = formatOklchCss({ l: 0.72, c: 0.14, h: 55.5 });
    expect(opaque).toBe("oklch(0.7200 0.1400 55.50)");
    const translucent = formatOklchCss({ l: 0.5, c: 0.08, h: 240 }, 0.4);
    expect(translucent).toBe("oklch(0.5000 0.0800 240.00 / 0.400)");
    expect(formatOklchCss({ l: Number.NaN, c: Number.NaN, h: Number.NaN })).not.toContain("NaN");
  });

  it("findMaxInGamutChroma는 중간 명도에서 양수 채도, 극단 명도에서 0을 반환한다", () => {
    expect(findMaxInGamutChroma(0, 50)).toBe(0);
    expect(findMaxInGamutChroma(1, 50)).toBe(0);
    expect(findMaxInGamutChroma(0.65, 30)).toBeGreaterThan(0.15);
  });
});

describe("Wave 102 — 6종 조명 프리셋, Anti-Mud 암부 색이동 & 피부색 기억색 보호", () => {
  it("6종 조명 프리셋이 모두 등록되어 있으며 서로 뚜렷이 다른 재조명 결과를 생성한다", () => {
    expect(LIGHTING_MOOD_PRESET_IDS).toHaveLength(6);
    const results = LIGHTING_MOOD_PRESET_IDS.map((id) => {
      expect(getLightingMoodPreset(id).id).toBe(id);
      return relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, id);
    });

    for (let i = 0; i < results.length; i += 1) {
      for (let j = i + 1; j < results.length; j += 1) {
        const bgA = results[i].swatches[5].midtoneOklch;
        const bgB = results[j].swatches[5].midtoneOklch;
        const shA = results[i].swatches[5].shadowOklch;
        const shB = results[j].swatches[5].shadowOklch;
        const combinedDiff = computeOklabDeltaE(bgA, bgB) + computeOklabDeltaE(shA, shB);
        expect(combinedDiff).toBeGreaterThan(0.04);
      }
    }
  });

  it("물리 색온도 일관성: golden-sunset은 neon-rain-midnight보다 따뜻하고 warm-cafe는 morning보다 따뜻하다", () => {
    const sunset = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "golden-sunset");
    const neon = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "neon-rain-midnight");
    const overcast = relightFlatPaletteForMood(
      HERO_CHARACTER_AND_SCENE_SWATCHES,
      "overcast-melancholy",
    );
    const cafe = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "warm-cafe-interior");
    const morning = relightFlatPaletteForMood(
      HERO_CHARACTER_AND_SCENE_SWATCHES,
      "morning-daylight",
    );

    expect(sunset.preset.kelvin).toBeLessThan(neon.preset.kelvin);
    expect(sunset.warmthIndex).toBeGreaterThan(neon.warmthIndex + 0.04);
    expect(sunset.warmthIndex).toBeGreaterThan(overcast.warmthIndex + 0.03);
    expect(cafe.warmthIndex).toBeGreaterThan(morning.warmthIndex);
  });

  it("회상 세피아 프리셋은 황금 노을·네온 심야보다 평균 채도가 낮다", () => {
    const sepia = relightFlatPaletteForMood(
      HERO_CHARACTER_AND_SCENE_SWATCHES,
      "flashback-sepia-memory",
    );
    const sunset = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "golden-sunset");
    const neon = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "neon-rain-midnight");

    expect(sepia.meanMidtoneChroma).toBeLessThan(sunset.meanMidtoneChroma);
    expect(sepia.meanMidtoneChroma).toBeLessThan(neon.meanMidtoneChroma);
  });

  it("Anti-Mud 불변식: 유채색 암부가 흑색 곱셈 회색이 아닌 채도 보존 + 환경광 색상 이동을 유지한다", () => {
    const nonSepiaMoods = LIGHTING_MOOD_PRESET_IDS.filter((id) => id !== "flashback-sepia-memory");
    for (const mood of nonSepiaMoods) {
      const relit = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, mood);
      expect(relit.allAntiMudPassed).toBe(true);
      expect(relit.minShadowChromaRetention).toBeGreaterThanOrEqual(0.65);

      const costumeSwatch = relit.swatches.find((s) => s.swatchId === "jacket-crimson");
      expect(costumeSwatch).toBeDefined();
      if (costumeSwatch !== undefined) {
        expect(costumeSwatch.shadowOklch.c).toBeGreaterThan(costumeSwatch.naiveBlackShadowOklch.c);
        expect(Math.abs(costumeSwatch.shadowHueShiftDeg)).toBeGreaterThan(2);
      }
    }
  });

  it("무채색(흰 셔츠·회색 벽)도 암부에서 환경광 색감을 흡수해 단조로운 회색을 피한다", () => {
    const neutrals: readonly FlatColorSwatch[] = [
      { swatchId: "shirt-white", labelKo: "흰 셔츠", role: "costume", srgb: { r: 244, g: 244, b: 244 } },
      { swatchId: "wall-gray", labelKo: "회색 콘크리트", role: "background", srgb: { r: 152, g: 152, b: 152 } },
    ];
    const relit = relightFlatPaletteForMood(neutrals, "golden-sunset");
    for (const sw of relit.swatches) {
      expect(sw.shadowOklch.c).toBeGreaterThan(0.01);
      expect(sw.antiMudPassed).toBe(true);
    }
  });

  it("강한 네온 심야 조명에서 피부 스와치는 28° 이내로 보호되는 반면 동일 원색 배경은 자유롭게 시안·남빛으로 이동한다", () => {
    const pairedSwatches: readonly FlatColorSwatch[] = [
      { swatchId: "skin-hero", labelKo: "주인공 피부", role: "skin", srgb: { r: 232, g: 186, b: 156 } },
      { swatchId: "bg-same-tone", labelKo: "동일 톤 배경 벽", role: "background", srgb: { r: 232, g: 186, b: 156 } },
    ];
    const neon = relightFlatPaletteForMood(pairedSwatches, "neon-rain-midnight");
    const skin = neon.swatches[0];
    const bg = neon.swatches[1];

    expect(neon.allSkinProtected).toBe(true);
    expect(skin.skinAnchorApplied).toBe(true);
    expect(skin.skinHueDriftDeg).not.toBeNull();
    expect(skin.skinHueDriftDeg ?? 999).toBeLessThanOrEqual(28);
    // 피부색이 병적인 녹색/시안 대역(115°..220°)으로 빠지지 않음을 확인
    expect(skin.midtoneOklch.h < 105 || skin.midtoneOklch.h > 250).toBe(true);
    // 동일 원색 배경은 네온 환경광을 훨씬 크게 흡수한다
    expect(bg.midtoneHueDriftDeg).toBeGreaterThan((skin.midtoneHueDriftDeg ?? 0) + 15);
  });

  it("6종 조명 프리셋 전체에서 밝은 피부와 깊은 갈색 피부 모두 피부색 기억색 보호 기준을 통과한다", () => {
    for (const mood of LIGHTING_MOOD_PRESET_IDS) {
      const relit = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, mood);
      expect(relit.allSkinProtected).toBe(true);
      expect(relit.maxSkinHueDriftDeg).toBeLessThanOrEqual(28);
    }
  });

  it("사용자 지정 maxAllowedSkinHueDriftDeg=12° 옵션이 피부 색상각 편차를 엄격히 제한한다", () => {
    const tight = relightFlatPaletteForMood(
      HERO_CHARACTER_AND_SCENE_SWATCHES,
      "neon-rain-midnight",
      { maxAllowedSkinHueDriftDeg: 12, skinAnchorStrength: 0.85 },
    );
    expect(tight.allSkinProtected).toBe(true);
    expect(tight.maxSkinHueDriftDeg).toBeLessThanOrEqual(12.5);
  });

  it("intensity=0일 때 미드톤이 원본 플랫 팔레트에 가깝게 유지된다", () => {
    const flat = relightFlatPaletteForMood(HERO_CHARACTER_AND_SCENE_SWATCHES, "golden-sunset", {
      intensity: 0,
    });
    for (const sw of flat.swatches) {
      expect(computeOklabDeltaE(sw.baseOklch, sw.midtoneOklch)).toBeLessThan(0.015);
    }
  });

  it("빈 스와치 배열도 예외나 NaN 없이 정상 결과를 반환한다", () => {
    const empty = relightFlatPaletteForMood([], "morning-daylight");
    expect(empty.swatches).toHaveLength(0);
    expect(empty.allSkinProtected).toBe(true);
    expect(empty.allAntiMudPassed).toBe(true);
    expect(Number.isFinite(empty.meanMidtoneLightness)).toBe(true);
  });
});

describe("Wave 102 — 소형 RGBA 타일 결정론적 재조명", () => {
  it("동일한 RGBA 타일을 두 번 재조명하면 바이트 단위로 동일하며 NaN이 없다", () => {
    const width = 4;
    const height = 4;
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      buf[i * 4] = 220;
      buf[i * 4 + 1] = 175;
      buf[i * 4 + 2] = 148;
      buf[i * 4 + 3] = 255;
    }

    const first = relightCompactRgbaTile(buf, "golden-sunset", { width, height });
    const second = relightCompactRgbaTile(buf, "golden-sunset", { width, height });

    expect(first.hasNonFinite).toBe(false);
    expect(first.pixelCount).toBe(16);
    expect(first.opaquePixelCount).toBe(16);
    expect(first.meanDeltaE).toBeGreaterThan(0.01);
    expect(Array.from(first.rgba)).toEqual(Array.from(second.rgba));
  });

  it("알파 채널(0, 64, 128, 255)을 정확히 보존하고 완전 투명 픽셀은 변조하지 않는다", () => {
    const buf = new Uint8ClampedArray([
      123, 45, 67, 0,
      200, 100, 80, 64,
      80, 140, 210, 128,
      235, 192, 165, 255,
    ]);
    const res = relightCompactRgbaTile(buf, "neon-rain-midnight", { width: 2, height: 2 });

    expect(res.rgba[0]).toBe(123);
    expect(res.rgba[1]).toBe(45);
    expect(res.rgba[2]).toBe(67);
    expect(res.rgba[3]).toBe(0);
    expect(res.rgba[7]).toBe(64);
    expect(res.rgba[11]).toBe(128);
    expect(res.rgba[15]).toBe(255);
    expect(res.opaquePixelCount).toBe(3);
  });

  it("래스터 타일 휴리스틱 피부 마스크가 피부 픽셀을 검출해 네온 심야에서 색상 이탈을 억제한다", () => {
    const skinPx = new Uint8ClampedArray([236, 192, 166, 255]);
    const protectedRes = relightCompactRgbaTile(skinPx, "neon-rain-midnight", {
      width: 1,
      height: 1,
      protectSkinHeuristic: true,
    });
    const unprotectedRes = relightCompactRgbaTile(skinPx, "neon-rain-midnight", {
      width: 1,
      height: 1,
      protectSkinHeuristic: false,
    });

    const baseHue = sRgbToOklch({ r: 236, g: 192, b: 166 }).h;
    const protectedHue = sRgbToOklch({
      r: protectedRes.rgba[0],
      g: protectedRes.rgba[1],
      b: protectedRes.rgba[2],
    }).h;
    const unprotectedHue = sRgbToOklch({
      r: unprotectedRes.rgba[0],
      g: unprotectedRes.rgba[1],
      b: unprotectedRes.rgba[2],
    }).h;

    expect(protectedRes.skinDetectedPixelCount).toBe(1);
    expect(Math.abs(shortestHueDeltaDeg(baseHue, protectedHue))).toBeLessThan(
      Math.abs(shortestHueDeltaDeg(baseHue, unprotectedHue)),
    );
  });

  it("RGBA 버퍼 길이가 치수보다 작으면 명시적 오류를 발생시킨다", () => {
    const tiny = new Uint8ClampedArray(8);
    expect(() =>
      relightCompactRgbaTile(tiny, "morning-daylight", { width: 4, height: 4 }),
    ).toThrow(/RGBA buffer length/);
  });
});

describe("Wave 102 — 에피소드 색채 스크립트 아크 컴파일러, WCAG 2.1 & WebGPU WGSL", () => {
  it("5장면 풀 에피소드(calm→rising-tension→climax→flashback→relief)가 정확한 인접 ΔE와 종합 통과를 계산한다", () => {
    const arc = compileEpisodeColorScriptArc(buildFiveSceneEpisode(), {
      episodeId: "ep-102-rain",
      episodeTitleKo: "빗속의 약속",
    });

    expect(arc.scenes).toHaveLength(5);
    expect(arc.transitions).toHaveLength(4);
    expect(arc.scenes[0].deltaEFromPreviousScene).toBeNull();

    for (let i = 1; i < arc.scenes.length; i += 1) {
      const expectedDe = computeOklabDeltaE(
        arc.scenes[i - 1].dominantOklch,
        arc.scenes[i].dominantOklch,
      );
      expect(arc.scenes[i].deltaEFromPreviousScene).toBeCloseTo(expectedDe, 9);
      expect(arc.transitions[i - 1].deltaEBetweenScenes).toBeCloseTo(expectedDe, 9);
    }

    expect(arc.allSkinProtected).toBe(true);
    expect(arc.allAntiMudPassed).toBe(true);
    expect(arc.allBalloonWcagPassed).toBe(true);
    expect(arc.climaxVerification.peakAchieved).toBe(true);
    expect(arc.overallPassed).toBe(true);
  });

  it("감정 절정(climax) 장면이 선행 안정(calm) 장면보다 강한 명암 폭 또는 채도 정점을 달성한다", () => {
    const arc = compileEpisodeColorScriptArc(buildFiveSceneEpisode());
    expect(arc.climaxVerification.hasClimaxScene).toBe(true);
    expect(arc.climaxVerification.climaxSceneIds).toEqual(["sc-03-climax"]);
    expect(arc.climaxVerification.precedingCalmSceneIds).toEqual(["sc-01-morning"]);
    expect(
      arc.climaxVerification.contrastLiftOverCalm > 0 ||
        arc.climaxVerification.chromaLiftOverCalm > 0,
    ).toBe(true);
    expect(arc.climaxVerification.peakAchieved).toBe(true);
  });

  it("절정 장면이 선행 안정 장면보다 명암 폭과 채도가 모두 낮으면 정점 미달을 감지한다", () => {
    const weakClimaxScenes: readonly EpisodeSceneInput[] = [
      {
        sceneId: "s1-calm-vivid",
        titleKo: "화려한 노을 도입",
        emotionArc: "calm",
        moodPreset: "golden-sunset",
        baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      },
      {
        sceneId: "s2-climax-flat",
        titleKo: "힘 빠진 절정",
        emotionArc: "climax",
        moodPreset: "overcast-melancholy",
        baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
      },
    ];
    const arc = compileEpisodeColorScriptArc(weakClimaxScenes);
    expect(arc.climaxVerification.peakAchieved).toBe(false);
    expect(arc.overallPassed).toBe(false);
  });

  it("WCAG 2.1 대비율 계산이 W3C 기준값(흑/백 21:1, 동일색 1:1)과 일치한다", () => {
    expect(
      computeWcagContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }),
    ).toBeCloseTo(21, 5);
    expect(
      computeWcagContrastRatio({ r: 120, g: 130, b: 140 }, { r: 120, g: 130, b: 140 }),
    ).toBeCloseTo(1, 5);
  });

  it("말풍선 저대비 텍스트(WCAG < 4.5)를 명시 배경과 재조명 배경 직접 배치 모두에서 정확히 탐지한다", () => {
    const lowContrastScenes: readonly EpisodeSceneInput[] = [
      {
        sceneId: "sc-explicit-low",
        titleKo: "흐린 회색 말풍선",
        emotionArc: "calm",
        moodPreset: "morning-daylight",
        baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
        balloonTextSrgb: { r: 128, g: 132, b: 138 },
        balloonBgSrgb: { r: 176, g: 180, b: 186 },
      },
      {
        sceneId: "sc-direct-dark-on-midnight",
        titleKo: "어두운 배경 위 어두운 글씨",
        emotionArc: "climax",
        moodPreset: "neon-rain-midnight",
        baseSwatches: [
          { swatchId: "bg-dark-alley", labelKo: "어두운 골목", role: "background", srgb: { r: 34, g: 42, b: 64 } },
          { swatchId: "skin-main", labelKo: "피부", role: "skin", srgb: { r: 230, g: 188, b: 162 } },
        ],
        balloonTextSrgb: { r: 26, g: 30, b: 44 },
      },
    ];

    const arc = compileEpisodeColorScriptArc(lowContrastScenes);
    expect(arc.allBalloonWcagPassed).toBe(false);
    expect(arc.failingWcagSceneIds).toEqual(["sc-explicit-low", "sc-direct-dark-on-midnight"]);
    expect(arc.minObservedBalloonWcagRatio).toBeLessThan(4.5);
    expect(arc.overallPassed).toBe(false);

    for (const sc of arc.scenes) {
      expect(sc.balloonContrast.passed).toBe(false);
      const fixedRatio = computeWcagContrastRatio(
        sc.balloonContrast.recommendedTextSrgb,
        sc.balloonContrast.backgroundSrgb,
      );
      expect(fixedRatio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("6종 프리셋 모두에 대해 유효한 WebGPU WGSL 재조명·피부 마스크 셰이더를 생성하고 검증을 통과한다", () => {
    for (const mood of LIGHTING_MOOD_PRESET_IDS) {
      const wgsl = buildColorScriptRelightingWgsl(LIGHTING_MOOD_PRESETS[mood]);
      const validation = validateColorScriptWgsl(wgsl);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.entryPoints).toEqual(["main"]);
      expect(validation.lineCount).toBeGreaterThan(80);
    }
  });

  it("validateColorScriptWgsl은 깨진 중괄호·NaN·필수 함수 누락 셰이더를 정확히 거부한다", () => {
    const broken = "@compute @workgroup_size(8, 8, 1) fn main() { let x = NaN;";
    const validation = validateColorScriptWgsl(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("빈 장면 목록도 에피소드 컴파일러가 안전하게 처리한다", () => {
    const empty = compileEpisodeColorScriptArc([]);
    expect(empty.scenes).toHaveLength(0);
    expect(empty.transitions).toHaveLength(0);
    expect(empty.overallPassed).toBe(true);
  });
});

describe("Wave 102 — OKLCH 전용 필름스트립 SVG & 한국어 아트디렉터 검토 보고서", () => {
  it("renderEpisodeColorScriptSvg가 4단 스와치·명도 곡선·절정 마커·피부 배지를 0 NaN으로 렌더링한다", () => {
    const arc = compileEpisodeColorScriptArc(buildFiveSceneEpisode(), {
      episodeId: "ep-102-strip",
      episodeTitleKo: "네온 빗속 에피소드",
    });
    const svg = renderEpisodeColorScriptSvg(arc);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/\bNaN\b/);
    expect(svg).not.toMatch(/\bInfinity\b/);
    expect(svg).toContain("linearGradient");
    expect(svg).toContain("RIM L");
    expect(svg).toContain("LIT L");
    expect(svg).toContain("MID L");
    expect(svg).toContain("SHD L");
    expect(svg).toContain("CLIMAX");
    expect(svg).toContain("피부 보호 OK");
    expect(svg).toContain("<polyline ");
    expect(svg).toContain("oklch(");
  });

  it("렌더링된 SVG에는 raw hex나 rgb/rgba 리터럴이 단 하나도 없고 oklch(...) 색상만 사용한다", () => {
    const arc = compileEpisodeColorScriptArc(buildFiveSceneEpisode());
    const svg = renderEpisodeColorScriptSvg(arc);

    // SVG 내부 url(#scene-grad-...) 참조는 제외하고 fill/stroke/stop-color 값에서 raw hex/rgb 차단 검증
    const rawHexColorAttr = new RegExp('(fill|stroke|stop-color)="#', "i");
    const rawRgbFunc = new RegExp("\\brgba?\\s*\\(", "i");
    expect(rawHexColorAttr.test(svg)).toBe(false);
    expect(rawRgbFunc.test(svg)).toBe(false);

    const oklchMatches = svg.match(/oklch\(/g);
    expect(oklchMatches).not.toBeNull();
    expect((oklchMatches ?? []).length).toBeGreaterThan(20);
  });

  it("XML 특수문자(<, >, &, \", ')가 SVG 제목과 장면 제목에서 안전하게 이스케이프된다", () => {
    const rawSpecial = `비 <폭풍> & "네온" '야경'`;
    expect(escapeColorScriptXml(rawSpecial)).toBe(
      "비 &lt;폭풍&gt; &amp; &quot;네온&quot; &apos;야경&apos;",
    );
    const arc = compileEpisodeColorScriptArc(
      [
        {
          sceneId: "sc-xml",
          titleKo: rawSpecial,
          emotionArc: "climax",
          moodPreset: "neon-rain-midnight",
          baseSwatches: HERO_CHARACTER_AND_SCENE_SWATCHES,
        },
      ],
      { episodeTitleKo: `테스트 & <제목>` },
    );
    const svg = renderEpisodeColorScriptSvg(arc);
    expect(svg).toContain("테스트 &amp; &lt;제목&gt;");
    expect(svg).not.toContain("<폭풍>");
  });

  it("summarizeColorScriptAuditKo가 번역투 없이 장면 흐름·피부 보호·암부 채도·절정·WCAG를 한국어로 보고한다", () => {
    const arc = compileEpisodeColorScriptArc(buildFiveSceneEpisode(), {
      episodeId: "ep-102-audit",
      episodeTitleKo: "네온 빗속의 약속",
    });
    const report = summarizeColorScriptAuditKo(arc, { generatedDateIso: "2026-11-28" });

    expect(report).toContain("네온 빗속의 약속");
    expect(report).toContain("출고 적합");
    expect(report).toContain("2026-11-28");
    expect(report).toContain("피부색 보호 통과");
    expect(report).toContain("암부 탁함 방지 통과");
    expect(report).toContain("절정 구간 정점 확인");
    expect(report).toContain("말풍선 가독성 통과");

    // 번역투 상투어 금지 확인
    expect(report).not.toContain("가능하게 합니다");
    expect(report).not.toContain("직관적인 경험을 제공");
    expect(report).not.toContain("원활한 워크플로우를 보장");
  });
});
