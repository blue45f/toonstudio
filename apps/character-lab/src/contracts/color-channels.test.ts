import { describe, expect, it } from "vitest";

import { hexToOklab, oklabToHex } from "../shared/color";
import { mulberry32 } from "../shared/prng";

import {
  BASE_CHANNEL_KEYS,
  CHANNEL_FAMILY,
  CHANNEL_KEYS,
  CHANNEL_LABELS_KO,
  CHANNEL_RULES,
  DERIVED_CHANNEL_KEYS,
  REGION_CHANNEL_KEYS,
  channelColorOrigin,
  channelColorsSchema,
  channelParent,
  deriveChannelHex,
  isBaseChannelKey,
  isChannelKey,
  pickBaseChannelColors,
  resolveChannelColor,
  resolveChannelColors,
} from "./color-channels";
import { RECIPE_COLOR_KEYS } from "./mesh-data";
import { DEFAULT_RECIPE_COLORS } from "./recipe";

import type { ChannelColorInput, ChannelKey } from "./color-channels";

/** shared/color.ts로 같은 OKLab 시프트를 계산한 기준값(두 구현 대조용) */
function referenceDerive(parentHex: string, dL: number, chroma: number): string {
  const lab = hexToOklab(parentHex);
  if (!lab) throw new Error(parentHex);
  return oklabToHex([Math.min(1, Math.max(0, lab[0] + dL)), lab[1] * chroma, lab[2] * chroma]);
}

function randomHex(random: () => number): string {
  const byte = (): string => Math.floor(random() * 256).toString(16).padStart(2, "0");
  return `#${byte()}${byte()}${byte()}`;
}

