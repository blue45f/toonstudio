/**
 * 레시피 파일 경로 통일 결정(2026-10-01, README §7)의 근거 테스트.
 *
 * 결정: 사용자 저장/열기는 ExportPanel의 `export/recipe-file.ts`(`*.character.json`, 페인트 레이어 PNG 내장) 하나로 통일하고,
 * `state/recipe-io.ts`(`character-<digest8>.json`)는 정규형 직렬화와 파일 접근 capability 판정용으로 유지한다.
 * 두 영역은 서로 import할 수 없으므로(영역 경계), 둘이 같은 바이트·같은 레시피를 주고받는지는 영역 위의 app 층인 여기서 검증한다.
 * 이 계약이 깨지면 "둘 다 읽을 수 있다"는 README 설명과 ExportPanel의 `accept` 목록이 거짓이 된다.
 */
import { describe, expect, it } from "vitest";

import { mergeLook, recipeDigest } from "../contracts";
import { embedPaintLayers, extractPaintLayers, parseRecipeFile, recipeFileName as exportFileName, serializeRecipe as exportSerialize, RECIPE_FILE_SUFFIX } from "../export/recipe-file";
import { createPaintLayer } from "../paint/paint-layer";
import { bytesEqual } from "../shared/typed-array";
import { RECIPE_FILE_NAME_PATTERN, deserializeRecipe, recipeFileName as stateFileName, serializeRecipe as stateSerialize } from "../state/recipe-io";
import { defaultRecipeFixture, legacyRecipeV1Fixture, legacyRecipeV2Fixture, recipeWithSlots } from "../testing/recipe-fixtures";

import type { CharacterRecipe } from "../contracts";

/** 슬롯·색·체형 파라미터를 기본값에서 바꾼 레시피(정규형이 키 순서·숫자에 의존하는지 보려는 입력). */
function customizedRecipe(): CharacterRecipe {
  const base = recipeWithSlots({ hair: "hair/soft-bob", top: null });
  return { ...base, body: { ...base.body, height: 0.35 }, colors: { ...base.colors, skin: "#c8a080" } };
}

/** 레시피 v3 전용 필드를 모두 기본값에서 바꾼 레시피(2026-10-23 CORE-1) */
function customizedV3Recipe(): CharacterRecipe {
  const base = customizedRecipe();
  return {
    ...base,
    colors: { ...base.colors, "top-trim": "#223344", lip: "#bb4455" },
    wardrobe: {
      inner: "top/shirt",
      outer: "top/blazer",
      legwear: null,
      accessories: [{ id: "acc-1", presetId: "accessory/ribbon", anchor: "hair", offset: { tMm: [0, 12, 0], rDeg: [0, 0, 15], scale: 1.1 } }],
    },
    partParams: { outer: { length: 0.4 }, "acc-1": { fit: -0.2 } },
    surfaces: { top: { material: "cloth-knit", pattern: { kind: "stripe", scaleCm: 1.5, angleDeg: 30, ratio: 0.4, inkChannel: "top-trim" } } },
    hairColor: { gradient: [0.5, 1], tipMix: 0.3, accent: "inner" },
    shading: { ...base.shading, look: mergeLook(base.shading.look, { line: { widthMm: 6, inner: { enabled: true } }, tone: { kind: "halftone" } }) },
    style: { packId: "kr-webtoon-romance", packRevision: 1, proportion: null, neutralFacs: { browInnerUp: 0.1 } },
  };
}

