/**
 * 플래너의 레시피 v3 동작(2026-10-23 CORE-1).
 * 1) v2 항등: 변경 전(커밋 53c0fd0c9) v2 플래너가 만든 플랜 골든(`testing/recipe-v2-plan-golden.json`)과, 같은 v2 레시피 파일을 v3로 열어
 *    새 플래너로 만든 플랜의 v2 필드(색·morph·본·파츠 가시성·재질·물리·미지원·partial)가 같아야 한다.
 * 2) v3 선택 필드: 채널·형태·층·헤어 부속·표면·중립 표정·소품·비례·커스터마이즈 미지원 사유.
 */
import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  NO_CUSTOM_CAPABILITIES,
  PART_ROLES,
  createDefaultRecipe,
  createKitDefaultRecipe,
  createPresetCatalog,
  parseRecipe,
  resolveChannelColor,
  rolePartId,
} from "../contracts";
import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";
import golden from "../testing/recipe-v2-plan-golden.json";

import { createApplyPlanner, planApply } from "./apply-plan";

import type { ApplyPlannerOptions, PartLayoutEntry } from "./apply-plan";
import type { CharacterRecipe, CustomCapabilities, PresetEntry, PresetId, RecipePatch, SlotCapabilityMap } from "../contracts";

interface GoldenCatalogOverride {
  readonly id: string;
  readonly patch?: unknown;
  readonly requires?: readonly string[];
  readonly conflictsWith?: readonly string[];
}

const CATALOG = createPresetCatalog(
  vocabularyCatalogEntries().map((entry): PresetEntry => {
    const override = (golden.catalogOverrides as readonly GoldenCatalogOverride[]).find((candidate) => candidate.id === entry.id);
    if (!override) return entry;
    return presetEntryFixture(entry.id, {
      patch: (override.patch ?? {}) as RecipePatch,
      ...(override.requires ? { requires: override.requires } : {}),
      ...(override.conflictsWith ? { conflictsWith: override.conflictsWith as readonly PresetId[] } : {}),
    });
  }),
);

const V2_FIELDS = ["revision", "morphWeights", "boneRotations", "colors", "physics", "unsupported", "partial"] as const;

function v3RecipeFromV2File(json: unknown): CharacterRecipe {
  const parsed = parseRecipe(JSON.parse(JSON.stringify(json)));
  if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
  expect(parsed.migratedFrom).toBe(2);
  return parsed.recipe;
}

describe("state/apply-plan: v2 레시피를 v3로 올려도 플랜의 v2 필드는 v2 플래너 골든과 같다", () => {
  it("골든 케이스 7개를 모두 담고 있다", () => {
    expect(golden.cases.map((testCase) => testCase.name)).toEqual([
      "procedural-default",
      "kit-default",
      "kit-male-default",
      "all-slots",
      "all-slots-mixed-capabilities",
      "all-slots-features",
      "all-slots-variant-layout",
    ]);
  });

  for (const testCase of golden.cases) {
    it(`${testCase.name}: 색·morph·본·물리·미지원 사유·파츠 가시성/재질/색이 같다`, () => {
      const recipe = v3RecipeFromV2File(testCase.recipeV2);
      const plan = createApplyPlanner(testCase.planner as ApplyPlannerOptions)(recipe, testCase.capabilities as SlotCapabilityMap, CATALOG);
      const expected = testCase.plan as Record<string, unknown> & { parts: ReadonlyArray<{ partId: number }> };
      for (const field of V2_FIELDS) expect(JSON.parse(JSON.stringify(plan[field])), field).toEqual(expected[field]);
      // 파츠: 골든의 partId(기본 레이아웃 16·변형 레이아웃 6)는 값이 같고, v3 역할(17~20)만 더해진다.
      const byId = new Map(plan.parts.map((part) => [part.partId, part]));
      for (const part of expected.parts) expect(JSON.parse(JSON.stringify(byId.get(part.partId))), `partId ${part.partId}`).toEqual(part);
      const extra = plan.parts.filter((part) => !expected.parts.some((candidate) => candidate.partId === part.partId));
      if (testCase.planner && "partLayout" in testCase.planner) expect(extra).toEqual([]);
      else expect(extra.map((part) => part.partId)).toEqual([17, 18, 19, 20]);
      // 층 역할은 옷장이 비어 있으니 보이지 않는다(v2 소스에는 그 partId가 없다)
      for (const part of extra.filter((candidate) => candidate.partId <= 19)) expect(part.visible).toBe(false);
      // v3 선택 필드는 "없음"이다
      expect(plan.partMorphWeights).toEqual({});
      expect(plan.accessories).toEqual([]);
      expect(plan.surfaces).toEqual({});
      expect(plan.proportion).toBeNull();
      expect(plan.unsupportedCustom).toEqual([]);
      expect(plan.hairColor).toEqual({ gradient: [0.6, 1], tipMix: 0, accent: "none" });
      for (const [key, value] of Object.entries(plan.colors)) expect(plan.channels?.[key as keyof typeof plan.colors]).toBe(value);
    });
  }
});

