import { describe, expect, it } from "vitest";

import { DEFAULT_ACCESSORY_OFFSET, createKitDefaultRecipe, isLabFailure } from "../../contracts";
import { kitManifestV2Json } from "../../testing/kit-v2-fixtures";

import { diagnoseKitCustomization } from "./kit-customization-diagnosis";
import { buildKitPlan } from "./kit-plan";
import { kitManifestFixture } from "./kit-test-fixture";
import { baseOf, finalizeKitV2, richKitV2Json } from "./kit-v2-test-fixture";

import type { AnyKitManifest } from "./kit-plan";
import type { Json } from "./kit-v2-test-fixture";
import type { AccessoryAnchor, AccessoryInstanceId, ChannelKey, CharacterRecipe, KitPlan, PresetId, Proportion, Surface } from "../../contracts";

const KIT_RECIPE = createKitDefaultRecipe();
const WORN_SLOTS = { ...KIT_RECIPE.slots, hair: "hair/soft-bob", top: "top/tee", bottom: "bottom/jeans", shoes: "shoes/sneakers" } as const;
const SD: Proportion = { headsTall: 3.2, legRatio: 0.3, armRatio: 0.35, shoulderHeads: 1.5, headWidthRatio: 0.9, handScale: 1 };
const STRIPE = (inkChannel: ChannelKey): Surface => ({
  material: "cloth-cotton",
  pattern: { kind: "stripe", scaleCm: 2, angleDeg: 0, ratio: 0.5, inkChannel },
});

function accessory(id: AccessoryInstanceId, presetId: PresetId, anchor: AccessoryAnchor): CharacterRecipe["wardrobe"]["accessories"][number] {
  return { id, presetId, anchor, offset: DEFAULT_ACCESSORY_OFFSET };
}

function recipeWith(patch: Partial<CharacterRecipe>): CharacterRecipe {
  return { ...KIT_RECIPE, slots: { ...WORN_SLOTS }, ...patch };
}

function richManifest(edit?: (json: Json) => void): AnyKitManifest {
  const json = richKitV2Json(kitManifestV2Json());
  edit?.(json);
  return finalizeKitV2(json).manifest;
}

function planFor(manifest: AnyKitManifest, recipe: CharacterRecipe): KitPlan {
  if (recipe.source.kind !== "kit") throw new Error("키트 소스 레시피여야 합니다.");
  const plan = buildKitPlan(manifest, recipe.source, recipe.slots, { wardrobe: recipe.wardrobe });
  if (isLabFailure(plan)) throw new Error(plan.reasonKo);
  return plan;
}