describe("레시피 파일 상호 읽기(state/recipe-io ↔ export/recipe-file)", () => {
  it("두 serializeRecipe는 같은 정규형 바이트를 낸다(키 정렬·2칸 들여쓰기·끝 개행)", () => {
    for (const recipe of [defaultRecipeFixture(), customizedRecipe()]) {
      const text = stateSerialize(recipe);
      expect(exportSerialize(recipe)).toBe(text);
      expect(text.endsWith("}\n")).toBe(true);
    }
  });

  it("state가 저장한 파일을 export가 열고, export가 저장한 파일을 state가 연다(레시피·digest 동일)", () => {
    const recipe = customizedRecipe();
    const fromState = parseRecipeFile(stateSerialize(recipe));
    if (!fromState.ok) throw new Error(fromState.failure.reasonKo);
    expect(fromState.recipe).toEqual(recipe);
    expect(recipeDigest(fromState.recipe)).toBe(recipeDigest(recipe));

    const fromExport = deserializeRecipe(exportSerialize(recipe));
    if (!fromExport.ok) throw new Error(fromExport.failure.reasonKo);
    expect(fromExport.recipe).toEqual(recipe);
    expect(recipeDigest(fromExport.recipe)).toBe(recipeDigest(recipe));
  });

  it("페인트 레이어를 내장한 레시피 파일도 두 파서가 같은 레시피로 열고, export가 레이어 픽셀을 그대로 복원한다", async () => {
    const layer = createPaintLayer("skin", 8);
    for (let i = 0; i < layer.rgba.length; i += 4) {
      layer.rgba[i] = (i / 4) * 7;
      layer.rgba[i + 1] = 40;
      layer.rgba[i + 2] = 90;
      layer.rgba[i + 3] = i % 8 === 0 ? 255 : 0;
    }
    const withPaint = await embedPaintLayers(customizedRecipe(), [layer]);
    expect(withPaint.paint.layers).toHaveLength(1);
    const text = exportSerialize(withPaint);

    const viaExport = parseRecipeFile(text);
    const viaState = deserializeRecipe(text);
    if (!viaExport.ok) throw new Error(viaExport.failure.reasonKo);
    if (!viaState.ok) throw new Error(viaState.failure.reasonKo);
    expect(viaState.recipe).toEqual(viaExport.recipe);

    const extracted = await extractPaintLayers(viaState.recipe);
    expect(extracted.failures).toEqual([]);
    expect(extracted.layers).toHaveLength(1);
    expect(extracted.layers[0]?.part).toBe("skin");
    expect(bytesEqual(extracted.layers[0]?.rgba ?? new Uint8ClampedArray(0), layer.rgba)).toBe(true);
  });

  it("손상된 JSON·알 수 없는 키는 두 파서가 같은 코드의 LabFailure로 거절한다(throw·무음 통과 없음)", () => {
    const broken = "{ not json";
    const a = parseRecipeFile(broken, 7);
    const b = deserializeRecipe(broken, 7);
    expect(!a.ok && a.failure.code).toBe("recipe-json-syntax");
    expect(!b.ok && b.failure.code).toBe("recipe-json-syntax");

    const unknownKey = JSON.stringify({ ...defaultRecipeFixture(), surprise: 1 });
    const c = parseRecipeFile(unknownKey, 7);
    const d = deserializeRecipe(unknownKey, 7);
    expect(c.ok).toBe(false);
    expect(d.ok).toBe(false);
    expect(!c.ok && !d.ok && c.failure.code).toBe(!d.ok ? d.failure.code : "");
  });

  it("레시피 v3 커스터마이즈(채널·옷장·소품·표면·형태·헤어 흐름·look·화풍)도 두 파서가 같은 바이트·레시피로 주고받는다", () => {
    const recipe = customizedV3Recipe();
    const text = stateSerialize(recipe);
    expect(exportSerialize(recipe)).toBe(text);
    for (const parsed of [parseRecipeFile(text), deserializeRecipe(text)]) {
      if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
      expect(parsed.recipe).toEqual(recipe);
      expect(parsed.migratedFrom).toBeUndefined();
      expect(recipeDigest(parsed.recipe)).toBe(recipeDigest(recipe));
    }
  });

  it("레시피 v2·v1 파일은 두 파서가 같은 v3 레시피로 올리고 migratedFrom을 알린다", () => {
    const recipe = customizedRecipe();
    for (const [legacy, from] of [[legacyRecipeV2Fixture(recipe), 2], [legacyRecipeV1Fixture(recipe), 1]] as const) {
      const text = JSON.stringify(legacy);
      const viaExport = parseRecipeFile(text);
      const viaState = deserializeRecipe(text);
      if (!viaExport.ok) throw new Error(viaExport.failure.reasonKo);
      if (!viaState.ok) throw new Error(viaState.failure.reasonKo);
      expect(viaExport.migratedFrom).toBe(from);
      expect(viaState.migratedFrom).toBe(from);
      expect(viaExport.recipe).toEqual(recipe);
      expect(viaState.recipe).toEqual(recipe);
    }
  });

  it("두 파일 이름 규칙은 같은 digest 앞 8자리를 쓰고, export 이름도 ExportPanel 열기 필터(.character.json·.json)에 걸린다", () => {
    const recipe = customizedRecipe();
    const digest8 = recipeDigest(recipe).slice(0, 8);
    const stateName = stateFileName(recipe);
    const exportName = exportFileName(recipe, new Date(Date.UTC(2026, 9, 1)));
    expect(stateName).toBe(`character-${digest8}.json`);
    expect(RECIPE_FILE_NAME_PATTERN.test(stateName)).toBe(true);
    expect(exportName).toBe(`character-${digest8}-20261001${RECIPE_FILE_SUFFIX}`);
    expect(exportName.endsWith(".json")).toBe(true);
  });
});
