import { describe, expect, it } from "vitest";
import { z } from "zod";

import { LOOK_V2_IDENTITY, mergeLook } from "./art-style";
import {
  CHARACTER_LOOK_FORMAT,
  LOOK_LOCK_GROUPS,
  LOOK_PAYLOAD_SECTIONS,
  LOOK_SCOPES,
  LOOK_SCOPE_LABELS_KO,
  LOOK_SCOPE_SECTIONS,
  characterLookSchemaFor,
  isCharacterLookFormat,
} from "./character-look";
import { applyCharacterLook, characterLookSchema, extractCharacterLook, parseCharacterLook } from "./character-look-recipe";
import { createDefaultRecipe, createKitDefaultRecipe } from "./recipe";

import type { CharacterLook } from "./character-look-recipe";
import type { CharacterRecipe } from "./recipe";

/** 화풍·옷장·형태·표면·채널을 모두 쓴 레시피 */
function customizedRecipe(): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    slots: { ...base.slots, hair: "hair/twin-tail", top: "top/shirt", bottom: "bottom/pleated-skirt", shoes: "shoes/loafers", accessory: "accessory/ribbon", eyes: "eyes/wide" },
    body: { height: 0.3 },
    face: { eyeSize: 0.6 },
    colors: { ...base.colors, hair: "#6fbfa3", top: "#cc2244", "top-trim": "#ffffff", lip: "#aa3344" },
    shading: { ...base.shading, toon: { ...base.shading.toon, rampSteps: 2, rim: false }, look: mergeLook(LOOK_V2_IDENTITY, { line: { widthMm: 3 } }) },
    style: { packId: "jp-anime-cel", packRevision: 2, proportion: null, neutralFacs: { browDown: 0.1 } },
    wardrobe: { inner: null, outer: "top/blazer", legwear: "bottom/jeans", accessories: [{ id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset: { tMm: [0, 2, 0], rDeg: [0, 0, 0], scale: 1 } }] },
    partParams: { hair: { length: 0.5 }, outer: { length: -0.2 }, "acc-1": { fit: 0.3 } },
    surfaces: { top: { material: "cloth-knit", pattern: { kind: "check", scaleCm: 2, angleDeg: 0, ratio: 0.4, inkChannel: "top-trim" } } },
    hairColor: { gradient: [0.4, 1], tipMix: 0.6, accent: "streak" },
  };
}

const META = { id: "my-look", nameKo: "내 룩" } as const;

describe("contracts/character-look(봉투)", () => {
  const toy = characterLookSchemaFor(z.object({ colors: z.record(z.string(), z.string()).optional(), face: z.object({}).optional(), wardrobe: z.object({}).optional(), bogus: z.number().optional() }).strict());
  const doc = (overrides: Record<string, unknown> = {}) => ({ format: CHARACTER_LOOK_FORMAT, id: "a", nameKo: "가", scope: "colors", payload: { colors: {} }, locks: [], ...overrides });

  it("범위·구역·잠금 어휘와 범위별 허용 구역", () => {
    expect(LOOK_SCOPES).toHaveLength(5);
    expect(LOOK_LOCK_GROUPS).toEqual(["face", "body", "colors", "outfit", "accessories", "style"]);
    for (const scope of LOOK_SCOPES) {
      expect(LOOK_SCOPE_LABELS_KO[scope]).toMatch(/[가-힣]/u);
      for (const section of LOOK_SCOPE_SECTIONS[scope]) expect(LOOK_PAYLOAD_SECTIONS).toContain(section);
    }
    expect(LOOK_SCOPE_SECTIONS.full).toEqual(LOOK_PAYLOAD_SECTIONS);
  });

  it("봉투 스키마: 형식·id·이름·시드·잠금 중복·빈 payload·범위 밖 구역·모르는 구역을 거부한다", () => {
    expect(toy.safeParse(doc()).success).toBe(true);
    expect(toy.safeParse(doc({ seed: 0xffffffff, locks: ["face", "style"] })).success).toBe(true);
    expect(toy.safeParse(doc({ format: "toonstudio.character-lab.look/2" })).success).toBe(false);
    expect(toy.safeParse(doc({ id: "My Look" })).success).toBe(false);
    expect(toy.safeParse(doc({ nameKo: "   " })).success).toBe(false);
    expect(toy.safeParse(doc({ nameKo: "가".repeat(41) })).success).toBe(false);
    expect(toy.safeParse(doc({ seed: -1 })).success).toBe(false);
    expect(toy.safeParse(doc({ seed: 1.5 })).success).toBe(false);
    expect(toy.safeParse(doc({ locks: ["face", "face"] })).error?.issues[0]?.message).toContain("중복");
    expect(toy.safeParse(doc({ payload: {} })).error?.issues[0]?.message).toContain("비어");
    expect(toy.safeParse(doc({ payload: { face: {} } })).error?.issues[0]?.message).toContain("담을 수 없습니다");
    expect(toy.safeParse(doc({ scope: "full", payload: { bogus: 1 } })).error?.issues[0]?.message).toContain("알 수 없는 payload 구역");
    expect(toy.safeParse(doc({ extra: 1 })).success).toBe(false);
  });

  it("isCharacterLookFormat은 형식 문자열만 본다", () => {
    expect(isCharacterLookFormat({ format: CHARACTER_LOOK_FORMAT })).toBe(true);
    expect(isCharacterLookFormat({ format: "x" })).toBe(false);
    expect(isCharacterLookFormat(null)).toBe(false);
  });
});

