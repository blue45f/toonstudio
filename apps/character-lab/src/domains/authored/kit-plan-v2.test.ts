import { describe, expect, it } from "vitest";

import {
  CHANNEL_KEYS,
  KIT_ASSET_ROOT,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_MORPH_NAMES,
  KIT_V2_BUDGET,
  MAX_EXTRA_ACCESSORIES,
  isLabFailure,
  isMorphTargetName,
  parseKitManifestV2,
} from "../../contracts";
import { kitManifestV2Json } from "../../testing/kit-v2-fixtures";

import { deriveKitCapabilities } from "./kit-capability";
import { buildKitPlan, buildKitPlanDetailed } from "./kit-plan";
import { isKitPlanV2 } from "./kit-plan-v2-types";
import { baseOf, finalizeKitV2, materialsOf, richKitV2Json, variantOf } from "./kit-v2-test-fixture";

import type { KitPlanSource, KitPlanWardrobe } from "./kit-plan";
import type { KitPlanV2 } from "./kit-plan-v2-types";
import type { Json } from "./kit-v2-test-fixture";
import type { KitManifestV2, KitPlan, LabFailure } from "../../contracts";

const FEMALE: KitPlanSource = { kitId: KIT_DEFAULT_ID, kitVersion: 1, baseId: "female" };
const MALE: KitPlanSource = { ...FEMALE, baseId: "male" };
const WORN = { ...KIT_DEFAULT_SLOTS, hair: "hair/soft-bob", top: "top/tee", bottom: "bottom/jeans", shoes: "shoes/sneakers", accessory: "accessory/glasses" };
const NO_WARDROBE: KitPlanWardrobe = { inner: null, outer: null, legwear: null, accessories: [] };

function rich(edit?: (json: Json) => void): KitManifestV2 {
  const json = richKitV2Json(kitManifestV2Json());
  edit?.(json);
  return finalizeKitV2(json).manifest;
}

function expectV2(result: KitPlan | LabFailure): KitPlanV2 {
  if (isLabFailure(result)) throw new Error(`계획이 실패했습니다: ${result.code} ${result.reasonKo}`);
  if (!isKitPlanV2(result)) throw new Error("v2 계획이 아닙니다.");
  return result;
}

function expectFailure(result: KitPlan | LabFailure): LabFailure {
  if (!isLabFailure(result)) throw new Error("실패를 기대했지만 계획이 만들어졌습니다.");
  return result;
}

