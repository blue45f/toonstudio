import { describe, expect, it } from "vitest";

import {
  ACCESSORY_ANCHORS,
  DERIVED_CHANNEL_KEYS,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  NO_CUSTOM_CAPABILITIES,
  PART_SCOPES,
  WARDROBE_LAYERS,
  customReasonKey,
  isLabFailure,
} from "../../contracts";
import { kitManifestV2Json } from "../../testing/kit-v2-fixtures";

import { deriveKitWardrobeCapabilities, kitV1CustomCapabilities } from "./kit-custom-capability";
import { buildKitPlan } from "./kit-plan";
import { isKitPlanV2 } from "./kit-plan-v2-types";
import { kitManifestFixture } from "./kit-test-fixture";
import { baseOf, finalizeKitV2, richKitV2Json, variantOf } from "./kit-v2-test-fixture";

import type { KitPlanSource, KitPlanWardrobe } from "./kit-plan";
import type { KitPlanV2 } from "./kit-plan-v2-types";
import type { Json } from "./kit-v2-test-fixture";
import type { CustomCapabilities, KitManifestV2 } from "../../contracts";

const FEMALE: KitPlanSource = { kitId: KIT_DEFAULT_ID, kitVersion: 1, baseId: "female" };
const MALE: KitPlanSource = { ...FEMALE, baseId: "male" };
const WORN = { ...KIT_DEFAULT_SLOTS, hair: "hair/soft-bob", top: "top/tee", bottom: "bottom/jeans", shoes: "shoes/sneakers" };
const NO_WARDROBE: KitPlanWardrobe = { inner: null, outer: null, legwear: null, accessories: [] };
const HANGUL = /[가-힣]/u;

function rich(edit?: (json: Json) => void): KitManifestV2 {
  const json = richKitV2Json(kitManifestV2Json());
  edit?.(json);
  return finalizeKitV2(json).manifest;
}

function planOf(manifest: KitManifestV2, source: KitPlanSource, slots: Record<string, string | null>, wardrobe: KitPlanWardrobe = NO_WARDROBE): KitPlanV2 {
  const result = buildKitPlan(manifest, source, slots, { wardrobe });
  if (isLabFailure(result) || !isKitPlanV2(result)) throw new Error(`v2 계획을 만들지 못했습니다: ${isLabFailure(result) ? result.reasonKo : "v1 계획"}`);
  return result;
}

/** 계약 순서로 기대하는 사유 키 순서(채널 → 형태 → 층 → 앵커 → patternUv → hairFlow → proportion) */
function topicRank(key: string): number {
  return ["channel", "shape", "layer", "anchor", "patternUv", "hairFlow", "proportion"].indexOf(key.split(":")[0] ?? "");
}

function expectContractOrder(capabilities: CustomCapabilities): void {
  const keys = Object.keys(capabilities.reasonsKo);
  const ranks = keys.map(topicRank);
  expect(ranks.every((rank) => rank >= 0)).toBe(true);
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
}

function expectKoreanReasons(capabilities: CustomCapabilities): void {
  for (const [key, reason] of Object.entries(capabilities.reasonsKo)) {
    expect(reason, key).toMatch(HANGUL);
    // 사용자에게 보이는 문구에 베이스 내부어(female·male)를 쓰지 않는다
    expect(reason, key).not.toMatch(/\b(?:fe)?male\b/u);
  }
}

