import { describe, expect, it } from "vitest";

import { KIT_ASSET_ROOT, KIT_DEFAULT_ID, KIT_DEFAULT_SLOTS, KIT_MORPH_NAMES, KIT_PART_SLOTS, createKitDefaultRecipe, isLabFailure, kitGeometryKey, parseKitManifest } from "../../contracts";

import { deriveKitCapabilities } from "./kit-capability";
import { buildKitPlan, buildKitPlanDetailed } from "./kit-plan";
import { kitManifestFixture, kitManifestJson } from "./kit-test-fixture";

import type { KitPlanSource } from "./kit-plan";
import type { KitPlan, LabFailure } from "../../contracts";

const FEMALE: KitPlanSource = { kitId: KIT_DEFAULT_ID, kitVersion: 1, baseId: "female" };
const MALE: KitPlanSource = { ...FEMALE, baseId: "male" };

function expectPlan(result: KitPlan | LabFailure): KitPlan {
  if (isLabFailure(result)) throw new Error(`계획이 실패했습니다: ${result.code} ${result.reasonKo}`);
  return result;
}

function expectFailure(result: KitPlan | LabFailure): LabFailure {
  if (!isLabFailure(result)) throw new Error("실패를 기대했지만 계획이 만들어졌습니다.");
  return result;
}

