import { describe, expect, it } from "vitest";

import { createDefaultRecipe, recipeDigest } from "../contracts";
import { bytesEqual } from "../shared/typed-array";
import { defaultRecipeFixture } from "../testing/recipe-fixtures";

import {
  MAX_RECIPE_FILE_BYTES,
  RECIPE_FILE_SUFFIX,
  buildShaperProjectArchiveEntries,
  characterRecipeToShaperProjectState,
  computeShaperViewportCameraRect,
  embedPaintLayers,
  evaluateShaperNumericInput,
  evaluateShaperPresetAssetUpdates,
  extractPaintLayers,
  formatShaperInputStyleGuide,
  parseRecipeFile,
  parseShaperPartPreset,
  parseShaperPresetTextToRecipe,
  parseShaperProjectArchiveEntries,
  parseShaperStylePreset,
  recipeFileName,
  serializeRecipe,
  serializeShaperPartPreset,
  serializeShaperStylePreset,
  shaperPresetToCharacterRecipe,
} from "./recipe-file";

import type { PaintLayer } from "../contracts";

describe("recipe-file", () => {
  it("serialize → parse 왕복이 같고 키 순서와 무관하게 바이트가 결정적이다", () => {
    const recipe = defaultRecipeFixture();
    const text = serializeRecipe(recipe);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseRecipeFile(text);
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    expect(parsed.recipe).toEqual(recipe);
    expect(recipeDigest(parsed.recipe)).toBe(recipeDigest(recipe));
    const shuffled = { ...recipe, version: recipe.version, slots: { ...recipe.slots } };
    expect(serializeRecipe(shuffled)).toBe(text);
  });

  it("JSON 문법 오류·미지원 버전·형식 오류는 한글 사유를 가진 LabFailure다", () => {
    const syntax = parseRecipeFile("{ not json", 3);
    expect(!syntax.ok && syntax.failure.code).toBe("recipe-json-syntax");
    expect(!syntax.ok && syntax.failure.at).toBe(3);
    const future = parseRecipeFile(JSON.stringify({ ...createDefaultRecipe(), version: 4 }));
    expect(!future.ok && future.failure.code).toBe("recipe-unsupported-version");
    expect(!future.ok && future.failure.reasonKo).toMatch(/지원하지 않는 레시피 버전/u);
    const invalid = parseRecipeFile(JSON.stringify({ ...createDefaultRecipe(), colors: { skin: "red" } }));
    expect(!invalid.ok && invalid.failure.code).toBe("recipe-invalid");
    const huge = parseRecipeFile("x".repeat(MAX_RECIPE_FILE_BYTES + 1));
    expect(!huge.ok && huge.failure.code).toBe("recipe-file-too-large");
  });

  it("파일명은 digest 8자리와 날짜를 담는다", () => {
    const recipe = defaultRecipeFixture();
    const name = recipeFileName(recipe, new Date(Date.UTC(2026, 9, 1)));
    expect(name).toBe(`character-${recipeDigest(recipe).slice(0, 8)}-20261001${RECIPE_FILE_SUFFIX}`);
  });

  it("페인트 레이어를 PNG base64로 넣고 꺼내면 바이트가 같다(빈 레이어 제외, 손상 레코드는 사유)", async () => {
    const painted: PaintLayer = { part: "skin", width: 8, height: 8, rgba: new Uint8ClampedArray(8 * 8 * 4).fill(90), revision: 2 };
    const empty: PaintLayer = { part: "hair", width: 8, height: 8, rgba: new Uint8ClampedArray(8 * 8 * 4), revision: 0 };
    const recipe = await embedPaintLayers(defaultRecipeFixture(), [painted, empty]);
    expect(recipe.paint.layers).toHaveLength(1);
    expect(recipe.paint.layers[0]?.part).toBe("skin");
    const reparsed = parseRecipeFile(serializeRecipe(recipe));
    if (!reparsed.ok) throw new Error(reparsed.failure.reasonKo);
    const extracted = await extractPaintLayers(reparsed.recipe);
    expect(extracted.failures).toHaveLength(0);
    expect(extracted.layers).toHaveLength(1);
    expect(bytesEqual(extracted.layers[0]?.rgba ?? [], painted.rgba)).toBe(true);

    const broken = await extractPaintLayers({ ...recipe, paint: { layers: [{ part: "top", width: 2, height: 2, pngBase64: "AAAA" }] } });
    expect(broken.layers).toHaveLength(0);
    expect(broken.failures[0]?.code).toBe("paint-layer-png");
  });

  it("SHAPER .preset 텍스트 DSL(LoadStyle / CreateHeadPartFromPreset)을 파싱해 CharacterRecipe v3로 변환한다", () => {
    const styleDsl = [
      "1.0",
      "hC*0.2/0.1/0.05,sC*0.95/0.8/0.7,ssT*2,ssC*0.7/0.5/0.5,ssL*0.45,ssW*0.2,olC*0.1/0.05/0.05,olT*1.2,olP*1,hID*1,lAX*25,lAY*-35",
    ].join("\n");
    const style = parseShaperStylePreset(styleDsl);
    expect(style.version).toBe("1.0");
    expect(style.hairColorHex).toBe("#331a0d");
    expect(style.skinColorHex).toBe("#f2ccb3");
    expect(style.shadePos).toBeCloseTo(0.45, 5);
    expect(style.outlinePressure).toBe(true);
    expect(style.disableHairInline).toBe(true);
    expect(style.lightAngleX).toBeCloseTo(25, 5);

    const partDsl = [
      "1.0",
      "mt*7,mid*1,name*hero_body,sex*1,muscle*0.8,fat*0.3,camP*0/1.5/-3/2,camR*5/180/0,camFov*30,cC*0.1/0.2/0.4,oR*0.75",
    ].join("\n");
    const part = parseShaperPartPreset(partDsl);
    expect(part.partType).toBe(7);
    expect(part.name).toBe("hero_body");
    expect(part.muscle).toBeCloseTo(0.8, 5);
    expect(part.camFov).toBeCloseTo(30, 5);
    expect(part.colorsHex).toEqual(["#1a3366"]);

    const converted = shaperPresetToCharacterRecipe({ style, part });
    expect(converted.version).toBe(3);
    expect(converted.colors.skin).toBe("#f2ccb3");
    expect(converted.colors.hair).toBe("#331a0d");
    expect(converted.colors.top).toBe("#1a3366");
    expect(converted.body.shoulderWidth).toBeCloseTo(0.6, 5);
    // 변환된 레시피가 직렬화·파싱 왕복 검증을 통과한다
    const roundtrip = parseRecipeFile(serializeRecipe(converted));
    expect(roundtrip.ok).toBe(true);
  });

  it("HeadPartsManager::CreatePreset 전체 토큰(v*, p*, h*, hp*, hb*, hbv*, l*, lp*, eblt*, acc*, cC*RRGGBB) 직렬화·역직렬화 왕복을 수행한다", () => {
    const fullPresetText = [
      "1.0",
      [
        "mt*0",
        "mid*2",
        "name*custom_head",
        "v*-0.2/1.5/0.1",
        "p*0.75",
        "h*1/0/0.1/0.9/2/2/0/1/2/0.3/0.4/10/20/0/1/1",
        "hp*0/1.6/0/90/0/0/1/1/1",
        "hb*3",
        "hbv*0/1/2/0.8/0.5/-0.088/-0.94",
        "l*5/0.1/0.9/1/0.02/1/2/1/0/0",
        "lt*0",
        "lp*2/2/0/1/2/0.25/0.5/0.015/0/0/1",
        "lpt*0",
        "ebtid*4",
        "eblt*-0.3/1.5/0.2/0/0/0/1/1/1",
        "ebrt*0.3/1.5/0.2/0/0/0/1/1/1",
        "sposC*0/1.4/0",
        "bN*RigLArmIK",
        "bP*-0.35/1.2/0.15",
        "bA*10/30/-25",
        "bS*1/1/1",
        "cC*FF8800",
        "oR*0.5",
        "acc*BoneHead/0/0.15/0/0/0/0/1/1/1",
      ].join(","),
    ].join("\n");

    const parsed = parseShaperPartPreset(fullPresetText);
    expect(parsed.controlVertices).toEqual([[-0.2, 1.5, 0.1]]);
    expect(parsed.controlPowers).toEqual([0.75]);
    expect(parsed.hairs?.[0]?.triangleVertexIds).toEqual([0, 1, 2]);
    expect(parsed.hairControlTransforms?.[0]?.position).toEqual([0, 1.6, 0]);
    expect(parsed.hairBaseMeshId).toBe(3);
    expect(parsed.hairBaseZones?.[0]?.offsetTy).toBeCloseTo(-0.94, 5);
    expect(parsed.lines?.[0]?.colorHex).toBe("#ff0000");
    expect(parsed.linePoints?.[0]?.thickness).toBeCloseTo(0.015, 5);
    expect(parsed.eyeballLeftTransform?.position).toEqual([-0.3, 1.5, 0.2]);
    expect(parsed.colorsHex).toEqual(["#ff8800"]);
    expect(parsed.accessories?.[0]?.parentName).toBe("BoneHead");

    const serialized = serializeShaperPartPreset(parsed);
    const reparsed = parseShaperPartPreset(serialized);
    expect(reparsed).toEqual(parsed);

    const styleSerialized = serializeShaperStylePreset({
      version: "1.0",
      hairColorHex: "#336699",
      outlinePressure: true,
    });
    const styleReparsed = parseShaperStylePreset(styleSerialized);
    expect(styleReparsed.hairColorHex).toBe("#336699");
    expect(styleReparsed.outlinePressure).toBe(true);
  });

  it("SaveProject/OpenProject .shaper 아카이브 엔트리(0..4.preset, 6, 7, 8..10, 11_k, 12, style.preset) 왕복을 수행한다", () => {
    const head0 = parseShaperPartPreset("1.0\nmt*0,mid*1,name*head_a,cC*FFCCAA");
    const hair6 = parseShaperPartPreset("1.0\nmt*6,mid*2,name*hair_a,hb*1,cC*223344");
    const body7 = parseShaperPartPreset("1.0\nmt*7,mid*0,muscle*0.4,fat*0.2,cC*FFCCAA");
    const acc0 = parseShaperPartPreset("1.0\nmt*11,mid*3,acc*BoneHead/0/0.1/0/0/0/0/1/1/1,cC*AABBCC");
    const pose12 = parseShaperPartPreset("1.0\nbN*RigLArmIK,bP*-0.3/1.2/0.1,bA*0/0/0,bS*1/1/1,camFov*25");

    const entries = buildShaperProjectArchiveEntries({
      headParts: { 0: head0 },
      hairPart: hair6,
      bodyPart: body7,
      accessories: [acc0],
      poseAndCamera: pose12,
      style: { version: "1.0", skinColorHex: "#ffccaa", outlineThickness: 1.5 },
    });

    expect(Object.keys(entries).sort()).toEqual([
      "0.preset",
      "11_0.preset",
      "12.preset",
      "6.preset",
      "7.preset",
      "style.preset",
    ]);

    const restored = parseShaperProjectArchiveEntries(entries);
    expect(restored.headParts[0]?.name).toBe("head_a");
    expect(restored.hairPart?.hairBaseMeshId).toBe(1);
    expect(restored.bodyPart?.muscle).toBeCloseTo(0.4, 5);
    expect(restored.accessories?.[0]?.accessories?.[0]?.parentName).toBe("BoneHead");
    expect(restored.poseAndCamera?.camFov).toBe(25);
    expect(restored.style?.outlineThickness).toBe(1.5);
  });

  it("characterRecipeToShaperProjectState와 parseShaperPresetTextToRecipe 및 서버 프리셋/UI 보조 수식을 검증한다", () => {
    const base = createDefaultRecipe();
    const project = characterRecipeToShaperProjectState({
      ...base,
      colors: { ...base.colors, skin: "#ffe0cc", hair: "#223344" },
      body: { shoulderWidth: 0.5, hip: -0.5 },
    });
    expect(project.style?.skinColorHex).toBe("#ffe0cc");
    expect(project.style?.hairColorHex).toBe("#223344");
    expect(project.bodyPart?.muscle).toBeCloseTo(0.75, 5);
    expect(project.bodyPart?.fat).toBeCloseTo(0.25, 5);

    const presetText = serializeShaperStylePreset(project.style!);
    const parsedFromPreset = parseShaperPresetTextToRecipe(presetText, base);
    expect(parsedFromPreset.ok).toBe(true);
    if (parsedFromPreset.ok) {
      expect(parsedFromPreset.recipe.colors.skin).toBe("#ffe0cc");
      expect(parsedFromPreset.recipe.colors.hair).toBe("#223344");
    }

    const assetChecks = evaluateShaperPresetAssetUpdates({
      appDataPath: "/data/",
      assets: [
        { id: 1, filename: "bob.preset", name: "bob", category: "Preset", type: "hair", version: 2.0 },
        { id: 2, filename: "bob.png", name: "bob", category: "Preset", type: "hair", version: 0 },
        { id: 3, filename: "new.preset", name: "new", category: "Preset", type: "eyes", version: 1.0 },
      ],
      localPresetContentsByPath: {
        "/data/Preset/hair/bob.preset": "1.0\nmt*6,mid*1",
        "/data/Preset/hair/bob.png": "PNG",
      },
    });
    expect(assetChecks[0]?.path).toBe("/data/Preset/hair/bob.preset");
    expect(assetChecks[0]?.update).toBe(2);
    // 동일 stem/category/type인 bob.png에도 update=2가 전파됨
    expect(assetChecks[1]?.update).toBe(2);
    expect(assetChecks[2]?.update).toBe(1);
    expect(assetChecks[2]?.progressPercent).toBe(100);

    const guide = formatShaperInputStyleGuide("blender", { macOs: true });
    expect(guide.camControlSettingText).toContain("[Command]");
    expect(guide.camControlToolTipText).toContain("시점 초기화  [F5]");

    expect(evaluateShaperNumericInput({ rawText: "-10", min: 0, max: 360, loop: true })).toBe(360);
    expect(evaluateShaperNumericInput({ rawText: "400", min: 0, max: 360, loop: false })).toBe(360);

    const camRect = computeShaperViewportCameraRect({ screenWidth: 2000, screenHeight: 1000, scaleFactor: 1 });
    expect(camRect.x).toBeCloseTo(170 / 2000, 5);
    expect(camRect.y).toBeCloseTo(24 / 1000, 5);
    expect(camRect.width).toBeCloseTo(1500 / 2000, 5);
    expect(camRect.height).toBeCloseTo(916 / 1000, 5);
  });
});