describe("authored/kit-custom-capability — 키트 v1", () => {
  it("v1은 NO_CUSTOM_CAPABILITIES와 같은 지원 범위에 키트 v1 사유(채널 19·형태 8·층 3·앵커 14·UV1·헤어 흐름·비례)를 계약 순서로 단다", () => {
    const v1 = kitV1CustomCapabilities();
    expect({ ...v1, reasonsKo: {} }).toEqual({ ...NO_CUSTOM_CAPABILITIES, reasonsKo: {} });
    const expectedKeys = [
      ...DERIVED_CHANNEL_KEYS.map((key) => customReasonKey("channel", key)),
      ...PART_SCOPES.map((scope) => customReasonKey("shape", scope)),
      ...WARDROBE_LAYERS.map((layer) => customReasonKey("layer", layer)),
      ...ACCESSORY_ANCHORS.map((anchor) => customReasonKey("anchor", anchor)),
      "patternUv",
      "hairFlow",
      "proportion",
    ];
    expect(Object.keys(v1.reasonsKo)).toEqual(expectedKeys);
    expect(v1.reasonsKo["channel:lip"]).toBe("키트 v1 베이스에는 머리 영역 마스크가 없어 입술 채널을 따로 칠할 수 없습니다.");
    expect(v1.reasonsKo["channel:sclera"]).toBe("키트 v1 안구는 고정색이라 흰자위 채널을 칠할 수 없습니다.");
    expect(v1.reasonsKo["channel:top-trim"]).toBe("키트 v1 manifest는 재질 채널을 나누지 않아 상의 단 채널을 따로 칠할 수 없습니다.");
    expect(v1.reasonsKo["layer:outer"]).toBe("키트 v1 manifest에는 층 변형이 없어 아우터 층을 입힐 수 없습니다.");
    expect(v1.reasonsKo["anchor:ear-l"]).toBe("키트 v1 manifest에는 앵커·강체 소품이 없어 왼쪽 귀 앵커에 소품을 붙일 수 없습니다.");
    expect(v1.reasonsKo.proportion).toBe("키트 v1 manifest에는 머리 높이(headHeightM)가 없어 비례 목표를 근사할 수 없습니다.");
    expectKoreanReasons(v1);
  });

  it("v1 manifest의 층·추가 소품 프리셋 판정은 전부 unavailable(한글 사유)", () => {
    const wardrobe = deriveKitWardrobeCapabilities(kitManifestFixture(), "female");
    for (const layer of WARDROBE_LAYERS) expect(wardrobe.layers[layer].status).toBe("unavailable");
    expect(wardrobe.layers.legwear.reasonKo).toBe("키트 v1 manifest에는 층 변형이 없어 레그웨어 층을 입힐 수 없습니다.");
    expect(wardrobe.extraAccessories).toEqual({ status: "unavailable", reasonKo: "키트 v1 manifest에는 앵커·강체 소품이 없어 추가 소품을 붙일 수 없습니다." });
  });
});