describe("authored/kit-plan-v2 — 계약 필드(채널을 모르는 엔진용)", () => {
  const manifest = rich();
  const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN));

  it("계약 parts는 베이스 + 슬롯 파츠이고 custom.files 앞부분과 순서·id·파일이 같다", () => {
    expect(plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "accessory/glasses", "irises/round-large"]);
    const head = plan.custom.files.slice(0, plan.parts.length);
    expect(head.map((file) => [file.id, file.url, file.sha256, file.bytes, file.hides])).toEqual(plan.parts.map((part) => [part.id, part.url, part.sha256, part.bytes, part.hides]));
    expect(head.map((file) => file.kind)).toEqual(["base", "part", "part", "part", "part", "part", "part"]);
    expect(plan.parts[0]?.url).toBe(`${KIT_ASSET_ROOT}/bases/female.glb`);
  });

  it("계약 메시는 v1 투영이다: UV1 메타가 없고 morph는 v1 어휘(param·facs)만, 강체 표시는 스킨 선언만 옮긴다", () => {
    const hair = plan.parts[1];
    expect(hair?.meshes.every((mesh) => !("uv1" in mesh))).toBe(true);
    expect(hair?.meshes.every((mesh) => mesh.morphs.every((name) => isMorphTargetName(name)))).toBe(true);
    // 원본 v2 메시에는 형태 morph와 UV1이 그대로 있다
    const original = plan.custom.files[1];
    expect(original?.meshes[0]?.morphs).toContain("shape:length:-");
    expect(original?.meshes[0]?.uv1).toEqual({ purpose: "hair-flow" });
  });

  it("계약 재질은 채널의 계열 기본 키로 칠하고(상의 단·포인트 → top), 공막처럼 계열 키가 없는 채널은 고정색이다", () => {
    expect(plan.materials.ts_top_tee_trim).toEqual({ role: "top", tint: { mode: "recolor", colorKey: "top" }, doubleSided: false });
    expect(plan.materials.ts_top_tee_accent).toEqual({ role: "top", tint: { mode: "recolor", colorKey: "top" }, doubleSided: false });
    expect(plan.materials.ts_eye).toEqual({ role: "eyeball", tint: { mode: "fixed", hex: "#f8f8fa" }, doubleSided: false });
    expect(plan.materials.ts_underwear?.tint.mode).toBe("fixed");
    // custom.materials는 원본 v2 재질(채널 그대로)
    expect(plan.custom.materials.ts_top_tee_trim).toEqual({ role: "top", channel: "top-trim", tint: { mode: "recolor" }, doubleSided: false });
    expect(plan.custom.materials.ts_eye).toMatchObject({ role: "eyeball", channel: "sclera" });
  });

  it("morph 어휘·능력 맵·헤어 LOD·라이선스·스켈레톤은 v1과 같은 규칙이다", () => {
    expect(plan.morphNames).toEqual([...KIT_MORPH_NAMES]);
    expect(plan.capabilities).toEqual(deriveKitCapabilities(manifest, "female"));
    expect(plan.hairLodPolicy).toEqual({ preferredLod: 0 });
    expect(plan.skeleton).toBe(manifest.skeleton);
    expect(plan.jointOffsets).toBe(manifest.jointOffsets);
    expect(plan.bodyRegions).toBe(manifest.bases.female?.bodyRegions);
    expect(plan.licenseNote).toContain("(라이선스: CC0-1.0, original)");
  });

  it("같은 입력은 같은 계획이고, buildKitPlan은 v2 계획을 그대로 돌려준다", () => {
    const wardrobe: KitPlanWardrobe = { inner: "top/shirt", outer: "top/blazer", legwear: "bottom/slacks", accessories: [{ id: "acc-1", presetId: "accessory/ribbon" }] };
    expect(buildKitPlan(manifest, FEMALE, WORN, { wardrobe })).toEqual(buildKitPlan(manifest, FEMALE, WORN, { wardrobe }));
    expect(isKitPlanV2(expectV2(buildKitPlan(manifest, FEMALE, WORN)))).toBe(true);
  });
});