describe("contracts/color-channels", () => {
  it("채널은 기본 8 + 상속 19 = 27개이고 기본 8은 레시피 v2 색 키와 같다", () => {
    expect(BASE_CHANNEL_KEYS).toHaveLength(8);
    expect(DERIVED_CHANNEL_KEYS).toHaveLength(19);
    expect(CHANNEL_KEYS).toHaveLength(27);
    expect(new Set(CHANNEL_KEYS).size).toBe(27);
    expect([...BASE_CHANNEL_KEYS]).toEqual([...RECIPE_COLOR_KEYS]);
    expect(CHANNEL_KEYS.at(-1)).toBe("hair-accessory-accent");
    for (const key of CHANNEL_KEYS) {
      expect(CHANNEL_LABELS_KO[key]).toMatch(/[가-힣]/u);
      expect(isChannelKey(key)).toBe(true);
    }
    expect(isChannelKey("cape")).toBe(false);
    expect(isChannelKey(3)).toBe(false);
    expect(isBaseChannelKey("top")).toBe(true);
    expect(isBaseChannelKey("top-trim")).toBe(false);
    expect([...REGION_CHANNEL_KEYS]).toEqual(["lip", "blush"]);
  });

  it("상속 표: 기본 채널은 base, 상속 채널은 부모 사슬이 순환 없이 기본·고정색에서 끝난다", () => {
    for (const key of BASE_CHANNEL_KEYS) expect(CHANNEL_RULES[key]).toEqual({ kind: "base" });
    for (const key of DERIVED_CHANNEL_KEYS) {
      const seen = new Set<ChannelKey>();
      let current: ChannelKey | null = key;
      while (current !== null) {
        expect(seen.has(current), `${key} 순환`).toBe(false);
        seen.add(current);
        current = channelParent(current);
      }
      expect(seen.size).toBeLessThanOrEqual(3);
    }
    expect(channelParent("hair-accessory-accent")).toBe("accessory-accent");
    expect(channelParent("accessory-accent")).toBe("accessory");
    expect(channelParent("inner-trim")).toBe("inner");
    expect(channelParent("sclera")).toBeNull();
    expect(channelParent("skin")).toBeNull();
  });

  it("설계 §2.3 수치: 입술·볼·끝·포인트·층·단·끈 규칙", () => {
    expect(CHANNEL_RULES.lip).toEqual({ kind: "derive", parent: "skin", dL: -0.08, chroma: 1.8 });
    expect(CHANNEL_RULES.blush).toEqual({ kind: "derive", parent: "skin", dL: -0.03, chroma: 1.4 });
    expect(CHANNEL_RULES["hair-tip"]).toEqual({ kind: "derive", parent: "hair", dL: 0.08, chroma: 1 });
    expect(CHANNEL_RULES["hair-accent"]).toEqual({ kind: "derive", parent: "hair", dL: -0.12, chroma: 1.2 });
    expect(CHANNEL_RULES.inner).toEqual({ kind: "derive", parent: "top", dL: 0.1, chroma: 1 });
    expect(CHANNEL_RULES.outer).toEqual({ kind: "derive", parent: "top", dL: -0.1, chroma: 1 });
    expect(CHANNEL_RULES.legwear).toEqual({ kind: "derive", parent: "bottom", dL: -0.2, chroma: 1 });
    expect(CHANNEL_RULES["shoes-lace"]).toEqual({ kind: "derive", parent: "shoes", dL: 0.25, chroma: 1 });
    for (const key of ["inner-trim", "top-trim", "outer-trim", "bottom-trim"] as const) expect(CHANNEL_RULES[key]).toMatchObject({ kind: "derive", dL: -0.15, chroma: 0.85 });
    for (const key of ["top-accent", "outer-accent", "accessory-accent", "hair-accessory"] as const) expect(CHANNEL_RULES[key]).toEqual({ kind: "derive", parent: "accessory", dL: 0, chroma: 1 });
    expect(CHANNEL_RULES.sclera).toEqual({ kind: "fixed", hex: "#f8f8fa" });
    expect(CHANNEL_RULES["shoes-sole"]).toEqual({ kind: "fixed", hex: "#f2f2f2" });
  });

  it("OKLab 시프트는 shared/color.ts와 문자열까지 같다(파일 안 사본 대조, 무작위 색 500개 + 경계 색)", () => {
    const random = mulberry32(20261023);
    const colors = ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#808080", "#f3d3bd", "#2b1d16"];
    for (let i = 0; i < 500; i += 1) colors.push(randomHex(random));
    const shifts: Array<[number, number]> = [
      [-0.08, 1.8],
      [-0.03, 1.4],
      [0.08, 1],
      [-0.12, 1.2],
      [0.1, 1],
      [-0.15, 0.85],
      [-0.2, 1],
      [0.25, 1],
      [-0.6, 2],
      [0.5, 0],
    ];
    for (const hex of colors) for (const [dL, chroma] of shifts) expect(deriveChannelHex(hex, dL, chroma)).toBe(referenceDerive(hex, dL, chroma));
  });

  it("항등 규칙(dL 0·chroma 1)은 변환 없이 부모 hex를 그대로 쓰고, 밝기는 0..1로 잘린다", () => {
    const random = mulberry32(7);
    for (let i = 0; i < 200; i += 1) {
      const hex = randomHex(random);
      expect(deriveChannelHex(hex, 0, 1)).toBe(hex);
    }
    expect(deriveChannelHex("#ffffff", 0.25, 1)).toBe("#ffffff");
    expect(deriveChannelHex("#000000", -0.5, 1)).toBe("#000000");
    // chroma 0은 무채색(같은 밝기의 회색)
    const gray = deriveChannelHex("#cc2244", 0, 0);
    expect(gray.slice(1, 3)).toBe(gray.slice(3, 5));
    expect(gray.slice(3, 5)).toBe(gray.slice(5, 7));
    expect(() => deriveChannelHex("#FFF", 0, 1)).toThrowError(/형식/u);
    expect(() => deriveChannelHex("red", 0.1, 1)).toThrowError(/형식/u);
  });

  it("해석: 지정값 우선, 없으면 상속(단계마다 hex로 양자화한 부모 기준), 고정색, 기본 채널은 그대로", () => {
    const colors: ChannelColorInput = { ...DEFAULT_RECIPE_COLORS };
    const all = resolveChannelColors(colors);
    expect(Object.keys(all)).toEqual([...CHANNEL_KEYS]);
    for (const key of BASE_CHANNEL_KEYS) expect(all[key]).toBe(colors[key]);
    expect(all.lip).toBe(referenceDerive(colors.skin, -0.08, 1.8));
    expect(all["inner-trim"]).toBe(referenceDerive(referenceDerive(colors.top, 0.1, 1), -0.15, 0.85));
    expect(all["top-accent"]).toBe(colors.accessory);
    expect(all["hair-accessory-accent"]).toBe(colors.accessory);
    expect(all.sclera).toBe("#f8f8fa");
    expect(all["shoes-sole"]).toBe("#f2f2f2");
    for (const key of CHANNEL_KEYS) expect(resolveChannelColor(colors, key)).toBe(all[key]);
    // 지정값이 상속을 이긴다. 지정한 부모는 자식 상속에도 쓰인다.
    const custom: ChannelColorInput = { ...colors, inner: "#102030", "accessory-accent": "#aa00aa", sclera: "#fffff0" };
    expect(resolveChannelColor(custom, "inner")).toBe("#102030");
    expect(resolveChannelColor(custom, "inner-trim")).toBe(referenceDerive("#102030", -0.15, 0.85));
    expect(resolveChannelColor(custom, "hair-accessory-accent")).toBe("#aa00aa");
    expect(resolveChannelColor(custom, "top-accent")).toBe(colors.accessory);
    expect(resolveChannelColor(custom, "sclera")).toBe("#fffff0");
  });

  it("해석은 결정적이고 입력을 바꾸지 않는다", () => {
    const colors: ChannelColorInput = Object.freeze({ ...DEFAULT_RECIPE_COLORS, top: "#cc2244" });
    expect(resolveChannelColors(colors)).toEqual(resolveChannelColors({ ...colors }));
    expect(Object.keys(colors)).toHaveLength(8);
  });

  it("출처: 직접 지정·<부모>에서 파생·고정색", () => {
    const colors: ChannelColorInput = { ...DEFAULT_RECIPE_COLORS, lip: "#aa3344" };
    expect(channelColorOrigin(colors, "top")).toEqual({ kind: "explicit" });
    expect(channelColorOrigin(colors, "lip")).toEqual({ kind: "explicit" });
    expect(channelColorOrigin(colors, "blush")).toEqual({ kind: "inherited", parent: "skin" });
    expect(channelColorOrigin(colors, "outer-trim")).toEqual({ kind: "inherited", parent: "outer" });
    expect(channelColorOrigin(colors, "shoes-sole")).toEqual({ kind: "fixed" });
  });

  it("잘못된 입력은 무음으로 넘기지 않고 throw한다(기본 키 누락·형식 오류·어휘 밖 키)", () => {
    const broken = { ...DEFAULT_RECIPE_COLORS, skin: undefined } as unknown as ChannelColorInput;
    expect(() => resolveChannelColor(broken, "skin")).toThrowError(/기본 색 채널 skin/u);
    expect(() => resolveChannelColor(broken, "lip")).toThrowError(/기본 색 채널 skin/u);
    expect(() => resolveChannelColor({ ...DEFAULT_RECIPE_COLORS, lip: "#XYZ" } as ChannelColorInput, "lip")).toThrowError(/lip/u);
    expect(() => resolveChannelColor(DEFAULT_RECIPE_COLORS, "cape" as ChannelKey)).toThrowError(/채널 키가 아닙니다/u);
    expect(() => pickBaseChannelColors(broken)).toThrowError(/skin/u);
  });

  it("기본 8키만 골라 낸다(플랜 colors = v2와 같은 키)", () => {
    const colors: ChannelColorInput = { ...DEFAULT_RECIPE_COLORS, lip: "#aa3344", "top-trim": "#000000" };
    expect(pickBaseChannelColors(colors)).toEqual(DEFAULT_RECIPE_COLORS);
  });

  it("계열 기본 키: 기본 채널은 자기 자신, 상속 채널은 v2에서 그 파츠가 받던 색 키, 공막만 없음", () => {
    for (const key of BASE_CHANNEL_KEYS) expect(CHANNEL_FAMILY[key]).toBe(key);
    expect(CHANNEL_FAMILY["top-accent"]).toBe("top");
    expect(CHANNEL_FAMILY.outer).toBe("top");
    expect(CHANNEL_FAMILY.legwear).toBe("bottom");
    expect(CHANNEL_FAMILY["shoes-sole"]).toBe("shoes");
    expect(CHANNEL_FAMILY["hair-accessory-accent"]).toBe("accessory");
    expect(CHANNEL_FAMILY.sclera).toBeNull();
    expect(Object.keys(CHANNEL_FAMILY).sort()).toEqual([...CHANNEL_KEYS].sort());
  });

  it("스키마: 기본 8키 필수·상속 채널 선택·strict·소문자 hex", () => {
    expect(channelColorsSchema.safeParse(DEFAULT_RECIPE_COLORS).success).toBe(true);
    expect(channelColorsSchema.safeParse({ ...DEFAULT_RECIPE_COLORS, "hair-tip": "#123456" }).success).toBe(true);
    expect(channelColorsSchema.safeParse({ ...DEFAULT_RECIPE_COLORS, cape: "#123456" }).success).toBe(false);
    expect(channelColorsSchema.safeParse({ ...DEFAULT_RECIPE_COLORS, lip: "#ABCDEF" }).success).toBe(false);
    const { iris: _iris, ...missing } = DEFAULT_RECIPE_COLORS;
    void _iris;
    expect(channelColorsSchema.safeParse(missing).success).toBe(false);
    expect(Object.keys(channelColorsSchema.shape).sort()).toEqual([...CHANNEL_KEYS].sort());
  });
});