describe("authored/kit-customization-diagnosis — 키트 v2(올린 파일 기준)", () => {
  const manifest = richManifest();

  it("그릴 수 있는 커스터마이즈뿐이면 빈 배열이다(양방향 형태 값·UV1 있는 채널 무늬·흐름 UV1 헤어·비례 근사)", () => {
    const recipe = recipeWith({
      partParams: { hair: { length: -0.5, volume: 0.3, tail: -1 } },
      surfaces: { top: STRIPE("top-accent") },
      hairColor: { gradient: [0.5, 1], tipMix: 0.6, accent: "streak" },
      style: { ...KIT_RECIPE.style, proportion: SD },
      colors: { ...KIT_RECIPE.colors, "top-trim": "#223344" },
    });
    expect(diagnoseKitCustomization(planFor(manifest, recipe), recipe)).toEqual([]);
  });

  it("형태: 반쪽 키의 반대 방향 값, 없는 형태 이름을 범위 이름순으로 알리고 입지 않은 파츠의 값은 보관값이라 알리지 않는다", () => {
    const recipe = recipeWith({
      slots: { ...WORN_SLOTS, bottom: null },
      partParams: { top: { hem: 0.2 }, hair: { volume: -0.4, tail: 0.5, spiky: 0.1 }, bottom: { length: 0.3 } },
    });
    expect(diagnoseKitCustomization(planFor(manifest, recipe), recipe)).toEqual([
      { kind: "shape", key: "hair/volume", reasonKo: "헤어(hair/soft-bob)의 볼륨(volume)은(는) + 방향만 있어 -0.40을(를) 그릴 수 없습니다." },
      { kind: "shape", key: "hair/tail", reasonKo: "헤어(hair/soft-bob)의 묶은 머리 길이(tail)은(는) − 방향만 있어 +0.50을(를) 그릴 수 없습니다." },
      { kind: "shape", key: "hair/spiky", reasonKo: "지금 고른 헤어(hair/soft-bob)에는 형태 키 spiky이(가) 없습니다." },
      { kind: "shape", key: "top/hem", reasonKo: "지금 고른 상의(top/tee)에는 형태 키 hem이(가) 없습니다." },
    ]);
  });

  it("층·소품: 못 올린 층·소품은 계획의 사유, 계획보다 새 옷장은 '아직 올라가지 않음', 없는 앵커는 앵커 사유", () => {
    const noFootR = richManifest((json) => {
      delete (baseOf(json).anchors as Json)["foot-r"];
    });
    const planned = recipeWith({
      wardrobe: { inner: null, outer: "top/tee", legwear: "bottom/slacks", accessories: [accessory("acc-1", "accessory/glasses", "face"), accessory("acc-2", "accessory/ribbon", "hair")] },
    });
    const plan = planFor(noFootR, planned);
    // 레시피가 그 뒤 바뀌었다(지오메트리 키에 옷장이 아직 없어 계획은 그대로): 레그웨어 교체, 리본은 오른발로, cap 추가
    const now = recipeWith({
      wardrobe: {
        inner: null,
        outer: "top/tee",
        legwear: "bottom/shorts",
        accessories: [accessory("acc-1", "accessory/glasses", "face"), accessory("acc-2", "accessory/ribbon", "foot-r"), accessory("acc-3", "accessory/cap", "head-top")],
      },
      partParams: { legwear: { length: 0.4 } },
    });
    expect(diagnoseKitCustomization(plan, now)).toEqual([
      { kind: "layer", key: "outer", reasonKo: "top/tee은(는) 여성 베이스용 아우터 층 변형이 없습니다(아우터 층으로 입을 수 있는 상의: hoodie, blazer)." },
      { kind: "layer", key: "legwear", reasonKo: "레그웨어 층(bottom/shorts)이 아직 올라가지 않았습니다(옷장이 바뀐 뒤 키트 계획을 다시 만들어야 합니다)." },
      { kind: "accessory", key: "acc-1", reasonKo: "accessory/glasses은(는) 몸에 스킨된 소품이라 앵커에 따로 붙일 수 없습니다(액세서리 슬롯에만 입힐 수 있습니다)." },
      { kind: "accessory", key: "acc-2", reasonKo: "키트 여성 베이스에 오른발 앵커가 없습니다." },
      { kind: "accessory", key: "acc-3", reasonKo: "소품 acc-3(accessory/cap)이 아직 올라가지 않았습니다(옷장이 바뀐 뒤 키트 계획을 다시 만들어야 합니다)." },
    ]);
  });

  it("채널·무늬·헤어 색: 칠할 파츠가 없는 직접 지정 채널, UV1 없는 메시가 칠하는 채널의 무늬, 흐름 UV1 없는 헤어의 끝 색", () => {
    const recipe = recipeWith({
      slots: { ...WORN_SLOTS, hair: "hair/hime-cut" },
      colors: { ...KIT_RECIPE.colors, inner: "#aabbcc", "outer-trim": "#112233", "top-trim": "#334455" },
      surfaces: { "top-trim": STRIPE("top"), outer: STRIPE("outer-trim"), top: STRIPE("top-trim") },
      hairColor: { gradient: [0.6, 1], tipMix: 0.4, accent: "none" },
    });
    expect(diagnoseKitCustomization(planFor(manifest, recipe), recipe)).toEqual([
      { kind: "channel", key: "inner", reasonKo: "지금 고른 파츠에는 이너 채널 재질이 없습니다(이 채널이 있는 파츠: top/shirt(이너))." },
      { kind: "channel", key: "outer-trim", reasonKo: "키트의 여성 베이스 파츠에는 아우터 단 채널 재질이 없습니다." },
      { kind: "surface", key: "top-trim", reasonKo: "상의 단 채널을 칠하는 메시에 패턴용 UV1이 없는 파츠가 있어 무늬를 그릴 수 없습니다: 상의(top/tee)." },
      { kind: "hair-color", key: "hairColor", reasonKo: "지금 고른 헤어(hair/hime-cut)의 LOD0에는 흐름용 UV1이 없어 끝 색·포인트를 그릴 수 없습니다." },
    ]);
    // 헤어를 입지 않았으면 헤어 색 흐름은 보관값이라 알리지 않는다
    const bald = recipeWith({ slots: { ...WORN_SLOTS, hair: null }, hairColor: { gradient: [0.6, 1], tipMix: 0.4, accent: "none" } });
    expect(diagnoseKitCustomization(planFor(manifest, bald), bald)).toEqual([]);
  });
});