describe("authored/kit-custom-capability — 키트 v2 계획 기준 능력", () => {
  const manifest = rich();

  it("채널: 올린 파일이 칠하는 채널(계약 순서) — 없는 상속 채널은 '지금 고른 파츠에 없음(있는 파츠 안내)'과 '키트에 없음'을 구분한다", () => {
    const plan = planOf(manifest, FEMALE, WORN, { ...NO_WARDROBE, outer: "top/blazer" });
    const capabilities = plan.custom.capabilities;
    expect(capabilities.channels).toEqual(["skin", "iris", "hair", "brow", "top", "bottom", "shoes", "lip", "blush", "sclera", "top-trim", "top-accent", "outer"]);
    // inner 채널은 shirt 이너 변형에만 있다 → 지금은 없지만 키트에 있다
    expect(capabilities.reasonsKo["channel:inner"]).toBe("지금 고른 파츠에는 이너 채널 재질이 없습니다(이 채널이 있는 파츠: top/shirt(이너)).");
    expect(capabilities.reasonsKo["channel:hair-accessory"]).toBe("지금 고른 파츠에는 헤어 액세서리 채널 재질이 없습니다(이 채널이 있는 파츠: accessory/ribbon, accessory/cap).");
    expect(capabilities.reasonsKo["channel:shoes-lace"]).toBe("키트의 여성 베이스 파츠에는 신발 끈 채널 재질이 없습니다.");
    expect(capabilities.reasonsKo["channel:top-trim"]).toBeUndefined();
    const male = planOf(manifest, MALE, KIT_DEFAULT_SLOTS).custom.capabilities;
    expect(male.reasonsKo["channel:lip"]).toBe("키트 남성 베이스에 머리 영역 마스크가 없어 입술 채널을 따로 칠할 수 없습니다.");
    const noBlush = rich((json) => {
      baseOf(json).headRegionMask = { file: { path: "bases/female-head-regions.png", bytes: 1000, sha256: "a".repeat(64) }, width: 256, height: 256, channels: { lip: "r" } };
    });
    expect(planOf(noBlush, FEMALE, WORN).custom.capabilities.reasonsKo["channel:blush"]).toBe("키트 여성 베이스의 머리 영역 마스크에 볼 홍조 채널이 없습니다.");
  });

  it("형태: 범위별 실제 형태 키, 범위 사유는 '있는 형태 키 안내·형태 키 없음·입지 않음·못 올림'을 구분한다", () => {
    const wardrobe: KitPlanWardrobe = { ...NO_WARDROBE, outer: "top/tee", accessories: [{ id: "acc-2", presetId: "accessory/cap" }, { id: "acc-1", presetId: "accessory/glasses" }] };
    const capabilities = planOf(manifest, FEMALE, WORN, wardrobe).custom.capabilities;
    expect(capabilities.shapes).toEqual({ hair: ["length", "volume", "bangs", "sideLength", "curl", "wave", "tail", "fit"], "acc-2": ["crown", "brim"] });
    expect(Object.keys(capabilities.reasonsKo).filter((key) => key.startsWith("shape:"))).toEqual([
      ...PART_SCOPES.map((scope) => `shape:${scope}`),
      "shape:acc-1",
      "shape:acc-2",
    ]);
    expect(capabilities.reasonsKo["shape:acc-2"]).toBe("지금 고른 소품 acc-2(accessory/cap)에는 이 형태 키가 없습니다(있는 형태 키: 크라운 높이(crown), 챙 길이(brim)).");
    expect(capabilities.reasonsKo["shape:top"]).toBe("지금 고른 상의(top/tee)에는 형태 키가 없습니다.");
    expect(capabilities.reasonsKo["shape:legwear"]).toBe("레그웨어 파츠를 입지 않아 형태 키를 줄 곳이 없습니다.");
    expect(capabilities.reasonsKo["shape:outer"]).toBe("아우터(top/tee) 파츠를 올리지 못해 형태 키를 줄 곳이 없습니다.");
    expect(capabilities.reasonsKo["shape:acc-1"]).toBe("소품 acc-1(accessory/glasses) 파츠를 올리지 못해 형태 키를 줄 곳이 없습니다.");
  });

  it("층: 입힌 층은 올렸을 때만, 입히지 않은 층은 키트가 그 베이스에 층 변형을 제공할 때만 지원한다(레이어 파츠가 없으면 그 층 미지원 사유)", () => {
    expect(planOf(manifest, FEMALE, WORN).custom.capabilities.layers).toEqual(["inner", "outer", "legwear"]);
    const male = planOf(manifest, MALE, KIT_DEFAULT_SLOTS).custom.capabilities;
    expect(male.layers).toEqual([]);
    expect(male.reasonsKo["layer:outer"]).toBe("이 키트의 남성 베이스에는 아우터 층으로 입을 수 있는 상의가 없습니다.");
    expect(male.reasonsKo["layer:legwear"]).toBe("이 키트의 남성 베이스에는 레그웨어 층으로 입을 수 있는 하의가 없습니다.");
    const noOuter = rich((json) => {
      for (const id of ["top/blazer", "top/hoodie"]) delete (json.parts as Json[]).find((part) => part.id === id)?.layerVariants;
    });
    const capabilities = planOf(noOuter, FEMALE, WORN).custom.capabilities;
    expect(capabilities.layers).toEqual(["inner", "legwear"]);
    expect(capabilities.reasonsKo["layer:outer"]).toBe("이 키트의 여성 베이스에는 아우터 층으로 입을 수 있는 상의가 없습니다.");
  });

  it("앵커: 강체 소품이 있으면 베이스 앵커 표(14곳 경계), 하나 빠지면 13곳 + 그 앵커 사유, 강체 소품이 없으면 전부 사유", () => {
    expect(planOf(manifest, FEMALE, WORN).custom.capabilities.anchors).toEqual([...ACCESSORY_ANCHORS]);
    const noFootR = rich((json) => {
      delete (baseOf(json).anchors as Json)["foot-r"];
    });
    const capabilities = planOf(noFootR, FEMALE, WORN).custom.capabilities;
    expect(capabilities.anchors).toEqual(ACCESSORY_ANCHORS.filter((anchor) => anchor !== "foot-r"));
    expect(capabilities.anchors).toHaveLength(13);
    expect(Object.keys(capabilities.reasonsKo).filter((key) => key.startsWith("anchor:"))).toEqual(["anchor:foot-r"]);
    expect(capabilities.reasonsKo["anchor:foot-r"]).toBe("키트 여성 베이스에 오른발 앵커가 없습니다.");
    const male = planOf(manifest, MALE, KIT_DEFAULT_SLOTS).custom.capabilities;
    expect(male.anchors).toEqual([]);
    expect(Object.keys(male.reasonsKo).filter((key) => key.startsWith("anchor:"))).toHaveLength(14);
    expect(male.reasonsKo["anchor:waist"]).toBe("이 키트의 남성 베이스에는 앵커에 붙일 수 있는 강체 소품이 없습니다.");
  });

  it("패턴 UV1: 입은 의상 본체(상·하의·층·신발) 모두에 있어야 true, 아니면 없는 파츠를 사유로, 의상이 없으면 그 사유. 채널별 판정은 patternChannels", () => {
    const partial = planOf(manifest, FEMALE, WORN).custom;
    expect(partial.capabilities.patternUv).toBe(false);
    expect(partial.capabilities.reasonsKo.patternUv).toBe("패턴용 UV1이 없는 의상이 있어 무늬를 그릴 수 없습니다: 상의(top/tee), 하의(bottom/jeans), 신발(shoes/sneakers).");
    // tee 본체·포인트 메시는 UV1이 있고 트림 메시는 없다 → top·top-accent만 무늬 가능
    expect(partial.patternChannels).toEqual(["top", "top-accent"]);
    const allUv = rich((json) => {
      for (const id of ["top/tee", "bottom/jeans", "shoes/sneakers"]) {
        const variant = variantOf(json, id);
        variant.meshes = (variant.meshes as Json[]).map((mesh) => ({ ...mesh, uv1: { purpose: "pattern", cmPerUnit: 40 } }));
      }
    });
    const full = planOf(allUv, FEMALE, WORN).custom;
    expect(full.capabilities.patternUv).toBe(true);
    expect(full.capabilities.reasonsKo.patternUv).toBeUndefined();
    expect(full.patternChannels).toEqual(["top", "bottom", "shoes", "top-trim", "top-accent"]);
    const naked = planOf(manifest, FEMALE, KIT_DEFAULT_SLOTS).custom.capabilities;
    expect(naked.patternUv).toBe(false);
    expect(naked.reasonsKo.patternUv).toBe("무늬를 그릴 의상(상의·하의·층·신발)을 입지 않았습니다.");
  });

  it("헤어 흐름: 고른 헤어의 그리는 메시 전부에 흐름 UV1이 있어야 true, 헤어가 없거나 UV1이 없으면 사유", () => {
    expect(planOf(manifest, FEMALE, WORN).custom.capabilities.hairFlow).toBe(true);
    const hime = planOf(manifest, FEMALE, { ...WORN, hair: "hair/hime-cut" }).custom.capabilities;
    expect(hime.hairFlow).toBe(false);
    expect(hime.reasonsKo.hairFlow).toBe("지금 고른 헤어(hair/hime-cut)의 LOD0에는 흐름용 UV1이 없어 끝 색·포인트를 그릴 수 없습니다.");
    const bald = planOf(manifest, FEMALE, KIT_DEFAULT_SLOTS).custom.capabilities;
    expect(bald.reasonsKo.hairFlow).toBe("헤어를 고르지 않아 헤어 색 흐름을 그릴 곳이 없습니다.");
  });

  it("비례: v2 베이스는 머리 높이가 있어 본 균일 배율 근사(partial)이고 사유에 베이스 두신을 적는다", () => {
    const capabilities = planOf(manifest, FEMALE, WORN).custom.capabilities;
    expect(capabilities.proportion).toBe("partial");
    expect(capabilities.reasonsKo.proportion).toBe("키트는 본 균일 배율로 비례 목표를 근사합니다(여성 베이스 두신 7.45).");
  });

  it("사유는 모두 한글이고 계약 순서(채널 → 형태 → 층 → 앵커 → patternUv → hairFlow → proportion)로 넣는다", () => {
    for (const capabilities of [
      planOf(manifest, FEMALE, WORN, { ...NO_WARDROBE, outer: "top/tee", accessories: [{ id: "acc-1", presetId: "accessory/ribbon" }] }).custom.capabilities,
      planOf(manifest, MALE, KIT_DEFAULT_SLOTS).custom.capabilities,
    ]) {
      expectContractOrder(capabilities);
      expectKoreanReasons(capabilities);
    }
  });
});

