import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_CATALOG } from "../../character-shaper/character-shaper-catalog";
import { isCharacterPartPresetV1 } from "./character-part-preset";
import { LEGACY_LOOK_FORMAT, legacyAppearancePresets, readLegacyAppearance, readLegacyLookLibrary } from "./legacy-character-appearance";

const look = {
  format: LEGACY_LOOK_FORMAT, id: "look-hero", nameKo: "주인공", scope: "full", locks: [],
  payload: {
    slots: { hair: "hair/soft-bob", top: "top/custom-mesh" },
    colors: { hair: "#665544", top: "#ff5500" },
  },
};

describe("이전 캐릭터 작업에서 호환 프리셋 가져오기", () => {
  it("기존 룩·v1–3 레시피의 헤어와 색을 실제 Studio 카탈로그에 연결한다", async () => {
    const appearance = readLegacyAppearance(look, "hero.look.json", CHARACTER_SLOT_CATALOG);
    expect(appearance.parts.map((part) => part.key)).toEqual(["hair", "color-hairBase", "color-top"]);
    expect(appearance.parts[0]?.payload.selections?.[0]?.entryId).toBe("hair:bob");
    const presets = await legacyAppearancePresets(appearance);
    expect(presets.every(isCharacterPartPresetV1)).toBe(true);
    expect((await legacyAppearancePresets(appearance)).map((part) => part.presetId)).toEqual(presets.map((part) => part.presetId));
    for (const version of [1, 2, 3]) {
      const recipe = { version, source: { kind: "procedural" }, pose: {}, paint: { layers: [] }, ...look.payload };
      expect(readLegacyAppearance(recipe, "hero.character.json", CHARACTER_SLOT_CATALOG).parts).toEqual(appearance.parts);
    }
    expect(look.payload.slots.top).toBe("top/custom-mesh");
  });

  it("패키지 레시피와 전체·색 룩이 별도로 저장한 명시적 헤어 틴트를 복구한다", () => {
    const hairColor = { packageBaseTint: "#3f82c1" };
    const recipe = { ...look.payload, version: 3, source: { kind: "package" }, pose: {}, paint: {}, hairColor };
    const readHair = (input: unknown) => readLegacyAppearance(input, "hero.json", CHARACTER_SLOT_CATALOG)
      .parts.find(part => part.key === "color-hairBase")?.payload.colors?.hairBase;
    expect(readHair(recipe)).toBe("#3f82c1");
    expect(readHair({ ...recipe, hairColor: {} })).toBeUndefined();
    expect(readHair({ ...recipe, source: { kind: "kit" } })).toBe("#665544");
    for (const scope of ["full", "colors"]) {
      expect(readHair({ ...look, scope, payload: { ...look.payload, hairColor } })).toBe("#3f82c1");
    }
  });

  it("알 수 없는 버전·잘못된 색·관련 없는 JSON은 프리셋으로 바꾸지 않는다", () => {
    for (const value of [{ version: 4 }, { slots: {}, colors: {} }, { ...look, payload: { colors: { hair: "invalid" } } }]) {
      expect(() => readLegacyAppearance(value, "file.json", CHARACTER_SLOT_CATALOG)).toThrow();
    }
  });

  it("기존 라이브러리에서 원본 룩을 그대로 읽고 손상된 저장본에는 쓰지 않는다", () => {
    const text = JSON.stringify({ format: "toonstudio.character-lab.look-library/1", entries: [{ look, savedAt: 1, updatedAt: 2 }] });
    expect(readLegacyLookLibrary(text)).toEqual([{ name: "주인공", look }]);
    expect(readLegacyLookLibrary(null)).toEqual([]);
    expect(() => readLegacyLookLibrary('{"entries":[]}')).toThrow();
  });
});