describe("authored/kit-plan — 계획 생성", () => {
  const manifest = kitManifestFixture();

  it("기본 레시피(키트 기본 슬롯)는 베이스 + 선택 파츠를 슬롯 순서로 담는다", () => {
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS));
    expect(plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    expect(plan.parts.map((part) => part.kind)).toEqual(["base", "part", "part", "part", "part", "part"]);
    expect(plan.parts.map((part) => part.slot)).toEqual([null, "hair", "top", "bottom", "shoes", "irises"]);
    expect(plan.kitId).toBe(KIT_DEFAULT_ID);
    expect(plan.kitVersion).toBe(1);
    expect(plan.baseId).toBe("female");

    const base = plan.parts[0];
    const female = manifest.bases.female;
    expect(base?.url).toBe(`${KIT_ASSET_ROOT}/bases/female.glb`);
    expect(base?.sha256).toBe(female?.file.sha256);
    expect(base?.bytes).toBe(female?.file.bytes);
    expect(base?.meshes.map((mesh) => mesh.node)).toEqual(["TS_Body", "TS_Head", "TS_Eye_L", "TS_Eye_R", "TS_Mouth", "TS_Lashes", "TS_Brow_L", "TS_Brow_R", "TS_Underwear"]);
    expect(base?.hides).toEqual([]);

    const hair = plan.parts[1];
    expect(hair?.url).toBe(`${KIT_ASSET_ROOT}/parts/female/hair/soft-bob.glb`);
    expect(hair?.meshes.map((mesh) => mesh.node)).toEqual(["TS_AuthoredHair_soft-bob_LOD0", "TS_AuthoredHair_soft-bob_LOD1", "TS_AuthoredHair_soft-bob_LOD2"]);
    expect(plan.parts[2]?.hides).toEqual(["torso", "upperArm.L", "upperArm.R"]);
    expect(plan.parts[3]?.hides).toEqual(["pelvis", "thigh.L", "thigh.R"]);
    expect(plan.parts[4]?.hides).toEqual(["foot.L", "foot.R"]);
    expect(plan.parts[5]?.meshes.map((mesh) => mesh.node)).toEqual(["TS_Iris_L", "TS_Iris_R", "TS_Highlight_L", "TS_Highlight_R"]);
  });

  it("레시피에서 온 슬롯 객체의 키 순서와 상관없이 파츠 순서는 슬롯 정의 순서다", () => {
    const reversed = Object.fromEntries([...Object.entries(KIT_DEFAULT_SLOTS)].reverse());
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, { ...reversed, accessory: "accessory/glasses" }));
    expect(plan.parts.slice(1).map((part) => part.slot)).toEqual([...KIT_PART_SLOTS]);
    expect(plan.parts.at(-1)?.id).toBe("irises/round-large");
    expect(plan.parts[5]?.id).toBe("accessory/glasses");
  });

  it("실제 레시피(createKitDefaultRecipe)와 kitGeometryKey가 같은 파츠 집합을 가리킨다", () => {
    const recipe = createKitDefaultRecipe();
    if (recipe.source.kind !== "kit") throw new Error("키트 기본 레시피가 키트 소스가 아닙니다.");
    const plan = expectPlan(buildKitPlan(manifest, recipe.source, recipe.slots));
    expect(plan.parts.slice(1).map((part) => part.id)).toEqual(KIT_PART_SLOTS.map((slot) => recipe.slots[slot]).filter((id): id is NonNullable<typeof id> => id !== null));
    // 같은 지오메트리 키 = 같은 계획(색·포즈 변경은 계획을 바꾸지 않는다)
    const recolored = { ...recipe, colors: { ...recipe.colors, hair: "#123456" } };
    expect(kitGeometryKey(recolored)).toBe(kitGeometryKey(recipe));
    expect(buildKitPlan(manifest, recipe.source, recolored.slots)).toEqual(plan);
  });

  it("null·undefined 슬롯은 파츠를 만들지 않는다(accessory 비움)", () => {
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, { ...KIT_DEFAULT_SLOTS, accessory: null, hair: undefined, irises: null }));
    expect(plan.parts.map((part) => part.id)).toEqual(["base/female", "top/tee", "bottom/jeans", "shoes/sneakers"]);
    expect(plan.hairLodPolicy.preferredLod).toBe(0);
  });

  it("morph 이름은 사용 중인 파츠들의 합집합이며 계약 어휘 순서를 따른다", () => {
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS));
    expect(plan.morphNames).toEqual([...KIT_MORPH_NAMES]);
    expect(plan.morphNames).toHaveLength(64);
    // 몸·머리 파츠가 없는 슬롯 집합이어도 베이스가 항상 있어 어휘 전체가 남는다
    const sparse = expectPlan(buildKitPlan(manifest, FEMALE, {}));
    expect(sparse.parts).toHaveLength(1);
    expect(sparse.morphNames).toEqual([...KIT_MORPH_NAMES]);
  });

  it("재질은 계획에 쓰이는 것만 담는다", () => {
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, { ...KIT_DEFAULT_SLOTS, accessory: "accessory/glasses" }));
    expect(Object.keys(plan.materials).sort()).toEqual(
      [
        "ts_accessory_glasses",
        "ts_bottom_jeans",
        "ts_brow",
        "ts_eye",
        "ts_hair_soft-bob",
        "ts_highlight",
        "ts_iris",
        "ts_lashes",
        "ts_shoes_sneakers",
        "ts_skin_body",
        "ts_skin_head",
        "ts_teeth",
        "ts_tongue",
        "ts_top_tee",
        "ts_underwear",
      ].sort(),
    );
    expect(plan.materials["ts_hair_hime-cut"]).toBeUndefined();
    expect(plan.materials["ts_top_tee"]).toEqual({ role: "top", tint: { mode: "recolor", colorKey: "top" }, doubleSided: false });
    expect(plan.materials.ts_underwear?.tint.mode).toBe("fixed");
  });

  it("헤어 LOD 정책: 기본 0, 선호가 있으면 그 이하 중 가장 가까운 LOD, 존재하는 최대를 넘지 않는다", () => {
    expect(expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS)).hairLodPolicy).toEqual({ preferredLod: 0 });
    expect(expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS, { preferredHairLod: 1 })).hairLodPolicy).toEqual({ preferredLod: 1 });
    expect(expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS, { preferredHairLod: 9 })).hairLodPolicy).toEqual({ preferredLod: 2 });
  });

  it("관절 오프셋·스켈레톤·영역 범위·능력 맵·라이선스를 매니페스트에서 그대로 싣는다", () => {
    const plan = expectPlan(buildKitPlan(manifest, MALE, KIT_DEFAULT_SLOTS));
    expect(plan.jointOffsets).toBe(manifest.jointOffsets);
    expect(plan.skeleton).toBe(manifest.skeleton);
    expect(plan.skeleton.joints).toHaveLength(68);
    expect(plan.bodyRegions).toBe(manifest.bases.male?.bodyRegions);
    expect(plan.bodyRegions).toHaveLength(15);
    expect(plan.capabilities).toEqual(deriveKitCapabilities(manifest, "male"));
    expect(plan.licenseNote).toBe("Blender Foundation Human Base Meshes Bundle v1.4.1(CC0) 파생물과 원본 디자인. (라이선스: CC0-1.0, original)");
    expect(plan.parts[0]?.url).toBe(`${KIT_ASSET_ROOT}/bases/male.glb`);
  });

  it("rootUrl 옵션은 파일 url의 기준 경로를 바꾼다(끝 슬래시 정규화)", () => {
    const plan = expectPlan(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS, { rootUrl: "https://cdn.example.test/kit/" }));
    expect(plan.parts.every((part) => part.url.startsWith("https://cdn.example.test/kit/") && !part.url.includes("//kit"))).toBe(true);
    expect(plan.parts[0]?.url).toBe("https://cdn.example.test/kit/bases/female.glb");
  });

  it("같은 입력은 같은 계획이다(결정적)", () => {
    expect(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS)).toEqual(buildKitPlan(manifest, FEMALE, KIT_DEFAULT_SLOTS));
  });
});

