import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  FACS_UNITS,
  KIT_DEFAULT_SLOTS,
  KIT_MORPH_NAMES,
  PART_ROLES,
  allocatePartIdsByRole,
  createDefaultRecipe,
  createKitDefaultRecipe,
  createPresetCatalog,
  isUnitQuat,
  rolePartId,
} from "../contracts";
import { presetEntryFixture, samplePose, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import {
  DEFAULT_PART_LAYOUT,
  createApplyPlanner,
  layoutFromPalette,
  materialPresetFor,
  planApply,
  planWithPreset,
  presetConflicts,
  presetUnavailableReasonKo,
  unmetRequirement,
} from "./apply-plan";

import type { CharacterRecipe, ParamKey, PresetCatalog, SlotCapabilityMap } from "../contracts";

function catalog(): PresetCatalog {
  const entries = vocabularyCatalogEntries().map((entry) => {
    switch (entry.id) {
      case "face-shape/round":
        return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0.4, chinLength: -0.3 } }, requires: ["morph:param:jawWidth:+", "morph:param:chinLength:-"] });
      case "body/tall":
        return presetEntryFixture(entry.id, { patch: { body: { height: 0.7, legLength: 0.5 } }, requires: ["morph:param:height:+"] });
      case "hair/twin-tail":
        return presetEntryFixture(entry.id, { patch: { parts: { hair: "twin-tail" } }, conflictsWith: ["accessory/cap"] });
      case "accessory/cap":
        return presetEntryFixture(entry.id, { patch: { parts: { accessory: "cap" }, colors: { accessory: "#112233" } }, conflictsWith: ["hair/twin-tail"] });
      case "expression/joy":
        return presetEntryFixture(entry.id, { patch: { expression: { mouthSmile: 0.9 } }, requires: ["morph:facs:mouthSmile"] });
      case "pose/wave":
        return presetEntryFixture(entry.id, { patch: { pose: samplePose() }, requires: ["bone:leftUpperArm", "slot:pose"] });
      case "hand-pose/fist":
        return presetEntryFixture(entry.id, { patch: { handPose: { left: { leftIndexProximal: [0, 0, 1, 1] }, right: {} } } });
      default:
        return entry;
    }
  });
  return createPresetCatalog(entries);
}

const CATALOG = catalog();

function recipeAllSlots(): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    slots: { ...base.slots, "face-shape": "face-shape/round", body: "body/tall", hair: "hair/twin-tail", accessory: "accessory/cap", expression: "expression/joy", pose: "pose/wave", "hand-pose": "hand-pose/fist" },
    face: { jawWidth: 0.4, chinLength: -0.3, eyeSize: 0.2 },
    body: { height: 0.7, legLength: 0.5, waist: -0.1 },
    expression: { mouthSmile: 0.9, jawOpen: 0.3 },
    pose: samplePose(),
    handPose: { left: { leftIndexProximal: [0, 0, 1, 1] }, right: {} },
  };
}

function capabilitiesWith(overrides: Partial<SlotCapabilityMap>): SlotCapabilityMap {
  return { ...ALL_AVAILABLE_CAPABILITIES, ...overrides };
}