describe("authored/kit-plan-v2 — 층·추가 소품·형태 키·채널", () => {
  const manifest = rich();

  it("층 3개(inner·outer·legwear)를 입으면 층 순서로 파일을 더하고 층 역할·층 채널·숨김 영역을 싣는다", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN, { wardrobe: { ...NO_WARDROBE, legwear: "bottom/slacks", outer: "top/blazer", inner: "top/shirt" } }));
    const layers = plan.custom.files.filter((file) => file.kind === "layer");
    expect(layers.map((file) => [file.id, file.scope, file.slot, file.layer])).toEqual([
      ["inner:top/shirt", "inner", "top", "inner"],
      ["outer:top/blazer", "outer", "top", "outer"],
      ["legwear:bottom/slacks", "legwear", "bottom", "legwear"],
    ]);
    expect(layers.map((file) => file.channels)).toEqual([["inner"], ["outer"], ["legwear"]]);
    expect(layers.map((file) => file.meshes[0]?.role)).toEqual(["inner", "outer", "legwear"]);
    expect(layers[1]?.hides).toEqual(["torso", "upperArm.L", "upperArm.R"]);
    expect(layers[0]?.url).toBe(`${KIT_ASSET_ROOT}/parts/female/inner/shirt.glb`);
    expect(plan.custom.capabilities.layers).toEqual(["inner", "outer", "legwear"]);
    expect(plan.custom.skipped).toEqual([]);
    // 층 파일은 계약 parts(채널을 모르는 엔진용)에 들어가지 않는다
    expect(plan.parts.some((part) => part.id.includes(":"))).toBe(false);
  });

  it("층 변형이 없는 프리셋은 계획을 실패시키지 않고 사유(입을 수 있는 후보 포함)를 남긴다 — 다른 프리셋으로 바꾸지 않는다", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN, { wardrobe: { ...NO_WARDROBE, outer: "top/tee" } }));
    expect(plan.custom.files.some((file) => file.kind === "layer")).toBe(false);
    expect(plan.custom.skipped).toEqual([
      { kind: "layer", key: "outer", presetId: "top/tee", reasonKo: "top/tee은(는) 여성 베이스용 아우터 층 변형이 없습니다(아우터 층으로 입을 수 있는 상의: hoodie, blazer)." },
    ]);
    expect(plan.custom.capabilities.layers).toEqual(["inner", "legwear"]);
    expect(plan.custom.capabilities.reasonsKo["layer:outer"]).toBe(plan.custom.skipped[0]?.reasonKo);
    // 층에 맞지 않는 슬롯 프리셋·키트에 없는 파츠도 사유만 남긴다(입력 방어)
    const odd = expectV2(buildKitPlan(manifest, FEMALE, WORN, { wardrobe: { ...NO_WARDROBE, inner: "bottom/jeans", legwear: "bottom/mystery" } }));
    expect(odd.custom.skipped.map((skip) => skip.reasonKo)).toEqual(["이너 층에는 상의 프리셋만 입힐 수 있습니다: bottom/jeans", "키트에 bottom/mystery 파츠가 없습니다."]);
  });

  it("같은 헤어 부속을 여러 앵커에 붙이면 인스턴스마다 파일 항목이 생기고(같은 url), 강체 메시·기본 앵커·범위를 싣는다", () => {
    const wardrobe: KitPlanWardrobe = {
      ...NO_WARDROBE,
      accessories: [
        { id: "acc-2", presetId: "accessory/ribbon" },
        { id: "acc-1", presetId: "accessory/ribbon" },
        { id: "acc-3", presetId: "accessory/cap" },
      ],
    };
    const plan = expectV2(buildKitPlan(manifest, FEMALE, { ...WORN, accessory: "accessory/ribbon" }, { wardrobe }));
    const accessories = plan.custom.files.filter((file) => file.kind === "accessory");
    expect(accessories.map((file) => [file.id, file.scope, file.instanceId, file.defaultAnchor])).toEqual([
      ["acc-2:accessory/ribbon", "acc-2", "acc-2", "hair"],
      ["acc-1:accessory/ribbon", "acc-1", "acc-1", "hair"],
      ["acc-3:accessory/cap", "acc-3", "acc-3", "head-top"],
    ]);
    expect(accessories[0]?.url).toBe(accessories[1]?.url);
    expect(accessories.every((file) => file.rigidMeshes.length === file.meshes.length)).toBe(true);
    expect(accessories.map((file) => file.channels)).toEqual([["hair-accessory"], ["hair-accessory"], ["hair-accessory"]]);
    // 슬롯 액세서리도 강체면 기본 앵커를 싣는다(범위 accessory)
    const slotAccessory = plan.custom.files.find((file) => file.kind === "part" && file.slot === "accessory");
    expect([slotAccessory?.scope, slotAccessory?.defaultAnchor]).toEqual(["accessory", "hair"]);
  });

  it("추가 소품: 스킨 소품·변형 없는 베이스·중복 id·11개 초과는 사유만 남긴다", () => {
    const tooMany = Array.from({ length: MAX_EXTRA_ACCESSORIES + 1 }, (_, index) => ({ id: `acc-${index + 1}` as const, presetId: "accessory/ribbon" as const }));
    const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN, { wardrobe: { ...NO_WARDROBE, accessories: tooMany } }));
    expect(plan.custom.files.filter((file) => file.kind === "accessory")).toHaveLength(MAX_EXTRA_ACCESSORIES);
    expect(plan.custom.skipped).toEqual([{ kind: "accessory", key: "acc-12", presetId: "accessory/ribbon", reasonKo: "추가 소품은 최대 11개입니다(액세서리 슬롯 1개를 더해 12개)." }]);

    const odd = expectV2(
      buildKitPlan(manifest, FEMALE, WORN, {
        wardrobe: {
          ...NO_WARDROBE,
          accessories: [
            { id: "acc-1", presetId: "accessory/glasses" },
            { id: "acc-2", presetId: "accessory/ribbon" },
            { id: "acc-2", presetId: "accessory/cap" },
            { id: "acc-3", presetId: "top/tee" },
          ],
        },
      }),
    );
    expect(odd.custom.skipped.map((skip) => [skip.key, skip.reasonKo])).toEqual([
      ["acc-1", "accessory/glasses은(는) 몸에 스킨된 소품이라 앵커에 따로 붙일 수 없습니다(액세서리 슬롯에만 입힐 수 있습니다)."],
      ["acc-2", "소품 인스턴스 id가 중복되었습니다: acc-2"],
      ["acc-3", "추가 소품에는 액세서리 프리셋만 쓸 수 있습니다: top/tee"],
    ]);
    const male = expectV2(buildKitPlan(manifest, MALE, KIT_DEFAULT_SLOTS, { wardrobe: { ...NO_WARDROBE, accessories: [{ id: "acc-1", presetId: "accessory/ribbon" }] } }));
    expect(male.custom.skipped[0]?.reasonKo).toBe("accessory/ribbon은(는) 남성 베이스용 변형이 없습니다: 남성 핏 미제작");
  });

  it("형태 키 8개(계약 상한)와 값 범위: −만·+만 있는 키는 반쪽 범위이고, 형태 morph가 없는 LOD를 고르면 형태 키가 없다", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN));
    const hair = plan.custom.files.find((file) => file.scope === "hair");
    expect(hair?.shapes).toEqual([
      { name: "length", labelKo: "길이", min: -1, max: 1 },
      { name: "volume", labelKo: "볼륨", min: 0, max: 1 },
      { name: "bangs", labelKo: "앞머리", min: -1, max: 1 },
      { name: "sideLength", labelKo: "옆머리 길이", min: -1, max: 1 },
      { name: "curl", labelKo: "컬", min: -1, max: 1 },
      { name: "wave", labelKo: "웨이브", min: -1, max: 1 },
      { name: "tail", labelKo: "묶은 머리 길이", min: -1, max: 0 },
      { name: "fit", labelKo: "여유", min: -1, max: 1 },
    ]);
    expect(plan.custom.capabilities.shapes.hair).toHaveLength(KIT_V2_BUDGET.maxShapesPerVariant);
    // 범위별 라벨·범위판(custom.shapes)은 능력과 같은 키이고 파일 형태 키 그대로다
    expect(plan.custom.shapes).toEqual({ hair: hair?.shapes });
    const lod1 = expectV2(buildKitPlan(manifest, FEMALE, WORN, { preferredHairLod: 1 }));
    expect(lod1.custom.files.find((file) => file.scope === "hair")?.shapes).toHaveLength(8);
    const lod2 = expectV2(buildKitPlan(manifest, FEMALE, WORN, { preferredHairLod: 2 }));
    expect(lod2.custom.files.find((file) => file.scope === "hair")?.shapes).toEqual([]);
    expect(lod2.custom.capabilities.shapes.hair).toBeUndefined();
    expect(lod2.custom.shapes).toEqual({});
    expect(lod2.custom.capabilities.reasonsKo["shape:hair"]).toBe("지금 고른 헤어(hair/soft-bob)의 LOD2에는 형태 키가 없습니다.");
    // 그리는 삼각형도 고른 LOD만 센다(core fixture 헤어 LOD 1000/700/400)
    expect([plan, lod1, lod2].map((candidate) => candidate.custom.files.find((file) => file.scope === "hair")?.activeTriangles)).toEqual([1000, 700, 400]);
  });

  it("채널: 파일마다 재질 채널(계약 순서), 여성 베이스는 머리 영역 마스크의 입술·볼 홍조를 더하고 남성은 없다", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, WORN));
    expect(plan.custom.files.find((file) => file.id === "top/tee")?.channels).toEqual(["top", "top-trim", "top-accent"]);
    expect(plan.custom.files[0]?.channels).toEqual(["skin", "brow", "lip", "blush", "sclera"]);
    expect(plan.custom.base.headRegionMask).toMatchObject({ url: `${KIT_ASSET_ROOT}/bases/female-head-regions.png`, width: 256, height: 256, channels: { lip: "r", blush: "g" } });
    const male = expectV2(buildKitPlan(manifest, MALE, KIT_DEFAULT_SLOTS));
    expect(male.custom.files[0]?.channels).toEqual(["skin", "brow", "sclera"]);
    expect(male.custom.base.headRegionMask).toBeNull();
    const channels = plan.custom.capabilities.channels;
    expect(channels).toEqual(CHANNEL_KEYS.filter((key) => channels.includes(key)));
  });

  it("베이스: 머리 높이·두신·앵커 표를 싣는다", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS));
    expect(plan.custom.base.heightM).toBe(1.64);
    expect(plan.custom.base.headHeightM).toBe(0.22);
    expect(plan.custom.base.headsTall).toBeCloseTo(1.64 / 0.22, 12);
    expect(Object.keys(plan.custom.base.anchors)).toHaveLength(14);
    expect(plan.custom.base.anchors.hair).toEqual({ joint: "mixamorig:Head", offsetM: [0, 0.02, 0] });
  });
});

