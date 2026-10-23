import { describe, expect, it } from "vitest";

import {
  ART_STYLE_IDS,
  ART_STYLE_LABELS_KO,
  ART_STYLE_RESERVED_IDS,
  EYE_FAMILIES,
  LOOK_GROUPS,
  LOOK_V2_IDENTITY,
  PROPORTION_KEYS,
  PROPORTION_RANGES,
  artStylePackSchema,
  clampProportion,
  cloneLook,
  isArtStyleId,
  isLookV2Identity,
  lookSchema,
  mergeLook,
  proportionSchema,
} from "./art-style";

import type { ArtStylePack, Look } from "./art-style";

const WEBTOON_PROPORTION = { headsTall: 7.8, legRatio: 0.52, armRatio: 0.42, shoulderHeads: 1.6, headWidthRatio: 0.82, handScale: 1 };

function packFixture(overrides: Partial<ArtStylePack> = {}): ArtStylePack {
  return {
    id: "kr-webtoon-romance",
    revision: 1,
    labelKo: "웹툰 로맨스",
    labelEn: "Webtoon romance",
    proportion: { feminine: WEBTOON_PROPORTION, masculine: { ...WEBTOON_PROPORTION, headsTall: 9 } },
    face: { eyeFamily: "webtoon-almond", eyeWidthToFace: 0.22, eyeOpenRatio: 0.55, irisToEye: 0.5, eyeLine: 0.5, lash: "liner" },
    toon: { rampSteps: 2, rim: false, outline: "hull" },
    look: mergeLook(LOOK_V2_IDENTITY, { ramp: { softness: 0.2 }, shade: { skin: { kind: "oklab", dL: -0.22, dHueDeg: -20, chroma: 1.1 } } }),
    palette: { skin: ["#f3d3bd", "#e8bfa5"], hair: ["#2b1d16"], saturation: 0.9 },
    ...overrides,
  };
}

