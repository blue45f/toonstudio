import { describe, expect, it } from "vitest";

import {
  ACCESSORY_ANCHORS,
  OUTFIT_CHANNEL_KEYS,
  PATTERN_KINDS,
  SLOT_PRESET_IDS,
  WARDROBE_LAYERS,
  applyCharacterLook,
  characterLookSchema,
  characterRecipeSchema,
  createDefaultRecipe,
  createKitDefaultRecipe,
  createPresetCatalog,
  isBaseChannelKey,
  isLayerPreset,
} from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { ACCESSORY_ANCHOR_AFFINITY, accessoryAnchorsFor } from "./accessory-anchors";
import { APPEARANCE_PRESETS } from "./appearance-presets";
import { WARDROBE_LAYER_COMPATIBILITY, layerOptionsFor } from "./layering";
import { LOOK_SETS, LOOK_SET_GENRES, LOOK_SET_GENRE_LABELS_KO, LOOK_SET_MIN_PER_GENRE, composeLookSetLook, lookSetById, lookSetSchema, lookSetWardrobe, lookSetsForGenre } from "./look-sets";

import type { CharacterRecipe, PresetId } from "../contracts";
import type { LookSet } from "./look-sets";

const CATALOG = createPresetCatalog(APPEARANCE_PRESETS);

function presetsOf(set: LookSet): PresetId[] {
  const ids: Array<PresetId | null> = [set.slots.top, set.slots.bottom, set.slots.shoes, set.slots.accessory, set.layers.inner, set.layers.outer, set.layers.legwear, ...set.accessories.map((a) => a.presetId)];
  return ids.filter((id): id is PresetId => id !== null);
}

/** 사용자가 의상 밖을 많이 꾸민 레시피(세트가 건드리면 안 되는 값) */
function customizedRecipe(base: CharacterRecipe): CharacterRecipe {
  return {
    ...base,
    slots: { ...base.slots, hair: "hair/twin-tail", eyes: "eyes/wide", body: "body/athletic" },
    body: { height: 0.3, waist: -0.2 },
    face: { eyeSize: 0.4, jawWidth: -0.3 },
    colors: { ...base.colors, skin: "#d29a73", hair: "#c94f6b", lip: "#aa3344", "hair-tip": "#ffd2e0", top: "#000000", "top-trim": "#ff0000" },
    surfaces: { hair: { material: "hair-aniso", pattern: null }, top: { material: "leather", pattern: null } },
    partParams: { hair: { length: 0.4 }, top: { hem: 0.5 } },
    hairColor: { gradient: [0.3, 1], tipMix: 0.3, accent: "none" },
    wardrobe: { inner: null, outer: "top/hoodie", legwear: null, accessories: [{ id: "acc-1", presetId: "accessory/cap", anchor: "head-top", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } }] },
  };
}