describe("contracts/character-look-recipe(캐릭터 랩 payload)", () => {
  it("full 추출 → 다른 레시피에 적용하면 외형 필드가 같아지고 연기·소스·물리·페인트·셰이딩 품질은 대상 것이 남는다", () => {
    const source = customizedRecipe();
    const target: CharacterRecipe = { ...createKitDefaultRecipe("male"), expression: { mouthSmile: 0.4 }, pose: { head: [0, 0, 0, 1] } };
    const look = extractCharacterLook(source, "full", META);
    expect(characterLookSchema.safeParse(look).success).toBe(true);
    const applied = applyCharacterLook(target, look);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const recipe = applied.recipe;
    for (const field of ["body", "face", "colors", "style", "wardrobe", "partParams", "surfaces", "hairColor"] as const) expect(recipe[field], field).toEqual(source[field]);
    expect(recipe.shading.look).toEqual(source.shading.look);
    expect(recipe.shading.toon).toEqual({ ...target.shading.toon, rampSteps: 2, rim: false, outline: source.shading.toon.outline });
    expect(recipe.slots.hair).toBe("hair/twin-tail");
    expect([recipe.source, recipe.expression, recipe.pose, recipe.physics, recipe.paint]).toEqual([target.source, target.expression, target.pose, target.physics, target.paint]);
    expect([recipe.shading.mode, recipe.shading.shadows]).toEqual([target.shading.mode, target.shading.shadows]);
    // 연기 슬롯은 룩 범위 밖이다
    expect(recipe.slots.pose).toBe(target.slots.pose);
  });

  it("추출은 결정적이고 입력을 바꾸지 않는다", () => {
    const source = customizedRecipe();
    const snapshot = structuredClone(source);
    expect(extractCharacterLook(source, "full", META)).toEqual(extractCharacterLook(source, "full", META));
    expect(source).toEqual(snapshot);
  });

  it("outfit 범위는 의상 슬롯·옷장·의상 채널·표면·헤어 밖 형태만 바꾸고 범위 안 상속 채널 지정은 교체한다", () => {
    const source = customizedRecipe();
    const target: CharacterRecipe = { ...createDefaultRecipe(), colors: { ...createDefaultRecipe().colors, "outer-trim": "#010101", lip: "#202020" }, partParams: { hair: { volume: 0.9 } } };
    const look = extractCharacterLook(source, "outfit", META);
    expect(Object.keys(look.payload).sort()).toEqual(["colors", "partParams", "slots", "surfaces", "wardrobe"]);
    expect(Object.keys(look.payload.slots ?? {}).sort()).toEqual(["accessory", "bottom", "shoes", "top"]);
    expect(look.payload.colors?.hair).toBeUndefined();
    const applied = applyCharacterLook(target, look);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const recipe = applied.recipe;
    expect(recipe.slots.top).toBe("top/shirt");
    expect(recipe.slots.hair).toBe(target.slots.hair);
    expect(recipe.wardrobe).toEqual(source.wardrobe);
    expect(recipe.colors.top).toBe("#cc2244");
    expect(recipe.colors["top-trim"]).toBe("#ffffff");
    // 범위 안(의상 채널)인데 룩에 없는 상속 지정은 지워져 상속으로 돌아간다. 범위 밖(입술)은 그대로다.
    expect(recipe.colors["outer-trim"]).toBeUndefined();
    expect(recipe.colors.lip).toBe("#202020");
    expect(recipe.colors.hair).toBe(target.colors.hair);
    expect(recipe.partParams).toEqual({ hair: { volume: 0.9 }, outer: { length: -0.2 }, "acc-1": { fit: 0.3 } });
    expect(recipe.surfaces).toEqual(source.surfaces);
    expect(recipe.face).toEqual(target.face);
  });

  it("colors·face·style 범위는 각자 구역만 바꾼다", () => {
    const source = customizedRecipe();
    const target = createDefaultRecipe();
    const colors = applyCharacterLook({ ...target, colors: { ...target.colors, "shoes-lace": "#123456" } }, extractCharacterLook(source, "colors", META));
    expect(colors.ok && colors.recipe.colors).toEqual(source.colors);
    expect(colors.ok && colors.recipe.hairColor).toEqual(source.hairColor);
    expect(colors.ok && colors.recipe.slots).toEqual(target.slots);
    const face = applyCharacterLook(target, extractCharacterLook(source, "face", META));
    expect(face.ok && face.recipe.slots.eyes).toBe("eyes/wide");
    expect(face.ok && face.recipe.face).toEqual(source.face);
    expect(face.ok && face.recipe.body).toEqual(target.body);
    expect(face.ok && face.recipe.slots.top).toBe(target.slots.top);
    const style = applyCharacterLook(target, extractCharacterLook(source, "style", META));
    expect(style.ok && style.recipe.style).toEqual(source.style);
    expect(style.ok && style.recipe.shading.look).toEqual(source.shading.look);
    expect(style.ok && style.recipe.shading.toon.rampSteps).toBe(2);
    expect(style.ok && style.recipe.shading.toon.faceSdfShadow).toBe(target.shading.toon.faceSdfShadow);
    expect(style.ok && style.recipe.colors).toEqual(target.colors);
  });

  it("범위 키 검사: 범위 밖 슬롯·채널·형태 범위, 다른 슬롯 프리셋, 같은 채널 패턴을 거부한다", () => {
    const base = { format: CHARACTER_LOOK_FORMAT, id: "x", nameKo: "엑스", locks: [] };
    const reason = (look: Record<string, unknown>): string => {
      const result = parseCharacterLook({ ...base, ...look });
      if (result.ok) throw new Error("통과하면 안 됩니다");
      expect(result.failure.code).toBe("look-invalid");
      return result.failure.reasonKo;
    };
    expect(reason({ scope: "face", payload: { slots: { top: "top/tee" } } })).toContain("슬롯 top");
    expect(reason({ scope: "face", payload: { slots: { eyes: "top/tee" } } })).toContain("다른 슬롯 프리셋");
    expect(reason({ scope: "outfit", payload: { colors: { skin: "#ffffff" } } })).toContain("채널 skin");
    expect(reason({ scope: "outfit", payload: { partParams: { hair: { length: 0.1 } } } })).toContain("형태 범위 hair");
    expect(reason({ scope: "outfit", payload: { surfaces: { top: { material: "cloth-cotton", pattern: { kind: "dot", scaleCm: 1, angleDeg: 0, ratio: 0.5, inkChannel: "top" } } } } })).toContain("바탕 채널");
    expect(reason({ scope: "colors", payload: { wardrobe: { inner: null, outer: null, legwear: null, accessories: [] } } })).toContain("담을 수 없습니다");
    const format = parseCharacterLook({ format: "other" });
    expect(!format.ok && format.failure.code).toBe("look-format");
    expect(parseCharacterLook(null).ok).toBe(false);
  });

  it("옷장만 바꾸는 룩은 사라진 소품 인스턴스의 형태 값을 함께 지운다", () => {
    const target = customizedRecipe();
    const look: CharacterLook = { format: CHARACTER_LOOK_FORMAT, id: "wardrobe-only", nameKo: "옷장만", scope: "outfit", payload: { wardrobe: { inner: "top/tee", outer: null, legwear: null, accessories: [] } }, locks: ["colors"] };
    const applied = applyCharacterLook(target, look);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.recipe.wardrobe).toEqual(look.payload.wardrobe);
    expect(applied.recipe.partParams).toEqual({ hair: { length: 0.5 }, outer: { length: -0.2 } });
    expect(applied.recipe.colors).toEqual(target.colors);
  });

  it("적용 결과가 레시피 형식에 맞지 않으면 한글 사유로 실패하고 대상은 바꾸지 않는다", () => {
    const target = createDefaultRecipe();
    const broken = { format: CHARACTER_LOOK_FORMAT, id: "bad", nameKo: "망가진 룩", scope: "colors", payload: { colors: { skin: "#XYZXYZ" } }, locks: [] } as unknown as CharacterLook;
    const applied = applyCharacterLook(target, broken);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.failure.code).toBe("look-apply-invalid");
    expect(applied.failure.reasonKo).toContain("망가진 룩");
    expect(target).toEqual(createDefaultRecipe());
  });
});