describe("authored/kit-customization-diagnosis — 키트 v1(커스터마이즈 미지원, 키트 v1 사유)", () => {
  const manifest = kitManifestFixture();

  it("입힌 층·소품, 입은 파츠의 형태 값, 직접 지정 상속 채널, 칠하는 채널의 무늬, 헤어 끝 색, 비례 목표를 모두 사유와 함께 알린다", () => {
    const recipe = recipeWith({
      wardrobe: { inner: "top/shirt", outer: null, legwear: null, accessories: [accessory("acc-1", "accessory/ribbon", "hair")] },
      partParams: { hair: { length: 0.5 }, legwear: { length: 0.2 } },
      colors: { ...KIT_RECIPE.colors, "hair-tip": "#ffeedd" },
      surfaces: { top: STRIPE("top-trim"), sclera: STRIPE("iris") },
      hairColor: { gradient: [0.6, 1], tipMix: 0.4, accent: "none" },
      style: { ...KIT_RECIPE.style, proportion: SD },
    });
    expect(diagnoseKitCustomization(planFor(manifest, recipe), recipe)).toEqual([
      { kind: "layer", key: "inner", reasonKo: "키트 v1 manifest에는 층 변형이 없어 이너 층을 입힐 수 없습니다." },
      { kind: "accessory", key: "acc-1", reasonKo: "키트 v1 manifest에는 앵커·강체 소품이 없어 머리카락 앵커에 소품을 붙일 수 없습니다." },
      { kind: "shape", key: "hair/length", reasonKo: "키트 v1 manifest에는 형태 키가 없어 헤어 파츠 형태를 바꿀 수 없습니다." },
      { kind: "channel", key: "hair-tip", reasonKo: "키트 v1 manifest는 재질 채널을 나누지 않아 헤어 끝 채널을 따로 칠할 수 없습니다." },
      { kind: "surface", key: "top", reasonKo: "키트 v1 manifest에는 패턴용 UV1 선언이 없어 무늬를 그릴 수 없습니다." },
      { kind: "hair-color", key: "hairColor", reasonKo: "키트 v1 헤어에는 흐름용 UV1 선언이 없어 끝 색·포인트를 그릴 수 없습니다." },
      { kind: "proportion", key: "proportion", reasonKo: "키트 v1 manifest에는 머리 높이(headHeightM)가 없어 비례 목표를 근사할 수 없습니다." },
    ]);
  });

  it("커스터마이즈가 없는 v2 레시피를 올린 레시피는 v1 키트에서도 빈 배열이다", () => {
    const recipe = recipeWith({});
    expect(diagnoseKitCustomization(planFor(manifest, recipe), recipe)).toEqual([]);
  });
});
