import { describe, expect, it } from "vitest";

import { ACCESSORY_ANCHORS, DERIVED_CHANNEL_KEYS, KIT_DEFAULT_ID, KIT_DEFAULT_SLOTS, NO_CUSTOM_CAPABILITIES, PART_SCOPES, WARDROBE_LAYERS, customReasonKey, isLabFailure } from "../../contracts";
import { kitManifestV2Json } from "../../testing/kit-v2-fixtures";
import { characterPackageManifestFixture } from "../../testing/manifest-fixtures";
import { minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { kitV1CustomCapabilities } from "./kit-custom-capability";
import { buildKitPlan } from "./kit-plan";
import { kitManifestFixture } from "./kit-test-fixture";
import { finalizeKitV2, richKitV2Json } from "./kit-v2-test-fixture";
import { packageCustomCapabilities } from "./package-capability";
import { buildPackagePlan } from "./package-plan";
import { proceduralCustomCapabilities, sourceCustomCapabilities } from "./source-custom-capability";

import type { CustomCapabilities, HumanoidModelData, KitPlan, MeshPartData } from "../../contracts";

const HANGUL = /[가-힣]/u;
const SOURCE = { kitId: KIT_DEFAULT_ID, kitVersion: 1, baseId: "female" } as const;

function expectedOrder(): string[] {
  return [
    ...DERIVED_CHANNEL_KEYS.map((key) => customReasonKey("channel", key)),
    ...PART_SCOPES.map((scope) => customReasonKey("shape", scope)),
    ...WARDROBE_LAYERS.map((layer) => customReasonKey("layer", layer)),
    ...ACCESSORY_ANCHORS.map((anchor) => customReasonKey("anchor", anchor)),
    "patternUv",
    "hairFlow",
    "proportion",
  ];
}

function expectKorean(capabilities: CustomCapabilities): void {
  for (const [key, reason] of Object.entries(capabilities.reasonsKo)) {
    expect(reason, key).toMatch(HANGUL);
    expect(reason, key).not.toMatch(/\b(?:fe)?male\b/u);
  }
}

function kitPlan(manifest: Parameters<typeof buildKitPlan>[0]): KitPlan {
  const plan = buildKitPlan(manifest, SOURCE, { ...KIT_DEFAULT_SLOTS, hair: "hair/soft-bob" });
  if (isLabFailure(plan)) throw new Error(plan.reasonKo);
  return plan;
}

describe("authored/package-capability — 제작 패키지 커스터마이즈 능력", () => {
  it("지원 항목이 없고(NO_CUSTOM) 제작 패키지 사유를 계약 순서로 단다 — 헤어 흐름 사유는 구운 헤어 스타일을 적는다", () => {
    const capabilities = packageCustomCapabilities(characterPackageManifestFixture({ hairStyle: "short-layered" }));
    expect({ ...capabilities, reasonsKo: {} }).toEqual({ ...NO_CUSTOM_CAPABILITIES, reasonsKo: {} });
    expect(Object.keys(capabilities.reasonsKo)).toEqual(expectedOrder());
    expect(capabilities.reasonsKo["channel:top-trim"]).toBe("제작 패키지는 재질 채널을 나누지 않아 상의 단 채널을 따로 칠할 수 없습니다.");
    expect(capabilities.reasonsKo["shape:legwear"]).toBe("제작 패키지에는 레그웨어 파츠 형태 키가 없습니다(셰이프 키는 얼굴·표정 파라미터에만 대응합니다).");
    expect(capabilities.reasonsKo["layer:inner"]).toBe("제작 패키지는 교체·겹쳐 입기 의상을 제공하지 않아 이너 층을 입힐 수 없습니다.");
    expect(capabilities.reasonsKo.hairFlow).toBe("제작 패키지 헤어('short-layered')에는 흐름용 UV1 선언이 없어 끝 색·포인트를 그릴 수 없습니다.");
    expect(capabilities.reasonsKo.proportion).toBe("제작 패키지 소스는 비례 목표를 지원하지 않습니다.");
    expect(packageCustomCapabilities(characterPackageManifestFixture({ hairStyle: null })).reasonsKo.hairFlow).toBe("제작 패키지에 제작 헤어 메시가 없어 헤어 색 흐름을 그릴 곳이 없습니다.");
    expectKorean(capabilities);
  });
});

describe("authored/source-custom-capability — 절차 소스(모델 데이터로 판정)", () => {
  /** 최소 모델에 레시피 v3 파츠(채널·형태 morph·층 역할)를 더한 모델 */
  function richModel(): HumanoidModelData {
    const model = minimalHumanoidModelFixture();
    const [skin, hair] = model.parts as [MeshPartData, MeshPartData];
    const shape = (name: string) => ({ name, deltaPositions: new Float32Array(hair.positions.length) });
    const parts: MeshPartData[] = [
      { ...skin, regionChannels: ["lip"], role: "head", colorKey: "skin" },
      { ...hair, morphs: [...hair.morphs, shape("shape:length:+"), shape("shape:length:-"), shape("shape:volume:+")] },
      { ...hair, id: "hair-tip", channel: "hair-tip", colorKey: "hair", morphs: [...hair.morphs, shape("shape:length:+")] },
      { ...skin, id: "outer", role: "outer", colorKey: "top", channel: "outer", morphs: [shape("shape:hem:-")] },
      { ...skin, id: "ribbon", role: "hair-accessory", colorKey: "accessory", channel: "hair-accessory" },
    ];
    return { ...model, parts };
  }

  it("채널·영역 채널·범위별 형태 키(헤어 부속은 액세서리 범위)·층 역할을 모델에서 읽고, UV1·앵커는 계약 메시에 자리가 없어 미지원이다", () => {
    const capabilities = proceduralCustomCapabilities(richModel());
    expect(capabilities.channels).toEqual(["skin", "hair", "lip", "hair-tip", "hair-accessory", "outer"]);
    expect(capabilities.shapes).toEqual({ hair: ["length", "volume"], outer: ["hem"] });
    expect(capabilities.layers).toEqual(["outer"]);
    expect(capabilities.anchors).toEqual([]);
    expect([capabilities.patternUv, capabilities.hairFlow, capabilities.proportion]).toEqual([false, false, "unavailable"]);
    expect(capabilities.reasonsKo["shape:hair"]).toBe("절차 헤어 파츠에는 이 형태 키가 없습니다(있는 형태 키: 길이(length), 볼륨(volume)).");
    expect(capabilities.reasonsKo["shape:accessory"]).toBe("절차 액세서리 파츠에는 형태 키가 없습니다.");
    expect(capabilities.reasonsKo["shape:top"]).toBe("절차 모델에 상의 파츠가 없어 형태 키를 줄 곳이 없습니다.");
    expect(capabilities.reasonsKo["channel:blush"]).toBe("절차 머리 메시에 볼 홍조 영역 채널이 없어 따로 칠할 수 없습니다.");
    expect(capabilities.reasonsKo["channel:inner"]).toBe("절차 모델에는 이너 채널을 칠하는 파츠가 없습니다.");
    expect(capabilities.reasonsKo["layer:inner"]).toBe("절차 모델에 이너 층 파츠가 없습니다.");
    expect(capabilities.reasonsKo.patternUv).toBe("절차 메시에는 패턴용 UV1이 없어 무늬를 그릴 수 없습니다.");
    expect(capabilities.reasonsKo.proportion).toBe("절차 소스는 아직 비례 목표(두신 등)로 몸을 다시 만들지 않습니다.");
    expectKorean(capabilities);
    // 사유 키는 계약 순서(채널 → 형태 → 층 → 앵커 → patternUv → hairFlow → proportion)
    const order = expectedOrder();
    const keys = Object.keys(capabilities.reasonsKo);
    expect(keys).toEqual(order.filter((key) => keys.includes(key)));
  });

  it("최소 모델(헤어·피부뿐)은 기본 채널만 칠하고, 비례는 조립하는 쪽이 지오메트리 반영을 밝힐 때만 available이다", () => {
    const minimal = proceduralCustomCapabilities(minimalHumanoidModelFixture());
    expect(minimal.channels).toEqual(["skin", "hair"]);
    expect(minimal.shapes).toEqual({});
    expect(minimal.layers).toEqual([]);
    expect(minimal.reasonsKo.hairFlow).toBe("절차 헤어 메시에는 흐름용 UV1이 없어 끝 색·포인트를 그릴 수 없습니다.");
    const available = proceduralCustomCapabilities(minimalHumanoidModelFixture(), { proceduralProportion: "available" });
    expect(available.proportion).toBe("available");
    expect(available.reasonsKo.proportion).toBeUndefined();
  });
});

describe("authored/source-custom-capability — 소스 종류별 디스패치", () => {
  it("키트 v2 계획은 계획이 판정한 값, 키트 v1은 키트 v1 사유, 제작 패키지·절차는 각자 판정을 돌려준다", () => {
    const v2Plan = kitPlan(finalizeKitV2(richKitV2Json(kitManifestV2Json())).manifest);
    expect(sourceCustomCapabilities({ kind: "kit", plan: v2Plan })).toBe((v2Plan as KitPlan & { custom: { capabilities: CustomCapabilities } }).custom.capabilities);
    expect(sourceCustomCapabilities({ kind: "kit", plan: kitPlan(kitManifestFixture()) })).toEqual(kitV1CustomCapabilities());

    const manifest = characterPackageManifestFixture();
    const packagePlan = buildPackagePlan(manifest, "/assets/characters/mina", { glbSha256: "0".repeat(64), glbBytes: 1024 });
    if (isLabFailure(packagePlan)) throw new Error(packagePlan.reasonKo);
    expect(sourceCustomCapabilities({ kind: "package", plan: packagePlan })).toEqual(packageCustomCapabilities(manifest));

    const model = minimalHumanoidModelFixture();
    expect(sourceCustomCapabilities({ kind: "procedural", model })).toEqual(proceduralCustomCapabilities(model));
    expect(sourceCustomCapabilities({ kind: "procedural", model }, { proceduralProportion: "available" }).proportion).toBe("available");
  });
});