describe("presets/look-sets: 데이터", () => {
  it("장르별 최소 수(교복 6·캐주얼 6·직장/직업 4·운동 3·판타지/전통풍 3·홈웨어 2)와 합계 24 이상을 채운다", () => {
    expect(LOOK_SETS.length).toBeGreaterThanOrEqual(24);
    for (const genre of LOOK_SET_GENRES) {
      expect(lookSetsForGenre(genre).length, genre).toBeGreaterThanOrEqual(LOOK_SET_MIN_PER_GENRE[genre]);
      expect(LOOK_SET_GENRE_LABELS_KO[genre]).toMatch(/[가-힣]/u);
    }
    // 장르 순서대로 놓여 있다(화면 목록 순서)
    const order = LOOK_SETS.map((set) => LOOK_SET_GENRES.indexOf(set.genre));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("모든 세트가 세트 스키마(계약 조각 스키마: 어휘 프리셋·층 슬롯·의상 채널·hex·표면·헤어 흐름·앵커)를 통과한다", () => {
    for (const set of LOOK_SETS) {
      const parsed = lookSetSchema.safeParse(set);
      expect(parsed.success, `${set.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it("id·이름은 유일하고 id로 찾을 수 있다", () => {
    expect(new Set(LOOK_SETS.map((set) => set.id)).size).toBe(LOOK_SETS.length);
    expect(new Set(LOOK_SETS.map((set) => set.nameKo)).size).toBe(LOOK_SETS.length);
    for (const set of LOOK_SETS) expect(lookSetById(set.id)).toBe(set);
    expect(lookSetById("없는-세트")).toBeUndefined();
  });

  it("프리셋은 지금 어휘(헤어 7·상 5·하 5·신발 4·소품 6)와 카탈로그에 실제로 있는 것만 쓴다", () => {
    for (const set of LOOK_SETS) {
      for (const id of presetsOf(set)) expect(CATALOG.get(id), `${set.id}: ${id}`).toBeDefined();
    }
    expect(SLOT_PRESET_IDS.top).toHaveLength(5);
    expect(SLOT_PRESET_IDS.accessory).toHaveLength(6);
  });

  it("세트마다 색 조합이 다르고(색 맵 유일) 구성 전체도 다르다", () => {
    expect(new Set(LOOK_SETS.map((set) => stableStringify(set.colors))).size).toBe(LOOK_SETS.length);
    const signature = (set: LookSet) => stableStringify({ slots: set.slots, layers: set.layers, accessories: set.accessories, colors: set.colors, surfaces: set.surfaces });
    expect(new Set(LOOK_SETS.map(signature)).size).toBe(LOOK_SETS.length);
  });

  it("스타일 지정: 패턴 6종을 모두 쓰고, 표면을 지정한 세트가 장르마다 하나 이상이며 층·추가 소품·헤어 흐름 세트가 있다", () => {
    const kinds = new Set<string>();
    for (const set of LOOK_SETS) for (const surface of Object.values(set.surfaces)) if (surface?.pattern) kinds.add(surface.pattern.kind);
    expect([...kinds].sort()).toEqual([...PATTERN_KINDS].sort());
    for (const genre of LOOK_SET_GENRES) expect(lookSetsForGenre(genre).some((set) => Object.keys(set.surfaces).length > 0), genre).toBe(true);
    expect(LOOK_SETS.filter((set) => set.layers.outer !== null).length).toBeGreaterThanOrEqual(6);
    expect(LOOK_SETS.some((set) => set.layers.inner !== null)).toBe(true);
    expect(LOOK_SETS.some((set) => set.layers.legwear !== null)).toBe(true);
    expect(LOOK_SETS.some((set) => set.accessories.length > 0)).toBe(true);
    expect(LOOK_SETS.filter((set) => set.hairColor !== undefined).length).toBeGreaterThanOrEqual(2);
  });

  it("세트 안에서 서로 충돌하는 슬롯 프리셋(카탈로그 conflictsWith)을 함께 쓰지 않는다", () => {
    for (const set of LOOK_SETS) {
      const slotPresets = [set.slots.top, set.slots.bottom, set.slots.shoes, set.slots.accessory].filter((id): id is PresetId => id !== null);
      for (const id of slotPresets) {
        const conflicts = CATALOG.get(id)?.conflictsWith ?? [];
        for (const other of slotPresets) expect(conflicts.includes(other), `${set.id}: ${id} ↔ ${other}`).toBe(false);
      }
    }
  });

  it("세트는 깊이 동결돼 있다", () => {
    expect(Object.isFrozen(LOOK_SETS)).toBe(true);
    for (const set of LOOK_SETS) {
      expect(Object.isFrozen(set.colors)).toBe(true);
      expect(Object.isFrozen(set.slots)).toBe(true);
    }
  });
});

describe("presets/accessory-anchors", () => {
  it("어휘 소품 6종 모두 어울리는 앵커가 있고 계약 앵커 14곳 안이다", () => {
    expect(Object.keys(ACCESSORY_ANCHOR_AFFINITY).sort()).toEqual([...SLOT_PRESET_IDS.accessory].sort());
    for (const [name, anchors] of Object.entries(ACCESSORY_ANCHOR_AFFINITY)) {
      expect(anchors.length, name).toBeGreaterThan(0);
      for (const anchor of anchors) expect(ACCESSORY_ANCHORS as readonly string[]).toContain(anchor);
      expect(accessoryAnchorsFor(`accessory/${name}`)).toBe(anchors);
    }
    expect(accessoryAnchorsFor("accessory/glasses")).toEqual(["face"]);
    expect(accessoryAnchorsFor("top/tee")).toEqual([]);
    expect(accessoryAnchorsFor("accessory/unknown-thing")).toEqual([]);
  });
});

describe("presets/layering", () => {
  it("상의·하의 어휘 전부에 표가 있고, 값은 그 층에 입힐 수 있는 다른 프리셋이다", () => {
    for (const layer of WARDROBE_LAYERS) {
      const baseSlot = layer === "legwear" ? "bottom" : "top";
      expect(Object.keys(WARDROBE_LAYER_COMPATIBILITY[layer]).sort(), layer).toEqual(SLOT_PRESET_IDS[baseSlot].map((name) => `${baseSlot}/${name}`).sort());
      for (const [base, options] of Object.entries(WARDROBE_LAYER_COMPATIBILITY[layer])) {
        for (const option of options) {
          expect(isLayerPreset(layer, option), `${layer}: ${option}`).toBe(true);
          expect(option, `${layer}: ${base}`).not.toBe(base);
          expect(CATALOG.get(option)).toBeDefined();
        }
      }
    }
    // 그럴듯하지 않은 조합은 비어 있다
    expect(layerOptionsFor("legwear", "bottom/jeans")).toEqual([]);
    expect(layerOptionsFor("outer", "top/blazer")).toEqual([]);
    expect(layerOptionsFor("inner", null)).toEqual([]);
    expect(layerOptionsFor("legwear", "bottom/pleated-skirt")).toContain("bottom/shorts");
  });

  it("코디 세트의 층은 모두 궁합 표 안에 있다", () => {
    for (const set of LOOK_SETS) {
      const bases = { inner: set.slots.top, outer: set.slots.top, legwear: set.slots.bottom } as const;
      for (const layer of WARDROBE_LAYERS) {
        const preset = set.layers[layer];
        if (preset !== null) expect(layerOptionsFor(layer, bases[layer]), `${set.id}: ${layer} ${preset}`).toContain(preset);
      }
    }
  });
});

describe("presets/look-sets: 적용(look/1 문서)", () => {
  const recipes: ReadonlyArray<readonly [string, CharacterRecipe]> = [
    ["절차 기본", createDefaultRecipe()],
    ["키트 기본", createKitDefaultRecipe()],
    ["절차 꾸민", customizedRecipe(createDefaultRecipe())],
  ];

  it("모든 세트 × 레시피: 계약 룩 스키마를 통과하고 적용 결과가 레시피 v3 스키마를 통과한다", () => {
    for (const set of LOOK_SETS) {
      for (const [label, recipe] of recipes) {
        const composed = composeLookSetLook(set, recipe);
        expect(composed.ok, `${set.id}/${label}`).toBe(true);
        if (!composed.ok) continue;
        expect(characterLookSchema.safeParse(composed.look).success).toBe(true);
        expect(composed.look).toMatchObject({ id: `set-${set.id}`, nameKo: set.nameKo, scope: "full", locks: [] });
        const applied = applyCharacterLook(recipe, composed.look);
        expect(applied.ok, `${set.id}/${label}: ${applied.ok ? "" : applied.failure.reasonKo}`).toBe(true);
        if (applied.ok) expect(characterRecipeSchema.safeParse(applied.recipe).success).toBe(true);
      }
    }
  });

  it("의상 구역(슬롯 4·옷장·의상 채널 색·의상 표면)만 세트 값으로 바꾸고 의상 밖 사용자 값은 그대로 둔다", () => {
    const recipe = customizedRecipe(createDefaultRecipe());
    for (const set of LOOK_SETS) {
      const composed = composeLookSetLook(set, recipe);
      if (!composed.ok) throw new Error(composed.failure.reasonKo);
      const applied = applyCharacterLook(recipe, composed.look);
      if (!applied.ok) throw new Error(applied.failure.reasonKo);
      const next = applied.recipe;
      // 의상 구역
      expect(next.slots.top).toBe(set.slots.top);
      expect(next.slots.bottom).toBe(set.slots.bottom);
      expect(next.slots.shoes).toBe(set.slots.shoes);
      expect(next.slots.accessory).toBe(set.slots.accessory);
      expect(next.wardrobe).toEqual(lookSetWardrobe(set));
      for (const key of OUTFIT_CHANNEL_KEYS) {
        expect(next.colors[key], `${set.id}: ${key}`).toBe(set.colors[key] ?? (isBaseChannelKey(key) ? recipe.colors[key] : undefined));
        expect(next.surfaces[key], `${set.id}: ${key}`).toEqual(set.surfaces[key]);
      }
      // 의상 밖: 헤어·얼굴·몸 슬롯, 파라미터, 의상 밖 채널 색·표면, 형태 값
      expect(next.slots.hair).toBe("hair/twin-tail");
      expect(next.slots.eyes).toBe("eyes/wide");
      expect(next.slots.body).toBe("body/athletic");
      expect(next.body).toEqual(recipe.body);
      expect(next.face).toEqual(recipe.face);
      for (const key of ["skin", "hair", "lip", "hair-tip"] as const) expect(next.colors[key], `${set.id}: ${key}`).toBe(recipe.colors[key]);
      expect(next.surfaces.hair).toEqual(recipe.surfaces.hair);
      expect(next.partParams).toEqual(recipe.partParams);
      expect(next.hairColor).toEqual(set.hairColor ?? recipe.hairColor);
      expect(next.shading).toEqual(recipe.shading);
      expect(next.style).toEqual(recipe.style);
    }
  });

  it("세트에 없는 의상 상속 채널은 상속으로 돌아가고(직접 지정 해제) 추가 소품 id는 acc-1부터다", () => {
    const set = lookSetById("casual-denim-tee");
    if (!set) throw new Error("세트 없음");
    const recipe = customizedRecipe(createDefaultRecipe());
    const composed = composeLookSetLook(set, recipe);
    if (!composed.ok) throw new Error(composed.failure.reasonKo);
    const applied = applyCharacterLook(recipe, composed.look);
    if (!applied.ok) throw new Error(applied.failure.reasonKo);
    expect(applied.recipe.colors["top-trim"]).toBeUndefined();
    // 사용자가 상의 채널에 준 가죽 표면은 의상 채널이라 세트 값(없음)으로 바뀐다
    expect(applied.recipe.surfaces.top).toBeUndefined();
    expect(applied.recipe.wardrobe.accessories).toEqual([]);
    const street = lookSetById("casual-street-layered");
    if (!street) throw new Error("세트 없음");
    expect(lookSetWardrobe(street).accessories.map((instance) => instance.id)).toEqual(["acc-1"]);
  });
});