function withRecipe(overrides: Partial<CharacterRecipe>, base: CharacterRecipe = createDefaultRecipe()): CharacterRecipe {
  return { ...base, ...overrides };
}

function partOf(plan: ReturnType<typeof planApply>, role: (typeof PART_ROLES)[number]) {
  return plan.parts.find((part) => part.partId === rolePartId(role));
}

function capabilities(overrides: Partial<SlotCapabilityMap>): SlotCapabilityMap {
  return { ...ALL_AVAILABLE_CAPABILITIES, ...overrides };
}

const FULL_CUSTOM: CustomCapabilities = {
  channels: ["top-trim", "outer", "lip"],
  shapes: { hair: ["length", "volume"], "acc-1": ["fit"] },
  layers: ["inner", "outer", "legwear"],
  anchors: ["face", "hair"],
  patternUv: true,
  hairFlow: true,
  proportion: "partial",
  reasonsKo: { "shape:hair": "이 헤어에는 그 형태 키가 없습니다." },
};

describe("state/apply-plan: 레시피 v3 필드", () => {
  it("파츠 색은 채널 유효색이다: 층 역할은 상속 채널 색, 기본 역할은 레시피 8키 그대로", () => {
    const recipe = withRecipe({ colors: { ...createDefaultRecipe().colors, top: "#cc2244", inner: "#101010" }, wardrobe: { inner: "top/shirt", outer: "top/blazer", legwear: null, accessories: [] } });
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(partOf(plan, "top")?.color).toBe("#cc2244");
    expect(partOf(plan, "inner")?.color).toBe("#101010");
    expect(partOf(plan, "outer")?.color).toBe(resolveChannelColor(recipe.colors, "outer"));
    expect(partOf(plan, "legwear")?.visible).toBe(false);
    expect(plan.channels?.outer).toBe(resolveChannelColor(recipe.colors, "outer"));
    expect(Object.keys(plan.channels ?? {})).toHaveLength(27);
    // plan.colors 는 v2 엔진이 읽는 기본 8키만이다(직접 지정한 inner 는 channels 로만 나간다)
    expect(plan.colors).toEqual({ ...createDefaultRecipe().colors, top: "#cc2244" });
    expect(Object.keys(plan.colors)).toHaveLength(8);
  });

  it("층 가시성은 옷장 층을 따르고, 변형 레이아웃은 층 프리셋 이름의 파츠만 보이며, 바탕 슬롯이 미지원이면 숨기고 사유를 낸다", () => {
    const recipe = withRecipe({ wardrobe: { inner: null, outer: "top/blazer", legwear: "bottom/jeans", accessories: [] } });
    const layout: PartLayoutEntry[] = [
      { partId: 1, role: "outer", variant: "blazer" },
      { partId: 2, role: "outer", variant: "hoodie" },
      { partId: 3, role: "legwear", variant: "jeans" },
      { partId: 4, role: "inner" },
    ];
    const plan = createApplyPlanner({ partLayout: layout })(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.parts.map((part) => [part.partId, part.visible])).toEqual([
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ]);
    expect(plan.parts[0]?.materialPreset).toBe("cloth-cotton");
    expect(plan.parts[2]?.materialPreset).toBe("cloth-denim");
    const blocked = createApplyPlanner({ partLayout: layout })(recipe, capabilities({ top: { status: "unavailable", reasonKo: "상의 미제공" } }), CATALOG);
    expect(blocked.parts[0]?.visible).toBe(false);
    expect(blocked.unsupportedCustom).toEqual([{ kind: "layer", key: "outer", reasonKo: "상의 미제공" }]);
  });

  it("헤어 부속(hair-accessory)은 액세서리 슬롯을 따른다", () => {
    expect(partOf(planApply(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES, CATALOG), "hair-accessory")?.visible).toBe(false);
    const withRibbon = withRecipe({ slots: { ...createDefaultRecipe().slots, accessory: "accessory/ribbon" } });
    const plan = planApply(withRibbon, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(partOf(plan, "hair-accessory")).toMatchObject({ visible: true, materialPreset: "cloth-silk" });
    expect(partOf(plan, "hair-accessory")?.color).toBe(resolveChannelColor(withRibbon.colors, "hair-accessory"));
  });

  it("표면 재질은 그 채널을 기본 채널로 쓰는 파츠의 재질을 바꾸고, 미지원 슬롯은 소스 기본 재질을 그대로 둔다", () => {
    const recipe = withRecipe({ slots: { ...createDefaultRecipe().slots, top: "top/tee" }, surfaces: { top: { material: "cloth-knit", pattern: null }, skin: { material: "plastic", pattern: null } } });
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(partOf(plan, "top")?.materialPreset).toBe("cloth-knit");
    expect(partOf(plan, "skin")?.materialPreset).toBe("plastic");
    expect(plan.surfaces).toEqual(recipe.surfaces);
    const unsupported = planApply(recipe, capabilities({ top: { status: "unavailable" } }), CATALOG);
    expect(partOf(unsupported, "top")?.materialPreset).toBe("cloth-cotton");
  });

  it("화풍 중립 표정은 표정 가중치에 더하고 1로 자르며, 표정 슬롯이 미지원이면 둘 다 빠진다", () => {
    const recipe = withRecipe({ expression: { browDown: 0.9, mouthSmile: 0.4 }, style: { ...createDefaultRecipe().style, neutralFacs: { browDown: 0.2, eyeSquint: 0.3 } } });
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.morphWeights).toMatchObject({ "facs:browDown": 1, "facs:mouthSmile": 0.4, "facs:eyeSquint": 0.3 });
    const blocked = planApply(recipe, capabilities({ expression: { status: "unavailable" } }), CATALOG);
    expect(Object.keys(blocked.morphWeights).filter((name) => name.startsWith("facs:"))).toEqual([]);
  });

  it("형태 가중치는 입고 있는 범위만 ± morph로 내고, 소스 능력이 있으면 선언된 이름만 남긴다", () => {
    const base = createDefaultRecipe();
    const recipe = withRecipe({
      slots: { ...base.slots, hair: "hair/soft-bob", top: null },
      wardrobe: { inner: null, outer: null, legwear: null, accessories: [{ id: "acc-1", presetId: "accessory/ribbon", anchor: "hair", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } }] },
      partParams: { hair: { length: 0.5, curl: -0.25 }, top: { length: 0.3 }, "acc-1": { fit: -0.4 } },
    });
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.partMorphWeights).toEqual({ hair: { "shape:curl:-": 0.25, "shape:length:+": 0.5 }, "acc-1": { "shape:fit:-": 0.4 } });
    const custom = createApplyPlanner({ custom: FULL_CUSTOM })(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(custom.partMorphWeights).toEqual({ hair: { "shape:length:+": 0.5 }, "acc-1": { "shape:fit:-": 0.4 } });
    expect(custom.unsupportedCustom).toContainEqual({ kind: "shape", key: "hair/curl", reasonKo: "이 헤어에는 그 형태 키가 없습니다." });
    const hairBlocked = planApply(recipe, capabilities({ hair: { status: "unavailable" } }), CATALOG);
    expect(hairBlocked.partMorphWeights?.hair).toBeUndefined();
  });

  it("추가 소품: 카탈로그·슬롯 능력·프리셋 미제공·앵커 능력으로 보임을 정하고 사유를 낸다", () => {
    const offset = { tMm: [0, 0, 0] as [number, number, number], rDeg: [0, 0, 0] as [number, number, number], scale: 1 };
    const recipe = withRecipe({
      wardrobe: {
        inner: null,
        outer: null,
        legwear: null,
        accessories: [
          { id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset },
          { id: "acc-2", presetId: "accessory/choker", anchor: "neck", offset },
          { id: "acc-3", presetId: "accessory/wings" as PresetId, anchor: "back", offset },
        ],
      },
    });
    const plan = createApplyPlanner({ custom: FULL_CUSTOM })(recipe, capabilities({ accessory: { status: "partial", unavailablePresets: { "accessory/glasses": "안경 미제작" } } }), CATALOG);
    expect(plan.accessories?.map((item) => [item.id, item.visible, item.materialPreset])).toEqual([
      ["acc-1", false, "metal"],
      ["acc-2", false, "leather"],
      ["acc-3", false, "plastic"],
    ]);
    expect(plan.unsupportedCustom).toEqual([
      { kind: "accessory", key: "acc-1", reasonKo: "안경 미제작" },
      { kind: "accessory", key: "acc-2", reasonKo: "이 소스는 목 앵커에 소품을 붙일 수 없습니다." },
      { kind: "accessory", key: "acc-3", reasonKo: "카탈로그에 없는 프리셋입니다: accessory/wings" },
    ]);
    const open = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(open.accessories?.map((item) => item.visible)).toEqual([true, true, false]);
    const slotOff = planApply(recipe, capabilities({ accessory: { status: "unavailable", reasonKo: "액세서리 없음" } }), CATALOG);
    expect(slotOff.unsupportedCustom?.map((item) => item.reasonKo)).toEqual(["액세서리 없음", "액세서리 없음", "액세서리 없음"]);
  });

  it("비례: 키트만 플랜으로 내고(절차는 지오메트리), 제작 패키지·능력 없는 키트는 사유를 낸다", () => {
    const proportion = { headsTall: 3, legRatio: 0.3, armRatio: 0.35, shoulderHeads: 1.4, headWidthRatio: 1, handScale: 1.2 };
    const style = { ...createDefaultRecipe().style, proportion };
    expect(planApply(withRecipe({ style }, createKitDefaultRecipe()), ALL_AVAILABLE_CAPABILITIES, CATALOG).proportion).toEqual(proportion);
    expect(planApply(withRecipe({ style }), ALL_AVAILABLE_CAPABILITIES, CATALOG).proportion).toBeNull();
    const pkg = planApply(withRecipe({ style, source: { kind: "package", characterId: "orion", sha256: "a".repeat(64) } }), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(pkg.proportion).toBeNull();
    expect(pkg.unsupportedCustom).toEqual([{ kind: "proportion", key: "proportion", reasonKo: "제작 패키지 소스는 비례 목표를 지원하지 않습니다." }]);
    const kitNoCaps = createApplyPlanner({ custom: NO_CUSTOM_CAPABILITIES })(withRecipe({ style }, createKitDefaultRecipe()), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(kitNoCaps.proportion).toBeNull();
    expect(kitNoCaps.unsupportedCustom).toEqual([{ kind: "proportion", key: "proportion", reasonKo: "이 소스는 비례 목표를 지원하지 않습니다." }]);
  });

  it("소스 능력이 있으면 따로 못 칠하는 직접 지정 채널·패턴·헤어 흐름·층을 알리고(기본 채널은 알리지 않음), 없으면 사유를 만들지 않는다", () => {
    const recipe = withRecipe({
      colors: { ...createDefaultRecipe().colors, top: "#cc2244", lip: "#aa3344", "shoes-lace": "#ffffff" },
      surfaces: {
        top: { material: "cloth-cotton", pattern: { kind: "dot", scaleCm: 1, angleDeg: 0, ratio: 0.3, inkChannel: "top-trim" } },
        bottom: { material: "cloth-denim", pattern: { kind: "check", scaleCm: 2, angleDeg: 45, ratio: 0.5, inkChannel: "bottom-trim" } },
      },
      hairColor: { gradient: [0.5, 1], tipMix: 0.4, accent: "none" },
      wardrobe: { inner: "top/tee", outer: null, legwear: null, accessories: [] },
    });
    expect(planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG).unsupportedCustom).toEqual([]);
    const none = createApplyPlanner({ custom: NO_CUSTOM_CAPABILITIES })(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(none.unsupportedCustom?.map((item) => `${item.kind}:${item.key}`)).toEqual(["layer:inner", "channel:lip", "channel:shoes-lace", "surface:top", "surface:bottom", "hair-color:hairColor"]);
    for (const item of none.unsupportedCustom ?? []) expect(item.reasonKo).toMatch(/[가-힣]/u);
    // 사유 순서는 계약 채널 순서다: 키 순서만 다른 같은 레시피(파일에서 다시 읽은 것처럼 정렬된 객체)도 같은 플랜을 낸다
    const reversed = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    const reordered = { ...recipe, colors: reversed(recipe.colors), surfaces: reversed(recipe.surfaces) };
    expect(createApplyPlanner({ custom: NO_CUSTOM_CAPABILITIES })(reordered, ALL_AVAILABLE_CAPABILITIES, CATALOG)).toEqual(none);
    const full = createApplyPlanner({ custom: FULL_CUSTOM })(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(full.unsupportedCustom?.map((item) => `${item.kind}:${item.key}`)).toEqual(["channel:shoes-lace"]);
    // 사유가 있어도 값을 다른 것으로 바꾸지 않는다(채널 유효색은 그대로 낸다)
    expect(none.channels?.lip).toBe("#aa3344");
  });
});