describe("authored/kit-plan-v2 — 예산(그리는 삼각형 합 ≤ activeWorst)", () => {
  const BUDGET = KIT_V2_BUDGET.triangles.activeWorst;
  /** 베이스 + 상의(tee 본체 메시 삼각형 조정) = target이 되게 만든다 */
  function withRequiredTotal(target: number): KitManifestV2 {
    return rich((json) => {
      const baseTriangles = (baseOf(json).meshes as Json[]).reduce((sum, mesh) => sum + (mesh.triangles as number), 0);
      const tee = variantOf(json, "top/tee");
      const meshes = tee.meshes as Json[];
      const others = meshes.slice(1).reduce((sum, mesh) => sum + (mesh.triangles as number), 0);
      (meshes[0] as Json).triangles = target - baseTriangles - others;
    });
  }
  const TOP_ONLY = { ...KIT_DEFAULT_SLOTS, irises: null, top: "top/tee" };

  it("베이스 + 슬롯 파츠가 예산과 같으면 통과하고, 1개라도 넘으면 kit-budget-exceeded로 실패한다(파일별 수치)", () => {
    const exact = expectV2(buildKitPlan(withRequiredTotal(BUDGET), FEMALE, TOP_ONLY));
    expect(exact.custom.triangles).toEqual({ active: BUDGET, budget: BUDGET });
    const over = expectFailure(buildKitPlan(withRequiredTotal(BUDGET + 1), FEMALE, TOP_ONLY, { now: 3 }));
    expect(over.code).toBe("kit-budget-exceeded");
    expect(over.at).toBe(3);
    expect(over.reasonKo).toMatch(/^베이스와 슬롯 파츠의 그리는 삼각형 합\(200,001\)이 키트 예산 200,000을 넘습니다: 베이스 1,400, 상의\(top\/tee\) 198,601\.$/u);
  });

  it("층·추가 소품은 순서대로 더하다가 예산을 넘는 것부터 사유와 함께 뺀다(앞의 것은 남는다)", () => {
    // 베이스 + 상의 = 예산 − 200: inner(100) → outer(100) 까지 정확히 예산, legwear(100)·소품(80)은 넘는다
    const manifest = withRequiredTotal(BUDGET - 200);
    const plan = expectV2(
      buildKitPlan(manifest, FEMALE, TOP_ONLY, {
        wardrobe: { inner: "top/shirt", outer: "top/blazer", legwear: "bottom/slacks", accessories: [{ id: "acc-1", presetId: "accessory/ribbon" }] },
      }),
    );
    expect(plan.custom.files.filter((file) => file.kind !== "base" && file.kind !== "part").map((file) => file.id)).toEqual(["inner:top/shirt", "outer:top/blazer"]);
    expect(plan.custom.triangles.active).toBe(BUDGET);
    expect(plan.custom.skipped).toEqual([
      { kind: "layer", key: "legwear", presetId: "bottom/slacks", reasonKo: "레그웨어 층(bottom/slacks)을(를) 더하면 그리는 삼각형이 키트 예산 200,000을 넘어(현재 200,000 + 100) 올리지 않았습니다." },
      { kind: "accessory", key: "acc-1", presetId: "accessory/ribbon", reasonKo: "소품 acc-1(accessory/ribbon)을(를) 더하면 그리는 삼각형이 키트 예산 200,000을 넘어(현재 200,000 + 80) 올리지 않았습니다." },
    ]);
    expect(plan.custom.capabilities.layers).toEqual(["inner", "outer"]);
    expect(plan.custom.capabilities.reasonsKo["layer:legwear"]).toMatch(/키트 예산 200,000을 넘어/u);
  });
});