describe("state/apply-plan", () => {
  it("절차 소스(전부 available)는 모든 슬롯을 적용한다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.unsupported).toEqual([]);
    expect(plan.morphWeights).toMatchObject({
      "param:jawWidth:+": 0.4,
      "param:chinLength:-": 0.3,
      "param:eyeSize:+": 0.2,
      "param:height:+": 0.7,
      "param:legLength:+": 0.5,
      "param:waist:-": 0.1,
      "facs:mouthSmile": 0.9,
      "facs:jawOpen": 0.3,
    });
    expect(Object.keys(plan.boneRotations).sort()).toEqual(["leftIndexProximal", "leftUpperArm", "rightUpperArm"]);
    expect(plan.colors).toEqual(recipeAllSlots().colors);
    expect(plan.physics).toEqual({ provider: "builtin-pbd", settleSteps: 0 });
    expect(plan.revision).toBe(0);
  });

  it("가중치는 [0,1] 안이고 본 회전은 정규화된다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    for (const weight of Object.values(plan.morphWeights)) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
    for (const quat of Object.values(plan.boneRotations)) expect(isUnitQuat(quat)).toBe(true);
    expect(plan.boneRotations.leftIndexProximal?.map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 0.707107, 0.707107]);
  });

  it("기본 레이아웃은 PART_ROLES 순서로 partId 1..n이며 슬롯별 가시성·색·재질을 채운다", () => {
    const plan = planApply(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.parts.map((p) => p.partId)).toEqual(PART_ROLES.map((_, i) => i + 1));
    const byRole = Object.fromEntries(DEFAULT_PART_LAYOUT.map((entry, i) => [entry.role, plan.parts[i]]));
    expect(byRole.hair).toMatchObject({ visible: true, materialPreset: "hair-aniso", color: recipeAllSlots().colors.hair });
    expect(byRole.accessory).toMatchObject({ visible: true, materialPreset: "cloth-cotton", color: recipeAllSlots().colors.accessory });
    expect(byRole.skin).toMatchObject({ visible: true, materialPreset: "skin-sss", color: recipeAllSlots().colors.skin });
    expect(byRole.eyeball).toMatchObject({ visible: true, materialPreset: "eye-wet" });
    expect(byRole.eyeball?.color).toBeUndefined();
    expect(byRole.bottom).toMatchObject({ visible: true, materialPreset: "cloth-denim" });
  });

  it("비어 있는 슬롯(accessory null)의 파츠는 숨긴다", () => {
    const plan = planApply(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    const accessory = plan.parts.find((p) => p.partId === PART_ROLES.indexOf("accessory") + 1);
    expect(accessory?.visible).toBe(false);
  });

  it("unavailable 슬롯은 미적용 + 사유, 그 프리셋의 파라미터 morph는 제외, 파츠는 소스 기본값 유지", () => {
    const capabilities = capabilitiesWith({
      "face-shape": { status: "unavailable", reasonKo: "패키지에 jawWidth shape key가 없습니다" },
      hair: { status: "unavailable", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다" },
      expression: { status: "unavailable" },
    });
    const plan = planApply(recipeAllSlots(), capabilities, CATALOG);
    expect(plan.unsupported).toEqual([
      { slot: "face-shape", presetId: "face-shape/round", reasonKo: "패키지에 jawWidth shape key가 없습니다" },
      { slot: "hair", presetId: "hair/twin-tail", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다" },
      { slot: "expression", presetId: "expression/joy", reasonKo: "표정 슬롯을 소스가 지원하지 않습니다." },
    ]);
    expect(plan.morphWeights["param:jawWidth:+"]).toBeUndefined();
    expect(plan.morphWeights["param:chinLength:-"]).toBeUndefined();
    expect(plan.morphWeights["param:eyeSize:+"]).toBe(0.2);
    expect(plan.morphWeights["facs:mouthSmile"]).toBeUndefined();
    const hair = plan.parts.find((p) => p.partId === PART_ROLES.indexOf("hair") + 1);
    expect(hair?.visible).toBe(true);
    expect(hair?.materialPreset).toBe("hair-aniso");
  });

  it("features를 주면 morph:·bone: requires 불충족을 unsupported로 노출한다(대체 없음)", () => {
    const planner = createApplyPlanner({ features: { morphNames: ["param:jawWidth:+", "facs:mouthSmile"], boneNames: ["hips"] } });
    const plan = planner(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    const bySlot = Object.fromEntries(plan.unsupported.map((u) => [u.slot, u.reasonKo]));
    expect(bySlot["face-shape"]).toContain('"param:chinLength:-"');
    expect(bySlot.body).toContain('"param:height:+"');
    expect(bySlot.pose).toContain('"leftUpperArm"');
    expect(bySlot.expression).toBeUndefined();
    expect(plan.boneRotations.leftUpperArm).toBeUndefined();
    expect(plan.boneRotations.leftIndexProximal).toBeDefined();
    expect(plan.morphWeights["param:height:+"]).toBeUndefined();
    expect(plan.morphWeights["param:waist:-"]).toBe(0.1);
  });

  it("features가 없으면 slot: 요구만 검사한다", () => {
    const plan = planApply(recipeAllSlots(), capabilitiesWith({ pose: { status: "unavailable", reasonKo: "본 없음" } }), CATALOG);
    expect(plan.unsupported).toEqual([{ slot: "pose", presetId: "pose/wave", reasonKo: "본 없음" }]);
    const entry = CATALOG.get("pose/wave");
    expect(entry && unmetRequirement(entry, capabilitiesWith({ pose: { status: "unavailable" } }))).toBe("포즈 슬롯을 소스가 지원하지 않습니다.");
    expect(entry && unmetRequirement(entry, ALL_AVAILABLE_CAPABILITIES)).toBeNull();
    expect(unmetRequirement(presetEntryFixture("ears/small", { requires: ["weird"] }), ALL_AVAILABLE_CAPABILITIES)).toMatch(/형식이 틀립니다/u);
    expect(unmetRequirement(presetEntryFixture("ears/small", { requires: ["slot:nope"] }), ALL_AVAILABLE_CAPABILITIES)).toMatch(/어휘 밖/u);
  });

  it("conflictsWith 충돌과 partial 능력은 partial 사유로 노출되며 적용은 된다", () => {
    const planner = createApplyPlanner();
    const plan = planner(recipeAllSlots(), capabilitiesWith({ body: { status: "partial", reasonKo: "음수 방향 shape key 없음" } }), CATALOG);
    expect(plan.unsupported).toEqual([]);
    expect(plan.partial).toEqual([
      { slot: "body", presetId: "body/tall", reasonKo: "음수 방향 shape key 없음" },
      { slot: "hair", presetId: "hair/twin-tail", reasonKo: "액세서리 cap(액세서리)와 함께 쓰면 겹침이 생길 수 있습니다." },
      { slot: "accessory", presetId: "accessory/cap", reasonKo: "헤어 twin-tail(헤어)와 함께 쓰면 겹침이 생길 수 있습니다." },
    ]);
    expect(plan.morphWeights["param:height:+"]).toBe(0.7);
    const twinTail = CATALOG.get("hair/twin-tail");
    expect(twinTail && presetConflicts(twinTail, recipeAllSlots(), CATALOG).map((e) => e.id)).toEqual(["accessory/cap"]);
    expect(twinTail && presetConflicts(twinTail, createDefaultRecipe(), CATALOG)).toEqual([]);
  });

  it("카탈로그에 없는 프리셋은 unsupported로 노출한다", () => {
    const recipe = { ...createDefaultRecipe(), slots: { ...createDefaultRecipe().slots, hair: "hair/mohawk" as const } };
    const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.unsupported).toEqual([{ slot: "hair", presetId: "hair/mohawk", reasonKo: "카탈로그에 없는 프리셋입니다: hair/mohawk" }]);
  });

  it("variant 레이아웃은 선택된 어휘 이름의 파츠만 보이게 한다", () => {
    const layout = [
      { partId: 1, role: "skin" as const },
      { partId: 2, role: "hair" as const, variant: "soft-bob" },
      { partId: 3, role: "hair" as const, variant: "twin-tail" },
      { partId: 4, role: "accessory" as const, variant: "cap" },
      { partId: 5, role: "accessory" as const, variant: "glasses" },
    ];
    const planner = createApplyPlanner({ partLayout: layout, settleSteps: 120 });
    const plan = planner(recipeAllSlots(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.parts.map((p) => [p.partId, p.visible])).toEqual([
      [1, true],
      [2, false],
      [3, true],
      [4, true],
      [5, false],
    ]);
    expect(plan.physics.settleSteps).toBe(120);
  });

  it("layoutFromPalette는 partId 오름차순 레이아웃을 만든다", () => {
    const layout = layoutFromPalette({ 3: { role: "hair", labelKo: "헤어" }, 1: { role: "skin", labelKo: "피부" }, 2: { role: "top", labelKo: "상의" } }, { 3: "soft-bob" });
    expect(layout).toEqual([
      { partId: 1, role: "skin" },
      { partId: 2, role: "top" },
      { partId: 3, role: "hair", variant: "soft-bob" },
    ]);
  });

  it("materialPresetFor는 프리셋별 재질을 우선하고 없으면 역할 기본값을 쓴다", () => {
    expect(materialPresetFor("bottom", "bottom/long-skirt")).toBe("cloth-silk");
    expect(materialPresetFor("accessory", "accessory/glasses")).toBe("metal");
    expect(materialPresetFor("accessory", null)).toBe("plastic");
    expect(materialPresetFor("hair", "hair/soft-bob")).toBe("hair-aniso");
  });

  describe("프리셋 단위 미제공(unavailablePresets, 키트 계약 D10)", () => {
    const TWIN_TAIL_MISSING = "여성 핏 미제작";
    const hairPartial = capabilitiesWith({
      hair: { status: "partial", reasonKo: "제공 6/7종, 미제공: twin-tail", unavailablePresets: { "hair/twin-tail": TWIN_TAIL_MISSING } },
    });

    it("presetUnavailableReasonKo는 맵에 있는 프리셋만 사유를 돌려주고 빈 사유는 한글 기본 문구로 채운다", () => {
      const capability = hairPartial.hair;
      expect(presetUnavailableReasonKo(capability, "hair/twin-tail")).toBe(TWIN_TAIL_MISSING);
      expect(presetUnavailableReasonKo(capability, "hair/soft-bob")).toBeNull();
      expect(presetUnavailableReasonKo({ status: "available" }, "hair/twin-tail")).toBeNull();
      expect(presetUnavailableReasonKo({ status: "partial", unavailablePresets: {} }, "hair/twin-tail")).toBeNull();
      const blank = presetUnavailableReasonKo({ status: "partial", unavailablePresets: { "hair/twin-tail": "  " } }, "hair/twin-tail");
      expect(blank).toMatch(/[가-힣]/u);
      expect(blank).toContain("twin-tail");
    });

    it("슬롯이 partial이어도 선택한 프리셋이 맵에 있으면 unsupported(사유=맵 값)이고 다른 프리셋으로 바꾸지 않는다", () => {
      const plan = createApplyPlanner()(recipeAllSlots(), hairPartial, CATALOG);
      expect(plan.unsupported).toEqual([{ slot: "hair", presetId: "hair/twin-tail", reasonKo: TWIN_TAIL_MISSING }]);
      // 미적용이므로 partial 목록에는 올리지 않는다(같은 슬롯이 두 목록에 중복되지 않는다).
      expect(plan.partial.some((item) => item.slot === "hair")).toBe(false);
      // 소스 기본 헤어를 그대로 둔다: 숨기지도, 다른 헤어 variant를 고르지도 않는다.
      const hair = plan.parts.find((p) => p.partId === rolePartId("hair"));
      expect(hair).toMatchObject({ visible: true, materialPreset: "hair-aniso" });
    });

    it("variant 레이아웃에서도 대체 variant를 고르지 않는다(모든 헤어 variant가 소스 기본 상태로 남는다)", () => {
      const layout = [
        { partId: 1, role: "hair" as const, variant: "soft-bob" },
        { partId: 2, role: "hair" as const, variant: "twin-tail" },
      ];
      const plan = createApplyPlanner({ partLayout: layout })(recipeAllSlots(), hairPartial, CATALOG);
      expect(plan.parts.map((p) => p.visible)).toEqual([true, true]);
    });

    it("맵에 없는 프리셋은 평소대로 적용되고 partial 능력 사유만 남는다", () => {
      const recipe = { ...recipeAllSlots(), slots: { ...recipeAllSlots().slots, hair: "hair/soft-bob" as const } };
      const plan = createApplyPlanner()(recipe, hairPartial, CATALOG);
      expect(plan.unsupported).toEqual([]);
      expect(plan.partial).toContainEqual({ slot: "hair", presetId: "hair/soft-bob", reasonKo: "제공 6/7종, 미제공: twin-tail" });
    });

    it("미제공 프리셋의 patch 파라미터 morph는 제외하고 다른 슬롯은 그대로 적용한다", () => {
      const capabilities = capabilitiesWith({
        "face-shape": { status: "partial", reasonKo: "일부만", unavailablePresets: { "face-shape/round": "둥근 얼굴형 미제작" } },
      });
      const plan = planApply(recipeAllSlots(), capabilities, CATALOG);
      expect(plan.unsupported).toEqual([{ slot: "face-shape", presetId: "face-shape/round", reasonKo: "둥근 얼굴형 미제작" }]);
      expect(plan.morphWeights["param:jawWidth:+"]).toBeUndefined();
      expect(plan.morphWeights["param:chinLength:-"]).toBeUndefined();
      expect(plan.morphWeights["param:eyeSize:+"]).toBe(0.2);
      expect(plan.morphWeights["facs:mouthSmile"]).toBe(0.9);
    });

    it("슬롯 전체가 unavailable이면 슬롯 사유가 프리셋 사유보다 먼저다", () => {
      const capabilities = capabilitiesWith({
        hair: { status: "unavailable", reasonKo: "슬롯 전체 미지원", unavailablePresets: { "hair/twin-tail": TWIN_TAIL_MISSING } },
      });
      const plan = planApply(recipeAllSlots(), capabilities, CATALOG);
      expect(plan.unsupported).toEqual([{ slot: "hair", presetId: "hair/twin-tail", reasonKo: "슬롯 전체 미지원" }]);
    });

    it("선택이 비어 있으면(null) 맵과 무관하게 숨김으로 계획한다", () => {
      const recipe = { ...recipeAllSlots(), slots: { ...recipeAllSlots().slots, accessory: null } };
      const capabilities = capabilitiesWith({
        accessory: { status: "partial", reasonKo: "일부만", unavailablePresets: { "accessory/cap": "캡 미제작" } },
      });
      const plan = planApply(recipe, capabilities, CATALOG);
      expect(plan.unsupported).toEqual([]);
      expect(plan.parts.find((p) => p.partId === rolePartId("accessory"))?.visible).toBe(false);
    });

    it("planWithPreset(썸네일 플랜)도 미제공 프리셋을 unsupported로 보고하고 원 레시피를 바꾸지 않는다", () => {
      const recipe = createKitDefaultRecipe();
      const plan = planWithPreset(recipe, "hair/twin-tail", hairPartial, CATALOG);
      expect(plan.unsupported).toEqual([{ slot: "hair", presetId: "hair/twin-tail", reasonKo: TWIN_TAIL_MISSING }]);
      expect(recipe.slots.hair).toBe("hair/soft-bob");
    });
  });

  describe("키트 소스와의 계약 정합(키트 계약 5절, D5, D11)", () => {
    it("역할 고정 partId(rolePartId)는 기본 레이아웃과 같고 속옷 역할이 끝(16)에 추가돼 기존 partId가 밀리지 않는다", () => {
      expect(DEFAULT_PART_LAYOUT.map((entry) => entry.partId)).toEqual(PART_ROLES.map((role) => rolePartId(role)));
      expect(PART_ROLES.at(-1)).toBe("underwear");
      expect(rolePartId("underwear")).toBe(16);
      expect(DEFAULT_PART_LAYOUT).toHaveLength(16);
      expect(rolePartId("skin")).toBe(1);
      expect(rolePartId("accessory")).toBe(15);
    });

    it("키트 팔레트(allocatePartIdsByRole)에서 만든 레이아웃은 기본 레이아웃과 같다", () => {
      const palette = allocatePartIdsByRole(PART_ROLES.map((role) => ({ role })));
      expect(layoutFromPalette(palette)).toEqual(DEFAULT_PART_LAYOUT);
    });

    it("파츠가 없는 역할(accessory 미선택)이 있는 희소 팔레트에서도 나머지 partId가 밀리지 않는다", () => {
      const roles = PART_ROLES.filter((role) => role !== "accessory");
      const layout = layoutFromPalette(allocatePartIdsByRole(roles.map((role) => ({ role }))));
      const plan = createApplyPlanner({ partLayout: layout })(createKitDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES, CATALOG);
      expect(plan.parts).toHaveLength(15);
      expect(plan.parts.map((p) => p.partId)).toEqual(roles.map((role) => rolePartId(role)));
      expect(plan.parts.find((p) => p.partId === rolePartId("hair"))?.visible).toBe(true);
      expect(plan.parts.find((p) => p.partId === rolePartId("underwear"))?.visible).toBe(true);
    });

    it("속옷은 슬롯이 없어 항상 보이고 면 재질이며 레시피 색을 받지 않는다(상의·하의를 비워도 그대로)", () => {
      const base = createKitDefaultRecipe();
      const stripped = { ...base, slots: { ...base.slots, top: null, bottom: null, shoes: null, accessory: null } };
      for (const recipe of [base, stripped]) {
        const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
        const underwear = plan.parts.find((p) => p.partId === rolePartId("underwear"));
        expect(underwear).toEqual({ partId: 16, visible: true, materialPreset: "cloth-cotton" });
      }
      expect(materialPresetFor("underwear", null)).toBe("cloth-cotton");
    });

    it("키트 기본 레시피의 슬롯은 KIT_DEFAULT_SLOTS이고 플래너가 전부 적용한다(미적용 없음)", () => {
      const recipe = createKitDefaultRecipe();
      expect(recipe.slots).toEqual(KIT_DEFAULT_SLOTS);
      const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
      expect(plan.unsupported).toEqual([]);
      const visibleRoles = DEFAULT_PART_LAYOUT.filter((_, index) => plan.parts[index]?.visible).map((entry) => entry.role);
      expect(visibleRoles).toContain("hair");
      expect(visibleRoles).toContain("top");
      expect(visibleRoles).toContain("bottom");
      expect(visibleRoles).toContain("shoes");
      expect(visibleRoles).toContain("iris");
      expect(visibleRoles).not.toContain("accessory");
    });

    it("플래너가 만드는 morph 이름은 키트 어휘 64개와 정확히 같은 집합이다(문서 5절 '한 줄도 바꾸지 않는다' 검증)", () => {
      const allKeys = [...BODY_PARAM_KEYS, ...FACE_PARAM_KEYS] as readonly ParamKey[];
      const emitted = new Set<string>();
      for (const sign of [1, -1]) {
        const recipe: CharacterRecipe = {
          ...createKitDefaultRecipe(),
          body: Object.fromEntries(BODY_PARAM_KEYS.map((key) => [key, sign])),
          face: Object.fromEntries(FACE_PARAM_KEYS.map((key) => [key, sign])),
          expression: Object.fromEntries(FACS_UNITS.map((unit) => [unit, 1])),
        };
        const plan = planApply(recipe, ALL_AVAILABLE_CAPABILITIES, CATALOG);
        for (const name of Object.keys(plan.morphWeights)) emitted.add(name);
      }
      expect(allKeys).toHaveLength(24);
      expect(KIT_MORPH_NAMES).toHaveLength(64);
      expect([...emitted].sort()).toEqual([...KIT_MORPH_NAMES].sort());
    });
  });

  it("planWithPreset은 프리셋을 임시 적용해 플랜을 만들고 원 레시피는 바꾸지 않는다", () => {
    const recipe = createDefaultRecipe();
    const plan = planWithPreset(recipe, "face-shape/round", ALL_AVAILABLE_CAPABILITIES, CATALOG);
    expect(plan.morphWeights["param:jawWidth:+"]).toBe(0.4);
    expect(recipe.face).toEqual({});
    expect(() => planWithPreset(recipe, "hair/mohawk", ALL_AVAILABLE_CAPABILITIES, CATALOG)).toThrowError(/카탈로그에 없는 프리셋/u);
  });
});