describe("authored/kit-plan — 실패는 한글 사유로 보이게 한다(무음 대체 없음)", () => {
  const manifest = kitManifestFixture();

  it("키트 id·버전이 다르면 kit-version-mismatch", () => {
    const id = expectFailure(buildKitPlan(manifest, { ...FEMALE, kitId: "other-kit" }, KIT_DEFAULT_SLOTS, { now: 5 }));
    expect(id.code).toBe("kit-version-mismatch");
    expect(id.reasonKo).toMatch(/키트 id\(other-kit\)/u);
    expect(id.at).toBe(5);
    const version = expectFailure(buildKitPlan(manifest, { ...FEMALE, kitVersion: 2 }, KIT_DEFAULT_SLOTS));
    expect(version.code).toBe("kit-version-mismatch");
    expect(version.reasonKo).toMatch(/키트 버전\(2\).*\(1\)/u);
  });

  it("manifest에 없는 베이스는 kit-base-missing이고 제공 베이스를 알린다", () => {
    const femaleOnly = kitManifestFixture({ male: false });
    const failure = expectFailure(buildKitPlan(femaleOnly, MALE, KIT_DEFAULT_SLOTS));
    expect(failure.code).toBe("kit-base-missing");
    expect(failure.reasonKo).toBe("키트에 male 베이스가 없습니다(제공: female).");
  });

  it("남성에게 없는 프리셋은 다른 헤어로 바꾸지 않고 kit-part-missing으로 실패한다", () => {
    const result = buildKitPlanDetailed(manifest, MALE, { ...KIT_DEFAULT_SLOTS, hair: "hair/hime-cut" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("kit-part-missing");
    expect(result.failure.reasonKo).toContain("hair/hime-cut");
    expect(result.failure.reasonKo).toContain("남성 핏 미제작");
    expect(result.failure.reasonKo).toContain("슬롯 hair, 베이스 male");
  });

  it("슬롯과 맞지 않는 프리셋 id나 키트에 없는 프리셋도 kit-part-missing", () => {
    const wrongSlot = expectFailure(buildKitPlan(manifest, FEMALE, { ...KIT_DEFAULT_SLOTS, hair: "top/tee" }));
    expect(wrongSlot.code).toBe("kit-part-missing");
    expect(wrongSlot.reasonKo).toMatch(/슬롯 hair에 맞지 않는 프리셋 id입니다: top\/tee/u);
    const malformed = expectFailure(buildKitPlan(manifest, FEMALE, { ...KIT_DEFAULT_SLOTS, top: "not-a-preset" }));
    expect(malformed.code).toBe("kit-part-missing");
    const unknown = expectFailure(buildKitPlan(manifest, FEMALE, { ...KIT_DEFAULT_SLOTS, hair: "hair/mohawk" }));
    expect(unknown.reasonKo).toMatch(/키트에 프리셋 hair\/mohawk 파츠가 없습니다/u);
  });

  it("선언한 능력이 규칙 판정과 다르면 kit-capabilities-mismatch", () => {
    const raw = structuredClone(kitManifestJson()) as { slotCapabilities: { male: Record<string, unknown> } };
    raw.slotCapabilities.male.hair = { status: "available" };
    const parsed = parseKitManifest(raw);
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    const failure = expectFailure(buildKitPlan(parsed.manifest, MALE, KIT_DEFAULT_SLOTS));
    expect(failure.code).toBe("kit-capabilities-mismatch");
    expect(failure.reasonKo).toContain("헤어(hair)");
    // 다른 베이스(여성)는 영향이 없다
    expect(isLabFailure(buildKitPlan(parsed.manifest, FEMALE, KIT_DEFAULT_SLOTS))).toBe(false);
  });

  it("buildKitPlan은 실패를 던지지 않고 LabFailure 값으로 돌려준다", () => {
    expect(() => buildKitPlan(manifest, { ...FEMALE, kitVersion: 99 }, KIT_DEFAULT_SLOTS)).not.toThrow();
    expect(isLabFailure(buildKitPlan(manifest, { ...FEMALE, kitVersion: 99 }, KIT_DEFAULT_SLOTS))).toBe(true);
  });
});