describe("authored/kit-plan-v2 — 실패는 v1과 같은 코드·문구다(무음 대체 없음)", () => {
  const manifest = rich();

  it("키트 id·버전·베이스·슬롯 파츠 실패", () => {
    expect(expectFailure(buildKitPlan(manifest, { ...FEMALE, kitVersion: 3 }, KIT_DEFAULT_SLOTS)).code).toBe("kit-version-mismatch");
    expect(expectFailure(buildKitPlan(manifest, { ...FEMALE, kitId: "other-kit" }, KIT_DEFAULT_SLOTS)).reasonKo).toMatch(/키트 id\(other-kit\)/u);
    const hime = buildKitPlanDetailed(manifest, MALE, { ...KIT_DEFAULT_SLOTS, hair: "hair/hime-cut" });
    expect(hime.ok).toBe(false);
    if (hime.ok) return;
    expect(hime.failure.code).toBe("kit-part-missing");
    expect(hime.failure.reasonKo).toBe("프리셋 hair/hime-cut은(는) male 베이스용 변형이 없습니다: 남성 핏 미제작 (슬롯 hair, 베이스 male)");
    const femaleOnly = rich((json) => {
      delete (json.bases as Json).male;
      delete (json.slotCapabilities as Json).male;
      for (const part of json.parts as Json[]) {
        delete (part.variants as Json).male;
        delete (part.unavailable as Json).male;
      }
    });
    expect(expectFailure(buildKitPlan(femaleOnly, MALE, KIT_DEFAULT_SLOTS)).reasonKo).toBe("키트에 male 베이스가 없습니다(제공: female).");
  });

  it("선언 능력이 규칙 판정과 다르면 kit-capabilities-mismatch(v2도 같은 대조)", () => {
    const { json } = finalizeKitV2(richKitV2Json(kitManifestV2Json()));
    ((json.slotCapabilities as Json).male as Json).hair = { status: "available" };
    // 선언을 규칙으로 다시 채우는 finalizeKitV2 대신 계약 파서만 쓴다(스키마는 선언 일치를 검사하지 않는다)
    const parsed = parseKitManifestV2(json);
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    const tampered = parsed.manifest;
    const failure = expectFailure(buildKitPlan(tampered, MALE, KIT_DEFAULT_SLOTS));
    expect(failure.code).toBe("kit-capabilities-mismatch");
    expect(failure.reasonKo).toContain("헤어(hair)");
  });

  it("v2 계획은 재질 원본에 없는 이름을 만들지 않는다(재질 맵은 파일이 쓰는 것만)", () => {
    const plan = expectV2(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS));
    const used = new Set(plan.custom.files.flatMap((file) => file.meshes.flatMap((mesh) => mesh.material ?? mesh.primitiveMaterials ?? [])));
    expect(Object.keys(plan.custom.materials).sort()).toEqual([...used].sort());
    expect(Object.keys(materialsOf(richKitV2Json(kitManifestV2Json()))).length).toBeGreaterThan(Object.keys(plan.custom.materials).length);
  });
});