describe("contracts/art-style", () => {
  it("어휘: T1 8종·T2 예약 4종(겹치지 않음)·눈 계열 7종, 라벨은 장르명(한글)", () => {
    expect(ART_STYLE_IDS).toHaveLength(8);
    expect(ART_STYLE_RESERVED_IDS).toHaveLength(4);
    expect(ART_STYLE_IDS.filter((id) => (ART_STYLE_RESERVED_IDS as readonly string[]).includes(id))).toEqual([]);
    expect(EYE_FAMILIES).toHaveLength(7);
    for (const id of ART_STYLE_IDS) expect(ART_STYLE_LABELS_KO[id]).toMatch(/[가-힣A-Z]/u);
    expect(isArtStyleId("sd-chibi")).toBe(true);
    expect(isArtStyleId("watercolor-tale")).toBe(false);
  });

  it("LOOK_V2_IDENTITY는 스키마를 통과하고 깊이 동결돼 있으며 사본은 독립이다", () => {
    expect(lookSchema.safeParse(LOOK_V2_IDENTITY).success).toBe(true);
    expect(Object.isFrozen(LOOK_V2_IDENTITY)).toBe(true);
    expect(Object.isFrozen(LOOK_V2_IDENTITY.shade.skin)).toBe(true);
    expect(Object.isFrozen(LOOK_V2_IDENTITY.line.inner)).toBe(true);
    const copy = cloneLook(LOOK_V2_IDENTITY);
    expect(copy).toEqual(LOOK_V2_IDENTITY);
    expect(Object.isFrozen(copy)).toBe(false);
    copy.rim.strength = 0.5;
    expect(LOOK_V2_IDENTITY.rim.strength).toBe(1);
    expect(isLookV2Identity(LOOK_V2_IDENTITY)).toBe(true);
    expect(isLookV2Identity(cloneLook(LOOK_V2_IDENTITY))).toBe(true);
    expect(isLookV2Identity(copy)).toBe(false);
  });

  it("LOOK_V2_IDENTITY는 v2와 같은 그림을 내는 값이다: 그림자 multiply, 엔진 hull 4 mm, 톤·종이 none, 보정 항등", () => {
    expect(LOOK_V2_IDENTITY.shade.skin).toEqual({ kind: "multiply", rgb: [0.86, 0.6, 0.58] });
    expect(LOOK_V2_IDENTITY.line).toMatchObject({ method: "engine-hull", widthMm: 4, depthGain: 0, curvatureGain: 0, color: { mode: "fixed", rgb: [0.05, 0.04, 0.06] } });
    expect(LOOK_V2_IDENTITY.line.inner.enabled).toBe(false);
    expect(LOOK_V2_IDENTITY.tone.kind).toBe("none");
    expect(LOOK_V2_IDENTITY.paper.kind).toBe("none");
    expect(LOOK_V2_IDENTITY.grade).toEqual({ saturation: 1, lightness: 0, accentChannels: [] });
    expect(LOOK_V2_IDENTITY.ramp).toEqual({ softness: 0, secondShade: null });
    expect(LOOK_V2_IDENTITY.specular.strength).toBe(0);
  });

  it("mergeLook: 그룹별 부분 병합, line.inner는 한 단계 더, 유니온·튜플은 통째로, 입력 불변", () => {
    const base = cloneLook(LOOK_V2_IDENTITY);
    const merged = mergeLook(base, {
      rim: { strength: 0.4 },
      line: { widthMm: 6.5, color: { mode: "darken-albedo", dL: 0.3, chroma: 0.5 }, inner: { enabled: true } },
      tone: { kind: "halftone", bands: [0, 0.55, 0.85] },
    });
    expect(merged.rim).toEqual({ ...base.rim, strength: 0.4 });
    expect(merged.line.widthMm).toBe(6.5);
    expect(merged.line.color).toEqual({ mode: "darken-albedo", dL: 0.3, chroma: 0.5 });
    expect(merged.line.inner).toEqual({ ...base.line.inner, enabled: true });
    expect(merged.tone).toEqual({ ...base.tone, kind: "halftone", bands: [0, 0.55, 0.85] });
    expect(merged.shade).toEqual(base.shade);
    expect(base).toEqual(LOOK_V2_IDENTITY);
    expect(lookSchema.safeParse(merged).success).toBe(true);
    // 빈 patch는 값이 같은 새 객체
    const same = mergeLook(LOOK_V2_IDENTITY, {});
    expect(same).toEqual(LOOK_V2_IDENTITY);
    expect(same).not.toBe(LOOK_V2_IDENTITY);
    expect(LOOK_GROUPS).toHaveLength(Object.keys(LOOK_V2_IDENTITY).length);
  });

  it("look 스키마는 범위 밖·림 경계 역전·강조 채널 중복·모르는 키를 거부한다", () => {
    const base: Look = cloneLook(LOOK_V2_IDENTITY);
    expect(lookSchema.safeParse({ ...base, rim: { ...base.rim, edge0: 0.7, edge1: 0.6 } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, line: { ...base.line, widthMm: 21 } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, tone: { ...base.tone, cellPerHead: 7 } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, paper: { ...base.paper, seed: -1 } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, grade: { ...base.grade, accentChannels: ["top", "top"] } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, grade: { ...base.grade, accentChannels: ["Top"] } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, shade: { ...base.shade, skin: { kind: "oklab", dL: -0.7, dHueDeg: 0, chroma: 1 } } }).success).toBe(false);
    expect(lookSchema.safeParse({ ...base, glow: {} }).success).toBe(false);
  });

  it("비례: 범위 표 하나가 스키마·클램프를 정한다", () => {
    expect(PROPORTION_KEYS).toEqual(["headsTall", "legRatio", "armRatio", "shoulderHeads", "headWidthRatio", "handScale"]);
    expect(proportionSchema.safeParse(WEBTOON_PROPORTION).success).toBe(true);
    for (const key of PROPORTION_KEYS) {
      const range = PROPORTION_RANGES[key];
      expect(proportionSchema.safeParse({ ...WEBTOON_PROPORTION, [key]: range.max + 0.01 }).success).toBe(false);
      expect(proportionSchema.safeParse({ ...WEBTOON_PROPORTION, [key]: range.min - 0.01 }).success).toBe(false);
      expect(clampProportion(key, range.max + 1)).toBe(range.max);
      expect(clampProportion(key, range.min - 1)).toBe(range.min);
      expect(clampProportion(key, Number.NaN)).toBe((range.min + range.max) / 2);
    }
    expect(PROPORTION_RANGES.headsTall).toEqual({ min: 2.5, max: 10 });
  });

  it("화풍 팩 스키마: 정상 팩 통과, 예약 id·revision 0·빈 피부 팔레트·대문자 hex 거부", () => {
    expect(artStylePackSchema.safeParse(packFixture()).success).toBe(true);
    expect(artStylePackSchema.safeParse(packFixture({ id: "watercolor-tale" as never })).success).toBe(false);
    expect(artStylePackSchema.safeParse(packFixture({ revision: 0 })).success).toBe(false);
    expect(artStylePackSchema.safeParse(packFixture({ palette: { skin: [], hair: [], saturation: 1 } })).success).toBe(false);
    expect(artStylePackSchema.safeParse(packFixture({ palette: { skin: ["#F3D3BD"], hair: [], saturation: 1 } })).success).toBe(false);
    expect(artStylePackSchema.safeParse(packFixture({ face: { ...packFixture().face, eyeFamily: "manga" as never } })).success).toBe(false);
  });
});
