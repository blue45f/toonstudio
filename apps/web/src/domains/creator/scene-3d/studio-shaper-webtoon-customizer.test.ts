import { describe, expect, it } from "vitest";

import { parseCharacterStylePack } from "./studio-shaper-style-pack";
import {
  bindVarco3dPartToShaperProfile,
  blendShaperWebtoonUniverseProfiles,
  clampShaperWebtoonCustomizerSliders,
  getShaperWebtoonUniverseProfile,
  SHAPER_WEBTOON_UNIVERSE_IDS,
  SHAPER_WEBTOON_UNIVERSE_PROFILES,
  toMannequinBodySliderValues,
} from "./studio-shaper-webtoon-customizer";

describe("studio-shaper-webtoon-customizer", () => {
  it("8대 웹툰 세계관 3D 셰이퍼 프로필과 내장 스타일 팩이 모두 유효성 검증을 통과한다", () => {
    expect(SHAPER_WEBTOON_UNIVERSE_PROFILES).toHaveLength(8);
    expect(SHAPER_WEBTOON_UNIVERSE_IDS).toHaveLength(8);

    for (const profile of SHAPER_WEBTOON_UNIVERSE_PROFILES) {
      const parsedPack = parseCharacterStylePack(profile.stylePack);
      expect(parsedPack.ok).toBe(true);
      const mannequin = toMannequinBodySliderValues(profile.sliders);
      expect(mannequin.heightCm).toBeGreaterThanOrEqual(110);
      expect(mannequin.headCount).toBeGreaterThanOrEqual(2.8);
    }
  });

  it("두 웹툰 세계관 프로필 간 25축 연속 보간(blend)과 VARCO 3D 파츠 슬롯 바인딩이 정확히 작동한다", () => {
    const blended = blendShaperWebtoonUniverseProfiles(
      "school-romance",
      "murim-swordsman",
      0.5,
    );

    expect(blended.dominantUniverseId).toBe("murim-swordsman");
    expect(blended.sliders.bodyProportion.headCount).toBeCloseTo((7.8 + 8.5) / 2, 3);
    expect(blended.sliders.faceMorph.eyeTilt).toBeCloseTo((0.1 + 0.55) / 2, 3);
    expect(blended.mannequinBodySliders.heightCm).toBeCloseTo((166 + 185) / 2, 3);
    expect(blended.varcoPartBindings.accessories?.varcoAssetId).toBe(
      "shaper-murim-jade-sword",
    );

    const baseProfile = getShaperWebtoonUniverseProfile("school-romance");
    const bound = bindVarco3dPartToShaperProfile(baseProfile, {
      slot: "accessories",
      varcoAssetId: "shaper-rofan-tiara",
      labelKo: "VARCO 황녀 루비 티아라",
      glbUri: ".cache/varco3d-worldbuild/shaper-rofan-tiara.glb",
      anchorBone: "head",
      scaleMultiplier: 1.15,
      tintColorHex: "#eab308",
    });
    expect(bound.varcoPartBindings.accessories?.varcoAssetId).toBe("shaper-rofan-tiara");
    expect(bound.varcoPartBindings.accessories?.scaleMultiplier).toBe(1.15);

    const clamped = clampShaperWebtoonCustomizerSliders({
      faceMorph: { jawSharpness: 99, eyeScale: -99 },
      bodyProportion: { headCount: 15, heightCm: 50 },
      celShader: { rampSteps: 4, outlineWidthMm: 99 },
    });
    expect(clamped.faceMorph.jawSharpness).toBe(1);
    expect(clamped.faceMorph.eyeScale).toBe(-1);
    expect(clamped.bodyProportion.headCount).toBe(9.2);
    expect(clamped.bodyProportion.heightCm).toBe(110);
    expect(clamped.celShader.outlineWidthMm).toBe(8);
  });
});