describe("authored/kit-custom-capability — 층·추가 소품 프리셋 판정(UI)", () => {
  const manifest = rich();

  it("층별: 층 변형 수로 available·partial·unavailable과 미제공 프리셋 사유(15슬롯 능력과 같은 모양)", () => {
    const female = deriveKitWardrobeCapabilities(manifest, "female");
    expect(female.layers.outer).toEqual({
      status: "partial",
      reasonKo: "제공 2/5종, 미제공: tee, shirt, sailor",
      unavailablePresets: {
        "top/tee": "top/tee은(는) 여성 베이스용 아우터 층 변형이 없습니다.",
        "top/shirt": "top/shirt은(는) 여성 베이스용 아우터 층 변형이 없습니다.",
        "top/sailor": "top/sailor은(는) 여성 베이스용 아우터 층 변형이 없습니다.",
      },
    });
    expect(female.layers.inner.status).toBe("partial");
    expect(female.layers.legwear.unavailablePresets?.["bottom/jeans"]).toBe("bottom/jeans은(는) 여성 베이스용 레그웨어 층 변형이 없습니다.");
    const male = deriveKitWardrobeCapabilities(manifest, "male");
    expect(male.layers.inner).toEqual({ status: "unavailable", reasonKo: "이 키트의 남성 베이스에는 이너 층으로 입을 수 있는 상의가 없습니다." });
  });

  it("추가 소품: 모든 메시가 강체인 액세서리만 앵커에 붙일 수 있고, 스킨 소품·미제공은 사유", () => {
    const female = deriveKitWardrobeCapabilities(manifest, "female").extraAccessories;
    expect(female.status).toBe("partial");
    expect(female.reasonKo).toBe("제공 3/6종, 미제공: glasses, choker, headphones");
    expect(female.unavailablePresets?.["accessory/glasses"]).toBe("accessory/glasses은(는) 몸에 스킨된 소품이라 앵커에 따로 붙일 수 없습니다(액세서리 슬롯에만 입힐 수 있습니다).");
    expect(deriveKitWardrobeCapabilities(manifest, "male").extraAccessories).toEqual({ status: "unavailable", reasonKo: "이 키트의 남성 베이스에는 앵커에 붙일 수 있는 강체 소품이 없습니다." });
    const noAnchors = rich((json) => {
      baseOf(json).anchors = {};
    });
    expect(deriveKitWardrobeCapabilities(noAnchors, "female").extraAccessories).toEqual({ status: "unavailable", reasonKo: "키트 여성 베이스에 앵커가 없어 추가 소품을 붙일 수 없습니다." });
  });

  it("베이스가 없으면 층·추가 소품 모두 그 사유로 unavailable", () => {
    const femaleOnly = rich((json) => {
      delete (json.bases as Json).male;
      for (const part of json.parts as Json[]) delete (part.variants as Json).male;
    });
    const missing = { status: "unavailable", reasonKo: "키트에 남성 베이스가 없습니다." };
    expect(deriveKitWardrobeCapabilities(femaleOnly, "male")).toEqual({ layers: { inner: missing, outer: missing, legwear: missing }, extraAccessories: missing });
  });
});
